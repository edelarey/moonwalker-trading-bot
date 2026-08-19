/**
 * Cross-venue dislocation hedge.
 * Live/paper: compare Bybit mark to Binance USDT-M last (public, no keys).
 * Short Bybit when Bybit is rich vs Binance; cover when the gap snaps back.
 * Backtest: Bybit perp vs Bybit spot (same fade-the-gap logic).
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, CrossExchangeParams } from '../../types';
import { fetchBinanceLast, fetchCandlesRange, getMarkPrice } from '../../bybit/client';
import { logger } from '../../logger';
import { calcSummary, makeBacktestTrade } from '../backtestUtils';
import { loadConfig } from '../../config';
import { sizePosition } from '../riskManager';

export class CrossExchangeHedgeStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: CrossExchangeParams;
  private inPosition = new Map<string, { dir: 'bullish' | 'bearish'; since: number }>();
  private lastRefresh = new Map<string, number>();
  private spread = new Map<string, number>();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as CrossExchangeParams;
  }

  describe(): string {
    return `Cross-exchange hedge: fade Bybit vs Binance when |spread| ≥ ${this.params.minSpreadPercent}%.`;
  }

  defaultParams(): CrossExchangeParams {
    return {
      timeframe: '5',
      minSpreadPercent: 0.04,
      exitSpreadPercent: 0.015,
      stopSpreadPercent: 0.2,
      maxHoldMinutes: 60,
    };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    void this.refresh(symbol, candle.close);

    const spr = this.spread.get(symbol);
    if (spr == null) return null;
    const pos = this.inPosition.get(symbol);
    const heldMin = pos ? (Date.now() - pos.since) / 60_000 : 0;

    if (pos) {
      const adverse = pos.dir === 'bearish' ? spr : -spr;
      if (Math.abs(spr) <= this.params.exitSpreadPercent || adverse >= this.params.stopSpreadPercent || heldMin >= this.params.maxHoldMinutes) {
        this.inPosition.delete(symbol);
        return {
          type: 'exit', symbol, price: candle.close, direction: pos.dir,
          metadata: { spreadPercent: spr },
          generatedAt: candle.openTime,
        };
      }
      return null;
    }

    if (Math.abs(spr) >= this.params.minSpreadPercent) {
      const dir: 'bullish' | 'bearish' = spr > 0 ? 'bearish' : 'bullish';
      this.inPosition.set(symbol, { dir, since: Date.now() });
      return {
        type: 'entry', direction: dir, symbol, price: candle.close,
        stopLoss: dir === 'bearish'
          ? candle.close * (1 + this.params.stopSpreadPercent / 100)
          : candle.close * (1 - this.params.stopSpreadPercent / 100),
        takeProfit: dir === 'bearish'
          ? candle.close * (1 - this.params.exitSpreadPercent / 100)
          : candle.close * (1 + this.params.exitSpreadPercent / 100),
        metadata: { spreadPercent: spr, ref: 'binance' },
        generatedAt: candle.openTime,
      };
    }
    return null;
  }

  private async refresh(symbol: string, bybitPx: number): Promise<void> {
    const last = this.lastRefresh.get(symbol) ?? 0;
    if (Date.now() - last < 5_000) return;
    this.lastRefresh.set(symbol, Date.now());
    try {
      const ref = await fetchBinanceLast(symbol);
      const local = await getMarkPrice(symbol).catch(() => bybitPx);
      if (ref && ref > 0) this.spread.set(symbol, ((local - ref) / ref) * 100);
    } catch (err) {
      logger.warn('Cross-exchange quote failed', { symbol, err });
    }
  }

  async backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as CrossExchangeParams;
    const startMs = new Date(params.startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(params.endDate + 'T00:00:00Z').getTime() + 86_400_000;
    const tf = String(p.timeframe || '5');
    const cfg = loadConfig();
    const trades = [];
    let equity = params.startingEquity;
    const equityCurve = [{ time: startMs, equity }];

    for (const symbol of params.symbols) {
      const perp = await fetchCandlesRange(symbol, tf, startMs, endMs, 'linear');
      let spot: typeof perp = [];
      try { spot = await fetchCandlesRange(symbol, tf, startMs, endMs, 'spot'); } catch { /* no spot pair */ }
      let si = 0;
      let pos: { dir: 'bullish' | 'bearish'; entry: number; time: number } | null = null;

      for (const c of perp) {
        while (si + 1 < spot.length && spot[si + 1].openTime <= c.openTime) si++;
        const ref = spot[si]?.close;
        if (ref == null || ref === 0) continue;
        const spr = ((c.close - ref) / ref) * 100;

        if (pos) {
          const adverse = pos.dir === 'bearish' ? spr : -spr;
          if (Math.abs(spr) <= (p.exitSpreadPercent ?? 0.02) || adverse >= (p.stopSpreadPercent ?? 0.25)) {
            const { positionSize, qty } = sizePosition({
              equity, entryPrice: pos.entry, stopLoss: pos.entry * 1.002,
              riskPercent: params.riskPercent, sizingMode: cfg.sizingMode, fixedPositionUsdt: cfg.fixedPositionUsdt,
            });
            const pnl = (pos.dir === 'bullish' ? 1 : -1) * (c.close - pos.entry) * qty;
            trades.push(makeBacktestTrade({
              symbol, direction: pos.dir, entryPrice: pos.entry, closePrice: c.close,
              stopLoss: pos.entry, takeProfit: c.close, riskPercent: params.riskPercent,
              positionSize, qty, openedAt: pos.time, closedAt: c.openTime, pnl, equity,
              patternType: 'cross_exchange', high: c.high, low: c.low,
            }));
            equity += pnl;
            equityCurve.push({ time: c.openTime, equity });
            pos = null;
          }
          continue;
        }

        if (Math.abs(spr) >= (p.minSpreadPercent ?? 0.08)) {
          pos = { dir: spr > 0 ? 'bearish' : 'bullish', entry: c.close, time: c.openTime };
        }
      }
      if (pos && perp.length) {
        const last = perp[perp.length - 1];
        const { positionSize, qty } = sizePosition({
          equity, entryPrice: pos.entry, stopLoss: pos.entry * 1.002,
          riskPercent: params.riskPercent, sizingMode: cfg.sizingMode, fixedPositionUsdt: cfg.fixedPositionUsdt,
        });
        const pnl = (pos.dir === 'bullish' ? 1 : -1) * (last.close - pos.entry) * qty;
        trades.push(makeBacktestTrade({
          symbol, direction: pos.dir, entryPrice: pos.entry, closePrice: last.close,
          stopLoss: pos.entry, takeProfit: last.close, riskPercent: params.riskPercent,
          positionSize, qty, openedAt: pos.time, closedAt: last.openTime, pnl, equity,
          patternType: 'cross_exchange', high: last.high, low: last.low,
        }));
        equity += pnl;
        equityCurve.push({ time: last.openTime, equity });
      }
    }

    return {
      strategyType: 'cross_exchange',
      instanceName: this.instance.name,
      trades,
      summary: calcSummary(trades, params.startingEquity, equity),
      equityCurve,
    };
  }
}
