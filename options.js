// X Country Filter — options page logic
const $ = (id) => document.getElementById(id);

async function load() {
  const opts = await chrome.storage.sync.get(["enabled", "countries", "hideFollowing"]);
  $("enabled").checked = opts.enabled !== false;
  $("hideFollowing").checked = opts.hideFollowing !== false;
  renderChips(opts.countries && opts.countries.length ? opts.countries : ["IN"]);
}

function renderChips(countries) {
  const wrap = $("chips");
  wrap.innerHTML = "";
  for (const c of countries) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = c;
    const rm = document.createElement("button");
    rm.textContent = "x";
    rm.title = `remove ${c}`;
    rm.addEventListener("click", async () => {
      const cur = (await chrome.storage.sync.get("countries")).countries || ["IN"];
      const next = cur.filter((x) => x !== c);
      await chrome.storage.sync.set({ countries: next });
      renderChips(next);
      setStatus("removed " + c);
    });
    chip.appendChild(rm);
    wrap.appendChild(chip);
  }
}

function setStatus(msg) {
  $("status").textContent = msg;
  setTimeout(() => { $("status").textContent = ""; }, 2500);
}

$("enabled").addEventListener("change", async (e) => {
  await chrome.storage.sync.set({ enabled: e.target.checked });
  setStatus(e.target.checked ? "filtering on" : "filtering off");
});

$("hideFollowing").addEventListener("change", async (e) => {
  await chrome.storage.sync.set({ hideFollowing: e.target.checked });
  setStatus("saved");
});

$("addBtn").addEventListener("click", async () => {
  const code = $("newCountry").value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) { setStatus("enter a 2-letter ISO code, e.g. IN"); return; }
  const cur = (await chrome.storage.sync.get("countries")).countries || ["IN"];
  if (!cur.includes(code)) {
    cur.push(code);
    await chrome.storage.sync.set({ countries: cur });
  }
  $("newCountry").value = "";
  renderChips(cur);
  setStatus("added " + code);
});

$("clearCache").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clear_cache" });
  setStatus("cache cleared");
});

$("exportDebug").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "get_debug" }, (resp) => {
    if (!resp) { setStatus("no debug data yet — browse your timeline first"); return; }
    const out = {
      cache: resp.cache,
      debug: resp.debug,
    };
    $("debugOut").value = JSON.stringify(out, null, 2);
    $("debugSection").style.display = "block";
    $("debugOut").select();
  });
});

void load();
