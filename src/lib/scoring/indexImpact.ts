import type { IndexCode } from "../fhsc/endpoints";

export interface Member {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  marketCap: number | null;
  outstandingShares?: number | null;
  freeFloatPct?: number | null;
}

/** HOSE rounds free float up to the next 5% step. Returns a fraction. */
export const freeFloatBucket = (pct: number) => Math.min(100, Math.ceil(pct / 5 - 1e-9) * 5) / 100;

/** Caps each weight at `cap`, redistributing the excess pro rata over uncapped names. */
export function capWeights(raw: number[], cap = 0.1): number[] {
  const total = raw.reduce((s, x) => s + x, 0);
  if (!total) return raw.map(() => 0);
  const capped = new Set<number>();
  for (;;) {
    const free = 1 - capped.size * cap;
    const rest = raw.reduce((s, x, i) => (capped.has(i) ? s : s + x), 0);
    const weights = raw.map((x, i) => (capped.has(i) ? cap : rest ? (x / rest) * free : 0));
    const over = weights.findIndex((w, i) => !capped.has(i) && w > cap + 1e-12);
    if (over < 0) return weights;
    capped.add(over);
  }
}

/**
 * Weights (fractions) at the prices given.
 * VN30: price x outstanding shares x free-float bucket, 10% cap.
 * VNINDEX: market cap (price x listed shares as reported by FHSC), no adjustment.
 */
export function indexWeights(index: IndexCode, members: Member[]): { weights: Map<string, number>; missing: string[] } {
  const missing: string[] = [];
  const raw = members.map((m) => {
    if (index === "VN30") {
      if (m.price && m.outstandingShares && m.freeFloatPct != null) {
        return m.price * m.outstandingShares * freeFloatBucket(m.freeFloatPct);
      }
      missing.push(m.symbol);
      return 0;
    }
    if (!m.marketCap) missing.push(m.symbol);
    return m.marketCap ?? 0;
  });
  const total = raw.reduce((s, x) => s + x, 0);
  const weights = index === "VN30" ? capWeights(raw) : raw.map((x) => (total ? x / total : 0));
  return { weights: new Map(members.map((m, i) => [m.symbol, weights[i]])), missing };
}

/**
 * Point contribution of each member for one session.
 * `previous` is the prior session's snapshot; without it, prior prices are recovered from change %.
 */
export function pointContributions(
  index: IndexCode, prevIndexValue: number, today: Member[], previous?: Member[],
) {
  const base: Member[] = previous?.length
    ? previous
    : today.map((m) => {
        const factor = 1 + (m.changePercent ?? 0) / 100;
        return {
          ...m,
          price: m.price && factor ? m.price / factor : m.price,
          marketCap: m.marketCap && factor ? m.marketCap / factor : m.marketCap,
        };
      });
  // Shares and free float are looked up on today's rows so older snapshots stay usable.
  const shares = new Map(today.map((m) => [m.symbol, m]));
  const withShares = base.map((m) => ({
    ...m,
    outstandingShares: m.outstandingShares ?? shares.get(m.symbol)?.outstandingShares,
    freeFloatPct: m.freeFloatPct ?? shares.get(m.symbol)?.freeFloatPct,
  }));
  const { weights, missing } = indexWeights(index, withShares);
  const points = new Map<string, number>();
  for (const m of today) {
    points.set(m.symbol, prevIndexValue * (weights.get(m.symbol) ?? 0) * ((m.changePercent ?? 0) / 100));
  }
  return { points, weights, missing };
}
