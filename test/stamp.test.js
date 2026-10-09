import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { modules, stamped } from "../tools/stamp.js";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("index.html and app.js carry the current version tags", () => {
  for (const [file, content] of Object.entries(stamped(read, modules()))) {
    assert.equal(read(file), content, `${file} is stale: run node tools/stamp.js`);
  }
});

test("every lib module is versioned through the import map", () => {
  const map = JSON.parse(read("index.html").match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  for (const file of modules()) assert.match(map[`./lib/${file}`] ?? "", /^\.\/lib\/[\w.-]+\.js\?v=[0-9a-f]{10}$/, file);
});

test("the data files app.js fetches are versioned", () => {
  const fetched = [...read("app.js").matchAll(/fetch\("(data\/[^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(fetched.length >= 2);
  for (const url of fetched) assert.match(url, /\.json\?v=[0-9a-f]{10}$/);
});

test("changing a file changes the page that loads it", () => {
  const edited = (file) => (file === "lib/text.js" ? read(file) + "\n// edited\n" : read(file));
  assert.notEqual(stamped(edited, modules())["index.html"], stamped(read, modules())["index.html"]);
});

test("stamping twice changes nothing", () => {
  const once = stamped(read, modules());
  const twice = stamped((file) => once[file] ?? read(file), modules());
  assert.deepEqual(twice, once);
});

test("every local script and stylesheet is tagged or in a versioned vendor folder", () => {
  const loaded = [...read("index.html").matchAll(/<script\b[^>]*\bsrc="([^"]+)"|<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)]
    .map((m) => m[1] ?? m[2])
    .filter((url) => !/^https?:/.test(url));
  assert.ok(loaded.length >= 4);
  for (const url of loaded) assert.match(url, /\?v=[0-9a-f]{10}$|^vendor\/[\w-]+-\d+\.\d+\.\d+\//, url);
});
