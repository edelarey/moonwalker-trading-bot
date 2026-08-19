/**
 * ADX + DI with ATR stops.
 * Trade only when ADX says a trend exists; direction from +DI / −DI cross.
 * Stops and targets are ATR multiples. Fully tradeable as a Bybit USDT perp.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, AdxDiParams } from '../../types';
import { adx, atr } from '../indicators';
import { runSignalBacktest } from '../backtestUtils';

export class AdxDiStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: AdxDiParams;
  private candles: Map<string, Candle[]> = new Map();
  private inPosition: Map<string, 'long' | 'short' | null> = new Map();
  private entryPrice: Map<string, number> = new Map();
  private prevPlusAbove: Map<string, boolean | null> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as AdxDiParams;
  }

  describe(): string {
    return `ADX+DI: ADX(${this.params.adxPeriod}) ≥ ${this.params.adxMin}, SL ${this.params.atrMultiplier}×ATR, TP ${this.params.takeProfitAtrMultiplier}×ATR.`;
  }

  defaultParams(): AdxDiParams {
    return {
      adxPeriod: 14,
      adxMin: 25,
      atrPeriod: 14,
      atrMultiplier: 2,
      takeProfitAtrMultiplier: 3,
      timeframe: '60',
    };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    const need = Math.max(this.params.adxPeriod * 3 + 8, this.params.atrPeriod + 5);
    const buf = this.candles.get(symbol) ?? [];
    buf.push(candle);
    if (buf.length > need + 20) buf.shift();
    this.candles.set(symbol, buf);

    const snap = adx(buf, this.params.adxPeriod);
    const atrVal = atr(buf, this.params.atrPeriod);
    if (snap == null || atrVal == null) return null;

    const plusAbove = snap.plusDI > snap.minusDI;
    const prev = this.prevPlusAbove.get(symbol) ?? null;
    this.prevPlusAbove.set(symbol, plusAbove);

    const pos = this.inPosition.get(symbol) ?? null;
    const entry = this.entryPrice.get(symbol) ?? candle.close;
    const slDist = atrVal * this.params.atrMultiplier;
    const tpDist = atrVal * this.params.takeProfitAtrMultiplier;

    if (pos) {
      const sl = pos === 'long' ? entry - slDist : entry + slDist;
      const tp = pos === 'long' ? entry + tpDist : entry - tpDist;
      const stopHit = pos === 'long'
        ? candle.close <= sl || candle.close >= tp
        : candle.close >= sl || candle.close <= tp;
      const flipped = prev != null && (
        (pos === 'long' && !plusAbove && prev === true)
        || (pos === 'short' && plusAbove && prev === false)
      );
      if (stopHit || flipped) {
        this.inPosition.set(symbol, null);
        return {
          type: 'exit',
          symbol,
          price: candle.close,
          metadata: { adx: snap.adx, plusDI: snap.plusDI, minusDI: snap.minusDI, atr: atrVal, reason: flipped ? 'di_cross' : 'stop' },
          generatedAt: candle.openTime,
        };
      }
      return null;
    }

    if (prev == null || snap.adx < this.params.adxMin) return null;

    if (!prev && plusAbove) {
      this.inPosition.set(symbol, 'long');
      this.entryPrice.set(symbol, candle.close);
      return {
        type: 'entry',
        direction: 'bullish',
        symbol,
        price: candle.close,
        stopLoss: candle.close - slDist,
        takeProfit: candle.close + tpDist,
        metadata: { adx: snap.adx, plusDI: snap.plusDI, minusDI: snap.minusDI, atr: atrVal },
        generatedAt: candle.openTime,
      };
    }
    if (prev && !plusAbove) {
      this.inPosition.set(symbol, 'short');
      this.entryPrice.set(symbol, candle.close);
      return {
        type: 'entry',
        direction: 'bearish',
        symbol,
        price: candle.close,
        stopLoss: candle.close + slDist,
        takeProfit: candle.close - tpDist,
        metadata: { adx: snap.adx, plusDI: snap.plusDI, minusDI: snap.minusDI, atr: atrVal },
        generatedAt: candle.openTime,
      };
    }
    return null;
  }

  clearPosition(symbol: string): void {
    this.inPosition.set(symbol, null);
  }

  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as AdxDiParams;
    return runSignalBacktest({
      strategyType: 'adx_di',
      instance: this.instance,
      params,
      create: inst => new AdxDiStrategy(inst),
      timeframe: p.timeframe || '60',
    });
  }
}
