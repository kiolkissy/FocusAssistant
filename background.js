/**
 * Focus Assistant — Background Service Worker
 * Core brain: mode management, tab monitoring, distraction detection, timers.
 */

// Import engines — importScripts puts everything into global scope.
// All functions from both files are directly available (no destructuring needed).
importScripts('categories.js');
importScripts('analyzer.js');

// ── State ──────────────────────────────────────────────────────────────────────

let focusState = {
    active: false,
    mode: null,             // 'reading' | 'browsing' | 'entertainment'
    anchorUrl: '',          // URL where focus started
    anchorTabId: null,      // Tab where focus started
    anchorProfile: null,    // Topic profile of the anchor page (for content analysis)
    startTime: null,        // Timestamp
    distractionCount: 0,    // How many times user was nudged
    graceActive: false,     // Is the grace period timer running?
    graceTabId: null,       // Tab that triggered the grace period
    allowlist: [],          // Browsing mode allowlist
    graceDuration: 30,      // Grace period in seconds (configurable)
    totalFocusedTime: 0,    // Accumulated focused time in ms
};

// Debounce: don't re-nudge the same URL repeatedly
let lastNudgedUrl = '';
let lastNudgedTime = 0;
const NUDGE_COOLDOWN_MS = 5000;

// ── Persistence ────────────────────────────────────────────────────────────────

async function saveState() {
    await chrome.storage.local.set({ focusState });
}

async function loadState() {
    const result = await chrome.storage.local.get('focusState');
    if (result.focusState) {
        focusState = { ...focusState, ...result.focusState };
    }
}

async function loadSettings() {
    const result = await chrome.storage.local.get('focusSettings');
    if (result.focusSettings) {
        if (result.focusSettings.allowlist) focusState.allowlist = result.focusSettings.allowlist;
        if (result.focusSettings.graceDuration) focusState.graceDuration = result.focusSettings.graceDuration;
    }
}

// ── Initialization ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
    console.log('[FocusAssistant] Extension installed/updated.');
    loadState();
    loadSettings();
});

chrome.runtime.onStartup.addListener(() => {
    loadState();
    loadSettings();
});

// Eager load
loadState();
loadSettings();

// ── Tab Monitoring ─────────────────────────────────────────────────────────────

// When a tab's URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!focusState.active) return;
    if (!changeInfo.url) return; // Only care about URL changes

    evaluateNavigation(tabId, changeInfo.url);
});

// When user switches to a different tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (!focusState.active) return;

    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) {
            evaluateNavigation(activeInfo.tabId, tab.url);
        }
    } catch (e) {
        // Tab might not be accessible
    }
});

// ── Core Evaluation ────────────────────────────────────────────────────────────

async function evaluateNavigation(tabId, url) {
    // Skip chrome:// and extension pages
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
        return;
    }

    // If user returned to anchor tab/domain during grace, cancel grace period
    const currentDomain = extractDomain(url);
    const anchorDomain = extractDomain(focusState.anchorUrl);

    if (focusState.graceActive && currentDomain === anchorDomain) {
        cancelGracePeriod(tabId);
        return;
    }

    // Same domain is always allowed
    if (currentDomain === anchorDomain) {
        return;
    }

    // Debounce: don't nudge same URL again within cooldown
    if (url === lastNudgedUrl && Date.now() - lastNudgedTime < NUDGE_COOLDOWN_MS) {
        return;
    }

    // ── Mode-specific evaluation ───────────────────────────────────────────────

    if (focusState.mode === 'reading') {
        // READING MODE: Use content-based analysis
        await evaluateReadingMode(tabId, url);
    } else if (focusState.mode === 'browsing') {
        // BROWSING MODE: Allowlist-based (unchanged)
        const result = checkRelevance(focusState.anchorUrl, url, 'browsing', focusState.allowlist);
        if (!result.relevant && !focusState.graceActive) {
            triggerDistraction(tabId, url, result);
        }
    } else if (focusState.mode === 'entertainment') {
        // ENTERTAINMENT MODE: Domain category-based (unchanged)
        const result = checkRelevance(focusState.anchorUrl, url, 'entertainment', []);
        if (!result.relevant && !focusState.graceActive) {
            triggerDistraction(tabId, url, result);
        }
    }
}

// ── Reading Mode: Content-Based Analysis ───────────────────────────────────────

// Known distraction domains — fast-path, skip content analysis
const FAST_PATH_DISTRACTION = ['social', 'shopping', 'gaming', 'finance'];

