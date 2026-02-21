/**
 * Focus Assistant — Background Service Worker
 * Core brain: mode management, tab monitoring, AI-powered distraction detection,
 * 3-stage nudge flow, and distraction history.
 */

// Import engines — importScripts puts everything into global scope.
importScripts('categories.js');
importScripts('analyzer.js');

// ── State ──────────────────────────────────────────────────────────────────────

let focusState = {
    active: false,
    mode: null,                 // 'reading' | 'browsing' | 'entertainment'
    anchorUrl: '',              // URL where focus started
    anchorTabId: null,          // Tab where focus started
    anchorProfile: null,        // TF-IDF profile (fallback)
    anchorSummary: null,        // Gemini AI topic summary
    startTime: null,
    distractionCount: 0,
    graceActive: false,         // Is the grace period timer running?
    graceTabId: null,
    warningTabId: null,         // Tab currently showing Stage 1 warning
    allowlist: [],
    graceDuration: 30,
    totalFocusedTime: 0,
    distractionHistory: [],     // Array of { url, title, domain, timestamp, reason }
};

let geminiApiKey = '';          // Loaded from chrome.storage

// Debounce
let lastNudgedUrl = '';
let lastNudgedTime = 0;
const NUDGE_COOLDOWN_MS = 5000;
const WARNING_TO_NUDGE_MS = 5000;   // Time between Stage 1 warning and Stage 2 nudge
const PAGE_LOAD_WAIT_MS = 2000;     // Wait for page content to load before extracting

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
    // Load Gemini API key
    const keyResult = await chrome.storage.local.get('geminiApiKey');
    if (keyResult.geminiApiKey) {
        geminiApiKey = keyResult.geminiApiKey;
        console.log('[FocusAssistant] Gemini API key loaded.');
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

loadState();
loadSettings();

// ── Tab Monitoring ─────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!focusState.active) return;
    // Only evaluate once the page has finished loading (so content extraction gets real content)
    if (changeInfo.status === 'complete' && tab.url) {
        evaluateNavigation(tabId, tab.url);
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (!focusState.active) return;
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) evaluateNavigation(activeInfo.tabId, tab.url);
    } catch { }
});

// ── Core Evaluation ────────────────────────────────────────────────────────────

async function evaluateNavigation(tabId, url) {
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
        return;
    }

    const currentDomain = extractDomain(url);
    const anchorDomain = extractDomain(focusState.anchorUrl);

    // User returned to anchor domain — cancel any active warning/grace
    if (currentDomain === anchorDomain) {
        if (focusState.graceActive) cancelGracePeriod(tabId);
        if (focusState.warningTabId) cancelWarning(tabId);
        return;
    }

    // If user navigated to a DIFFERENT distraction while warning/grace is active,
    // reset the warning for the new site (and still record it)
    if (focusState.warningTabId || focusState.graceActive) {
        const lastDomain = lastNudgedUrl ? extractDomain(lastNudgedUrl) : '';
        if (currentDomain !== lastDomain) {
            // Cancel old warning/grace and start fresh for the new distraction
            if (focusState.graceActive) {
                focusState.graceActive = false;
                focusState.graceTabId = null;
                chrome.alarms.clear('graceExpired');
            }
            if (focusState.warningTabId) {
                focusState.warningTabId = null;
                focusState._pendingNudge = null;
                chrome.alarms.clear('warningEscalate');
            }
            console.log(`[FocusAssistant] New distraction detected (${currentDomain}), resetting nudge flow.`);
        } else {
            // Same domain as existing nudge — skip
            return;
        }
    }

    // Debounce same exact URL
    if (url === lastNudgedUrl && Date.now() - lastNudgedTime < NUDGE_COOLDOWN_MS) {
        return;
    }

    // ── Mode-specific evaluation ───────────────────────────────────────────
    if (focusState.mode === 'reading') {
        await evaluateReadingMode(tabId, url);
    } else if (focusState.mode === 'browsing') {
        const result = checkRelevance(focusState.anchorUrl, url, 'browsing', focusState.allowlist);
        if (!result.relevant) triggerWarning(tabId, url, result);
    } else if (focusState.mode === 'entertainment') {
        const result = checkRelevance(focusState.anchorUrl, url, 'entertainment', []);
        if (!result.relevant) triggerWarning(tabId, url, result);
    }
}

// ── Reading Mode: AI + Fallback Analysis ───────────────────────────────────────

const FAST_PATH_DISTRACTION = ['social', 'shopping', 'gaming', 'finance'];

