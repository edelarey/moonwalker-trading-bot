import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { tradesApi, positionsApi, accountApi, paperApi, type Trade, type PaperAccountSnapshot } from '@/api/client'

export const useTradesStore = defineStore('trades', () => {
  const trades = ref<Trade[]>([])
  const positions = ref<any[]>([])
  const equity = ref<number>(0)
  const paper = ref<PaperAccountSnapshot | null>(null)
  const loading = ref(false)

  const openTrades = computed(() => trades.value.filter(t => t.status === 'open'))
  const closedTrades = computed(() => trades.value.filter(t => t.status !== 'open'))
  const paperTrades = computed(() => trades.value.filter(t => (t.mode ?? 'paper') === 'paper' && !t.isBacktest))
  const totalPnl = computed(() => {
    if (paper.value) return paper.value.realizedPnl + paper.value.unrealizedPnl
    return trades.value.reduce((s, t) => s + (t.pnl ?? 0), 0)
  })
  const winRate = computed(() => {
    const closed = closedTrades.value.filter(t => !t.isBacktest)
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
    try {
      const data = await accountApi.equity()
      equity.value = data.equity
      if (data.mode === 'paper' || data.startingEquity != null) {
        paper.value = {
          mode: 'paper',
          startingEquity: data.startingEquity ?? 10000,
          equity: data.equity,
          cashEquity: data.cashEquity ?? data.equity,
          realizedPnl: data.realizedPnl ?? 0,
          unrealizedPnl: data.unrealizedPnl ?? 0,
          totalFees: data.totalFees ?? 0,
          openCount: data.openCount ?? 0,
          updatedAt: data.updatedAt ?? Date.now(),
        }
      }
    } catch { /* ignore */ }
  }

  async function clearHistory() {
    const data = await tradesApi.clear()
    trades.value = []
    positions.value = []
    if (data.account) {
      paper.value = data.account
      equity.value = data.account.equity
    } else {
      await fetchEquity()
    }
  }

  async function resetPaper(startingEquity?: number) {
    paper.value = await paperApi.reset(startingEquity)
    equity.value = paper.value.equity
    await Promise.all([fetchTrades(), fetchPositions()])
  }

  async function closePosition(symbol: string, side: string, qty: string, tradeId?: string) {
    await positionsApi.close(symbol, side, qty, tradeId)
    await Promise.all([fetchPositions(), fetchTrades(), fetchEquity()])
  }

  function addTrade(trade: Trade) {
    const idx = trades.value.findIndex(t => t.id === trade.id)
    if (idx >= 0) trades.value[idx] = trade
    else trades.value.unshift(trade)
  }

  function setPaperAccount(snap: PaperAccountSnapshot) {
    paper.value = snap
    equity.value = snap.equity
  }

  return {
    trades, positions, equity, paper, loading,
    openTrades, closedTrades, paperTrades, totalPnl, winRate,
    fetchTrades, fetchPositions, fetchEquity, resetPaper, clearHistory, closePosition, addTrade, setPaperAccount,
  }
})