async function evaluateReadingMode(tabId, url) {
    if (focusState.graceActive) return;

    const category = categorizeUrl(url);

    // Fast-path: search/AI tools always allowed
    if (category === 'search' || category === 'ai') {
        console.log(`[FocusAssistant] Allowed (${category}):`, url);
        return;
    }

    // Fast-path: obvious distractions don't need content analysis
    if (FAST_PATH_DISTRACTION.includes(category)) {
        console.log(`[FocusAssistant] Fast-path distraction (${category}):`, url);
        const reason = getDistractionMessage(category, 'reading');
        triggerDistraction(tabId, url, { relevant: false, reason, category });
        return;
    }

    // Content-based analysis: extract page content and compare
    if (!focusState.anchorProfile) {
        console.warn('[FocusAssistant] No anchor profile available, falling back to domain check');
        const result = checkRelevance(focusState.anchorUrl, url, 'reading', []);
        if (!result.relevant) triggerDistraction(tabId, url, result);
        return;
    }

    try {
        const pageData = await requestContentExtraction(tabId);
        if (!pageData || !pageData.title) {
            console.warn('[FocusAssistant] Content extraction failed, falling back to domain check');
            const result = checkRelevance(focusState.anchorUrl, url, 'reading', []);
            if (!result.relevant) triggerDistraction(tabId, url, result);
            return;
        }

        const analysis = analyzeRelevance(focusState.anchorProfile, pageData, 'reading');
        console.log(`[FocusAssistant] Content analysis: score=${analysis.score.toFixed(3)}, relevant=${analysis.relevant}, page="${pageData.title}"`);

        if (!analysis.relevant) {
            triggerDistraction(tabId, url, {
                relevant: false,
                reason: analysis.reason,
                category: category,
            });
        }
    } catch (err) {
        console.error('[FocusAssistant] Content analysis error:', err);
        // Fallback to domain-based check
        const result = checkRelevance(focusState.anchorUrl, url, 'reading', []);
        if (!result.relevant) triggerDistraction(tabId, url, result);
    }
}

// ── Content Extraction Helper ──────────────────────────────────────────────────

/**
 * Request content extraction from a tab's content script.
 * Injects the content script first if needed.
 */
async function requestContentExtraction(tabId) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });
        return response;
    } catch {
        // Content script not loaded yet — inject and retry
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            });
            await chrome.scripting.insertCSS({
                target: { tabId },
                files: ['content.css']
            });
            // Wait for injection
            await new Promise(r => setTimeout(r, 500));
            const response = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });
            return response;
        } catch (e) {
            console.warn('[FocusAssistant] Could not extract content from tab', tabId, e);
            return null;
        }
    }
}

// ── Distraction Handling ───────────────────────────────────────────────────────

function triggerDistraction(tabId, url, result) {
    focusState.distractionCount++;
    lastNudgedUrl = url;
    lastNudgedTime = Date.now();

    // Send nudge to content script
    chrome.tabs.sendMessage(tabId, {
        type: 'FOCUS_NUDGE',
        data: {
            message: result.reason,
            category: result.category,
            mode: focusState.mode,
            graceDuration: focusState.graceDuration,
            distractionCount: focusState.distractionCount,
            anchorUrl: focusState.anchorUrl
        }
    }).catch(() => {
        // Content script might not be loaded yet — inject it
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        }).then(() => {
            chrome.scripting.insertCSS({
                target: { tabId },
                files: ['content.css']
            });
            // Retry after injection
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, {
                    type: 'FOCUS_NUDGE',
                    data: {
                        message: result.reason,
                        category: result.category,
                        mode: focusState.mode,
                        graceDuration: focusState.graceDuration,
                        distractionCount: focusState.distractionCount,
                        anchorUrl: focusState.anchorUrl
                    }
                }).catch(() => { });
            }, 300);
        }).catch(() => { });
    });

    // Start grace period
    startGracePeriod(tabId);
    saveState();
}

// ── Grace Period ───────────────────────────────────────────────────────────────

function startGracePeriod(tabId) {
    focusState.graceActive = true;
    focusState.graceTabId = tabId;
    saveState();

    // Create an alarm for when grace expires
    chrome.alarms.create('graceExpired', {
        delayInMinutes: focusState.graceDuration / 60
    });
}

function cancelGracePeriod(tabId) {
    focusState.graceActive = false;
    focusState.graceTabId = null;
    saveState();

    chrome.alarms.clear('graceExpired');

    // Tell the content script to dismiss the overlay (on the distraction tab)
    chrome.tabs.sendMessage(tabId, {
        type: 'FOCUS_DISMISS'
    }).catch(() => { });
}

// When grace period expires
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'graceExpired') {
        handleGraceExpired();
    }
});

