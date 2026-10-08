import { fold, baseName } from "./text.js";

const KIND_ORDER = { province: 0, commune: 1, oldWard: 2 };
// "Phường 06" and "Phường 6" are the same ward.
const words = (text) => fold(text).replace(/\b0+(\d)/g, "$1");

function entry(item, context, codes) {
  return {
    item,
    kind: item.kind,
    name: words(item.name),
    base: baseName(item.name),
    words: ` ${words(`${item.name} ${context}`)}`,
    codes,
  };
}

export function searchIndex(model) {
  const provinces = model.provinces.map((p) => entry(p, `${p.full} ${p.formerly.join(" ")}`, []));
  const communes = model.communes.map((c) => entry(c, c.province.name, [c.zip]));
  const oldWards = (model.old?.wards || []).map((w) =>
    entry(w, `${w.district.name} ${w.district.province.name}`, w.zip ? [w.zip] : []),
  );
  return [...provinces, ...communes, ...oldWards];
}

function codeScore(e, q) {
  if (e.codes.includes(q)) return 0;
  if (e.codes.some((code) => code.startsWith(q))) return 1;
  return -1;
}

function textScore(e, q, tokens) {
  if (e.base === q || e.name === q) return 0;
  if (e.base.startsWith(q) || e.name.startsWith(q)) return 1;
  if (` ${e.name}`.includes(` ${q}`)) return 2;
  if (e.name.includes(q)) return 3;
  if (!tokens.every((t) => e.words.includes(` ${t}`))) return -1;
  // "phuong 6 quan 3": the name first, then where it is.
  return q.startsWith(`${e.name} `) ? 4 : 5;
}

export function search(index, query, limit = 50) {
  const code = fold(query);
  if (!code) return [];
  const isCode = /^\d{2,5}$/.test(code);
  const text = words(query);
  const tokens = text.split(" ");
  const hits = [];
  for (const e of index) {
    const score = isCode ? codeScore(e, code) : textScore(e, text, tokens);
    if (score >= 0) hits.push({ item: e.item, kind: e.kind, score, e });
  }
  hits.sort(
    (a, b) =>
      a.score - b.score ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (isCode ? a.e.codes[0].localeCompare(b.e.codes[0]) : a.e.name.length - b.e.name.length) ||
      a.e.name.localeCompare(b.e.name),
  );
  return hits.slice(0, limit).map(({ item, kind, score }) => ({ item, kind, score }));
}
