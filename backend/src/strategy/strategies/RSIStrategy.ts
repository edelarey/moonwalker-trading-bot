/**
 * RSI Mean-Reversion Strategy
 *
 * Core logic:
 * - Long entry: RSI < oversoldThreshold (price oversold)
 * - Exit: RSI > overboughtThreshold OR take-profit/stop-loss hit
 * - Optional MA filter: only enter longs when price > MA
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, RSIParams, Trade } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';

function rsi(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(-(period + 1)).map((v, i, a) => i === 0 ? 0 : v - a[i - 1]).slice(1);
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(Math.abs);
  const ag = gains.reduce((a, b) => a + b, 0) / period;
  const al = losses.reduce((a, b) => a + b, 0) / period;
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export class RSIStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: RSIParams;
  private closes: Map<string, number[]> = new Map();
  private inPosition: Map<string, boolean> = new Map();
  private entryPrice: Map<string, number> = new Map();
  private belowThresholdCount: Map<string, number> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as RSIParams;
  }

  describe(): string { return `RSI Mean-Reversion: Buy when RSI < ${this.params.oversoldThreshold}, sell when RSI > ${this.params.overboughtThreshold}.`; }
  defaultParams(): RSIParams {
    return { period: 14, oversoldThreshold: 30, overboughtThreshold: 70, timeframe: '60', confirmationCandles: 1, stopLossPercent: 3, takeProfitPercent: 6 };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (interval !== this.params.timeframe) return null;
    const closes = this.closes.get(symbol) ?? [];
    closes.push(candle.close);
    if (closes.length > this.params.period + 20) closes.shift();
    this.closes.set(symbol, closes);

    const rsiVal = rsi(closes, this.params.period);
    if (rsiVal === null) return null;

    const inPos = this.inPosition.get(symbol) ?? false;
    const entry = this.entryPrice.get(symbol) ?? 0;

    if (inPos) {
      const sl = entry * (1 - this.params.stopLossPercent / 100);
      const tp = entry * (1 + this.params.takeProfitPercent / 100);
      if (candle.close <= sl || candle.close >= tp || rsiVal >= this.params.overboughtThreshold) {
        this.inPosition.set(symbol, false);
        return { type: 'exit', symbol, price: candle.close, metadata: { rsi: rsiVal }, generatedAt: candle.openTime };
      }
      return null;
    }

    if (rsiVal < this.params.oversoldThreshold) {
      const count = (this.belowThresholdCount.get(symbol) ?? 0) + 1;
      this.belowThresholdCount.set(symbol, count);
      if (count >= this.params.confirmationCandles) {
        this.belowThresholdCount.set(symbol, 0);
        const ma = this.params.maFilterPeriod ? sma(closes, this.params.maFilterPeriod) : null;
        if (ma !== null && candle.close < ma) return null; // filter: price must be above MA for longs
        this.inPosition.set(symbol, true);
        this.entryPrice.set(symbol, candle.close);
        logger.debug('RSI oversold entry', { symbol, rsi: rsiVal });
        return {
          type: 'entry', direction: 'bullish', symbol, price: candle.close,
          stopLoss: candle.close * (1 - this.params.stopLossPercent / 100),
          takeProfit: candle.close * (1 + this.params.takeProfitPercent / 100),
          metadata: { rsi: rsiVal }, generatedAt: candle.openTime,
        };
      }
    } else {
      this.belowThresholdCount.set(symbol, 0);
    }
    return null;
  }

  async backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const { fetchCandles } = await import('../../bybit/client');
    const startMs = new Date(params.startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(params.endDate + 'T00:00:00Z').getTime() + 86400000;
    const p = params.params as unknown as RSIParams;
    const trades: Trade[] = [];
    let equity = params.startingEquity;
    const equityCurve = [{ time: startMs, equity }];

    for (const symbol of params.symbols) {
      const candles = await fetchCandles(symbol, (p.timeframe || '60') as any, 1000, startMs, endMs);
      const inst = new RSIStrategy({ ...this.instance, params: params.params });
      let entryPrice = 0, entryTime = 0;
      for (const c of candles) {
        const sig = inst.onCandle(symbol, c, p.timeframe || '60');
        if (sig?.type === 'entry') { entryPrice = sig.price; entryTime = c.openTime; }
        if (sig?.type === 'exit' && entryPrice > 0) {
          const posSize = (equity * params.riskPercent) / 100;
          const pnl = ((sig.price - entryPrice) / entryPrice) * posSize;
          trades.push({ id: uuidv4(), symbol, direction: 'bullish', entryPrice, closePrice: sig.price, pnl, pnlPercent: (pnl / equity) * 100, stopLoss: entryPrice * (1 - p.stopLossPercent / 100), takeProfit: entryPrice * (1 + p.takeProfitPercent / 100), riskDistance: entryPrice * p.stopLossPercent / 100, riskPercent: params.riskPercent, positionSize: posSize, qty: posSize / entryPrice, openedAt: entryTime, closedAt: c.openTime, status: pnl > 0 ? 'closed_tp' : 'closed_sl', isBacktest: true, patternType: 'rsi' as any, dailyHigh: c.high, dailyLow: c.low });
          equity += pnl;
          equityCurve.push({ time: c.openTime, equity });
          entryPrice = 0;
        }
      }
    }
    return { strategyType: 'rsi', instanceName: this.instance.name, trades, summary: calcSummary(trades, params.startingEquity, equity), equityCurve };
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
