<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { sweepApi, type SweepCandidate, type SweepJob, type SweepSlice, type StrategyType } from '@/api/client'
import { useConfigStore } from '@/stores/config'
import { useStrategiesStore } from '@/stores/strategies'
import DateInput from '@/components/DateInput.vue'
import { formatDateRange, isoToDmy, todayIso } from '@/lib/dateFormat'

const config = useConfigStore()
const strategies = useStrategiesStore()
const router = useRouter()

const startDate = ref('2024-01-01')
const endDate = ref(todayIso())
const holdoutStart = ref('')
const symbols = ref<string[]>(['BTCUSDT'])
const riskPercent = ref(1)
const stopFillMode = ref<'stop_price' | 'bar_close'>('bar_close')
const selectedTypes = ref<StrategyType[]>([])
const presets = ref<Array<{ type: StrategyType; name: string; variantCount: number }>>([])
const job = ref<SweepJob | null>(null)
const error = ref<string | null>(null)
const cloning = ref<string | null>(null)
const cloneMsg = ref<string | null>(null)
const sortKey = ref<'score' | 'holdPnl' | 'holdDd' | 'holdTrades' | 'inPnl'>('score')

let poll: ReturnType<typeof setInterval> | null = null

const extraSymbols = computed(() => {
  const enabled = config.config?.symbols.filter(s => s.enabled).map(s => s.symbol) ?? []
  const extras = ['BTCUSDT', 'ETHUSDT', ...enabled]
  return [...new Set(extras)]
})

const variantCount = computed(() =>
  presets.value.filter(p => selectedTypes.value.includes(p.type)).reduce((n, p) => n + p.variantCount, 0),
)

const running = computed(() => job.value?.status === 'running')
const progressPct = computed(() => {
  if (!job.value || !job.value.total) return 0
  return Math.round((job.value.done / job.value.total) * 100)
})

const ranked = computed(() => {
  const rows = [...(job.value?.candidates ?? [])]
  const score = (c: SweepCandidate) => {
    if (sortKey.value === 'score') return c.holdoutScore ?? -1e9
    if (sortKey.value === 'holdPnl') return c.holdout?.totalPnl ?? -1e12
    if (sortKey.value === 'holdDd') return -(c.holdout?.maxDrawdownPercent ?? 1e9)
    if (sortKey.value === 'holdTrades') return c.holdout?.totalTrades ?? -1
    return c.inSample?.totalPnl ?? -1e12
  }
  rows.sort((a, b) => score(b) - score(a))
  return rows
})

function toggleSymbol(sym: string) {
  const i = symbols.value.indexOf(sym)
  if (i >= 0) {
    if (symbols.value.length === 1) return
    symbols.value.splice(i, 1)
  } else if (symbols.value.length < 2) {
    symbols.value.push(sym)
  }
}

function toggleType(type: StrategyType) {
  const i = selectedTypes.value.indexOf(type)
  if (i >= 0) selectedTypes.value.splice(i, 1)
  else selectedTypes.value.push(type)
}

function selectAllTypes() {
  selectedTypes.value = presets.value.map(p => p.type)
}

async function refreshHoldout() {
  if (!startDate.value || !endDate.value) return
  try {
    const d = await sweepApi.defaultHoldout(startDate.value, endDate.value)
    holdoutStart.value = d.holdoutStart
  } catch { /* keep current */ }
}

watch([startDate, endDate], () => { void refreshHoldout() })

async function refreshJob() {
  try {
    job.value = await sweepApi.get()
  } catch { /* ignore */ }
}

function startPoll() {
  if (poll) return
  poll = setInterval(() => { void refreshJob() }, 1500)
}

function stopPoll() {
  if (poll) { clearInterval(poll); poll = null }
}

watch(() => job.value?.status, (s) => {
  if (s === 'running') startPoll()
  else stopPoll()
})

onMounted(async () => {
  if (!config.config) await config.fetchConfig()
  riskPercent.value = config.config?.riskPercent ?? 1
  stopFillMode.value = config.config?.stopFillMode ?? 'bar_close'
  try {
    const p = await sweepApi.presets()
    presets.value = p.types
    selectedTypes.value = p.types.map(t => t.type)
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? e.message
  }
  await refreshHoldout()
  await refreshJob()
  if (job.value?.status === 'running') startPoll()
})

