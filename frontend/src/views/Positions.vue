<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTradesStore } from '@/stores/trades'
import { useConfigStore } from '@/stores/config'
import { tradesApi } from '@/api/client'
import TradeRow from '@/components/TradeRow.vue'

const trades = useTradesStore()
const config = useConfigStore()
const filterMode = ref<'all' | 'paper' | 'live'>('all')
const filterSymbol = ref('')
const filterStrategy = ref('')
const clearing = ref(false)

onMounted(() => {
  trades.fetchPositions()
  trades.fetchTrades()
  trades.fetchEquity()
})

const isPaper = computed(() => (config.config?.tradingMode ?? 'paper') === 'paper')
const history = computed(() => trades.trades.filter(t => !t.isBacktest))
const symbolsInHistory = computed(() => [...new Set(history.value.map(t => t.symbol))].sort())
const strategiesInHistory = computed(() => [...new Set(history.value.map(t => t.strategyType).filter(Boolean) as string[])].sort())
const filteredHistory = computed(() => history.value.filter(t => {
  if (filterMode.value !== 'all' && (t.mode ?? 'paper') !== filterMode.value) return false
  if (filterSymbol.value && t.symbol !== filterSymbol.value) return false
  if (filterStrategy.value && t.strategyType !== filterStrategy.value) return false
  return true
}))

async function close(symbol: string, side: string, qty: string, tradeId?: string) {
  if (!confirm(`Close ${symbol} position?`)) return
  await trades.closePosition(symbol, side, qty, tradeId)
}

async function clearHistory() {
  if (!confirm('Clear all paper and live trade history? Open paper positions are dropped. Paper equity goes back to the starting balance. This cannot be undone.')) return
  clearing.value = true
  try { await trades.clearHistory() } finally { clearing.value = false }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Positions & History</h1>
      <span class="badge" :class="isPaper ? 'badge-info' : 'badge-error'">
        {{ isPaper ? 'PAPER BOOK' : 'BYBIT POSITIONS' }}
      </span>
    </div>

    <div v-if="isPaper && trades.paper" class="stats stats-vertical sm:stats-horizontal bg-base-200 border border-base-300 w-full">
      <div class="stat">
        <div class="stat-title">Paper equity</div>
        <div class="stat-value text-xl">${{ trades.paper.equity.toFixed(2) }}</div>
      </div>
      <div class="stat">
        <div class="stat-title">Realized</div>
        <div class="stat-value text-xl" :class="trades.paper.realizedPnl >= 0 ? 'text-profit' : 'text-loss'">
          {{ trades.paper.realizedPnl.toFixed(2) }}
        </div>
      </div>
      <div class="stat">
        <div class="stat-title">Unrealized</div>
        <div class="stat-value text-xl" :class="trades.paper.unrealizedPnl >= 0 ? 'text-profit' : 'text-loss'">
          {{ trades.paper.unrealizedPnl.toFixed(2) }}
        </div>
      </div>
      <div class="stat">
        <div class="stat-title">Fees paid</div>
        <div class="stat-value text-xl">{{ trades.paper.totalFees.toFixed(2) }}</div>
      </div>
    </div>

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">Open Positions</h2>
        <div class="overflow-x-auto">
          <table v-if="trades.positions.length" class="table table-sm">
            <thead><tr>
              <th>Symbol</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>uPnL</th><th>SL</th><th>TP</th><th>Strategy</th><th>Action</th>
            </tr></thead>
            <tbody>
              <tr v-for="p in trades.positions" :key="p.tradeId || p.symbol" class="hover">
                <td class="font-mono font-bold">{{ p.symbol }}</td>
                <td><span :class="p.side === 'Buy' ? 'badge-bullish' : 'badge-bearish'">{{ p.side }}</span></td>
                <td class="font-mono">{{ p.size }}</td>
                <td class="font-mono">{{ parseFloat(p.avgPrice).toFixed(4) }}</td>
                <td class="font-mono">{{ parseFloat(p.markPrice).toFixed(4) }}</td>
                <td :class="parseFloat(p.unrealisedPnl) >= 0 ? 'text-profit' : 'text-loss'" class="font-mono">
                  {{ parseFloat(p.unrealisedPnl).toFixed(2) }}
                </td>
                <td class="font-mono text-loss">{{ p.stopLoss || '—' }}</td>
                <td class="font-mono text-profit">{{ p.takeProfit || '—' }}</td>
                <td class="text-xs">{{ p.strategyType || '—' }}</td>
                <td>
                  <button class="btn btn-xs btn-error" @click="close(p.symbol, p.side, p.size, p.tradeId)">Close</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-center text-base-content/40 py-4 text-sm">No open positions</p>
        </div>
      </div>
    </div>

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 class="card-title text-base">Trade history (kept locally, {{ history.length }})</h2>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-outline" @click="tradesApi.exportCsv()">Export CSV</button>
            <button class="btn btn-sm btn-error btn-outline" :disabled="clearing || history.length === 0" @click="clearHistory">
              {{ clearing ? 'Clearing…' : 'Clear history' }}
            </button>
          </div>
        </div>
        <p class="text-xs text-base-content/50 mb-2">
          Paper and live fills are stored locally. Use <strong>Clear history</strong> when you want a clean book. That does not delete backtests.
        </p>
        <div class="flex flex-wrap gap-2 mb-3">
          <select v-model="filterMode" class="select select-bordered select-xs">
            <option value="all">All modes</option>
            <option value="paper">Paper</option>
            <option value="live">Live</option>
          </select>
          <select v-model="filterSymbol" class="select select-bordered select-xs">
            <option value="">All coins</option>
            <option v-for="s in symbolsInHistory" :key="s" :value="s">{{ s }}</option>
          </select>
          <select v-model="filterStrategy" class="select select-bordered select-xs">
            <option value="">All strategies</option>
            <option v-for="s in strategiesInHistory" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div class="overflow-x-auto">
          <table v-if="filteredHistory.length" class="table table-sm">
            <thead><tr>
              <th>Symbol</th><th>Dir</th><th>Entry</th><th>SL</th><th>TP</th><th>PnL</th><th>Strategy</th><th>Status</th><th>Time</th>
            </tr></thead>
            <tbody>
              <TradeRow v-for="t in filteredHistory" :key="t.id" :trade="t" />
            </tbody>
          </table>
          <p v-else class="text-center text-base-content/40 py-4 text-sm">
            No paper or live fills yet. History is only written when <strong>Auto</strong> is on and a signal fills.
            Backtests do not appear here — open <router-link to="/backtest/results" class="link">Results</router-link>.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
