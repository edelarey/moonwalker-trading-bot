/**
 * Supertrend flip: ATR trailing band. Enter on direction change, exit on the opposite flip.
 * Widely used on crypto perps because it stays in a move until ATR says the trend is over.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, SupertrendParams } from '../../types';
import { atr } from '../indicators';
import { runSignalBacktest } from '../backtestUtils';

export class SupertrendStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: SupertrendParams;
  private candles: Map<string, Candle[]> = new Map();
  private finalUpper: Map<string, number> = new Map();
  private finalLower: Map<string, number> = new Map();
  private trend: Map<string, 1 | -1> = new Map();
  private inPosition: Map<string, boolean> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as SupertrendParams;
  }

  describe(): string {
    return `Supertrend: ATR(${this.params.atrPeriod}) × ${this.params.multiplier}. Enter/exit on band flips.`;
  }

  defaultParams(): SupertrendParams {
    return { atrPeriod: 10, multiplier: 2, timeframe: '15' };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (interval !== this.params.timeframe) return null;
    const buf = this.candles.get(symbol) ?? [];
    buf.push(candle);
    if (buf.length > this.params.atrPeriod + 50) buf.shift();
    this.candles.set(symbol, buf);

    const atrVal = atr(buf, this.params.atrPeriod);
    if (atrVal == null) return null;

    const src = (candle.high + candle.low) / 2;
    const basicUpper = src + this.params.multiplier * atrVal;
    const basicLower = src - this.params.multiplier * atrVal;
    const prevClose = buf.length >= 2 ? buf[buf.length - 2].close : candle.close;
    const prevFU = this.finalUpper.get(symbol) ?? basicUpper;
    const prevFL = this.finalLower.get(symbol) ?? basicLower;

    const fu = (basicUpper < prevFU || prevClose > prevFU) ? basicUpper : prevFU;
    const fl = (basicLower > prevFL || prevClose < prevFL) ? basicLower : prevFL;
    this.finalUpper.set(symbol, fu);
    this.finalLower.set(symbol, fl);

    const prevTrend = this.trend.get(symbol) ?? 1;
    let trend: 1 | -1 = prevTrend;
    if (prevTrend === 1) trend = candle.close < fl ? -1 : 1;
    else trend = candle.close > fu ? 1 : -1;
    this.trend.set(symbol, trend);

    const flipped = trend !== prevTrend;
    const inPos = this.inPosition.get(symbol) ?? false;

    if (inPos && flipped) {
      this.inPosition.set(symbol, false);
      return {
        type: 'exit',
        symbol,
        price: candle.close,
        metadata: { trend, atr: atrVal, supertrend: trend === 1 ? fl : fu },
        generatedAt: candle.openTime,
      };
    }

    if (!inPos && flipped) {
      this.inPosition.set(symbol, true);
      const long = trend === 1;
      const band = long ? fl : fu;
      return {
        type: 'entry',
        direction: long ? 'bullish' : 'bearish',
        symbol,
        price: candle.close,
        stopLoss: band,
        takeProfit: long
          ? candle.close + (candle.close - band) * 2
          : candle.close - (band - candle.close) * 2,
        metadata: { trend, atr: atrVal, supertrend: band },
        generatedAt: candle.openTime,
      };
    }

    return null;
  }

  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as SupertrendParams;
    return runSignalBacktest({
      strategyType: 'supertrend',
      instance: this.instance,
      params,
      create: inst => new SupertrendStrategy(inst),
      timeframe: p.timeframe || '15',
    });
  }
}
