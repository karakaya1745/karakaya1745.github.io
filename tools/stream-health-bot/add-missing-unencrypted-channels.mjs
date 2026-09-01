#!/usr/bin/env node
/**
 * Katalogda olmayan şifresiz M3U kanallarını probe edip channels.json + stream_map.json'a ekler.
 * missing_channels.json'daki probe-geçen kanalları da ekleyebilir (--include-missing-list).
 *
 * Usage:
 *   node tools/stream-health-bot/add-missing-unencrypted-channels.mjs
 *   node tools/stream-health-bot/add-missing-unencrypted-channels.mjs --apply
 *   node tools/stream-health-bot/add-missing-unencrypted-channels.mjs --apply --include-missing-list
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  MAX_URLS_PER_CHANNEL,
  MIN_CHANNELS_COUNT,
  MIN_STREAM_MAP_KEYS,
  M3U_KEY_ALIASES,
  PROBE_CONCURRENCY,
  atomicWriteJson,
  backupFiles,
  isRiskyStreamUrl,
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
const BACKUP_ROOT = path.join(__dirname, "backups");
const MISSING_LIST_PATH = path.join(__dirname, "missing_channels.json");
const REPORT_PATH = path.join(OUT_DIR, "add_unencrypted_report.json");

const MAX_PROBE_PER_CHANNEL = 10;
const MAX_URLS_PER_NEW = 5;
const FALSE_POSITIVE_TITLE = /\(romania\)|\(azerbaijan\)|\(az\)|\(de\)|\(uk\)|\(us\)/i;
const TURKISH_TITLE_PATTERNS =
  /\b(trt|atv|show|star|kanal|fox|now|haberturk|ntv|tv8|belediye|istanbul|ankara|izmir|antalya|bursa|konya|gaziantep|spacetoon|cartoon)\b/i;

const args = new Set(process.argv.slice(2));
const doApply = args.has("--apply");
const includeMissingList = args.has("--include-missing-list");

function getCliArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const channelsPath = getCliArg("--channels") || path.join(ROOT, "channels.json");
const streamMapPath = getCliArg("--stream-map") || path.join(ROOT, "stream_map.json");

function log(...a) {
  console.log("[add-unenc]", ...a);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
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

function mapGroupToCategory(group) {
  const g = (group || "").toLowerCase();
  if (/spor|sport/.test(g)) return "Spor";
  if (/cocuk|çocuk|kids/.test(g)) return "Cocuk";
  if (/haber|news/.test(g)) return "Haber";
  if (/muzik|müzik|music/.test(g)) return "Muzik";
  if (/radyo|radio/.test(g)) return "Radyo";
  if (/yerel|local|belediye/.test(g)) return "Yerel";
  return "Yerel";
}

function loadCatalog(channels) {
  const keys = new Set(channels.map((c) => normalizeChannelKey(c.name)));
  const names = channels.map((c) => c.name);
  const allKnown = new Set(keys);
  for (const [alias, target] of Object.entries(M3U_KEY_ALIASES)) {
    if (allKnown.has(target)) allKnown.add(alias);
  }
  return { keys, allKnown, names };
}

function entryMatchesCatalog(entry, allKnown, catalogNames) {
  const resolvedKey = resolveM3uKey(entry);
  const titleKey = normalizeChannelKey(entry.cleaned || entry.title || "");
  if (allKnown.has(resolvedKey) || allKnown.has(titleKey)) return true;
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
  return allEntries;
}

function discoverMissingFromM3u(m3uEntries, allKnown, catalogNames) {
  const byKey = new Map();
  for (const entry of m3uEntries) {
    const title = entry.cleaned || entry.title || "";
    if (!title || title.length < 2) continue;
    if (FALSE_POSITIVE_TITLE.test(entry.title || "")) continue;
    if (!isUnencryptedM3uUrl(entry.url)) continue;
    if (!isTurkeyRelevant(entry)) continue;
    if (entryMatchesCatalog(entry, allKnown, catalogNames)) continue;

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
    if (!rec.urls.includes(entry.url)) rec.urls.push(entry.url);
    rec.sourceIds.add(entry.sourceId);
  }
  return [...byKey.values()];
}

function resolveSearchKeys(entry) {
  const primary = entry.key || normalizeChannelKey(entry.name);
  const keys = new Set([primary]);
  for (const a of entry.aliases || []) {
    if (a) keys.add(a);
  }
  const aliased = M3U_KEY_ALIASES[primary];
  if (aliased) keys.add(aliased);
  return [...keys];
}

function findM3uCandidatesForEntry(entry, m3uEntries) {
  const searchKeys = resolveSearchKeys(entry);
  const nameKey = normalizeChannelKey(entry.name);
  const candidates = [];
  const seen = new Set();

  for (const e of m3uEntries) {
    const title = e.cleaned || e.title || "";
    if (FALSE_POSITIVE_TITLE.test(e.title || "")) continue;
    if (shouldSkipM3uUrl(e.url)) continue;
    const titleKey = normalizeChannelKey(title);
    const resolved = resolveM3uKey(e);
    if (!searchKeys.includes(resolved) && titleKey !== nameKey) continue;
    if (!titleFuzzyMatchesChannelName(entry.name, title) && titleKey !== nameKey) continue;
    if (seen.has(e.url)) continue;
    seen.add(e.url);
    candidates.push({ url: e.url, sourceId: e.sourceId, title });
  }
  return candidates;
}

async function probeUrls(urls) {
  const toProbe = sortUrlsByQuality(uniqueUrls(urls)).slice(0, MAX_PROBE_PER_CHANNEL);
  const results = await pooledMap(toProbe, PROBE_CONCURRENCY, async (url) => {
    const result = await probeChannelPlayback(url);
    return { url, ...result };
  });
  const live = sortUrlsByQuality(results.filter((r) => r.live).map((r) => r.url));
  const trusted = live.filter(isTrustedCdnUrl);
  const safe = live.filter((u) => !isRiskyStreamUrl(u));
  const risky = live.filter(isRiskyStreamUrl);
  const picked = uniqueUrls([...trusted, ...safe, ...risky]).slice(0, MAX_URLS_PER_NEW);
  return { picked, results, probedCount: toProbe.length };
}

function validateBeforeWrite(streamMapObj, channelsArr, prevChannelCount, prevMapKeys) {
  const keys = Object.keys(streamMapObj).filter((k) => k !== "_revision");
  if (keys.length < MIN_STREAM_MAP_KEYS) throw new Error(`stream_map anahtar dusuk: ${keys.length}`);
  if (!Array.isArray(channelsArr) || channelsArr.length < MIN_CHANNELS_COUNT) {
    throw new Error(`channels sayisi dusuk: ${channelsArr?.length}`);
  }
  if (channelsArr.length < prevChannelCount) {
    throw new Error(`channels azaldi: ${prevChannelCount} -> ${channelsArr.length}`);
  }
  if (keys.length < prevMapKeys) {
    throw new Error(`stream_map anahtar azaldi: ${prevMapKeys} -> ${keys.length}`);
  }
}

async function main() {
  const now = new Date().toISOString();
  const channels = loadJson(channelsPath, []);
  const streamMapRaw = loadJson(streamMapPath, {});
  const streamMap = {};
  for (const [k, v] of Object.entries(streamMapRaw)) {
    if (k === "_revision") continue;
    const urls = uniqueUrls(toUrlArray(v));
    if (urls.length) streamMap[k] = urls;
  }
  const revision = Number(streamMapRaw._revision) || 0;
  const { keys: existingKeys, allKnown, names: catalogNames } = loadCatalog(channels);

  const m3uEntries = await loadM3uSources();
  let candidates = discoverMissingFromM3u(m3uEntries, allKnown, catalogNames);

  if (includeMissingList) {
    const missingList = loadJson(MISSING_LIST_PATH, { channels: [] }).channels || [];
    for (const entry of missingList) {
      if (entry.skip) continue;
      const mapKey = normalizeChannelKey(entry.name);
      if (existingKeys.has(mapKey)) continue;
      const m3uCands = findM3uCandidatesForEntry(entry, m3uEntries);
      if (!m3uCands.length) continue;
      const existing = candidates.find((c) => c.key === mapKey);
      if (existing) {
        for (const c of m3uCands) {
          if (!existing.urls.includes(c.url)) existing.urls.push(c.url);
        }
      } else {
        candidates.push({
          key: mapKey,
          name: entry.name,
          group: entry.category || "Diğer",
          urls: m3uCands.map((c) => c.url),
          sourceIds: new Set(m3uCands.map((c) => c.sourceId)),
          fromMissingList: true,
        });
      }
    }
  }

  candidates.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  log(`Aday kanal: ${candidates.length}`);

  const report = {
    generatedAt: now,
    dryRun: !doApply,
    candidates: candidates.length,
    added: [],
    skipped: [],
    failed: [],
  };

  const nextChannels = [...channels];
  const nextMap = { ...streamMap };

  for (const cand of candidates) {
    if (existingKeys.has(cand.key)) {
      report.skipped.push({ name: cand.name, reason: "zaten var" });
      continue;
    }

    log(`--- ${cand.name} (${cand.urls.length} URL)`);
    const { picked, results, probedCount } = await probeUrls(cand.urls);

    if (!picked.length) {
      report.failed.push({
        name: cand.name,
        key: cand.key,
        urlCount: cand.urls.length,
        probedCount,
        probeResults: results,
      });
      log(`  ATLA probe basarisiz (${probedCount} denendi)`);
      continue;
    }

    const category = mapGroupToCategory(cand.group);
    const channelObj = {
      name: cand.name,
      url: "",
      category,
      streamUrl: picked[0],
    };

    nextChannels.push(channelObj);
    existingKeys.add(cand.key);
    allKnown.add(cand.key);
    nextMap[cand.key] = picked.slice(0, MAX_URLS_PER_CHANNEL);

    report.added.push({
      name: cand.name,
      key: cand.key,
      category,
      urls: picked,
      probedCount,
      probeResults: results.filter((r) => r.live),
    });
    log(`  +EKLE ${cand.name} urls=${picked.length}`);
  }

  const mapChanged = report.added.length > 0;
  const newStreamMapObj = { ...streamMapRaw, ...nextMap };
  if (mapChanged) newStreamMapObj._revision = revision + 1;
  else newStreamMapObj._revision = revision;

  report.addedCount = report.added.length;
  report.failedCount = report.failed.length;
  report.streamMapRevision = newStreamMapObj._revision;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  atomicWriteJson(REPORT_PATH, report);
  log(`Rapor: ${REPORT_PATH}`);
  log(`Ozet: +${report.addedCount} eklendi, ${report.failedCount} probe basarisiz`);

  if (!mapChanged) {
    log("Degisiklik yok.");
    return;
  }

  if (!doApply) {
    log("DRY-RUN: yazmak icin --apply ekle");
    return;
  }

  validateBeforeWrite(
    newStreamMapObj,
    nextChannels,
    channels.length,
    Object.keys(streamMap).length,
  );

  const backupDir = path.join(BACKUP_ROOT, stamp());
  backupFiles([channelsPath, streamMapPath], backupDir);
  log(`Yedek: ${backupDir}`);

  atomicWriteJson(streamMapPath, newStreamMapObj);
  atomicWriteJson(channelsPath, nextChannels);
  log(`Yazildi: ${channelsPath} (${nextChannels.length} kanal)`);
  log(`Yazildi: ${streamMapPath} rev=${newStreamMapObj._revision}`);
}

main().catch((e) => {
  console.error("[add-unenc] HATA:", e);
  process.exit(1);
});
