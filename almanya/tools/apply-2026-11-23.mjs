/**
 * 23 Kasım 2026 temizliği.
 * Tarama 111 adresi ölü işaretledi. Aynı adresler bu ortamda bir kez daha
 * denendi. Yalnız timeout veya TLS sürenler çıkar:
 * Finest TV (timeout, tek link), MeieTV (süresi dolmuş sertifika, tek link),
 * Hitradio Ohr edge67 (timeout; kanalın beş yayını durur).
 * 200/206 dönen yayınlar ve 403 geo yanıtları katalogda kalır.
 * Radio 21 TV 403 döndü; radyo kanalı Radio 21 ile birlikte durur.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");
const FINEST = "https://media.finest.tv/hls/live.m3u8";
const MEIE = "https://stream.meietv.de/live/meietv.m3u8";
const OHR = "https://edge67.streamonkey.net/fho-hitradioohrlive/stream/aacp?aggregator=smk-m3u-aac";
const RADIO21_TV = "https://live.creacast.com/radio21/smil:radio21.smil/playlist.m3u8";

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

function removeChannel(channels, name, url) {
  const index = channels.findIndex((channel) => channel.name === name && channel.type === "tv");
  if (index < 0) throw new Error(`${name} yok`);
  const channel = channels[index];
  must(channel.streams.length === 1 && channel.streams[0].url === url, `${name} tek ölü link değil`);
  channels.splice(index, 1);
}

export function applyNovember23(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-23.csv"), "utf8"));
  must(rows.length === 111, `23 Kasım satır sayısı ${rows.length}`);
  const channelsOut = rows.filter((row) => row.tur === "olu_kanal");
  const linksOut = rows.filter((row) => row.tur === "olu_link");
  const kept = rows.filter((row) => row.tur === "koru");
  must(channelsOut.length === 2 && linksOut.length === 1 && kept.length === 108, "23 Kasım tur sayıları uyuşmuyor");
  const expectedChannels = new Map([
    ["Finest TV", FINEST],
    ["MeieTV", MEIE],
  ]);
  for (const row of channelsOut) {
    must(expectedChannels.get(row.kanal) === row.link, `olu_kanal beklenenden farklı: ${row.kanal}`);
  }
  must(linksOut[0].kanal === "Hitradio Ohr" && linksOut[0].link === OHR, "Hitradio Ohr satırı beklenenden farklı");

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const radio21 = byName.get("Radio 21");
  must(radio21 && radio21.type === "radio", "Radio 21 yok");
  const radio21Before = radio21.streams.map((stream) => stream.url).join("\n");
  const radio21Tv = byName.get("Radio 21 TV");
  must(radio21Tv && radio21Tv.streams.some((stream) => stream.url === RADIO21_TV), "Radio 21 TV yok");

  for (const row of kept) {
    const channel = byName.get(row.kanal);
    must(channel, `korunan kanal yok: ${row.kanal}`);
    must(channel.streams.some((stream) => stream.url === row.link), `korunan link yok: ${row.kanal}`);
  }

  removeChannel(channels, "Finest TV", FINEST);
  removeChannel(channels, "MeieTV", MEIE);

  const ohr = channels.find((channel) => channel.name === "Hitradio Ohr");
  must(ohr && ohr.streams.length > 1, "Hitradio Ohr yedeği kalmıyor");
  const ohrIndex = ohr.streams.findIndex((stream) => stream.url === OHR);
  must(ohrIndex >= 0, "Hitradio Ohr edge67 yok");
  ohr.streams.splice(ohrIndex, 1);
  must(ohr.streams.length > 0, "Hitradio Ohr boşaldı");

  const left = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  for (const url of [FINEST, MEIE, OHR]) {
    must(!left.includes(url), `çıkan URL duruyor: ${url}`);
  }
  must(channels.find((channel) => channel.name === "Radio 21").streams.map((stream) => stream.url).join("\n") === radio21Before, "Radio 21 değişti");
  must(channels.some((channel) => channel.name === "Radio 21 TV"), "Radio 21 TV düştü");
  must(channels.some((channel) => channel.name === "iSTUFF"), "iSTUFF yok");
  must(!channels.some((channel) => channel.streams.length === 0), "akışsız kanal");
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  must(tv === 166 && radio === 166 && channels.length === 332, `kanal sayısı tv=${tv} radyo=${radio}`);
  must(left.length === 1505, `link sayısı ${left.length}`);

  return {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 3,
    removedChannels: 2,
    keptLinks: kept.length,
    removedChannelNames: ["Finest TV", "MeieTV"],
    removedUrls: [FINEST, MEIE, OHR],
  };
}
