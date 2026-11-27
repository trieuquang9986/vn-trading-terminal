/**
 * REGULAR fundamental scorecard, used for all tickers.
 * Weights come from AGENT.md. The 0-100 bands below are NOT specified there: they are working
 * defaults, kept in one place so they can be tuned.
 */
import type { Overview, PeriodRow } from "../fhsc/endpoints";
import { summarize, type ScoredMetric, type Scorecard } from "./taScore";

export interface FaMetrics {
  roe: number | null; grossMargin: number | null; netMargin: number | null;
  revenueGrowth: number | null; profitGrowth: number | null; epsGrowth: number | null;
  debtToEquity: number | null; currentRatio: number | null;
  ocfToNetIncome: number | null; fcf: number | null; fcfMargin: number | null;
  pe: number | null; peIndustry: number | null; pb: number | null; pbIndustry: number | null;
  evEbitda: number | null; evEbitdaIndustry: number | null;
  latestPeriod: string | null;
}

const NET_INCOME_KEYS = ["loinhuansauthue", "loinhuansauthuethunhapdoanhnghiep", "loinhuansauthuetndn"];
const REVENUE_KEYS = ["doanhthuthuan", "doanhthuthuanvebanhangvacungcapdichvu", "doanhthuthuanvehoatdongkinhdoanh"];
const OCF_KEYS = ["luuchuyentienthuantuhoatdongkinhdoanh"];
const CAPEX_KEYS = ["tienchidemuasamxaydungtaisancodinh"];

const newestFirst = (rows: PeriodRow[]) => [...rows].sort((a, b) => b.year - a.year || (b.quarter ?? 0) - (a.quarter ?? 0));
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const pick = (row: PeriodRow | undefined, keys: string[]) => {
  for (const k of keys) {
    const v = num(row?.[k]);
    if (v !== null) return v;
  }
  return null;
};
/** Sum of the last four quarters; null unless all four exist. */
const ttm = (rows: PeriodRow[], keys: string[]) => {
  const values = newestFirst(rows).slice(0, 4).map((r) => pick(r, keys));
  return values.length === 4 && values.every((v) => v !== null) ? values.reduce((s, v) => s! + v!, 0) : null;
};

export function normalizeFundamentals(
  overview: Overview, analysis: PeriodRow[], income: PeriodRow[], cashFlow: PeriodRow[],
): FaMetrics {
  const q = newestFirst(analysis);
  const latest = q.find((r) => num(r.bienlaisauthue) !== null) ?? q[0];
  const yearAgo = q.find((r) => latest && r.year === latest.year - 1 && r.quarter === latest.quarter);
  const eps = num(latest?.lnwpershare);
  const epsPrev = num(yearAgo?.lnwpershare);

  const netIncome = ttm(income, NET_INCOME_KEYS);
  const revenue = ttm(income, REVENUE_KEYS);
  const ocf = ttm(cashFlow, OCF_KEYS);
  const capex = ttm(cashFlow, CAPEX_KEYS);
  const fcf = ocf !== null && capex !== null ? ocf - Math.abs(capex) : null;

  return {
    roe: num(overview.roe),
    grossMargin: num(overview.gross_margin) ?? num(latest?.bienlaigop),
    netMargin: num(latest?.bienlaisauthue),
    revenueGrowth: num(latest?.tt_dtt_yoy),
    profitGrowth: num(latest?.lnst_yoy),
    epsGrowth: eps !== null && epsPrev ? (eps - epsPrev) / Math.abs(epsPrev) : null,
    debtToEquity: num(latest?.novay_vonchu),
    currentRatio: num(latest?.thanhtoan_hienhanh),
    // With a loss, OCF / net income is meaningless: report 0 (scores 0) rather than a flattering ratio.
    ocfToNetIncome: ocf === null || netIncome === null ? null : netIncome > 0 ? ocf / netIncome : 0,
    fcf,
    fcfMargin: fcf !== null && revenue ? fcf / revenue : null,
    pe: num(overview.pe), peIndustry: num(overview.industry?.pe),
    pb: num(overview.pb), pbIndustry: num(overview.industry?.pb),
    evEbitda: num(overview.ev_ebitda), evEbitdaIndustry: num(overview.industry?.ev_ebitda),
    latestPeriod: latest ? `Q${latest.quarter}/${latest.year}` : null,
  };
}

/** Higher is better: thresholds for 100/80/60/40/20, anything below scores 0. */
const higher = (v: number, [a, b, c, d, e]: number[]) => (v >= a ? 100 : v >= b ? 80 : v >= c ? 60 : v >= d ? 40 : v >= e ? 20 : 0);
/** Lower is better. */
const lower = (v: number, [a, b, c, d, e]: number[]) => (v <= a ? 100 : v <= b ? 80 : v <= c ? 60 : v <= d ? 40 : v <= e ? 20 : 0);

