import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ALL_STRATEGY_TYPES, StrategyInstance, StrategyType } from '../types';
import { loadConfig } from '../config';
import { logger } from '../logger';
import { strategyRegistry } from '../strategy/registry';
import { normalizeInstance } from '../strategy/params';

const dataDir = path.join(__dirname, '..', '..', 'data');

export const TYPE_NAMES: Record<StrategyType, string> = {
  break_bounce: 'Break & Bounce',
  dca: 'DCA',
  grid: 'Grid',
  ma_crossover: 'MA Crossover',
  rsi: 'RSI',
  bollinger: 'Bollinger',
  donchian: 'Donchian Breakout',
  ema_pullback: 'EMA Pullback',
  supertrend: 'Supertrend',
  adx_di: 'ADX + DI',
  keltner: 'Keltner Channel',
  vwap: 'VWAP Fade',
  orb: 'Opening Range Breakout',
  funding_arb: 'Funding Arb (delta-neutral)',
  cross_exchange: 'Cross-Exchange Hedge',
  dynamic_delta: 'Dynamic Delta Hedge',
  drawdown_hedge: 'Drawdown Hedge',
};

export function factoryParamsFor(type: StrategyType): Record<string, unknown> {
  const config = loadConfig();
  const fromConfig = config.strategyDefaults?.[type];
  if (fromConfig && typeof fromConfig === 'object') {
    return { ...(fromConfig as Record<string, unknown>) };
  }
  return strategyRegistry.getDefaultParams(type);
}

function ensureDir(): void {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function readJson<T>(filename: string, def: T): T {
  ensureDir();
  const fp = path.join(dataDir, filename);
  if (!fs.existsSync(fp)) return def;
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return def; }
}

function writeJson<T>(filename: string, data: T): void {
  ensureDir();
  fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2));
}

export function getStrategyInstances(): StrategyInstance[] {
  return readJson<StrategyInstance[]>('strategy-instances.json', []).map(inst => {
    const anyInst = inst as StrategyInstance & { type?: StrategyType };
    return normalizeInstance({
      ...inst,
      strategyType: inst.strategyType || anyInst.type || 'break_bounce',
      autoMode: inst.autoMode ?? false,
    });
  });
}

export function saveStrategyInstance(inst: StrategyInstance): void {
  const list = getStrategyInstances();
  const normalized = normalizeInstance(inst);
  const idx = list.findIndex(s => s.id === normalized.id);
  if (idx >= 0) list[idx] = normalized; else list.push(normalized);
  writeJson('strategy-instances.json', list);
  logger.debug('Strategy instance saved', { id: normalized.id });
}

export function deleteStrategyInstance(id: string): void {
  const list = getStrategyInstances().filter(s => s.id !== id);
  writeJson('strategy-instances.json', list);
  logger.debug('Strategy instance deleted', { id });
}

export function resetStrategyParams(id: string): StrategyInstance | null {
  const existing = getStrategyInstances().find(s => s.id === id);
  if (!existing) return null;
  saveStrategyInstance({
    ...existing,
    params: factoryParamsFor(existing.strategyType),
    updatedAt: Date.now(),
  });
  return getStrategyInstances().find(s => s.id === id) ?? null;
}

export async function seedDefaultStrategies(): Promise<void> {
  const existing = getStrategyInstances();
  const have = new Set(existing.map(s => s.strategyType));
  let added = 0;
  let renamed = 0;

  // Drop the old "Default " prefix from seeded names. Do not change custom names
  // that do not start with that prefix. Never rewrite params here.
  for (const inst of existing) {
    if (!inst.name.startsWith('Default ')) continue;
    const nextName = inst.name.replace(/^Default\s+/, '');
    if (!nextName || nextName === inst.name) continue;
    saveStrategyInstance({ ...inst, name: nextName, updatedAt: Date.now() });
    renamed++;
  }

  for (const type of ALL_STRATEGY_TYPES) {
    if (have.has(type)) continue;
    const inst: StrategyInstance = {
      id: uuidv4(),
      name: TYPE_NAMES[type],
      strategyType: type,
      symbols: [],
      params: factoryParamsFor(type),
      enabled: false,
      autoMode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveStrategyInstance(inst);
    added++;
  }

  if (added > 0 || renamed > 0) {
    logger.info('seedDefaultStrategies', { added, renamed });
  }
}
