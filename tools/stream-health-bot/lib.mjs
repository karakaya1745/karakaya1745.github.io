/**
 * Stream health bot — paylaşılan yardımcılar.
 * ChannelKeys.kt / merge-m3u-tur.mjs ile uyumlu normalize.
 */
import fs from "fs";
import path from "path";

export const UA = "Mozilla/5.0 (Linux; Android 14) CanliTVTR-healthbot/1.0";
export const PROBE_TIMEOUT_MS = 5000;
export const PROBE_CONCURRENCY = 16;
export const FAIL_STREAK_REMOVE = 2;
export const MAX_URLS_PER_CHANNEL = 30;
export const MAX_M3U_CANDIDATES_PROBE = 6;
export const MIN_STREAM_MAP_KEYS = 50;
export const MIN_CHANNELS_COUNT = 100;

/** M3U aday sıralaması için güvenilir CDN hostları (probe atlanmaz) */
export const TRUSTED_STREAM_HOSTS = [
  "ercdn.net",
  "daioncdn.net",
  "medya.trt.com.tr",
  "trt.com.tr",
  "mncdn.com",
  "ensonhaber.com",
  "turkmedya-live.ercdn.net",
];

export function isTrustedCdnUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return TRUSTED_STREAM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** @param {string} name */
export function normalizeChannelKey(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\u0130/g, "i")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

export function cleanM3uTitle(raw) {
  let t = raw.trim();
  t = t.replace(/\([^)]*\)/g, " ");
  t = t.replace(/\[[^\]]*\]/g, " ");
  t = t.replace(/\b(fhd|uhd|4k|576p|720p|1080p|360p|900p|480p|sd|hd)\b/gi, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** M3U başlığı / tvg-id → stream_map anahtarı */
export const M3U_KEY_ALIASES = {
  a2tv: "a2",
  haberturktv: "haberturk",
  nowtv: "now",
  tv360: "360tv",
  tv85: "tv85",
  tv8bucuk: "tv85",
  "24tv": "t24",
  cnbc: "cnbce",
  cnbcetv: "cnbce",
  fox: "now",
  showtvtr: "showtv",
  startvtr: "startv",
  trt1tr: "trt1",
  trtspor1: "trtspor",
  trtspor2: "trtsporyildiz",
  teve2tr: "teve2",
  tv2tr: "teve2",
  benguturktv: "benguturk",
  sozcutvtr: "sozcutv",
  sozcutv: "sozcutv",
  cnnturktr: "cnnturk",
  cnnturk: "cnnturk",
};

export function resolveM3uKey(entry) {
  const titleKey = normalizeChannelKey(entry.cleaned || entry.title || "");
  const tvgRaw = (entry.tvgId || entry.tvgBase || "").toLowerCase();
  const tvgBase = tvgRaw.split("@")[0].split(".")[0];
  const candidates = [titleKey, tvgBase, normalizeChannelKey(tvgRaw)];
  for (const c of candidates) {
    if (!c) continue;
    if (M3U_KEY_ALIASES[c]) return M3U_KEY_ALIASES[c];
    if (c.length >= 2) return c;
  }
  return titleKey;
}

export function parseExtInfTitle(line) {
  if (!line.startsWith("#EXTINF")) return "";
  const idx = line.lastIndexOf(",");
  if (idx === -1) return "";
  return line.slice(idx + 1).trim();
}

export function parseGroupTitle(line) {
  const m = line.match(/group-title="([^"]*)"/i);
  return m ? m[1].trim() : "";
}

/** @param {string} text */
export function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXTINF")) continue;
    const tvgM = line.match(/tvg-id="([^"]*)"/i);
    const tvgId = tvgM ? tvgM[1] : "";
    const title = parseExtInfTitle(line);
    const groupTitle = parseGroupTitle(line);
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (!next || next.startsWith("#")) continue;
      if (next.startsWith("http://") || next.startsWith("https://")) {
        out.push({
          title,
          cleaned: cleanM3uTitle(title),
          url: next,
          groupTitle,
          tvgId,
          tvgBase: tvgId ? tvgId.split("@")[0].split(".")[0] : "",
        });
        i = j;
      }
      break;
    }
  }
  return out;
}

