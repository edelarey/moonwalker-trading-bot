<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ALL_STRATEGY_TYPES, STRATEGY_TYPE_NAMES, type StrategyType } from '@/api/client'
import TimeframeSelect from '@/components/TimeframeSelect.vue'
import { useStrategiesStore, instanceType, type StrategyInstance, type CreateInstancePayload, type UpdateInstancePayload } from '@/stores/strategies'
import { useConfigStore } from '@/stores/config'

const store = useStrategiesStore()
const configStore = useConfigStore()
const router = useRouter()

onMounted(async () => {
  await store.fetchInstances()
  if (!configStore.config) await configStore.fetchConfig()
})

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formType = ref<StrategyType>('break_bounce')
const formSymbolsSelected = ref<string[]>([])
const formEnabled = ref(true)
const formAutoMode = ref(false)
const formParams = ref<Record<string, any>>({})

const strategyTypes = ALL_STRATEGY_TYPES

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
  funding_arb: 'badge-accent',
  cross_exchange: 'badge-info',
  dynamic_delta: 'badge-secondary',
  drawdown_hedge: 'badge-error',
}

const isPaper = computed(() => (configStore.config?.tradingMode ?? 'paper') === 'paper')
const allConfigSymbols = computed(() =>
  configStore.config?.symbols.filter(s => s.enabled).map(s => s.symbol) ?? []
)

function toggleFormSymbol(sym: string) {
  const idx = formSymbolsSelected.value.indexOf(sym)
  if (idx >= 0) formSymbolsSelected.value.splice(idx, 1)
  else formSymbolsSelected.value.push(sym)
}

const paramsForType = ref<StrategyType | null>(null)

function snapshotParams(): Record<string, any> {
  const p = JSON.parse(JSON.stringify(formParams.value ?? {})) as Record<string, any>
  if (p.stopFillMode === '' || p.stopFillMode == null) delete p.stopFillMode
  return p
}

function canonTf(raw: unknown): string {
  if (raw == null || raw === '') return ''
  const v = String(raw).trim()
  const map: Record<string, string> = {
    '1': '1', '1m': '1', '3': '3', '3m': '3', '5': '5', '5m': '5',
    '15': '15', '15m': '15', '30': '30', '30m': '30',
    '60': '60', '1h': '60', '60m': '60', '120': '120', '2h': '120',
    '240': '240', '4h': '240', d: 'D', D: 'D', '1d': 'D', '1D': 'D',
  }
  return map[v] ?? map[v.toLowerCase()] ?? v
}

function normalizeIntervalFields(p: Record<string, any>): Record<string, any> {
  const next = { ...p }
  for (const key of ['timeframe', 'breakoutTimeframe', 'entryTimeframe', 'primaryTimeframe']) {
    if (next[key] != null) next[key] = canonTf(next[key])
  }
  if (next.stopFillMode !== 'stop_price' && next.stopFillMode !== 'bar_close') {
    next.stopFillMode = ''
  }
  return next
}

const accountStopFillLabel = computed(() =>
  (configStore.config?.stopFillMode ?? 'bar_close') === 'stop_price'
    ? 'fill at stop price'
    : 'fill at candle close',
)

function openCreate() {
  editingId.value = null
  formType.value = 'ema_pullback'
  formName.value = STRATEGY_TYPE_NAMES[formType.value]
  formSymbolsSelected.value = []
  formEnabled.value = true
  formAutoMode.value = false
  formParams.value = {}
  paramsForType.value = null
  modalOpen.value = true
  void onTypeChange()
}

function openEdit(inst: StrategyInstance) {
  editingId.value = inst.id
  formName.value = inst.name
  formType.value = instanceType(inst)
  formSymbolsSelected.value = [...inst.symbols]
  formEnabled.value = inst.enabled
  formAutoMode.value = inst.autoMode ?? false
  formParams.value = normalizeIntervalFields({ ...(inst.params as Record<string, any>) })
  paramsForType.value = instanceType(inst)
  modalOpen.value = true
}

