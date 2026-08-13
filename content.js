// X Country Filter — content script
// Watches the timeline DOM, extracts author handles, asks background for
// country, hides posts from blocked countries.

const HIDDEN_ATTR = "data-xcf-hidden";
const PROCESSED_ATTR = "data-xcf-processed";

let settings = { enabled: true, countries: ["IN"], hideFollowing: true };

// Find author screen name from a tweet article.
// The author link is the <a href="/handle"> inside the user-name block.
function getScreenName(article) {
  const nameLink = article.querySelector(
    'a[href^="/"][role="link"]:not([href*="/status/"])'
  );
  if (!nameLink) return null;
  const href = nameLink.getAttribute("href");
  if (!href || href === "/" || href.startsWith("/i/") || href.startsWith("/explore")) return null;
  return href.replace(/^\//, "").split("/")[0].replace(/[^A-Za-z0-9_]/g, "");
}

function hideArticle(article, code) {
  if (article.hasAttribute(HIDDEN_ATTR)) return;
  article.setAttribute(HIDDEN_ATTR, code || "XX");
  article.style.display = "none";
  chrome.runtime.sendMessage({ type: "hidden", n: 1 });
}

function unhideArticle(article) {
  if (!article.hasAttribute(HIDDEN_ATTR)) return;
  article.removeAttribute(HIDDEN_ATTR);
  article.style.display = "";
}

async function shouldHide(code) {
  const opts = await chrome.storage.sync.get(["enabled", "countries", "hideFollowing"]);
  if (opts.enabled === false) return false;
  const countries = opts.countries && opts.countries.length ? opts.countries : ["IN"];
  return countries.includes(code);
}

// Process a single article
async function processArticle(article) {
  if (article.hasAttribute(PROCESSED_ATTR)) return;
  const screen = getScreenName(article);
  if (!screen) return;

  article.setAttribute(PROCESSED_ATTR, "1");

  const resp = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "lookup", screen_name: screen }, (r) => resolve(r));
  });

  if (!resp) return;
  if (resp.cached || resp.code) {
    if (resp.code && (await shouldHide(resp.code))) {
      hideArticle(article, resp.code);
    }
  }
  // queued: background will fetch; the post stays visible until a future
  // scan re-checks it (we re-scan on interval + mutations).
}

// Re-check articles that were queued earlier (cache now populated)
async function rescanQueued() {
  const articles = document.querySelectorAll(`article[data-testid="tweet"][data-xcf-processed]`);
  for (const a of articles) {
    if (a.hasAttribute(HIDDEN_ATTR)) continue;
    const screen = getScreenName(a);
    if (!screen) continue;
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "lookup", screen_name: screen }, (r) => resolve(r));
    });
    if (resp && resp.code && (await shouldHide(resp.code))) {
      hideArticle(a, resp.code);
    }
  }
}

// ---- observers ----
function scan() {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  for (const a of articles) void processArticle(a);
}

const debouncedScan = debounce(scan, 800);

const observer = new MutationObserver(() => {
  debouncedScan();
});

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---- settings change: unhide if disabled ----
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.enabled && changes.enabled.newValue === false) {
    document.querySelectorAll(`article[data-xcf-hidden]`).forEach(unhideArticle);
  }
  if (changes.countries) {
    // countries changed: rescan everything (re-hide per new list)
    document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
      a.removeAttribute(PROCESSED_ATTR);
      if (a.hasAttribute(HIDDEN_ATTR)) unhideArticle(a);
    });
    scan();
  }
});

// ---- init ----
async function init() {
  const opts = await chrome.storage.sync.get(["enabled", "countries", "hideFollowing"]);
  settings = {
    enabled: opts.enabled !== false,
    countries: opts.countries && opts.countries.length ? opts.countries : ["IN"],
    hideFollowing: opts.hideFollowing !== false,
  };

  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  // periodic re-scan picks up queued lookups that completed
  setInterval(() => {
    if (settings.enabled) {
      scan();
      void rescanQueued();
    }
  }, 15000);
}

if (document.body) void init();
else document.addEventListener("DOMContentLoaded", () => void init());
