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

/** Idempotent: the same job_id is only ever queued once. */
export async function enqueue(jobs: NewJob[]) {
  for (const j of jobs) {
    await query(
      `INSERT INTO crawl_queue (job_id, job_type, symbol, session_date, priority) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (job_id) DO NOTHING`,
      [[j.type, j.symbol ?? "-", j.period].join(":"), j.type, j.symbol ?? null, j.session ?? null, j.priority],
    );
  }
}

export async function nextJob(types?: string[]): Promise<Job | null> {
  const rows = await query<Job>(
    `SELECT job_id, job_type, symbol, session_date::text, retries FROM crawl_queue
     WHERE status = 'pending' AND next_run_at <= now() AND ($1::text[] IS NULL OR job_type = ANY($1))
     ORDER BY priority, created_at, job_id LIMIT 1`,
    [types ?? null],
  );
  return rows[0] ?? null;
}

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
