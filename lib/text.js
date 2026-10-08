export function fold(text) {
  return String(text)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .replace(/['’ʼ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(text) {
  return fold(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Matched before folding: folded, "Quận" and "Quảng" or "Tỉnh" and "Tịnh" look alike.
const TYPE_PREFIX = /^(?:(?:thành phố|thị xã|thị trấn|đặc khu|huyện|quận|phường|xã|tỉnh)\s+|(?:tp|tt|x|p)\.\s*)/iu;

export function stripType(name) {
  const full = String(name).normalize("NFC").trim();
  return full.replace(TYPE_PREFIX, "") || full;
}

export function baseName(name) {
  return fold(stripType(name)).replace(/\b0+(\d)/g, "$1");
}
