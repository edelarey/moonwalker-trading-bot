<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useBacktestStore } from '@/stores/backtest'
import { useStrategiesStore, type StrategyInstance } from '@/stores/strategies'
import { useRouter, useRoute } from 'vue-router'

const config = useConfigStore()
const backtestStore = useBacktestStore()
const strategiesStore = useStrategiesStore()
const router = useRouter()
const route = useRoute()

onMounted(async () => {
  if (!config.config) await config.fetchConfig()
  await strategiesStore.fetchInstances()
  const qId = route.query.strategyId
  if (qId && typeof qId === 'string') {
    selectedInstanceId.value = qId
    mode.value = 'strategy'
  }
})

// ── Mode ──────────────────────────────────────────────────────────────────────
// 'global' = Break & Bounce with full param controls
// 'strategy' = pick an existing strategy instance
const mode = ref<'global' | 'strategy'>('strategy')

// ── Strategy instance selection ───────────────────────────────────────────────
const selectedInstanceId = ref<string>('')
const selectedInstance = computed<StrategyInstance | null>(() =>
  strategiesStore.instances.find(i => i.id === selectedInstanceId.value) ?? null
)

watch(selectedInstance, inst => {
  if (inst) {
    // Pre-select the instance's own symbols
    selectedSymbols.value = [...inst.symbols]
  }
})

// ── Shared ────────────────────────────────────────────────────────────────────
const startDate = ref('2024-01-01')
const endDate = ref(new Date().toISOString().split('T')[0])
const selectedSymbols = ref<string[]>([])

const allSymbols = computed(() =>
  config.config?.symbols.filter(s => s.enabled).map(s => s.symbol) ?? []
)

function toggleSymbol(sym: string) {
  const idx = selectedSymbols.value.indexOf(sym)
  if (idx >= 0) selectedSymbols.value.splice(idx, 1)
  else selectedSymbols.value.push(sym)
}

// ── Break & Bounce (global) params ────────────────────────────────────────────
const riskPercent = ref(1)
const tpMultiplier = ref(2.5)
const windowStart = ref('00:00')
const windowEnd = ref('02:30')
const bufferPercent = ref(0.05)
const primaryTimeframe = ref<'D' | 'W' | 'M'>('D')
const breakoutTimeframe = ref('15')
const entryTimeframe = ref('5')

// ── Param summary for selected strategy ──────────────────────────────────────
const paramEntries = computed<[string, any][]>(() => {
  if (!selectedInstance.value) return []
  return Object.entries(selectedInstance.value.params as Record<string, any>)
})

// ── Run ───────────────────────────────────────────────────────────────────────
const strategyRunning = ref(false)
const strategyError = ref<string | null>(null)

async function run() {
  if (mode.value === 'strategy') {
    if (!selectedInstance.value) return
    strategyError.value = null
    strategyRunning.value = true
    const result = await strategiesStore.runBacktest(
      selectedInstance.value.id,
      startDate.value,
      endDate.value,
    )
    strategyRunning.value = false
    if (result) {
      strategiesStore.addBacktestResult(
        selectedInstance.value.id,
        selectedInstance.value.name,
        selectedInstance.value.type,
        {
          totalTrades: result.totalTrades ?? 0,
          winRate: result.winRate ?? 0,
          totalPnl: result.totalPnl ?? 0,
          maxDrawdown: result.maxDrawdown ?? 0,
        },
      )
      router.push('/strategies/results')
    } else {
      strategyError.value = strategiesStore.error ?? 'Backtest failed'
    }
  } else {
    if (!selectedSymbols.value.length) return
    await backtestStore.runBacktest({
      symbols: selectedSymbols.value,
      startDate: startDate.value,
      endDate: endDate.value,
      riskPercent: riskPercent.value,
      tpMultiplier: tpMultiplier.value,
      liquidityWindowStart: windowStart.value,
      liquidityWindowEnd: windowEnd.value,
      breakoutBufferPercent: bufferPercent.value,
      primaryTimeframe: primaryTimeframe.value,
      breakoutTimeframe: breakoutTimeframe.value,
      entryTimeframe: entryTimeframe.value,
    })
    router.push('/backtest/results')
  }
}

