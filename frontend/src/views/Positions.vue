<script setup lang="ts">
import { onMounted } from 'vue'
import { useTradesStore } from '@/stores/trades'
import { tradesApi } from '@/api/client'
import TradeRow from '@/components/TradeRow.vue'

const trades = useTradesStore()

onMounted(() => {
  trades.fetchPositions()
  trades.fetchTrades()
})

async function close(symbol: string, side: string, qty: string) {
  if (!confirm(`Close ${symbol} position?`)) return
  await trades.closePosition(symbol, side, qty)
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Positions & History</h1>

    <!-- Open Positions (from Bybit) -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">Open Positions</h2>
        <div class="overflow-x-auto">
          <table v-if="trades.positions.length" class="table table-sm">
            <thead><tr>
              <th>Symbol</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>uPnL</th><th>SL</th><th>TP</th><th>Action</th>
            </tr></thead>
            <tbody>
              <tr v-for="p in trades.positions" :key="p.symbol" class="hover">
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
                <td>
                  <button class="btn btn-xs btn-error" @click="close(p.symbol, p.side, p.size)">Close</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-center text-base-content/40 py-4 text-sm">No open positions</p>
        </div>
      </div>
    </div>

    <!-- Trade History -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <div class="flex items-center justify-between mb-2">
          <h2 class="card-title text-base">Trade History ({{ trades.trades.length }})</h2>
          <button class="btn btn-sm btn-outline" @click="tradesApi.exportCsv()">
            Export CSV
          </button>
        </div>
        <div class="overflow-x-auto">
          <table v-if="trades.trades.length" class="table table-sm">
            <thead><tr>
              <th>Symbol</th><th>Dir</th><th>Entry</th><th>SL</th><th>TP</th><th>PnL</th><th>Status</th><th>Time</th>
            </tr></thead>
            <tbody>
              <TradeRow v-for="t in trades.trades" :key="t.id" :trade="t" />
            </tbody>
          </table>
          <p v-else class="text-center text-base-content/40 py-4 text-sm">No trades yet</p>
        </div>
      </div>
    </div>
  </div>
</template>
