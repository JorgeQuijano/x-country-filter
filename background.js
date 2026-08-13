// X Country Filter — background service worker
// Fetches public profile pages (with the user's own session), extracts
// country hints, caches results. All local. No external servers.

importScripts("countries.js");

const CACHE_KEY = "xcf_cache_v1";
const DEBUG_KEY = "xcf_debug_v1";
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days
const QUEUE_GAP_MS = 1200; // be gentle: ~1 fetch / 1.2s
const MAX_QUEUE = 200;

let cache = {};       // screen_name -> { code, method, ts }
let debugLog = [];    // [{ screen, code, method, raw, ts }]
let queue = [];
let running = false;
let hiddenCount = 0;

// ---------- storage ----------
async function loadState() {
  const got = await chrome.storage.local.get([CACHE_KEY, DEBUG_KEY]);
  if (got[CACHE_KEY]) cache = got[CACHE_KEY];
  if (got[DEBUG_KEY]) debugLog = got[DEBUG_KEY];
  const opts = await chrome.storage.sync.get(["enabled", "countries"]);
  return opts;
}

async function persist() {
  await chrome.storage.local.set({ [CACHE_KEY]: cache, [DEBUG_KEY]: debugLog.slice(-200) });
}

function pruneCache() {
  const now = Date.now();
  for (const k of Object.keys(cache)) {
    if (now - cache[k].ts > CACHE_TTL_MS) delete cache[k];
  }
}

function logDebug(entry) {
  debugLog.push(entry);
  if (debugLog.length > 200) debugLog = debugLog.slice(-200);
}

// ---------- fetching ----------
async function fetchProfilePage(screenName) {
  const url = `https://x.com/${encodeURIComponent(screenName)}`;
  const res = await fetch(url, {
    credentials: "include",
    headers: { "accept": "text/html,application/xhtml+xml" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${screenName}`);
  const html = await res.text();
  return html;
}

// Extract embedded JSON state from the profile page.
// X embeds user data in <script> tags; we search for the user object keys.
function extractFromHtml(html, screenName) {
  const found = {};

  // Try to find the embedded initial state (window.__INITIAL_STATE__ or __data)
  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  const dataMatch = html.match(/window\.__data\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  let jsonText = null;
  if (stateMatch) jsonText = stateMatch[1];
  else if (dataMatch) jsonText = dataMatch[1];

  // Fallback: the whole HTML contains user JSON keys even without parsing the state
  const searchText = jsonText || html;

  const fromJson = extractFromJsonText(searchText);
  Object.assign(found, fromJson);

  // If we got nothing structured, scan raw HTML for profile bio/location meta
  if (!found.location) {
    const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/);
    if (ogDesc) found.og_description = ogDesc[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  }

  // screen_name case-insensitive sanity: keep raw location string for debug
  found.raw_text = found.location || found.based_in || found.country || found.og_description || "";
  return found;
}

// ---------- detection pipeline ----------
async function lookup(screenName) {
  const now = Date.now();
  // cache hit?
  const cached = cache[screenName.toLowerCase()];
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return { screen: screenName, code: cached.code, method: cached.method, cached: true };
  }

  let html;
  try {
    html = await fetchProfilePage(screenName);
  } catch (e) {
    logDebug({ screen: screenName, code: null, method: "error", raw: String(e), ts: now });
    await persist();
    return { screen: screenName, code: null, method: "error", error: String(e) };
  }

  const found = extractFromHtml(html, screenName);
  const detected = detectCountry(found);

  const result = {
    screen: screenName,
    code: detected ? detected.code : null,
    method: detected ? detected.method : "none",
    raw: (found.raw_text || "").slice(0, 120),
    ts: now,
  };

  cache[screenName.toLowerCase()] = { code: result.code, method: result.method, ts: now };
  logDebug(result);
  await persist();
  return result;
}

// ---------- queue (rate limiting) ----------
function enqueue(screenName) {
  const key = screenName.toLowerCase();
  if (queue.some((q) => q === key)) return; // already queued
  if (queue.length >= MAX_QUEUE) return;
  queue.push(key);
  if (!running) void runQueue();
}

async function runQueue() {
  running = true;
  while (queue.length > 0) {
    const key = queue.shift();
    try {
      await lookup(key);
    } catch (e) {
      // noop — lookup already handles errors internally
    }
    await new Promise((r) => setTimeout(r, QUEUE_GAP_MS));
  }
  running = false;
}

// ---------- messaging ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "lookup") {
    const key = msg.screen_name.toLowerCase();
    const cached = cache[key];
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      sendResponse({ screen: msg.screen_name, code: cached.code, method: cached.method, cached: true });
      return;
    }
    enqueue(msg.screen_name);
    sendResponse({ screen: msg.screen_name, queued: true });
    return;
  }

  if (msg.type === "hidden") {
    hiddenCount += msg.n || 1;
    const text = hiddenCount > 0 ? String(hiddenCount) : "";
    void chrome.action.setBadgeText({ text });
    void chrome.action.setBadgeBackgroundColor({ color: "#1d9bf0" });
    return;
  }

  if (msg.type === "get_debug") {
    void loadState().then(() => {
      sendResponse({ cache, debug: debugLog.slice(-200) });
    });
    return true; // async
  }

  if (msg.type === "clear_cache") {
    cache = {};
    debugLog = [];
    void persist().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "stats") {
    sendResponse({ cacheSize: Object.keys(cache).length, hidden: hiddenCount });
    return;
  }
});

// ---------- init ----------
void loadState().then(() => {
  pruneCache();
  void persist();
});
