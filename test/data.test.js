import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { slugify } from "../lib/text.js";

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

test("province slugs are unique and do not collide with the old-address route", () => {
  const slugs = provinces.map((p) => slugify(p.name));
  assert.equal(new Set([...slugs, "cu"]).size, slugs.length + 1);
});

test("the #VALUE! row of QĐ 2334 is Xã Nghi Dương in Hải Phòng", () => {
  const row = communes.find((c) => c[2] === "05127");
  assert.equal(`${provinces[row[0]].name}/${row[1]}`, "Hải Phòng/Xã Nghi Dương");
});

test("Đồng Nai, Quảng Ninh and Bắc Ninh are centrally run cities", () => {
  const cities = provinces.filter((p) => ["Đồng Nai", "Quảng Ninh", "Bắc Ninh"].includes(p.name));
  assert.deepEqual(cities.map((p) => p.full), ["Thành phố Quảng Ninh", "Thành phố Bắc Ninh", "Thành phố Đồng Nai"]);
});
