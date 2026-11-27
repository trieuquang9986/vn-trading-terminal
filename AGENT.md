# AGENT.md — Project Implementation & Data Pipeline Blueprint

## 1. Project Overview

Build a dual-purpose web application:
1. **Trading Terminal Dashboard:** Real-time/daily Vietnamese market intelligence built on a local database populated by scheduled background workers calling the FHSC Open API (`https://open-api.fhsc.com.vn`), plus an embedded FireAnt quote widget.
2. **Stock Broker Marketing Website:** Front-page hero section introducing the stock broker ("About Me") that links to a dedicated `/about` page covering the broker's profile and courses (UI placeholder content for now).

### Hard Rules & Constraints
- **Never call FHSC Open API from client/browser code or user-facing request paths.** All UI routes read exclusively from the application database.
- **API Auth:** Tier 1 endpoints only (`GET /market/**`). Send header `X-FH-APIKEY: <FINHAY_API_KEY>`. Never expose this key to the browser.
- **Free-Tier Rate Limits:** Unpublished per-minute cap + **300 calls/day** budget. All crawlers must go through a single rate-limited HTTP client with retry/backoff and job queue state.
- **Foreign Flow Basis:** `matched` and `put_through` are `null` in FHSC responses. Use `total` only and label every foreign flow metric **"incl. put-through"**.
- **Health Scorecard Scope:** Use `REGULAR` fundamentals for **all** tickers (omit `BANK` and `SEC` scorecards). All universe/benchmark comparisons use **VNINDEX (`VNINDEX`)**.

---

## 2. Recommended Project Structure

```text
/
├── AGENT.md
├── package.json
├── .env.example                  # FINHAY_API_KEY, DATABASE_URL, CRAWL_DELAY_MS
├── prisma/ (or db/)
│   └── schema.sql                # SQLite/Postgres tables for market, flow, TA, FA, crawl jobs
├── src/
│   ├── app/                      # Frontend routes (Next.js App Router or equivalent)
│   │   ├── page.tsx              # Landing page: Broker Hero + 5-module Trading Terminal
│   │   ├── about/
│   │   │   └── page.tsx          # Dedicated Broker Bio & Courses page (UI placeholder)
│   │   └── api/                  # Read-only backend endpoints serving DB data to UI
│   │       ├── board/route.ts
│   │       ├── movers/route.ts
│   │       ├── foreign-flow/route.ts
│   │       └── health/[symbol]/route.ts
│   ├── components/
│   │   ├── marketing/
│   │   │   └── BrokerHero.tsx    # Front-page CTA hero -> /about
│   │   └── terminal/
│   │       ├── FireAntChart.tsx  # Dynamic FireAnt widget wrapper
│   │       ├── IndexBoardHeatmap.tsx
│   │       ├── IndexMovers.tsx
│   │       ├── ForeignFlowPanel.tsx
│   │       └── TickerHealthCard.tsx
│   ├── lib/
│   │   ├── fhsc/
│   │   │   ├── client.ts         # Single FHSC adapter: rate limiter, 429 X-RateLimit-Reset backoff, daily cap counter
│   │   │   ├── endpoints.ts      # Typed wrappers for S1–S7, technicals, listing, overview, analysis, statement
│   │   │   └── units.ts          # Price unit normalization (VND vs nghìn đồng / 1000x)
│   │   ├── scoring/
│   │   │   ├── indexImpact.ts    # VN30 (free-float 5% bucket + 10% cap) & VNI point contribution math
│   │   │   ├── taScore.ts        # Technical Analysis scorecard (manual OBV + SMA/Volume + VNI comparison)
│   │   │   └── faScore.ts        # REGULAR Fundamental Analysis scorecard
│   │   └── db.ts                 # Upsert & query helpers
│   └── jobs/                     # Background CLI/cron workers (never invoked directly by UI)
│       ├── phase0Probe.ts        # One-time API verification & scale check
│       ├── phase1Seed.ts         # Calendar, VN30/HOSE lists, listing metadata
│       ├── phase2Backfill.ts     # Resumable queue (~100 calls/run) for 380-day history
│       ├── phase3Nightly.ts      # Daily post-close sync (~15:30, 18:00, 08:00 ICT)
│       └── onDemandTicker.ts     # Background queue worker when user inspects a non-VN30 ticker
```

---

## 3. Database Schema (Minimum Tables)

