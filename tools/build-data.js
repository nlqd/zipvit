// Offline build: sources/ -> data/communes.json + data/old-wards.json
// Run: node tools/build-data.js (after `uv run --no-project tools/fetch_sources.py` for new sources)
//
// New units and names come from the NSO lists, postal codes from QĐ 2334 (matched by name).
// The NSO old->new table names the pre-July-2025 units; the 2017 wards scraped from
// mabuudien.net are matched to them by name to borrow their coordinates. Each new commune
// is pinned at the centroid of its old wards. 2017 wards that no longer existed in 2025
// get a likely successor (see successorByName) and are flagged as approximate.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseName, stripType } from "../lib/text.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(ROOT, "sources");
const DATA = path.join(ROOT, "data");

function readTsv(name) {
  const [header, ...rows] = fs
    .readFileSync(path.join(SOURCES, name), "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => line.split("\t"));
  return rows.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ""])));
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

const TONES = /[\u0300\u0301\u0303\u0309\u0323]/g;

// Tone marks may sit on either vowel ("Hoà" vs "Hòa"), so each syllable is compared
// as its letters followed by its tone. Unlike fold(), this still tells "Lộc Thạnh"
// from "Lộc Thành".
function toneKey(name, { keepType = false } = {}) {
  const nfc = name.normalize("NFC");
  return (keepType ? nfc : stripType(nfc))
    .normalize("NFD")
    .toLowerCase()
    .replace(/[đ]/g, "d")
    .split(/\s+/)
    .map((syllable) => syllable.replace(TONES, "") + (syllable.match(TONES) || []).join(""))
    .join(" ")
    .replace(/\b0+(\d)/g, "$1");
}

// Loosest key: ignores spacing and punctuation, and the i/y spelling variants ("Qui"/"Quy").
const compactKey = (name) => baseName(name).replace(/[^a-z0-9]/g, "").replace(/y/g, "i");
const stripCode = (label) => label.replace(/\s*\(\d+\)\s*$/, "");
// Three decimals is about 100 m, finer than centroid-derived positions deserve.
const roundCoord = (x) => Math.round(x * 1e3) / 1e3;

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  return 6371 * Math.hypot(dLat, dLng);
}

