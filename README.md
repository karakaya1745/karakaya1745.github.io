# karakaya1745.github.io

Canli TV kanal katalogu (`channels.json`, `stream_map.json`).

## Stream Health Bot — GitHub Actions

> **Varsayilan: onay / teklif modu.** Bot `channels.json` / `stream_map.json` dosyalarini **asla otomatik yazmaz**.
> Her 3 gunde bir arastirma calisir, `out/proposals_latest.*` uretir ve e-posta ozeti gonderir.

| Workflow | Durum |
|----------|--------|
| **proposal-notify** | Aktif — cron `0 5 */3 * *` (05:00 UTC ≈ 08:00 TR) + manuel |
| stream-health | Yalnizca `workflow_dispatch`, **dry-run** (no `--apply`) |
| discover-missing | Yalnizca `workflow_dispatch`, **dry-run** |
| enrich-stream-map | Yalnizca `workflow_dispatch`, **dry-run** |
| import-legal-channels | Yalnizca `workflow_dispatch`, **dry-run** (proposal pipeline disi) |

### Teklif dosyalari

- `tools/stream-health-bot/out/proposals_latest.json`
- `tools/stream-health-bot/out/proposals_latest.md`

### E-posta secret'lari (GitHub → Settings → Secrets and variables → Actions)

Repo: **karakaya1745.github.io**

| Secret | Ornek |
|--------|--------|
| `MAIL_TO` | sizin e-posta adresiniz |
| `MAIL_FROM` | ayni Gmail veya `Ad <adres@gmail.com>` |
| `SMTP_SERVER` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` | Gmail adresiniz |
| `SMTP_PASSWORD` | Gmail **Uygulama sifresi** (App Password) |

**Gmail adimlari (Turkce):**
1. Google Hesabi → Guvenlik → 2 Adimli Dogrulama acik olsun.
2. Uygulama sifreleri → Mail / Diger → yeni sifre olustur.
3. Yukaridaki secret'lari `karakaya1745.github.io` reposuna ekleyin.
4. `MAIL_TO` = bildirim almak istediginiz adres (yalnizca secret; koda yazilmaz).

Secret yoksa workflow **basarisiz olmaz**; logda uyari yazar, teklif commit'i yine yapilir.

### Yerel dry-run

```bash
node tools/stream-health-bot/generate-proposals.mjs
# veya sadece mevcut raporlardan birlestir:
node tools/stream-health-bot/generate-proposals.mjs --aggregate-only
```
