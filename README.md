# vn-trading-terminal

Daily Vietnam market terminal (index board and heatmap, index movers, foreign flow, ticker health, FireAnt quote)
plus a stock broker landing and `/about` page. Next.js on Netlify, Postgres on Neon, data from the FHSC Open API.
The specification is in [AGENT.md](AGENT.md).

## Add your API key

Netlify → project `vn-trading-terminal-tq` → **Project configuration → Environment variables** → **Add a variable**:
key `FINHAY_API_KEY`, value your FHSC key, mark it as secret. Then **redeploy** (values are fixed per deploy).

Never commit the key, and never prefix it with `NEXT_PUBLIC_`. `DATABASE_URL` and `CRON_SECRET` also live there.

## How data arrives

`netlify/functions/crawl-schedule.mts` runs every 15 minutes, 08:00–21:45 ICT, on the published deploy only.
It queues work and wakes `crawl-worker-background`, which is the only path to FHSC (300 calls/day hard stop).
The pages and API routes read the database only. The first backfill takes about two days.

The scheduler calls the worker over the public site URL, so site-wide login protection will block it.

## Run locally

    cp .env.example .env.local   # fill in values
    npm install
    npm run dev
    npm run job:probe            # one-off API checks, results in crawl_log
    npm run job:seed
    npm run job:backfill
    npm test && npm run typecheck

Database schema: `db/schema.sql`.

## Check after the first crawl

Nothing here has been run against the live FHSC API yet.

    SELECT day, message FROM crawl_log WHERE kind = 'warning' ORDER BY id DESC;
    SELECT job_type, status, count(*), max(last_error) FROM crawl_queue GROUP BY 1, 2;

- Probe lines confirm price units, share counts and foreign-flow basis.
- FA bands in `src/lib/scoring/faScore.ts` assume ratios and growth are fractions (0.18 = 18%).
- The 0–100 FA bands are working defaults; AGENT.md does not define them.
- AGENT.md's FA weights sum to 90, not 100; scores are normalised over the available weight.
