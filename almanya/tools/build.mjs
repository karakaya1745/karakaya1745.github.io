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
 * Ölü (failed) ve denenmemiş (untested) linkler yayınlanmaz.
 * geo-blocked (403) linkler kalır; geo_de_only ile işaretlenir.
 * Yeni link uydurulmaz — yalnızca CSV'de verilen adresler kullanılır.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

const ALLOWED_CATEGORIES = new Set([
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
  "other",
]);

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
  "Das Erste": "public",
  "Deluxe Dance by Kontor": "music",
  "Deluxe Music": "music",
  "Deluxe Rap": "music",
  DF1: "entertainment",
  DMF: "music",
  Dokusat: "documentary",
  "EWTN auf Deutsch": "religious",
  "Franken Plus": "regional",
  "Hope TV Deutsch": "religious",
  "HR Fernsehen": "regional",
  HSE: "shopping",
  "HSE Extra": "shopping",
  "HSE Trend": "shopping",
  Höhenrausch: "music",
  "Just Cooking": "lifestyle",
  "Just Fishing": "lifestyle",
  Juwelo: "shopping",
  "K-TV": "religious",
  KIKA: "kids",
  "L TV": "regional",
  "Lilo TV": "kids",
  "MDR Fernsehen Sachsen": "regional",
  "MDR Fernsehen Sachsen-Anhalt": "regional",
  "MDR Fernsehen Thüringen": "regional",
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
  "104.6 RTL": "music",
  "Absolut relax": "music",
  "Antenne 1": "regional",
  "Antenne Bayern": "regional",
  "Antenne MV": "regional",
  "Antenne Niedersachsen": "regional",
  "Bayern 1 Oberbayern": "regional",
  "Bayern 2": "culture",
  "Bayern 3": "music",
  "Berliner Rundfunk 91.4": "music",
  "BR 24": "news",
  "BR Heimat": "music",
  "BR Klassik": "music",
  "BR Schlager": "music",
  "Bremen Eins": "regional",
  "Bremen Next": "music",
  "Bremen Vier": "music",
  "Bremen Zwei": "culture",
  Cosmo: "music",
  "delta radio": "music",
  Deutschlandfunk: "public",
  "Deutschlandfunk Kultur": "culture",
  "Deutschlandfunk Nova": "public",
  "Dokumente und Debatten": "news",
  ENERGY: "music",
  FFN: "regional",
  "Hit Radio FFH": "music",
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
  "R.SH": "regional",
  "Radio 21": "music",
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
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.length) throw new Error("boş CSV");
  const header = lines[0].split(",");
  return lines.slice(1).map((line, i) => {
    const cols = line.split(",");
    if (cols.length !== header.length) {
      throw new Error(`CSV sütun sayısı uyuşmuyor (satır ${i + 2}): ${line}`);
    }
    const row = {};
    header.forEach((key, index) => {
      row[key] = cols[index];
    });
    return row;
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
    channel.streams.forEach((stream, index) => {
      const group = channel.groups[index].replaceAll('"', "'");
      const label = `${channel.name} (${index + 1})`;
      lines.push(
        `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}" group-title="${group}",${label}`,
      );
      lines.push(stream.url);
    });
  }
  return `${lines.join("\n")}\n`;
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
  assertInvariants(tv.channels, radio.channels);

  return {
    channels: [...tv.channels, ...radio.channels],
    dropped: [...tv.dropped, ...radio.dropped],
    missingGroup: tv.missingGroup + radio.missingGroup,
    tvCount: tv.channels.length,
    radioCount: radio.channels.length,
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
    "ZapIt TV — Almanya TV (ölü linkler çıkarıldı)",
    catalog.channels.filter((channel) => channel.type === "tv"),
  );
  const radioM3u = renderM3u(
    "ZapIt TV — Almanya radyo (ölü ve denenmemiş linkler çıkarıldı)",
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
