import { fold, baseName } from "./text.js";

const KIND_ORDER = { province: 0, commune: 1 };

function entry(item, context, codes) {
  return {
    item,
    kind: item.kind,
    name: fold(item.name),
    base: baseName(item.name),
    words: ` ${fold(`${item.name} ${context}`)}`,
    codes,
  };
}

export function searchIndex(model) {
  const provinces = model.provinces.map((p) => entry(p, `${p.full} ${p.formerly.join(" ")}`, []));
  const communes = model.communes.map((c) => entry(c, c.province.name, [c.zip]));
  return [...provinces, ...communes];
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
  if (tokens.every((t) => e.words.includes(` ${t}`))) return 4;
  return -1;
}

export function search(index, query, limit = 50) {
  const q = fold(query);
  if (!q) return [];
  const isCode = /^\d{2,5}$/.test(q);
  const tokens = q.split(" ");
  const hits = [];
  for (const e of index) {
    const score = isCode ? codeScore(e, q) : textScore(e, q, tokens);
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
