/**
 * Focus Assistant — Smart Content Analyzer
 * Uses Gemini AI for semantic understanding, with TF-IDF as offline fallback.
 */

// ── Stop Words (for TF-IDF fallback) ───────────────────────────────────────────

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
    'click', 'cookie', 'cookies', 'accept', 'privacy', 'policy', 'terms',
    'subscribe', 'sign', 'login', 'logout', 'menu', 'navigation', 'search',
    'share', 'comment', 'comments', 'reply', 'read', 'continue', 'loading',
    'advertisement', 'sponsored', 'follow', 'like', 'home', 'contact',
    'copyright', 'rights', 'reserved', 'skip', 'content', 'main', 'footer',
    'header', 'sidebar', 'widget', 'close', 'open', 'toggle', 'show', 'hide',
    'undefined', 'null', 'true', 'false', 'www', 'http', 'https', 'com', 'org',
    'net', 'html', 'css', 'js',
]);

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI AI ANALYZER
// ═══════════════════════════════════════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Call the Gemini API with a prompt.
 * Returns the parsed JSON response or null on failure.
 */
async function callGemini(apiKey, prompt) {
    const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 300,
                    responseMimeType: 'application/json',
                },
            }),
        });

        if (!response.ok) {
            console.error('[FocusAnalyzer] Gemini API error:', response.status, await response.text());
            return null;
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return null;

        return JSON.parse(text);
    } catch (err) {
        console.error('[FocusAnalyzer] Gemini call failed:', err);
        return null;
    }
}

/**
 * Use Gemini to summarize the topic of a page.
 * Returns a concise topic description string.
 */
async function geminiSummarizeTopic(apiKey, pageData) {
    const prompt = `You are a content analysis assistant. Analyze this web page and describe its core topic in 1-2 sentences.

Page Title: ${(pageData.title || '').slice(0, 200)}
URL: ${(pageData.url || '').slice(0, 200)}
Meta Description: ${(pageData.description || '').slice(0, 300)}
Headings: ${(pageData.headings || []).slice(0, 8).join(' | ')}
Content Preview: ${(pageData.bodyText || '').slice(0, 1500)}

Respond with JSON:
{
  "topic": "concise 1-2 sentence description of the page's core topic",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`;

    const result = await callGemini(apiKey, prompt);
    if (result && result.topic) {
        return {
            topic: result.topic,
            keywords: result.keywords || [],
        };
    }
    return null;
}

/**
 * Use Gemini to check if a page is relevant to the anchor topic.
 * Returns a relevance judgment with reasoning.
 */
