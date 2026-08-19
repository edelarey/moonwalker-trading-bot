export interface Candle {
  openTime: number;   // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleInterval = string;

export interface DailyRange {
  symbol: string;
  date: string;        // YYYY-MM-DD UTC
  high: number;
  low: number;
  fetchedAt: number;   // Unix ms
}

export type BreakoutDirection = 'bullish' | 'bearish';

export interface BreakoutSignal {
  symbol: string;
  direction: BreakoutDirection;
  brokenLevel: number;   // prev day high or low
  breakoutCandle: Candle;
  detectedAt: number;    // Unix ms
  confirmed: boolean;    // 15m candle closed beyond level
}

export interface RetestSignal {
  symbol: string;
  breakout: BreakoutSignal;
  retestCandle: Candle;   // 5m candle that touched broken level
  detectedAt: number;
}

export type CandlePatternType =
  | 'hammer'
  | 'inverted_hammer'
  | 'bullish_engulfing'
  | 'shooting_star'
  | 'bearish_engulfing';

export interface ReversalSignal {
  symbol: string;
  retest: RetestSignal;
  patternType: CandlePatternType;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskDistance: number;
  direction: BreakoutDirection;
  detectedAt: number;
}

export type TradeStatus = 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual';
export type TradingMode = 'paper' | 'live';
export type TradeMode = 'paper' | 'live' | 'backtest';
export type SizingMode = 'risk_percent' | 'fixed_usdt';

export interface Trade {
  id: string;
  symbol: string;
  direction: BreakoutDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskDistance: number;
  riskPercent: number;
  positionSize: number;   // in USDT
  qty: number;            // in coin units
  openedAt: number;       // Unix ms
  closedAt?: number;
  closePrice?: number;
  pnl?: number;           // USDT
  pnlPercent?: number;
  fees?: number;
  status: TradeStatus;
  bybitOrderId?: string;
  isBacktest: boolean;
  mode?: TradeMode;
  strategyInstanceId?: string;
  strategyType?: string;
  tag?: string;
  patternType: CandlePatternType | string;
  dailyHigh: number;
  dailyLow: number;
}

export interface SymbolConfig {
  symbol: string;
  enabled: boolean;
  addedAt: number;
}

export interface StrategyDefaults {
  [key: string]: Record<string, unknown>;
}

export interface AppConfig {
  symbols: SymbolConfig[];
  riskPercent: number;       // default 1 — used when sizingMode is risk_percent
  sizingMode?: SizingMode;
  fixedPositionUsdt?: number; // notional USDT per trade when sizingMode is fixed_usdt
  tpMultiplier: number;      // default 2.5
  liquidityWindowStart: string;  // HH:MM UTC, default "00:00"
  liquidityWindowEnd: string;    // HH:MM UTC, default "02:30"
  maxDailyTradesPerCoin: number; // default 1
  storageMode: 'json' | 'postgres';
  testnet: boolean;
  breakoutBufferPercent: number; // default 0.05
  primaryTimeframe: 'D' | 'W' | 'M';          // Blueprint candle (default 'D')
  breakoutTimeframe: '1' | '3' | '5' | '15' | '30' | '60' | '120' | '240';  // Breakout confirmation candle (default '15')
  entryTimeframe: '1' | '3' | '5' | '15' | '30';  // Entry/reversal candle (default '5')
  autoMode?: boolean;
  tradingMode?: TradingMode;
  paperStartingEquity?: number;
  paperFeeBps?: number;
  paperSlippageBps?: number;
  strategyDefaults?: StrategyDefaults;
}

export interface PaperAccountSnapshot {
  mode: TradingMode;
  startingEquity: number;
  equity: number;
  cashEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalFees: number;
  openCount: number;
  updatedAt: number;
}

export interface PaperPositionView {
  tradeId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  direction: BreakoutDirection;
  size: string;
  qty: number;
  avgPrice: string;
  markPrice: string;
  unrealisedPnl: string;
  stopLoss: string;
  takeProfit: string;
  strategyType?: string;
  strategyInstanceId?: string;
  mode: TradeMode;
  openedAt: number;
}

export interface BacktestParams {
  symbols: string[];
  startDate: string;   // YYYY-MM-DD
  endDate: string;
  riskPercent: number;
  tpMultiplier: number;
  liquidityWindowStart: string;
  liquidityWindowEnd: string;
  breakoutBufferPercent: number;
  primaryTimeframe?: 'D' | 'W' | 'M';
  breakoutTimeframe?: string;
  entryTimeframe?: string;
}

export interface BacktestResult {
  id: string;
  params: BacktestParams;
  trades: Trade[];
  summary: BacktestSummary;
  runAt: number;
  strategyType?: string;
  instanceName?: string;
  instanceId?: string;
}

export interface BacktestSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;       // 0-1
  profitFactor: number;
  totalPnl: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  avgRR: number;
  startingEquity: number;
  endingEquity: number;
}

// ============================================================
// MULTI-STRATEGY TYPES
// ============================================================

export type StrategyType =
  | 'break_bounce'
  | 'dca'
  | 'grid'
  | 'ma_crossover'
  | 'rsi'
  | 'bollinger'
  | 'donchian'
  | 'ema_pullback'
  | 'supertrend'
  | 'vwap'
  | 'orb'
  | 'funding_arb'
  | 'cross_exchange'
  | 'dynamic_delta'
  | 'drawdown_hedge';

export const MAX_ENABLED_SYMBOLS = 50;

