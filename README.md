# Focus Assistant — Chromium Extension

A smart focus extension that **reads and understands the content** of web pages to detect distractions in real time. Instead of relying on a static list of "allowed" or "blocked" sites, it analyzes what you're reading and compares it against what you navigate to.

---

## Installation

1. Open `chrome://extensions` in Chrome (or any Chromium browser)
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked** → select the `FocusAssistant` folder
4. The Focus Assistant icon (purple eye) appears in the toolbar

---

## How It Works — Content Analysis

When you activate **Reading Mode**, the extension:

1. **Reads your anchor page** — extracts the title, headings, meta description, and body text
2. **Builds a topic fingerprint** — uses TF-IDF keyword extraction to identify what the page is about (e.g., "machine learning, neural networks, training, deep learning")
3. **Compares every page you visit** — extracts the same data from each new page and computes **cosine similarity** against your anchor's fingerprint
4. **Decides relevance by content overlap** — not by domain name

This means:
- ✅ A Wikipedia article about the same topic → **allowed** (high similarity)
- ✅ A blog post on a related concept → **allowed**
- ❌ A cooking recipe site → **nudge triggered** (low similarity)
- ❌ A social media feed → **instant nudge** (fast-path detection)

The popup dashboard shows the **detected topic keywords** so you can confirm the extension understands your focus context.

---

## Focus Modes

### 📖 Reading Mode — Content-Based Analysis

**Purpose:** Deep focus on a specific topic. The extension understands *what you're reading* and blocks unrelated content.

**How the analysis works:**

| Step | What happens |
|---|---|
| 1. Activate | Extension extracts anchor page content and builds keyword profile |
| 2. Navigate | New page's content is extracted and compared |
| 3. Score | Cosine similarity computed between keyword vectors |
| 4. Decision | Score ≥ 0.15 → allowed · Score < 0.10 → distraction |

**Fast-path (instant, no content analysis needed):**
- ✅ **Search & AI** (Google, ChatGPT, etc.) → always allowed
- ❌ **Social media** (Twitter, Instagram, Reddit) → instant nudge
- ❌ **Shopping** (Amazon, eBay) → instant nudge
- ❌ **Gaming** (Steam, Chess.com) → instant nudge
- ❌ **Finance** (Trading sites) → instant nudge

**Content analysis (reads the page first):**
- Everything else is evaluated by actual content similarity
- The nudge message tells you **what the page is about** vs **what you were focusing on**

---

### 🌐 Browsing Mode — Allowlist-Based

**Purpose:** Stay within specific websites you choose for a work sprint.

**How it works:**
- Add allowed domains in **Settings** (gear icon)
- Search engines and AI tools are always allowed
- Everything else outside your allowlist triggers a nudge

---

### 🎬 Entertainment Mode — Reverse Logic

**Purpose:** Enforce a real break — blocks work sites.

**What's allowed:** YouTube, Netflix, Twitch, social media, gaming, news, search
**What triggers a nudge:** GitHub, Stack Overflow, Notion, Jira, Figma (work sites)

---

## What Happens When You Get Distracted

```
1. You navigate to a distracting page
         ↓
2. Nudge overlay slides in (top-right)
   • Contextual message: "This page is about 'cooking, recipes' — not related to your focus on 'machine learning, neural networks'"
   • Countdown timer (default: 30 seconds)
   • "Go Back to Focus" button
         ↓
3. Two outcomes:

   A. You go back → focus session continues ✅
   B. Timer expires → session ends with summary stats
```

---

## Popup Dashboard

When a session is active, the popup shows:
- **Mode badge** — color-coded active mode
- **Elapsed time** — live timer
- **Distraction count** — how many nudges triggered
- **Anchor URL** — focused page
- **📌 Topic detected** — keyword fingerprint of your focus content (Reading mode)
- **End Focus Session** button

---

## Settings

| Setting | Default | Description |
|---|---|---|
| **Grace Period** | 30 seconds | Time to return before session ends. Range: 10–120s. |
| **Allowed Domains** | *(empty)* | For Browsing Mode. One domain per line. |

---

## Technical Details

- **Manifest V3** Chrome extension
- **Content Analysis:** TF-IDF keyword extraction + cosine similarity
- **Service Worker** (`background.js`) — monitors tabs, runs content analysis
- **Content Script** (`content.js`) — extracts page content, shows overlay nudges via Shadow DOM
- **Analyzer** (`analyzer.js`) — topic profiling engine
- **Permissions:** `tabs`, `activeTab`, `storage`, `alarms`, `scripting`
