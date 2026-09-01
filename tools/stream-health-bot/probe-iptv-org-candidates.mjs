#!/usr/bin/env node
/**
 * iptv-org kategori M3U taraması — eksik kanal adayları + probe (yazma yok).
 *
 * Usage:
 *   node --use-system-ca tools/stream-health-bot/probe-iptv-org-candidates.mjs
 *   node --use-system-ca tools/stream-health-bot/probe-iptv-org-candidates.mjs --limit 60
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  M3U_KEY_ALIASES,
  PROBE_CONCURRENCY,
  atomicWriteJson,
  cleanM3uTitle,
  fetchText,
  isPanelIptvUrl,
  isRiskyStreamUrl,
  isTrustedCdnUrl,
  isTurkeyM3uEntry,
  loadJson,
  normalizeChannelKey,
  parseM3U,
  pooledMap,
  probeChannelPlayback,
  resolveM3uKey,
  shouldSkipM3uUrl,
  sortUrlsByQuality,
  titleFuzzyMatchesChannelName,
  uniqueUrls,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "out");
const MISSING_PATH = path.join(__dirname, "missing_channels.json");
const REPORT_JSON = path.join(OUT_DIR, "iptv_org_candidates.json");
const REPORT_MD = path.join(OUT_DIR, "iptv_org_candidates.md");

const IPTV_ORG_SOURCES = [
  { id: "iptv-org-tr", url: "https://iptv-org.github.io/iptv/countries/tr.m3u", defaultCategory: "Ulusal", turkeyOnly: true },
  { id: "iptv-org-animation", url: "https://iptv-org.github.io/iptv/categories/animation.m3u", defaultCategory: "Cocuk" },
  { id: "iptv-org-kids", url: "https://iptv-org.github.io/iptv/categories/kids.m3u", defaultCategory: "Cocuk" },
  { id: "iptv-org-news", url: "https://iptv-org.github.io/iptv/categories/news.m3u", defaultCategory: "Haber" },
  { id: "iptv-org-general", url: "https://iptv-org.github.io/iptv/categories/general.m3u", defaultCategory: "Ulusal" },
  { id: "iptv-org-entertainment", url: "https://iptv-org.github.io/iptv/categories/entertainment.m3u", defaultCategory: "Diger" },
  { id: "iptv-org-sports", url: "https://iptv-org.github.io/iptv/categories/sports.m3u", defaultCategory: "Spor" },
  { id: "iptv-org-documentary", url: "https://iptv-org.github.io/iptv/categories/documentary.m3u", defaultCategory: "Belgesel" },
  { id: "iptv-org-religious", url: "https://iptv-org.github.io/iptv/categories/religious.m3u", defaultCategory: "Dini" },
  { id: "iptv-org-music", url: "https://iptv-org.github.io/iptv/categories/music.m3u", defaultCategory: "Muzik" },
  { id: "iptv-org-education", url: "https://iptv-org.github.io/iptv/categories/education.m3u", defaultCategory: "Egitim" },
];

const MAX_PROBE_PER_CHANNEL = 4;
const DEFAULT_TOP = 50;

const FALSE_POSITIVE_TITLE =
  /\(romania\)|\(azerbaijan\)|\(az\)|\(de\)|\(uk\)|\(us\)|\(fr\)|\(it\)|\(es\)|\(ru\)|\(pl\)|\(gr\)/i;
const SKIP_TITLE =
  /\b(xxx|adult|porn|erotic|shop|shopping|qvc|hsn|teleshop|casino|bet|bahis|rulet|poker|\+18|18\+)\b/i;
const PAID_NAME_PATTERNS = [/bein/i, /ssport/i, /tivibu/i, /dsmart/i, /sky\s*sport/i, /espn\+/i];
const TURKISH_TITLE_PATTERNS =
  /\b(trt|atv|show|star|kanal|fox|now|haberturk|ntv|tv8|beyaz|demir|360|ulke|tele1|sozcu|benguturk|halk|tbmm|flash|tv100|a2|teve2|teve\s*2|belediye|istanbul|ankara|izmir|antalya|bursa|konya|samsun|gaziantep|kocaeli|eskisehir|eskişehir|turk|türk|turkiye|türkiye|ulusal|yerel|rumeli|kibris|kıbrıs|kibris|diyanet|mevlana|agro|ekin|gonca|bitlis|denizli|tokat|gaziantep|pamukkale|vizyon|kadirga|fmtv|deha|ege|inter\s*az|brt)\b/i;
const USEFUL_INTL_PATTERNS =
  /\b(cartoon\s*network|nickelodeon|disney|boomerang|cbeebies|baby\s*tv|paw\s*patrol|cn\s*arabic|bbc\s*news|cnn|al\s*jazeera|france\s*24|dw\s*(english|deutsch)?|euronews|sky\s*news|rt\s*news|red\s*bull\s*tv|olympic|national\s*geographic|nat\s*geo|discovery|animal\s*planet|history\s*channel|smithsonian|nasa\s*tv|cgtn|wion|ndtv|aaj\s*tak|geo\s*news|fox\s*news|msnbc|bloomberg|cnbc)\b/i;

const args = new Set(process.argv.slice(2));

function getCliArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const channelsPath =
  getCliArg("--channels") ||
  path.join(ROOT, "..", "karakaya1745.github.io", "channels.json");
const streamMapPath = getCliArg("--stream-map") || path.join(ROOT, "stream_map.json");
const topLimit = Number(getCliArg("--limit") || DEFAULT_TOP);

function log(...a) {
  console.log("[iptv-org]", ...a);
}

function stripM3uCountryPrefix(title) {
  return String(title || "")
    .replace(/^[^a-z0-9]*tr[^a-z0-9]*/i, "")
    .replace(/^tr(?=[a-z0-9])/i, "")
    .trim();
}

