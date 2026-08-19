import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { env, loadConfig } from './config';
import { logger } from './logger';
import { wsManager, CandleUpdate } from './bybit/websocket';
import { BreakBounceEngine } from './strategy/breakBounce';
import { initScheduler, refreshDailyRanges, stopScheduler } from './scheduler/cron';
import { ReversalSignal } from './types';
import apiRouter from './api/routes';
import { errorHandler, requestLogger } from './api/middleware';
import { strategyRegistry } from './strategy/registry';
import { getStrategyInstances, seedDefaultStrategies } from './storage/strategyStore';
import { activateStrategy, collectRequiredIntervals, enabledSymbols, setBreakBounceEngine, syncSubscriptions } from './strategy/runtime';
import { resolveApiCredentials } from './security/secrets';
import {
  handleStrategySignal,
  openFromReversal,
  processPaperCandle,
  setExecutionBroadcast,
} from './execution/executionService';
import { paperBroker } from './execution/paperBroker';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(requestLogger);
app.use('/api', apiRouter);
app.use(errorHandler);

const httpServer = createServer(app);

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

function broadcast(data: unknown): void {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

setExecutionBroadcast(broadcast);

wss.on('connection', (ws) => {
  logger.info('Frontend WebSocket client connected');
  ws.send(JSON.stringify({ type: 'paper_account', account: paperBroker.getSnapshot() }));
  ws.on('close', () => logger.info('Frontend WebSocket client disconnected'));
});

async function boot(): Promise<void> {
  const config = loadConfig();
  const symbols = enabledSymbols();
  const engine = new BreakBounceEngine(config);
  setBreakBounceEngine(engine);

  await seedDefaultStrategies();
  initScheduler(engine, symbols);
  await refreshDailyRanges();

  const creds = resolveApiCredentials();
  wsManager.connect(creds.testnet);
  wsManager.subscribeSymbols(symbols, collectRequiredIntervals());

  let ready = false;

  wsManager.on('candle', async (update: CandleUpdate) => {
    if (!update.confirmed) return;
    broadcast({ type: 'candle', ...update });
    paperBroker.mark(update.symbol, update.candle.close);
    if (!ready) return;

    processPaperCandle(update.symbol, update.candle);

    const currentConfig = loadConfig();
    if (update.interval === currentConfig.breakoutTimeframe) {
      engine.process15mCandle(update.symbol, update.candle);
    } else if (update.interval === currentConfig.entryTimeframe) {
      engine.process5mCandle(update.symbol, update.candle);
    }

    strategyRegistry.routeCandle(update.symbol, update.candle, update.interval);
  });

  engine.on('breakout', (signal) => {
    broadcast({ type: 'breakout', signal });
    logger.info('Broadcast breakout', { symbol: signal.symbol, direction: signal.direction });
  });

  engine.on('retest', (signal) => {
    broadcast({ type: 'retest', signal });
  });

  engine.on('reversal', async (signal: ReversalSignal) => {
    broadcast({ type: 'reversal', signal });
    logger.info('Reversal signal, checking AUTO mode', { symbol: signal.symbol });

    const currentConfig = loadConfig();
    if (!currentConfig.autoMode) {
      logger.info('AUTO mode OFF — skipping auto trade', { symbol: signal.symbol });
      return;
    }

    try {
      const trade = await openFromReversal(signal);
      if (trade) engine.recordTrade(signal.symbol);
    } catch (err) {
      logger.error('AUTO trade failed', { symbol: signal.symbol, err });
    }
  });

  const savedInstances = getStrategyInstances();
  for (const inst of savedInstances.filter(s => s.enabled)) {
    await activateStrategy(inst);
  }

  strategyRegistry.on('signal', (data: { strategyId: string; signal: any }) => {
    const inst = getStrategyInstances().find(s => s.id === data.strategyId);
    broadcast({
      type: 'strategy_signal',
      strategyId: data.strategyId,
      strategyName: inst?.name ?? data.strategyId,
      signal: data.signal,
    });
    if (inst) {
      void handleStrategySignal(data.strategyId, data.signal, inst);
    }
  });

  syncSubscriptions();
  ready = true;

  const mode = config.tradingMode ?? 'paper';
  httpServer.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`Moonwalker backend running on port ${env.PORT}`);
    logger.info(`Storage mode: ${config.storageMode}`);
    logger.info(`Trading mode: ${mode}`);
    logger.info(`Bybit testnet: ${config.testnet}`);
    logger.info(`Tracking ${symbols.length} symbols`);
    if (mode === 'paper') {
      const snap = paperBroker.getSnapshot();
      logger.info('Paper account', { equity: snap.equity, starting: snap.startingEquity });
    }
  });
}

boot().catch(err => {
  logger.error('Boot failed', { err });
  process.exit(1);
});

let shuttingDown = false;

function closeFrontendSockets(): void {
  wss.clients.forEach(client => {
    try { client.close(1001, 'server shutting down'); } catch { /* ignore */ }
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Graceful shutdown started', { signal });

  const force = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 8_000);
  force.unref();

  try {
    stopScheduler();
    wsManager.disconnect();
    closeFrontendSockets();

    await new Promise<void>((resolve, reject) => {
      wss.close(err => (err ? reject(err) : resolve()));
    }).catch(err => logger.warn('WebSocket server close error', { err }));

    await new Promise<void>((resolve, reject) => {
      httpServer.close(err => (err ? reject(err) : resolve()));
    });

    await new Promise<void>(resolve => logger.end(() => resolve()));
  } catch (err) {
    logger.error('Error during shutdown', { err });
    process.exit(1);
    return;
  }

  process.exit(0);
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err });
  void shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});
