/**
 * 8 Kasım 2026 onayı.
 * ARD kalite varyantları yenilenir; ZDF dach ve diğer 404 yedekler silinir.
 * OK54 Trier adaptif master eklenir.
 *
 * İstisna: CSV Finest TV ve Radio 21 TV için olu_link_sil dese de
 * kullanıcı bu iki kanalı ve streamlerini korumayı seçti.
 * WDR Studio Köln, Anixe +, MeieTV ve K-TV de aynen kalır.
 * Kanal boşaltılmaz. Yeni kanal yok.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const PROTECT = new Set(["Finest TV", "Radio 21 TV"]);
const FINEST = "https://media.finest.tv/hls/live.m3u8";
const RADIO21 = "https://live.creacast.com/radio21/smil:radio21.smil/playlist.m3u8";
const FROZEN = ["Finest TV", "Radio 21 TV", "WDR Studio Köln", "Anixe +", "MeieTV", "K-TV"];
const ZDF_DE = "https://zdf-hls-01.akamaized.net/hls/live/2016498/de/de/master.m3u8";
const SAT_ALT = "https://zdf-hls-15.akamaized.net/hls/live/2016527/3sat/master.m3u8";
const OK54 = "https://s.ok54.de/ott/webstream/playlist.m3u8";
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

export function applyNovember8(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-08.csv"), "utf8"));
  if (rows.length !== 172) throw new Error(`8 Kasım satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }
  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const namesBefore = channels.map((channel) => `${channel.type}\t${channel.name}`);
  const firstBefore = new Map(
    channels.map((channel) => [channel.name, { url: channel.streams[0].url, geo: channel.streams[0].geo_de_only }]),
  );
  const frozen = FROZEN.map((name) => [name, byName.get(name).streams.map((stream) => stream.url).join("\n")]);

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedProtect: 0,
    skippedIzle: 0,
    skippedSole: 0,
    skippedDupes: 0,
    removedNondach: [],
  };

  const deletes = [];
  for (const row of rows) {
    if (!byName.has(row.kanal)) throw new Error(`kanal yok: ${row.kanal}`);
    if (row.tur === "izle") {
      stats.skippedIzle += 1;
      continue;
    }
    if (row.tur === "olu_link_sil") {
      if (PROTECT.has(row.kanal)) {
        stats.skippedProtect += 1;
        continue;
      }
      deletes.push(row);
      continue;
    }
    if (row.tur !== "yedek_degistir" && row.tur !== "yeni_yedek") {
      throw new Error(`bilinmeyen tür: ${row.tur}`);
    }
    const url = row.link;
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz URL: ${url}`);
    const bad = forbiddenLeaves(url);
    if (bad.length) throw new Error(`yasak parametre: ${bad.join(",")} ${url}`);
    if (!String(row.durum).trim().toLowerCase().startsWith("200")) throw new Error(`yedek çalışmıyor: ${row.kanal}`);
    if (urls.has(url)) {
      stats.skippedDupes += 1;
      continue;
    }
    insertBeforeGeo(byName.get(row.kanal), { url, geo_de_only: false });
    urls.add(url);
    stats.addedLinks += 1;
  }

  for (const row of deletes) {
    const channel = byName.get(row.kanal);
    const hits = channel.streams.filter((stream) => stream.url === row.link);
    if (hits.length !== 1) throw new Error(`${row.kanal} silinecek URL ${hits.length} kez: ${row.link}`);
    if (channel.streams.length === 1) {
      stats.skippedSole += 1;
      continue;
    }
    channel.streams = channel.streams.filter((stream) => stream.url !== row.link);
    urls.delete(row.link);
    stats.removedLinks += 1;
    if (row.link === ZDF_DE || row.link === SAT_ALT) stats.removedNondach.push(row.kanal);
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
  must(byName.get("Finest TV").streams.some((stream) => stream.url === FINEST), "Finest TV silindi");
  must(byName.get("Radio 21 TV").streams.some((stream) => stream.url === RADIO21), "Radio 21 TV silindi");
  must(!urls.has(ZDF_DE) && byName.get("ZDF").streams.length > 1, "ZDF de/de kararı bozuk");
  must(!urls.has(SAT_ALT) && byName.get("3sat").streams.length > 1, "3sat alternatif kararı bozuk");
  const ok54 = byName.get("OK54 Trier");
  must(ok54.streams[0].url === OK54 && !ok54.streams[0].geo_de_only, "OK54 master önde değil");
  must(ok54.streams.slice(1).every((stream) => stream.geo_de_only), "OK54 eski geo linkleri durmuyor");
  const kika = byName.get("KIKA");
  must(kika.streams[1].url === KIKA_DASH && !kika.streams[1].geo_de_only, "KIKA dünya DASH yerinde değil");
  const wdr = byName.get("WDR Fernsehen Köln");
  must(wdr.streams[1].url === WDR_WORLD && !wdr.streams[1].geo_de_only, "WDR dünya DASH yerinde değil");

  for (const [name, first] of firstBefore) {
    if (FROZEN.includes(name) || first.url === OK54) continue;
    const channel = byName.get(name);
    if (!channel.streams.some((stream) => stream.url === first.url)) continue;
    if (!first.geo) must(channel.streams[0].url === first.url, `${name} primary yerinde değil`);
  }

  const namesAfter = channels.map((channel) => `${channel.type}\t${channel.name}`);
  must(namesAfter.join("\n") === namesBefore.join("\n"), "kanal sırası değişti");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 167 || radio !== 168 || channels.length !== 335) {
    throw new Error(`kanal sayısı tv=${tv} radyo=${radio}`);
  }
  if (stats.addedChannels !== 0 || stats.addedLinks !== 61 || stats.removedLinks !== 107) {
    throw new Error(`sayılar +${stats.addedLinks} -${stats.removedLinks} yinelenen ${stats.skippedDupes}`);
  }
  if (stats.skippedProtect !== 2 || stats.skippedIzle !== 2 || stats.skippedSole !== 0 || stats.skippedDupes !== 0) {
    throw new Error(`korunan ${stats.skippedProtect} izle ${stats.skippedIzle} boş ${stats.skippedSole}`);
  }
  if (stats.removedNondach.join("|") !== "ZDF|3sat") throw new Error(`non-dach ${stats.removedNondach.join(",")}`);
  if (allUrls.length !== 1412) throw new Error(`link sayısı ${allUrls.length}`);
  if (allUrls.includes(FINEST) === false || allUrls.includes(RADIO21) === false) {
    throw new Error("korunan izle URL'si düştü");
  }
  return stats;
}
