/**
 * Backtesting Engine for Break & Bounce Strategy
 *
 * Uses Bybit historical kline data to simulate the strategy on past data.
 * Fully separated and reusable — same logic as live trading.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  BacktestParams,
  BacktestResult,
  BacktestSummary,
  Candle,
  Trade,
  DailyRange,
  BreakoutSignal,
  RetestSignal,
} from '../types';
import { fetchCandles } from '../bybit/client';
import { detectBullishPattern, detectBearishPattern } from '../strategy/candlePatterns';
import { dayStartUtcMs, toIsoDate } from '../util/dates';
import { buildReversalSignal, calcPositionSize } from '../strategy/riskManager';
import { logger } from '../logger';

const STARTING_EQUITY = 10000; // USDT

/**
 * Group candles by UTC date string YYYY-MM-DD.
 */
function groupByDay(candles: Candle[]): Map<string, Candle[]> {
  const map = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = new Date(c.openTime);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return map;
}

function dateToMs(dateStr: string): number {
  return dayStartUtcMs(dateStr);
}

function isInLiquidityWindow(openTimeMs: number, startHHMM: string, endHHMM: string): boolean {
  const date = new Date(openTimeMs);
  const hhmm = date.getUTCHours() * 60 + date.getUTCMinutes();
  const [sH, sM] = startHHMM.split(':').map(Number);
  const [eH, eM] = endHHMM.split(':').map(Number);
  return hhmm >= sH * 60 + sM && hhmm <= eH * 60 + eM;
}

/**
 * Simulate one trading day for one symbol.
 */
function simulateDay(params: {
  symbol: string;
  dailyRange: DailyRange;
  candles15m: Candle[];
  candles5m: Candle[];
  equity: number;
  config: BacktestParams;
}): Trade | null {
  const { symbol, dailyRange, candles15m, candles5m, equity, config } = params;
  const buffer = config.breakoutBufferPercent / 100;
  const { high: prevHigh, low: prevLow } = dailyRange;

  let activeBreakout: BreakoutSignal | null = null;
  let activeRetest: RetestSignal | null = null;
  const candles5mSoFar: Candle[] = [];

  // --- Rule 2: Scan 15m candles for breakout ---
  for (const c15 of candles15m) {
    if (!isInLiquidityWindow(c15.openTime, config.liquidityWindowStart, config.liquidityWindowEnd)) continue;
    if (activeBreakout) break;

    if (c15.close > prevHigh * (1 + buffer)) {
      activeBreakout = {
        symbol,
        direction: 'bullish',
        brokenLevel: prevHigh,
        breakoutCandle: c15,
        detectedAt: c15.openTime,
        confirmed: true,
      };
    } else if (c15.close < prevLow * (1 - buffer)) {
      activeBreakout = {
        symbol,
        direction: 'bearish',
        brokenLevel: prevLow,
        breakoutCandle: c15,
        detectedAt: c15.openTime,
        confirmed: true,
      };
    }
  }

  if (!activeBreakout) return null;

  // --- Rule 3: Scan 5m candles after breakout for retest + reversal ---
  const breakoutTime = activeBreakout.breakoutCandle.openTime;

  for (let i = 0; i < candles5m.length; i++) {
    const c5 = candles5m[i];
    // Only look at candles AFTER the breakout candle
    if (c5.openTime <= breakoutTime) { candles5mSoFar.push(c5); continue; }
    if (!isInLiquidityWindow(c5.openTime, config.liquidityWindowStart, config.liquidityWindowEnd)) continue;

    const level = activeBreakout.brokenLevel;
    const tol = level * 0.001;

    // Check retest
    if (!activeRetest) {
      const isRetest =
        activeBreakout.direction === 'bullish'
          ? c5.low <= level + tol && c5.low >= level - tol * 3
          : c5.high >= level - tol && c5.high <= level + tol * 3;

      if (isRetest) {
        activeRetest = { symbol, breakout: activeBreakout, retestCandle: c5, detectedAt: c5.openTime };
      }
    }

    if (activeRetest) {
      const prev = candles5mSoFar[candles5mSoFar.length - 1] || null;
      const patternType =
        activeBreakout.direction === 'bullish'
          ? detectBullishPattern(prev, c5)
          : detectBearishPattern(prev, c5);

      if (patternType) {
        const signal = buildReversalSignal({ retest: activeRetest, patternType, tpMultiplier: config.tpMultiplier });
        const { positionSize, qty } = calcPositionSize(equity, config.riskPercent, signal.entryPrice, signal.stopLoss);

        // Simulate trade outcome: scan future 5m candles for SL or TP hit
        let status: Trade['status'] = 'closed_sl';
        let closePrice = signal.stopLoss;
        let closedAt = c5.openTime + 5 * 60 * 1000;

        for (let j = i + 1; j < candles5m.length; j++) {
          const future = candles5m[j];
          if (activeBreakout.direction === 'bullish') {
            if (future.low <= signal.stopLoss) {
              status = 'closed_sl'; closePrice = signal.stopLoss; closedAt = future.openTime; break;
            }
            if (future.high >= signal.takeProfit) {
              status = 'closed_tp'; closePrice = signal.takeProfit; closedAt = future.openTime; break;
            }
          } else {
            if (future.high >= signal.stopLoss) {
              status = 'closed_sl'; closePrice = signal.stopLoss; closedAt = future.openTime; break;
            }
            if (future.low <= signal.takeProfit) {
              status = 'closed_tp'; closePrice = signal.takeProfit; closedAt = future.openTime; break;
            }
          }
        }

        const pnlFactor = activeBreakout.direction === 'bullish' ? 1 : -1;
        const pnl = ((closePrice - signal.entryPrice) / signal.entryPrice) * positionSize * pnlFactor;

        const trade: Trade = {
          id: uuidv4(),
          symbol,
          direction: activeBreakout.direction,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          riskDistance: signal.riskDistance,
          riskPercent: config.riskPercent,
          positionSize,
          leverage: config.leverage ?? 1,
          qty,
          openedAt: c5.openTime,
          closedAt,
          closePrice,
          pnl,
          pnlPercent: (pnl / equity) * 100,
          status,
          isBacktest: true,
          patternType,
          dailyHigh: prevHigh,
          dailyLow: prevLow,
        };
        return trade;
      }
    }

    candles5mSoFar.push(c5);
  }

  return null;
}

