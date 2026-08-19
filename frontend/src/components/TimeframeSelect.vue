<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string | number | null | undefined
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const OPTIONS = [
  { value: '1', label: '1m' },
  { value: '3', label: '3m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
  { value: '120', label: '2h' },
  { value: '240', label: '4h' },
  { value: 'D', label: '1D' },
]

const ALIAS: Record<string, string> = {
  '1': '1', '1m': '1',
  '3': '3', '3m': '3',
  '5': '5', '5m': '5',
  '15': '15', '15m': '15',
  '30': '30', '30m': '30',
  '60': '60', '1h': '60', '60m': '60',
  '120': '120', '2h': '120',
  '240': '240', '4h': '240',
  d: 'D', '1d': 'D', '1D': 'D', D: 'D',
}

function canon(raw: unknown): string {
  if (raw == null || raw === '') return ''
  const v = String(raw).trim()
  return ALIAS[v] ?? ALIAS[v.toLowerCase()] ?? v
}

const current = computed({
  get: () => canon(props.modelValue),
  set: (v: string) => emit('update:modelValue', v),
})

const options = computed(() => {
  const cur = current.value
  if (cur && !OPTIONS.some(o => o.value === cur)) {
    return [...OPTIONS, { value: cur, label: cur }]
  }
  return OPTIONS
})
</script>

<template>
  <select class="select select-bordered select-readable w-full" v-model="current">
    <option disabled value="">Select timeframe</option>
    <option v-for="tf in options" :key="tf.value" :value="tf.value">{{ tf.label }}</option>
  </select>
</template>
