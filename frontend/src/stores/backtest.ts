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

  async function fetchResults() {
    results.value = await backtestApi.results()
    if (results.value.length && !currentResult.value) {
      currentResult.value = results.value[0]
    }
  }

  return { results, currentResult, running, error, runBacktest, fetchResults }
})
