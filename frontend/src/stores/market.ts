import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dailyRangesApi, type DailyRange } from '@/api/client'

export interface BreakoutEvent {
  symbol: string
  direction: 'bullish' | 'bearish'
  brokenLevel: number
  detectedAt: number
}

export interface RetestEvent { symbol: string; direction: string; detectedAt: number }
export interface ReversalEvent { symbol: string; patternType: string; entryPrice: number; stopLoss: number; takeProfit: number; direction: string; detectedAt: number }

export const useMarketStore = defineStore('market', () => {
  const dailyRanges = ref<DailyRange[]>([])
  const breakouts = ref<BreakoutEvent[]>([])
  const retests = ref<RetestEvent[]>([])
  const reversals = ref<ReversalEvent[]>([])
  const loading = ref(false)

  const rangeBySymbol = computed(() => {
    const m = new Map<string, DailyRange>()
    for (const r of dailyRanges.value) {
      const existing = m.get(r.symbol)
      if (!existing || r.fetchedAt > existing.fetchedAt) m.set(r.symbol, r)
    }
    return m
  })

  async function fetchDailyRanges() {
    loading.value = true
    try {
      dailyRanges.value = await dailyRangesApi.list()
    } finally {
      loading.value = false
    }
  }

  async function refreshDailyRanges() {
    loading.value = true
    try {
      await dailyRangesApi.refresh()
      await fetchDailyRanges()
    } finally {
      loading.value = false
    }
  }

  function addBreakout(event: BreakoutEvent) {
    breakouts.value.unshift(event)
    if (breakouts.value.length > 100) breakouts.value.pop()
  }

  function addRetest(event: RetestEvent) {
    retests.value.unshift(event)
    if (retests.value.length > 100) retests.value.pop()
  }

  function addReversal(event: ReversalEvent) {
    reversals.value.unshift(event)
    if (reversals.value.length > 100) reversals.value.pop()
  }

  return {
    dailyRanges, breakouts, retests, reversals, loading,
    rangeBySymbol, fetchDailyRanges, refreshDailyRanges,
    addBreakout, addRetest, addReversal,
  }
})
