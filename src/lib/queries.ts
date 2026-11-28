/** Read side for the API routes. Reads the database only. */
import { query } from "./db";
import type { IndexCode } from "./fhsc/endpoints";
import { pointContributions, type Member } from "./scoring/indexImpact";
import { alignToCalendar, periodReturn } from "./scoring/series";
import { addDays } from "./time";
import { faScorecard, totalHealth, type FaMetrics } from "./scoring/faScore";
import { taScorecard } from "./scoring/taScore";

const CALENDAR_LIMIT = 300;

/** Ascending trading dates. */
async function calendar() {
  const rows = await query<{ date: string }>(`SELECT date::text FROM calendar ORDER BY date DESC LIMIT ${CALENDAR_LIMIT}`);
  return rows.map((r) => r.date).reverse();
}

async function closeMap(table: "index_daily" | "stock_daily", col: "index_code" | "symbol", key: string) {
  const rows = await query<{ date: string; close: number }>(
    `SELECT date::text, close FROM ${table} WHERE ${col} = $1 AND close IS NOT NULL ORDER BY date DESC LIMIT ${CALENDAR_LIMIT}`, [key]);
  return new Map(rows.map((r) => [r.date, r.close]));
}

interface MemberRow extends Member { name: string | null; weightPercent: number | null; session: string }

async function members(index: IndexCode, sessions: number): Promise<{ dates: string[]; bySession: Map<string, MemberRow[]> }> {
  const dates = (await query<{ d: string }>(
    `SELECT DISTINCT session_date::text AS d FROM constituent_snap WHERE index_code = $1 ORDER BY d DESC LIMIT $2`,
    [index, sessions])).map((r) => r.d).reverse();
  const rows = dates.length ? await query<MemberRow>(
    `SELECT s.symbol, s.name, s.price, s.change_percent AS "changePercent", s.market_cap AS "marketCap",
            s.weight_percent AS "weightPercent", s.session_date::text AS session,
            l.outstanding_shares AS "outstandingShares", l.free_float_pct AS "freeFloatPct"
     FROM constituent_snap s
     LEFT JOIN LATERAL (SELECT outstanding_shares, free_float_pct FROM listing WHERE symbol = s.symbol ORDER BY fetched_at DESC LIMIT 1) l ON true
     WHERE s.index_code = $1 AND s.session_date >= $2 ORDER BY s.weight_percent DESC NULLS LAST`,
    [index, dates[0]]) : [];
  const bySession = new Map<string, MemberRow[]>();
  for (const r of rows) {
    if (!bySession.has(r.session)) bySession.set(r.session, []);
    bySession.get(r.session)!.push(r);
  }
  return { dates, bySession };
}

export async function getBoard(index: IndexCode) {
  const [row] = await query(
    `SELECT date::text, close AS "indexValue", change, change_percent AS "changePercent", advancers, decliners, unchanged,
            volume, trading_value AS "tradingValue", foreign_net_value AS "foreignNetValue", board_updated_at AS "updatedAt"
     FROM index_daily WHERE index_code = $1 AND board_updated_at IS NOT NULL ORDER BY date DESC LIMIT 1`, [index]);

  const dates = await calendar();
  const closeByDate = await closeMap("index_daily", "index_code", index);
  const closes = alignToCalendar(dates, closeByDate);
  const yearStart = dates.at(-1)?.slice(0, 4);
  const ytdSessions = dates.filter((d) => d.slice(0, 4) === yearStart).length;
  const windows: [string, number][] = [["1W", 5], ["1M", 21], ["3M", 63], ["6M", 126], ["1Y", 252], ["YTD", ytdSessions]];
  const returns = windows.map(([label, n]) => ({ label, value: periodReturn(closes, n) }));

  // Context for the summary cards: sparkline closes and the volume of the 20 sessions before the latest one.
  const history = closes.filter((c): c is number => c !== null).slice(-60);
  const volumes = await query<{ date: string; volume: number }>(
    `SELECT date::text, volume FROM index_daily WHERE index_code = $1 AND volume IS NOT NULL AND date = ANY($2::date[]) ORDER BY date DESC`,
    [index, dates]);
  // Daily closes and volume behind the main area chart.
  const volumeByDate = new Map(volumes.map((v) => [v.date, v.volume]));
  const series = dates.filter((d) => closeByDate.has(d))
    .map((date) => ({ date, close: closeByDate.get(date)!, volume: volumeByDate.get(date) ?? null }));
  const prior = volumes.filter((v) => v.date < (row?.date ?? volumes[0]?.date ?? "")).slice(0, 20);
  const volumeAvg20 = prior.length === 20 ? prior.reduce((s, v) => s + v.volume, 0) / 20 : null;

  const snap = await members(index, 1);
  const latest = snap.bySession.get(snap.dates.at(-1) ?? "") ?? [];
  const totalCap = latest.reduce((s, m) => s + (m.marketCap ?? 0), 0);
  return {
    index,
    board: row ?? null,
    returns,
    history,
    series,
    volumeAvg20,
    heatmapDate: snap.dates.at(-1) ?? null,
    // Tile area: reported weight, else share of market cap.
    constituents: latest.map((m) => ({
      symbol: m.symbol, name: m.name, price: m.price, changePercent: m.changePercent,
      weight: m.weightPercent ?? (totalCap && m.marketCap ? (m.marketCap / totalCap) * 100 : null),
    })),
  };
}

