/**
 * Moving Average Crossover Strategy
 *
 * Core logic:
 * - Calculate short MA and long MA on incoming candles
 * - Long entry: short MA crosses above long MA (golden cross)
 * - Exit: short MA crosses below long MA (death cross)
 * - Optional RSI confirmation filter
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, MACrossoverParams } from '../../types';
import { logger } from '../../logger';
import { runSignalBacktest } from '../backtestUtils';

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(-period - 1).map((v, i, a) => i === 0 ? 0 : v - a[i - 1]).slice(1);
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(Math.abs);
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export class MACrossoverStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: MACrossoverParams;
  private closes: Map<string, number[]> = new Map();
  private inPosition: Map<string, boolean> = new Map();
  private prevShortAboveLong: Map<string, boolean | null> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as MACrossoverParams;
  }

  describe(): string { return `MA Crossover: Golden cross (${this.params.shortPeriod}/${this.params.longPeriod}) entry, death cross exit.`; }
  defaultParams(): MACrossoverParams {
    return { shortPeriod: 20, longPeriod: 50, timeframe: '240', stopLossPercent: 3, takeProfitPercent: 8, trailingStopPercent: 4 };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    const closes = this.closes.get(symbol) ?? [];
    closes.push(candle.close);
    if (closes.length > this.params.longPeriod + 10) closes.shift();
    this.closes.set(symbol, closes);

    const shortMA = sma(closes, this.params.shortPeriod);
    const longMA = sma(closes, this.params.longPeriod);
    if (shortMA === null || longMA === null) return null;

    const shortAboveLong = shortMA > longMA;
    const prev = this.prevShortAboveLong.get(symbol) ?? null;
    this.prevShortAboveLong.set(symbol, shortAboveLong);
    const inPos = this.inPosition.get(symbol) ?? false;

    // Golden cross — entry
    if (!inPos && prev === false && shortAboveLong) {
      const rsiVal = this.params.rsiConfirmPeriod ? rsi(closes, this.params.rsiConfirmPeriod) : null;
      if (rsiVal !== null && this.params.rsiLongMin && rsiVal < this.params.rsiLongMin) return null;
      this.inPosition.set(symbol, true);
      logger.debug('MA golden cross', { symbol, shortMA, longMA });
      return {
        type: 'entry', direction: 'bullish', symbol, price: candle.close,
        stopLoss: candle.close * (1 - this.params.stopLossPercent / 100),
        takeProfit: candle.close * (1 + this.params.takeProfitPercent / 100),
        metadata: { shortMA, longMA }, generatedAt: candle.openTime,
      };
    }

    // Death cross — exit
    if (inPos && prev === true && !shortAboveLong) {
      this.inPosition.set(symbol, false);
      return { type: 'exit', symbol, price: candle.close, metadata: { shortMA, longMA }, generatedAt: candle.openTime };
    }

    return null;
  }

  clearPosition(symbol: string): void {
    this.inPosition.set(symbol, false);
  }

  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as MACrossoverParams;
    return runSignalBacktest({
      strategyType: 'ma_crossover',
      instance: this.instance,
      params,
      create: inst => new MACrossoverStrategy(inst),
      timeframe: String(p.timeframe || '240'),
    });
  }
}
