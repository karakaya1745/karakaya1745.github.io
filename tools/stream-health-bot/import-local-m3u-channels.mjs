#!/usr/bin/env node
/**
 * Yerel M3U dosyalarından kanal ekleme + mevcut kanalları zenginleştirme.
 *
 * Güvenlik:
 *  - Varsayılan DRY-RUN (--apply olmadan yazmaz)
 *  - Mevcut kanalları silmez / üzerine yazmaz (append-only)
 *  - Yeni kanal: katı HLS probe geçmeden eklenmez
 *  - Mevcut kanal: yeni URL probe geçmeden eklenmez
 *  - Panel IPTV URL'leri (live.php/mac=/play_token=) risky tier'da eklenir
 *  - Yazmadan önce yedek
 *
 * Usage:
 *   node tools/stream-health-bot/import-local-m3u-channels.mjs
 *   node tools/stream-health-bot/import-local-m3u-channels.mjs --apply
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
  titleFuzzyMatchesChannelName,
  toUrlArray,
  uniqueUrls,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "out");
const BACKUP_ROOT = path.join(__dirname, "backups");
const REPORT_PATH = path.join(OUT_DIR, "import_local_m3u_report.json");

const MAX_PROBE_NEW_CHANNEL = 8;
const MAX_PROBE_ENRICH = 6;
const FALSE_POSITIVE_TITLE = /\(romania\)|\(azerbaijan\)|\(az\)|\(de\)|\(uk\)|\(us\)|\(fr\)|\(it\)|\(es\)/i;

const TURKISH_TITLE_PATTERNS =
  /\b(trt|atv|show|star|kanal|fox|now|haberturk|ntv|tv8|beyaz|demir|360|ulke|tele1|sozcu|benguturk|halk|tbmm|flash|tv100|a2|teve2|teve\s*2|belediye|istanbul|ankara|izmir|antalya|bursa|konya|samsun|gaziantep|kocaeli|eskisehir|eskişehir|turk|türk|turkiye|türkiye|ulusal|yerel|spor|sport|bein|ssport|dsmart|tivibu)\b/i;

const args = new Set(process.argv.slice(2));
const doApply = args.has("--apply");

function getCliArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const channelsPath = getCliArg("--channels") || path.join(ROOT, "channels.json");
const streamMapPath = getCliArg("--stream-map") || path.join(ROOT, "stream_map.json");

function log(...a) {
  console.log("[import-local]", ...a);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function isUnencryptedM3uUrl(url) {
  if (shouldSkipM3uUrl(url)) return false;
  const u = url.toLowerCase();
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

function mapGroupToCategory(group) {
  const g = (group || "").toLowerCase();
  if (/ulusal/.test(g)) return "Ulusal";
  if (/haber|news/.test(g)) return "Haber";
  if (/spor|sport/.test(g)) return "Spor";
  if (/cocuk|çocuk|kids|cocuk/.test(g)) return "Cocuk";
  if (/dini|din\b/.test(g)) return "Dini";
  if (/muzik|müzik|music/.test(g)) return "Muzik";
  if (/belgesel|document/.test(g)) return "Belgesel";
  if (/kamu/.test(g)) return "Kamu";
  if (/ekonom|finans/.test(g)) return "Ekonomi";
  if (/radyo/.test(g)) return "Radyo Yerel";
  if (/yerel|bölge|bolge|belediye/.test(g)) return "Yasam";
  return "Diger";
}

function m3uTitleToChannelKey(title) {
  const cleaned = cleanM3uTitle(title);
  const stripped = stripM3uCountryPrefix(cleaned);
  const candidates = [normalizeChannelKey(stripped), normalizeChannelKey(cleaned)];
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

function resolveSearchKeysForMapKey(key) {
  const keys = new Set([key]);
  for (const [alias, target] of Object.entries(M3U_KEY_ALIASES)) {
    if (target === key) keys.add(alias);
    if (alias === key && target) keys.add(target);
  }
  return [...keys];
}

function loadCatalog() {
  const channels = loadJson(channelsPath, []);
  if (!Array.isArray(channels)) throw new Error("channels.json dizi degil");

  const catalogKeys = new Set();
  const catalogNames = [];
  const nameToKey = new Map();
  for (const ch of channels) {
    const key = normalizeChannelKey(ch.name || "");
    if (key) {
      catalogKeys.add(key);
      nameToKey.set(ch.name, key);
    }
    catalogNames.push(ch.name || "");
  }

  const streamMapRaw = loadJson(streamMapPath, {});
  const streamMap = {};
  for (const [k, v] of Object.entries(streamMapRaw)) {
    if (k === "_revision") continue;
    const urls = uniqueUrls(toUrlArray(v));
    if (urls.length) streamMap[k] = urls;
  }

  const allKnownKeys = new Set([...catalogKeys, ...Object.keys(streamMap)]);
  for (const [alias, target] of Object.entries(M3U_KEY_ALIASES)) {
    if (allKnownKeys.has(target)) allKnownKeys.add(alias);
  }
  for (const k of [...allKnownKeys]) {
    const aliased = M3U_KEY_ALIASES[k];
    if (aliased) allKnownKeys.add(aliased);
  }

  return {
    channels,
    catalogKeys,
    catalogNames,
    nameToKey,
    streamMapRaw,
    streamMap,
    revision: Number(streamMapRaw._revision) || 0,
    allKnownKeys,
  };
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

async function loadLocalM3uSources() {
  const cfg = loadJson(path.join(__dirname, "m3u_sources.json"));
  const localSources = (cfg?.sources || []).filter((s) => s.localFallback);
  const sorted = [...localSources].sort((a, b) => (a.priority || 99) - (b.priority || 99));
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

function buildM3uIndex(m3uEntries) {
  const byKey = new Map();
  const newByKey = new Map();

  for (const entry of m3uEntries) {
    const title = entry.cleaned || entry.title || "";
    if (!title || title.length < 2) continue;
    if (FALSE_POSITIVE_TITLE.test(entry.title || "")) continue;
    if (!isTurkeyRelevant(entry)) continue;
    if (!isUnencryptedM3uUrl(entry.url)) continue;

    const mapKeys = entryMapKeys(entry);
    if (!mapKeys.length) continue;

    const item = {
      url: entry.url,
      sourceId: entry.sourceId,
      title: displayNameFromM3u(entry),
      rawTitle: entry.title || "",
      groupTitle: entry.groupTitle || "",
      mapKeys,
    };

    for (const key of mapKeys) {
      if (!byKey.has(key)) byKey.set(key, []);
      const list = byKey.get(key);
      if (!list.some((x) => x.url === item.url)) list.push(item);
    }
  }

  return byKey;
}

async function probeUrls(urls, limit) {
  const toProbe = uniqueUrls(urls).slice(0, limit);
  const results = await pooledMap(toProbe, PROBE_CONCURRENCY, async (url) => {
    const result = await probeChannelPlayback(url);
    return { url, live: result.live, reason: result.reason, status: result.status };
  });
  return {
    live: sortUrlsByQuality(results.filter((r) => r.live).map((r) => r.url)),
    results,
  };
}

function capWithoutRemovingExisting(existingUrls, merged) {
  if (merged.length <= MAX_URLS_PER_CHANNEL) return merged;
  const existingSet = new Set(existingUrls);
  const mustKeep = merged.filter((u) => existingSet.has(u));
  const extras = merged.filter((u) => !existingSet.has(u));
  const slots = Math.max(0, MAX_URLS_PER_CHANNEL - mustKeep.length);
  return uniqueUrls([...mustKeep, ...extras.slice(0, slots)]);
}

function mergeEnrichedUrls(existingUrls, addedUrls) {
  const existingTrusted = existingUrls.filter(isTrustedCdnUrl);
  const existingSafe = existingUrls.filter((u) => !isTrustedCdnUrl(u) && !isRiskyStreamUrl(u));
  const existingRisky = existingUrls.filter(isRiskyStreamUrl);

  const newTrusted = sortUrlsByQuality(uniqueUrls(addedUrls.filter(isTrustedCdnUrl)));
  const newSafe = sortUrlsByQuality(uniqueUrls(addedUrls.filter((u) => !isTrustedCdnUrl(u) && !isRiskyStreamUrl(u))));
  const newRisky = sortUrlsByQuality(uniqueUrls(addedUrls.filter(isRiskyStreamUrl)));

  return uniqueUrls([
    ...sortUrlsByQuality(existingTrusted),
    ...newTrusted,
    ...sortUrlsByQuality(existingSafe),
    ...newSafe,
    ...sortUrlsByQuality(existingRisky),
    ...newRisky,
  ]);
}

function collectCandidatesForKey(key, byKey, existingSet) {
  const searchKeys = resolveSearchKeysForMapKey(key);
  const seen = new Set();
  const out = [];
  for (const sk of searchKeys) {
    for (const c of byKey.get(sk) || []) {
      if (existingSet.has(c.url) || seen.has(c.url)) continue;
      seen.add(c.url);
      out.push(c);
    }
  }
  return sortUrlsByQuality(out.map((c) => c.url)).map((url) => {
    const c = out.find((x) => x.url === url);
    return c;
  });
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
  const catalog = loadCatalog();
  const { channels, streamMap, streamMapRaw, revision, allKnownKeys, catalogNames } = catalog;

  log(`Katalog: ${channels.length} kanal, stream_map: ${Object.keys(streamMap).length} anahtar, rev=${revision}`);

  const { entries: m3uEntries, sourceCount } = await loadLocalM3uSources();
  log(`Yerel M3U: ${sourceCount} dosya, ${m3uEntries.length} toplam akis`);

  const byKey = buildM3uIndex(m3uEntries);
  log(`Sifresiz index: ${byKey.size} anahtar`);

  const report = {
    generatedAt: now,
    dryRun: !doApply,
    m3uSourceCount: sourceCount,
    newChannels: [],
    enrichedChannels: [],
    skippedProbeFailed: [],
    totalNewUrls: 0,
    streamMapRevision: revision,
  };

  const nextChannels = [...channels];
  const nextMap = { ...streamMap };
  const nextKnownKeys = new Set(allKnownKeys);

  // --- Phase 1: Discover NEW channels ---
  const newChannelCandidates = new Map();
  for (const entry of m3uEntries) {
    const title = entry.cleaned || entry.title || "";
    if (!title || title.length < 2) continue;
    if (FALSE_POSITIVE_TITLE.test(entry.title || "")) continue;
    if (!isTurkeyRelevant(entry)) continue;
    if (!isUnencryptedM3uUrl(entry.url)) continue;
    if (entryMatchesCatalog(entry, nextKnownKeys, catalogNames)) continue;

    const key = resolveM3uKey(entry);
    if (!key || nextKnownKeys.has(key)) continue;

    if (!newChannelCandidates.has(key)) {
      newChannelCandidates.set(key, {
        key,
        name: displayNameFromM3u(entry),
        groupTitle: entry.groupTitle || "",
        urls: [],
        sourceIds: new Set(),
      });
    }
    const rec = newChannelCandidates.get(key);
    rec.urls.push(entry.url);
    rec.sourceIds.add(entry.sourceId);
    if (entry.groupTitle && !rec.groupTitle) rec.groupTitle = entry.groupTitle;
  }

  log(`Yeni kanal adayi: ${newChannelCandidates.size}`);

  for (const [key, rec] of newChannelCandidates) {
    const candidateUrls = sortUrlsByQuality(uniqueUrls(rec.urls));
    const { live, results } = await probeUrls(candidateUrls, MAX_PROBE_NEW_CHANNEL);

    if (!live.length) {
      report.skippedProbeFailed.push({
        name: rec.name,
        key,
        reason: "probe-failed",
        probed: results.length,
        probeResults: results,
      });
      log(`ATLA  ${rec.name} (probe basarisiz, ${results.length} denendi)`);
      continue;
    }

    const urls = live.slice(0, MAX_URLS_PER_CHANNEL);
    const category = mapGroupToCategory(rec.groupTitle);
    const channelObj = {
      name: rec.name,
      url: "",
      category,
      streamUrl: urls[0],
    };

    nextChannels.push(channelObj);
    nextMap[key] = urls;
    nextKnownKeys.add(key);
    catalogNames.push(rec.name);

    report.newChannels.push({
      name: rec.name,
      key,
      category,
      urls,
      probeResults: results,
    });
    report.totalNewUrls += urls.length;
    log(`+YENI ${rec.name} key=${key} urls=${urls.length}`);
  }

  // --- Phase 2: Enrich EXISTING channels ---
  const mapKeys = Object.keys(nextMap);
  for (const key of mapKeys) {
    const existingUrls = nextMap[key] || [];
    const slots = Math.max(0, MAX_URLS_PER_CHANNEL - existingUrls.length);
    if (slots === 0) continue;

    const existingSet = new Set(existingUrls);
    const candidates = collectCandidatesForKey(key, byKey, existingSet);
    if (!candidates.length) continue;

    const candidateUrls = candidates.map((c) => c.url);
    const toTry = candidateUrls;

    const { live, results } = await probeUrls(toTry, Math.min(MAX_PROBE_ENRICH, slots));
    if (!live.length) continue;

    const added = live.slice(0, slots);
    const merged = capWithoutRemovingExisting(existingUrls, mergeEnrichedUrls(existingUrls, added));
    const actuallyAdded = merged.filter((u) => !existingSet.has(u));
    if (!actuallyAdded.length) continue;

    nextMap[key] = merged;
    report.enrichedChannels.push({
      key,
      added: actuallyAdded.length,
      urls: actuallyAdded,
      total: merged.length,
      probeResults: results,
    });
    report.totalNewUrls += actuallyAdded.length;
    log(`+ZENG ${key} +${actuallyAdded.length} (${existingUrls.length} -> ${merged.length})`);
  }

  const channelsChanged = report.newChannels.length > 0;
  const mapChanged = report.newChannels.length > 0 || report.enrichedChannels.length > 0;

  const newStreamMapObj = { ...streamMapRaw };
  for (const [k, v] of Object.entries(nextMap)) {
    newStreamMapObj[k] = v;
  }
  if (mapChanged) {
    newStreamMapObj._revision = revision + 1;
  }
  report.streamMapRevision = newStreamMapObj._revision;
  report.newChannelCount = report.newChannels.length;
  report.enrichedChannelCount = report.enrichedChannels.length;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  atomicWriteJson(REPORT_PATH, report);
  log(`Rapor: ${REPORT_PATH}`);
  log(
    `Ozet: +${report.newChannelCount} yeni kanal, ${report.enrichedChannelCount} zenginlestirildi, +${report.totalNewUrls} URL, rev=${newStreamMapObj._revision}`,
  );

  if (!channelsChanged && !mapChanged) {
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

  const writeTargets = [streamMapPath];
  if (channelsChanged) writeTargets.push(channelsPath);
  const backupDir = path.join(BACKUP_ROOT, stamp());
  backupFiles(writeTargets, backupDir);
  log(`Yedek: ${backupDir}`);

  atomicWriteJson(streamMapPath, newStreamMapObj);
  log(`Yazildi: ${streamMapPath} rev=${newStreamMapObj._revision}`);

  if (channelsChanged) {
    atomicWriteJson(channelsPath, nextChannels);
    log(`Yazildi: ${channelsPath} (${nextChannels.length} kanal)`);
  }

  log("Tamam.");
}

main().catch((e) => {
  console.error("[import-local] HATA:", e);
  process.exit(1);
});
