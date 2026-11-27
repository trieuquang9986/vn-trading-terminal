/**
 * The only module that talks to FHSC. Imported by background jobs only, never by UI or API routes
 * (enforced by tests/boundaries.test.ts).
 */
import { logWarning, query } from "../db";

const BASE_URL = "https://open-api.fhsc.com.vn";
export const DAILY_CAP = 300;
export const WARN_AT = 210;
const MAX_429_RETRIES = 3;
const MAX_429_WAIT_MS = 120_000;

export class BudgetExhaustedError extends Error {}
export class RateLimitedError extends Error {}
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Budget {
  /** Counts one call against today's budget; returns the new total, or null when the cap is reached. */
  reserve(): Promise<number | null>;
  record429(): Promise<void>;
  warn(message: string): Promise<void>;
}

const TODAY = `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

export const dbBudget: Budget = {
  async reserve() {
    await query(`INSERT INTO crawl_log (day, kind) VALUES (${TODAY}, 'counter') ON CONFLICT (day) WHERE kind = 'counter' DO NOTHING`);
    const rows = await query<{ calls: number }>(
      `UPDATE crawl_log SET calls = calls + 1, updated_at = now() WHERE kind = 'counter' AND day = ${TODAY} AND calls < $1 RETURNING calls`,
      [DAILY_CAP],
    );
    return rows[0]?.calls ?? null;
  },
  async record429() {
    await query(`UPDATE crawl_log SET count429 = count429 + 1, updated_at = now() WHERE kind = 'counter' AND day = ${TODAY}`);
  },
  warn: logWarning,
};

export interface ClientOptions {
  apiKey: string;
  budget?: Budget;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export function createClient(opts: ClientOptions) {
  const budget = opts.budget ?? dbBudget;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let baseDelay = opts.baseDelayMs ?? (Number(process.env.CRAWL_DELAY_MS) || 2000);
  let slowdown = 1;
  let chain: Promise<unknown> = Promise.resolve();
  let first = true;
  let used = 0;

  async function request<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt++) {
      if (!first) await sleep((baseDelay + 200 + Math.random() * 600) * slowdown);
      first = false;

      const count = await budget.reserve();
      if (count === null) throw new BudgetExhaustedError(`Daily cap of ${DAILY_CAP} calls reached`);
      used++;
      if (count === WARN_AT) await budget.warn(`FHSC usage at ${WARN_AT}/${DAILY_CAP} calls (70%)`);

      const res = await doFetch(url, {
        headers: { "X-FH-APIKEY": opts.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });

      if (res.status === 429) {
        await budget.record429();
        slowdown = 2;
        const reset = Number(res.headers.get("X-RateLimit-Reset"));
        const wait = (reset ? Math.max(0, reset * 1000 - Date.now()) : 60_000) + 50 + Math.random() * 450;
        if (attempt >= MAX_429_RETRIES || wait > MAX_429_WAIT_MS) throw new RateLimitedError(`429 on ${url.pathname}`);
        await sleep(wait);
        continue;
      }
      const body = (await res.json().catch(() => null)) as { error_code?: string; message?: string; data?: T } | null;
      if (!res.ok || !body || (body.error_code !== undefined && String(body.error_code) !== "0")) {
        throw new ApiError(res.status, `${res.status} ${url.pathname}: ${body?.message ?? "invalid response"}`);
      }
      return body.data as T;
    }
  }

  return {
    /** Strictly sequential: one request in flight at a time. */
    get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
      const run = chain.then(() => request<T>(path, params));
      chain = run.catch(() => undefined);
      return run;
    },
    callsUsed: () => used,
  };
}

export type FhscClient = ReturnType<typeof createClient>;
