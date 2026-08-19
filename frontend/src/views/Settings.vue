<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useTradesStore } from '@/stores/trades'
import { keysApi, type ApiKeyStatus } from '@/api/client'
import { useBacktestStore } from '@/stores/backtest'

const config = useConfigStore()
const trades = useTradesStore()
const backtests = useBacktestStore()

const label = ref('Bybit sub-account')
const apiKey = ref('')
const apiSecret = ref('')
const keyTestnet = ref(true)
const saving = ref(false)
const saved = ref(false)
const keyError = ref('')
const liveConfirm = ref('')
const resetting = ref(false)
const clearingTrades = ref(false)
const clearingBacktests = ref(false)
const keyStatus = ref<ApiKeyStatus | null>(null)
const showSecret = ref(false)

const isPaper = computed(() => (config.config?.tradingMode ?? 'paper') === 'paper')

onMounted(async () => {
  keyStatus.value = await keysApi.status()
  if (keyStatus.value) {
    keyTestnet.value = keyStatus.value.testnet
    if (keyStatus.value.label) label.value = keyStatus.value.label
  }
})

async function refreshKeys() {
  keyStatus.value = await keysApi.status()
}

async function setPaper() {
  await config.updateConfig({ tradingMode: 'paper' })
}

async function setLive() {
  if (liveConfirm.value !== 'LIVE') return
  const ok = await config.updateConfig({ tradingMode: 'live' })
  if (ok) liveConfirm.value = ''
}

async function saveKeys() {
  if (!apiKey.value.trim() || !apiSecret.value.trim()) {
    keyError.value = 'API key and secret are required'
    return
  }
  saving.value = true
  keyError.value = ''
  try {
    keyStatus.value = await keysApi.save({
      apiKey: apiKey.value.trim(),
      apiSecret: apiSecret.value.trim(),
      testnet: keyTestnet.value,
      label: label.value.trim() || 'Bybit sub-account',
    })
    apiKey.value = ''
    apiSecret.value = ''
    saved.value = true
    setTimeout(() => { saved.value = false }, 3000)
  } catch (e: any) {
    keyError.value = e.response?.data?.error ?? e.message
  } finally {
    saving.value = false
  }
}

async function clearKeys() {
  if (!confirm('Remove locally stored Bybit keys? Live mode will switch back to paper.')) return
  keyStatus.value = await keysApi.clear()
  await config.fetchConfig()
}

async function clearTrades() {
  if (!confirm('Clear all paper and live trade history? Open paper positions are dropped and paper equity resets to the starting balance.')) return
  clearingTrades.value = true
  try { await trades.clearHistory() } finally { clearingTrades.value = false }
}

async function clearBacktests() {
  if (!confirm('Clear all saved backtests? This cannot be undone.')) return
  clearingBacktests.value = true
  try { await backtests.clearAll() } finally { clearingBacktests.value = false }
}

