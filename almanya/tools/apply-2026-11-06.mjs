/**
 * 6 Kasım 2026 onayı.
 * 22 çalışan yedek mevcut kanallara eklenir. Eski primary ilk sırada kalır.
 * Yeni kanal yok, silme yok.
 * MeieTV watch ve K-TV flaky satırlarına dokunulmaz.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

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

function isWorking(status) {
  const text = String(status).trim().toLowerCase();
  return text.startsWith("200") || text.includes("ok");
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

function must(condition, message) {
  if (!condition) throw new Error(message);
}

export function applyNovember6(channels) {
  const rows = parseCsv(fs.readFileSync(path.join(SOURCES, "onay-2026-11-06.csv"), "utf8"));
  if (rows.length !== 24) throw new Error(`6 Kasım satır sayısı ${rows.length}`);

  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const backups = rows.filter((row) => row.kind === "backup");
  const watch = rows.filter((row) => row.kind === "watch");
  const other = rows.filter((row) => row.kind !== "backup" && row.kind !== "watch");
  if (other.length || backups.length !== 22 || watch.length !== 2) {
    throw new Error(`6 Kasım tür sayısı yedek ${backups.length} watch ${watch.length}`);
  }
  const watchKey = watch.map((row) => `${row.channel}\t${row.url}`).join("\n");
  const expectedWatch = [`MeieTV\t${MEIE}`, `K-TV\t${KTV_FLAKY}`].join("\n");
  if (watchKey !== expectedWatch) throw new Error("6 Kasım watch satırları onay listesiyle uyuşmuyor");

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const frozen = ["MeieTV", "K-TV"].map((name) => [
    name,
    byName.get(name).streams.map((stream) => stream.url).join("\n"),
  ]);
  const firstUrls = new Map();
  for (const row of backups) {
    const channel = byName.get(row.channel);
    if (!channel) throw new Error(`yedek kanalı yok: ${row.channel}`);
    if (!firstUrls.has(row.channel)) firstUrls.set(row.channel, channel.streams[0].url);
  }

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedWatch: 0,
    skippedDupes: 0,
  };

  for (const row of watch) {
    const channel = byName.get(row.channel);
    if (!channel || !channel.streams.some((stream) => stream.url === row.url)) {
      throw new Error(`watch adresi katalogda yok: ${row.channel}`);
    }
    stats.skippedWatch += 1;
  }

  for (const row of backups) {
    const url = row.url;
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz URL: ${url}`);
    const bad = forbiddenLeaves(url);
    if (bad.length) throw new Error(`yasak parametre: ${bad.join(",")} ${url}`);
    if (!isWorking(row.status)) throw new Error(`yedek çalışmıyor: ${row.channel}`);
    const channel = byName.get(row.channel);
    if (urls.has(url)) {
      stats.skippedDupes += 1;
      continue;
    }
    insertBeforeGeo(channel, { url, geo_de_only: false });
    urls.add(url);
    stats.addedLinks += 1;
  }

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
  for (const [name, first] of firstUrls) {
    const channel = byName.get(name);
    const at = channel.streams.findIndex((stream) => stream.url === first);
    if (channel.streams[at].geo_de_only) {
      const before = channel.streams.slice(0, at);
      must(at > 0 && before.every((stream) => !stream.geo_de_only), `${name} çalışan yedek geo linkin ardında`);
    } else {
      must(at === 0, `${name} primary yerinde değil`);
    }
  }
  const rfh = byName.get("RFH Harz");
  must(
    rfh.streams.at(-2).url.endsWith("/RFH_high/playlist.m3u8") &&
      rfh.streams.at(-1).url.endsWith("/RFH_high/index.m3u8"),
    "RFH Harz yedek sırası bozuk",
  );

  const allUrls = channels.flatMap((channel) => channel.streams.map((stream) => stream.url));
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");
  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 167 || radio !== 167 || channels.length !== 334) {
    throw new Error(`kanal sayısı tv=${tv} radyo=${radio} toplam ${channels.length}`);
  }
  if (stats.addedChannels !== 0 || stats.addedLinks !== 22 || stats.removedChannels !== 0 || stats.skippedDupes !== 0) {
    throw new Error(`sayılar +${stats.addedLinks} yinelenen ${stats.skippedDupes}`);
  }
  if (stats.skippedWatch !== 2 || allUrls.length !== 1462) {
    throw new Error(`watch ${stats.skippedWatch} link ${allUrls.length}`);
  }
  return stats;
}
