/**
 * 24 Kasım 2026 onayı.
 * Doğrulanan 13 yayın ilgili kanala yedek olarak eklenir.
 * Welt personalstream 401 döndüğü için eklenmez.
 * Welt Akamai ve ServusTV master_3392 403 döndüğü için durur.
 * Radio 21 TV tek linki 403 HTML döndü; TV yayını kapalı olduğu için kanal çıkar.
 * Radio 21 radyo kanalı durur.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");
const RADIO21_TV = "https://live.creacast.com/radio21/smil:radio21.smil/playlist.m3u8";
const WELT_SKIP = "https://welt.personalstream.tv/v1/master.m3u8";
const WELT_KEEP = "https://live2weltcms-lh.akamaihd.net/i/Live2WeltCMS_1@444563/master.m3u8";
const SERVUS_KEEP = "https://stv-live.akamaized.net/hls/live/2031012/lingeoSTVDEwebPri/master_3392.m3u8";

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

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function forbiddenLeaves(url) {
  const query = url.split("#")[0].split("?")[1] || "";
  const bad = [];
  for (const part of query.split("&")) {
    if (!part) continue;
    const key = part.split("=")[0];
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

export function applyNovember24(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-24.csv"), "utf8"));
  must(rows.length === 17, `24 Kasım satır sayısı ${rows.length}`);
  const adds = rows.filter((row) => row.tur === "yedek");
  const skipped = rows.filter((row) => row.tur === "atlandi");
  const kept = rows.filter((row) => row.tur === "koru");
  const removed = rows.filter((row) => row.tur === "olu_kanal");
  must(adds.length === 13 && skipped.length === 1 && kept.length === 2 && removed.length === 1, "24 Kasım tur sayıları uyuşmuyor");
  must(skipped[0].link === WELT_SKIP && skipped[0].kanal === "Welt", "Welt atlanan adres beklenenden farklı");
  must(removed[0].kanal === "Radio 21 TV" && removed[0].link === RADIO21_TV, "Radio 21 TV satırı beklenenden farklı");
  const keepUrls = new Set(kept.map((row) => row.link));
  must(keepUrls.has(WELT_KEEP) && keepUrls.has(SERVUS_KEEP), "korunan 403 adresleri eksik");

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }
  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const radio21 = byName.get("Radio 21");
  must(radio21 && radio21.type === "radio", "Radio 21 yok");
  const radio21Before = radio21.streams.map((stream) => stream.url).join("\n");

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedNew: 0,
    keptLinks: kept.length,
    addedUrls: [],
    removedChannelNames: [],
    removedUrls: [],
  };

  for (const row of adds) {
    const bad = forbiddenLeaves(row.link);
    if (bad.length) throw new Error(`yasak parametre: ${bad.join(",")} ${row.link}`);
    const channel = byName.get(row.kanal);
    must(channel, `yedek kanalı yok: ${row.kanal}`);
    if (urls.has(row.link)) {
      stats.skippedNew += 1;
      continue;
    }
    insertBeforeGeo(channel, { url: row.link, geo_de_only: false });
    channel.geo_de_only = channel.streams.every((stream) => stream.geo_de_only);
    urls.add(row.link);
    stats.addedLinks += 1;
    stats.addedUrls.push(row.link);
  }
  must(!urls.has(WELT_SKIP), "401 Welt adresi eklendi");
  stats.skippedNew += 1;

  for (const row of kept) {
    const channel = byName.get(row.kanal);
    must(channel && channel.streams.some((stream) => stream.url === row.link), `korunan link yok: ${row.kanal}`);
  }

  const index = channels.findIndex((channel) => channel.name === "Radio 21 TV" && channel.type === "tv");
  must(index >= 0, "Radio 21 TV yok");
  const radio21Tv = channels[index];
  must(radio21Tv.streams.length === 1 && radio21Tv.streams[0].url === RADIO21_TV, "Radio 21 TV tek link değil");
  channels.splice(index, 1);
  urls.delete(RADIO21_TV);
  stats.removedChannels += 1;
  stats.removedLinks += 1;
  stats.removedChannelNames.push("Radio 21 TV");
  stats.removedUrls.push(RADIO21_TV);

  must(channels.find((channel) => channel.name === "Radio 21").streams.map((stream) => stream.url).join("\n") === radio21Before, "Radio 21 değişti");
  must(!channels.some((channel) => channel.name === "Radio 21 TV"), "Radio 21 TV duruyor");
  must(channels.some((channel) => channel.name === "iSTUFF"), "iSTUFF yok");
  must(!channels.some((channel) => channel.name === "Bild" || channel.name === "Auto Bild TV" || channel.name === "Sport Bild TV"), "Bild kanalı eklendi");
  const left = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  must(left.length === 1517, `link sayısı ${left.length}`);
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  must(tv === 165 && radio === 166 && channels.length === 331, `kanal sayısı tv=${tv} radyo=${radio}`);
  must(new Set(left).size === left.length, "katalogda yinelenen URL var");
  return stats;
}
