import { loadConfig } from '../config';
import { hasApiKeys } from '../security/secrets';
import { logger } from '../logger';
import { closePosition, getAccountEquity, placeMarketOrder } from '../bybit/client';
import { sizePosition } from '../strategy/riskManager';
import { store } from '../storage/store';
import { paperBroker } from './paperBroker';
import {
  Candle,
  ReversalSignal,
  StrategyInstance,
  StrategySignal,
  Trade,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

let broadcast: (data: unknown) => void = () => {};

export function setExecutionBroadcast(fn: (data: unknown) => void): void {
  broadcast = fn;
}

function tradingMode(): 'paper' | 'live' {
  return loadConfig().tradingMode ?? 'paper';
}

function tagFrom(signal: StrategySignal): string | undefined {
  const idx = signal.metadata?.gridIndex;
  return idx != null ? `grid:${idx}` : undefined;
}

function defaultStops(signal: StrategySignal): { sl: number; tp: number } {
  const price = signal.price;
  const dir = signal.direction ?? 'bullish';
  const sl = signal.stopLoss ?? (dir === 'bullish' ? price * 0.985 : price * 1.015);
  const tp = signal.takeProfit ?? (dir === 'bullish' ? price * 1.03 : price * 0.97);
  return { sl, tp };
}

function sizeOrder(
  equity: number,
  inst: StrategyInstance,
  signal: StrategySignal,
  sl: number,
): { positionSize: number; qty: number } {
  const config = loadConfig();
  const gridInv = signal.metadata?.investmentPerGrid;
  const dcaInv = signal.metadata?.investmentAmount;
  if (inst.strategyType === 'grid' && gridInv != null) {
    const positionSize = Number(gridInv);
    return { positionSize, qty: positionSize / signal.price };
  }
  if (inst.strategyType === 'dca' && dcaInv != null) {
    const positionSize = Number(dcaInv);
    return { positionSize, qty: positionSize / signal.price };
  }
  return sizePosition({
    equity,
    entryPrice: signal.price,
    stopLoss: sl,
    riskPercent: config.riskPercent,
    sizingMode: config.sizingMode ?? 'risk_percent',
    fixedPositionUsdt: config.fixedPositionUsdt ?? 100,
  });
}

function findOpen(inst: StrategyInstance, symbol: string, tag?: string): Trade | undefined {
  const mode = tradingMode();
  return store.getTrades().find(t => {
    if (t.status !== 'open') return false;
    if (t.symbol !== symbol) return false;
    if (t.strategyInstanceId && t.strategyInstanceId !== inst.id) return false;
    if (tag != null && t.tag !== tag) return false;
    if (mode === 'paper') return (t.mode ?? 'paper') === 'paper';
    return t.mode === 'live';
  });
}

export async function openFromSignal(signal: StrategySignal, inst: StrategyInstance): Promise<Trade | null> {
  if (signal.type !== 'entry' || !signal.direction) return null;
  const config = loadConfig();
  const mode = tradingMode();
  const tag = tagFrom(signal);
  const existing = findOpen(inst, signal.symbol, tag);

  if (existing && existing.direction !== signal.direction) {
    await closeFromSignal({ ...signal, type: 'exit' }, inst);
  } else if (existing && inst.strategyType !== 'grid') {
    logger.debug('Skip entry — already in position', { symbol: signal.symbol, strategy: inst.id });
    return null;
  }

  const { sl, tp } = defaultStops(signal);
  const equity = mode === 'paper' ? paperBroker.equity() : await getAccountEquity();
  const { positionSize, qty } = sizeOrder(equity, inst, signal, sl);

  if (mode === 'paper') {
    const trade = paperBroker.openMarket({
      symbol: signal.symbol,
      direction: signal.direction,
      price: signal.price,
      stopLoss: sl,
      takeProfit: tp,
      qty,
      positionSize,
      riskPercent: config.riskPercent,
      strategyInstanceId: inst.id,
      strategyType: inst.strategyType,
      patternType: String(signal.metadata?.patternType ?? inst.strategyType),
      tag,
    });
    broadcast({ type: 'trade_opened', trade });
    broadcast({ type: 'paper_account', account: paperBroker.getSnapshot() });
    return trade;
  }

  if (!hasApiKeys()) {
    throw new Error('Live trading requires Bybit API keys — save them in Settings');
  }

  const side = signal.direction === 'bullish' ? 'Buy' : 'Sell';
  const orderId = await placeMarketOrder({
    symbol: signal.symbol,
    side,
    qty: qty.toFixed(3),
    stopLoss: sl.toFixed(4),
    takeProfit: tp.toFixed(4),
  });

  const trade: Trade = {
    id: uuidv4(),
    symbol: signal.symbol,
    direction: signal.direction,
    entryPrice: signal.price,
    stopLoss: sl,
    takeProfit: tp,
    riskDistance: Math.abs(signal.price - sl),
    riskPercent: config.riskPercent,
    positionSize,
    qty,
    openedAt: Date.now(),
    status: 'open',
    bybitOrderId: orderId,
    isBacktest: false,
    mode: 'live',
    strategyInstanceId: inst.id,
    strategyType: inst.strategyType,
    tag,
    patternType: String(signal.metadata?.patternType ?? inst.strategyType),
    dailyHigh: 0,
    dailyLow: 0,
  };
  store.saveTrade(trade);
  broadcast({ type: 'trade_opened', trade });
  logger.info('Live trade opened', { symbol: trade.symbol, orderId });
  return trade;
}

export async function closeFromSignal(signal: StrategySignal, inst: StrategyInstance): Promise<Trade | null> {
  const tag = tagFrom(signal);
  const existing = findOpen(inst, signal.symbol, tag);
  if (!existing) return null;

  if ((existing.mode ?? 'paper') === 'paper') {
    const closed = paperBroker.closeTrade(existing, signal.price, 'closed_manual');
    broadcast({ type: 'trade_closed', trade: closed });
    broadcast({ type: 'paper_account', account: paperBroker.getSnapshot() });
    return closed;
  }

  const side = existing.direction === 'bullish' ? 'Buy' : 'Sell';
  await closePosition(existing.symbol, side, existing.qty.toFixed(3));
  const pnl = existing.direction === 'bullish'
    ? (signal.price - existing.entryPrice) * existing.qty
    : (existing.entryPrice - signal.price) * existing.qty;
  const closed: Trade = {
    ...existing,
    closePrice: signal.price,
    closedAt: Date.now(),
    pnl,
    pnlPercent: existing.positionSize > 0 ? (pnl / existing.positionSize) * 100 : 0,
    status: 'closed_manual',
  };
  store.updateTrade(existing.id, {
    closePrice: closed.closePrice,
    closedAt: closed.closedAt,
    pnl: closed.pnl,
    pnlPercent: closed.pnlPercent,
    status: closed.status,
  });
  broadcast({ type: 'trade_closed', trade: closed });
  return closed;
}

export async function openFromReversal(signal: ReversalSignal, inst: StrategyInstance): Promise<Trade | null> {
  return openFromSignal({
    type: 'entry',
    direction: signal.direction,
    symbol: signal.symbol,
    price: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    metadata: { patternType: signal.patternType },
    generatedAt: signal.detectedAt,
  }, inst);
}

export function processPaperCandle(symbol: string, candle: Candle): void {
  paperBroker.mark(symbol, candle.close);
  const closed = paperBroker.onCandle(symbol, candle);
  for (const trade of closed) {
    broadcast({ type: 'trade_closed', trade });
  }
  if (closed.length) {
    broadcast({ type: 'paper_account', account: paperBroker.getSnapshot() });
  }
}

export async function handleStrategySignal(strategyId: string, signal: StrategySignal, inst: StrategyInstance): Promise<void> {
  if (!inst.autoMode) return;
  try {
    if (signal.type === 'entry') await openFromSignal(signal, inst);
    else if (signal.type === 'exit') await closeFromSignal(signal, inst);
  } catch (err) {
    logger.error('Strategy execution failed', { strategyId, symbol: signal.symbol, err });
  }
}
