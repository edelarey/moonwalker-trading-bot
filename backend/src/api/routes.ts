import { Router, Request, Response } from 'express';
import { loadConfig, saveConfig } from '../config';
import { store } from '../storage/store';
import { runBacktest } from '../backtest/engine';
import { refreshDailyRanges } from '../scheduler/cron';
import { wsManager } from '../bybit/websocket';
import { getOpenPositions, closePosition, getLiveEquity, fetchTopLinearMarkets, resetBybitClient } from '../bybit/client';
import { logger } from '../logger';
import { ALL_STRATEGY_TYPES, BacktestParams, MAX_ENABLED_SYMBOLS, resolveEquitySource, StrategyInstance, StrategyType } from '../types';
import { clearStoredKeys, getApiKeyStatus, hasApiKeys, saveStoredKeys } from '../security/secrets';
import { Parser } from 'json2csv';
import { strategyRegistry } from '../strategy/registry';
import { getStrategyInstances, saveStrategyInstance, deleteStrategyInstance, resetStrategyParams, factoryParamsFor } from '../storage/strategyStore';
import { activateStrategy, deactivateStrategy, syncEngineSymbols, syncSubscriptions } from '../strategy/runtime';
import { resolveStopFillMode } from '../strategy/stopFill';
import { paperBroker } from '../execution/paperBroker';
import { v4 as uuidv4 } from 'uuid';
import { toIsoDate } from '../util/dates';
import { cancelSweep, cloneSweepCandidate, getSweepJob, startSweep, sweepPresets, defaultHoldoutStart } from '../strategy/sweepJob';

const router = Router();

function tradingMode(): 'paper' | 'live' {
  return loadConfig().tradingMode ?? 'paper';
}

// --- Config ---
router.get('/config', (_req: Request, res: Response) => {
  res.json(loadConfig());
});

router.put('/config', (req: Request, res: Response) => {
  try {
    const current = loadConfig();
    const updated = { ...current, ...req.body };
    if (updated.tradingMode === 'live' && !hasApiKeys()) {
      return res.status(400).json({ error: 'Save Bybit API keys in Settings before switching to live' }) as any;
    }
    if (req.body?.equitySource != null && req.body.equitySource !== 'usdt' && req.body.equitySource !== 'unified_usd') {
      return res.status(400).json({ error: 'equitySource must be usdt or unified_usd' }) as any;
    }
    if (updated.equitySource != null) {
      updated.equitySource = resolveEquitySource(updated.equitySource);
    }
    if (Array.isArray(updated.symbols)) {
      let enabledSeen = 0;
      updated.symbols = updated.symbols.map((s: { symbol: string; enabled: boolean; addedAt: number }) => {
        if (s.enabled) {
          if (enabledSeen < MAX_ENABLED_SYMBOLS) { enabledSeen++; return s; }
          return { ...s, enabled: false };
        }
        return s;
      });
    }
    saveConfig(updated);
    syncSubscriptions();
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
  if (config.symbols.find(s => s.symbol === symbol)) {
    return res.status(409).json({ error: 'Symbol already exists' }) as any;
  }
  const enabledCount = config.symbols.filter(s => s.enabled).length;
  const willBeEnabled = enabledCount < MAX_ENABLED_SYMBOLS;
  const upper = symbol.toUpperCase();
  config.symbols.push({ symbol: upper, enabled: willBeEnabled, addedAt: Date.now() });
  saveConfig(config);
  if (willBeEnabled) {
    syncEngineSymbols();
    syncSubscriptions();
  }
  res.status(201).json(config.symbols);
});

router.post('/symbols/bulk', (req: Request, res: Response) => {
  const config = loadConfig();
  const incoming = (req.body?.symbols as string[] | undefined) ?? [];
  const enable = req.body?.enabled !== false;
  let enabledCount = config.symbols.filter(s => s.enabled).length;
  for (const raw of incoming) {
    const symbol = String(raw).toUpperCase();
    if (!symbol.endsWith('USDT')) continue;
    const existing = config.symbols.find(s => s.symbol === symbol);
    if (existing) {
      if (enable && !existing.enabled && enabledCount < MAX_ENABLED_SYMBOLS) {
        existing.enabled = true;
        enabledCount++;
      }
    } else {
      const willEnable = enable && enabledCount < MAX_ENABLED_SYMBOLS;
      config.symbols.push({ symbol, enabled: willEnable, addedAt: Date.now() });
      if (willEnable) enabledCount++;
    }
  }
  saveConfig(config);
  syncEngineSymbols();
  syncSubscriptions();
  res.json(config.symbols);
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

router.get('/markets/top', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit || '50'), 10) || 50));
    const markets = await fetchTopLinearMarkets(limit);
    res.json(markets);
  } catch (err: any) {
    logger.error('Failed to fetch top markets', { err });
    res.status(500).json({ error: err.message || 'Failed to fetch Bybit markets' });
  }
});

