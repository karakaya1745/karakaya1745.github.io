# Stream Health — Onay Bekleyen Teklifler

Olusturulma: 2026-10-28T10:56:53.501Z
Toplam teklif: **56** (15 ekleme, 41 kaldirma)

| action | add_url | add_channel | remove_url |
| --- | ---: | ---: | ---: |
| adet | 14 | 1 | 41 |

> Bu dosya **yalnizca teklif** icerir. `channels.json` / `stream_map.json` otomatik degistirilmez.

## VLC test (yalnizca ekleme teklifleri)

- Dosya: [`tools/stream-health-bot/out/proposals_adds.m3u`](./proposals_adds.m3u)
- Raw: https://raw.githubusercontent.com/karakaya1745/karakaya1745.github.io/main/tools/stream-health-bot/out/proposals_adds.m3u

## Calisma ozeti

- `health`: OK
- `enrich`: OK
- `discover`: OK

## Eklenecek linkler / kanallar

| # | action | kanal | key | url | kaynak | neden |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | add_url | NOW | now | https://uycyyuuzyh.turknet.ercdn.net/nphindgytw/nowtv/nowtv_720p.m3u8 | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 2 | add_url | NOW | now | http://92.114.85.87:8015/play/a00a/index.m3u8 | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 3 | add_url | Life TV | lifetv | http://88.212.7.14/live/lifetv/index.m3u8 | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 4 | add_url | Kon TV | kontv | http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197191&extension=ts&play_token=PM2eb119cV | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 5 | add_url | Kon TV | kontv | http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197191&extension=ts&play_token=PM2eb119cV | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 6 | add_url | Kon TV | kontv | http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197191&extension=ts&play_token=PM2eb119cV | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 7 | add_url | Kon TV | kontv | http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=197191&extension=ts&play_token=PM2eb119cV | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 8 | add_url | Kon TV | kontv | http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=197191&extension=ts&play_token=PM2eb119cV | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 9 | add_url | Kon TV | kontv | http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CC:FD&stream=197191&extension=ts&play_token=PM2eb119cV | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 10 | add_url | ES TV | estv | https://a-cdn.klowdtv.com/live2/estv_720p/playlist.m3u8 | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 11 | add_url | TV 3 | tv3 | http://flussonic.linkintel.ru/tv-3/index.m3u8 | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 12 | add_url | TV 3 | tv3 | http://stream.mcquack.net/136/index.m3u8 | stream-health-bot | M3U/health dry-run: yeni canli URL |
| 13 | add_channel | Cartoon Network | cartoonnetwork | https://drk6xq0vhn.gpcdn.net/live/cn_sd_abr/index.m3u8 | discover-missing-channels | TKGS/eksik liste dry-run: yeni kanal |
| 14 | add_url | Cartoon Network | cartoonnetwork | https://vodzong.mjunoon.tv:8087/streamtest/cartoon-network-87/live/87H/chunks.m3u8 | discover-missing-channels | Yeni kanal icin ek URL (dry-run) |
| 15 | add_url | Cartoon Network | cartoonnetwork | http://212.5.144.156:8080/cartoon/index.m3u8 | discover-missing-channels | Yeni kanal icin ek URL (dry-run) |

## Kaldırılacak linkler

