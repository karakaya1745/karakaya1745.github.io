#!/usr/bin/env node
/**
 * ZapIt TV — Almanya katalog üretici.
 *
 * Yalnızca almanya/ altına yazar. Türkçe Canlı TV TR kataloğuna
 * (kök channels.json, stream_map.json, metadata.json) dokunmaz.
 *
 *   node almanya/tools/build.mjs           # channels.json, metadata.json, m3u
 *   node almanya/tools/build.mjs --check   # yazmadan tutarlılık kontrolü
 *   node almanya/tools/build.mjs --bump    # içerik aynı olsa da revision + 1
 *
 * Girdi: almanya/sources/{tv,radio}.{csv,m3u}
 *        almanya/sources/onay-2026-10-15.csv (onaylı ekler; etkinlik yayınları atlanır)
 *        almanya/sources/onay-2026-10-16.csv (yedekler, Kanal Avrupa, ffn, ölü int linkler)
 *        almanya/sources/onay-2026-10-18.csv (18 Ekim onayı)
 *        almanya/sources/catalog-retest-2026-10-18.json (ölü, statik, şüpheli yeniden test)
 *        almanya/sources/onay-2026-10-19.csv (19 Ekim onayı; Sonnenklar TV hariç)
 * Ölü (failed) ve denenmemiş (untested) linkler yayınlanmaz.
 * geo-blocked (403) ve "sadece Almanya" linkler kalır; geo_de_only ile işaretlenir.
 * Katalogda olan URL yeniden eklenmez. Yeni link uydurulmaz.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyOctober18, orderCatalog, FINAL_CATEGORY_ORDER } from "./apply-2026-10-18.mjs";
import { applyOctober19 } from "./apply-2026-10-19.mjs";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const CATEGORY_ORDER = [
  "public",
  "regional",
  "news",
  "culture",
  "music",
  "kids",
  "religious",
  "shopping",
  "documentary",
  "lifestyle",
  "entertainment",
  "international",
  "other",
];

const ALLOWED_CATEGORIES = new Set(CATEGORY_ORDER);

/** Onay dosyasındaki etkinlik beslemeleri. Mevcut radyo "WDR Event" bu listeye girmez. */
const EVENT_FEED = /^(?:ARD Event|ARTE Event|BR Event|rbb Event|SWR Event|ZDF Event|WDR Event)(?:\s|$)/i;
const MDR_PLUS_FEED = /^MDR\+/;

