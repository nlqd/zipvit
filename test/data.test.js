import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { slugify } from "../lib/text.js";
import { buildModel, attachOldWards, routeOf, resolve } from "../lib/model.js";
import { parseHash, formatHash } from "../lib/route.js";
import { searchIndex, search } from "../lib/search.js";

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
const { provinces, communes } = read("communes.json");
const oldWards = read("old-wards.json");
const zips = new Set(communes.map((c) => c[2]));

test("there are exactly 34 provinces", () => {
  assert.equal(provinces.length, 34);
});

test("there are 3,321 communes, one per NSO unit", () => {
  assert.equal(communes.length, 3321);
});

test("every postal code has five digits", () => {
  assert.deepEqual(communes.filter((c) => !/^\d{5}$/.test(c[2])), []);
});

test("postal codes are unique", () => {
  assert.equal(zips.size, communes.length);
});

test("every commune belongs to a province", () => {
  assert.deepEqual(communes.filter((c) => !provinces[c[0]]), []);
});

test("every province has communes", () => {
  const used = new Set(communes.map((c) => c[0]));
  assert.deepEqual(provinces.filter((_, i) => !used.has(i)).map((p) => p.name), []);
});

test("every postal code starts with a prefix QĐ 2334 gives its province", () => {
  assert.deepEqual(communes.filter((c) => !provinces[c[0]].prefixes.includes(c[2].slice(0, 2))), []);
});

test("every old ward maps to at least one existing new commune", () => {
  const broken = oldWards.wards.filter((w) => !w[6].length || w[6].some(([zip]) => !zips.has(zip)));
  assert.deepEqual(broken, []);
});

test("province slugs are unique and do not collide with the old-address route #/cu", () => {
  const slugs = provinces.map((p) => slugify(p.name));
  assert.equal(new Set([...slugs, "cu"]).size, slugs.length + 1);
});

test("every province, commune and old ward link opens that same item", () => {
  const model = attachOldWards(buildModel(read("communes.json")), oldWards);
  const items = [...model.provinces, ...model.communes, ...model.old.wards];
  const broken = items.filter((item) => {
    const view = resolve(model, parseHash(formatHash(routeOf(item))));
    return (view.oldWard || view.commune || view.province) !== item;
  });
  assert.deepEqual(broken.map((item) => item.name), []);
});

test("every pre-2025 province slug leads to its new province", () => {
  const legacy = provinces.flatMap((p) => p.legacy);
  assert.equal(new Set(legacy).size, 63);
});

test("the acceptance queries return what the home page promises", () => {
  const index = searchIndex(attachOldWards(buildModel(read("communes.json")), oldWards));
  const top = (query) => {
    const [hit] = search(index, query);
    return `${hit.kind}:${hit.item.name}`;
  };
  assert.deepEqual(
    ["ha noi", "71006", "Bến Nghé", "Sài Gòn"].map(top),
    ["province:Hà Nội", "oldWard:Phường Bến Nghé", "oldWard:Phường Bến Nghé", "commune:Phường Sài Gòn"],
  );
});

test("the #VALUE! row of QĐ 2334 is Xã Nghi Dương in Hải Phòng", () => {
  const row = communes.find((c) => c[2] === "05127");
  assert.equal(`${provinces[row[0]].name}/${row[1]}`, "Hải Phòng/Xã Nghi Dương");
});

test("Đồng Nai, Quảng Ninh and Bắc Ninh are centrally run cities", () => {
  const cities = provinces.filter((p) => ["Đồng Nai", "Quảng Ninh", "Bắc Ninh"].includes(p.name));
  assert.deepEqual(cities.map((p) => p.full), ["Thành phố Quảng Ninh", "Thành phố Bắc Ninh", "Thành phố Đồng Nai"]);
});

test("Phường Bến Nghé now belongs to Phường Sài Gòn", () => {
  const model = attachOldWards(buildModel(read("communes.json")), oldWards);
  const benNghe = model.old.wards.find((w) => w.name === "Phường Bến Nghé" && w.district.name === "Quận 1");
  assert.deepEqual(benNghe.targets.map((t) => `${t.commune.name} ${t.commune.zip}`), ["Phường Sài Gòn 71016"]);
});
