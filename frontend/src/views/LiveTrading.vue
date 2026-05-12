<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useMarketStore } from '@/stores/market'
import { useStrategiesStore, type StrategySignal } from '@/stores/strategies'

const config = useConfigStore()
const market = useMarketStore()
const strategiesStore = useStrategiesStore()

onMounted(async () => {
  if (strategiesStore.instances.length === 0) await strategiesStore.fetchInstances()
})

const autoMode = computed({
  get: () => (config.config as any)?.autoMode ?? false,
  set: (val: boolean) => config.updateConfig({ autoMode: val } as any),
})

const reversals = computed(() => market.reversals.slice(0, 10))

const activeStrategies = computed(() => strategiesStore.instances.filter(i => i.enabled))

function lastSignalFor(strategyId: string): StrategySignal | null {
  return strategiesStore.signals.find(s => s.strategyId === strategyId) ?? null
}

const typeBadgeClass: Record<string, string> = {
  break_bounce: 'badge-primary',
  dca: 'badge-secondary',
  grid: 'badge-accent',
  ma_crossover: 'badge-info',
  rsi: 'badge-warning',
  bollinger: 'badge-success',
}

function signalBadgeClass(signal: string): string {
  if (signal === 'buy') return 'badge-success'
  if (signal === 'sell') return 'badge-error'
  return 'badge-ghost'
}

