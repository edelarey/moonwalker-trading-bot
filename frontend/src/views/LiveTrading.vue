<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useMarketStore } from '@/stores/market'
import { useStrategiesStore, instanceType, type StrategySignal, type StrategyInstance } from '@/stores/strategies'
import { keysApi, type ApiKeyStatus } from '@/api/client'
import { useTradesStore } from '@/stores/trades'

const config = useConfigStore()
const trades = useTradesStore()
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
  const ok = await config.updateConfig({ tradingMode: 'paper' })
  if (ok) await trades.fetchEquity()
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
  if (ok) {
    liveConfirm.value = ''
    await trades.fetchEquity()
  } else modeError.value = config.error ?? 'Could not switch to live'
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
  adx_di: 'badge-info',
  keltner: 'badge-success',
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

    <div class="alert text-sm">
      <span>
        Timeframes, SL/TP, windows, and other rules live on each strategy in
        <router-link to="/strategies" class="link">Strategy Manager</router-link>.
        Account-wide size defaults (risk %, fixed USDT, leverage) are in
        <router-link to="/settings" class="link">Settings</router-link>.
      </span>
    </div>

    <!-- Live Reversal Signals Feed -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">⚡ Live Reversal Signals</h2>
        <p class="text-xs text-base-content/50 mb-2">
          Still live: Break &amp; Bounce engine broadcasts reversals here over the websocket.
          Signals show even when Auto is off. Fills only if the Break &amp; Bounce row below has Auto on.
        </p>
        <div v-if="!reversals.length" class="text-center text-base-content/40 py-8 text-sm">
          Waiting for Break &amp; Bounce reversal signals (breakout → retest → reversal candle in the strategy’s window)…
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
