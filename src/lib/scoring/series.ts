/** Small pure helpers over ascending daily series. */

/** Return over `n` sessions (needs n + 1 closes). */
export function periodReturn(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const base = closes[closes.length - 1 - n];
  return base ? closes[closes.length - 1] / base - 1 : null;
}

/** Max drawdown (<= 0) over the last `n` intervals, i.e. n + 1 closes. */
export function maxDrawdown(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  let peak = -Infinity;
  let worst = 0;
  for (const c of closes.slice(-(n + 1))) {
    peak = Math.max(peak, c);
    worst = Math.min(worst, c / peak - 1);
  }
  return worst;
}

/** Cumulative on-balance volume, OBV_0 = 0. */
export function obv(closes: number[], volumes: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) out.push(0);
    else out.push(out[i - 1] + Math.sign(closes[i] - closes[i - 1]) * volumes[i]);
  }
  return out;
}

/** Values of `series` on each calendar date, carrying the last close forward over non-traded sessions. */
export function alignToCalendar(dates: string[], series: Map<string, number>): number[] {
  const out: number[] = [];
  let last: number | undefined;
  for (const d of dates) {
    last = series.get(d) ?? last;
    if (last !== undefined) out.push(last);
  }
  return out;
}
