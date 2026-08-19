<script setup lang="ts">
import AppNav from '@/components/AppNav.vue'
import { onMounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useTradesStore } from '@/stores/trades'
import { useMarketStore } from '@/stores/market'
import { useWebSocket } from '@/composables/useWebSocket'

const configStore = useConfigStore()
const tradesStore = useTradesStore()
const marketStore = useMarketStore()

onMounted(async () => {
  await configStore.fetchConfig()
  await Promise.all([
    tradesStore.fetchTrades(),
    tradesStore.fetchPositions(),
    tradesStore.fetchEquity(),
    marketStore.fetchDailyRanges(),
  ])
})

const { connected } = useWebSocket((msg) => {
  if (msg.type === 'breakout') marketStore.addBreakout(msg.signal)
  else if (msg.type === 'retest') marketStore.addRetest(msg.signal)
  else if (msg.type === 'reversal') marketStore.addReversal(msg.signal)
  else if (msg.type === 'trade_opened' || msg.type === 'trade_closed') tradesStore.addTrade(msg.trade)
  else if (msg.type === 'paper_account') tradesStore.setPaperAccount(msg.account)
})
</script>

<template>
  <div class="flex h-full min-h-screen bg-base-100">
    <AppNav :connected="connected" />
    <main class="relative z-0 min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
      <router-view />
    </main>
  </div>
</template>
