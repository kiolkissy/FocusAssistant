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

    // ── Final Message Overlay ──────────────────────────────────────────────────

    function showFinalMessage(data) {
        ensureShadowHost();
        removeOverlay();

        const minutes = data.duration || 0;
        const timeStr = minutes >= 60
            ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
            : `${minutes} minute${minutes !== 1 ? 's' : ''}`;

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

    // ── Message Listener ───────────────────────────────────────────────────────

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.type) {
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

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      .fa-overlay {
        position: fixed;
        z-index: 2147483647;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease;
      }

      .fa-overlay.fa-visible {
        opacity: 1;
      }

      .fa-overlay.fa-hiding {
        opacity: 0;
        transform: translateY(-10px);
      }

      /* ── Nudge Banner ─────────────────────────────────────────── */

      .fa-nudge {
        top: 20px;
        right: 20px;
        transform: translateY(-10px);
      }

      .fa-nudge.fa-visible {
        transform: translateY(0);
      }

      .fa-nudge-card {
        width: 380px;
        background: rgba(15, 15, 22, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(108, 92, 231, 0.1);
        color: #f0f0f5;
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
      }

      .fa-badge-reading ~ .fa-nudge-subtitle { color: #6C5CE7; }
      .fa-nudge-card:has(.fa-badge-reading) .fa-nudge-icon {
        background: rgba(108, 92, 231, 0.15);
        color: #6C5CE7;
      }
      .fa-nudge-card:has(.fa-badge-browsing) .fa-nudge-icon {
        background: rgba(0, 184, 148, 0.15);
        color: #00B894;
      }
      .fa-nudge-card:has(.fa-badge-entertainment) .fa-nudge-icon {
        background: rgba(225, 112, 85, 0.15);
        color: #E17055;
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
        background: rgba(108, 92, 231, 0.2);
        color: #6C5CE7;
      }
      .fa-badge-browsing {
        background: rgba(0, 184, 148, 0.2);
        color: #00B894;
      }
      .fa-badge-entertainment {
        background: rgba(225, 112, 85, 0.2);
        color: #E17055;
      }

      .fa-nudge-subtitle {
        font-size: 10px;
        color: #5a5a6e;
        font-weight: 500;
      }

      .fa-close-btn {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #8b8b9e;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        flex-shrink: 0;
      }

      .fa-close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #f0f0f5;
      }

      .fa-nudge-message {
        font-size: 14px;
        line-height: 1.5;
        color: #c8c8d8;
        margin-bottom: 16px;
      }

      /* ── Timer ────────────────────────────────────────────────── */

      .fa-timer-section {
        display: flex;
        align-items: center;
        gap: 16px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 16px;
      }

      .fa-timer-ring {
        position: relative;
        width: 56px;
        height: 56px;
        flex-shrink: 0;
      }

      .fa-timer-ring svg {
        width: 56px;
        height: 56px;
        transform: rotate(-90deg);
      }

      .fa-ring-bg {
        fill: none;
        stroke: rgba(255, 255, 255, 0.06);
        stroke-width: 3;
      }

      .fa-ring-progress {
        fill: none;
        stroke: #ff4757;
        stroke-width: 3;
        stroke-linecap: round;
        transition: stroke-dashoffset 1s linear;
      }

      .fa-timer-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 18px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: #ff4757;
      }

      .fa-timer-info {
        flex: 1;
      }

      .fa-timer-label {
        font-size: 13px;
        font-weight: 500;
        color: #f0f0f5;
        margin-bottom: 2px;
      }

      .fa-timer-hint {
        font-size: 11px;
        color: #5a5a6e;
      }

      /* ── Buttons ──────────────────────────────────────────────── */

      .fa-nudge-actions {
        display: flex;
        gap: 8px;
      }

      .fa-btn {
        padding: 10px 16px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: inherit;
      }

      .fa-btn-primary {
        background: linear-gradient(135deg, #6C5CE7, #a29bfe);
        color: white;
        flex: 1;
        justify-content: center;
      }

      .fa-btn-primary:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }

      .fa-btn-ghost {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #8b8b9e;
      }

      .fa-btn-ghost:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #f0f0f5;
      }

      .fa-btn-wide {
        width: 100%;
        justify-content: center;
        padding: 12px;
      }

      /* ── Final Message ────────────────────────────────────────── */

      .fa-final {
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        pointer-events: auto;
      }

      .fa-final-card {
        width: 420px;
        background: rgba(15, 15, 22, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 40px 32px;
        text-align: center;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
        color: #f0f0f5;
        animation: fa-popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes fa-popIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }

      .fa-final-icon {
        width: 72px;
        height: 72px;
        border-radius: 20px;
        background: rgba(108, 92, 231, 0.15);
        color: #6C5CE7;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
      }

      .fa-final-title {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 6px;
        letter-spacing: -0.3px;
      }

      .fa-final-subtitle {
        font-size: 14px;
        color: #8b8b9e;
        margin-bottom: 24px;
      }

      .fa-final-stats {
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 14px;
        padding: 20px;
        margin-bottom: 20px;
      }

      .fa-final-stat {
        flex: 1;
        text-align: center;
      }

      .fa-final-stat-value {
        font-size: 26px;
        font-weight: 700;
        display: block;
        letter-spacing: -0.5px;
      }

      .fa-final-stat-label {
        font-size: 11px;
        color: #5a5a6e;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 4px;
        display: block;
      }

      .fa-final-stat-divider {
        width: 1px;
        height: 40px;
        background: rgba(255, 255, 255, 0.08);
      }

      .fa-final-encouragement {
        font-size: 15px;
        color: #c8c8d8;
        margin-bottom: 24px;
        line-height: 1.5;
      }
    `;
    }
})();
