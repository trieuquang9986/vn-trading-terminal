# Handoff (27 Nov 2026, evening ICT)

Setup, crawl order and local commands are in [README.md](README.md); the spec is [AGENT.md](AGENT.md).
The UI follows a "DES.md" design reference supplied by the owner (not in this repo).

## Where things live

| | |
|---|---|
| Live site | https://vn-trading-terminal-tq.netlify.app (Netlify site `vn-trading-terminal-tq`; push to `main` deploys) |
| Database | Neon project `purple-forest-35683969`, schema in `db/schema.sql` |
| Secrets | Netlify env vars `FINHAY_API_KEY`, `DATABASE_URL`, `CRON_SECRET`. The repo is public |
| UI | `src/components/terminal/`, `src/app/globals.css` |
| Read side | `src/lib/queries.ts` → `src/app/api/*` (database only) |
| Crawler | `src/jobs/`, `netlify/functions/` |

## State

- Dashboard redesigned: light terminal layout, one FireAnt chart (index by default, ticker when selected).
- Health is hidden from the UI only. `TickerHealthCard.tsx`, `/api/health/[symbol]` and scoring remain.
  Fundamentals are still crawled and use part of the 300 daily calls.
- Data at handoff: boards to 27 Nov; index foreign flow to 26 Nov; 32 tickers with prices and flow,
  19 with fundamentals; 186 jobs done, 1,159 pending. The 27 Nov budget (300 calls) is used up.
- Estimated, not measured: all HOSE prices and flow around 1 Dec, fundamentals around 7 Dec.

## Last fix: "This page couldn't load"

FireAnt's script ran inside the React page. The redesign inserts the returns strip above the chart after
data arrives; if the script has replaced the chart's container, React throws on `insertBefore` and the whole
page dies. Reproduced locally with a stand-in widget that does that. FireAnt's real script could not be
inspected, so confirm on the live site. The chart now runs in an iframe (`public/chart.html`).
**Keep third-party scripts out of the React tree.** `src/app/error.tsx` shows the message if anything else breaks.

## To verify

- [ ] Live site loads, and the FireAnt chart renders for VN-Index, VN30 and a ticker.
- [ ] Index foreign flow for 27 Nov fills in (jobs resume 08:00 ICT, 28 Nov).
- [ ] Switching VNINDEX/VN30 shows different returns and flow (CDN cache key fix, `Netlify-Vary: query`).

## Known gaps

- Source data: FHSC returns zero foreign flow for 23 Nov (indices and VN30). The UI does not flag it.
- Bank fundamentals are mostly blank; raw responses not yet inspected (field names or not applicable).
- Broker text on `/` and `/about` is [bracketed] placeholders; "Enrol" is not wired to anything.
- FA weights sum to 90 and FA bands are working defaults (see README).
- UI is English; the design reference is Vietnamese.
- Not built for lack of data or scope: HNX/UPCoM/futures cards, sector grouping, proprietary trading,
  MA breadth, ceiling/floor counts, world markets.

## Checks

    npm test            # includes a multi-day crawl simulation, about 80 s
    npm run typecheck && npm run build

Tests do not open a browser. For UI changes, check in one with board data arriving after the chart.
