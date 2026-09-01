#!/usr/bin/env node
/**
 * Stream health maintainer — ölü link temizle + M3U'dan yeni link ekle
 *
 * HEDEF: GÜNCELLEME/ + app/assets stream_map.json (GitHub Pages OTA)
 * channels.json'a DOKUNMAZ (kanal listesi korunur)
 *
 * Güvenlik:
 *  - Varsayılan DRY-RUN (--apply olmadan yazmaz)
 *  - Yazmadan önce otomatik yedek
 *  - Ölü URL: 2 ardışık tur sonra silinir (çalışan yedek varsa)
 *  - Son URL asla silinmez (yedek bulunana kadar)
 *  - stream_map anahtar sayısı / channels sayısı doğrulanır
 *
 * Usage:
 *   node tools/stream-health-bot/stream-health-bot.mjs              # dry-run (pilot 40)
 *   node tools/stream-health-bot/stream-health-bot.mjs --all-tv     # tüm TV kanalları
 *   node tools/stream-health-bot/stream-health-bot.mjs --apply      # yaz (GÜNCELLEME + assets)
 *   node tools/stream-health-bot/stream-health-bot.mjs --apply --pages  # + karakaya1745.github.io
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  FAIL_STREAK_REMOVE,
  MAX_M3U_CANDIDATES_PROBE,
  MAX_URLS_PER_CHANNEL,
  MIN_CHANNELS_COUNT,
  MIN_STREAM_MAP_KEYS,
  PROBE_CONCURRENCY,
  atomicWriteJson,
  backupFiles,
  checkUrlLive,
  fetchText,
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
const ASSETS = path.join(ROOT, "app", "src", "main", "assets");
const STAGING = path.join(ROOT, "GÜNCELLEME");
const OUT_DIR = path.join(__dirname, "out");
const STATE_PATH = path.join(OUT_DIR, "url_health_state.json");
const BACKUP_ROOT = path.join(__dirname, "backups");
const PAGES_REPO = path.join(ROOT, "..", "karakaya1745.github.io");

const STREAM_MAP_TARGETS = [
  path.join(STAGING, "stream_map.json"),
  path.join(ASSETS, "stream_map.json"),
];
const CHANNELS_TARGETS = [
  path.join(STAGING, "channels.json"),
  path.join(ASSETS, "channels.json"),
];

const args = new Set(process.argv.slice(2));
const doApply = args.has("--apply");
const allTv = args.has("--all-tv");
const syncPages = args.has("--pages");
const syncProject = args.has("--sync-project");
const skipProbe = args.has("--no-probe");

function getCliArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const customStreamMapPath = getCliArg("--stream-map");
const customChannelsPath = getCliArg("--channels");

function log(...a) {
  console.log("[health-bot]", ...a);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function loadState() {
  const data = loadJson(STATE_PATH, { urlFails: {}, runs: [] });
  if (!data.urlFails) data.urlFails = {};
  if (!data.runs) data.runs = [];
  return data;
}

function saveState(state) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  atomicWriteJson(STATE_PATH, state);
}

function loadPrimaryStreamMap() {
  const candidates = [
    customStreamMapPath,
    path.join(STAGING, "stream_map.json"),
    path.join(ASSETS, "stream_map.json"),
  ].filter(Boolean);
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) throw new Error("stream_map.json bulunamadi");
  const raw = loadJson(file, {});
  const map = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "_revision") continue;
    const urls = uniqueUrls(toUrlArray(v));
    if (urls.length) map[k] = urls;
  }
  return { file, revision: Number(raw._revision) || 0, raw, map };
}

function loadPrimaryChannels() {
  const candidates = [
    customChannelsPath,
    path.join(STAGING, "channels.json"),
    path.join(ASSETS, "channels.json"),
  ].filter(Boolean);
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) throw new Error("channels.json bulunamadi");
  const arr = loadJson(file, []);
  if (!Array.isArray(arr)) throw new Error("channels.json dizi degil");
  return { file, channels: arr };
}

function resolveWriteStreamMapTargets() {
  const targets = [];
  if (customStreamMapPath) targets.push(customStreamMapPath);
  if (syncProject || !customStreamMapPath) {
    targets.push(...STREAM_MAP_TARGETS);
  }
  if (syncPages && fs.existsSync(PAGES_REPO)) {
    targets.push(path.join(PAGES_REPO, "stream_map.json"));
  }
  return [...new Set(targets)];
}

function resolveWriteChannelsTargets() {
  const targets = [];
  if (customChannelsPath) targets.push(customChannelsPath);
  if (syncProject || !customChannelsPath) {
    targets.push(...CHANNELS_TARGETS);
  }
  if (syncPages && fs.existsSync(PAGES_REPO)) {
    targets.push(path.join(PAGES_REPO, "channels.json"));
  }
  return [...new Set(targets)];
}

function isRadioChannel(ch) {
  const cat = String(ch.category || "").trim();
  return cat.toLowerCase() === "radyo" || cat.toLowerCase().startsWith("radyo ");
}

function resolveTargetKeys(channels, streamMap) {
  if (allTv) {
    const keys = new Set();
    for (const ch of channels) {
      if (isRadioChannel(ch)) continue;
      const key = normalizeChannelKey(ch.name);
      if (streamMap[key]?.length) keys.add(key);
    }
    return [...keys];
  }
  const pilot = loadJson(path.join(__dirname, "pilot_channels.json"));
  return (pilot?.channels || []).map((p) => p.key);
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
      text = await fetchText(src.url);
    } catch (e) {
      if (src.localFallback) {
        const localPath = path.isAbsolute(src.localFallback)
          ? src.localFallback
          : path.join(ROOT, src.localFallback);
        if (fs.existsSync(localPath)) {
          log(`  yerel yedek: ${src.localFallback}`);
          text = fs.readFileSync(localPath, "utf8");
        }
      }
      if (!text) log(`  UYARI ${src.id}: ${e.message}`);
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
      });
    }
  }
  return byKey;
}

async function probeMap(urls, state, now, networkHealthy) {
  const results = await pooledMap(urls, PROBE_CONCURRENCY, async (url) => {
    if (skipProbe) return { url, live: true };
    const live = await checkUrlLive(url);
    const prev = Number(state.urlFails[url]?.failStreak) || 0;
    if (live) {
      state.urlFails[url] = { failStreak: 0, lastOk: now };
    } else if (networkHealthy) {
      state.urlFails[url] = { failStreak: prev + 1, lastFail: now };
    } else {
      state.urlFails[url] = { failStreak: prev, lastFail: now, skippedIncrement: true };
    }
    return { url, live, failStreak: state.urlFails[url].failStreak };
  });
  return results;
}

async function mergeChannelUrls({ key, currentUrls, m3uCandidates, probeResults, state, skipProbeRun }) {
  const live = probeResults.filter((r) => r.live).map((r) => r.url);
  const dead = probeResults.filter((r) => !r.live);

  const removed = [];
  const keptDead = [];
  const allowRemove = !skipProbeRun;
  for (const d of dead) {
    const streak = Number(state.urlFails[d.url]?.failStreak) || 0;
    const canRemove = allowRemove && streak >= FAIL_STREAK_REMOVE && live.length > 0;
    if (canRemove) removed.push(d.url);
    else keptDead.push(d.url);
  }

  const existingSet = new Set([...currentUrls, ...live, ...keptDead]);
  const newFromM3u = [];
  for (const c of m3uCandidates) {
    if (existingSet.has(c.url)) continue;
    newFromM3u.push(c.url);
    if (newFromM3u.length >= MAX_M3U_CANDIDATES_PROBE) break;
  }

  let added = [];
  const trustedFromM3u = [];
  for (const c of m3uCandidates) {
    if (existingSet.has(c.url)) continue;
    if (isTrustedCdnUrl(c.url)) trustedFromM3u.push(c.url);
  }
  const trustedSorted = sortUrlsByQuality(uniqueUrls(trustedFromM3u)).slice(0, 4);

  if (newFromM3u.length && !skipProbeRun) {
    for (const url of newFromM3u.slice(0, MAX_M3U_CANDIDATES_PROBE)) {
      if (isTrustedCdnUrl(url)) continue;
      const ok = await checkUrlLive(url);
      const ts = new Date().toISOString();
      if (ok) {
        state.urlFails[url] = { failStreak: 0, lastOk: ts, source: "m3u" };
        added.push(url);
      } else {
        state.urlFails[url] = { failStreak: 1, lastFail: ts, source: "m3u" };
      }
    }
  }

  for (const url of trustedSorted) {
    if (!currentUrls.includes(url) && !added.includes(url)) {
      added.push(url);
      state.urlFails[url] = {
        failStreak: 0,
        lastOk: new Date().toISOString(),
        source: "m3u-trusted",
      };
    }
  }

  // Mevcut çalışan URL sırasını koru; yeni güvenli linkleri öne al.
  const liveSet = new Set(live);
  const keptLiveInOrder = currentUrls.filter((u) => liveSet.has(u) && !removed.includes(u));
  const newLive = live.filter((u) => !keptLiveInOrder.includes(u));

  const safeAdded = sortUrlsByQuality(added.filter((u) => !isRiskyStreamUrl(u)));
  const riskyAdded = added.filter(isRiskyStreamUrl);

  let merged = uniqueUrls([
    ...safeAdded,
    ...keptLiveInOrder,
    ...newLive,
    ...riskyAdded,
    ...keptDead.filter((u) => !removed.includes(u)),
  ]);

  if (!merged.length) merged = uniqueUrls([...currentUrls]);

  // Sadece yeni link eklerken üst sınır uygula; mevcut çalışanları kesme.
  if (added.length > 0 && merged.length > MAX_URLS_PER_CHANNEL) {
    const mustKeep = new Set([...keptLiveInOrder, ...keptDead, ...removed]);
    const tail = merged.filter((u) => !mustKeep.has(u));
    const head = merged.filter((u) => mustKeep.has(u));
    merged = [...head, ...tail].slice(0, MAX_URLS_PER_CHANNEL);
  }

  const sameUrls =
    merged.length === currentUrls.length &&
    merged.every((u, i) => u === currentUrls[i]);
  const changed = !sameUrls && (removed.length > 0 || added.length > 0);

  return {
    key,
    urls: changed ? merged : currentUrls,
    changed,
    removed,
    added,
    liveCount: live.length + added.length,
    keptDeadCount: keptDead.length,
  };
}

function validateBeforeWrite(streamMapObj, channelsArr) {
  const keys = Object.keys(streamMapObj).filter((k) => k !== "_revision");
  if (keys.length < MIN_STREAM_MAP_KEYS) {
    throw new Error(`stream_map anahtar sayisi dusuk: ${keys.length}`);
  }
  if (!Array.isArray(channelsArr) || channelsArr.length < MIN_CHANNELS_COUNT) {
    throw new Error(`channels.json sayisi dusuk: ${channelsArr?.length}`);
  }
}

async function main() {
  const now = new Date().toISOString();
  const state = loadState();

  const { revision, raw: streamMapRaw, map: streamMap, file: streamMapFile } =
    loadPrimaryStreamMap();
  const { channels, file: channelsFile } = loadPrimaryChannels();
  const targetKeys = resolveTargetKeys(channels, streamMap);

  log(`Mod: ${allTv ? "TUM TV" : "PILOT"} | hedef kanal: ${targetKeys.length}`);
  log(`Kaynak stream_map: ${streamMapFile} rev=${revision}`);
  log(`Kaynak channels: ${channelsFile} (${channels.length})`);

  const m3uEntries = await loadM3uSources();
  const m3uIndex = buildM3uIndex(m3uEntries);
  log(`M3U index: ${m3uIndex.size} anahtar`);

  // Probe sagligi: cok az URL cevap veriyorsa ag sorunu varsay (olum sayaci arttirma)
  const probeSample = targetKeys.slice(0, 5).flatMap((k) => (streamMap[k] || []).slice(0, 3));
  let probeHits = 0;
  if (!skipProbe && probeSample.length) {
    const sampleResults = await pooledMap(probeSample.slice(0, 12), 8, async (url) =>
      checkUrlLive(url),
    );
    probeHits = sampleResults.filter(Boolean).length;
  }
  const networkHealthy = skipProbe || probeHits >= 2 || probeSample.length === 0;
  log(`Ag sagligi: ${networkHealthy ? "iyi" : "zayif"} (ornek ${probeHits}/${Math.min(12, probeSample.length)} canli)`);

  const nextMap = { ...streamMap };
  const report = {
    generatedAt: now,
    mode: allTv ? "all-tv" : "pilot",
    targetCount: targetKeys.length,
    changed: [],
    removedUrls: 0,
    addedUrls: 0,
    warnings: [],
  };

  for (const key of targetKeys) {
    const currentUrls = streamMap[key] || [];
    if (!currentUrls.length) {
      report.warnings.push(`${key}: stream_map'te URL yok`);
      const m3uOnly = (m3uIndex.get(key) || []).map((x) => x.url).slice(0, MAX_M3U_CANDIDATES_PROBE);
      if (m3uOnly.length && !skipProbe) {
        const added = [];
        for (const url of m3uOnly) {
          if (await checkUrlLive(url)) added.push(url);
        }
        if (added.length) {
          nextMap[key] = sortUrlsByQuality(added).slice(0, MAX_URLS_PER_CHANNEL);
          report.changed.push({ key, added: added.length, removed: 0, live: added.length });
          report.addedUrls += added.length;
          log(`+YENI ${key}: ${added.length} link (bos kanala)`);
        }
      }
      continue;
    }

    const probeResults = await probeMap(currentUrls, state, now, networkHealthy);
    const m3uCandidates = m3uIndex.get(key) || [];
    const result = await mergeChannelUrls({
      key,
      currentUrls,
      m3uCandidates,
      probeResults,
      state,
      skipProbeRun: skipProbe,
    });

    if (result.changed) {
      nextMap[key] = result.urls;
      report.changed.push({
        key,
        added: result.added.length,
        removed: result.removed.length,
        live: result.liveCount,
        keptDead: result.keptDeadCount,
      });
      report.removedUrls += result.removed.length;
      report.addedUrls += result.added.length;
      const tag = result.added.length ? `+${result.added.length}` : "";
      const tag2 = result.removed.length ? `-${result.removed.length}` : "";
      log(`DEGIS ${key} ${tag}${tag2} live=${result.liveCount} urls=${result.urls.length}`);
    } else {
      const liveN = probeResults.filter((r) => r.live).length;
      log(`OK    ${key} live=${liveN}/${currentUrls.length}`);
    }
  }

  const newStreamMapObj = { ...streamMapRaw };
  for (const [k, v] of Object.entries(nextMap)) {
    newStreamMapObj[k] = v;
  }
  // Revizyon yalnızca gerçek URL değişikliğinde artsın (yanlış karşılaştırma önlenir)
  const mapChanged =
    report.changed.length > 0 || report.addedUrls > 0 || report.removedUrls > 0;

  if (mapChanged) {
    newStreamMapObj._revision = revision + 1;
  } else {
    newStreamMapObj._revision = revision;
  }

  report.streamMapRevision = newStreamMapObj._revision;
  report.mapChanged = mapChanged;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  atomicWriteJson(path.join(OUT_DIR, "maintain_report.json"), report);
  log(`Rapor: ${path.join(OUT_DIR, "maintain_report.json")}`);
  log(`Ozet: ${report.changed.length} kanal degisti, +${report.addedUrls} -${report.removedUrls} URL`);

  state.runs.push({
    at: now,
    mode: report.mode,
    changedChannels: report.changed.length,
    addedUrls: report.addedUrls,
    removedUrls: report.removedUrls,
    applied: false,
  });
  if (state.runs.length > 50) state.runs = state.runs.slice(-50);

  if (!mapChanged) {
    log("stream_map degismedi.");
    if (doApply && syncPages && customChannelsPath && fs.existsSync(PAGES_REPO)) {
      const channelsText = fs.readFileSync(channelsFile, "utf8");
      const pagesCh = path.join(PAGES_REPO, "channels.json");
      atomicWriteJson(pagesCh, JSON.parse(channelsText));
      log(`channels senkron: ${pagesCh}`);
    }
    saveState(state);
    if (!doApply) log("DRY-RUN tamam.");
    return;
  }

  if (!doApply) {
    log("DRY-RUN: yazmak icin --apply ekle");
    saveState(state);
    return;
  }

  validateBeforeWrite(newStreamMapObj, channels);

  const writeMapTargets = resolveWriteStreamMapTargets();
  const backupDir = path.join(BACKUP_ROOT, stamp());
  backupFiles(writeMapTargets, backupDir);
  log(`Yedek: ${backupDir}`);

  for (const p of writeMapTargets) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    atomicWriteJson(p, newStreamMapObj);
    log(`Yazildi: ${p}`);
  }

  if (syncPages && customChannelsPath && fs.existsSync(PAGES_REPO)) {
    const channelsText = fs.readFileSync(channelsFile, "utf8");
    const pagesCh = path.join(PAGES_REPO, "channels.json");
    fs.writeFileSync(pagesCh, channelsText, "utf8");
    log(`channels senkron: ${pagesCh}`);
  }

  if (syncProject && customStreamMapPath) {
    for (const p of CHANNELS_TARGETS) {
      fs.copyFileSync(channelsFile, p);
      log(`channels kopya: ${p}`);
    }
  }

  state.runs[state.runs.length - 1].applied = true;
  saveState(state);

  log(`Tamam. stream_map _revision=${newStreamMapObj._revision}`);
  log("channels.json bot tarafindan degistirilmedi; Pages'e senkronlandi.");
}

main().catch((e) => {
  console.error("[health-bot] HATA:", e);
  process.exit(1);
});
