/**
 * 26 Ekim 2026 onayı.
 * 68 çalışan yedek mevcut kanallara eklenir.
 * Tema, bölgesel varyant ve Deluxe Music'in yalnız-ses yedeği silinir.
 * Tagesschau 24 int 1080p dalgalı olduğu için durur. Yeni kanal açılmaz.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const TS_1080 = "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master1080p5000.m3u8";
const UNSERDING =
  "https://srde.akamaized.net/hls/live/2031842/visualradio-unserding/master-540p-1728.m3u8";
const DELUXE_AUDIO = "https://audiostreams.deluxemusic.tv/music/mp3-192/website";
const DELUXE_VIDEO =
  "https://sdn-global-live-streaming-packager-cache.3qsdn.com/13456/13456_264_live.m3u8";
const BIG0 = "https://stream.bigfm.de/deutschland/aac-128";
const BIG1 = "https://streams.bigfm.de/bigfm-deutschland-128-mp3";
const BOB0 = "https://streams.radiobob.de/bob-national/mp3-192/mediaplayer";
const DAS_ERSTE_540 = "https://daserste-live.ard-mcdn.de/daserste/live/hls/de/master540p1600.m3u8";
const DAS_ERSTE_270 = "https://daserste-live.ard-mcdn.de/daserste/live/hls/de/master270p700.m3u8";
const EMPTY_CHANNELS = ["Antenne 1", "Antenne MV"];

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
    removed += before - channel.streams.length;
  }
  if (removed !== 1) throw new Error(`silinecek URL ${removed} kez: ${url}`);
  urls.delete(url);
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

export function applyOctober26(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-10-26.csv"), "utf8"));
  if (rows.length !== 125) throw new Error(`26 Ekim satır sayısı ${rows.length}`);

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
    removedChannels: 0,
    removedChannelNames: [],
    skippedFlaky: 0,
    skippedNot: 0,
    skippedDupes: 0,
    addedChannelNames: [],
  };

  for (const row of rows) {
    if (row.tür !== "kural_ihlali") continue;
    if (!/^https:\/\/\S+$/.test(row.link)) throw new Error(`geçersiz URL: ${row.link}`);
    deleteExact(channels, urls, row.link);
    stats.removedLinks += 1;
  }

  for (let index = channels.length - 1; index >= 0; index -= 1) {
    if (channels[index].streams.length) continue;
    stats.removedChannelNames.push(channels[index].name);
    channels.splice(index, 1);
    stats.removedChannels += 1;
  }
  stats.removedChannelNames.sort((a, b) => a.localeCompare(b, "tr"));

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const addChannels = new Set();

  for (const row of rows) {
    const url = row.link;
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz URL: ${url}`);
    if (row.tür === "kural_ihlali") continue;
    if (row.tür === "olu_link") {
      if (url !== TS_1080) throw new Error(`beklenmeyen ölü link: ${url}`);
      stats.skippedFlaky += 1;
      continue;
    }
    if (row.tür === "not") {
      if (url !== UNSERDING) throw new Error(`beklenmeyen atlanan adres: ${url}`);
      stats.skippedNot += 1;
      continue;
    }
    if (row.tür !== "yeni_link") throw new Error(`bilinmeyen tür: ${row.tür}`);
    if (forbiddenLeaves(url).length || /addrad\.io/i.test(url)) {
      throw new Error(`yeni adreste yasak parametre: ${url}`);
    }
    if (row.kanal === "UNSERDING" || /rtl|toggo|unserding/i.test(row.kanal)) {
      throw new Error(`eklenmemesi gereken kanal: ${row.kanal}`);
    }
    const status = approvalStatus(row["durum/test sonucu"]);
    if (status !== "working") throw new Error(`yedek çalışmıyor: ${row.kanal}`);
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

  const tagesschau = byName.get("Tagesschau 24");
  if (!tagesschau?.streams.some((stream) => stream.url === TS_1080 && stream.geo_de_only)) {
    throw new Error("Tagesschau 24 int 1080p durmalı");
  }
  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (allUrls.includes(UNSERDING) || allUrls.includes(DELUXE_AUDIO)) {
    throw new Error("yasak yedek katalogda kaldı");
  }
  const deluxe = byName.get("Deluxe Music");
  if (!deluxe?.streams.some((stream) => stream.url === DELUXE_VIDEO)) {
    throw new Error("Deluxe Music görüntülü yayın düştü");
  }
  const big = byName.get("bigFM");
  if (big.streams[0].url !== BIG0 || big.streams[1].url !== BIG1) throw new Error("bigFM ana yayın yerinde değil");
  const bob = byName.get("Radio Bob");
  if (bob.streams[0].url !== BOB0) throw new Error("Radio Bob ana yayın yerinde değil");
  const erste = byName.get("Das Erste");
  const ersteGeo = erste.streams.findIndex((stream) => stream.geo_de_only);
  for (const url of [DAS_ERSTE_540, DAS_ERSTE_270]) {
    const at = erste.streams.findIndex((stream) => stream.url === url);
    if (at < 0 || erste.streams[at].geo_de_only || (ersteGeo >= 0 && at >= ersteGeo)) {
      throw new Error(`Das Erste yedeği geo bölümünde: ${url}`);
    }
  }
  if (channels.some((channel) => EMPTY_CHANNELS.includes(channel.name))) {
    throw new Error("ana yayını kalmayan kanal duruyor");
  }
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");

  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 157 || radio !== 165) throw new Error(`kanal sayısı tv=${tv} radyo=${radio}`);
  if (stats.addedChannels !== 0 || stats.addedLinks !== 68 || stats.removedLinks !== 55) {
    throw new Error(`sayılar +${stats.addedLinks} -${stats.removedLinks} kanal ${stats.removedChannels}`);
  }
  if (stats.removedChannels !== 2 || stats.removedChannelNames.join("|") !== "Antenne 1|Antenne MV") {
    throw new Error(`çıkan kanallar: ${stats.removedChannelNames.join(", ")}`);
  }
  if (addChannels.size !== 43 || stats.skippedDupes !== 0 || stats.skippedFlaky !== 1 || stats.skippedNot !== 1) {
    throw new Error(`yedek kanal ${addChannels.size} yinelenen ${stats.skippedDupes}`);
  }
  if (allUrls.length !== 1161) throw new Error(`link sayısı ${allUrls.length}`);

  return stats;
}
