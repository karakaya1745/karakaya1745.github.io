/**
 * 25 Ekim 2026 onayı.
 * 404 int varyantları, _art ve listenerid adresleri silinir.
 * 40 yedek mevcut kanallara eklenir. Yeni kanal yalnızca ServusTV Deutschland.
 * ERF Jess'te çalışan erfjess.mp3 öne alınır; aralıklı erfpop.m3u sonda kalır.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const TS_540 = "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master540p1800.m3u8";
const TS_MASTER = "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master.m3u8";
const TS_1080 = "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master1080p5000.m3u8";
const TS_360 = "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master360p1200.m3u8";
const KIKA_INT = "https://kika-live.ard-mcdn.de/kika/live/hls/int/master1080p5000.m3u8";
const KIKA_DASH = "https://kikadash.akamaized.net/dash/live/2022692/livetvkika_ww/manifest.mpd";
const ERFJESS_FIRST = "https://stream.erf.de/erfjess.mp3";
const ERFJESS_TAIL = "https://stream.erf.de/erfpop.m3u";
const SERVUS =
  "https://stv-live.akamaized.net/hls/live/2031012/lingeoSTVDEwebPri/master_3392.m3u8";
const SERVUS_NAME = "ServusTV Deutschland";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  if (!rows.length) throw new Error("boş CSV");
  const header = rows[0];
  return rows.slice(1).map((cols, index) => {
    if (cols.length !== header.length) {
      throw new Error(`CSV sütun sayısı uyuşmuyor (satır ${index + 2})`);
    }
    const record = {};
    header.forEach((key, column) => {
      record[key] = cols[column];
    });
    return record;
  });
}

function approvalStatus(durum) {
  const text = String(durum).trim().toLowerCase();
  if (text.startsWith("working") || text.startsWith("çalışıyor") || text.startsWith("calisiyor")) {
    return "working";
  }
  if (text.startsWith("sadece almanya") || text.includes("403") || text.includes("401")) return "geo";
  return null;
}

function forbiddenLeaves(url) {
  const queryAt = url.indexOf("?");
  if (queryAt < 0) return [];
  const bad = [];
  for (const part of url.slice(queryAt + 1).split("&")) {
    if (!part) continue;
    const raw = part.split("=")[0];
    let key = raw;
    try {
      key = decodeURIComponent(raw);
    } catch {
      key = raw;
    }
    const leaf = key.split(".").pop();
    if (/^(sid|token|skey|_art|listenerid)$/i.test(leaf) || /^userConsentV2$/i.test(leaf)) bad.push(key);
  }
  return bad;
}

function deleteExact(channels, urls, url) {
  let removed = 0;
  for (const channel of channels) {
    const before = channel.streams.length;
    channel.streams = channel.streams.filter((stream) => stream.url !== url);
    const delta = before - channel.streams.length;
    if (delta && channel.streams.length === 0) throw new Error(`akışsız kanal: ${channel.name}`);
    removed += delta;
  }
  if (removed > 0) urls.delete(url);
  return removed;
}

function insertBeforeGeo(channel, stream) {
  if (stream.geo_de_only) {
    channel.streams.push(stream);
    return;
  }
  const geoAt = channel.streams.findIndex((item) => item.geo_de_only);
  if (geoAt < 0) channel.streams.push(stream);
  else channel.streams.splice(geoAt, 0, stream);
}

function moveStream(channel, url, toEnd) {
  const at = channel.streams.findIndex((stream) => stream.url === url);
  if (at < 0) throw new Error(`taşınacak adres yok: ${url}`);
  const [stream] = channel.streams.splice(at, 1);
  if (toEnd) channel.streams.push(stream);
  else channel.streams.unshift(stream);
}

export function applyOctober25(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-10-25.csv"), "utf8"));
  if (rows.length !== 46) throw new Error(`25 Ekim satır sayısı ${rows.length}`);

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    alreadyAbsent: 0,
    skippedDupes: 0,
    demotedLinks: 0,
    addedChannelNames: [],
  };

  for (const url of [TS_540, KIKA_INT]) {
    const removed = deleteExact(channels, urls, url);
    if (removed !== 1) throw new Error(`silinecek URL ${removed} kez: ${url}`);
    stats.removedLinks += removed;
  }
  const masterRemoved = deleteExact(channels, urls, TS_MASTER);
  if (masterRemoved === 0) stats.alreadyAbsent += 1;
  else if (masterRemoved === 1) stats.removedLinks += 1;
  else throw new Error(`Tagesschau int master ${masterRemoved} kez`);

  const doomed = [];
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (forbiddenLeaves(stream.url).length) doomed.push(stream.url);
    }
  }
  for (const url of doomed) {
    const removed = deleteExact(channels, urls, url);
    if (removed !== 1) throw new Error(`yasak adres ${removed} kez: ${url}`);
    stats.removedLinks += removed;
  }

  const erf = byName.get("ERF Jess");
  if (!erf) throw new Error("ERF Jess yok");
  const erfCount = erf.streams.length;
  moveStream(erf, ERFJESS_FIRST, false);
  moveStream(erf, ERFJESS_TAIL, true);
  if (erf.streams.length !== erfCount) throw new Error("ERF Jess akış sayısı değişti");
  stats.demotedLinks = 1;

  for (const row of rows) {
    const url = row.link;
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz URL: ${url}`);
    if (row.tip === "olu_mevcut") continue;
    if (forbiddenLeaves(url).length) throw new Error(`yeni adreste yasak parametre: ${url}`);
    if (String(row.durum).toLowerCase().includes("etkinlik")) {
      throw new Error(`etkinlik satırı onayda: ${row.kanal}`);
    }

    if (row.tip === "yeni_kanal") {
      if (row.kanal !== SERVUS_NAME) throw new Error(`beklenmeyen yeni kanal: ${row.kanal}`);
      if (byName.has(SERVUS_NAME)) throw new Error("ServusTV zaten var");
      const status = approvalStatus(row.durum);
      if (status !== "geo" || url !== SERVUS) throw new Error("ServusTV adresi veya durumu beklenenden farklı");
      const channel = {
        name: SERVUS_NAME,
        type: "tv",
        category: "other",
        geo_de_only: true,
        streams: [{ url, geo_de_only: true }],
        groups: ["other"],
      };
      channels.push(channel);
      byName.set(SERVUS_NAME, channel);
      urls.add(url);
      stats.addedChannels += 1;
      stats.addedLinks += 1;
      stats.addedChannelNames.push(SERVUS_NAME);
      continue;
    }

    if (row.tip !== "yeni_link") throw new Error(`bilinmeyen tip: ${row.tip}`);
    const status = approvalStatus(row.durum);
    if (status !== "working") throw new Error(`yedek çalışmıyor: ${row.kanal}`);
    const channel = byName.get(row.kanal);
    if (!channel) throw new Error(`yedek kanalı yok: ${row.kanal}`);
    if (urls.has(url)) {
      stats.skippedDupes += 1;
      continue;
    }
    insertBeforeGeo(channel, { url, geo_de_only: false });
    urls.add(url);
    stats.addedLinks += 1;
  }

  for (const channel of channels) {
    if (!channel.streams.length) throw new Error(`akışsız kanal: ${channel.name}`);
    channel.geo_de_only = channel.streams.every((stream) => stream.geo_de_only);
    let seenGeo = false;
    const seen = new Set();
    for (const stream of channel.streams) {
      if (seen.has(stream.url) || forbiddenLeaves(stream.url).length) {
        throw new Error(`bozuk akış: ${channel.name}`);
      }
      seen.add(stream.url);
      if (stream.geo_de_only) seenGeo = true;
      else if (seenGeo) throw new Error(`çalışan link geo yedeğinden sonra: ${channel.name}`);
    }
  }

  const tagesschau = byName.get("Tagesschau 24");
  const tsUrls = new Set(tagesschau.streams.map((stream) => stream.url));
  if (tsUrls.has(TS_540) || tsUrls.has(TS_MASTER)) throw new Error("Tagesschau 404 adresi duruyor");
  if (!tsUrls.has(TS_1080) || !tsUrls.has(TS_360)) throw new Error("Tagesschau 403 int yedeği düştü");
  const kika = byName.get("KIKA");
  if (kika.streams.some((stream) => stream.url === KIKA_INT)) throw new Error("KiKA 404 adresi duruyor");
  if (kika.streams[1]?.url !== KIKA_DASH || kika.streams[1].geo_de_only) {
    throw new Error("KiKA dünya DASH yerinde değil");
  }
  const berg = byName.get("Radio Berg");
  if (berg.streams.some((stream) => stream.url.includes("_art="))) throw new Error("Radio Berg imzalı adres duruyor");
  if (berg.streams.length < 2) throw new Error("Radio Berg boşaldı");
  const berlin = byName.get("Berliner Rundfunk 91.4");
  if (berlin.streams.some((stream) => stream.url.includes("listenerid=") || stream.url.includes("brf-oldies"))) {
    throw new Error("Berliner Rundfunk oldies adresi duruyor");
  }
  if (berlin.streams.length !== 2) throw new Error("Berliner Rundfunk akış sayısı");
  if (erf.streams[0].url !== ERFJESS_FIRST || erf.streams.at(-1).url !== ERFJESS_TAIL) {
    throw new Error("ERF Jess sırası bozuk");
  }
  const servus = byName.get(SERVUS_NAME);
  if (
    !servus ||
    servus.type !== "tv" ||
    servus.category !== "other" ||
    !servus.geo_de_only ||
    servus.streams.length !== 1 ||
    servus.streams[0].url !== SERVUS ||
    !servus.streams[0].geo_de_only
  ) {
    throw new Error("ServusTV Deutschland eksik");
  }

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 157 || radio !== 167) throw new Error(`kanal sayısı tv=${tv} radyo=${radio}`);
  if (stats.addedChannels !== 1 || stats.addedLinks !== 41 || stats.removedLinks !== 4) {
    throw new Error(
      `sayılar kanal=${stats.addedChannels} link=${stats.addedLinks} silinen=${stats.removedLinks} yinelenen=${stats.skippedDupes}`,
    );
  }
  if (stats.alreadyAbsent !== 1 || stats.skippedDupes !== 0 || stats.demotedLinks !== 1) {
    throw new Error("25 Ekim sayaçları tutmuyor");
  }
  if (allUrls.length !== 1148) throw new Error(`link sayısı ${allUrls.length}`);

  return stats;
}
