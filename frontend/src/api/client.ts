import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

export type TradingMode = 'paper' | 'live'
export type TradeMode = 'paper' | 'live' | 'backtest'
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
  | 'drawdown_hedge'

export const ALL_STRATEGY_TYPES: StrategyType[] = [
  'break_bounce', 'dca', 'grid', 'ma_crossover', 'rsi', 'bollinger',
  'donchian', 'ema_pullback', 'supertrend', 'vwap', 'orb',
  'funding_arb', 'cross_exchange', 'dynamic_delta', 'drawdown_hedge',
]

export const STRATEGY_TYPE_NAMES: Record<StrategyType, string> = {
  break_bounce: 'Break & Bounce',
  dca: 'DCA',
  grid: 'Grid',
  ma_crossover: 'MA Crossover',
  rsi: 'RSI',
  bollinger: 'Bollinger',
  donchian: 'Donchian Breakout',
  ema_pullback: 'EMA Pullback',
  supertrend: 'Supertrend',
  vwap: 'VWAP Fade',
  orb: 'Opening Range Breakout',
  funding_arb: 'Funding Arb (delta-neutral)',
  cross_exchange: 'Cross-Exchange Hedge',
  dynamic_delta: 'Dynamic Delta Hedge',
  drawdown_hedge: 'Drawdown Hedge',
}

export interface SymbolConfig { symbol: string; enabled: boolean; addedAt: number }
export interface AppConfig {
  symbols: SymbolConfig[]
  riskPercent: number
  sizingMode?: 'risk_percent' | 'fixed_usdt'
  fixedPositionUsdt?: number
  tpMultiplier: number
  liquidityWindowStart: string
  liquidityWindowEnd: string
  maxDailyTradesPerCoin: number
  storageMode: 'json' | 'postgres'
  testnet: boolean
  breakoutBufferPercent: number
  primaryTimeframe: 'D' | 'W' | 'M'
  breakoutTimeframe: '1' | '3' | '5' | '15' | '30' | '60' | '120' | '240'
  entryTimeframe: '1' | '3' | '5' | '15' | '30'
  autoMode?: boolean
  tradingMode?: TradingMode
  paperStartingEquity?: number
  paperFeeBps?: number
  paperSlippageBps?: number
}
export interface DailyRange { symbol: string; date: string; high: number; low: number; fetchedAt: number }
export type TradeStatus = 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual'
export type Direction = 'bullish' | 'bearish'
export interface Trade {
  id: string; symbol: string; direction: Direction; entryPrice: number
  stopLoss: number; takeProfit: number; riskDistance: number; riskPercent: number
  positionSize: number; qty: number; openedAt: number; closedAt?: number
  closePrice?: number; pnl?: number; pnlPercent?: number; fees?: number
  status: TradeStatus
  bybitOrderId?: string; isBacktest: boolean
  mode?: TradeMode
  strategyInstanceId?: string
  strategyType?: string
  tag?: string
  patternType: string; dailyHigh: number; dailyLow: number
}
export interface PaperAccountSnapshot {
  mode: TradingMode
  startingEquity: number
  equity: number
  cashEquity: number
  realizedPnl: number
  unrealizedPnl: number
  totalFees: number
  openCount: number
  updatedAt: number
}
export interface PaperPositionView {
  tradeId: string
  symbol: string
  side: 'Buy' | 'Sell'
  direction: Direction
  size: string
  qty: number
  avgPrice: string
  markPrice: string
  unrealisedPnl: string
  stopLoss: string
  takeProfit: string
  strategyType?: string
  strategyInstanceId?: string
  mode: TradeMode
  openedAt: number
}
export interface BacktestParams {
  symbols: string[]; startDate: string; endDate: string
  riskPercent: number; tpMultiplier: number
  liquidityWindowStart: string; liquidityWindowEnd: string
  breakoutBufferPercent: number
  primaryTimeframe?: 'D' | 'W' | 'M'
  breakoutTimeframe?: string
  entryTimeframe?: string
}
export interface BacktestSummary {
  totalTrades: number; winningTrades: number; losingTrades: number
  winRate: number; profitFactor: number; totalPnl: number
  maxDrawdown: number; maxDrawdownPercent: number; avgRR: number
  startingEquity: number; endingEquity: number
}
export interface BacktestResult {
  id: string
  params: BacktestParams
  trades: Trade[]
  summary: BacktestSummary
  runAt: number
  strategyType?: string
  instanceName?: string
  instanceId?: string
}

