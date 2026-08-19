<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { createChart, type IChartApi, type ISeriesApi, LineStyle } from 'lightweight-charts'
import type { Trade } from '@/api/client'

const props = defineProps<{ trades: Trade[]; startingEquity?: number }>()
const container = ref<HTMLDivElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Line'> | null = null
let ro: ResizeObserver | null = null

function buildEquityCurveData() {
  let equity = props.startingEquity ?? 10000
  const data: { time: number; value: number }[] = []
  const sorted = [...props.trades].sort((a, b) => (a.closedAt ?? a.openedAt) - (b.closedAt ?? b.openedAt))
  if (!sorted.length) {
    data.push({ time: Math.floor(Date.now() / 1000) - 86400, value: equity })
    data.push({ time: Math.floor(Date.now() / 1000), value: equity })
    return data
  }
  data.push({ time: Math.floor((sorted[0].openedAt - 60_000) / 1000), value: equity })
  for (const t of sorted) {
    equity += t.pnl ?? 0
    data.push({ time: Math.floor((t.closedAt ?? t.openedAt) / 1000), value: parseFloat(equity.toFixed(2)) })
  }
  return data
}

function applyData() {
  if (!series) return
  series.setData(buildEquityCurveData() as any)
  chart?.timeScale().fitContent()
}

function resize() {
  if (!chart || !container.value) return
  chart.applyOptions({ width: container.value.clientWidth, height: 200 })
}

onMounted(() => {
  if (!container.value) return
  chart = createChart(container.value, {
    layout: { background: { color: 'transparent' }, textColor: '#9ca3af' },
    grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
    width: Math.max(container.value.clientWidth, 100),
    height: 200,
    rightPriceScale: { borderColor: '#374151' },
    timeScale: { borderColor: '#374151' },
    handleScroll: { vertTouchDrag: false },
  })
  series = chart.addLineSeries({ color: '#22c55e', lineWidth: 2, lineStyle: LineStyle.Solid })
  applyData()
  ro = new ResizeObserver(resize)
  ro.observe(container.value)
})

onUnmounted(() => {
  ro?.disconnect()
  ro = null
  chart?.remove()
  chart = null
  series = null
})

watch(() => [props.trades, props.startingEquity], applyData, { deep: true })
</script>

<template>
  <div ref="container" class="relative z-0 w-full overflow-hidden" style="height:200px" />
</template>
