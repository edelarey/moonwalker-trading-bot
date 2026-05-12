-- Strategy instances: one row per configured strategy instance
CREATE TABLE IF NOT EXISTS strategy_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,           -- user-defined name e.g. "BTC DCA Daily"
  strategy_type VARCHAR(50) NOT NULL,   -- 'break_bounce' | 'dca' | 'grid' | 'ma_crossover' | 'rsi' | 'bollinger'
  symbols JSONB NOT NULL DEFAULT '[]',  -- array of symbol strings
  params JSONB NOT NULL DEFAULT '{}',   -- strategy-specific parameters
  enabled BOOLEAN NOT NULL DEFAULT false,
  auto_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extend trades table with strategy_instance_id
ALTER TABLE trades ADD COLUMN IF NOT EXISTS strategy_instance_id UUID REFERENCES strategy_instances(id);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS strategy_type VARCHAR(50);

-- Extend backtest_results with strategy_instance_id and strategy_type
ALTER TABLE backtest_results ADD COLUMN IF NOT EXISTS strategy_instance_id UUID;
ALTER TABLE backtest_results ADD COLUMN IF NOT EXISTS strategy_type VARCHAR(50);

-- Strategy performance summary (updated after each trade closes)
CREATE TABLE IF NOT EXISTS strategy_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_instance_id UUID NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  total_pnl DECIMAL(20,8) DEFAULT 0,
  max_drawdown DECIMAL(20,8) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);
