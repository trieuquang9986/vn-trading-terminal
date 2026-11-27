/** One handler per job type. Every write is an idempotent upsert. */
import { logWarning, query, upsert } from "../lib/db";
import { INDEX_CODES, type Bar, type Endpoints, type FlowBar, type IndexCode } from "../lib/fhsc/endpoints";
import { vndFactor } from "../lib/fhsc/units";
import { normalizeFundamentals } from "../lib/scoring/faScore";
import { obv, sma } from "../lib/scoring/series";
import { addDays, ictDateToUnix, ictParts, unixToIctDate } from "../lib/time";
import { enqueue, PRIORITY, type Job, type NewJob } from "./queue";

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

/** Latest date whose session can be complete. Today's partial figures are never stored as history. */
const lastClosed = () => (ictParts().hour >= 15 ? today() : addDays(today(), -1));

const bars = (series: Bar[] | undefined) =>
  (series ?? []).filter((b) => b.c != null).map((b) => ({ ...b, date: unixToIctDate(b.t) }))
    .filter((b) => b.date <= lastClosed()).sort((a, b) => a.t - b.t);

const flowRows = (key: string, keyCol: string, data: FlowBar[]) =>
  data.filter((d) => d.date <= lastClosed()).map((d) => ({
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
  // The trading calendar is derived from VNINDEX history.
  if (index === "VNINDEX") await upsert("calendar", ["date"], rows.map((b) => ({ date: b.date })));
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

/** S2, all pages. VN30 membership sets priority; VNINDEX membership is the HOSE universe. */
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
  // Membership is usable even while prices are intraday, so history loading starts at once.
  const symbols = items.map((i) => i.symbol);
  await (index === "VN30" ? enqueueVn30(symbols) : enqueueUniverse(symbols));
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
    if (index === "VN30") await enqueueVn30Refresh(symbols, session);
  }
}

async function listing(api: Endpoints, symbol: string) {
  const l = await api.listing(symbol);
  await upsert("listing", ["symbol", "fetched_at"], [{
    symbol, fetched_at: new Date().toISOString(), exchange: l.exchange, listed_shares: l.listed_shares,
    outstanding_shares: l.outstanding_shares, free_float_pct: l.free_float_pct,
  }]);
}

/** SMA20, SMA50, volume SMA20 and OBV from stored bars, which saves a /technicals call per ticker. */
async function refreshDerived(symbol: string) {
  const rows = await query<{ date: string; close: number; volume: number }>(
    `SELECT date::text, close, coalesce(volume, 0) AS volume FROM stock_daily WHERE symbol = $1 AND close IS NOT NULL ORDER BY date`, [symbol]);
  const closes = rows.map((r) => r.close);
  const volumes = rows.map((r) => r.volume);
  const [onBalance, sma20, sma50, volume20] = [obv(closes, volumes), sma(closes, 20), sma(closes, 50), sma(volumes, 20)];
  await upsert("stock_technicals_daily", ["symbol", "date"], rows.map((r, i) => ({
    symbol, date: r.date, close: r.close, sma20: sma20[i], sma50: sma50[i], volume_sma20: volume20[i], obv: onBalance[i],
  })));
}

async function ohlcv(api: Endpoints, symbol: string) {
  const from = await since("stock_daily", "symbol", symbol);
  const res = await api.stockHistory(symbol, ictDateToUnix(from), ictDateToUnix(addDays(today(), 1)));
  await upsert("stock_daily", ["symbol", "date"], bars(res.series).map((b) => ({ symbol, date: b.date, close: b.c, volume: b.v })));
  await refreshDerived(symbol);
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
    case "foreign_stock": return foreignStock(api, symbol);
    case "fundamentals": return fundamentals(api, symbol);
    default: throw new Error(`Unknown job type ${job.job_type}`);
  }
}

/** Phase 1: reference data. The constituent lists then queue the per-ticker backfill. */
export async function enqueueSeed() {
  const job = (type: string, priority: number, symbol?: string) => ({ type, symbol, period: type === "probe" ? "once" : "seed", priority });
  await enqueue([
    job("probe", PRIORITY.BOARD),
    ...INDEX_CODES.map((i) => job("index_history", PRIORITY.MARKET, i)),
    job("constituents", PRIORITY.MARKET, "VN30"),
    job("constituents", PRIORITY.MARKET, "VNINDEX"),
    ...INDEX_CODES.map((i) => job("foreign_index", PRIORITY.INDEX_FLOW, i)),
  ]);
}

const seed = (type: string, symbol: string, priority: number): NewJob => ({ type, symbol, period: "seed", priority });

/** First load for VN30: flow and prices for all 30, then listing (index weights), then fundamentals. */
async function enqueueVn30(symbols: string[]) {
  await enqueue(["foreign_stock", "ohlcv", "listing", "fundamentals"].flatMap((type, step) =>
    symbols.map((s) => seed(type, s, PRIORITY.VN30_SEED + step))));
}

