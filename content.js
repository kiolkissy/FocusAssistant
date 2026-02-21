/**
 * Focus Assistant — Content Script
 * Injects overlay notifications (nudge, timer, final message) into web pages.
 * Uses Shadow DOM to avoid style conflicts.
 */

(() => {
  // Prevent double injection
  if (window.__focusAssistantInjected) return;
  window.__focusAssistantInjected = true;

  let shadowHost = null;
  let shadowRoot = null;
  let timerInterval = null;
  let currentOverlay = null;

  // ── Shadow DOM Setup ───────────────────────────────────────────────────────

  function ensureShadowHost() {
    if (shadowHost && document.body.contains(shadowHost)) return;

    shadowHost = document.createElement('div');
    shadowHost.id = 'focus-assistant-host';
    shadowHost.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(shadowHost);

    shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

    // Inject styles into shadow
    const style = document.createElement('style');
    style.textContent = getShadowStyles();
    shadowRoot.appendChild(style);
  }

  // ── Nudge Overlay ──────────────────────────────────────────────────────────

  function showNudge(data) {
    ensureShadowHost();
    removeOverlay();

    const overlay = document.createElement('div');
    overlay.className = 'fa-overlay fa-nudge';
    overlay.innerHTML = `
      <div class="fa-nudge-card">
        <div class="fa-nudge-header">
          <div class="fa-nudge-icon">${getModeIcon(data.mode)}</div>
          <div class="fa-nudge-title">
            <span class="fa-badge fa-badge-${data.mode}">${capitalize(data.mode)} Mode</span>
            <span class="fa-nudge-subtitle">Focus Assistant</span>
          </div>
          <button class="fa-close-btn" id="fa-dismiss">✕</button>
        </div>
        <p class="fa-nudge-message">${escapeHtml(data.message)}</p>
        <div class="fa-timer-section">
          <div class="fa-timer-ring">
            <svg viewBox="0 0 60 60">
              <circle class="fa-ring-bg" cx="30" cy="30" r="26"/>
              <circle class="fa-ring-progress" cx="30" cy="30" r="26" id="fa-ring"/>
            </svg>
            <span class="fa-timer-text" id="fa-timer">${data.graceDuration}</span>
          </div>
          <div class="fa-timer-info">
            <p class="fa-timer-label">Return to your focus page</p>
            <p class="fa-timer-hint">or focus mode will end</p>
          </div>
        </div>
        <div class="fa-nudge-actions">
          <button class="fa-btn fa-btn-primary" id="fa-goback">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Go Back to Focus
          </button>
          <button class="fa-btn fa-btn-ghost" id="fa-dismiss2">Dismiss</button>
        </div>
      </div>
    `;

    shadowRoot.appendChild(overlay);
    currentOverlay = overlay;

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.add('fa-visible');
    });

    // Start countdown
    startCountdown(data.graceDuration);

    // Pointer events on the card
    shadowHost.style.pointerEvents = 'none';
    const card = overlay.querySelector('.fa-nudge-card');
    card.style.pointerEvents = 'auto';

    // Event listeners
    shadowRoot.getElementById('fa-goback').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'USER_RETURNED' });
      removeOverlay();
    });

    shadowRoot.getElementById('fa-dismiss').addEventListener('click', () => {
      removeOverlay();
    });

    shadowRoot.getElementById('fa-dismiss2').addEventListener('click', () => {
      removeOverlay();
    });
  }

  // ── Warning Banner (Stage 1) ───────────────────────────────────────────────

  function showWarning(data) {
    ensureShadowHost();
    removeOverlay();

    const overlay = document.createElement('div');
    overlay.className = 'fa-overlay fa-warning-bar';
    overlay.innerHTML = `
      <div class="fa-warning-content">
        <span class="fa-warning-icon">⚠️</span>
        <span class="fa-warning-text">${escapeHtml(data.message)}</span>
        <button class="fa-warning-btn" id="fa-warning-goback">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Go Back
        </button>
        <button class="fa-warning-dismiss" id="fa-warning-dismiss">✕</button>
      </div>
    `;

    shadowRoot.appendChild(overlay);
    currentOverlay = overlay;

    shadowHost.style.pointerEvents = 'none';
    const bar = overlay.querySelector('.fa-warning-content');
    bar.style.pointerEvents = 'auto';

    requestAnimationFrame(() => {
      overlay.classList.add('fa-visible');
    });

    shadowRoot.getElementById('fa-warning-goback').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'USER_RETURNED' });
      removeOverlay();
    });

    shadowRoot.getElementById('fa-warning-dismiss').addEventListener('click', () => {
      removeOverlay();
    });
  }

  // ── Final Message Overlay (Stage 3) ───────────────────────────────────────

  function showFinalMessage(data) {
    ensureShadowHost();
    removeOverlay();

    const minutes = data.duration || 0;
    const timeStr = minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes} minute${minutes !== 1 ? 's' : ''}`;

    // Build distraction history HTML
    let historyHtml = '';
    if (data.distractionHistory && data.distractionHistory.length > 0) {
      const items = data.distractionHistory.slice(0, 8).map(d => {
        const domain = d.domain || 'unknown';
        const time = new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `<div class="fa-history-item">
          <span class="fa-history-domain">${escapeHtml(domain)}</span>
          <span class="fa-history-time">${time}</span>
        </div>`;
      }).join('');
      historyHtml = `
        <div class="fa-history-section">
          <span class="fa-history-label">Distraction Sites</span>
          <div class="fa-history-list">${items}</div>
        </div>
      `;
    }

    const overlay = document.createElement('div');
    overlay.className = 'fa-overlay fa-final';
    overlay.innerHTML = `
      <div class="fa-final-card">
        <div class="fa-final-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <h2 class="fa-final-title">Focus Session Ended</h2>
        <p class="fa-final-subtitle">Your ${capitalize(data.mode || '')} session has wrapped up</p>
        <div class="fa-final-stats">
          <div class="fa-final-stat">
            <span class="fa-final-stat-value">${timeStr}</span>
            <span class="fa-final-stat-label">Focused Time</span>
          </div>
          <div class="fa-final-stat-divider"></div>
          <div class="fa-final-stat">
            <span class="fa-final-stat-value">${data.distractionCount || 0}</span>
            <span class="fa-final-stat-label">Distractions</span>
          </div>
        </div>
        ${historyHtml}
        <p class="fa-final-encouragement">${getEncouragement(minutes, data.distractionCount)}</p>
        <button class="fa-btn fa-btn-primary fa-btn-wide" id="fa-close-final">Got it</button>
      </div>
    `;

    shadowRoot.appendChild(overlay);
    currentOverlay = overlay;
    shadowHost.style.pointerEvents = 'auto';

    requestAnimationFrame(() => {
      overlay.classList.add('fa-visible');
    });

    shadowRoot.getElementById('fa-close-final').addEventListener('click', () => {
      removeOverlay();
    });
  }

  // ── Dismiss Overlay ────────────────────────────────────────────────────────

  function showDismiss() {
    removeOverlay();
  }

  // ── Countdown Timer ────────────────────────────────────────────────────────

  function startCountdown(seconds) {
    clearInterval(timerInterval);
    let remaining = seconds;
    const circumference = 2 * Math.PI * 26;
    const ring = shadowRoot.getElementById('fa-ring');
    const timerText = shadowRoot.getElementById('fa-timer');

    if (ring) {
      ring.style.strokeDasharray = circumference;
      ring.style.strokeDashoffset = 0;
    }

    function tick() {
      remaining--;
      if (timerText) timerText.textContent = remaining;

      if (ring) {
        const progress = 1 - (remaining / seconds);
        ring.style.strokeDashoffset = circumference * progress;
      }

      if (remaining <= 0) {
        clearInterval(timerInterval);
      }
    }

    timerInterval = setInterval(tick, 1000);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  function removeOverlay() {
    clearInterval(timerInterval);
    if (currentOverlay) {
      currentOverlay.classList.remove('fa-visible');
      currentOverlay.classList.add('fa-hiding');
      setTimeout(() => {
        currentOverlay?.remove();
        currentOverlay = null;
        if (shadowHost) shadowHost.style.pointerEvents = 'none';
      }, 300);
    }
  }

  // ── Page Content Extraction ────────────────────────────────────────────────

  function extractPageContent() {
    // Title
    const title = document.title || '';

    // Meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    const description = metaDesc ? metaDesc.getAttribute('content') || '' : '';

    // Headings (h1, h2, h3)
    const headings = [];
    document.querySelectorAll('h1, h2, h3').forEach(h => {
      const text = h.textContent.trim();
      if (text.length > 0 && text.length < 200) {
        headings.push(text);
      }
    });

    // Body text — strip non-content elements
    const cloned = document.body.cloneNode(true);

    // Remove noise elements
    const noiseSelectors = [
      'script', 'style', 'noscript', 'iframe', 'svg',
      'nav', 'footer', 'header',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '.nav', '.navbar', '.footer', '.header', '.sidebar', '.menu',
      '.ad', '.ads', '.advertisement', '.cookie', '.popup', '.modal',
      '#focus-assistant-host',
    ];
    noiseSelectors.forEach(sel => {
      cloned.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Get text content, collapse whitespace
    let bodyText = cloned.textContent || '';
    bodyText = bodyText
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);    // cap at 5000 chars

    return {
      title,
      description,
      headings,
      bodyText,
      url: window.location.href,
    };
  }

  // ── Message Listener ───────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'EXTRACT_CONTENT':
        const content = extractPageContent();
        console.log('[FocusAssistant] Extracted content:', content.title, '| headings:', content.headings.length, '| body chars:', content.bodyText.length);
        sendResponse(content);
        break;
      case 'FOCUS_WARNING':
        showWarning(message.data);
        sendResponse({ received: true });
        break;
      case 'FOCUS_NUDGE':
        showNudge(message.data);
        sendResponse({ received: true });
        break;
      case 'FOCUS_ENDED':
        showFinalMessage(message.data);
        sendResponse({ received: true });
        break;
      case 'FOCUS_DISMISS':
        showDismiss();
        sendResponse({ received: true });
        break;
    }
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getModeIcon(mode) {
    switch (mode) {
      case 'reading':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>`;
      case 'browsing':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>`;
      case 'entertainment':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>`;
      default:
        return '🎯';
    }
  }

  function getEncouragement(minutes, distractions) {
    if (minutes >= 60 && distractions <= 2) {
      return "🏆 Amazing focus session! You were in the zone.";
    } else if (minutes >= 30) {
      return "💪 Great work! Solid focus time.";
    } else if (minutes >= 10) {
      return "👍 Good start! Try for longer next time.";
    } else if (distractions > 5) {
      return "🌱 Staying focused is a skill — keep practicing!";
    } else {
      return "✨ Every bit of focus counts. Keep going!";
    }
  }

  // ── Shadow DOM Styles ──────────────────────────────────────────────────────

  function getShadowStyles() {
    return `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      /* ── Theme Variables (light/dark) ─────────────────────────── */

      :host {
        --fa-bg: #ffffff;
        --fa-bg-elevated: #f8f9fa;
        --fa-bg-hover: #f1f3f4;
        --fa-border: #dadce0;
        --fa-border-subtle: #e8eaed;
        --fa-text: #202124;
        --fa-text-secondary: #5f6368;
        --fa-text-muted: #80868b;
        --fa-shadow: 0 1px 3px 0 rgba(60,64,67,0.3), 0 4px 8px 3px rgba(60,64,67,0.15);
        --fa-shadow-heavy: 0 6px 20px 4px rgba(60,64,67,0.2), 0 2px 6px 0 rgba(60,64,67,0.3);
        --fa-overlay-bg: rgba(0,0,0,0.32);
        --fa-accent: #1a73e8;
        --fa-accent-hover: #1765cc;
        --fa-accent-subtle: rgba(26,115,232,0.08);
        --fa-danger: #d93025;
        --fa-danger-subtle: rgba(217,48,37,0.08);
        --fa-warning-bg: #fef7e0;
        --fa-warning-border: #fdd663;
        --fa-warning-text: #3c4043;
        --fa-ring-bg: #e8eaed;
        --fa-ring-progress: #d93025;
        --fa-stat-bg: #f1f3f4;
        --fa-history-bg: #f8f9fa;
        --fa-btn-ghost-bg: transparent;
        --fa-btn-ghost-border: #dadce0;
        --fa-btn-ghost-text: #5f6368;
        --fa-btn-ghost-hover: #f1f3f4;
      }

      @media (prefers-color-scheme: dark) {
        :host {
          --fa-bg: #292a2d;
          --fa-bg-elevated: #35363a;
          --fa-bg-hover: #3c3d41;
          --fa-border: #3c3d41;
          --fa-border-subtle: #4a4b50;
          --fa-text: #e8eaed;
          --fa-text-secondary: #9aa0a6;
          --fa-text-muted: #80868b;
          --fa-shadow: 0 1px 3px 0 rgba(0,0,0,0.5), 0 4px 8px 3px rgba(0,0,0,0.35);
          --fa-shadow-heavy: 0 6px 20px 4px rgba(0,0,0,0.4), 0 2px 6px 0 rgba(0,0,0,0.5);
          --fa-overlay-bg: rgba(0,0,0,0.6);
          --fa-accent: #8ab4f8;
          --fa-accent-hover: #aecbfa;
          --fa-accent-subtle: rgba(138,180,248,0.12);
          --fa-danger: #f28b82;
          --fa-danger-subtle: rgba(242,139,130,0.12);
          --fa-warning-bg: #3a3000;
          --fa-warning-border: #7a6a00;
          --fa-warning-text: #e8eaed;
          --fa-ring-bg: #3c3d41;
          --fa-ring-progress: #f28b82;
          --fa-stat-bg: #35363a;
          --fa-history-bg: #35363a;
          --fa-btn-ghost-bg: transparent;
          --fa-btn-ghost-border: #4a4b50;
          --fa-btn-ghost-text: #9aa0a6;
          --fa-btn-ghost-hover: #3c3d41;
        }
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      /* ── Base Overlay ──────────────────────────────────────────── */

      .fa-overlay {
        position: fixed;
        z-index: 2147483647;
        font-family: 'Inter', 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .fa-overlay.fa-visible {
        opacity: 1;
      }

      .fa-overlay.fa-hiding {
        opacity: 0;
        transform: translateY(-8px);
      }

      /* ── Nudge Card (Stage 2) ──────────────────────────────────── */

      .fa-nudge {
        top: 16px;
        right: 16px;
        transform: translateY(-8px);
      }

      .fa-nudge.fa-visible {
        transform: translateY(0);
      }

      .fa-nudge-card {
        width: 360px;
        background: var(--fa-bg);
        border: 1px solid var(--fa-border);
        border-radius: 12px;
        padding: 20px;
        box-shadow: var(--fa-shadow-heavy);
        color: var(--fa-text);
      }

      .fa-nudge-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 14px;
      }

      .fa-nudge-icon {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: var(--fa-accent-subtle);
        color: var(--fa-accent);
      }

      .fa-nudge-title {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .fa-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        width: fit-content;
      }

      .fa-badge-reading {
        background: var(--fa-accent-subtle);
        color: var(--fa-accent);
      }
      .fa-badge-browsing {
        background: rgba(52, 168, 83, 0.1);
        color: #34a853;
      }
      .fa-badge-entertainment {
        background: rgba(251, 188, 4, 0.12);
        color: #f9ab00;
      }

      .fa-nudge-subtitle {
        font-size: 10px;
        color: var(--fa-text-muted);
        font-weight: 500;
      }

      .fa-close-btn {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: transparent;
        border: none;
        color: var(--fa-text-muted);
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
        flex-shrink: 0;
      }

      .fa-close-btn:hover {
        background: var(--fa-bg-hover);
        color: var(--fa-text);
      }

      .fa-nudge-message {
        font-size: 13px;
        line-height: 1.55;
        color: var(--fa-text-secondary);
        margin-bottom: 16px;
      }

      /* ── Timer ────────────────────────────────────────────────── */

      .fa-timer-section {
        display: flex;
        align-items: center;
        gap: 16px;
        background: var(--fa-bg-elevated);
        border: 1px solid var(--fa-border-subtle);
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 16px;
      }

      .fa-timer-ring {
        position: relative;
        width: 52px;
        height: 52px;
        flex-shrink: 0;
      }

      .fa-timer-ring svg {
        width: 52px;
        height: 52px;
        transform: rotate(-90deg);
      }

      .fa-ring-bg {
        fill: none;
        stroke: var(--fa-ring-bg);
        stroke-width: 3;
      }

      .fa-ring-progress {
        fill: none;
        stroke: var(--fa-ring-progress);
        stroke-width: 3;
        stroke-linecap: round;
        transition: stroke-dashoffset 1s linear;
      }

      .fa-timer-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 16px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--fa-danger);
      }

      .fa-timer-info {
        flex: 1;
      }

      .fa-timer-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--fa-text);
        margin-bottom: 2px;
      }

      .fa-timer-hint {
        font-size: 11px;
        color: var(--fa-text-muted);
      }

      /* ── Buttons ──────────────────────────────────────────────── */

      .fa-nudge-actions {
        display: flex;
        gap: 8px;
      }

      .fa-btn {
        padding: 9px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        border: none;
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: inherit;
      }

      .fa-btn-primary {
        background: var(--fa-accent);
        color: #fff;
        flex: 1;
        justify-content: center;
      }

      .fa-btn-primary:hover {
        background: var(--fa-accent-hover);
      }

      .fa-btn-ghost {
        background: var(--fa-btn-ghost-bg);
        border: 1px solid var(--fa-btn-ghost-border);
        color: var(--fa-btn-ghost-text);
      }

      .fa-btn-ghost:hover {
        background: var(--fa-btn-ghost-hover);
        color: var(--fa-text);
      }

      .fa-btn-wide {
        width: 100%;
        justify-content: center;
        padding: 11px;
      }

      /* ── Final Message (Stage 3) ───────────────────────────────── */

      .fa-final {
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--fa-overlay-bg);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        pointer-events: auto;
      }

      .fa-final-card {
        width: 400px;
        background: var(--fa-bg);
        border: 1px solid var(--fa-border);
        border-radius: 16px;
        padding: 36px 28px;
        text-align: center;
        box-shadow: var(--fa-shadow-heavy);
        color: var(--fa-text);
        animation: fa-popIn 0.3s cubic-bezier(0.2, 0, 0, 1);
      }

      @keyframes fa-popIn {
        from { transform: scale(0.95); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }

      .fa-final-icon {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--fa-accent-subtle);
        color: var(--fa-accent);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
      }

      .fa-final-title {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 6px;
        letter-spacing: -0.2px;
      }

      .fa-final-subtitle {
        font-size: 13px;
        color: var(--fa-text-muted);
        margin-bottom: 24px;
      }

      .fa-final-stats {
        display: flex;
        align-items: center;
        background: var(--fa-stat-bg);
        border: 1px solid var(--fa-border-subtle);
        border-radius: 12px;
        padding: 18px;
        margin-bottom: 20px;
      }

      .fa-final-stat {
        flex: 1;
        text-align: center;
      }

      .fa-final-stat-value {
        font-size: 24px;
        font-weight: 700;
        display: block;
        letter-spacing: -0.5px;
        color: var(--fa-text);
      }

      .fa-final-stat-label {
        font-size: 11px;
        color: var(--fa-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 4px;
        display: block;
      }

      .fa-final-stat-divider {
        width: 1px;
        height: 36px;
        background: var(--fa-border);
      }

      .fa-final-encouragement {
        font-size: 14px;
        color: var(--fa-text-secondary);
        margin-bottom: 24px;
        line-height: 1.5;
      }

      /* ── Warning Bar (Stage 1) ───────────────────────────────── */

      .fa-warning-bar {
        top: 0;
        left: 0;
        right: 0;
        transform: translateY(-100%);
      }

      .fa-warning-bar.fa-visible {
        transform: translateY(0);
      }

      .fa-warning-content {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        background: var(--fa-warning-bg);
        border-bottom: 1px solid var(--fa-warning-border);
        color: var(--fa-warning-text);
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }

      .fa-warning-icon {
        font-size: 16px;
        flex-shrink: 0;
      }

      .fa-warning-text {
        flex: 1;
        line-height: 1.4;
      }

      .fa-warning-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px 12px;
        background: var(--fa-accent);
        border: none;
        border-radius: 6px;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
        font-family: inherit;
      }

      .fa-warning-btn:hover {
        background: var(--fa-accent-hover);
      }

      .fa-warning-dismiss {
        background: none;
        border: none;
        color: var(--fa-text-muted);
        font-size: 16px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 50%;
        transition: background 0.15s;
        font-family: inherit;
      }

      .fa-warning-dismiss:hover {
        background: var(--fa-bg-hover);
        color: var(--fa-text);
      }

      /* ── Distraction History ──────────────────────────────────── */

      .fa-history-section {
        background: var(--fa-history-bg);
        border: 1px solid var(--fa-border-subtle);
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 20px;
        text-align: left;
      }

      .fa-history-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--fa-accent);
        text-transform: uppercase;
        letter-spacing: 0.8px;
        display: block;
        margin-bottom: 10px;
      }

      .fa-history-list {
        max-height: 120px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .fa-history-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        background: var(--fa-bg);
        border-radius: 6px;
        border: 1px solid var(--fa-border-subtle);
      }

      .fa-history-domain {
        font-size: 12px;
        color: var(--fa-text-secondary);
        font-weight: 500;
      }

      .fa-history-time {
        font-size: 10px;
        color: var(--fa-text-muted);
        font-weight: 500;
      }

      /* ── Scrollbar (Chrome-native) ─────────────────────────────── */

      .fa-history-list::-webkit-scrollbar {
        width: 4px;
      }
      .fa-history-list::-webkit-scrollbar-thumb {
        background: var(--fa-border);
        border-radius: 4px;
      }
    `;
  }
})();
