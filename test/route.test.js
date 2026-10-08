import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash, formatHash } from "../lib/route.js";

test("an empty hash is the home view", () => {
  assert.deepEqual(parseHash(""), { view: "home" });
});

test("a bare #/ is the home view", () => {
  assert.deepEqual(parseHash("#/"), { view: "home" });
});

test("one segment is a province", () => {
  assert.deepEqual(parseHash("#/ho-chi-minh"), { view: "province", province: "ho-chi-minh" });
});

test("two segments are a commune inside a province", () => {
  assert.deepEqual(parseHash("#/ho-chi-minh/phuong-sai-gon-71016"), {
    view: "commune",
    province: "ho-chi-minh",
    commune: "phuong-sai-gon-71016",
  });
});

test("percent-encoded Vietnamese segments are decoded and slugified", () => {
  assert.deepEqual(parseHash("#/h%E1%BB%93-ch%C3%AD-minh"), { view: "province", province: "ho-chi-minh" });
});

test("a malformed escape does not throw", () => {
  assert.equal(parseHash("#/ha-noi%E0").view, "province");
});

test("trailing slashes and a missing leading slash are tolerated", () => {
  assert.deepEqual(parseHash("#ha-noi/"), { view: "province", province: "ha-noi" });
});

test("#/cu is the old-address picker", () => {
  assert.deepEqual(parseHash("#/cu"), { view: "old" });
});

test("old-address segments are province, district and ward", () => {
  assert.deepEqual(parseHash("#/cu/ho-chi-minh/quan-1/phuong-ben-nghe-26740"), {
    view: "old",
    province: "ho-chi-minh",
    district: "quan-1",
    ward: "phuong-ben-nghe-26740",
  });
});

test("formatHash of home is empty", () => {
  assert.equal(formatHash({ view: "home" }), "");
});

test("formatHash of a commune joins its segments", () => {
  assert.equal(
    formatHash({ view: "commune", province: "ho-chi-minh", commune: "phuong-sai-gon-71016" }),
    "#/ho-chi-minh/phuong-sai-gon-71016",
  );
});

test("formatHash of a partial old address stops at the last known level", () => {
  assert.equal(formatHash({ view: "old", province: "ha-tay" }), "#/cu/ha-tay");
});

test("every formatted route parses back to itself", () => {
  const routes = [
    { view: "home" },
    { view: "province", province: "hue" },
    { view: "commune", province: "hue", commune: "phuong-thuan-hoa-49006" },
    { view: "old" },
    { view: "old", province: "hue", district: "thi-xa-huong-tra", ward: "phuong-huong-van-19900" },
  ];
  for (const route of routes) assert.deepEqual(parseHash(formatHash(route)), route);
});
