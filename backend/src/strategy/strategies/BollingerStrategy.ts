/**
 * Bollinger Bands Strategy
 *
 * Two modes:
 * - breakout: Enter long when price closes above upper band + volume spike
 *             Enter short when price closes below lower band
 * - mean_reversion: Buy near lower band, sell near upper band
 *
 * Squeeze detection: when band width / price < squeezeThresholdPercent
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, BollingerParams, Trade } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';

function bollingerBands(closes: number[], period: number, mult: number): { upper: number; middle: number; lower: number; width: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: mean + mult * sd, middle: mean, lower: mean - mult * sd, width: (2 * mult * sd) / mean };
}

export class BollingerStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: BollingerParams;
  private closes: Map<string, number[]> = new Map();
  private volumes: Map<string, number[]> = new Map();
  private inPosition: Map<string, 'long' | 'short' | null> = new Map();
  private entryPrice: Map<string, number> = new Map();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as BollingerParams;
  }

  describe(): string { return `Bollinger Bands (${this.params.mode}): ${this.params.period}-period, ${this.params.stdDevMultiplier}σ.`; }
  defaultParams(): BollingerParams {
    return { period: 20, stdDevMultiplier: 2.0, timeframe: '240', mode: 'breakout', volumeConfirmMultiplier: 1.5, squeezeThresholdPercent: 2.0, stopLossPercent: 3, takeProfitPercent: 6, trailingStopPercent: 3 };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (interval !== this.params.timeframe) return null;
    const closes = this.closes.get(symbol) ?? [];
    const vols = this.volumes.get(symbol) ?? [];
    closes.push(candle.close); vols.push(candle.volume);
    if (closes.length > this.params.period + 10) { closes.shift(); vols.shift(); }
    this.closes.set(symbol, closes); this.volumes.set(symbol, vols);

    const bb = bollingerBands(closes, this.params.period, this.params.stdDevMultiplier);
    if (!bb) return null;

    const inPos = this.inPosition.get(symbol) ?? null;
    const entry = this.entryPrice.get(symbol) ?? 0;

    if (inPos) {
      const sl = inPos === 'long' ? entry * (1 - this.params.stopLossPercent / 100) : entry * (1 + this.params.stopLossPercent / 100);
      const tp = inPos === 'long' ? entry * (1 + this.params.takeProfitPercent / 100) : entry * (1 - this.params.takeProfitPercent / 100);
      const exitLong = inPos === 'long' && (candle.close <= sl || candle.close >= tp || (this.params.mode === 'mean_reversion' && candle.close >= bb.upper));
      const exitShort = inPos === 'short' && (candle.close >= sl || candle.close <= tp || (this.params.mode === 'mean_reversion' && candle.close <= bb.lower));
      if (exitLong || exitShort) {
        this.inPosition.set(symbol, null);
        return { type: 'exit', symbol, price: candle.close, metadata: { bb }, generatedAt: candle.openTime };
      }
      return null;
    }

    const avgVol = vols.slice(-20).reduce((a, b) => a + b, 0) / Math.min(vols.length, 20);
    const volOk = this.params.volumeConfirmMultiplier <= 1 || candle.volume >= avgVol * this.params.volumeConfirmMultiplier;

    if (this.params.mode === 'breakout') {
      if (candle.close > bb.upper && volOk) {
        this.inPosition.set(symbol, 'long'); this.entryPrice.set(symbol, candle.close);
        logger.debug('Bollinger breakout long', { symbol, close: candle.close, upper: bb.upper });
        return { type: 'entry', direction: 'bullish', symbol, price: candle.close, stopLoss: candle.close * (1 - this.params.stopLossPercent / 100), takeProfit: candle.close * (1 + this.params.takeProfitPercent / 100), metadata: { bb }, generatedAt: candle.openTime };
      }
      if (candle.close < bb.lower && volOk) {
        this.inPosition.set(symbol, 'short'); this.entryPrice.set(symbol, candle.close);
        return { type: 'entry', direction: 'bearish', symbol, price: candle.close, stopLoss: candle.close * (1 + this.params.stopLossPercent / 100), takeProfit: candle.close * (1 - this.params.takeProfitPercent / 100), metadata: { bb }, generatedAt: candle.openTime };
      }
    } else { // mean_reversion
      if (candle.close <= bb.lower) {
        this.inPosition.set(symbol, 'long'); this.entryPrice.set(symbol, candle.close);
        return { type: 'entry', direction: 'bullish', symbol, price: candle.close, stopLoss: candle.close * (1 - this.params.stopLossPercent / 100), takeProfit: bb.upper, metadata: { bb }, generatedAt: candle.openTime };
      }
    }
    return null;
  }

  async backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const { fetchCandles } = await import('../../bybit/client');
    const startMs = new Date(params.startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(params.endDate + 'T00:00:00Z').getTime() + 86400000;
    const p = params.params as unknown as BollingerParams;
    const trades: Trade[] = [];
    let equity = params.startingEquity;
    const equityCurve = [{ time: startMs, equity }];

    for (const symbol of params.symbols) {
      const candles = await fetchCandles(symbol, (p.timeframe || '60') as any, 1000, startMs, endMs);
      const inst = new BollingerStrategy({ ...this.instance, params: params.params });
      let entryPrice = 0, entryTime = 0, entryDir: 'bullish' | 'bearish' = 'bullish';
      for (const c of candles) {
        const sig = inst.onCandle(symbol, c, p.timeframe || '60');
        if (sig?.type === 'entry') { entryPrice = sig.price; entryTime = c.openTime; entryDir = sig.direction ?? 'bullish'; }
        if (sig?.type === 'exit' && entryPrice > 0) {
          const posSize = (equity * params.riskPercent) / 100;
          const pnlFactor = entryDir === 'bullish' ? 1 : -1;
          const pnl = ((sig.price - entryPrice) / entryPrice) * posSize * pnlFactor;
          trades.push({ id: uuidv4(), symbol, direction: entryDir, entryPrice, closePrice: sig.price, pnl, pnlPercent: (pnl / equity) * 100, stopLoss: entryPrice * (1 - p.stopLossPercent / 100), takeProfit: entryPrice * (1 + p.takeProfitPercent / 100), riskDistance: entryPrice * p.stopLossPercent / 100, riskPercent: params.riskPercent, positionSize: posSize, qty: posSize / entryPrice, openedAt: entryTime, closedAt: c.openTime, status: pnl > 0 ? 'closed_tp' : 'closed_sl', isBacktest: true, patternType: 'bollinger' as any, dailyHigh: c.high, dailyLow: c.low });
          equity += pnl; equityCurve.push({ time: c.openTime, equity }); entryPrice = 0;
        }
      }
    }
    return { strategyType: 'bollinger', instanceName: this.instance.name, trades, summary: calcSummary(trades, params.startingEquity, equity), equityCurve };
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
