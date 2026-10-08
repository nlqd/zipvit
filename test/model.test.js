import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModel, routeOf, resolve, prefixRange } from "../lib/model.js";

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
