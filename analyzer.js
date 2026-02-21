/**
 * Focus Assistant — Real-Time Content Analyzer
 * TF-IDF keyword extraction and cosine similarity for page relevance scoring.
 */

// ── Stop Words ─────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
    'any', 'are', 'aren', 'arent', 'as', 'at', 'be', 'because', 'been', 'before',
    'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cant', 'could',
    'couldnt', 'd', 'did', 'didn', 'didnt', 'do', 'does', 'doesn', 'doesnt',
    'doing', 'don', 'dont', 'down', 'during', 'each', 'few', 'for', 'from',
    'further', 'get', 'got', 'had', 'hadn', 'has', 'hasn', 'hasnt', 'have',
    'haven', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
    'his', 'how', 'i', 'if', 'in', 'into', 'is', 'isn', 'isnt', 'it', 'its',
    'itself', 'just', 'let', 'll', 'm', 'me', 'might', 'mightn', 'more', 'most',
    'mustn', 'my', 'myself', 'need', 'no', 'nor', 'not', 'now', 'o', 'of', 'off',
    'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out',
    'over', 'own', 'page', 're', 's', 'same', 'shan', 'she', 'should', 'shouldn',
    'so', 'some', 'such', 't', 'than', 'that', 'the', 'their', 'theirs', 'them',
    'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
    'to', 'too', 'under', 'until', 'up', 'us', 've', 'very', 'was', 'wasn',
    'wasnt', 'we', 'were', 'weren', 'werent', 'what', 'when', 'where', 'which',
    'while', 'who', 'whom', 'why', 'will', 'with', 'won', 'wont', 'would',
    'wouldn', 'wouldnt', 'you', 'your', 'yours', 'yourself', 'yourselves',
    // Web-specific stop words
    'click', 'cookie', 'cookies', 'accept', 'privacy', 'policy', 'terms',
    'subscribe', 'sign', 'login', 'logout', 'menu', 'navigation', 'search',
    'share', 'comment', 'comments', 'reply', 'read', 'continue', 'loading',
    'advertisement', 'sponsored', 'follow', 'like', 'home', 'contact',
    'copyright', 'rights', 'reserved', 'skip', 'content', 'main', 'footer',
    'header', 'sidebar', 'widget', 'close', 'open', 'toggle', 'show', 'hide',
    'undefined', 'null', 'true', 'false', 'www', 'http', 'https', 'com', 'org',
    'net', 'html', 'css', 'js',
]);

// ── Tokenization ───────────────────────────────────────────────────────────────

/**
 * Tokenize text into meaningful words.
 * Lowercases, strips punctuation, removes numbers-only tokens and stop words,
 * filters tokens shorter than 3 chars.
 */
function tokenize(text) {
    if (!text) return [];

    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s\-]/g, ' ')   // strip punctuation except hyphens
        .replace(/\s+/g, ' ')              // normalize whitespace
        .trim()
        .split(' ')
        .map(w => w.replace(/^-+|-+$/g, ''))  // strip leading/trailing hyphens
        .filter(w =>
            w.length >= 3 &&
            !STOP_WORDS.has(w) &&
            !/^\d+$/.test(w)               // no pure numbers
        );
}

// ── Keyword Extraction (TF-Based) ──────────────────────────────────────────────

/**
 * Extract weighted keyword frequencies from text.
 * Returns a Map of { word → weighted frequency }.
 */
function extractKeywords(text, weight = 1.0) {
    const tokens = tokenize(text);
    const freq = new Map();

    for (const token of tokens) {
        freq.set(token, (freq.get(token) || 0) + weight);
    }

    return freq;
}

/**
 * Merge multiple keyword maps into one.
 */
function mergeKeywordMaps(...maps) {
    const merged = new Map();
    for (const map of maps) {
        for (const [word, score] of map) {
            merged.set(word, (merged.get(word) || 0) + score);
        }
    }
    return merged;
}

// ── Topic Profile ──────────────────────────────────────────────────────────────

/**
 * Build a topic profile from extracted page data.
 *
 * @param {{ title: string, description: string, headings: string[], bodyText: string, url: string }} pageData
 * @returns {{ keywords: Object, topTerms: string[], totalTokens: number }}
 */
