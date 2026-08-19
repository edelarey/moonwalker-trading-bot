<script setup lang="ts">
import { ref, watch } from 'vue'
import { isoToDmy, parseToIso } from '@/lib/dateFormat'

const props = withDefaults(defineProps<{
  modelValue: string
  size?: 'sm' | 'xs'
}>(), { size: 'sm' })

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const text = ref(isoToDmy(props.modelValue))
const pickerEl = ref<HTMLInputElement | null>(null)

watch(() => props.modelValue, (iso) => {
  const next = isoToDmy(iso)
  if (parseToIso(text.value) !== parseToIso(iso)) text.value = next
})

function commit(): void {
  const trimmed = text.value.trim()
  if (!trimmed) {
    emit('update:modelValue', '')
    return
  }
  const iso = parseToIso(trimmed)
  if (iso) {
    text.value = isoToDmy(iso)
    emit('update:modelValue', iso)
  }
}

function onPicker(event: Event): void {
  const iso = (event.target as HTMLInputElement).value
  if (!iso) return
  text.value = isoToDmy(iso)
  emit('update:modelValue', iso)
}

function openPicker(): void {
  const el = pickerEl.value
  if (!el) return
  try {
    if (typeof el.showPicker === 'function') {
      el.showPicker()
      return
    }
  } catch {
    /* fall through */
  }
  el.click()
}

const compact = props.size === 'xs'
</script>

<template>
  <!-- Fixed width so the native picker anchors under the field, not off the right edge. -->
  <div
    class="relative inline-flex items-center"
    :class="compact ? 'w-[10.75rem]' : 'w-[12rem]'"
  >
    <input
      type="text"
      inputmode="numeric"
      autocomplete="off"
      placeholder="dd-mm-YYYY"
      class="input input-bordered font-mono w-full pr-9"
      :class="compact ? 'input-xs' : ''"
      v-model="text"
      @blur="commit"
      @keydown.enter.prevent="commit"
    />
    <input
      ref="pickerEl"
      type="date"
      lang="en-GB"
      tabindex="-1"
      class="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      :value="parseToIso(modelValue)"
      @input="onPicker"
    />
    <button
      type="button"
      class="btn btn-ghost absolute right-0 top-0 bottom-0 min-h-0 h-full px-2"
      :class="compact ? 'btn-xs' : 'btn-sm'"
      title="Pick a date"
      @click="openPicker"
    >
      <span aria-hidden="true">📅</span>
    </button>
  </div>
</template>
