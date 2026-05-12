import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import CoinScanner from '@/views/CoinScanner.vue'
import LiveTrading from '@/views/LiveTrading.vue'
import Positions from '@/views/Positions.vue'
import Backtest from '@/views/Backtest.vue'
import BacktestResults from '@/views/BacktestResults.vue'
import Settings from '@/views/Settings.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Dashboard, meta: { title: 'Dashboard' } },
    { path: '/coins', component: CoinScanner, meta: { title: 'Coin Scanner' } },
    { path: '/trading', component: LiveTrading, meta: { title: 'Live Trading' } },
    { path: '/positions', component: Positions, meta: { title: 'Positions' } },
    { path: '/backtest', component: Backtest, meta: { title: 'Backtest' } },
    { path: '/backtest/results', component: BacktestResults, meta: { title: 'Backtest Results' } },
    { path: '/settings', component: Settings, meta: { title: 'Settings' } },
    { path: '/help', component: () => import('@/views/Help.vue'), meta: { title: 'Help' } },
    { path: '/strategies', component: () => import('@/views/StrategyManager.vue'), meta: { title: 'Strategy Manager' } },
    { path: '/strategies/results', component: () => import('@/views/StrategyResults.vue'), meta: { title: 'Strategy Results' } },
  ],
})

export default router
