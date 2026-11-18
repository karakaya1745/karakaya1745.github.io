/**
 * 18 Kasım 2026 yayın öncesi kontrol.
 * Katalogdaki 1507 link yeniden test edildi. 404 veya NXDOMAIN çıkmadığı için
 * silme yok. K-TV kathtv ana listesi, MDR Klassik mp3'leri ve Deluxe Dance
 * 3qsdn adresleri 200 döndü; oldukları gibi kalır.
 * MDR'nin avw çalma listesi 200 döndü ve katalogda yoktu; yedek olarak eklenir.
 * Deluxe Dance için doğrulanmış farklı bir resmi yayın bulunamadı.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");
const MDR_BACKUP = "https://avw.mdr.de/streams/284350-0_mp3_high.m3u";

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

export function applyNovember18(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-18.csv"), "utf8"));
  const adds = rows.filter((row) => row.tur === "yedek");
  const keeps = rows.filter((row) => row.tur === "canli_koru");
  must(adds.length === 1 && adds[0].link === MDR_BACKUP, "18 Kasım yedek satırı beklenenden farklı");
  must(keeps.length === 5, `18 Kasım korunan satır sayısı ${keeps.length}`);

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  for (const row of keeps) {
    const channel = byName.get(row.kanal);
    must(channel, `korunan kanal yok: ${row.kanal}`);
    must(
      channel.streams.some((stream) => stream.url === row.link),
      `canlı link düştü: ${row.kanal} ${row.link}`,
    );
  }

  const channel = byName.get("MDR Klassik");
  must(channel && channel.type === "radio", "MDR Klassik yok");
  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedDupes: 0,
    addedUrls: [],
  };
  if (urls.has(MDR_BACKUP)) {
    stats.skippedDupes += 1;
    return stats;
  }
  insertBeforeGeo(channel, { url: MDR_BACKUP, geo_de_only: false });
  stats.addedLinks += 1;
  stats.addedUrls.push(MDR_BACKUP);
  return stats;
}