onUnmounted(stopPoll)

async function run() {
  error.value = null
  cloneMsg.value = null
  try {
    job.value = await sweepApi.run({
      symbols: symbols.value,
      startDate: startDate.value,
      endDate: endDate.value,
      holdoutStart: holdoutStart.value,
      types: selectedTypes.value,
      riskPercent: riskPercent.value,
      stopFillMode: stopFillMode.value,
    })
    startPoll()
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? e.message
  }
}

async function cancel() {
  try {
    const j = await sweepApi.cancel()
    if (j) job.value = j
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? e.message
  }
}

async function cloneRow(c: SweepCandidate) {
  if (!confirm(`Create a new Strategy Manager row for ${c.typeName} (${c.label})?\n\nIt will be Off, Auto off. Existing rows are not changed. Nothing goes live.`)) return
  cloning.value = c.id
  cloneMsg.value = null
  try {
    const inst = await sweepApi.clone(c.id)
    await strategies.fetchInstances()
    cloneMsg.value = `Created “${inst.name}” (Off). Open Strategy Manager to edit or paper-deploy.`
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? e.message
  } finally {
    cloning.value = null
  }
}

function fmtPnl(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(1)
}
function fmtPf(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return n == null ? '∞' : '—'
  return n.toFixed(2)
}
function fmtPct(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(1) + '%'
}
function sliceHint(s: SweepSlice | null) {
  if (!s) return '—'
  return `${s.totalTrades} · ${fmtPnl(s.totalPnl)} · DD ${fmtPct(s.maxDrawdownPercent)}`
}

