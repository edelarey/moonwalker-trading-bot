<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { createChart, type IChartApi, type ISeriesApi, CandlestickSeries } from 'lightweight-charts'

export interface OhlcBar { time: number; open: number; high: number; low: number; close: number }

const props = defineProps<{ data: OhlcBar[]; symbol?: string }>()
const container = ref<HTMLDivElement | null>(null)
let chart: IChartApi | null = null
let series: ISeriesApi<'Candlestick'> | null = null

function initChart() {
  if (!container.value) return
  chart = createChart(container.value, {
    layout: { background: { color: 'transparent' }, textColor: '#9ca3af' },
    grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
    width: container.value.clientWidth,
    height: 300,
    rightPriceScale: { borderColor: '#374151' },
    timeScale: { borderColor: '#374151' },
  })
  series = chart.addCandlestickSeries({
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderUpColor: '#22c55e',
    borderDownColor: '#ef4444',
    wickUpColor: '#22c55e',
    wickDownColor: '#ef4444',
  })
  series.setData(props.data as any)
}

onMounted(initChart)
onUnmounted(() => chart?.remove())

watch(() => props.data, (d) => {
  if (series) series.setData(d as any)
}, { deep: true })
</script>

<template>
  <div ref="container" class="w-full" style="height:300px" />
</template>
