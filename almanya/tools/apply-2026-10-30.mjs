/**
 * 30 Ekim 2026 onayı.
 * 83 çalışan yedek mevcut kanallara eklenir. Yeni kanal açılmaz.
 * Deluxe Rap oturum listesi ve ERF Jess erfpop.m3u silinir.
 * Finest TV ve SR Fernsehen int linkleri durur.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const DELUXE_DEAD =
  "https://sdn-global-live-streaming-packager-cache.3qsdn.com/65183/2646ace1f474593f_33669365_2610131208_1.m3u8";
const DELUXE_LIVE = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/65183/65183_264_live.m3u8";
const ERF_POP = "https://stream.erf.de/erfpop.m3u";
const ERF_JESS = "https://stream.erf.de/erfjess.mp3";
const FINEST = "https://media.finest.tv/hls/live.m3u8";
const SR_KEEP = [
  "https://sr-live.ard-mcdn.de/sr/live/hls/int/master.m3u8",
  "https://sr-live.ard-mcdn.de/sr/live/hls/int/master1080p5000.m3u8",
  "https://sr-live.ard-mcdn.de/sr/live/hls/int/master720p3200.m3u8",
  "https://sr-live.ard-mcdn.de/sr/live/hls/int/master540p1800.m3u8",
  "https://sr-live.ard-mcdn.de/sr/live/hls/int/master360p1200.m3u8",
];
const KIKA_DASH = "https://kikadash.akamaized.net/dash/live/2022692/livetvkika_ww/manifest.mpd";
const WDR_WORLD = "https://wdrfsww247.akamaized.net/dash/live/2016703/wdrfs247_weltweit/dash.mpd";

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

function deleteFromChannel(channels, urls, name, url) {
  const channel = channels.find((item) => item.name === name);
  if (!channel) throw new Error(`silinecek kanal yok: ${name}`);
  const hits = channel.streams.filter((stream) => stream.url === url).length;
  if (hits !== 1) throw new Error(`${name} silinecek URL ${hits} kez: ${url}`);
  const elsewhere = channels.some(
    (item) => item !== channel && item.streams.some((stream) => stream.url === url),
  );
  if (elsewhere) throw new Error(`URL başka kanalda da var: ${url}`);
  channel.streams = channel.streams.filter((stream) => stream.url !== url);
  urls.delete(url);
  if (!channel.streams.length) throw new Error(`kanal boşaldı: ${name}`);
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

function must(condition, message) {
  if (!condition) throw new Error(message);
}

export function applyOctober30(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-10-30.csv"), "utf8"));
  if (rows.length !== 91) throw new Error(`30 Ekim satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const adds = rows.filter((row) => row.tür === "yeni_yedek");
  const dead = rows.filter((row) => row.tür === "olu_mevcut");
  const geo = rows.filter((row) => row.tür === "geo_403");
  if (adds.length !== 83 || dead.length !== 3 || geo.length !== 5) {
    throw new Error(`30 Ekim tür sayısı yedek ${adds.length} ölü ${dead.length} geo ${geo.length}`);
  }

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    skippedFinest: 0,
    skippedSr: 0,
    skippedDupes: 0,
  };

  for (const row of dead) {
    if (row.kanal === "Finest TV" && row.link === FINEST) {
      stats.skippedFinest += 1;
      continue;
    }
    if (
      (row.kanal === "Deluxe Rap" && row.link === DELUXE_DEAD) ||
      (row.kanal === "ERF Jess" && row.link === ERF_POP)
    ) {
      deleteFromChannel(channels, urls, row.kanal, row.link);
      stats.removedLinks += 1;
      continue;
    }
    throw new Error(`beklenmeyen ölü satır: ${row.kanal} ${row.link}`);
  }

  const srKeep = new Set(SR_KEEP);
  for (const row of geo) {
    if (row.kanal !== "SR Fernsehen" || !srKeep.has(row.link)) {
      throw new Error(`beklenmeyen geo satırı: ${row.kanal} ${row.link}`);
    }
    stats.skippedSr += 1;
  }

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const addChannels = new Set();

  for (const row of adds) {
    const url = row.link;
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz URL: ${url}`);
    const bad = forbiddenLeaves(url);
    if (bad.length) throw new Error(`yeni adreste yasak parametre: ${bad.join(",")} ${url}`);
    if (approvalStatus(row.durum) !== "working") throw new Error(`yedek çalışmıyor: ${row.kanal}`);
    const channel = byName.get(row.kanal);
    if (!channel) throw new Error(`yedek kanalı yok: ${row.kanal}`);
    addChannels.add(row.kanal);
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
        throw new Error(`bozuk akış: ${channel.name} ${stream.url}`);
      }
      seen.add(stream.url);
      if (stream.geo_de_only) seenGeo = true;
      else if (seenGeo) throw new Error(`çalışan link geo yedeğinden sonra: ${channel.name}`);
    }
  }

  const deluxe = byName.get("Deluxe Rap");
  must(deluxe.streams.length === 1 && deluxe.streams[0].url === DELUXE_LIVE, "Deluxe Rap ana yayın düştü");
  const jess = byName.get("ERF Jess");
  must(jess.streams[0].url === ERF_JESS, "ERF Jess erfjess.mp3 ilk sırada değil");
  must(!jess.streams.some((stream) => stream.url === ERF_POP), "ERF Jess erfpop duruyor");
  const finest = byName.get("Finest TV");
  must(finest.streams.some((stream) => stream.url === FINEST), "Finest TV düştü");
  const sr = byName.get("SR Fernsehen");
  for (const url of SR_KEEP) {
    must(sr.streams.some((stream) => stream.url === url), `SR Fernsehen int linki düştü: ${url}`);
  }
  const kika = byName.get("KIKA");
  must(kika.streams[1].url === KIKA_DASH && !kika.streams[1].geo_de_only, "KIKA dünya DASH yerinde değil");
  const wdr = byName.get("WDR Fernsehen Köln");
  must(wdr.streams[1].url === WDR_WORLD && !wdr.streams[1].geo_de_only, "WDR dünya DASH yerinde değil");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");

  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 157 || radio !== 165) throw new Error(`kanal sayısı tv=${tv} radyo=${radio}`);
  if (stats.addedChannels !== 0 || stats.addedLinks !== 83 || stats.removedLinks !== 2) {
    throw new Error(`sayılar +${stats.addedLinks} -${stats.removedLinks} yinelenen ${stats.skippedDupes}`);
  }
  if (stats.skippedFinest !== 1 || stats.skippedSr !== 5 || stats.skippedDupes !== 0) {
    throw new Error(`Finest ${stats.skippedFinest} SR ${stats.skippedSr}`);
  }
  if (addChannels.size !== 31) throw new Error(`yedek kanal ${addChannels.size}`);
  if (allUrls.length !== 1408) throw new Error(`link sayısı ${allUrls.length}`);

  return stats;
}