// Pick the one candidate that the strictest key agrees on, trying looser keys only
// when a stricter one finds nothing. Ambiguity at any level means no match.
function matchOne(item, candidates, keys) {
  for (const key of keys) {
    const wanted = key(item);
    const hits = candidates.filter((c) => key(c) === wanted);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

// --- New units: NSO lists + QĐ 2334 codes ---

function loadProvinces() {
  return readTsv("nso-provinces.tsv").map((p) => ({
    code: p.code,
    full: p.name,
    name: stripType(p.name),
    city: p.type !== "Tỉnh",
  }));
}

function applyFixes(rows) {
  const fixes = readTsv("qd2334-fixes.tsv");
  for (const fix of fixes) {
    const row = rows.find((r) => r.province === fix.province && r.stt === fix.stt);
    if (!row || row.name !== fix.printed_name || row.zip !== fix.printed_zip) {
      throw new Error(`QĐ 2334 fix no longer applies: ${JSON.stringify(fix)}`);
    }
    row.name = fix.name;
    row.zip = fix.zip;
  }
  return rows;
}

function attachPostalCodes(provinces, communes) {
  const provinceByBase = new Map(provinces.map((p) => [baseName(p.full), p]));
  const communesByProvince = groupBy(communes, (c) => c.province_code);
  const keys = [(u) => toneKey(u.name), (u) => compactKey(u.name)];
  for (const row of applyFixes(readTsv("qd2334-communes.tsv"))) {
    const province = provinceByBase.get(baseName(row.province));
    if (!province) throw new Error(`QĐ 2334 province not in NSO list: ${row.province}`);
    const pool = communesByProvince.get(province.code).filter((c) => !c.zip);
    const commune = matchOne(row, pool, keys);
    if (!commune) throw new Error(`QĐ 2334 row has no NSO commune: ${JSON.stringify(row)}`);
    commune.zip = row.zip;
  }
  const missing = communes.filter((c) => !c.zip);
  if (missing.length) throw new Error(`NSO communes without a QĐ 2334 code: ${missing.map((c) => c.name)}`);
}

// --- Old units: NSO conversion table + 2017 wards with coordinates ---

// The NSO table spells some prefixes "xã", "Thị Trấn", "Thi trấn" or "Thị Xã".
const TYPE_SPELLING = /^(xã|phường|thị trấn|thi trấn|đặc khu|huyện|quận|thị xã|thành phố)\s/iu;
const CANONICAL_TYPE = {
  "xã": "Xã", "phường": "Phường", "thị trấn": "Thị trấn", "thi trấn": "Thị trấn", "đặc khu": "Đặc khu",
  "huyện": "Huyện", "quận": "Quận", "thị xã": "Thị xã", "thành phố": "Thành phố",
};
function tidyName(name) {
  return name.replace(TYPE_SPELLING, (m, type) => `${CANONICAL_TYPE[type.toLowerCase()]} `);
}

function loadOldUnits() {
  const rows = readTsv("nso-old-to-new.tsv");
  const units = new Map();
  for (const row of rows) {
    // Districts without communes (Côn Đảo, Lý Sơn, ...) became special zones whole.
    const name = tidyName(row.old_name || stripCode(row.old_district));
    const key = row.old_code || `${row.old_province}|${name}`;
    if (!units.has(key)) {
      units.set(key, {
        code: row.old_code,
        name,
        district: row.old_name ? tidyName(stripCode(row.old_district)) : "",
        province: stripCode(row.old_province).replace(/^Quảng Trị$/, "Tỉnh Quảng Trị"),
        targets: [],
      });
    }
    units.get(key).targets.push({ code: row.new_code, whole: !/một phần/i.test(row.note) });
  }
  return [...units.values()];
}

function load2017Wards() {
  const provinces = JSON.parse(fs.readFileSync(path.join(SOURCES, "mabuudien-2017.json"), "utf8"));
  // One scraped row is an address, not a ward ("Xã Trung phúc huyện trùng khánh ...").
  const isAddress = (name) => /\s(huyện|tỉnh)\s/i.test(name);
  return provinces.flatMap((p) =>
    p.districts.flatMap((d) =>
      d.wards.filter((w) => !isAddress(w.name)).map((w) => ({
        name: tidyName(w.name.replace(/\bNT\b/, "Nông trường")),
        district: tidyName(d.name),
        province: p.name,
        provinceSlug: p.slug,
        zip: w.zip || "",
        lat: w.lat ?? null,
        lng: w.lng ?? null,
      })),
    ),
  );
}

// Thừa Thiên Huế became Thành phố Huế in January 2025, before the NSO table was made.
const provinceKey = (name) => baseName(name).replace(/^thua thien hue$/, "hue");

function matchWards(wards, units) {
  const district = (u) => baseName(u.district);
  const passes = [
    (u) => `${district(u)}|${toneKey(u.name, { keepType: true })}`,
    (u) => `${district(u)}|${toneKey(u.name)}`,
    (u) => `${district(u)}|${compactKey(u.name)}`,
    (u) => toneKey(u.name),
    (u) => compactKey(u.name),
  ];
  // One-to-one: a key counts only when it names exactly one unmatched ward and one
  // unclaimed unit in the same province. The last passes ignore the province, as a
  // few NSO rows carry the wrong one (Hà Tiên under An Giang instead of Kiên Giang).
  const scoped = passes.map((pass) => (u) => `${provinceKey(u.province)}|${pass(u)}`);
  for (const keyOf of [...scoped, passes[0], passes[1]]) {
    const openUnits = groupBy(units.filter((u) => !u.ward), keyOf);
    const openWards = groupBy(wards.filter((w) => !w.unit), keyOf);
    for (const [key, group] of openWards) {
      const hits = openUnits.get(key);
      if (group.length !== 1 || !hits || hits.length !== 1) continue;
      group[0].unit = hits[0];
      hits[0].ward = group[0];
    }
  }
}

// A 2017 ward missing from the 2025 table was merged away between 2019 and 2025, into a
// neighbour of the same district. Mergers then often built the new name from syllables of
// the old ones ("Cao Dương" + "Xuân Dương" -> "Cao Xuân Dương"), so a unique best syllable
// overlap with an unmatched unit of the district wins. Otherwise the nearest matched ward
// of the district (or else of the province) is the likeliest successor.
const syllables = (name) => new Set(baseName(name).split(" "));

function successorByName(ward, units) {
  const own = syllables(ward.name);
  const scored = units.map((unit) => [unit, [...syllables(unit.name)].filter((s) => own.has(s)).length]);
  const best = Math.max(0, ...scored.map(([, n]) => n));
  const top = scored.filter(([, n]) => n === best);
  return best > 0 && top.length === 1 ? top[0][0] : null;
}

function nearestMatched(ward, matched) {
  if (ward.lat == null) return null;
  const nearest = (pool) => {
    let best = null;
    for (const other of pool) {
      if (other.lat == null) continue;
      const d = distanceKm(ward, other);
      if (!best || d < best.d) best = { d, other };
    }
    return best?.other;
  };
  const province = matched.filter((w) => w.province === ward.province);
  return nearest(province.filter((w) => w.district === ward.district)) || nearest(province);
}

function centroid(points) {
  const placed = points.filter((p) => p.lat != null);
  if (!placed.length) return null;
  return {
    lat: roundCoord(placed.reduce((s, p) => s + p.lat, 0) / placed.length),
    lng: roundCoord(placed.reduce((s, p) => s + p.lng, 0) / placed.length),
  };
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// Every old unit, official or approximated, as one lookup entry.
function oldEntries(units, wards) {
  const entries = units.map((unit) => ({
    code: unit.code,
    province: unit.province,
    district: unit.district || unit.name,
    name: unit.name,
    zip: unit.ward?.zip || "",
    lat: unit.ward?.lat ?? null,
    lng: unit.ward?.lng ?? null,
    targets: unit.targets,
    unit,
  }));
  const entryOfUnit = new Map(entries.map((e) => [e.unit, e]));
  const matched = wards.filter((w) => w.unit);
  const wholeDistricts = units.filter((u) => !u.district);
  const unmatchedUnits = groupBy(
    units.filter((u) => !u.ward && u.district),
    (u) => `${provinceKey(u.province)}|${baseName(u.district)}`,
  );

  for (const ward of wards.filter((w) => !w.unit)) {
    const entry = {
      code: "",
      province: ward.province,
      district: ward.district,
      name: ward.name,
      zip: ward.zip,
      lat: ward.lat,
      lng: ward.lng,
    };
    const zone = wholeDistricts.find(
      (u) => provinceKey(u.province) === provinceKey(ward.province) && baseName(u.name) === baseName(ward.district),
    );
    const sameDistrict = unmatchedUnits.get(`${provinceKey(ward.province)}|${baseName(ward.district)}`) || [];
    const successor = !zone && (successorByName(ward, sameDistrict) || nearestMatched(ward, matched)?.unit);
    if (zone) {
      entry.targets = zone.targets;
    } else if (successor) {
      entry.targets = successor.targets;
      entry.via = entryOfUnit.get(successor);
    } else {
      const sameDistrict = matched.filter((w) => w.province === ward.province && w.district === ward.district);
      const target = mostCommon(sameDistrict.flatMap((w) => w.unit.targets.map((t) => t.code)));
      entry.targets = target ? [{ code: target, whole: false }] : [];
      entry.via = null;
    }
    entries.push(entry);
  }
  return entries;
}

function placeCommunes(communes, entries) {
  const constituents = groupBy(
    entries.flatMap((e) => e.targets.map((t) => ({ code: t.code, whole: t.whole, entry: e }))),
    (c) => c.code,
  );
  for (const commune of communes) {
    const all = constituents.get(commune.code) || [];
    const official = all.filter((c) => !("via" in c.entry));
    const tiers = [official.filter((c) => c.whole), official, all];
    for (const tier of tiers) {
      const point = centroid(tier.map((c) => c.entry));
      if (point) {
        Object.assign(commune, point);
        break;
      }
    }
  }
}

function provinceSummaries(provinces, communes, entries, wards) {
  const regions = new Map(readTsv("regions.tsv").map((r) => [r.province_code, r.region]));
  // Slugs the previous site used for the 63 old provinces, so old links still land.
  const legacySlug = new Map(wards.map((w) => [provinceKey(w.province), w.provinceSlug]));
  const prefixes = new Map(readTsv("qd2334-provinces.tsv").map((r) => [baseName(r.province), r.prefixes.split(" ")]));
  const formerBy = groupBy(
    entries.filter((e) => e.unit).flatMap((e) =>
      e.targets.map((t) => ({ code: t.code, province: e.province })),
    ),
    (x) => communes.find((c) => c.code === x.code).province_code,
  );
  return provinces.map((p) => {
    const own = communes.filter((c) => c.province_code === p.code);
    const former = [...new Set(formerBy.get(p.code).map((x) => x.province))];
    return {
      code: p.code,
      name: p.name,
      full: p.full,
      city: p.city,
      region: regions.get(p.code),
      prefixes: prefixes.get(baseName(p.full)),
      formerly: former.map(stripType),
      legacy: former.map((name) => legacySlug.get(provinceKey(name))),
      ...centroid(own),
    };
  });
}

function build() {
  const provinces = loadProvinces();
  const communes = readTsv("nso-communes.tsv");
  attachPostalCodes(provinces, communes);
  const notes = new Map(readTsv("qd2334-fixes.tsv").map((f) => [f.zip, f.note]));

  const units = loadOldUnits();
  const wards = load2017Wards();
  matchWards(wards, units);
  const entries = oldEntries(units, wards);
  const zipOf = new Map(communes.map((c) => [c.code, c.zip]));
  placeCommunes(communes, entries);

  const summaries = provinceSummaries(provinces, communes, entries, wards);
  const provinceIndex = new Map(provinces.map((p, i) => [p.code, i]));
  const manifest = JSON.parse(fs.readFileSync(path.join(SOURCES, "manifest.json"), "utf8"));

  const communesJson = {
    sources: manifest.filter((m) => m.url).map(({ title, url, retrieved }) => ({ title, url, retrieved })),
    provinces: summaries,
    // [province index, name, postal code, lat, lng, note?]
    communes: communes.map((c) => {
      const row = [provinceIndex.get(c.province_code), c.name, c.zip, c.lat ?? null, c.lng ?? null];
      return notes.get(c.zip) ? [...row, notes.get(c.zip)] : row;
    }),
  };

  const oldProvinces = [...new Set(entries.map((e) => provinceKey(e.province)))];
  const provinceName = new Map(entries.filter((e) => e.unit).map((e) => [provinceKey(e.province), e.province]));
  const districts = [...new Map(entries.map((e) => {
    const key = `${provinceKey(e.province)}|${e.district}`;
    return [key, [oldProvinces.indexOf(provinceKey(e.province)), e.district]];
  })).entries()];
  const districtIndex = new Map(districts.map(([key], i) => [key, i]));
  const entryIndex = new Map(entries.map((e, i) => [e, i]));

  const oldWardsJson = {
    provinces: oldProvinces.map((key) => stripType(provinceName.get(key))),
    districts: districts.map(([, row]) => row),
    // [district index, name, NSO code ("" if the ward was gone before 2025), 2017 postal code,
    //  lat, lng, [[new postal code, 1 if only part]], via?]
    // via: absent = official NSO mapping; a number = approximated from that entry (nearest
    // official ward); null = approximated from the district's most common new commune.
    wards: entries.map((e) => {
      const row = [
        districtIndex.get(`${provinceKey(e.province)}|${e.district}`),
        e.name,
        e.code,
        e.zip,
        e.lat == null ? null : roundCoord(e.lat),
        e.lng == null ? null : roundCoord(e.lng),
        e.targets.map((t) => [zipOf.get(t.code), t.whole ? 0 : 1]),
      ];
      return "via" in e ? [...row, e.via ? entryIndex.get(e.via) : null] : row;
    }),
  };

  const stats = {
    communes: communes.length,
    unplacedCommunes: communes.filter((c) => c.lat == null).map((c) => `${c.name} (${c.zip})`),
    oldEntries: entries.length,
    official: entries.filter((e) => !("via" in e)).length,
    approximatedNearest: entries.filter((e) => e.via).length,
    approximatedDistrict: entries.filter((e) => "via" in e && !e.via).length,
    wards2017Matched: wards.filter((w) => w.unit).length,
  };
  return { communesJson, oldWardsJson, stats };
}

function writeJson(name, value) {
  const file = path.join(DATA, name);
  fs.writeFileSync(file, JSON.stringify(value) + "\n");
  return `${name}: ${fs.statSync(file).size} bytes`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { communesJson, oldWardsJson, stats } = build();
  console.log(stats);
  console.log(writeJson("communes.json", communesJson));
  console.log(writeJson("old-wards.json", oldWardsJson));
}

