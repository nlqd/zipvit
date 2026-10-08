import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../lib/model.js";
import { searchIndex, search } from "../lib/search.js";

const model = buildModel({
  provinces: [
    { code: "01", name: "Hà Nội", full: "Thành phố Hà Nội", formerly: ["Hà Nội"] },
    { code: "79", name: "Hồ Chí Minh", full: "Thành phố Hồ Chí Minh", formerly: ["Hồ Chí Minh", "Bình Dương"] },
  ],
  communes: [
    [0, "Phường Hoàn Kiếm", "10010", 21.02, 105.85],
    [0, "Xã Hà Nội Mới", "10999", 21.1, 105.9],
    [1, "Xã Tân Sài", "71500", 10.9, 106.5],
    [1, "Phường Sài Gòn", "71016", 10.78, 106.7],
    [1, "Phường Tân Định", "71008", 10.79, 106.69],
    [1, "Phường Bình Dương", "75106", 10.98, 106.65],
  ],
});
const index = searchIndex(model);
const first = (query) => search(index, query)[0]?.item.name;
const names = (query, limit) => search(index, query, limit).map((r) => r.item.name);

test("an empty query finds nothing", () => {
  assert.deepEqual(search(index, "  "), []);
});

test("a province name without diacritics finds the province first", () => {
  assert.equal(first("ha noi"), "Hà Nội");
});

test("matching ignores case and diacritics", () => {
  assert.equal(first("HOÀN KIẾM"), "Phường Hoàn Kiếm");
});

test("a query typed with d matches a name spelled with đ", () => {
  assert.equal(first("tan dinh"), "Phường Tân Định");
});

test("a new commune name is found", () => {
  assert.equal(first("Sài Gòn"), "Phường Sài Gòn");
});

test("a name that starts with the query ranks above one that merely contains it", () => {
  assert.deepEqual(names("sai"), ["Phường Sài Gòn", "Xã Tân Sài"]);
});

test("an exact new postal code finds its commune", () => {
  assert.equal(first("71016"), "Phường Sài Gòn");
});

test("a partial code lists communes in code order", () => {
  assert.deepEqual(names("710"), ["Phường Tân Định", "Phường Sài Gòn"]);
});

test("words can match the place a unit sits in", () => {
  assert.equal(first("hoan kiem ha noi"), "Phường Hoàn Kiếm");
});

test("a pre-2025 province name finds the province it joined", () => {
  assert.deepEqual(names("binh duong"), ["Phường Bình Dương", "Hồ Chí Minh"]);
});

test("results are capped at the limit", () => {
  assert.equal(search(index, "phuong", 2).length, 2);
});

test("each result says what kind of place it is", () => {
  assert.deepEqual(search(index, "ha noi").slice(0, 2).map((r) => r.kind), ["province", "commune"]);
});
