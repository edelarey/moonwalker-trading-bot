/**
 * Keltner Channel: EMA midline ± ATR × multiplier.
 * breakout — close outside the band, ATR stop/target.
 * mean_reversion — fade the band, target the midline.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, KeltnerParams } from '../../types';
import { atr, ema } from '../indicators';
import { runSignalBacktest } from '../backtestUtils';

export class KeltnerStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: KeltnerParams;
  private candles: Map<string, Candle[]> = new Map();
  private inPosition: Map<string, 'long' | 'short' | null> = new Map();
  private entryPrice: Map<string, number> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as KeltnerParams;
  }

  describe(): string {
    return `Keltner (${this.params.mode}): EMA(${this.params.emaPeriod}) ± ${this.params.multiplier}×ATR(${this.params.atrPeriod}).`;
  }

  defaultParams(): KeltnerParams {
    return {
      emaPeriod: 20,
      atrPeriod: 10,
      multiplier: 1.5,
      mode: 'breakout',
      atrStopMultiplier: 2,
      takeProfitAtrMultiplier: 3,
      timeframe: '60',
    };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    const need = Math.max(this.params.emaPeriod, this.params.atrPeriod) + 8;
    const buf = this.candles.get(symbol) ?? [];
    buf.push(candle);
    if (buf.length > need + 20) buf.shift();
    this.candles.set(symbol, buf);

    const mid = ema(buf.map(c => c.close), this.params.emaPeriod);
    const atrVal = atr(buf, this.params.atrPeriod);
    if (mid == null || atrVal == null) return null;

    const width = this.params.multiplier * atrVal;
    const upper = mid + width;
    const lower = mid - width;
    const pos = this.inPosition.get(symbol) ?? null;
    const entry = this.entryPrice.get(symbol) ?? candle.close;
    const slDist = atrVal * this.params.atrStopMultiplier;
    const tpDist = atrVal * this.params.takeProfitAtrMultiplier;
    const fade = this.params.mode === 'mean_reversion';

    if (pos) {
      const sl = pos === 'long' ? entry - slDist : entry + slDist;
      const tp = fade
        ? mid
        : (pos === 'long' ? entry + tpDist : entry - tpDist);
      const stopHit = pos === 'long'
        ? candle.close <= sl || candle.close >= tp
        : candle.close >= sl || candle.close <= tp;
      const midExit = !fade && (
        (pos === 'long' && candle.close < mid) || (pos === 'short' && candle.close > mid)
      );
      if (stopHit || midExit) {
        this.inPosition.set(symbol, null);
        return {
          type: 'exit',
          symbol,
          price: candle.close,
          metadata: { mid, upper, lower, atr: atrVal, reason: midExit ? 'mid' : 'stop' },
          generatedAt: candle.openTime,
        };
      }
      return null;
    }

    if (fade) {
      if (candle.close <= lower) {
        this.inPosition.set(symbol, 'long');
        this.entryPrice.set(symbol, candle.close);
        return {
          type: 'entry',
          direction: 'bullish',
          symbol,
          price: candle.close,
          stopLoss: candle.close - slDist,
          takeProfit: mid,
          metadata: { mid, upper, lower, atr: atrVal },
          generatedAt: candle.openTime,
        };
      }
      if (candle.close >= upper) {
        this.inPosition.set(symbol, 'short');
        this.entryPrice.set(symbol, candle.close);
        return {
          type: 'entry',
          direction: 'bearish',
          symbol,
          price: candle.close,
          stopLoss: candle.close + slDist,
          takeProfit: mid,
          metadata: { mid, upper, lower, atr: atrVal },
          generatedAt: candle.openTime,
        };
      }
      return null;
    }

    if (candle.close > upper) {
      this.inPosition.set(symbol, 'long');
      this.entryPrice.set(symbol, candle.close);
      return {
        type: 'entry',
        direction: 'bullish',
        symbol,
        price: candle.close,
        stopLoss: candle.close - slDist,
        takeProfit: candle.close + tpDist,
        metadata: { mid, upper, lower, atr: atrVal },
        generatedAt: candle.openTime,
      };
    }
    if (candle.close < lower) {
      this.inPosition.set(symbol, 'short');
      this.entryPrice.set(symbol, candle.close);
      return {
        type: 'entry',
        direction: 'bearish',
        symbol,
        price: candle.close,
        stopLoss: candle.close + slDist,
        takeProfit: candle.close - tpDist,
        metadata: { mid, upper, lower, atr: atrVal },
        generatedAt: candle.openTime,
      };
    }
    return null;
  }

  clearPosition(symbol: string): void {
    this.inPosition.set(symbol, null);
  }

  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as KeltnerParams;
    return runSignalBacktest({
      strategyType: 'keltner',
      instance: this.instance,
      params,
      create: inst => new KeltnerStrategy(inst),
      timeframe: p.timeframe || '60',
    });
  }
}
