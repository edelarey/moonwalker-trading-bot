<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useMarketStore } from '@/stores/market'
import { useStrategiesStore, instanceType, type StrategySignal, type StrategyInstance } from '@/stores/strategies'
import { keysApi, type ApiKeyStatus } from '@/api/client'

const config = useConfigStore()
const market = useMarketStore()
const strategiesStore = useStrategiesStore()
const router = useRouter()
const keyStatus = ref<ApiKeyStatus | null>(null)
const liveConfirm = ref('')
const modeError = ref('')

onMounted(async () => {
  if (strategiesStore.instances.length === 0) await strategiesStore.fetchInstances()
  keyStatus.value = await keysApi.status()
})

const isPaper = computed(() => (config.config?.tradingMode ?? 'paper') === 'paper')
const enabledCoins = computed(() =>
  config.config?.symbols.filter(s => s.enabled).map(s => s.symbol) ?? []
)

async function setPaper() {
  modeError.value = ''
  await config.updateConfig({ tradingMode: 'paper' })
}

async function setLive() {
  modeError.value = ''
  if (!keyStatus.value?.configured) {
    modeError.value = 'Save Bybit sub-account keys in Settings first.'
    return
  }
  if (liveConfirm.value !== 'LIVE') {
    modeError.value = 'Type LIVE in the confirm box, then click again.'
    return
  }
  const ok = await config.updateConfig({ tradingMode: 'live' })
  if (ok) liveConfirm.value = ''
  else modeError.value = config.error ?? 'Could not switch to live'
}

async function toggleAuto(inst: StrategyInstance) {
  await strategiesStore.updateInstance(inst.id, { autoMode: !inst.autoMode, enabled: true })
}

async function toggleEnabled(inst: StrategyInstance) {
  await strategiesStore.updateInstance(inst.id, { enabled: !inst.enabled })
}

async function toggleCoin(inst: StrategyInstance, symbol: string) {
  const next = inst.symbols.includes(symbol)
    ? inst.symbols.filter(s => s !== symbol)
    : [...inst.symbols, symbol]
  await strategiesStore.updateInstance(inst.id, { symbols: next, enabled: true })
}

function coinsLabel(inst: StrategyInstance) {
  if (!inst.symbols.length) return 'all enabled coins'
  return inst.symbols.join(', ')
}

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

function signalBadgeClass(signal: string): string {
  if (signal === 'buy') return 'badge-success'
  if (signal === 'sell') return 'badge-error'
  return 'badge-ghost'
}


