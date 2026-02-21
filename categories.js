/**
 * Domain Categorization Engine
 * Maps domains to categories and provides relevance checking for focus modes.
 */

const DOMAIN_CATEGORIES = {
    // Social Media
    'facebook.com': 'social', 'www.facebook.com': 'social',
    'twitter.com': 'social', 'x.com': 'social', 'www.x.com': 'social',
    'instagram.com': 'social', 'www.instagram.com': 'social',
    'linkedin.com': 'social', 'www.linkedin.com': 'social',
    'reddit.com': 'social', 'www.reddit.com': 'social', 'old.reddit.com': 'social',
    'tiktok.com': 'social', 'www.tiktok.com': 'social',
    'snapchat.com': 'social', 'threads.net': 'social',
    'mastodon.social': 'social', 'bsky.app': 'social',
    'discord.com': 'social', 'tumblr.com': 'social',
    'pinterest.com': 'social', 'www.pinterest.com': 'social',

    // Entertainment & Streaming
    'youtube.com': 'entertainment', 'www.youtube.com': 'entertainment',
    'netflix.com': 'entertainment', 'www.netflix.com': 'entertainment',
    'hulu.com': 'entertainment', 'disneyplus.com': 'entertainment',
    'primevideo.com': 'entertainment', 'hbomax.com': 'entertainment',
    'max.com': 'entertainment', 'twitch.tv': 'entertainment', 'www.twitch.tv': 'entertainment',
    'crunchyroll.com': 'entertainment', 'peacocktv.com': 'entertainment',
    'paramountplus.com': 'entertainment', 'hotstar.com': 'entertainment',
    'www.hotstar.com': 'entertainment', 'jiocinema.com': 'entertainment',
    'spotify.com': 'entertainment', 'open.spotify.com': 'entertainment',
    'music.youtube.com': 'entertainment', 'soundcloud.com': 'entertainment',
    'apple.com/tv': 'entertainment',
    '9gag.com': 'entertainment', 'imgur.com': 'entertainment',
    'buzzfeed.com': 'entertainment',

    // News
    'news.google.com': 'news', 'cnn.com': 'news', 'bbc.com': 'news', 'bbc.co.uk': 'news',
    'nytimes.com': 'news', 'washingtonpost.com': 'news', 'theguardian.com': 'news',
    'reuters.com': 'news', 'apnews.com': 'news', 'aljazeera.com': 'news',
    'foxnews.com': 'news', 'cnbc.com': 'news', 'bloomberg.com': 'news',
    'techcrunch.com': 'news', 'theverge.com': 'news', 'arstechnica.com': 'news',
    'wired.com': 'news', 'engadget.com': 'news',
    'ndtv.com': 'news', 'timesofindia.indiatimes.com': 'news',
    'hindustantimes.com': 'news',

    // Developer / Productivity
    'github.com': 'dev', 'www.github.com': 'dev',
    'gitlab.com': 'dev', 'bitbucket.org': 'dev',
    'stackoverflow.com': 'dev', 'stackexchange.com': 'dev',
    'dev.to': 'dev', 'hashnode.dev': 'dev',
    'codepen.io': 'dev', 'codesandbox.io': 'dev', 'replit.com': 'dev',
    'npmjs.com': 'dev', 'pypi.org': 'dev', 'crates.io': 'dev',
    'vercel.com': 'dev', 'netlify.com': 'dev', 'heroku.com': 'dev',
    'aws.amazon.com': 'dev', 'console.cloud.google.com': 'dev',
    'portal.azure.com': 'dev',

    // Productivity / Work
    'docs.google.com': 'productivity', 'drive.google.com': 'productivity',
    'sheets.google.com': 'productivity', 'slides.google.com': 'productivity',
    'mail.google.com': 'productivity', 'outlook.live.com': 'productivity',
    'outlook.office.com': 'productivity', 'office.com': 'productivity',
    'notion.so': 'productivity', 'www.notion.so': 'productivity',
    'trello.com': 'productivity', 'asana.com': 'productivity',
    'jira.atlassian.com': 'productivity', 'atlassian.com': 'productivity',
    'slack.com': 'productivity', 'app.slack.com': 'productivity',
    'teams.microsoft.com': 'productivity',
    'figma.com': 'productivity', 'www.figma.com': 'productivity',
    'canva.com': 'productivity',
    'calendar.google.com': 'productivity',
    'linear.app': 'productivity', 'clickup.com': 'productivity',
    'monday.com': 'productivity', 'basecamp.com': 'productivity',
    'airtable.com': 'productivity',

    // Reference / Learning
    'wikipedia.org': 'reference', 'en.wikipedia.org': 'reference',
    'scholar.google.com': 'reference', 'arxiv.org': 'reference',
    'medium.com': 'reference', 'substack.com': 'reference',
    'quora.com': 'reference',
    'khanacademy.org': 'reference', 'coursera.org': 'reference',
    'udemy.com': 'reference', 'edx.org': 'reference',
    'brilliant.org': 'reference', 'codecademy.com': 'reference',
    'freecodecamp.org': 'reference', 'w3schools.com': 'reference',
    'developer.mozilla.org': 'reference', 'mdn.io': 'reference',
    'docs.python.org': 'reference', 'learn.microsoft.com': 'reference',
    'reactjs.org': 'reference', 'vuejs.org': 'reference', 'angular.io': 'reference',
    'nextjs.org': 'reference',

    // Shopping
    'amazon.com': 'shopping', 'www.amazon.com': 'shopping',
    'amazon.in': 'shopping', 'www.amazon.in': 'shopping',
    'flipkart.com': 'shopping', 'www.flipkart.com': 'shopping',
    'ebay.com': 'shopping', 'etsy.com': 'shopping',
    'walmart.com': 'shopping', 'target.com': 'shopping',
    'myntra.com': 'shopping', 'ajio.com': 'shopping',
    'aliexpress.com': 'shopping',

    // Gaming
    'store.steampowered.com': 'gaming', 'steampowered.com': 'gaming',
    'epicgames.com': 'gaming', 'ign.com': 'gaming',
    'kotaku.com': 'gaming', 'gamespot.com': 'gaming',
    'roblox.com': 'gaming', 'chess.com': 'gaming',
    'lichess.org': 'gaming', 'poki.com': 'gaming',

    // Search
    'google.com': 'search', 'www.google.com': 'search',
    'bing.com': 'search', 'www.bing.com': 'search',
    'duckduckgo.com': 'search', 'search.yahoo.com': 'search',
    'perplexity.ai': 'search',

    // AI Tools
    'chat.openai.com': 'ai', 'chatgpt.com': 'ai',
    'claude.ai': 'ai', 'gemini.google.com': 'ai',
    'bard.google.com': 'ai', 'copilot.microsoft.com': 'ai',
    'midjourney.com': 'ai',

    // Finance
    'moneycontrol.com': 'finance', 'zerodha.com': 'finance',
    'groww.in': 'finance', 'finance.yahoo.com': 'finance',
    'robinhood.com': 'finance', 'coinbase.com': 'finance',
};

