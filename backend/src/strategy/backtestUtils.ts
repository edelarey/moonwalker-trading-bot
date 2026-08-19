import { v4 as uuidv4 } from 'uuid';
import { BacktestSummary, StrategyInstance, Trade } from '../types';
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from './IStrategy';
import { fetchCandles } from '../bybit/client';

export function calcSummary(trades: Trade[], startEquity: number, endEquity: number): BacktestSummary {
  const winners = trades.filter(t => (t.pnl ?? 0) > 0);
  const losers = trades.filter(t => (t.pnl ?? 0) <= 0);
  const gp = winners.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const gl = Math.abs(losers.reduce((s, t) => s + (t.pnl ?? 0), 0));
  let peak = startEquity;
  let eq = startEquity;
  let maxDD = 0;
  for (const t of trades) {
    eq += t.pnl ?? 0;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDD) maxDD = dd;
  }
  const avgWin = winners.length ? gp / winners.length : 0;
  const avgLoss = losers.length ? gl / losers.length : 0;
  return {
    totalTrades: trades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: trades.length > 0 ? winners.length / trades.length : 0,
    profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0,
    totalPnl: endEquity - startEquity,
    maxDrawdown: maxDD,
    maxDrawdownPercent: startEquity > 0 ? (maxDD / startEquity) * 100 : 0,
    avgRR: avgLoss > 0 ? avgWin / avgLoss : 0,
    startingEquity: startEquity,
    endingEquity: endEquity,
  };
}

export function makeBacktestTrade(partial: {
  symbol: string;
  direction: 'bullish' | 'bearish';
  entryPrice: number;
  closePrice: number;
  stopLoss: number;
  takeProfit: number;
  riskPercent: number;
  positionSize: number;
  qty: number;
  openedAt: number;
  closedAt: number;
  pnl: number;
  equity: number;
  patternType: string;
  high: number;
  low: number;
}): Trade {
  return {
    id: uuidv4(),
    symbol: partial.symbol,
    direction: partial.direction,
    entryPrice: partial.entryPrice,
    closePrice: partial.closePrice,
    stopLoss: partial.stopLoss,
    takeProfit: partial.takeProfit,
    riskDistance: Math.abs(partial.entryPrice - partial.stopLoss),
    riskPercent: partial.riskPercent,
    positionSize: partial.positionSize,
    qty: partial.qty,
    openedAt: partial.openedAt,
    closedAt: partial.closedAt,
    pnl: partial.pnl,
    pnlPercent: partial.equity > 0 ? (partial.pnl / partial.equity) * 100 : 0,
    status: partial.pnl > 0 ? 'closed_tp' : 'closed_sl',
    isBacktest: true,
    mode: 'backtest',
    patternType: partial.patternType,
    dailyHigh: partial.high,
    dailyLow: partial.low,
  };
}

export async function runSignalBacktest(opts: {
  strategyType: string;
  instance: StrategyInstance;
  params: BacktestStrategyParams;
  create: (inst: StrategyInstance) => IStrategy;
  timeframe: string;
}): Promise<StrategyBacktestResult> {
  const startMs = new Date(opts.params.startDate + 'T00:00:00Z').getTime();
  const endMs = new Date(opts.params.endDate + 'T00:00:00Z').getTime() + 86_400_000;
  const trades: Trade[] = [];
  let equity = opts.params.startingEquity;
  const equityCurve = [{ time: startMs, equity }];

  for (const symbol of opts.params.symbols) {
    const candles = await fetchCandles(symbol, opts.timeframe as any, 1000, startMs, endMs);
    const inst = opts.create({ ...opts.instance, params: opts.params.params, symbols: [symbol] });
    let entryPrice = 0;
    let entryTime = 0;
    let entryDir: 'bullish' | 'bearish' = 'bullish';
    let sl = 0;
    let tp = 0;

    for (const c of candles) {
      const sig = inst.onCandle(symbol, c, opts.timeframe);
      if (sig?.type === 'entry') {
        entryPrice = sig.price;
        entryTime = c.openTime;
        entryDir = sig.direction ?? 'bullish';
        sl = sig.stopLoss ?? (entryDir === 'bullish' ? entryPrice * 0.98 : entryPrice * 1.02);
        tp = sig.takeProfit ?? (entryDir === 'bullish' ? entryPrice * 1.04 : entryPrice * 0.96);
      }
      if (sig?.type === 'exit' && entryPrice > 0) {
        const posSize = (equity * opts.params.riskPercent) / 100;
        const qty = posSize / entryPrice;
        const pnlFactor = entryDir === 'bullish' ? 1 : -1;
        const pnl = ((sig.price - entryPrice) / entryPrice) * posSize * pnlFactor;
        trades.push(makeBacktestTrade({
          symbol,
          direction: entryDir,
          entryPrice,
          closePrice: sig.price,
          stopLoss: sl,
          takeProfit: tp,
          riskPercent: opts.params.riskPercent,
          positionSize: posSize,
          qty,
          openedAt: entryTime,
          closedAt: c.openTime,
          pnl,
          equity,
          patternType: opts.strategyType,
          high: c.high,
          low: c.low,
        }));
        equity += pnl;
        equityCurve.push({ time: c.openTime, equity });
        entryPrice = 0;
      }
    }
  }

  return {
    strategyType: opts.strategyType,
    instanceName: opts.instance.name,
    trades,
    summary: calcSummary(trades, opts.params.startingEquity, equity),
    equityCurve,
  };
}
