#!/usr/bin/env node
/**
 * M3U enrichment — mevcut stream_map kanallarına M3U kaynaklarından alternatif URL ekler.
 *
 * Güvenlik:
 *  - Varsayılan DRY-RUN (--apply olmadan yazmaz)
 *  - Mevcut URL'leri ASLA silmez (append-only)
 *  - channels.json'a dokunmaz
 *  - Yazmadan önce yedek
 *
 * Usage:
 *   node tools/stream-health-bot/enrich-stream-map.mjs
 *   node tools/stream-health-bot/enrich-stream-map.mjs --apply
 *   node tools/stream-health-bot/enrich-stream-map.mjs --no-probe --apply
 *   node tools/stream-health-bot/enrich-stream-map.mjs --stream-map stream_map.json --channels channels.json
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
  cleanM3uTitle,
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
  toUrlArray,
  uniqueUrls,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "out");
const BACKUP_ROOT = path.join(__dirname, "backups");
const REPORT_PATH = path.join(OUT_DIR, "enrich_report.json");

const MAX_NEW_PROBE_PER_CHANNEL = 3;

const args = new Set(process.argv.slice(2));
const doApply = args.has("--apply");
const skipProbe = args.has("--no-probe");

function getCliArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const customStreamMapPath = getCliArg("--stream-map") || path.join(ROOT, "stream_map.json");
const customChannelsPath = getCliArg("--channels") || path.join(ROOT, "channels.json");

function log(...a) {
  console.log("[enrich]", ...a);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function loadPrimaryStreamMap() {
  if (!fs.existsSync(customStreamMapPath)) throw new Error(`stream_map bulunamadi: ${customStreamMapPath}`);
  const raw = loadJson(customStreamMapPath, {});
  const map = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "_revision") continue;
    const urls = uniqueUrls(toUrlArray(v));
    if (urls.length) map[k] = urls;
  }
  return { file: customStreamMapPath, revision: Number(raw._revision) || 0, raw, map };
}

function loadPrimaryChannels() {
  if (!fs.existsSync(customChannelsPath)) throw new Error(`channels bulunamadi: ${customChannelsPath}`);
  const arr = loadJson(customChannelsPath, []);
  if (!Array.isArray(arr)) throw new Error("channels.json dizi degil");
  return { file: customChannelsPath, channels: arr };
}

function resolveSearchKeysForMapKey(key) {
  const keys = new Set([key]);
  for (const [alias, target] of Object.entries(M3U_KEY_ALIASES)) {
    if (target === key) keys.add(alias);
    if (alias === key && target) keys.add(target);
  }
  return [...keys];
}

/** M3U basliklarindaki ulke/on ekleri kaldir (or. "┃TR┃ TRT 1" -> "TRT 1") */
function stripM3uCountryPrefix(title) {
  return String(title || "")
    .replace(/^[^a-z0-9]*tr[^a-z0-9]*/i, "")
    .replace(/^tr(?=[a-z0-9])/i, "")
    .trim();
}

function m3uTitleToChannelKey(title) {
  const cleaned = cleanM3uTitle(title);
  const stripped = stripM3uCountryPrefix(cleaned);
  const candidates = [
    normalizeChannelKey(stripped),
    normalizeChannelKey(cleaned),
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (M3U_KEY_ALIASES[c]) return M3U_KEY_ALIASES[c];
    if (c.length >= 2) return c;
  }
  return candidates[0] || "";
}

function entryMapKeys(entry) {
  const keys = new Set();
  const add = (k) => {
    if (!k || k.length < 2) return;
    keys.add(k);
    if (M3U_KEY_ALIASES[k]) keys.add(M3U_KEY_ALIASES[k]);
  };
  add(resolveM3uKey(entry));
  add(m3uTitleToChannelKey(entry.title));
  add(m3uTitleToChannelKey(entry.cleaned || entry.title));
  add(normalizeChannelKey(stripM3uCountryPrefix(cleanM3uTitle(entry.title))));
  return [...keys];
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
  return allEntries;
}

/** Tum M3U girdileri — auth/panel ayri indeks (alternatif yoksa kullanilir) */
function buildM3uIndex(m3uEntries) {
  const byKey = new Map();
  const skippedByKey = new Map();

  const push = (map, key, item) => {
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (!list.some((x) => x.url === item.url)) list.push(item);
  };

  for (const entry of m3uEntries) {
    const mapKeys = entryMapKeys(entry);
    if (!mapKeys.length) continue;
    const item = {
      url: entry.url,
      sourceId: entry.sourceId,
      title: entry.cleaned || entry.title,
      rawTitle: entry.title || "",
      key: mapKeys[0],
      mapKeys,
      turkey: isTurkeyM3uEntry(entry),
      skipped: shouldSkipM3uUrl(entry.url),
    };
    for (const key of mapKeys) {
      if (item.skipped) push(skippedByKey, key, item);
      else push(byKey, key, item);
    }
  }

  return { byKey, skippedByKey };
}

