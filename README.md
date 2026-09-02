# karakaya1745.github.io

Canlı TV kanal kataloğu (`channels.json`, `stream_map.json`).

## Stream Health Bot — GitHub Actions

Botlar **3 günde bir** çalışır (UTC, sırayla). Manuel tetikleme: Actions → workflow → **Run workflow**.

| Workflow | Cron (UTC) | TR (UTC+3) |
|----------|------------|------------|
| stream-health | `0 2 */3 * *` | 05:00 |
| discover-missing | `0 3 */3 * *` | 06:00 |
| enrich-stream-map | `0 4 */3 * *` | 07:00 |
| import-legal-channels | `0 5 */3 * *` | 08:00 |

Ayın günleri: 1, 4, 7, 10, 13, 16, 19, 22, 25, 28.
