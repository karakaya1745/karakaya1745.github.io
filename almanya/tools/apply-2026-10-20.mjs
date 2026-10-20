/**
 * 20 Ekim 2026 onayı.
 * Bütün yeni kanal ve yedek linkler eklenir.
 * olu_link satırları silinmez; kanal listesinin sonuna alınır.
 * HR 1'de Audiothek hr1rm adresi ilk sıradadır.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const HR1_FIRST = "https://hr-radio.ard-mcdn.de/hr/radio/hr1rm/hls/master.m3u8";

const TV_NEW = new Set([
  "Finest TV",
  "Folx Music Television",
  "KaufBei TV",
  "MeieTV",
  "Metropol Region TV Rhein-Neckar",
  "Oberlausitz TV",
  "One Music Television",
  "QS24.TV",
  "Zwei Music Television",
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
  if (text.startsWith("olu")) return "dead";
  if (
    text.startsWith("sadece almanya") ||
    text.includes("sadece almanya") ||
    text.includes("geo restricted") ||
    text.includes("403") ||
    text.includes("401")
  ) {
    return "geo";
  }
  return null;
}

function preference(channel, stream, tail) {
  if (tail.has(stream.url)) return 100;
  if (channel.name === "HR 1" && stream.url === HR1_FIRST) return 0;
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

export function applyOctober20(channels) {
  const csvPath = path.join(SOURCES, "onay-2026-10-20.csv");
  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    demotedLinks: 0,
    addedChannelNames: [],
  };
  if (!fs.existsSync(csvPath)) return stats;

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const byKey = new Map(channels.map((channel) => [`${channel.type}\0${channel.name}`, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) urls.add(stream.url);
  }

  const tail = new Set();
  let ordinal = 4_000_000;
  for (const row of rows) {
    const tur = row.tur?.trim();
    const name = row.kanal?.trim();
    const url = row.link?.trim();
    if (!tur || !name || !url) throw new Error("onay-2026-10-20 satırı eksik");
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz onay URL (${name}): ${url}`);
    const status = approvalStatus(row.durum);
    if (!status) throw new Error(`bilinmeyen onay durumu (${name}): ${row.durum}`);

    if (tur === "olu_link" || status === "dead") {
      if (tur !== "olu_link") throw new Error(`ölü satırın türü olu_link değil (${name})`);
      let found = false;
      for (const channel of channels) {
        if (channel.streams.some((stream) => stream.url === url)) found = true;
      }
      if (!found) throw new Error(`sona alınacak link katalogda yok (${name}): ${url}`);
      tail.add(url);
      stats.demotedLinks += 1;
      continue;
    }
    if (tur !== "yeni_link" && tur !== "yeni_kanal") {
      throw new Error(`bilinmeyen tur (${name}): ${tur}`);
    }
    if (urls.has(url)) throw new Error(`onay linki zaten katalogda (${name}): ${url}`);

    const type = tur === "yeni_kanal" ? (TV_NEW.has(name) ? "tv" : "radio") : null;
    let channel = type ? byKey.get(`${type}\0${name}`) : channels.find((item) => item.name === name);
    if (!channel && tur === "yeni_link") {
      channel = byKey.get(`tv\0${name}`) || byKey.get(`radio\0${name}`);
    }
    if (!channel) {
      if (tur !== "yeni_kanal") throw new Error(`yedek linkin kanalı yok: ${name}`);
      channel = {
        id: "",
        name,
        type,
        category: "other",
        geo_de_only: false,
        streams: [],
        groups: [],
      };
      channels.push(channel);
      byKey.set(`${type}\0${name}`, channel);
      stats.addedChannels += 1;
      stats.addedChannelNames.push(name);
    } else if (tur === "yeni_kanal" && channel.streams.length === 0) {
      throw new Error(`yeni kanal beklenmedik biçimde boş: ${name}`);
    } else if (tur === "yeni_kanal" && !stats.addedChannelNames.includes(name) && !channel.id) {
      /* ilk satırda açıldı */
    } else if (tur === "yeni_kanal" && channel.id) {
      throw new Error(`yeni kanal zaten katalogda: ${name}`);
    }

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

  const hr1 = channels.find((channel) => channel.name === "HR 1");
  if (hr1?.streams[0]?.url !== HR1_FIRST) throw new Error("HR 1 Audiothek linki önde değil");
  for (const url of tail) {
    const channel = channels.find((item) => item.streams.some((stream) => stream.url === url));
    if (channel.streams.at(-1).url !== url && !tail.has(channel.streams.at(-1).url)) {
      throw new Error(`ölü link sonda değil (${channel.name}): ${url}`);
    }
    const firstTail = channel.streams.findIndex((stream) => tail.has(stream.url));
    if (channel.streams.slice(firstTail).some((stream) => !tail.has(stream.url))) {
      throw new Error(`ölü linklerin ardında başka yayın var: ${channel.name}`);
    }
  }
  if (stats.demotedLinks !== 7) throw new Error(`sona alınan link sayısı 7 olmalı: ${stats.demotedLinks}`);
  if (stats.addedChannels !== 81) throw new Error(`yeni kanal sayısı 81 olmalı: ${stats.addedChannels}`);
  if (stats.addedLinks !== 328) throw new Error(`yeni link sayısı 328 olmalı: ${stats.addedLinks}`);

  return stats;
}
