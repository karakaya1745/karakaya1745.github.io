#!/usr/bin/env node
/**
 * TKGS eksik ulusal şifresiz kanal durum raporu — M3U tarama + probe (yazma yok).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  M3U_KEY_ALIASES,
  PROBE_CONCURRENCY,
  atomicWriteJson,
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
  uniqueUrls,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "out");
const MISSING_PATH = path.join(__dirname, "missing_channels.json");
const REPORT_JSON = path.join(OUT_DIR, "tkgs_missing_status.json");
const REPORT_MD = path.join(OUT_DIR, "tkgs_missing_status.md");

const MAX_PROBE_PER_CHANNEL = 10;
const FALSE_POSITIVE_TITLE = /\(romania\)|\(azerbaijan\)|\(az\)|\(de\)|\(uk\)|\(us\)/i;

const args = new Set(process.argv.slice(2));
const tkgsPath =
  [...process.argv].includes("--tkgs")
    ? process.argv[process.argv.indexOf("--tkgs") + 1]
    : path.join(ROOT, "..", "ANDROİD TV UYGULAMASI2", "tools", "tkgs_eklenecek_kanallar.json");
const channelsPath =
  [...process.argv].includes("--channels")
    ? process.argv[process.argv.indexOf("--channels") + 1]
    : path.join(ROOT, "channels.json");

function log(...a) {
  console.log("[tkgs-probe]", ...a);
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

function findMissingEntry(name, missingList) {
  const key = normalizeChannelKey(name);
  return (
    missingList.find((e) => normalizeChannelKey(e.name) === key) || {
      name,
      aliases: [],
      skipIfKeysExist: [],
    }
  );
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

function isRelevantCandidate(entry, candidate) {
  const title = candidate.rawTitle || candidate.title || "";
  if (FALSE_POSITIVE_TITLE.test(title)) return false;
  if (!titleFuzzyMatchesChannelName(entry.name, title)) return false;
  const nameKey = normalizeChannelKey(entry.name);
  const titleKey = normalizeChannelKey(title);
  if (titleKey === nameKey) return true;
  const resolved = candidate.key || "";
  return resolveSearchKeys(entry).includes(resolved);
}

function findAllM3uCandidates(entry, m3uIndex, m3uEntries) {
  const searchKeys = resolveSearchKeys(entry);
  const candidates = [];
  const seen = new Set();

  const addCandidate = (c, turkey = false, rawTitle = "") => {
    if (!c?.url || seen.has(c.url)) return;
    if (FALSE_POSITIVE_TITLE.test(rawTitle || c.title || "")) return;
    if (!isRelevantCandidate(entry, c)) return;
    seen.add(c.url);
    candidates.push({
      url: c.url,
      sourceId: c.sourceId,
      title: c.title || rawTitle,
      rawTitle: rawTitle || c.title,
      key: c.key,
      turkey,
      trusted: isTrustedCdnUrl(c.url),
      risky: isRiskyStreamUrl(c.url),
      skipped: shouldSkipM3uUrl(c.url),
    });
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

function pickUrlsToProbe(candidates) {
  const sorted = [...candidates].sort((a, b) => {
    if (a.turkey !== b.turkey) return a.turkey ? -1 : 1;
    if (a.skipped !== b.skipped) return a.skipped ? 1 : -1;
    const ta = a.trusted ? 1 : 0;
    const tb = b.trusted ? 1 : 0;
    return tb - ta;
  });
  return uniqueUrls(sortUrlsByQuality(sorted.map((c) => c.url))).slice(0, MAX_PROBE_PER_CHANNEL);
}

function isGithubFeasibleUrl(url) {
  if (isRiskyStreamUrl(url)) return false;
  if (shouldSkipM3uUrl(url)) return false;
  return true;
}

function probeStatus(inCatalog, candidateCount, workingCount) {
  if (inCatalog) return "⏭ zaten var";
  if (candidateCount === 0) return "❓ M3U'da yok";
  if (workingCount > 0) return "✅ çalışıyor";
  return "❌ çalışmıyor";
}

function actionLabel(inCatalog, workingCount, candidateCount) {
  if (inCatalog) return "zaten eklendi";
  if (workingCount > 0) return "bot ekleyebilir";
  return "sizin link gerekir";
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# TKGS Eksik Ulusal Şifresiz Kanal Durumu");
  lines.push("");
  lines.push(`Oluşturulma: ${report.generatedAt}`);
  lines.push(`M3U kaynak sayısı: ${report.m3uSourceCount}`);
  lines.push(`TKGS ulusal kanal: ${report.channels.length}`);
  lines.push("");
  lines.push("## Özet");
  lines.push("");
  lines.push(`| Aksiyon | Adet |`);
  lines.push(`|---------|------|`);
  for (const [action, count] of Object.entries(report.summary.byAction)) {
    lines.push(`| ${action} | ${count} |`);
  }
  lines.push("");

  const groups = {};
  for (const ch of report.channels) {
    if (!groups[ch.action]) groups[ch.action] = [];
    groups[ch.action].push(ch);
  }

  const actionOrder = ["bot ekleyebilir", "sizin link gerekir", "zaten eklendi"];
  for (const action of actionOrder) {
    const items = groups[action];
    if (!items?.length) continue;
    lines.push(`## ${action} (${items.length})`);
    lines.push("");
    lines.push("| Kanal | Katalog | M3U aday | Probe | Aksiyon |");
    lines.push("|-------|---------|----------|-------|---------|");
    for (const ch of items) {
      const m3u = ch.m3uCandidateCount > 0 ? `${ch.m3uCandidateCount} adet` : "—";
      lines.push(`| ${ch.name} | ${ch.inCatalog ? "✅" : "❌"} | ${m3u} | ${ch.probeStatus} | ${ch.action} |`);
    }
    lines.push("");
  }

  const needsLink = groups["sizin link gerekir"] || [];
  if (needsLink.length) {
    lines.push("## Probe detayları (sizin link gerekir)");
    lines.push("");
    for (const ch of needsLink) {
      lines.push(`### ${ch.name}`);
      if (!ch.m3uCandidateCount) {
        lines.push("_M3U'da aday bulunamadı._");
      } else {
        for (const r of ch.probeResults) {
          const icon = r.live ? "✅" : "❌";
          lines.push(`- ${icon} \`${r.url}\` — ${r.reason}`);
        }
      }
      lines.push("");
    }
  }

  const botReady = groups["bot ekleyebilir"] || [];
  if (botReady.length) {
    lines.push("## Çalışan URL'ler (bot ekleyebilir)");
    lines.push("");
    for (const ch of botReady) {
      lines.push(`### ${ch.name}`);
      for (const url of ch.workingUrls) {
        lines.push(`- ✅ \`${url}\``);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const now = new Date().toISOString();
  const tkgsList = loadJson(tkgsPath, []);
  if (!Array.isArray(tkgsList) || !tkgsList.length) {
    throw new Error(`TKGS listesi okunamadi: ${tkgsPath}`);
  }

  const ulusalChannels = tkgsList.filter((c) => c.category === "Ulusal");
  const missingList = loadJson(MISSING_PATH, { channels: [] }).channels || [];
  const channelsArr = loadJson(channelsPath, []);
  const existingKeys = new Set(channelsArr.map((c) => normalizeChannelKey(c.name)));

  log(`TKGS ulusal: ${ulusalChannels.length}, katalog: ${channelsArr.length}`);

  const m3uEntries = await loadM3uSources();
  const m3uIndex = buildM3uIndex(m3uEntries);
  const m3uSourceCount = loadJson(path.join(__dirname, "m3u_sources.json"))?.sources?.length || 0;
  log(`M3U index: ${m3uIndex.size} anahtar`);

  const results = [];

  for (const tkgs of ulusalChannels) {
    const entry = findMissingEntry(tkgs.name, missingList);
    const searchEntry = { ...entry, name: tkgs.name, category: tkgs.category };
    const inCatalog = channelExists(searchEntry, existingKeys);

    log(`--- ${tkgs.name}${inCatalog ? " (katalogda)" : ""}`);
    const candidates = inCatalog ? [] : findAllM3uCandidates(searchEntry, m3uIndex, m3uEntries);
    const feasible = candidates.filter((c) => isGithubFeasibleUrl(c.url));
    const toProbe = inCatalog ? [] : pickUrlsToProbe(feasible.length ? feasible : candidates);

    const probeResults = await pooledMap(toProbe, PROBE_CONCURRENCY, async (url) => {
      const result = await probeChannelPlayback(url);
      const cand = candidates.find((c) => c.url === url);
      return {
        url,
        live: result.live,
        reason: result.reason,
        status: result.status,
        sourceId: cand?.sourceId,
        title: cand?.title,
      };
    });

    const workingUrls = sortUrlsByQuality(probeResults.filter((r) => r.live).map((r) => r.url));
    const pStatus = probeStatus(inCatalog, candidates.length, workingUrls.length);
    const action = actionLabel(inCatalog, workingUrls.length, candidates.length);

    results.push({
      name: tkgs.name,
      category: tkgs.category,
      tkgsUrl: tkgs.url,
      tkgsStreamUrl: tkgs.streamUrl,
      inCatalog,
      m3uCandidateCount: candidates.length,
      probedCount: toProbe.length,
      probeStatus: pStatus,
      action,
      searchKeys: resolveSearchKeys(searchEntry),
      workingUrls,
      probeResults,
      m3uSampleUrls: candidates.slice(0, 5).map((c) => c.url),
    });

    log(`  m3u=${candidates.length} probe=${toProbe.length} calisan=${workingUrls.length} -> ${action}`);
  }

  const byAction = {};
  for (const ch of results) {
    byAction[ch.action] = (byAction[ch.action] || 0) + 1;
  }

  const report = {
    generatedAt: now,
    tkgsPath,
    channelsPath,
    m3uSourceCount,
    channels: results,
    summary: {
      total: results.length,
      inCatalog: results.filter((c) => c.inCatalog).length,
      withM3u: results.filter((c) => c.m3uCandidateCount > 0).length,
      working: results.filter((c) => c.workingUrls.length > 0).length,
      byAction,
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  atomicWriteJson(REPORT_JSON, report);
  fs.writeFileSync(REPORT_MD, toMarkdown(report), "utf8");
  log(`JSON: ${REPORT_JSON}`);
  log(`MD:   ${REPORT_MD}`);
  log(`Ozet: ${JSON.stringify(byAction)}`);
}

main().catch((e) => {
  console.error("[tkgs-probe] HATA:", e);
  process.exit(1);
});