/**
 * Run a full backtest for given params.
 */
export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  params = {
    ...params,
    startDate: toIsoDate(params.startDate),
    endDate: toIsoDate(params.endDate),
  };
  logger.info('Starting backtest', { symbols: params.symbols, start: params.startDate, end: params.endDate });

  const startMs = dateToMs(params.startDate);
  const endMs = dateToMs(params.endDate) + 86400000; // include end date

  const allTrades: Trade[] = [];
  let equity = STARTING_EQUITY;

  for (const symbol of params.symbols) {
    logger.info('Backtesting symbol', { symbol });

    const primaryTf = params.primaryTimeframe ?? 'D';
    const breakoutTf = params.breakoutTimeframe ?? '15';
    const entryTf = params.entryTimeframe ?? '5';

    // Fetch primary (blueprint) candles for the range (for prev-period highs/lows)
    const dailyCandles = await fetchCandles(symbol, primaryTf, 1000, startMs - 86400000, endMs);
    // Fetch breakout confirmation candles
    const candles15m = await fetchCandles(symbol, breakoutTf, 1000, startMs, endMs);
    // Fetch entry/reversal candles
    const candles5m = await fetchCandles(symbol, entryTf, 1000, startMs, endMs);

    const dailyByDay = groupByDay(dailyCandles);
    const candles15mByDay = groupByDay(candles15m);
    const candles5mByDay = groupByDay(candles5m);

    // Get all trading days in range
    const days = Array.from(candles15mByDay.keys()).sort();

    for (const day of days) {
      // Get previous day's range
      const prevDate = new Date(new Date(day + 'T00:00:00Z').getTime() - 86400000);
      const prevKey = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}-${String(prevDate.getUTCDate()).padStart(2, '0')}`;
      const prevDayCandles = dailyByDay.get(prevKey);
      if (!prevDayCandles || prevDayCandles.length === 0) continue;

      const prevDayCandle = prevDayCandles[0];
      const dailyRange: DailyRange = {
        symbol,
        date: prevKey,
        high: prevDayCandle.high,
        low: prevDayCandle.low,
        fetchedAt: Date.now(),
      };

      const trade = simulateDay({
        symbol,
        dailyRange,
        candles15m: candles15mByDay.get(day) || [],
        candles5m: candles5mByDay.get(day) || [],
        equity,
        config: params,
      });

      if (trade) {
        allTrades.push(trade);
        equity += trade.pnl || 0;
      }
    }
  }

  const summary = calcSummary(allTrades, STARTING_EQUITY, equity);
  const result: BacktestResult = {
    id: uuidv4(),
    params,
    trades: allTrades,
    summary,
    runAt: Date.now(),
  };

  logger.info('Backtest complete', { trades: allTrades.length, pnl: summary.totalPnl, winRate: summary.winRate });
  return result;
}

function calcSummary(trades: Trade[], startEquity: number, endEquity: number): BacktestSummary {
  const winners = trades.filter(t => (t.pnl || 0) > 0);
  const losers = trades.filter(t => (t.pnl || 0) <= 0);
  const grossProfit = winners.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + (t.pnl || 0), 0));

  // Max drawdown calculation
  let peak = startEquity;
  let eq = startEquity;
  let maxDD = 0;
  for (const t of trades) {
    eq += t.pnl || 0;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalTrades: trades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: trades.length > 0 ? winners.length / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
    totalPnl: endEquity - startEquity,
    maxDrawdown: maxDD,
    maxDrawdownPercent: (maxDD / startEquity) * 100,
    avgRR: trades.length > 0 ? (grossProfit / Math.max(winners.length, 1)) / (grossLoss / Math.max(losers.length, 1)) : 0,
    startingEquity: startEquity,
    endingEquity: endEquity,
  };
}
