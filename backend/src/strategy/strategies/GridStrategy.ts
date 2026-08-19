/**
 * Grid Trading Strategy
 *
 * Core logic:
 * - Define upper/lower price bounds + number of grids
 * - Virtual buy orders placed at each grid level below current price
 * - Virtual sell orders placed at each grid level above current price
 * - Each filled buy creates a sell order one grid above, and vice versa
 * - Safety stop: close all if price breaks outside range by stopLossBreakoutPercent
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, GridParams, Trade } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';

export class GridStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: GridParams;
  private gridLevels: Map<string, number[]> = new Map();
  private filledBuys: Map<string, Set<number>> = new Map();
  private initialised: Map<string, boolean> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as GridParams;
  }

  describe(): string { return `Grid Trading: ${this.params.gridCount} grids between ${this.params.lowerPrice} and ${this.params.upperPrice}.`; }
  defaultParams(): GridParams {
    return { upperPrice: 0, lowerPrice: 0, gridCount: 12, investmentPerGrid: 50, geometric: true, stopLossBreakoutPercent: 4, leverage: 1 };
  }

  private buildGrid(upper: number, lower: number): number[] {
    const levels: number[] = [];
    for (let i = 0; i <= this.params.gridCount; i++) {
      if (this.params.geometric) {
        levels.push(lower * Math.pow(upper / lower, i / this.params.gridCount));
      } else {
        levels.push(lower + (upper - lower) * i / this.params.gridCount);
      }
    }
    return levels;
  }

  onCandle(symbol: string, candle: Candle, _interval: string): StrategySignal | null {
    const upper = this.params.upperPrice || candle.close * 1.1;
    const lower = this.params.lowerPrice || candle.close * 0.9;

    if (!this.initialised.get(symbol)) {
      this.gridLevels.set(symbol, this.buildGrid(upper, lower));
      this.filledBuys.set(symbol, new Set());
      this.initialised.set(symbol, true);
    }

    const levels = this.gridLevels.get(symbol)!;
    const filled = this.filledBuys.get(symbol)!;

    // Safety stop: price breaks range
    const breakoutPct = this.params.stopLossBreakoutPercent / 100;
    if (candle.close < lower * (1 - breakoutPct) || candle.close > upper * (1 + breakoutPct)) {
      logger.info('Grid safety stop triggered', { symbol, close: candle.close, upper, lower });
      filled.clear();
      return { type: 'exit', symbol, price: candle.close, metadata: { reason: 'safety_stop', upper, lower }, generatedAt: candle.openTime };
    }

    // Check each grid level for buy/sell triggers
    for (let i = 0; i < levels.length - 1; i++) {
      const buyLevel = levels[i];
      const sellLevel = levels[i + 1];

      // Buy trigger: price crosses below buy level and we haven't bought here yet
      if (candle.low <= buyLevel && !filled.has(i)) {
        filled.add(i);
        logger.debug('Grid buy', { symbol, level: buyLevel, gridIndex: i });
        return {
          type: 'entry', direction: 'bullish', symbol, price: buyLevel,
          takeProfit: sellLevel,
          stopLoss: lower * (1 - breakoutPct),
          metadata: { gridIndex: i, buyLevel, sellLevel, investmentPerGrid: this.params.investmentPerGrid },
          generatedAt: candle.openTime,
        };
      }

      // Sell trigger: price crosses above sell level and we have a buy filled here
      if (candle.high >= sellLevel && filled.has(i)) {
        filled.delete(i);
        return {
          type: 'exit', symbol, price: sellLevel,
          metadata: { gridIndex: i, buyLevel, sellLevel },
          generatedAt: candle.openTime,
        };
      }
    }
    return null;
  }

  async backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const { fetchCandles } = await import('../../bybit/client');
    const startMs = new Date(params.startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(params.endDate + 'T00:00:00Z').getTime() + 86400000;
    const p = params.params as unknown as GridParams;
    const trades: Trade[] = [];
    let equity = params.startingEquity;
    const equityCurve = [{ time: startMs, equity }];
    const openGridTrades: Map<string, { entry: number; time: number; gridIdx: number }> = new Map();

    for (const symbol of params.symbols) {
      const candles = await fetchCandles(symbol, 'D', 1000, startMs, endMs);
      if (!candles.length) continue;
      const autoUpper = p.upperPrice || candles[0].close * 1.15;
      const autoLower = p.lowerPrice || candles[0].close * 0.85;
      const inst = new GridStrategy({ ...this.instance, params: { ...params.params, upperPrice: autoUpper, lowerPrice: autoLower } });

      for (const c of candles) {
        const sig = inst.onCandle(symbol, c, 'D');
        if (sig?.type === 'entry') {
          const key = `${symbol}_${(sig.metadata as any).gridIndex}`;
          openGridTrades.set(key, { entry: sig.price, time: c.openTime, gridIdx: (sig.metadata as any).gridIndex });
        }
        if (sig?.type === 'exit') {
          const key = `${symbol}_${(sig.metadata as any).gridIndex}`;
          const open = openGridTrades.get(key);
          if (open) {
            const pnl = (sig.price - open.entry) * (p.investmentPerGrid / open.entry);
            equity += pnl;
            trades.push({ id: uuidv4(), symbol, direction: 'bullish', entryPrice: open.entry, closePrice: sig.price, pnl, pnlPercent: (pnl / equity) * 100, stopLoss: autoLower, takeProfit: (sig.metadata as any).sellLevel, riskDistance: open.entry - autoLower, riskPercent: params.riskPercent, positionSize: p.investmentPerGrid, qty: p.investmentPerGrid / open.entry, openedAt: open.time, closedAt: c.openTime, status: 'closed_tp', isBacktest: true, patternType: 'grid' as any, dailyHigh: c.high, dailyLow: c.low });
            equityCurve.push({ time: c.openTime, equity });
            openGridTrades.delete(key);
          }
        }
      }
    }
    return { strategyType: 'grid', instanceName: this.instance.name, trades, summary: calcSummary(trades, params.startingEquity, equity), equityCurve };
  }
}

function calcSummary(trades: Trade[], startEquity: number, endEquity: number): import('../../types').BacktestSummary {
  const winners = trades.filter(t => (t.pnl ?? 0) > 0);
  const losers = trades.filter(t => (t.pnl ?? 0) <= 0);
  const gp = winners.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const gl = Math.abs(losers.reduce((s, t) => s + (t.pnl ?? 0), 0));
  let peak = startEquity, eq = startEquity, maxDD = 0;
  for (const t of trades) { eq += t.pnl ?? 0; if (eq > peak) peak = eq; const dd = peak - eq; if (dd > maxDD) maxDD = dd; }
  return { totalTrades: trades.length, winningTrades: winners.length, losingTrades: losers.length, winRate: trades.length > 0 ? winners.length / trades.length : 0, profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0, totalPnl: endEquity - startEquity, maxDrawdown: maxDD, maxDrawdownPercent: (maxDD / startEquity) * 100, avgRR: 0, startingEquity: startEquity, endingEquity: endEquity };
}
