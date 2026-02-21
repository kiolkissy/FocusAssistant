# Focus Assistant — Chromium Extension

A smart focus extension that monitors your browsing behavior, detects distractions based on the active focus mode, and gently nudges you back on track with a grace-period timer before disabling focus mode.

---

## Installation

1. Open `chrome://extensions` in Chrome (or any Chromium browser)
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked** → select the `FocusAssistant` folder
4. The Focus Assistant icon (purple eye) appears in the toolbar

---

## Focus Modes

### 📖 Reading Mode

**Purpose:** Deep focus on a single article, documentation page, or research task.

**How it works:**
- When you activate Reading Mode, the extension locks onto the **current tab's page** as your "anchor."
- The extension then monitors every page you navigate to — if you drift to something unrelated, it nudges you back.

**What's allowed (no nudge):**
| Category | Examples | Why |
|---|---|---|
| Same domain | Any page on the same site as your anchor | You're staying on topic |
| Search engines | Google, Bing, DuckDuckGo, Perplexity | You're researching |
| AI tools | ChatGPT, Claude, Gemini | You're researching |
| Reference sites | Wikipedia, MDN, arXiv, Medium, Coursera | Relevant reading material |
| Same category as anchor | If your anchor is a dev site, other dev sites are ok | Context-related |
| Dev/productivity (if anchor is dev/reference) | GitHub, Notion, Jira, Figma | Work-related context |
| Unknown sites | First visit to an uncategorized site | Benefit of the doubt |

**What triggers a nudge:**
| Category | Examples | Sample message |
|---|---|---|
| Social media | Twitter/X, Instagram, Reddit, TikTok | *"Looks like you've drifted to social media. Head back?"* |
| Entertainment | YouTube, Netflix, Twitch, Spotify | *"Tempting, but your focus session is running!"* |
| Shopping | Amazon, Flipkart, eBay | *"Shopping can wait — you were in the zone!"* |
| Gaming | Steam, Chess.com, Roblox | *"The games will be there later. Stay focused!"* |
| News | CNN, BBC, TechCrunch | *"News can be a rabbit hole — stay focused!"* |
| Finance | Moneycontrol, Zerodha, Robinhood | *"Markets can wait — your reading focus is active!"* |

---

### 🌐 Browsing Mode

**Purpose:** Stay within a set of specific websites you choose — great for work sprints where you know exactly which tools you need.

**How it works:**
- Before activating, go to **Settings** (gear icon) and add your allowed domains (e.g., `github.com`, `stackoverflow.com`, `docs.google.com`).
- Any navigation outside those domains triggers a nudge.

**What's allowed (no nudge):**
| Category | Examples | Why |
|---|---|---|
| Allowlisted domains | Whatever you add in settings | Your chosen focus sites |
| Search engines | Google, Bing, DuckDuckGo | Always allowed |
| AI tools | ChatGPT, Claude, Gemini | Always allowed |

**What triggers a nudge:**
- **Any domain not in your allowlist.** The nudge message shows the specific domain:
  > *"reddit.com is not in your focus allowlist."*

---

### 🎬 Entertainment Mode

**Purpose:** Enforce a real break. When you're supposed to be relaxing, this mode blocks you from drifting back to work.

**How it works:**
- Activate this when you want guilt-free leisure time.
- The extension *reverses* the usual logic — it **allows** fun sites and **blocks** work sites.

**What's allowed (no nudge):**
| Category | Examples | Why |
|---|---|---|
| Entertainment | YouTube, Netflix, Twitch, Spotify, Disney+ | Enjoy your break! |
| Social media | Twitter/X, Instagram, Reddit, TikTok | Social time is fine |
| Gaming | Steam, Chess.com, Roblox | Play away! |
| News & reference | BBC, Wikipedia, Medium | Light reading is ok |
| Search engines | Google, Bing | Always fine |

**What triggers a nudge:**
| Category | Examples | Sample message |
|---|---|---|
| Dev/coding | GitHub, GitLab, Stack Overflow, CodePen | *"You're supposed to be relaxing! github.com looks like work."* |
| Productivity | Google Docs, Notion, Jira, Slack, Figma | *"You're supposed to be relaxing! notion.so looks like work."* |

---

## What Happens When You Get Distracted

The same flow applies in all modes:

```
1. You navigate to a distracting page
         ↓
2. A nudge overlay slides in (top-right corner)
   • Shows a contextual message explaining why this is a distraction
   • Displays a countdown timer (default: 30 seconds)
   • Has a "Go Back to Focus" button and a "Dismiss" button
         ↓
3. Two possible outcomes:

   A. You click "Go Back to Focus" (or navigate back to your anchor)
      → Overlay dismisses, timer cancels, focus session continues ✅

   B. Timer runs out
      → Full-screen "Focus Session Ended" message appears
      → Shows your total focused time and distraction count
      → Focus mode is automatically deactivated
```

---

## Settings

Click the **gear icon** in the popup to configure:

| Setting | Default | Description |
|---|---|---|
| **Grace Period** | 30 seconds | How long you have to return before focus mode ends. Range: 10–120 seconds. |
| **Allowed Domains** | *(empty)* | For Browsing Mode only. One domain per line (e.g., `github.com`). |

---

## Popup Dashboard

When a focus session is active, the popup shows:
- **Mode badge** — which mode is active (color-coded)
- **Elapsed time** — live timer showing how long you've been focused
- **Distraction count** — how many times you were nudged
- **Anchor URL** — the page you started focusing on
- **End Focus Session** button — manually stop the session

---

## Domain Categorization

The extension categorizes 200+ popular domains across these categories:
- **Social:** Facebook, Twitter/X, Instagram, Reddit, LinkedIn, TikTok, Discord, etc.
- **Entertainment:** YouTube, Netflix, Twitch, Spotify, Disney+, Hulu, etc.
- **News:** CNN, BBC, NYT, TechCrunch, The Verge, etc.
- **Dev:** GitHub, GitLab, Stack Overflow, npm, Vercel, AWS, etc.
- **Productivity:** Google Docs, Notion, Jira, Slack, Figma, Trello, etc.
- **Reference:** Wikipedia, MDN, Coursera, Khan Academy, arXiv, etc.
- **Shopping:** Amazon, Flipkart, eBay, Etsy, Walmart, etc.
- **Gaming:** Steam, Epic Games, Chess.com, Roblox, etc.
- **Search:** Google, Bing, DuckDuckGo, Perplexity
- **AI:** ChatGPT, Claude, Gemini, Copilot
- **Finance:** Moneycontrol, Zerodha, Robinhood, Coinbase

For unknown sites, the extension uses **keyword analysis** on the URL to guess the category.

---

## Technical Details

- **Manifest V3** Chrome extension
- **Service worker** (`background.js`) — runs in the background, monitors tab changes
- **Content script** (`content.js`) — injects overlays using **Shadow DOM** (no style conflicts with websites)
- **Permissions used:** `tabs`, `activeTab`, `storage`, `alarms`, `scripting`
