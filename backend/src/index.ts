import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { env, loadConfig } from './config';
import { logger } from './logger';
import { wsManager, CandleUpdate } from './bybit/websocket';
import { BreakBounceEngine } from './strategy/breakBounce';
import { initScheduler, refreshDailyRanges } from './scheduler/cron';
import { store } from './storage/store';
import { placeMarketOrder, getAccountEquity } from './bybit/client';
import { calcPositionSize } from './strategy/riskManager';
import { ReversalSignal } from './types';
import apiRouter from './api/routes';
import { errorHandler, requestLogger } from './api/middleware';
import { v4 as uuidv4 } from 'uuid';
import { strategyRegistry } from './strategy/registry';
import { getStrategyInstances, seedDefaultStrategies } from './storage/strategyStore';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(requestLogger);
app.use('/api', apiRouter);
app.use(errorHandler);

const httpServer = createServer(app);

// --- Internal WebSocket (push updates to frontend) ---
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

function broadcast(data: unknown): void {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

wss.on('connection', (ws) => {
  logger.info('Frontend WebSocket client connected');
  ws.on('close', () => logger.info('Frontend WebSocket client disconnected'));
});

// --- Boot sequence ---
async function boot(): Promise<void> {
  const config = loadConfig();
  // Only subscribe to WebSocket feeds for enabled symbols (max 20)
  const enabledSymbols = config.symbols.filter(s => s.enabled).map(s => s.symbol);

  // Only enabled symbols are passed to the engine — disabled symbols are not tracked
  const engine = new BreakBounceEngine(config);

  // Seed default strategy instances if none exist
  await seedDefaultStrategies();

  // Initialize scheduler
  initScheduler(engine, enabledSymbols);

  // Fetch daily ranges on startup
  await refreshDailyRanges();

  // Connect WebSocket to Bybit
  wsManager.connect(config.testnet);
  wsManager.subscribeSymbols(enabledSymbols, [config.breakoutTimeframe, config.entryTimeframe]);

  // Wire up Bybit WS candle events → strategy engine
  wsManager.on('candle', async (update: CandleUpdate) => {
    // Only process confirmed (closed) candles
    if (!update.confirmed) return;

    broadcast({ type: 'candle', ...update });

    const currentConfig = loadConfig();
    if (update.interval === currentConfig.breakoutTimeframe) {
      engine.process15mCandle(update.symbol, update.candle);
    } else if (update.interval === currentConfig.entryTimeframe) {
      engine.process5mCandle(update.symbol, update.candle);
    }

    // Route candle to all registered strategy instances
    strategyRegistry.routeCandle(update.symbol, update.candle, update.interval);
  });

  // Wire up strategy engine events → trade execution (AUTO mode)
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

    // Check if AUTO mode is enabled (stored in config)
    const currentConfig = loadConfig();
    if (!(currentConfig as any).autoMode) {
      logger.info('AUTO mode OFF — skipping auto trade', { symbol: signal.symbol });
      return;
    }

    // AUTO mode: execute the trade
    try {
      const equity = await getAccountEquity();
      const { positionSize, qty } = calcPositionSize(
        equity,
        currentConfig.riskPercent,
        signal.entryPrice,
        signal.stopLoss
      );
      const side = signal.direction === 'bullish' ? 'Buy' : 'Sell';
      const orderId = await placeMarketOrder({
        symbol: signal.symbol,
        side,
        qty: qty.toFixed(3),
        stopLoss: signal.stopLoss.toFixed(4),
        takeProfit: signal.takeProfit.toFixed(4),
      });

      const trade = {
        id: uuidv4(),
        symbol: signal.symbol,
        direction: signal.direction,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskDistance: signal.riskDistance,
        riskPercent: currentConfig.riskPercent,
        positionSize,
        qty,
        openedAt: Date.now(),
        status: 'open' as const,
        bybitOrderId: orderId,
        isBacktest: false,
        patternType: signal.patternType,
        dailyHigh: signal.retest.breakout.brokenLevel,
        dailyLow: signal.retest.breakout.brokenLevel,
      };
      store.saveTrade(trade);
      engine.recordTrade(signal.symbol);
      broadcast({ type: 'trade_opened', trade });
      logger.info('AUTO trade opened', { symbol: signal.symbol, orderId });
    } catch (err) {
      logger.error('AUTO trade failed', { symbol: signal.symbol, err });
    }
  });

  // Load and register saved strategy instances
  const savedInstances = getStrategyInstances();
  for (const inst of savedInstances.filter(s => s.enabled)) {
    try {
      const strategy = strategyRegistry.createStrategy(inst);
      strategyRegistry.register(strategy);
    } catch (err) {
      logger.warn('Failed to load strategy instance', { id: inst.id, err });
    }
  }

  // Emit signals to frontend
  strategyRegistry.on('signal', (data) => {
    broadcast({ type: 'strategy_signal', ...data });
  });

  httpServer.listen(env.PORT, () => {
    logger.info(`BreakBounce backend running on port ${env.PORT}`);
    logger.info(`Storage mode: ${config.storageMode}`);
    logger.info(`Bybit testnet: ${config.testnet}`);
    logger.info(`Tracking ${enabledSymbols.length} symbols`);
  });
}

boot().catch(err => {
  logger.error('Boot failed', { err });
  process.exit(1);
});