// Keywords in URLs that suggest categories
const URL_KEYWORD_CATEGORIES = {
    social: ['feed', 'timeline', 'stories', 'profile', 'follow', 'friends', 'social'],
    entertainment: ['watch', 'video', 'stream', 'movie', 'show', 'episode', 'play', 'music', 'listen', 'podcast', 'anime', 'manga', 'comic', 'meme'],
    news: ['news', 'article', 'headline', 'breaking', 'politics', 'opinion', 'editorial'],
    shopping: ['shop', 'buy', 'cart', 'checkout', 'product', 'deal', 'price', 'order', 'wishlist'],
    gaming: ['game', 'gaming', 'esports', 'clan', 'guild', 'leaderboard'],
    reference: ['wiki', 'documentation', 'docs', 'tutorial', 'guide', 'learn', 'course', 'lesson', 'study', 'research', 'paper', 'journal'],
    dev: ['api', 'repository', 'commit', 'pull-request', 'issue', 'code', 'debug', 'deploy', 'pipeline'],
    productivity: ['task', 'project', 'board', 'sprint', 'calendar', 'meeting', 'agenda'],
};

// Which categories are considered "on-task" for each focus mode
const MODE_ALLOWED_CATEGORIES = {
    reading: ['reference', 'search', 'ai', 'dev', 'productivity'],
    browsing: [], // uses custom allowlist — handled separately
    entertainment: ['entertainment', 'social', 'gaming'],
};

