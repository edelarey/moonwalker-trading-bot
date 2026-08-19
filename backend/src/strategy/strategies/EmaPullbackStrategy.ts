/**
 * EMA pullback: trade with the 9/21 EMA trend, enter when price tags the fast EMA and closes back in-trend.
 * More selective than a raw golden-cross, which is the usual scalper setup on crypto perps.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, EmaPullbackParams } from '../../types';
import { ema } from '../indicators';
import { runSignalBacktest } from '../backtestUtils';

export class EmaPullbackStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: EmaPullbackParams;
  private closes: Map<string, number[]> = new Map();
  private inPosition: Map<string, 'long' | 'short' | null> = new Map();
  private entry: Map<string, number> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as EmaPullbackParams;
  }

  describe(): string {
    return `EMA pullback: long/short with ${this.params.fastPeriod}/${this.params.slowPeriod} trend after a tap of the fast EMA.`;
  }

  defaultParams(): EmaPullbackParams {
    return { fastPeriod: 9, slowPeriod: 21, timeframe: '15', stopLossPercent: 2, takeProfitPercent: 4 };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    const closes = this.closes.get(symbol) ?? [];
    closes.push(candle.close);
    if (closes.length > this.params.slowPeriod + 30) closes.shift();
    this.closes.set(symbol, closes);

    const fast = ema(closes, this.params.fastPeriod);
    const slow = ema(closes, this.params.slowPeriod);
    if (fast == null || slow == null) return null;

    const pos = this.inPosition.get(symbol) ?? null;
    const entryPx = this.entry.get(symbol) ?? candle.close;

    if (pos) {
      const sl = pos === 'long'
        ? entryPx * (1 - this.params.stopLossPercent / 100)
        : entryPx * (1 + this.params.stopLossPercent / 100);
      const tp = pos === 'long'
        ? entryPx * (1 + this.params.takeProfitPercent / 100)
        : entryPx * (1 - this.params.takeProfitPercent / 100);
      const trendBroke = pos === 'long' ? fast < slow : fast > slow;
      const hit = pos === 'long'
        ? candle.close <= sl || candle.close >= tp || trendBroke
        : candle.close >= sl || candle.close <= tp || trendBroke;
      if (hit) {
        this.inPosition.set(symbol, null);
        return { type: 'exit', symbol, price: candle.close, metadata: { fast, slow }, generatedAt: candle.openTime };
      }
      return null;
    }

    const uptrend = fast > slow;
    const downtrend = fast < slow;
    const longSetup = uptrend && candle.low <= fast && candle.close > fast;
    const shortSetup = downtrend && candle.high >= fast && candle.close < fast;

    if (longSetup) {
      this.inPosition.set(symbol, 'long');
      this.entry.set(symbol, candle.close);
      return {
        type: 'entry', direction: 'bullish', symbol, price: candle.close,
        stopLoss: candle.close * (1 - this.params.stopLossPercent / 100),
        takeProfit: candle.close * (1 + this.params.takeProfitPercent / 100),
        metadata: { fast, slow },
        generatedAt: candle.openTime,
      };
    }
    if (shortSetup) {
      this.inPosition.set(symbol, 'short');
      this.entry.set(symbol, candle.close);
      return {
        type: 'entry', direction: 'bearish', symbol, price: candle.close,
        stopLoss: candle.close * (1 + this.params.stopLossPercent / 100),
        takeProfit: candle.close * (1 - this.params.takeProfitPercent / 100),
        metadata: { fast, slow },
        generatedAt: candle.openTime,
      };
    }
    return null;
  }

  clearPosition(symbol: string): void {
    this.inPosition.set(symbol, null);
  }

  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as EmaPullbackParams;
    return runSignalBacktest({
      strategyType: 'ema_pullback',
      instance: this.instance,
      params,
      create: inst => new EmaPullbackStrategy(inst),
      timeframe: p.timeframe || '15',
    });
  }
}
