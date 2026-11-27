/** Drains the queue one job at a time within a call and time budget. */
import { logWarning, query } from "../lib/db";
import { ApiError, BudgetExhaustedError, createClient, DAILY_CAP, RateLimitedError } from "../lib/fhsc/client";
import { endpoints } from "../lib/fhsc/endpoints";
import { expectedSessionDate } from "../lib/time";
import { enqueueSeed, NotReadyError, runJob } from "./handlers";
import { acquireLock, enqueue, markDone, markFailed, nextJob, releaseLock } from "./queue";

export interface RunOptions {
  maxCalls?: number;
  maxMillis?: number;
  /** Restrict to these job types (CLI phase scripts). */
  types?: string[];
}

/** Queues whatever is due: the seed on first run, then each session's board job. */
export async function plan(now = new Date()) {
  await enqueueSeed();
  const session = expectedSessionDate(now);
  await enqueue([{ type: "board", session, period: session, priority: 0 }]);
}

export async function hasWork() {
  const rows = await query(
    `SELECT 1 FROM crawl_queue WHERE status = 'pending' AND next_run_at <= now()
       AND coalesce((SELECT calls FROM crawl_log WHERE kind = 'counter' AND day = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), 0) < $1
     LIMIT 1`, [DAILY_CAP]);
  return rows.length > 0;
}

export async function drain({ maxCalls = 100, maxMillis = 13 * 60_000, types }: RunOptions = {}) {
  const apiKey = process.env.FINHAY_API_KEY;
  if (!apiKey) {
    console.warn("FINHAY_API_KEY is not set; nothing crawled.");
    return { done: 0, failed: 0, calls: 0 };
  }
  if (!(await acquireLock("crawler", 16))) return { done: 0, failed: 0, calls: 0 };
  const client = createClient({ apiKey });
  const api = endpoints(client);
  const started = Date.now();
  let done = 0;
  let failed = 0;
  try {
    while (client.callsUsed() < maxCalls && Date.now() - started < maxMillis) {
      const job = await nextJob(types);
      if (!job) break;
      try {
        await runJob(api, job);
        await markDone(job.job_id);
        done++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof BudgetExhaustedError) {
          await logWarning(message);
          break;
        }
        failed++;
        // A bad key fails every call: stop at once instead of burning the daily budget.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await markFailed({ ...job, retries: 0 }, message);
          await logWarning(`FHSC rejected the API key (${error.status}). Check FINHAY_API_KEY.`);
          break;
        }
        await markFailed(job, message, error instanceof ApiError && (error.status === 400 || error.status === 404));
        if (!(error instanceof NotReadyError)) await logWarning(`${job.job_id}: ${message}`);
        if (error instanceof RateLimitedError) break;
      }
    }
  } finally {
    await releaseLock("crawler");
  }
  return { done, failed, calls: client.callsUsed() };
}
