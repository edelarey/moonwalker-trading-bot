import { WebsocketClient } from 'bybit-api';
import { EventEmitter } from 'events';
import { env } from '../config';
import { logger } from '../logger';
import { Candle } from '../types';

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
  private reconnectTimer: NodeJS.Timeout | null = null;

  connect(testnet: boolean = env.BYBIT_TESTNET): void {
    if (this.ws) return;

    this.ws = new WebsocketClient({
      key: env.BYBIT_API_KEY,
      secret: env.BYBIT_API_SECRET,
      market: 'v5',
      testnet,
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
    if (!this.ws) {
      logger.warn('WebSocket not connected — call connect() first');
      return;
    }
    this.subscribedIntervals = intervals;
    for (const symbol of symbols) {
      if (this.subscribedSymbols.has(symbol)) continue;
      this.subscribedSymbols.add(symbol);
      this.ws!.subscribeV5(
        intervals.flatMap(iv => [`kline.${iv}.${symbol}`]),
        'linear'
      );
      logger.debug('Subscribed WS kline', { symbol, intervals });
    }
  }

  unsubscribeSymbol(symbol: string): void {
    if (!this.ws || !this.subscribedSymbols.has(symbol)) return;
    this.subscribedSymbols.delete(symbol);
    this.ws.unsubscribeV5(
      this.subscribedIntervals.map(iv => `kline.${iv}.${symbol}`),
      'linear'
    );
  }

  private resubscribeAll(): void {
    if (!this.ws || this.subscribedSymbols.size === 0) return;
    const topics = Array.from(this.subscribedSymbols).flatMap(s =>
      this.subscribedIntervals.map(iv => `kline.${iv}.${s}`)
    );
    this.ws!.subscribeV5(topics, 'linear');
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
