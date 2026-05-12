import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { tradesApi, positionsApi, accountApi, type Trade } from '@/api/client'

export const useTradesStore = defineStore('trades', () => {
  const trades = ref<Trade[]>([])
  const positions = ref<any[]>([])
  const equity = ref<number>(0)
  const loading = ref(false)

  const openTrades = computed(() => trades.value.filter(t => t.status === 'open'))
  const closedTrades = computed(() => trades.value.filter(t => t.status !== 'open'))
  const totalPnl = computed(() => trades.value.reduce((s, t) => s + (t.pnl ?? 0), 0))
  const winRate = computed(() => {
    const closed = closedTrades.value
    if (!closed.length) return 0
    return closed.filter(t => (t.pnl ?? 0) > 0).length / closed.length
  })

  async function fetchTrades() {
    loading.value = true
    try { trades.value = await tradesApi.list() } finally { loading.value = false }
  }

  async function fetchPositions() {
    try { positions.value = await positionsApi.list() } catch { /* ignore */ }
  }

  async function fetchEquity() {
    try { const { equity: eq } = await accountApi.equity(); equity.value = eq } catch { /* ignore */ }
  }

  async function closePosition(symbol: string, side: string, qty: string) {
    await positionsApi.close(symbol, side, qty)
    await fetchPositions()
  }

  function addTrade(trade: Trade) {
    const idx = trades.value.findIndex(t => t.id === trade.id)
    if (idx >= 0) trades.value[idx] = trade
    else trades.value.unshift(trade)
  }

  return {
    trades, positions, equity, loading,
    openTrades, closedTrades, totalPnl, winRate,
    fetchTrades, fetchPositions, fetchEquity, closePosition, addTrade,
  }
})
