#!/usr/bin/env node
/**
 * Eksik kanal keşfi — M3U kaynaklarından channels.json + stream_map.json'a ekler.
 *
 * Güvenlik:
 *  - Varsayılan DRY-RUN (--apply olmadan yazmaz)
 *  - Mevcut kanalları silmez / üzerine yazmaz
 *  - stream_map mevcut anahtarlara sadece alternatif URL ekler
 *  - Yazmadan önce yedek
 *
 * Usage:
 *   node tools/stream-health-bot/discover-missing-channels.mjs
 *   node tools/stream-health-bot/discover-missing-channels.mjs --apply
 *   node tools/stream-health-bot/discover-missing-channels.mjs --stream-map stream_map.json --channels channels.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  MAX_M3U_CANDIDATES_PROBE,
  MIN_CHANNELS_COUNT,
  MIN_STREAM_MAP_KEYS,
  M3U_KEY_ALIASES,
  PROBE_CONCURRENCY,
  atomicWriteJson,
  backupFiles,
  checkUrlLive,
  fetchText,
  loadM3uSourceText,
  isRiskyStreamUrl,
  isTrustedCdnUrl,
  isTurkeyM3uEntry,
  loadJson,
  normalizeChannelKey,
  parseM3U,
  pooledMap,
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
const MISSING_PATH = path.join(__dirname, "missing_channels.json");
const REPORT_PATH = path.join(OUT_DIR, "discover_report.json");

const MAX_URLS_PER_NEW_CHANNEL = 3;
const PAID_NAME_PATTERNS = [/bein/i, /ssport/i, /tivibu/i, /dsmart/i];

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
const customMissingPath = getCliArg("--missing") || MISSING_PATH;

function log(...a) {
  console.log("[discover]", ...a);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function isPaidChannel(entry) {
  if (entry.skip) return true;
  if (entry.skipReason === "paid-subscription") return true;
  return PAID_NAME_PATTERNS.some((re) => re.test(entry.name || ""));
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

function channelExists(entry, existingKeys) {
  const keys = resolveSearchKeys(entry);
  if (keys.some((k) => existingKeys.has(k))) return true;
  for (const sk of entry.skipIfKeysExist || []) {
    if (existingKeys.has(sk)) return true;
  }
  return false;
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
  const keys = new Set(arr.map((c) => normalizeChannelKey(c.name)));
  return { file: customChannelsPath, channels: arr, keys };
}

function loadMissingList() {
  const data = loadJson(customMissingPath, { channels: [] });
  return data.channels || [];
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

function buildM3uIndex(m3uEntries) {
  const byKey = new Map();
  for (const entry of m3uEntries) {
    const key = resolveM3uKey(entry);
    if (!key) continue;
    if (shouldSkipM3uUrl(entry.url)) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    const list = byKey.get(key);
    if (!list.some((x) => x.url === entry.url)) {
      list.push({
        url: entry.url,
        sourceId: entry.sourceId,
        title: entry.cleaned || entry.title,
        rawTitle: entry.title || "",
        key,
        turkey: isTurkeyM3uEntry(entry),
      });
    }
  }
  return byKey;
}

const FALSE_POSITIVE_TITLE = /\(romania\)|\(azerbaijan\)|\(az\)|\(de\)|\(uk\)|\(us\)/i;

function isRelevantCandidate(entry, candidate) {
  const title = candidate.title || "";
  if (FALSE_POSITIVE_TITLE.test(title)) return false;
  const nameKey = normalizeChannelKey(entry.name);
  const titleKey = normalizeChannelKey(title);
  if (titleKey === nameKey) return true;
  const resolved = candidate.key || "";
  return resolveSearchKeys(entry).includes(resolved);
}

function findM3uCandidates(entry, m3uIndex, m3uEntries) {
  const searchKeys = resolveSearchKeys(entry);
  const candidates = [];
  const seen = new Set();

  const addCandidate = (c, turkey = false, rawTitle = "") => {
    if (!c?.url || seen.has(c.url)) return;
    if (FALSE_POSITIVE_TITLE.test(rawTitle || c.title || "")) return;
    if (!isRelevantCandidate(entry, c)) return;
    seen.add(c.url);
    candidates.push({ ...c, turkey, rawTitle: rawTitle || c.title });
  };

  for (const key of searchKeys) {
    for (const c of m3uIndex.get(key) || []) addCandidate(c, c.turkey, c.rawTitle);
  }

  const nameKey = normalizeChannelKey(entry.name);
  for (const e of m3uEntries) {
    const titleKey = normalizeChannelKey(e.cleaned || e.title || "");
    if (titleKey !== nameKey && !searchKeys.includes(titleKey)) continue;
    if (shouldSkipM3uUrl(e.url)) continue;
    addCandidate(
      {
        url: e.url,
        sourceId: e.sourceId,
        title: e.cleaned || e.title,
        key: resolveM3uKey(e),
      },
      isTurkeyM3uEntry(e),
      e.title || "",
    );
  }

  const turkeyOnly = candidates.filter((c) => c.turkey);
  return turkeyOnly.length ? turkeyOnly : candidates;
}

function pickCandidateUrls(candidates) {
  const sorted = [...candidates].sort((a, b) => {
    if (a.turkey !== b.turkey) return a.turkey ? -1 : 1;
    const ta = isTrustedCdnUrl(a.url) ? 1 : 0;
    const tb = isTrustedCdnUrl(b.url) ? 1 : 0;
    return tb - ta;
  });
  const safe = sorted.filter((c) => !isRiskyStreamUrl(c.url) && !shouldSkipM3uUrl(c.url));
  const risky = sorted.filter((c) => isRiskyStreamUrl(c.url) && !shouldSkipM3uUrl(c.url));
  const trusted = sortUrlsByQuality(safe.filter((c) => isTrustedCdnUrl(c.url)).map((c) => c.url));
  const other = sortUrlsByQuality(safe.filter((c) => !isTrustedCdnUrl(c.url)).map((c) => c.url));
  const riskyUrls = sortUrlsByQuality(risky.map((c) => c.url));
  return uniqueUrls([...trusted, ...other, ...riskyUrls]).slice(0, MAX_M3U_CANDIDATES_PROBE);
}

async function probeUrls(urls) {
  if (skipProbe) return urls.map((url) => ({ url, live: true }));
  return pooledMap(urls, PROBE_CONCURRENCY, async (url) => {
    if (isTrustedCdnUrl(url)) return { url, live: true };
    const live = await checkUrlLive(url);
    return { url, live };
  });
}

async function discoverWorkingUrls(entry, m3uIndex, m3uEntries) {
  const candidates = findM3uCandidates(entry, m3uIndex, m3uEntries);
  if (!candidates.length) return { urls: [], candidates: 0, resolvedKey: null };

  const toProbe = pickCandidateUrls(candidates);
  const results = await probeUrls(toProbe);
  const live = sortUrlsByQuality(results.filter((r) => r.live).map((r) => r.url));

  const trustedLive = live.filter(isTrustedCdnUrl);
  const safeLive = live.filter((u) => !isRiskyStreamUrl(u));
  const riskyLive = live.filter(isRiskyStreamUrl);

  let urls = uniqueUrls([...trustedLive, ...safeLive, ...riskyLive]).slice(0, MAX_URLS_PER_NEW_CHANNEL);

  if (!urls.length && candidates.some((c) => isTrustedCdnUrl(c.url))) {
    urls = sortUrlsByQuality(
      candidates.filter((c) => isTrustedCdnUrl(c.url)).map((c) => c.url),
    ).slice(0, MAX_URLS_PER_NEW_CHANNEL);
  }

  const resolvedKey =
    entry.key ||
    candidates.find((c) => resolveSearchKeys(entry).includes(c.key))?.key ||
    normalizeChannelKey(entry.name);

  return { urls, candidates: candidates.length, resolvedKey };
}

function validateBeforeWrite(streamMapObj, channelsArr, prevChannelCount, prevMapKeys) {
  const keys = Object.keys(streamMapObj).filter((k) => k !== "_revision");
  if (keys.length < MIN_STREAM_MAP_KEYS) {
    throw new Error(`stream_map anahtar sayisi dusuk: ${keys.length}`);
  }
  if (!Array.isArray(channelsArr) || channelsArr.length < MIN_CHANNELS_COUNT) {
    throw new Error(`channels.json sayisi dusuk: ${channelsArr?.length}`);
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
  const missingList = loadMissingList();
  const { channels, keys: existingKeys, file: channelsFile } = loadPrimaryChannels();
  const { revision, raw: streamMapRaw, map: streamMap, file: streamMapFile } = loadPrimaryStreamMap();

  log(`Kaynak channels: ${channelsFile} (${channels.length})`);
  log(`Kaynak stream_map: ${streamMapFile} rev=${revision}`);
  log(`Eksik liste: ${missingList.length} kanal`);

  const pending = missingList.filter((e) => !isPaidChannel(e) && !channelExists(e, existingKeys));
  const skippedPaid = missingList.filter(isPaidChannel);
  const skippedExists = missingList.filter((e) => !isPaidChannel(e) && channelExists(e, existingKeys));

  log(`Islenecek: ${pending.length} | zaten var: ${skippedExists.length} | ucretli/atlanan: ${skippedPaid.length}`);

  const m3uEntries = await loadM3uSources();
  const m3uIndex = buildM3uIndex(m3uEntries);
  log(`M3U index: ${m3uIndex.size} anahtar`);

  const report = {
    generatedAt: now,
    dryRun: !doApply,
    pending: pending.length,
    skippedExists: skippedExists.map((e) => e.name),
    skippedPaid: skippedPaid.map((e) => e.name),
    discovered: [],
    notFound: [],
    warnings: [],
  };

  const nextChannels = [...channels];
  const nextMap = { ...streamMap };
  const addedNames = [];

  for (const entry of pending) {
    const { urls, candidates, resolvedKey } = await discoverWorkingUrls(entry, m3uIndex, m3uEntries);

    if (!urls.length) {
      report.notFound.push({ name: entry.name, candidates });
      log(`YOK   ${entry.name} (M3U aday: ${candidates})`);
      continue;
    }

    const mapKey = resolvedKey || normalizeChannelKey(entry.name);

    if (existingKeys.has(mapKey) || streamMap[mapKey]?.length) {
      report.warnings.push(`${entry.name}: anahtar zaten var (${mapKey}), atlandi`);
      log(`ATLA  ${entry.name} key=${mapKey} zaten mevcut`);
      continue;
    }

    const channelObj = {
      name: entry.name,
      url: entry.url || "",
      category: entry.category || "Ulusal",
      streamUrl: urls[0],
    };

    nextChannels.push(channelObj);
    existingKeys.add(mapKey);
    nextMap[mapKey] = urls;
    addedNames.push(entry.name);

    report.discovered.push({
      name: entry.name,
      key: mapKey,
      urls,
      m3uCandidates: candidates,
    });
    log(`+EKLE ${entry.name} key=${mapKey} urls=${urls.length}`);
  }

  const mapChanged = addedNames.length > 0;
  const newStreamMapObj = { ...streamMapRaw };
  for (const [k, v] of Object.entries(nextMap)) {
    newStreamMapObj[k] = v;
  }
  if (mapChanged) {
    newStreamMapObj._revision = revision + 1;
  }

  report.addedCount = addedNames.length;
  report.addedNames = addedNames;
  report.streamMapRevision = newStreamMapObj._revision;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  atomicWriteJson(REPORT_PATH, report);
  log(`Rapor: ${REPORT_PATH}`);
  log(`Ozet: ${addedNames.length} kanal eklenecek, ${report.notFound.length} bulunamadi`);

  if (!mapChanged) {
    log("Degisiklik yok.");
    if (!doApply) log("DRY-RUN tamam.");
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

  const writeTargets = [customStreamMapPath, customChannelsPath];
  const backupDir = path.join(BACKUP_ROOT, stamp());
  backupFiles(writeTargets, backupDir);
  log(`Yedek: ${backupDir}`);

  atomicWriteJson(customStreamMapPath, newStreamMapObj);
  log(`Yazildi: ${customStreamMapPath} rev=${newStreamMapObj._revision}`);

  atomicWriteJson(customChannelsPath, nextChannels);
  log(`Yazildi: ${customChannelsPath} (${nextChannels.length} kanal)`);

  log(`Tamam. ${addedNames.length} kanal eklendi.`);
}

main().catch((e) => {
  console.error("[discover] HATA:", e);
  process.exit(1);
});
