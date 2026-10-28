/**
 * 28 Ekim 2026 onayı.
 * 23 çalışan yedek mevcut kanallara eklenir. Yeni kanal açılmaz.
 * ERF Plus bot sayfası (erfplus.m3u) silinir.
 * SR Fernsehen'in üç int master'ı bir gün daha durur.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const ERF_DEAD = "https://stream.erf.de/erfplus.m3u";
const ERF_FIRST = "https://stream.erfplus.de/erf-1a64/mp3-128?ar-distributor=ffa5";
const SR_KEEP = [
  "https://sr-live.ard-mcdn.de/sr/live/hls/int/master1080p5000.m3u8",
  "https://sr-live.ard-mcdn.de/sr/live/hls/int/master720p3200.m3u8",
  "https://sr-live.ard-mcdn.de/sr/live/hls/int/master540p1800.m3u8",
];
const BIG0 = "https://stream.bigfm.de/deutschland/aac-128";
const BIG1 = "https://streams.bigfm.de/bigfm-deutschland-128-mp3";
const ROCK0 = "https://mp3channels.webradio.rockantenne.de/rockantenne";
const FOLX_1080 = "https://folxapp.b-cdn.net/1080p/index.m3u8";
const ONE_1080 = "https://oneapp.b-cdn.net/1080p/index.m3u8";
const ZWEI_1080 = "https://zweiapp.b-cdn.net/1080p/index.m3u8";
const DW_ADD = "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/stream01/streamPlaylist.m3u8";

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

export function applyOctober28(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-10-28.csv"), "utf8"));
  if (rows.length !== 27) throw new Error(`28 Ekim satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const dead = rows.filter((row) => row.tür === "olu");
  const adds = rows.filter((row) => row.tür === "yeni_yedek");
  if (dead.length !== 4 || adds.length !== 23) {
    throw new Error(`28 Ekim tür sayısı ölü ${dead.length} yedek ${adds.length}`);
  }

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    skippedSr: 0,
    skippedDupes: 0,
    geoLinks: 0,
  };

  for (const row of dead) {
    if (row.kanal === "SR Fernsehen" && SR_KEEP.includes(row.link)) {
      stats.skippedSr += 1;
      continue;
    }
    if (row.kanal === "ERF Plus" && row.link === ERF_DEAD) {
      deleteFromChannel(channels, urls, row.kanal, row.link);
      stats.removedLinks += 1;
      continue;
    }
    throw new Error(`beklenmeyen ölü satır: ${row.kanal} ${row.link}`);
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

  const erf = byName.get("ERF Plus");
  must(erf.streams[0].url === ERF_FIRST, "ERF Plus ana yayın yerinde değil");
  must(!erf.streams.some((stream) => stream.url === ERF_DEAD), "ERF Plus bot sayfası duruyor");
  must(erf.streams.length === 5, `ERF Plus yayın sayısı ${erf.streams.length}`);

  const sr = byName.get("SR Fernsehen");
  for (const url of SR_KEEP) {
    must(sr.streams.some((stream) => stream.url === url), `SR Fernsehen int master düştü: ${url}`);
  }

  const big = byName.get("bigFM");
  must(big.streams[0].url === BIG0 && big.streams[1].url === BIG1, "bigFM ana yayın yerinde değil");
  const rock = byName.get("Rock Antenne");
  must(rock.streams[0].url === ROCK0, "Rock Antenne ana yayın yerinde değil");

  const folx = byName.get("Folx Music Television");
  const one = byName.get("One Music Television");
  const zwei = byName.get("Zwei Music Television");
  must(folx.streams[0].url === FOLX_1080 && folx.streams.length === 3, "Folx 1080p yerinde değil");
  must(one.streams[0].url === ONE_1080 && one.streams.length === 4, "One 1080p yerinde değil");
  must(zwei.streams[0].url === ZWEI_1080 && zwei.streams.length === 4, "Zwei 1080p yerinde değil");

  const dw = byName.get("DW Español");
  must(dw.type === "tv" && dw.streams.some((stream) => stream.url === DW_ADD && !stream.geo_de_only), "DW Español yedeği yok");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");

  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 157 || radio !== 165) throw new Error(`kanal sayısı tv=${tv} radyo=${radio}`);
  if (stats.addedChannels !== 0 || stats.addedLinks !== 23 || stats.removedLinks !== 1) {
    throw new Error(`sayılar +${stats.addedLinks} -${stats.removedLinks}`);
  }
  if (stats.skippedSr !== 3 || stats.skippedDupes !== 0 || stats.geoLinks !== 0) {
    throw new Error(`SR duran ${stats.skippedSr} yinelenen ${stats.skippedDupes}`);
  }
  if (addChannels.size !== 18) throw new Error(`yedek kanal ${addChannels.size}`);
  if (allUrls.length !== 1327) throw new Error(`link sayısı ${allUrls.length}`);

  return stats;
}
