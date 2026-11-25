/**
 * 25 Kasım 2026 onayı.
 * Aday linkler üç kez denendi. 200 çalma listesi veya ses dönenler durur.
 * Campusradio Mannheim (Radioaktiv) üç denemede de zaman aşımına uğradı
 * ve tek linkiydi; kanal çıkar.
 * Franken Fernsehen'e çalışan playoutcenter yedeği eklenir.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");
const RADIOAKTIV = "https://stream.radioaktiv.org/VeryHiFi";
const FRANKEN = "https://frankentv.iptv-playoutcenter.de/frankentv/frankentv.stream_1/playlist.m3u8";
const KEEP = [
  ["K-TV", "https://d1pz8zear993v8.cloudfront.net/hlsme/kathtv.m3u8"],
  ["SWR4", "https://swr-radio.ard-mcdn.de/swr/radio/swr4bw/hls/192/seglist.m3u8"],
  ["Radio Gütersloh", "https://ams.stream33.radiohost.de/ams-radioguetersloh_mp3-192"],
  ["delta radio", "https://streams.deltaradio.de/delta-live/mp3-192/tunein/"],
  ["Radio Teddy", "https://streamtdy.ir-media-tec.com/live/mp3-128/radioplayer_web/play.mp3"],
  ["Radio Teddy", "https://streamtdy.ir-media-tec.com/live/aac-64/tunein_web_aac"],
  ["Radio Teddy", "https://streamtdy.ir-media-tec.com/live/mp3-128/tunein_web_mp3"],
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

function must(condition, message) {
  if (!condition) throw new Error(message);
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

export function applyNovember25(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-25.csv"), "utf8"));
  must(rows.length === 9, `25 Kasım satır sayısı ${rows.length}`);
  const adds = rows.filter((row) => row.tur === "yedek");
  const kept = rows.filter((row) => row.tur === "koru");
  const removed = rows.filter((row) => row.tur === "olu_kanal");
  must(adds.length === 1 && kept.length === 7 && removed.length === 1, "25 Kasım tur sayıları uyuşmuyor");
  must(adds[0].kanal === "Franken Fernsehen" && adds[0].link === FRANKEN, "Franken yedeği beklenenden farklı");
  must(removed[0].kanal === "Campusradio Mannheim (Radioaktiv)" && removed[0].link === RADIOAKTIV, "Radioaktiv satırı beklenenden farklı");
  const keptKey = kept.map((row) => `${row.kanal}\t${row.link}`).join("\n");
  must(keptKey === KEEP.map(([name, url]) => `${name}\t${url}`).join("\n"), "korunan satırlar beklenenden farklı");

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  for (const [name, url] of KEEP) {
    const channel = byName.get(name);
    must(channel && channel.streams.some((stream) => stream.url === url), `korunan link yok: ${name}`);
  }

  const franken = byName.get("Franken Fernsehen");
  must(franken && franken.type === "tv", "Franken Fernsehen yok");
  must(!franken.streams.some((stream) => stream.url === FRANKEN), "Franken yedeği zaten var");
  insertBeforeGeo(franken, { url: FRANKEN, geo_de_only: false });
  franken.geo_de_only = franken.streams.every((stream) => stream.geo_de_only);

  const index = channels.findIndex((channel) => channel.name === "Campusradio Mannheim (Radioaktiv)");
  must(index >= 0, "Radioaktiv yok");
  const radioaktiv = channels[index];
  must(radioaktiv.type === "radio" && radioaktiv.streams.length === 1 && radioaktiv.streams[0].url === RADIOAKTIV, "Radioaktiv tek link değil");
  channels.splice(index, 1);

  const left = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  must(!left.includes(RADIOAKTIV), "Radioaktiv duruyor");
  must(left.includes(FRANKEN), "Franken yedeği eklenmedi");
  must(left.filter((url) => url === FRANKEN).length === 1, "Franken yedeği yinelendi");
  must(channels.some((channel) => channel.name === "iSTUFF"), "iSTUFF yok");
  must(!channels.some((channel) => channel.streams.length === 0), "akışsız kanal");
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  must(tv === 165 && radio === 165 && channels.length === 330, `kanal sayısı tv=${tv} radyo=${radio}`);
  must(left.length === 1517, `link sayısı ${left.length}`);
  must(new Set(left).size === left.length, "katalogda yinelenen URL var");

  return {
    addedChannels: 0,
    addedLinks: 1,
    removedLinks: 1,
    removedChannels: 1,
    keptLinks: kept.length,
    addedUrls: [FRANKEN],
    removedChannelNames: ["Campusradio Mannheim (Radioaktiv)"],
    removedUrls: [RADIOAKTIV],
  };
}
