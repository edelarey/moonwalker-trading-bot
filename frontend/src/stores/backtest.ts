import { defineStore } from 'pinia'
import { ref } from 'vue'
import { backtestApi, type BacktestResult, type BacktestParams } from '@/api/client'

export const useBacktestStore = defineStore('backtest', () => {
  const results = ref<BacktestResult[]>([])
  const currentResult = ref<BacktestResult | null>(null)
  const running = ref(false)
  const error = ref<string | null>(null)

  async function runBacktest(params: BacktestParams) {
    running.value = true
    error.value = null
    try {
      const result = await backtestApi.run(params)
      currentResult.value = result
      results.value.unshift(result)
      return result
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      running.value = false
    }
  }

  function syncCurrent(): void {
    const still = results.value.find(r => r.id && r.id === currentResult.value?.id)
    currentResult.value = still ?? results.value[0] ?? null
  }

  async function fetchResults() {
    try {
      const list = await backtestApi.results()
      results.value = Array.isArray(list) ? list : []
    } catch (e: any) {
      error.value = e?.message ?? 'Failed to load backtests'
      results.value = []
    }
    syncCurrent()
  }

  async function clearAll() {
    await backtestApi.clear()
    results.value = []
    currentResult.value = null
  }

  async function removeOne(id: string) {
    await backtestApi.remove(id)
    results.value = results.value.filter(r => r.id !== id)
    syncCurrent()
  }

  function selectLatest(): void {
    currentResult.value = results.value[0] ?? null
  }

  return { results, currentResult, running, error, runBacktest, fetchResults, clearAll, removeOne, selectLatest }
})
