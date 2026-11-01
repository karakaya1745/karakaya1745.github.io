/**
 * 1 Kasım 2026 onayı.
 * 3 çalışan yedek mevcut kanallara eklenir. Yeni kanal açılmaz.
 * izle ve iyileşti satırlarına dokunulmaz.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const MTS_CHUNKS = "https://mts1.iptv-playoutcenter.de/mts/mts-web/mts/mtsw3/chunks.m3u8";
const MTS_MASTER = "https://mts1.iptv-playoutcenter.de/mts/mts-web/playlist.m3u8";
const MDR_MP3 = "https://mdr-284350-0.sslcast.mdr.de/mdr/284350/0/mp3/max/stream.mp3";
const MDR_HLS = "https://radio-hls.mdr.de/hls/live/2112906/mdr-284350-0-hls/index.m3u8";
const RADIO21_FIRST = "https://streams.radio21.de/braunschweig/mp3-192/web";
const RADIO21_ADD = "https://streams.radio21.de/hannover/mp3-192/konsoleplayer";
const UNTOUCHED = ["Antenne Niederrhein", "Oberlausitz TV", "NRWision"];

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
  return (
    text.startsWith("200") ||
    text.startsWith("çalışıyor") ||
    text.startsWith("calisiyor") ||
    text.startsWith("working")
  );
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

export function applyNovember1(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-01.csv"), "utf8"));
  if (rows.length !== 6) throw new Error(`1 Kasım satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const adds = rows.filter((row) => row.tür === "yeni_yedek");
  const watch = rows.filter((row) => row.tür === "izle" || row.tür === "iyileşti");
  const other = rows.filter((row) => row.tür !== "yeni_yedek" && row.tür !== "izle" && row.tür !== "iyileşti");
  if (other.length) throw new Error(`bilinmeyen tür: ${other.map((row) => row.tür).join(", ")}`);
  if (adds.length !== 3 || watch.length !== 3) {
    throw new Error(`1 Kasım tür sayısı yedek ${adds.length} izle ${watch.length}`);
  }
  const expectedAdds = [
    ["More Than Sports TV", MTS_MASTER],
    ["MDR Klassik", MDR_HLS],
    ["Radio 21", RADIO21_ADD],
  ];
  const actualAdds = adds.map((row) => `${row.kanal}\t${row.link}`).join("\n");
  if (actualAdds !== expectedAdds.map(([name, url]) => `${name}\t${url}`).join("\n")) {
    throw new Error("1 Kasım yedekleri onay listesiyle uyuşmuyor");
  }

  const before = new Map(
    channels
      .filter((channel) => UNTOUCHED.includes(channel.name))
      .map((channel) => [channel.name, channel.streams.map((stream) => stream.url).join("\n")]),
  );
  if (before.size !== UNTOUCHED.length) throw new Error("izlenen kanallardan biri yok");

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedWatch: watch.length,
    skippedDupes: 0,
  };

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

  for (const name of UNTOUCHED) {
    const now = byName.get(name).streams.map((stream) => stream.url).join("\n");
    must(now === before.get(name), `${name} akış listesi değişti`);
  }

  const mts = byName.get("More Than Sports TV");
  must(mts.streams[0].url === MTS_CHUNKS, "More Than Sports chunks yerinde değil");
  must(mts.streams.some((stream) => stream.url === MTS_MASTER && !stream.geo_de_only), "More Than Sports master yok");
  const klassik = byName.get("MDR Klassik");
  must(klassik.streams[0].url === MDR_MP3, "MDR Klassik mp3 yerinde değil");
  must(klassik.streams.some((stream) => stream.url === MDR_HLS && !stream.geo_de_only), "MDR Klassik HLS yok");
  const radio21 = byName.get("Radio 21");
  must(radio21.streams[0].url === RADIO21_FIRST, "Radio 21 ana yayın yerinde değil");
  must(radio21.streams.some((stream) => stream.url === RADIO21_ADD && !stream.geo_de_only), "Radio 21 Hannover yok");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");

  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 156 || radio !== 165) throw new Error(`kanal sayısı tv=${tv} radyo=${radio}`);
  if (stats.addedChannels !== 0 || stats.addedLinks !== 3 || stats.removedLinks !== 0 || stats.removedChannels !== 0) {
    throw new Error(`sayılar +${stats.addedLinks} -${stats.removedLinks}`);
  }
  if (stats.skippedWatch !== 3 || stats.skippedDupes !== 0 || addChannels.size !== 3) {
    throw new Error(`izle ${stats.skippedWatch} yinelenen ${stats.skippedDupes}`);
  }
  if (channels.length !== 321 || allUrls.length !== 1417) {
    throw new Error(`katalog ${channels.length} kanal ${allUrls.length} link`);
  }

  return stats;
}
