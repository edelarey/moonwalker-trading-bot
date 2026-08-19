/**
 * RSI Mean-Reversion Strategy
 *
 * Core logic:
 * - Long entry: RSI < oversoldThreshold (price oversold)
 * - Exit: RSI > overboughtThreshold OR take-profit/stop-loss hit
 * - Optional MA filter: only enter longs when price > MA
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, RSIParams } from '../../types';
import { logger } from '../../logger';
import { runSignalBacktest } from '../backtestUtils';

function rsi(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(-(period + 1)).map((v, i, a) => i === 0 ? 0 : v - a[i - 1]).slice(1);
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(Math.abs);
  const ag = gains.reduce((a, b) => a + b, 0) / period;
  const al = losses.reduce((a, b) => a + b, 0) / period;
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export class RSIStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: RSIParams;
  private closes: Map<string, number[]> = new Map();
  private inPosition: Map<string, boolean> = new Map();
  private entryPrice: Map<string, number> = new Map();
  private belowThresholdCount: Map<string, number> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as RSIParams;
  }

  describe(): string { return `RSI Mean-Reversion: Buy when RSI < ${this.params.oversoldThreshold}, sell when RSI > ${this.params.overboughtThreshold}.`; }
  defaultParams(): RSIParams {
    return { period: 14, oversoldThreshold: 20, overboughtThreshold: 80, timeframe: '60', confirmationCandles: 2, stopLossPercent: 2.5, takeProfitPercent: 5 };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    const closes = this.closes.get(symbol) ?? [];
    closes.push(candle.close);
    if (closes.length > this.params.period + 20) closes.shift();
    this.closes.set(symbol, closes);

    const rsiVal = rsi(closes, this.params.period);
    if (rsiVal === null) return null;

    const inPos = this.inPosition.get(symbol) ?? false;
    const entry = this.entryPrice.get(symbol) ?? 0;

    if (inPos) {
      const sl = entry * (1 - this.params.stopLossPercent / 100);
      const tp = entry * (1 + this.params.takeProfitPercent / 100);
      if (candle.close <= sl || candle.close >= tp || rsiVal >= this.params.overboughtThreshold) {
        this.inPosition.set(symbol, false);
        return { type: 'exit', symbol, price: candle.close, metadata: { rsi: rsiVal }, generatedAt: candle.openTime };
      }
      return null;
    }

    if (rsiVal < this.params.oversoldThreshold) {
      const count = (this.belowThresholdCount.get(symbol) ?? 0) + 1;
      this.belowThresholdCount.set(symbol, count);
      if (count >= this.params.confirmationCandles) {
        this.belowThresholdCount.set(symbol, 0);
        const ma = this.params.maFilterPeriod ? sma(closes, this.params.maFilterPeriod) : null;
        if (ma !== null && candle.close < ma) return null; // filter: price must be above MA for longs
        this.inPosition.set(symbol, true);
        this.entryPrice.set(symbol, candle.close);
        logger.debug('RSI oversold entry', { symbol, rsi: rsiVal });
        return {
          type: 'entry', direction: 'bullish', symbol, price: candle.close,
          stopLoss: candle.close * (1 - this.params.stopLossPercent / 100),
          takeProfit: candle.close * (1 + this.params.takeProfitPercent / 100),
          metadata: { rsi: rsiVal }, generatedAt: candle.openTime,
        };
      }
    } else {
      this.belowThresholdCount.set(symbol, 0);
    }
    return null;
  }

  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as RSIParams;
    return runSignalBacktest({
      strategyType: 'rsi',
      instance: this.instance,
      params,
      create: inst => new RSIStrategy(inst),
      timeframe: String(p.timeframe || '60'),
    });
  }
}
