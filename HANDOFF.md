# Handoff (28 Nov 2026)

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

- Dashboard redesigned: light terminal layout, Vietnamese UI.
- Main chart: static area chart (`AreaChart.tsx`, 1W/1M/3M/6M/1Y) drawn from `index_daily`, with volume
  (no moving-average lines, by choice). It always shows the selected index; selecting a ticker only changes the foreign-flow panel.
  It replaced a FireAnt candlestick embed (commit `8eb5d98`) because no area or fixed-range option of that
  embed is documented. `FireAntWidget.tsx` is kept, unused, in case you want to switch back.
- Health is hidden from the UI only. `TickerHealthCard.tsx`, `/api/health/[symbol]` and scoring remain.
  Fundamentals are still crawled and use part of the 300 daily calls.
- Data on the evening of 27 Nov: boards to 27 Nov; index foreign flow to 26 Nov; 32 tickers with prices and flow,
  19 with fundamentals; 186 jobs done, 1,159 pending.
- Estimated, not measured: all HOSE prices and flow around 1 Dec, fundamentals around 7 Dec.

## Ex-Vin toggle ("Loại nhóm Vin")

- Removes VIC, VHM, VPL, VRE (`VIN_GROUP` in `src/lib/scoring/exGroup.ts`; VPL is not in VN30) and reweights
  the rest: their own daily moves, weighted by prior-session weights. Not point subtraction.
- Latest session only. Affects the index cards, a summary strip, the heatmap and the 1D contribution chart.
  Area chart, session statistics and foreign flow stay full-index.
- No extra FHSC calls or tables. VN30 reuses the capped weights pro rata (no re-capping).
- Possible next step: an ex-Vin history line, compounding daily returns (past weights would be estimates).

## Past incident: "This page couldn't load"

A third-party chart script running inside the React tree could take the whole page down (reproduced with a
stand-in that replaces its container). **Keep third-party scripts out of the React tree** (use an iframe).
`src/app/error.tsx` shows the message if anything else breaks.

## To verify

- [ ] Area chart looks right on the live site for VN-Index and VN30 in every range.
- [ ] Index foreign flow for 27 Nov fills in (jobs resume 08:00 ICT, 28 Nov).
- [ ] Switching VNINDEX/VN30 shows different returns and flow (CDN cache key fix, `Netlify-Vary: query`).

## Known gaps

- Source data: FHSC returns zero foreign flow for 23 Nov (indices and VN30). The UI does not flag it.
- Bank fundamentals are mostly blank; raw responses not yet inspected (field names or not applicable).
- Broker text on `/` and `/about` is [bracketed] placeholders; "Enrol" is not wired to anything.
- FA weights sum to 90 and FA bands are working defaults (see README).
- Not built for lack of data or scope: HNX/UPCoM/futures cards, sector grouping, proprietary trading,
  MA breadth, ceiling/floor counts, world markets.

## Checks

    npm test            # includes a multi-day crawl simulation, about 80 s
    npm run typecheck && npm run build

Tests do not open a browser. For UI changes, check in one with board data arriving after the chart.
