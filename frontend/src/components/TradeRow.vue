<script setup lang="ts">
import type { Trade } from '@/api/client'

defineProps<{ trade: Trade }>()

function formatDate(ms: number) {
  return new Date(ms).toLocaleString()
}
function pnlClass(pnl?: number) {
  if (!pnl) return ''
  return pnl > 0 ? 'text-profit' : 'text-loss'
}
</script>

<template>
  <tr class="hover">
    <td class="font-mono text-sm">
      {{ trade.symbol }}
      <span v-if="trade.mode === 'paper'" class="badge badge-info badge-xs ml-1">P</span>
      <span v-else-if="trade.mode === 'live'" class="badge badge-error badge-xs ml-1">L</span>
    </td>
    <td>
      <span :class="trade.direction === 'bullish' ? 'badge-bullish' : 'badge-bearish'">
        {{ trade.direction === 'bullish' ? '▲ Long' : '▼ Short' }}
      </span>
    </td>
    <td class="font-mono">{{ trade.entryPrice.toFixed(4) }}</td>
    <td class="font-mono text-loss">{{ trade.stopLoss.toFixed(4) }}</td>
    <td class="font-mono text-profit">{{ trade.takeProfit.toFixed(4) }}</td>
    <td :class="pnlClass(trade.pnl)" class="font-mono">
      {{ trade.pnl !== undefined ? (trade.pnl > 0 ? '+' : '') + trade.pnl.toFixed(2) : '—' }}
    </td>
    <td class="text-xs text-base-content/60">{{ trade.strategyType || trade.patternType || '—' }}</td>
    <td>
      <span class="badge badge-sm" :class="{
        'badge-warning': trade.status === 'open',
        'badge-success': trade.status === 'closed_tp',
        'badge-error': trade.status === 'closed_sl',
        'badge-neutral': trade.status === 'closed_manual',
      }">{{ trade.status }}</span>
    </td>
    <td class="text-xs text-base-content/50">{{ formatDate(trade.openedAt) }}</td>
  </tr>
</template>
