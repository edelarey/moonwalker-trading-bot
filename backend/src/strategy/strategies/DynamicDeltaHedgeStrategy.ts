/**
 * Dynamic delta hedge: watch net book delta (or a standing inventory in backtest)
 * and short/cover the hedge symbol when |delta|/equity or ATR% exceeds a trigger.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, DynamicDeltaParams } from '../../types';
import { atr } from '../indicators';
import { store } from '../../storage/store';
import { loadConfig } from '../../config';
import { paperBroker } from '../../execution/paperBroker';
import { fetchCandlesRange } from '../../bybit/client';
import { calcSummary, makeBacktestTrade } from '../backtestUtils';
import { dayStartUtcMs } from '../../util/dates';
import { sizePosition } from '../riskManager';

export class DynamicDeltaHedgeStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: DynamicDeltaParams;
  private candles: Map<string, Candle[]> = new Map();
  private hedging = new Map<string, boolean>();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as DynamicDeltaParams;
  }

  describe(): string {
    return `Dynamic delta: hedge when |net delta| > ${this.params.deltaThresholdPercent}% equity or ATR% > ${this.params.volTriggerPercent}.`;
  }

  defaultParams(): DynamicDeltaParams {
    return {
      timeframe: '15',
      hedgeSymbol: 'BTCUSDT',
      deltaThresholdPercent: 8,
      volTriggerPercent: 1.2,
      hedgeRatio: 0.5,
      inventoryUsdt: 2000,
    };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    const hedgeSym = this.params.hedgeSymbol || symbol;
    if (symbol !== hedgeSym && this.instance.symbols.length) {
      // Still update vol on the hedge symbol only.
    }
    const buf = this.candles.get(symbol) ?? [];
    buf.push(candle);
    if (buf.length > 40) buf.shift();
    this.candles.set(symbol, buf);
    if (symbol !== hedgeSym) return null;

    const atrVal = atr(buf, 14);
    const volPct = atrVal && candle.close ? (atrVal / candle.close) * 100 : 0;
    const equity = paperBroker.equity() || loadConfig().paperStartingEquity || 10_000;
    const net = this.netDeltaUsdt();
    const deltaPct = equity > 0 ? (Math.abs(net) / equity) * 100 : 0;
    const hot = deltaPct >= this.params.deltaThresholdPercent || volPct >= this.params.volTriggerPercent;
    const inHedge = this.hedging.get(hedgeSym) ?? false;

    if (inHedge && !hot) {
      this.hedging.set(hedgeSym, false);
      return { type: 'exit', symbol: hedgeSym, price: candle.close, direction: 'bearish', metadata: { deltaPct, volPct }, generatedAt: candle.openTime };
    }
    if (!inHedge && hot && net > 0) {
      this.hedging.set(hedgeSym, true);
      return {
        type: 'entry', direction: 'bearish', symbol: hedgeSym, price: candle.close,
        stopLoss: candle.close * (1 + Math.max(this.params.volTriggerPercent, 2) / 100),
        takeProfit: candle.close * (1 - this.params.volTriggerPercent / 200),
        metadata: { deltaPct, volPct, hedgeRatio: this.params.hedgeRatio },
        generatedAt: candle.openTime,
      };
    }
    return null;
  }

  private netDeltaUsdt(): number {
    return store.getTrades()
      .filter(t => t.status === 'open' && !t.isBacktest && t.strategyType !== 'dynamic_delta' && t.strategyType !== 'drawdown_hedge')
      .reduce((s, t) => s + (t.direction === 'bullish' ? 1 : -1) * t.positionSize, 0);
  }

  async backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as DynamicDeltaParams;
    const startMs = dayStartUtcMs(params.startDate);
    const endMs = dayStartUtcMs(params.endDate) + 86_400_000;
    const tf = String(p.timeframe || '15');
    const cfg = loadConfig();
    const inv = p.inventoryUsdt || 1000;
    const trades = [];
    let equity = params.startingEquity;
    const equityCurve = [{ time: startMs, equity }];

    for (const symbol of params.symbols) {
      const candles = await fetchCandlesRange(symbol, tf, startMs, endMs);
      const buf: Candle[] = [];
      let hedged: { entry: number; time: number } | null = null;
      const startPx = candles[0]?.close ?? 0;

      for (const c of candles) {
        buf.push(c);
        if (buf.length > 40) buf.shift();
        const atrVal = atr(buf, 14);
        const volPct = atrVal && c.close ? (atrVal / c.close) * 100 : 0;
        const invNow = startPx ? inv * (c.close / startPx) : inv;
        const deltaPct = equity > 0 ? (invNow / equity) * 100 : 0;
        const hot = deltaPct >= (p.deltaThresholdPercent ?? 25) || volPct >= (p.volTriggerPercent ?? 2.5);

        if (hedged && !hot) {
          const { positionSize, qty } = sizePosition({
            equity, entryPrice: hedged.entry, stopLoss: hedged.entry * 1.02,
            riskPercent: params.riskPercent, sizingMode: cfg.sizingMode, fixedPositionUsdt: (inv * (p.hedgeRatio ?? 0.5)),
          });
          const pnl = (hedged.entry - c.close) * qty;
          trades.push(makeBacktestTrade({
            symbol, direction: 'bearish', entryPrice: hedged.entry, closePrice: c.close,
            stopLoss: hedged.entry * 1.02, takeProfit: c.close, riskPercent: params.riskPercent,
            positionSize, qty, openedAt: hedged.time, closedAt: c.openTime, pnl, equity,
            patternType: 'dynamic_delta', high: c.high, low: c.low,
          }));
          equity += pnl;
          equityCurve.push({ time: c.openTime, equity });
          hedged = null;
        } else if (!hedged && hot) {
          hedged = { entry: c.close, time: c.openTime };
        }
      }
      if (hedged && candles.length) {
        const last = candles[candles.length - 1];
        const { positionSize, qty } = sizePosition({
          equity, entryPrice: hedged.entry, stopLoss: hedged.entry * 1.02,
          riskPercent: params.riskPercent, sizingMode: cfg.sizingMode, fixedPositionUsdt: (inv * (p.hedgeRatio ?? 0.5)),
        });
        const pnl = (hedged.entry - last.close) * qty;
        trades.push(makeBacktestTrade({
          symbol, direction: 'bearish', entryPrice: hedged.entry, closePrice: last.close,
          stopLoss: hedged.entry * 1.02, takeProfit: last.close, riskPercent: params.riskPercent,
          positionSize, qty, openedAt: hedged.time, closedAt: last.openTime, pnl, equity,
          patternType: 'dynamic_delta', high: last.high, low: last.low,
        }));
        equity += pnl;
        equityCurve.push({ time: last.openTime, equity });
      }
    }

    return {
      strategyType: 'dynamic_delta',
      instanceName: this.instance.name,
      trades,
      summary: calcSummary(trades, params.startingEquity, equity),
      equityCurve,
    };
  }
}
