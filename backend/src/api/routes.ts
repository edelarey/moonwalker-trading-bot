import { Router, Request, Response, NextFunction } from 'express';
import { loadConfig, saveConfig } from '../config';
import { store } from '../storage/store';
import { runBacktest } from '../backtest/engine';
import { refreshDailyRanges } from '../scheduler/cron';
import { wsManager } from '../bybit/websocket';
import { getOpenPositions, closePosition, getAccountEquity } from '../bybit/client';
import { logger } from '../logger';
import { BacktestParams, StrategyInstance, StrategyType } from '../types';
import { Parser } from 'json2csv';
import { strategyRegistry } from '../strategy/registry';
import { getStrategyInstances, saveStrategyInstance, deleteStrategyInstance } from '../storage/strategyStore';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// --- Config ---
router.get('/config', (_req: Request, res: Response) => {
  res.json(loadConfig());
});

router.put('/config', (req: Request, res: Response) => {
  try {
    const current = loadConfig();
    const updated = { ...current, ...req.body };
    // Cap enabled symbols at 20: if incoming symbols array has more than 20 enabled,
    // keep the first 20 enabled and force the rest to disabled.
    if (Array.isArray(updated.symbols)) {
      let enabledSeen = 0;
      updated.symbols = updated.symbols.map((s: { symbol: string; enabled: boolean; addedAt: number }) => {
        if (s.enabled) {
          if (enabledSeen < 20) { enabledSeen++; return s; }
          return { ...s, enabled: false };
        }
        return s;
      });
    }
    saveConfig(updated);
    res.json(updated);
  } catch (_err) {
    res.status(400).json({ error: 'Invalid config' });
  }
});

// --- Symbols ---
router.get('/symbols', (_req: Request, res: Response) => {
  res.json(loadConfig().symbols);
});

router.post('/symbols', (req: Request, res: Response) => {
  const config = loadConfig();
  const { symbol } = req.body as { symbol: string };
  if (!symbol) return res.status(400).json({ error: 'symbol required' }) as any;
  // 409 only for duplicates — there is no total-list size limit.
  if (config.symbols.find(s => s.symbol === symbol)) {
    return res.status(409).json({ error: 'Symbol already exists' }) as any;
  }
  // Only actively track (subscribe via WebSocket) if fewer than 20 symbols are already enabled.
  // If the active limit is reached the symbol is added as disabled (inactive) so it sits in the
  // list without consuming API quota until the user enables it manually.
  const enabledCount = config.symbols.filter(s => s.enabled).length;
  const willBeEnabled = enabledCount < 20;
  const upper = symbol.toUpperCase();
  config.symbols.push({ symbol: upper, enabled: willBeEnabled, addedAt: Date.now() });
  saveConfig(config);
  if (willBeEnabled) wsManager.subscribeSymbols([upper]);
  res.status(201).json(config.symbols);
});

router.delete('/symbols/:symbol', (req: Request, res: Response) => {
  const config = loadConfig();
  config.symbols = config.symbols.filter(s => s.symbol !== req.params.symbol.toUpperCase());
  saveConfig(config);
  wsManager.unsubscribeSymbol(req.params.symbol.toUpperCase());
  res.json(config.symbols);
});

// --- Daily Ranges ---
router.get('/daily-ranges', (_req: Request, res: Response) => {
  res.json(store.getDailyRanges());
});

router.post('/daily-ranges/refresh', async (_req: Request, res: Response) => {
  try {
    await refreshDailyRanges();
    res.json({ ok: true });
  } catch (_err) {
    res.status(500).json({ error: 'Refresh failed' });
  }
});

// --- Trades ---
router.get('/trades', (_req: Request, res: Response) => {
  res.json(store.getTrades());
});

router.get('/trades/export-csv', (_req: Request, res: Response) => {
  const trades = store.getTrades();
  const fields = ['id', 'symbol', 'direction', 'entryPrice', 'closePrice', 'pnl', 'status', 'openedAt', 'closedAt'];
  const parser = new Parser({ fields });
  const csv = parser.parse(trades);
  res.header('Content-Type', 'text/csv');
  res.attachment('trades.csv');
  res.send(csv);
});

