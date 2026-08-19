/**
 * Bollinger Bands Strategy
 *
 * Two modes:
 * - breakout: Enter long when price closes above upper band + volume spike
 *             Enter short when price closes below lower band
 * - mean_reversion: Buy near lower band, sell near upper band
 *
 * Squeeze detection: when band width / price < squeezeThresholdPercent
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, BollingerParams } from '../../types';
import { logger } from '../../logger';
import { runSignalBacktest } from '../backtestUtils';

function bollingerBands(closes: number[], period: number, mult: number): { upper: number; middle: number; lower: number; width: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: mean + mult * sd, middle: mean, lower: mean - mult * sd, width: (2 * mult * sd) / mean };
}

export class BollingerStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: BollingerParams;
  private closes: Map<string, number[]> = new Map();
  private volumes: Map<string, number[]> = new Map();
  private inPosition: Map<string, 'long' | 'short' | null> = new Map();
  private entryPrice: Map<string, number> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as BollingerParams;
  }

  describe(): string { return `Bollinger Bands (${this.params.mode}): ${this.params.period}-period, ${this.params.stdDevMultiplier}σ.`; }
  defaultParams(): BollingerParams {
    return { period: 20, stdDevMultiplier: 2.0, timeframe: '240', mode: 'breakout', volumeConfirmMultiplier: 1.5, squeezeThresholdPercent: 2.0, stopLossPercent: 3, takeProfitPercent: 6, trailingStopPercent: 3 };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    const closes = this.closes.get(symbol) ?? [];
    const vols = this.volumes.get(symbol) ?? [];
    closes.push(candle.close); vols.push(candle.volume);
    if (closes.length > this.params.period + 10) { closes.shift(); vols.shift(); }
    this.closes.set(symbol, closes); this.volumes.set(symbol, vols);

    const bb = bollingerBands(closes, this.params.period, this.params.stdDevMultiplier);
    if (!bb) return null;

    const inPos = this.inPosition.get(symbol) ?? null;
    const entry = this.entryPrice.get(symbol) ?? 0;

    if (inPos) {
      const sl = inPos === 'long' ? entry * (1 - this.params.stopLossPercent / 100) : entry * (1 + this.params.stopLossPercent / 100);
      const tp = inPos === 'long' ? entry * (1 + this.params.takeProfitPercent / 100) : entry * (1 - this.params.takeProfitPercent / 100);
      const exitLong = inPos === 'long' && (candle.close <= sl || candle.close >= tp || (this.params.mode === 'mean_reversion' && candle.close >= bb.upper));
      const exitShort = inPos === 'short' && (candle.close >= sl || candle.close <= tp || (this.params.mode === 'mean_reversion' && candle.close <= bb.lower));
      if (exitLong || exitShort) {
        this.inPosition.set(symbol, null);
        return { type: 'exit', symbol, price: candle.close, metadata: { bb }, generatedAt: candle.openTime };
      }
      return null;
    }

    const avgVol = vols.slice(-20).reduce((a, b) => a + b, 0) / Math.min(vols.length, 20);
    const volOk = this.params.volumeConfirmMultiplier <= 1 || candle.volume >= avgVol * this.params.volumeConfirmMultiplier;

    if (this.params.mode === 'breakout') {
      if (candle.close > bb.upper && volOk) {
        this.inPosition.set(symbol, 'long'); this.entryPrice.set(symbol, candle.close);
        logger.debug('Bollinger breakout long', { symbol, close: candle.close, upper: bb.upper });
        return { type: 'entry', direction: 'bullish', symbol, price: candle.close, stopLoss: candle.close * (1 - this.params.stopLossPercent / 100), takeProfit: candle.close * (1 + this.params.takeProfitPercent / 100), metadata: { bb }, generatedAt: candle.openTime };
      }
      if (candle.close < bb.lower && volOk) {
        this.inPosition.set(symbol, 'short'); this.entryPrice.set(symbol, candle.close);
        return { type: 'entry', direction: 'bearish', symbol, price: candle.close, stopLoss: candle.close * (1 + this.params.stopLossPercent / 100), takeProfit: candle.close * (1 - this.params.takeProfitPercent / 100), metadata: { bb }, generatedAt: candle.openTime };
      }
    } else { // mean_reversion
      if (candle.close <= bb.lower) {
        this.inPosition.set(symbol, 'long'); this.entryPrice.set(symbol, candle.close);
        return { type: 'entry', direction: 'bullish', symbol, price: candle.close, stopLoss: candle.close * (1 - this.params.stopLossPercent / 100), takeProfit: bb.upper, metadata: { bb }, generatedAt: candle.openTime };
      }
    }
    return null;
  }

  clearPosition(symbol: string): void {
    this.inPosition.set(symbol, null);
  }

  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as BollingerParams;
    return runSignalBacktest({
      strategyType: 'bollinger',
      instance: this.instance,
      params,
      create: inst => new BollingerStrategy(inst),
      timeframe: String(p.timeframe || '240'),
    });
  }
}
