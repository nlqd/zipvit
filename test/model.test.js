import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModel, attachOldWards, routeOf, resolve, prefixRange } from "../lib/model.js";

const communesJson = {
  provinces: [
    { code: "79", name: "Hồ Chí Minh", full: "Thành phố Hồ Chí Minh", city: true, formerly: ["Hồ Chí Minh", "Bình Dương"], legacy: ["ho-chi-minh", "binh-duong"] },
    { code: "46", name: "Huế", full: "Thành phố Huế", city: true, formerly: ["Huế"], legacy: ["thua-thien-hue"] },
  ],
  communes: [
    [0, "Phường Sài Gòn", "71016", 10.78, 106.7],
    [0, "Phường Tân Định", "71008", 10.79, 106.69],
    [1, "Phường Thuận Hóa", "49006", null, null, "Chưa có vị trí"],
  ],
};

const oldJson = {
  provinces: ["Hồ Chí Minh", "Bình Dương"],
  districts: [[0, "Quận 1"], [1, "Thành phố Thủ Dầu Một"]],
  wards: [
    [0, "Phường Bến Nghé", "26740", "71006", 10.78, 106.7, [["71016", 0]]],
    [0, "Phường Đa Kao", "26734", "", 10.79, 106.69, [["71016", 1], ["71008", 1]]],
    [1, "Phường Biến Mất", "", "75100", 10.9, 106.6, [["71008", 0]], 0],
  ],
};

const fresh = () => attachOldWards(buildModel(communesJson), oldJson);
const names = (items) => items.map((x) => x.name);

test("provinces get slugs from their short names", () => {
  assert.deepEqual(buildModel(communesJson).provinces.map((p) => p.slug), ["ho-chi-minh", "hue"]);
});

test("a commune knows its province", () => {
  assert.equal(buildModel(communesJson).byZip.get("71016").province.name, "Hồ Chí Minh");
});

test("a commune carries its note", () => {
  assert.equal(buildModel(communesJson).byZip.get("49006").note, "Chưa có vị trí");
});

test("routeOf a commune ends in its postal code", () => {
  const model = buildModel(communesJson);
  assert.deepEqual(routeOf(model.byZip.get("71016")), {
    view: "commune",
    province: "ho-chi-minh",
    commune: "phuong-sai-gon-71016",
  });
});

test("resolve finds a commune from its route", () => {
  const model = buildModel(communesJson);
  assert.equal(resolve(model, routeOf(model.byZip.get("71008"))).commune.name, "Phường Tân Định");
});

test("resolve finds a commune from the postal code alone", () => {
  const model = buildModel(communesJson);
  assert.equal(resolve(model, { view: "commune", province: "ho-chi-minh", commune: "71016" }).commune.name, "Phường Sài Gòn");
});

test("resolve falls back to the province for an unknown commune", () => {
  const view = resolve(buildModel(communesJson), { view: "commune", province: "ho-chi-minh", commune: "binh-duong" });
  assert.deepEqual([view.view, view.province.name], ["province", "Hồ Chí Minh"]);
});

test("resolve maps a pre-2025 province slug to its new province", () => {
  const view = resolve(buildModel(communesJson), { view: "province", province: "thua-thien-hue" });
  assert.equal(view.province.name, "Huế");
});

test("resolve sends an unknown province home", () => {
  assert.equal(resolve(buildModel(communesJson), { view: "province", province: "atlantis" }).view, "home");
});

test("an old ward resolves to its new commune", () => {
  const ward = fresh().old.wards[0];
  assert.deepEqual(ward.targets.map((t) => [t.commune.name, t.partial]), [["Phường Sài Gòn", false]]);
});

test("an old ward split across communes lists every one of them", () => {
  const ward = fresh().old.wards[1];
  assert.deepEqual(ward.targets.map((t) => [t.commune.name, t.partial]), [
    ["Phường Sài Gòn", true],
    ["Phường Tân Định", true],
  ]);
});

test("an approximated old ward points at the ward it was approximated from", () => {
  const [benNghe, , gone] = fresh().old.wards;
  assert.deepEqual([gone.approximate, gone.via], [true, benNghe]);
});

test("an official old ward is not approximate", () => {
  assert.equal(fresh().old.wards[0].approximate, false);
});

test("a new commune lists the official old wards merged into it", () => {
  assert.deepEqual(names(fresh().byZip.get("71016").formerWards), ["Phường Bến Nghé", "Phường Đa Kao"]);
});

test("routeOf an official old ward ends in its NSO code", () => {
  assert.deepEqual(routeOf(fresh().old.wards[0]), {
    view: "old",
    province: "ho-chi-minh",
    district: "quan-1",
    ward: "phuong-ben-nghe-26740",
  });
});

test("routeOf an old ward without a code uses its name", () => {
  assert.equal(routeOf(fresh().old.wards[2]).ward, "phuong-bien-mat");
});

test("resolve finds an old ward from its route", () => {
  const model = fresh();
  assert.equal(resolve(model, routeOf(model.old.wards[1])).oldWard.name, "Phường Đa Kao");
});

test("resolve stops at the old district when the ward is unknown", () => {
  const view = resolve(fresh(), { view: "old", province: "ho-chi-minh", district: "quan-1", ward: "nowhere" });
  assert.deepEqual([view.oldDistrict.name, view.oldWard], ["Quận 1", undefined]);
});

test("resolve of an old route waits when old wards are not loaded", () => {
  const view = resolve(buildModel(communesJson), { view: "old", province: "ho-chi-minh" });
  assert.equal(view.pending, true);
});

test("prefixRange collapses consecutive two-digit prefixes", () => {
  assert.equal(prefixRange(["70", "71", "72", "73", "74", "75", "78"]), "70–75, 78");
});

test("prefixRange keeps a single prefix as is", () => {
  assert.equal(prefixRange(["49"]), "49");
});


test("communes are listed alphabetically by name, ignoring Xã and Phường", () => {
  const model = buildModel({
    provinces: [{ code: "01", name: "Hà Nội", formerly: [] }],
    communes: [[0, "Xã Đông Anh", "12001"], [0, "Phường Ba Đình", "11001"], [0, "Xã Dương Hòa", "12002"]],
  });
  assert.deepEqual(model.provinces[0].communes.map((c) => c.name), ["Phường Ba Đình", "Xã Dương Hòa", "Xã Đông Anh"]);
});
