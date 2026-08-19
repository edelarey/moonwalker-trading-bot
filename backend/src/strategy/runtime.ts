import { loadConfig } from '../config';
import { logger } from '../logger';
import { fetchCandles } from '../bybit/client';
import { wsManager } from '../bybit/websocket';
import { strategyRegistry } from './registry';
import { normalizeInstance, instanceTimeframe } from './params';
import { IStrategy } from './IStrategy';
import { StrategyInstance } from '../types';
import type { BreakBounceEngine } from './breakBounce';

let breakBounceEngine: BreakBounceEngine | null = null;

export function setBreakBounceEngine(engine: BreakBounceEngine): void {
  breakBounceEngine = engine;
}

export function syncEngineSymbols(): void {
  const config = loadConfig();
  if (!breakBounceEngine) return;
  breakBounceEngine.updateConfig(config);
  for (const s of config.symbols.filter(x => x.enabled)) {
    breakBounceEngine.ensureSymbol(s.symbol);
  }
}

export function collectRequiredIntervals(): string[] {
  const config = loadConfig();
  const set = new Set<string>([config.breakoutTimeframe, config.entryTimeframe]);
  for (const s of strategyRegistry.getAll()) {
    const tf = instanceTimeframe(s.instance);
    if (tf) set.add(tf);
  }
  return [...set];
}

export function enabledSymbols(): string[] {
  return loadConfig().symbols.filter(s => s.enabled).map(s => s.symbol);
}

export function syncSubscriptions(): void {
  const symbols = enabledSymbols();
  if (!symbols.length) return;
  syncEngineSymbols();
  wsManager.subscribeSymbols(symbols, collectRequiredIntervals());
}

export async function warmupStrategy(strategy: IStrategy): Promise<void> {
  const config = loadConfig();
  const symbols = strategy.instance.symbols.length ? strategy.instance.symbols : enabledSymbols();
  const tf = instanceTimeframe(strategy.instance) || config.entryTimeframe;
  for (const symbol of symbols) {
    try {
      const candles = await fetchCandles(symbol, tf, 250);
      for (const c of candles) strategy.onCandle(symbol, c, tf);
    } catch (err) {
      logger.warn('Strategy warmup failed', { id: strategy.id, symbol, err });
    }
  }
}

export async function activateStrategy(inst: StrategyInstance): Promise<void> {
  const normalized = normalizeInstance(inst);
  strategyRegistry.unregister(normalized.id);
  if (!normalized.enabled) {
    syncSubscriptions();
    return;
  }
  if (normalized.strategyType === 'break_bounce') {
    syncSubscriptions();
    return;
  }
  try {
    const strategy = strategyRegistry.createStrategy(normalized);
    strategyRegistry.register(strategy);
    await warmupStrategy(strategy);
    syncSubscriptions();
  } catch (err) {
    logger.warn('Failed to activate strategy', { id: inst.id, type: inst.strategyType, err });
  }
}

export function deactivateStrategy(id: string): void {
  strategyRegistry.unregister(id);
}