/** İsimden çıkarılan sabit kategori. Yeni kanal eklenince buraya yazılır. */
const TV_CATEGORY = {
  "123 Live TV": "shopping",
  "3sat": "public",
  "Anixe +": "entertainment",
  "Anixe HD Serie": "entertainment",
  "ARD Alpha": "public",
  "Aristo TV": "entertainment",
  "ARTE Deutsch": "public",
  "Augsburg TV": "regional",
  "Baden TV": "regional",
  "Bayerisches Fernsehen Nord": "regional",
  "Bayerisches Fernsehen Süd": "regional",
  "Bibel TV": "religious",
  "Bibel TV Musik": "religious",
  "Das Erste": "public",
  "Deutsche Welle": "public",
  "Deutsche Welle+": "public",
  "DW Deutsch": "public",
  "DW Deutsch+": "public",
  "Deluxe Dance by Kontor": "music",
  "Deluxe Music": "music",
  "Deluxe Rap": "music",
  DF1: "entertainment",
  DMF: "music",
  Dokusat: "documentary",
  "EWTN auf Deutsch": "religious",
  "Franken Fernsehen": "regional",
  "Franken Plus": "regional",
  "h-eins.tv": "regional",
  "Hope TV Deutsch": "religious",
  "HR Fernsehen": "regional",
  HSE: "shopping",
  "HSE Extra": "shopping",
  "HSE Trend": "shopping",
  Höhenrausch: "music",
  "Just Cooking": "lifestyle",
  "Just Fishing": "lifestyle",
  Juwelo: "shopping",
  "Kanal Avrupa": "international",
  "K-TV": "religious",
  KIKA: "kids",
  "L TV": "regional",
  "Lilo TV": "kids",
  "MDR Fernsehen Sachsen": "regional",
  "MDR Fernsehen Sachsen-Anhalt": "regional",
  "MDR Fernsehen Thüringen": "regional",
  "Melodie TV": "music",
  "München TV": "regional",
  "N24 Doku": "documentary",
  "NDR Fernsehen Hamburg": "regional",
  "NDR Fernsehen Mecklenburg-Vorpommern": "regional",
  "NDR Fernsehen Niedersachsen": "regional",
  "NDR Fernsehen Schleswig-Holstein": "regional",
  "Niederbayern TV Satellit": "regional",
  One: "public",
  "One Terra": "documentary",
  OTVA: "regional",
  Phoenix: "public",
  "QVC Deutschland": "shopping",
  "QVC Style Deutschland": "shopping",
  "QVC Zwei": "shopping",
  "Radio Bremen Fernsehen": "regional",
  "RBB Berlin": "regional",
  "RBB Brandenburg": "regional",
  "Regio TV Satellit": "regional",
  RiC: "kids",
  "Sachsen Eins": "regional",
  "Sender Neu Jerusalem": "religious",
  "Shop LC Deutschland": "shopping",
  "SR Fernsehen": "regional",
  "Stimmungsgarten TV": "music",
  "SWR Fernsehen Baden-Württemberg": "regional",
  "SWR Fernsehen Rheinland-Pfalz": "regional",
  "Tagesschau 24": "news",
  Telegold: "shopping",
  "TV Ingolstadt": "regional",
  "Volksmusik TV": "music",
  "WDR Fernsehen Köln": "regional",
  "WDR Studio Köln": "regional",
  "WDR Studio Aachen": "regional",
  "WDR Studio Bielefeld": "regional",
  "WDR Studio Bonn": "regional",
  "WDR Studio Dortmund": "regional",
  "WDR Studio Duisburg": "regional",
  "WDR Studio Düsseldorf": "regional",
  "WDR Studio Essen": "regional",
  "WDR Studio Münster": "regional",
  "WDR Studio Siegen": "regional",
  "WDR Studio Wuppertal": "regional",
  Welt: "news",
  Xplore: "documentary",
  ZDF: "public",
  "ZDF Info": "news",
  "ZDF Neo": "public",
};

