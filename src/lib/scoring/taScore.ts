import { maxDrawdown, obv, periodReturn } from "./series";

export interface ScoredMetric {
  key: string; label: string; category: string; weight: number;
  value: number | null; score: number | null; unit: "pct" | "x" | "number" | "vnd";
}
export interface Scorecard {
  /** 0-100, re-normalised over available weights. */
  score: number | null;
  /** Share of total weight that had data, 0-100. */
  coverage: number;
  metrics: ScoredMetric[];
}

export function summarize(metrics: ScoredMetric[]): Scorecard {
  const total = metrics.reduce((s, m) => s + m.weight, 0);
  const have = metrics.filter((m) => m.score !== null);
  const weight = have.reduce((s, m) => s + m.weight, 0);
  return {
    score: weight ? have.reduce((s, m) => s + m.score! * m.weight, 0) / weight : null,
    coverage: total ? Math.round((weight / total) * 100) : 0,
    metrics,
  };
}

const EPS = 1e-9;

/** Spread bands; input is a fraction (0.02 = +2%). */
export function spreadScore(x: number): number {
  if (Math.abs(x) < EPS) return 50;
  if (x >= 0.05 - EPS) return 100;
  if (x >= 0.02 - EPS) return 80;
  if (x > 0) return 65;
  if (x >= -0.02 - EPS) return 35;
  if (x >= -0.05 - EPS) return 20;
  return 0;
}

export function volumeScore(ratio: number, dailyReturn: number | null): number {
  const base = ratio >= 2 ? 100 : ratio >= 1.5 ? 85 : ratio >= 1.2 ? 70 : ratio >= 0.8 ? 50 : ratio >= 0.5 ? 30 : 15;
  return dailyReturn !== null && dailyReturn < 0 ? Math.min(base, 40) : base;
}

export function obvScore(x: number): number {
  if (Math.abs(x) < EPS) return 50;
  if (x >= 3) return 100;
  if (x >= 1.5) return 80;
  if (x > 0) return 65;
  if (x > -1.5) return 35;
  if (x > -3) return 20;
  return 0;
}

/** Change in OBV over 21 sessions divided by the 21-session average volume. */
export function normalizedObvChange(closes: number[], volumes: number[]): number | null {
  if (closes.length < 22) return null;
  const series = obv(closes, volumes);
  const avg = volumes.slice(-21).reduce((s, v) => s + v, 0) / 21;
  return avg ? (series[series.length - 1] - series[series.length - 22]) / avg : null;
}

export interface TaInput {
  /** Stock and VNINDEX closes aligned on the same sessions, ascending. */
  closes: number[];
  volumes: number[];
  vniCloses: number[];
  /** close/sma20/sma50 must share one unit (all from the same price series). */
  technicals: { close: number | null; sma20: number | null; sma50: number | null; volumeSma20: number | null; volume: number | null };
}

export function taScorecard({ closes, volumes, vniCloses, technicals: t }: TaInput): Scorecard {
  const spread = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
  const ratio = (a: number | null, b: number | null) => (a === null || !b ? null : a / b);
  const minusOne = (x: number | null) => (x === null ? null : x - 1);
  const metric = (
    key: string, label: string, category: string, weight: number,
    value: number | null, score: (v: number) => number, unit: ScoredMetric["unit"] = "pct",
  ): ScoredMetric => ({ key, label, category, weight, value, unit, score: value === null ? null : score(value) });

  const daily = periodReturn(closes, 1);
  return summarize([
    metric("rs1w", "1W return vs VNI", "Relative strength", 15, spread(periodReturn(closes, 5), periodReturn(vniCloses, 5)), spreadScore),
    metric("rs1m", "1M return vs VNI", "Relative strength", 20, spread(periodReturn(closes, 21), periodReturn(vniCloses, 21)), spreadScore),
    metric("dd1w", "1W max drawdown vs VNI", "Downside resilience", 15, spread(maxDrawdown(closes, 5), maxDrawdown(vniCloses, 5)), spreadScore),
    metric("dd1m", "1M max drawdown vs VNI", "Downside resilience", 15, spread(maxDrawdown(closes, 21), maxDrawdown(vniCloses, 21)), spreadScore),
    metric("sma20", "Close vs SMA20", "Trend", 10, minusOne(ratio(t.close, t.sma20)), spreadScore),
    metric("smaCross", "SMA20 vs SMA50", "Trend", 10, minusOne(ratio(t.sma20, t.sma50)), spreadScore),
    metric("vol", "Latest volume vs 20D avg", "Volume", 10, ratio(t.volume, t.volumeSma20), (v) => volumeScore(v, daily), "x"),
    metric("obv", "OBV trend (1M)", "Volume", 5, normalizedObvChange(closes, volumes), obvScore, "number"),
  ]);
}
