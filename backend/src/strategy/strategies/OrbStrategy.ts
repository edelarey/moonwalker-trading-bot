/**
 * Opening Range Breakout (ORB): first N minutes of the UTC session set the range.
 * Trade the first close beyond that range; SL is the opposite side, TP is range × RR.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, OrbParams } from '../../types';
import { utcDayKey, utcMinutes } from '../indicators';
import { runSignalBacktest } from '../backtestUtils';

interface OrbState {
  day: string;
  rangeHigh: number;
  rangeLow: number;
  rangeReady: boolean;
  tradesToday: number;
  inPosition: 'long' | 'short' | null;
  entry: number;
  sl: number;
  tp: number;
}

export class OrbStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: OrbParams;
  private state: Map<string, OrbState> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as OrbParams;
  }

  describe(): string {
    return `ORB: ${this.params.rangeMinutes}m UTC opening range, TP ${this.params.takeProfitRr}R.`;
  }

  defaultParams(): OrbParams {
    return {
      rangeMinutes: 30,
      timeframe: '5',
      breakoutBufferPercent: 0.08,
      takeProfitRr: 2,
      sessionStartHour: 0,
      maxTradesPerDay: 1,
    };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    const day = utcDayKey(candle.openTime);
    let s = this.state.get(symbol);
    if (!s || s.day !== day) {
      s = {
        day,
        rangeHigh: -Infinity,
        rangeLow: Infinity,
        rangeReady: false,
        tradesToday: 0,
        inPosition: null,
        entry: 0,
        sl: 0,
        tp: 0,
      };
    }

    const minute = utcMinutes(candle.openTime);
    const sessionStart = (this.params.sessionStartHour || 0) * 60;
    const rangeEnd = sessionStart + this.params.rangeMinutes;

    if (s.inPosition) {
      const hit = s.inPosition === 'long'
        ? candle.close <= s.sl || candle.close >= s.tp
        : candle.close >= s.sl || candle.close <= s.tp;
      if (hit) {
        s.inPosition = null;
        this.state.set(symbol, s);
        return { type: 'exit', symbol, price: candle.close, generatedAt: candle.openTime };
      }
      this.state.set(symbol, s);
      return null;
    }

    if (minute >= sessionStart && minute < rangeEnd) {
      s.rangeHigh = Math.max(s.rangeHigh, candle.high);
      s.rangeLow = Math.min(s.rangeLow, candle.low);
      this.state.set(symbol, s);
      return null;
    }

    if (minute >= rangeEnd && s.rangeHigh > -Infinity) s.rangeReady = true;
    if (!s.rangeReady) {
      this.state.set(symbol, s);
      return null;
    }
    if (s.tradesToday >= this.params.maxTradesPerDay) {
      this.state.set(symbol, s);
      return null;
    }

    const buf = this.params.breakoutBufferPercent / 100;
    const longBreak = candle.close > s.rangeHigh * (1 + buf);
    const shortBreak = candle.close < s.rangeLow * (1 - buf);
    if (!longBreak && !shortBreak) {
      this.state.set(symbol, s);
      return null;
    }

    const height = s.rangeHigh - s.rangeLow;
    if (height <= 0) {
      this.state.set(symbol, s);
      return null;
    }

    if (longBreak) {
      s.inPosition = 'long';
      s.entry = candle.close;
      s.sl = s.rangeLow;
      s.tp = candle.close + height * this.params.takeProfitRr;
      s.tradesToday += 1;
      this.state.set(symbol, s);
      return {
        type: 'entry', direction: 'bullish', symbol, price: candle.close,
        stopLoss: s.sl, takeProfit: s.tp,
        metadata: { rangeHigh: s.rangeHigh, rangeLow: s.rangeLow, height },
        generatedAt: candle.openTime,
      };
    }

    s.inPosition = 'short';
    s.entry = candle.close;
    s.sl = s.rangeHigh;
    s.tp = candle.close - height * this.params.takeProfitRr;
    s.tradesToday += 1;
    this.state.set(symbol, s);
    return {
      type: 'entry', direction: 'bearish', symbol, price: candle.close,
      stopLoss: s.sl, takeProfit: s.tp,
      metadata: { rangeHigh: s.rangeHigh, rangeLow: s.rangeLow, height },
      generatedAt: candle.openTime,
    };
  }

  clearPosition(symbol: string): void {
    const s = this.state.get(symbol);
    if (s) {
      s.inPosition = null;
      this.state.set(symbol, s);
    }
  }

  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as OrbParams;
    return runSignalBacktest({
      strategyType: 'orb',
      instance: this.instance,
      params,
      create: inst => new OrbStrategy(inst),
      timeframe: p.timeframe || '5',
    });
  }
}