async function evaluateReadingMode(tabId, url) {

    const category = categorizeUrl(url);

    // Fast-path: search/AI always allowed
    if (category === 'search' || category === 'ai') {
        console.log(`[FocusAssistant] Allowed (${category}):`, url);
        return;
    }

    // Fast-path: obvious distractions → skip AI analysis
    if (FAST_PATH_DISTRACTION.includes(category)) {
        console.log(`[FocusAssistant] Fast-path distraction (${category}):`, url);
        const reason = getDistractionMessage(category, 'reading');
        triggerWarning(tabId, url, { relevant: false, reason, category });
        return;
    }

    // Extract page content first
    let pageData = null;
    try {
        pageData = await requestContentExtraction(tabId);
    } catch { }

    // Try Gemini AI first
    if (geminiApiKey && focusState.anchorSummary) {
        try {
            const aiResult = await geminiCheckRelevance(geminiApiKey, focusState.anchorSummary, pageData || { title: '', url, headings: [], bodyText: '', description: '' });
            if (aiResult) {
                console.log(`[FocusAssistant] Gemini AI: relevant=${aiResult.relevant}, confidence=${aiResult.confidence}, reason="${aiResult.reason}"`);
                if (!aiResult.relevant && aiResult.confidence >= 0.5) {
                    triggerWarning(tabId, url, { relevant: false, reason: aiResult.reason, category });
                    return;
                }
                if (aiResult.relevant) {
                    console.log(`[FocusAssistant] AI says relevant: ${aiResult.reason}`);
                    return;
                }
            }
        } catch (err) {
            console.warn('[FocusAssistant] Gemini API error, falling back:', err);
        }
    }

    // TF-IDF fallback
    if (focusState.anchorProfile && pageData && pageData.title) {
        const analysis = analyzeRelevance(focusState.anchorProfile, pageData, 'reading');
        console.log(`[FocusAssistant] TF-IDF: score=${analysis.score.toFixed(3)}, relevant=${analysis.relevant}`);
        if (!analysis.relevant) {
            triggerWarning(tabId, url, { relevant: false, reason: analysis.reason, category });
        }
        return;
    }

    // Last resort: domain-based check
    const result = checkRelevance(focusState.anchorUrl, url, 'reading', []);
    if (!result.relevant) triggerWarning(tabId, url, result);
}

// ── Content Extraction Helper ──────────────────────────────────────────────────

async function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        const check = async () => {
            try {
                const tab = await chrome.tabs.get(tabId);
                if (tab.status === 'complete') {
                    resolve();
                } else {
                    setTimeout(check, 300);
                }
            } catch {
                resolve(); // Tab gone, resolve anyway
            }
        };
        check();
    });
}

async function requestContentExtraction(tabId) {
    // Wait for page to fully load before reading content
    await waitForTabLoad(tabId);
    // Extra delay for JS-rendered content (SPAs, React, etc.)
    await new Promise(r => setTimeout(r, PAGE_LOAD_WAIT_MS));

    try {
        return await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });
    } catch {
        try {
            await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
            await new Promise(r => setTimeout(r, 800));
            return await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });
        } catch (e) {
            console.warn('[FocusAssistant] Content extraction failed:', e);
            return null;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREE-STAGE NUDGE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════
//
// Stage 1: FOCUS_WARNING  — subtle warning bar at top of page (5 seconds)
// Stage 2: FOCUS_NUDGE    — full nudge overlay with timer + "Go Back" button
// Stage 3: FOCUS_ENDED    — full-screen session ending popup with stats
//

// ── Stage 1: Warning ──────────────────────────────────────────────────────────

function triggerWarning(tabId, url, result) {
    // Record distraction in history
    const domain = extractDomain(url);
    focusState.distractionCount++;
    focusState.distractionHistory.push({
        url: url,
        title: '',  // Will be updated when we get page data
        domain: domain,
        timestamp: Date.now(),
        reason: result.reason,
    });
    lastNudgedUrl = url;
    lastNudgedTime = Date.now();

    focusState.warningTabId = tabId;
    saveState();

    // Send Stage 1 warning to content script
    sendToContentScript(tabId, {
        type: 'FOCUS_WARNING',
        data: {
            message: result.reason,
            mode: focusState.mode,
        }
    });

    // Set alarm to escalate to Stage 2 after 5 seconds
    chrome.alarms.create('warningEscalate', {
        delayInMinutes: WARNING_TO_NUDGE_MS / 60000
    });

    // Store data for escalation
    focusState._pendingNudge = { tabId, url, result };
    console.log(`[FocusAssistant] Stage 1 WARNING on ${domain}: ${result.reason}`);
}

function cancelWarning(tabId) {
    focusState.warningTabId = null;
    focusState._pendingNudge = null;
    chrome.alarms.clear('warningEscalate');

    // Dismiss warning overlay
    chrome.tabs.sendMessage(tabId, { type: 'FOCUS_DISMISS' }).catch(() => { });
}

// ── Stage 2: Full Nudge ───────────────────────────────────────────────────────

function triggerNudge(tabId, url, result) {
    sendToContentScript(tabId, {
        type: 'FOCUS_NUDGE',
        data: {
            message: result.reason,
            category: result.category,
            mode: focusState.mode,
            graceDuration: focusState.graceDuration,
            distractionCount: focusState.distractionCount,
            anchorUrl: focusState.anchorUrl,
        }
    });

    // Start grace period → leads to Stage 3 if timer expires
    startGracePeriod(tabId);
    console.log(`[FocusAssistant] Stage 2 NUDGE on tab ${tabId}, grace period: ${focusState.graceDuration}s`);
}

// ── Message Sending Helper ────────────────────────────────────────────────────

function sendToContentScript(tabId, message) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        }).then(() => {
            chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, message).catch(() => { });
            }, 300);
        }).catch(() => { });
    });
}

