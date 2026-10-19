/**
 * 19 Ekim 2026 onayı.
 * Sonnenklar TV (euvia.cdn.ses-ps.com, jetonlu yönlendirme) eklenmez.
 * OK4 ve OK54 Trier rev 4'te zaten var; yeni adresleri geo yedek olur.
 * NDR int ana listesi, aynı ndr_int ailesini taşıyan NDR Fernsehen Hamburg'a yazılır.
 * MDR Thüringen Ost/Nord/Süd HLS adresleri, bölgesel varyantları zaten
 * bir arada duran MDR Thüringen Mitte/West kaydına eklenir.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const ADD_TURS = new Set(["yeni_link", "yeni_kanal", "radyo_yeni_link", "radyo_yeni_kanal"]);
const NEW_CHANNEL_TURS = new Set(["yeni_kanal", "radyo_yeni_kanal"]);

const NAME_ALIAS = {
  "NDR Fernsehen": "NDR Fernsehen Hamburg",
  "Radio Weser TV (HFHB)": "Radio Weser TV Bremen",
  "MDR Thüringen Ost": "MDR Thüringen Mitte/West",
  "MDR Thüringen Nord": "MDR Thüringen Mitte/West",
  "MDR Thüringen Süd": "MDR Thüringen Mitte/West",
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

function approvalStatus(durum) {
  const text = String(durum).trim().toLowerCase();
  if (text.startsWith("working") || text.startsWith("çalışıyor") || text.startsWith("calisiyor")) {
    return "working";
  }
  if (text.startsWith("sadece almanya")) return "geo";
  return null;
}

function canonicalName(name) {
  const stripped = name.replace(/\s*\(radyo\)\s*$/i, "").trim();
  return NAME_ALIAS[stripped] || stripped;
}

function isSkipped(name, url) {
  return name === "Sonnenklar TV" || url.includes("euvia.cdn.ses-ps.com");
}

function insertStream(channel, stream) {
  if (stream.geo_de_only) {
    channel.streams.push(stream);
  } else {
    const firstGeo = channel.streams.findIndex((item) => item.geo_de_only);
    if (firstGeo === -1) channel.streams.push(stream);
    else channel.streams.splice(firstGeo, 0, stream);
  }
  channel.geo_de_only = channel.streams.every((item) => item.geo_de_only);
}

export function applyOctober19(channels) {
  const csvPath = path.join(SOURCES, "onay-2026-10-19.csv");
  const stats = { addedChannels: 0, addedLinks: 0, skippedSonnenklar: 0, addedChannelNames: [] };
  if (!fs.existsSync(csvPath)) return stats;

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const byKey = new Map(channels.map((channel) => [`${channel.type}\0${channel.name}`, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) urls.add(stream.url);
  }

  for (const row of rows) {
    const tur = row.tur?.trim();
    const rawName = row.kanal?.trim();
    const url = row.link?.trim();
    if (!tur || !rawName || !url) throw new Error("onay-2026-10-19 satırı eksik");
    if (isSkipped(rawName, url)) {
      stats.skippedSonnenklar += 1;
      continue;
    }
    if (!ADD_TURS.has(tur)) throw new Error(`bilinmeyen tur (${rawName}): ${tur}`);
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz onay URL (${rawName}): ${url}`);
    if (urls.has(url)) throw new Error(`onay linki zaten katalogda (${rawName}): ${url}`);

    const type = tur.startsWith("radyo") ? "radio" : "tv";
    const status = approvalStatus(row.durum);
    if (!status) throw new Error(`bilinmeyen onay durumu (${rawName}): ${row.durum}`);
    const name = canonicalName(rawName);
    const key = `${type}\0${name}`;
    let channel = byKey.get(key);
    if (!channel) {
      if (!NEW_CHANNEL_TURS.has(tur)) throw new Error(`yedek linkin kanalı yok: ${rawName}`);
      channel = {
        id: "",
        name,
        type,
        category: "regional",
        geo_de_only: false,
        streams: [],
        groups: [],
      };
      channels.push(channel);
      byKey.set(key, channel);
      stats.addedChannels += 1;
      stats.addedChannelNames.push(name);
    }

    insertStream(channel, { url, geo_de_only: status === "geo" });
    urls.add(url);
    stats.addedLinks += 1;
  }

  if (stats.skippedSonnenklar !== 1) {
    throw new Error(`Sonnenklar TV atlanmadı: ${stats.skippedSonnenklar}`);
  }
  const bremen = channels.find((channel) => channel.name === "Radio Bremen Fernsehen");
  const dash = bremen?.streams.find((stream) => stream.url.endsWith("/dash.mpd"));
  if (!dash?.geo_de_only) throw new Error("Radio Bremen DASH linki geo_de_only değil");
  if (channels.some((channel) => channel.streams.some((stream) => stream.url.includes("euvia.cdn.ses-ps.com")))) {
    throw new Error("Sonnenklar TV kataloga girdi");
  }
  for (const name of ["Bayernwelle SüdOst", "baden.fm"]) {
    if (!channels.some((channel) => channel.name === name)) throw new Error(`yeni istasyon yok: ${name}`);
  }

  return stats;
}
