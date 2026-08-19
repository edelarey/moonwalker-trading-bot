import { loadConfig } from '../config';
import { logger } from '../logger';
import { fetchCandles } from '../bybit/client';
import { wsManager } from '../bybit/websocket';
import { strategyRegistry } from './registry';
import { normalizeInstance, instanceTimeframe } from './params';
import { IStrategy } from './IStrategy';
import { AppConfig, StrategyInstance } from '../types';
import { getStrategyInstances } from '../storage/strategyStore';
import type { BreakBounceEngine } from './breakBounce';

let breakBounceEngine: BreakBounceEngine | null = null;

export function setBreakBounceEngine(engine: BreakBounceEngine): void {
  breakBounceEngine = engine;
}

/** Live B&B reads the Break & Bounce instance params, not the old global Trading fields. */
export function breakBounceLiveConfig(): AppConfig {
  const config = loadConfig();
  const inst = getStrategyInstances().find(s => s.strategyType === 'break_bounce' && s.enabled)
    ?? getStrategyInstances().find(s => s.strategyType === 'break_bounce');
  if (!inst) return config;
  const p = (inst.params ?? {}) as Record<string, unknown>;
  const num = (k: string, fallback: number) => {
    const n = Number(p[k]);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = (k: string, fallback: string) => {
    const v = p[k];
    return v != null && String(v) !== '' ? String(v) : fallback;
  };
  return {
    ...config,
    primaryTimeframe: (p.primaryTimeframe as AppConfig['primaryTimeframe']) || config.primaryTimeframe,
    breakoutTimeframe: (str('breakoutTimeframe', config.breakoutTimeframe) as AppConfig['breakoutTimeframe']),
    entryTimeframe: (str('entryTimeframe', config.entryTimeframe) as AppConfig['entryTimeframe']),
    breakoutBufferPercent: num('breakoutBufferPercent', config.breakoutBufferPercent),
    tpMultiplier: num('tpMultiplier', config.tpMultiplier),
    liquidityWindowStart: str('liquidityWindowStart', config.liquidityWindowStart),
    liquidityWindowEnd: str('liquidityWindowEnd', config.liquidityWindowEnd),
    maxDailyTradesPerCoin: num('maxTradesPerDay', num('maxDailyTradesPerCoin', config.maxDailyTradesPerCoin)),
  };
}

export function syncEngineSymbols(): void {
  const config = breakBounceLiveConfig();
  if (!breakBounceEngine) return;
  breakBounceEngine.updateConfig(config);
  for (const s of config.symbols.filter(x => x.enabled)) {
    breakBounceEngine.ensureSymbol(s.symbol);
  }
}

export function collectRequiredIntervals(): string[] {
  const bb = breakBounceLiveConfig();
  const set = new Set<string>([bb.breakoutTimeframe, bb.entryTimeframe]);
  for (const s of strategyRegistry.getAll()) {
    const tf = instanceTimeframe(s.instance);
    if (tf) set.add(tf);
  }
  const inst = getStrategyInstances().find(s => s.strategyType === 'break_bounce');
  const ptf = inst?.params?.primaryTimeframe;
  if (ptf === 'D' || ptf === 'W' || ptf === 'M') set.add(String(ptf));
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
      // Warmup only seeds indicators. Leave flat so live Auto can open a real paper fill.
      strategy.clearPosition?.(symbol);
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