const RADIO_CATEGORY = {
  "0nlineradio 70s": "music",
  "100'5 Alemannia": "music",
  "100'5 DAS HITRADIO": "music",
  "104.6 RTL": "music",
  "Absolut Radio": "music",
  "Absolut relax": "music",
  "Antenne 1": "regional",
  "Antenne Brandenburg": "regional",
  "Antenne Bayern": "regional",
  "Antenne MV": "regional",
  "Antenne Niedersachsen": "regional",
  "Bayern 1 Mainfranken": "regional",
  "Bayern 1 Oberbayern": "regional",
  "Bayern 2": "culture",
  "Bayern 3": "music",
  "Berliner Rundfunk 91.4": "music",
  "BR 24": "news",
  "BR Heimat": "music",
  "BR Klassik": "music",
  "BR Schlager": "music",
  "Bremen Eins": "regional",
  "Campusradio Ilmenau": "regional",
  "Campusradio Köln (Kölncampus)": "regional",
  "Campusradio Mannheim (Radioaktiv)": "regional",
  "Campusradio Münster (Radio Q)": "regional",
  "Campusradio Regensburg (Studentenfunk)": "regional",
  "Campusradio Universität Duisburg-Essen (CampusFM)": "regional",
  "Bremen Next": "music",
  "Bremen Vier": "music",
  "Bremen Zwei": "culture",
  Cosmo: "music",
  "DELUXE EASY": "music",
  "DELUXE LOUNGE RADIO": "music",
  "DELUXE MUSIC RADIO": "music",
  "delta radio": "music",
  "domradio.de": "religious",
  "DONAU 3 FM": "regional",
  "ERF Jess": "religious",
  "ERF Plus": "religious",
  Deutschlandfunk: "public",
  "Deutschlandfunk Kultur": "culture",
  "Deutschlandfunk Nova": "public",
  "Dokumente und Debatten": "news",
  ENERGY: "music",
  FFN: "regional",
  "ffn 80er": "regional",
  "radio ffn": "regional",
  "Hit Radio FFH": "music",
  "JAM FM Black Label": "music",
  "Hitradio Ohr": "music",
  "HR 1": "regional",
  "HR 2 Kultur": "culture",
  "HR 3": "music",
  "HR 4": "music",
  "HR Dasding": "music",
  "HR Info": "news",
  "KISS FM": "music",
  "Klassik Radio": "music",
  "MDR Aktuell": "news",
  "MDR Jump": "music",
  "MDR Klassik": "music",
  "MDR Kultur": "culture",
  "MDR Sachsen": "regional",
  "MDR Sachsen-Anhalt": "regional",
  "MDR Sputnik": "music",
  "MDR Thüringen Mitte/West": "regional",
  "N-Joy": "music",
  "NDR 1 Niedersachsen Hannover": "regional",
  "NDR 1 Radio MV Schwerin": "regional",
  "NDR 1 Welle Nord Kiel": "regional",
  "NDR 2": "music",
  "NDR 90.3": "regional",
  "NDR Blue": "music",
  "NDR Info Niedersachsen": "news",
  "NDR Info Spezial": "news",
  "NDR Kultur": "culture",
  "NDR Schlager": "music",
  "Oldie Antenne": "music",
  Ostseewelle: "regional",
  "R.SH": "regional",
  "Radio 21": "music",
  "Radio 7": "regional",
  "Radio Arabella": "music",
  "Radio Bob": "music",
  "Radio Brocken": "regional",
  "Radio Gong 96.3": "music",
  "Radio Hamburg": "regional",
  "Radio HBR": "regional",
  "Radio Paloma": "music",
  "Radio PSR": "music",
  "Radio Regenbogen": "music",
  "Radio SAW": "regional",
  "Radio Teddy": "kids",
  "RBB 24 Inforadio": "news",
  "RBB 88.8": "regional",
  "RBB Fritz": "music",
  "RBB Radio 3": "culture",
  "RBB Radio Eins": "regional",
  "Rock Antenne": "music",
  RPR1: "regional",
  "Schlager Radio": "music",
  Schlagerparadies: "music",
  "SR 1": "regional",
  "SR 3 Saarlandwelle": "regional",
  "SR Kultur": "culture",
  "Star FM": "music",
  "Sunshine Live": "music",
  "SWR 1 Baden-Württemberg": "regional",
  "SWR 1 Rheinland-Pfalz": "regional",
  "SWR 3": "music",
  "SWR 4 Mainz": "regional",
  "SWR 4 Stuttgart": "regional",
  "SWR Aktuell": "news",
  "SWR Dasding": "music",
  "SWR Kultur": "culture",
  SWR4: "regional",
  "Toggo Radio": "kids",
  "WDR 1 Live": "music",
  "WDR 1 Live Diggi": "music",
  "WDR 2 Rhein und Ruhr": "regional",
  "WDR 3": "culture",
  "WDR 4": "music",
  "WDR 5": "culture",
  "WDR Die Maus": "kids",
  "WDR Event": "public",
  bigFM: "music",
  "YOU FM (mp3/high)": "music",
};

function assertInside(file) {
  const resolved = path.resolve(file);
  if (resolved !== DIR && !resolved.startsWith(`${DIR}${path.sep}`)) {
    throw new Error(`almanya/ dışına yazma reddedildi: ${resolved}`);
  }
}

function readText(file) {
  assertInside(file);
  return fs.readFileSync(file, "utf8");
}

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
      throw new Error(`CSV sütun sayısı uyuşmuyor (satır ${index + 2}): ${cols.join("|")}`);
    }
    const record = {};
    header.forEach((key, column) => {
      record[key] = cols[column];
    });
    return record;
  });
}

function parseM3uGroups(text) {
  const lines = text.split(/\r?\n/);
  const byUrl = new Map();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF")) continue;
    const group = /group-title="([^"]*)"/.exec(line)?.[1] ?? "";
    const url = (lines[i + 1] ?? "").trim();
    if (!url || url.startsWith("#")) continue;
    if (!byUrl.has(url)) byUrl.set(url, group);
  }
  return byUrl;
}

