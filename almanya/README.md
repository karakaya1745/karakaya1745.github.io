# ZapIt TV — Almanya kataloğu

Bu klasör, **ZapIt TV** uygulamasının Almanya (FTA televizyon ve radyo) kataloğudur. Kök dizindeki Canlı TV TR kataloğundan (`channels.json`, `stream_map.json`, `metadata.json`, `app_config.json`) tamamen ayrıdır.

Burada `stream_map.json` yoktur. Türkçe OTA betiği metadata'yı ancak aynı dizinde hem `channels.json` hem `stream_map.json` varsa yeniler; bu klasör o koşulu sağlamaz. `.github/workflows/` altındaki iş akışları da bu klasöre bakmaz: `sync-ota-metadata` yalnızca kökteki katalog dosyalarının yollarında tetiklenir, diğer botlar elle veya zamanlanmış çalışır ve yalnızca kendi rapor dosyalarını yazar.

## Genel adresler

Sayfalar `main` dalına geçince şu adreslerden okunur:

| Dosya | Adres |
| --- | --- |
| Katalog | https://karakaya1745.github.io/almanya/channels.json |
| Güncelleme kontrolü | https://karakaya1745.github.io/almanya/metadata.json |
| TV listesi | https://karakaya1745.github.io/almanya/tv.m3u |
| Radyo listesi | https://karakaya1745.github.io/almanya/radio.m3u |

Uygulama önce `metadata.json` indirir. `revision` veya `channels.json` sha256 değeri değişmemişse katalogu tekrar indirmeye gerek yoktur.

## Dosyalar

| Dosya | Ne işe yarar |
| --- | --- |
| `sources/tv.csv`, `sources/tv.m3u` | Ham TV ölçümü. CSV'de ölü (`failed`) satırlar da durur. |
| `sources/radio.csv`, `sources/radio.m3u` | Ham radyo ölçümü. CSV'de denenmemiş düz `http` satırları da durur. |
| `sources/onay-2026-10-15.csv` … `onay-2026-10-26.csv` | Onaylanan ekler ve silinecek veya sona alınan linkler. |
| `sources/catalog-retest-2026-10-18.json` | 18 Ekim yeniden testi (ölü, statik, şüpheli). |
| `tv.m3u`, `radio.m3u` | Yayımlanan, temizlenmiş listeler. Ölü ve denenmemiş link yoktur. |
| `channels.json` | Uygulamanın indirdiği katalog. |
| `metadata.json` | `revision`, `channelCount`, `updatedAt` ve `channels.json` sha256. |
| `tools/build.mjs` | CSV/M3U'dan katalogu ve listeleri yeniden üretir. |

`sources/` altındaki dosyalar girdi olarak saklanır. Yayımlanan `tv.m3u` / `radio.m3u` her üretimde baştan yazılır; elle düzenlemeyin.

## Katalog biçimi

`channels.json` üst alanda `_revision` (tam sayı) ve `updatedAt` (ISO-8601) taşır. `metadata.json` içindeki `revision` her zaman `_revision` ile aynıdır.

Her kanal:

| Alan | Anlamı |
| --- | --- |
| `id` | Addan türetilen sabit kimlik (`tv-das-erste`, `radio-bayern-2`). Ad değişmezse id değişmez. |
| `name` | Görünen ad. TV'de `Kanal (n)`, radyoda ölçümdeki istasyon adı. |
| `type` | `tv` veya `radio`. |
| `category` | Aşağıdaki süzgeç anahtarlarından biri. |
| `geo_de_only` | `true` ise kanalın bütün linkleri Almanya dışından 403 döner. |
| `streams` | Yedek sırası. Önce çalışan linkler, sonra 403 linkler. Adresler kaynakta nasıl verildiyse öyle durur. |
| `streams[].format` | Oynatıcı seçimi. Adresin uzantısından çıkarılır: `hls` (`.m3u8`), `dash` (`.mpd`), `mp3`, `aac`, `opus`. Uzantı yoksa `audio`. |

```json
{
  "id": "tv-3sat",
  "name": "3sat",
  "type": "tv",
  "category": "public",
  "geo_de_only": true,
  "streams": [
    { "url": "https://…/veryhigh/master.m3u8", "geo_de_only": true, "format": "hls" }
  ]
}
```

Karışık kanalda (örneğin Anixe) `geo_de_only` kanaldaki bayrak `false` olur, çünkü çalışan bir link vardır. Uygulama `streams` dizisini baştan dener; açılmayan adresten sonrakine geçer. `streams[].geo_de_only` hangi yedeğin yalnızca Almanya'da açıldığını söyler. `streams[].format` hangi oynatıcının kullanılacağını söyler. Radio Bremen TV'nin ikinci adresi DASH'tir (`format: "dash"`, `geo_de_only: true`); HLS yedeği öndedir. DASH adresi bir HLS oynatıcıyla açılmaz.

