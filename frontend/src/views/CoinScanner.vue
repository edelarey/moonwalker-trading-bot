<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { symbolsApi, marketsApi, MAX_ENABLED_SYMBOLS, type MarketTicker } from '@/api/client'
import { useMarketStore } from '@/stores/market'

const config = useConfigStore()
const market = useMarketStore()
const newSymbol = ref('')
const adding = ref(false)
const removing = ref<string | null>(null)
const error = ref('')
const search = ref('')
const universe = ref<MarketTicker[]>([])
const loadingUniverse = ref(false)

const totalSymbols = computed(() => config.config?.symbols.length ?? 0)
const enabledCount = computed(() => config.config?.symbols.filter(s => s.enabled).length ?? 0)
const atActiveLimit = computed(() => enabledCount.value >= MAX_ENABLED_SYMBOLS)
const enabledSet = computed(() => new Set(config.config?.symbols.filter(s => s.enabled).map(s => s.symbol) ?? []))
const trackedSet = computed(() => new Set(config.config?.symbols.map(s => s.symbol) ?? []))

const filteredUniverse = computed(() => {
  const q = search.value.trim().toUpperCase()
  if (!q) return universe.value
  return universe.value.filter(m => m.symbol.includes(q))
})

onMounted(loadUniverse)

async function loadUniverse() {
  loadingUniverse.value = true
  try {
    universe.value = await marketsApi.top(50)
  } catch (e: any) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    loadingUniverse.value = false
  }
}

async function addSymbol() {
  if (!newSymbol.value.trim()) return
  adding.value = true
  error.value = ''
  try {
    await symbolsApi.add(newSymbol.value.trim().toUpperCase())
    await config.fetchConfig()
    newSymbol.value = ''
  } catch (e: any) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    adding.value = false
  }
}

async function toggleCatalog(symbol: string, turnOn: boolean) {
  error.value = ''
  if (turnOn && atActiveLimit.value && !enabledSet.value.has(symbol)) {
    error.value = `Active limit is ${MAX_ENABLED_SYMBOLS}`
    return
  }
  if (!trackedSet.value.has(symbol)) {
    await symbolsApi.bulk([symbol], turnOn)
    await config.fetchConfig()
    return
  }
  await config.updateConfig({
    symbols: config.config!.symbols.map(s =>
      s.symbol === symbol ? { ...s, enabled: turnOn } : s
    ),
  })
}

async function enableAllVisible() {
  const symbols = filteredUniverse.value.map(m => m.symbol)
  await symbolsApi.bulk(symbols, true)
  await config.fetchConfig()
}

async function toggleEnabled(symbol: string, currentEnabled: boolean) {
  if (!currentEnabled && atActiveLimit.value) return
  await config.updateConfig({
    symbols: config.config!.symbols.map(s =>
      s.symbol === symbol ? { ...s, enabled: !s.enabled } : s
    ),
  })
}

async function removeSymbol(symbol: string) {
  removing.value = symbol
  try {
    await symbolsApi.remove(symbol)
    await config.fetchConfig()
  } finally {
    removing.value = null
  }
}

function fmtTurnover(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  return n.toFixed(0)
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Coin Scanner</h1>
    <p class="text-sm text-base-content/60">
      Enable any of Bybit’s top 50 USDT perpetuals (by 24h turnover). Assign those coins to one or more
      strategies on the Trading page. Active limit: {{ MAX_ENABLED_SYMBOLS }}.
    </p>

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 class="card-title text-base">
            Top 50 Bybit USDT perps
            <span class="text-sm font-normal text-base-content/60 ml-1">
              {{ enabledCount }} / {{ MAX_ENABLED_SYMBOLS }} active
            </span>
          </h2>
          <div class="flex gap-2">
            <input v-model="search" class="input input-bordered input-sm w-40" placeholder="Filter…" />
            <button class="btn btn-sm btn-outline" :disabled="loadingUniverse" @click="loadUniverse">Refresh</button>
            <button class="btn btn-sm btn-primary" @click="enableAllVisible">Enable visible</button>
          </div>
        </div>
        <div v-if="loadingUniverse" class="text-sm text-base-content/50 py-6">Loading Bybit markets…</div>
        <div v-else class="overflow-x-auto max-h-[28rem]">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>On</th><th>Symbol</th><th>Last</th><th>24h</th><th>Turnover</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in filteredUniverse" :key="m.symbol" class="hover">
                <td>
                  <input
                    type="checkbox"
                    class="toggle toggle-sm toggle-primary"
                    :checked="enabledSet.has(m.symbol)"
                    :disabled="!enabledSet.has(m.symbol) && atActiveLimit"
                    @change="toggleCatalog(m.symbol, !enabledSet.has(m.symbol))"
                  />
                </td>
                <td class="font-mono font-bold">{{ m.symbol }}</td>
                <td class="font-mono">{{ m.lastPrice }}</td>
                <td :class="m.price24hPcnt >= 0 ? 'text-profit' : 'text-loss'">
                  {{ (m.price24hPcnt * 100).toFixed(2) }}%
                </td>
                <td class="font-mono text-xs">{{ fmtTurnover(m.turnover24h) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="error" class="text-loss text-sm mt-2">{{ error }}</p>
      </div>
    </div>

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">Add a symbol not in the top 50</h2>
        <div class="flex gap-2">
          <input
            v-model="newSymbol"
            type="text"
            placeholder="e.g. WIFUSDT"
            class="input input-bordered flex-1 uppercase"
            @keyup.enter="addSymbol"
          />
          <button class="btn btn-primary" :disabled="adding" @click="addSymbol">
            <span v-if="adding" class="loading loading-spinner loading-sm" />
            Add
          </button>
        </div>
      </div>
    </div>

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base mb-3">
          Tracked ({{ totalSymbols }})
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="sym in config.config?.symbols"
            :key="sym.symbol"
            class="flex items-center justify-between p-3 rounded-lg"
            :class="sym.enabled ? 'bg-base-300' : 'bg-base-300/40 opacity-60'"
          >
            <div class="flex items-center gap-3">
              <input
                type="checkbox"
                class="toggle toggle-sm"
                :class="sym.enabled ? 'toggle-primary' : 'toggle-ghost'"
                :checked="sym.enabled"
                :disabled="!sym.enabled && atActiveLimit"
                @change="toggleEnabled(sym.symbol, sym.enabled)"
              />
              <div>
                <p class="font-bold font-mono">{{ sym.symbol }}</p>
                <p class="text-xs text-base-content/40">
                  <span v-if="sym.enabled && market.rangeBySymbol.has(sym.symbol)">
                    H: {{ market.rangeBySymbol.get(sym.symbol)!.high.toFixed(2) }}
                  </span>
                  <span v-else-if="!sym.enabled">inactive</span>
                  <span v-else>No range data</span>
                </p>
              </div>
            </div>
            <button
              class="btn btn-ghost btn-xs text-loss"
              :disabled="removing === sym.symbol"
              @click="removeSymbol(sym.symbol)"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
