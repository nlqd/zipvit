import { slugify } from "./text.js";

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
  const [first, second] = segments;
  if (!first) return { view: "home" };
  if (!second) return { view: "province", province: first };
  return { view: "commune", province: first, commune: second };
}

export function formatHash(route) {
  const segments = {
    home: [],
    province: [route.province],
    commune: [route.province, route.commune],
  }[route.view].filter(Boolean);
  return segments.length ? `#/${segments.join("/")}` : "";
}