// --- Positions ---
router.get('/positions', async (_req: Request, res: Response) => {
  try {
    const positions = await getOpenPositions();
    res.json(positions);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

router.post('/positions/:symbol/close', async (req: Request, res: Response) => {
  try {
    const { side, qty } = req.body as { side: 'Buy' | 'Sell'; qty: string };
    const orderId = await closePosition(req.params.symbol, side, qty);
    res.json({ orderId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Account ---
router.get('/account/equity', async (_req: Request, res: Response) => {
  try {
    const equity = await getAccountEquity();
    res.json({ equity });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Backtesting ---
router.post('/backtest/run', async (req: Request, res: Response) => {
  try {
    const params: BacktestParams = req.body;
    const result = await runBacktest(params);
    store.saveBacktestResult(result);
    res.json(result);
  } catch (err: any) {
    logger.error('Backtest failed', { err });
    res.status(500).json({ error: err.message });
  }
});

router.get('/backtest/results', (_req: Request, res: Response) => {
  res.json(store.getBacktestResults());
});

router.get('/backtest/results/:id/export-csv', (req: Request, res: Response) => {
  const result = store.getBacktestResults().find(r => r.id === req.params.id);
  if (!result) return res.status(404).json({ error: 'Not found' }) as any;
  const fields = ['id', 'symbol', 'direction', 'entryPrice', 'closePrice', 'pnl', 'pnlPercent', 'status', 'patternType', 'openedAt', 'closedAt'];
  const parser = new Parser({ fields });
  const csv = parser.parse(result.trades);
  res.header('Content-Type', 'text/csv');
  res.attachment(`backtest-${result.id}.csv`);
  res.send(csv);
});

// --- Strategy Instances ---
router.get('/strategies', (_req: Request, res: Response) => {
  res.json(getStrategyInstances());
});

router.get('/strategies/defaults/:type', (req: Request, res: Response) => {
  const type = req.params.type as StrategyType;
  const validTypes: StrategyType[] = ['break_bounce', 'dca', 'grid', 'ma_crossover', 'rsi', 'bollinger'];
  if (!validTypes.includes(type)) {
    return res.status(404).json({ error: `Unknown strategy type: ${type}` }) as any;
  }
  const config = loadConfig();
  if (config.strategyDefaults && config.strategyDefaults[type]) {
    return res.json(config.strategyDefaults[type]) as any;
  }
  // Fallback to hardcoded defaults from registry
  try {
    const defaults = strategyRegistry.getDefaultParams(type);
    res.json(defaults);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/strategies', (req: Request, res: Response) => {
  const body = req.body as Omit<StrategyInstance, 'id' | 'createdAt' | 'updatedAt'>;
  const inst: StrategyInstance = { ...body, id: uuidv4(), createdAt: Date.now(), updatedAt: Date.now() };
  saveStrategyInstance(inst);
  res.status(201).json(inst);
});

router.put('/strategies/:id', (req: Request, res: Response) => {
  const existing = getStrategyInstances().find(s => s.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' }) as any;
  const updated: StrategyInstance = { ...existing, ...req.body, id: existing.id, updatedAt: Date.now() };
  saveStrategyInstance(updated);
  res.json(updated);
});

router.delete('/strategies/:id', (req: Request, res: Response) => {
  deleteStrategyInstance(req.params.id);
  res.json({ ok: true });
});

router.post('/strategies/:id/backtest', async (req: Request, res: Response) => {
  const inst = getStrategyInstances().find(s => s.id === req.params.id);
  if (!inst) return res.status(404).json({ error: 'Not found' }) as any;
  try {
    const result = await strategyRegistry.runBacktest(inst, { ...req.body, params: inst.params });
    res.json(result);
  } catch (err: any) {
    logger.error('Strategy backtest failed', { err });
    res.status(500).json({ error: err.message });
  }
});

export default router;
