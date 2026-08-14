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
// Primary: authenticated GraphQL UserByScreenName — carries the real
// "Account based in" country (forced by X, not user-editable) when X has
// derived one, plus the free-text legacy.location.
// The ct0 cookie is the CSRF token the web app sends with API calls.
async function getCt0() {
  const cookie = await chrome.cookies.get({ url: "https://x.com", name: "ct0" });
  return cookie ? cookie.value : null;
}

async function fetchProfileApi(screenName) {
  const ct0 = await getCt0();
  if (!ct0) throw new Error("no ct0 cookie — not logged in to x.com?");
  const url = `https://x.com/i/api/graphql/IV5EXjVpHWFh0S4wFQa7vQ/UserByScreenName?variables=${encodeURIComponent(
    JSON.stringify({
      screen_name: screenName,
      withSafetyModeUserFields: true,
    })
  )}`;
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "x-csrf-token": ct0,
      "x-twitter-auth-type": "OAuth2",
      "x-twitter-active-user": "yes",
      "content-type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`API HTTP ${res.status} for ${screenName}`);
  const json = await res.json();
  return json;
}

// Extract what we need from the GraphQL user result.
function parseUserResult(result) {
  const found = {};
  const legacy = result && (result.legacy || (result.user && result.user.legacy));
  if (legacy) {
    if (legacy.location) found.location = legacy.location;
    if (legacy.followers_count !== undefined) found.followers_count = legacy.followers_count;
  }
  // "Account based in" — X-derived, appears on profiles as country; exact
  // field name varies by client. Probe multiple known shapes (top-level
  // and inside legacy).
  for (const key of ["country_code", "based_in", "country", "account_based_in"]) {
    const v = result ? result[key] : undefined;
    if (v !== undefined && v !== null) {
      found[key] = v;
    }
    const lv = legacy ? legacy[key] : undefined;
    if (lv !== undefined && lv !== null) {
      found[key] = lv;
    }
  }
  found.probed_keys = result ? Object.keys(result).join(",") : "";
  return found;
}

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
async function lookup(screenName, forceFresh) {
  const now = Date.now();
  // cache hit?
  const cached = cache[screenName.toLowerCase()];
  if (!forceFresh && cached && now - cached.ts < CACHE_TTL_MS) {
    return { screen: screenName, code: cached.code, method: cached.method, cached: true };
  }

  let found = {};
  let via = "api";
  try {
    // Primary: authenticated GraphQL API (has the real country data)
    const api = await fetchProfileApi(screenName);
    const result = api && api.data && api.data.user && api.data.user.result;
    found = parseUserResult(result);
  } catch (e) {
    // Fallback: profile page HTML embedded JSON
    via = "html";
    try {
      const html = await fetchProfilePage(screenName);
      found = extractFromHtml(html, screenName);
    } catch (e2) {
      logDebug({ screen: screenName, code: null, method: "error", raw: `${e}; ${e2}`, ts: now });
      await persist();
      return { screen: screenName, code: null, method: "error", error: String(e2) };
    }
  }

  const detected = detectCountry(found);

  const result = {
    screen: screenName,
    code: detected ? detected.code : null,
    method: detected ? `${via}:${detected.method}` : `${via}:none`,
    raw: (found.raw_text || found.location || "").slice(0, 120),
    probed_keys: (found.probed_keys || "").slice(0, 200),
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

  if (msg.type === "test_lookup") {
    const key = (msg.screen_name || "").toLowerCase().trim();
    if (!key) { sendResponse({ error: "empty screen name" }); return; }
    void (async () => {
      const result = await lookup(key, true); // force fresh
      sendResponse(result);
    })();
    return true; // async
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