export function isTurkeyM3uEntry(entry) {
  const tvg = (entry.tvgId || "").toLowerCase();
  if (tvg.includes(".tr")) return true;
  const group = (entry.groupTitle || "").toLowerCase();
  if (group.includes("turk") || group.includes("türkiye") || group.includes("turkiye")) {
    return true;
  }
  return false;
}

export function isPlayableUrl(url) {
  const u = url.trim().toLowerCase();
  if (!/^https?:\/\//i.test(u)) return false;
  if (u.includes("youtube.com") || u.includes("youtu.be/")) return false;
  return (
    u.includes(".m3u8") ||
    u.includes("/playlist") ||
    u.includes("/chunklist") ||
    u.includes(".smil") ||
    u.includes("prog_index.m3u8")
  );
}

const TITLE_STOP_WORDS = new Set(["tv", "kanal", "hd", "fhd", "tr", "ulusal"]);

function significantTitleTokens(text) {
  return cleanM3uTitle(text)
    .toLowerCase()
    .split(/\s+/)
    .map((part) => normalizeChannelKey(part))
    .filter((token) => token.length >= 2 && !TITLE_STOP_WORDS.has(token));
}

/** M3U başlığı kanal adıyla anlamlı eşleşiyor mu (yanlış alias eşleşmesini engeller) */
export function titleFuzzyMatchesChannelName(channelName, m3uTitle) {
  const nameKey = normalizeChannelKey(channelName);
  const titleKey = normalizeChannelKey(cleanM3uTitle(m3uTitle));
  if (!nameKey || !titleKey) return false;
  if (titleKey === nameKey) return true;

  const nameTokens = significantTitleTokens(channelName);
  const titleTokens = significantTitleTokens(m3uTitle);
  if (!nameTokens.length || !titleTokens.length) return false;

  const matched = nameTokens.filter((token) =>
    titleTokens.some(
      (other) =>
        other === token ||
        (token.length >= 4 && (other.includes(token) || token.includes(other))),
    ),
  );
  return matched.length === nameTokens.length;
}

export function isValidHlsManifestSample(sample, contentType = "") {
  const ct = (contentType || "").toLowerCase();
  const low = sample.toString("utf8").toLowerCase();
  if (low.includes("<!doctype html") || low.includes("<html")) return false;
  if (low.includes("<smil")) return true;
  if (low.includes("#extm3u") || low.includes("#ext-x-stream-inf") || low.includes("#ext-x-")) {
    return true;
  }
  if (ct.includes("mpegurl") || ct.includes("m3u8")) {
    return low.includes("#extm3u") || low.includes("#ext-x-");
  }
  return false;
}

/**
 * Katı HLS probe — yanıtta #EXTM3U veya #EXT-X-STREAM-INF olmalı.
 * @returns {Promise<{ live: boolean, reason: string, status?: number }>}
 */
export async function probeChannelPlayback(url, timeoutMs = PROBE_TIMEOUT_MS) {
  if (!isPlayableUrl(url)) return { live: false, reason: "not-playable" };
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "*/*", Range: "bytes=0-8191" },
      signal: ac.signal,
    });
    clearTimeout(tm);
    if (!r.ok && r.status !== 206) {
      return { live: false, reason: `http-${r.status}`, status: r.status };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const sample = buf.subarray(0, Math.min(4096, buf.length));
    const ct = r.headers.get("content-type") || "";
    if (isValidHlsManifestSample(sample, ct)) {
      return { live: true, reason: "hls-manifest", status: r.status };
    }
    return { live: false, reason: "not-hls-manifest", status: r.status };
  } catch (e) {
    clearTimeout(tm);
    return { live: false, reason: e?.name === "AbortError" ? "timeout" : "network-error" };
  }
}