// ── Grace Period (leads to Stage 3) ───────────────────────────────────────────

function startGracePeriod(tabId) {
    focusState.graceActive = true;
    focusState.graceTabId = tabId;
    saveState();

    chrome.alarms.create('graceExpired', {
        delayInMinutes: focusState.graceDuration / 60
    });
}

function cancelGracePeriod(tabId) {
    focusState.graceActive = false;
    focusState.graceTabId = null;
    focusState.warningTabId = null;
    focusState._pendingNudge = null;
    saveState();

    chrome.alarms.clear('graceExpired');
    chrome.alarms.clear('warningEscalate');

    chrome.tabs.sendMessage(tabId, { type: 'FOCUS_DISMISS' }).catch(() => { });
}

// ── Alarm Handler (Stage escalation) ──────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'warningEscalate') {
        // Stage 1 → Stage 2: Escalate warning to full nudge
        if (focusState._pendingNudge && focusState.warningTabId) {
            const { tabId, url, result } = focusState._pendingNudge;
            focusState._pendingNudge = null;
            focusState.warningTabId = null;
            triggerNudge(tabId, url, result);
        }
    } else if (alarm.name === 'graceExpired') {
        // Stage 2 → Stage 3: Grace expired, end session
        handleGraceExpired();
    }
});

// ── Stage 3: Session Ended ────────────────────────────────────────────────────

async function handleGraceExpired() {
    if (!focusState.active || !focusState.graceActive) return;

    const elapsed = focusState.startTime ? Date.now() - focusState.startTime : 0;
    const minutes = Math.floor(elapsed / 60000);

    const endData = {
        type: 'FOCUS_ENDED',
        data: {
            message: 'Focus session ended.',
            duration: minutes,
            distractionCount: focusState.distractionCount,
            mode: focusState.mode,
            distractionHistory: focusState.distractionHistory,
        }
    };

    // Send to distracting tab
    if (focusState.graceTabId) {
        try { await chrome.tabs.sendMessage(focusState.graceTabId, endData); } catch { }
    }

    // Also send to anchor tab
    if (focusState.anchorTabId && focusState.anchorTabId !== focusState.graceTabId) {
        try { await chrome.tabs.sendMessage(focusState.anchorTabId, endData); } catch { }
    }

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
        anchorSummary: null,
        startTime: Date.now(),
        distractionCount: 0,
        graceActive: false,
        graceTabId: null,
        warningTabId: null,
        allowlist: focusState.allowlist,
        graceDuration: focusState.graceDuration,
        totalFocusedTime: 0,
        distractionHistory: [],
    };

    await saveState();

    chrome.action.setBadgeText({ text: mode[0].toUpperCase() });
    chrome.action.setBadgeBackgroundColor({ color: getBadgeColor(mode) });

    console.log(`[FocusAssistant] Activated ${mode} mode on ${tab.url}`);

    // For Reading mode: build topic profile
    if (mode === 'reading') {
        try {
            const pageData = await requestContentExtraction(tab.id);
            if (pageData && pageData.title) {
                // Build TF-IDF profile (always, as fallback)
                focusState.anchorProfile = buildTopicProfile(pageData);
                console.log('[FocusAssistant] TF-IDF profile:', focusState.anchorProfile.topTerms);

                // Try Gemini AI for semantic summary
                if (geminiApiKey) {
                    const summary = await geminiSummarizeTopic(geminiApiKey, pageData);
                    if (summary) {
                        focusState.anchorSummary = summary;
                        console.log('[FocusAssistant] AI topic summary:', summary.topic);
                    }
                }

                await saveState();
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
    focusState.warningTabId = null;
    focusState.totalFocusedTime = elapsed;

    saveState();
    chrome.alarms.clear('graceExpired');
    chrome.alarms.clear('warningEscalate');

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
                anchorTopic: focusState.anchorSummary?.topic || '',
                distractionHistory: focusState.distractionHistory || [],
            });
            break;

        case 'ACTIVATE_FOCUS':
            console.log('[FocusAssistant] ACTIVATE_FOCUS received, mode:', message.mode);
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
                if (tabs && tabs[0]) {
                    await activateFocus(message.mode, tabs[0]);
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'No active tab found.' });
                }
            });
            return true;

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

        case 'SAVE_API_KEY':
            geminiApiKey = message.apiKey || '';
            chrome.storage.local.set({ geminiApiKey: geminiApiKey });
            console.log('[FocusAssistant] Gemini API key saved.');
            sendResponse({ success: true });
            break;

        case 'GET_API_KEY':
            sendResponse({ apiKey: geminiApiKey });
            break;

        case 'USER_RETURNED':
            if (focusState.graceActive) {
                cancelGracePeriod(sender.tab?.id);
                if (focusState.anchorUrl && sender.tab?.id) {
                    chrome.tabs.update(sender.tab.id, { url: focusState.anchorUrl });
                }
            } else if (focusState.warningTabId) {
                cancelWarning(sender.tab?.id);
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
