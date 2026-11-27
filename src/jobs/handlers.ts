/** One handler per job type. Every write is an idempotent upsert. */
import { logWarning, query, upsert } from "../lib/db";
import { INDEX_CODES, type Bar, type Endpoints, type FlowBar, type IndexCode } from "../lib/fhsc/endpoints";
import { vndFactor } from "../lib/fhsc/units";
import { normalizeFundamentals } from "../lib/scoring/faScore";
import { obv } from "../lib/scoring/series";
import { addDays, ictDateToUnix, ictParts, unixToIctDate } from "../lib/time";
import { enqueue, type Job } from "./queue";

export const HISTORY_DAYS = 380;

/** Thrown when the source has not published the expected session yet. */
export class NotReadyError extends Error {}

const today = () => ictParts().date;
const week = () => addDays(today(), -((ictParts().weekday + 6) % 7));

/** Start date: a short overlap if we already hold history, otherwise the full backfill. */
async function since(table: string, keyCol: string, key: string) {
  const [row] = await query<{ min: string | null; max: string | null }>(
    `SELECT min(date)::text AS min, max(date)::text AS max FROM ${table} WHERE ${keyCol} = $1`, [key]);
  const full = addDays(today(), -HISTORY_DAYS);
  return row.max && row.min && row.min <= addDays(full, 30) ? addDays(row.max, -10) : full;
}

const bars = (series: Bar[] | undefined) =>
  (series ?? []).filter((b) => b.c != null).map((b) => ({ ...b, date: unixToIctDate(b.t) })).sort((a, b) => a.t - b.t);

const flowRows = (key: string, keyCol: string, data: FlowBar[]) =>
  data.map((d) => ({
    [keyCol]: key, date: d.date,
    // `total` only: matched/put_through are null, so every figure includes put-through.
    buy_vol: d.buy.total.volume, buy_val: d.buy.total.value,
    sell_vol: d.sell.total.volume, sell_val: d.sell.total.value,
    net_vol: d.buy.total.volume - d.sell.total.volume, net_val: d.buy.total.value - d.sell.total.value,
  }));

async function indexHistory(api: Endpoints, index: IndexCode) {
  const from = await since("index_daily", "index_code", index);
  const res = await api.indexHistory(index, ictDateToUnix(from), ictDateToUnix(addDays(today(), 1)));
  const rows = bars(res.series);
  await upsert("index_daily", ["index_code", "date"], rows.map((b) => ({
    index_code: index, date: b.date, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
  })));
  // The trading calendar is derived from VNINDEX history. Today's bar only counts after the close.
  if (index === "VNINDEX") {
    const done = ictParts().hour >= 15 ? today() : addDays(today(), -1);
    await upsert("calendar", ["date"], rows.filter((b) => b.date <= done).map((b) => ({ date: b.date })));
  }
}

/** S1. Verifies the board is post-close, then queues the rest of the night's work. */
async function board(api: Endpoints, job: Job) {
  const res = await api.indices();
  if (!res.updated_at) throw new NotReadyError("S1 has no updated_at");
  const stamp = ictParts(new Date(res.updated_at));
  const expected = job.session_date!;
  if (stamp.date < expected) {
    if (ictParts().date === expected && ictParts().hour < 20) throw new NotReadyError("Board not updated yet");
    await logWarning(`No board for ${expected} (latest ${stamp.date}); treating as non-trading day`);
    return;
  }
  const postClose = stamp.hour >= 15 || stamp.date > expected;
  if (!postClose) throw new NotReadyError(`Board is pre-close (${res.updated_at})`);
  if (stamp.date !== expected) {
    await logWarning(`Skipped ${expected}: board already shows ${stamp.date}`);
    return;
  }
  const items = res.items.filter((i) => (INDEX_CODES as string[]).includes(i.index));
  if (!items.length) throw new Error("S1 returned neither VNINDEX nor VN30");
  await upsert("index_daily", ["index_code", "date"], items.map((i) => ({
    index_code: i.index, date: expected, close: i.index_value, change: i.change, change_percent: i.change_percent,
    advancers: i.advancers, decliners: i.decliners, unchanged: i.unchanged, volume: i.volume,
    trading_value: i.trading_value, foreign_net_value: i.foreign_net_value, market_cap: i.market_cap,
    board_updated_at: res.updated_at,
  })));
  await upsert("calendar", ["date"], [{ date: expected }]);
  await enqueueNightly(expected);
}

