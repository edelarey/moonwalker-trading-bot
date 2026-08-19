/**
 * Session VWAP fade: fade excursions away from the UTC-session VWAP, take profit back toward it.
 * VWAP is the institutional reference price; mean-reversion around it is a standard perp scalp.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, VwapParams } from '../../types';
import { utcDayKey } from '../indicators';
import { runSignalBacktest } from '../backtestUtils';

interface VwapState {
  day: string;
  cumTpv: number;
  cumVol: number;
  prevClose: number;
  inPosition: 'long' | 'short' | null;
  entry: number;
}

export class VwapStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: VwapParams;
  private state: Map<string, VwapState> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as VwapParams;
  }

  describe(): string {
    return `VWAP fade: fade ${this.params.deviationPercent}% extensions from the UTC session VWAP.`;
  }

  defaultParams(): VwapParams {
    return { timeframe: '5', deviationPercent: 0.6, stopLossPercent: 1.2, takeProfitPercent: 0.8, sessionResetHour: 0 };
  }

  private dayKey(ts: number): string {
    const shifted = ts - (this.params.sessionResetHour || 0) * 3_600_000;
    return utcDayKey(shifted);
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (interval !== this.params.timeframe) return null;
    const day = this.dayKey(candle.openTime);
    let s = this.state.get(symbol);
    if (!s || s.day !== day) {
      s = { day, cumTpv: 0, cumVol: 0, prevClose: candle.close, inPosition: null, entry: 0 };
    }

    const typical = (candle.high + candle.low + candle.close) / 3;
    s.cumTpv += typical * candle.volume;
    s.cumVol += candle.volume;
    const vwap = s.cumVol > 0 ? s.cumTpv / s.cumVol : candle.close;
    const lower = vwap * (1 - this.params.deviationPercent / 100);
    const upper = vwap * (1 + this.params.deviationPercent / 100);

    if (s.inPosition) {
      const sl = s.inPosition === 'long'
        ? s.entry * (1 - this.params.stopLossPercent / 100)
        : s.entry * (1 + this.params.stopLossPercent / 100);
      const tp = s.inPosition === 'long'
        ? Math.min(vwap, s.entry * (1 + this.params.takeProfitPercent / 100))
        : Math.max(vwap, s.entry * (1 - this.params.takeProfitPercent / 100));
      const hit = s.inPosition === 'long'
        ? candle.close <= sl || candle.close >= tp
        : candle.close >= sl || candle.close <= tp;
      if (hit) {
        s.inPosition = null;
        s.prevClose = candle.close;
        this.state.set(symbol, s);
        return { type: 'exit', symbol, price: candle.close, metadata: { vwap }, generatedAt: candle.openTime };
      }
      s.prevClose = candle.close;
      this.state.set(symbol, s);
      return null;
    }

    const bounceLong = s.prevClose < lower && candle.close >= lower;
    const bounceShort = s.prevClose > upper && candle.close <= upper;

    if (bounceLong) {
      s.inPosition = 'long';
      s.entry = candle.close;
      s.prevClose = candle.close;
      this.state.set(symbol, s);
      return {
        type: 'entry', direction: 'bullish', symbol, price: candle.close,
        stopLoss: candle.close * (1 - this.params.stopLossPercent / 100),
        takeProfit: vwap,
        metadata: { vwap, lower, upper },
        generatedAt: candle.openTime,
      };
    }
    if (bounceShort) {
      s.inPosition = 'short';
      s.entry = candle.close;
      s.prevClose = candle.close;
      this.state.set(symbol, s);
      return {
        type: 'entry', direction: 'bearish', symbol, price: candle.close,
        stopLoss: candle.close * (1 + this.params.stopLossPercent / 100),
        takeProfit: vwap,
        metadata: { vwap, lower, upper },
        generatedAt: candle.openTime,
      };
    }

    s.prevClose = candle.close;
    this.state.set(symbol, s);
    return null;
  }

  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as VwapParams;
    return runSignalBacktest({
      strategyType: 'vwap',
      instance: this.instance,
      params,
      create: inst => new VwapStrategy(inst),
      timeframe: p.timeframe || '5',
    });
  }
}
