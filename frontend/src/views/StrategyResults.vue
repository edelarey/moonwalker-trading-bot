<script setup lang="ts">
import { useStrategiesStore, type StrategyType } from '@/stores/strategies'

const store = useStrategiesStore()

const typeBadgeClass: Record<StrategyType, string> = {
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
}
</script>

<template>
  <div class="p-4 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">🏆 Strategy Results</h1>
      <button
        class="btn btn-outline btn-sm btn-error"
        :disabled="store.backtestResults.length === 0"
        @click="store.clearBacktestResults()"
      >
        Clear Results
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="store.backtestResults.length === 0" class="text-center text-base-content/50 py-16">
      No backtest results yet. Run a backtest from the
      <router-link to="/strategies" class="link link-primary">Strategy Manager</router-link>.
    </div>

    <!-- Results table -->
    <div v-else class="card bg-base-200 shadow overflow-x-auto">
      <table class="table table-sm w-full">
        <thead>
          <tr>
            <th>Strategy Name</th>
            <th>Type</th>
            <th class="text-right">Total Trades</th>
            <th class="text-right">Win Rate %</th>
            <th class="text-right">Total PnL</th>
            <th class="text-right">Max Drawdown</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="result in store.backtestResults" :key="result.strategyId" class="hover">
            <td class="font-medium">{{ result.strategyName }}</td>
            <td>
              <span class="badge badge-sm" :class="typeBadgeClass[result.type]">{{ result.type }}</span>
            </td>
            <td class="text-right">{{ result.totalTrades }}</td>
            <td class="text-right">{{ (result.winRate * 100).toFixed(1) }}%</td>
            <td
              class="text-right font-semibold"
              :class="result.totalPnl >= 0 ? 'text-success' : 'text-error'"
            >
              {{ result.totalPnl >= 0 ? '+' : '' }}{{ result.totalPnl.toFixed(2) }}
            </td>
            <td class="text-right text-error">{{ result.maxDrawdown.toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