router.get('/keys', (_req: Request, res: Response) => {
  res.json(getApiKeyStatus());
});

router.put('/keys', (req: Request, res: Response) => {
  const { apiKey, apiSecret, testnet, label } = req.body as {
    apiKey?: string; apiSecret?: string; testnet?: boolean; label?: string;
  };
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'apiKey and apiSecret are required' }) as any;
  }
  const status = saveStoredKeys({
    apiKey,
    apiSecret,
    testnet: Boolean(testnet),
    label,
  });
  resetBybitClient();
  res.json(status);
});

router.delete('/keys', (_req: Request, res: Response) => {
  clearStoredKeys();
  resetBybitClient();
  const current = loadConfig();
  if (current.tradingMode === 'live') {
    current.tradingMode = 'paper';
    saveConfig(current);
  }
  res.json(getApiKeyStatus());
});

router.delete('/trades', (_req: Request, res: Response) => {
  store.clearTrades();
  const account = paperBroker.wipeAfterHistoryClear();
  logger.info('Trade history cleared');
  res.json({ ok: true, account });
});

router.get('/trades/export-csv', (_req: Request, res: Response) => {
  const trades = store.getTrades();
  const fields = ['id', 'symbol', 'direction', 'entryPrice', 'closePrice', 'pnl', 'status', 'openedAt', 'closedAt', 'mode', 'strategyType'];
  const parser = new Parser({ fields });
  const csv = parser.parse(trades);
  res.header('Content-Type', 'text/csv');
  res.attachment('trades.csv');
  res.send(csv);
});