function collectM3uCandidates(key, byKey, skippedByKey, existingSet) {
  const searchKeys = resolveSearchKeysForMapKey(key);
  const seen = new Set();
  const safe = [];
  const skipped = [];

  const addCandidate = (c, bucket) => {
    if (existingSet.has(c.url) || seen.has(c.url)) return;
    seen.add(c.url);
    bucket.push(c);
  };

  const addFrom = (map, bucket) => {
    for (const sk of searchKeys) {
      for (const c of map.get(sk) || []) addCandidate(c, bucket);
    }
  };

  addFrom(byKey, safe);
  if (!safe.length) addFrom(skippedByKey, skipped);

  const turkeySafe = safe.filter((c) => c.turkey);
  const candidates = turkeySafe.length ? turkeySafe : safe.length ? safe : skipped;
  return candidates;
}

async function probeNewUrls(urls) {
  if (!urls.length) return { live: [], results: [] };
  if (skipProbe) return { live: [], results: [] };
  const toProbe = urls.slice(0, MAX_NEW_PROBE_PER_CHANNEL);
  const results = await pooledMap(toProbe, PROBE_CONCURRENCY, async (url) => {
    const result = await probeChannelPlayback(url);
    return { url, live: result.live, reason: result.reason, status: result.status };
  });
  return {
    live: results.filter((r) => r.live).map((r) => r.url),
    results,
  };
}

function mergeEnrichedUrls(existingUrls, addedTrusted, addedProbed, addedRisky) {
  const existingTrusted = existingUrls.filter(isTrustedCdnUrl);
  const existingSafe = existingUrls.filter((u) => !isTrustedCdnUrl(u) && !isRiskyStreamUrl(u));
  const existingRisky = existingUrls.filter(isRiskyStreamUrl);

  const newTrusted = sortUrlsByQuality(uniqueUrls(addedTrusted));
  const newSafe = sortUrlsByQuality(uniqueUrls(addedProbed));
  const newRisky = sortUrlsByQuality(uniqueUrls(addedRisky));

  const trusted = uniqueUrls([...sortUrlsByQuality(existingTrusted), ...newTrusted]);
  const safe = uniqueUrls([...sortUrlsByQuality(existingSafe), ...newSafe]);
  const risky = uniqueUrls([...sortUrlsByQuality(existingRisky), ...newRisky]);

  return uniqueUrls([...trusted, ...safe, ...risky]);
}

function capWithoutRemovingExisting(existingUrls, merged) {
  if (merged.length <= MAX_URLS_PER_CHANNEL) return merged;
  const existingSet = new Set(existingUrls);
  const mustKeep = merged.filter((u) => existingSet.has(u));
  const extras = merged.filter((u) => !existingSet.has(u));
  const slots = Math.max(0, MAX_URLS_PER_CHANNEL - mustKeep.length);
  return uniqueUrls([...mustKeep, ...extras.slice(0, slots)]);
}

async function enrichChannel(key, existingUrls, byKey, skippedByKey) {
  const existingSet = new Set(existingUrls);
  const slots = Math.max(0, MAX_URLS_PER_CHANNEL - existingUrls.length);
  if (slots === 0) {
    return { key, urls: existingUrls, added: [], skippedFull: true };
  }

  const candidates = collectM3uCandidates(key, byKey, skippedByKey, existingSet);
  if (!candidates.length) {
    return { key, urls: existingUrls, added: [], skippedFull: false };
  }

  const newCandidates = sortUrlsByQuality(
    candidates.map((c) => c.url).filter((u) => !existingSet.has(u)),
  );
  const safeCandidates = newCandidates.filter((u) => !isRiskyStreamUrl(u));
  const riskyCandidates = newCandidates.filter((u) => isRiskyStreamUrl(u));

  const probeResults = [];
  let addedTrusted = [];
  let addedProbed = [];
  let addedRisky = [];

  if (!skipProbe && safeCandidates.length) {
    const safeProbe = await probeNewUrls(safeCandidates);
    const liveSafe = uniqueUrls(safeProbe.live);
    addedTrusted = liveSafe.filter(isTrustedCdnUrl);
    addedProbed = liveSafe.filter((u) => !isTrustedCdnUrl(u));
    probeResults.push(...safeProbe.results);
  }

  let merged = capWithoutRemovingExisting(
    existingUrls,
    mergeEnrichedUrls(existingUrls, addedTrusted, addedProbed, addedRisky),
  );
  let added = merged.filter((u) => !existingSet.has(u));

  if (added.length < slots && riskyCandidates.length && !skipProbe) {
    const room = slots - added.length;
    const addedSet = new Set(added);
    const riskyToTry = riskyCandidates.filter((u) => !addedSet.has(u)).slice(0, room);
    const riskyProbe = await probeNewUrls(
      riskyToTry.slice(0, Math.min(MAX_NEW_PROBE_PER_CHANNEL, room)),
    );
    addedRisky = uniqueUrls(riskyProbe.live);
    probeResults.push(...riskyProbe.results);

    merged = capWithoutRemovingExisting(
      existingUrls,
      mergeEnrichedUrls(existingUrls, addedTrusted, addedProbed, addedRisky),
    );
    added = merged.filter((u) => !existingSet.has(u));
  }

  const same =
    merged.length === existingUrls.length && merged.every((u, i) => u === existingUrls[i]);

  return {
    key,
    urls: same ? existingUrls : merged,
    added,
    probeResults,
    skippedFull: false,
    changed: !same && added.length > 0,
  };
}

