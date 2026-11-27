/**
 * Called from the health API route: moves a ticker's queued jobs forward, never calls FHSC.
 * It only reorders work inside the HOSE universe, so visitors cannot add to the daily call budget.
 */
import { query } from "../lib/db";
import { enqueue, PRIORITY } from "./queue";

export async function requestTicker(symbol: string): Promise<"queued" | "unknown"> {
  const known = await query(`SELECT 1 FROM constituent_snap WHERE symbol = $1 LIMIT 1`, [symbol]);
  if (!known.length) return "unknown";
  await enqueue(["foreign_stock", "ohlcv", "fundamentals"].map((type) => ({ type, symbol, period: "seed", priority: PRIORITY.REQUESTED })));
  return "queued";
}
