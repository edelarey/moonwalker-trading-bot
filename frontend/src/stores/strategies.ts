import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { StrategyType } from '@/api/client'

export type { StrategyType }

export interface StrategySignal {
  strategyId: string
  strategyName: string
  symbol: string
  signal: 'buy' | 'sell' | 'hold' | 'entry' | 'exit'
  price: number
  timestamp: string
  metadata: Record<string, any>
}

export interface StrategyInstance {
  id: string
  name: string
  strategyType: StrategyType
  type?: StrategyType
  symbols: string[]
  params: Record<string, any>
  enabled: boolean
  autoMode: boolean
  createdAt: number | string
  updatedAt: number | string
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
  strategyType: StrategyType
  symbols: string[]
  params: Record<string, any>
  enabled: boolean
  autoMode?: boolean
}

export interface UpdateInstancePayload {
  name?: string
  strategyType?: StrategyType
  symbols?: string[]
  params?: Record<string, any>
  enabled?: boolean
  autoMode?: boolean
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export function instanceType(inst: { strategyType?: StrategyType; type?: StrategyType }): StrategyType {
  return inst.strategyType || inst.type || 'break_bounce'
}

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

  function pickSummary(result: Record<string, any>): {
    totalTrades: number; winRate: number; totalPnl: number; maxDrawdown: number
  } {
    const s = result.summary ?? result
    return {
      totalTrades: s.totalTrades ?? result.trades?.length ?? 0,
      winRate: s.winRate ?? 0,
      totalPnl: s.totalPnl ?? 0,
      maxDrawdown: s.maxDrawdown ?? 0,
    }
  }

  async function runBacktest(
    id: string,
    startDate: string,
    endDate: string,
    symbols?: string[],
    riskPercent?: number,
  ): Promise<Record<string, any> | null> {
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/strategies/${id}/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, symbols, riskPercent }),
      })
      if (!res.ok) throw new Error(`Backtest failed: ${res.statusText}`)
      const raw = await res.json()
      return { ...raw, ...pickSummary(raw) }
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

  async function resetDefaults(id: string): Promise<StrategyInstance | null> {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/strategies/${id}/reset-defaults`, { method: 'POST' })
      if (!res.ok) throw new Error(`Failed to reset strategy: ${res.statusText}`)
      const updated: StrategyInstance = await res.json()
      const idx = instances.value.findIndex(i => i.id === id)
      if (idx !== -1) instances.value[idx] = updated
      return updated
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      return null
    } finally {
      loading.value = false
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
    if (existing !== -1) backtestResults.value[existing] = entry
    else backtestResults.value.push(entry)
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
    resetDefaults,
    addSignal,
    addBacktestResult,
    clearBacktestResults,
  }
})