function buildTopicProfile(pageData) {
    // Weight: title and headings matter most
    const titleKw = extractKeywords(pageData.title || '', 5.0);
    const descKw = extractKeywords(pageData.description || '', 3.0);
    const headingsKw = extractKeywords((pageData.headings || []).join(' '), 3.0);
    const bodyKw = extractKeywords(pageData.bodyText || '', 1.0);

    // Also extract keywords from URL path segments
    let urlPath = '';
    try {
        const u = new URL(pageData.url || '');
        urlPath = u.pathname.replace(/[\/\-_.]/g, ' ');
    } catch { }
    const urlKw = extractKeywords(urlPath, 2.0);

    const merged = mergeKeywordMaps(titleKw, descKw, headingsKw, bodyKw, urlKw);

    // Sort by score and take top N
    const sorted = [...merged.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80);

    // Normalize scores to 0-1 range
    const maxScore = sorted.length > 0 ? sorted[0][1] : 1;
    const keywords = {};
    for (const [word, score] of sorted) {
        keywords[word] = score / maxScore;
    }

    const topTerms = sorted.slice(0, 10).map(([word]) => word);
    const totalTokens = merged.size;

    return { keywords, topTerms, totalTokens };
}

// ── Cosine Similarity ──────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two keyword vectors.
 * Returns a value between 0 (no overlap) and 1 (identical).
 */
function cosineSimilarity(profileA, profileB) {
    const kwA = profileA.keywords || {};
    const kwB = profileB.keywords || {};

    // Get union of all keys
    const allKeys = new Set([...Object.keys(kwA), ...Object.keys(kwB)]);

    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (const key of allKeys) {
        const a = kwA[key] || 0;
        const b = kwB[key] || 0;
        dotProduct += a * b;
        magA += a * a;
        magB += b * b;
    }

    if (magA === 0 || magB === 0) return 0;

    return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── Relevance Analysis ─────────────────────────────────────────────────────────

// Similarity thresholds
const THRESHOLDS = {
    HIGH_RELEVANCE: 0.25,   // Clearly related content
    LOW_RELEVANCE: 0.10,    // Possibly related
};

/**
 * Analyze whether a page is relevant to the anchor page's topic.
 *
 * @param {Object} anchorProfile - The topic profile of the anchor page
 * @param {Object} pageData - Extracted data from the current page
 * @param {string} mode - 'reading' | 'browsing' | 'entertainment'
 * @returns {{ relevant: boolean, score: number, reason: string, topTerms: string[] }}
 */
function analyzeRelevance(anchorProfile, pageData, mode) {
    // Build profile for current page
    const currentProfile = buildTopicProfile(pageData);
    const score = cosineSimilarity(anchorProfile, currentProfile);

    // Find shared keywords for context
    const sharedTerms = [];
    for (const term of currentProfile.topTerms) {
        if (anchorProfile.keywords[term]) {
            sharedTerms.push(term);
        }
    }

    if (score >= THRESHOLDS.HIGH_RELEVANCE) {
        const sharedStr = sharedTerms.length > 0
            ? ` (shared topics: ${sharedTerms.slice(0, 4).join(', ')})`
            : '';
        return {
            relevant: true,
            score,
            reason: `Content is related to your focus topic${sharedStr}.`,
            topTerms: currentProfile.topTerms,
        };
    }

    if (score >= THRESHOLDS.LOW_RELEVANCE) {
        return {
            relevant: true,
            score,
            reason: `Loosely related content — allowing.`,
            topTerms: currentProfile.topTerms,
        };
    }

    // Not relevant
    const anchorTopics = anchorProfile.topTerms.slice(0, 4).join(', ');
    const currentTopics = currentProfile.topTerms.slice(0, 4).join(', ');

    let reason;
    if (currentProfile.totalTokens < 5) {
        reason = `This page doesn't seem related to your focus topic (${anchorTopics}).`;
    } else {
        reason = `This page is about "${currentTopics}" — not related to your focus on "${anchorTopics}".`;
    }

    return {
        relevant: false,
        score,
        reason,
        topTerms: currentProfile.topTerms,
    };
}

// ── Export ──────────────────────────────────────────────────────────────────────

if (typeof globalThis !== 'undefined') {
    globalThis.FocusAnalyzer = {
        tokenize,
        extractKeywords,
        buildTopicProfile,
        cosineSimilarity,
        analyzeRelevance,
        THRESHOLDS,
    };
}