function isWorking(status) {
  return String(status).toLowerCase().startsWith("working");
}

function isGeo(status) {
  return String(status).toLowerCase().startsWith("geo-blocked");
}

function isKept(status) {
  return isWorking(status) || isGeo(status);
}

function slugify(name) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/ç/g, "c")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`boş id: ${name}`);
  return slug;
}

function defaultGroup(type, geo) {
  if (type === "tv") return geo ? "Geo-blocked (DE)" : "Working";
  return "Other DE radio";
}

function buildChannels(type, rows, nameKey, categories, groupsByUrl) {
  const order = [];
  const buckets = new Map();
  rows.forEach((row, index) => {
    const name = row[nameKey];
    if (!name) throw new Error(`${type} satırında kanal adı yok`);
    if (!buckets.has(name)) {
      buckets.set(name, []);
      order.push(name);
    }
    buckets.get(name).push({ ...row, index });
  });

  const channels = [];
  const dropped = [];
  let missingGroup = 0;

  for (const name of order) {
    const kept = buckets.get(name).filter((row) => isKept(row.status));
    if (!kept.length) {
      dropped.push(name);
      continue;
    }
    kept.sort((a, b) => {
      const rank = (row) => (isWorking(row.status) ? 0 : 1);
      const byStatus = rank(a) - rank(b);
      if (byStatus !== 0) return byStatus;
      return a.index - b.index;
    });

    const category = categories[name];
    if (!category || !ALLOWED_CATEGORIES.has(category)) {
      throw new Error(`kategori yok veya geçersiz: ${type} "${name}"`);
    }

    const seen = new Set();
    const streams = [];
    const groups = [];
    for (const row of kept) {
      if (!/^https:\/\/\S+$/.test(row.url)) {
        throw new Error(`geçersiz URL (${name}): ${row.url}`);
      }
      if (seen.has(row.url)) continue;
      seen.add(row.url);
      const geo = isGeo(row.status);
      const group = groupsByUrl.get(row.url);
      if (!group) missingGroup += 1;
      streams.push({ url: row.url, geo_de_only: geo });
      groups.push(group || defaultGroup(type, geo));
    }

    const geoOnly = streams.every((stream) => stream.geo_de_only);
    channels.push({
      id: `${type}-${slugify(name)}`,
      name,
      type,
      category,
      geo_de_only: geoOnly,
      streams,
      groups,
    });
  }

  return { channels, dropped, missingGroup };
}

function renderM3u(comment, channels) {
  const lines = ["#EXTM3U", `# ${comment}`];
  for (const channel of channels) {
    const group = channel.category.replaceAll('"', "'");
    channel.streams.forEach((stream, index) => {
      const label = `${channel.name} (${index + 1})`;
      lines.push(
        `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}" group-title="${group}",${label}`,
      );
      lines.push(stream.url);
    });
  }
  return `${lines.join("\n")}\n`;
}

function isEventFeed(name) {
  return EVENT_FEED.test(name) || MDR_PLUS_FEED.test(name);
}

function approvalStatus(durum) {
  if (isWorking(durum)) return "working";
  if (/^sadece almanya\b/i.test(String(durum))) return "geo-blocked (403)";
  return null;
}

