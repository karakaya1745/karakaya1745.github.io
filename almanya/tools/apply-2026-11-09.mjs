/**
 * 9 Kasım 2026 onayı.
 * Melodie TV'nin üç bozztv.com adresi NXDOMAIN. Alternatif yok; kanal çıkar.
 * Başka kanala, özellikle K-TV'ye, dokunulmaz.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const MELODIE = [
  "https://live20.bozztv.com/akamaissh101/ssh101/melodietvlive/chunks.m3u8",
  "https://live20.bozztv.com/akamaissh101/ssh101/melodietvlive/playlist.m3u8",
  "https://183.bozztv.com/ssh101/ssh101/melodietvlive/playlist.m3u8",
];
const KTV_FIRST = "https://d1pz8zear993v8.cloudfront.net/hlsme/kathtv.m3u8";

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

function must(condition, message) {
  if (!condition) throw new Error(message);
}

export function applyNovember9(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-09.csv"), "utf8"));
  if (rows.length !== 3) throw new Error(`9 Kasım satır sayısı ${rows.length}`);
  if (rows.map((row) => `${row.kanal}\t${row.link}`).join("\n") !== MELODIE.map((url) => `Melodie TV\t${url}`).join("\n")) {
    throw new Error("9 Kasım satırları Melodie TV listesiyle uyuşmuyor");
  }

  const index = channels.findIndex((channel) => channel.name === "Melodie TV");
  if (index < 0) throw new Error("Melodie TV yok");
  const channel = channels[index];
  const urls = channel.streams.map((stream) => stream.url);
  must(urls.join("\n") === MELODIE.join("\n"), "Melodie TV akış listesi beklenenden farklı");
  const ktvBefore = channels
    .find((item) => item.name === "K-TV")
    .streams.map((stream) => stream.url)
    .join("\n");
  const namesBefore = channels.map((item) => `${item.type}\t${item.name}`);

  channels.splice(index, 1);

  const ktv = channels.find((item) => item.name === "K-TV");
  must(ktv.streams.map((stream) => stream.url).join("\n") === ktvBefore, "K-TV değişti");
  must(ktv.streams[0].url === KTV_FIRST, "K-TV cloudfront linki yerinde değil");
  must(!channels.some((item) => item.name === "Melodie TV"), "Melodie TV duruyor");
  const left = channels.flatMap((item) => item.streams.map((stream) => stream.url));
  for (const url of MELODIE) must(!left.includes(url), `Melodie URL duruyor: ${url}`);
  must(channels.map((item) => `${item.type}\t${item.name}`).join("\n") === namesBefore.filter((name) => name !== "tv\tMelodie TV").join("\n"), "kanal sırası değişti");

  const tv = channels.filter((item) => item.type === "tv").length;
  const radio = channels.filter((item) => item.type === "radio").length;
  if (tv !== 166 || radio !== 168 || channels.length !== 334) {
    throw new Error(`kanal sayısı tv=${tv} radyo=${radio} toplam ${channels.length}`);
  }
  if (left.length !== 1512) throw new Error(`link sayısı ${left.length}`);
  if (new Set(left).size !== left.length) throw new Error("katalogda yinelenen URL var");

  return {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 3,
    removedChannels: 1,
    removedChannelNames: ["Melodie TV"],
    removedUrls: MELODIE,
  };
}
