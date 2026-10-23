/**
 * 24 Ekim 2026 katalog temizliği.
 * Ölü TV kanalları çıkarılır. Shopping sırası kategori listesindedir.
 * Bölgesel radyo varyantları aile başına tek kanala indirilir.
 * Kardeş bölge URL'leri ana kanaldan silinir. DASDING tek kanaldır.
 * Yeni URL uydurulmaz; kalan adresler rev 9'da zaten vardı.
 */
const DEAD_TV = [
  "Deluxe Dance by Kontor",
  "QVC Style Deutschland",
  "QVC Zwei",
  "Radio Weser TV Bremen",
  "h-eins.tv",
  "Anixe +",
  "Anixe HD Serie",
];

const DROP_RADIO = [
  "Bayern 1 Mainfranken",
  "Bayern 1 - Franken",
  "Bayern 1 - Niederbayern/Oberpfalz",
  "Bayern 1 - Schwaben",
  "hr1 - Mittelhessen",
  "hr1 - Nordhessen",
  "hr1 - Osthessen",
  "hr1 - Südhessen",
  "hr3 - Mittelhessen",
  "hr3 - Nordhessen",
  "hr3 - Osthessen",
  "hr3 - Südhessen",
  "hr4 - Mittelhessen",
  "hr4 - Nordhessen",
  "hr4 - Osthessen",
  "hr4 - Südhessen",
  "MDR SACHSEN Bautzen",
  "MDR SACHSEN Chemnitz",
  "MDR SACHSEN Leipzig",
  "MDR SACHSEN-ANHALT Dessau",
  "MDR SACHSEN-ANHALT Halle",
  "MDR SACHSEN-ANHALT Stendal",
  "MDR THÜRINGEN Nordthüringen",
  "MDR THÜRINGEN Ostthüringen",
  "MDR THÜRINGEN Südthüringen",
  "NDR 1 Niedersachsen (Braunschweig)",
  "NDR 1 Niedersachsen (Lüneburg)",
  "NDR 1 Niedersachsen (Oldenburg)",
  "NDR 1 Niedersachsen (Osnabrück)",
  "NDR 1 Radio MV (Greifswald)",
  "NDR 1 Radio MV (Neubrandenburg)",
  "NDR 1 Radio MV (Rostock)",
  "NDR 1 Welle Nord (Flensburg)",
  "NDR 1 Welle Nord (Heide)",
  "NDR 1 Welle Nord (Lübeck)",
  "NDR 1 Welle Nord (Norderstedt)",
  "NDR 2 (Hamburg)",
  "NDR 2 (Mecklenburg-Vorpommern)",
  "NDR 2 (Schleswig-Holstein)",
  "WDR 2 Aachen und Region",
  "WDR 2 Bergisches Land",
  "WDR 2 Münsterland",
  "WDR 2 Ostwestfalen Lippe",
  "WDR 2 Rheinland",
  "WDR 2 Ruhrgebiet",
  "WDR 2 Südwestfalen",
  "WDR 4 Aachen und Region",
  "WDR 4 Münsterland",
  "WDR 4 Ostwestfalen-Lippe",
  "WDR 4 Rheinland",
  "WDR 4 Ruhrgebiet",
  "WDR 4 Südwestfalen",
  "Antenne Brandenburg Cottbus",
  "Antenne Brandenburg Frankfurt (Oder)",
  "Antenne Brandenburg Perleberg",
  "Antenne Brandenburg Prenzlau",
  "Radioeins Cottbus",
  "Radioeins Frankfurt (Oder)",
  "SWR 4 Mainz",
  "SWR 4 Stuttgart",
  "SWR4 Freiburg",
  "SWR4 Friedrichshafen",
  "SWR4 Heilbronn",
  "SWR4 Kaiserslautern",
  "SWR4 Karlsruhe",
  "SWR4 Koblenz",
  "SWR4 Ludwigshafen",
  "SWR4 Mannheim",
  "SWR4 Trier",
  "SWR4 Tübingen",
  "SWR4 Ulm",
  "HR Dasding",
];

const SWR4_STREAMS = [
  "https://liveradio.swr.de/sw73hl2/swr4bw/play.m3u8",
  "https://liveradio.swr.de/sw282p3/swr4bw/play.mp3",
  "https://liveradio.swr.de/sw331ch/swr4bw/play.aac",
  "https://liveradio.swr.de/sw890cl/swr4bw/",
  "https://liveradio.swr.de/sw331ch/swr4bw/",
];

const DASDING_MP3 = "https://liveradio.swr.de/sw282p3/dasding/play.mp3";

function urlsOf(channels) {
  const urls = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) urls.add(stream.url);
  }
  return urls;
}

function requireChannel(channels, name) {
  const channel = channels.find((item) => item.name === name);
  if (!channel) throw new Error(`kanal yok: ${name}`);
  return channel;
}

