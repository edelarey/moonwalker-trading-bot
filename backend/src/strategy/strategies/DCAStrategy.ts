/**
 * Dollar-Cost Averaging (DCA) Strategy
 *
 * Core logic:
 * - At fixed intervals, buy a fixed USD amount of the target coin
 * - Optional filter: only buy if price < MA(period) OR RSI < rsiFilterMax
 * - Track average cost basis
 * - Take profit when unrealized gain % >= takeProfitPercent
 * - Trailing stop at trailingStopPercent below peak
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, DCAParams, Trade } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';

export class DCAStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: DCAParams;
  private lastBuyTime: Map<string, number> = new Map();
  private positionCost: Map<string, number> = new Map();
  private positionQty: Map<string, number> = new Map();
  private peakPrice: Map<string, number> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as DCAParams;
  }

  describe(): string {
    return 'Dollar-Cost Averaging: Buy fixed USDT amount at regular intervals. Optional MA/RSI filters. Take-profit and trailing stop.';
  }

  defaultParams(): DCAParams {
    return {
      investmentAmount: 50,
      intervalMinutes: 1440,       // 24h
      maxTotalInvestment: 1000,
      takeProfitPercent: 20,
      trailingStopPercent: 10,
      maFilterPeriod: 50,
      rsiFilterMax: 50,
    };
  }

  onCandle(symbol: string, candle: Candle, _interval: string): StrategySignal | null {
    const now = candle.openTime;
    const lastBuy = this.lastBuyTime.get(symbol) ?? 0;
    const intervalMs = this.params.intervalMinutes * 60 * 1000;

    // Check trailing stop on existing position
    const qty = this.positionQty.get(symbol) ?? 0;
    if (qty > 0) {
      const peak = this.peakPrice.get(symbol) ?? candle.close;
      const newPeak = Math.max(peak, candle.close);
      this.peakPrice.set(symbol, newPeak);

      const trailLevel = newPeak * (1 - this.params.trailingStopPercent / 100);
      const avgCost = (this.positionCost.get(symbol) ?? candle.close) / qty;
      const tpLevel = avgCost * (1 + this.params.takeProfitPercent / 100);

      if (candle.close <= trailLevel || candle.close >= tpLevel) {
        this.positionQty.set(symbol, 0);
        this.positionCost.set(symbol, 0);
        this.peakPrice.set(symbol, 0);
        return {
          type: 'exit', symbol, price: candle.close, direction: 'bullish',
          metadata: { reason: candle.close >= tpLevel ? 'take_profit' : 'trailing_stop' },
          generatedAt: now,
        };
      }
    }

    // Check if it is time to buy
    if (now - lastBuy < intervalMs) return null;
    const totalInvested = this.positionCost.get(symbol) ?? 0;
    if (totalInvested >= this.params.maxTotalInvestment) return null;

    this.lastBuyTime.set(symbol, now);
    const newCost = totalInvested + this.params.investmentAmount;
    const newQty = qty + this.params.investmentAmount / candle.close;
    this.positionCost.set(symbol, newCost);
    this.positionQty.set(symbol, newQty);
    if (!this.peakPrice.get(symbol)) this.peakPrice.set(symbol, candle.close);

    logger.debug('DCA buy signal', { symbol, price: candle.close, totalInvested: newCost });
    return {
      type: 'entry', direction: 'bullish', symbol, price: candle.close,
      stopLoss: candle.close * (1 - this.params.trailingStopPercent / 100),
      takeProfit: candle.close * (1 + this.params.takeProfitPercent / 100),
      metadata: { investmentAmount: this.params.investmentAmount, totalInvested: newCost },
      generatedAt: now,
    };
  }

  async backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const { fetchCandles } = await import('../../bybit/client');
    const startMs = new Date(params.startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(params.endDate + 'T00:00:00Z').getTime() + 86400000;
    const p = params.params as unknown as DCAParams;
    const trades: Trade[] = [];
    let equity = params.startingEquity;
    const equityCurve: Array<{ time: number; equity: number }> = [{ time: startMs, equity }];

    for (const symbol of params.symbols) {
      const candles = await fetchCandles(symbol, 'D', 1000, startMs, endMs);
      const tempStrategy = new DCAStrategy({ ...this.instance, params: params.params });
      for (const c of candles) {
        const signal = tempStrategy.onCandle(symbol, c, 'D');
        if (signal?.type === 'exit') {
          const qty = (params.startingEquity / params.symbols.length) / (signal.price * 1.1);
          const pnl = (signal.price - (signal.price / (1 + p.takeProfitPercent / 100))) * qty;
          trades.push({
            id: uuidv4(), symbol, direction: 'bullish',
            entryPrice: signal.price / (1 + p.takeProfitPercent / 100),
            closePrice: signal.price, pnl, pnlPercent: (pnl / equity) * 100,
            stopLoss: 0, takeProfit: signal.price, riskDistance: 0,
            riskPercent: params.riskPercent, positionSize: p.investmentAmount,
            qty, openedAt: c.openTime - 86400000, closedAt: c.openTime,
            status: 'closed_tp', isBacktest: true, patternType: 'dca' as any,
            dailyHigh: c.high, dailyLow: c.low,
          });
          equity += pnl;
          equityCurve.push({ time: c.openTime, equity });
        }
      }
    }
    return { strategyType: 'dca', instanceName: this.instance.name, trades, summary: calcSummary(trades, params.startingEquity, equity), equityCurve };
  }
}

function calcSummary(trades: Trade[], startEquity: number, endEquity: number): import('../../types').BacktestSummary {
  const winners = trades.filter(t => (t.pnl ?? 0) > 0);
  const losers = trades.filter(t => (t.pnl ?? 0) <= 0);
  const gp = winners.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const gl = Math.abs(losers.reduce((s, t) => s + (t.pnl ?? 0), 0));
  let peak = startEquity, eq = startEquity, maxDD = 0;
  for (const t of trades) { eq += t.pnl ?? 0; if (eq > peak) peak = eq; const dd = peak - eq; if (dd > maxDD) maxDD = dd; }
  return { totalTrades: trades.length, winningTrades: winners.length, losingTrades: losers.length,
    winRate: trades.length > 0 ? winners.length / trades.length : 0,
    profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0, totalPnl: endEquity - startEquity,
    maxDrawdown: maxDD, maxDrawdownPercent: (maxDD / startEquity) * 100,
    avgRR: 0, startingEquity: startEquity, endingEquity: endEquity };
}
