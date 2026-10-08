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
    const commune = { kind: "commune", name, zip, lat, lng, note, province, slug: slugify(name), formerWards: [] };
    province.communes.push(commune);
    return commune;
  });
  const provinceBySlug = new Map();
  for (const p of provinces) {
    for (const slug of [p.slug, ...(p.legacy || [])]) {
      if (!provinceBySlug.has(slug)) provinceBySlug.set(slug, p);
    }
  }
  const byName = (a, b) => stripType(a.name).localeCompare(stripType(b.name), "vi");
  for (const p of provinces) p.communes.sort(byName);
  return {
    provinces,
    communes,
    byZip: new Map(communes.map((c) => [c.zip, c])),
    provinceBySlug,
    old: null,
  };
}

// Row layout is documented in tools/build-data.js.
export function attachOldWards(model, json) {
  const provinces = json.provinces.map((name) => ({ kind: "oldProvince", name, slug: slugify(name), districts: [] }));
  const districts = json.districts.map(([provinceIndex, name]) => {
    const district = { kind: "oldDistrict", name, slug: slugify(name), province: provinces[provinceIndex], wards: [] };
    district.province.districts.push(district);
    return district;
  });
  const wards = json.wards.map(([districtIndex, name, code, zip, lat, lng, targets, ...via]) => {
    const district = districts[districtIndex];
    const ward = {
      kind: "oldWard",
      name,
      code,
      zip,
      lat,
      lng,
      district,
      slug: code ? `${slugify(name)}-${code}` : slugify(name),
      targets: targets.map(([zip, partial]) => ({ commune: model.byZip.get(zip), partial: partial === 1 })),
      approximate: via.length > 0,
      via: via[0] ?? null,
    };
    district.wards.push(ward);
    return ward;
  });
  for (const ward of wards) {
    if (ward.via !== null) ward.via = wards[ward.via];
    if (ward.approximate) continue;
    for (const target of ward.targets) target.commune.formerWards.push(ward);
  }
  model.old = {
    provinces,
    districts,
    wards,
    provinceBySlug: new Map(provinces.map((p) => [p.slug, p])),
    byCode: new Map(wards.filter((w) => w.code).map((w) => [w.code, w])),
  };
  return model;
}

export function routeOf(item) {
  switch (item.kind) {
    case "province":
      return { view: "province", province: item.slug };
    case "commune":
      return { view: "commune", province: item.province.slug, commune: `${item.slug}-${item.zip}` };
    case "oldProvince":
      return { view: "old", province: item.slug };
    case "oldDistrict":
      return { view: "old", province: item.province.slug, district: item.slug };
    case "oldWard":
      return { ...routeOf(item.district), ward: item.slug };
    default:
      throw new Error(`No route for ${item.kind}`);
  }
}

const trailingCode = (segment) => (segment.match(/(?:^|-)(\d{5})$/) || [])[1];

function resolveOld(old, route) {
  const oldProvince = route.province && old.provinceBySlug.get(route.province);
  if (!oldProvince) return { view: "old" };
  const oldDistrict = route.district && oldProvince.districts.find((d) => d.slug === route.district);
  if (!oldDistrict) return { view: "old", oldProvince };
  const byCode = old.byCode.get(trailingCode(route.ward || ""));
  const oldWard = byCode?.district === oldDistrict ? byCode : oldDistrict.wards.find((w) => w.slug === route.ward);
  return oldWard ? { view: "old", oldProvince, oldDistrict, oldWard } : { view: "old", oldProvince, oldDistrict };
}

export function resolve(model, route) {
  if (route.view === "old") {
    return model.old ? resolveOld(model.old, route) : { view: "old", pending: true };
  }
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
