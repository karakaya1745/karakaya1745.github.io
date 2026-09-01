# Probe Başarısız — Manuel Test Listesi

> Otomatik derleme: 2026-09-01T20:45:43.855Z
> Kaynaklar: `tkgs_missing_status`, `missing_channels_probe_report`, `iptv_org_candidates`, `import_legal_report`, `discover_report`

Her satır: `URL | probe nedeni`. VLC veya tarayıcıda test edebilirsiniz.

---

## 1. TKGS Eksik Kanallar (22 kanal)

_Öncelikli liste — TKGS listesinde olup katalogda eksik kanallar._

### TV8 International
_❌ çalışmıyor_
- http://162.212.179.33/dvrfl05/gin-tv8int/index.m3u8 | timeout
- http://nimplus3.bozztv.com/tv8int/tv8int/playlist.m3u8 | timeout
### GRT
_❌ çalışmıyor_
- http://yerelmedya.tv:1935/grt/_definst_/bant1/chunklist.m3u8 | timeout
### Kon TV
_❌ çalışmıyor_
- https://59cba4d34b678.streamlock.net/live/kontv/chunklist.m3u8 | network-error
### Tek Rumeli TV
_❌ çalışmıyor_
- https://edge1.socialsmart.tv/tekrumelitv/bant1/playlist.m3u8 | http-404 (404)
### HRT Akdeniz TV
_❓ M3U'da yok_
- https://vavo.sayezec.workers.dev/ID=4223430509a4cfa811948c | M3U adayı yok — TKGS referans URL (probe yapılmadı)
### FM TV
_❓ M3U'da yok_
- http://v2.iptvspor.de:8080/live/3yVozxPg/bMf6Qxwe/5fd4b2d6-0201-4036-9c3b-8682271444f5.ts | M3U adayı yok — TKGS referans URL (probe yapılmadı)
### Kadirga TV
_❓ M3U'da yok_
- https://vavo.sayezec.workers.dev/ID=2093940826f764b66f64f5 | M3U adayı yok — TKGS referans URL (probe yapılmadı)
### TV 2020
_❌ çalışmıyor_
- https://sc-kuzeykibrissmarttv.ercdn.net/tv2020/bantp1/playlist.m3u8 | timeout
- http://kuzeykibris.tv/m3u8/tv_dialog.m3u8 | http-404 (404)
- https://spor.kuzeykibris.tv/m3u8/tv_2020.m3u8 | timeout
### Gonca TV
_❌ çalışmıyor_
- http://stream.taksimbilisim.com:1935/tuncerciftci/smil:tuncerciftci.smil/iptvdelisi.m3u8 | timeout
### Rumeli TV
_❌ çalışmıyor_
- https://rumelitv-live.ercdn.net/rumelitv/rumelitv.m3u8 | timeout
- http://yayin3.canlitv.com:1935/live/rumelitv/iptvdelisi.m3u8 | timeout
### Yeni Kocaeli TV
_❓ M3U'da yok_
- https://vavo.sayezec.workers.dev/ID=758663570c267cae815eb | M3U adayı yok — TKGS referans URL (probe yapılmadı)
### Kanal 68
_❌ çalışmıyor_
- https://waw2.artiyerelmedya.net/kanal68/bant1/playlist.m3u8 | timeout
- https://live.artidijitalmedya.com/artidijital_kanal68/kanal68/playlist.m3u8 | http-404 (404)
### Vizyon 58
_❓ M3U'da yok_
- https://waw2.artiyerelmedya.net/vizyon58/bant1/playlist.m3u8 | M3U adayı yok — TKGS referans URL (probe yapılmadı)
### Ege TV
_❌ çalışmıyor_
- https://waw1.artiyerelmedya.net/egetv/bant1/playlist.m3u8 | timeout
### Deha TV
_❌ çalışmıyor_
- http://waw1.artiyerelmedya.net:1935/dehatv/bant1/playlist.m3u8 | timeout
### Anadolu Dernek TV
_❌ çalışmıyor_
- http://ch.canlitvlive.io/anadolu-dernek-tv/live.m3u8 | timeout
### Bitlis TV
_❌ çalışmıyor_
- https://waw1.artiyerelmedya.net/bitlistv/bant1/playlist.m3u8 | network-error
### Pamukkale TV
_❌ çalışmıyor_
- http://ch.canlitvlive.io/pamukkale-tv/live.m3u8 | timeout
- http://stream.tvcdn.net/yerel/pamukkale-tv.m3u8 | timeout
### Süper TV
_❌ çalışmıyor_
- https://5be5d840359c6.streamlock.net/supertv/supertv/chunklist.m3u8 | network-error
### DRT Denizli
_❌ çalışmıyor_
- http://stream2.taksimbilisim.com:1935/drt/smil:drt.smil/iptvdelisi.m3u8 | timeout
- https://edge1.socialsmart.tv/drttv/bant1/playlist.m3u8 | http-404 (404)
- http://stream2.taksimbilisim.com:1935/drt/smil:drt.smil/playlist.m3u8 | timeout
### Inter AZ
_❓ M3U'da yok_
- http://yayin.netradyom.com:1935/live/interaz/playlist.m3u8 | M3U adayı yok — TKGS referans URL (probe yapılmadı)
### BRT 3
_❌ çalışmıyor_
- http://wms.brtk.net:1935/live/brt2/playlist.m3u8 | timeout