Kategoriler `tools/apply-2026-10-18.mjs` içinde ada göre verilir. Eski `kids`, `culture`, `lifestyle` ve `entertainment` anahtarları bu sıraya katlandı (KiKA ulusal kamu, Lilo TV ve RiC `other`, Just Cooking `other`).

| Anahtar | Örnek |
| --- | --- |
| `public` | Das Erste, ZDF, 3sat, KiKA, Tagesschau 24; radyoda ARD ağları ve Deutschlandradio |
| `regional` | ARD eyalet televizyonu ve WDR stüdyoları; radyoda özel istasyonlar, eyalete göre |
| `news` | Deutsche Welle, DW Arabic, Welt, Bundestag |
| `religious` | Bibel TV, K-TV, Hope TV, domradio |
| `music` | Deluxe Music, Melodie TV; radyoda Klassik Radio ve temalı web radyolar |
| `shopping` | QVC, HSE, Juwelo |
| `documentary` | N24 Doku, Dokusat, Welt der Wunder |
| `other` | Anixe, DF1, Lilo TV, More Than Sports TV |
| `international` | Kanal Avrupa, Çira TV |
| `yerel` | Yerel televizyon. Eyalete göre, eyaletin içinde ada göre |

## Neler çıkarılır

Yalnızca durumu `working` veya `geo-blocked` (HTTP 403) olan linkler kalır. `failed` ve `untested` satırlar yayımlanmaz. Hiç canlı linki kalmayan kanallar kataloga girmez (örneğin Handystar, Schlager Deluxe, Sonnenklar TV, Radio Horeb, Radio NRW). Yeni kaynak eklenmez.

Radyo CSV'sinde aynı istasyon adının altında kardeş yayınlar da `(1)`, `(2)` diye durur. Katalog bu gruplamayı bozmaz; yedek sıra kaynağın sırasıdır, çalışanlar öndedir.

`sources/onay-2026-10-15.csv` sonradan onaylanan adaylardır. Betik bu dosyayı da okur. Etkinlik beslemeleri kataloğa girmez: `ARD Event`, `ARTE Event`, `BR Event`, `MDR+`, `rbb Event`, `SWR Event`, `ZDF Event`, `WDR Event`. `sadece Almanya` satırları 403 kabul edilir (`geo_de_only`). Katalogda zaten bulunan URL ikinci kez eklenmez. Yeni kanallar kategori tablosuna göre kendi grubunun sonuna yazılır.

`sources/onay-2026-10-16.csv` bir sonraki onaydır. Yedek linkler ilgili kanala eklenir. `olu_mevcut_link` satırları (WDR Lokalzeit `hls/int`) katalogdan silinir; çalışan `de` linkler kalır. Eski `FFN` kaydı `ffn 80er` olur ve id'si `radio-ffn` olarak kalır. Ana yayın ayrı kanal olarak `radio ffn` adıyla eklenir. Deutschlandfunk AAC 192k linki, daha yüksek kalite olduğu için o kanalın ilk adresidir.

`sources/onay-2026-10-18.csv` 18 Ekim onayının tamamıdır. `denendi_olu_onerilmiyor` satırları eklenmez. `olu_mevcut_link` adresleri silinir; geride çalışan veya 403 link kalmayan kanal katalogdan çıkar (DW Deutsch, DW Deutsch+, 123 Live TV, Radio Q). QVC Style ve QVC Zwei durur; şüpheli linkleri kendi kanalında en sona yazılır. `iptv-playoutcenter.de` linkleri, listesi açılıp parçaları 403 dönen 13 kanalda `geo_de_only` olur. Eski `RBB Radio 3` kaydı aslında Radio 38'dir: adı Radio 38 olur, id'si `radio-rbb-radio-3` kalır. rbbKultur ayrı istasyon olarak eklenir. R.SH, Radio Brocken, Radio Hamburg, delta radio ve Radio PSR üzerindeki oturum parametreli adresler (`?sABC=` ve benzeri) silinir. Deluxe Music'in üç statik linki ve Deluxe Rap'in iki statik linki silinir; canlı ana listeler kalır. Radio SAW'ın ana yayını bu onayda yoktur; temalı yayınlarının sırası korunur.

