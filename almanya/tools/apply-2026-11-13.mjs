/**
 * 13 Kasım 2026 onayı.
 * BR Schlager ve 0nlineradio 70s kanal olarak çıkar (üçer link 404).
 * RPR1'de üç ölü streams.rpr1.de adresi, iki çalışan stream.rpr1.de yedeğiyle değişir.
 * Absolut relax'te ölü edge67 adresi çıkar; temiz live-sm adresi eklenir.
 * edge19 yedeği zaten katalogda olduğu için yinelenmez.
 * Sophia TV Español ve Sophia TV Français, mevcut Sophia TV'nin hemen ardına eklenir.
 * shopping bloğu sonda kalır. Finest TV, Radio 21 TV, MeieTV ve K-TV durur.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const BR_SCHLAGER = [
  "https://dispatcher.rndfnk.com/br/brschlager/live/mp3/mid",
  "https://br-radio.ard-mcdn.de/br/radio/brschlager/hls/master.m3u8",
  "https://br-radio.ard-mcdn.de/br/radio/brschlager/hls/192/seglist.m3u8",
];
const ONLINE_70S = [
  "https://stream.0nlineradio.com/70s?ref=radiobrowser",
  "https://0nlineradio.radioho.st/0r-70s",
  "https://stream1-0nlineradio.radiohost.de/70s",
];
const RPR1_DEAD = [
  "https://streams.rpr1.de/rpr-simulcast-128-mp3",
  "https://streams.rpr1.de/rpr-simulcast-64-aac",
  "https://streams.rpr1.de/rpr-simulcast-128-aac",
];
const RPR1_NEW = [
  "https://stream.rpr1.de/koblenz/mp3-128/radiobrowser",
  "https://stream.rpr1.de/webradio/mp3-128/radiobrowser",
];
const RPR1_KEEP = [
  "https://stream.rpr1.de/webradio/128-mp3/raddio",
  "https://stream.rpr1.de/webradio/mp3-128/private",
  "https://stream.rpr1.de/webradio/aac-128/tunein",
  "https://stream.rpr1.de/webradio/aac-64/tunein",
  "https://stream.rpr1.de/webradio/mp3-128/tunein",
  "https://stream.rpr1.de/webradio/aac-64",
  "https://stream.rpr1.de/webradio/aac-128",
  "https://stream.rpr1.de/webradio/mp3-128",
];
const ABSOLUT_DEAD = "https://edge67.live-sm.absolutradio.de/absolut-relax";
const ABSOLUT_NEW = "https://absolut-relax.live-sm.absolutradio.de/absolut-relax";
const ABSOLUT_EXISTING = "https://edge19.live-sm.absolutradio.de/absolut-relax/stream/aacp";
const SOPHIA_EN = "https://bild-und-ton.stream/sophiatv-en/smil:sophia-tv-en.smil/playlist.m3u8";
const SOPHIA_ES = "https://bild-und-ton.stream/sophiatv-es/smil:sophia-tv-es.smil/playlist.m3u8";
const SOPHIA_FR = "https://bild-und-ton.stream/sophiatv-fr/smil:sophia-tv-fr.smil/playlist.m3u8";
const KTV_FIRST = "https://d1pz8zear993v8.cloudfront.net/hlsme/kathtv.m3u8";
const FINEST = "https://media.finest.tv/hls/live.m3u8";
const RADIO21 = "https://live.creacast.com/radio21/smil:radio21.smil/playlist.m3u8";
const MEIE = "https://stream.meietv.de/live/meietv.m3u8";
const FROZEN = ["Finest TV", "Radio 21 TV", "MeieTV", "K-TV", "Sophia TV", "WDR Studio Köln", "Anixe +"];
const NEW_CHANNELS = {
  "Sophia TV Español": ["tv", "religious", SOPHIA_ES],
  "Sophia TV Français": ["tv", "religious", SOPHIA_FR],
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

function removeChannel(channels, name, expectedUrls, stats) {
  const index = channels.findIndex((channel) => channel.name === name);
  if (index < 0) throw new Error(`${name} yok`);
  const channel = channels[index];
  const urls = channel.streams.map((stream) => stream.url);
  must(urls.join("\n") === expectedUrls.join("\n"), `${name} akış listesi beklenenden farklı`);
  channels.splice(index, 1);
  stats.removedChannels += 1;
  stats.removedLinks += expectedUrls.length;
  stats.removedChannelNames.push(name);
  stats.removedUrls.push(...expectedUrls);
}

export function applyNovember13(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-13.csv"), "utf8"));
  if (rows.length !== 16) throw new Error(`13 Kasım satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const frozen = FROZEN.map((name) => {
    const channel = byName.get(name);
    if (!channel) throw new Error(`korunan kanal yok: ${name}`);
    return [name, channel.streams.map((stream) => stream.url).join("\n")];
  });

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedDupes: 0,
    addedChannelNames: [],
    removedChannelNames: [],
    removedUrls: [],
    addedUrls: [],
  };

  const expectedRemoves = {
    "BR Schlager": BR_SCHLAGER,
    "0nlineradio 70s": ONLINE_70S,
  };
  const removeRows = rows.filter((row) => row.tur === "olu_kanal");
  if (removeRows.length !== 6) throw new Error(`olu_kanal satır sayısı ${removeRows.length}`);
  for (const [name, expected] of Object.entries(expectedRemoves)) {
    const found = removeRows.filter((row) => row.kanal === name).map((row) => row.link);
    must(found.join("\n") === expected.join("\n"), `${name} CSV satırları uyuşmuyor`);
  }

  removeChannel(channels, "BR Schlager", BR_SCHLAGER, stats);
  removeChannel(channels, "0nlineradio 70s", ONLINE_70S, stats);
  for (const url of [...BR_SCHLAGER, ...ONLINE_70S]) urls.delete(url);
  byName.delete("BR Schlager");
  byName.delete("0nlineradio 70s");

  const deleteRows = rows.filter((row) => row.tur === "olu_link_sil");
  if (deleteRows.length !== 4) throw new Error(`olu_link_sil satır sayısı ${deleteRows.length}`);
  for (const row of deleteRows) {
    const channel = byName.get(row.kanal);
    if (!channel) throw new Error(`silinecek kanal yok: ${row.kanal}`);
    const hits = channel.streams.filter((stream) => stream.url === row.link);
    if (hits.length !== 1) throw new Error(`${row.kanal} silinecek URL ${hits.length} kez: ${row.link}`);
    channel.streams = channel.streams.filter((stream) => stream.url !== row.link);
    urls.delete(row.link);
    stats.removedLinks += 1;
    stats.removedUrls.push(row.link);
  }

  const addBackupRows = rows.filter((row) => row.tur === "yeni_yedek");
  if (addBackupRows.length !== 4) throw new Error(`yeni_yedek satır sayısı ${addBackupRows.length}`);
  const rpr1Adds = [];
  for (const row of addBackupRows) {
    if (!/^https:\/\/\S+$/.test(row.link)) throw new Error(`geçersiz URL: ${row.link}`);
    const channel = byName.get(row.kanal);
    if (!channel) throw new Error(`yedek kanalı yok: ${row.kanal}`);
    if (urls.has(row.link)) {
      stats.skippedDupes += 1;
      continue;
    }
    if (row.kanal === "RPR1") {
      rpr1Adds.push(row.link);
      urls.add(row.link);
      stats.addedLinks += 1;
      stats.addedUrls.push(row.link);
      continue;
    }
    insertBeforeGeo(channel, { url: row.link, geo_de_only: false });
    urls.add(row.link);
    stats.addedLinks += 1;
    stats.addedUrls.push(row.link);
  }
  must(rpr1Adds.join("\n") === RPR1_NEW.join("\n"), "RPR1 yeni linkler beklenenden farklı");
  const rpr1 = byName.get("RPR1");
  rpr1.streams = [
    ...rpr1Adds.map((url) => ({ url, geo_de_only: false })),
    ...rpr1.streams,
  ];

  const newChannelRows = rows.filter((row) => row.tur === "yeni_kanal");
  if (newChannelRows.length !== 2) throw new Error(`yeni_kanal satır sayısı ${newChannelRows.length}`);
  for (const row of newChannelRows) {
    const spec = NEW_CHANNELS[row.kanal];
    if (!spec) throw new Error(`beklenmeyen yeni kanal: ${row.kanal}`);
    if (byName.has(row.kanal)) throw new Error(`kanal zaten var: ${row.kanal}`);
    if (!/^https:\/\/\S+$/.test(row.link)) throw new Error(`geçersiz URL: ${row.link}`);
    const [type, category, url] = spec;
    must(row.link === url, `${row.kanal} URL uyuşmuyor`);
    if (urls.has(url)) {
      stats.skippedDupes += 1;
      continue;
    }
    const channel = {
      name: row.kanal,
      type,
      category,
      geo_de_only: false,
      streams: [{ url, geo_de_only: false }],
      groups: [category],
    };
    channels.push(channel);
    byName.set(row.kanal, channel);
    urls.add(url);
    stats.addedChannels += 1;
    stats.addedLinks += 1;
    stats.addedChannelNames.push(row.kanal);
    stats.addedUrls.push(url);
  }

  for (const channel of channels) {
    if (!channel.streams.length) throw new Error(`akışsız kanal: ${channel.name}`);
    channel.geo_de_only = channel.streams.every((stream) => stream.geo_de_only);
    let seenGeo = false;
    const seen = new Set();
    for (const stream of channel.streams) {
      if (seen.has(stream.url)) throw new Error(`bozuk akış: ${channel.name} ${stream.url}`);
      seen.add(stream.url);
      if (stream.geo_de_only) seenGeo = true;
      else if (seenGeo) throw new Error(`çalışan link geo yedeğinden sonra: ${channel.name}`);
    }
  }

  for (const [name, before] of frozen) {
    must(byName.get(name).streams.map((stream) => stream.url).join("\n") === before, `${name} değişti`);
  }
  must(byName.get("Sophia TV").streams[0].url === SOPHIA_EN, "Sophia TV EN değişti");
  must(byName.get("K-TV").streams[0].url === KTV_FIRST, "K-TV cloudfront linki yerinde değil");
  must(byName.get("Finest TV").streams.some((stream) => stream.url === FINEST), "Finest TV silindi");
  must(byName.get("Radio 21 TV").streams.some((stream) => stream.url === RADIO21), "Radio 21 TV silindi");
  must(byName.get("MeieTV").streams[0].url === MEIE, "MeieTV linki düştü");

  must(
    rpr1.streams.map((stream) => stream.url).join("\n") === [...RPR1_NEW, ...RPR1_KEEP].join("\n"),
    "RPR1 sıra beklenenden farklı",
  );
  for (const url of RPR1_DEAD) must(!urls.has(url), `RPR1 ölü URL duruyor: ${url}`);
  must(!urls.has(ABSOLUT_DEAD), "Absolut relax edge67 duruyor");
  must(urls.has(ABSOLUT_NEW) && urls.has(ABSOLUT_EXISTING), "Absolut relax yeni veya mevcut yedek yok");
  const absolut = byName.get("Absolut relax");
  must(absolut.streams.at(-1).url === ABSOLUT_NEW, "Absolut relax yeni link sonda değil");
  must(absolut.streams.some((stream) => stream.url === ABSOLUT_EXISTING), "Absolut relax edge19 düştü");

  const sophiaEs = byName.get("Sophia TV Español");
  const sophiaFr = byName.get("Sophia TV Français");
  must(sophiaEs.category === "religious" && sophiaEs.streams[0].url === SOPHIA_ES, "Sophia TV Español yok");
  must(sophiaFr.category === "religious" && sophiaFr.streams[0].url === SOPHIA_FR, "Sophia TV Français yok");
  must(!sophiaEs.geo_de_only && !sophiaFr.geo_de_only, "Sophia dil kanalları geo oldu");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 168 || radio !== 166 || channels.length !== 334) {
    throw new Error(`kanal sayısı tv=${tv} radyo=${radio} toplam ${channels.length}`);
  }
  if (stats.addedChannels !== 2 || stats.addedLinks !== 5 || stats.removedChannels !== 2 || stats.removedLinks !== 10) {
    throw new Error(
      `sayılar kanal +${stats.addedChannels}/-${stats.removedChannels} link +${stats.addedLinks}/-${stats.removedLinks}`,
    );
  }
  if (stats.skippedDupes !== 1 || allUrls.length !== 1507) {
    throw new Error(`yinelenen ${stats.skippedDupes} link ${allUrls.length}`);
  }
  if (allUrls.includes(FINEST) === false || allUrls.includes(RADIO21) === false || allUrls.includes(MEIE) === false) {
    throw new Error("korunan URL düştü");
  }
  return stats;
}