---

## 2. Eksik Kanallar — Yerel Probe (27 kanal)

_missing_channels.json listesindeki kanalların M3U probe sonuçları._

### TV8 International
_durum: urls_but_none_work_
- http://162.212.179.33/dvrfl05/gin-tv8int/index.m3u8 | timeout
- http://nimplus3.bozztv.com/tv8int/tv8int/playlist.m3u8 | network-error
### Cartoon Network
_durum: urls_but_none_work_
- https://tv.arectv31.sbs/live/cartoonnetwork.m3u8 | timeout
- https://tv.arectv34.sbs/live/cartoonnetwork.m3u8 | timeout
- https://cartoonnetwork.blutv.com/blutv_cartoonnetwork/live.m3u8 | http-421 (421)
### GRT
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Kon TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Ekin Türk
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Agro TV
_durum: urls_but_none_work_
- https://yayin30.haber100.com/live/agrotv/playlist.m3u8 | http-404 (404)
- https://agrotv.blutv.com/blutv_agrotv/live.m3u8 | http-421 (421)
### Tek Rumeli TV
_durum: urls_but_none_work_
- https://edge1.socialsmart.tv/tekrumelitv/bant1/playlist.m3u8 | http-404 (404)
### HRT Akdeniz TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### FM TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Kadirga TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### TV 2020
_durum: urls_but_none_work_
- https://sc-kuzeykibrissmarttv.ercdn.net/tv2020/bantp1/playlist.m3u8 | timeout
- https://spor.kuzeykibris.tv/m3u8/tv_2020.m3u8 | timeout
### Kanal B
_durum: urls_but_none_work_
- https://baskentaudiovideo.xyz/LiveApp/streams/mUE22idl26lA1683879097431.m3u8 | not-hls-manifest (206)
- https://baskentaudiovideo.xyz/ULUSALApp/streams/mUE22idl26lA1683879097431.m3u8 | not-hls-manifest (206)
### Gonca TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Rumeli TV
_durum: urls_but_none_work_
- https://rumelitv-live.ercdn.net/rumelitv/rumelitv.m3u8 | timeout
### Yeni Kocaeli TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Uçankuş TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Kanal 68
_durum: urls_but_none_work_
- https://live.artidijitalmedya.com/artidijital_kanal68/kanal68/playlist.m3u8 | http-404 (404)
### Vizyon 58
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Ege TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Deha TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Tatlıses TV
_durum: urls_but_none_work_
- https://live.artidijitalmedya.com/artidijital_tatlisestv/tatlisestv/chunks.m3u8 | http-404 (404)
### Anadolu Dernek TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Bitlis TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### Pamukkale TV
_durum: urls_but_none_work_
- http://stream.tvcdn.net/yerel/pamukkale-tv.m3u8 | timeout
### Süper TV
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_
### DRT Denizli
_durum: urls_but_none_work_
- https://edge1.socialsmart.tv/drttv/bant1/playlist.m3u8 | http-404 (404)
- http://stream2.taksimbilisim.com:1935/drt/smil:drt.smil/playlist.m3u8 | timeout
### Inter AZ
_M3U eşleşmesi yok (no_m3u_match)_
- _(probe edilen URL yok)_

