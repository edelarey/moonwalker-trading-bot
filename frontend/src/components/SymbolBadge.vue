<script setup lang="ts">
import { computed } from 'vue'
import { useMarketStore } from '@/stores/market'

const props = defineProps<{ symbol: string }>()
const market = useMarketStore()

const range = computed(() => market.rangeBySymbol.get(props.symbol))
const breakout = computed(() => market.breakouts.find(b => b.symbol === props.symbol))
</script>

<template>
  <div class="card bg-base-200 border border-base-300 p-3 flex flex-col gap-1">
    <div class="flex items-center justify-between">
      <span class="font-bold text-sm">{{ symbol }}</span>
      <span v-if="breakout" :class="breakout.direction === 'bullish' ? 'badge-bullish' : 'badge-bearish'">
        {{ breakout.direction === 'bullish' ? '▲ BREAK' : '▼ BREAK' }}
      </span>
    </div>
    <div v-if="range" class="text-xs text-base-content/60 font-mono">
      H: <span class="text-profit">{{ range.high.toFixed(2) }}</span>
      L: <span class="text-loss">{{ range.low.toFixed(2) }}</span>
    </div>
    <div v-else class="text-xs text-base-content/30">No range data</div>
  </div>
</template>
