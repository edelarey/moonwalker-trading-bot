import { WebsocketClient } from 'bybit-api';
import { EventEmitter } from 'events';
import { logger } from '../logger';
import { Candle } from '../types';
import { resolveApiCredentials } from '../security/secrets';

export interface CandleUpdate {
  symbol: string;
  interval: string;
  candle: Candle;
  confirmed: boolean; // true = candle closed
}

class BybitWebSocketManager extends EventEmitter {
  private ws: WebsocketClient | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private subscribedIntervals: string[] = ['5', '15'];
  private symbolIntervals: Map<string, Set<string>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;

  connect(testnet?: boolean): void {
    if (this.ws) return;
    const creds = resolveApiCredentials();

    this.ws = new WebsocketClient({
      key: creds.apiKey,
      secret: creds.apiSecret,
      market: 'v5',
      testnet: testnet ?? creds.testnet,
    });

    this.ws.on('update', (data: any) => this.handleUpdate(data));

    this.ws.on('open', ({ wsKey }: any) => {
      logger.info('WebSocket connected', { wsKey });
      this.resubscribeAll();
    });

    this.ws.on('reconnected', ({ wsKey }: any) => {
      logger.info('WebSocket reconnected', { wsKey });
      this.resubscribeAll();
    });

    this.ws.on('error', (err: any) => {
      logger.error('WebSocket error', { err });
    });

    this.ws.on('close', () => {
      logger.warn('WebSocket closed');
    });

    logger.info('WebSocket manager initialized');
  }

  subscribeSymbols(symbols: string[], intervals: string[] = ['5', '15']): void {
    const ivs = [...new Set(intervals.filter(Boolean))];
    this.subscribedIntervals = [...new Set([...this.subscribedIntervals, ...ivs])];
    for (const symbol of symbols) {
      const existing = this.symbolIntervals.get(symbol) ?? new Set<string>();
      const fresh = ivs.filter(i => !existing.has(i));
      fresh.forEach(i => existing.add(i));
      this.symbolIntervals.set(symbol, existing);
      this.subscribedSymbols.add(symbol);
      if (this.ws && fresh.length) {
        this.ws.subscribeV5(fresh.map(iv => `kline.${iv}.${symbol}`), 'linear');
        logger.debug('Subscribed WS kline', { symbol, intervals: fresh });
      }
    }
    if (!this.ws) {
      logger.warn('WebSocket not connected — subscriptions queued until connect');
    }
  }

  unsubscribeSymbol(symbol: string): void {
    const ivs = this.symbolIntervals.get(symbol);
    this.subscribedSymbols.delete(symbol);
    this.symbolIntervals.delete(symbol);
    if (!this.ws || !ivs) return;
    this.ws.unsubscribeV5([...ivs].map(iv => `kline.${iv}.${symbol}`), 'linear');
  }

  private resubscribeAll(): void {
    if (!this.ws || this.symbolIntervals.size === 0) return;
    for (const [symbol, ivs] of this.symbolIntervals) {
      this.ws.subscribeV5([...ivs].map(iv => `kline.${iv}.${symbol}`), 'linear');
    }
  }

  private handleUpdate(data: any): void {
    if (!data.topic) return;
    // Topic format: kline.5.BTCUSDT or kline.15.BTCUSDT
    const match = data.topic.match(/^kline\.(\w+)\.(.+)$/);
    if (!match) return;

    const interval = match[1] as string;
    const symbol = match[2] as string;

    const items: any[] = data.data || [];
    for (const item of items) {
      const update: CandleUpdate = {
        symbol,
        interval,
        candle: {
          openTime: parseInt(item.start, 10),
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume),
        },
        confirmed: item.confirm === true,
      };
      this.emit('candle', update);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.closeAll();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
  }
}

export const wsManager = new BybitWebSocketManager();