function closeModal() { modalOpen.value = false }

async function onTypeChange() {
  const prev = paramsForType.value
  const next = formType.value
  if (!editingId.value) {
    const prevLabel = prev ? STRATEGY_TYPE_NAMES[prev] : ''
    if (!formName.value.trim() || formName.value === prevLabel) {
      formName.value = STRATEGY_TYPE_NAMES[next]
    }
  }
  if (paramsForType.value === next && Object.keys(formParams.value).length) return
  const defaults = await store.fetchDefaults(next)
  if (formType.value !== next) return
  if (defaults) formParams.value = normalizeIntervalFields({ ...defaults })
  paramsForType.value = next
}

async function saveModal() {
  const symbols = [...formSymbolsSelected.value]
  const params = snapshotParams()
  if (editingId.value) {
    const payload: UpdateInstancePayload = {
      name: formName.value,
      strategyType: formType.value,
      symbols,
      params,
      enabled: formEnabled.value,
      autoMode: formAutoMode.value,
    }
    await store.updateInstance(editingId.value, payload)
  } else {
    const payload: CreateInstancePayload = {
      name: formName.value,
      strategyType: formType.value,
      symbols,
      params,
      enabled: formEnabled.value,
      autoMode: formAutoMode.value,
    }
    await store.createInstance(payload)
  }
  if (!store.error) {
    await store.fetchInstances()
    closeModal()
  }
}

const confirmDeleteId = ref<string | null>(null)
function requestDelete(id: string) { confirmDeleteId.value = id }
async function confirmDelete() {
  if (confirmDeleteId.value) {
    await store.deleteInstance(confirmDeleteId.value)
    confirmDeleteId.value = null
  }
}

const confirmResetId = ref<string | null>(null)
function requestReset(id: string) { confirmResetId.value = id }
async function confirmReset() {
  if (!confirmResetId.value) return
  const updated = await store.resetDefaults(confirmResetId.value)
  if (updated && editingId.value === updated.id) {
    formParams.value = normalizeIntervalFields({ ...(updated.params as Record<string, any>) })
    paramsForType.value = instanceType(updated)
  }
  confirmResetId.value = null
}

async function resetModalParams() {
  if (editingId.value) {
    requestReset(editingId.value)
    return
  }
  const defaults = await store.fetchDefaults(formType.value)
  if (defaults) formParams.value = normalizeIntervalFields({ ...defaults })
}

async function toggleEnabled(inst: StrategyInstance) {
  await store.updateInstance(inst.id, { enabled: !inst.enabled })
}

async function toggleAuto(inst: StrategyInstance) {
  await store.updateInstance(inst.id, { autoMode: !inst.autoMode, enabled: true })
}

async function deployPaper(inst: StrategyInstance) {
  await store.updateInstance(inst.id, { enabled: true, autoMode: true })
  router.push('/trading')
}

function goBacktest(inst: StrategyInstance) {
  router.push(`/backtest?strategyId=${inst.id}`)
}

const backtestPanelId = ref<string | null>(null)
const backtestStart = ref('')
const backtestEnd = ref('')
const backtestRisk = ref(1)
const backtestLoading = ref(false)
const backtestResultMap = ref<Record<string, Record<string, any>>>({})

function toggleBacktestPanel(inst: StrategyInstance) {
  if (backtestPanelId.value === inst.id) backtestPanelId.value = null
  else {
    backtestPanelId.value = inst.id
    backtestStart.value = ''
    backtestEnd.value = ''
  }
}

