import { query } from "../lib/db";

export interface Job {
  job_id: string; job_type: string; symbol: string | null; session_date: string | null; retries: number;
}
export interface NewJob {
  type: string; symbol?: string; session?: string;
  /** Distinguishes repeats of the same job, e.g. a week or a session date. */
  period: string;
  priority: number;
}

const MAX_RETRIES = 3;

/** Lower runs first. VN30 is always ahead of the rest of HOSE. */
export const PRIORITY = {
  BOARD: 0, MARKET: 1, INDEX_FLOW: 2, VN30_REFRESH: 3,
  VN30_SEED: 5, // 5-8, one step per job type
  VN30_WEEKLY: 10,
  REQUESTED: 15, // a visitor is looking at this ticker
  HOSE_SEED: 20, HOSE_SEED_FA: 25,
  HOSE_REFRESH: 30, HOSE_REFRESH_FA: 35,
} as const;

const jobId = (j: NewJob) => [j.type, j.symbol ?? "-", j.period].join(":");

/**
 * Idempotent: a job_id is queued once; queueing it again can only raise its priority.
 * Jobs of equal priority run in the order given.
 */
export async function enqueue(jobs: NewJob[]) {
  const unique = new Map<string, NewJob>();
  for (const j of jobs) {
    const seen = unique.get(jobId(j));
    if (!seen || j.priority < seen.priority) unique.set(jobId(j), j);
  }
  if (!unique.size) return;
  const list = [...unique.values()];
  await query(
    `INSERT INTO crawl_queue (job_id, job_type, symbol, session_date, priority, created_at)
     SELECT id, type, symbol, session::date, priority, now() + ord * interval '1 microsecond'
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[]) WITH ORDINALITY AS t(id, type, symbol, session, priority, ord)
     ON CONFLICT (job_id) DO UPDATE SET priority = EXCLUDED.priority WHERE EXCLUDED.priority < crawl_queue.priority`,
    [list.map(jobId), list.map((j) => j.type), list.map((j) => j.symbol ?? null), list.map((j) => j.session ?? null), list.map((j) => j.priority)],
  );
}

/** `headroom` limits history and universe jobs; market and VN30 refresh jobs ignore it. */
export async function nextJob(types: string[] | undefined, headroom: number): Promise<Job | null> {
  const rows = await query<Job>(
    `SELECT job_id, job_type, symbol, session_date::text, retries FROM crawl_queue
     WHERE status = 'pending' AND next_run_at <= now() AND ($1::text[] IS NULL OR job_type = ANY($1))
       AND (priority < $3 OR (CASE job_type WHEN 'fundamentals' THEN 4 WHEN 'constituents' THEN 9 ELSE 1 END) <= $2)
     ORDER BY priority, created_at, job_id LIMIT 1`,
    [types ?? null, headroom, PRIORITY.VN30_SEED],
  );
  return rows[0] ?? null;
}

/** Data not published yet: come back later without using up a retry. */
export const markWaiting = (id: string, reason: string, until: Date) =>
  query(`UPDATE crawl_queue SET next_run_at = $2, last_error = $3, updated_at = now() WHERE job_id = $1`,
    [id, until.toISOString(), reason.slice(0, 500)]);

export const markDone = (id: string) =>
  query(`UPDATE crawl_queue SET status = 'done', last_error = NULL, updated_at = now() WHERE job_id = $1`, [id]);

/** Retry with growing delay; give up after MAX_RETRIES. */
export const markFailed = (job: Job, error: string, giveUp = false) =>
  query(
    `UPDATE crawl_queue SET status = $2, retries = retries + 1, last_error = $3,
       next_run_at = now() + make_interval(mins => $4), updated_at = now() WHERE job_id = $1`,
    [job.job_id, giveUp || job.retries + 1 >= MAX_RETRIES ? "failed" : "pending", error.slice(0, 500), 30 * (job.retries + 1)],
  );

export async function acquireLock(name: string, minutes: number) {
  const rows = await query(
    `INSERT INTO crawl_lock (name, locked_until) VALUES ($1, now() + make_interval(mins => $2))
     ON CONFLICT (name) DO UPDATE SET locked_until = EXCLUDED.locked_until WHERE crawl_lock.locked_until < now()
     RETURNING name`,
    [name, minutes],
  );
  return rows.length > 0;
}
export const releaseLock = (name: string) => query(`DELETE FROM crawl_lock WHERE name = $1`, [name]);