| Table | Primary Key | Purpose & Source |
|---|---|---|
| `calendar` | `date` (`YYYY-MM-DD`) | Trading sessions derived from `VNINDEX` history (`S3`). |
| `index_daily` | `(index_code, date)` | `VNINDEX` and `VN30` OHLCV + board breadth/value (`S1`, `S3`). |
| `constituent_snap` | `(index_code, symbol, session_date)` | Nightly snapshot of `price`, `change_percent`, `market_cap`, `weight_percent` (`S2`). |
| `listing` | `(symbol, fetched_at)` | `exchange`, `listed_shares`, `outstanding_shares`, `free_float_pct` (`S4`). |
| `stock_daily` | `(symbol, date)` | Daily `close` and `volume` (`S5` backfill + `S5`/nightly updates). |
| `stock_technicals_daily` | `(symbol, date)` | `sma20`, `sma50`, `volume_sma20` from `/technicals`, plus locally computed `obv`. |
| `foreign_index_daily` | `(index_code, date)` | `buy_vol`, `buy_val`, `sell_vol`, `sell_val`, `net_vol`, `net_val` (`S7`, `total` only). |
| `foreign_stock_daily` | `(symbol, date)` | `buy_vol`, `buy_val`, `sell_vol`, `sell_val`, `net_vol`, `net_val` (`S6`, `total` only). |
| `fundamental_snapshot` | `(symbol, fetched_at)` | Normalized `REGULAR` FA metrics + industry benchmarks (`overview`, `analysis`, `statement`). |
| `crawl_queue` | `job_id` | Resumable jobs (`job_type`, `symbol`, `status`, `retries`, `next_run_at`, `last_error`). |
| `crawl_log` | `id` | Daily API call counter, `429` count, `updated_at` watermark, diagnostic warnings. |

---

## 4. Feature Specifications & Data Mapping

### Feature 0: Stock Broker Marketing UI
- **Front Page (`/`):** Place a prominent hero banner above or alongside the terminal introducing the stock broker, value proposition, and a primary CTA button linking to `/about`.
- **About & Courses Page (`/about`):** Standalone page with structured placeholder sections for Broker Bio, Track Record/Philosophy, Course Cards (syllabus, duration, enrollment CTA), and Contact/Consultation links.

---

### Feature 1: Standard Chart (FireAnt Widget)
- **Implementation:** Client component wrapping the FireAnt widget script (`https://www.fireant.vn/Scripts/web/widgets.js`).
- **Dynamic Ticker Support:** When the active symbol changes in the terminal, clear the container (`#fan-quote-687` or dynamic ref ID) and re-instantiate `new FireAnt.QuoteWidget(...)` with `"symbols": activeSymbol` and responsive container dimensions (default `"350px"` × `"300px"` or fluid container width).

---

### Feature 2: Index Figure & Heatmap (`VNINDEX` & `VN30`)
- **Sources:**
  - **S1 (`GET /market/indices`):** `exchange=HOSE&window=1D&fields=index,name,index_value,change,change_percent,market_cap,constituent_count,advancers,decliners,unchanged,volume,trading_value,foreign_net_value` -> parse `data.items` + `data.updated_at`.
  - **S3 (`GET /market/quotes/indices/{VNINDEX|VN30}/history`):** `resolution=1D`, `from`, `to` (Unix seconds at 00:00 ICT) -> parse `data.series`.
  - **S2 (`GET /market/indices/{VN30|VNINDEX}/constituents`):** `page`, `page_size=50`, `sort=-weight_percent` -> parse `data.items`.
  - **S4 (`GET /market/stocks/{symbol}/listing`):** `listed_shares`, `outstanding_shares`, `free_float_pct`.
- **Calculations:**
  - **Board Metrics:** Display `index_value`, `change`, `change_percent`, `advancers / decliners / unchanged`, `volume`, `trading_value`, `foreign_net_value`.
  - **Period Returns (`1W`, `1M`, `3M`, `6M`, `1Y`, `YTD`):** Computed from `S3` stored daily closes using the `calendar` table.
  - **Heatmap Tiles:** Tile area = constituent weight (`weight_percent` or computed weight from S2 + S4); tile color = `change_percent`.

---

### Feature 3: Index Movers (Point Contribution)
- **Sources:** `S1`, `S2`, `S4`, and nightly `constituent_snap` history.
- **Weight Rules:**
  - **VN30:** $\text{weight} \propto \text{price} \times \text{outstanding\_shares} \times \text{free\_float\_bucket} \times \text{cap}_{10\%}$, where free-float is rounded up to 5% buckets (HOSE §3.2.4) and single-stock weight is capped at 10% (HOSE §6).
  - **VNINDEX:** $\text{weight} \propto \text{price} \times \text{listed\_shares}$ (no free-float adjustment, no cap).
