<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStrategiesStore, type StrategyType, type StrategyInstance, type CreateInstancePayload, type UpdateInstancePayload } from '@/stores/strategies'
import { useConfigStore } from '@/stores/config'

const store = useStrategiesStore()
const configStore = useConfigStore()
const router = useRouter()

onMounted(async () => {
  await store.fetchInstances()
  if (!configStore.config) await configStore.fetchConfig()
})

// ── Modal state ──────────────────────────────────────────────────────────────
const modalOpen = ref(false)
const editingId = ref<string | null>(null)

const formName = ref('')
const formType = ref<StrategyType>('break_bounce')
const formSymbolsSelected = ref<string[]>([])
const formEnabled = ref(true)
const formParams = ref<Record<string, any>>({})

const strategyTypes: StrategyType[] = ['break_bounce', 'dca', 'grid', 'ma_crossover', 'rsi', 'bollinger']
const timeframeOptions = ['1m', '5m', '15m', '1h', '4h', '1d']

const typeBadgeClass: Record<StrategyType, string> = {
  break_bounce: 'badge-primary',
  dca: 'badge-secondary',
  grid: 'badge-accent',
  ma_crossover: 'badge-info',
  rsi: 'badge-warning',
  bollinger: 'badge-success',
}

const allConfigSymbols = computed(() =>
  configStore.config?.symbols.filter(s => s.enabled).map(s => s.symbol) ?? []
)

function toggleFormSymbol(sym: string) {
  const idx = formSymbolsSelected.value.indexOf(sym)
  if (idx >= 0) formSymbolsSelected.value.splice(idx, 1)
  else formSymbolsSelected.value.push(sym)
}

function openCreate() {
  editingId.value = null
  formName.value = ''
  formType.value = 'break_bounce'
  formSymbolsSelected.value = []
  formEnabled.value = true
  formParams.value = {}
  modalOpen.value = true
}

function openEdit(inst: StrategyInstance) {
  editingId.value = inst.id
  formName.value = inst.name
  formType.value = inst.type
  formSymbolsSelected.value = [...inst.symbols]
  formEnabled.value = inst.enabled
  formParams.value = { ...(inst.params as Record<string, any>) }
  modalOpen.value = true
}

function closeModal() { modalOpen.value = false }

async function onTypeChange() {
  const defaults = await store.fetchDefaults(formType.value)
  if (defaults) formParams.value = { ...defaults }
}

async function saveModal() {
  const symbols = formSymbolsSelected.value
  if (editingId.value) {
    const payload: UpdateInstancePayload = {
      name: formName.value,
      type: formType.value,
      symbols,
      params: formParams.value,
      enabled: formEnabled.value,
    }
    await store.updateInstance(editingId.value, payload)
  } else {
    const payload: CreateInstancePayload = {
      name: formName.value,
      type: formType.value,
      symbols,
      params: formParams.value,
      enabled: formEnabled.value,
    }
    await store.createInstance(payload)
  }
  if (!store.error) closeModal()
}

// ── Delete ───────────────────────────────────────────────────────────────────
const confirmDeleteId = ref<string | null>(null)
function requestDelete(id: string) { confirmDeleteId.value = id }
async function confirmDelete() {
  if (confirmDeleteId.value) {
    await store.deleteInstance(confirmDeleteId.value)
    confirmDeleteId.value = null
  }
}

// ── Toggle enabled ────────────────────────────────────────────────────────────
async function toggleEnabled(inst: StrategyInstance) {
  await store.updateInstance(inst.id, { enabled: !inst.enabled })
}

// ── Deploy / Backtest nav ─────────────────────────────────────────────────────
async function deployLive(inst: StrategyInstance) {
  await store.updateInstance(inst.id, { enabled: true })
  router.push('/trading')
}

function goBacktest(inst: StrategyInstance) {
  router.push(`/backtest?strategyId=${inst.id}`)
}

// ── Backtest panel ────────────────────────────────────────────────────────────
const backtestPanelId = ref<string | null>(null)
const backtestStart = ref('')
const backtestEnd = ref('')
const backtestLoading = ref(false)
const backtestResultMap = ref<Record<string, Record<string, any>>>({})

function toggleBacktestPanel(inst: StrategyInstance) {
  if (backtestPanelId.value === inst.id) {
    backtestPanelId.value = null
  } else {
    backtestPanelId.value = inst.id
    backtestStart.value = ''
    backtestEnd.value = ''
  }
}

