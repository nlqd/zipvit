import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { REGIONS } from "../lib/regions.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

test("every province's region has a colour", () => {
  const { provinces } = JSON.parse(read("data/communes.json"));
  for (const p of provinces) assert.ok(REGIONS[p.region], `${p.name}: no colour for region ${p.region}`);
});

test("region names are Vietnamese", () => {
  for (const name of Object.keys(REGIONS)) assert.match(name, VIETNAMESE, name);
});

test("accessibility labels in the page are Vietnamese", () => {
  for (const [, label] of read("index.html").matchAll(/aria-label="([^"]*)"/g)) assert.match(label, VIETNAMESE, label);
});
