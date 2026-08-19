<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useBacktestStore } from '@/stores/backtest'
import { useStrategiesStore, instanceType, type StrategyInstance } from '@/stores/strategies'
import { useRouter, useRoute } from 'vue-router'

const config = useConfigStore()
const backtestStore = useBacktestStore()
const strategiesStore = useStrategiesStore()
const router = useRouter()
const route = useRoute()

const FORM_KEY = 'moonwalker.backtest.form'

const selectedInstanceId = ref<string>('')
const selectedInstance = computed<StrategyInstance | null>(() =>
  strategiesStore.instances.find(i => i.id === selectedInstanceId.value) ?? null
)

const startDate = ref('2024-01-01')
const endDate = ref(new Date().toISOString().split('T')[0])
const selectedSymbols = ref<string[]>(['BTCUSDT'])
const riskPercent = ref(1)

const allSymbols = computed(() =>
  config.config?.symbols.filter(s => s.enabled).map(s => s.symbol) ?? []
)

function toggleSymbol(sym: string) {
  const idx = selectedSymbols.value.indexOf(sym)
  if (idx >= 0) selectedSymbols.value.splice(idx, 1)
  else selectedSymbols.value.push(sym)
}

function defaultSymbols(): string[] {
  const enabled = config.config?.symbols.filter(s => s.enabled).map(s => s.symbol) ?? []
  return enabled.includes('BTCUSDT') ? ['BTCUSDT'] : (enabled[0] ? [enabled[0]] : ['BTCUSDT'])
}

function pickDefaultInstance(): string {
  const list = strategiesStore.instances
  if (!list.length) return ''
  const bb = list.find(i => instanceType(i) === 'break_bounce')
  return (bb ?? list[0]).id
}

function loadForm(): void {
  try {
    const raw = localStorage.getItem(FORM_KEY)
    if (!raw) {
      selectedSymbols.value = defaultSymbols()
      selectedInstanceId.value = pickDefaultInstance()
      return
    }
    const saved = JSON.parse(raw) as Record<string, unknown>
    if (typeof saved.selectedInstanceId === 'string') selectedInstanceId.value = saved.selectedInstanceId
    if (typeof saved.startDate === 'string') startDate.value = saved.startDate
    if (typeof saved.endDate === 'string') endDate.value = saved.endDate
    if (Array.isArray(saved.selectedSymbols) && saved.selectedSymbols.length) {
      selectedSymbols.value = saved.selectedSymbols.map(String)
    } else {
      selectedSymbols.value = defaultSymbols()
    }
    if (typeof saved.riskPercent === 'number') riskPercent.value = saved.riskPercent
    if (!selectedInstanceId.value || !strategiesStore.instances.some(i => i.id === selectedInstanceId.value)) {
      selectedInstanceId.value = pickDefaultInstance()
    }
  } catch {
    selectedSymbols.value = defaultSymbols()
    selectedInstanceId.value = pickDefaultInstance()
  }
}

function saveForm(): void {
  localStorage.setItem(FORM_KEY, JSON.stringify({
    selectedInstanceId: selectedInstanceId.value,
    startDate: startDate.value,
    endDate: endDate.value,
    selectedSymbols: selectedSymbols.value,
    riskPercent: riskPercent.value,
  }))
}

onMounted(async () => {
  if (!config.config) await config.fetchConfig()
  await strategiesStore.fetchInstances()
  loadForm()
  const qId = route.query.strategyId
  if (qId && typeof qId === 'string') {
    selectedInstanceId.value = qId
  }
})

watch(
  [selectedInstanceId, startDate, endDate, selectedSymbols, riskPercent],
  saveForm,
  { deep: true },
)

const paramEntries = computed<[string, any][]>(() => {
  if (!selectedInstance.value) return []
  return Object.entries(selectedInstance.value.params as Record<string, any>)
})

const strategyRunning = ref(false)
const strategyError = ref<string | null>(null)