async function handleGraceExpired() {
    if (!focusState.active || !focusState.graceActive) return;

    const elapsed = focusState.startTime ? Date.now() - focusState.startTime : 0;
    const minutes = Math.floor(elapsed / 60000);

    // Send final message to the distracting tab
    if (focusState.graceTabId) {
        try {
            await chrome.tabs.sendMessage(focusState.graceTabId, {
                type: 'FOCUS_ENDED',
                data: {
                    message: `Focus session ended.`,
                    duration: minutes,
                    distractionCount: focusState.distractionCount,
                    mode: focusState.mode
                }
            });
        } catch {
            // Tab may have been closed
        }
    }

    // Also try to send to the anchor tab
    if (focusState.anchorTabId && focusState.anchorTabId !== focusState.graceTabId) {
        try {
            await chrome.tabs.sendMessage(focusState.anchorTabId, {
                type: 'FOCUS_ENDED',
                data: {
                    message: `Focus session ended.`,
                    duration: minutes,
                    distractionCount: focusState.distractionCount,
                    mode: focusState.mode
                }
            });
        } catch { }
    }

    // Deactivate focus
    deactivateFocus();
}

// ── Focus Activation / Deactivation ────────────────────────────────────────────

async function activateFocus(mode, tab) {
    focusState = {
        active: true,
        mode,
        anchorUrl: tab.url,
        anchorTabId: tab.id,
        anchorProfile: null,
        startTime: Date.now(),
        distractionCount: 0,
        graceActive: false,
        graceTabId: null,
        allowlist: focusState.allowlist,
        graceDuration: focusState.graceDuration,
        totalFocusedTime: 0,
    };

    await saveState();

    // Update badge
    chrome.action.setBadgeText({ text: mode[0].toUpperCase() });
    chrome.action.setBadgeBackgroundColor({ color: getBadgeColor(mode) });

    console.log(`[FocusAssistant] Activated ${mode} mode on ${tab.url}`);

    // For Reading mode: extract anchor page content and build topic profile
    if (mode === 'reading') {
        try {
            const pageData = await requestContentExtraction(tab.id);
            if (pageData && pageData.title) {
                focusState.anchorProfile = buildTopicProfile(pageData);
                console.log('[FocusAssistant] Anchor topic profile built:', focusState.anchorProfile.topTerms);
                await saveState();
            } else {
                console.warn('[FocusAssistant] Could not extract anchor page content.');
            }
        } catch (err) {
            console.error('[FocusAssistant] Error building anchor profile:', err);
        }
    }
}

function deactivateFocus() {
    const elapsed = focusState.startTime ? Date.now() - focusState.startTime : 0;

    focusState.active = false;
    focusState.mode = null;
    focusState.anchorUrl = '';
    focusState.anchorTabId = null;
    focusState.startTime = null;
    focusState.graceActive = false;
    focusState.graceTabId = null;
    focusState.totalFocusedTime = elapsed;

    saveState();
    chrome.alarms.clear('graceExpired');

    // Clear badge
    chrome.action.setBadgeText({ text: '' });

    console.log('[FocusAssistant] Focus mode deactivated.');
}

function getBadgeColor(mode) {
    switch (mode) {
        case 'reading': return '#6C5CE7';
        case 'browsing': return '#00B894';
        case 'entertainment': return '#E17055';
        default: return '#636e72';
    }
}

// ── Message Handling (Popup ↔ Background) ──────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'GET_STATE':
            const elapsed = focusState.active && focusState.startTime
                ? Date.now() - focusState.startTime
                : focusState.totalFocusedTime || 0;

            sendResponse({
                ...focusState,
                elapsedMs: elapsed,
                topTerms: focusState.anchorProfile?.topTerms || [],
            });
            break;

        case 'ACTIVATE_FOCUS':
            console.log('[FocusAssistant] ACTIVATE_FOCUS received, mode:', message.mode);
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
                console.log('[FocusAssistant] tabs.query result:', tabs?.length, 'tabs found');
                if (tabs && tabs[0]) {
                    console.log('[FocusAssistant] Activating on tab:', tabs[0].id, tabs[0].url);
                    await activateFocus(message.mode, tabs[0]);
                    sendResponse({ success: true });
                } else {
                    console.warn('[FocusAssistant] No active tab found!');
                    sendResponse({ success: false, error: 'No active tab found.' });
                }
            });
            return true; // async response

        case 'DEACTIVATE_FOCUS':
            deactivateFocus();
            sendResponse({ success: true });
            break;

        case 'UPDATE_SETTINGS':
            if (message.settings) {
                if (message.settings.allowlist !== undefined) {
                    focusState.allowlist = message.settings.allowlist;
                }
                if (message.settings.graceDuration !== undefined) {
                    focusState.graceDuration = message.settings.graceDuration;
                }
                chrome.storage.local.set({ focusSettings: message.settings });
                saveState();
                sendResponse({ success: true });
            }
            break;

        case 'USER_RETURNED':
            // Content script reports user clicked "Go Back"
            if (focusState.graceActive) {
                cancelGracePeriod(sender.tab?.id);
                // Navigate back to anchor
                if (focusState.anchorUrl && sender.tab?.id) {
                    chrome.tabs.update(sender.tab.id, { url: focusState.anchorUrl });
                }
            }
            sendResponse({ success: true });
            break;

        default:
            sendResponse({ error: 'Unknown message type' });
    }
});
