<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useConfigStore } from '@/stores/config'

defineProps<{ connected: boolean }>()

const route = useRoute()
const config = useConfigStore()
const tradingMode = computed(() => config.config?.tradingMode ?? 'paper')
const navItems = [
  { path: '/', icon: '📊', label: 'Dashboard' },
  { path: '/coins', icon: '🔍', label: 'Coin Scanner' },
  { path: '/trading', icon: '⚡', label: 'Trading' },
  { path: '/positions', icon: '📋', label: 'Positions' },
  { path: '/backtest', icon: '🧪', label: 'Backtest' },
  { path: '/backtest/results', icon: '📈', label: 'BT Results' },
  { path: '/strategies', icon: '🤖', label: 'Strategy Manager' },
  { path: '/strategies/results', icon: '🏆', label: 'Results' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
  { path: '/help', icon: '❓', label: 'Help' },
]
</script>

<template>
  <aside class="w-16 lg:w-56 flex flex-col bg-base-200 border-r border-base-300 min-h-screen">
    <!-- Logo -->
    <div class="p-3 lg:p-4 border-b border-base-300">
      <div class="flex items-center gap-2">
        <span class="text-2xl">🌙</span>
        <span class="hidden lg:block font-bold text-lg text-primary">Moonwalker</span>
      </div>
    </div>

    <!-- Nav Links -->
    <nav class="flex-1 p-2 space-y-1">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        :class="route.path === item.path
          ? 'bg-primary text-primary-content'
          : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'"
      >
        <span class="text-lg flex-shrink-0">{{ item.icon }}</span>
        <span class="hidden lg:block">{{ item.label }}</span>
      </router-link>
    </nav>

    <!-- WS Status -->
    <div class="p-3 border-t border-base-300 space-y-2">
      <div class="flex items-center gap-2">
        <span
          class="w-2 h-2 rounded-full flex-shrink-0"
          :class="connected ? 'bg-profit animate-pulse' : 'bg-loss'"
        />
        <span class="hidden lg:block text-xs text-base-content/50">
          {{ connected ? 'Feed live' : 'Offline' }}
        </span>
      </div>
      <router-link
        to="/settings"
        class="hidden lg:inline-flex badge badge-sm"
        :class="tradingMode === 'paper' ? 'badge-info' : 'badge-error'"
      >
        {{ tradingMode === 'paper' ? 'PAPER' : 'LIVE' }}
      </router-link>
    </div>
  </aside>
</template>