export async function getMovers(index: IndexCode, sessions: 1 | 5 | 21) {
  // One extra snapshot supplies the prior-session weights.
  const { dates, bySession } = await members(index, sessions + 1);
  const used = dates.slice(-sessions);
  const boards = new Map((await query<{ date: string; close: number | null; change: number | null }>(
    `SELECT date::text, close, change FROM index_daily WHERE index_code = $1 AND date = ANY($2::date[])`,
    [index, used])).map((r) => [r.date, r]));

  const totals = new Map<string, number>();
  const missing = new Set<string>();
  let indexChange = 0;
  let explained = 0;
  let counted = 0;
  for (const date of used) {
    const board = boards.get(date);
    if (!board || board.close == null || board.change == null) continue;
    const previous = dates[dates.indexOf(date) - 1];
    const result = pointContributions(index, board.close - board.change, bySession.get(date) ?? [], previous ? bySession.get(previous) : undefined);
    for (const [symbol, points] of result.points) {
      totals.set(symbol, (totals.get(symbol) ?? 0) + points);
      explained += points;
    }
    result.missing.forEach((s) => missing.add(s));
    indexChange += board.change;
    counted++;
  }
  // A daily % move is only meaningful for the single-session view.
  const lastMoves = new Map((bySession.get(used.at(-1) ?? "") ?? []).map((m) => [m.symbol, m.changePercent]));
  const ranked = [...totals].map(([symbol, points]) => ({ symbol, points, changePercent: sessions === 1 ? lastMoves.get(symbol) ?? null : null })).sort((a, b) => b.points - a.points);
  const residual = indexChange - explained;
  const warnings: string[] = [];
  if (index === "VN30" && counted && Math.abs(residual) > 0.05) {
    warnings.push(`Unexplained ${residual.toFixed(2)} pts between constituent sum and index change.`);
  }
  if (missing.size) warnings.push(`No weight data for ${[...missing].slice(0, 8).join(", ")}${missing.size > 8 ? "…" : ""}.`);
  return {
    index, requested: sessions, counted,
    gainers: ranked.filter((r) => r.points > 0).slice(0, 10),
    losers: ranked.filter((r) => r.points < 0).reverse().slice(0, 10),
    indexChange: counted ? indexChange : null,
    residual: counted ? residual : null,
    warnings,
  };
}

interface FlowRow { date: string; buy: number; sell: number; net: number }
const FLOW_WINDOWS = [1, 5, 21, 252];

async function flowRows(table: "foreign_index_daily" | "foreign_stock_daily", col: "index_code" | "symbol", key: string) {
  return query<FlowRow>(
    `SELECT date::text, buy_val AS buy, sell_val AS sell, net_val AS net FROM ${table} WHERE ${col} = $1 ORDER BY date DESC LIMIT ${CALENDAR_LIMIT}`, [key]);
}

/** Sessions absent from the source count as zero flow. */
function sumWindow(rows: Map<string, FlowRow>, dates: string[]) {
  return dates.reduce(
    (s, d) => ({ buy: s.buy + (rows.get(d)?.buy ?? 0), sell: s.sell + (rows.get(d)?.sell ?? 0), net: s.net + (rows.get(d)?.net ?? 0) }),
    { buy: 0, sell: 0, net: 0 });
}

