# Stream Health Bot — Import Policy / İçe Aktarma Politikası

> **Agents:** Read this file before ANY change to `channels.json`, `stream_map.json`, or import scripts.  
> **Do not ask the user to repeat these criteria.**

---

## NEVER ADD / ASLA EKLEME

### TKGS rule (primary)
- **Do not add encrypted/premium channels that are NOT on the TKGS şifresiz (free-to-air) list.**
- TKGS reference: `tools/tkgs_eklenecek_kanallar.json`, `tools/stream-health-bot/missing_channels.json`
- TKGS dışı şifreli/premium: beIN, S Sport, DIZISMART, MOVIESMART, NBA TV, WWE, Discovery (pay), Viasat, FIGHTBOX, FILMBOX, GLFE*, premium sinema paketleri

### Blocked channel names (always skip)
- S Sport, Tagess*, Dizi TV, Cinex, Film Screen, SDM Sinema, Süper TV, NDR TV, Syria TV
- Plus premium patterns enforced in `lib.mjs` → `isBlockedChannelName()` / `isPremiumEncryptedChannelName()`

### Foreign pay-TV
- Clearly foreign non-Turkish pay-TV (NBA TV, Viasat, Animaux, CHASSE & PECHE, FASHION TV, etc.) unless **explicitly user-approved**

### Fake / bad streams
- `helga.iptv2022.com` and similar fake panel hosts → `isFakeHelgaStream()`

### IPTV music packs (not real FTA channels)
- Generic genre slots: 90'LAR, AKUSTIK, JAZZ, LOUNGE, etc.
- Artist-number packs: TARKAN 2, IBRAHIM TATLISES 3, ORHAN GENCEBAY 2, etc.

---

## ALWAYS / HER ZAMAN

- **Probe before add** — HLS, TS, panel, MP4, proxy-HLS (`probeChannelPlayback`)
- **Panel URLs OK** when user verifies (MAG/Stalker `live.php` + mac/stream)
- **Append new channels to category END** — use `insertChannelInCategoryOrder()`; do NOT reorder full list
- **NEVER auto-sort `channels.json`** by `category_order` without explicit user request
- **Max 30 URLs per channel** (`MAX_URLS_PER_CHANNEL`)
- New channels: user approval **OR** bot discovers from **TKGS şifresiz missing list only**
- On user-approved add: URL → `stream_map.json` + source site → `m3u_sources.json`

---

## CHANNEL NAMING

- **tvB ≠ TV8** — separate id: `tvb` (migration from tv8 if URL is radyotelekom hybrid)

---

## Code gate (single entry point)

All import/discover/enrich scripts MUST use:

```js
import { shouldSkipImportEntry } from "./lib.mjs";

const skip = shouldSkipImportEntry({ name, url, groupTitle, title, mode: "import" });
if (skip) continue; // skip.reason explains why
```

Modes: `"import"` | `"discover"` | `"enrich"`

---

## Sync targets (on catalog write)

1. `app/src/main/assets/channels.json` + `stream_map.json`
2. `GÜNCELLEME/channels.json` + `stream_map.json`
3. `../karakaya1745.github.io/channels.json` + `stream_map.json`

Increment `stream_map.json` → `_revision` on every catalog change.

---

## GitHub Actions schedule — SUSPENDED

> **Bots are SUSPENDED by user request.** Cron/`schedule:` triggers are commented out in
> `karakaya1745.github.io/.github/workflows/` (stream-health, discover-missing, enrich-stream-map, import-legal-channels).
> Manual run still available: Actions → workflow → **Run workflow**.

Former schedule (disabled): every 3 days UTC staggered — stream-health 02:00, discover 03:00, enrich 04:00, import-legal 05:00.
