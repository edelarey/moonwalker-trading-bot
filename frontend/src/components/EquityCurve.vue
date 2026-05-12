<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { createChart, type IChartApi, type ISeriesApi, LineStyle } from 'lightweight-charts'
import type { Trade } from '@/api/client'

const props = defineProps<{ trades: Trade[]; startingEquity?: number }>()
const container = ref<HTMLDivElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Line'> | null = null

function buildEquityCurveData() {
  let equity = props.startingEquity ?? 10000
  const data: { time: number; value: number }[] = [{ time: Math.floor(Date.now() / 1000) - 86400 * 30, value: equity }]
  const sorted = [...props.trades].sort((a, b) => a.openedAt - b.openedAt)
  for (const t of sorted) {
    equity += t.pnl ?? 0
    data.push({ time: Math.floor(t.openedAt / 1000), value: parseFloat(equity.toFixed(2)) })
  }
  return data
}

onMounted(() => {
  if (!container.value) return
  chart = createChart(container.value, {
    layout: { background: { color: 'transparent' }, textColor: '#9ca3af' },
    grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
    width: container.value.clientWidth,
    height: 200,
    rightPriceScale: { borderColor: '#374151' },
    timeScale: { borderColor: '#374151' },
  })
  series = chart.addLineSeries({ color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Solid })
  series.setData(buildEquityCurveData() as any)
})

watch(() => props.trades, () => {
  if (series) series.setData(buildEquityCurveData() as any)
}, { deep: true })
</script>

<template>
  <div ref="container" class="w-full" style="height:200px" />
</template>