async function geminiCheckRelevance(apiKey, anchorSummary, pageData) {
    const prompt = `You are a focus assistant that helps users stay on-topic while browsing.

The user is currently focused on: "${anchorSummary.topic}"
Focus keywords: ${anchorSummary.keywords.join(', ')}

They just navigated to a new page:
Title: ${(pageData.title || '').slice(0, 200)}
URL: ${(pageData.url || '').slice(0, 200)}
Headings: ${(pageData.headings || []).slice(0, 6).join(' | ')}
Content Preview: ${(pageData.bodyText || '').slice(0, 1200)}

Determine if this new page is RELEVANT to their focus topic. Consider:
- Is the content topically related (same subject, supporting research, related concept)?
- Would a focused person reasonably visit this page as part of their study/work?
- Search engines, reference sites, and tools are generally relevant.
- Social media feeds, entertainment, shopping, gaming are generally NOT relevant unless the focus topic is specifically about those.

Respond with JSON:
{
  "relevant": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation of why this is or isn't relevant to their focus"
}`;

    const result = await callGemini(apiKey, prompt);
    if (result && typeof result.relevant === 'boolean') {
        return {
            relevant: result.relevant,
            confidence: result.confidence || 0.5,
            reason: result.reason || (result.relevant ? 'Content appears related.' : 'Content does not appear related.'),
        };
    }
    return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// TF-IDF LOCAL FALLBACK
// ═══════════════════════════════════════════════════════════════════════════════

function tokenize(text) {
    if (!text) return [];
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map(w => w.replace(/^-+|-+$/g, ''))
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

function extractKeywords(text, weight = 1.0) {
    const tokens = tokenize(text);
    const freq = new Map();
    for (const token of tokens) {
        freq.set(token, (freq.get(token) || 0) + weight);
    }
    return freq;
}

function mergeKeywordMaps(...maps) {
    const merged = new Map();
    for (const map of maps) {
        for (const [word, score] of map) {
            merged.set(word, (merged.get(word) || 0) + score);
        }
    }
    return merged;
}

function buildTopicProfile(pageData) {
    const titleKw = extractKeywords(pageData.title || '', 5.0);
    const descKw = extractKeywords(pageData.description || '', 3.0);
    const headingsKw = extractKeywords((pageData.headings || []).join(' '), 3.0);
    const bodyKw = extractKeywords(pageData.bodyText || '', 1.0);

    let urlPath = '';
    try {
        const u = new URL(pageData.url || '');
        urlPath = u.pathname.replace(/[\/\-_.]/g, ' ');
    } catch { }
    const urlKw = extractKeywords(urlPath, 2.0);

    const merged = mergeKeywordMaps(titleKw, descKw, headingsKw, bodyKw, urlKw);
    const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
    const maxScore = sorted.length > 0 ? sorted[0][1] : 1;

    const keywords = {};
    for (const [word, score] of sorted) {
        keywords[word] = score / maxScore;
    }

    return {
        keywords,
        topTerms: sorted.slice(0, 10).map(([word]) => word),
        totalTokens: merged.size,
    };
}

function cosineSimilarity(profileA, profileB) {
    const kwA = profileA.keywords || {};
    const kwB = profileB.keywords || {};
    const allKeys = new Set([...Object.keys(kwA), ...Object.keys(kwB)]);

    let dotProduct = 0, magA = 0, magB = 0;
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

const THRESHOLDS = {
    HIGH_RELEVANCE: 0.25,
    LOW_RELEVANCE: 0.10,
};

function analyzeRelevance(anchorProfile, pageData, mode) {
    const currentProfile = buildTopicProfile(pageData);
    const score = cosineSimilarity(anchorProfile, currentProfile);

    const sharedTerms = [];
    for (const term of currentProfile.topTerms) {
        if (anchorProfile.keywords[term]) sharedTerms.push(term);
    }

    if (score >= THRESHOLDS.HIGH_RELEVANCE) {
        const sharedStr = sharedTerms.length > 0
            ? ` (shared topics: ${sharedTerms.slice(0, 4).join(', ')})`
            : '';
        return { relevant: true, score, reason: `Content is related to your focus topic${sharedStr}.`, topTerms: currentProfile.topTerms };
    }

    if (score >= THRESHOLDS.LOW_RELEVANCE) {
        return { relevant: true, score, reason: 'Loosely related content — allowing.', topTerms: currentProfile.topTerms };
    }

    const anchorTopics = anchorProfile.topTerms.slice(0, 4).join(', ');
    const currentTopics = currentProfile.topTerms.slice(0, 4).join(', ');
    const reason = currentProfile.totalTokens < 5
        ? `This page doesn't seem related to your focus topic (${anchorTopics}).`
        : `This page is about "${currentTopics}" — not related to your focus on "${anchorTopics}".`;

    return { relevant: false, score, reason, topTerms: currentProfile.topTerms };
}

// ── Export ──────────────────────────────────────────────────────────────────────

if (typeof globalThis !== 'undefined') {
    globalThis.FocusAnalyzer = {
        // Gemini AI
        geminiSummarizeTopic,
        geminiCheckRelevance,
        // Local fallback
        tokenize,
        extractKeywords,
        buildTopicProfile,
        cosineSimilarity,
        analyzeRelevance,
        THRESHOLDS,
    };
}