/** S2, all pages. VN30 membership drives the per-ticker jobs. */
async function constituents(api: Endpoints, job: Job) {
  const index = job.symbol as IndexCode;
  const items = [];
  let updatedAt: string | null = null;
  for (let page = 1; page <= 20; page++) {
    const res = await api.constituents(index, page);
    updatedAt = res.updated_at;
    items.push(...res.items);
    if (!res.items.length || items.length >= res.total) break;
  }
  if (!items.length) throw new Error(`No constituents for ${index}`);
  const stamp = updatedAt ? ictParts(new Date(updatedAt)) : null;
  if (stamp && stamp.date === ictParts().date && stamp.hour >= 9 && stamp.hour < 15 && ![0, 6].includes(stamp.weekday)) {
    throw new NotReadyError("Constituent prices are intraday");
  }
  const session = job.session_date ?? stamp?.date;
  if (!session) throw new Error("Cannot date the constituent snapshot");
  if (stamp && stamp.date !== session) {
    await logWarning(`${index} constituents dated ${stamp.date}, expected ${session}; not stored`);
  } else {
    await upsert("constituent_snap", ["index_code", "symbol", "session_date"], items.map((i) => ({
      index_code: index, symbol: i.symbol, session_date: session, name: i.name, price: i.price,
      change_percent: i.change_percent, market_cap: i.market_cap, weight_percent: i.weight_percent,
    })));
  }
  if (index === "VN30") await enqueueTickers(items.map((i) => i.symbol), 5);
}

async function listing(api: Endpoints, symbol: string) {
  const l = await api.listing(symbol);
  await upsert("listing", ["symbol", "fetched_at"], [{
    symbol, fetched_at: new Date().toISOString(), exchange: l.exchange, listed_shares: l.listed_shares,
    outstanding_shares: l.outstanding_shares, free_float_pct: l.free_float_pct,
  }]);
}

async function refreshObv(symbol: string) {
  const rows = await query<{ date: string; close: number; volume: number }>(
    `SELECT date::text, close, coalesce(volume, 0) AS volume FROM stock_daily WHERE symbol = $1 ORDER BY date`, [symbol]);
  const series = obv(rows.map((r) => r.close), rows.map((r) => r.volume));
  await upsert("stock_technicals_daily", ["symbol", "date"], rows.map((r, i) => ({ symbol, date: r.date, obv: series[i] })));
}

async function ohlcv(api: Endpoints, symbol: string) {
  const from = await since("stock_daily", "symbol", symbol);
  const res = await api.stockHistory(symbol, ictDateToUnix(from), ictDateToUnix(addDays(today(), 1)));
  await upsert("stock_daily", ["symbol", "date"], bars(res.series).map((b) => ({ symbol, date: b.date, close: b.c, volume: b.v })));
  await refreshObv(symbol);
}

async function technicals(api: Endpoints, symbol: string) {
  const [row] = await query<{ max: string | null }>(
    `SELECT max(date)::text AS max FROM stock_technicals_daily WHERE symbol = $1 AND sma20 IS NOT NULL`, [symbol]);
  const from = row.max ? addDays(row.max, -10) : addDays(today(), -HISTORY_DAYS);
  const res = await api.technicals(symbol, from, today());
  const byDate = new Map<string, Record<string, unknown>>();
  const at = (date: string) => {
    if (!byDate.has(date)) byDate.set(date, { symbol, date, close: null, sma20: null, sma50: null, volume_sma20: null });
    return byDate.get(date)!;
  };
  for (const p of res.prices ?? []) at(p.date).close = p.close;
  for (const series of res.indicators ?? []) {
    const column = series.indicator === "VOLUME_SMA" ? "volume_sma20" : series.params === "50" ? "sma50" : "sma20";
    for (const point of series.data) at(point.date)[column] = point.value ?? null;
  }
  await upsert("stock_technicals_daily", ["symbol", "date"], [...byDate.values()]);
}

async function foreignStock(api: Endpoints, symbol: string) {
  const res = await api.stockForeign(symbol, await since("foreign_stock_daily", "symbol", symbol), today());
  await upsert("foreign_stock_daily", ["symbol", "date"], flowRows(symbol, "symbol", res.data));
}

async function foreignIndex(api: Endpoints, index: IndexCode) {
  const res = await api.indexForeign(index, await since("foreign_index_daily", "index_code", index), today());
  await upsert("foreign_index_daily", ["index_code", "date"], flowRows(index, "index_code", res.data));
}

async function fundamentals(api: Endpoints, symbol: string) {
  const overview = await api.overview(symbol);
  const analysis = await api.analysis(symbol);
  const cashFlow = await api.statement(symbol, "cash-flow");
  const income = await api.statement(symbol, "income-statement");
  const metrics = normalizeFundamentals(overview, analysis, income, cashFlow);
  if (metrics.ocfToNetIncome === null && income.length) {
    await logWarning(`${symbol}: OCF/net income unavailable. Income statement fields: ${Object.keys(income[0]).slice(0, 25).join(", ")}`);
  }
  await upsert("fundamental_snapshot", ["symbol", "fetched_at"], [{ symbol, fetched_at: new Date().toISOString(), metrics: JSON.stringify(metrics) }]);
}

