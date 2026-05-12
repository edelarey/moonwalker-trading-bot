import cron from 'node-cron';
import { fetchPrevDayRange } from '../bybit/client';
import { logger } from '../logger';
import { store } from '../storage/store';
import { DailyRange } from '../types';

let engine: import('../strategy/breakBounce').BreakBounceEngine | null = null;
let symbols: string[] = [];

export function initScheduler(
  breakBounceEngine: import('../strategy/breakBounce').BreakBounceEngine,
  enabledSymbols: string[]
): void {
  engine = breakBounceEngine;
  symbols = enabledSymbols;

  // Run at UTC midnight every day: refresh all daily ranges
  cron.schedule('0 0 * * *', async () => {
    await refreshDailyRanges();
  }, { timezone: 'UTC' });

  logger.info('Scheduler initialized — daily range refresh at UTC 00:00');
}

export async function refreshDailyRanges(): Promise<void> {
  logger.info('Refreshing daily ranges for all symbols');
  const today = new Date();
  const dateStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

  for (const symbol of symbols) {
    try {
      const { high, low } = await fetchPrevDayRange(symbol);
      const range: DailyRange = { symbol, date: dateStr, high, low, fetchedAt: Date.now() };
      store.saveDailyRange(range);
      if (engine) engine.setDailyRange(range);
      logger.info('Daily range refreshed', { symbol, high, low });
    } catch (err) {
      logger.error('Failed to refresh daily range', { symbol, err });
    }
  }
}
