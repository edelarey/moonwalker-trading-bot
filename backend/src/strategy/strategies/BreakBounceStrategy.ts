/**
 * Adapter so Break & Bounce participates in the strategy registry (defaults + backtest).
 * Live candles are still processed by BreakBounceEngine — onCandle is a no-op here.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategyInstance, StrategySignal } from '../../types';
import { runBacktest } from '../../backtest/engine';
import { calcSummary } from '../backtestUtils';

export class BreakBounceStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
  }

  describe(): string {
    return 'Break & Bounce: daily range breakout, 5m retest, reversal candle entry.';
  }

  defaultParams(): Record<string, unknown> {
    return {
      primaryTimeframe: 'D',
      breakoutTimeframe: '15',
      entryTimeframe: '5',
      breakoutBufferPercent: 0.08,
      liquidityWindowStart: '00:00',
      liquidityWindowEnd: '04:00',
      tpMultiplier: 2.5,
    };
  }

  onCandle(_symbol: string, _candle: Candle, _interval: string): StrategySignal | null {
    return null;
  }

  async backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as Record<string, unknown>;
    const result = await runBacktest({
      symbols: params.symbols,
      startDate: params.startDate,
      endDate: params.endDate,
      riskPercent: params.riskPercent,
      tpMultiplier: Number(p.tpMultiplier ?? 2.5),
      liquidityWindowStart: String(p.liquidityWindowStart ?? '00:00'),
      liquidityWindowEnd: String(p.liquidityWindowEnd ?? '02:30'),
      breakoutBufferPercent: Number(p.breakoutBufferPercent ?? 0.05),
      primaryTimeframe: (p.primaryTimeframe as 'D' | 'W' | 'M') ?? 'D',
      breakoutTimeframe: String(p.breakoutTimeframe ?? '15'),
      entryTimeframe: String(p.entryTimeframe ?? '5'),
    });
    return {
      strategyType: 'break_bounce',
      instanceName: this.instance.name,
      trades: result.trades,
      summary: result.summary ?? calcSummary(result.trades, params.startingEquity, params.startingEquity),
      equityCurve: result.trades.reduce((curve, t) => {
        const last = curve[curve.length - 1];
        curve.push({ time: t.closedAt ?? t.openedAt, equity: (last?.equity ?? params.startingEquity) + (t.pnl ?? 0) });
        return curve;
      }, [{ time: Date.now(), equity: params.startingEquity }] as Array<{ time: number; equity: number }>),
    };
  }
}