/** Phase 0: one-off checks of the assumptions the app relies on. Findings go to crawl_log. */
async function probe(api: Endpoints) {
  const s1 = await api.indices();
  const vn = s1.items.find((i) => i.index === "VNINDEX");
  const found = s1.items.map((i) => i.index);
  if (!vn || !found.includes("VN30")) await logWarning(`Probe: S1 indices returned ${found.join(", ")}`);

  const s2 = await api.constituents("VN30", 1);
  const sample = s2.items.filter((i) => i.price && i.market_cap).slice(0, 3);
  for (const item of sample) {
    const l = await api.listing(item.symbol);
    const implied = item.market_cap! / item.price!;
    const off = l.listed_shares ? Math.abs(implied / l.listed_shares - 1) : 1;
    await logWarning(`Probe: ${item.symbol} market_cap/price vs listed_shares differs by ${(off * 100).toFixed(2)}%`);
  }
  if (sample[0]) {
    const symbol = sample[0].symbol;
    const from = addDays(today(), -14);
    const history = bars((await api.stockHistory(symbol, ictDateToUnix(from), ictDateToUnix(addDays(today(), 1)))).series);
    const tech = await api.technicals(symbol, from, today());
    const close = history.at(-1)?.c ?? 0;
    const techClose = tech.prices?.at(-1)?.close ?? 0;
    await logWarning(`Probe: ${symbol} VND factors: S5=${vndFactor(close, sample[0].price!)}, technicals=${vndFactor(techClose, sample[0].price!)}`);
  }
  // The FA bands assume ratios and growth are fractions (0.18 = 18%). Log raw values to confirm.
  if (sample[0]) {
    const o = await api.overview(sample[0].symbol);
    const latest = (await api.analysis(sample[0].symbol)).sort((a, b) => b.year - a.year || (b.quarter ?? 0) - (a.quarter ?? 0))[0];
    await logWarning(`Probe: ${sample[0].symbol} raw FA roe=${o.roe} gross_margin=${o.gross_margin} bienlaisauthue=${latest?.bienlaisauthue} tt_dtt_yoy=${latest?.tt_dtt_yoy}`);
  }

  const s7 = await api.indexForeign("VNINDEX", addDays(today(), -14), today());
  const last = [...s7.data].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (vn && last) {
    const net = last.buy.total.value - last.sell.total.value;
    await logWarning(`Probe: S1 foreign_net_value=${vn.foreign_net_value}, S7 ${last.date} net=${net}`);
  }
}

export async function runJob(api: Endpoints, job: Job) {
  const symbol = job.symbol!;
  switch (job.job_type) {
    case "probe": return probe(api);
    case "board": return board(api, job);
    case "constituents": return constituents(api, job);
    case "index_history": return indexHistory(api, symbol as IndexCode);
    case "foreign_index": return foreignIndex(api, symbol as IndexCode);
    case "listing": return listing(api, symbol);
    case "ohlcv": return ohlcv(api, symbol);
    case "technicals": return technicals(api, symbol);
    case "foreign_stock": return foreignStock(api, symbol);
    case "fundamentals": return fundamentals(api, symbol);
    default: throw new Error(`Unknown job type ${job.job_type}`);
  }
}

/** Phase 1: reference data. VN30 constituents then queue the per-ticker backfill. */
export async function enqueueSeed() {
  await enqueue([
    { type: "probe", period: "once", priority: 0 },
    { type: "index_history", symbol: "VNINDEX", period: "seed", priority: 1 },
    { type: "index_history", symbol: "VN30", period: "seed", priority: 1 },
    { type: "constituents", symbol: "VN30", period: "seed", priority: 2 },
    { type: "constituents", symbol: "VNINDEX", period: "seed", priority: 3 },
    { type: "foreign_index", symbol: "VNINDEX", period: "seed", priority: 4 },
    { type: "foreign_index", symbol: "VN30", period: "seed", priority: 4 },
  ]);
}

/** Phase 2 / Phase 4: first-time history for a set of tickers. */
export async function enqueueTickers(symbols: string[], priority: number) {
  const jobs = [];
  for (const [offset, type] of ["listing", "ohlcv", "technicals", "foreign_stock", "fundamentals"].entries()) {
    for (const symbol of symbols) jobs.push({ type, symbol, period: "seed", priority: priority + offset });
  }
  await enqueue(jobs);
}

/** Phase 3 priorities: P0 board/constituents/index history, P1 index flow, P2 tickers, P3 weekly refresh. */
export async function enqueueNightly(session: string) {
  const tickers = await query<{ symbol: string }>(
    `SELECT symbol FROM constituent_snap WHERE index_code = 'VN30'
       AND session_date = (SELECT max(session_date) FROM constituent_snap WHERE index_code = 'VN30')
     UNION SELECT symbol FROM watchlist ORDER BY symbol`);
  const job = (type: string, symbol: string, priority: number, period = session) => ({ type, symbol, session, period, priority });
  await enqueue([
    ...INDEX_CODES.map((i) => job("constituents", i, 1)),
    ...INDEX_CODES.map((i) => job("index_history", i, 1)),
    ...INDEX_CODES.map((i) => job("foreign_index", i, 2)),
    ...tickers.flatMap((t) => ["foreign_stock", "ohlcv", "technicals"].map((type) => job(type, t.symbol, 3))),
    ...tickers.flatMap((t) => ["listing", "fundamentals"].map((type) => job(type, t.symbol, 40, `w${week()}`))),
  ]);
}
