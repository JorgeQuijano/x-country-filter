// X Country Filter — options page logic
const $ = (id) => document.getElementById(id);

async function load() {
  const opts = await chrome.storage.sync.get(["enabled", "countries", "regions", "hideFollowing"]);
  $("enabled").checked = opts.enabled !== false;
  $("hideFollowing").checked = opts.hideFollowing !== false;
  renderChips(opts.countries && opts.countries.length ? opts.countries : ["IN"], opts.regions || []);
}

function renderChips(countries, regions) {
  const wrap = $("chips");
  wrap.innerHTML = "";
  const all = [];
  for (const c of countries) all.push({ code: c, kind: "country" });
  for (const r of regions) all.push({ code: r, kind: "region" });
  for (const item of all) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.title = item.kind === "region" ? "region" : "country";
    chip.textContent = item.code;
    const rm = document.createElement("button");
    rm.textContent = "x";
    rm.title = `remove ${item.code}`;
    rm.addEventListener("click", async () => {
      const cur = (await chrome.storage.sync.get(["countries", "regions"]));
      const countries = (cur.countries || ["IN"]).filter((x) => x !== item.code);
      const regions = (cur.regions || []).filter((x) => x !== item.code);
      await chrome.storage.sync.set({ countries, regions });
      renderChips(countries.length ? countries : ["IN"], regions);
      setStatus("removed " + item.code);
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
  const cur = (await chrome.storage.sync.get(["countries", "regions"]));
  const countries = cur.countries || ["IN"];
  if (!countries.includes(code)) {
    countries.push(code);
    await chrome.storage.sync.set({ countries });
  }
  $("newCountry").value = "";
  renderChips(countries, cur.regions || []);
  setStatus("added " + code);
});

$("addRegionBtn").addEventListener("click", async () => {
  const region = $("regionSelect").value;
  if (!region) { setStatus("pick a region from the dropdown"); return; }
  const cur = (await chrome.storage.sync.get(["countries", "regions"]));
  const regions = cur.regions || [];
  if (!regions.includes(region)) {
    regions.push(region);
    await chrome.storage.sync.set({ regions });
  }
  $("regionSelect").value = "";
  renderChips(cur.countries && cur.countries.length ? cur.countries : ["IN"], regions);
  setStatus("added region " + region);
});

$("clearCache").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clear_cache" });
  setStatus("cache cleared");
});

$("testBtn").addEventListener("click", async () => {
  const handle = $("testHandle").value.trim();
  if (!handle) { setStatus("enter a handle"); return; }
  const el = $("testResult");
  el.textContent = "checking @" + handle + "...";
  const resp = await chrome.runtime.sendMessage({ type: "test_lookup", screen_name: handle });
  if (!resp) { el.textContent = "no response (background worker may need a reload)"; return; }
  if (resp.error) { el.textContent = "error: " + resp.error; return; }
  const lines = [
    "@" + handle,
    "country: " + (resp.code || "(none detected)"),
    "method:  " + (resp.method || "?") + (resp.cached ? " (cached)" : ""),
  ];
  if (resp.raw) lines.push("raw:     " + resp.raw);
  if (resp.probed_keys) lines.push("keys:    " + resp.probed_keys);
  el.textContent = lines.join("\n");
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