/**
 * First load for the rest of HOSE, largest first: flow and prices for everyone, then fundamentals.
 * VN30 names are included; their higher priority wins.
 */
async function enqueueUniverse(symbols: string[]) {
  await enqueue([
    ...symbols.flatMap((s) => [seed("foreign_stock", s, PRIORITY.HOSE_SEED), seed("ohlcv", s, PRIORITY.HOSE_SEED)]),
    ...symbols.map((s) => seed("fundamentals", s, PRIORITY.HOSE_SEED_FA)),
  ]);
}

async function enqueueVn30Refresh(symbols: string[], session: string) {
  const job = (type: string, symbol: string, priority: number, period = session) => ({ type, symbol, session, period, priority });
  // Weekly data that is already queued, or was fetched in the last 6 days, is not requested again.
  const recent = new Set((await query<{ key: string }>(
    `SELECT job_type || ':' || symbol AS key FROM crawl_queue WHERE job_type IN ('listing', 'fundamentals')
       AND (status = 'pending' OR (status = 'done' AND updated_at > now() - interval '6 days'))`)).map((r) => r.key));
  await enqueue([
    ...symbols.flatMap((s) => ["foreign_stock", "ohlcv"].map((type) => job(type, s, PRIORITY.VN30_REFRESH))),
    ...symbols.flatMap((s) => ["listing", "fundamentals"]
      .filter((type) => !recent.has(`${type}:${s}`))
      .map((type) => job(type, s, PRIORITY.VN30_WEEKLY, `w${week()}`))),
  ]);
}

/** Phase 3 market-wide jobs. VN30 ticker refresh is queued once tonight's VN30 list is stored. */
async function enqueueNightly(session: string) {
  const job = (type: string, symbol: string, priority: number) => ({ type, symbol, session, period: session, priority });
  await enqueue([
    ...INDEX_CODES.map((i) => job("constituents", i, PRIORITY.MARKET)),
    ...INDEX_CODES.map((i) => job("index_history", i, PRIORITY.MARKET)),
    ...INDEX_CODES.map((i) => job("foreign_index", i, PRIORITY.INDEX_FLOW)),
  ]);
}

const REFRESH_BATCH = 20;
const FA_MAX_AGE_DAYS = 90;

/** Rotation for non-VN30 HOSE: keeps a small batch queued, stalest first. Runs only on spare budget. */
export async function enqueueRotation() {
  const [latest] = await query<{ session: string | null }>(`SELECT max(date)::text AS session FROM calendar`);
  if (!latest.session) return;
  const stale = (jobType: string, types: string[], cutoff: string, params: unknown[]) => query<{ symbol: string }>(
    `WITH universe AS (
       SELECT symbol FROM constituent_snap WHERE index_code = 'VNINDEX'
         AND session_date = (SELECT max(session_date) FROM constituent_snap WHERE index_code = 'VNINDEX')
       EXCEPT SELECT symbol FROM constituent_snap WHERE index_code = 'VN30'
         AND session_date = (SELECT max(session_date) FROM constituent_snap WHERE index_code = 'VN30'))
     SELECT u.symbol FROM universe u
     LEFT JOIN LATERAL (SELECT max(updated_at) AS at FROM crawl_queue
       WHERE symbol = u.symbol AND job_type = '${jobType}' AND status = 'done') d ON true
     WHERE NOT EXISTS (SELECT 1 FROM crawl_queue p WHERE p.symbol = u.symbol AND p.status = 'pending' AND p.job_type = ANY($1))
       AND (d.at IS NULL OR d.at < ${cutoff})
     ORDER BY d.at NULLS FIRST, u.symbol
     LIMIT greatest(0, ${REFRESH_BATCH} - (SELECT count(DISTINCT symbol) FROM crawl_queue WHERE status = 'pending' AND job_type = ANY($1)
       AND priority IN (${PRIORITY.HOSE_REFRESH}, ${PRIORITY.HOSE_REFRESH_FA})))`,
    [types, ...params]);
  const job = (type: string, symbol: string, priority: number) => ({ type, symbol, period: `r${latest.session}`, priority });

  const prices = await stale("foreign_stock", ["foreign_stock", "ohlcv"],
    `($2::date + time '15:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'`, [latest.session]);
  const funds = await stale("fundamentals", ["fundamentals"], `now() - make_interval(days => $2)`, [FA_MAX_AGE_DAYS]);
  await enqueue([
    ...prices.flatMap(({ symbol }) => [job("foreign_stock", symbol, PRIORITY.HOSE_REFRESH), job("ohlcv", symbol, PRIORITY.HOSE_REFRESH)]),
    ...funds.map(({ symbol }) => job("fundamentals", symbol, PRIORITY.HOSE_REFRESH_FA)),
  ]);
}