export const BANDS = {
  roe: [0.2, 0.15, 0.1, 0.05, 0],
  grossMargin: [0.4, 0.3, 0.2, 0.1, 0],
  netMargin: [0.2, 0.15, 0.1, 0.05, 0],
  growth: [0.2, 0.1, 0.05, 0, -0.1],
  debtToEquity: [0.5, 1, 1.5, 2, 3],
  currentRatio: [2, 1.5, 1.2, 1, 0.8],
  ocfToNetIncome: [1.2, 1, 0.8, 0.5, 0.01],
  valuationVsIndustry: [0.7, 0.9, 1.1, 1.3, 1.6],
};

const FIELDS = [
  "roe", "grossMargin", "netMargin", "revenueGrowth", "profitGrowth", "epsGrowth", "debtToEquity", "currentRatio",
  "ocfToNetIncome", "fcf", "fcfMargin", "pe", "peIndustry", "pb", "pbIndustry", "evEbitda", "evEbitdaIndustry",
] as const;

export function faScorecard(input: Partial<FaMetrics>): Scorecard {
  // Absent fields must read as null: `undefined` would otherwise be scored.
  const m = { latestPeriod: input.latestPeriod ?? null, ...Object.fromEntries(FIELDS.map((k) => [k, input[k] ?? null])) } as FaMetrics;
  const metric = (
    key: string, label: string, category: string, weight: number,
    value: number | null, score: number | null, unit: ScoredMetric["unit"],
  ): ScoredMetric => ({ key, label, category, weight, value, score, unit });
  const scored = (v: number | null, f: (x: number) => number) => (v === null ? null : f(v));
  const valuation = (own: number | null, industry: number | null) => {
    if (own === null || industry === null || industry <= 0) return null;
    return own <= 0 ? 0 : lower(own / industry, BANDS.valuationVsIndustry);
  };
  const relative = (own: number | null, industry: number | null) => (own === null || !industry ? null : own / industry);
  const fcfScore =
    m.fcf === null ? null
    : m.fcf <= 0 ? 0
    : m.fcfMargin === null ? 70
    : m.fcfMargin >= 0.15 ? 100 : m.fcfMargin >= 0.08 ? 80 : m.fcfMargin >= 0.03 ? 60 : 50;

  return summarize([
    metric("roe", "ROE", "Profitability", 10, m.roe, scored(m.roe, (v) => higher(v, BANDS.roe)), "pct"),
    metric("gm", "Gross margin", "Profitability", 5, m.grossMargin, scored(m.grossMargin, (v) => higher(v, BANDS.grossMargin)), "pct"),
    metric("nm", "Net margin", "Profitability", 5, m.netMargin, scored(m.netMargin, (v) => higher(v, BANDS.netMargin)), "pct"),
    metric("rev", "Revenue growth YoY", "Growth", 10, m.revenueGrowth, scored(m.revenueGrowth, (v) => higher(v, BANDS.growth)), "pct"),
    metric("np", "Net profit growth YoY", "Growth", 10, m.profitGrowth, scored(m.profitGrowth, (v) => higher(v, BANDS.growth)), "pct"),
    metric("eps", "EPS growth YoY", "Growth", 5, m.epsGrowth, scored(m.epsGrowth, (v) => higher(v, BANDS.growth)), "pct"),
    metric("de", "Debt / equity", "Financial health", 7, m.debtToEquity, scored(m.debtToEquity, (v) => (v < 0 ? 0 : lower(v, BANDS.debtToEquity))), "x"),
    metric("cr", "Current ratio", "Financial health", 5, m.currentRatio, scored(m.currentRatio, (v) => higher(v, BANDS.currentRatio)), "x"),
    metric("ocf", "OCF / net income (TTM)", "Cash flow", 8, m.ocfToNetIncome, scored(m.ocfToNetIncome, (v) => higher(v, BANDS.ocfToNetIncome)), "x"),
    metric("fcf", "Free cash flow (TTM)", "Cash flow", 5, m.fcf, fcfScore, "vnd"),
    metric("pe", "P/E vs industry", "Valuation", 10, relative(m.pe, m.peIndustry), valuation(m.pe, m.peIndustry), "x"),
    metric("pb", "P/B vs industry", "Valuation", 5, relative(m.pb, m.pbIndustry), valuation(m.pb, m.pbIndustry), "x"),
    metric("ev", "EV/EBITDA vs industry", "Valuation", 5, relative(m.evEbitda, m.evEbitdaIndustry), valuation(m.evEbitda, m.evEbitdaIndustry), "x"),
  ]);
}

export function totalHealth(fa: Scorecard, ta: Scorecard) {
  if (fa.score === null || ta.score === null) return { score: null, partial: true };
  return { score: 0.55 * fa.score + 0.45 * ta.score, partial: fa.coverage < 100 || ta.coverage < 100 };
}
