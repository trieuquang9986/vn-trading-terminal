/** Multi-day crawl against an in-process Postgres and a fake FHSC. */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const pg = vi.hoisted(() => ({ db: null as unknown as import("@electric-sql/pglite").PGlite }));
vi.mock("@neondatabase/serverless", () => ({
  neon: () => ({ query: async (text: string, params: unknown[]) => (await pg.db.query(text, params)).rows }),
}));

import { requestTicker } from "../src/jobs/onDemandTicker";
import { drain, plan } from "../src/jobs/runner";
import { getForeignFlow, getHealth } from "../src/lib/queries";

const VN30 = Array.from({ length: 30 }, (_, i) => `V${String(i).padStart(2, "0")}`);
const HOSE = [...VN30, ...Array.from({ length: 370 }, (_, i) => `H${String(i).padStart(3, "0")}`)];
const day = 86_400_000;
const iso = (t: number) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
const trading = (d: string) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
const lastSession = () => {
  let t = Date.now();
  while (!trading(iso(t)) || (iso(t) === iso(Date.now()) && new Date(t + 7 * 3600_000).getUTCHours() < 9)) t -= day;
  return t;
};
const dates = (from: string) => {
  const out: string[] = [];
  for (let d = from; d <= iso(Date.now()); d = iso(Date.parse(`${d}T05:00:00Z`) + day)) if (trading(d)) out.push(d);
  return out;
};
const log: { path: string; at: number }[] = [];
let withholdIndexFlow: string | null = null;

function fakeFhsc(url: URL) {
  const p = url.pathname;
  const q = url.searchParams;
  log.push({ path: p, at: Date.now() });
  const updated_at = new Date(lastSession()).toISOString();
  const bars = () => ({ series: dates(iso(Number(q.get("from")) * 1000)).map((d, i) => ({ t: Date.parse(`${d}T00:00:00+07:00`) / 1000, c: 100 + (i % 7), v: 1000 })) });
  if (p === "/market/indices") return { updated_at, items: ["VNINDEX", "VN30"].map((index) => ({ index, index_value: 1000, change: 5, change_percent: 0.5 })) };
  if (p.endsWith("/constituents")) {
    const all = p.includes("VN30") ? VN30 : HOSE;
    const page = Number(q.get("page"));
    return { total: all.length, updated_at, items: all.slice((page - 1) * 50, page * 50).map((symbol) => ({ symbol, name: symbol, price: 100, change_percent: 1, market_cap: 1000, weight_percent: 1 })) };
  }
  if (p.includes("/trading/foreign/")) return { data: dates(q.get("from")!).filter((d) => !(p.includes("/indices/") && d === withholdIndexFlow)).map((date) => ({ date, buy: { total: { volume: 2, value: 20 } }, sell: { total: { volume: 1, value: 10 } } })) };
  if (p.includes("/quotes/")) return bars();
  if (p.endsWith("/listing")) return { listed_shares: 10, outstanding_shares: 10, free_float_pct: 50 };
  if (p.endsWith("/overview")) return { roe: 0.1, pe: 10, industry: { pe: 12 } };
  if (p.endsWith("/technicals")) return { prices: [], indicators: [] };
  return [{ year: 2026, quarter: 3, bienlaisauthue: 0.1 }];
}

/** One scheduler tick at the given Vietnam time. */
async function tick(at: string) {
  vi.setSystemTime(new Date(`${at}+07:00`));
  await plan();
  return drain({ maxCalls: 100 });
}
async function day_(date: string, from = 8, to = 21) {
  for (let h = from; h <= to; h++) for (const m of ["00", "30"]) await tick(`${date}T${String(h).padStart(2, "0")}:${m}:00`);
}
const count = async (sql: string) => Number((await pg.db.query<{ n: number }>(sql)).rows[0].n);
const callsOn = (d: string) => count(`SELECT coalesce(max(calls),0) AS n FROM crawl_log WHERE kind='counter' AND day='${d}'`);
const loaded = (table: string) => count(`SELECT count(DISTINCT symbol) AS n FROM ${table}`);

const realTimeout = globalThis.setTimeout;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T13:40:00+07:00"));
  pg.db = new PGlite();
  await pg.db.exec(readFileSync("db/schema.sql", "utf8"));
  process.env.DATABASE_URL = "postgres://test";
  process.env.FINHAY_API_KEY = "test";
  globalThis.setTimeout = ((fn: () => void) => setImmediate(fn)) as unknown as typeof setTimeout;
  vi.stubGlobal("fetch", async (url: URL) => new Response(JSON.stringify({ error_code: "0", data: fakeFhsc(url) })));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => {
  globalThis.setTimeout = realTimeout;
  vi.useRealTimers();
});

