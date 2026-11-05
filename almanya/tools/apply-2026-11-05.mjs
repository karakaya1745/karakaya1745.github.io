/**
 * 5 Kasım 2026 onayı.
 * Deluxe Music, Deluxe Rap ve QS24.TV'ye aka yedek eklenir.
 * Sekiz yeni kanal açılır. Deluxe Dance'in aka yedeği kanalla birlikte gelir.
 * MeieTV watch ve K-TV flaky satırlarına dokunulmaz.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const MUSIC_FIRST = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/13456/13456_264_live.m3u8";
const MUSIC_AKA = "https://sdn-global-live-streaming-packager-cache-aka.3qsdn.com/13456/13456_264_live.m3u8";
const RAP_FIRST = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/65183/65183_264_live.m3u8";
const RAP_AKA = "https://sdn-global-live-streaming-packager-cache-aka.3qsdn.com/65183/65183_264_live.m3u8";
const QS_FIRST = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/126101/126101_264_live.m3u8";
const QS_AKA = "https://sdn-global-live-streaming-packager-cache-aka.3qsdn.com/126101/126101_264_live.m3u8";
const DANCE = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/64733/64733_264_live.m3u8";
const DANCE_AKA = "https://sdn-global-live-streaming-packager-cache-aka.3qsdn.com/64733/64733_264_live.m3u8";
const FINEST = "https://media.finest.tv/hls/live.m3u8";
const ISTUFF = "https://relay2.cdn.fem-net.de/hls/loop/istuff_live/istuff_live-720p.m3u8";
const ANIXE = "https://ma.anixa.tv/clips/stream/anixesd/index.m3u8";
const ANIXE_HD = "https://ma.anixa.tv/clips/stream/anixehd/index.m3u8";
const NIUS = "https://radio.nius.de/live";
const MEIE = "https://stream.meietv.de/live/meietv.m3u8";
const KTV_FLAKY = "https://a19bf41486254a3485a864c8b0c14fe1.msvdn.net/live/S28743697/LpD0q2aoyujI/playlist.m3u8";

const NEW_CHANNELS = {
  "Parlamentsfernsehen 3 (Bundestag)": ["tv", "news", false],
  "Parlamentsfernsehen 4 (Bundestag)": ["tv", "news", false],
  "Deluxe Dance": ["tv", "music", false],
  "Finest TV": ["tv", "music", false],
  iSTUFF: ["tv", "shopping", false],
  "Anixe +": ["tv", "other", true],
  "Anixe HD Serie": ["tv", "other", true],
  "NIUS Radio": ["radio", "news", false],
};

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

function isWorking(status) {
  return String(status).trim().toLowerCase().startsWith("200");
}

function isGeo(status) {
  const text = String(status).trim().toLowerCase();
  return text.startsWith("403") || text.startsWith("sadece almanya");
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

export function applyNovember5(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-05.csv"), "utf8"));
  if (rows.length !== 14) throw new Error(`5 Kasım satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const frozen = ["MeieTV", "K-TV"].map((name) => [
    name,
    byName.get(name).streams.map((stream) => stream.url).join("\n"),
  ]);

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedWatch: 0,
    skippedDupes: 0,
    addedChannelNames: [],
  };

  for (const row of rows) {
    const url = row.url;
    if (row.kind === "watch" || row.kind === "flaky") {
      const channel = byName.get(row.channel);
      if (!channel || !channel.streams.some((stream) => stream.url === url)) {
        throw new Error(`izlenen adres katalogda yok: ${row.channel}`);
      }
      stats.skippedWatch += 1;
      continue;
    }
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz URL: ${url}`);
    const bad = forbiddenLeaves(url);
    if (bad.length) throw new Error(`yasak parametre: ${bad.join(",")} ${url}`);

    if (row.kind === "new_channel") {
      const spec = NEW_CHANNELS[row.channel];
      if (!spec) throw new Error(`beklenmeyen yeni kanal: ${row.channel}`);
      if (byName.has(row.channel)) throw new Error(`kanal zaten var: ${row.channel}`);
      const [type, category, geo] = spec;
      if (geo ? !isGeo(row.status) : !isWorking(row.status)) {
        throw new Error(`yeni kanal durumu uyuşmuyor: ${row.channel}`);
      }
      if (urls.has(url)) {
        stats.skippedDupes += 1;
        continue;
      }
      const channel = {
        name: row.channel,
        type,
        category,
        geo_de_only: geo,
        streams: [{ url, geo_de_only: geo }],
        groups: [category],
      };
      channels.push(channel);
      byName.set(row.channel, channel);
      urls.add(url);
      stats.addedChannels += 1;
      stats.addedLinks += 1;
      stats.addedChannelNames.push(row.channel);
      continue;
    }

    if (row.kind !== "backup") throw new Error(`bilinmeyen tür: ${row.kind}`);
    if (!isWorking(row.status)) throw new Error(`yedek çalışmıyor: ${row.channel}`);
    const channel = byName.get(row.channel);
    if (!channel) throw new Error(`yedek kanalı yok: ${row.channel}`);
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

  for (const [name, before] of frozen) {
    must(byName.get(name).streams.map((stream) => stream.url).join("\n") === before, `${name} değişti`);
  }
  must(byName.get("MeieTV").streams[0].url === MEIE, "MeieTV linki düştü");
  must(byName.get("K-TV").streams.some((stream) => stream.url === KTV_FLAKY), "K-TV flaky link düştü");

  const music = byName.get("Deluxe Music");
  const rap = byName.get("Deluxe Rap");
  const qs = byName.get("QS24.TV");
  must(music.streams[0].url === MUSIC_FIRST && music.streams.at(-1).url === MUSIC_AKA, "Deluxe Music yedek yerleşmedi");
  must(rap.streams[0].url === RAP_FIRST && rap.streams.at(-1).url === RAP_AKA, "Deluxe Rap yedek yerleşmedi");
  must(qs.streams[0].url === QS_FIRST && qs.streams.at(-1).url === QS_AKA, "QS24.TV yedek yerleşmedi");

  const dance = byName.get("Deluxe Dance");
  must(dance.category === "music" && dance.streams[0].url === DANCE && dance.streams[1].url === DANCE_AKA, "Deluxe Dance yok");
  must(!dance.streams[1].geo_de_only, "Deluxe Dance aka geo oldu");
  const finest = byName.get("Finest TV");
  must(finest.category === "music" && finest.streams[0].url === FINEST && !finest.geo_de_only, "Finest TV yok");
  must(byName.get("iSTUFF").category === "shopping" && byName.get("iSTUFF").streams[0].url === ISTUFF, "iSTUFF yok");
  for (const [name, url] of [["Anixe +", ANIXE], ["Anixe HD Serie", ANIXE_HD]]) {
    const channel = byName.get(name);
    must(channel.geo_de_only && channel.streams.length === 1 && channel.streams[0].url === url && channel.streams[0].geo_de_only, `${name} geo değil`);
  }
  const nius = byName.get("NIUS Radio");
  must(nius.type === "radio" && nius.category === "news" && nius.streams[0].url === NIUS, "NIUS Radio yok");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 167 || radio !== 167 || channels.length !== 334) {
    throw new Error(`kanal sayısı tv=${tv} radyo=${radio} toplam ${channels.length}`);
  }
  if (stats.addedChannels !== 8 || stats.addedLinks !== 12 || stats.removedChannels !== 0 || stats.skippedDupes !== 0) {
    throw new Error(`sayılar kanal +${stats.addedChannels} link +${stats.addedLinks} yinelenen ${stats.skippedDupes}`);
  }
  if (stats.skippedWatch !== 2 || allUrls.length !== 1440) {
    throw new Error(`atlanan ${stats.skippedWatch} link ${allUrls.length}`);
  }
  return stats;
}