- **Point Impact Formula:**
  $$\text{Points}_i = I_{t-1} \times w_{i, t-1} \times \frac{\text{change\_percent}_i}{100}$$
  - $I_{t-1} = \text{index\_value} - \text{change}$ from `S1`.
  - On Day 1 (before prior-day snapshot exists), recover previous close via $\text{price} / (1 + \text{change\_percent}/100)$.
  - **5D / 21D Movers:** Sum daily $\text{Points}_i$ across stored nightly `constituent_snap` sessions.
  - **Diagnostic Check:** Compare $\sum \text{Points}_i$ against `S1` `change`; log an orange warning if leftover $> 0.05$ pts on VN30.

---

### Feature 4: Foreign Flow
- **Sources:**
  - **S7 (`GET /market/indices/{VNINDEX|VN30}/trading/foreign/history`):** `from`, `to` (`YYYY-MM-DD`). Parse `data.data`, sort ascending by `date`.
  - **S6 (`GET /market/stocks/{symbol}/trading/foreign/history`):** `from`, `to` (`YYYY-MM-DD`). Parse `data.data`, sort ascending by `date`.
- **Rules & Calculations:**
  - Read `buy.total` and `sell.total` (`volume` and `value`). Compute $\text{net} = \text{total buy} - \text{total sell}$ locally.
  - Missing trading sessions in S6/S7 mean zero foreign flow; treat as `0` when summing windows.
  - **Windows:** Latest session, `5`, `21`, and `252` trading sessions (aligned via `calendar`). Flag 252-session metrics `"partial"` until backfill completes.
  - **Ticker Metrics:** Ticker buy/sell/net flow, **Share of VNI Net Flow** (`S6 net / S7 VNI net`), and **Return vs VNI** (`stock return - VNINDEX return` over matching windows).
  - *Omit participation ratio* (S6 volume includes put-through while OHLCV volume does not).

---

### Feature 5: Ticker General Health (`TA` + `REGULAR` FA)

Combined score:
$$\text{Total Health Score} = 0.55 \times \text{FA Score} + 0.45 \times \text{TA Score}$$
*(If TA or FA is partial/incomplete, display coverage badges and do not present a partial score as a full 100-point composite without labeling.)*

#### Part A: Technical Analysis Scorecard (`TAS.md` + `TA.md`)
**Data Sources:**
1. `GET /market/quotes/stocks/{symbol}/history?resolution=1D&from={unix_s}&to={unix_s}` -> `series[].{t, c, v}` (required for returns, drawdowns, latest volume, and manual OBV).
2. `GET /market/stocks/{symbol}/technicals?indicators=SMA(20),SMA(50),VOLUME_SMA(20)&from={YYYY-MM-DD}&to={YYYY-MM-DD}` -> `SMA(20)`, `SMA(50)`, `VOLUME_SMA(20)`. *(Note: `prices[].close` in `/technicals` is in **thousand VND / nghìn đồng**; normalize units against `S2` VND prices).*
3. `GET /market/quotes/indices/VNINDEX/history` (`S3`) -> `VNINDEX` daily closes aligned by trading session.

**Manual OBV Calculation:**
Compute cumulative OBV locally from daily closes $c_t$ and volumes $v_t$:
- $\text{OBV}_0 = 0$
- If $c_t > c_{t-1}$: $\text{OBV}_t = \text{OBV}_{t-1} + v_t$
- If $c_t < c_{t-1}$: $\text{OBV}_t = \text{OBV}_{t-1} - v_t$
- If $c_t = c_{t-1}$: $\text{OBV}_t = \text{OBV}_{t-1}$
- 1-month OBV change: $\Delta \text{OBV}_{21} = \text{OBV}_t - \text{OBV}_{t-21}$ (normalized by 21-session average volume $\frac{\Delta \text{OBV}_{21}}{\text{avg\_vol}_{21}}$ so it is scale-free across stocks).

**VNI-Relative Scoring Rule:**
All universe/benchmark comparisons are evaluated **directly against VNINDEX** (using spread bands against VNI rather than a multi-stock percentile table):