describe("crawl across days", () => {
  it("loads VN30 before the close while holding calls back for the evening", async () => {
    await tick("2026-11-27T13:40:00");
    await tick("2026-11-27T13:55:00");
    await tick("2026-11-27T14:30:00");
    for (const table of ["foreign_stock_daily", "stock_daily"]) {
      expect(await count(`SELECT count(DISTINCT symbol) AS n FROM ${table} WHERE symbol LIKE 'V%'`)).toBe(30);
    }
    expect(await callsOn("2026-11-27")).toBeLessThanOrEqual(220);
    expect(await count(`SELECT count(*) AS n FROM stock_daily WHERE date='2026-11-27'`)).toBe(0);
    expect(await count(`SELECT count(*) AS n FROM crawl_queue WHERE status='failed'`)).toBe(0);
  }, 120_000);

  it("stores tonight's board and refreshes VN30 within the cap", async () => {
    await day_("2026-11-27", 15, 21);
    expect(await count(`SELECT count(DISTINCT symbol) AS n FROM stock_daily WHERE date='2026-11-27'`)).toBeGreaterThanOrEqual(30);
    expect(await count(`SELECT count(*) AS n FROM constituent_snap WHERE session_date='2026-11-27'`)).toBe(430);
    expect(await callsOn("2026-11-27")).toBeLessThanOrEqual(300);
  }, 120_000);

  it("keeps the index flow job open until the day is published", async () => {
    withholdIndexFlow = "2026-11-30";
    await tick("2026-11-30T15:00:00");
    await tick("2026-11-30T15:30:00");
    const open = `SELECT count(*) AS n FROM crawl_queue WHERE job_type='foreign_index' AND session_date='2026-11-30' AND status='pending' AND retries=0`;
    expect(await count(open)).toBe(2);
    expect((await getForeignFlow("VNINDEX", "V01")).indexAsOf).toBe("2026-11-27");
    withholdIndexFlow = null;
    await tick("2026-11-30T18:00:00");
    expect(await count(open)).toBe(0);
    expect((await getForeignFlow("VNINDEX", "V01")).indexAsOf).toBe("2026-11-30");
  }, 120_000);

  it("moves a requested ticker up the queue", async () => {
    expect(await requestTicker("H369")).toBe("queued");
    expect(await requestTicker("ZZZ")).toBe("unknown");
    await tick("2026-12-01T08:00:00");
    expect(await count(`SELECT count(*) AS n FROM stock_daily WHERE symbol='H369'`)).toBeGreaterThan(200);
  }, 120_000);

  it("covers all HOSE, then rotates, without ever exceeding 300 a day", async () => {
    const days = ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04",
      "2026-12-05", "2026-12-06", "2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11",
      "2026-12-12", "2026-12-13", "2026-12-14"];
    const progress: string[] = [];
    for (const d of days) {
      await day_(d);
      const calls = await callsOn(d);
      expect(calls).toBeLessThanOrEqual(300);
      if (trading(d)) {
        // Every weekday must still get its board and VN30 refresh the same evening.
        expect(await count(`SELECT count(*) AS n FROM index_daily WHERE date='${d}' AND board_updated_at IS NOT NULL`)).toBe(2);
        expect(await count(`SELECT count(*) AS n FROM crawl_queue WHERE status='pending' AND session_date='${d}' AND priority < 5`)).toBe(0);
      }
      progress.push(`${d} calls=${calls} flow=${await loaded("foreign_stock_daily")} prices=${await loaded("stock_daily")} fa=${await loaded("fundamental_snapshot")}`);
    }
    process.stdout.write(`${progress.join("\n")}\n`);
    expect(await loaded("foreign_stock_daily")).toBe(400);
    expect(await loaded("stock_daily")).toBe(400);
    expect(await loaded("fundamental_snapshot")).toBe(400);
    expect(await count(`SELECT count(*) AS n FROM crawl_queue WHERE job_id LIKE '%:r2026%' AND status='done'`)).toBeGreaterThan(0);

    const health = await getHealth("H001");
    expect(health.ta.coverage).toBe(100);
    const flow = await getForeignFlow("VNINDEX", "H001");
    expect(flow.windows[3].partial).toBe(false);
    // A ticker awaiting refresh sums complete sessions up to its own date.
    expect(flow.windows[1].stock?.net).toBe(50);
  }, 600_000);
});