async function runBacktest(inst: StrategyInstance) {
  if (!backtestStart.value || !backtestEnd.value) return
  backtestLoading.value = true
  const result = await store.runBacktest(inst.id, backtestStart.value, backtestEnd.value)
  backtestLoading.value = false
  if (result) {
    backtestResultMap.value[inst.id] = result
    store.addBacktestResult(inst.id, inst.name, inst.type, {
      totalTrades: result.totalTrades ?? 0,
      winRate: result.winRate ?? 0,
      totalPnl: result.totalPnl ?? 0,
      maxDrawdown: result.maxDrawdown ?? 0,
    })
  }
}

// ── Last signal per strategy ──────────────────────────────────────────────────
function lastSignalFor(strategyId: string) {
  return store.signals.find(s => s.strategyId === strategyId) ?? null
}

const signalColorClass = (signal: string) =>
  signal === 'buy' ? 'text-success' : signal === 'sell' ? 'text-error' : 'text-base-content/50'

// ── Live signals feed ─────────────────────────────────────────────────────────
const displaySignals = computed(() => store.signals.slice(0, 20))
const signalFeedRef = ref<HTMLElement | null>(null)

// ── Param field helpers ───────────────────────────────────────────────────────
function ensureParam(key: string, defaultVal: any) {
  if (!(key in formParams.value)) formParams.value[key] = defaultVal
}

function initDcaParams() {
  ensureParam('investmentAmount', 100)
  ensureParam('intervalHours', 24)
  ensureParam('maxPositions', 5)
  ensureParam('takeProfitPct', 5)
  ensureParam('stopLossPct', 3)
}
function initGridParams() {
  ensureParam('upperPrice', 0)
  ensureParam('lowerPrice', 0)
  ensureParam('gridLevels', 10)
  ensureParam('investmentPerGrid', 50)
}
function initMaParams() {
  ensureParam('fastPeriod', 9)
  ensureParam('slowPeriod', 21)
  ensureParam('signalPeriod', 9)
  ensureParam('timeframe', '1h')
}
function initRsiParams() {
  ensureParam('period', 14)
  ensureParam('overbought', 70)
  ensureParam('oversold', 30)
  ensureParam('timeframe', '1h')
}
function initBollingerParams() {
  ensureParam('period', 20)
  ensureParam('stdDev', 2)
  ensureParam('timeframe', '1h')
}
</script>

