#!/usr/bin/env node
/**
 * Katalogda olmayan şifresiz (token/auth/drm'siz) M3U kanallarını bulur — yazma yok.
 *
 * Usage:
 *   node tools/stream-health-bot/discover-missing-unencrypted-channels.mjs
 *   node tools/stream-health-bot/discover-missing-unencrypted-channels.mjs --no-probe
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  M3U_KEY_ALIASES,
  PROBE_CONCURRENCY,
  atomicWriteJson,
  isTrustedCdnUrl,
  isTurkeyM3uEntry,
  loadJson,
  loadM3uSourceText,
  normalizeChannelKey,
  parseM3U,
  pooledMap,
  probeChannelPlayback,
  resolveM3uKey,
  shouldSkipM3uUrl,
  sortUrlsByQuality,
  titleFuzzyMatchesChannelName,
  toUrlArray,
  uniqueUrls,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "out");
const REPORT_JSON = path.join(OUT_DIR, "missing_unencrypted_channels.json");
const REPORT_MD = path.join(OUT_DIR, "missing_unencrypted_channels.md");

const MAX_PROBE = 40;
const FALSE_POSITIVE_TITLE = /\(romania\)|\(azerbaijan\)|\(az\)|\(de\)|\(uk\)|\(us\)|\(fr\)|\(it\)|\(es\)/i;

const TURKISH_TITLE_PATTERNS =
  /\b(trt|atv|show|star|kanal|fox|now|haberturk|ntv|tv8|beyaz|demir|360|ulke|tele1|sozcu|benguturk|halk|tbmm|flash|tv100|a2|teve2|teve\s*2|belediye|istanbul|ankara|izmir|antalya|bursa|konya|samsun|gaziantep|kocaeli|eskisehir|eskişehir|turk|türk|turkiye|türkiye|ulusal|yerel|spor|sport|bein|ssport|dsmart|tivibu)\b/i;

const args = new Set(process.argv.slice(2));
const skipProbe = args.has("--no-probe");

function getCliArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const channelsPath = getCliArg("--channels") || path.join(ROOT, "channels.json");
const streamMapPath = getCliArg("--stream-map") || path.join(ROOT, "stream_map.json");

function log(...a) {
  console.log("[missing-unencrypted]", ...a);
}

function isUnencryptedM3uUrl(url) {
  if (shouldSkipM3uUrl(url)) return false;
  const u = url.toLowerCase();
  if (u.includes("play_token")) return false;
  if (u.includes("mac=")) return false;
  if (u.includes("drm") || u.includes("widevine") || u.includes("encrypted")) return false;
  if (u.includes("username=") || u.includes("password=")) return false;
  return true;
}

function isTurkeyRelevant(entry) {
  if (isTurkeyM3uEntry(entry)) return true;
  const title = entry.cleaned || entry.title || "";
  const group = entry.groupTitle || "";
  return TURKISH_TITLE_PATTERNS.test(title) || TURKISH_TITLE_PATTERNS.test(group);
}

function loadCatalogKeys() {
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

  return { channels, catalogKeys, streamMapKeys, allKnownKeys, catalogNames };
}

function entryMatchesCatalog(entry, allKnownKeys, catalogNames) {
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

async function loadM3uSources() {
  const cfg = loadJson(path.join(__dirname, "m3u_sources.json"));
  const sorted = [...(cfg?.sources || [])].sort(
    (a, b) => (a.priority || 99) - (b.priority || 99),
  );
  const allEntries = [];
  for (const src of sorted) {
    let text = null;
    try {
      log(`M3U: ${src.id}`);
      text = await loadM3uSourceText(src, ROOT, log);
    } catch (e) {
      log(`  UYARI ${src.id}: ${e.message}`);
    }
    if (!text) continue;
    let entries = parseM3U(text);
    if (src.filterTurkey) entries = entries.filter(isTurkeyM3uEntry);
    log(`  ${entries.length} akis`);
    for (const e of entries) allEntries.push({ ...e, sourceId: src.id });
  }
  return { entries: allEntries, sourceCount: sorted.length };
}

function pickSampleUrl(urls) {
  const sorted = sortUrlsByQuality(uniqueUrls(urls));
  const trusted = sorted.filter(isTrustedCdnUrl);
  return trusted[0] || sorted[0] || "";
}

function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    const cat = item.group || "Diğer";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  }
  return Object.fromEntries(
    [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr")),
  );
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Katalogda Olmayan Şifresiz Kanallar");
  lines.push("");
  lines.push(`Oluşturulma: ${report.generatedAt}`);
  lines.push(`M3U kaynak sayısı: ${report.m3uSourceCount}`);
  lines.push(`Katalog kanal sayısı: ${report.catalogChannelCount}`);
  lines.push(`stream_map anahtar sayısı: ${report.streamMapKeyCount}`);
  lines.push(`Toplam şifresiz eksik kanal: **${report.totalCount}**`);
  if (report.probeSummary) {
    lines.push(
      `Probe özeti: ${report.probeSummary.live} çalışıyor / ${report.probeSummary.dead} çalışmıyor (${report.probeSummary.probed} adet örnek)`,
    );
  }
  lines.push("");

  const grouped = report.byCategory || {};
  const cats = Object.keys(grouped).sort((a, b) => a.localeCompare(b, "tr"));
  for (const cat of cats) {
    const items = grouped[cat];
    lines.push(`## ${cat} (${items.length})`);
    lines.push("");
    for (const ch of items) {
      const probe = ch.probeStatus ? ` — probe: ${ch.probeStatus}` : "";
      lines.push(`- **${ch.name}** | kaynak: \`${ch.sourceId}\`${probe}`);
      lines.push(`  - URL: \`${ch.sampleUrl}\``);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const now = new Date().toISOString();
  const { channels, catalogKeys, streamMapKeys, allKnownKeys, catalogNames } = loadCatalogKeys();
  log(`Katalog: ${channels.length} kanal, stream_map: ${streamMapKeys.size} anahtar`);

  const { entries: m3uEntries, sourceCount } = await loadM3uSources();
  log(`Toplam M3U akış: ${m3uEntries.length}`);

  const byKey = new Map();
  let skippedEncrypted = 0;
  let skippedInCatalog = 0;
  let skippedNotTurkey = 0;
  let skippedFalsePositive = 0;

  for (const entry of m3uEntries) {
    const title = entry.cleaned || entry.title || "";
    if (!title || title.length < 2) continue;
    if (FALSE_POSITIVE_TITLE.test(entry.title || "")) {
      skippedFalsePositive++;
      continue;
    }
    if (!isUnencryptedM3uUrl(entry.url)) {
      skippedEncrypted++;
      continue;
    }
    if (!isTurkeyRelevant(entry)) {
      skippedNotTurkey++;
      continue;
    }
    if (entryMatchesCatalog(entry, allKnownKeys, catalogNames)) {
      skippedInCatalog++;
      continue;
    }

    const key = resolveM3uKey(entry);
    if (!key) continue;

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name: title,
        group: entry.groupTitle || "Diğer",
        urls: [],
        sourceIds: new Set(),
      });
    }
    const rec = byKey.get(key);
    rec.urls.push(entry.url);
    rec.sourceIds.add(entry.sourceId);
    if (entry.groupTitle && rec.group === "Diğer") rec.group = entry.groupTitle;
  }

  let items = [...byKey.values()].map((rec) => ({
    key: rec.key,
    name: rec.name,
    group: rec.group,
    sampleUrl: pickSampleUrl(rec.urls),
    sourceId: [...rec.sourceIds].sort()[0],
    sourceIds: [...rec.sourceIds].sort(),
    urlCount: rec.urls.length,
  }));

  items.sort((a, b) => a.name.localeCompare(b.name, "tr"));

  let probeSummary = null;
  if (!skipProbe && items.length > 0) {
    const toProbe = items.slice(0, MAX_PROBE);
    log(`Probe: ${toProbe.length} / ${items.length} aday`);
    const probeResults = await pooledMap(toProbe, PROBE_CONCURRENCY, async (item) => {
      const result = await probeChannelPlayback(item.sampleUrl);
      return { key: item.key, live: result.live, reason: result.reason };
    });
    const probeMap = new Map(probeResults.map((r) => [r.key, r]));
    for (const item of items) {
      const pr = probeMap.get(item.key);
      if (pr) item.probeStatus = pr.live ? "calisiyor" : `olumsuz (${pr.reason})`;
    }
    probeSummary = {
      probed: toProbe.length,
      live: probeResults.filter((r) => r.live).length,
      dead: probeResults.filter((r) => !r.live).length,
    };
  }

  const byCategory = groupByCategory(items);

  const report = {
    generatedAt: now,
    m3uSourceCount: sourceCount,
    catalogChannelCount: channels.length,
    streamMapKeyCount: streamMapKeys.size,
    totalCount: items.length,
    skipped: {
      encryptedOrAuth: skippedEncrypted,
      inCatalog: skippedInCatalog,
      notTurkeyRelevant: skippedNotTurkey,
      falsePositiveTitle: skippedFalsePositive,
    },
    probeSummary,
    channels: items,
    byCategory,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  atomicWriteJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, toMarkdown(report), "utf8");

  log(`JSON: ${REPORT_JSON}`);
  log(`MD:   ${REPORT_MD}`);
  log(`Toplam eksik sifresiz kanal: ${items.length}`);
  log(
    `Atlanan: sifreli=${skippedEncrypted} katalogda=${skippedInCatalog} tr-degil=${skippedNotTurkey}`,
  );
}

main().catch((e) => {
  console.error("[missing-unencrypted] HATA:", e);
  process.exit(1);
});