function mergeApproval(channels) {
  const file = path.join(SOURCES, "onay-2026-10-15.csv");
  const stats = { addedChannels: 0, addedLinks: 0, skippedEvents: 0, skippedDupes: 0 };
  if (!fs.existsSync(file)) return stats;

  const rows = parseCsv(readText(file));
  const byKey = new Map(channels.map((channel) => [`${channel.type}\0${channel.name}`, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) urls.add(stream.url);
  }

  let ordinal = 1_000_000;
  for (const row of rows) {
    const name = row.kanal?.trim();
    const url = row.link?.trim();
    if (!name || !url) throw new Error("onay satırında kanal veya link yok");
    if (isEventFeed(name)) {
      stats.skippedEvents += 1;
      continue;
    }
    const type = row.tur === "radyo" ? "radio" : "tv";
    const status = approvalStatus(row.durum);
    if (!status) throw new Error(`bilinmeyen onay durumu (${name}): ${row.durum}`);
    if (urls.has(url)) {
      stats.skippedDupes += 1;
      continue;
    }
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz onay URL (${name}): ${url}`);

    const key = `${type}\0${name}`;
    let channel = byKey.get(key);
    if (!channel) {
      const categories = type === "tv" ? TV_CATEGORY : RADIO_CATEGORY;
      const category = categories[name];
      if (!category || !ALLOWED_CATEGORIES.has(category)) {
        throw new Error(`kategori yok veya geçersiz: ${type} "${name}"`);
      }
      channel = {
        id: "",
        name,
        type,
        category,
        geo_de_only: false,
        streams: [],
        groups: [],
      };
      channels.push(channel);
      byKey.set(key, channel);
      stats.addedChannels += 1;
    }

    channel.streams.push({
      url,
      geo_de_only: isGeo(status),
      _ord: ordinal,
    });
    ordinal += 1;
    urls.add(url);
    stats.addedLinks += 1;
  }

  for (const channel of channels) sortChannelStreams(channel);

  return stats;
}

function sortChannelStreams(channel) {
  channel.streams.forEach((stream, index) => {
    if (stream._ord == null) stream._ord = index;
  });
  channel.streams.sort((a, b) => {
    const byGeo = Number(a.geo_de_only) - Number(b.geo_de_only);
    if (byGeo !== 0) return byGeo;
    return a._ord - b._ord;
  });
  for (const stream of channel.streams) delete stream._ord;
  channel.geo_de_only = channel.streams.every((stream) => stream.geo_de_only);
  channel.groups = channel.streams.map(() => channel.category);
}

/** Katalog adı değişir; id önceki addan korunur (assignIds). */
const RENAMES = [{ type: "radio", from: "FFN", to: "ffn 80er" }];

function applyRenames(channels) {
  for (const rename of RENAMES) {
    const channel = channels.find((item) => item.type === rename.type && item.name === rename.from);
    if (!channel) throw new Error(`yeniden adlandırılacak kanal yok: ${rename.from}`);
    channel.previousName = channel.name;
    channel.name = rename.to;
  }
}

const ONAY_16_NAME = {
  "FFN (radio ffn ana yayın)": "radio ffn",
};

/** Daha yüksek kalite olduğu için mevcut çalışan linklerin önüne alınır. */
const PREPEND_URLS = new Set([
  "https://st01.sslstream.dlf.de/dlf/01/high/aac/stream.aac?aggregator=web",
]);

const REMOVE_TURS = new Set(["olu_mevcut_link", "olu_mevcut_link_supheli"]);

function applyOnay20261016(channels) {
  const file = path.join(SOURCES, "onay-2026-10-16.csv");
  const stats = { addedChannels: 0, addedLinks: 0, removedLinks: 0 };
  if (!fs.existsSync(file)) return stats;

  const rows = parseCsv(readText(file));
  const byKey = new Map(channels.map((channel) => [`${channel.type}\0${channel.name}`, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) urls.add(stream.url);
  }

  let ordinal = 2_000_000;
  for (const row of rows) {
    const rawName = row.kanal?.trim();
    const url = row.link?.trim();
    const tur = row.tur?.trim();
    if (!rawName || !url || !tur) throw new Error("onay-2026-10-16 satırı eksik");
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz onay URL (${rawName}): ${url}`);

    if (REMOVE_TURS.has(tur)) {
      const channel = byKey.get(`tv\0${rawName}`) || byKey.get(`radio\0${rawName}`);
      if (!channel) throw new Error(`silinecek kanal yok: ${rawName}`);
      const before = channel.streams.length;
      channel.streams = channel.streams.filter((stream) => stream.url !== url);
      if (channel.streams.length !== before - 1) {
        throw new Error(`silinecek link bulunamadı (${rawName}): ${url}`);
      }
      urls.delete(url);
      stats.removedLinks += 1;
      continue;
    }

    const name = ONAY_16_NAME[rawName] || rawName;
    const type = tur.startsWith("radyo") ? "radio" : "tv";
    const status = approvalStatus(row.durum);
    if (!status) throw new Error(`bilinmeyen onay durumu (${rawName}): ${row.durum}`);
    if (urls.has(url)) {
      throw new Error(`onay linki zaten katalogda (${name}): ${url}`);
    }

    const key = `${type}\0${name}`;
    let channel = byKey.get(key);
    if (!channel) {
      const categories = type === "tv" ? TV_CATEGORY : RADIO_CATEGORY;
      const category = categories[name];
      if (!category || !ALLOWED_CATEGORIES.has(category)) {
        throw new Error(`kategori yok veya geçersiz: ${type} "${name}"`);
      }
      channel = {
        id: "",
        name,
        type,
        category,
        geo_de_only: false,
        streams: [],
        groups: [],
      };
      channels.push(channel);
      byKey.set(key, channel);
      stats.addedChannels += 1;
    }

    channel.streams.push({
      url,
      geo_de_only: isGeo(status),
      _ord: PREPEND_URLS.has(url) ? -1 : ordinal,
    });
    ordinal += 1;
    urls.add(url);
    stats.addedLinks += 1;
  }

  for (const channel of channels) sortChannelStreams(channel);
  return stats;
}

