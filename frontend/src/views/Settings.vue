<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '@/stores/config'

const config = useConfigStore()

const apiKey = ref('')
const apiSecret = ref('')
const saving = ref(false)
const saved = ref(false)

const testnet = computed({
  get: () => config.config?.testnet ?? true,
  set: (v: boolean) => config.updateConfig({ testnet: v }),
})

async function saveKeys() {
  saving.value = true
  try {
    alert('API keys should be set in backend/.env — BYBIT_API_KEY and BYBIT_API_SECRET.\nRestarting the backend picks them up.')
    saved.value = true
    setTimeout(() => { saved.value = false }, 3000)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Settings</h1>

    <!-- Network -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">Network</h2>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" class="toggle toggle-warning" :checked="testnet" @change="testnet = !testnet" />
            <div>
              <p class="font-medium">Testnet Mode</p>
              <p class="text-xs text-base-content/50">Use Bybit testnet API. Disable for live trading.</p>
            </div>
          </label>
          <span v-if="testnet" class="badge badge-warning ml-4">TESTNET ACTIVE</span>
          <span v-else class="badge badge-error animate-pulse ml-4">⚠ LIVE MAINNET</span>
        </div>
      </div>
    </div>

    <!-- API Keys -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-4 space-y-4">
        <h2 class="card-title text-base">API Keys</h2>
        <div class="alert alert-info text-sm">
          <span>🔒 For security, API keys are stored in <code>backend/.env</code> and never transmitted to the frontend. Set them there and restart the backend.</span>
        </div>
        <label class="form-control">
          <span class="label-text text-xs mb-1">Bybit API Key (preview only)</span>
          <input type="password" placeholder="Set in backend/.env" class="input input-bordered" v-model="apiKey" />
        </label>
        <label class="form-control">
          <span class="label-text text-xs mb-1">Bybit API Secret (preview only)</span>
          <input type="password" placeholder="Set in backend/.env" class="input input-bordered" v-model="apiSecret" />
        </label>
        <button class="btn btn-primary" @click="saveKeys" :disabled="saving">
          {{ saved ? '✓ Saved' : 'Save Keys' }}
        </button>
      </div>
    </div>

    <!-- Storage Mode -->
    <div v-if="config.config" class="card bg-base-200 border border-base-300">
      <div class="card-body p-4">
        <h2 class="card-title text-base">Data Storage</h2>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="storage" class="radio radio-primary" value="json"
              :checked="config.config.storageMode === 'json'"
              @change="config.updateConfig({ storageMode: 'json' })" />
            <span>JSON Files (default, no setup required)</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="storage" class="radio radio-primary" value="postgres"
              :checked="config.config.storageMode === 'postgres'"
              @change="config.updateConfig({ storageMode: 'postgres' })" />
            <span>PostgreSQL (set DATABASE_URL in .env)</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