---

## 3. IPTV-ORG — Probe Başarısız (19 kanal)

_iptv-org adaylarından probe geçmeyenler (failedNotable)._

### Bursa TV
_kategori: Ulusal_
- https://win1.yayin.com.tr/bursatv/bursatv/playlist.m3u8 | http-404 (404)
### Cekmeköy TV
_kategori: Ulusal_
- https://cdn-cekmekoybeltv.yayin.com.tr/cekmekoybeltv/cekmekoybeltv_1080p/playlist.m3u8 | network-error
### Qaf TV
_kategori: Ulusal_
- https://customer-9vqui33qma2rownb.cloudflarestream.com/7792e558fe54e23bdd4b462ec275cdba/manifest/video.m3u8 | not-stream (204)
### BBC Earth Turkiye
_kategori: Belgesel_
- https://nord.ayakkabiparti.lol/bbc/index.m3u8 | timeout
### Viasat History
_kategori: Belgesel_
- https://nord.ayakkabiparti.lol/viasathistory/index.m3u8 | timeout
### 11 Kanal
_kategori: Ulusal_
- https://11tv-dp.cdn-04.cosmonova.net.ua/hls/11tv-dp_ua_hi/index.m3u8 | timeout
### 31 Kanal
_kategori: Ulusal_
- http://stream.mcquack.net/388/index.m3u8 | timeout
### FOX 13 Seattle WA
_kategori: Ulusal_
- https://aegis-cloudfront-1.tubi.video/cc394198-7bde-43e8-b186-875bc0eb3037/index.m3u8 | timeout
### Fox West
_kategori: Ulusal_
- http://stream.cammonitorplus.net/1799/index.m3u8 | timeout
### Groovia Kanal
_kategori: Ulusal_
- https://gist.githubusercontent.com/iptvonlinetv/02d209207082846012c15305f7471c55/raw/4439b54b986e696e6fcfba7a53380d85b27bbbc1/udp450.500.723:6050.m3u8 | timeout
### Kanal 5
_kategori: Ulusal_
- https://s2.teve.mk/tvstanici/2/playlist.m3u8 | timeout
### Kanal 6
_kategori: Ulusal_
- https://restreamer1.tnt.ba/hls/kanal6.m3u8 | timeout
### Kanal 35
_kategori: Ulusal_
- https://str2.yodacdn.net/kanal35/index.m3u8 | timeout
### Kanal A
_kategori: Ulusal_
- https://streamer01.xploretv.si/__cl/cg:prod/__c/A1_SI_AKANALHD_ott/__op/dash-default/__dci/__f/index.m3u8?admin=xploreTv_test_user&redirect=true | timeout
### Kanal Hovedstaden
_kategori: Ulusal_
- http://khkbh.dk:8080/hls/livestream/index.m3u8 | timeout
### Kanal Jadid
_kategori: Ulusal_
- https://kjhls.wns.live/hls/stream.m3u8 | timeout
### Kanal S
_kategori: Ulusal_
- https://lives.atv.az:5443/KANAL-S/streams/kanals.m3u8 | timeout
### ViàATV
_kategori: Ulusal_
- https://streamer01.myvideoplace.tv/streamer02/hls/ATV_DIRECT_EV_111018.m3u8 | timeout
### LiveNOW from FOX
_kategori: Haber_
- https://pb-k5p02dtnr2162.akamaized.net/LiveNOW_from_FOX.m3u8 | timeout

---

## 4. Yasal M3U Import — Probe Başarısız (76 kanal)