export async function getForeignFlow(index: IndexCode, symbol: string | null) {
  const dates = await calendar();
  const toMap = (rows: FlowRow[]) => new Map(rows.map((r) => [r.date, r]));
  const indexRows = toMap(await flowRows("foreign_index_daily", "index_code", index));
  const vniRows = index === "VNINDEX" ? indexRows : toMap(await flowRows("foreign_index_daily", "index_code", "VNINDEX"));
  const stockRows = symbol ? toMap(await flowRows("foreign_stock_daily", "symbol", symbol)) : new Map<string, FlowRow>();
  const stockCloseMap = symbol ? await closeMap("stock_daily", "symbol", symbol) : new Map<string, number>();
  const stockAsOf = [...stockCloseMap.keys()].sort().at(-1) ?? null;
  const stockDates = stockAsOf ? dates.filter((d) => d <= stockAsOf) : [];
  const stockCloses = alignToCalendar(stockDates, stockCloseMap);
  const stockVniCloses = alignToCalendar(stockDates, await closeMap("index_daily", "index_code", "VNINDEX"));
  const firstFlow = [...stockRows.keys()].sort()[0];
  // Index flow can be published later than prices: its windows end on its own last date.
  const upTo = (rows: Map<string, unknown>, list: string[]) => {
    const last = [...rows.keys()].sort().at(-1) ?? "";
    return list.filter((d) => d <= last);
  };
  const indexDates = upTo(indexRows, dates);
  const shareDates = upTo(vniRows, stockDates);

  const windows = FLOW_WINDOWS.map((n) => {
    const indexSpan = indexDates.slice(-n);
    const idx = indexSpan.length ? sumWindow(indexRows, indexSpan) : null;
    const stockSpan = stockDates.slice(-n);
    // Share of VNI net compares both over the same sessions.
    const shareSpan = shareDates.slice(-n);
    const vni = shareSpan.length ? sumWindow(vniRows, shareSpan) : null;
    const shared = shareSpan.length && stockRows.size ? sumWindow(stockRows, shareSpan) : null;
    const stock = stockRows.size && stockSpan.length ? sumWindow(stockRows, stockSpan) : null;
    const stockReturn = periodReturn(stockCloses, n);
    const vniReturn = periodReturn(stockVniCloses, n);
    // Flag a ticker whose stored flow starts well after the window does.
    const short = stock !== null && firstFlow > addDays(stockSpan[0], 14);
    return {
      sessions: n,
      partial: dates.length < n || short,
      index: idx,
      stock,
      shareOfVniNet: shared && vni?.net ? shared.net / vni.net : null,
      returnVsVni: stockReturn !== null && vniReturn !== null ? stockReturn - vniReturn : null,
    };
  });
  return {
    index, symbol, stockAsOf, indexAsOf: indexDates.at(-1) ?? null, basis: "incl. put-through", latestSession: dates.at(-1) ?? null, windows,
    daily: indexDates.slice(-21).map((d) => ({ date: d, net: indexRows.get(d)?.net ?? 0 })).filter(() => indexRows.size > 0),
  };
}

export async function getHealth(symbol: string) {
  const dates = await calendar();
  const stock = await query<{ date: string; close: number; volume: number }>(
    `SELECT date::text, close, coalesce(volume,0) AS volume FROM stock_daily WHERE symbol = $1 AND close IS NOT NULL ORDER BY date DESC LIMIT ${CALENDAR_LIMIT}`, [symbol]);
  const byDate = new Map(stock.map((r) => [r.date, r]));
  const vni = await closeMap("index_daily", "index_code", "VNINDEX");

  // Align on sessions where the stock has data (or is carried forward) and VNINDEX traded.
  const closes: number[] = [];
  const volumes: number[] = [];
  const vniCloses: number[] = [];
  let last: number | undefined;
  const lastStockDate = stock[0]?.date;
  for (const d of dates) {
    if (!lastStockDate || d > lastStockDate) break;
    last = byDate.get(d)?.close ?? last;
    const bench = vni.get(d);
    if (last === undefined || bench === undefined) continue;
    closes.push(last);
    volumes.push(byDate.get(d)?.volume ?? 0);
    vniCloses.push(bench);
  }

  const [tech] = await query<{ date: string; close: number | null; sma20: number | null; sma50: number | null; vsma: number | null }>(
    `SELECT date::text, close, sma20, sma50, volume_sma20 AS vsma FROM stock_technicals_daily
     WHERE symbol = $1 AND sma20 IS NOT NULL ORDER BY date DESC LIMIT 1`, [symbol]);
  const ta = taScorecard({
    closes, volumes, vniCloses,
    technicals: {
      close: tech?.close ?? null, sma20: tech?.sma20 ?? null, sma50: tech?.sma50 ?? null,
      volumeSma20: tech?.vsma ?? null, volume: tech ? byDate.get(tech.date)?.volume ?? null : null,
    },
  });

  const [snapshot] = await query<{ metrics: FaMetrics; fetchedAt: string }>(
    `SELECT metrics, fetched_at AS "fetchedAt" FROM fundamental_snapshot WHERE symbol = $1 ORDER BY fetched_at DESC LIMIT 1`, [symbol]);
  const fa = faScorecard(snapshot?.metrics ?? {});
  return {
    symbol, ta, fa, total: totalHealth(fa, ta),
    asOf: { price: lastStockDate ?? null, fundamentals: snapshot?.metrics.latestPeriod ?? null },
    hasData: stock.length > 0 || Boolean(snapshot),
  };
}

export async function getSymbols() {
  return query<{ symbol: string; name: string | null }>(
    `SELECT DISTINCT ON (symbol) symbol, name FROM constituent_snap ORDER BY symbol, session_date DESC`);
}