<template>
  <div class="p-4 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">🤖 Strategy Manager</h1>
      <button class="btn btn-primary btn-sm" @click="openCreate">+ New Strategy</button>
    </div>

    <!-- Error banner -->
    <div v-if="store.error" class="alert alert-error text-sm">{{ store.error }}</div>

    <!-- Loading -->
    <div v-if="store.loading && store.instances.length === 0" class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg"></span>
    </div>

    <!-- Empty state -->
    <div v-else-if="store.instances.length === 0" class="text-center text-base-content/50 py-12">
      No strategies yet. Click <strong>New Strategy</strong> to create one.
    </div>

    <!-- Strategy Cards -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="inst in store.instances" :key="inst.id" class="card card-compact bg-base-200 shadow">
        <div class="card-body gap-2">
          <!-- Card Header -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate">{{ inst.name }}</div>
              <div class="mt-1">
                <span class="badge badge-sm" :class="typeBadgeClass[inst.type]">{{ inst.type }}</span>
              </div>
            </div>
            <input
              type="checkbox"
              class="toggle toggle-success toggle-sm"
              :checked="inst.enabled"
              @change="toggleEnabled(inst)"
            />
          </div>

          <!-- Symbols -->
          <div class="text-xs text-base-content/60">
            <span class="font-medium">Symbols:</span> {{ inst.symbols.join(', ') || '—' }}
          </div>

          <!-- Last signal -->
          <div v-if="lastSignalFor(inst.id)" class="text-xs">
            <span class="font-medium">Last signal:</span>
            <span :class="signalColorClass(lastSignalFor(inst.id)!.signal)" class="ml-1 font-bold uppercase">
              {{ lastSignalFor(inst.id)!.signal }}
            </span>
            <span class="text-base-content/50 ml-1">@ {{ lastSignalFor(inst.id)!.price }}</span>
          </div>

          <!-- Actions -->
          <div class="flex flex-wrap gap-1 mt-1">
            <button class="btn btn-xs btn-outline" @click="openEdit(inst)">Edit</button>
            <button class="btn btn-xs btn-error btn-outline" @click="requestDelete(inst.id)">Delete</button>
            <button class="btn btn-xs btn-info btn-outline" @click="toggleBacktestPanel(inst)">
              {{ backtestPanelId === inst.id ? 'Close BT' : 'Run Backtest' }}
            </button>
            <button class="btn btn-xs btn-success" @click="deployLive(inst)">▶ Deploy Live</button>
            <button class="btn btn-xs btn-info" @click="goBacktest(inst)">🧪 Backtest</button>
          </div>

          <!-- Inline Backtest Panel -->
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
            </div>
            <button
              class="btn btn-xs btn-primary w-full"
              :disabled="backtestLoading || !backtestStart || !backtestEnd"
              @click="runBacktest(inst)"
            >
              <span v-if="backtestLoading" class="loading loading-spinner loading-xs"></span>
              <span v-else>Run</span>
            </button>
            <!-- Results -->
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

    <!-- Live Signals Feed -->
    <div class="card bg-base-200 shadow">
      <div class="card-body p-4">
        <h2 class="card-title text-base mb-2">📡 Live Signals Feed</h2>
        <div v-if="displaySignals.length === 0" class="text-xs text-base-content/50">No signals yet.</div>
        <div v-else class="overflow-x-auto">
          <table class="table table-xs w-full">
            <thead>
              <tr>
                <th>Time</th>
                <th>Strategy</th>
                <th>Symbol</th>
                <th>Signal</th>
                <th>Price</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody ref="signalFeedRef">
              <tr v-for="sig in displaySignals" :key="sig.strategyId + sig.timestamp">
                <td class="whitespace-nowrap text-base-content/60">{{ new Date(sig.timestamp).toLocaleTimeString() }}</td>
                <td class="whitespace-nowrap">{{ sig.strategyName }}</td>
                <td>{{ sig.symbol }}</td>
                <td>
                  <span class="font-bold uppercase" :class="signalColorClass(sig.signal)">{{ sig.signal }}</span>
                </td>
                <td>{{ sig.price }}</td>
                <td class="max-w-[160px] truncate text-base-content/50">{{ JSON.stringify(sig.metadata) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create / Edit Modal -->
    <div v-if="modalOpen" class="modal modal-open">
      <div class="modal-box max-w-lg w-full">
        <h3 class="font-bold text-lg mb-4">{{ editingId ? 'Edit Strategy' : 'New Strategy' }}</h3>

        <div class="space-y-3">
          <!-- Name -->
          <div class="form-control">
            <label class="label"><span class="label-text">Name</span></label>
            <input v-model="formName" type="text" placeholder="My Strategy" class="input input-bordered input-sm" />
          </div>

          <!-- Type -->
          <div class="form-control">
            <label class="label"><span class="label-text">Strategy Type</span></label>
            <select
              v-model="formType"
              class="select select-bordered select-sm"
              @change="onTypeChange"
            >
              <option v-for="t in strategyTypes" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>

          <!-- Symbols -->
          <div class="form-control">
            <label class="label">
              <span class="label-text">Symbols</span>
              <span class="label-text-alt text-base-content/50">{{ formSymbolsSelected.length }} selected</span>
            </label>
            <div v-if="allConfigSymbols.length === 0" class="text-xs text-base-content/50 italic">
              No enabled symbols in config. Add them in Settings first.
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

          <!-- Enabled -->
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Enabled</span>
              <input type="checkbox" v-model="formEnabled" class="toggle toggle-success toggle-sm" />
            </label>
          </div>

          <!-- Dynamic Params -->
          <div class="border border-base-300 rounded-lg p-3 space-y-2">
            <div class="text-sm font-semibold text-base-content/70">Parameters</div>

            <!-- break_bounce -->
            <div v-if="formType === 'break_bounce'" class="text-xs text-base-content/60 italic">
              Uses global timeframe config from Live Trading settings.
            </div>

            <!-- dca -->
            <template v-if="formType === 'dca'">
              <template v-if="initDcaParams() === undefined"><!-- side-effect init --></template>
              <div class="grid grid-cols-2 gap-2">
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Investment Amount</span></label>
                  <input type="number" v-model.number="formParams['investmentAmount']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Interval Hours</span></label>
                  <input type="number" v-model.number="formParams['intervalHours']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Max Positions</span></label>
                  <input type="number" v-model.number="formParams['maxPositions']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Take Profit %</span></label>
                  <input type="number" v-model.number="formParams['takeProfitPct']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Stop Loss %</span></label>
                  <input type="number" v-model.number="formParams['stopLossPct']" class="input input-bordered input-xs" />
                </div>
              </div>
            </template>

            <!-- grid -->
            <template v-if="formType === 'grid'">
              <template v-if="initGridParams() === undefined"><!-- side-effect init --></template>
              <div class="grid grid-cols-2 gap-2">
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Upper Price</span></label>
                  <input type="number" v-model.number="formParams['upperPrice']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Lower Price</span></label>
                  <input type="number" v-model.number="formParams['lowerPrice']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Grid Levels</span></label>
                  <input type="number" v-model.number="formParams['gridLevels']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Investment / Grid</span></label>
                  <input type="number" v-model.number="formParams['investmentPerGrid']" class="input input-bordered input-xs" />
                </div>
              </div>
            </template>

            <!-- ma_crossover -->
            <template v-if="formType === 'ma_crossover'">
              <template v-if="initMaParams() === undefined"><!-- side-effect init --></template>
              <div class="grid grid-cols-2 gap-2">
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Fast Period</span></label>
                  <input type="number" v-model.number="formParams['fastPeriod']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Slow Period</span></label>
                  <input type="number" v-model.number="formParams['slowPeriod']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Signal Period</span></label>
                  <input type="number" v-model.number="formParams['signalPeriod']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Timeframe</span></label>
                  <select v-model="formParams['timeframe']" class="select select-bordered select-xs">
                    <option v-for="tf in timeframeOptions" :key="tf" :value="tf">{{ tf }}</option>
                  </select>
                </div>
              </div>
            </template>

            <!-- rsi -->
            <template v-if="formType === 'rsi'">
              <template v-if="initRsiParams() === undefined"><!-- side-effect init --></template>
              <div class="grid grid-cols-2 gap-2">
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Period</span></label>
                  <input type="number" v-model.number="formParams['period']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Overbought</span></label>
                  <input type="number" v-model.number="formParams['overbought']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Oversold</span></label>
                  <input type="number" v-model.number="formParams['oversold']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Timeframe</span></label>
                  <select v-model="formParams['timeframe']" class="select select-bordered select-xs">
                    <option v-for="tf in timeframeOptions" :key="tf" :value="tf">{{ tf }}</option>
                  </select>
                </div>
              </div>
            </template>

            <!-- bollinger -->
            <template v-if="formType === 'bollinger'">
              <template v-if="initBollingerParams() === undefined"><!-- side-effect init --></template>
              <div class="grid grid-cols-2 gap-2">
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Period</span></label>
                  <input type="number" v-model.number="formParams['period']" class="input input-bordered input-xs" />
                </div>
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Std Dev</span></label>
                  <input type="number" v-model.number="formParams['stdDev']" class="input input-bordered input-xs" step="0.1" />
                </div>
                <div class="form-control col-span-2">
                  <label class="label py-0"><span class="label-text text-xs">Timeframe</span></label>
                  <select v-model="formParams['timeframe']" class="select select-bordered select-xs">
                    <option v-for="tf in timeframeOptions" :key="tf" :value="tf">{{ tf }}</option>
                  </select>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="modal-action">
          <button class="btn btn-ghost btn-sm" @click="closeModal">Cancel</button>
          <button class="btn btn-primary btn-sm" :disabled="store.loading" @click="saveModal">
            <span v-if="store.loading" class="loading loading-spinner loading-xs"></span>
            <span v-else>{{ editingId ? 'Update' : 'Create' }}</span>
          </button>
        </div>
      </div>
      <div class="modal-backdrop" @click="closeModal"></div>
    </div>

    <!-- Delete Confirm Modal -->
    <div v-if="confirmDeleteId" class="modal modal-open">
      <div class="modal-box max-w-sm">
        <h3 class="font-bold text-lg">Confirm Delete</h3>
        <p class="py-4 text-base-content/70">Are you sure you want to delete this strategy? This cannot be undone.</p>
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
  </div>
</template>