### KANAL 68
- https://waw2.artiyerelmedya.net/kanal68/bant1/playlist.m3u8 | timeout
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197200&extension=ts&play_token=4eItwPJoyj | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197200&extension=ts&play_token=4eItwPJoyj | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197200&extension=ts&play_token=4eItwPJoyj | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197200&extension=ts&play_token=4eItwPJoyj | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=197200&extension=ts&play_token=4eItwPJoyj | network-error
### KON TV
- https://59cba4d34b678.streamlock.net/live/kontv/chunklist.m3u8 | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197191&extension=ts&play_token=PM2eb119cV | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197191&extension=ts&play_token=PM2eb119cV | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197191&extension=ts&play_token=PM2eb119cV | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197191&extension=ts&play_token=PM2eb119cV | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=197191&extension=ts&play_token=PM2eb119cV | network-error
### Aktif TV
- https://cdn.yayin.com.tr/aktiftv/aktiftv/playlist.m3u8 | http-404 (404)
### Bartin TV
- http://cdn-bartintv.yayin.com.tr/BARTINTV/BARTINTV/chunklist.m3u8 | http-404 (404)
### Belediye TV
- https://5be5d840359c6.streamlock.net/belediyelertv/belediyelertv/chunklist.m3u8 | network-error
### Berat TV
- http://cdn-berattv.yayin.com.tr/berattv/berattv/playlist.m3u8 | http-403 (403)
### Beşiktaş Belediyesi Web TV
- http://s01.vpis.io/besiktas/besiktas.m3u8 | network-error
### Biat TV
- https://5be5d840359c6.streamlock.net/biattv/biattv/chunklist.m3u8 | network-error
### Bitlis TV
- https://waw1.artiyerelmedya.net/bitlistv/bant1/playlist.m3u8 | timeout
### Bizim Atürk TV
- https://5be5d840359c6.streamlock.net/egeaturktv/egeaturktv/playlist.m3u8 | network-error
### Bodrum Belediyesi Web TV
- https://win2.yayin.com.tr/bodrumbeltv/bodrumbeltv/chunklist.m3u8 | network-error
### Boztepe TV
- http://stream.taksimbilisim.com:1935/btv/bant1/chunklist.m3u8 | timeout
### ÇEKMEKÖY WEB TV
- https://cdn-cekmekoybeltv.yayin.com.tr/cekmekoybeltv/cekmekoybeltv_1080p/playlist.m3u8 | network-error
### DEHA TV
- http://waw1.artiyerelmedya.net:1935/dehatv/bant1/playlist.m3u8 | timeout
### Doğuş TV
- http://s01.vpis.io/dogustv/dogustv.m3u8 | network-error
### DRT DENIZLI
- http://stream2.taksimbilisim.com:1935/drt/smil:drt.smil/iptvdelisi.m3u8 | timeout
### Ege Atürk TV
- https://5be5d840359c6.streamlock.net/egeaturktv/egeaturktv/playlist.m3u8 | network-error
### Ege TV
- https://waw1.artiyerelmedya.net/egetv/bant1/playlist.m3u8 | timeout
### Elmas TV
- https://5be5d840359c6.streamlock.net/elmas67tv/elmas67tv/chunklist.m3u8 | network-error
### Fuar TV
- https://59cba4d34b678.streamlock.net/canlitv/fuartv/chunklist.m3u8 | network-error
### Gaziantep Olay TV
- http://waw1.artiyerelmedya.net:1935/olaytv/bant1/chunklist.m3u8 | network-error
### Gonca TV
- http://stream.taksimbilisim.com:1935/tuncerciftci/smil:tuncerciftci.smil/iptvdelisi.m3u8 | timeout
### Istanbul TV
- http://streaming.netdirekt.com.tr/35757/msyapi/chunks.m3u8 | timeout
### KANAL 101
- http://s01.vpis.io/kanal101/kanal101.m3u8 | network-error
### KANAL 38
- https://59cba4d34b678.streamlock.net/live/kanal38/chunklist.m3u8 | network-error
### KANAL 56
- https://cdn-kanal56tv.yayin.com.tr/Kanal56TV/Kanal56TV/playlist.m3u8 | http-404 (404)
### Kanal 57 Tokat
- https://59cba4d34b678.streamlock.net/canlitv/kanal57/playlist.m3u8 | network-error
### Kanal 60 TV
- https://59cba4d34b678.streamlock.net/canlitv/kanal60/chunklist.m3u8 | network-error
### KANAL A ALANYA
- http://stream2.taksimbilisim.com:1935/kanala/bant1/playlist.m3u8 | timeout
### Kanal Artvin
- https://5be5d840359c6.streamlock.net/kanalartvin/kanalartvin/chunklist.m3u8 | network-error
### Kanal Ege
- https://59cba4d34b678.streamlock.net/canlitv/kanalege/chunklist.m3u8 | network-error
### KANAL ORDU
- https://5be5d840359c6.streamlock.net/kanalordutv/kanalordutv/chunklist.m3u8 | network-error
### Kapadokya TV
- https://59cba4d34b678.streamlock.net/canlitv/kapadokyatv/chunklist.m3u8 | network-error
### KÖROGLU TV
- http://stream.taksimbilisim.com:1935/koroglutv/bant1/playlist.m3u8 | timeout
### Leblebi TV
- http://win1.yayin.com.tr/LeblebiTv/LeblebiTv/chunklist.m3u8 | http-404 (404)
### MSBC Kanal 2000
- https://59cba4d34b678.streamlock.net/canlitv/kanal-2000/chunklist.m3u8 | network-error
### OGÜN TV
- https://s01.vpis.io/ogun/ogun.m3u8 | network-error
### Otağ TV
- https://59cba4d34b678.streamlock.net/canlitv/otagtv/chunklist.m3u8 | network-error
### Sakarya TV
- http://s01.vpis.io/sakaryatelevizyonu/sakaryatelevizyonu.m3u8 | network-error
### Sariyer TV
- http://s01.vpis.io/sariyer/sariyer.m3u8 | network-error
### Sinop Yildiz TV
- http://s01.vpis.io/sinopyildiz/sinopyildiz.m3u8 | network-error
### Sivas Belediyesi TV
- http://mn-nl.mncdn.com/sivasbel_tv_live/sivasbel_tv1/chunklist.m3u8 | network-error
### STK TV
- https://5be5d840359c6.streamlock.net/stktv/stktv/playlist.m3u8 | network-error
### Süper TV Tokat
- https://5be5d840359c6.streamlock.net/supertv/supertv/chunklist.m3u8 | network-error
### Tatlises TV
- https://waw2.artiyerelmedya.net/tatlisestv/bant1/chunks.m3u8 | timeout
### TE60 TV Tokat
- https://waw2.artiyerelmedya.net/te60tv/bant1/playlist.m3u8 | timeout
### Torba TV
- https://59cba4d34b678.streamlock.net/canlitv/torbatv/iptvdelisi.m3u8 | network-error
### TR6 TV
- https://5be5d840359c6.streamlock.net/tr6tv/tr6tv/chunklist.m3u8 | network-error
### TV 35
- https://59cba4d34b678.streamlock.net/canlitv/tv35/playlist.m3u8 | network-error
### TV 38
- https://59cba4d34b678.streamlock.net/live/tv38/playlist.m3u8 | network-error
### TV 9 Izmir
- https://59cba4d34b678.streamlock.net/canlitv/tv9izmir/chunklist.m3u8 | network-error
### Üniversite TV
- https://5be5d840359c6.streamlock.net/unitv/unitv/chunklist.m3u8 | network-error
### Woman TV
- https://s01.vpis.io/wmtv/wmtv.m3u8 | network-error
### Xezer
- https://59c7ea6bec1c6.streamlock.net/live/xezertv.stream/chunklist_w2109417220.m3u8 | network-error
### Yaren TV
- https://59cba4d34b678.streamlock.net/canlitv/yarentv/iptvdelisi.m3u8 | network-error
### Yeşilyurt TV
- https://waw1.artiyerelmedya.net/yesilyurttv/bant1/playlist.m3u8 | timeout
### AKILLI TV
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197231&extension=ts&play_token=xYOCtq7QJV | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197231&extension=ts&play_token=xYOCtq7QJV | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197231&extension=ts&play_token=xYOCtq7QJV | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197231&extension=ts&play_token=xYOCtq7QJV | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=197231&extension=ts&play_token=xYOCtq7QJV | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=197231&extension=ts&play_token=xYOCtq7QJV | network-error
### FENERBACHE TV
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=695&extension=ts&play_token=oQ5oB3yW9U | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=695&extension=ts&play_token=oQ5oB3yW9U | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=695&extension=ts&play_token=oQ5oB3yW9U | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=695&extension=ts&play_token=oQ5oB3yW9U | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=695&extension=ts&play_token=oQ5oB3yW9U | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=695&extension=ts&play_token=oQ5oB3yW9U | network-error
### GALATASARAY TV
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=696&extension=ts&play_token=7X0Jam6lh9 | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=696&extension=ts&play_token=7X0Jam6lh9 | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=696&extension=ts&play_token=7X0Jam6lh9 | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=696&extension=ts&play_token=7X0Jam6lh9 | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=696&extension=ts&play_token=7X0Jam6lh9 | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=696&extension=ts&play_token=7X0Jam6lh9 | network-error
### KANAL 7
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=196674&extension=ts&play_token=9BpPqEg56T | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=196706&extension=ts&play_token=WrJLqZWz8L | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=196674&extension=ts&play_token=9BpPqEg56T | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=196706&extension=ts&play_token=WrJLqZWz8L | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=196674&extension=ts&play_token=9BpPqEg56T | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=196706&extension=ts&play_token=WrJLqZWz8L | network-error
### KANAL 7 8K
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=196690&extension=ts&play_token=PndCKJQB2u | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=196690&extension=ts&play_token=PndCKJQB2u | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=196690&extension=ts&play_token=PndCKJQB2u | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=196690&extension=ts&play_token=PndCKJQB2u | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=196690&extension=ts&play_token=PndCKJQB2u | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=196690&extension=ts&play_token=PndCKJQB2u | network-error
### KANAL D
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=196680&extension=ts&play_token=RfWrMzD0aA | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=196712&extension=ts&play_token=D1bUuDAgZw | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=196680&extension=ts&play_token=RfWrMzD0aA | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=196712&extension=ts&play_token=D1bUuDAgZw | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=196680&extension=ts&play_token=RfWrMzD0aA | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=196712&extension=ts&play_token=D1bUuDAgZw | network-error
### KANAL D 8K
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=196696&extension=ts&play_token=DYgtNp28Es | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=196696&extension=ts&play_token=DYgtNp28Es | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=196696&extension=ts&play_token=DYgtNp28Es | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=196696&extension=ts&play_token=DYgtNp28Es | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=196696&extension=ts&play_token=DYgtNp28Es | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=196696&extension=ts&play_token=DYgtNp28Es | network-error
### PAMUKKALE TV
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197179&extension=ts&play_token=OHyYS2HCuW | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197179&extension=ts&play_token=OHyYS2HCuW | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197179&extension=ts&play_token=OHyYS2HCuW | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197179&extension=ts&play_token=OHyYS2HCuW | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=197179&extension=ts&play_token=OHyYS2HCuW | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=197179&extension=ts&play_token=OHyYS2HCuW | network-error
### RUMELI TV
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197188&extension=ts&play_token=PaNAKhTAov | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197188&extension=ts&play_token=PaNAKhTAov | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197188&extension=ts&play_token=PaNAKhTAov | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197188&extension=ts&play_token=PaNAKhTAov | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=197188&extension=ts&play_token=PaNAKhTAov | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=197188&extension=ts&play_token=PaNAKhTAov | network-error
### TV 5
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197160&extension=ts&play_token=dg0fqY7VUH | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197160&extension=ts&play_token=dg0fqY7VUH | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197160&extension=ts&play_token=dg0fqY7VUH | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197160&extension=ts&play_token=dg0fqY7VUH | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=197160&extension=ts&play_token=dg0fqY7VUH | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=197160&extension=ts&play_token=dg0fqY7VUH | network-error
### TV 8
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=196677&extension=ts&play_token=zLN7npODPH | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=196709&extension=ts&play_token=BxLJEjUKpG | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=196677&extension=ts&play_token=zLN7npODPH | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=196709&extension=ts&play_token=BxLJEjUKpG | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=196677&extension=ts&play_token=zLN7npODPH | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=196709&extension=ts&play_token=BxLJEjUKpG | network-error
### TV 8 8K
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=196693&extension=ts&play_token=b5WpiwQiiH | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=196693&extension=ts&play_token=b5WpiwQiiH | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=196693&extension=ts&play_token=b5WpiwQiiH | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=196693&extension=ts&play_token=b5WpiwQiiH | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=196693&extension=ts&play_token=b5WpiwQiiH | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=196693&extension=ts&play_token=b5WpiwQiiH | network-error
### TV 8 INT
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=196662&extension=ts&play_token=jn7Qq9d7fI | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=196662&extension=ts&play_token=jn7Qq9d7fI | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=196662&extension=ts&play_token=jn7Qq9d7fI | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=196662&extension=ts&play_token=jn7Qq9d7fI | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=196662&extension=ts&play_token=jn7Qq9d7fI | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=196662&extension=ts&play_token=jn7Qq9d7fI | network-error
### ULUSAL KANAL
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197178&extension=ts&play_token=8qxzVqk0m2 | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197178&extension=ts&play_token=8qxzVqk0m2 | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197178&extension=ts&play_token=8qxzVqk0m2 | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197178&extension=ts&play_token=8qxzVqk0m2 | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=197178&extension=ts&play_token=8qxzVqk0m2 | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:2E&stream=197178&extension=ts&play_token=8qxzVqk0m2 | network-error
### Agro TV
- https://yayin.haber100.com/P650841340/agrotv/chuclink.m3u8 | network-error
### Belediye Gündem TV
- http://46.20.13.51:1935/makinetv/_definst_/makinetv/chunklist.m3u8 | network-error
### Kanal Ordu TV
- http://live.arkumedia.com:1935/kanalordutv/kanalordutv/chunklist.m3u8 | network-error
### KANAL V VIP Antalya
- http://yerelmedya.tv:1935/kanalv/bant1/chunklist.m3u8 | network-error
### SUN TV Konya
- http://148.251.42.124:8081/live/suntv/chunks.m3u8 | timeout
### Süper Kanal Bursa
- http://yayin3.canlitv.com:1935/canlitv/superkanal/iptvdelisi.m3u8 | network-error

