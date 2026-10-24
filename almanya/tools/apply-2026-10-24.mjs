/**
 * 24 Ekim 2026 onayı.
 * Tema, etkinlik ve 10. revizyonda kaldırılan bölgesel kanallar eklenmez.
 * Yeni kanal yalnızca iki Sorbian istasyondur.
 * sid/token/skey/userConsentV2 parametreli adresler silinir.
 * Oldie Antenne 80er adresinde bu parametreler soyulur, URL kalır.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const WELT_DEAD = "https://welt.personalstream.tv/v1/master.m3u8?ads.country=de&ads.pf=welttv";
const HR1_DEAD = "https://hlshr1.akamaized.net/hls/live/2016533/hr1/master.m3u8";
const HR1_FIRST = "https://hr-radio.ard-mcdn.de/hr/radio/hr1rm/hls/master.m3u8";
const OLDIE_DIRTY =
  "https://s7-webradio.oldie-antenne.de/oldie-antenne-80er-hits/stream/mp3?aw_0_1st.playerid=OldieAntenneWebPlayer&aw_0_1st.skey=1706378427399&aw_0_req.userConsentV2=CP5CssAP5CssAAFADBDEAlEgAAAAAAAAAAYgAAAAAAEhIAMAAQL2DQAYAAgXsIgAwABAvYVABgACBewyADAAEC9h0AGAAIF7EIAMAAQL2JQAYAAgXsUgAwABAvYA.YAAAAAAAAAAA&companionAds=false&companion_zone_alias=41%2C42%2C40%2C731%2C752%2C756%2C768";
const OLDIE_CLEAN =
  "https://s7-webradio.oldie-antenne.de/oldie-antenne-80er-hits/stream/mp3?aw_0_1st.playerid=OldieAntenneWebPlayer&companionAds=false&companion_zone_alias=41%2C42%2C40%2C731%2C752%2C756%2C768";
const KIKA_DASH = "https://kikadash.akamaized.net/dash/live/2022692/livetvkika_ww/manifest.mpd";
const WDR_WORLD_DASH = "https://wdrfsww247.akamaized.net/dash/live/2016703/wdrfs247_weltweit/dash.mpd";
const WDR_GEO_DASH = "https://wdrfs247.akamaized.net/dash/live/2016702/wdrfs247_geo/dash.mpd";
const TS_AUDIO = "https://ndr-audio.akamaized.net/hls/live/2110937/TS24/master.m3u8";
const TS_SEGLIST = "https://ndr-audio.akamaized.net/hls/live/2110937/TS24/192/seglist.m3u8";
const TS_DASH = "https://tagesschau.akamaized.net/dash/live/2020098/tagesschau/tagesschau_3/tagesschau_3.mpd";
const DW_STREAM02 =
  "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/stream02/streamPlaylist.m3u8";
const MDR_TV_DASH = "https://mdrtvsadash.akamaized.net/dash/live/2094116/mdrtvsa/dash.mpd";
const LEIPZIG_HLS = "https://mdr-radio-hls.akamaized.net/hls/live/2112890/mdr-284280-3-hls/index.m3u8";
const HALLE_HLS = "284290-2";
const WORLD_DASH = new Set([KIKA_DASH, WDR_WORLD_DASH]);

const SORBISCH = new Map([
  ["MDR SACHSEN Sorbisches Programm", "MDR Sachsen Sorbisch"],
  ["rbb24 Inforadio / Sorbisches Programm", "rbb24 Inforadio Sorbisch"],
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
  if (text.startsWith("sadece almanya") || text.includes("403") || text.includes("401")) return "geo";
  return null;
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
    if (/^(sid|token|skey)$/i.test(leaf) || /^userConsentV2$/i.test(leaf)) bad.push(key);
  }
  return bad;
}

function stripForbidden(url) {
  const queryAt = url.indexOf("?");
  if (queryAt < 0) return url;
  const kept = [];
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
    if (/^(sid|token|skey)$/i.test(leaf) || /^userConsentV2$/i.test(leaf)) continue;
    kept.push(part);
  }
  return kept.length ? `${url.slice(0, queryAt)}?${kept.join("&")}` : url.slice(0, queryAt);
}

function yeniKanalKind(kanal, durum) {
  if (SORBISCH.has(kanal)) return "sorbian";
  if (kanal.startsWith("MDR SCHLAGERWELT")) return "schlagerwelt";
  const blob = `${kanal} ${durum}`.toLowerCase();
  if (/sportschau|zdf event|wdr event|etkinlik/.test(blob)) return "event";
  if (/^bayern 1 /i.test(kanal) || /^swr\s*4/i.test(kanal)) return "regional";
  return "theme";
}

function skipLink(row) {
  const durum = row.durum.toLowerCase();
  const url = row.link;
  if (durum.includes("etkinlik")) return "event";
  if (url.includes(HALLE_HLS)) return "regional";
  if (url.includes("/cosmo/trap") || url.includes("rolandkaiser")) return "theme";
  if (row.kanal === "Radio 7" && url.includes("100komma7")) return "wrong";
  return null;
}

function targetName(kanal, url) {
  if (kanal === "MDR Sachsen-Anhalt" && url.includes("mdrtvsa")) return "MDR Fernsehen Sachsen-Anhalt";
  return kanal;
}

function isWorldDash(url) {
  return WORLD_DASH.has(url);
}

function streamIsGeo(url, status) {
  if (isWorldDash(url)) return false;
  if (/\.mpd(?:$|\?)/i.test(url)) return true;
  if (url.includes("wdrfs247_geo")) return true;
  return status === "geo";
}

function insertStream(channel, stream) {
  if (isWorldDash(stream.url)) {
    const hlsAt = channel.streams.findIndex(
      (item) => !item.geo_de_only && /\.m3u8(?:$|\?)/i.test(item.url),
    );
    if (hlsAt >= 0) {
      channel.streams.splice(hlsAt + 1, 0, stream);
      return;
    }
  }
  if (stream.geo_de_only) {
    channel.streams.push(stream);
    return;
  }
  const geoAt = channel.streams.findIndex((item) => item.geo_de_only);
  if (geoAt < 0) channel.streams.push(stream);
  else channel.streams.splice(geoAt, 0, stream);
}

function deleteExact(channels, urls, url) {
  let removed = 0;
  for (const channel of channels) {
    const before = channel.streams.length;
    channel.streams = channel.streams.filter((stream) => stream.url !== url);
    const delta = before - channel.streams.length;
    if (delta && channel.streams.length === 0) {
      throw new Error(`akışsız kanal: ${channel.name}`);
    }
    removed += delta;
  }
  if (removed !== 1) throw new Error(`silinecek URL ${removed} kez bulundu: ${url}`);
  urls.delete(url);
}

function ensureChannel(channels, byName, name) {
  let channel = byName.get(name);
  if (channel) return { channel, created: false };
  channel = {
    name,
    type: "radio",
    category: "public",
    geo_de_only: false,
    streams: [],
    groups: [],
  };
  channels.push(channel);
  byName.set(name, channel);
  return { channel, created: true };
}

export function applyOctober24Batch(channels) {
  const csvPath = path.join(SOURCES, "onay-2026-10-24.csv");
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  if (rows.length !== 242) throw new Error(`24 Ekim satır sayısı ${rows.length}`);

  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (urls.has(stream.url)) throw new Error(`başlangıçta yinelenen URL: ${stream.url}`);
      urls.add(stream.url);
    }
  }

  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    replacedLinks: 0,
    skippedDupes: 0,
    skippedThemes: 0,
    skippedEvents: 0,
    skippedRegional: 0,
    skippedWrong: 0,
    skippedKanal: 0,
    geoDash: 0,
    worldDash: 0,
    seglist: 0,
    addedChannelNames: [],
  };

  const oldie = byName.get("Oldie Antenne");
  if (!oldie) throw new Error("Oldie Antenne yok");
  const dirty = oldie.streams.find((stream) => stream.url === OLDIE_DIRTY);
  if (!dirty) throw new Error("Oldie Antenne 80er parametreli adres yok");
  const cleaned = stripForbidden(dirty.url);
  if (cleaned !== OLDIE_CLEAN) throw new Error(`Oldie temiz URL beklenenden farklı: ${cleaned}`);
  if (urls.has(cleaned)) {
    oldie.streams = oldie.streams.filter((stream) => stream.url !== OLDIE_DIRTY);
    urls.delete(OLDIE_DIRTY);
    stats.removedLinks += 1;
  } else {
    dirty.url = cleaned;
    urls.delete(OLDIE_DIRTY);
    urls.add(cleaned);
    stats.replacedLinks += 1;
  }

  const doomed = [];
  for (const channel of channels) {
    for (const stream of channel.streams) {
      if (forbiddenLeaves(stream.url).length) doomed.push(stream.url);
    }
  }
  for (const url of doomed) {
    deleteExact(channels, urls, url);
    stats.removedLinks += 1;
  }
  for (const url of [WELT_DEAD, HR1_DEAD]) {
    deleteExact(channels, urls, url);
    stats.removedLinks += 1;
  }

  const csvUrls = new Set();
  for (const row of rows) {
    const tip = row.tip;
    const url = row.link;
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz URL: ${url}`);
    csvUrls.add(url);

    if (tip === "olu_mevcut") continue;

    if (tip === "yeni_kanal") {
      const kind = yeniKanalKind(row.kanal, row.durum);
      if (kind === "event") {
        stats.skippedEvents += 1;
        continue;
      }
      if (kind === "regional") {
        stats.skippedRegional += 1;
        continue;
      }
      if (kind === "theme") {
        stats.skippedThemes += 1;
        continue;
      }
      const status = approvalStatus(row.durum);
      if (!status) throw new Error(`durum okunamadı: ${row.kanal}`);
      const name = kind === "sorbian" ? SORBISCH.get(row.kanal) : "MDR Schlagerwelt";
      const { channel, created } =
        kind === "sorbian" ? ensureChannel(channels, byName, name) : { channel: byName.get(name), created: false };
      if (!channel) throw new Error(`kanal yok: ${name}`);
      if (created) {
        stats.addedChannels += 1;
        stats.addedChannelNames.push(name);
      }
      if (urls.has(url)) {
        stats.skippedDupes += 1;
        continue;
      }
      insertStream(channel, { url, geo_de_only: streamIsGeo(url, status) });
      urls.add(url);
      stats.addedLinks += 1;
      continue;
    }

    if (tip !== "yeni_link") throw new Error(`bilinmeyen tip: ${tip}`);
    const skip = skipLink(row);
    if (skip === "event") {
      stats.skippedEvents += 1;
      continue;
    }
    if (skip === "regional") {
      stats.skippedRegional += 1;
      continue;
    }
    if (skip === "theme") {
      stats.skippedThemes += 1;
      continue;
    }
    if (skip === "wrong") {
      stats.skippedWrong += 1;
      continue;
    }
    const status = approvalStatus(row.durum);
    if (!status) throw new Error(`durum okunamadı: ${row.kanal} ${url}`);
    const name = targetName(row.kanal, url);
    const channel = byName.get(name);
    if (!channel) throw new Error(`yeni linkin kanalı yok: ${name}`);
    if (urls.has(url)) {
      stats.skippedDupes += 1;
      continue;
    }
    const geo = streamIsGeo(url, status);
    insertStream(channel, { url, geo_de_only: geo });
    urls.add(url);
    stats.addedLinks += 1;
    if (isWorldDash(url)) stats.worldDash += 1;
    else if (/\.mpd(?:$|\?)/i.test(url)) stats.geoDash += 1;
    if (url.includes("/seglist.m3u8")) stats.seglist += 1;
  }

  for (const channel of channels) {
    if (!channel.streams.length) throw new Error(`akışsız kanal: ${channel.name}`);
    channel.geo_de_only = channel.streams.every((stream) => stream.geo_de_only);
    const seen = new Set();
    let seenGeo = false;
    for (const stream of channel.streams) {
      if (seen.has(stream.url)) throw new Error(`kanal içinde yinelenen URL: ${channel.name}`);
      seen.add(stream.url);
      if (forbiddenLeaves(stream.url).length) {
        throw new Error(`yasak parametre kaldı: ${channel.name} ${stream.url}`);
      }
      if (stream.geo_de_only) seenGeo = true;
      else if (seenGeo) throw new Error(`çalışan link geo yedeğinden sonra: ${channel.name}`);
    }
  }

  const hr1 = byName.get("HR 1");
  if (hr1.streams[0].url !== HR1_FIRST) throw new Error("HR 1 ilk adres hr1rm değil");
  if (hr1.streams.some((stream) => stream.url.includes("hlshr1.akamaized.net"))) {
    throw new Error("HR 1 hlshr1 duruyor");
  }
  const welt = byName.get("Welt");
  if (welt.streams.some((stream) => stream.url.includes("welt.personalstream.tv/v1/"))) {
    throw new Error("Welt personalstream duruyor");
  }
  const kika = byName.get("KIKA");
  if (kika.streams[1].url !== KIKA_DASH || kika.streams[1].geo_de_only) {
    throw new Error("KIKA dünya DASH ilk HLS'in ardında değil");
  }
  const wdr = byName.get("WDR Fernsehen Köln");
  const wdrHls = wdr.streams.findIndex((stream) => !stream.geo_de_only && stream.url.includes(".m3u8"));
  if (wdr.streams[wdrHls + 1]?.url !== WDR_WORLD_DASH || wdr.streams[wdrHls + 1].geo_de_only) {
    throw new Error("WDR dünya DASH ilk HLS'in ardında değil");
  }
  const wdrGeo = wdr.streams[wdr.streams.length - 1];
  if (wdrGeo.url !== WDR_GEO_DASH || !wdrGeo.geo_de_only) {
    throw new Error("WDR geo DASH sonda değil");
  }
  const tagesschau = byName.get("Tagesschau 24");
  const firstGeo = tagesschau.streams.findIndex((stream) => stream.geo_de_only);
  const audioAt = tagesschau.streams.findIndex((stream) => stream.url === TS_AUDIO);
  const segAt = tagesschau.streams.findIndex((stream) => stream.url === TS_SEGLIST);
  if (audioAt < 0 || segAt < 0 || audioAt >= firstGeo || segAt >= firstGeo) {
    throw new Error("Tagesschau 24 ses HLS geo bölümünden önce değil");
  }
  const tsDash = tagesschau.streams.find((stream) => stream.url === TS_DASH);
  if (!tsDash?.geo_de_only) throw new Error("Tagesschau 24 DASH geo değil");
  const dw = byName.get("Deutsche Welle");
  if (!dw.streams.some((stream) => stream.url === DW_STREAM02 && !stream.geo_de_only)) {
    throw new Error("DW English stream02 yok");
  }
  const mdrTv = byName.get("MDR Fernsehen Sachsen-Anhalt");
  const mdrRadio = byName.get("MDR Sachsen-Anhalt");
  if (!mdrTv.streams.some((stream) => stream.url === MDR_TV_DASH && stream.geo_de_only)) {
    throw new Error("MDR TV DASH televizyon kanalında değil");
  }
  if (mdrRadio.streams.some((stream) => stream.url.includes("mdrtvsa") || stream.url.includes(HALLE_HLS))) {
    throw new Error("MDR Sachsen-Anhalt radyosuna TV veya Halle adresi yazıldı");
  }
  const sachsen = byName.get("MDR Sachsen");
  if (!sachsen.streams.some((stream) => stream.url === LEIPZIG_HLS)) {
    throw new Error("MDR Sachsen Leipzig HLS yok");
  }
  for (const name of ["MDR Sachsen Sorbisch", "rbb24 Inforadio Sorbisch"]) {
    const channel = byName.get(name);
    if (!channel || channel.type !== "radio" || channel.streams.length !== 2) {
      throw new Error(`Sorbian kanal eksik: ${name}`);
    }
  }
  if (channels.some((channel) => /RADIO BOB!|Radio Köln 80er|1LIVE Dance|SWR2 Archivradio|Unser Ding|Inselradio|Campusradio Bonn|^ZDF Event|^ARD Sportschau|WDR Event 11|SWR4 Freiburg|Bayern 1 Franken/.test(channel.name))) {
    throw new Error("atlanması gereken kanal katalogda");
  }
  if (channels.some((channel) => channel.name === "nice")) throw new Error("nice kanalı eklendi");

  const allUrls = [];
  for (const channel of channels) {
    for (const stream of channel.streams) allUrls.push(stream.url);
  }
  if (new Set(allUrls).size !== allUrls.length) throw new Error("katalogda yinelenen URL var");
  const usid = allUrls.some((url) => /(?:^|[?&])usid=/.test(url));
  if (!usid) throw new Error("usid parametresi yanlışlıkla silindi");
  if (allUrls.some((url) => /(?:^|[?&])sid=/.test(url) || /(?:^|[?&])token=/.test(url) || /skey=/.test(url) || /userConsentV2/.test(url))) {
    throw new Error("yasak parametre katalogda kaldı");
  }

  const tv = channels.filter((channel) => channel.type === "tv").length;
  const radio = channels.filter((channel) => channel.type === "radio").length;
  if (tv !== 156 || radio !== 167) throw new Error(`kanal sayısı tv=${tv} radyo=${radio}`);
  if (stats.addedChannels !== 2) throw new Error(`eklenen kanal ${stats.addedChannels}`);
  if (stats.addedLinks !== 83) throw new Error(`eklenen link ${stats.addedLinks}, yinelenen ${stats.skippedDupes}`);
  if (stats.removedLinks !== 8) throw new Error(`silinen link ${stats.removedLinks}`);
  if (stats.replacedLinks !== 1) throw new Error(`temizlenen link ${stats.replacedLinks}`);
  if (stats.skippedDupes !== 0) throw new Error(`yinelenen link ${stats.skippedDupes}`);
  if (stats.skippedThemes !== 110) throw new Error(`tema atlanan ${stats.skippedThemes}`);
  if (stats.skippedEvents !== 19) throw new Error(`etkinlik atlanan ${stats.skippedEvents}`);
  if (stats.skippedRegional !== 21) throw new Error(`bölgesel atlanan ${stats.skippedRegional}`);
  if (stats.skippedWrong !== 1) throw new Error(`yanlış istasyon ${stats.skippedWrong}`);
  if (stats.geoDash !== 17 || stats.worldDash !== 2 || stats.seglist !== 27) {
    throw new Error(`DASH/seglist geo=${stats.geoDash} dünya=${stats.worldDash} seglist=${stats.seglist}`);
  }
  if (allUrls.length !== 1111) throw new Error(`link sayısı ${allUrls.length}`);
  if (csvUrls.size < 200) throw new Error("onay CSV'si eksik");

  return stats;
}
