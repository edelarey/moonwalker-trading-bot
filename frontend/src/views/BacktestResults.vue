<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useBacktestStore } from '@/stores/backtest'
import StatCard from '@/components/StatCard.vue'
import TradeRow from '@/components/TradeRow.vue'
import EquityCurve from '@/components/EquityCurve.vue'
import { backtestApi } from '@/api/client'

const store = useBacktestStore()

onMounted(() => store.fetchResults())

const result = computed(() => store.currentResult)
const s = computed(() => result.value?.summary)

function selectResult(id: string) {
  store.currentResult = store.results.find(r => r.id === id) ?? null
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-bold">Backtest Results</h1>
      <div class="flex gap-2">
        <button v-if="result" class="btn btn-sm btn-outline" @click="backtestApi.exportCsv(result!.id)">
          Export CSV
        </button>
        <button v-if="result" class="btn btn-sm btn-outline btn-error" @click="store.removeOne(result!.id)">
          Delete this run
        </button>
        <button
          v-if="store.results.length"
          class="btn btn-sm btn-error"
          @click="confirm('Clear all saved backtests? This cannot be undone.') && store.clearAll()"
        >
          Clear all backtests
        </button>
      </div>
    </div>

    <!-- Result Selector -->
    <div v-if="store.results.length > 1" class="flex flex-wrap gap-2">
      <button
        v-for="r in store.results"
        :key="r.id"
        class="btn btn-xs"
        :class="result?.id === r.id ? 'btn-primary' : 'btn-outline'"
        @click="selectResult(r.id)"
      >
        {{ new Date(r.runAt).toLocaleDateString() }} — {{ r.instanceName || 'B&B' }} — {{ r.params.symbols.slice(0, 3).join(',') }}
      </button>
    </div>

    <div v-if="!result" class="text-center text-base-content/40 py-20 text-lg">
      No saved backtests yet. Run one from Backtest or Strategy Manager — results are stored on disk and survive a refresh.
    </div>

    <template v-else>
      <!-- Summary Cards -->
      <div v-if="s" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Trades" :value="s.totalTrades" icon="🔢" />
        <StatCard title="Win Rate" :value="(s.winRate * 100).toFixed(1) + '%'" :trend="s.winRate >= 0.5 ? 'up' : 'down'" icon="🎯" />
        <StatCard title="Profit Factor" :value="isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'" :trend="s.profitFactor >= 1.5 ? 'up' : 'down'" icon="⚖️" />
        <StatCard title="Total P&L" :value="(s.totalPnl >= 0 ? '+' : '') + s.totalPnl.toFixed(2) + ' USDT'" :trend="s.totalPnl >= 0 ? 'up' : 'down'" icon="💰" />
        <StatCard title="Max Drawdown" :value="s.maxDrawdown.toFixed(2) + ' USDT'" :trend="s.maxDrawdownPercent < 10 ? 'up' : 'down'" icon="📉" />
        <StatCard title="Max DD %" :value="s.maxDrawdownPercent.toFixed(2) + '%'" icon="📊" />
        <StatCard title="Avg R:R" :value="s.avgRR.toFixed(2)" icon="📐" />
        <StatCard title="End Equity" :value="'$' + s.endingEquity.toFixed(2)" icon="💵" />
      </div>

      <!-- Equity Curve -->
      <div class="card bg-base-200 border border-base-300">
        <div class="card-body p-4">
          <h2 class="card-title text-base">Equity Curve</h2>
          <EquityCurve :trades="result.trades" :starting-equity="s?.startingEquity" />
        </div>
      </div>

      <!-- Trade List -->
      <div class="card bg-base-200 border border-base-300">
        <div class="card-body p-4">
          <h2 class="card-title text-base">Trade List ({{ result.trades.length }})</h2>
          <div class="overflow-x-auto max-h-96">
            <table class="table table-sm">
              <thead class="sticky top-0 bg-base-200"><tr>
                <th>Symbol</th><th>Dir</th><th>Entry</th><th>SL</th><th>TP</th><th>PnL</th><th>Status</th><th>Time</th>
              </tr></thead>
              <tbody>
                <TradeRow v-for="t in result.trades" :key="t.id" :trade="t" />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
