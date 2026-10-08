const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// Greedy: earlier boxes win, so callers order labels by importance.
export function declutter(boxes) {
  const kept = [];
  return boxes.map((box) => {
    if (kept.some((other) => overlaps(box, other))) return false;
    kept.push(box);
    return true;
  });
}