// --- Positions ---
router.get('/positions', async (_req: Request, res: Response) => {
  try {
    if (tradingMode() === 'paper') {
      return res.json(paperBroker.getPositions()) as any;
    }
    const positions = await getOpenPositions();
    res.json(positions);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

router.post('/positions/:symbol/close', async (req: Request, res: Response) => {
  try {
    const { side, qty, tradeId } = req.body as { side?: 'Buy' | 'Sell'; qty?: string; tradeId?: string };
    if (tradingMode() === 'paper') {
      if (tradeId) {
        const closed = paperBroker.closeById(tradeId);
        if (!closed) return res.status(404).json({ error: 'Paper position not found' }) as any;
        return res.json({ trade: closed }) as any;
      }
      const closed = paperBroker.closeSymbol(req.params.symbol);
      return res.json({ closed: closed.length, trades: closed }) as any;
    }
    if (!side || !qty) return res.status(400).json({ error: 'side and qty required' }) as any;
    const orderId = await closePosition(req.params.symbol, side, qty);
    res.json({ orderId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Account ---
router.get('/account/equity', async (_req: Request, res: Response) => {
  try {
    if (tradingMode() === 'paper') {
      const snap = paperBroker.getSnapshot();
      return res.json(snap) as any;
    }
    const snap = await getLiveEquity();
    res.json(snap);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/paper/account', (_req: Request, res: Response) => {
  res.json(paperBroker.getSnapshot());
});

router.post('/paper/reset', (req: Request, res: Response) => {
  const starting = typeof req.body?.startingEquity === 'number' ? req.body.startingEquity : undefined;
  res.json(paperBroker.reset(starting));
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

router.delete('/backtest/results', (_req: Request, res: Response) => {
  store.clearBacktestResults();
  logger.info('Backtest history cleared');
  res.json({ ok: true });
});

router.delete('/backtest/results/:id', (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id || id === 'undefined' || id === 'null') {
    return res.status(400).json({ error: 'Missing backtest id' }) as any;
  }
  const ok = store.deleteBacktestResult(id);
  if (!ok) return res.status(404).json({ error: 'Not found' }) as any;
  res.json({ ok: true });
});

router.get('/backtest/results/:id/export-csv', (req: Request, res: Response) => {
  const result = store.getBacktestResults().find(r => r.id === req.params.id);
  if (!result) return res.status(404).json({ error: 'Not found' }) as any;
  const fields = ['id', 'symbol', 'direction', 'entryPrice', 'closePrice', 'stopLoss', 'takeProfit', 'positionSize', 'leverage', 'qty', 'pnl', 'pnlPercent', 'status', 'patternType', 'openedAt', 'closedAt'];
  const parser = new Parser({ fields });
  const csv = parser.parse(result.trades);
  res.header('Content-Type', 'text/csv');
  res.attachment(`backtest-${result.id}.csv`);
  res.send(csv);
});

function parseInstanceBody(body: Record<string, unknown>, existing?: StrategyInstance): Omit<StrategyInstance, 'id' | 'createdAt' | 'updatedAt'> {
  const strategyType = (body.strategyType || body.type || existing?.strategyType) as StrategyType;
  return {
    name: String(body.name ?? existing?.name ?? 'Untitled'),
    strategyType,
    symbols: (body.symbols as string[]) ?? existing?.symbols ?? [],
    params: (body.params as Record<string, unknown>) ?? existing?.params ?? {},
    enabled: body.enabled != null ? Boolean(body.enabled) : existing?.enabled ?? false,
    autoMode: body.autoMode != null ? Boolean(body.autoMode) : existing?.autoMode ?? false,
  };
}

// --- Strategy Instances ---
router.get('/strategies', (_req: Request, res: Response) => {
  res.json(getStrategyInstances());
});

router.get('/strategies/defaults/:type', (req: Request, res: Response) => {
  const type = req.params.type as StrategyType;
  if (!ALL_STRATEGY_TYPES.includes(type)) {
    return res.status(404).json({ error: `Unknown strategy type: ${type}` }) as any;
  }
  try {
    res.json(factoryParamsFor(type));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/strategies', async (req: Request, res: Response) => {
  const body = parseInstanceBody(req.body);
  const inst: StrategyInstance = { ...body, id: uuidv4(), createdAt: Date.now(), updatedAt: Date.now() };
  saveStrategyInstance(inst);
  const saved = getStrategyInstances().find(s => s.id === inst.id)!;
  await activateStrategy(saved);
  res.status(201).json(saved);
});

router.put('/strategies/:id', async (req: Request, res: Response) => {
  const existing = getStrategyInstances().find(s => s.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' }) as any;
  const body = parseInstanceBody(req.body, existing);
  const updated: StrategyInstance = { ...existing, ...body, id: existing.id, updatedAt: Date.now() };
  saveStrategyInstance(updated);
  const saved = getStrategyInstances().find(s => s.id === updated.id)!;
  await activateStrategy(saved);
  res.json(saved);
});

router.delete('/strategies/:id', (req: Request, res: Response) => {
  deactivateStrategy(req.params.id);
  deleteStrategyInstance(req.params.id);
  res.json({ ok: true });
});

router.post('/strategies/:id/reset-defaults', async (req: Request, res: Response) => {
  const saved = resetStrategyParams(req.params.id);
  if (!saved) return res.status(404).json({ error: 'Not found' }) as any;
  await activateStrategy(saved);
  res.json(saved);
});

router.post('/strategies/:id/backtest', async (req: Request, res: Response) => {
  const inst = getStrategyInstances().find(s => s.id === req.params.id);
  if (!inst) return res.status(404).json({ error: 'Not found' }) as any;
  try {
    const config = loadConfig();
    const symbols: string[] = req.body.symbols?.length
      ? req.body.symbols
      : (inst.symbols.length ? inst.symbols : config.symbols.filter(s => s.enabled).map(s => s.symbol));
    const leverage = Number(req.body.leverage) > 0
      ? Number(req.body.leverage)
      : (Number((inst.params as Record<string, unknown>)?.leverage) || config.leverage || 1);
    const startDate = toIsoDate(req.body.startDate);
    const endDate = toIsoDate(req.body.endDate);
    const result = await strategyRegistry.runBacktest(inst, {
      symbols,
      startDate,
      endDate,
      params: inst.params,
      riskPercent: req.body.riskPercent ?? config.riskPercent,
      startingEquity: req.body.startingEquity ?? config.paperStartingEquity ?? 10_000,
      leverage,
    });
    const saved = {
      id: uuidv4(),
      params: {
        symbols,
        startDate,
        endDate,
        riskPercent: req.body.riskPercent ?? config.riskPercent,
        tpMultiplier: config.tpMultiplier,
        liquidityWindowStart: config.liquidityWindowStart,
        liquidityWindowEnd: config.liquidityWindowEnd,
        breakoutBufferPercent: config.breakoutBufferPercent,
        leverage,
        sizingMode: config.sizingMode ?? 'risk_percent',
        fixedPositionUsdt: config.fixedPositionUsdt ?? 100,
        strategyParams: { ...(inst.params as Record<string, unknown>) },
        stopFillMode: resolveStopFillMode(inst.params as Record<string, unknown>, config.stopFillMode),
      },
      trades: result.trades,
      summary: result.summary,
      runAt: Date.now(),
      strategyType: result.strategyType,
      instanceName: result.instanceName,
      instanceId: inst.id,
    };
    store.saveBacktestResult(saved);
    res.json({
      ...result,
      id: saved.id,
      summary: result.summary,
      totalTrades: result.summary.totalTrades,
      winRate: result.summary.winRate,
      totalPnl: result.summary.totalPnl,
      maxDrawdown: result.summary.maxDrawdown,
    });
  } catch (err: any) {
    logger.error('Strategy backtest failed', { err });
    res.status(500).json({ error: err.message });
  }
});

// --- Parameter sweep (compare grids; does not enable Auto or live) ---
router.get('/sweep', (_req: Request, res: Response) => {
  res.json(getSweepJob());
});

router.get('/sweep/presets', (_req: Request, res: Response) => {
  res.json({ types: sweepPresets() });
});

router.get('/sweep/default-holdout', (req: Request, res: Response) => {
  const startDate = toIsoDate(req.query.startDate);
  const endDate = toIsoDate(req.query.endDate);
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' }) as any;
  res.json({ holdoutStart: defaultHoldoutStart(startDate, endDate) });
});

router.post('/sweep/run', (req: Request, res: Response) => {
  try {
    const created = startSweep(req.body as Record<string, unknown>);
    res.status(202).json(created);
  } catch (err: any) {
    const msg = err?.message ?? 'Sweep failed';
    const code = msg.includes('already running') ? 409 : 400;
    res.status(code).json({ error: msg });
  }
});

router.post('/sweep/cancel', (_req: Request, res: Response) => {
  res.json(cancelSweep());
});

router.post('/sweep/clone', (req: Request, res: Response) => {
  try {
    const id = String(req.body?.candidateId ?? '');
    if (!id) return res.status(400).json({ error: 'candidateId required' }) as any;
    const inst = cloneSweepCandidate(id);
    res.status(201).json(inst);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Clone failed' });
  }
});

export default router;
