import { v4 as uuidv4 } from 'uuid';
import { BacktestSummary, StrategyInstance, Trade } from '../types';
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from './IStrategy';
import { fetchCandlesRange } from '../bybit/client';
import { logger } from '../logger';
import { loadConfig } from '../config';
import { resolveLeverage, sizePosition } from './riskManager';

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
    profitFactor: gl > 0 ? gp / gl : gp > 0 ? null : 0,
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
  leverage?: number;
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
    leverage: partial.leverage,
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

  function closeTrade(
    symbol: string,
    entryPrice: number,
    entryTime: number,
    entryDir: 'bullish' | 'bearish',
    sl: number,
    tp: number,
    exitPrice: number,
    closedAt: number,
    high: number,
    low: number,
  ): void {
    const cfg = loadConfig();
    const leverage = resolveLeverage(
      opts.params.params as Record<string, unknown>,
      (opts.params as { leverage?: number }).leverage ?? cfg.leverage,
    );
    const { positionSize: posSize, qty } = sizePosition({
      equity,
      entryPrice,
      stopLoss: sl,
      riskPercent: opts.params.riskPercent,
      sizingMode: cfg.sizingMode ?? 'risk_percent',
      fixedPositionUsdt: cfg.fixedPositionUsdt ?? 100,
      leverage,
    });
    const pnlFactor = entryDir === 'bullish' ? 1 : -1;
    const pnl = ((exitPrice - entryPrice) / entryPrice) * posSize * pnlFactor;
    trades.push(makeBacktestTrade({
      symbol,
      direction: entryDir,
      entryPrice,
      closePrice: exitPrice,
      stopLoss: sl,
      takeProfit: tp,
      riskPercent: opts.params.riskPercent,
      positionSize: posSize,
      leverage,
      qty,
      openedAt: entryTime,
      closedAt,
      pnl,
      equity,
      patternType: opts.strategyType,
      high,
      low,
    }));
    equity += pnl;
    equityCurve.push({ time: closedAt, equity });
  }

  const tf = String(opts.timeframe);

  for (const symbol of opts.params.symbols) {
    let candles: Awaited<ReturnType<typeof fetchCandlesRange>> = [];
    try {
      candles = await fetchCandlesRange(symbol, tf, startMs, endMs);
    } catch (err) {
      logger.warn('Backtest skipped symbol (no klines)', { symbol, timeframe: tf, err });
      continue;
    }
    if (!candles.length) {
      logger.warn('Backtest: zero candles', { symbol, timeframe: tf, start: opts.params.startDate, end: opts.params.endDate });
      continue;
    }

    const inst = opts.create({ ...opts.instance, params: { ...opts.params.params, timeframe: tf }, symbols: [symbol] });
    let entryPrice = 0;
    let entryTime = 0;
    let entryDir: 'bullish' | 'bearish' = 'bullish';
    let sl = 0;
    let tp = 0;
    let last = candles[0];

    for (const c of candles) {
      last = c;
      const sig = inst.onCandle(symbol, c, tf);
      if (sig?.type === 'entry') {
        entryPrice = sig.price;
        entryTime = c.openTime;
        entryDir = sig.direction ?? 'bullish';
        sl = sig.stopLoss ?? (entryDir === 'bullish' ? entryPrice * 0.98 : entryPrice * 1.02);
        tp = sig.takeProfit ?? (entryDir === 'bullish' ? entryPrice * 1.04 : entryPrice * 0.96);
      }
      if (sig?.type === 'exit' && entryPrice > 0) {
        closeTrade(symbol, entryPrice, entryTime, entryDir, sl, tp, sig.price, c.openTime, c.high, c.low);
        entryPrice = 0;
      }
    }

    if (entryPrice > 0 && last) {
      closeTrade(symbol, entryPrice, entryTime, entryDir, sl, tp, last.close, last.openTime, last.high, last.low);
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