async function resetPaper() {
  if (!confirm('Reset the paper account? Open paper positions will be closed. Full trade history is kept.')) return
  resetting.value = true
  try {
    await trades.resetPaper(config.config?.paperStartingEquity)
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Settings</h1>

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4 space-y-4">
        <h2 class="card-title text-base">Trading Mode</h2>
        <p class="text-sm text-base-content/60">
          Paper uses live Bybit prices and simulates fills locally. Live sends market orders to the
          sub-account whose keys you save below.
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <button class="btn btn-sm" :class="isPaper ? 'btn-info' : 'btn-outline'" @click="setPaper">Paper</button>
          <div class="flex items-center gap-2">
            <input
              v-model="liveConfirm"
              type="text"
              placeholder="Type LIVE to enable"
              class="input input-bordered input-sm w-44"
            />
            <button class="btn btn-sm btn-error" :disabled="liveConfirm !== 'LIVE'" @click="setLive">
              Switch to Live
            </button>
          </div>
          <span class="badge" :class="isPaper ? 'badge-info' : 'badge-error'">
            {{ isPaper ? 'PAPER ACTIVE' : 'LIVE ACTIVE' }}
          </span>
        </div>
        <p v-if="config.error" class="text-sm text-loss">{{ config.error }}</p>

        <div v-if="config.config" class="space-y-2">
          <h3 class="text-sm font-semibold">Default position size</h3>
          <div class="flex flex-wrap gap-2">
            <button
              class="btn btn-sm"
              :class="(config.config.sizingMode ?? 'risk_percent') === 'risk_percent' ? 'btn-primary' : 'btn-outline'"
              @click="config.updateConfig({ sizingMode: 'risk_percent' })"
            >Risk % of equity</button>
            <button
              class="btn btn-sm"
              :class="config.config.sizingMode === 'fixed_usdt' ? 'btn-primary' : 'btn-outline'"
              @click="config.updateConfig({ sizingMode: 'fixed_usdt' })"
            >Fixed USDT per trade</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="form-control">
              <span class="label-text text-xs mb-1">Risk % if stop-loss hits</span>
              <input
                type="number" step="0.1" min="0.1" max="10"
                class="input input-bordered input-sm"
                :value="config.config.riskPercent"
                @change="config.updateConfig({ riskPercent: parseFloat(($event.target as HTMLInputElement).value) })"
              />
            </label>
            <label class="form-control">
              <span class="label-text text-xs mb-1">USDT per trade (margin if leveraged)</span>
              <input
                type="number" step="10" min="1"
                class="input input-bordered input-sm"
                :value="config.config.fixedPositionUsdt ?? 100"
                @change="config.updateConfig({ fixedPositionUsdt: parseFloat(($event.target as HTMLInputElement).value) })"
              />
            </label>
            <label class="form-control">
              <span class="label-text text-xs mb-1">Leverage</span>
              <input
                type="number" step="1" min="1" max="100"
                class="input input-bordered input-sm"
                :value="config.config.leverage ?? 1"
                @change="config.updateConfig({ leverage: parseFloat(($event.target as HTMLInputElement).value) })"
              />
              <span class="label-text-alt text-xs mt-1 text-base-content/40">1 = no leverage. Strategy editor can override per instance.</span>
            </label>
            <label class="form-control sm:col-span-2">
              <span class="label-text text-xs mb-1">Stop fill (backtest default)</span>
              <select
                class="select select-bordered select-sm w-full"
                :value="config.config.stopFillMode ?? 'bar_close'"
                @change="config.updateConfig({ stopFillMode: ($event.target as HTMLSelectElement).value as 'stop_price' | 'bar_close' })"
              >
                <option value="stop_price">Fill at stop price (when the bar trades through SL/TP)</option>
                <option value="bar_close">Fill at candle close (only if the close is through SL/TP)</option>
              </select>
              <span class="label-text-alt text-xs mt-1 text-base-content/40">
                Each strategy can override this. Live orders always use exchange stops. Default is candle close (previous engine behaviour).
              </span>
            </label>
          </div>
        </div>

        <div v-if="config.config" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="form-control">
            <span class="label-text text-xs mb-1">Paper starting equity (USDT)</span>
            <input
              type="number"
              class="input input-bordered input-sm"
              :value="config.config.paperStartingEquity ?? 10000"
              @change="config.updateConfig({ paperStartingEquity: parseFloat(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs mb-1">Fee (bps, 6 = 0.06%)</span>
            <input
              type="number"
              class="input input-bordered input-sm"
              :value="config.config.paperFeeBps ?? 6"
              @change="config.updateConfig({ paperFeeBps: parseFloat(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs mb-1">Slippage (bps)</span>
            <input
              type="number"
              class="input input-bordered input-sm"
              :value="config.config.paperSlippageBps ?? 2"
              @change="config.updateConfig({ paperSlippageBps: parseFloat(($event.target as HTMLInputElement).value) })"
            />
          </label>
        </div>
        <button class="btn btn-sm btn-warning" :disabled="resetting" @click="resetPaper">
          {{ resetting ? 'Resetting…' : 'Reset paper account (keeps history)' }}
        </button>
      </div>
    </div>

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4 space-y-3">
        <h2 class="card-title text-base">Clear test history</h2>
        <p class="text-sm text-base-content/60">
          Wipe local logs so you can start a clean paper or backtest session. Strategies, coins, and API keys are not touched.
        </p>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-sm btn-error btn-outline" :disabled="clearingTrades" @click="clearTrades">
            {{ clearingTrades ? 'Clearing…' : 'Clear trade history' }}
          </button>
          <button class="btn btn-sm btn-error btn-outline" :disabled="clearingBacktests" @click="clearBacktests">
            {{ clearingBacktests ? 'Clearing…' : 'Clear backtest history' }}
          </button>
        </div>
      </div>
    </div>

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4 space-y-4">
        <h2 class="card-title text-base">Bybit sub-account</h2>
        <div class="alert alert-info text-sm">
          <span>
            Keys are encrypted and saved only in <code>backend/data/secrets.json</code> on this machine.
            That folder is gitignored — they are never committed. Use a dedicated sub-account with
            <strong>Contract Trade</strong> permission and no withdrawal rights.
          </span>
        </div>

        <div v-if="keyStatus?.configured" class="p-3 rounded-lg bg-base-300 text-sm flex flex-wrap gap-3 items-center">
          <span class="badge badge-success">Saved</span>
          <span>{{ keyStatus.label }}</span>
          <span class="font-mono">{{ keyStatus.keyHint }}</span>
          <span class="badge" :class="keyStatus.testnet ? 'badge-warning' : 'badge-error'">
            {{ keyStatus.testnet ? 'TESTNET' : 'MAINNET' }}
          </span>
          <span class="text-xs text-base-content/50">source: {{ keyStatus.source }}</span>
          <button v-if="keyStatus.source === 'local'" class="btn btn-xs btn-outline btn-error ml-auto" @click="clearKeys">
            Remove keys
          </button>
        </div>
        <p v-else class="text-sm text-base-content/50">No keys saved yet. Paper trading works without them.</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="form-control sm:col-span-2">
            <span class="label-text text-xs mb-1">Account label</span>
            <input v-model="label" type="text" class="input input-bordered input-sm" placeholder="e.g. Scalp sub-account" />
          </label>
          <label class="form-control sm:col-span-2">
            <span class="label-text text-xs mb-1">API key</span>
            <input v-model="apiKey" type="text" autocomplete="off" class="input input-bordered input-sm font-mono" placeholder="Bybit API key" />
          </label>
          <label class="form-control sm:col-span-2">
            <span class="label-text text-xs mb-1">API secret</span>
            <div class="flex gap-2">
              <input
                v-model="apiSecret"
                :type="showSecret ? 'text' : 'password'"
                autocomplete="new-password"
                class="input input-bordered input-sm font-mono flex-1"
                placeholder="Bybit API secret"
              />
              <button class="btn btn-sm btn-ghost" type="button" @click="showSecret = !showSecret">
                {{ showSecret ? 'Hide' : 'Show' }}
              </button>
            </div>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" class="toggle toggle-warning" v-model="keyTestnet" />
            <span class="text-sm">Use Bybit testnet for this key</span>
          </label>
        </div>
        <p v-if="keyError" class="text-sm text-loss">{{ keyError }}</p>
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveKeys">
            {{ saved ? '✓ Saved locally' : saving ? 'Saving…' : 'Save keys on this machine' }}
          </button>
          <button class="btn btn-ghost btn-sm" @click="refreshKeys">Refresh status</button>
        </div>
      </div>
    </div>

    <div v-if="config.config" class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">Data Storage</h2>
        <p class="text-xs text-base-content/50 mb-2">
          Trade history is stored in <code>backend/data/trades.json</code> (also gitignored). Paper reset does not delete it.
        </p>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="storage" class="radio radio-primary" value="json"
              :checked="config.config.storageMode === 'json'"
              @change="config.updateConfig({ storageMode: 'json' })" />
            <span>JSON Files (default)</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="storage" class="radio radio-primary" value="postgres"
              :checked="config.config.storageMode === 'postgres'"
              @change="config.updateConfig({ storageMode: 'postgres' })" />
            <span>PostgreSQL</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
