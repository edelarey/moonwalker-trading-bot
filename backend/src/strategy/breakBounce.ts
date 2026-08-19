/**
 * BreakBounce Strategy Engine
 *
 * Strategy: Break & Bounce Scalping (pure price-action, no indicators)
 *
 * Rule 1 - Daily Blueprint:
 *   At UTC 00:00, fetch and store the previous day's high & low for every coin.
 *
 * Rule 2 - 15m Breakout Confirmation:
 *   A full 15m candle must close clearly above prev day high (bullish)
 *   or below prev day low (bearish).
 *   "Clearly" = close > high + bufferPercent% (default 0.05%).
 *
 * Rule 3 - 5m Retest + Reversal Entry:
 *   After breakout, wait for price to retest the broken level on the 5m chart.
 *   Look for reversal candle patterns: Hammer / Inverted Hammer / Bullish Engulfing (longs),
 *   Shooting Star / Bearish Engulfing (shorts).
 *   Enter ONLY on close of that reversal candle.
 *
 * Rule 4 - Risk Management:
 *   - SL = just beyond reversal candle extreme (low for long, high for short)
 *   - TP = 2.5x risk distance (configurable via tpMultiplier)
 *   - Max 1 trade per coin per day
 *   - Only trade during liquidity window (default UTC 00:00–02:30)
 */

import { EventEmitter } from 'events';
import {
  Candle,
  BreakoutSignal,
  RetestSignal,
  ReversalSignal,
  DailyRange,
  AppConfig,
} from '../types';
import { detectBullishPattern, detectBearishPattern } from './candlePatterns';
import { buildReversalSignal } from './riskManager';
import { logger } from '../logger';

interface SymbolState {
  symbol: string;
  dailyRange: DailyRange | null;
  // 15m candle buffer (last N candles)
  candles15m: Candle[];
  // 5m candle buffer (last N candles)
  candles5m: Candle[];
  // Active breakout waiting for retest
  activeBreakout: BreakoutSignal | null;
  // Active retest waiting for reversal pattern
  activeRetest: RetestSignal | null;
  // How many trades executed today for this symbol
  tradesCountToday: number;
}

export class BreakBounceEngine extends EventEmitter {
  private states: Map<string, SymbolState> = new Map();
  private config: AppConfig;

  constructor(config: AppConfig) {
    super();
    this.config = config;
    for (const sc of config.symbols) {
      if (sc.enabled) {
        this.states.set(sc.symbol, {
          symbol: sc.symbol,
          dailyRange: null,
          candles15m: [],
          candles5m: [],
          activeBreakout: null,
          activeRetest: null,
          tradesCountToday: 0,
        });
      }
    }
  }

  updateConfig(config: AppConfig): void {
    this.config = config;
    for (const sc of config.symbols) {
      if (sc.enabled) this.ensureSymbol(sc.symbol);
    }
  }

  ensureSymbol(symbol: string): void {
    if (this.states.has(symbol)) return;
    this.states.set(symbol, {
      symbol,
      dailyRange: null,
      candles15m: [],
      candles5m: [],
      activeBreakout: null,
      activeRetest: null,
      tradesCountToday: 0,
    });
  }

  /**
   * Rule 1: Set the daily range for a symbol.
   * Called by the cron job at UTC midnight.
   */
  setDailyRange(range: DailyRange): void {
    const state = this.states.get(range.symbol);
    if (!state) return;
    state.dailyRange = range;
    // Reset daily state
    state.activeBreakout = null;
    state.activeRetest = null;
    state.tradesCountToday = 0;
    state.candles15m = [];
    state.candles5m = [];
    logger.info('Daily range set', { symbol: range.symbol, high: range.high, low: range.low });
  }

  /**
   * Increment the trade count for a symbol (called after a trade is opened).
   */
  recordTrade(symbol: string): void {
    const state = this.states.get(symbol);
    if (state) state.tradesCountToday++;
  }

