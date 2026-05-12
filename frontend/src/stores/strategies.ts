import { ref } from 'vue'
import { defineStore } from 'pinia'

export type StrategyType = 'break_bounce' | 'dca' | 'grid' | 'ma_crossover' | 'rsi' | 'bollinger'

export interface StrategySignal {
  strategyId: string
  strategyName: string
  symbol: string
  signal: 'buy' | 'sell' | 'hold'
  price: number
  timestamp: string
  metadata: Record<string, any>
}

export interface DCAParams {
  investmentAmount: number
  intervalHours: number
  maxPositions: number
  takeProfitPct: number
  stopLossPct: number
}

export interface GridParams {
  upperPrice: number
  lowerPrice: number
  gridLevels: number
  investmentPerGrid: number
}

export interface MACrossoverParams {
  fastPeriod: number
  slowPeriod: number
  signalPeriod: number
  timeframe: string
}

export interface RSIParams {
  period: number
  overbought: number
  oversold: number
  timeframe: string
}

export interface BollingerParams {
  period: number
  stdDev: number
  timeframe: string
}

export interface StrategyInstance {
  id: string
  name: string
  type: StrategyType
  symbols: string[]
  params: DCAParams | GridParams | MACrossoverParams | RSIParams | BollingerParams | Record<string, any>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface BacktestResult {
  strategyId: string
  strategyName: string
  type: StrategyType
  totalTrades: number
  winRate: number
  totalPnl: number
  maxDrawdown: number
}

export interface CreateInstancePayload {
  name: string
  type: StrategyType
  symbols: string[]
  params: Record<string, any>
  enabled: boolean
}

export interface UpdateInstancePayload {
  name?: string
  type?: StrategyType
  symbols?: string[]
  params?: Record<string, any>
  enabled?: boolean
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const useStrategiesStore = defineStore('strategies', () => {
  const instances = ref<StrategyInstance[]>([])
  const signals = ref<StrategySignal[]>([])
  const backtestResults = ref<BacktestResult[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchInstances(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/strategies`)
      if (!res.ok) throw new Error(`Failed to fetch strategies: ${res.statusText}`)
      instances.value = await res.json()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function createInstance(payload: CreateInstancePayload): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Failed to create strategy: ${res.statusText}`)
      const created: StrategyInstance = await res.json()
      instances.value.push(created)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function updateInstance(id: string, payload: UpdateInstancePayload): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/strategies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Failed to update strategy: ${res.statusText}`)
      const updated: StrategyInstance = await res.json()
      const idx = instances.value.findIndex(i => i.id === id)
      if (idx !== -1) instances.value[idx] = updated
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function deleteInstance(id: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/strategies/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed to delete strategy: ${res.statusText}`)
      instances.value = instances.value.filter(i => i.id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function runBacktest(id: string, startDate: string, endDate: string): Promise<Record<string, any> | null> {
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/strategies/${id}/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })
      if (!res.ok) throw new Error(`Backtest failed: ${res.statusText}`)
      return await res.json()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  async function fetchDefaults(type: StrategyType): Promise<Record<string, any> | null> {
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/strategies/defaults/${type}`)
      if (!res.ok) throw new Error(`Failed to fetch defaults: ${res.statusText}`)
      return await res.json()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  function addSignal(signal: StrategySignal): void {
    signals.value.unshift(signal)
    if (signals.value.length > 100) signals.value = signals.value.slice(0, 100)
  }

  function addBacktestResult(
    strategyId: string,
    strategyName: string,
    type: StrategyType,
    result: { totalTrades: number; winRate: number; totalPnl: number; maxDrawdown: number }
  ): void {
    const existing = backtestResults.value.findIndex(r => r.strategyId === strategyId)
    const entry: BacktestResult = { strategyId, strategyName, type, ...result }
    if (existing !== -1) {
      backtestResults.value[existing] = entry
    } else {
      backtestResults.value.push(entry)
    }
  }

  function clearBacktestResults(): void {
    backtestResults.value = []
  }

  return {
    instances,
    signals,
    backtestResults,
    loading,
    error,
    fetchInstances,
    createInstance,
    updateInstance,
    deleteInstance,
    runBacktest,
    fetchDefaults,
    addSignal,
    addBacktestResult,
    clearBacktestResults,
  }
})
