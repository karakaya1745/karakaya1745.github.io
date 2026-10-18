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
| `sources/onay-2026-10-15.csv`, `onay-2026-10-16.csv`, `onay-2026-10-18.csv` | Onaylanan ekler ve silinecek linkler. |
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

```json
{
  "id": "tv-3sat",
  "name": "3sat",
  "type": "tv",
  "category": "public",
  "geo_de_only": true,
  "streams": [
    { "url": "https://…/veryhigh/master.m3u8", "geo_de_only": true }
  ]
}
```

Karışık kanalda (örneğin Anixe) `geo_de_only` kanaldaki bayrak `false` olur, çünkü çalışan bir link vardır. Uygulama `streams` dizisini baştan dener; açılmayan adresten sonrakine geçer. `streams[].geo_de_only` hangi yedeğin yalnızca Almanya'da açıldığını söyler.

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
| `other` | Anixe, DF1, Just Cooking, Lilo TV |
| `international` | Kanal Avrupa, Çira TV |
| `yerel` | Yerel televizyon. Eyalete göre, eyaletin içinde ada göre |

## Neler çıkarılır

Yalnızca durumu `working` veya `geo-blocked` (HTTP 403) olan linkler kalır. `failed` ve `untested` satırlar yayımlanmaz. Hiç canlı linki kalmayan kanallar kataloga girmez (örneğin Handystar, Schlager Deluxe, Sonnenklar TV, Radio Horeb, Radio NRW). Yeni kaynak eklenmez.

Radyo CSV'sinde aynı istasyon adının altında kardeş yayınlar da `(1)`, `(2)` diye durur. Katalog bu gruplamayı bozmaz; yedek sıra kaynağın sırasıdır, çalışanlar öndedir.

`sources/onay-2026-10-15.csv` sonradan onaylanan adaylardır. Betik bu dosyayı da okur. Etkinlik beslemeleri kataloğa girmez: `ARD Event`, `ARTE Event`, `BR Event`, `MDR+`, `rbb Event`, `SWR Event`, `ZDF Event`, `WDR Event`. `sadece Almanya` satırları 403 kabul edilir (`geo_de_only`). Katalogda zaten bulunan URL ikinci kez eklenmez. Yeni kanallar kategori tablosuna göre kendi grubunun sonuna yazılır.

`sources/onay-2026-10-16.csv` bir sonraki onaydır. Yedek linkler ilgili kanala eklenir. `olu_mevcut_link` satırları (WDR Lokalzeit `hls/int`) katalogdan silinir; çalışan `de` linkler kalır. Eski `FFN` kaydı `ffn 80er` olur ve id'si `radio-ffn` olarak kalır. Ana yayın ayrı kanal olarak `radio ffn` adıyla eklenir. Deutschlandfunk AAC 192k linki, daha yüksek kalite olduğu için o kanalın ilk adresidir.

`sources/onay-2026-10-18.csv` 18 Ekim onayının tamamıdır. `denendi_olu_onerilmiyor` satırları eklenmez. `olu_mevcut_link` adresleri silinir; geride çalışan veya 403 link kalmayan kanal katalogdan çıkar (DW Deutsch, DW Deutsch+, 123 Live TV, Radio Q). QVC Style ve QVC Zwei durur; şüpheli linkleri kendi kanalında en sona yazılır. `iptv-playoutcenter.de` linkleri, listesi açılıp parçaları 403 dönen 13 kanalda `geo_de_only` olur. Eski `RBB Radio 3` kaydı aslında Radio 38'dir: adı Radio 38 olur, id'si `radio-rbb-radio-3` kalır. rbbKultur ayrı istasyon olarak eklenir. R.SH, Radio Brocken, Radio Hamburg, delta radio ve Radio PSR üzerindeki oturum parametreli adresler (`?sABC=` ve benzeri) silinir. Deluxe Music'in üç statik linki ve Deluxe Rap'in iki statik linki silinir; canlı ana listeler kalır. Radio SAW'ın ana yayını bu onayda yoktur; temalı yayınlarının sırası korunur.

## Sıra

Kanallar önce türe göre dizilir (bütün TV, sonra bütün radyo). TV kategori sırası: `public`, `regional`, `news`, `religious`, `music`, `shopping`, `documentary`, `other`, `international`, `yerel`. Radyo aynı anahtarları kullanır: ARD kamu ağları, sonra Deutschlandradio, sonra özel istasyonlar eyalete göre (`regional`), sonra dinî istasyonlar, sonra temalı ve web radyolar (`music`). Bilinen kanallar grubun başında durur; `yerel` içinde sıra eyalet, sonra addır. Yayımlanan `tv.m3u` ve `radio.m3u` aynı sırayı kullanır; `group-title` kategoridir. Bir kanalın yedeklerinde çalışan adresler, `geo_de_only` adreslerden önce gelir. bigFM, Radio Bob, Rock Antenne ve Cosmo'da ana yayın temalı yayınlardan öndedir.

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