| Category | Metric | Weight | Definition & Scoring Rule |
|---|---|---:|---|
| **Relative Strength** | 1W Return vs VNI | 15 | $\text{Spread}_{5d} = R_{\text{stock}, 5d} - R_{\text{VNI}, 5d}$. Band score: $\ge +5\% \to 100$, $+2\%$ to $<+5\% \to 80$, $0\%$ to $<+2\% \to 65$, $=0\% \to 50$, $-2\%$ to $<0\% \to 35$, $-5\%$ to $<-2\% \to 20$, $<-5\% \to 0$. |
| **Relative Strength** | 1M Return vs VNI | 20 | $\text{Spread}_{21d} = R_{\text{stock}, 21d} - R_{\text{VNI}, 21d}$. Same spread bands as above (use 22 closes = 21 intervals). |
| **Downside Resilience** | 1W Max Drawdown vs VNI | 15 | $\text{MDD} = \min(\frac{\text{trough}}{\text{prior peak}} - 1)$ over 6 closes (5 intervals). $\text{Resilience}_{5d} = \text{MDD}_{\text{stock}} - \text{MDD}_{\text{VNI}}$ (positive = smaller drop than VNI). Same spread bands. |
| **Downside Resilience** | 1M Max Drawdown vs VNI | 15 | Same over 22 closes (21 intervals). $\text{Resilience}_{21d} = \text{MDD}_{\text{stock}} - \text{MDD}_{\text{VNI}}$. Same spread bands. |
| **Trend** | Close vs SMA20 | 10 | $(c_t / \text{SMA20}_t) - 1$. Same spread bands ($\ge +5\% \to 100$ down to $<-5\% \to 0$). |
| **Trend** | SMA20 vs SMA50 | 10 | $(\text{SMA20}_t / \text{SMA50}_t) - 1$. Same spread bands. |
| **Volume** | Latest Vol vs 20D Avg | 10 | $\text{Ratio} = v_t / \text{VOLUME\_SMA(20)}_t$. Base score: $\ge 2.0 \to 100$, $[1.5, 2.0) \to 85$, $[1.2, 1.5) \to 70$, $[0.8, 1.2) \to 50$, $[0.5, 0.8) \to 30$, $<0.5 \to 15$. **Cap at 40 if daily return $< 0$.** |
| **Volume** | OBV Trend (1M) | 5 | Normalized 21-session OBV accumulation $\frac{\Delta \text{OBV}_{21}}{\text{avg\_vol}_{21}}$: $\ge +3.0 \to 100$, $[+1.5, +3.0) \to 80$, $(0, +1.5) \to 65$, $=0 \to 50$, $(-1.5, 0) \to 35$, $(-3.0, -1.5] \to 20$, $\le -3.0 \to 0$. |

$$\text{TA Score} = \sum \left(\frac{\text{Metric Score}}{100} \times \text{Weight}\right)$$

---

#### Part B: Fundamental Analysis Scorecard (`REGULAR` for all tickers)
**Data Sources:**
1. `GET /market/company-financial/overview?symbol={symbol}` -> `pe`, `pb`, `ev_ebitda`, `industry.{pe, pb, ev_ebitda}`, `gross_margin`, `roe`, `dividend_yield`, `roa`.
2. `GET /market/company-financial/analysis?symbol={symbol}&period=quarterly` -> latest periods for `bienlaigop`, `bienlaisauthue`, `tt_dtt_yoy`, `lnst_yoy`, `lnwpershare` (compute YoY EPS growth from $t$ vs $t-4$ quarters), `novay_vonchu`, `thanhtoan_hienhanh`.
3. `GET /market/v2/financial-statement/statement?symbol={symbol}&type=cash-flow&period=quarterly&limit=5` & `type=income-statement` -> `luuchuyentienthuantuhoatdongkinhdoanh` (OCF), `tienchidemuasamxaydungtaisancodinh` (CapEx — note: typically negative in cash-flow statements, so $\text{FCF} = \text{OCF} - |\text{CapEx}|$), and Net Income (`loinhuansauthue` / income statement line).

**`REGULAR` Scorecard Weights (100%):**