async function disableStrategy(id: string) {
  await strategiesStore.updateInstance(id, { enabled: false })
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Live Trading</h1>

    <!-- AUTO Mode Toggle -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="card-title text-base">AUTO Mode</h2>
            <p class="text-sm text-base-content/60 mt-1">
              When enabled, the bot opens trades automatically on reversal signals.
              <span class="text-warning font-medium">Use with caution on mainnet.</span>
            </p>
          </div>
          <label class="flex items-center gap-3 cursor-pointer">
            <span class="text-sm font-medium" :class="autoMode ? 'text-profit' : 'text-base-content/50'">
              {{ autoMode ? 'AUTO ON' : 'AUTO OFF' }}
            </span>
            <input
              type="checkbox"
              class="toggle toggle-lg"
              :class="autoMode ? 'toggle-success' : ''"
              :checked="autoMode"
              @change="autoMode = !autoMode"
            />
          </label>
        </div>
      </div>
    </div>

    <!-- Risk Parameters -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">Risk Parameters</h2>
        <div v-if="config.config">
          <!-- Timeframe Setup -->
          <h3 class="text-sm font-semibold text-base-content/70 uppercase tracking-wide mt-1 mb-2">Timeframe Setup</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 items-start mb-4 p-3 rounded-lg bg-base-300/50">
            <label class="form-control w-full">
              <span class="label-text text-xs mb-1">📅 Blueprint Candle (Range)</span>
              <select
                class="select select-bordered w-full"
                :value="config.config?.primaryTimeframe ?? 'D'"
                @change="config.updateConfig({ primaryTimeframe: ($event.target as HTMLSelectElement).value as any })"
              >
                <option value="D">Daily (D)</option>
                <option value="W">Weekly (W)</option>
                <option value="M">Monthly (M)</option>
              </select>
              <span class="label-text-alt text-xs mt-1 text-base-content/40">Sets the high/low range to watch</span>
            </label>

            <label class="form-control w-full">
              <span class="label-text text-xs mb-1">📊 Breakout Candle</span>
              <select
                class="select select-bordered w-full"
                :value="config.config?.breakoutTimeframe ?? '15'"
                @change="config.updateConfig({ breakoutTimeframe: ($event.target as HTMLSelectElement).value as any })"
              >
                <option value="1">1 minute</option>
                <option value="3">3 minutes</option>
                <option value="5">5 minutes</option>
                <option value="15">15 minutes (default)</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
              </select>
              <span class="label-text-alt text-xs mt-1 text-base-content/40">Must close beyond range level</span>
            </label>

            <label class="form-control w-full">
              <span class="label-text text-xs mb-1">🕯️ Entry Candle (Reversal)</span>
              <select
                class="select select-bordered w-full"
                :value="config.config?.entryTimeframe ?? '5'"
                @change="config.updateConfig({ entryTimeframe: ($event.target as HTMLSelectElement).value as any })"
              >
                <option value="1">1 minute</option>
                <option value="3">3 minutes</option>
                <option value="5">5 minutes (default)</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
              </select>
              <span class="label-text-alt text-xs mt-1 text-base-content/40">Retest + reversal pattern timeframe</span>
            </label>
          </div>
          <p class="text-xs text-warning/80 mb-3">⚠ Timeframe changes take effect after restarting the backend.</p>

          <!-- Risk params grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label class="form-control">
            <span class="label-text text-xs mb-1">Risk % per trade (max 1)</span>
            <input
              type="number" step="0.1" min="0.1" max="1"
              class="input input-bordered input-sm"
              :value="config.config.riskPercent"
              @change="config.updateConfig({ riskPercent: parseFloat(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs mb-1">TP Multiplier (R:R)</span>
            <input
              type="number" step="0.5" min="1" max="10"
              class="input input-bordered input-sm"
              :value="config.config.tpMultiplier"
              @change="config.updateConfig({ tpMultiplier: parseFloat(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs mb-1">Liquidity Window Start (UTC)</span>
            <input
              type="time"
              class="input input-bordered input-sm"
              :value="config.config.liquidityWindowStart"
              @change="config.updateConfig({ liquidityWindowStart: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs mb-1">Liquidity Window End (UTC)</span>
            <input
              type="time"
              class="input input-bordered input-sm"
              :value="config.config.liquidityWindowEnd"
              @change="config.updateConfig({ liquidityWindowEnd: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs mb-1">Max trades per coin/day</span>
            <input
              type="number" step="1" min="1" max="5"
              class="input input-bordered input-sm"
              :value="config.config.maxDailyTradesPerCoin"
              @change="config.updateConfig({ maxDailyTradesPerCoin: parseInt(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs mb-1">Breakout Buffer %</span>
            <input
              type="number" step="0.01" min="0" max="1"
              class="input input-bordered input-sm"
              :value="config.config.breakoutBufferPercent"
              @change="config.updateConfig({ breakoutBufferPercent: parseFloat(($event.target as HTMLInputElement).value) })"
            />
          </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Live Reversal Signals Feed -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">⚡ Live Reversal Signals</h2>
        <div v-if="!reversals.length" class="text-center text-base-content/40 py-8 text-sm">
          Waiting for reversal signals…
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="(r, i) in reversals"
            :key="i"
            class="p-3 rounded-lg bg-base-300 flex flex-wrap gap-4 items-center text-sm"
          >
            <span class="font-bold font-mono">{{ r.symbol }}</span>
            <span :class="r.direction === 'bullish' ? 'badge-bullish' : 'badge-bearish'">
              {{ r.direction === 'bullish' ? '▲ Long' : '▼ Short' }}
            </span>
            <span class="badge badge-outline badge-sm">{{ r.patternType }}</span>
            <span class="font-mono">Entry: <b>{{ r.entryPrice?.toFixed(4) }}</b></span>
            <span class="font-mono text-loss">SL: {{ r.stopLoss?.toFixed(4) }}</span>
            <span class="font-mono text-profit">TP: {{ r.takeProfit?.toFixed(4) }}</span>
            <span class="text-xs text-base-content/40 ml-auto">{{ new Date(r.detectedAt).toLocaleTimeString() }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Active Strategies -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">🤖 Active Strategies</h2>
        <div v-if="activeStrategies.length === 0" class="text-sm text-base-content/50 py-4">
          No active strategies. Go to <strong>Strategy Manager</strong> to deploy one.
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="inst in activeStrategies"
            :key="inst.id"
            class="p-3 rounded-lg bg-base-300 flex flex-wrap gap-3 items-center text-sm"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold truncate">{{ inst.name }}</span>
                <span class="badge badge-sm" :class="typeBadgeClass[inst.type] ?? 'badge-neutral'">{{ inst.type }}</span>
              </div>
              <div class="text-xs text-base-content/60 mt-0.5">{{ inst.symbols.join(', ') || '—' }}</div>
            </div>
            <div v-if="lastSignalFor(inst.id)" class="flex items-center gap-2 text-xs">
              <span class="badge badge-sm" :class="signalBadgeClass(lastSignalFor(inst.id)!.signal)">
                {{ lastSignalFor(inst.id)!.signal.toUpperCase() }}
              </span>
              <span class="font-mono text-base-content/70">@ {{ lastSignalFor(inst.id)!.price }}</span>
              <span class="text-base-content/40">{{ new Date(lastSignalFor(inst.id)!.timestamp).toLocaleTimeString() }}</span>
            </div>
            <div v-else class="text-xs text-base-content/40 italic">No signals yet</div>
            <button class="btn btn-warning btn-xs ml-auto" @click="disableStrategy(inst.id)">Disable</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
