/**
 * Strategy Registry
 * Manages all active strategy instances. Each instance is a configured
 * strategy that can be started/stopped independently.
 */
import { EventEmitter } from 'events';
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from './IStrategy';
import { StrategyInstance, StrategyType, Candle } from '../types';
import { DCAStrategy } from './strategies/DCAStrategy';
import { MACrossoverStrategy } from './strategies/MACrossoverStrategy';
import { RSIStrategy } from './strategies/RSIStrategy';
import { BollingerStrategy } from './strategies/BollingerStrategy';
import { GridStrategy } from './strategies/GridStrategy';
import { logger } from '../logger';

export class StrategyRegistry extends EventEmitter {
  private strategies: Map<string, IStrategy> = new Map();

  /**
   * Instantiate a strategy from a StrategyInstance config.
   */
  createStrategy(instance: StrategyInstance): IStrategy {
    switch (instance.strategyType) {
      case 'dca': return new DCAStrategy(instance);
      case 'ma_crossover': return new MACrossoverStrategy(instance);
      case 'rsi': return new RSIStrategy(instance);
      case 'bollinger': return new BollingerStrategy(instance);
      case 'grid': return new GridStrategy(instance);
      default: throw new Error(`Unknown strategy type: ${instance.strategyType}`);
    }
  }

  /**
   * Register an active strategy instance.
   */
  register(strategy: IStrategy): void {
    this.strategies.set(strategy.id, strategy);
    logger.info('Strategy registered', { id: strategy.id, type: strategy.instance.strategyType, name: strategy.instance.name });
  }

  unregister(id: string): void {
    this.strategies.delete(id);
  }

  get(id: string): IStrategy | undefined {
    return this.strategies.get(id);
  }

  getAll(): IStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Route a candle update to all registered strategies that subscribe to this symbol+interval.
   */
  routeCandle(symbol: string, candle: Candle, interval: string): void {
    for (const strategy of this.strategies.values()) {
      try {
        const sig = strategy.onCandle(symbol, candle, interval);
        if (sig) {
          this.emit('signal', { strategyId: strategy.id, signal: sig });
          logger.debug('Strategy signal', { strategyId: strategy.id, type: sig.type, symbol });
        }
      } catch (err) {
        logger.error('Strategy onCandle error', { err });
      }
    }
  }

  /**
   * Run a backtest for a given strategy type and params.
   */
  async runBacktest(instance: StrategyInstance, params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const strategy = this.createStrategy(instance);
    return strategy.backtest(params);
  }

  /**
   * Return default params for a strategy type.
   */
  getDefaultParams(strategyType: StrategyType): Record<string, unknown> {
    const dummy: StrategyInstance = { id: 'dummy', name: '', strategyType, symbols: [], params: {}, enabled: false, autoMode: false, createdAt: 0, updatedAt: 0 };
    const s = this.createStrategy(dummy);
    return s.defaultParams();
  }
}

export const strategyRegistry = new StrategyRegistry();
