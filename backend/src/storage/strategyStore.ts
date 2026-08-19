import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ALL_STRATEGY_TYPES, StrategyInstance, StrategyType } from '../types';
import { loadConfig } from '../config';
import { logger } from '../logger';
import { strategyRegistry } from '../strategy/registry';
import { normalizeInstance } from '../strategy/params';

const dataDir = path.join(__dirname, '..', '..', 'data');

const TYPE_NAMES: Record<StrategyType, string> = {
  break_bounce: 'Default Break & Bounce',
  dca: 'Default DCA',
  grid: 'Default Grid',
  ma_crossover: 'Default MA Crossover',
  rsi: 'Default RSI',
  bollinger: 'Default Bollinger',
  donchian: 'Default Donchian Breakout',
  ema_pullback: 'Default EMA Pullback',
  supertrend: 'Default Supertrend',
  vwap: 'Default VWAP Fade',
  orb: 'Default Opening Range Breakout',
  funding_arb: 'Default Funding Arb (delta-neutral)',
  cross_exchange: 'Default Cross-Exchange Hedge',
  dynamic_delta: 'Default Dynamic Delta Hedge',
  drawdown_hedge: 'Default Drawdown Hedge',
};

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

export async function seedDefaultStrategies(): Promise<void> {
  const existing = getStrategyInstances();
  const have = new Set(existing.map(s => s.strategyType));
  const config = loadConfig();
  const defaults = config.strategyDefaults ?? {};
  let added = 0;
  let refreshed = 0;

  for (const inst of existing) {
    if (inst.name !== TYPE_NAMES[inst.strategyType]) continue;
    const next = (defaults[inst.strategyType] as Record<string, unknown> | undefined)
      ?? strategyRegistry.getDefaultParams(inst.strategyType);
    saveStrategyInstance({ ...inst, params: next, updatedAt: Date.now() });
    refreshed++;
  }

  for (const type of ALL_STRATEGY_TYPES) {
    if (have.has(type)) continue;
    const params = (defaults[type] as Record<string, unknown> | undefined)
      ?? strategyRegistry.getDefaultParams(type);
    const inst: StrategyInstance = {
      id: uuidv4(),
      name: TYPE_NAMES[type],
      strategyType: type,
      symbols: [],
      params,
      enabled: false,
      autoMode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveStrategyInstance(inst);
    added++;
  }

  if (added > 0 || refreshed > 0) {
    logger.info('seedDefaultStrategies: synced factory defaults', { added, refreshed });
  }
}
