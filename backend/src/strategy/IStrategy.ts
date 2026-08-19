import { Candle, StrategySignal, StrategyInstance } from '../types';

/**
 * Interface all strategy modules must implement.
 * Each strategy is a stateful object that processes candle updates
 * and emits signals via EventEmitter.
 */
export interface IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;

  /** Called with each new confirmed candle for a subscribed symbol */
  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null;

  /** Run full historical backtest — returns list of simulated signals/trades */
  backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult>;

  /** Human-readable description of what the strategy does */
  describe(): string;

  /** Default parameter values for this strategy type */
  defaultParams(): Record<string, unknown>;
}

export interface BacktestStrategyParams {
  symbols: string[];
  startDate: string;
  endDate: string;
  params: Record<string, unknown>;
  riskPercent: number;
  startingEquity: number;
  leverage?: number;
}

export interface StrategyBacktestResult {
  strategyType: string;
  instanceName: string;
  trades: import('../types').Trade[];
  summary: import('../types').BacktestSummary;
  equityCurve: Array<{ time: number; equity: number }>;
}
