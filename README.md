# X Country Filter

Hide posts on X's For You timeline from accounts based in selected countries (e.g. India).
Runs 100% locally in your browser — no credentials, no servers, no data leaves your machine.

## Install — one command (Brave / Chrome on Linux, macOS, WSL)

```bash
bash <(curl -sL https://cdn.jsdelivr.net/gh/JorgeQuijano/x-country-filter@main/install.sh)
```

Then in the browser:
1. open `brave://extensions` (or `chrome://extensions`)
2. toggle **developer mode** (top right)
3. click **load unpacked** → select `~/x-country-filter` (macOS) or `~/.local/share/x-country-filter` (Linux)

Done. Pin the icon to open options (add country codes, export debug data).

Already have the folder? Just do the 3 browser steps with it directly.

## How it works

- Content script watches the timeline DOM for tweet articles
- For each author handle, the background worker fetches the author's public
  profile page (same request your browser makes — uses your existing login
  session, nothing else)
- Extracts country hints from the profile's embedded JSON:
  `country_code`, `based_in`, `country`, `location`
- Falls back to a large location-string dictionary (Indian cities/states,
  then ~350 cities worldwide)
- Country on your blocklist → post hidden
- Results cached 7 days; fetches rate-limited (~1 per 1.2s)

## Why it's safe (no ban risk)

- No password, email, or cookies are ever read, stored, or sent anywhere
- The extension only *reads* profile pages and *hides* DOM elements — it
  never posts, likes, follows, or writes anything to X
- Rate-limited and cached fetches look like normal browsing
- Nothing phones home: zero remote endpoints in the code

## Configure

Extension icon → options (or right-click → Options):
- Enable/disable filtering
- Hide even accounts you follow (default: on)
- Add/remove ISO country codes (default: `IN`)
- Clear cache
- **Export debug data** — JSON dump of detected screen names → country.
  Paste that to Tay to tune detection.

## Known limits

- Accounts with no location/country info are undetectable — post stays visible
- Detection is heuristic on location strings; fake locations ("world") can't be caught
- If X changes its page structure, detection may break — export debug data to fix

## Files

- `manifest.json` — MV3 manifest
- `background.js` — profile fetching, detection, cache, rate limit
- `content.js` — timeline DOM watcher + hiding
- `countries.js` — country name / city / India hints dictionary
- `options.html` + `options.js` — settings page + debug export
- `install.sh` — one-command installer

## License

MIT
