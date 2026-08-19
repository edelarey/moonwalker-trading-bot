/**
 * Trailing drawdown hedge: watch paper equity (or buy-and-hold in backtest).
 * When peak-to-trough drop ≥ drawdownPercent, short a portion of the book.
 * Cover when drawdown shrinks back under recoverPercent.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, DrawdownHedgeParams } from '../../types';
import { paperBroker } from '../../execution/paperBroker';
import { loadConfig } from '../../config';
import { fetchCandlesRange } from '../../bybit/client';
import { calcSummary, makeBacktestTrade } from '../backtestUtils';
import { dayStartUtcMs } from '../../util/dates';
import { sizePosition } from '../riskManager';

export class DrawdownHedgeStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: DrawdownHedgeParams;
  private peak = 0;
  private hedged = false;

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as DrawdownHedgeParams;
  }

  describe(): string {
    return `Drawdown hedge: short ${this.params.hedgePortion * 100}% via ${this.params.hedgeSymbol} after a ${this.params.drawdownPercent}% peak-to-trough drop.`;
  }

  defaultParams(): DrawdownHedgeParams {
    return {
      timeframe: '15',
      hedgeSymbol: 'BTCUSDT',
      drawdownPercent: 3,
      recoverPercent: 1.2,
      hedgePortion: 0.5,
    };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    const hedgeSym = this.params.hedgeSymbol || 'BTCUSDT';
    if (symbol !== hedgeSym) return null;

    const snap = paperBroker.getSnapshot();
    const eq = snap.equity || loadConfig().paperStartingEquity || 10_000;
    if (eq > this.peak) this.peak = eq;
    const dd = this.peak > 0 ? ((this.peak - eq) / this.peak) * 100 : 0;

    if (this.hedged && dd <= this.params.recoverPercent) {
      this.hedged = false;
      return {
        type: 'exit', symbol: hedgeSym, price: candle.close, direction: 'bearish',
        metadata: { drawdownPercent: dd, peak: this.peak },
        generatedAt: candle.openTime,
      };
    }
    if (!this.hedged && dd >= this.params.drawdownPercent) {
      this.hedged = true;
      return {
        type: 'entry', direction: 'bearish', symbol: hedgeSym, price: candle.close,
        stopLoss: candle.close * (1 + this.params.drawdownPercent / 100),
        takeProfit: candle.close * (1 - this.params.recoverPercent / 100),
        metadata: { drawdownPercent: dd, peak: this.peak, hedgePortion: this.params.hedgePortion },
        generatedAt: candle.openTime,
      };
    }
    return null;
  }

  async backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as DrawdownHedgeParams;
    const startMs = dayStartUtcMs(params.startDate);
    const endMs = dayStartUtcMs(params.endDate) + 86_400_000;
    const tf = String(p.timeframe || '15');
    const cfg = loadConfig();
    const trades = [];
    let equity = params.startingEquity;
    const equityCurve = [{ time: startMs, equity }];

    for (const symbol of params.symbols) {
      const candles = await fetchCandlesRange(symbol, tf, startMs, endMs);
      if (!candles.length) continue;
      const startPx = candles[0].close;
      let peak = params.startingEquity;
      let hedged: { entry: number; time: number } | null = null;

      for (const c of candles) {
        const nav = params.startingEquity * (c.close / startPx);
        if (nav > peak) peak = nav;
        const dd = peak > 0 ? ((peak - nav) / peak) * 100 : 0;

        if (hedged && dd <= (p.recoverPercent ?? 2)) {
          const { positionSize, qty } = sizePosition({
            equity, entryPrice: hedged.entry, stopLoss: hedged.entry * 1.05,
            riskPercent: params.riskPercent, sizingMode: cfg.sizingMode,
            fixedPositionUsdt: equity * (p.hedgePortion ?? 0.5),
          });
          const pnl = (hedged.entry - c.close) * qty;
          trades.push(makeBacktestTrade({
            symbol, direction: 'bearish', entryPrice: hedged.entry, closePrice: c.close,
            stopLoss: hedged.entry * 1.05, takeProfit: c.close, riskPercent: params.riskPercent,
            positionSize, qty, openedAt: hedged.time, closedAt: c.openTime, pnl, equity,
            patternType: 'drawdown_hedge', high: c.high, low: c.low,
          }));
          equity += pnl;
          equityCurve.push({ time: c.openTime, equity });
          hedged = null;
        } else if (!hedged && dd >= (p.drawdownPercent ?? 5)) {
          hedged = { entry: c.close, time: c.openTime };
        }
      }
    }

    return {
      strategyType: 'drawdown_hedge',
      instanceName: this.instance.name,
      trades,
      summary: calcSummary(trades, params.startingEquity, equity),
      equityCurve,
    };
  }
}
