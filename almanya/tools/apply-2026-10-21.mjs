/**
 * 21 Ekim 2026 onayı.
 * TV ve radyo yedekleri ile 17 yeni radyo eklenir.
 * olu_mevcut satırları silinmez; kanal listesinin sonuna alınır.
 * HR 1 Audiothek hr1rm adresi ilk sırada kalır.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const HR1_FIRST = "https://hr-radio.ard-mcdn.de/hr/radio/hr1rm/hls/master.m3u8";

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
  if (text.startsWith("ölü") || text.startsWith("olu") || text.startsWith("şüpheli") || text.startsWith("supheli")) {
    return "dead";
  }
  if (text.includes("sadece almanya") || text.includes("geo restricted") || text.includes("403") || text.includes("401")) {
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

export function applyOctober21(channels) {
  const csvPath = path.join(SOURCES, "onay-2026-10-21.csv");
  const stats = { addedChannels: 0, addedLinks: 0, demotedLinks: 0, addedChannelNames: [] };
  if (!fs.existsSync(csvPath)) return stats;

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) urls.add(stream.url);
  }

  const tail = new Set();
  let ordinal = 5_000_000;
  for (const row of rows) {
    const tur = row.tur?.trim();
    const name = row.kanal?.trim();
    const url = row.link?.trim();
    if (!tur || !name || !url) throw new Error("onay-2026-10-21 satırı eksik");
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz onay URL (${name}): ${url}`);

    if (tur === "olu_mevcut") {
      const channel = byName.get(name);
      if (!channel?.streams.some((stream) => stream.url === url)) {
        throw new Error(`sona alınacak link katalogda yok (${name}): ${url}`);
      }
      tail.add(url);
      stats.demotedLinks += 1;
      continue;
    }
    if (tur !== "yeni_link" && tur !== "yeni_kanal") throw new Error(`bilinmeyen tur (${name}): ${tur}`);
    const status = approvalStatus(row.durum);
    if (status !== "working") throw new Error(`yeni satır çalışan değil (${name}): ${row.durum}`);
    if (urls.has(url)) throw new Error(`onay linki zaten katalogda (${name}): ${url}`);

    let channel = byName.get(name);
    if (!channel) {
      if (tur !== "yeni_kanal") throw new Error(`yedek linkin kanalı yok: ${name}`);
      channel = {
        id: "",
        name,
        type: "radio",
        category: "regional",
        geo_de_only: false,
        streams: [],
        groups: [],
      };
      channels.push(channel);
      byName.set(name, channel);
      stats.addedChannels += 1;
      stats.addedChannelNames.push(name);
    } else if (tur === "yeni_kanal" && channel.id) {
      throw new Error(`yeni kanal zaten katalogda: ${name}`);
    }

    channel.streams.push({ url, geo_de_only: false, _ord: ordinal });
    ordinal += 1;
    urls.add(url);
    stats.addedLinks += 1;
  }

  for (const channel of channels) sortChannel(channel, tail);

  const hr1 = byName.get("HR 1");
  if (hr1?.streams[0]?.url !== HR1_FIRST) throw new Error("HR 1 Audiothek linki önde değil");
  const welt = byName.get("Welt");
  if (!welt?.streams.at(-1)?.url.includes("welt.personalstream.tv/v1/master.m3u8")) {
    throw new Error("Welt personalstream linki sonda değil");
  }
  for (const url of tail) {
    const channel = channels.find((item) => item.streams.some((stream) => stream.url === url));
    const firstTail = channel.streams.findIndex((stream) => tail.has(stream.url));
    if (firstTail === -1 || channel.streams.slice(firstTail).some((stream) => !tail.has(stream.url))) {
      throw new Error(`ölü link sonda değil: ${channel.name}`);
    }
  }
  if (stats.demotedLinks !== 8) throw new Error(`sona alınan link sayısı 8 olmalı: ${stats.demotedLinks}`);
  if (stats.addedChannels !== 17) throw new Error(`yeni kanal sayısı 17 olmalı: ${stats.addedChannels}`);
  if (stats.addedLinks !== 43) throw new Error(`yeni link sayısı 43 olmalı: ${stats.addedLinks}`);
  return stats;
}
