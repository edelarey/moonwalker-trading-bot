import { env } from '../config';
import * as jsonStore from './jsonStore';
import { Trade, DailyRange, BacktestResult } from '../types';

const _mode = env.NODE_ENV === 'test' ? 'json' : (process.env.STORAGE_MODE || 'json');

export const store = {
  getTrades: (): Trade[] => jsonStore.getTrades(),
  saveTrade: (trade: Trade): void => jsonStore.saveTrade(trade),
  updateTrade: (id: string, updates: Partial<Trade>): void => jsonStore.updateTrade(id, updates),
  clearTrades: (): void => jsonStore.clearTrades(),
  getDailyRanges: (): DailyRange[] => jsonStore.getDailyRanges(),
  saveDailyRange: (range: DailyRange): void => jsonStore.saveDailyRange(range),
  getBacktestResults: (): BacktestResult[] => jsonStore.getBacktestResults(),
  saveBacktestResult: (result: BacktestResult): void => jsonStore.saveBacktestResult(result),
  clearBacktestResults: (): void => jsonStore.clearBacktestResults(),
  deleteBacktestResult: (id: string): boolean => jsonStore.deleteBacktestResult(id),
};