async function runBacktest(inst: StrategyInstance) {
  if (!backtestStart.value || !backtestEnd.value) return
  backtestLoading.value = true
  const result = await store.runBacktest(inst.id, backtestStart.value, backtestEnd.value, undefined, backtestRisk.value)
  backtestLoading.value = false
  if (result) {
    const summary = result.summary ?? result
    backtestResultMap.value[inst.id] = summary
    store.addBacktestResult(inst.id, inst.name, instanceType(inst), {
      totalTrades: summary.totalTrades ?? 0,
      winRate: summary.winRate ?? 0,
      totalPnl: summary.totalPnl ?? 0,
      maxDrawdown: summary.maxDrawdown ?? 0,
    })
  }
}

function lastSignalFor(strategyId: string) {
  return store.signals.find(s => s.strategyId === strategyId) ?? null
}

const signalColorClass = (signal: string) =>
  signal === 'buy' || signal === 'entry' ? 'text-success' : signal === 'sell' || signal === 'exit' ? 'text-error' : 'text-base-content/50'

const displaySignals = computed(() => store.signals.slice(0, 20))
</script>

<template>
  <div class="p-4 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">🤖 Strategy Manager</h1>
        <p class="text-xs text-base-content/50 mt-1">
          Enable a strategy to receive live candles. Turn Auto on to execute in
          {{ isPaper ? 'paper' : 'live' }} mode.
        </p>
      </div>
      <button class="btn btn-primary btn-sm" @click="openCreate">+ New Strategy</button>
    </div>

    <div v-if="store.error" class="alert alert-error text-sm">{{ store.error }}</div>

    <div v-if="store.loading && store.instances.length === 0" class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg"></span>
    </div>

    <div v-else-if="store.instances.length === 0" class="text-center text-base-content/50 py-12">
      No strategies yet. Click <strong>New Strategy</strong> to create one.
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="inst in store.instances" :key="inst.id" class="card card-compact bg-base-200 shadow">
        <div class="card-body gap-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate">{{ inst.name }}</div>
              <div class="mt-1 flex gap-1 flex-wrap">
                <span class="badge badge-sm" :class="typeBadgeClass[instanceType(inst)]">{{ instanceType(inst) }}</span>
                <span v-if="inst.autoMode" class="badge badge-sm badge-success">AUTO</span>
              </div>
            </div>
            <input
              type="checkbox"
              class="toggle toggle-success toggle-sm"
              :checked="inst.enabled"
              @change="toggleEnabled(inst)"
              title="Enabled (receive candles)"
            />
          </div>

          <div class="text-xs text-base-content/60">
            <span class="font-medium">Symbols:</span> {{ inst.symbols.join(', ') || 'all enabled' }}
          </div>

          <div v-if="lastSignalFor(inst.id)" class="text-xs">
            <span class="font-medium">Last signal:</span>
            <span :class="signalColorClass(lastSignalFor(inst.id)!.signal)" class="ml-1 font-bold uppercase">
              {{ lastSignalFor(inst.id)!.signal }}
            </span>
            <span class="text-base-content/50 ml-1">@ {{ lastSignalFor(inst.id)!.price }}</span>
          </div>

          <div class="flex flex-wrap gap-1 mt-1">
            <button class="btn btn-xs btn-outline" @click="openEdit(inst)">Edit</button>
            <button class="btn btn-xs btn-outline" @click="requestReset(inst.id)">Reset defaults</button>
            <button class="btn btn-xs" :class="inst.autoMode ? 'btn-success' : 'btn-outline'" @click="toggleAuto(inst)">
              {{ inst.autoMode ? 'Auto on' : 'Auto off' }}
            </button>
            <button class="btn btn-xs btn-error btn-outline" @click="requestDelete(inst.id)">Delete</button>
            <button class="btn btn-xs btn-info btn-outline" @click="toggleBacktestPanel(inst)">
              {{ backtestPanelId === inst.id ? 'Close BT' : 'Run Backtest' }}
            </button>
            <button class="btn btn-xs btn-success" @click="deployPaper(inst)">
              {{ isPaper ? '▶ Deploy paper' : '▶ Deploy live' }}
            </button>
            <button class="btn btn-xs btn-info" @click="goBacktest(inst)">🧪 Backtest</button>
          </div>

          <div v-if="backtestPanelId === inst.id" class="mt-2 pt-2 border-t border-base-300 space-y-2">
            <div class="flex gap-2 flex-wrap">
              <div class="form-control flex-1 min-w-[130px]">
                <label class="label py-0"><span class="label-text text-xs">Start Date</span></label>
                <input type="date" v-model="backtestStart" class="input input-bordered input-xs" />
              </div>
              <div class="form-control flex-1 min-w-[130px]">
                <label class="label py-0"><span class="label-text text-xs">End Date</span></label>
                <input type="date" v-model="backtestEnd" class="input input-bordered input-xs" />
              </div>
              <div class="form-control flex-1 min-w-[90px]">
                <label class="label py-0"><span class="label-text text-xs">Risk %</span></label>
                <input type="number" step="0.1" min="0.1" max="10" v-model.number="backtestRisk" class="input input-bordered input-xs" />
              </div>
            </div>
            <button
              class="btn btn-xs btn-primary w-full"
              :disabled="backtestLoading || !backtestStart || !backtestEnd"
              @click="runBacktest(inst)"
            >
              <span v-if="backtestLoading" class="loading loading-spinner loading-xs"></span>
              <span v-else>Run</span>
            </button>
            <div v-if="backtestResultMap[inst.id]" class="grid grid-cols-2 gap-1 text-xs">
              <div class="bg-base-300 rounded p-1">
                <div class="text-base-content/50">Total Trades</div>
                <div class="font-bold">{{ backtestResultMap[inst.id].totalTrades ?? '—' }}</div>
              </div>
              <div class="bg-base-300 rounded p-1">
                <div class="text-base-content/50">Win Rate</div>
                <div class="font-bold">{{ backtestResultMap[inst.id].winRate != null ? (backtestResultMap[inst.id].winRate * 100).toFixed(1) + '%' : '—' }}</div>
              </div>
              <div class="bg-base-300 rounded p-1">
                <div class="text-base-content/50">Total PnL</div>
                <div class="font-bold" :class="backtestResultMap[inst.id].totalPnl >= 0 ? 'text-success' : 'text-error'">
                  {{ backtestResultMap[inst.id].totalPnl?.toFixed(2) ?? '—' }}
                </div>
              </div>
              <div class="bg-base-300 rounded p-1">
                <div class="text-base-content/50">Max Drawdown</div>
                <div class="font-bold text-error">{{ backtestResultMap[inst.id].maxDrawdown?.toFixed(2) ?? '—' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card bg-base-200 shadow">
      <div class="card-body p-4">
        <h2 class="card-title text-base mb-2">📡 Live Signals Feed</h2>
        <div v-if="displaySignals.length === 0" class="text-xs text-base-content/50">No signals yet.</div>
        <div v-else class="overflow-x-auto">
          <table class="table table-xs w-full">
            <thead>
              <tr>
                <th>Time</th><th>Strategy</th><th>Symbol</th><th>Signal</th><th>Price</th><th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sig in displaySignals" :key="sig.strategyId + sig.timestamp">
                <td class="whitespace-nowrap text-base-content/60">{{ new Date(sig.timestamp).toLocaleTimeString() }}</td>
                <td class="whitespace-nowrap">{{ sig.strategyName }}</td>
                <td>{{ sig.symbol }}</td>
                <td><span class="font-bold uppercase" :class="signalColorClass(sig.signal)">{{ sig.signal }}</span></td>
                <td>{{ sig.price }}</td>
                <td class="max-w-[160px] truncate text-base-content/50">{{ JSON.stringify(sig.metadata) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="modalOpen" class="modal modal-open">
      <div class="modal-box max-w-lg w-full">
        <h3 class="font-bold text-lg mb-4">{{ editingId ? 'Edit Strategy' : 'New Strategy' }}</h3>
        <div class="space-y-3">
          <div class="form-control">
            <label class="label"><span class="label-text">Name</span></label>
            <input v-model="formName" type="text" placeholder="My Strategy" class="input input-bordered input-sm" />
          </div>
          <div class="form-control">
            <label class="label"><span class="label-text">Strategy Type</span></label>
            <div v-if="editingId" class="input input-bordered input-sm flex items-center">
              {{ STRATEGY_TYPE_NAMES[formType] }}
            </div>
            <select
              v-else
              v-model="formType"
              class="select select-bordered select-sm w-full"
              @change="onTypeChange"
            >
              <option v-for="t in strategyTypes" :key="t" :value="t">{{ STRATEGY_TYPE_NAMES[t] }}</option>
            </select>
            <p v-if="editingId" class="text-xs text-base-content/50 mt-1">Type is locked on existing strategies so a dropdown click cannot wipe saved params.</p>
          </div>
          <div class="form-control">
            <label class="label">
              <span class="label-text">Symbols</span>
              <span class="label-text-alt text-base-content/50">{{ formSymbolsSelected.length ? formSymbolsSelected.length + ' selected' : 'all enabled' }}</span>
            </label>
            <div v-if="allConfigSymbols.length === 0" class="text-xs text-base-content/50 italic">
              No enabled symbols. Add them in Coin Scanner first.
            </div>
            <div v-else class="flex flex-wrap gap-1 mt-1">
              <button
                v-for="sym in allConfigSymbols"
                :key="sym"
                type="button"
                class="btn btn-xs"
                :class="formSymbolsSelected.includes(sym) ? 'btn-primary' : 'btn-outline'"
                @click="toggleFormSymbol(sym)"
              >{{ sym }}</button>
            </div>
          </div>
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Enabled (receive candles)</span>
              <input type="checkbox" v-model="formEnabled" class="toggle toggle-success toggle-sm" />
            </label>
          </div>
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Auto-execute (paper or live)</span>
              <input type="checkbox" v-model="formAutoMode" class="toggle toggle-warning toggle-sm" />
            </label>
          </div>

          <div class="border border-base-300 rounded-lg p-3 space-y-2">
            <div class="text-sm font-semibold text-base-content/70">Parameters</div>
            <div class="grid grid-cols-2 gap-2">
              <label class="form-control">
                <span class="label-text text-xs">Leverage</span>
                <input type="number" min="1" max="100" step="1" v-model.number="formParams.leverage" class="input input-bordered input-xs" />
                <span class="label-text-alt text-xs text-base-content/40">Empty = Settings default.</span>
              </label>
              <label class="form-control">
                <span class="label-text text-xs">Stop fill (backtest)</span>
                <select v-model="formParams.stopFillMode" class="select select-bordered select-sm w-full h-10 min-h-10 leading-10 py-0">
                  <option value="">Account default ({{ accountStopFillLabel }})</option>
                  <option value="stop_price">Fill at stop price</option>
                  <option value="bar_close">Fill at candle close</option>
                </select>
              </label>
            </div>

            <template v-if="formType === 'break_bounce'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Blueprint TF</span>
                  <select v-model="formParams.primaryTimeframe" class="select select-bordered w-full h-10 min-h-10 leading-10 py-0">
                    <option value="D">Daily</option>
                    <option value="W">Weekly</option>
                    <option value="M">Monthly</option>
                  </select>
                </label>
                <label class="form-control"><span class="label-text text-xs">Breakout TF</span>
                  <TimeframeSelect v-model="formParams.breakoutTimeframe" />
                </label>
                <label class="form-control"><span class="label-text text-xs">Entry TF</span>
                  <TimeframeSelect v-model="formParams.entryTimeframe" />
                </label>
                <label class="form-control"><span class="label-text text-xs">TP multiplier</span><input type="number" step="0.1" v-model.number="formParams.tpMultiplier" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Buffer %</span><input type="number" step="0.01" v-model.number="formParams.breakoutBufferPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Window start UTC</span><input type="time" v-model="formParams.liquidityWindowStart" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Window end UTC</span><input type="time" v-model="formParams.liquidityWindowEnd" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Max trades / coin / day</span><input type="number" min="1" v-model.number="formParams.maxTradesPerDay" class="input input-bordered input-xs" /></label>
              </div>
            </template>

            <template v-if="formType === 'dca'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Investment USDT</span><input type="number" v-model.number="formParams.investmentAmount" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Interval minutes</span><input type="number" v-model.number="formParams.intervalMinutes" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Max total USDT</span><input type="number" v-model.number="formParams.maxTotalInvestment" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Take profit %</span><input type="number" v-model.number="formParams.takeProfitPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Trailing stop %</span><input type="number" v-model.number="formParams.trailingStopPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">MA filter period</span><input type="number" v-model.number="formParams.maFilterPeriod" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">RSI filter max</span><input type="number" v-model.number="formParams.rsiFilterMax" class="input input-bordered input-xs" /></label>
              </div>
            </template>

            <template v-if="formType === 'grid'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Upper price (0=auto)</span><input type="number" v-model.number="formParams.upperPrice" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Lower price (0=auto)</span><input type="number" v-model.number="formParams.lowerPrice" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Grid count</span><input type="number" v-model.number="formParams.gridCount" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">USDT / grid</span><input type="number" v-model.number="formParams.investmentPerGrid" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">SL breakout %</span><input type="number" step="0.1" v-model.number="formParams.stopLossBreakoutPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Leverage</span><input type="number" step="1" min="1" v-model.number="formParams.leverage" class="input input-bordered input-xs" /></label>
                <label class="form-control col-span-2 label cursor-pointer">
                  <span class="label-text text-xs">Geometric spacing</span>
                  <input type="checkbox" v-model="formParams.geometric" class="toggle toggle-sm" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'ma_crossover'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Short period</span><input type="number" v-model.number="formParams.shortPeriod" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Long period</span><input type="number" v-model.number="formParams.longPeriod" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">SL %</span><input type="number" v-model.number="formParams.stopLossPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">TP %</span><input type="number" v-model.number="formParams.takeProfitPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Trailing stop %</span><input type="number" v-model.number="formParams.trailingStopPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control col-span-2"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'rsi'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Period</span><input type="number" v-model.number="formParams.period" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Oversold</span><input type="number" v-model.number="formParams.oversoldThreshold" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Overbought</span><input type="number" v-model.number="formParams.overboughtThreshold" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">SL %</span><input type="number" v-model.number="formParams.stopLossPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">TP %</span><input type="number" v-model.number="formParams.takeProfitPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Confirm candles</span><input type="number" v-model.number="formParams.confirmationCandles" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'bollinger'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Period</span><input type="number" v-model.number="formParams.period" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Std dev</span><input type="number" v-model.number="formParams.stdDevMultiplier" class="input input-bordered input-xs" step="0.1" /></label>
                <label class="form-control"><span class="label-text text-xs">Mode</span>
                  <select v-model="formParams.mode" class="select select-bordered select-xs">
                    <option value="mean_reversion">Mean reversion</option>
                    <option value="breakout">Breakout</option>
                  </select>
                </label>
                <label class="form-control"><span class="label-text text-xs">SL %</span><input type="number" step="0.1" v-model.number="formParams.stopLossPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">TP %</span><input type="number" step="0.1" v-model.number="formParams.takeProfitPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Trailing stop %</span><input type="number" step="0.1" v-model.number="formParams.trailingStopPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Volume confirm ×</span><input type="number" step="0.1" v-model.number="formParams.volumeConfirmMultiplier" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Squeeze width %</span><input type="number" step="0.1" v-model.number="formParams.squeezeThresholdPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'donchian'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Channel period</span><input type="number" v-model.number="formParams.period" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">ATR period</span><input type="number" v-model.number="formParams.atrPeriod" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">SL ATR mult</span><input type="number" v-model.number="formParams.atrMultiplier" class="input input-bordered input-xs" step="0.1" /></label>
                <label class="form-control"><span class="label-text text-xs">TP ATR mult</span><input type="number" v-model.number="formParams.takeProfitAtrMultiplier" class="input input-bordered input-xs" step="0.1" /></label>
                <label class="form-control col-span-2"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'ema_pullback'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Fast EMA</span><input type="number" v-model.number="formParams.fastPeriod" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Slow EMA</span><input type="number" v-model.number="formParams.slowPeriod" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">SL %</span><input type="number" v-model.number="formParams.stopLossPercent" class="input input-bordered input-xs" step="0.1" /></label>
                <label class="form-control"><span class="label-text text-xs">TP %</span><input type="number" v-model.number="formParams.takeProfitPercent" class="input input-bordered input-xs" step="0.1" /></label>
                <label class="form-control col-span-2"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'supertrend'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">ATR period</span><input type="number" v-model.number="formParams.atrPeriod" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Multiplier</span><input type="number" v-model.number="formParams.multiplier" class="input input-bordered input-xs" step="0.1" /></label>
                <label class="form-control col-span-2"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'vwap'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Deviation %</span><input type="number" v-model.number="formParams.deviationPercent" class="input input-bordered input-xs" step="0.05" /></label>
                <label class="form-control"><span class="label-text text-xs">SL %</span><input type="number" v-model.number="formParams.stopLossPercent" class="input input-bordered input-xs" step="0.05" /></label>
                <label class="form-control"><span class="label-text text-xs">TP %</span><input type="number" v-model.number="formParams.takeProfitPercent" class="input input-bordered input-xs" step="0.05" /></label>
                <label class="form-control"><span class="label-text text-xs">Session reset hour UTC</span><input type="number" min="0" max="23" v-model.number="formParams.sessionResetHour" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'orb'">
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Range minutes</span><input type="number" v-model.number="formParams.rangeMinutes" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">TP R-multiple</span><input type="number" v-model.number="formParams.takeProfitRr" class="input input-bordered input-xs" step="0.1" /></label>
                <label class="form-control"><span class="label-text text-xs">Buffer %</span><input type="number" v-model.number="formParams.breakoutBufferPercent" class="input input-bordered input-xs" step="0.01" /></label>
                <label class="form-control"><span class="label-text text-xs">Session start hour UTC</span><input type="number" min="0" max="23" v-model.number="formParams.sessionStartHour" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Max trades / day</span><input type="number" min="1" v-model.number="formParams.maxTradesPerDay" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'funding_arb'">
              <p class="text-xs text-base-content/50">Paper: virtual spot + short perp, keep funding when rate is positive. Live only shorts the perp.</p>
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Min 8h funding</span><input type="number" step="0.00001" v-model.number="formParams.minFundingRate" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Exit funding</span><input type="number" step="0.00001" v-model.number="formParams.exitFundingRate" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Max basis %</span><input type="number" step="0.05" v-model.number="formParams.maxBasisPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Stop basis %</span><input type="number" step="0.05" v-model.number="formParams.stopBasisPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control col-span-2"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'cross_exchange'">
              <p class="text-xs text-base-content/50">Fades Bybit vs Binance (public ticker). Backtest uses Bybit perp vs spot.</p>
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Enter spread %</span><input type="number" step="0.01" v-model.number="formParams.minSpreadPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Exit spread %</span><input type="number" step="0.01" v-model.number="formParams.exitSpreadPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Stop spread %</span><input type="number" step="0.01" v-model.number="formParams.stopSpreadPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Max hold (min)</span><input type="number" v-model.number="formParams.maxHoldMinutes" class="input input-bordered input-xs" /></label>
                <label class="form-control col-span-2"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'dynamic_delta'">
              <p class="text-xs text-base-content/50">Hedges net long inventory when delta or vol is too high. Backtest assumes a standing long bag.</p>
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Hedge symbol</span><input type="text" v-model="formParams.hedgeSymbol" class="input input-bordered input-xs uppercase" /></label>
                <label class="form-control"><span class="label-text text-xs">Delta threshold %</span><input type="number" step="1" v-model.number="formParams.deltaThresholdPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Vol trigger ATR%</span><input type="number" step="0.1" v-model.number="formParams.volTriggerPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Hedge ratio</span><input type="number" step="0.1" min="0.1" max="1" v-model.number="formParams.hedgeRatio" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Backtest inventory USDT</span><input type="number" v-model.number="formParams.inventoryUsdt" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>

            <template v-if="formType === 'drawdown_hedge'">
              <p class="text-xs text-base-content/50">Shorts after a peak-to-trough drop in paper equity (or buy-and-hold in a backtest). Covers on recovery.</p>
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control"><span class="label-text text-xs">Hedge symbol</span><input type="text" v-model="formParams.hedgeSymbol" class="input input-bordered input-xs uppercase" /></label>
                <label class="form-control"><span class="label-text text-xs">Drawdown %</span><input type="number" step="0.5" v-model.number="formParams.drawdownPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Recover %</span><input type="number" step="0.5" v-model.number="formParams.recoverPercent" class="input input-bordered input-xs" /></label>
                <label class="form-control"><span class="label-text text-xs">Hedge portion</span><input type="number" step="0.1" min="0.1" max="1" v-model.number="formParams.hedgePortion" class="input input-bordered input-xs" /></label>
                <label class="form-control col-span-2"><span class="label-text text-xs">Timeframe</span>
                  <TimeframeSelect v-model="formParams.timeframe" />
                </label>
              </div>
            </template>
          </div>
        </div>

        <div class="modal-action flex-wrap">
          <button class="btn btn-ghost btn-sm mr-auto" type="button" :disabled="store.loading" @click="resetModalParams">
            Reset to defaults
          </button>
          <button class="btn btn-ghost btn-sm" @click="closeModal">Cancel</button>
          <button class="btn btn-primary btn-sm" :disabled="store.loading" @click="saveModal">
            <span v-if="store.loading" class="loading loading-spinner loading-xs"></span>
            <span v-else>{{ editingId ? 'Update' : 'Create' }}</span>
          </button>
        </div>
      </div>
      <div class="modal-backdrop" @click="closeModal"></div>
    </div>

    <div v-if="confirmDeleteId" class="modal modal-open">
      <div class="modal-box max-w-sm">
        <h3 class="font-bold text-lg">Confirm Delete</h3>
        <p class="py-4 text-base-content/70">Delete this strategy? This cannot be undone.</p>
        <div class="modal-action">
          <button class="btn btn-ghost btn-sm" @click="confirmDeleteId = null">Cancel</button>
          <button class="btn btn-error btn-sm" :disabled="store.loading" @click="confirmDelete">
            <span v-if="store.loading" class="loading loading-spinner loading-xs"></span>
            <span v-else>Delete</span>
          </button>
        </div>
      </div>
      <div class="modal-backdrop" @click="confirmDeleteId = null"></div>
    </div>

    <div v-if="confirmResetId" class="modal modal-open">
      <div class="modal-box max-w-sm">
        <h3 class="font-bold text-lg">Reset to defaults</h3>
        <p class="py-4 text-base-content/70">
          Replace this strategy’s parameters with the factory starting values? Name, symbols, and On/Auto stay as they are.
        </p>
        <div class="modal-action">
          <button class="btn btn-ghost btn-sm" @click="confirmResetId = null">Cancel</button>
          <button class="btn btn-warning btn-sm" :disabled="store.loading" @click="confirmReset">
            <span v-if="store.loading" class="loading loading-spinner loading-xs"></span>
            <span v-else>Reset params</span>
          </button>
        </div>
      </div>
      <div class="modal-backdrop" @click="confirmResetId = null"></div>
    </div>
  </div>
</template>