  /**
   * Process an incoming confirmed 15m candle.
   * Implements Rule 2: Breakout detection.
   */
  process15mCandle(symbol: string, candle: Candle): void {
    const state = this.states.get(symbol);
    if (!state || !state.dailyRange) return;

    state.candles15m.push(candle);
    if (state.candles15m.length > 50) state.candles15m.shift();

    // Rule 4: Skip if already traded max times today
    if (state.tradesCountToday >= this.config.maxDailyTradesPerCoin) return;

    // Rule 4: Skip if outside liquidity window
    if (!this.isInLiquidityWindow(candle.openTime)) return;

    // Already have an active breakout
    if (state.activeBreakout) return;

    const { high, low } = state.dailyRange;
    const buffer = this.config.breakoutBufferPercent / 100;

    // Rule 2: Check bullish breakout (close clearly above prev day high)
    if (candle.close > high * (1 + buffer)) {
      const signal: BreakoutSignal = {
        symbol,
        direction: 'bullish',
        brokenLevel: high,
        breakoutCandle: candle,
        detectedAt: Date.now(),
        confirmed: true,
      };
      state.activeBreakout = signal;
      logger.info('Breakout detected', { symbol, direction: 'bullish', level: high, close: candle.close });
      this.emit('breakout', signal);
      return;
    }

    // Rule 2: Check bearish breakout (close clearly below prev day low)
    if (candle.close < low * (1 - buffer)) {
      const signal: BreakoutSignal = {
        symbol,
        direction: 'bearish',
        brokenLevel: low,
        breakoutCandle: candle,
        detectedAt: Date.now(),
        confirmed: true,
      };
      state.activeBreakout = signal;
      logger.info('Breakout detected', { symbol, direction: 'bearish', level: low, close: candle.close });
      this.emit('breakout', signal);
      return;
    }
  }

  /**
   * Process an incoming confirmed 5m candle.
   * Implements Rule 3: Retest detection + reversal pattern entry.
   */
  process5mCandle(symbol: string, candle: Candle): void {
    const state = this.states.get(symbol);
    if (!state || !state.dailyRange || !state.activeBreakout) return;

    state.candles5m.push(candle);
    if (state.candles5m.length > 100) state.candles5m.shift();

    // Rule 4: Skip if outside liquidity window
    if (!this.isInLiquidityWindow(candle.openTime)) return;

    // Rule 4: Skip if already traded max times today
    if (state.tradesCountToday >= this.config.maxDailyTradesPerCoin) return;

    const breakout = state.activeBreakout;
    const level = breakout.brokenLevel;
    const retestTolerance = level * 0.001; // 0.1% tolerance for retest

    // Rule 3: Check if this 5m candle retests the broken level
    const isRetest =
      breakout.direction === 'bullish'
        ? candle.low <= level + retestTolerance && candle.low >= level - retestTolerance * 3
        : candle.high >= level - retestTolerance && candle.high <= level + retestTolerance * 3;

    if (isRetest && !state.activeRetest) {
      const retest: RetestSignal = {
        symbol,
        breakout,
        retestCandle: candle,
        detectedAt: Date.now(),
      };
      state.activeRetest = retest;
      logger.info('Retest detected', { symbol, direction: breakout.direction, level });
      this.emit('retest', retest);
    }

    // If we have a retest, look for reversal pattern
    if (state.activeRetest) {
      const prevCandle = state.candles5m[state.candles5m.length - 2] || null;

      let patternType = null;
      if (breakout.direction === 'bullish') {
        patternType = detectBullishPattern(prevCandle, candle);
      } else {
        patternType = detectBearishPattern(prevCandle, candle);
      }

      if (patternType) {
        const signal: ReversalSignal = buildReversalSignal({
          retest: state.activeRetest,
          patternType,
          tpMultiplier: this.config.tpMultiplier,
        });
        logger.info('Reversal signal generated', { symbol, pattern: patternType, entry: signal.entryPrice });
        this.emit('reversal', signal);
        // Clear retest — we've emitted the signal; trade execution is external
        state.activeRetest = null;
        state.activeBreakout = null; // Reset for next day
      }
    }
  }

  /**
   * Check if a candle's open time falls within the configured liquidity window.
   */
  private isInLiquidityWindow(openTimeMs: number): boolean {
    const date = new Date(openTimeMs);
    const hhmm = date.getUTCHours() * 60 + date.getUTCMinutes();
    const [startH, startM] = this.config.liquidityWindowStart.split(':').map(Number);
    const [endH, endM] = this.config.liquidityWindowEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return hhmm >= startMinutes && hhmm <= endMinutes;
  }

  getState(symbol: string): SymbolState | undefined {
    return this.states.get(symbol);
  }

  getAllStates(): SymbolState[] {
    return Array.from(this.states.values());
  }
}