async function run() {
  if (!selectedInstance.value) return
  strategyError.value = null
  strategyRunning.value = true
  const symbols = selectedSymbols.value.length ? selectedSymbols.value : defaultSymbols()
  const result = await strategiesStore.runBacktest(
    selectedInstance.value.id,
    startDate.value,
    endDate.value,
    symbols,
    riskPercent.value,
  )
  strategyRunning.value = false
  if (result) {
    strategiesStore.addBacktestResult(
      selectedInstance.value.id,
      selectedInstance.value.name,
      instanceType(selectedInstance.value),
      {
        totalTrades: result.totalTrades ?? result.summary?.totalTrades ?? result.trades?.length ?? 0,
        winRate: result.winRate ?? result.summary?.winRate ?? 0,
        totalPnl: result.totalPnl ?? result.summary?.totalPnl ?? 0,
        maxDrawdown: result.maxDrawdown ?? result.summary?.maxDrawdown ?? 0,
      },
    )
    await backtestStore.fetchResults()
    backtestStore.selectLatest()
    router.push('/backtest/results')
  } else {
    strategyError.value = strategiesStore.error ?? 'Backtest failed'
  }
}

const canRun = computed(() => selectedSymbols.value.length > 0 && !!selectedInstance.value)

function formatParamKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}

function formatParamValue(key: string, val: unknown): string {
  if (key === 'leverage' && val != null && val !== '') return `${val}×`
  return String(val)
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">🧪 Backtesting Engine</h1>
    <p class="text-sm text-base-content/60">
      Pick any strategy — including Break &amp; Bounce — and run it with the params saved in Strategy Manager.
    </p>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <span class="label-text text-xs mb-1">Strategy</span>
              <select class="select select-bordered" v-model="selectedInstanceId">
                <option value="">— Select a strategy —</option>
                <option v-for="inst in strategiesStore.instances" :key="inst.id" :value="inst.id">
                  {{ inst.name }} ({{ instanceType(inst) }})
                </option>
              </select>
            </label>

            <div v-if="selectedInstance" class="space-y-2">
              <p class="text-xs font-semibold text-base-content/60 uppercase tracking-wide">Parameters</p>
              <div class="grid grid-cols-2 gap-1">
                <div
                  v-for="([key, val]) in paramEntries"
                  :key="key"
                  class="bg-base-300 rounded px-2 py-1"
                >
                  <div class="text-xs text-base-content/50">{{ formatParamKey(key) }}</div>
                  <div class="text-sm font-mono font-semibold">{{ formatParamValue(key, val) }}</div>
                </div>
              </div>
              <p class="text-xs text-base-content/40 italic">
                Parameters are read-only here. Edit them in Strategy Manager.
              </p>
            </div>
          </template>
        </div>
      </div>

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
          <label class="form-control">
            <span class="label-text text-xs mb-1">Risk % if stop-loss hits</span>
            <input type="number" step="0.1" min="0.1" max="10" class="input input-bordered" v-model.number="riskPercent" />
          </label>
          <div v-if="selectedInstance" class="alert text-xs py-2">
            <span>
              Defaults to <strong>BTCUSDT</strong> only. Your last selection is remembered when you leave this page.
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedInstance" class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">
          Symbols
          <span class="badge badge-sm badge-neutral ml-2">{{ selectedSymbols.length }} selected</span>
        </h2>
        <p class="text-xs text-base-content/50 mb-2">Only BTCUSDT is selected by default. Toggle others on if you want a multi-coin run.</p>
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

    <div class="flex items-center gap-4">
      <button
        class="btn btn-primary btn-lg"
        :disabled="strategyRunning || !canRun"
        @click="run"
      >
        <span v-if="strategyRunning" class="loading loading-spinner" />
        {{ strategyRunning ? 'Running Backtest…' : '▶ Run Backtest' }}
      </button>
      <p v-if="strategyError" class="text-error text-sm">{{ strategyError }}</p>
      <p class="text-xs text-base-content/50">
        Fetches historical Bybit klines — may take a few seconds per symbol
      </p>
    </div>
  </div>
</template>
