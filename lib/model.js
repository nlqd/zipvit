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
  const provinceBySlug = new Map();
  for (const p of provinces) {
    for (const slug of [p.slug, ...(p.legacy || [])]) {
      if (!provinceBySlug.has(slug)) provinceBySlug.set(slug, p);
    }
  }
  return {
    provinces,
    communes,
    byZip: new Map(communes.map((c) => [c.zip, c])),
    provinceBySlug,
  };
}

export function routeOf(item) {
  switch (item.kind) {
    case "province":
      return { view: "province", province: item.slug };
    case "commune":
      return { view: "commune", province: item.province.slug, commune: `${item.slug}-${item.zip}` };
    default:
      throw new Error(`No route for ${item.kind}`);
  }
}

const trailingCode = (segment) => (segment.match(/(?:^|-)(\d{5})$/) || [])[1];

export function resolve(model, route) {
  const province = route.province && model.provinceBySlug.get(route.province);
  if (!province) return { view: "home" };
  if (route.view !== "commune") return { view: "province", province };
  const commune =
    model.byZip.get(trailingCode(route.commune)) || province.communes.find((c) => c.slug === route.commune);
  return commune ? { view: "commune", province: commune.province, commune } : { view: "province", province };
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
