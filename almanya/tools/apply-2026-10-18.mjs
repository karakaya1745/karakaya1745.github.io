/**
 * 18 Ekim 2026 onayı ve katalog sırası.
 * build.mjs bunu çağırır. build.mjs'i import etmez.
 *
 * Ekler: onay CSV'de yeni_link, yeni_kanal, yeni_kanal_yerel,
 * radyo_yeni_link, radyo_yeni_kanal.
 * denendi_olu_onerilmiyor satırları eklenmez.
 * olu_mevcut_link silinir. olu_mevcut_link_supheli kalır, yayın sırasında sona alınır.
 * Retestteki Deluxe Music / Deluxe Rap endlist_supheli adresleri silinir.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(DIR, "sources");

export const FINAL_CATEGORY_ORDER = [
  "public",
  "regional",
  "news",
  "religious",
  "music",
  "documentary",
  "other",
  "international",
  "yerel",
  "shopping",
];

const ADD_TURS = new Set([
  "yeni_link",
  "yeni_kanal",
  "yeni_kanal_yerel",
  "radyo_yeni_link",
  "radyo_yeni_kanal",
]);

const NEW_CHANNEL_TURS = new Set(["yeni_kanal", "yeni_kanal_yerel", "radyo_yeni_kanal"]);

const SESSION_STATIONS = new Set([
  "R.SH",
  "Radio Brocken",
  "Radio Hamburg",
  "delta radio",
  "Radio PSR",
]);

const PLAYOUT_GEO = new Set([
  "München TV",
  "Regio TV Satellit",
  "Franken Fernsehen",
  "DMF",
  "Stimmungsgarten TV",
  "Volksmusik TV",
  "Lilo TV",
  "RiC",
  "Bibel TV",
  "Bibel TV Musik",
  "Telegold",
  "Dokusat",
  "Augsburg TV",
]);

const STATE_ORDER = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
];

const collator = new Intl.Collator("de", { sensitivity: "base", numeric: true });

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
  const text = String(durum);
  if (text.toLowerCase().startsWith("working")) return "working";
  if (/^sadece almanya\b/i.test(text)) return "geo";
  return null;
}

function isSessionUrl(url) {
  return /[?&]sABC=/.test(url) || /[?&]skey=/.test(url) || /[?&]amsparams=/.test(url) || url.endsWith("?");
}

function streamPreference(channel, url, suspicious) {
  if (suspicious.has(url)) return 50;
  if (channel.name === "bigFM") {
    if (url === "https://stream.bigfm.de/deutschland/aac-128") return 0;
    if (url === "https://streams.bigfm.de/bigfm-deutschland-128-mp3") return 1;
  }
  if (
    channel.name === "Radio Bob" &&
    url === "https://streams.radiobob.de/bob-national/mp3-192/mediaplayer"
  ) {
    return 0;
  }
  if (channel.name === "Rock Antenne") {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    if (pathname.endsWith("/rockantenne")) return 0;
  }
  if (channel.name === "Cosmo") {
    if (url.includes("icecastssl.wdr.de") && url.includes("/cosmo/live/")) return 0;
    if (url.includes("wdr-cosmo-live.icecast.wdr.de") && url.includes("/cosmo/live/")) return 1;
  }
  return 10;
}

function sortStreams(channel, suspicious) {
  channel.streams.forEach((stream, index) => {
    if (stream._ord == null) stream._ord = index;
    stream._pref = streamPreference(channel, stream.url, suspicious);
  });
  channel.streams.sort((a, b) => {
    const byGeo = Number(a.geo_de_only) - Number(b.geo_de_only);
    if (byGeo !== 0) return byGeo;
    if (a._pref !== b._pref) return a._pref - b._pref;
    return a._ord - b._ord;
  });
  for (const stream of channel.streams) {
    delete stream._ord;
    delete stream._pref;
  }
  channel.geo_de_only = channel.streams.every((stream) => stream.geo_de_only);
  channel.groups = channel.streams.map(() => channel.category);
}

function pinList(label, names) {
  const map = new Map();
  names.forEach((name, index) => {
    if (map.has(name)) throw new Error(`${label} listesinde yinelenen ad: ${name}`);
    map.set(name, index);
  });
  return map;
}

const TV_PUBLIC = pinList("TV public", [
  "Das Erste",
  "ZDF",
  "3sat",
  "ARTE Deutsch",
  "Phoenix",
  "Tagesschau 24",
  "KIKA",
  "ZDF Neo",
  "ZDF Info",
  "One",
  "ARD Alpha",
]);

const TV_REGIONAL = pinList("TV regional", [
  "Bayerisches Fernsehen Nord",
  "Bayerisches Fernsehen Süd",
  "HR Fernsehen",
  "MDR Fernsehen Sachsen",
  "MDR Fernsehen Sachsen-Anhalt",
  "MDR Fernsehen Thüringen",
  "NDR Fernsehen Hamburg",
  "NDR Fernsehen Mecklenburg-Vorpommern",
  "NDR Fernsehen Niedersachsen",
  "NDR Fernsehen Schleswig-Holstein",
  "RBB Berlin",
  "RBB Brandenburg",
  "Radio Bremen Fernsehen",
  "SR Fernsehen",
  "SWR Fernsehen Baden-Württemberg",
  "SWR Fernsehen Rheinland-Pfalz",
  "WDR Fernsehen Köln",
  "WDR Studio Köln",
  "WDR Studio Aachen",
  "WDR Studio Bielefeld",
  "WDR Studio Bonn",
  "WDR Studio Dortmund",
  "WDR Studio Duisburg",
  "WDR Studio Düsseldorf",
  "WDR Studio Essen",
  "WDR Studio Münster",
  "WDR Studio Siegen",
  "WDR Studio Wuppertal",
]);

const TV_NEWS = pinList("TV news", [
  "Deutsche Welle",
  "Deutsche Welle+",
  "DW Arabic",
  "DW Español",
  "Parlamentsfernsehen 1 (Bundestag)",
  "Parlamentsfernsehen 2 (Bundestag)",
  "Welt",
]);

const TV_RELIGIOUS = pinList("TV religious", [
  "Bibel TV",
  "Bibel TV Musik",
  "Bibel TV Impuls",
  "K-TV",
  "EWTN auf Deutsch",
  "Hope TV Deutsch",
  "Die Neue Zeit TV",
  "Light Channel Deutschland",
  "Sender Neu Jerusalem",
  "Sophia TV",
]);

const TV_MUSIC = pinList("TV music", [
  "Deluxe Music",
  "Deluxe Rap",
  "Melodie TV",
  "DMF",
  "MC TV (MC EU)",
  "Stimmungsgarten TV",
  "Volksmusik TV",
  "Folx Music Television",
  "One Music Television",
  "Zwei Music Television",
]);

const TV_SHOPPING = pinList("TV shopping", [
  "QVC Deutschland",
  "HSE",
  "HSE Extra",
  "HSE Trend",
  "Juwelo",
  "Shop LC Deutschland",
  "Telegold",
  "KaufBei TV",
  "MeieTV",
]);

const TV_DOCUMENTARY = pinList("TV documentary", [
  "N24 Doku",
  "Welt der Wunder TV",
  "Dokusat",
]);

const TV_OTHER = pinList("TV other", [
  "DF1",
  "Aristo TV",
  "Lilo TV",
  "RiC",
  "Finest TV",
  "QS24.TV",
  "More Than Sports TV",
]);

const TV_INTERNATIONAL = pinList("TV international", ["Kanal Avrupa", "Çira TV"]);

const TV_PINNED = new Map([
  ["public", TV_PUBLIC],
  ["regional", TV_REGIONAL],
  ["news", TV_NEWS],
  ["religious", TV_RELIGIOUS],
  ["music", TV_MUSIC],
  ["shopping", TV_SHOPPING],
  ["documentary", TV_DOCUMENTARY],
  ["other", TV_OTHER],
  ["international", TV_INTERNATIONAL],
]);

function yerelMap(entries) {
  const map = new Map();
  for (const [state, names] of entries) {
    if (!STATE_ORDER.includes(state)) throw new Error(`bilinmeyen eyalet: ${state}`);
    for (const name of names) {
      if (map.has(name)) throw new Error(`yerel listesinde yinelenen ad: ${name}`);
      map.set(name, state);
    }
  }
  return map;
}

const TV_YEREL = yerelMap([
  ["Baden-Württemberg", ["Baden TV", "Regio TV Satellit", "Filstalwelle", "Metropol Region TV Rhein-Neckar"]],
  [
    "Bayern",
    [
      "Augsburg TV",
      "Franken Plus",
      "Franken Fernsehen",
      "München TV",
      "Niederbayern TV Satellit",
      "TV Ingolstadt",
      "Oberpfalz TV",
      "TV Oberfranken",
      "TV Mainfranken",
      "TVA Ostbayern",
      "Niederbayern TV Deggendorf-Straubing",
      "Niederbayern TV Landshut",
      "Niederbayern TV Passau",
      "Allgäu TV",
      "RFO Regional Fernsehen Oberbayern",
    ],
  ],
  ["Berlin", ["ALEX Berlin"]],
  // Seenluft24: Lausitz gölleri, Brandenburg kabul edildi.
  ["Brandenburg", ["Lausitzwelle", "Seenluft24", "teltOwkanal"]],
  ["Bremen", []],
  ["Hamburg", ["noa4 Hamburg"]],
  ["Hessen", ["OK Kassel", "OK Rhein-Main"]],
  [
    "Niedersachsen",
    ["oldenburg eins", "Ems TV", "TV38 Südost-Niedersachsen", "Radio 21 TV"],
  ],
  ["Nordrhein-Westfalen", ["NRWision"]],
  [
    "Rheinland-Pfalz",
    [
      "OK Kaiserslautern",
      "OK54 Trier",
      "OK4",
      "OK Weinstraße",
      "OK RheinLokal Worms",
      "OK Südwestpfalz",
      "OK naheTV",
    ],
  ],
  ["Saarland", ["Saarland Fernsehen 1", "Saarland Fernsehen 2"]],
  [
    "Sachsen",
    [
      "L TV",
      "OTVA",
      "Sachsen Eins",
      "Sachsen Fernsehen Leipzig",
      "Sachsen Fernsehen Dresden",
      "Sachsen Fernsehen Chemnitz",
      "Erz-TV Stollberg",
      "Oberlausitz TV",
      "MyTVplus", // eyalet bilgisi yok; Sachsen'e kondu
    ],
  ],
  [
    "Sachsen-Anhalt",
    [
      "MDF.1",
      "RAN1",
      "RBW",
      "RFH Harz",
      "PUNKTum Fernsehen",
      "BLK Regional TV",
      "KulturMD",
      "OK Dessau",
      "OK Magdeburg",
      "OK Merseburg-Querfurt",
      "OK Salzwedel",
      "OK Stendal",
      "OK Wernigerode",
      "WTV (OK Wettin)",
    ],
  ],
  ["Schleswig-Holstein", ["noa4 Norderstedt", "OK Kiel", "OK Flensburg", "Sylt1"]],
  ["Thüringen", ["Altenburg TV", "labor14 Gera"]],
]);

const RADIO_PUBLIC_NETWORKS = [
  [
    "Bayern 1",
    "Bayern 2",
    "Bayern 3",
    "BR 24",
    "BR Heimat",
    "BR Klassik",
    "BR Schlager",
  ],
  ["Bremen Eins", "Bremen Zwei", "Bremen Vier", "Bremen Next"],
  [
    "HR 1",
    "HR 2 Kultur",
    "HR 3",
    "HR 4",
    "HR Info",
    "YOU FM (mp3/high)",
  ],
  [
    "MDR Sachsen",
    "MDR Sachsen Sorbisch",
    "MDR Sachsen-Anhalt",
    "MDR Thüringen",
    "MDR Aktuell",
    "MDR Jump",
    "MDR Klassik",
    "MDR Kultur",
    "MDR Sputnik",
    "MDR Schlagerwelt",
    "MDR Tweens",
  ],
  [
    "NDR 1 Niedersachsen",
    "NDR 1 Radio MV",
    "NDR 1 Welle Nord",
    "NDR 90.3",
    "NDR 2",
    "N-Joy",
    "NDR Kultur",
    "NDR Info Niedersachsen",
    "NDR Info Spezial",
    "NDR Blue",
    "NDR Schlager",
  ],
  [
    "RBB 88.8",
    "Antenne Brandenburg",
    "RBB Radio Eins",
    "RBB Fritz",
    "rbbKultur",
    "RBB 24 Inforadio",
    "rbb24 Inforadio Sorbisch",
  ],
  ["SR 1", "SR 3 Saarlandwelle", "SR Kultur", "AntenneSaar (SR)", "DASDING vom SR"],
  [
    "SWR 1 Baden-Württemberg",
    "SWR 1 Rheinland-Pfalz",
    "SWR 3",
    "SWR4",
    "SWR Aktuell",
    "DASDING",
    "SWR Kultur",
  ],
  [
    "WDR 1 Live",
    "WDR 1 Live Diggi",
    "1LIVE Chillout",
    "1LIVE Top Hits",
    "WDR 2",
    "WDR 3",
    "WDR 4",
    "WDR 5",
    "Cosmo",
    "WDR Die Maus",
    "WDR Event",
  ],
  ["Deutschlandfunk", "Deutschlandfunk Kultur", "Deutschlandfunk Nova", "Dokumente und Debatten"],
];

const RADIO_PUBLIC = new Map();
RADIO_PUBLIC_NETWORKS.forEach((stations, network) => {
  stations.forEach((name, index) => {
    if (RADIO_PUBLIC.has(name)) throw new Error(`radyo public listesinde yinelenen ad: ${name}`);
    RADIO_PUBLIC.set(name, { network, index });
  });
});

function radioRegional(entries) {
  const map = new Map();
  for (const [state, names] of entries) {
    if (!STATE_ORDER.includes(state)) throw new Error(`bilinmeyen eyalet: ${state}`);
    names.forEach((name, index) => {
      if (map.has(name)) throw new Error(`radyo bölgesel listesinde yinelenen ad: ${name}`);
      map.set(name, { state, index });
    });
  }
  return map;
}

const RADIO_REGIONAL = radioRegional([
  [
    "Baden-Württemberg",
    [
      "Antenne 1",
      "bigFM",
      "Radio Regenbogen",
      "Radio 7",
      "Schwarzwaldradio",
      "Querfunk Karlsruhe",
      "Campusradio Mannheim (Radioaktiv)",
      "Sunshine Live",
      "baden.fm",
    ],
  ],
  [
    "Bayern",
    [
      "Antenne Bayern",
      "Rock Antenne",
      "egoFM",
      "95.5 Charivari",
      "Radio Gong 96.3",
      "Radio Arabella",
      "DONAU 3 FM",
      "Campusradio Regensburg (Studentenfunk)",
      "Bayernwelle SüdOst",
      "Radio Galaxy Weiden",
      "Radio Trausnitz",
    ],
  ],
  ["Berlin", ["104.6 RTL", "Berliner Rundfunk 91.4", "KISS FM", "Star FM", "reboot.fm", "Radio Gold"]],
  ["Hamburg", ["Radio Hamburg"]],
  ["Hessen", ["Hit Radio FFH", "harmony.fm", "Radio Bob", "Radio Rüsselsheim"]],
  ["Mecklenburg-Vorpommern", ["Antenne MV", "Ostseewelle"]],
  [
    "Niedersachsen",
    [
      "radio ffn",
      "ffn 80er",
      "Antenne Niedersachsen",
      "Radio Bollerwagen",
      "Radio 21",
      "Radio 38",
      "Radio HBR",
      "Hitradio Ohr",
      "Oldie Antenne",
    ],
  ],
  [
    "Nordrhein-Westfalen",
    [
      "100'5 DAS HITRADIO",
      "100'5 Alemannia",
      "Antenne Niederrhein",
      "Radio Köln",
      "Radio Duisburg",
      "Campusradio Köln (Kölncampus)",
      "Campusradio Universität Duisburg-Essen (CampusFM)",
      "ENERGY",
      "Antenne Unna",
      "NE-WS 89.4",
      "Radio 91.2 Dortmund",
      "Radio Berg",
      "Radio Bonn/Rhein-Sieg",
      "Radio Erft",
      "Radio Euskirchen",
      "Radio Gütersloh",
      "Radio Lippe",
      "Radio MK",
      "Radio Neandertal",
      "Radio WAF",
    ],
  ],
  ["Rheinland-Pfalz", ["RPR1", "Rockland Radio", "Antenne Mainz"]],
  ["Sachsen", ["Radio PSR", "Radio Dresden"]],
  ["Sachsen-Anhalt", ["Radio SAW", "Radio Brocken"]],
  ["Schleswig-Holstein", ["R.SH", "delta radio"]],
  ["Thüringen", ["Campusradio Ilmenau"]],
]);

const RADIO_RELIGIOUS = pinList("radyo religious", ["domradio.de", "ERF Jess", "ERF Plus"]);

const RADIO_THEMED = new Set([
  "Klassik Radio",
  "Klassik Radio Movie",
  "0nlineradio 70s",
  "Absolut relax",
  "Absolut Radio",
  "DELUXE EASY",
  "DELUXE LOUNGE RADIO",
  "DELUXE MUSIC RADIO",
  "JAM FM Black Label",
  "Schlagerparadies",
  "Schlager Radio",
  "Radio Paloma",
  "Antenne Schlager",
  "radio B2",
  "ByteFM",
  "90s90s Eurodance",
  "Radio Teddy",
  "Toggo Radio",
  "Star*Sat Radio",
]);

function radioBucket(name) {
  const hits = [
    RADIO_PUBLIC.has(name),
    RADIO_REGIONAL.has(name),
    RADIO_RELIGIOUS.has(name),
    RADIO_THEMED.has(name),
  ].filter(Boolean).length;
  if (hits > 1) throw new Error(`radyo birden fazla sınıfta: ${name}`);
}

for (const name of RADIO_PUBLIC.keys()) radioBucket(name);
for (const name of RADIO_REGIONAL.keys()) radioBucket(name);
for (const name of RADIO_RELIGIOUS.keys()) radioBucket(name);
for (const name of RADIO_THEMED) radioBucket(name);

function tvSortKey(name) {
  if (TV_YEREL.has(name)) {
    return {
      category: "yerel",
      a: STATE_ORDER.indexOf(TV_YEREL.get(name)),
      b: 0,
      c: name,
    };
  }
  for (const [category, list] of TV_PINNED) {
    if (list.has(name)) {
      return { category, a: list.get(name), b: 0, c: name };
    }
  }
  throw new Error(`sınıflanmamış TV kanalı: ${name}`);
}

function radioSortKey(name) {
  if (RADIO_PUBLIC.has(name)) {
    const place = RADIO_PUBLIC.get(name);
    return { category: "public", a: place.network, b: place.index, c: name };
  }
  if (RADIO_REGIONAL.has(name)) {
    const place = RADIO_REGIONAL.get(name);
    return {
      category: "regional",
      a: STATE_ORDER.indexOf(place.state),
      b: place.index,
      c: name,
    };
  }
  if (RADIO_RELIGIOUS.has(name)) {
    return { category: "religious", a: RADIO_RELIGIOUS.get(name), b: 0, c: name };
  }
  if (RADIO_THEMED.has(name)) {
    let rank = 2;
    if (name === "Klassik Radio") rank = 0;
    else if (name === "Klassik Radio Movie") rank = 1;
    return { category: "music", a: rank, b: 0, c: name };
  }
  throw new Error(`sınıflanmamış radyo istasyonu: ${name}`);
}

function removeUrl(channels, urls, url) {
  for (const channel of channels) {
    const index = channel.streams.findIndex((stream) => stream.url === url);
    if (index === -1) continue;
    channel.streams.splice(index, 1);
    urls.delete(url);
    return channel;
  }
  return null;
}

export function applyOctober18(channels) {
  const csvPath = path.join(SOURCES, "onay-2026-10-18.csv");
  const retestPath = path.join(SOURCES, "catalog-retest-2026-10-18.json");
  const stats = {
    addedChannels: 0,
    addedLinks: 0,
    removedLinks: 0,
    removedChannels: 0,
    skippedDead: 0,
    removedChannelNames: [],
  };
  if (!fs.existsSync(csvPath) || !fs.existsSync(retestPath)) return stats;

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const retest = JSON.parse(fs.readFileSync(retestPath, "utf8"));
  const byKey = new Map(channels.map((channel) => [`${channel.type}\0${channel.name}`, channel]));
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) urls.add(stream.url);
  }

  const suspicious = new Set();
  for (const row of rows) {
    if (row.tur?.trim() === "olu_mevcut_link_supheli") suspicious.add(row.link?.trim());
  }

  const endlist = new Set();
  for (const row of retest.sonuclar || []) {
    if (row.son_durum !== "endlist_supheli") continue;
    if (row.kanal !== "Deluxe Music" && row.kanal !== "Deluxe Rap") continue;
    endlist.add(row.url);
  }
  if (endlist.size !== 5) {
    throw new Error(`Deluxe endlist sayısı 5 olmalı, bulunan: ${endlist.size}`);
  }

  for (const row of rows) {
    const tur = row.tur?.trim();
    if (tur !== "olu_mevcut_link") continue;
    const url = row.link?.trim();
    const channel = removeUrl(channels, urls, url);
    if (!channel) throw new Error(`silinecek link bulunamadı (${row.kanal}): ${url}`);
    stats.removedLinks += 1;
  }

  for (const url of endlist) {
    const channel = removeUrl(channels, urls, url);
    if (!channel) throw new Error(`endlist link bulunamadı: ${url}`);
    stats.removedLinks += 1;
  }

  for (const channel of channels) {
    if (!SESSION_STATIONS.has(channel.name)) continue;
    const before = channel.streams.length;
    channel.streams = channel.streams.filter((stream) => {
      if (!isSessionUrl(stream.url)) return true;
      urls.delete(stream.url);
      return false;
    });
    stats.removedLinks += before - channel.streams.length;
  }

  let ordinal = 3_000_000;
  for (const row of rows) {
    const tur = row.tur?.trim();
    const name = row.kanal?.trim();
    const url = row.link?.trim();
    if (!tur || !name || !url) throw new Error("onay-2026-10-18 satırı eksik");
    if (tur === "denendi_olu_onerilmiyor") {
      stats.skippedDead += 1;
      continue;
    }
    if (tur === "olu_mevcut_link" || tur === "olu_mevcut_link_supheli") continue;
    if (!ADD_TURS.has(tur)) throw new Error(`bilinmeyen tur (${name}): ${tur}`);
    if (!/^https:\/\/\S+$/.test(url)) throw new Error(`geçersiz onay URL (${name}): ${url}`);
    if (urls.has(url)) throw new Error(`onay linki zaten katalogda (${name}): ${url}`);

    const type = tur.startsWith("radyo") ? "radio" : "tv";
    const status = approvalStatus(row.durum);
    if (!status) throw new Error(`bilinmeyen onay durumu (${name}): ${row.durum}`);
    const key = `${type}\0${name}`;
    let channel = byKey.get(key);
    if (!channel) {
      if (!NEW_CHANNEL_TURS.has(tur)) {
        throw new Error(`yedek linkin kanalı yok: ${name}`);
      }
      channel = {
        id: "",
        name,
        type,
        category: "other",
        geo_de_only: false,
        streams: [],
        groups: [],
      };
      channels.push(channel);
      byKey.set(key, channel);
      stats.addedChannels += 1;
    } else if (NEW_CHANNEL_TURS.has(tur)) {
      throw new Error(`yeni kanal zaten var: ${name}`);
    }

    channel.streams.push({
      url,
      geo_de_only: status === "geo",
      _ord: ordinal,
    });
    ordinal += 1;
    urls.add(url);
    stats.addedLinks += 1;
  }

  const kept = [];
  for (const channel of channels) {
    if (channel.streams.length) {
      kept.push(channel);
      continue;
    }
    stats.removedChannels += 1;
    stats.removedChannelNames.push(channel.name);
  }
  channels.length = 0;
  channels.push(...kept);

  for (const channel of channels) {
    if (!PLAYOUT_GEO.has(channel.name)) continue;
    let marked = 0;
    for (const stream of channel.streams) {
      if (!stream.url.includes("iptv-playoutcenter.de")) continue;
      stream.geo_de_only = true;
      marked += 1;
    }
    if (!marked) throw new Error(`playoutcenter linki yok: ${channel.name}`);
  }

  const radio38 = channels.find((channel) => channel.type === "radio" && channel.name === "RBB Radio 3");
  if (!radio38) throw new Error("yeniden adlandırılacak kanal yok: RBB Radio 3");
  radio38.previousName = radio38.name;
  radio38.name = "Radio 38";

  for (const channel of channels) sortStreams(channel, suspicious);

  for (const url of suspicious) {
    const found = channels.some((channel) => channel.streams.some((stream) => stream.url === url));
    if (!found) throw new Error(`şüpheli link katalogda yok: ${url}`);
  }
  for (const name of SESSION_STATIONS) {
    if (!channels.some((channel) => channel.name === name)) {
      throw new Error(`temiz linki kalmayan istasyon düştü: ${name}`);
    }
  }

  const bigfm = channels.find((channel) => channel.name === "bigFM");
  if (bigfm.streams[0].url !== "https://stream.bigfm.de/deutschland/aac-128") {
    throw new Error("bigFM ana yayın önde değil");
  }
  if (bigfm.streams[1].url !== "https://streams.bigfm.de/bigfm-deutschland-128-mp3") {
    throw new Error("bigFM ikinci ana yayın yerinde değil");
  }
  const bob = channels.find((channel) => channel.name === "Radio Bob");
  if (bob.streams[0].url !== "https://streams.radiobob.de/bob-national/mp3-192/mediaplayer") {
    throw new Error("Radio Bob ana yayın önde değil");
  }
  const rock = channels.find((channel) => channel.name === "Rock Antenne");
  if (!new URL(rock.streams[0].url).pathname.replace(/\/+$/, "").endsWith("/rockantenne")) {
    throw new Error("Rock Antenne ana yayın önde değil");
  }
  const cosmo = channels.find((channel) => channel.name === "Cosmo");
  if (!cosmo.streams[0].url.includes("icecastssl.wdr.de")) {
    throw new Error("Cosmo ana yayın önde değil");
  }
  if (!cosmo.streams[1].url.includes("wdr-cosmo-live.icecast.wdr.de")) {
    throw new Error("Cosmo ikinci ana yayın yerinde değil");
  }

  return stats;
}

export function orderCatalog(channels) {
  const rank = new Map(FINAL_CATEGORY_ORDER.map((category, index) => [category, index]));
  const keyed = channels.map((channel) => {
    const key = channel.type === "tv" ? tvSortKey(channel.name) : radioSortKey(channel.name);
    if (!rank.has(key.category)) throw new Error(`geçersiz kategori: ${channel.name}`);
    channel.category = key.category;
    channel.groups = channel.streams.map(() => key.category);
    return { channel, key };
  });
  keyed.sort((a, b) => {
    if (a.channel.type !== b.channel.type) return a.channel.type === "tv" ? -1 : 1;
    const byCategory = rank.get(a.key.category) - rank.get(b.key.category);
    if (byCategory !== 0) return byCategory;
    if (a.key.a !== b.key.a) return a.key.a - b.key.a;
    if (a.key.b !== b.key.b) return a.key.b - b.key.b;
    return collator.compare(a.key.c, b.key.c);
  });
  return keyed.map((entry) => entry.channel);
}
