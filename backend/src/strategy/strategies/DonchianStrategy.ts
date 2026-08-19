/**
 * Donchian Channel breakout (Turtle-style).
 * Long when close breaks the N-period high; short on the N-period low.
 * Stops and targets are ATR multiples — same family as the Concretum crypto trend paper.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, DonchianParams } from '../../types';
import { atr, highest, lowest } from '../indicators';
import { runSignalBacktest } from '../backtestUtils';

export class DonchianStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: DonchianParams;
  private candles: Map<string, Candle[]> = new Map();
  private inPosition: Map<string, 'long' | 'short' | null> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as DonchianParams;
  }

  describe(): string {
    return `Donchian breakout: ${this.params.period}-bar channel, SL ${this.params.atrMultiplier}×ATR, TP ${this.params.takeProfitAtrMultiplier}×ATR.`;
  }

  defaultParams(): DonchianParams {
    return { period: 20, timeframe: '240', atrPeriod: 14, atrMultiplier: 2.5, takeProfitAtrMultiplier: 4 };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    const buf = this.candles.get(symbol) ?? [];
    buf.push(candle);
    if (buf.length > this.params.period + this.params.atrPeriod + 5) buf.shift();
    this.candles.set(symbol, buf);

    const highs = buf.map(c => c.high);
    const lows = buf.map(c => c.low);
    const upper = highest(highs, this.params.period, true);
    const lower = lowest(lows, this.params.period, true);
    const atrVal = atr(buf, this.params.atrPeriod);
    if (upper == null || lower == null || atrVal == null) return null;

    const pos = this.inPosition.get(symbol) ?? null;
    if (pos) {
      const entry = buf[buf.length - 2]?.close ?? candle.close;
      const sl = pos === 'long'
        ? entry - atrVal * this.params.atrMultiplier
        : entry + atrVal * this.params.atrMultiplier;
      const tp = pos === 'long'
        ? entry + atrVal * this.params.takeProfitAtrMultiplier
        : entry - atrVal * this.params.takeProfitAtrMultiplier;
      const hit = pos === 'long'
        ? candle.close <= sl || candle.close >= tp || candle.close < lower
        : candle.close >= sl || candle.close <= tp || candle.close > upper;
      if (hit) {
        this.inPosition.set(symbol, null);
        return { type: 'exit', symbol, price: candle.close, generatedAt: candle.openTime };
      }
      return null;
    }

    if (candle.close > upper) {
      this.inPosition.set(symbol, 'long');
      return {
        type: 'entry', direction: 'bullish', symbol, price: candle.close,
        stopLoss: candle.close - atrVal * this.params.atrMultiplier,
        takeProfit: candle.close + atrVal * this.params.takeProfitAtrMultiplier,
        metadata: { upper, lower, atr: atrVal },
        generatedAt: candle.openTime,
      };
    }
    if (candle.close < lower) {
      this.inPosition.set(symbol, 'short');
      return {
        type: 'entry', direction: 'bearish', symbol, price: candle.close,
        stopLoss: candle.close + atrVal * this.params.atrMultiplier,
        takeProfit: candle.close - atrVal * this.params.takeProfitAtrMultiplier,
        metadata: { upper, lower, atr: atrVal },
        generatedAt: candle.openTime,
      };
    }
    return null;
  }

  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as DonchianParams;
    return runSignalBacktest({
      strategyType: 'donchian',
      instance: this.instance,
      params,
      create: inst => new DonchianStrategy(inst),
      timeframe: p.timeframe || '60',
    });
  }
}
