import { slugify } from "./text.js";

const OLD = "cu";

function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseHash(hash) {
  const segments = hash
    .replace(/^#/, "")
    .split("/")
    .map((s) => slugify(decode(s)))
    .filter(Boolean);
  const [first, second, third, fourth] = segments;
  if (!first) return { view: "home" };
  if (first === OLD) {
    const route = { view: "old" };
    if (second) route.province = second;
    if (third) route.district = third;
    if (fourth) route.ward = fourth;
    return route;
  }
  if (!second) return { view: "province", province: first };
  return { view: "commune", province: first, commune: second };
}

export function formatHash(route) {
  const segments = {
    home: [],
    province: [route.province],
    commune: [route.province, route.commune],
    old: [OLD, route.province, route.district, route.ward],
  }[route.view].filter(Boolean);
  return segments.length ? `#/${segments.join("/")}` : "";
}