const isRunning = computed(() => mode.value === 'strategy' ? strategyRunning.value : backtestStore.running)
const canRun = computed(() =>
  mode.value === 'strategy'
    ? !!selectedInstance.value
    : selectedSymbols.value.length > 0
)

function formatParamKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">🧪 Backtesting Engine</h1>

    <!-- Mode tabs -->
    <div class="tabs tabs-boxed w-fit">
      <button
        class="tab"
        :class="mode === 'strategy' ? 'tab-active' : ''"
        @click="mode = 'strategy'"
      >🤖 Strategy Instance</button>
      <button
        class="tab"
        :class="mode === 'global' ? 'tab-active' : ''"
        @click="mode = 'global'"
      >🏄 Break &amp; Bounce (Global)</button>
    </div>

    <!-- ── STRATEGY MODE ─────────────────────────────────────────────────── -->
    <template v-if="mode === 'strategy'">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Strategy selector + param summary -->
        <div class="card bg-base-200 border border-base-300">
          <div class="card-body p-4 space-y-4">
            <h2 class="card-title text-base">Select Strategy</h2>

            <div v-if="strategiesStore.loading && strategiesStore.instances.length === 0" class="text-sm text-base-content/50">
              Loading strategies…
            </div>
            <div v-else-if="strategiesStore.instances.length === 0" class="alert alert-warning text-sm py-2">
              No strategy instances found. Create one in <strong>Strategy Manager</strong> first.
            </div>
            <template v-else>
              <label class="form-control">
                <span class="label-text text-xs mb-1">Strategy Instance</span>
                <select class="select select-bordered" v-model="selectedInstanceId">
                  <option value="">— Select a strategy —</option>
                  <option v-for="inst in strategiesStore.instances" :key="inst.id" :value="inst.id">
                    {{ inst.name }} ({{ inst.type }})
                  </option>
                </select>
              </label>

              <!-- Param summary -->
              <div v-if="selectedInstance" class="space-y-2">
                <p class="text-xs font-semibold text-base-content/60 uppercase tracking-wide">Parameters</p>
                <div class="grid grid-cols-2 gap-1">
                  <div
                    v-for="([key, val]) in paramEntries"
                    :key="key"
                    class="bg-base-300 rounded px-2 py-1"
                  >
                    <div class="text-xs text-base-content/50">{{ formatParamKey(key) }}</div>
                    <div class="text-sm font-mono font-semibold">{{ val }}</div>
                  </div>
                </div>
                <p class="text-xs text-base-content/40 italic">
                  Parameters are read-only here. Edit them in Strategy Manager.
                </p>
              </div>
            </template>
          </div>
        </div>

        <!-- Date range -->
        <div class="card bg-base-200 border border-base-300">
          <div class="card-body p-4 space-y-4">
            <h2 class="card-title text-base">Date Range</h2>
            <label class="form-control">
              <span class="label-text text-xs mb-1">Start Date</span>
              <input type="date" class="input input-bordered" v-model="startDate" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs mb-1">End Date</span>
              <input type="date" class="input input-bordered" v-model="endDate" />
            </label>

            <!-- Symbols notice -->
            <div v-if="selectedInstance" class="alert text-xs py-2">
              <span>
                Symbols used: <strong>{{ selectedInstance.symbols.join(', ') || '(none configured)' }}</strong>.
                Override below if needed.
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Symbol override -->
      <div v-if="selectedInstance" class="card bg-base-200 border border-base-300">
        <div class="card-body p-4">
          <h2 class="card-title text-base">
            Symbols
            <span class="badge badge-sm badge-neutral ml-2">{{ selectedSymbols.length }} selected</span>
          </h2>
          <p class="text-xs text-base-content/50 mb-2">Pre-selected from the strategy's configuration. Toggle to override.</p>
          <div class="flex flex-wrap gap-2 mt-2">
            <button
              v-for="sym in allSymbols"
              :key="sym"
              class="btn btn-sm"
              :class="selectedSymbols.includes(sym) ? 'btn-primary' : 'btn-outline'"
              @click="toggleSymbol(sym)"
            >{{ sym }}</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ── BREAK & BOUNCE (GLOBAL) MODE ─────────────────────────────────── -->
    <template v-else>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Date Range -->
        <div class="card bg-base-200 border border-base-300">
          <div class="card-body p-4 space-y-4">
            <h2 class="card-title text-base">Date Range</h2>
            <label class="form-control">
              <span class="label-text text-xs mb-1">Start Date</span>
              <input type="date" class="input input-bordered" v-model="startDate" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs mb-1">End Date</span>
              <input type="date" class="input input-bordered" v-model="endDate" />
            </label>
          </div>
        </div>

        <!-- Parameters -->
        <div class="card bg-base-200 border border-base-300">
          <div class="card-body p-4 space-y-4">
            <h2 class="card-title text-base">Strategy Parameters</h2>

            <h3 class="text-sm font-semibold text-base-content/70 uppercase tracking-wide mt-1 mb-2">Timeframe Setup</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 p-3 rounded-lg bg-base-300/50">
              <label class="form-control w-full">
                <span class="label-text text-xs mb-1">📅 Blueprint Candle</span>
                <select class="select select-bordered w-full" v-model="primaryTimeframe">
                  <option value="D">Daily (D)</option>
                  <option value="W">Weekly (W)</option>
                  <option value="M">Monthly (M)</option>
                </select>
              </label>
              <label class="form-control w-full">
                <span class="label-text text-xs mb-1">📊 Breakout Candle</span>
                <select class="select select-bordered w-full" v-model="breakoutTimeframe">
                  <option value="1">1 minute</option>
                  <option value="3">3 minutes</option>
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes (default)</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                  <option value="240">4 hours</option>
                </select>
              </label>
              <label class="form-control w-full">
                <span class="label-text text-xs mb-1">🕯️ Entry Candle</span>
                <select class="select select-bordered w-full" v-model="entryTimeframe">
                  <option value="1">1 minute</option>
                  <option value="3">3 minutes</option>
                  <option value="5">5 minutes (default)</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                </select>
              </label>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <label class="form-control">
                <span class="label-text text-xs mb-1">Risk %</span>
                <input type="number" step="0.1" min="0.1" max="5" class="input input-bordered input-sm" v-model.number="riskPercent" />
              </label>
              <label class="form-control">
                <span class="label-text text-xs mb-1">TP Multiplier</span>
                <input type="number" step="0.5" min="1" max="10" class="input input-bordered input-sm" v-model.number="tpMultiplier" />
              </label>
              <label class="form-control">
                <span class="label-text text-xs mb-1">Window Start (UTC)</span>
                <input type="time" class="input input-bordered input-sm" v-model="windowStart" />
              </label>
              <label class="form-control">
                <span class="label-text text-xs mb-1">Window End (UTC)</span>
                <input type="time" class="input input-bordered input-sm" v-model="windowEnd" />
              </label>
              <label class="form-control col-span-2">
                <span class="label-text text-xs mb-1">Breakout Buffer %</span>
                <input type="number" step="0.01" min="0" max="1" class="input input-bordered input-sm" v-model.number="bufferPercent" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Symbol Select -->
      <div class="card bg-base-200 border border-base-300">
        <div class="card-body p-4">
          <h2 class="card-title text-base">Select Symbols ({{ selectedSymbols.length }} selected)</h2>
          <div class="flex flex-wrap gap-2 mt-2">
            <button
              v-for="sym in allSymbols"
              :key="sym"
              class="btn btn-sm"
              :class="selectedSymbols.includes(sym) ? 'btn-primary' : 'btn-outline'"
              @click="toggleSymbol(sym)"
            >{{ sym }}</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Run Button -->
    <div class="flex items-center gap-4">
      <button
        class="btn btn-primary btn-lg"
        :disabled="isRunning || !canRun"
        @click="run"
      >
        <span v-if="isRunning" class="loading loading-spinner" />
        {{ isRunning ? 'Running Backtest…' : '▶ Run Backtest' }}
      </button>
      <p v-if="strategyError" class="text-error text-sm">{{ strategyError }}</p>
      <p v-else-if="backtestStore.error" class="text-error text-sm">{{ backtestStore.error }}</p>
      <p class="text-xs text-base-content/50">
        Fetches historical Bybit klines — may take a few seconds per symbol
      </p>
    </div>
  </div>
</template>
