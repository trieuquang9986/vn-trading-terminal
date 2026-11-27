export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Binary-split treemap: halves the (descending) list by value, cutting the longer side.
 * Coordinates are in the same units as `box`.
 */
export function treemap<T>(items: T[], value: (t: T) => number, box: Rect): (Rect & { item: T })[] {
  if (!items.length) return [];
  if (items.length === 1) return [{ ...box, item: items[0] }];
  const total = items.reduce((s, i) => s + value(i), 0);
  let sum = 0;
  let cut = 0;
  while (cut < items.length - 1 && sum + value(items[cut]) / 2 <= total / 2) sum += value(items[cut++]);
  if (cut === 0) sum = value(items[cut++]);
  const share = total ? sum / total : 0.5;
  const wide = box.w >= box.h;
  const first = wide ? { ...box, w: box.w * share } : { ...box, h: box.h * share };
  const second = wide
    ? { x: box.x + first.w, y: box.y, w: box.w - first.w, h: box.h }
    : { x: box.x, y: box.y + first.h, w: box.w, h: box.h - first.h };
  return [...treemap(items.slice(0, cut), value, first), ...treemap(items.slice(cut), value, second)];
}
