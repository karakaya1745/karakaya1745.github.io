/**
 * 3 Kasım 2026 onayı.
 * 3 yedek mevcut kanallara eklenir.
 * QVC Style, QVC Zwei ve Mango Radio yeni kanaldır.
 * izle satırlarına dokunulmaz.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const FLENS_FIRST = "https://live-cdn.oksh.de/play/hls/flensburgtv/index.m3u8";
const FLENS_ADD = "https://live.oksh.de/play/hls/flensburgtv/index.m3u8";
const MTS_FIRST = "https://mts1.iptv-playoutcenter.de/mts/mts-web/mts/mtsw3/chunks.m3u8";
const MTS_MASTER = "https://mts1.iptv-playoutcenter.de/mts/mts-web/playlist.m3u8";
const MTS_1080 = "https://mts1.iptv-playoutcenter.de/mts/mts-web/mts/mtsw1/chunks.m3u8";
const MTS_720 = "https://mts1.iptv-playoutcenter.de/mts/mts-web/mts/mtsw2/chunks.m3u8";
const QVC_STYLE = "https://qvcde-live.akamaized.net/hls/live/2097104/qby/master.m3u8";
const QVC_ZWEI = "https://qvcde-live.akamaized.net/hls/live/2097104/qps/master.m3u8";
const MANGO = "https://mangoradio.stream.laut.fm/mangoradio";
const FROZEN = ["OK Kiel", "Oberlausitz TV", "NRWision"];

const NEW_CHANNELS = [
  ["QVC Style", "tv", "shopping", QVC_STYLE],
  ["QVC Zwei", "tv", "shopping", QVC_ZWEI],
  ["Mango Radio", "radio", "music", MANGO],
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

export function applyNovember3(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-03.csv"), "utf8"));
  if (rows.length !== 13) throw new Error(`3 Kasım satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const watch = rows.filter((row) => row.tür === "izle");
  const backups = rows.filter((row) => row.tür === "yedek");
  const created = rows.filter((row) => row.tür === "yeni_kanal");
  if (watch.length !== 7 || backups.length !== 3 || created.length !== 3) {
    throw new Error(`3 Kasım tür sayısı izle ${watch.length} yedek ${backups.length} yeni ${created.length}`);
  }
  const expectedBackups = [
    ["OK Flensburg", FLENS_ADD],
    ["More Than Sports TV", MTS_1080],
    ["More Than Sports TV", MTS_720],
  ];
  if (backups.map((row) => `${row.kanal}\t${row.link}`).join("\n") !== expectedBackups.map((row) => row.join("\t")).join("\n")) {
    throw new Error("3 Kasım yedekleri onay listesiyle uyuşmuyor");
  }
  if (created.map((row) => `${row.kanal}\t${row.link}`).join("\n") !== NEW_CHANNELS.map((row) => `${row[0]}\t${row[3]}`).join("\n")) {
    throw new Error("3 Kasım yeni kanalları onay listesiyle uyuşmuyor");
  }

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  for (const row of watch) {
    const channel = byName.get(row.kanal);
    if (!channel || !channel.streams.some((stream) => stream.url === row.link)) {
      throw new Error(`izle adresi katalogda yok: ${row.kanal}`);
    }
  }

  const frozen = new Map(
    FROZEN.map((name) => [name, byName.get(name).streams.map((stream) => `${stream.geo_de_only}\t${stream.url}`).join("\n")]),
  );

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedWatch: watch.length,
    skippedDupes: 0,
    addedChannelNames: [],
  };

  for (const row of backups) {
    const url = row.link;
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz URL: ${url}`);
    const bad = forbiddenLeaves(url);
    if (bad.length) throw new Error(`yeni adreste yasak parametre: ${bad.join(",")} ${url}`);
    if (!isWorking(row.durum)) throw new Error(`yedek çalışmıyor: ${row.kanal}`);
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

  for (const [name, type, category, url] of NEW_CHANNELS) {
    if (byName.has(name)) throw new Error(`kanal zaten var: ${name}`);
    if (!isWorking(created.find((row) => row.kanal === name).durum)) throw new Error(`yeni kanal çalışmıyor: ${name}`);
    if (forbiddenLeaves(url).length || urls.has(url)) throw new Error(`yeni kanal adresi bozuk: ${url}`);
    const channel = {
      name,
      type,
      category,
      geo_de_only: false,
      streams: [{ url, geo_de_only: false }],
      groups: [category],
    };
    channels.push(channel);
    byName.set(name, channel);
    urls.add(url);
    stats.addedChannels += 1;
    stats.addedLinks += 1;
    stats.addedChannelNames.push(name);
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

  for (const name of FROZEN) {
    const now = byName.get(name).streams.map((stream) => `${stream.geo_de_only}\t${stream.url}`).join("\n");
    must(now === frozen.get(name), `${name} akış listesi değişti`);
  }
  const flensburg = byName.get("OK Flensburg");
  must(flensburg.streams[0].url === FLENS_FIRST && flensburg.streams.at(-1).url === FLENS_ADD, "OK Flensburg yedek yerleşmedi");
  const mts = byName.get("More Than Sports TV");
  must(mts.streams[0].url === MTS_FIRST && mts.streams[1].url === MTS_MASTER, "More Than Sports sıra bozuldu");
  must(mts.streams.at(-2).url === MTS_1080 && mts.streams.at(-1).url === MTS_720, "More Than Sports kalite yedekleri yok");
  must(byName.get("QVC Style").category === "shopping" && byName.get("QVC Style").streams[0].url === QVC_STYLE, "QVC Style yok");
  must(byName.get("QVC Zwei").category === "shopping" && byName.get("QVC Zwei").streams[0].url === QVC_ZWEI, "QVC Zwei yok");
  must(byName.get("Mango Radio").type === "radio" && byName.get("Mango Radio").streams[0].url === MANGO, "Mango Radio yok");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 158 || radio !== 166 || channels.length !== 324) {
    throw new Error(`kanal sayısı tv=${tv} radyo=${radio} toplam ${channels.length}`);
  }
  if (stats.addedChannels !== 3 || stats.addedLinks !== 6 || stats.removedChannels !== 0 || stats.skippedDupes !== 0) {
    throw new Error(`sayılar kanal +${stats.addedChannels} link +${stats.addedLinks}`);
  }
  if (stats.skippedWatch !== 7 || allUrls.length !== 1423) {
    throw new Error(`izle ${stats.skippedWatch} link ${allUrls.length}`);
  }
  return stats;
}
