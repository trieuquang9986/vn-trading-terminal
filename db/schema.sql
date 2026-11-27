CREATE TABLE IF NOT EXISTS calendar (date date PRIMARY KEY);

CREATE TABLE IF NOT EXISTS index_daily (
  index_code text, date date,
  open double precision, high double precision, low double precision, close double precision, volume double precision,
  change double precision, change_percent double precision, advancers int, decliners int, unchanged int,
  trading_value double precision, foreign_net_value double precision, market_cap double precision,
  board_updated_at timestamptz,
  PRIMARY KEY (index_code, date));

CREATE TABLE IF NOT EXISTS constituent_snap (
  index_code text, symbol text, session_date date, name text,
  price double precision, change_percent double precision, market_cap double precision, weight_percent double precision,
  PRIMARY KEY (index_code, symbol, session_date));
CREATE INDEX IF NOT EXISTS constituent_snap_session ON constituent_snap (index_code, session_date);

CREATE TABLE IF NOT EXISTS listing (
  symbol text, fetched_at timestamptz DEFAULT now(), exchange text,
  listed_shares double precision, outstanding_shares double precision, free_float_pct double precision,
  PRIMARY KEY (symbol, fetched_at));

CREATE TABLE IF NOT EXISTS stock_daily (
  symbol text, date date, close double precision, volume double precision,
  PRIMARY KEY (symbol, date));

CREATE TABLE IF NOT EXISTS stock_technicals_daily (
  symbol text, date date,
  close double precision,  -- thousand VND, same basis as the SMAs
  sma20 double precision, sma50 double precision, volume_sma20 double precision, obv double precision,
  PRIMARY KEY (symbol, date));

CREATE TABLE IF NOT EXISTS foreign_index_daily (
  index_code text, date date,
  buy_vol double precision, buy_val double precision, sell_vol double precision, sell_val double precision,
  net_vol double precision, net_val double precision,
  PRIMARY KEY (index_code, date));

CREATE TABLE IF NOT EXISTS foreign_stock_daily (
  symbol text, date date,
  buy_vol double precision, buy_val double precision, sell_vol double precision, sell_val double precision,
  net_vol double precision, net_val double precision,
  PRIMARY KEY (symbol, date));

CREATE TABLE IF NOT EXISTS fundamental_snapshot (
  symbol text, fetched_at timestamptz DEFAULT now(), metrics jsonb NOT NULL,
  PRIMARY KEY (symbol, fetched_at));

CREATE TABLE IF NOT EXISTS crawl_queue (
  job_id text PRIMARY KEY, job_type text NOT NULL, symbol text, session_date date,
  status text NOT NULL DEFAULT 'pending', priority int NOT NULL DEFAULT 5, retries int NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(), last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS crawl_queue_due ON crawl_queue (status, next_run_at, priority);

CREATE TABLE IF NOT EXISTS crawl_log (
  id bigserial PRIMARY KEY, day date NOT NULL, kind text NOT NULL,  -- 'counter' | 'warning'
  calls int NOT NULL DEFAULT 0, count429 int NOT NULL DEFAULT 0, message text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS crawl_log_counter ON crawl_log (day) WHERE kind = 'counter';

CREATE TABLE IF NOT EXISTS watchlist (symbol text PRIMARY KEY, added_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS crawl_lock (name text PRIMARY KEY, locked_until timestamptz NOT NULL);
