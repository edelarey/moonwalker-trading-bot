<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useBacktestStore } from '@/stores/backtest'
import StatCard from '@/components/StatCard.vue'
import TradeRow from '@/components/TradeRow.vue'
import EquityCurve from '@/components/EquityCurve.vue'
import { backtestApi } from '@/api/client'

const store = useBacktestStore()
const busy = ref(false)
const actionError = ref<string | null>(null)

onMounted(() => store.fetchResults())

const hasResults = computed(() => store.results.length > 0)
const result = computed(() => store.currentResult)
const s = computed(() => result.value?.summary)

function selectResult(id: string) {
  store.currentResult = store.results.find(r => r.id === id) ?? null
}

async function deleteThis() {
  if (!result.value?.id) return
  if (!confirm('Delete this backtest run?')) return
  busy.value = true
  actionError.value = null
  try {
    await store.removeOne(result.value.id)
  } catch (e: any) {
    actionError.value = e?.message ?? 'Delete failed'
    await store.fetchResults()
  } finally {
    busy.value = false
  }
}

async function deleteAll() {
  if (!confirm('Clear all saved backtests? This cannot be undone.')) return
  busy.value = true
  actionError.value = null
  try {
    await store.clearAll()
  } catch (e: any) {
    actionError.value = e?.message ?? 'Clear all failed'
    await store.fetchResults()
  } finally {
    busy.value = false
  }
}

function label(r: { instanceName?: string; strategyType?: string }) {
  return r.instanceName || r.strategyType || 'Backtest'
}

function fmtNum(n: number | null | undefined, digits = 2, fallback = '—'): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return n.toFixed(digits)
}

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}

