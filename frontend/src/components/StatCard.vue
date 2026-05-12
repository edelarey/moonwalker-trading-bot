<script setup lang="ts">
defineProps<{
  title: string
  value: string | number
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: string
}>()
</script>

<template>
  <div class="card bg-base-200 border border-base-300">
    <div class="card-body p-4">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs text-base-content/50 font-medium uppercase tracking-wide">{{ title }}</p>
          <p
            class="text-2xl font-bold mt-1"
            :class="{
              'text-profit': trend === 'up',
              'text-loss': trend === 'down',
              'text-base-content': !trend || trend === 'neutral',
            }"
          >{{ value }}</p>
          <p v-if="subtitle" class="text-xs text-base-content/50 mt-1">{{ subtitle }}</p>
        </div>
        <span v-if="icon" class="text-3xl opacity-60">{{ icon }}</span>
      </div>
    </div>
  </div>
</template>
