/**
 * 31 Ekim 2026 onayı.
 * 7 çalışan yedek mevcut kanallara eklenir. Yeni kanal açılmaz.
 * Finest TV'nin tek ölü linki yüzünden kanal çıkar.
 * Oberlausitz TV ve NRWision'un 1. gün ölü linkleri durur.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const FINEST = "https://media.finest.tv/hls/live.m3u8";
const OBERLAUSITZ =
  "https://h056.video-stream-hosting.de/easycast8-live/_definst_/mp4:livestreamhd4/playlist.m3u8?ref=";
const NRWISION = "https://fms.nrwision.de/live/ngrp:livestreamHD.stream/playlist.m3u8";
const BAYERN1_FIRST = "https://dispatcher.rndfnk.com/br/br1/obb/mp3/mid";
const NDRINFO_FIRST = "https://icecast.ndr.de/ndr/ndrinfo/live/mp3/128/stream.mp3";
const SCHLAGER_FIRST = "https://addrad.io/4454r93";
const BYTE_FIRST = "https://bytefm.cast.addradio.de/bytefm/main/high/stream";
const TEDDY_FIRST = "https://streamtdy.ir-media-tec.com/live/mp3-128/web/play.mp3";
const TS_DASH = "https://tagesschau-live.ard-mcdn.de/tagesschau/live/dash/de/manifest.mpd";
const WATCH = [
  ["Oberlausitz TV", OBERLAUSITZ],
  ["NRWision", NRWISION],
];

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

function isWorking(durum) {
  const text = String(durum).trim().toLowerCase();
  return text.startsWith("200") || text.startsWith("çalışıyor") || text.startsWith("calisiyor") || text.startsWith("working");
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

export function applyOctober31(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-10-31.csv"), "utf8"));
  if (rows.length !== 10) throw new Error(`31 Ekim satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const adds = rows.filter((row) => row.tür === "yeni_yedek");
  const drop = rows.filter((row) => row.tür === "ölü_sil_öner");
  const watch = rows.filter((row) => row.tür === "ölü_izle");
  if (adds.length !== 7 || drop.length !== 1 || watch.length !== 2) {
    throw new Error(`31 Ekim tür sayısı yedek ${adds.length} sil ${drop.length} izle ${watch.length}`);
  }
  if (drop[0].kanal !== "Finest TV" || drop[0].link !== FINEST) {
    throw new Error(`beklenmeyen silinecek satır: ${drop[0].kanal}`);
  }
  const watchKey = watch.map((row) => `${row.kanal}\t${row.link}`).join("\n");
  const expectedWatch = WATCH.map(([name, url]) => `${name}\t${url}`).join("\n");
  if (watchKey !== expectedWatch) throw new Error("31 Ekim izlenecek satırlar onay listesiyle uyuşmuyor");

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    removedChannelNames: [],
    skippedWatch: 0,
    skippedDupes: 0,
  };

  const finestAt = channels.findIndex((channel) => channel.name === "Finest TV");
  if (finestAt < 0) throw new Error("Finest TV yok");
  const finest = channels[finestAt];
  if (finest.streams.length !== 1 || finest.streams[0].url !== FINEST) {
    throw new Error("Finest TV yalnız bu ölü linkten ibaret değil");
  }
  channels.splice(finestAt, 1);
  urls.delete(FINEST);
  stats.removedChannels = 1;
  stats.removedLinks = 1;
  stats.removedChannelNames = ["Finest TV"];
  stats.skippedWatch = watch.length;

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const addChannels = new Set();

  for (const row of adds) {
    const url = row.link;
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz URL: ${url}`);
    const bad = forbiddenLeaves(url);
    if (bad.length) throw new Error(`yeni adreste yasak parametre: ${bad.join(",")} ${url}`);
    if (!isWorking(row.durum)) throw new Error(`yedek çalışmıyor: ${row.kanal}`);
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

  must(!channels.some((channel) => channel.name === "Finest TV"), "Finest TV duruyor");
  must(!urls.has(FINEST), "Finest TV linki duruyor");
  const ober = byName.get("Oberlausitz TV");
  const nrw = byName.get("NRWision");
  must(ober.streams[0].url === OBERLAUSITZ, "Oberlausitz TV linki düştü");
  must(nrw.streams[0].url === NRWISION, "NRWision ana linki düştü");
  must(byName.get("Bayern 1").streams[0].url === BAYERN1_FIRST, "Bayern 1 ana yayın yerinde değil");
  must(byName.get("NDR Info Niedersachsen").streams[0].url === NDRINFO_FIRST, "NDR Info ana yayın yerinde değil");
  must(byName.get("Schlager Radio").streams[0].url === SCHLAGER_FIRST, "Schlager Radio ana yayın yerinde değil");
  must(byName.get("ByteFM").streams[0].url === BYTE_FIRST, "ByteFM ana yayın yerinde değil");
  must(byName.get("Radio Teddy").streams[0].url === TEDDY_FIRST, "Radio Teddy ana yayın yerinde değil");
  const tagesschau = byName.get("Tagesschau 24");
  const dashAt = tagesschau.streams.findIndex((stream) => stream.url === TS_DASH);
  const geoAt = tagesschau.streams.findIndex((stream) => stream.geo_de_only);
  must(dashAt >= 0 && !tagesschau.streams[dashAt].geo_de_only && dashAt < geoAt, "Tagesschau DASH geo bölümünde");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");

  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 156 || radio !== 165) throw new Error(`kanal sayısı tv=${tv} radyo=${radio}`);
  if (stats.addedChannels !== 0 || stats.addedLinks !== 7 || stats.removedLinks !== 1 || stats.removedChannels !== 1) {
    throw new Error(`sayılar +${stats.addedLinks} -${stats.removedLinks} kanal -${stats.removedChannels}`);
  }
  if (stats.skippedWatch !== 2 || stats.skippedDupes !== 0 || addChannels.size !== 7) {
    throw new Error(`izle ${stats.skippedWatch} yinelenen ${stats.skippedDupes} kanal ${addChannels.size}`);
  }
  if (allUrls.length !== 1414) throw new Error(`link sayısı ${allUrls.length}`);

  return stats;
}