function rename(channel, name) {
  if (channel.name === name) return;
  channel.previousName = channel.previousName || channel.name;
  channel.name = name;
}

function keepStreams(channel, predicate) {
  const next = channel.streams.filter((stream) => predicate(stream.url));
  if (!next.length) throw new Error(`temizlikten sonra akış kalmadı: ${channel.name}`);
  channel.streams = next;
  channel.geo_de_only = next.every((stream) => stream.geo_de_only);
}

function removeNamed(channels, names, removed) {
  const wanted = new Set(names);
  const found = new Set();
  const kept = [];
  for (const channel of channels) {
    if (!wanted.has(channel.name)) {
      kept.push(channel);
      continue;
    }
    found.add(channel.name);
    removed.push(channel.name);
  }
  const missing = [...wanted].filter((name) => !found.has(name));
  if (missing.length) throw new Error(`silinecek kanal yok: ${missing.join(", ")}`);
  channels.length = 0;
  channels.push(...kept);
}

export function applyOctober24(channels) {
  const stats = {
    removedChannels: 0,
    removedLinks: 0,
    removedChannelNames: [],
    renamed: [],
  };
  const beforeUrls = urlsOf(channels);
  const beforeStreams = channels.reduce((sum, channel) => sum + channel.streams.length, 0);

  removeNamed(channels, DEAD_TV, stats.removedChannelNames);

  keepStreams(requireChannel(channels, "Bayern 1 Oberbayern"), (url) => (
    url.includes("/br1/obb") || url.includes("/b1obb/")
  ));
  keepStreams(requireChannel(channels, "HR 1"), (url) => (
    !url.includes("suedhessen") && !url.includes("hr1sh")
  ));
  keepStreams(requireChannel(channels, "HR 3"), (url) => (
    !url.includes("nordhessen") && !url.includes("hr3nh")
  ));
  keepStreams(requireChannel(channels, "HR 4"), (url) => (
    !url.includes("mittelhessen") && !url.includes("suedhessen") && !url.includes("hr4mh") && !url.includes("hr4sh")
  ));
  keepStreams(requireChannel(channels, "HR Info"), (url) => !url.includes("hrinfo-sued"));
  keepStreams(requireChannel(channels, "MDR Sachsen-Anhalt"), (url) => !url.includes("284290-2"));
  keepStreams(requireChannel(channels, "MDR Thüringen Mitte/West"), (url) => {
    if (url.includes("token=") || url.includes("sid=")) return false;
    if (url.includes("284300-1") || url.includes("284300-2") || url.includes("284300-3")) return false;
    return url.includes("284300-0") || url.includes("mdrthueringenmwth");
  });
  keepStreams(requireChannel(channels, "NDR 1 Niedersachsen Hannover"), (url) => {
    if (url.includes("1728424471708")) return false;
    return url.includes("/hannover/") || url.includes("ndr1ndsh");
  });
  keepStreams(requireChannel(channels, "NDR 1 Radio MV Schwerin"), (url) => {
    if (url.includes("1728424914112")) return false;
    if (url.includes("greifswald") || url.includes("rostock") || url.includes("neubrandenburg")) return false;
    return url.includes("/schwerin/") || url.includes("ndr1mvsn");
  });
  keepStreams(requireChannel(channels, "NDR 1 Welle Nord Kiel"), (url) => {
    if (url.includes("1728424684403")) return false;
    if (url.includes("luebeck") || url.includes("flensburg") || url.includes("heide") || url.includes("norderstedt")) {
      return false;
    }
    return url.includes("/kiel/") || url.includes("ndr1wnki");
  });
  keepStreams(requireChannel(channels, "NDR 2"), (url) => {
    if (url.includes("hamburg") || url.includes("ndr2_hh") || url.includes("ndr2_mv")) return false;
    if (url.includes("mecklenburg") || url.includes("schleswig")) return false;
    return url.includes("niedersachsen") || url.includes("ndr2nds") || /\/ndr2\.m3u$/.test(url);
  });
  keepStreams(requireChannel(channels, "NDR Info Niedersachsen"), (url) => {
    if (url.includes("schleswigholstein") || url.includes("/hamburg/")) return false;
    return url.includes("niedersachsen") || url.includes("/ndrinfo/live/") || url.includes("/ndrinfo/hls/") || url.endsWith("/ndrinfo.m3u");
  });
  keepStreams(requireChannel(channels, "WDR 2 Rhein und Ruhr"), (url) => (
    url.includes("rheinruhr") || url.includes("wdr2rr") || url.includes("wdr2rheinruhr")
  ));
  keepStreams(requireChannel(channels, "RBB Radio Eins"), (url) => (
    !url.includes("token=") && !url.includes("cottbus") && !url.includes("frankfurt")
  ));

  const swr4 = requireChannel(channels, "SWR4");
  const known = new Set();
  for (const channel of channels) {
    for (const stream of channel.streams) known.add(stream.url);
  }
  for (const url of SWR4_STREAMS) {
    if (!known.has(url)) throw new Error(`SWR4 varsayılan adresi katalogda yok: ${url}`);
  }
  swr4.streams = SWR4_STREAMS.map((url) => ({ url, geo_de_only: false }));
  swr4.geo_de_only = false;

  removeNamed(channels, DROP_RADIO, stats.removedChannelNames);

  const renames = [
    ["Bayern 1 Oberbayern", "Bayern 1"],
    ["MDR Thüringen Mitte/West", "MDR Thüringen"],
    ["NDR 1 Niedersachsen Hannover", "NDR 1 Niedersachsen"],
    ["NDR 1 Radio MV Schwerin", "NDR 1 Radio MV"],
    ["NDR 1 Welle Nord Kiel", "NDR 1 Welle Nord"],
    ["WDR 2 Rhein und Ruhr", "WDR 2"],
    ["SWR Dasding", "DASDING"],
  ];
  for (const [from, to] of renames) {
    rename(requireChannel(channels, from), to);
    stats.renamed.push(`${from} → ${to}`);
  }

  const names = channels.map((channel) => channel.name);
  if (new Set(names).size !== names.length) throw new Error("temizlikten sonra yinelenen kanal adı");
  for (const name of [...DEAD_TV, ...DROP_RADIO]) {
    if (names.includes(name)) throw new Error(`kanal duruyor: ${name}`);
  }
  for (const name of ["MDR Fernsehen Sachsen", "MDR Fernsehen Sachsen-Anhalt", "MDR Fernsehen Thüringen", "WDR 4", "MDR Jump", "MDR Kultur", "DASDING vom SR", "SWR 1 Baden-Württemberg", "SWR 1 Rheinland-Pfalz"]) {
    if (!names.includes(name)) throw new Error(`ayrı istasyon düştü: ${name}`);
  }

  const afterUrls = urlsOf(channels);
  for (const url of afterUrls) {
    if (!beforeUrls.has(url)) throw new Error(`temizlik yeni URL ekledi: ${url}`);
  }
  const owners = new Map();
  for (const channel of channels) {
    for (const stream of channel.streams) {
      owners.set(stream.url, (owners.get(stream.url) || 0) + 1);
    }
  }
  const dups = [...owners.entries()].filter(([, count]) => count > 1);
  if (dups.length) throw new Error(`yinelenen URL kaldı: ${dups.map(([url]) => url).join(", ")}`);
  if (owners.get(DASDING_MP3) !== 1) throw new Error("DASDING MP3 tek kanalda değil");
  if ([...owners.keys()].some((url) => url.includes("raka10"))) throw new Error("DASDING raka10 adresi kaldı");

  const hr1 = requireChannel(channels, "HR 1");
  if (!hr1.streams[0].url.includes("/hr1rm/")) throw new Error("HR 1 hr1rm önde değil");
  if (hr1.streams.some((stream) => stream.url.includes("suedhessen"))) throw new Error("HR 1 Südhessen duruyor");
  if (!hr1.streams.at(-1).url.endsWith("/hr1/master.m3u8")) throw new Error("HR 1 hlshr1 sonda değil");

  const wdr2 = requireChannel(channels, "WDR 2");
  if (wdr2.streams.some((stream) => /rheinland|ostwestfalen|muensterland|aachen|bergisch|ruhrgebiet|suedwestfalen/.test(stream.url))) {
    throw new Error("WDR 2 kardeş bölge URL'si duruyor");
  }
  const bayern = requireChannel(channels, "Bayern 1");
  if (bayern.streams.some((stream) => /franken|nbopf|schwaben|mainfranken/.test(stream.url))) {
    throw new Error("Bayern 1 kardeş bölge URL'si duruyor");
  }
  const nds = requireChannel(channels, "NDR 1 Niedersachsen");
  if (nds.streams.some((stream) => /oldenburg|osnabrueck|braunschweig|lueneburg/.test(stream.url))) {
    throw new Error("NDR 1 Niedersachsen kardeş şehir URL'si duruyor");
  }

  stats.removedChannels = stats.removedChannelNames.length;
  const afterStreams = channels.reduce((sum, channel) => sum + channel.streams.length, 0);
  stats.removedLinks = beforeStreams - afterStreams;
  stats.removedUrls = beforeUrls.size - afterUrls.size;
  if (stats.removedChannels !== 79) {
    throw new Error(`silinen kanal sayısı 79 olmalı: ${stats.removedChannels}`);
  }
  if (channels.filter((channel) => channel.type === "tv").length !== 156) {
    throw new Error("TV sayısı 156 olmalı");
  }
  if (channels.filter((channel) => channel.type === "radio").length !== 165) {
    throw new Error("radyo sayısı 165 olmalı");
  }
  return stats;
}