const runSettings = computed<{ label: string; value: string }[]>(() => {
  const r = result.value
  if (!r) return []
  const p = r.params ?? ({} as typeof r.params)
  const rows: { label: string; value: string }[] = [
    { label: 'Strategy', value: label(r) },
    { label: 'Type', value: String(r.strategyType ?? '—') },
    { label: 'Symbols', value: (p.symbols ?? []).join(', ') || '—' },
    { label: 'Range', value: `${p.startDate ?? '—'} → ${p.endDate ?? '—'}` },
    { label: 'Risk %', value: p.riskPercent != null ? String(p.riskPercent) : '—' },
    { label: 'Leverage', value: p.leverage != null ? `${p.leverage}×` : '—' },
    { label: 'Sizing', value: p.sizingMode === 'fixed_usdt'
      ? `Fixed ${p.fixedPositionUsdt ?? '—'} USDT × lev`
      : (p.sizingMode ?? 'risk_percent') },
    { label: 'Stop fill', value: p.stopFillMode === 'stop_price' ? 'At stop price' : 'At candle close' },
  ]
  const strat = p.strategyParams ?? {}
  for (const [k, v] of Object.entries(strat)) {
    if (v == null || v === '') continue
    rows.push({ label: formatKey(k), value: String(v) })
  }
  return rows
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold">Backtest Results</h1>
        <p v-if="hasResults && result" class="text-sm text-base-content/60 mt-0.5">
          {{ label(result) }}
          · {{ result.params?.symbols?.join(', ') }}
          · {{ result.params.startDate }} → {{ result.params.endDate }}
          · PnL is profit vs $ {{ fmtNum(result.summary.startingEquity, 0, '10,000') }} start, not the closing balance
        </p>
      </div>
      <div class="flex gap-2">
        <button v-if="hasResults && result" class="btn btn-sm btn-outline" :disabled="busy" @click="backtestApi.exportCsv(result!.id)">
          Export CSV
        </button>
        <button v-if="hasResults && result" class="btn btn-sm btn-outline btn-error" :disabled="busy" @click="deleteThis">
          Delete this run
        </button>
        <button
          v-if="hasResults"
          class="btn btn-sm btn-error"
          :disabled="busy"
          @click="deleteAll"
        >
          {{ busy ? 'Working…' : 'Delete all backtests' }}
        </button>
      </div>
    </div>

    <p v-if="actionError" class="text-error text-sm">{{ actionError }}</p>

    <div v-if="hasResults" class="flex flex-wrap gap-2">
      <button
        v-for="r in store.results"
        :key="r.id"
        class="btn btn-xs"
        :class="result?.id === r.id ? 'btn-primary' : 'btn-outline'"
        @click="selectResult(r.id)"
      >
        {{ new Date(r.runAt).toLocaleDateString() }} — {{ label(r) }} — {{ (r.params?.symbols ?? []).slice(0, 3).join(',') }}
      </button>
    </div>

    <div v-if="!hasResults" class="text-center text-base-content/40 py-20 text-lg">
      No saved backtests yet. Run one from Backtest or Strategy Manager — results are stored on disk and survive a refresh.
    </div>

    <template v-else-if="result">
      <div class="card bg-base-200 border border-base-300">
        <div class="card-body p-4">
          <h2 class="card-title text-base">Settings used for this run</h2>
          <p class="text-xs text-base-content/50 mb-2">Snapshot at run time — later edits in Strategy Manager do not change this.</p>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <div v-for="row in runSettings" :key="row.label" class="bg-base-300 rounded px-2 py-1">
              <div class="text-xs text-base-content/50">{{ row.label }}</div>
              <div class="text-sm font-mono font-semibold break-all">{{ row.value }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="s" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Trades" :value="s.totalTrades" icon="🔢" />
        <StatCard title="Win Rate" :value="fmtNum(s.winRate != null ? s.winRate * 100 : null, 1) + '%'" :trend="(s.winRate ?? 0) >= 0.5 ? 'up' : 'down'" icon="🎯" />
        <StatCard title="Profit Factor" :value="s.profitFactor == null || !Number.isFinite(s.profitFactor) ? '∞' : fmtNum(s.profitFactor)" :trend="(s.profitFactor ?? 0) >= 1.5 ? 'up' : 'down'" icon="⚖️" />
        <StatCard title="Total P&L" :value="((s.totalPnl ?? 0) >= 0 ? '+' : '') + fmtNum(s.totalPnl) + ' USDT'" :trend="(s.totalPnl ?? 0) >= 0 ? 'up' : 'down'" icon="💰" />
        <StatCard title="Max Drawdown" :value="fmtNum(s.maxDrawdown) + ' USDT'" :trend="(s.maxDrawdownPercent ?? 0) < 10 ? 'up' : 'down'" icon="📉" />
        <StatCard title="Max DD %" :value="fmtNum(s.maxDrawdownPercent) + '%'" icon="📊" />
        <StatCard title="Avg R:R" :value="fmtNum(s.avgRR)" icon="📐" />
        <StatCard title="End Equity" :value="'$' + fmtNum(s.endingEquity)" icon="💵" />
      </div>

      <div class="card bg-base-200 border border-base-300">
        <div class="card-body p-4">
          <h2 class="card-title text-base">Equity Curve</h2>
          <EquityCurve :key="result.id" :trades="result.trades" :starting-equity="s?.startingEquity" />
        </div>
      </div>

      <div class="card bg-base-200 border border-base-300">
        <div class="card-body p-4">
          <h2 class="card-title text-base">Trade List ({{ result.trades.length }})</h2>
          <div class="overflow-x-auto max-h-96">
            <table class="table table-sm">
              <thead class="sticky top-0 bg-base-200"><tr>
                <th>Symbol</th><th>Dir</th><th>Entry</th><th>SL</th><th>TP</th><th>Size USDT</th><th>Lev</th><th>Qty</th><th>PnL</th><th>Strategy</th><th>Status</th><th>Time</th>
              </tr></thead>
              <tbody>
                <TradeRow v-for="t in result.trades" :key="t.id" :trade="t" />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