export const configApi = {
  get: () => api.get<AppConfig>('/config').then(r => r.data),
  update: (cfg: Partial<AppConfig>) => api.put<AppConfig>('/config', cfg).then(r => r.data),
}
export const MAX_ENABLED_SYMBOLS = 50

export interface MarketTicker {
  symbol: string
  lastPrice: number
  turnover24h: number
  price24hPcnt: number
  volume24h: number
}

export interface ApiKeyStatus {
  configured: boolean
  source: 'local' | 'env' | 'none'
  label: string
  keyHint: string
  testnet: boolean
}

export const symbolsApi = {
  list: () => api.get<SymbolConfig[]>('/symbols').then(r => r.data),
  add: (symbol: string) => api.post<SymbolConfig[]>('/symbols', { symbol }).then(r => r.data),
  bulk: (symbols: string[], enabled = true) =>
    api.post<SymbolConfig[]>('/symbols/bulk', { symbols, enabled }).then(r => r.data),
  remove: (symbol: string) => api.delete<SymbolConfig[]>(`/symbols/${symbol}`).then(r => r.data),
}
export const marketsApi = {
  top: (limit = 50) => api.get<MarketTicker[]>('/markets/top', { params: { limit } }).then(r => r.data),
}
export const keysApi = {
  status: () => api.get<ApiKeyStatus>('/keys').then(r => r.data),
  save: (body: { apiKey: string; apiSecret: string; testnet: boolean; label?: string }) =>
    api.put<ApiKeyStatus>('/keys', body).then(r => r.data),
  clear: () => api.delete<ApiKeyStatus>('/keys').then(r => r.data),
}
export const dailyRangesApi = {
  list: () => api.get<DailyRange[]>('/daily-ranges').then(r => r.data),
  refresh: () => api.post('/daily-ranges/refresh').then(r => r.data),
}
export const tradesApi = {
  list: () => api.get<Trade[]>('/trades').then(r => r.data),
  clear: () => api.delete<{ ok: boolean; account?: PaperAccountSnapshot }>('/trades').then(r => r.data),
  exportCsv: () => { window.open('/api/trades/export-csv', '_blank') },
}
export const positionsApi = {
  list: () => api.get<any[]>('/positions').then(r => r.data),
  close: (symbol: string, side: string, qty: string, tradeId?: string) =>
    api.post(`/positions/${symbol}/close`, { side, qty, tradeId }).then(r => r.data),
}
export const accountApi = {
  equity: () => api.get<{ equity: number } & Partial<PaperAccountSnapshot>>('/account/equity').then(r => r.data),
}
export const paperApi = {
  account: () => api.get<PaperAccountSnapshot>('/paper/account').then(r => r.data),
  reset: (startingEquity?: number) => api.post<PaperAccountSnapshot>('/paper/reset', { startingEquity }).then(r => r.data),
}
export const backtestApi = {
  run: (params: BacktestParams) => api.post<BacktestResult>('/backtest/run', params).then(r => r.data),
  results: () => api.get<BacktestResult[]>('/backtest/results').then(r => r.data),
  clear: () => api.delete<{ ok: boolean }>('/backtest/results').then(r => r.data),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/backtest/results/${id}`).then(r => r.data),
  exportCsv: (id: string) => { window.open(`/api/backtest/results/${id}/export-csv`, '_blank') },
}
