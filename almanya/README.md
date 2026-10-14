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

Kategoriler adından çıkarılır (`tools/build.mjs` içindeki tablo):

| Anahtar | Örnek |
| --- | --- |
| `public` | Das Erste, ZDF, 3sat, Deutschlandfunk |
| `regional` | ARD eyalet kanalları, yerel TV, Antenne Bayern |
| `news` | Tagesschau 24, Welt, BR 24 |
| `culture` | Bayern 2, Deutschlandfunk Kultur |
| `music` | Deluxe Music, bigFM, Schlager Radio |
| `kids` | KiKA, Lilo TV, Radio Teddy |
| `religious` | Bibel TV, K-TV, Hope TV |
| `shopping` | HSE, QVC, Juwelo |
| `documentary` | Dokusat, N24 Doku |
| `lifestyle` | Just Cooking, Just Fishing |
| `entertainment` | Anixe, DF1 |
| `other` | adı bir sınıfa oturmayanlar |

## Neler çıkarılır

Yalnızca durumu `working` veya `geo-blocked` (HTTP 403) olan linkler kalır. `failed` ve `untested` satırlar yayımlanmaz. Hiç canlı linki kalmayan kanallar kataloga girmez (örneğin Handystar, Schlager Deluxe, Sonnenklar TV, Radio Horeb, Radio NRW). Yeni kaynak eklenmez.

Radyo CSV'sinde aynı istasyon adının altında kardeş yayınlar da `(1)`, `(2)` diye durur. Katalog bu gruplamayı bozmaz; yedek sıra kaynağın sırasıdır, çalışanlar öndedir.

## Nasıl güncellenir

1. Yeni ölçümü `almanya/sources/` altındaki CSV ve M3U dosyalarına işleyin. Linki kaynakta yoksa eklemeyin.
2. Yeni bir kanal adı varsa `almanya/tools/build.mjs` içindeki kategori tablosuna bir satır ekleyin. Tablo dışı ad üretimi durdurur.
3. Üretin:

```bash
node almanya/tools/build.mjs
```

4. Kanal listesi, adresler veya kategoriler değiştiyse `_revision` bir artar ve `updatedAt` yenilenir. İçerik aynıysa revision yerinde kalır. Zorunlu artırmak için `node almanya/tools/build.mjs --bump`.
5. Kontrol: `node almanya/tools/build.mjs --check`
6. Yalnızca `almanya/` altını commit edin. Kök katalog dosyalarına dokunmayın.

Betik `almanya/` dışına yazmayı reddeder.
