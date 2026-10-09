import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";

const root = new URL("../", import.meta.url);

test("vendored files match the integrity hashes in index.html", () => {
  const pinned = [...fs.readFileSync(new URL("index.html", root), "utf8").matchAll(/="(vendor\/[^"]+)" integrity="(sha256-[^"]+)"/g)];
  assert.ok(pinned.length >= 2);
  for (const [, url, integrity] of pinned) {
    const digest = createHash("sha256").update(fs.readFileSync(new URL(url, root))).digest("base64");
    assert.equal(`sha256-${digest}`, integrity, url);
  }
});
