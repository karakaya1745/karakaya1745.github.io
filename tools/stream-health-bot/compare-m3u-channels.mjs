#!/usr/bin/env node
/**
 * M3U kaynakları vs channels.json karşılaştırması — eksik kanal listesi (yazma yok).
 *
 * Usage:
 *   node tools/stream-health-bot/compare-m3u-channels.mjs
 *   node tools/stream-health-bot/compare-m3u-channels.mjs --channels channels.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  M3U_KEY_ALIASES,
  isTurkeyM3uEntry,
  loadJson,
  loadM3uSourceText,
  normalizeChannelKey,
  parseM3U,
  resolveM3uKey,
  shouldSkipM3uUrl,
  titleFuzzyMatchesChannelName,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "out");
const REPORT_MD = path.join(OUT_DIR, "missing_channels_comparison.md");
const REPORT_JSON = path.join(OUT_DIR, "missing_channels_comparison.json");

const FALSE_POSITIVE_TITLE = /\(romania\)|\(azerbaijan\)|\(az\)|\(de\)|\(uk\)|\(us\)|\(fr\)/i;
const TURKISH_TITLE_PATTERNS =
  /\b(trt|atv|show|star|kanal|fox|now|haberturk|ntv|tv8|beyaz|belediye|istanbul|ankara|izmir|antalya|bursa|konya|gaziantep|turk|türk|spacetoon|cartoon)\b/i;

function getCliArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const channelsPath = getCliArg("--channels") || path.join(ROOT, "channels.json");

function log(...a) {
  console.log("[compare]", ...a);
}

function isUnencryptedM3uUrl(url) {
  if (shouldSkipM3uUrl(url)) return false;
  const u = url.toLowerCase();
  if (u.includes("drm") || u.includes("widevine")) return false;
  return true;
}

function isTurkeyRelevant(entry) {
  if (isTurkeyM3uEntry(entry)) return true;
  const title = entry.cleaned || entry.title || "";
  const group = entry.groupTitle || "";
  return TURKISH_TITLE_PATTERNS.test(title) || TURKISH_TITLE_PATTERNS.test(group);
}

function loadCatalogKeys(channels) {
  const catalogKeys = new Set();
  const catalogNames = [];
  for (const ch of channels) {
    const key = normalizeChannelKey(ch.name || "");
    if (key) catalogKeys.add(key);
    catalogNames.push(ch.name || "");
  }
  const allKnownKeys = new Set(catalogKeys);
  for (const [alias, target] of Object.entries(M3U_KEY_ALIASES)) {
    if (allKnownKeys.has(target)) allKnownKeys.add(alias);
  }
  for (const k of [...allKnownKeys]) {
    const aliased = M3U_KEY_ALIASES[k];
    if (aliased) allKnownKeys.add(aliased);
  }
  return { catalogKeys, allKnownKeys, catalogNames };
}

function entryMatchesCatalog(entry, allKnownKeys, catalogNames) {
  const resolvedKey = resolveM3uKey(entry);
  const titleKey = normalizeChannelKey(entry.cleaned || entry.title || "");
  if (allKnownKeys.has(resolvedKey) || allKnownKeys.has(titleKey)) return true;
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
    for (const e of entries) allEntries.push({ ...e, sourceId: src.id });
  }
  return { entries: allEntries, sourceCount: sorted.length };
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# M3U vs Katalog Karşılaştırması");
  lines.push("");
  lines.push(`Oluşturulma: ${report.generatedAt}`);
  lines.push(`M3U kaynak sayısı: ${report.m3uSourceCount}`);
  lines.push(`Katalog kanal sayısı: ${report.catalogChannelCount}`);
  lines.push(`Toplam eksik (şifresiz): **${report.missingCount}**`);
  lines.push(`Toplam eksik (tüm): **${report.missingAllCount}**`);
  lines.push("");

  lines.push("## Eksik şifresiz kanallar");
  lines.push("");
  if (!report.missingUnencrypted.length) {
    lines.push("_Yok._");
  } else {
    for (const ch of report.missingUnencrypted) {
      lines.push(`- **${ch.name}** (${ch.group}) — kaynak: \`${ch.sourceId}\`, URL: ${ch.urlCount}`);
    }
  }

  lines.push("");
  lines.push("## Eksik (şifreli dahil, katalogda yok)");
  lines.push("");
  if (!report.missingAll.length) {
    lines.push("_Yok._");
  } else {
    for (const ch of report.missingAll.slice(0, 100)) {
      lines.push(`- **${ch.name}** (${ch.group})`);
    }
    if (report.missingAll.length > 100) {
      lines.push(`- _... ve ${report.missingAll.length - 100} kanal daha_`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const now = new Date().toISOString();
  const channels = loadJson(channelsPath, []);
  const { allKnownKeys, catalogNames } = loadCatalogKeys(channels);
  const { entries, sourceCount } = await loadM3uSources();

  const byKeyAll = new Map();
  const byKeyUnenc = new Map();

  for (const entry of entries) {
    const title = entry.cleaned || entry.title || "";
    if (!title || title.length < 2) continue;
    if (FALSE_POSITIVE_TITLE.test(entry.title || "")) continue;
    if (entryMatchesCatalog(entry, allKnownKeys, catalogNames)) continue;

    const key = resolveM3uKey(entry);
    if (!key) continue;

    if (!byKeyAll.has(key)) {
      byKeyAll.set(key, {
        key,
        name: title,
        group: entry.groupTitle || "Diğer",
        urls: [],
        sourceIds: new Set(),
      });
    }
    const rec = byKeyAll.get(key);
    rec.urls.push(entry.url);
    rec.sourceIds.add(entry.sourceId);

    if (isUnencryptedM3uUrl(entry.url) && isTurkeyRelevant(entry)) {
      if (!byKeyUnenc.has(key)) {
        byKeyUnenc.set(key, { ...rec, urls: [], sourceIds: new Set() });
      }
      const urec = byKeyUnenc.get(key);
      urec.urls.push(entry.url);
      urec.sourceIds.add(entry.sourceId);
    }
  }

  const mapItems = (map) =>
    [...map.values()]
      .map((rec) => ({
        key: rec.key,
        name: rec.name,
        group: rec.group,
        urlCount: rec.urls.length,
        sourceId: [...rec.sourceIds].sort()[0],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const missingUnencrypted = mapItems(byKeyUnenc);
  const missingAll = mapItems(byKeyAll);

  const report = {
    generatedAt: now,
    m3uSourceCount: sourceCount,
    catalogChannelCount: channels.length,
    missingCount: missingUnencrypted.length,
    missingAllCount: missingAll.length,
    missingUnencrypted,
    missingAll,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT_MD, toMarkdown(report), "utf8");
  log(`MD:   ${REPORT_MD}`);
  log(`JSON: ${REPORT_JSON}`);
  log(`Eksik sifresiz: ${missingUnencrypted.length}, toplam eksik: ${missingAll.length}`);
}

main().catch((e) => {
  console.error("[compare] HATA:", e);
  process.exit(1);
});
