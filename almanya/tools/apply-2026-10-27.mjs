/**
 * 27 Ekim 2026 onayı.
 * Tagesschau 24'ün kalan iki int HLS adresi, BFS Süd'ün 404 master'ı
 * ve Juwelo'nun üç oturum alt listesi silinir.
 * 174 yedek mevcut kanallara eklenir. Yeni kanal açılmaz.
 * Bayern 3, Cosmo 56k ve ServusTV yedeği geo_de_only olur.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const TS_1080 = "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master1080p5000.m3u8";
const TS_360 = "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master360p1200.m3u8";
const BFS_DEAD = "https://mcdn.br.de/bfs_sued/de/master.m3u8";
const BFS_DE = "https://mcdn.br.de/br/fs/bfs_sued/hls/de/master.m3u8";
const BFS_INT = "https://mcdn.br.de/br/fs/bfs_sued/hls/int/master.m3u8";
const BFS_DASH = "https://bfrsueddash.akamaized.net/dash/live/2016970/bfs_sued_de/dvbt2/manifest.mpd";
const JUWEL_MAIN = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/7441/7441_264_live.m3u8";
const JUWEL_3 = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/7441/2646acd5413662e9_12812347_2610120941_3_3.m3u8";
const JUWEL_2 = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/7441/2646acd5413662e9_12812347_2610120941_2_2.m3u8";
const JUWEL_1 = "https://sdn-global-live-streaming-packager-cache.3qsdn.com/7441/2646acd5413662e9_12812347_2610120941_1_1.m3u8";
const SERVUS_PRI = "https://stv-live.akamaized.net/hls/live/2031012/lingeoSTVDEwebPri/master_3392.m3u8";
const SERVUS_BU = "https://stv-live.akamaized.net/hls/live/2031020/lingeoSTVDEwebBU/master.m3u8";
const BAYERN3_LOW = "https://dispatcher.rndfnk.com/br/br3/live/mp3/low?aggregator=tunein";
const COSMO_56 = "https://wdr-cosmo-live.icecastssl.wdr.de/wdr/cosmo/live/mp3/56/stream.mp3?aggregator=tunein";
const BIG0 = "https://stream.bigfm.de/deutschland/aac-128";
const BIG1 = "https://streams.bigfm.de/bigfm-deutschland-128-mp3";
const BOB0 = "https://streams.radiobob.de/bob-national/mp3-192/mediaplayer";
const TS_DE = "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/de/master.m3u8";
const TS_DASH = "https://tagesschau.akamaized.net/dash/live/2020098/tagesschau/tagesschau_3/tagesschau_3.mpd";

const DELETES = [
  ["Tagesschau 24", TS_1080],
  ["Tagesschau 24", TS_360],
  ["Bayerisches Fernsehen Süd", BFS_DEAD],
  ["Juwelo", JUWEL_3],
  ["Juwelo", JUWEL_2],
  ["Juwelo", JUWEL_1],
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

export function applyOctober27(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-10-27.csv"), "utf8"));
  if (rows.length !== 180) throw new Error(`27 Ekim satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const dead = rows.filter((row) => row.tip === "olu_link");
  const adds = rows.filter((row) => row.tip === "yeni_link");
  if (dead.length !== 6 || adds.length !== 174 || dead.length + adds.length !== rows.length) {
    throw new Error(`27 Ekim tür sayısı ölü ${dead.length} yedek ${adds.length}`);
  }
  const expected = DELETES.map(([name, url]) => `${name}\t${url}`).join("\n");
  const actual = dead.map((row) => `${row.kanal}\t${row.link}`).join("\n");
  if (actual !== expected) throw new Error("27 Ekim silinecek adresler onay listesiyle uyuşmuyor");

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedDupes: 0,
    geoLinks: 0,
  };

  for (const [name, url] of DELETES) {
    deleteFromChannel(channels, urls, name, url);
    stats.removedLinks += 1;
  }

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const addChannels = new Set();

  for (const row of adds) {
    const url = row.link;
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz URL: ${url}`);
    const bad = forbiddenLeaves(url);
    if (bad.length) throw new Error(`yeni adreste yasak parametre: ${bad.join(",")} ${url}`);
    const status = approvalStatus(row.durum);
    if (status !== "working" && status !== "geo") throw new Error(`yedek durumu yok: ${row.kanal}`);
    const channel = byName.get(row.kanal);
    if (!channel) throw new Error(`yedek kanalı yok: ${row.kanal}`);
    addChannels.add(row.kanal);
    if (urls.has(url)) {
      stats.skippedDupes += 1;
      continue;
    }
    const geo = status === "geo";
    insertBeforeGeo(channel, { url, geo_de_only: geo });
    urls.add(url);
    stats.addedLinks += 1;
    if (geo) stats.geoLinks += 1;
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

  const juwelo = byName.get("Juwelo");
  must(juwelo.streams.length === 1 && juwelo.streams[0].url === JUWEL_MAIN, "Juwelo ana yayın düştü");
  must(!juwelo.streams[0].geo_de_only, "Juwelo ana yayın geo oldu");

  const bfs = byName.get("Bayerisches Fernsehen Süd");
  must(!bfs.streams.some((stream) => stream.url === BFS_DEAD), "BFS Süd 404 master duruyor");
  must(bfs.streams.some((stream) => stream.url === BFS_DE && !stream.geo_de_only), "BFS Süd de master düştü");
  must(bfs.streams.some((stream) => stream.url === BFS_INT && !stream.geo_de_only), "BFS Süd int master düştü");
  must(bfs.streams.at(-1).url === BFS_DASH && bfs.streams.at(-1).geo_de_only, "BFS Süd DASH sonda değil");
  must(bfs.streams.length === 6 && !bfs.geo_de_only, "BFS Süd yayın sayısı");

  const tagesschau = byName.get("Tagesschau 24");
  must(!tagesschau.streams.some((stream) => stream.url.includes("/hls/int/")), "Tagesschau 24 int HLS duruyor");
  must(tagesschau.streams.some((stream) => stream.url === TS_DE && !stream.geo_de_only), "Tagesschau de master düştü");
  must(tagesschau.streams.at(-1).url === TS_DASH && tagesschau.streams.at(-1).geo_de_only, "Tagesschau DASH sonda değil");
  must(!tagesschau.geo_de_only, "Tagesschau kanalı tamamen geo oldu");

  const servus = byName.get("ServusTV Deutschland");
  must(servus.geo_de_only && servus.streams.length === 2, "ServusTV yedek yerleşmedi");
  must(servus.streams[0].url === SERVUS_PRI && servus.streams[0].geo_de_only, "ServusTV ana yayın yerinde değil");
  must(servus.streams[1].url === SERVUS_BU && servus.streams[1].geo_de_only, "ServusTV yedeği geo değil");

  const bayern3 = byName.get("Bayern 3");
  const bayernAt = bayern3.streams.findIndex((stream) => stream.url === BAYERN3_LOW);
  must(bayernAt === bayern3.streams.length - 1 && bayern3.streams[bayernAt].geo_de_only, "Bayern 3 geo yedek sonda değil");
  must(!bayern3.geo_de_only, "Bayern 3 kanalı tamamen geo oldu");

  const cosmo = byName.get("Cosmo");
  must(cosmo.streams[0].url.includes("icecastssl.wdr.de"), "Cosmo ana yayın önde değil");
  must(cosmo.streams[1].url.includes("wdr-cosmo-live.icecast.wdr.de"), "Cosmo ikinci ana yayın yerinde değil");
  const cosmoAt = cosmo.streams.findIndex((stream) => stream.url === COSMO_56);
  must(cosmoAt === cosmo.streams.length - 1 && cosmo.streams[cosmoAt].geo_de_only, "Cosmo 56k geo yedek sonda değil");
  must(cosmoAt > 1 && !cosmo.geo_de_only, "Cosmo 56k ana yayının önüne geçti");

  const big = byName.get("bigFM");
  must(big.streams[0].url === BIG0 && big.streams[1].url === BIG1, "bigFM ana yayın yerinde değil");
  const bob = byName.get("Radio Bob");
  must(bob.streams[0].url === BOB0, "Radio Bob ana yayın yerinde değil");
  const rock = byName.get("Rock Antenne");
  const rockPath = new URL(rock.streams[0].url).pathname.replace(/\/+$/, "");
  must(rockPath.endsWith("/rockantenne"), "Rock Antenne ana yayın yerinde değil");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");

  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 157 || radio !== 165) throw new Error(`kanal sayısı tv=${tv} radyo=${radio}`);
  if (stats.addedChannels !== 0 || stats.addedLinks !== 174 || stats.removedLinks !== 6) {
    throw new Error(`sayılar +${stats.addedLinks} -${stats.removedLinks} yinelenen ${stats.skippedDupes}`);
  }
  if (stats.removedChannels !== 0 || stats.skippedDupes !== 0 || stats.geoLinks !== 3) {
    throw new Error(`geo ${stats.geoLinks} yinelenen ${stats.skippedDupes}`);
  }
  if (addChannels.size !== 65) throw new Error(`yedek kanal ${addChannels.size}`);
  if (allUrls.length !== 1305) throw new Error(`link sayısı ${allUrls.length}`);

  return stats;
}
