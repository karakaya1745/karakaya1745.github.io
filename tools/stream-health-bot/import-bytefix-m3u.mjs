#!/usr/bin/env node
/**
 * ByteFixRepairs2026.m3u — tek dosya import + zenginleştirme.
 *
 * Kurallar:
 *  - Mevcut kanallar: stream_map'e append-only (max 30 URL)
 *  - Yeni kanallar: Türk/ilgili ise channels.json + stream_map
 *  - Panel URL (live.php/mac=) probe gerektirmez
 *  - S Sport, Tagess, Dizi TV, Cinex, Film Screen, SDM Sinema, yabancı kanallar hariç
 *
 * Usage:
 *   node tools/stream-health-bot/import-bytefix-m3u.mjs
 *   node tools/stream-health-bot/import-bytefix-m3u.mjs --apply
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  MAX_URLS_PER_CHANNEL,
  MIN_CHANNELS_COUNT,
  MIN_STREAM_MAP_KEYS,
  M3U_KEY_ALIASES,
  atomicWriteJson,
  backupFiles,
  cleanM3uTitle,
  isPanelIptvUrl,
  isRiskyStreamUrl,
  isTurkeyM3uEntry,
  loadJson,
  normalizeChannelKey,
  orderUrlsForPlayback,
  parseM3U,
  resolveM3uKey,
  shouldSkipM3uUrl,
  titleFuzzyMatchesChannelName,
  toUrlArray,
  uniqueUrls,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "out");
const BACKUP_ROOT = path.join(__dirname, "backups");
const REPORT_PATH = path.join(OUT_DIR, "import_bytefix_report.json");
const DEFAULT_M3U = path.join(__dirname, "local-sources", "ByteFixRepairs2026.m3u");

const FALSE_POSITIVE_TITLE =
  /\(romania\)|\(azerbaijan\)|\(az\)|\(de\)|\(uk\)|\(us\)|\(fr\)|\(it\)|\(es\)|\(ru\)|\(ar\)/i;

const TURKISH_TITLE_PATTERNS =
  /\b(trt|atv|show|star|kanal|fox|now|haberturk|ntv|tv8|beyaz|demir|360|ulke|tele1|sozcu|benguturk|halk|tbmm|flash|tv100|a2|teve2|teve\s*2|belediye|istanbul|ankara|izmir|antalya|bursa|konya|samsun|gaziantep|kocaeli|eskisehir|eskişehir|turk|türk|turkiye|türkiye|ulusal|yerel|spor|sport|bein|dsmart|tivibu|rumeli|ordu|tokat|ege|kapadokya|grt|kontv|agro|belgesel|dini|muzik|çocuk|cocuk|cartoon|minika|dream)\b/i;

const EXCLUDE_TITLE_RES = [
  { re: /\bs\s*sport\b/i, reason: "S Sport hariç" },
  { re: /\bssport\b/i, reason: "S Sport hariç" },
  { re: /^tagess/i, reason: "Tagess hariç" },
  { re: /\bdizi\s*tv\b/i, reason: "Dizi TV hariç" },
  { re: /\bcinex\b/i, reason: "Cinex hariç" },
  { re: /\bfilm\s*screen\b/i, reason: "Film Screen hariç" },
  { re: /\bsdm\s*sinema\b/i, reason: "SDM Sinema hariç" },
];

const args = new Set(process.argv.slice(2));
const doApply = args.has("--apply");

function getCliArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const channelsPath = getCliArg("--channels") || path.join(ROOT, "channels.json");
const streamMapPath = getCliArg("--stream-map") || path.join(ROOT, "stream_map.json");
const m3uPath = getCliArg("--m3u") || DEFAULT_M3U;

function log(...a) {
  console.log("[import-bytefix]", ...a);
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
  if (/yurt\s*disi/i.test(group)) return false;
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
  if (/cocuk|çocuk|kids/.test(g)) return "Cocuk";
  if (/dini|din\b/.test(g)) return "Dini";
  if (/muzik|müzik|music/.test(g)) return "Muzik";
  if (/belgesel|document/.test(g)) return "Belgesel";
  if (/kamu/.test(g)) return "Kamu";
  if (/egitim|eğitim/.test(g)) return "Egitim";
  if (/kultur|kültür/.test(g)) return "Kultur";
  if (/film|eglence|eğlence/.test(g)) return "Diger";
  if (/yerel|bölge|bolge|belediye|yasam/.test(g)) return "Yasam";
  return "Diger";
}

function getExcludeReason(entry) {
  const title = entry.cleaned || entry.title || "";
  const raw = entry.title || "";
  const group = entry.groupTitle || "";

  if (!title || title.length < 2) return "bos baslik";
  if (FALSE_POSITIVE_TITLE.test(raw) || FALSE_POSITIVE_TITLE.test(title)) return "yabanci ulke etiketi";
  if (/yurt\s*disi/i.test(group)) return "Yurt Disi grubu";

  for (const { re, reason } of EXCLUDE_TITLE_RES) {
    if (re.test(title) || re.test(raw)) return reason;
  }

  if (!isTurkeyRelevant(entry)) return "Turk/ilgili degil";
  if (!isUnencryptedM3uUrl(entry.url)) return "sifreli/gecersiz URL";
  return null;
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
  const keyToName = new Map();
  for (const ch of channels) {
    const key = normalizeChannelKey(ch.name || "");
    if (key) {
      catalogKeys.add(key);
      keyToName.set(key, ch.name);
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
    keyToName,
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

function findCatalogKeyForEntry(entry, allKnownKeys, catalogNames) {
  const mapKeys = entryMapKeys(entry);
  for (const k of mapKeys) {
    if (allKnownKeys.has(k)) return k;
  }
  const title = entry.cleaned || entry.title || "";
  for (const name of catalogNames) {
    if (titleFuzzyMatchesChannelName(name, title)) {
      return normalizeChannelKey(name);
    }
  }
  return null;
}

function capWithoutRemovingExisting(existingUrls, merged) {
  if (merged.length <= MAX_URLS_PER_CHANNEL) return merged;
  const existingSet = new Set(existingUrls);
  const mustKeep = merged.filter((u) => existingSet.has(u));
  const extras = merged.filter((u) => !existingSet.has(u));
  const slots = Math.max(0, MAX_URLS_PER_CHANNEL - mustKeep.length);
  return uniqueUrls([...mustKeep, ...extras.slice(0, slots)]);
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
  return out;
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

function buildM3uIndex(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const reason = getExcludeReason(entry);
    if (reason) continue;

    const mapKeys = entryMapKeys(entry);
    if (!mapKeys.length) continue;

    const item = {
      url: entry.url,
      title: displayNameFromM3u(entry),
      rawTitle: entry.title || "",
      groupTitle: entry.groupTitle || "",
      mapKeys,
      isPanel: isPanelIptvUrl(entry.url),
    };

    for (const key of mapKeys) {
      if (!byKey.has(key)) byKey.set(key, []);
      const list = byKey.get(key);
      if (!list.some((x) => x.url === item.url)) list.push(item);
    }
  }
  return byKey;
}

async function main() {
  const now = new Date().toISOString();
  if (!fs.existsSync(m3uPath)) throw new Error(`M3U bulunamadi: ${m3uPath}`);

  const catalog = loadCatalog();
  const { channels, streamMap, streamMapRaw, revision, allKnownKeys, catalogNames } = catalog;

  log(`Katalog: ${channels.length} kanal, stream_map: ${Object.keys(streamMap).length} anahtar, rev=${revision}`);
  log(`M3U: ${m3uPath}`);

  const m3uText = fs.readFileSync(m3uPath, "utf8");
  const m3uEntries = parseM3U(m3uText);
  log(`M3U akis: ${m3uEntries.length}`);

  const skipped = [];
  const accepted = [];
  for (const entry of m3uEntries) {
    const reason = getExcludeReason(entry);
    if (reason) {
      skipped.push({ title: entry.title || "", group: entry.groupTitle || "", reason });
      continue;
    }
    accepted.push(entry);
  }
  log(`Kabul: ${accepted.length}, atlandi: ${skipped.length}`);

  const byKey = buildM3uIndex(accepted);
  log(`Index: ${byKey.size} anahtar`);

  const report = {
    generatedAt: now,
    dryRun: !doApply,
    m3uPath,
    m3uEntryCount: m3uEntries.length,
    acceptedCount: accepted.length,
    skipped,
    newChannels: [],
    enrichedChannels: [],
    totalNewUrls: 0,
    streamMapRevision: revision,
  };

  const nextChannels = [...channels];
  const nextMap = { ...streamMap };
  const nextKnownKeys = new Set(allKnownKeys);

  // --- Phase 1: NEW channels ---
  const newChannelCandidates = new Map();
  for (const entry of accepted) {
    if (entryMatchesCatalog(entry, nextKnownKeys, catalogNames)) continue;

    const key = resolveM3uKey(entry);
    if (!key || nextKnownKeys.has(key)) continue;

    if (!newChannelCandidates.has(key)) {
      newChannelCandidates.set(key, {
        key,
        name: displayNameFromM3u(entry),
        groupTitle: entry.groupTitle || "",
        urls: [],
      });
    }
    const rec = newChannelCandidates.get(key);
    rec.urls.push(entry.url);
    if (entry.groupTitle && !rec.groupTitle) rec.groupTitle = entry.groupTitle;
  }

  log(`Yeni kanal adayi: ${newChannelCandidates.size}`);

  for (const [key, rec] of newChannelCandidates) {
    const urls = orderUrlsForPlayback(uniqueUrls(rec.urls));
    if (!urls.length) continue;

    const category = mapGroupToCategory(rec.groupTitle);
    const channelObj = {
      name: rec.name,
      url: "",
      category,
      streamUrl: urls[0],
    };

    nextChannels.push(channelObj);
    nextMap[key] = urls.slice(0, MAX_URLS_PER_CHANNEL);
    nextKnownKeys.add(key);
    catalogNames.push(rec.name);

    report.newChannels.push({
      name: rec.name,
      key,
      category,
      urlCount: nextMap[key].length,
      urls: nextMap[key],
    });
    report.totalNewUrls += nextMap[key].length;
    log(`+YENI ${rec.name} key=${key} urls=${nextMap[key].length}`);
  }

  // --- Phase 2: ENRICH existing ---
  const mapKeys = Object.keys(nextMap);
  for (const key of mapKeys) {
    const existingUrls = nextMap[key] || [];
    const slots = Math.max(0, MAX_URLS_PER_CHANNEL - existingUrls.length);
    if (slots === 0) continue;

    const existingSet = new Set(existingUrls);
    const candidates = collectCandidatesForKey(key, byKey, existingSet);
    if (!candidates.length) continue;

    const newUrls = candidates.map((c) => c.url).slice(0, slots);
    const merged = capWithoutRemovingExisting(
      existingUrls,
      orderUrlsForPlayback(uniqueUrls([...existingUrls, ...newUrls])),
    );
    const actuallyAdded = merged.filter((u) => !existingSet.has(u));
    if (!actuallyAdded.length) continue;

    nextMap[key] = merged;
    report.enrichedChannels.push({
      key,
      name: catalog.keyToName.get(key) || key,
      added: actuallyAdded.length,
      urls: actuallyAdded,
      total: merged.length,
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
    `Ozet: +${report.newChannelCount} yeni, ${report.enrichedChannelCount} zenginlestirildi, +${report.totalNewUrls} URL, rev=${newStreamMapObj._revision}`,
  );

  if (!channelsChanged && !mapChanged) {
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
  console.error("[import-bytefix] HATA:", e);
  process.exit(1);
});