| Category | Metric | Weight | API Field / Formula |
|---|---|---:|---|
| Profitability | ROE | 10% | `overview.roe` |
| Profitability | Gross profit margin | 5% | `overview.gross_margin` or `analysis.bienlaigop` |
| Profitability | Net profit margin | 5% | `analysis.bienlaisauthue` |
| Growth | Revenue growth (YoY) | 10% | `analysis.tt_dtt_yoy` |
| Growth | Net profit growth (YoY) | 10% | `analysis.lnst_yoy` |
| Growth | EPS growth (YoY) | 5% | `(lnwpershare[t] - lnwpershare[t-4]) / abs(lnwpershare[t-4])` |
| Financial health | Debt / Equity | 7% | `analysis.novay_vonchu` |
| Financial health | Current ratio | 5% | `analysis.thanhtoan_hienhanh` |
| Cash flow | OCF / Net income | 8% | `luuchuyentienthuantuhoatdongkinhdoanh / net_income` |
| Cash flow | Free cash flow | 5% | `OCF - abs(tienchidemuasamxaydungtaisancodinh)` (positive & FCF margin) |
| Valuation | P/E vs industry avg | 10% | `overview.pe` vs `overview.industry.pe` (lower multiple = higher score) |
| Valuation | P/B vs industry avg | 5% | `overview.pb` vs `overview.industry.pb` |
| Valuation | EV/EBITDA vs industry avg | 5% | `overview.ev_ebitda` vs `overview.industry.ev_ebitda` |

*(Score each metric 0–100; if a field is `null`, mark unavailable and re-normalize across available weights rather than scoring `0`.)*

---

## 5. Data Crawling Execution Plan

### Rate-Limit & Resilience Engine (`src/lib/fhsc/client.ts`)
- Execute **sequentially** (1 request at a time) with `2000ms + random(200..800)ms` delay (~25–30 calls/min).
- Enforce a **300 calls/day** hard stop; log an orange warning at **70% (210 calls)**.
- On `HTTP 429`: pause until `X-RateLimit-Reset` (Unix seconds) + `50–500ms` jitter, retry up to 3 times, and double the request delay for the rest of the run.
- Upsert all records idempotently by `(symbol, date)` or `(index_code, date)`.

### Phased Crawl Schedule

1. **Phase 0 — One-Time Probe (~10 calls):**
   - Verify `S1` (`VNINDEX`, `VN30`) and `S2` pagination (`total / 50`).
   - Check unit scaling between `S2.price` (VND), `S5.c`, and `/technicals` `prices[].close` (thousand VND).
   - Verify `market_cap / price` against `S4.listed_shares` on 3–4 tickers (if equal, skip ~400 HOSE `S4` calls).
   - Compare `S1.foreign_net_value` vs `S7` latest net total value to confirm matching basis.
2. **Phase 1 — Reference Seed (~40 calls if HOSE listing skipped):**
   - `S3` `VNINDEX` (380 days) -> populate `calendar`.
   - `S2` `VN30` (1 call) + `S2` `VNINDEX` (~8 pages) -> populate constituent lists.
   - `S4` `/listing` for 30 VN30 tickers (30 calls).
3. **Phase 2 — Resumable History Backfill (~100 calls/run across ~2 days):**
   - Queue 380-day backfills for: `S3` (`VNINDEX`, `VN30` — 2 calls), `S7` (`VNINDEX`, `VN30` — 2 calls), `S6` (30 VN30 tickers — 30 calls), `S5` OHLCV (30 VN30 tickers — 30 calls), `/technicals` (`SMA(20),SMA(50),VOLUME_SMA(20)` for 30 VN30 tickers — 30 calls), and `REGULAR` FA (`overview` + `analysis` + `statement` for 30 VN30 tickers — 120 calls).
4. **Phase 3 — Nightly Post-Close Sync (Runs at ~15:30, ~18:00, and ~08:00 ICT):**
   - **P0:** `S1` board (1 call) -> verify `updated_at` is post-close; `S2` VN30 (1 call) + `S2` VNINDEX (~8 calls); `S3` VNI/VN30 delta (2 calls).
   - **P1:** `S7` VNI/VN30 last 3 sessions upsert (2 calls).
   - **P2:** `S6` foreign flow (30 calls), `S5` OHLCV delta (30 calls), and `/technicals` snapshot (`SMA(20),SMA(50),VOLUME_SMA(20)` — 30 calls) for VN30 + active tracked tickers.
   - **P3 (Weekly/Quarterly):** Refresh `S4` listing weekly (30 calls) and `REGULAR` FA (`overview`, `analysis`, `statement`) weekly or on new earnings quarters.
5. **Phase 4 — On-Demand Non-VN30 Ticker:**
   - When a user opens a ticker not yet in DB, enqueue `S5`, `S6`, `/technicals`, `S4`, and `REGULAR` FA (~7 calls total), show a loading/partial badge in the UI, and add the ticker to the nightly P2 watchlist.