`sources/onay-2026-10-19.csv` 19 Ekim onaydır. Sonnenklar TV (`euvia.cdn.ses-ps.com`, jetonlu yönlendirme) eklenmez. Diğer satırlar yedek veya yeni istasyon olarak girer. `çalışıyor` çalışan, `sadece Almanya` ise `geo_de_only` sayılır. OK4 ve OK54 Trier zaten `yerel` / Rheinland-Pfalz altındadır; yeni 720p adresleri o kanallara geo yedek yazılır. NDR'nin uluslararası `master.m3u8` adresi, aynı `ndr_int` ailesini taşıyan NDR Fernsehen Hamburg kaydına eklenir. MDR Thüringen'in dört bölgesel HLS adresi (Mitte/West, Ost, Nord, Süd), bu varyantları zaten bir arada tutan MDR Thüringen Mitte/West istasyonuna eklenir. Yeni istasyonlar Bayernwelle SüdOst (Bayern) ve baden.fm'dir (Baden-Württemberg).

`sources/onay-2026-10-20.csv` 20 Ekim onayının tamamıdır. ARD'nin bölgesel radyo varyantları ana istasyonun hemen ardına yazılır. Oberlausitz TV Sachsen, Metropol Region TV Rhein-Neckar Baden-Württemberg `yerel` grubundadır. KaufBei TV ve MeieTV `shopping`, Folx / One / Zwei Music Television `music`, Finest TV ve QS24.TV `other` grubundadır. 20 Ekim yeniden testinde düşen 7 link silinmez; kanalın sonuna alınır (Radio Weser TV'nin üç adresi, h-eins.tv, QVC Style, QVC Zwei, HR 1 `hlshr1`). HR 1'de yeni Audiothek `hr1rm` adresi ilk sıradadır.

`sources/onay-2026-10-21.csv` 21 Ekim onayıdır. İki yerel TV yedeği ve 24 radyo yedeği ilgili kanala eklenir. Yeni özel radyolar, eyalet gruplarındaki mevcut düzene girer (NRW, Rheinland-Pfalz, Bayern, Berlin). `yerel` yerel televizyon içindir; yerel radyolar `regional` kalır. Star*Sat Radio temalı `music` grubundadır. Radio Gold Berlin'dedir. 21 Ekim yeniden testindeki ölü linkler silinmez; kanalın sonuna alınır. Buna Welt'in `personalstream` adresi de dahildir.

`sources/onay-2026-10-22.csv` 22 Ekim yedekleridir; yeni kanal yoktur. ARD `ard-mcdn` kalite varyantları ve bir Deutsche Welle TV yedeği ilgili kanala eklenir. CSV'de `tip=radio` olan iki Deutsche Welle ses adresi de ayrı istasyon açılmadan mevcut TV kanalına yazılır. `sadece Almanya` adresleri `geo_de_only` olur. HR 1 sırası: `hr1rm`, sonra `hr1suedhessen`, `hlshr1` en sonda. ERF Plus'ta `stream.erfplus.de/erf-1a64/mp3-128` ilk sıradadır; HTML dönen `erfplus.m3u` sondadır. `avw.mdr.de` üzerindeki `aac_high.m3u` adresleri 503 verdiği için silinmez, kanalın sonuna alınır.

`sources/onay-2026-10-23.csv` 23 Ekim onayının tamamıdır. WDR 2 bölgesel HLS yedekleri, MDR'nin resmi `radio-hls` adresleri, HSE Extra 576p, ALEX Berlin chunklist ve radyo yedekleri ilgili kanallara eklenir. MDR Klassik'in ENDLIST adayı eklenmez. More Than Sports TV `other` grubundadır; ayrı spor kategorisi yoktur. Radio Rüsselsheim Hessen içinde `regional` durur. İki gündür 503 veren beş `avw.mdr.de` `aac_high.m3u` adresi silinir. Tagesschau 24'ün `hls/int/master.m3u8` ve `master720p3200.m3u8` adresleri ile MDR Fernsehen Sachsen'in `hls/int/master360p1200.m3u8` adresi silinir; diğer yedekler kalır. Samsung TV Plus kanalları (Höhenrausch, One Terra, Xplore, Just Cooking, Just Fishing) katalogdan çıkar. Welt `personalstream`, QVC Style, QVC Zwei, Radio Weser TV, h-eins.tv, Finest TV ve HR 1 `hlshr1` silinmez.

24 Ekim temizliği ayrı bir onay CSV'si değildir. Çalışan linki kalmayan yedi TV kanalı çıkar: Deluxe Dance by Kontor, QVC Style, QVC Zwei, Radio Weser TV Bremen, h-eins.tv, Anixe +, Anixe HD Serie. `shopping` TV listesinin sonuna alınır (`yerel`den sonra). Aynı istasyon ailesinin bölgesel radyo varyantları tek kanalda toplanır (örneğin WDR 2, Bayern 1, SWR4, hr1/hr3/hr4). WDR 2 ile WDR 4, MDR Jump ile MDR Kultur ve bölgesel televizyonlar ayrı kalır. Kardeş bölgeye ait URL'ler ana kanaldan silinir. HR Dasding çıkar; yayın SWR'deki DASDING kanalında kalır. DASDING vom SR ayrı istasyondur.

