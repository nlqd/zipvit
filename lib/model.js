import { slugify, stripType } from "./text.js";

export function buildModel(json) {
  const provinces = json.provinces.map((p, index) => ({
    ...p,
    kind: "province",
    index,
    slug: slugify(p.name),
    communes: [],
  }));
  const communes = json.communes.map(([provinceIndex, name, zip, lat, lng, note]) => {
    const province = provinces[provinceIndex];
    const commune = { kind: "commune", name, zip, lat, lng, note, province, slug: slugify(name) };
    province.communes.push(commune);
    return commune;
  });
  const byName = (a, b) => stripType(a.name).localeCompare(stripType(b.name), "vi");
  for (const p of provinces) p.communes.sort(byName);
  return {
    provinces,
    communes,
    byZip: new Map(communes.map((c) => [c.zip, c])),
  };
}

export function prefixRange(prefixes) {
  const runs = [];
  for (const prefix of prefixes) {
    const run = runs.at(-1);
    if (run && Number(prefix) === Number(run.at(-1)) + 1) run.push(prefix);
    else runs.push([prefix]);
  }
  return runs.map((run) => (run.length > 1 ? `${run[0]}–${run.at(-1)}` : run[0])).join(", ");
}
