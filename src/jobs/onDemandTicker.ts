/**
 * Phase 4. Called from the health API route: writes to the queue only, never to FHSC.
 * Bounded so that anonymous visitors cannot drain the daily call budget.
 */
import { query } from "../lib/db";
import { enqueue } from "./queue";

export const MAX_WATCHLIST = 20;
const MAX_NEW_PER_DAY = 5;

export async function requestTicker(symbol: string): Promise<"queued" | "already-queued" | "unknown" | "limit"> {
  const known = await query(`SELECT 1 FROM constituent_snap WHERE symbol = $1 LIMIT 1`, [symbol]);
  if (!known.length) return "unknown";
  const queued = await query(`SELECT 1 FROM crawl_queue WHERE symbol = $1 AND job_type = 'ohlcv' LIMIT 1`, [symbol]);
  if (queued.length) return "already-queued";
  const [count] = await query<{ total: number; today: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE added_at > now() - interval '1 day')::int AS today FROM watchlist`);
  if (count.total >= MAX_WATCHLIST || count.today >= MAX_NEW_PER_DAY) return "limit";
  await query(`INSERT INTO watchlist (symbol) VALUES ($1) ON CONFLICT DO NOTHING`, [symbol]);
  await enqueue(["listing", "ohlcv", "technicals", "foreign_stock", "fundamentals"].map((type) => ({
    type, symbol, period: "seed", priority: 4,
  })));
  return "queued";
}