`sources/onay-2026-10-24.csv` 24 Ekim onayıdır. Tema, etkinlik ve 10. revizyonda kaldırılan bölgesel varyant kanalları eklenmez. Yeni istasyonlar yalnızca MDR Sachsen Sorbisch ve rbb24 Inforadio Sorbisch'tir; ikisi de kendi ailesinin hemen ardındadır. Welt'in 401 veren `personalstream` adresi ve HR 1'in ENDLIST `hlshr1` adresi silinir; `hr1rm` ilk sırada kalır. `sid`, `token`, `skey` ve `userConsentV2` parametreli adresler kalkar. Oldie Antenne 80er adresinde yalnızca bu parametreler soyulur. KiKA ve WDR'nin dünya geneli DASH yedekleri çalışan HLS'in hemen ardına yazılır. Diğer resmi DASH TV yedekleri `geo_de_only` olur. MDR Schlagerwelt'in üç resmi HLS adresi mevcut kanala eklenir; Leipzig penceresi (`284280-3`) ayrı kanal açmadan MDR Sachsen'e yazılır.

`sources/onay-2026-10-25.csv` 25 Ekim onayıdır. Tagesschau 24'ün 404 veren `hls/int/master540p1800.m3u8` adresi ve KiKA'nın 404 veren `hls/int/master1080p5000.m3u8` adresi silinir. Tagesschau 24'ün `int/master.m3u8` adresi 9. revizyonda zaten yoktu. 403 dönen diğer int yedekler kalır. Radio Berg'deki `_art` imzalı adres ve Berliner Rundfunk 91.4'teki `listenerid` oldies adresi silinir. ERF Jess'te `erfjess.mp3` ilk sıradadır; aralıklı HTML dönen `erfpop.m3u` sonda kalır. Kırk çalışan yedek mevcut kanallara eklenir. SWR 3 ve DASDING görüntülü radyo yayınları ayrı TV kanalı açmadan radyo kanalında durur. Yeni TV kanalı ServusTV Deutschland `other` grubundadır ve `geo_de_only` olur. `shopping` sonda kalır.

`sources/onay-2026-10-26.csv` 26 Ekim onayıdır. Altmış sekiz çalışan yedek, yayını zaten katalogda olan kanallara eklenir. Yeni kanal açılmaz. UNSERDING görüntülü yayını ve addrad.io kısa linkleri eklenmez. Ana kanalın yerine tema veya bölgesel varyant çalan 55 yedek silinir. Deluxe Music televizyonundaki yalnız-ses yedek de silinir; görüntülü yayın kalır. Tagesschau 24 `int/master1080p5000` bir gündür dalgalı olduğu için durur. Antenne 1 ve Antenne MV'de ana yayın kalmadığı için bu iki kanal katalogdan çıkar. `shopping` sonda kalır.

## Sıra

Kanallar önce türe göre dizilir (bütün TV, sonra bütün radyo). TV kategori sırası: `public`, `regional`, `news`, `religious`, `music`, `documentary`, `other`, `international`, `yerel`, `shopping`. Radyo aynı anahtarları kullanır: ARD kamu ağları, sonra Deutschlandradio, sonra özel istasyonlar eyalete göre (`regional`), sonra dinî istasyonlar, sonra temalı ve web radyolar (`music`). Bilinen kanallar grubun başında durur; `yerel` içinde sıra eyalet, sonra addır. `shopping` TV listesinin son bloğudur. Yayımlanan `tv.m3u` ve `radio.m3u` aynı sırayı kullanır; `group-title` kategoridir. Bir kanalın yedeklerinde çalışan adresler, `geo_de_only` adreslerden önce gelir. bigFM, Radio Bob, Rock Antenne ve Cosmo'da ana yayın temalı yayınlardan öndedir.

## Nasıl güncellenir

1. Yeni ölçümü `almanya/sources/` altındaki CSV ve M3U dosyalarına işleyin. Linki kaynakta yoksa eklemeyin.
2. Yeni bir kanal adı varsa `almanya/tools/apply-2026-10-18.mjs` içindeki sınıf listesine ekleyin. Listede olmayan ad üretimi durdurur.
3. Üretin:

```bash
node almanya/tools/build.mjs
```

4. Kanal listesi, adresler veya kategoriler değiştiyse `_revision` bir artar ve `updatedAt` yenilenir. İçerik aynıysa revision yerinde kalır. Zorunlu artırmak için `node almanya/tools/build.mjs --bump`.
5. Kontrol: `node almanya/tools/build.mjs --check`
6. Yalnızca `almanya/` altını commit edin. Kök katalog dosyalarına dokunmayın.

Betik `almanya/` dışına yazmayı reddeder.