function assignIds(channels, previousChannels) {
  const previous = new Map();
  for (const channel of previousChannels || []) {
    previous.set(`${channel.type}\0${channel.name}`, channel.id);
  }
  const used = new Set();
  for (const channel of channels) {
    const key = `${channel.type}\0${channel.name}`;
    const previousKey = channel.previousName ? `${channel.type}\0${channel.previousName}` : "";
    let id = previous.get(key) || (previousKey ? previous.get(previousKey) : "");
    if (!id) {
      const plus = /\+\s*$/.test(channel.name);
      const stem = plus ? channel.name.replace(/\+\s*$/, "") : channel.name;
      id = `${channel.type}-${slugify(stem)}${plus ? "-plus" : ""}`;
    }
    if (used.has(id)) throw new Error(`id çakışması: ${channel.name} -> ${id}`);
    channel.id = id;
    used.add(id);
  }
}

function assertGrouped(channels) {
  const rank = new Map(FINAL_CATEGORY_ORDER.map((category, index) => [category, index]));
  let lastType = "";
  let lastRank = -1;
  for (const channel of channels) {
    if (channel.type !== lastType) {
      if (lastType === "radio") throw new Error(`tür sırası bozuldu: ${channel.name}`);
      lastType = channel.type;
      lastRank = -1;
    }
    const categoryRank = rank.get(channel.category);
    if (categoryRank == null || categoryRank < lastRank) {
      throw new Error(`kategori sırası bozuldu: ${channel.name}`);
    }
    lastRank = categoryRank;
    if (isEventFeed(channel.name) && !(channel.type === "radio" && channel.name === "WDR Event")) {
      throw new Error(`etkinlik kanalı katalogda: ${channel.name}`);
    }
  }
}

function streamFormat(url) {
  const path = url.split("?")[0].split("#")[0].toLowerCase();
  if (path.endsWith(".mpd")) return "dash";
  if (path.endsWith(".m3u8")) return "hls";
  if (path.endsWith(".mp3")) return "mp3";
  if (path.endsWith(".aac")) return "aac";
  if (path.endsWith(".opus")) return "opus";
  return "audio";
}

function publicChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    category: channel.category,
    geo_de_only: channel.geo_de_only,
    streams: channel.streams.map((stream) => ({
      url: stream.url,
      geo_de_only: stream.geo_de_only,
      format: streamFormat(stream.url),
    })),
  };
}

