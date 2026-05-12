<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '@/stores/config'
import { symbolsApi } from '@/api/client'
import { useMarketStore } from '@/stores/market'

const config = useConfigStore()
const market = useMarketStore()
const newSymbol = ref('')
const adding = ref(false)
const removing = ref<string | null>(null)
const error = ref('')
const addedInactive = ref(false)

const totalSymbols = computed(() => config.config?.symbols.length ?? 0)
const enabledCount = computed(() => config.config?.symbols.filter(s => s.enabled).length ?? 0)
const atActiveLimit = computed(() => enabledCount.value >= 20)

async function addSymbol() {
  if (!newSymbol.value.trim()) return
  adding.value = true
  error.value = ''
  addedInactive.value = false
  try {
    await symbolsApi.add(newSymbol.value.trim().toUpperCase())
    await config.fetchConfig()
    // Check if it was added as inactive (limit was hit server-side)
    const added = config.config?.symbols.find(s => s.symbol === newSymbol.value.trim().toUpperCase())
    if (added && !added.enabled) addedInactive.value = true
    newSymbol.value = ''
    setTimeout(() => addedInactive.value = false, 5000)
  } catch (e: any) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    adding.value = false
  }
}

async function toggleEnabled(symbol: string, currentEnabled: boolean) {
  // Prevent enabling if at active limit
  if (!currentEnabled && atActiveLimit.value) return

  await config.updateConfig({
    symbols: config.config!.symbols.map(s =>
      s.symbol === symbol ? { ...s, enabled: !s.enabled } : s
    )
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
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Coin Scanner</h1>

    <!-- Add Symbol -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">Add Symbol</h2>
        <div class="flex gap-2">
          <input
            v-model="newSymbol"
            type="text"
            placeholder="e.g. BTCUSDT"
            class="input input-bordered flex-1 uppercase"
            @keyup.enter="addSymbol"
          />
          <button class="btn btn-primary" :disabled="adding" @click="addSymbol">
            <span v-if="adding" class="loading loading-spinner loading-sm" />
            Add
          </button>
        </div>
        <div v-if="addedInactive" class="alert alert-warning text-sm py-2 mt-2">
          ⚠ Added as <strong>inactive</strong> — 20 active symbol limit reached. Enable it by disabling another symbol first.
        </div>
        <p v-if="error" class="text-loss text-sm mt-1">{{ error }}</p>
        <p class="text-xs text-base-content/50 mt-1">
          Use Bybit USDT perpetual format e.g. BTCUSDT. Up to 20 symbols can be <strong>active</strong> at once; the list itself has no size limit.
        </p>
      </div>
    </div>

    <!-- Symbol List -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="card-title text-base">
            Tracked Symbols
            <span class="text-sm font-normal text-base-content/60 ml-1">
              ({{ totalSymbols }} total · <span :class="atActiveLimit ? 'text-warning font-semibold' : 'text-profit'">{{ enabledCount }} / 20 active</span>)
            </span>
          </h2>
          <div v-if="atActiveLimit" class="badge badge-warning badge-sm">Active limit reached</div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="sym in config.config?.symbols"
            :key="sym.symbol"
            class="flex items-center justify-between p-3 rounded-lg"
            :class="sym.enabled ? 'bg-base-300' : 'bg-base-300/40 opacity-60'"
          >
            <div class="flex items-center gap-3">
              <div
                class="tooltip"
                :data-tip="!sym.enabled && atActiveLimit ? '20 active limit reached — disable another symbol first' : sym.enabled ? 'Click to disable' : 'Click to enable'"
              >
                <input
                  type="checkbox"
                  class="toggle toggle-sm"
                  :class="sym.enabled ? 'toggle-primary' : 'toggle-ghost'"
                  :checked="sym.enabled"
                  :disabled="!sym.enabled && atActiveLimit"
                  @change="toggleEnabled(sym.symbol, sym.enabled)"
                />
              </div>
              <div>
                <p class="font-bold font-mono" :class="sym.enabled ? '' : 'text-base-content/50'">{{ sym.symbol }}</p>
                <p class="text-xs text-base-content/40">
                  <span v-if="sym.enabled && market.rangeBySymbol.has(sym.symbol)">
                    H: {{ market.rangeBySymbol.get(sym.symbol)!.high.toFixed(2) }}
                  </span>
                  <span v-else-if="!sym.enabled" class="text-base-content/30">inactive</span>
                  <span v-else>No range data</span>
                </p>
              </div>
            </div>
            <button
              class="btn btn-ghost btn-xs text-loss"
              :disabled="removing === sym.symbol"
              @click="removeSymbol(sym.symbol)"
            >
              <span v-if="removing === sym.symbol" class="loading loading-spinner loading-xs" />
              <span v-else>✕</span>
            </button>
          </div>
        </div>

        <div v-if="!config.config?.symbols.length" class="text-center text-base-content/40 py-8 text-sm">
          No symbols added yet. Add your first symbol above.
        </div>
      </div>
    </div>
  </div>
</template>