export async function checkUrlLive(url, timeoutMs = PROBE_TIMEOUT_MS) {
  const result = await probeChannelPlayback(url, timeoutMs);
  return result.live;
}

export async function pooledMap(items, concurrency, worker) {
  const results = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

/** @param {string} url */
export async function fetchText(url, timeoutMs = 20000) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: ac.signal,
    });
    clearTimeout(tm);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    clearTimeout(tm);
    throw e;
  }
}

export function loadJson(path, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/** @param {string} localFallback repo-root-relative or absolute path */
export function resolveLocalFallbackPath(localFallback, root) {
  return path.isAbsolute(localFallback) ? localFallback : path.join(root, localFallback);
}

/**
 * Fetch remote M3U text or read localFallback (local-only sources supported).
 * @param {{ id?: string, url?: string, localFallback?: string }} src
 * @param {string} root repo root for relative localFallback paths
 * @param {(msg: string) => void} [logFn]
 */
export async function loadM3uSourceText(src, root, logFn = () => {}) {
  const readLocal = () => {
    if (!src.localFallback) return null;
    const localPath = resolveLocalFallbackPath(src.localFallback, root);
    if (!fs.existsSync(localPath)) return null;
    logFn(`  yerel: ${src.localFallback}`);
    return fs.readFileSync(localPath, "utf8");
  };

  if (!src.url) return readLocal();

  try {
    return await fetchText(src.url);
  } catch (e) {
    const text = readLocal();
    if (text) return text;
    throw e;
  }
}

export function toUrlArray(value) {
  if (Array.isArray(value)) return value.map((u) => String(u).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function uniqueUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    const key = u.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function streamUrlQualityScore(url) {
  const u = url.toLowerCase();
  let score = 100_000;
  if (u.includes("2160") || u.includes("3840") || u.includes("uhd")) score = 1_000_000;
  else if (u.includes("1080") || u.includes("fhd") || u.includes("master_1080")) score = 900_000;
  else if (u.includes("720") || u.includes("_720")) score = 800_000;
  else if (u.includes("/hd") || u.includes("_hd")) score = 700_000;
  if (u.includes(".m3u8") || u.includes("/playlist") || u.includes(".smil")) score += 50;
  if (isRiskyStreamUrl(url)) score -= 400_000;
  return score;
}

export function isRiskyStreamUrl(url) {
  const u = url.toLowerCase();
  return (
    u.includes("vavoo") ||
    u.includes("biz-az.workers.dev") ||
    u.includes("tiviplayer.com") ||
    u.includes("iptvspor") ||
    /:\d+\/play\/[a-z0-9]+/i.test(url)
  );
}

export function sortUrlsByQuality(urls) {
  return [...urls].sort((a, b) => streamUrlQualityScore(b) - streamUrlQualityScore(a));
}

export function detectUrlAuth(url) {
  const reasons = [];
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) reasons.push("auth");
    for (const [k] of parsed.searchParams) {
      const kl = k.toLowerCase();
      if (/^(token|auth|password|passwd|pwd|key|secret|sid|session)$/.test(kl)) {
        reasons.push(`query:${k}`);
      }
    }
  } catch {
    reasons.push("bad-url");
  }
  if (/\/live\/[^/]+\/[^/]+\/[^/?#]+\.(ts|m3u8?)/i.test(url)) reasons.push("iptv-credentials");
  return reasons;
}

export function shouldSkipM3uUrl(url) {
  if (!isPlayableUrl(url)) return true;
  if (detectUrlAuth(url).length) return true;
  return false;
}

export function atomicWriteJson(filePath, data) {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, filePath);
}

export function backupFiles(paths, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const copied = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    const base = path.basename(p);
    const dest = path.join(backupDir, base);
    fs.copyFileSync(p, dest);
    copied.push(dest);
  }
  return copied;
}