function signature(channels) {
  return JSON.stringify(channels.map(publicChannel));
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(readText(file));
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function writeIfChanged(file, text) {
  assertInside(file);
  const prev = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const next = Buffer.from(text);
  if (prev && prev.equals(next)) return false;
  fs.writeFileSync(file, next);
  return true;
}

function assertInvariants(tv, radio) {
  const all = [...tv, ...radio];
  const ids = new Set();
  let tvStreams = 0;
  let radioStreams = 0;
  for (const channel of all) {
    if (ids.has(channel.id)) throw new Error(`yinelenen id: ${channel.id}`);
    ids.add(channel.id);
    if (!channel.streams.length) throw new Error(`akışsız kanal: ${channel.name}`);
    const geoOnly = channel.streams.every((stream) => stream.geo_de_only);
    if (channel.geo_de_only !== geoOnly) {
      throw new Error(`geo_de_only uyuşmuyor: ${channel.name}`);
    }
    let seenGeo = false;
    for (const stream of channel.streams) {
      if (stream.geo_de_only) seenGeo = true;
      else if (seenGeo) {
        throw new Error(`çalışan link 403 yedeğinden sonra: ${channel.name}`);
      }
    }
    if (channel.type === "tv") tvStreams += channel.streams.length;
    else radioStreams += channel.streams.length;
  }
  if (tvStreams === 0 || radioStreams === 0) {
    throw new Error(`boş katalog: tv=${tvStreams} radyo=${radioStreams}`);
  }
}

function loadCatalog() {
  const tvRows = parseCsv(readText(path.join(SOURCES, "tv.csv")));
  const radioRows = parseCsv(readText(path.join(SOURCES, "radio.csv")));
  const tvGroups = parseM3uGroups(readText(path.join(SOURCES, "tv.m3u")));
  const radioGroups = parseM3uGroups(readText(path.join(SOURCES, "radio.m3u")));

  const tv = buildChannels("tv", tvRows, "channel", TV_CATEGORY, tvGroups);
  const radio = buildChannels("radio", radioRows, "station", RADIO_CATEGORY, radioGroups);
  const channels = [...tv.channels, ...radio.channels];
  const approval = mergeApproval(channels);
  applyRenames(channels);
  const onay16 = applyOnay20261016(channels);
  const onay18 = applyOctober18(channels);
  const onay19 = applyOctober19(channels);
  const grouped = orderCatalog(channels);
  const previous = readJsonIfExists(path.join(DIR, "channels.json"));
  assignIds(grouped, previous?.channels);
  assertInvariants(
    grouped.filter((channel) => channel.type === "tv"),
    grouped.filter((channel) => channel.type === "radio"),
  );
  assertGrouped(grouped);

  return {
    channels: grouped,
    dropped: [...tv.dropped, ...radio.dropped],
    missingGroup: tv.missingGroup + radio.missingGroup,
    tvCount: grouped.filter((channel) => channel.type === "tv").length,
    radioCount: grouped.filter((channel) => channel.type === "radio").length,
    approval,
    onay16,
    onay18,
    onay19,
  };
}

function buildOutputs(catalog, opts) {
  const channelsPath = path.join(DIR, "channels.json");
  const previous = readJsonIfExists(channelsPath);
  const publicChannels = catalog.channels.map(publicChannel);
  const prevChannels = Array.isArray(previous?.channels) ? previous.channels : null;
  const same =
    prevChannels !== null && signature(catalog.channels) === JSON.stringify(prevChannels);
  const prevRevision = Number(previous?._revision) || 0;

  let revision;
  let updatedAt;
  if (same && !opts.bump) {
    revision = prevRevision;
    updatedAt = previous.updatedAt;
  } else if (prevRevision > 0 && (opts.bump || !same)) {
    revision = prevRevision + 1;
    updatedAt = new Date().toISOString();
  } else {
    revision = 1;
    updatedAt = new Date().toISOString();
  }
  if (!updatedAt) updatedAt = new Date().toISOString();

  const channelsDoc = {
    _revision: revision,
    updatedAt,
    app: "ZapIt TV",
    channels: publicChannels,
  };
  const channelsText = `${JSON.stringify(channelsDoc, null, 2)}\n`;
  const metadataDoc = {
    revision,
    updatedAt,
    channelCount: publicChannels.length,
    files: {
      "channels.json": { sha256: sha256(channelsText) },
    },
  };
  const metadataText = `${JSON.stringify(metadataDoc, null, 2)}\n`;
  const tvM3u = renderM3u(
    "ZapIt TV — Almanya TV (kategoriye göre, ölü linkler çıkarıldı)",
    catalog.channels.filter((channel) => channel.type === "tv"),
  );
  const radioM3u = renderM3u(
    "ZapIt TV — Almanya radyo (kategoriye göre, ölü linkler çıkarıldı)",
    catalog.channels.filter((channel) => channel.type === "radio"),
  );

  return { channelsText, metadataText, tvM3u, radioM3u, revision, same };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  const bump = args.has("--bump");
  if (check && bump) throw new Error("--check ve --bump birlikte kullanılamaz");

  const catalog = loadCatalog();
  const outputs = buildOutputs(catalog, { bump });
  const targets = {
    [path.join(DIR, "channels.json")]: outputs.channelsText,
    [path.join(DIR, "metadata.json")]: outputs.metadataText,
    [path.join(DIR, "tv.m3u")]: outputs.tvM3u,
    [path.join(DIR, "radio.m3u")]: outputs.radioM3u,
  };

  if (check) {
    const drifted = Object.entries(targets).filter(([file, text]) => {
      if (!fs.existsSync(file)) return true;
      return !fs.readFileSync(file).equals(Buffer.from(text));
    });
    if (drifted.length) {
      console.error(
        `[almanya] KATALOG KAYMIS: ${drifted.map(([file]) => path.basename(file)).join(", ")}`,
      );
      console.error("[almanya] node almanya/tools/build.mjs ile yeniden üretin.");
      process.exit(1);
    }
    console.log(
      `[almanya] tamam revision=${outputs.revision} kanal=${catalog.channels.length}`,
    );
    return;
  }

  const wrote = [];
  for (const [file, text] of Object.entries(targets)) {
    if (writeIfChanged(file, text)) wrote.push(path.basename(file));
  }

  const hash = sha256(outputs.channelsText);
  console.log(
    `[almanya] TV ${catalog.tvCount} kanal, radyo ${catalog.radioCount} kanal, ` +
      `${catalog.channels.reduce((sum, channel) => sum + channel.streams.length, 0)} yayın`,
  );
  console.log(
    `[almanya] revision=${outputs.revision} ${outputs.same && !bump ? "(değişmedi)" : "(güncellendi)"}`,
  );
  const approval = catalog.approval || {};
  console.log(
    `[almanya] onay: +${approval.addedChannels || 0} kanal, +${approval.addedLinks || 0} link, ` +
      `etkinlik atlandı ${approval.skippedEvents || 0}, yinelenen URL ${approval.skippedDupes || 0}`,
  );
  const onay16 = catalog.onay16 || {};
  console.log(
    `[almanya] onay-2026-10-16: +${onay16.addedChannels || 0} kanal, ` +
      `+${onay16.addedLinks || 0} link, -${onay16.removedLinks || 0} link`,
  );
  const onay18 = catalog.onay18 || {};
  console.log(
    `[almanya] onay-2026-10-18: +${onay18.addedChannels || 0} kanal, ` +
      `+${onay18.addedLinks || 0} link, -${onay18.removedLinks || 0} link, ` +
      `-${onay18.removedChannels || 0} kanal, ölü aday atlandı ${onay18.skippedDead || 0}`,
  );
  if (onay18.removedChannelNames?.length) {
    console.log(`[almanya] akışı kalmayan kanallar: ${onay18.removedChannelNames.join(", ")}`);
  }
  const onay19 = catalog.onay19 || {};
  console.log(
    `[almanya] onay-2026-10-19: +${onay19.addedChannels || 0} kanal, ` +
      `+${onay19.addedLinks || 0} link, Sonnenklar atlandı ${onay19.skippedSonnenklar || 0}` +
      (onay19.addedChannelNames?.length ? ` (${onay19.addedChannelNames.join(", ")})` : ""),
  );
  console.log(`[almanya] sha256=${hash}`);
  if (catalog.dropped.length) {
    console.log(`[almanya] canlı linki kalmadığı için çıkarılanlar: ${catalog.dropped.join(", ")}`);
  }
  if (catalog.missingGroup) {
    console.log(`[almanya] uyarı: ${catalog.missingGroup} URL kaynak m3u'da yok, varsayılan grup yazıldı`);
  }
  console.log(
    wrote.length ? `[almanya] yazıldı: ${wrote.join(", ")}` : "[almanya] dosyalar zaten güncel",
  );
}

try {
  main();
} catch (err) {
  console.error("[almanya] HATA:", err?.message || err);
  process.exit(1);
}