function displayNameFromM3u(entry) {
  const cleaned = cleanM3uTitle(entry.cleaned || entry.title || "");
  const stripped = stripM3uCountryPrefix(cleaned);
  return stripped || cleaned || entry.title || "";
}

function mapCategory(groupTitle, title, defaultCategory) {
  const g = (groupTitle || "").toLowerCase();
  const t = (title || "").toLowerCase();
  if (/spor|sport/.test(g) || /spor|sport/.test(t)) return "Spor";
  if (/haber|news/.test(g) || /haber|news/.test(t)) return "Haber";
  if (/cocuk|çocuk|kids|cartoon|animation/.test(g) || /cocuk|çocuk|cartoon|spacetoon|nickelodeon|disney/.test(t))
    return "Cocuk";
  if (/dini|islam|religious/.test(g) || /dini|mevlana|diyanet|islam/.test(t)) return "Dini";
  if (/muzik|müzik|music/.test(g)) return "Muzik";
  if (/belgesel|documentary/.test(g)) return "Belgesel";
  if (/education|egitim|eğitim/.test(g)) return "Egitim";
  if (/trt|kamu|tbmm/.test(t)) return "Kamu";
  if (/radyo|radio|fm\b/.test(t)) return "Radyo Yerel";
  return defaultCategory || "Ulusal";
}

function isTurkeyRelevant(entry) {
  if (isTurkeyM3uEntry(entry)) return true;
  const title = entry.cleaned || entry.title || "";
  const group = entry.groupTitle || "";
  return TURKISH_TITLE_PATTERNS.test(title) || TURKISH_TITLE_PATTERNS.test(group);
}

function isUsefulInternational(entry) {
  const title = entry.cleaned || entry.title || "";
  const group = entry.groupTitle || "";
  return USEFUL_INTL_PATTERNS.test(title) || USEFUL_INTL_PATTERNS.test(group);
}

function isPaidChannel(title) {
  return PAID_NAME_PATTERNS.some((re) => re.test(title));
}