---

## 5. Discover — Bulunamayan Kanallar (20 kanal)

### TV8 International
- http://162.212.179.33/dvrfl05/gin-tv8int/index.m3u8 | timeout
- http://nimplus3.bozztv.com/tv8int/tv8int/playlist.m3u8 | http-404 (404)
### Cartoon Network
- http://ch.canlitvlive.io/cartoonnetwork/live.m3u8 | network-error
- https://tv.arectv31.sbs/live/cartoonnetwork.m3u8 | network-error
- https://tv.arectv34.sbs/live/cartoonnetwork.m3u8 | network-error
- https://cartoonnetwork.blutv.com/blutv_cartoonnetwork/live.m3u8 | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197411&extension=ts&play_token=6Vh9e7AwnI | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197411&extension=ts&play_token=6Vh9e7AwnI | network-error
### GRT
- http://yerelmedya.tv:1935/grt/_definst_/bant1/chunklist.m3u8 | network-error
### Kon TV
- https://59cba4d34b678.streamlock.net/live/kontv/chunklist.m3u8 | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197191&extension=ts&play_token=PM2eb119cV | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197191&extension=ts&play_token=PM2eb119cV | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197191&extension=ts&play_token=PM2eb119cV | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197191&extension=ts&play_token=PM2eb119cV | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:8E&stream=197191&extension=ts&play_token=PM2eb119cV | network-error
### Agro TV
- https://yayin30.haber100.com/live/agrotv/playlist.m3u8 | http-404 (404)
- https://agrotv.blutv.com/blutv_agrotv/live.m3u8 | network-error
- https://yayin.haber100.com/P650841340/agrotv/chuclink.m3u8 | network-error
### Tek Rumeli TV
- https://edge1.socialsmart.tv/tekrumelitv/bant1/playlist.m3u8 | http-404 (404)
### TV 2020
- https://sc-kuzeykibrissmarttv.ercdn.net/tv2020/bantp1/playlist.m3u8 | network-error
- https://spor.kuzeykibris.tv/m3u8/tv_2020.m3u8 | timeout
- http://kuzeykibris.tv/m3u8/tv_dialog.m3u8 | http-404 (404)
### Gonca TV
- http://stream.taksimbilisim.com:1935/tuncerciftci/smil:tuncerciftci.smil/iptvdelisi.m3u8 | timeout
### Rumeli TV
- https://rumelitv-live.ercdn.net/rumelitv/rumelitv.m3u8 | network-error
- http://yayin3.canlitv.com:1935/live/rumelitv/iptvdelisi.m3u8 | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197188&extension=ts&play_token=PaNAKhTAov | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197188&extension=ts&play_token=PaNAKhTAov | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197188&extension=ts&play_token=PaNAKhTAov | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197188&extension=ts&play_token=PaNAKhTAov | network-error
### Uçankuş TV
- https://ucankus-live.cdnnew.com/ucankus/ucankus.m3u8 | network-error
### Kanal 68
- https://waw2.artiyerelmedya.net/kanal68/bant1/playlist.m3u8 | timeout
- https://live.artidijitalmedya.com/artidijital_kanal68/kanal68/playlist.m3u8 | http-404 (404)
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:5D:91:44&stream=197200&extension=ts&play_token=4eItwPJoyj | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:D6&stream=197200&extension=ts&play_token=4eItwPJoyj | network-error
- http://line.tivi-one.net:80/play/live.php?mac=00:1A:79:F5:CE:C8&stream=197200&extension=ts&play_token=4eItwPJoyj | network-error
- http://me.mdmfista.com:80/play/live.php?mac=00:1A:79:F5:CE:CF&stream=197200&extension=ts&play_token=4eItwPJoyj | network-error
### Ege TV
- https://waw1.artiyerelmedya.net/egetv/bant1/playlist.m3u8 | timeout
### Deha TV
- http://waw1.artiyerelmedya.net:1935/dehatv/bant1/playlist.m3u8 | timeout
### Tatlıses TV
- https://live.artidijitalmedya.com/artidijital_tatlisestv/tatlisestv/chunks.m3u8 | http-404 (404)
### Anadolu Dernek TV
- http://ch.canlitvlive.io/anadolu-dernek-tv/live.m3u8 | network-error
### Bitlis TV
- https://waw1.artiyerelmedya.net/bitlistv/bant1/playlist.m3u8 | timeout
### Pamukkale TV
- http://stream.tvcdn.net/yerel/pamukkale-tv.m3u8 | network-error
- http://ch.canlitvlive.io/pamukkale-tv/live.m3u8 | network-error
### Süper TV
- https://5be5d840359c6.streamlock.net/supertv/supertv/chunklist.m3u8 | network-error
### DRT Denizli
- https://edge1.socialsmart.tv/drttv/bant1/playlist.m3u8 | http-404 (404)
- http://stream2.taksimbilisim.com:1935/drt/smil:drt.smil/playlist.m3u8 | timeout
- http://stream2.taksimbilisim.com:1935/drt/smil:drt.smil/iptvdelisi.m3u8 | timeout
### BRT 3
- http://wms.brtk.net:1935/live/brt2/playlist.m3u8 | network-error

---

## Özet

| Kaynak | Kanal sayısı |
|--------|--------------|
| TKGS eksik | 22 |
| Yerel eksik probe | 27 |
| IPTV-ORG failed | 19 |
| Yasal import failed | 76 |
| Discover notFound | 20 |
