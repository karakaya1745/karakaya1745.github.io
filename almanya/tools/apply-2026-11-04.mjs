/**
 * 4 Kasım 2026 onayı.
 * Juwelo, K-TV ve L TV'ye birer yedek eklenir.
 * 1-2-3.tv shopping sonuna, Tide TV Hamburg yerel kanalına girer.
 * MeieTV watch satırına dokunulmaz. Silme yok.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const JUWEL_FIRST = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/7441/7441_264_live.m3u8";
const JUWEL_ADD = "https://sdn-global-live-streaming-packager-cache-aka.3qsdn.com/7441/7441_264_live.m3u8";
const KTV_FIRST = "https://d1pz8zear993v8.cloudfront.net/hlsme/kathtv.m3u8";
const KTV_ADD = "https://a19bf41486254a3485a864c8b0c14fe1.msvdn.net/live/S28743697/LpD0q2aoyujI/playlist.m3u8";
const LTV_FIRST = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/130321/130321_264_live.m3u8";
const LTV_ADD = "https://sdn-global-live-streaming-packager-cache-aka.3qsdn.com/130321/130321_264_live.m3u8";
const TV123 = "https://sdn-global-live-streaming-packager-cache-aka.3qsdn.com/110589/110589_264_live.m3u8";
const TIDE = "https://h058.video-stream-hosting.de/tide-live/_definst_/smil:livestream.smil/playlist.m3u8";
const MEIE = "https://stream.meietv.de/live/meietv.m3u8";

const NEW_CHANNELS = [
  ["1-2-3.tv", "tv", "shopping", TV123],
  ["Tide TV", "tv", "yerel", TIDE],
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

export function applyNovember4(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-04.csv"), "utf8"));
  if (rows.length !== 6) throw new Error(`4 Kasım satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const watch = rows.filter((row) => row.tür === "watch");
  const backups = rows.filter((row) => row.tür === "backup");
  const created = rows.filter((row) => row.tür === "new_channel");
  if (watch.length !== 1 || backups.length !== 3 || created.length !== 2) {
    throw new Error(`4 Kasım tür sayısı watch ${watch.length} yedek ${backups.length} yeni ${created.length}`);
  }
  if (watch[0].kanal !== "MeieTV" || watch[0].link !== MEIE) {
    throw new Error("MeieTV watch satırı beklenenden farklı");
  }
  const expectedBackups = [
    ["Juwelo", JUWEL_ADD],
    ["K-TV", KTV_ADD],
    ["L TV", LTV_ADD],
  ];
  if (backups.map((row) => `${row.kanal}\t${row.link}`).join("\n") !== expectedBackups.map((row) => row.join("\t")).join("\n")) {
    throw new Error("4 Kasım yedekleri onay listesiyle uyuşmuyor");
  }
  if (created.map((row) => `${row.kanal}\t${row.link}`).join("\n") !== NEW_CHANNELS.map((row) => `${row[0]}\t${row[3]}`).join("\n")) {
    throw new Error("4 Kasım yeni kanalları onay listesiyle uyuşmuyor");
  }

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const meieBefore = byName.get("MeieTV").streams.map((stream) => stream.url).join("\n");

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

  must(byName.get("MeieTV").streams.map((stream) => stream.url).join("\n") === meieBefore, "MeieTV değişti");
  must(byName.get("MeieTV").streams[0].url === MEIE, "MeieTV linki düştü");
  const juwelo = byName.get("Juwelo");
  must(juwelo.streams[0].url === JUWEL_FIRST && juwelo.streams.at(-1).url === JUWEL_ADD, "Juwelo yedek yerleşmedi");
  const ktv = byName.get("K-TV");
  must(ktv.streams[0].url === KTV_FIRST && ktv.streams.some((stream) => stream.url === KTV_ADD), "K-TV yedek yerleşmedi");
  const ltv = byName.get("L TV");
  must(ltv.streams[0].url === LTV_FIRST && ltv.streams.at(-1).url === LTV_ADD, "L TV yedek yerleşmedi");
  must(byName.get("1-2-3.tv").category === "shopping" && byName.get("1-2-3.tv").streams[0].url === TV123, "1-2-3.tv yok");
  must(byName.get("Tide TV").category === "yerel" && byName.get("Tide TV").streams[0].url === TIDE, "Tide TV yok");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 160 || radio !== 166 || channels.length !== 326) {
    throw new Error(`kanal sayısı tv=${tv} radyo=${radio} toplam ${channels.length}`);
  }
  if (stats.addedChannels !== 2 || stats.addedLinks !== 5 || stats.removedChannels !== 0 || stats.skippedDupes !== 0) {
    throw new Error(`sayılar kanal +${stats.addedChannels} link +${stats.addedLinks}`);
  }
  if (stats.skippedWatch !== 1 || allUrls.length !== 1428) {
    throw new Error(`watch ${stats.skippedWatch} link ${allUrls.length}`);
  }
  return stats;
}
