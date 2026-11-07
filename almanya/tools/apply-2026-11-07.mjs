/**
 * 7 Kasım 2026 onayı.
 * Yedi kanaldaki sekiz iptv-playoutcenter adresi silinir.
 * München TV, Oberpfalz TV ve TVA Ostbayern welocal yayınla kalır; kanal silinmez.
 * KONTRAFUNK news radyosu eklenir.
 * MeieTV ve K-TV flaky linkine dokunulmaz.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const DELETES = [
  ["München TV", "https://muenchentv.iptv-playoutcenter.de/muenchentv/muenchentv.stream_1/playlist.m3u8"],
  ["Oberpfalz TV", "https://oberpfalztv.iptv-playoutcenter.de/oberpfalztv/oberpfalztv.stream_1/playlist.m3u8"],
  ["TVA Ostbayern", "https://tvaktuellr.iptv-playoutcenter.de/tvaktuellr/tvaktuellr.stream_1/playlist.m3u8"],
  ["Augsburg TV", "https://augsburgtv.iptv-playoutcenter.de/augsburgtv/augsburgtv.stream_1/playlist.m3u8"],
  ["Franken Fernsehen", "https://frankentv.iptv-playoutcenter.de/frankentv/frankentv.stream_1/chunks.m3u8"],
  ["Franken Fernsehen", "https://frankentv.iptv-playoutcenter.de/frankentv/frankentv.stream_1/playlist.m3u8"],
  ["TV Mainfranken", "https://tvtouringw.iptv-playoutcenter.de/tvtouringw/tvtouringw.stream_1/playlist.m3u8"],
  ["TV Oberfranken", "https://tvoberfranken.iptv-playoutcenter.de/tvoberfranken/tvoberfranken.stream_1/playlist.m3u8"],
];

const REPLACEMENTS = [
  ["München TV", "https://stream02.welocal.stream/stream/fhd-muenchentv_646215/ngrp:stream_all/playlist.m3u8"],
  ["Oberpfalz TV", "https://stream04.welocal.stream/stream/fhd-otv_496277/ngrp:stream_all/playlist.m3u8"],
  ["TVA Ostbayern", "https://stream02.welocal.stream/stream/fhd-tvaktuell_385673/ngrp:stream_all/playlist.m3u8"],
];

const KEEP = [
  ["Augsburg TV", "https://stream02.welocal.stream/stream/fhd-augsburgtv_104951/ngrp:stream_all/playlist.m3u8"],
  ["Augsburg TV", "https://stream02.welocal.stream/stream/fhd-augsburgtv_104951/ngrp:stream_all/chunklist_b3628000.m3u8"],
  ["Augsburg TV", "https://stream02.welocal.stream/stream/fhd-augsburgtv_104951/ngrp:stream_all/chunklist_b946000.m3u8"],
  ["Augsburg TV", "https://stream02.welocal.stream/stream/fhd-augsburgtv_104951/ngrp:stream_all/chunklist_b446000.m3u8"],
  ["Franken Fernsehen", "https://stream03.welocal.stream/stream/fhd-frankenfernsehen_199261/ngrp:stream_all/playlist.m3u8"],
  ["TV Mainfranken", "https://stream01.welocal.stream/stream/fhd-tvmainfranken_255661/ngrp:stream_all/playlist.m3u8"],
  ["TV Mainfranken", "https://stream01.welocal.stream/stream/fhd-tvmainfranken_255661/ngrp:stream_all/chunklist_b946000.m3u8"],
  ["TV Oberfranken", "https://stream02.welocal.stream/stream/fhd-tvo_480355/ngrp:stream_all/playlist.m3u8"],
];

const KONTRA = "https://stream.kontrafunk.radio/listen/kontrafunk/radio.mp3";
const MEIE = "https://stream.meietv.de/live/meietv.m3u8";
const KTV_FLAKY = "https://a19bf41486254a3485a864c8b0c14fe1.msvdn.net/live/S28743697/LpD0q2aoyujI/playlist.m3u8";

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

function forbiddenLeaves(url) {
  const queryAt = url.indexOf("?");
  if (queryAt < 0) return [];
  const bad = [];
  for (const part of url.slice(queryAt + 1).split("&")) {
    if (!part) continue;
    const raw = part.split("=")[0];
    let key = raw;
    try {
      key = decodeURIComponent(raw);
    } catch {
      key = raw;
    }
    const leaf = key.split(".").pop();
    if (/^(sid|token|skey|_art|listenerid)$/i.test(leaf) || /^userConsentV2$/i.test(leaf)) bad.push(key);
  }
  return bad;
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

function deleteFromChannel(channels, urls, name, url) {
  const channel = channels.find((item) => item.name === name);
  if (!channel) throw new Error(`silinecek kanal yok: ${name}`);
  const hits = channel.streams.filter((stream) => stream.url === url).length;
  if (hits !== 1) throw new Error(`${name} silinecek URL ${hits} kez: ${url}`);
  const elsewhere = channels.some(
    (item) => item !== channel && item.streams.some((stream) => stream.url === url),
  );
  if (elsewhere) throw new Error(`URL başka kanalda da var: ${url}`);
  channel.streams = channel.streams.filter((stream) => stream.url !== url);
  urls.delete(url);
  if (!channel.streams.length) throw new Error(`kanal boşaldı: ${name}`);
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

export function applyNovember7(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-07.csv"), "utf8"));
  if (rows.length !== 12) throw new Error(`7 Kasım satır sayısı ${rows.length}`);
  const deleted = rows.filter((row) => row.kind === "delete");
  const backups = rows.filter((row) => row.kind === "backup");
  const created = rows.filter((row) => row.kind === "new_channel");
  if (deleted.length !== 8 || backups.length !== 3 || created.length !== 1) {
    throw new Error(`7 Kasım tür sayısı sil ${deleted.length} yedek ${backups.length} yeni ${created.length}`);
  }
  if (deleted.map((row) => `${row.channel}\t${row.url}`).join("\n") !== DELETES.map((row) => row.join("\t")).join("\n")) {
    throw new Error("7 Kasım silinecek adresler katalog listesiyle uyuşmuyor");
  }
  if (backups.map((row) => `${row.channel}\t${row.url}`).join("\n") !== REPLACEMENTS.map((row) => row.join("\t")).join("\n")) {
    throw new Error("7 Kasım welocal adresleri onay listesiyle uyuşmuyor");
  }
  if (created[0].channel !== "KONTRAFUNK" || created[0].url !== KONTRA) {
    throw new Error("KONTRAFUNK satırı beklenenden farklı");
  }

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }
  const playoutBefore = [...urls].filter((url) => url.includes("iptv-playoutcenter.de")).sort();

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const frozen = ["MeieTV", "K-TV"].map((name) => [
    name,
    byName.get(name).streams.map((stream) => stream.url).join("\n"),
  ]);
  must(byName.get("MeieTV").streams[0].url === MEIE, "MeieTV linki yok");
  must(byName.get("K-TV").streams.some((stream) => stream.url === KTV_FLAKY), "K-TV flaky link yok");

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedDupes: 0,
    addedChannelNames: [],
  };

  for (const [name, url] of REPLACEMENTS) {
    if (!/^https:\/\/\S+$/.test(url) || forbiddenLeaves(url).length) throw new Error(`geçersiz URL: ${url}`);
    const channel = byName.get(name);
    if (!channel) throw new Error(`yedek kanalı yok: ${name}`);
    if (urls.has(url)) {
      stats.skippedDupes += 1;
      continue;
    }
    insertBeforeGeo(channel, { url, geo_de_only: false });
    urls.add(url);
    stats.addedLinks += 1;
  }

  for (const [name, url] of DELETES) {
    deleteFromChannel(channels, urls, name, url);
    stats.removedLinks += 1;
  }

  if (byName.has("KONTRAFUNK")) throw new Error("KONTRAFUNK zaten var");
  if (urls.has(KONTRA) || forbiddenLeaves(KONTRA).length) throw new Error("KONTRAFUNK adresi bozuk");
  const kontra = {
    name: "KONTRAFUNK",
    type: "radio",
    category: "news",
    geo_de_only: false,
    streams: [{ url: KONTRA, geo_de_only: false }],
    groups: ["news"],
  };
  channels.push(kontra);
  byName.set("KONTRAFUNK", kontra);
  urls.add(KONTRA);
  stats.addedChannels += 1;
  stats.addedLinks += 1;
  stats.addedChannelNames.push("KONTRAFUNK");

  for (const channel of channels) {
    if (!channel.streams.length) throw new Error(`akışsız kanal: ${channel.name}`);
    channel.geo_de_only = channel.streams.every((stream) => stream.geo_de_only);
    let seenGeo = false;
    const seen = new Set();
    for (const stream of channel.streams) {
      if (seen.has(stream.url) || forbiddenLeaves(stream.url).length) {
        throw new Error(`bozuk akış: ${channel.name} ${stream.url}`);
      }
      seen.add(stream.url);
      if (stream.geo_de_only) seenGeo = true;
      else if (seenGeo) throw new Error(`çalışan link geo yedeğinden sonra: ${channel.name}`);
    }
  }

  for (const [name, before] of frozen) {
    must(byName.get(name).streams.map((stream) => stream.url).join("\n") === before, `${name} değişti`);
  }
  for (const [name, url] of KEEP) {
    must(byName.get(name).streams.some((stream) => stream.url === url && !stream.geo_de_only), `welocal düştü: ${name}`);
  }
  for (const [name, url] of REPLACEMENTS) {
    const channel = byName.get(name);
    must(channel.streams.length === 1 && channel.streams[0].url === url && !channel.geo_de_only, `${name} welocal tek yayın değil`);
  }
  for (const [, url] of DELETES) {
    must(!urls.has(url), `silinen URL duruyor: ${url}`);
  }
  const playoutAfter = [...urls].filter((url) => url.includes("iptv-playoutcenter.de")).sort();
  const removedPlayout = playoutBefore.filter((url) => !playoutAfter.includes(url));
  must(removedPlayout.join("\n") === DELETES.map((row) => row[1]).sort().join("\n"), "playoutcenter kapsamı genişledi");

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 167 || radio !== 168 || channels.length !== 335) {
    throw new Error(`kanal sayısı tv=${tv} radyo=${radio} toplam ${channels.length}`);
  }
  if (stats.addedChannels !== 1 || stats.addedLinks !== 4 || stats.removedLinks !== 8 || stats.removedChannels !== 0) {
    throw new Error(`sayılar +${stats.addedLinks} -${stats.removedLinks} kanal +${stats.addedChannels}`);
  }
  if (stats.skippedDupes !== 0 || allUrls.length !== 1458) throw new Error(`link ${allUrls.length} yinelenen ${stats.skippedDupes}`);
  return stats;
}
