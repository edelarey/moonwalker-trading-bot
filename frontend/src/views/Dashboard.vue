<script setup lang="ts">
import { computed } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useMarketStore } from '@/stores/market'
import { useTradesStore } from '@/stores/trades'
import StatCard from '@/components/StatCard.vue'
import SymbolBadge from '@/components/SymbolBadge.vue'
import EquityCurve from '@/components/EquityCurve.vue'
import TradeRow from '@/components/TradeRow.vue'

const config = useConfigStore()
const market = useMarketStore()
const trades = useTradesStore()

const enabledSymbols = computed(() =>
  config.config?.symbols.filter(s => s.enabled).map(s => s.symbol) ?? []
)
const winRatePct = computed(() => (trades.winRate * 100).toFixed(1) + '%')
const totalPnlSign = computed(() => (trades.totalPnl >= 0 ? 'up' : 'down') as 'up' | 'down')
const pnlDisplay = computed(() => (trades.totalPnl >= 0 ? '+' : '') + trades.totalPnl.toFixed(2) + ' USDT')
const isPaper = computed(() => (config.config?.tradingMode ?? 'paper') === 'paper')
const equityTitle = computed(() => {
  if (isPaper.value) return 'Paper Equity'
  const source = trades.liveEquity?.equitySource ?? config.config?.equitySource ?? 'usdt'
  return source === 'unified_usd' ? 'Account Equity (Unified USD)' : 'Account Equity (USDT)'
})
const equitySubtitle = computed(() => {
  if (isPaper.value) return 'Virtual USDT'
  const live = trades.liveEquity
  if (!live) return 'Live — waiting for Bybit'
  return `USDT line ${live.usdtEquity.toFixed(2)} · Unified margin ${live.unifiedUsdEquity.toFixed(2)}`
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Dashboard</h1>
      <div class="flex gap-2">
        <span v-if="(config.config?.tradingMode ?? 'paper') === 'paper'" class="badge badge-info">PAPER</span>
        <span v-else class="badge badge-error animate-pulse">LIVE</span>
        <span v-if="config.config?.testnet" class="badge badge-warning">TESTNET</span>
        <span v-else class="badge badge-neutral">MAINNET DATA</span>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        :title="equityTitle"
        :value="'$' + trades.equity.toFixed(2)"
        :subtitle="equitySubtitle"
        icon="💰"
      />
      <StatCard title="Total P&L" :value="pnlDisplay" :trend="totalPnlSign" icon="📈" />
      <StatCard title="Win Rate" :value="winRatePct" icon="🎯" />
      <StatCard title="Active Breakouts" :value="market.breakouts.length" icon="🔥" />
    </div>

    <!-- Equity Curve -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base mb-2">Equity Curve</h2>
        <EquityCurve
          :trades="trades.closedTrades.filter(t => !t.isBacktest)"
          :starting-equity="trades.paper?.startingEquity ?? 10000"
        />
      </div>
    </div>

    <!-- Coin Grid -->
    <div>
      <h2 class="text-lg font-semibold mb-3">Coin Status ({{ enabledSymbols.length }} tracked)</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <SymbolBadge v-for="sym in enabledSymbols" :key="sym" :symbol="sym" />
      </div>
    </div>

    <!-- Recent Breakouts -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">Recent Breakouts</h2>
        <div v-if="!market.breakouts.length" class="text-base-content/40 text-sm py-4 text-center">
          No breakouts detected yet
        </div>
        <div v-else class="space-y-2 max-h-48 overflow-y-auto">
          <div
            v-for="(b, i) in market.breakouts.slice(0, 10)"
            :key="i"
            class="flex items-center justify-between text-sm p-2 rounded bg-base-300"
          >
            <span class="font-mono font-bold">{{ b.symbol }}</span>
            <span :class="b.direction === 'bullish' ? 'badge-bullish' : 'badge-bearish'">
              {{ b.direction === 'bullish' ? '▲ Long' : '▼ Short' }}
            </span>
            <span class="font-mono text-base-content/60">{{ b.brokenLevel.toFixed(4) }}</span>
            <span class="text-xs text-base-content/40">{{ new Date(b.detectedAt).toLocaleTimeString() }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Trades -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">Recent Trades</h2>
        <div class="overflow-x-auto">
          <table v-if="trades.trades.length" class="table table-sm">
            <thead><tr>
              <th>Symbol</th><th>Dir</th><th>Entry</th><th>SL</th><th>TP</th><th>PnL</th><th>Strategy</th><th>Status</th><th>Time</th>
            </tr></thead>
            <tbody>
              <TradeRow v-for="t in trades.trades.slice(0, 5)" :key="t.id" :trade="t" />
            </tbody>
          </table>
          <p v-else class="text-center text-base-content/40 py-4 text-sm">No trades yet</p>
        </div>
      </div>
    </div>
  </div>
</template>
