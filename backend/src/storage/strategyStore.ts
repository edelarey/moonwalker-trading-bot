import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { StrategyInstance, StrategyType } from '../types';
import { loadConfig } from '../config';
import { logger } from '../logger';

const dataDir = path.join(__dirname, '..', '..', 'data');

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
  return readJson<StrategyInstance[]>('strategy-instances.json', []);
}

export function saveStrategyInstance(inst: StrategyInstance): void {
  const list = getStrategyInstances();
  const idx = list.findIndex(s => s.id === inst.id);
  if (idx >= 0) list[idx] = inst; else list.push(inst);
  writeJson('strategy-instances.json', list);
  logger.debug('Strategy instance saved', { id: inst.id });
}

export function deleteStrategyInstance(id: string): void {
  const list = getStrategyInstances().filter(s => s.id !== id);
  writeJson('strategy-instances.json', list);
  logger.debug('Strategy instance deleted', { id });
}

export async function seedDefaultStrategies(): Promise<void> {
  const existing = getStrategyInstances();
  if (existing.length > 0) return;

  const config = loadConfig();
  const defaults = config.strategyDefaults;
  if (!defaults) {
    logger.warn('seedDefaultStrategies: no strategyDefaults found in config, skipping seed');
    return;
  }

  const types: StrategyType[] = ['break_bounce', 'dca', 'grid', 'ma_crossover', 'rsi', 'bollinger'];
  const names: Record<StrategyType, string> = {
    break_bounce: 'Default Break & Bounce',
    dca: 'Default DCA',
    grid: 'Default Grid',
    ma_crossover: 'Default MA Crossover',
    rsi: 'Default RSI',
    bollinger: 'Default Bollinger',
  };

  for (const type of types) {
    const params = defaults[type] as Record<string, unknown>;
    const inst: StrategyInstance = {
      id: uuidv4(),
      name: names[type],
      strategyType: type,
      symbols: [],
      params,
      enabled: false,
      autoMode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveStrategyInstance(inst);
  }

  logger.info('seedDefaultStrategies: seeded 6 default strategy instances from config');
}
