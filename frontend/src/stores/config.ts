import { defineStore } from 'pinia'
import { ref } from 'vue'
import { configApi, type AppConfig } from '@/api/client'

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchConfig() {
    loading.value = true
    error.value = null
    try {
      config.value = await configApi.get()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function updateConfig(updates: Partial<AppConfig>) {
    loading.value = true
    error.value = null
    try {
      config.value = await configApi.update(updates)
      return true
    } catch (e: any) {
      error.value = e.response?.data?.error ?? e.message
      return false
    } finally {
      loading.value = false
    }
  }

  return { config, loading, error, fetchConfig, updateConfig }
})
