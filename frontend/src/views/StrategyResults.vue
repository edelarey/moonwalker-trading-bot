<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useStrategiesStore, type StrategyType } from '@/stores/strategies'
import { useBacktestStore } from '@/stores/backtest'
import { backtestApi, type BacktestResult } from '@/api/client'
import { ref } from 'vue'

const store = useStrategiesStore()
const backtests = useBacktestStore()
const rows = ref<BacktestResult[]>([])
const loading = ref(false)
const clearing = ref(false)

const typeBadgeClass: Record<string, string> = {
  break_bounce: 'badge-primary',
  dca: 'badge-secondary',
  grid: 'badge-accent',
  ma_crossover: 'badge-info',
  rsi: 'badge-warning',
  bollinger: 'badge-success',
  donchian: 'badge-primary',
  ema_pullback: 'badge-info',
  supertrend: 'badge-accent',
  vwap: 'badge-secondary',
  orb: 'badge-warning',
  funding_arb: 'badge-accent',
  cross_exchange: 'badge-info',
  dynamic_delta: 'badge-secondary',
  drawdown_hedge: 'badge-error',
}

onMounted(async () => {
  loading.value = true
  try {
    rows.value = await backtestApi.results()
    for (const r of rows.value) {
      store.addBacktestResult(
        r.instanceId ?? r.id,
        r.instanceName ?? 'Break & Bounce',
        (r.strategyType ?? 'break_bounce') as StrategyType,
        {
          totalTrades: r.summary.totalTrades,
          winRate: r.summary.winRate,
          totalPnl: r.summary.totalPnl,
          maxDrawdown: r.summary.maxDrawdown,
        },
      )
    }
  } finally {
    loading.value = false
  }
})

async function clearAll() {
  if (!confirm('Clear all saved backtests? This cannot be undone.')) return
  clearing.value = true
  try {
    await backtests.clearAll()
    rows.value = []
    store.clearBacktestResults()
  } finally {
    clearing.value = false
  }
}

async function removeOne(id: string) {
  if (!confirm('Delete this backtest run?')) return
  await backtests.removeOne(id)
  rows.value = rows.value.filter(r => r.id !== id)
  store.clearBacktestResults()
  for (const r of rows.value) {
    store.addBacktestResult(
      r.instanceId ?? r.id,
      r.instanceName ?? r.strategyType ?? 'Backtest',
      (r.strategyType ?? 'break_bounce') as StrategyType,
      {
        totalTrades: r.summary.totalTrades,
        winRate: r.summary.winRate,
        totalPnl: r.summary.totalPnl,
        maxDrawdown: r.summary.maxDrawdown,
      },
    )
  }
}

const display = computed(() =>
  rows.value.map(r => ({
    id: r.id,
    name: r.instanceName ?? 'Break & Bounce',
    type: r.strategyType ?? 'break_bounce',
    when: r.runAt,
    symbols: r.params.symbols.join(', '),
    range: `${r.params.startDate} → ${r.params.endDate}`,
    totalTrades: r.summary.totalTrades,
    winRate: r.summary.winRate,
    totalPnl: r.summary.totalPnl,
    maxDrawdown: r.summary.maxDrawdown,
  })),
)
</script>

<template>
  <div class="p-4 space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-bold">🏆 Strategy Results</h1>
      <div class="flex items-center gap-2">
        <p class="text-xs text-base-content/50">Saved on disk. Also listed under BT Results.</p>
        <button
          class="btn btn-sm btn-error"
          :disabled="clearing || display.length === 0"
          @click="clearAll"
        >
          {{ clearing ? 'Clearing…' : 'Clear all backtests' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-16 text-base-content/50">Loading saved backtests…</div>
    <div v-else-if="display.length === 0" class="text-center text-base-content/50 py-16">
      No saved backtests yet. Run one from
      <router-link to="/backtest" class="link link-primary">Backtest</router-link>
      or
      <router-link to="/strategies" class="link link-primary">Strategy Manager</router-link>.
    </div>

    <div v-else class="card bg-base-200 shadow overflow-x-auto">
      <table class="table table-sm w-full">
        <thead>
          <tr>
            <th>When</th>
            <th>Strategy</th>
            <th>Type</th>
            <th>Coins</th>
            <th>Range</th>
            <th class="text-right">Trades</th>
            <th class="text-right">Win Rate</th>
            <th class="text-right">PnL</th>
            <th class="text-right">Max DD</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="result in display" :key="result.id" class="hover">
            <td class="text-xs whitespace-nowrap">{{ new Date(result.when).toLocaleString() }}</td>
            <td class="font-medium">{{ result.name }}</td>
            <td>
              <span class="badge badge-sm" :class="typeBadgeClass[result.type] ?? 'badge-neutral'">{{ result.type }}</span>
            </td>
            <td class="text-xs max-w-[140px] truncate">{{ result.symbols }}</td>
            <td class="text-xs whitespace-nowrap">{{ result.range }}</td>
            <td class="text-right">{{ result.totalTrades }}</td>
            <td class="text-right">{{ (result.winRate * 100).toFixed(1) }}%</td>
            <td
              class="text-right font-semibold"
              :class="result.totalPnl >= 0 ? 'text-success' : 'text-error'"
            >
              {{ result.totalPnl >= 0 ? '+' : '' }}{{ result.totalPnl.toFixed(2) }}
            </td>
            <td class="text-right text-error">{{ result.maxDrawdown.toFixed(2) }}</td>
            <td>
              <button class="btn btn-ghost btn-xs text-loss" @click="removeOne(result.id)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
