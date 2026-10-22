/**
 * 22 Ekim 2026 onayı. Yalnızca mevcut kanallara yedek.
 * olu_mevcut silinmez; kanalın sonuna alınır.
 * avw.mdr.de *_aac_high.m3u (503) ve ERF Plus HTML listesi de sonda kalır.
 * HR 1: hr1rm, sonra hr1suedhessen, hlshr1 en sonda.
 * ERF Plus: erf-1a64/mp3-128 ilk sırada.
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

const AVW_AAC = /avw\.mdr\.de\/streams\/[^/?]+_aac_high\.m3u$/;

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
  if (text.startsWith("working") || text.startsWith("çalışıyor") || text.startsWith("calisiyor")) return "working";
  if (text.startsWith("sadece almanya") || text.includes("403") || text.includes("401")) return "geo";
  return null;
}

function preference(channel, stream, tail) {
  if (tail.has(stream.url) || AVW_AAC.test(stream.url)) return 100;
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

export function applyOctober22(channels) {
  const csvPath = path.join(SOURCES, "onay-2026-10-22.csv");
  const stats = { addedChannels: 0, addedLinks: 0, skippedDupes: 0, demotedLinks: 0 };
  if (!fs.existsSync(csvPath)) return stats;

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) urls.add(stream.url);
  }

  const tail = new Set([ERF_TAIL]);
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (AVW_AAC.test(stream.url)) tail.add(stream.url);
      if (channel.name === "Radio Weser TV Bremen" && stream.url.includes("5857499ee635b.streamlock.net")) {
        tail.add(stream.url);
      }
    }
  }

  let ordinal = 6_000_000;
  for (const row of rows) {
    const tur = row.tur?.trim();
    const name = row.kanal?.trim();
    const url = row.link?.trim();
    if (!tur || !name || !url) throw new Error("onay-2026-10-22 satırı eksik");

    if (tur === "olu_mevcut") {
      if (url.includes("*")) continue;
      const channel = byName.get(name);
      if (!channel?.streams.some((stream) => stream.url === url)) {
        throw new Error(`sona alınacak link katalogda yok (${name}): ${url}`);
      }
      tail.add(url);
      continue;
    }
    if (tur !== "yeni_link") throw new Error(`bilinmeyen tur (${name}): ${tur}`);
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz onay URL (${name}): ${url}`);
    const status = approvalStatus(row.durum);
    if (!status) throw new Error(`bilinmeyen onay durumu (${name}): ${row.durum}`);
    if (urls.has(url)) {
      stats.skippedDupes += 1;
      continue;
    }
    const channel = byName.get(name);
    if (!channel) throw new Error(`yedek linkin kanalı yok: ${name}`);
    channel.streams.push({
      url,
      geo_de_only: status === "geo",
      _ord: ordinal,
    });
    ordinal += 1;
    urls.add(url);
    stats.addedLinks += 1;
  }

  for (const channel of channels) sortChannel(channel, tail);
  stats.demotedLinks = tail.size;

  const hr1 = byName.get("HR 1");
  if (hr1?.streams[0]?.url !== HR1_FIRST) throw new Error("HR 1 hr1rm önde değil");
  if (hr1?.streams[1]?.url !== HR1_SECOND) throw new Error("HR 1 hr1suedhessen ikinci değil");
  if (!hr1?.streams.at(-1)?.url.endsWith("/hr1/master.m3u8")) throw new Error("HR 1 hlshr1 sonda değil");
  const erf = byName.get("ERF Plus");
  if (erf?.streams[0]?.url !== ERF_FIRST) throw new Error("ERF Plus mp3-128 önde değil");
  if (erf?.streams.at(-1)?.url !== ERF_TAIL) throw new Error("ERF Plus m3u sonda değil");
  const welt = byName.get("Welt");
  if (!welt?.streams.at(-1)?.url.includes("welt.personalstream.tv/v1/master.m3u8")) {
    throw new Error("Welt personalstream sonda değil");
  }
  for (const url of tail) {
    const channel = channels.find((item) => item.streams.some((stream) => stream.url === url));
    if (!channel) throw new Error(`sonda beklenen link yok: ${url}`);
    const firstTail = channel.streams.findIndex((stream) => tail.has(stream.url) || AVW_AAC.test(stream.url));
    if (channel.streams.slice(firstTail).some((stream) => !tail.has(stream.url) && !AVW_AAC.test(stream.url))) {
      throw new Error(`ölü link sonda değil: ${channel.name}`);
    }
  }
  if ([...urls].some((url) => url.includes("*_aac_high"))) throw new Error("joker avw adresi eklendi");
  if (stats.addedChannels !== 0) throw new Error("yeni kanal olmamalı");
  if (stats.addedLinks !== 123) throw new Error(`yeni link sayısı 123 olmalı: ${stats.addedLinks}`);
  if (stats.skippedDupes !== 0) throw new Error(`yinelenen URL atlandı: ${stats.skippedDupes}`);
  if (tail.size !== 14) throw new Error(`sondaki link sayısı 14 olmalı: ${tail.size}`);
  return stats;
}
