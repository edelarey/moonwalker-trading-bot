/**
 * Strategy Registry
 * Manages all active strategy instances. Each instance is a configured
 * strategy that can be started/stopped independently.
 */
import { EventEmitter } from 'events';
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from './IStrategy';
import { StrategyInstance, StrategyType, Candle } from '../types';
import { loadConfig } from '../config';
import { instanceTimeframe, normalizeInstance } from './params';
import { DCAStrategy } from './strategies/DCAStrategy';
import { MACrossoverStrategy } from './strategies/MACrossoverStrategy';
import { RSIStrategy } from './strategies/RSIStrategy';
import { BollingerStrategy } from './strategies/BollingerStrategy';
import { GridStrategy } from './strategies/GridStrategy';
import { DonchianStrategy } from './strategies/DonchianStrategy';
import { EmaPullbackStrategy } from './strategies/EmaPullbackStrategy';
import { SupertrendStrategy } from './strategies/SupertrendStrategy';
import { VwapStrategy } from './strategies/VwapStrategy';
import { OrbStrategy } from './strategies/OrbStrategy';
import { BreakBounceStrategy } from './strategies/BreakBounceStrategy';
import { FundingArbStrategy } from './strategies/FundingArbStrategy';
import { CrossExchangeHedgeStrategy } from './strategies/CrossExchangeHedgeStrategy';
import { DynamicDeltaHedgeStrategy } from './strategies/DynamicDeltaHedgeStrategy';
import { DrawdownHedgeStrategy } from './strategies/DrawdownHedgeStrategy';
import { logger } from '../logger';

export class StrategyRegistry extends EventEmitter {
  private strategies: Map<string, IStrategy> = new Map();

  createStrategy(instance: StrategyInstance): IStrategy {
    const inst = normalizeInstance(instance);
    switch (inst.strategyType) {
      case 'break_bounce': return new BreakBounceStrategy(inst);
      case 'dca': return new DCAStrategy(inst);
      case 'ma_crossover': return new MACrossoverStrategy(inst);
      case 'rsi': return new RSIStrategy(inst);
      case 'bollinger': return new BollingerStrategy(inst);
      case 'grid': return new GridStrategy(inst);
      case 'donchian': return new DonchianStrategy(inst);
      case 'ema_pullback': return new EmaPullbackStrategy(inst);
      case 'supertrend': return new SupertrendStrategy(inst);
      case 'vwap': return new VwapStrategy(inst);
      case 'orb': return new OrbStrategy(inst);
      case 'funding_arb': return new FundingArbStrategy(inst);
      case 'cross_exchange': return new CrossExchangeHedgeStrategy(inst);
      case 'dynamic_delta': return new DynamicDeltaHedgeStrategy(inst);
      case 'drawdown_hedge': return new DrawdownHedgeStrategy(inst);
      default: throw new Error(`Unknown strategy type: ${inst.strategyType}`);
    }
  }

  register(strategy: IStrategy): void {
    this.strategies.set(strategy.id, strategy);
    logger.info('Strategy registered', {
      id: strategy.id,
      type: strategy.instance.strategyType,
      name: strategy.instance.name,
    });
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

  routeCandle(symbol: string, candle: Candle, interval: string): void {
    const config = loadConfig();
    for (const strategy of this.strategies.values()) {
      try {
        const inst = strategy.instance;
        if (inst.symbols.length && !inst.symbols.includes(symbol)) continue;
        const tf = instanceTimeframe(inst);
        if (tf && tf !== interval) continue;
        if (!tf && interval !== config.entryTimeframe) continue;
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

  async runBacktest(instance: StrategyInstance, params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const strategy = this.createStrategy(instance);
    return strategy.backtest(params);
  }

  getDefaultParams(strategyType: StrategyType): Record<string, unknown> {
    const dummy: StrategyInstance = {
      id: 'dummy', name: '', strategyType, symbols: [], params: {},
      enabled: false, autoMode: false, createdAt: 0, updatedAt: 0,
    };
    return this.createStrategy(dummy).defaultParams();
  }
}

export const strategyRegistry = new StrategyRegistry();
