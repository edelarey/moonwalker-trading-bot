import { ref, onUnmounted } from 'vue'
import { useStrategiesStore } from '@/stores/strategies'

export type WsMessage =
  | { type: 'candle'; symbol: string; interval: string; candle: any; confirmed: boolean }
  | { type: 'breakout'; signal: any }
  | { type: 'retest'; signal: any }
  | { type: 'reversal'; signal: any }
  | { type: 'trade_opened'; trade: any }
  | { type: 'trade_closed'; trade: any }
  | { type: 'paper_account'; account: any }
  | { type: 'strategy_signal'; strategyId?: string; strategyName?: string; signal?: any; payload?: any }

type MessageHandler = (msg: WsMessage) => void

function mapSignalAction(sig: any): 'buy' | 'sell' | 'hold' {
  if (!sig) return 'hold'
  if (sig.type === 'entry') return sig.direction === 'bearish' ? 'sell' : 'buy'
  if (sig.type === 'exit') return 'sell'
  if (sig.signal === 'buy' || sig.signal === 'sell' || sig.signal === 'hold') return sig.signal
  return 'hold'
}

export function useWebSocket(onMessage: MessageHandler) {
  const connected = ref(false)
  let ws: WebSocket | null = null
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  function connect() {
    if (destroyed) return
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${protocol}://${window.location.host}/ws`)

    ws.onopen = () => { connected.value = true }
    ws.onclose = () => {
      connected.value = false
      if (!destroyed) reconnectTimeout = setTimeout(connect, 3000)
    }
    ws.onerror = () => { ws?.close() }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as WsMessage
        if (data.type === 'strategy_signal') {
          const raw = data.signal ?? data.payload ?? {}
          const inner = raw.signal ?? raw
          useStrategiesStore().addSignal({
            strategyId: data.strategyId ?? raw.strategyId ?? '',
            strategyName: data.strategyName ?? raw.strategyName ?? data.strategyId ?? '',
            symbol: inner.symbol ?? '',
            signal: mapSignalAction(inner),
            price: inner.price ?? 0,
            timestamp: new Date(inner.generatedAt ?? Date.now()).toISOString(),
            metadata: inner.metadata ?? {},
          })
        }
        onMessage(data)
      } catch { /* ignore malformed */ }
    }
  }

  connect()

  onUnmounted(() => {
    destroyed = true
    if (reconnectTimeout) clearTimeout(reconnectTimeout)
    ws?.close()
  })

  return { connected }
}
