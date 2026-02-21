/**
 * Focus Assistant — Popup Script
 * Handles mode selection, session display, settings, and communication with background.
 */

// ── DOM Elements ───────────────────────────────────────────────────────────────

const modeSelection = document.getElementById('modeSelection');
const sessionDashboard = document.getElementById('sessionDashboard');
const settingsPanel = document.getElementById('settingsPanel');
const settingsToggle = document.getElementById('settingsToggle');

const modeBadge = document.getElementById('modeBadge');
const elapsedTime = document.getElementById('elapsedTime');
const distractionCount = document.getElementById('distractionCount');
const anchorUrlEl = document.getElementById('anchorUrl');
const stopFocusBtn = document.getElementById('stopFocus');

const graceSlider = document.getElementById('graceSlider');
const graceValue = document.getElementById('graceValue');
const allowlistInput = document.getElementById('allowlistInput');
const saveSettingsBtn = document.getElementById('saveSettings');

// ── State ──────────────────────────────────────────────────────────────────────

let timerInterval = null;
let settingsVisible = false;

// ── Initialize ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadCurrentState();
    loadSettings();
    setupEventListeners();
});

function loadCurrentState() {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
        if (chrome.runtime.lastError) {
            console.error('[Popup] GET_STATE error:', chrome.runtime.lastError.message);
            showModeSelection();
            return;
        }
        console.log('[Popup] GET_STATE response:', state);
        if (!state) {
            showModeSelection();
            return;
        }

        if (state.active) {
            showDashboard(state);
        } else {
            showModeSelection();
        }
    });
}

function loadSettings() {
    chrome.storage.local.get('focusSettings', (result) => {
        if (result.focusSettings) {
            if (result.focusSettings.graceDuration) {
                graceSlider.value = result.focusSettings.graceDuration;
                graceValue.textContent = result.focusSettings.graceDuration + 's';
            }
            if (result.focusSettings.allowlist) {
                allowlistInput.value = result.focusSettings.allowlist.join('\n');
            }
        }
    });
}

// ── Event Listeners ────────────────────────────────────────────────────────────

function setupEventListeners() {
    // Mode card clicks
    document.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
            const mode = card.dataset.mode;
            activateMode(mode);
        });
    });

    // Stop focus
    stopFocusBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'DEACTIVATE_FOCUS' }, () => {
            showModeSelection();
            clearInterval(timerInterval);
        });
    });

    // Settings toggle
    settingsToggle.addEventListener('click', () => {
        settingsVisible = !settingsVisible;
        if (settingsVisible) {
            settingsPanel.classList.remove('hidden');
            modeSelection.classList.add('hidden');
            sessionDashboard.classList.add('hidden');
        } else {
            settingsPanel.classList.add('hidden');
            loadCurrentState(); // Refresh view
        }
    });

    // Grace slider
    graceSlider.addEventListener('input', () => {
        graceValue.textContent = graceSlider.value + 's';
    });

    // Save settings
    saveSettingsBtn.addEventListener('click', saveSettings);
}

// ── Actions ────────────────────────────────────────────────────────────────────

function activateMode(mode) {
    console.log('[Popup] Activating mode:', mode);
    // Quick visual feedback
    const card = document.querySelector(`.mode-card[data-mode="${mode}"]`);
    card.style.transform = 'scale(0.97)';
    setTimeout(() => { card.style.transform = ''; }, 150);

    chrome.runtime.sendMessage({ type: 'ACTIVATE_FOCUS', mode }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[Popup] ACTIVATE_FOCUS error:', chrome.runtime.lastError.message);
            return;
        }
        console.log('[Popup] ACTIVATE_FOCUS response:', response);
        if (response && response.success) {
            // Small delay for visual polish
            setTimeout(() => loadCurrentState(), 200);
        } else {
            console.warn('[Popup] Activation failed:', response);
        }
    });
}

function saveSettings() {
    const allowlist = allowlistInput.value
        .split('\n')
        .map(d => d.trim().toLowerCase())
        .filter(d => d.length > 0);

    const graceDuration = parseInt(graceSlider.value, 10);

    chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { allowlist, graceDuration }
    }, () => {
        // Visual feedback
        saveSettingsBtn.textContent = '✓ Saved!';
        saveSettingsBtn.style.background = 'linear-gradient(135deg, #00B894, #55efc4)';
        setTimeout(() => {
            saveSettingsBtn.textContent = 'Save Settings';
            saveSettingsBtn.style.background = '';
        }, 1500);
    });
}

// ── View Switching ─────────────────────────────────────────────────────────────

function showModeSelection() {
    modeSelection.classList.remove('hidden');
    sessionDashboard.classList.add('hidden');
    settingsPanel.classList.add('hidden');
    clearInterval(timerInterval);
}

function showDashboard(state) {
    modeSelection.classList.add('hidden');
    sessionDashboard.classList.remove('hidden');
    settingsPanel.classList.add('hidden');

    // Mode badge
    modeBadge.textContent = capitalize(state.mode);
    modeBadge.className = 'session-mode-badge ' + state.mode;

    // Distraction count
    distractionCount.textContent = state.distractionCount || 0;

    // Anchor URL
    const displayUrl = formatUrl(state.anchorUrl);
    anchorUrlEl.textContent = displayUrl;
    anchorUrlEl.title = state.anchorUrl;

    // Start elapsed timer
    startTimer(state.startTime);
}

// ── Timer ──────────────────────────────────────────────────────────────────────

function startTimer(startTime) {
    clearInterval(timerInterval);

    function update() {
        const elapsed = Date.now() - startTime;
        elapsedTime.textContent = formatElapsed(elapsed);
    }

    update();
    timerInterval = setInterval(update, 1000);
}

function formatElapsed(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    if (hrs > 0) {
        return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
}

function pad(n) {
    return n.toString().padStart(2, '0');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function formatUrl(url) {
    try {
        const u = new URL(url);
        let display = u.hostname.replace(/^www\./, '');
        if (u.pathname !== '/' && u.pathname.length > 1) {
            let path = u.pathname;
            if (path.length > 30) path = path.slice(0, 30) + '…';
            display += path;
        }
        return display;
    } catch {
        return url || 'Unknown';
    }
}
