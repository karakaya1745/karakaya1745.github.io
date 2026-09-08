# Stream Health — Onay Bekleyen Teklifler

Olusturulma: 2026-09-08T13:32:43.178Z
Toplam teklif: **8**

| action | add_url | add_channel | remove_url |
| --- | ---: | ---: | ---: |
| adet | 7 | 1 | 0 |

> Bu dosya **yalnizca teklif** icerir. `channels.json` / `stream_map.json` otomatik degistirilmez.

## Calisma ozeti

- `aggregate-only`: OK

## Teklifler

| # | action | kanal | key | url | kaynak | neden |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | add_url | Life TV | lifetv | https://lifetv.mpks.sk/s.m3u8 | enrich-stream-map | M3U enrich dry-run: alternatif URL |
| 2 | add_url | MC TV | mctv | https://rrr.sz.xlcdn.com/?account=mceutv&file=mc2&output=playlist.m3u8&protocol=https&service=wowza&type=live | enrich-stream-map | M3U enrich dry-run: alternatif URL |
| 3 | add_url | Türkmeneli TV | turkmenelitv | https://135962.global.ssl.fastly.net/5ff366a512987e2c0a3dabfe/live_14378e1002eb11ef9cb025207067897a/index.fmp4.m3u8 | enrich-stream-map | M3U enrich dry-run: alternatif URL |
| 4 | add_url | DREAM TV | dreamtv | https://xykt-fix.github.io/play/a02j/index.m3u8 | enrich-stream-map | M3U enrich dry-run: alternatif URL |
| 5 | add_url | DREAM TV | dreamtv | https://streamfi-dreamtv1.zettawiseroutes.com:8181/hls/stream.m3u8 | enrich-stream-map | M3U enrich dry-run: alternatif URL |
| 6 | add_url | spacetoon | spacetoon | https://shd-gcp-live.edgenextcdn.net/live/bitmovin-spacetoon/d8382fb9ab4b2307058f12c7ea90db54/index.m3u8 | enrich-stream-map | M3U enrich dry-run: alternatif URL |
| 7 | add_channel | Space Toon | spacetoon | https://shls-spacetoon-prod-dub.shahid.net/out/v1/6240b773a3f34cca95d119f9e76aec02/index.m3u8 | discover-missing-channels | TKGS/eksik liste dry-run: yeni kanal |
| 8 | add_url | Space Toon | spacetoon | https://spacetoon-prod-dub-ak.akamaized.net/out/v1/6240b773a3f34cca95d119f9e76aec02/index.m3u8 | discover-missing-channels | Yeni kanal icin ek URL (dry-run) |

