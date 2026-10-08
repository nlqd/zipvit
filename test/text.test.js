import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, slugify, baseName, stripType } from "../lib/text.js";

test("fold strips Vietnamese diacritics and lowercases", () => {
  assert.equal(fold("Hà Nội"), "ha noi");
});

test("fold maps đ and Đ to d", () => {
  assert.equal(fold("Đồng Đăng"), "dong dang");
});

test("fold treats old and new tone placement the same", () => {
  assert.equal(fold("Hoà Bình"), fold("Hòa Bình"));
});

test("fold collapses and trims whitespace", () => {
  assert.equal(fold("  Phường \n Bến   Nghé "), "phuong ben nghe");
});

test("slugify makes an ASCII hash-safe slug", () => {
  assert.equal(slugify("Thành phố Hồ Chí Minh"), "thanh-pho-ho-chi-minh");
});

test("slugify drops punctuation such as apostrophes", () => {
  assert.equal(slugify("Xã Ea H'leo"), "xa-ea-hleo");
});

test("baseName removes the unit type prefix", () => {
  assert.equal(baseName("Phường Bến Nghé"), "ben nghe");
});

test("baseName removes the abbreviated prefixes used in QĐ 2334", () => {
  assert.equal(baseName("X. Tam Dương Bắc"), "tam duong bac");
});

test("baseName removes district-level prefixes", () => {
  assert.equal(baseName("Thị xã Từ Sơn"), "tu son");
});

test("baseName drops leading zeros in numbered wards", () => {
  assert.equal(baseName("Phường 01"), "1");
});

test("baseName keeps names that are only a type word", () => {
  assert.equal(baseName("Thị trấn"), "thi tran");
});

test("baseName does not cut a prefix out of a longer word", () => {
  assert.equal(baseName("Quảng Ninh"), "quang ninh");
});

test("baseName tells the Tỉnh prefix from the Tịnh place name", () => {
  assert.equal(baseName("Huyện Tịnh Biên"), "tinh bien");
});

test("baseName accepts upper-case prefixes", () => {
  assert.equal(baseName("TỈNH AN GIANG"), "an giang");
});

test("fold drops straight and curly apostrophes", () => {
  assert.equal(fold("Ea H’Leo"), fold("Ea H'leo"));
});

test("stripType removes the unit type but keeps diacritics", () => {
  assert.equal(stripType("Xã Đông Anh"), "Đông Anh");
});
