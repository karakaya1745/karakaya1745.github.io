#!/usr/bin/env node
/**
 * Yerel M3U kaynaklarından yasal/resmi kanalları kataloga ekler.
 * Sadece probe geçen ve güvenli URL'ler yazılır.
 *
 * Usage:
 *   node tools/stream-health-bot/import-legal-m3u-channels.mjs
 *   node tools/stream-health-bot/import-legal-m3u-channels.mjs --apply
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
  isRiskyStreamUrl,
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
const REPORT_PATH = path.join(OUT_DIR, "import_legal_report.json");

const PROBE_TIMEOUT_MS = 10000;
const MAX_URLS_PER_NEW_CHANNEL = 3;
const LOCAL_SOURCE_PREFIXES = ["local-", "playlist-"];

const OFFICIAL_CDN_HOSTS = [
  "ercdn.net",
  "daioncdn.com",
  "daioncdn.net",
  "taksimbilisim.com",
  "streamlock.net",
  "turknet",
  "trt.com.tr",
  "trt.net",
  "artiyerelmedya.net",
  "artidijital",
  "socialsmart",
  "medya.trt.com.tr",
  "mncdn.com",
  "ensonhaber.com",
  "yayin.com.tr",
  "netdirekt.com.tr",
  "vpis.io",
];

const BROADCASTER_NAME_PATTERNS =
  /\b(trt|atv|show|star|kanal\s*d|now|fox|haberturk|ntv|tv8|beyaz|demir|360|tele1|sozcu|benguturk|halk|tbmm|flash|tv100|a2|teve2|belediye|istanbul|ankara|izmir|antalya|bursa|konya|samsun|gaziantep|kocaeli|eskisehir|eskişehir|ordu|tokat|artvin|ege|kapadokya|grt|kontv|agro|tek\s*rumeli|yerel|ulusal|spor)\b/i;

const EXCLUDE_TITLE_PATTERNS =
  /\b(xxx|adult|porn|casino|bet|canl[iı]\s*bahis|rulet|poker|\+18|18\+)\b|live\.php\?mac=|\(romania\)|\(azerbaijan\)|\(az\)|\(de\)|\(uk\)|\(us\)|\(fr\)|\(it\)|\(es\)|\(ru\)|\(ar\)/i;

const EXCLUDE_URL_PATTERNS =
  /live\.php\?mac=|play_token|\/live\/[^/]+\/[^/]+\/[^/?#]+\.(ts|m3u8?)/i;

const PAID_NAME_PATTERNS = [/bein/i, /ssport/i, /tivibu/i, /dsmart/i];

const args = new Set(process.argv.slice(2));
const doApply = args.has("--apply");
const skipProbe = args.has("--no-probe");

function getCliArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const channelsPath = getCliArg("--channels") || path.join(ROOT, "channels.json");
const streamMapPath = getCliArg("--stream-map") || path.join(ROOT, "stream_map.json");

function log(...a) {
  console.log("[import-legal]", ...a);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function isOfficialCdnUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OFFICIAL_CDN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function isLegalM3uUrl(url) {
  if (shouldSkipM3uUrl(url)) return false;
  const u = url.toLowerCase();
  if (EXCLUDE_URL_PATTERNS.test(u)) return false;
  if (u.includes("play_token")) return false;
  if (u.includes("mac=")) return false;
  if (u.includes("username=") || u.includes("password=")) return false;
  if (isRiskyStreamUrl(url)) return false;
  return true;
}

function isLegalM3uEntry(entry) {
  const title = entry.cleaned || entry.title || "";
  if (!title || title.length < 2) return false;
  if (EXCLUDE_TITLE_PATTERNS.test(entry.title || "") || EXCLUDE_TITLE_PATTERNS.test(title)) {
    return false;
  }
  if (PAID_NAME_PATTERNS.some((re) => re.test(title))) return false;
  if (!isLegalM3uUrl(entry.url)) return false;

  const officialCdn = isOfficialCdnUrl(entry.url);
  const turkey = isTurkeyM3uEntry(entry);
  const broadcasterName = BROADCASTER_NAME_PATTERNS.test(title) || BROADCASTER_NAME_PATTERNS.test(entry.groupTitle || "");

  if (officialCdn) return true;
  if (turkey && broadcasterName) return true;
  if (broadcasterName && /kanal|tv|trt|belediye/i.test(title)) return true;
  return false;
}

function mapCategory(groupTitle, title) {
  const g = (groupTitle || "").toLowerCase();
  const t = (title || "").toLowerCase();
  if (/spor|sport/.test(g) || /spor|sport/.test(t)) return "Spor";
  if (/haber|news/.test(g)) return "Haber";
  if (/cocuk|çocuk|kids|cartoon/.test(g) || /cocuk|çocuk|cartoon|spacetoon/.test(t)) return "Cocuk";
  if (/dini|islam/.test(g) || /dini|mevlana|diyanet/.test(t)) return "Dini";
  if (/muzik|müzik|music/.test(g)) return "Muzik";
  if (/belgesel|documentary/.test(g)) return "Belgesel";
  if (/trt|kamu|tbmm/.test(t)) return "Kamu";
  if (/radyo|radio|fm\b/.test(t)) return "Radyo Yerel";
  return "Ulusal";
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

  return { channels, streamMapRaw, catalogKeys, streamMapKeys, allKnownKeys, catalogNames };
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

async function loadLocalM3uSources() {
  const cfg = loadJson(path.join(__dirname, "m3u_sources.json"));
  const localSources = (cfg?.sources || []).filter((s) =>
    LOCAL_SOURCE_PREFIXES.some((p) => s.id?.startsWith(p)),
  );
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
    const entries = parseM3U(text);
    log(`  ${entries.length} akis`);
    for (const e of entries) allEntries.push({ ...e, sourceId: src.id });
  }
  return { entries: allEntries, sourceCount: sorted.length };
}

function pickUrlsToProbe(urls) {
  const sorted = sortUrlsByQuality(uniqueUrls(urls));
  const official = sorted.filter(isOfficialCdnUrl);
  const other = sorted.filter((u) => !isOfficialCdnUrl(u));
  return uniqueUrls([...official, ...other]).slice(0, MAX_M3U_CANDIDATES_PROBE);
}

async function probeUrls(urls) {
  if (skipProbe) return urls.map((url) => ({ url, live: true, reason: "skipped" }));
  return pooledMap(urls, PROBE_CONCURRENCY, async (url) => {
    const result = await probeChannelPlayback(url, PROBE_TIMEOUT_MS);
    return { url, live: result.live, reason: result.reason, status: result.status };
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

function displayNameFromEntry(entry) {
  return (entry.cleaned || entry.title || "").replace(/\s+/g, " ").trim();
}

async function main() {
  const now = new Date().toISOString();
  const { channels, streamMapRaw, allKnownKeys, catalogNames } = loadCatalog();
  const revision = Number(streamMapRaw._revision) || 0;
  const prevMapKeys = Object.keys(streamMapRaw).filter((k) => k !== "_revision").length;

  log(`Katalog: ${channels.length} kanal, stream_map rev=${revision}`);

  const { entries: m3uEntries, sourceCount } = await loadLocalM3uSources();
  log(`Yerel M3U akis: ${m3uEntries.length} (${sourceCount} kaynak)`);

  const byKey = new Map();
  const stats = {
    skippedInCatalog: 0,
    skippedNotLegal: 0,
    skippedRisky: 0,
  };

  for (const entry of m3uEntries) {
    if (!isLegalM3uEntry(entry)) {
      if (entryInCatalog(entry, allKnownKeys, catalogNames)) stats.skippedInCatalog++;
      else stats.skippedNotLegal++;
      continue;
    }
    if (entryInCatalog(entry, allKnownKeys, catalogNames)) {
      stats.skippedInCatalog++;
      continue;
    }

    const key = resolveM3uKey(entry);
    if (!key) continue;

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name: displayNameFromEntry(entry),
        group: entry.groupTitle || "",
        urls: [],
        sourceIds: new Set(),
        entries: [],
      });
    }
    const rec = byKey.get(key);
    rec.urls.push(entry.url);
    rec.sourceIds.add(entry.sourceId);
    rec.entries.push(entry);
    if (entry.groupTitle && !rec.group) rec.group = entry.groupTitle;
  }

  let candidates = [...byKey.values()].map((rec) => ({
    key: rec.key,
    name: rec.name,
    group: rec.group,
    category: mapCategory(rec.group, rec.name),
    urls: uniqueUrls(rec.urls),
    sourceId: [...rec.sourceIds].sort()[0],
    officialUrls: uniqueUrls(rec.urls.filter(isOfficialCdnUrl)),
  }));

  candidates.sort((a, b) => {
    const oa = a.officialUrls.length > 0 ? 1 : 0;
    const ob = b.officialUrls.length > 0 ? 1 : 0;
    if (oa !== ob) return ob - oa;
    return a.name.localeCompare(b.name, "tr");
  });

  log(`Yasal eksik aday: ${candidates.length}`);

  const report = {
    generatedAt: now,
    dryRun: !doApply,
    sourceCount,
    catalogChannelCount: channels.length,
    streamMapRevisionBefore: revision,
    candidatesTotal: candidates.length,
    added: [],
    alreadyInCatalog: stats.skippedInCatalog,
    skippedNotLegal: stats.skippedNotLegal,
    probeFailed: [],
    riskySkipped: [],
    warnings: [],
  };

  const nextChannels = [...channels];
  const nextMapRaw = { ...streamMapRaw };
  const existingKeys = new Set(allKnownKeys);

  for (const cand of candidates) {
    const toProbe = pickUrlsToProbe(cand.urls);
    const probeResults = await probeUrls(toProbe);
    const liveUrls = sortUrlsByQuality(probeResults.filter((r) => r.live).map((r) => r.url));

    if (!liveUrls.length) {
      report.probeFailed.push({
        name: cand.name,
        key: cand.key,
        probed: toProbe.length,
        probeResults,
      });
      log(`PROBE FAIL ${cand.name} (${toProbe.length} url)`);
      continue;
    }

    const safeLive = liveUrls.filter((u) => !isRiskyStreamUrl(u) && isLegalM3uUrl(u));
    const officialLive = safeLive.filter(isOfficialCdnUrl);
    const chosen = uniqueUrls([...officialLive, ...safeLive]).slice(0, MAX_URLS_PER_NEW_CHANNEL);

    if (!chosen.length) {
      report.riskySkipped.push({ name: cand.name, key: cand.key, reason: "probe-live-but-risky" });
      log(`RISKY SKIP ${cand.name}`);
      continue;
    }

    if (existingKeys.has(cand.key)) {
      report.warnings.push(`${cand.name}: anahtar zaten var (${cand.key})`);
      log(`ATLA ${cand.name} key=${cand.key} zaten mevcut`);
      continue;
    }

    const channelObj = {
      name: cand.name,
      url: "",
      category: cand.category,
      streamUrl: chosen[0],
    };

    nextChannels.push(channelObj);
    nextMapRaw[cand.key] = chosen;
    existingKeys.add(cand.key);

    report.added.push({
      name: cand.name,
      key: cand.key,
      category: cand.category,
      urls: chosen,
      sourceId: cand.sourceId,
      probeResults,
    });
    log(`+EKLE ${cand.name} key=${cand.key} urls=${chosen.length}`);
  }

  const mapChanged = report.added.length > 0;
  if (mapChanged) {
    nextMapRaw._revision = revision + 1;
  }
  report.streamMapRevisionAfter = nextMapRaw._revision;
  report.addedCount = report.added.length;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  atomicWriteJson(REPORT_PATH, report);
  log(`Rapor: ${REPORT_PATH}`);
  log(
    `Ozet: eklendi=${report.added.length} probe-fail=${report.probeFailed.length} riskli=${report.riskySkipped.length} zaten-vardi=${stats.skippedInCatalog}`,
  );

  if (!mapChanged) {
    log("Degisiklik yok.");
    return;
  }

  if (!doApply) {
    log("DRY-RUN: yazmak icin --apply ekle");
    return;
  }

  validateBeforeWrite(nextMapRaw, nextChannels, channels.length, prevMapKeys);

  const writeTargets = [streamMapPath, channelsPath];
  const backupDir = path.join(BACKUP_ROOT, stamp());
  backupFiles(writeTargets, backupDir);
  log(`Yedek: ${backupDir}`);

  atomicWriteJson(streamMapPath, nextMapRaw);
  atomicWriteJson(channelsPath, nextChannels);
  log(`Yazildi: rev=${nextMapRaw._revision}, kanal=${nextChannels.length}`);
}

main().catch((e) => {
  console.error("[import-legal] HATA:", e);
  process.exit(1);
});