export const ALL_STRATEGY_TYPES: StrategyType[] = [
  'break_bounce',
  'dca',
  'grid',
  'ma_crossover',
  'rsi',
  'bollinger',
  'donchian',
  'ema_pullback',
  'supertrend',
  'vwap',
  'orb',
  'funding_arb',
  'cross_exchange',
  'dynamic_delta',
  'drawdown_hedge',
];

export interface StrategySignal {
  type: 'entry' | 'exit' | 'hold';
  direction?: BreakoutDirection;
  symbol: string;
  price: number;
  stopLoss?: number;
  takeProfit?: number;
  metadata?: Record<string, unknown>;
  generatedAt: number;
}

export interface StrategyInstance {
  id: string;
  name: string;
  strategyType: StrategyType;
  symbols: string[];
  params: Record<string, unknown>;
  enabled: boolean;
  autoMode: boolean;
  createdAt: number;
  updatedAt: number;
}

// DCA parameters
export interface DCAParams {
  [key: string]: unknown;
  investmentAmount: number;       // USDT per cycle
  intervalMinutes: number;        // how often to buy
  maxTotalInvestment: number;     // stop buying after this USDT total
  takeProfitPercent: number;      // sell % when this unrealized gain hit
  trailingStopPercent: number;
  maFilterPeriod?: number;        // only buy if price < MA (0 = disabled)
  rsiFilterMax?: number;          // only buy if RSI < this (0 = disabled)
}

// Grid parameters
export interface GridParams {
  [key: string]: unknown;
  upperPrice: number;
  lowerPrice: number;
  gridCount: number;              // number of grid levels
  investmentPerGrid: number;      // USDT per grid level
  geometric: boolean;             // geometric vs arithmetic spacing
  stopLossBreakoutPercent: number; // close all if price breaks range by this %
  leverage: number;               // 1 = spot-equivalent
}

// MA Crossover parameters
export interface MACrossoverParams {
  [key: string]: unknown;
  shortPeriod: number;            // default 50
  longPeriod: number;             // default 200
  timeframe: string;              // '5' | '15' | '60' | '240' etc
  rsiConfirmPeriod?: number;      // RSI period for confirmation (0 = disabled)
  rsiLongMin?: number;            // RSI must be > this for longs
  adxMinStrength?: number;        // ADX must be > this (0 = disabled)
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;
}

// RSI Mean-Reversion parameters
export interface RSIParams {
  [key: string]: unknown;
  period: number;                 // default 14
  oversoldThreshold: number;      // default 30 (buy signal)
  overboughtThreshold: number;    // default 70 (sell signal)
  timeframe: string;
  confirmationCandles: number;    // candles RSI must stay below threshold
  maFilterPeriod?: number;        // only trade if price is on correct side of MA
  stopLossPercent: number;
  takeProfitPercent: number;
}

// Bollinger Bands parameters
export interface BollingerParams {
  [key: string]: unknown;
  period: number;                 // default 20
  stdDevMultiplier: number;       // default 2.0
  timeframe: string;
  mode: 'breakout' | 'mean_reversion';
  volumeConfirmMultiplier: number; // volume must be > avg × this (1 = disabled)
  squeezeThresholdPercent: number; // band width / price < this = squeeze
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;
}

// Donchian / Turtle breakout
export interface DonchianParams {
  [key: string]: unknown;
  period: number;
  timeframe: string;
  atrPeriod: number;
  atrMultiplier: number;
  takeProfitAtrMultiplier: number;
}

// 9/21 EMA pullback in the direction of the trend
export interface EmaPullbackParams {
  [key: string]: unknown;
  fastPeriod: number;
  slowPeriod: number;
  timeframe: string;
  stopLossPercent: number;
  takeProfitPercent: number;
}

// ATR Supertrend flip
export interface SupertrendParams {
  [key: string]: unknown;
  atrPeriod: number;
  multiplier: number;
  timeframe: string;
}

// Session VWAP mean-reversion
export interface VwapParams {
  [key: string]: unknown;
  timeframe: string;
  deviationPercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  sessionResetHour: number;
}

export interface FundingArbParams {
  [key: string]: unknown;
  timeframe: string;
  minFundingRate: number;
  exitFundingRate: number;
  maxBasisPercent: number;
  stopBasisPercent: number;
}

export interface CrossExchangeParams {
  [key: string]: unknown;
  timeframe: string;
  minSpreadPercent: number;
  exitSpreadPercent: number;
  stopSpreadPercent: number;
  maxHoldMinutes: number;
}

export interface DynamicDeltaParams {
  [key: string]: unknown;
  timeframe: string;
  hedgeSymbol: string;
  deltaThresholdPercent: number;
  volTriggerPercent: number;
  hedgeRatio: number;
  inventoryUsdt: number;
}

export interface DrawdownHedgeParams {
  [key: string]: unknown;
  timeframe: string;
  hedgeSymbol: string;
  drawdownPercent: number;
  recoverPercent: number;
  hedgePortion: number;
}

export interface OrbParams {
  [key: string]: unknown;
  rangeMinutes: number;
  timeframe: string;
  breakoutBufferPercent: number;
  takeProfitRr: number;
  sessionStartHour: number;
  maxTradesPerDay: number;
}

export interface Position {
  symbol: string;
  direction: BreakoutDirection;
  entryPrice: number;
  qty: number;
  unrealisedPnl: number;
  markPrice: number;
  stopLoss: number;
  takeProfit: number;
  tradeId: string;
  openedAt: number;
}

export interface ApiKeys {
  apiKey: string;           // encrypted
  apiSecret: string;        // encrypted
  testnet: boolean;
}
