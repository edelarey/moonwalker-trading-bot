CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  entry_price DECIMAL(20,8),
  stop_loss DECIMAL(20,8),
  take_profit DECIMAL(20,8),
  risk_distance DECIMAL(20,8),
  risk_percent DECIMAL(5,2),
  position_size DECIMAL(20,8),
  qty DECIMAL(20,8),
  opened_at BIGINT,
  closed_at BIGINT,
  close_price DECIMAL(20,8),
  pnl DECIMAL(20,8),
  pnl_percent DECIMAL(10,4),
  status VARCHAR(20),
  bybit_order_id VARCHAR(100),
  is_backtest BOOLEAN DEFAULT false,
  pattern_type VARCHAR(30),
  daily_high DECIMAL(20,8),
  daily_low DECIMAL(20,8),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_ranges (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  date DATE NOT NULL,
  high DECIMAL(20,8),
  low DECIMAL(20,8),
  fetched_at BIGINT,
  UNIQUE(symbol, date)
);

CREATE TABLE IF NOT EXISTS backtest_results (
  id UUID PRIMARY KEY,
  params JSONB,
  summary JSONB,
  run_at BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