function loadCatalog() {
  const channels = loadJson(channelsPath, []);
  if (!Array.isArray(channels)) throw new Error("channels.json dizi degil");

  const catalogKeys = new Set();
  const catalogNames = [];
  for (const ch of channels) {
    const key = normalizeChannelKey(ch.name || "");
    if (key) catalogKeys.add(key);
    catalogNames.push(ch.name || "");
  }

  const streamMapRaw = loadJson(streamMapPath, {});
  const streamMapKeys = new Set();
  for (const k of Object.keys(streamMapRaw)) {
    if (k === "_revision") continue;
    streamMapKeys.add(k);
  }

  const allKnownKeys = new Set([...catalogKeys, ...streamMapKeys]);
  for (const [alias, target] of Object.entries(M3U_KEY_ALIASES)) {
    if (allKnownKeys.has(target)) allKnownKeys.add(alias);
  }
  for (const k of [...allKnownKeys]) {
    const aliased = M3U_KEY_ALIASES[k];
    if (aliased) allKnownKeys.add(aliased);
  }

  return { channels, catalogKeys, allKnownKeys, catalogNames, channelCount: channels.length };
}

function entryInCatalog(entry, allKnownKeys, catalogNames) {
  const resolvedKey = resolveM3uKey(entry);
  const titleKey = normalizeChannelKey(entry.cleaned || entry.title || "");

  if (allKnownKeys.has(resolvedKey) || allKnownKeys.has(titleKey)) return true;

  const aliasedResolved = M3U_KEY_ALIASES[resolvedKey];
  const aliasedTitle = M3U_KEY_ALIASES[titleKey];
  if (aliasedResolved && allKnownKeys.has(aliasedResolved)) return true;
  if (aliasedTitle && allKnownKeys.has(aliasedTitle)) return true;

  const title = entry.cleaned || entry.title || "";
  for (const name of catalogNames) {
    if (titleFuzzyMatchesChannelName(name, title)) return true;
  }
  return false;
}

function loadTkgsMissing() {
  const data = loadJson(MISSING_PATH, { channels: [] });
  const list = (data.channels || []).filter((c) => !c.skip);
  const byKey = new Map();
  for (const ch of list) {
    const keys = new Set([normalizeChannelKey(ch.name)]);
    for (const a of ch.aliases || []) keys.add(a);
    for (const k of keys) byKey.set(k, ch.name);
  }
  return { list, byKey };
}

function matchTkgsMissing(name, byKey) {
  const key = normalizeChannelKey(name);
  if (byKey.has(key)) return byKey.get(key);
  // Sadece alias/exact key — geniş fuzzy eşleşme yanlış pozitif üretir
  return null;
}

function candidateScore(cand) {
  let score = 0;
  if (cand.probe?.live) score += 1000;
  if (cand.tkgsMissing) score += 500;
  if (cand.turkeyRelevant) score += 200;
  if (isTrustedCdnUrl(cand.url)) score += 100;
  if (cand.sourceId === "iptv-org-tr") score += 80;
  if (cand.category === "Ulusal") score += 50;
  if (cand.category === "Cocuk" || cand.category === "Haber") score += 40;
  if (isPanelIptvUrl(cand.url)) score -= 30;
  if (isRiskyStreamUrl(cand.url)) score -= 200;
  return score;
}

