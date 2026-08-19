import fs from 'fs';
import path from 'path';
import { Trade, DailyRange, BacktestResult } from '../types';
import { logger } from '../logger';

const dataDir = path.join(__dirname, '..', '..', 'data');

function ensureDataDir(): void {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function readJson<T>(filename: string, defaultValue: T): T {
  ensureDataDir();
  const fp = path.join(dataDir, filename);
  if (!fs.existsSync(fp)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as T;
  } catch {
    logger.warn('Failed to parse JSON file', { filename });
    return defaultValue;
  }
}

function writeJson<T>(filename: string, data: T): void {
  ensureDataDir();
  fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2));
}

// --- Trades ---
export function getTrades(): Trade[] {
  return readJson<Trade[]>('trades.json', []);
}

export function saveTrade(trade: Trade): void {
  const trades = getTrades();
  const idx = trades.findIndex(t => t.id === trade.id);
  if (idx >= 0) { trades[idx] = trade; } else { trades.push(trade); }
  writeJson('trades.json', trades);
}

export function updateTrade(id: string, updates: Partial<Trade>): void {
  const trades = getTrades();
  const idx = trades.findIndex(t => t.id === id);
  if (idx >= 0) { trades[idx] = { ...trades[idx], ...updates }; writeJson('trades.json', trades); }
}

export function clearTrades(): void {
  writeJson('trades.json', []);
}

// --- Daily Ranges ---
export function getDailyRanges(): DailyRange[] {
  return readJson<DailyRange[]>('daily-ranges.json', []);
}

export function saveDailyRange(range: DailyRange): void {
  const ranges = getDailyRanges();
  const idx = ranges.findIndex(r => r.symbol === range.symbol && r.date === range.date);
  if (idx >= 0) { ranges[idx] = range; } else { ranges.push(range); }
  writeJson('daily-ranges.json', ranges);
}

// --- Backtest Results ---
export function getBacktestResults(): BacktestResult[] {
  return readJson<BacktestResult[]>('backtest-results.json', []);
}

export function saveBacktestResult(result: BacktestResult): void {
  const results = getBacktestResults();
  results.unshift(result); // newest first
  // Keep only last 50 results
  writeJson('backtest-results.json', results.slice(0, 50));
}

export function clearBacktestResults(): void {
  writeJson('backtest-results.json', []);
}

export function deleteBacktestResult(id: string): boolean {
  const results = getBacktestResults();
  const next = results.filter(r => r.id !== id);
  if (next.length === results.length) return false;
  writeJson('backtest-results.json', next);
  return true;
}
