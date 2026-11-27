/** Drains the queue one job at a time within a call and time budget. */
import { logWarning, query } from "../lib/db";
import { ApiError, BudgetExhaustedError, createClient, DAILY_CAP, RateLimitedError } from "../lib/fhsc/client";
import { endpoints } from "../lib/fhsc/endpoints";
import { addDays, expectedSessionDate, ictDateToUnix, ictParts } from "../lib/time";
import { enqueueRotation, enqueueSeed, NotReadyError, runJob } from "./handlers";
import { acquireLock, enqueue, markDone, markFailed, markWaiting, nextJob, PRIORITY, releaseLock } from "./queue";

/** Calls held back on a weekday until that evening's market and VN30 refresh is done (~75). */
export const EVENING_RESERVE = 80;

/** Calls that history and universe jobs may still use today. */
export async function headroom(now = new Date()) {
  const { date, weekday } = ictParts(now);
  const [row] = await query<{ calls: number; evening_done: boolean }>(
    `SELECT coalesce((SELECT calls FROM crawl_log WHERE kind = 'counter' AND day = $1::date), 0) AS calls,
       EXISTS (SELECT 1 FROM crawl_queue WHERE job_id = 'board:-:' || $1 AND status = 'done')
       AND NOT EXISTS (SELECT 1 FROM crawl_queue WHERE status = 'pending' AND session_date = $1::date AND priority < $2) AS evening_done`,
    [date, PRIORITY.VN30_SEED]);
  const reserve = weekday === 0 || weekday === 6 || row.evening_done ? 0 : EVENING_RESERVE;
  return DAILY_CAP - row.calls - reserve;
}

/** Unpublished data usually means "before the close": wait for 15:05 ICT, else 20 minutes. */
export function retryAt(now = new Date()) {
  const today = ictParts(now).date;
  const close = new Date((ictDateToUnix(today) + 15 * 3600 + 5 * 60) * 1000);
  return now < close ? close : new Date(now.getTime() + 20 * 60_000);
}

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
  await enqueue([{ type: "board", session, period: session, priority: PRIORITY.BOARD }]);
  await enqueueRotation();
}

export async function hasWork() {
  const [row] = await query<{ calls: number }>(
    `SELECT coalesce((SELECT calls FROM crawl_log WHERE kind = 'counter' AND day = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), 0) AS calls`);
  return row.calls < DAILY_CAP && (await nextJob(undefined, await headroom())) !== null;
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
      const job = await nextJob(types, await headroom());
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
        if (error instanceof NotReadyError) {
          await markWaiting(job.job_id, message, retryAt());
          continue;
        }
        failed++;
        // A bad key fails every call: stop at once instead of burning the daily budget.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await markFailed({ ...job, retries: 0 }, message);
          await logWarning(`FHSC rejected the API key (${error.status}). Check FINHAY_API_KEY.`);
          break;
        }
        await markFailed(job, message, error instanceof ApiError && (error.status === 400 || error.status === 404));
        await logWarning(`${job.job_id}: ${message}`);
        if (error instanceof RateLimitedError) break;
      }
    }
  } finally {
    await releaseLock("crawler");
  }
  return { done, failed, calls: client.callsUsed() };
}