// Categories that trigger nudges per mode
const MODE_DISTRACTION_CATEGORIES = {
    reading: ['social', 'entertainment', 'shopping', 'gaming', 'news', 'finance'],
    browsing: [], // everything outside allowlist
    entertainment: ['dev', 'productivity'],
};

/**
 * Extract the root domain from a URL string.
 */
function extractDomain(url) {
    try {
        const u = new URL(url);
        return u.hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

/**
 * Get the category for a given URL.
 * First checks the domain map, then falls back to keyword analysis.
 */
function categorizeUrl(url) {
    const domain = extractDomain(url);

    // Direct domain lookup (check with and without www)
    if (DOMAIN_CATEGORIES[domain]) return DOMAIN_CATEGORIES[domain];
    if (DOMAIN_CATEGORIES['www.' + domain]) return DOMAIN_CATEGORIES['www.' + domain];

    // Check if any mapped domain is a suffix (subdomains)
    for (const [mappedDomain, category] of Object.entries(DOMAIN_CATEGORIES)) {
        if (domain.endsWith('.' + mappedDomain.replace(/^www\./, ''))) {
            return category;
        }
    }

    // Keyword-based fallback
    const lowerUrl = url.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(URL_KEYWORD_CATEGORIES)) {
        let score = 0;
        for (const kw of keywords) {
            if (lowerUrl.includes(kw)) score++;
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = category;
        }
    }

    return bestMatch || 'unknown';
}

/**
 * Determine if a navigation is relevant given the current focus mode context.
 *
 * @param {string} anchorUrl - The URL where focus started
 * @param {string} currentUrl - The URL the user has navigated to
 * @param {string} mode - 'reading' | 'browsing' | 'entertainment'
 * @param {string[]} allowlist - Browsing-mode allowlist of domains
 * @returns {{ relevant: boolean, reason: string, category: string }}
 */
function checkRelevance(anchorUrl, currentUrl, mode, allowlist = []) {
    const currentCategory = categorizeUrl(currentUrl);
    const currentDomain = extractDomain(currentUrl);
    const anchorDomain = extractDomain(anchorUrl);

    // Same domain is always relevant
    if (currentDomain === anchorDomain) {
        return { relevant: true, reason: 'Same domain as your focus page.', category: currentCategory };
    }

    // Chrome internal pages are always allowed
    if (currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://') || currentUrl.startsWith('about:')) {
        return { relevant: true, reason: 'Browser internal page.', category: 'browser' };
    }

    if (mode === 'reading') {
        const anchorCategory = categorizeUrl(anchorUrl);

        // Search engines are always allowed in reading mode (research)
        if (currentCategory === 'search' || currentCategory === 'ai') {
            return { relevant: true, reason: 'Research tool — allowed in Reading mode.', category: currentCategory };
        }

        // Reference sites are allowed
        if (currentCategory === 'reference') {
            return { relevant: true, reason: 'Reference material — relevant to reading.', category: currentCategory };
        }

        // Same category as anchor is relevant
        if (currentCategory === anchorCategory && anchorCategory !== 'unknown') {
            return { relevant: true, reason: `Same category (${currentCategory}) as your focus page.`, category: currentCategory };
        }

        // Dev/productivity are allowed if anchor is also dev/productivity/reference
        if (['dev', 'productivity'].includes(currentCategory) && ['dev', 'productivity', 'reference'].includes(anchorCategory)) {
            return { relevant: true, reason: 'Work-related — relevant to your reading context.', category: currentCategory };
        }

        // Known distraction categories
        if (MODE_DISTRACTION_CATEGORIES.reading.includes(currentCategory)) {
            return { relevant: false, reason: getDistractionMessage(currentCategory, 'reading'), category: currentCategory };
        }

        // Unknown — give benefit of the doubt for first visit, but flag
        if (currentCategory === 'unknown') {
            return { relevant: true, reason: 'Unrecognized site — allowed for now.', category: currentCategory };
        }

        return { relevant: false, reason: `This doesn't seem related to what you were reading.`, category: currentCategory };
    }

    if (mode === 'browsing') {
        // Check against user's allowlist
        const normalizedAllowlist = allowlist.map(d => d.replace(/^www\./, '').toLowerCase());
        if (normalizedAllowlist.includes(currentDomain.toLowerCase())) {
            return { relevant: true, reason: 'Domain is in your allowlist.', category: currentCategory };
        }

        // Search and AI are always allowed
        if (currentCategory === 'search' || currentCategory === 'ai') {
            return { relevant: true, reason: 'Search/AI tools are always allowed.', category: currentCategory };
        }

        return { relevant: false, reason: `${currentDomain} is not in your focus allowlist.`, category: currentCategory };
    }

    if (mode === 'entertainment') {
        // Entertainment, social, gaming are allowed
        if (MODE_ALLOWED_CATEGORIES.entertainment.includes(currentCategory)) {
            return { relevant: true, reason: 'Entertainment content — enjoy your break!', category: currentCategory };
        }

        // Search is always ok
        if (currentCategory === 'search') {
            return { relevant: true, reason: 'Searching is fine during your break.', category: currentCategory };
        }

        // Work sites trigger a nudge
        if (['dev', 'productivity'].includes(currentCategory)) {
            return { relevant: false, reason: `You're supposed to be relaxing! ${currentDomain} looks like work.`, category: currentCategory };
        }

        // News and reference — mildly allowed
        if (['news', 'reference'].includes(currentCategory)) {
            return { relevant: true, reason: 'Light reading — acceptable during break.', category: currentCategory };
        }

        return { relevant: true, reason: 'Looks fine for your break.', category: currentCategory };
    }

    return { relevant: true, reason: 'No active focus rules.', category: currentCategory };
}

/**
 * Generate a contextual distraction message based on category.
 */
function getDistractionMessage(category, mode) {
    const messages = {
        social: [
            "Social media detected — your reading is waiting for you!",
            "Looks like you've drifted to social media. Head back?",
            "Your article misses you. Social media can wait!"
        ],
        entertainment: [
            "Entertainment break? Your reading focus is still active.",
            "This looks like entertainment — not quite what you were focused on.",
            "Tempting, but your focus session is running!"
        ],
        shopping: [
            "Shopping can wait — you were in the zone!",
            "Retail therapy later? Your focus session is active.",
            "Your cart isn't going anywhere. Back to reading?"
        ],
        gaming: [
            "Gaming break? Your focus session says otherwise!",
            "The games will be there later. Stay focused!",
        ],
        news: [
            "News can be a rabbit hole — stay focused on your reading!",
            "Headlines are tempting, but your focus session is active.",
        ],
        finance: [
            "Markets can wait — your reading focus is active!",
            "Portfolio check later? Stay in the zone.",
        ]
    };

    const pool = messages[category] || ["This doesn't seem related to your current focus."];
    return pool[Math.floor(Math.random() * pool.length)];
}

// Export for use in background.js (module scope)
// Since background is a module worker, we use globalThis for shared access
if (typeof globalThis !== 'undefined') {
    globalThis.FocusCategories = {
        categorizeUrl,
        checkRelevance,
        extractDomain,
        getDistractionMessage,
        DOMAIN_CATEGORIES,
        MODE_ALLOWED_CATEGORIES,
        MODE_DISTRACTION_CATEGORIES
    };
}