| # | action | kanal | key | url | kaynak | neden |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | remove_url | TYT Türk | tytturk | http://v2.iptvspor.de:8080/live/3yVozxPg/bMf6Qxwe/244eb57d-660d-4896-8abc-06e119f6f701.ts | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 2 | remove_url | CNN Turk | cnnturk | https://trn03.tulix.tv/gt-cnnturk-tv/index.m3u8?token=canlitvtr | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 3 | remove_url | Cem TV | cemtv | https://tv.cemtv.net:19360/cemtv/cemtv.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 4 | remove_url | TRT Spor | trtspor | https://tv-trtspor1.medya.trt.com.tr/master_720.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 5 | remove_url | TRT Spor | trtspor | https://tv-trtspor1.medya.trt.com.tr/master_1440.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 6 | remove_url | TRT Spor | trtspor | https://tv-trtspor1.medya.trt.com.tr/master.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 7 | remove_url | TRT Spor | trtspor | https://tv-trtspor1.medya.trt.com.tr/master_1080.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 8 | remove_url | TRT Spor | trtspor | https://tv-trtspor-esdai.medya.trt.com.tr/master_1080p.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 9 | remove_url | TRT Spor | trtspor | https://tv-trtspor1.medya.trt.com.tr/master_360.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 10 | remove_url | A Spor | aspor | https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/aspor/aspor_1080p.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 11 | remove_url | TRT Spor Yildiz | trtsporyildiz | https://tv-trtspor2.medya.trt.com.tr/master_720.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 12 | remove_url | TRT Spor Yildiz | trtsporyildiz | https://tv-trtspor2.medya.trt.com.tr/master_1440p.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 13 | remove_url | TRT Spor Yildiz | trtsporyildiz | https://tv-trtspor2.medya.trt.com.tr/master.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 14 | remove_url | TRT Spor Yildiz | trtsporyildiz | https://tv-trtspor2-esdai.medya.trt.com.tr/master.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 15 | remove_url | FB TV | fbtv | https://fbtv.fenerbahce.org/fenerbahcetv.stream/chunklist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 16 | remove_url | FB TV | fbtv | https://fbtv.fenerbahce.org/fenerbahcetv.stream_720p/playlist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 17 | remove_url | FB TV | fbtv | https://fbtv.fenerbahce.org/fenerbahcetv.stream/playlist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 18 | remove_url | FB TV | fbtv | https://fbtv.fenerbahce.org/fenerbahcetv.stream_720p/chunklist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 19 | remove_url | FB TV | fbtv | https://fbtv.fenerbahce.org/fenerbahcetv.stream_1080p/chunklist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 20 | remove_url | Yaban TV | yabantv | http://v2.iptvspor.de:8080/live/3yVozxPg/bMf6Qxwe/e112125c-9be4-4b93-8e60-5850d865bff1.ts | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 21 | remove_url | Yaban TV | yabantv | https://yayin1.canlitv.fun/canlitv/yabantv.stream/playlist.m3u8?hash=a6c3ccc58b9f43520fe87f8517cc3667 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 22 | remove_url | GONCA TV | goncatv | https://edge1.socialsmart.tv/goncatv/bant1/playlist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 23 | remove_url | GONCA TV | goncatv | http://v2.iptvspor.de:8080/live/3yVozxPg/bMf6Qxwe/1413062b-8a59-4602-8a8c-8c40c3e2c428.ts | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 24 | remove_url | Urfanatik TV | urfanatiktv | https://edge1.socialsmart.tv/urfanatiktv/bant1/chunks.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 25 | remove_url | Bir TV | birtv | https://edge1.socialsmart.tv/birtv/bant1/playlist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 26 | remove_url | Bir TV | birtv | https://edge1.socialsmart.tv/birtv/bant1/chunks.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 27 | remove_url | Bir TV | birtv | https://edge.socialsmart.tv/birtv/bant1/chunks.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 28 | remove_url | Edessa TV | edessatv | http://v2.iptvspor.de:8080/live/3yVozxPg/bMf6Qxwe/579db75f-f409-43d8-af30-fd1f1b3ac5df.ts | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 29 | remove_url | A Para | apara | https://trkvz-live.ercdn.net/aparahd/aparahd.m3u8?st=tl3ck93nNUp_DG40IDeH8A&e=1792442116 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 30 | remove_url | Fortuna TV | fortunatv | https://edge1.socialsmart.tv/ftvturk/bant1/playlist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 31 | remove_url | Kocaeli TV | kocaelitv | https://edge1.socialsmart.tv/kocaelitv/bant1/chunks.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 32 | remove_url | Kocaeli TV | kocaelitv | https://edge1.socialsmart.tv/kocaelitv/bant1/playlist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 33 | remove_url | Kıbrıs TV | kibristv | https://edge1.socialsmart.tv/kibristv/bant1/playlist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 34 | remove_url | Kıbrıs TV | kibristv | https://edge.socialsmart.tv/kibristv/bant1/playlist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 35 | remove_url | Kıbrıs TV | kibristv | https://edge.socialsmart.tv/kibristv/bant1/chunks.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 36 | remove_url | Kıbrıs TV | kibristv | https://edge1.socialsmart.tv/kibristv/bant1/chunks.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 37 | remove_url | Kıbrıs Genç TV | kibrisgenctv | https://yayin1.canlitv.fun/canlitv/genctv.stream/playlist.m3u8?hash=a6c3ccc58b9f43520fe87f8517cc3667 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 38 | remove_url | Kıbrıs Genç TV | kibrisgenctv | https://edge1.socialsmart.tv/kibrisgenctv/bant1/playlist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 39 | remove_url | Kıbrıs Genç TV | kibrisgenctv | https://edge.socialsmart.tv/kibrisgenctv/bant1/playlist.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 40 | remove_url | Kıbrıs Genç TV | kibrisgenctv | https://edge.socialsmart.tv/kibrisgenctv/bant1/chunks.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |
| 41 | remove_url | Kıbrıs Genç TV | kibrisgenctv | https://edge1.socialsmart.tv/kibrisgenctv/bant1/chunks.m3u8 | stream-health-bot | 2-strike olu link (fail streak >= 2), dry-run |