function validateBeforeWrite(streamMapObj, channelsArr, prevMapKeys) {
  const keys = Object.keys(streamMapObj).filter((k) => k !== "_revision");
  if (keys.length < MIN_STREAM_MAP_KEYS) {
    throw new Error(`stream_map anahtar sayisi dusuk: ${keys.length}`);
  }
  if (!Array.isArray(channelsArr) || channelsArr.length < MIN_CHANNELS_COUNT) {
    throw new Error(`channels.json sayisi dusuk: ${channelsArr?.length}`);
  }
  if (keys.length < prevMapKeys) {
    throw new Error(`stream_map anahtar azaldi: ${prevMapKeys} -> ${keys.length}`);
  }
}

async function main() {
  const now = new Date().toISOString();
  const { channels, file: channelsFile } = loadPrimaryChannels();
  const { revision, raw: streamMapRaw, map: streamMap, file: streamMapFile } = loadPrimaryStreamMap();

  log(`Kaynak channels: ${channelsFile} (${channels.length})`);
  log(`Kaynak stream_map: ${streamMapFile} rev=${revision}`);
  log(`Mod: ${skipProbe ? "no-probe (yazma kapali)" : "probe top 3 new/channel"}`);

  const m3uEntries = await loadM3uSources();
  const { byKey, skippedByKey } = buildM3uIndex(m3uEntries);
  log(`M3U index: ${byKey.size} anahtar (+ ${skippedByKey.size} skipped)`);

  const targetKeys = Object.keys(streamMap);
  log(`Hedef kanal: ${targetKeys.length}`);

  const report = {
    generatedAt: now,
    dryRun: !doApply,
    skipProbe,
    targetCount: targetKeys.length,
    enriched: [],
    skippedFull: [],
    totalNewUrls: 0,
    enrichedCount: 0,
  };

  const nextMap = { ...streamMap };

  for (const key of targetKeys) {
    const existingUrls = streamMap[key] || [];
    const result = await enrichChannel(key, existingUrls, byKey, skippedByKey);

    if (result.skippedFull) {
      report.skippedFull.push(key);
      continue;
    }

    if (result.changed) {
      nextMap[key] = result.urls;
      report.enriched.push({
        key,
        added: result.added.length,
        urls: result.added,
        total: result.urls.length,
        probeResults: result.probeResults || [],
      });
      report.totalNewUrls += result.added.length;
      log(`+${result.added.length} ${key} (${existingUrls.length} -> ${result.urls.length})`);
    }
  }

  report.enrichedCount = report.enriched.length;

  const mapChanged = report.totalNewUrls > 0;
  const newStreamMapObj = { ...streamMapRaw };
  for (const [k, v] of Object.entries(nextMap)) {
    newStreamMapObj[k] = v;
  }
  if (mapChanged) {
    newStreamMapObj._revision = revision + 1;
  } else {
    newStreamMapObj._revision = revision;
  }

  report.streamMapRevision = newStreamMapObj._revision;
  report.mapChanged = mapChanged;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  atomicWriteJson(REPORT_PATH, report);
  log(`Rapor: ${REPORT_PATH}`);
  log(
    `Ozet: ${report.enrichedCount} kanal zenginlestirildi, +${report.totalNewUrls} URL, rev=${newStreamMapObj._revision}`,
  );

  if (!mapChanged) {
    log("Degisiklik yok.");
    if (!doApply) log("DRY-RUN tamam.");
    return;
  }

  if (!doApply) {
    log("DRY-RUN: yazmak icin --apply ekle");
    return;
  }

  validateBeforeWrite(newStreamMapObj, channels, Object.keys(streamMap).length);

  const backupDir = path.join(BACKUP_ROOT, stamp());
  backupFiles([customStreamMapPath], backupDir);
  log(`Yedek: ${backupDir}`);

  atomicWriteJson(customStreamMapPath, newStreamMapObj);
  log(`Yazildi: ${customStreamMapPath} rev=${newStreamMapObj._revision}`);
}

main().catch((e) => {
  console.error("[enrich] HATA:", e);
  process.exit(1);
});