function buildMarkdown(report) {
  const lines = [
    "# iptv-org Eksik Kanal Adayları",
    "",
    `Oluşturulma: ${report.generatedAt}`,
    `Katalog: ${report.channelCount} kanal`,
    `Taranan kaynak: ${report.sourceCount}`,
    `Ham aday: ${report.rawCandidateCount}`,
    `Probe edilen: ${report.probedCount}`,
    `Çalışan (✅): ${report.workingCount}`,
    "",
    "## Özet",
    "",
    "| Metrik | Adet |",
    "|--------|------|",
    `| TKGS eksik eşleşme | ${report.tkgsMatchCount} |`,
    `| Türk kanal | ${report.turkishCount} |`,
    `| Uluslararası (haber/çocuk/spor) | ${report.intlCount} |`,
    "",
    "## Eklenebilir Adaylar (probe ✅)",
    "",
    "Onay için: `ekle <#>` veya `ekle <kanal adı>`",
    "",
    "| # | Kanal | Kategori | URL | Probe | TKGS eksik? |",
    "|---|-------|----------|-----|-------|-------------|",
  ];

  for (const c of report.topCandidates) {
    const probe = c.probe?.live ? `✅ ${c.probe.reason}` : `❌ ${c.probe?.reason || "?"}`;
    const tkgs = c.tkgsMissing ? `✅ ${c.tkgsMissing}` : "—";
    const urlShort = c.url.length > 70 ? `${c.url.slice(0, 67)}...` : c.url;
    lines.push(`| ${c.rank} | ${c.name} | ${c.category} | \`${urlShort}\` | ${probe} | ${tkgs} |`);
  }

  if (report.failedNotable?.length) {
    lines.push("", "## Önemli ama probe başarısız", "");
    lines.push("| Kanal | Kategori | Probe | TKGS eksik? |");
    lines.push("|-------|----------|-------|-------------|");
    for (const c of report.failedNotable.slice(0, 20)) {
      const tkgs = c.tkgsMissing ? `✅ ${c.tkgsMissing}` : "—";
      lines.push(`| ${c.name} | ${c.category} | ❌ ${c.probe?.reason || "?"} | ${tkgs} |`);
    }
  }

  lines.push("", "---", "_Bu rapor otomatik üretildi. channels.json'a yazılmadı._");
  return lines.join("\n");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  log("Katalog yükleniyor:", channelsPath);
  const catalog = loadCatalog();
  log(`  ${catalog.channelCount} kanal`);

  const { byKey: tkgsByKey, list: tkgsList } = loadTkgsMissing();
  log(`  ${tkgsList.length} TKGS eksik kanal`);

  const candidateMap = new Map();
  let rawCandidateCount = 0;

  for (const src of IPTV_ORG_SOURCES) {
    log(`İndiriliyor: ${src.id}`);
    let text;
    try {
      text = await fetchText(src.url);
    } catch (e) {
      log(`  HATA: ${e.message}`);
      continue;
    }
    const entries = parseM3U(text);
    log(`  ${entries.length} akış`);

    for (const entry of entries) {
      const title = displayNameFromM3u(entry);
      if (!title || title.length < 2) continue;
      if (FALSE_POSITIVE_TITLE.test(entry.title || "")) continue;
      if (SKIP_TITLE.test(entry.title || "") || SKIP_TITLE.test(entry.groupTitle || "")) continue;
      if (isPaidChannel(title)) continue;
      if (shouldSkipM3uUrl(entry.url)) continue;

      const turkeyRelevant = isTurkeyRelevant(entry);
      const usefulIntl = isUsefulInternational(entry);

      if (src.turkeyOnly) {
        if (!turkeyRelevant && !isTurkeyM3uEntry(entry)) continue;
      } else if (!turkeyRelevant && !usefulIntl) {
        continue;
      }

      if (entryInCatalog(entry, catalog.allKnownKeys, catalog.catalogNames)) continue;

      const name = title;
      const key = normalizeChannelKey(name);
      if (!key || key.length < 2) continue;

      const category = mapCategory(entry.groupTitle, name, src.defaultCategory);
      const tkgsMissing = matchTkgsMissing(name, tkgsByKey);

      rawCandidateCount++;
      const item = {
        name,
        key,
        url: entry.url,
        category,
        sourceId: src.id,
        groupTitle: entry.groupTitle || "",
        tvgId: entry.tvgId || "",
        turkeyRelevant,
        usefulIntl,
        tkgsMissing,
      };

      if (!candidateMap.has(key)) {
        candidateMap.set(key, { ...item, urls: [entry.url] });
      } else {
        const existing = candidateMap.get(key);
        if (!existing.urls.includes(entry.url)) existing.urls.push(entry.url);
        if (tkgsMissing && !existing.tkgsMissing) existing.tkgsMissing = tkgsMissing;
      }
    }
  }

  log(`Ham aday (benzersiz kanal): ${candidateMap.size}`);

  const toProbe = [...candidateMap.values()].map((c) => ({
    ...c,
    urls: sortUrlsByQuality(uniqueUrls(c.urls)),
  }));

  toProbe.sort((a, b) => {
    const sa = (a.tkgsMissing ? 500 : 0) + (a.turkeyRelevant ? 200 : 0) + (a.usefulIntl ? 100 : 0);
    const sb = (b.tkgsMissing ? 500 : 0) + (b.turkeyRelevant ? 200 : 0) + (b.usefulIntl ? 100 : 0);
    return sb - sa;
  });

  const probeBatch = toProbe.slice(0, Math.min(toProbe.length, topLimit * 3));
  log(`Probe: ${probeBatch.length} kanal (kanal başı max ${MAX_PROBE_PER_CHANNEL} URL)`);

  const probed = await pooledMap(probeBatch, PROBE_CONCURRENCY, async (cand) => {
    const urls = cand.urls.slice(0, MAX_PROBE_PER_CHANNEL);
    let best = null;
    const attempts = [];
    for (const url of urls) {
      const result = await probeChannelPlayback(url);
      attempts.push({ url, ...result });
      if (result.live) {
        best = { url, probe: result };
        break;
      }
    }
    return {
      ...cand,
      url: best?.url || urls[0],
      probe: best?.probe || attempts[attempts.length - 1] || { live: false, reason: "no-url" },
      attempts,
    };
  });

  const working = probed.filter((c) => c.probe?.live);
  const failed = probed.filter((c) => !c.probe?.live);

  working.sort((a, b) => candidateScore(b) - candidateScore(a));
  failed.sort((a, b) => candidateScore(b) - candidateScore(a));

  const topCandidates = working.slice(0, topLimit).map((c, i) => ({
    rank: i + 1,
    name: c.name,
    key: c.key,
    category: c.category,
    url: c.url,
    sourceId: c.sourceId,
    groupTitle: c.groupTitle,
    tvgId: c.tvgId,
    turkeyRelevant: c.turkeyRelevant,
    usefulIntl: c.usefulIntl,
    tkgsMissing: c.tkgsMissing,
    probe: c.probe,
    altUrls: c.urls.filter((u) => u !== c.url).slice(0, 3),
  }));

  const failedNotable = failed
    .filter((c) => c.tkgsMissing || c.turkeyRelevant)
    .slice(0, 30)
    .map((c) => ({
      name: c.name,
      category: c.category,
      url: c.url,
      tkgsMissing: c.tkgsMissing,
      probe: c.probe,
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    channelCount: catalog.channelCount,
    sourceCount: IPTV_ORG_SOURCES.length,
    rawCandidateCount,
    uniqueCandidateCount: candidateMap.size,
    probedCount: probed.length,
    workingCount: working.length,
    tkgsMatchCount: topCandidates.filter((c) => c.tkgsMissing).length,
    turkishCount: topCandidates.filter((c) => c.turkeyRelevant).length,
    intlCount: topCandidates.filter((c) => c.usefulIntl).length,
    topCandidates,
    failedNotable,
    allWorking: working.map((c) => ({
      name: c.name,
      key: c.key,
      category: c.category,
      url: c.url,
      tkgsMissing: c.tkgsMissing,
      probe: c.probe,
      sourceId: c.sourceId,
    })),
  };

  atomicWriteJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, buildMarkdown(report), "utf8");

  log(`Rapor: ${REPORT_MD}`);
  log(`JSON: ${REPORT_JSON}`);
  log(`✅ Çalışan: ${working.length} / ${probed.length} probe`);
  log(`TOP ${topCandidates.length} aday yazıldı`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
