/**
 * Moving Average Crossover Strategy
 *
 * Core logic:
 * - Calculate short MA and long MA on incoming candles
 * - Long entry: short MA crosses above long MA (golden cross)
 * - Exit: short MA crosses below long MA (death cross)
 * - Optional RSI confirmation filter
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, MACrossoverParams, Trade } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(-period - 1).map((v, i, a) => i === 0 ? 0 : v - a[i - 1]).slice(1);
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(Math.abs);
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export class MACrossoverStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: MACrossoverParams;
  private closes: Map<string, number[]> = new Map();
  private inPosition: Map<string, boolean> = new Map();
  private prevShortAboveLong: Map<string, boolean | null> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as MACrossoverParams;
  }

  describe(): string { return `MA Crossover: Golden cross (${this.params.shortPeriod}/${this.params.longPeriod}) entry, death cross exit.`; }
  defaultParams(): MACrossoverParams {
    return { shortPeriod: 20, longPeriod: 50, timeframe: '240', stopLossPercent: 3, takeProfitPercent: 8, trailingStopPercent: 4 };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (interval !== this.params.timeframe) return null;
    const closes = this.closes.get(symbol) ?? [];
    closes.push(candle.close);
    if (closes.length > this.params.longPeriod + 10) closes.shift();
    this.closes.set(symbol, closes);

    const shortMA = sma(closes, this.params.shortPeriod);
    const longMA = sma(closes, this.params.longPeriod);
    if (shortMA === null || longMA === null) return null;

    const shortAboveLong = shortMA > longMA;
    const prev = this.prevShortAboveLong.get(symbol) ?? null;
    this.prevShortAboveLong.set(symbol, shortAboveLong);
    const inPos = this.inPosition.get(symbol) ?? false;

    // Golden cross — entry
    if (!inPos && prev === false && shortAboveLong) {
      const rsiVal = this.params.rsiConfirmPeriod ? rsi(closes, this.params.rsiConfirmPeriod) : null;
      if (rsiVal !== null && this.params.rsiLongMin && rsiVal < this.params.rsiLongMin) return null;
      this.inPosition.set(symbol, true);
      logger.debug('MA golden cross', { symbol, shortMA, longMA });
      return {
        type: 'entry', direction: 'bullish', symbol, price: candle.close,
        stopLoss: candle.close * (1 - this.params.stopLossPercent / 100),
        takeProfit: candle.close * (1 + this.params.takeProfitPercent / 100),
        metadata: { shortMA, longMA }, generatedAt: candle.openTime,
      };
    }

    // Death cross — exit
    if (inPos && prev === true && !shortAboveLong) {
      this.inPosition.set(symbol, false);
      return { type: 'exit', symbol, price: candle.close, metadata: { shortMA, longMA }, generatedAt: candle.openTime };
    }

    return null;
  }

  async backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const { fetchCandles } = await import('../../bybit/client');
    const startMs = new Date(params.startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(params.endDate + 'T00:00:00Z').getTime() + 86400000;
    const p = params.params as unknown as MACrossoverParams;
    const trades: Trade[] = [];
    let equity = params.startingEquity;
    const equityCurve = [{ time: startMs, equity }];

    for (const symbol of params.symbols) {
      const candles = await fetchCandles(symbol, (p.timeframe || '60') as any, 1000, startMs, endMs);
      const inst = new MACrossoverStrategy({ ...this.instance, params: params.params });
      let entryPrice = 0, entryTime = 0;
      for (const c of candles) {
        const sig = inst.onCandle(symbol, c, p.timeframe || '60');
        if (sig?.type === 'entry') { entryPrice = sig.price; entryTime = c.openTime; }
        if (sig?.type === 'exit' && entryPrice > 0) {
          const posSize = (equity * params.riskPercent) / 100;
          const pnl = ((sig.price - entryPrice) / entryPrice) * posSize;
          trades.push({ id: uuidv4(), symbol, direction: 'bullish', entryPrice, closePrice: sig.price, pnl, pnlPercent: (pnl / equity) * 100, stopLoss: entryPrice * (1 - p.stopLossPercent / 100), takeProfit: entryPrice * (1 + p.takeProfitPercent / 100), riskDistance: entryPrice * p.stopLossPercent / 100, riskPercent: params.riskPercent, positionSize: posSize, qty: posSize / entryPrice, openedAt: entryTime, closedAt: c.openTime, status: pnl > 0 ? 'closed_tp' : 'closed_sl', isBacktest: true, patternType: 'ma_crossover' as any, dailyHigh: c.high, dailyLow: c.low });
          equity += pnl;
          equityCurve.push({ time: c.openTime, equity });
          entryPrice = 0;
        }
      }
    }
    return { strategyType: 'ma_crossover', instanceName: this.instance.name, trades, summary: calcSummary(trades, params.startingEquity, equity), equityCurve };
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
