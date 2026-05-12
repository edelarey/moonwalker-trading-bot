import { ref, onUnmounted } from 'vue'
import { useStrategiesStore } from '@/stores/strategies'

export type WsMessage =
  | { type: 'candle'; symbol: string; interval: string; candle: any; confirmed: boolean }
  | { type: 'breakout'; signal: any }
  | { type: 'retest'; signal: any }
  | { type: 'reversal'; signal: any }
  | { type: 'trade_opened'; trade: any }
  | { type: 'strategy_signal'; payload: any }

type MessageHandler = (msg: WsMessage) => void

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
          useStrategiesStore().addSignal(data.payload)
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
