/**
 * 23 Ekim 2026 onayı.
 * Yedekler ve iki yeni kanal eklenir.
 * MDR Klassik ENDLIST adayı eklenmez.
 * 503 avw aac_high, 404 ARD int varyantları ve Samsung TV Plus kanalları silinir.
 * Kronik ölü linkler (Welt, QVC, Radio Weser, h-eins, Finest, HR 1 hlshr1) sonda kalır.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const HR1_FIRST = "https://hr-radio.ard-mcdn.de/hr/radio/hr1rm/hls/master.m3u8";
const HR1_SECOND = "https://hlshr1.akamaized.net/hls/live/2016533/hr1suedhessen/master.m3u8";
const ERF_FIRST = "https://stream.erfplus.de/erf-1a64/mp3-128?ar-distributor=ffa5";
const ERF_TAIL = "https://stream.erf.de/erfplus.m3u";
const KLASSISK_SKIP = "https://radio-hls.mdr.de/hls/live/2112906/mdr-284350-0-hls/index.m3u8";

const SAMSUNG_CHANNELS = new Map([
  ["Höhenrausch", 2],
  ["One Terra", 1],
  ["Xplore", 1],
  ["Just Cooking", 1],
  ["Just Fishing", 1],
]);

const DELETE_URLS = new Set([
  "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master.m3u8",
  "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master720p3200.m3u8",
  "https://mdr-live.ard-mcdn.de/mdr/live/hls/int/master360p1200.m3u8",
  "https://avw.mdr.de/streams/284290-2_aac_high.m3u",
  "https://avw.mdr.de/streams/284320-0_aac_high.m3u",
  "https://avw.mdr.de/streams/284310-0_aac_high.m3u",
  "https://avw.mdr.de/streams/284330-0_aac_high.m3u",
  "https://avw.mdr.de/streams/990701-0_aac_high.m3u",
]);

const KEEP_URLS = new Set([
  "https://welt.personalstream.tv/v1/master.m3u8?ads.country=de&ads.pf=welttv",
  "https://qvcde-live.akamaized.net/hls/live/2097104/qby/master.m3u8",
  "https://qvcde-live.akamaized.net/hls/live/2097104/qps/master.m3u8",
  "https://media.finest.tv/hls/live.m3u8",
  "https://5857499ee635b.streamlock.net/radiowesertv-live/mp4:livestreamTV/playlist.m3u8",
  "https://5857499ee635b.streamlock.net/radiowesertv-live/_definst_/mp4:livestreamTV/playlist.m3u8",
  "https://5857499ee635b.streamlock.net/radiowesertv-live/_definst_/mp4:livestreamHFHB/playlist.m3u8",
  "https://5857499ee635b.streamlock.net/heinstv-live/_definst_/smil:livestream.smil/playlist.m3u8",
  "https://hlshr1.akamaized.net/hls/live/2016533/hr1/master.m3u8",
]);

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

function preference(channel, stream, tail) {
  if (tail.has(stream.url)) return 100;
  if (channel.name === "HR 1" && stream.url === HR1_FIRST) return 0;
  if (channel.name === "HR 1" && stream.url === HR1_SECOND) return 1;
  if (channel.name === "ERF Plus" && stream.url === ERF_FIRST) return 0;
  if (stream.geo_de_only) return 50;
  return 10;
}

function sortChannel(channel, tail) {
  channel.streams.forEach((stream, index) => {
    if (stream._ord == null) stream._ord = index;
  });
  channel.streams.sort((a, b) => {
    const byPref = preference(channel, a, tail) - preference(channel, b, tail);
    if (byPref !== 0) return byPref;
    return a._ord - b._ord;
  });
  for (const stream of channel.streams) delete stream._ord;
  channel.geo_de_only = channel.streams.every((stream) => stream.geo_de_only);
}

function removeStream(channel, url) {
  const index = channel.streams.findIndex((stream) => stream.url === url);
  if (index === -1) return false;
  channel.streams.splice(index, 1);
  return true;
}

export function applyOctober23(channels) {
  const csvPath = path.join(SOURCES, "onay-2026-10-23.csv");
  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedKlassik: 0,
    skippedDupes: 0,
    keptDead: 0,
    removedChannelNames: [],
  };
  if (!fs.existsSync(csvPath)) return stats;

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) urls.add(stream.url);
  }

  const seenDelete = new Set();
  const seenKeep = new Set();
  const seenSamsung = new Map();
  let ordinal = 7_000_000;

  for (const row of rows) {
    const tur = row.tur?.trim();
    const name = row.kanal?.trim();
    const url = row.link?.trim();
    const tip = row.tip?.trim();
    if (!tur || !name || !url) throw new Error("onay-2026-10-23 satırı eksik");
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz onay URL (${name}): ${url}`);

    if (tur === "olu_link") {
      const channel = byName.get(name);
      if (!channel?.streams.some((stream) => stream.url === url)) {
        throw new Error(`ölü link katalogda yok (${name}): ${url}`);
      }
      if (SAMSUNG_CHANNELS.has(name)) {
        seenSamsung.set(name, (seenSamsung.get(name) || 0) + 1);
        continue;
      }
      if (DELETE_URLS.has(url)) {
        if (!removeStream(channel, url)) throw new Error(`silinecek link yok (${name}): ${url}`);
        urls.delete(url);
        seenDelete.add(url);
        stats.removedLinks += 1;
        if (!channel.streams.length) throw new Error(`kanal boş kaldı: ${name}`);
        continue;
      }
      if (KEEP_URLS.has(url)) {
        seenKeep.add(url);
        stats.keptDead += 1;
        continue;
      }
      throw new Error(`ölü link ne silinecek ne kalacak (${name}): ${url}`);
    }

    if (name === "MDR Klassik") {
      if (url !== KLASSISK_SKIP) throw new Error(`beklenmeyen MDR Klassik adresi: ${url}`);
      stats.skippedKlassik += 1;
      continue;
    }
    if (tur !== "yeni_link" && tur !== "yeni_kanal") throw new Error(`bilinmeyen tur (${name}): ${tur}`);
    if (tip !== "tv" && tip !== "radio") throw new Error(`bilinmeyen tip (${name}): ${tip}`);
    const status = approvalStatus(row.durum);
    if (status !== "working") throw new Error(`yeni satır çalışan değil (${name}): ${row.durum}`);
    if (urls.has(url)) {
      stats.skippedDupes += 1;
      continue;
    }

    let channel = byName.get(name);
    if (!channel) {
      if (tur !== "yeni_kanal") throw new Error(`yedek linkin kanalı yok: ${name}`);
      channel = {
        id: "",
        name,
        type: tip,
        category: tip === "tv" ? "other" : "regional",
        geo_de_only: false,
        streams: [],
        groups: [],
      };
      channels.push(channel);
      byName.set(name, channel);
      stats.addedChannels += 1;
    } else if (tur === "yeni_kanal") {
      throw new Error(`yeni kanal zaten katalogda: ${name}`);
    } else if (channel.type !== tip) {
      throw new Error(`yedek tipi kanal tipi ile uyuşmuyor (${name})`);
    }

    channel.streams.push({ url, geo_de_only: false, _ord: ordinal });
    ordinal += 1;
    urls.add(url);
    stats.addedLinks += 1;
  }

  for (const [name, expected] of SAMSUNG_CHANNELS) {
    const channel = byName.get(name);
    if (!channel) throw new Error(`Samsung kanalı yok: ${name}`);
    if (seenSamsung.get(name) !== expected) {
      throw new Error(`Samsung satır sayısı ${expected} olmalı (${name}): ${seenSamsung.get(name) || 0}`);
    }
    if (channel.streams.length !== expected) {
      throw new Error(`Samsung kanalında başka link var (${name}): ${channel.streams.length}`);
    }
    for (const stream of channel.streams) {
      if (!stream.url.includes(".mediatailor.") || !stream.url.includes("vendor=samsung")) {
        throw new Error(`Samsung kanalında mediatailor olmayan link (${name}): ${stream.url}`);
      }
      urls.delete(stream.url);
      stats.removedLinks += 1;
    }
    channel.streams = [];
  }

  const kept = channels.filter((channel) => !SAMSUNG_CHANNELS.has(channel.name));
  stats.removedChannels = channels.length - kept.length;
  stats.removedChannelNames = [...SAMSUNG_CHANNELS.keys()];
  channels.length = 0;
  channels.push(...kept);

  const tail = new Set([...KEEP_URLS, ERF_TAIL]);
  for (const channel of channels) sortChannel(channel, tail);

  if (seenDelete.size !== DELETE_URLS.size) {
    throw new Error(`silinen adres sayısı ${DELETE_URLS.size} olmalı: ${seenDelete.size}`);
  }
  if (seenKeep.size !== KEEP_URLS.size) {
    throw new Error(`kalan ölü adres sayısı ${KEEP_URLS.size} olmalı: ${seenKeep.size}`);
  }
  if (stats.addedChannels !== 2) throw new Error(`yeni kanal sayısı 2 olmalı: ${stats.addedChannels}`);
  if (stats.addedLinks !== 28) throw new Error(`yeni link sayısı 28 olmalı: ${stats.addedLinks}`);
  if (stats.removedLinks !== 14) throw new Error(`silinen link sayısı 14 olmalı: ${stats.removedLinks}`);
  if (stats.removedChannels !== 5) throw new Error(`silinen kanal sayısı 5 olmalı: ${stats.removedChannels}`);
  if (stats.skippedKlassik !== 1) throw new Error(`MDR Klassik atlama 1 olmalı: ${stats.skippedKlassik}`);
  if (stats.skippedDupes !== 0) throw new Error(`yinelenen URL atlandı: ${stats.skippedDupes}`);
  if (stats.keptDead !== 9) throw new Error(`sonda bırakılan satır 9 olmalı: ${stats.keptDead}`);

  const names = new Set(channels.map((channel) => channel.name));
  for (const name of SAMSUNG_CHANNELS.keys()) {
    if (names.has(name)) throw new Error(`Samsung kanalı duruyor: ${name}`);
  }
  if ([...urls].some((url) => url.includes(".mediatailor.") || url.includes("vendor=samsung"))) {
    throw new Error("mediatailor adresi kaldı");
  }
  if ([...urls].some((url) => /avw\.mdr\.de\/streams\/[^/?]+_aac_high\.m3u$/.test(url))) {
    throw new Error("avw aac_high adresi kaldı");
  }
  if (urls.has(KLASSISK_SKIP)) throw new Error("MDR Klassik ENDLIST eklendi");

  const hr1 = channels.find((channel) => channel.name === "HR 1");
  if (hr1?.streams[0]?.url !== HR1_FIRST) throw new Error("HR 1 hr1rm önde değil");
  if (hr1?.streams[1]?.url !== HR1_SECOND) throw new Error("HR 1 hr1suedhessen ikinci değil");
  if (hr1?.streams.at(-1)?.url !== "https://hlshr1.akamaized.net/hls/live/2016533/hr1/master.m3u8") {
    throw new Error("HR 1 hlshr1 sonda değil");
  }
  const erf = channels.find((channel) => channel.name === "ERF Plus");
  if (erf?.streams[0]?.url !== ERF_FIRST) throw new Error("ERF Plus mp3-128 önde değil");
  if (erf?.streams.at(-1)?.url !== ERF_TAIL) throw new Error("ERF Plus m3u sonda değil");
  const welt = channels.find((channel) => channel.name === "Welt");
  if (welt?.streams.at(-1)?.url !== "https://welt.personalstream.tv/v1/master.m3u8?ads.country=de&ads.pf=welttv") {
    throw new Error("Welt personalstream sonda değil");
  }

  const tagesschau = channels.find((channel) => channel.name === "Tagesschau 24");
  const tagesschauUrls = new Set(tagesschau?.streams.map((stream) => stream.url));
  for (const url of [
    "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master.m3u8",
    "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master720p3200.m3u8",
  ]) {
    if (tagesschauUrls.has(url)) throw new Error(`Tagesschau 24 ölü int adresi duruyor: ${url}`);
  }
  for (const url of [
    "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master1080p5000.m3u8",
    "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master540p1800.m3u8",
    "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/int/master360p1200.m3u8",
    "https://tagesschau-live.ard-mcdn.de/tagesschau/live/hls/de/master720p3200.m3u8",
  ]) {
    if (!tagesschauUrls.has(url)) throw new Error(`Tagesschau 24 yedeği düştü: ${url}`);
  }

  const mdrSn = channels.find((channel) => channel.name === "MDR Fernsehen Sachsen");
  const mdrUrls = new Set(mdrSn?.streams.map((stream) => stream.url));
  if (mdrUrls.has("https://mdr-live.ard-mcdn.de/mdr/live/hls/int/master360p1200.m3u8")) {
    throw new Error("MDR Fernsehen Sachsen int 360p duruyor");
  }
  if (!mdrUrls.has("https://mdr-live.ard-mcdn.de/mdr/live/hls/de/master360p1200.m3u8")) {
    throw new Error("MDR Fernsehen Sachsen de 360p düştü");
  }
  if (!mdrSn?.geo_de_only) throw new Error("MDR Fernsehen Sachsen geo bayrağı kalktı");

  const sports = channels.find((channel) => channel.name === "More Than Sports TV");
  if (sports?.type !== "tv" || sports.streams.length !== 1) throw new Error("More Than Sports TV eklenmedi");
  const ruesselsheim = channels.find((channel) => channel.name === "Radio Rüsselsheim");
  if (ruesselsheim?.type !== "radio" || ruesselsheim.streams.length !== 1) {
    throw new Error("Radio Rüsselsheim eklenmedi");
  }
  const rock = channels.find((channel) => channel.name === "Rock Antenne");
  if (rock?.streams[0]?.url !== "https://mp3channels.webradio.rockantenne.de/rockantenne") {
    throw new Error("Rock Antenne ana yayın önde değil");
  }

  for (const url of tail) {
    const channel = channels.find((item) => item.streams.some((stream) => stream.url === url));
    if (!channel) throw new Error(`sonda beklenen link yok: ${url}`);
    const firstTail = channel.streams.findIndex((stream) => tail.has(stream.url));
    if (channel.streams.slice(firstTail).some((stream) => !tail.has(stream.url))) {
      throw new Error(`ölü link sonda değil: ${channel.name}`);
    }
  }

  return stats;
}