function goManager() {
  router.push('/strategies')
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">Sweep</h1>
      <p class="text-sm text-base-content/60 mt-1 max-w-3xl">
        Runs a <strong>small fixed grid</strong> of common starting parameters for each selected type,
        then scores them on a <strong>holdout</strong> window you did not use to pick settings.
        This is a comparison, not a live recommendation. It does not enable Auto or send orders.
      </p>
    </div>

    <div class="alert alert-warning text-sm">
      <span>
        Highest profit on the in-sample window is usually curve-fit.
        Rank by <strong>holdout</strong> (last ~30% of the range by default).
        Need at least 8 holdout trades to get a score. Clone creates a <strong>new Off</strong> row only.
      </span>
    </div>

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4 gap-3 space-y-0">
        <h2 class="card-title text-base">Window</h2>
        <p class="text-xs text-base-content/50">Dates are day-first: <span class="font-mono">dd-mm-YYYY</span>. In-sample is start → day before holdout. Holdout is holdout start → end.</p>
        <div class="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label class="form-control w-auto">
            <span class="label-text text-xs mb-1">Start</span>
            <DateInput v-model="startDate" />
          </label>
          <label class="form-control w-auto">
            <span class="label-text text-xs mb-1">Holdout start</span>
            <DateInput v-model="holdoutStart" />
          </label>
          <label class="form-control w-auto">
            <span class="label-text text-xs mb-1">End</span>
            <DateInput v-model="endDate" />
          </label>
          <label class="form-control w-auto">
            <span class="label-text text-xs mb-1">Risk % if SL hits</span>
            <input type="number" step="0.1" min="0.1" max="10" class="input input-bordered w-24" v-model.number="riskPercent" />
          </label>
          <label class="form-control w-auto min-w-[14rem]">
            <span class="label-text text-xs mb-1">Stop fill (all runs)</span>
            <select class="select select-bordered select-readable" v-model="stopFillMode">
              <option value="bar_close">Fill at candle close</option>
              <option value="stop_price">Fill at stop price</option>
            </select>
          </label>
        </div>

        <div>
          <p class="text-xs font-semibold mb-1">Coins (max 2)</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="sym in extraSymbols"
              :key="sym"
              class="btn btn-xs"
              :class="symbols.includes(sym) ? 'btn-primary' : 'btn-outline'"
              @click="toggleSymbol(sym)"
            >{{ sym }}</button>
          </div>
        </div>

        <div>
          <div class="flex items-center gap-2 mb-1">
            <p class="text-xs font-semibold">Types</p>
            <button class="btn btn-ghost btn-xs" @click="selectAllTypes">All sweepable</button>
            <span class="text-xs text-base-content/50">{{ variantCount }} variants × 2 windows</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in presets"
              :key="p.type"
              class="btn btn-xs"
              :class="selectedTypes.includes(p.type) ? 'btn-primary' : 'btn-outline'"
              @click="toggleType(p.type)"
            >{{ p.name }} <span class="opacity-60">×{{ p.variantCount }}</span></button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button class="btn btn-primary" :disabled="running || !selectedTypes.length || !symbols.length" @click="run">
            {{ running ? 'Sweeping…' : '▶ Run sweep' }}
          </button>
          <button v-if="running" class="btn btn-outline btn-error" @click="cancel">Stop after this candidate</button>
          <p v-if="error" class="text-error text-sm">{{ error }}</p>
          <p v-if="cloneMsg" class="text-success text-sm">{{ cloneMsg }} <button class="link" @click="goManager">Strategy Manager</button></p>
        </div>

        <div v-if="job" class="space-y-1">
          <progress class="progress progress-primary w-full" :value="progressPct" max="100" />
          <p class="text-xs text-base-content/50">
            {{ job.status }} · {{ job.done }}/{{ job.total }}
            <span v-if="job.currentLabel"> · {{ job.currentLabel }}</span>
            <span v-if="job.request">
              · {{ job.request.symbols.join(', ') }}
              · {{ formatDateRange(job.request.startDate, job.request.endDate) }}
              · holdout from {{ isoToDmy(job.request.holdoutStart) }}
            </span>
          </p>
        </div>
      </div>
    </div>

    <div v-if="job && job.candidates.length" class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title text-base">Comparison</h2>
          <label class="form-control">
            <span class="label-text text-xs">Sort</span>
            <select class="select select-bordered select-sm select-readable" v-model="sortKey">
              <option value="score">Holdout score (min 8 trades)</option>
              <option value="holdPnl">Holdout PnL</option>
              <option value="holdDd">Holdout MaxDD % (low first)</option>
              <option value="holdTrades">Holdout trades</option>
              <option value="inPnl">In-sample PnL (do not pick by this)</option>
            </select>
          </label>
        </div>
        <p class="text-xs text-base-content/50 mb-2">
          Score uses holdout profit factor, trade count, and MaxDD %. Unranked rows have fewer than 8 holdout trades.
          Same risk % and stop fill on every row.
        </p>
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Type</th>
                <th>Grid</th>
                <th>In-sample</th>
                <th>Holdout trades</th>
                <th>Holdout PnL</th>
                <th>Holdout DD%</th>
                <th>Holdout PF</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in ranked" :key="c.id">
                <td class="whitespace-nowrap font-medium">{{ c.typeName }}</td>
                <td class="text-xs font-mono max-w-[220px] truncate" :title="c.label">{{ c.label }}</td>
                <td class="text-xs whitespace-nowrap">{{ sliceHint(c.inSample) }}</td>
                <td>{{ c.holdout?.totalTrades ?? '—' }}</td>
                <td :class="(c.holdout?.totalPnl ?? 0) >= 0 ? 'text-success' : 'text-error'">{{ fmtPnl(c.holdout?.totalPnl) }}</td>
                <td>{{ fmtPct(c.holdout?.maxDrawdownPercent) }}</td>
                <td>{{ fmtPf(c.holdout?.profitFactor) }}</td>
                <td class="font-mono">{{ c.holdoutScore == null ? '—' : c.holdoutScore.toFixed(2) }}</td>
                <td>
                  <button
                    class="btn btn-xs btn-outline"
                    :disabled="cloning === c.id"
                    @click="cloneRow(c)"
                  >{{ cloning === c.id ? '…' : 'Clone as new row' }}</button>
                  <p v-if="c.error" class="text-error text-xs mt-1">{{ c.error }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