</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Trading</h1>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn btn-sm" :class="isPaper ? 'btn-info' : 'btn-outline'" @click="setPaper">Paper</button>
        <input
          v-model="liveConfirm"
          type="text"
          placeholder="Type LIVE"
          class="input input-bordered input-sm w-28"
        />
        <button class="btn btn-sm btn-error" @click="setLive">Go live</button>
        <span class="badge" :class="isPaper ? 'badge-info' : 'badge-error animate-pulse'">
          {{ isPaper ? 'PAPER — simulated fills' : 'LIVE — real Bybit orders' }}
        </span>
      </div>
    </div>
    <p v-if="modeError" class="text-sm text-loss">
      {{ modeError }}
      <button v-if="!keyStatus?.configured" class="link ml-2" @click="router.push('/settings')">Open Settings</button>
    </p>
    <p class="text-sm text-base-content/60">
      Run several strategies at once. Enable each one, turn Auto on, and pick coins from your tracked list
      (Coin Scanner → top 50). Empty coin list = every enabled coin.
    </p>

    <!-- AUTO Mode Toggle -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="card-title text-base">AUTO Mode (Break &amp; Bounce)</h2>
            <p class="text-sm text-base-content/60 mt-1">
              When enabled, Break &amp; Bounce reversals are executed in the current trading mode
              (paper fills by default). Other strategies use their own Auto toggle in Strategy Manager.
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

          <h3 class="text-sm font-semibold text-base-content/70 uppercase tracking-wide mt-4 mb-2">Position size</h3>
          <p class="text-xs text-base-content/50 mb-2">
            Default for EMA, Supertrend, RSI, VWAP, ORB, Donchian, MA, Bollinger, and Break &amp; Bounce.
            DCA / Grid still use their own USDT-per-buy settings.
          </p>
          <div class="flex flex-wrap gap-2 mb-3">
            <button
              class="btn btn-sm"
              :class="(config.config.sizingMode ?? 'risk_percent') === 'risk_percent' ? 'btn-primary' : 'btn-outline'"
              @click="config.updateConfig({ sizingMode: 'risk_percent' })"
            >Use risk %</button>
            <button
              class="btn btn-sm"
              :class="config.config.sizingMode === 'fixed_usdt' ? 'btn-primary' : 'btn-outline'"
              @click="config.updateConfig({ sizingMode: 'fixed_usdt' })"
            >Use fixed USDT</button>
          </div>

          <!-- Risk params grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label class="form-control">
            <span class="label-text text-xs mb-1">Risk % if stop-loss hits</span>
            <input
              type="number" step="0.1" min="0.1" max="10"
              class="input input-bordered input-sm"
              :value="config.config.riskPercent"
              @change="config.updateConfig({ riskPercent: parseFloat(($event.target as HTMLInputElement).value) })"
            />
            <span class="label-text-alt text-xs mt-1 text-base-content/40">
              Used when “Use risk %” is selected. 1 = lose 1% of equity if SL hits.
            </span>
          </label>
          <label class="form-control">
            <span class="label-text text-xs mb-1">USDT per trade (notional)</span>
            <input
              type="number" step="10" min="1"
              class="input input-bordered input-sm"
              :value="config.config.fixedPositionUsdt ?? 100"
              @change="config.updateConfig({ fixedPositionUsdt: parseFloat(($event.target as HTMLInputElement).value) })"
            />
            <span class="label-text-alt text-xs mt-1 text-base-content/40">Used when “Use fixed USDT” is selected.</span>
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

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="card-title text-base">🤖 Strategies (run many at once)</h2>
          <span class="text-xs text-base-content/50">{{ activeStrategies.length }} enabled · {{ strategiesStore.instances.filter(i => i.autoMode).length }} auto</span>
        </div>
        <div v-if="strategiesStore.instances.length === 0" class="text-sm text-base-content/50 py-4">
          No strategies. Create them in <strong>Strategy Manager</strong>.
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="inst in strategiesStore.instances"
            :key="inst.id"
            class="p-3 rounded-lg bg-base-300 space-y-2"
          >
            <div class="flex flex-wrap gap-3 items-center text-sm">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold truncate">{{ inst.name }}</span>
                  <span class="badge badge-sm" :class="typeBadgeClass[instanceType(inst)] ?? 'badge-neutral'">{{ instanceType(inst) }}</span>
                  <span v-if="inst.autoMode" class="badge badge-sm badge-success">AUTO</span>
                </div>
                <div class="text-xs text-base-content/60 mt-0.5">{{ coinsLabel(inst) }}</div>
              </div>
              <label class="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" class="toggle toggle-xs toggle-success" :checked="inst.enabled" @change="toggleEnabled(inst)" />
                On
              </label>
              <label class="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" class="toggle toggle-xs toggle-warning" :checked="inst.autoMode" @change="toggleAuto(inst)" />
                Auto
              </label>
              <div v-if="lastSignalFor(inst.id)" class="flex items-center gap-2 text-xs">
                <span class="badge badge-sm" :class="signalBadgeClass(lastSignalFor(inst.id)!.signal)">
                  {{ lastSignalFor(inst.id)!.signal.toUpperCase() }}
                </span>
                <span class="font-mono text-base-content/70">@ {{ lastSignalFor(inst.id)!.price }}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="sym in enabledCoins"
                :key="sym"
                type="button"
                class="btn btn-xs"
                :class="inst.symbols.includes(sym) ? 'btn-primary' : 'btn-outline'"
                @click="toggleCoin(inst, sym)"
              >{{ sym.replace('USDT', '') }}</button>
              <span v-if="!enabledCoins.length" class="text-xs text-base-content/40">
                Enable coins in Coin Scanner first.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
