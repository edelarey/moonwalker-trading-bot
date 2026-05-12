import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// Types mirrored from backend
export interface SymbolConfig { symbol: string; enabled: boolean; addedAt: number }
export interface AppConfig {
  symbols: SymbolConfig[]
  riskPercent: number
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
}
export interface DailyRange { symbol: string; date: string; high: number; low: number; fetchedAt: number }
export type TradeStatus = 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual'
export type Direction = 'bullish' | 'bearish'
export interface Trade {
  id: string; symbol: string; direction: Direction; entryPrice: number
  stopLoss: number; takeProfit: number; riskDistance: number; riskPercent: number
  positionSize: number; qty: number; openedAt: number; closedAt?: number
  closePrice?: number; pnl?: number; pnlPercent?: number; status: TradeStatus
  bybitOrderId?: string; isBacktest: boolean
  patternType: string; dailyHigh: number; dailyLow: number
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
export interface BacktestResult { id: string; params: BacktestParams; trades: Trade[]; summary: BacktestSummary; runAt: number }

// API methods
export const configApi = {
  get: () => api.get<AppConfig>('/config').then(r => r.data),
  update: (cfg: Partial<AppConfig>) => api.put<AppConfig>('/config', cfg).then(r => r.data),
}
export const symbolsApi = {
  list: () => api.get<SymbolConfig[]>('/symbols').then(r => r.data),
  add: (symbol: string) => api.post<SymbolConfig[]>('/symbols', { symbol }).then(r => r.data),
  remove: (symbol: string) => api.delete<SymbolConfig[]>(`/symbols/${symbol}`).then(r => r.data),
}
export const dailyRangesApi = {
  list: () => api.get<DailyRange[]>('/daily-ranges').then(r => r.data),
  refresh: () => api.post('/daily-ranges/refresh').then(r => r.data),
}
export const tradesApi = {
  list: () => api.get<Trade[]>('/trades').then(r => r.data),
  exportCsv: () => { window.open('/api/trades/export-csv', '_blank') },
}
export const positionsApi = {
  list: () => api.get<any[]>('/positions').then(r => r.data),
  close: (symbol: string, side: string, qty: string) =>
    api.post(`/positions/${symbol}/close`, { side, qty }).then(r => r.data),
}
export const accountApi = {
  equity: () => api.get<{ equity: number }>('/account/equity').then(r => r.data),
}
export const backtestApi = {
  run: (params: BacktestParams) => api.post<BacktestResult>('/backtest/run', params).then(r => r.data),
  results: () => api.get<BacktestResult[]>('/backtest/results').then(r => r.data),
  exportCsv: (id: string) => { window.open(`/api/backtest/results/${id}/export-csv`, '_blank') },
}
