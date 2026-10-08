import { test } from "node:test";
import assert from "node:assert/strict";
import { declutter } from "../lib/declutter.js";

const box = (x, y, w = 40, h = 14) => ({ left: x, top: y, right: x + w, bottom: y + h });

test("labels that do not touch all stay visible", () => {
  assert.deepEqual(declutter([box(0, 0), box(100, 0), box(0, 100)]), [true, true, true]);
});

test("a label that overlaps an earlier one is hidden", () => {
  assert.deepEqual(declutter([box(0, 0), box(20, 5)]), [true, false]);
});

test("a hidden label does not hide the labels after it", () => {
  assert.deepEqual(declutter([box(0, 0), box(30, 0), box(60, 0)]), [true, false, true]);
});

test("labels that only share an edge both stay visible", () => {
  assert.deepEqual(declutter([box(0, 0), box(40, 0)]), [true, true]);
});
