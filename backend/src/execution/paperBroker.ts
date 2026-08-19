import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig } from '../config';
import { logger } from '../logger';
import { store } from '../storage/store';
import {
  BreakoutDirection,
  Candle,
  PaperAccountSnapshot,
  PaperPositionView,
  Trade,
  TradeStatus,
} from '../types';

interface PaperAccountState {
  startingEquity: number;
  realizedPnl: number;
  totalFees: number;
  updatedAt: number;
}

export interface PaperOpenRequest {
  symbol: string;
  direction: BreakoutDirection;
  price: number;
  stopLoss: number;
  takeProfit: number;
  qty: number;
  positionSize: number;
  leverage?: number;
  riskPercent: number;
  strategyInstanceId?: string;
  strategyType?: string;
  patternType?: string;
  tag?: string;
  dailyHigh?: number;
  dailyLow?: number;
}

const dataDir = path.join(__dirname, '..', '..', 'data');
const accountPath = path.join(dataDir, 'paper-account.json');

function defaultState(): PaperAccountState {
  const config = loadConfig();
  return {
    startingEquity: config.paperStartingEquity ?? 10_000,
    realizedPnl: 0,
    totalFees: 0,
    updatedAt: Date.now(),
  };
}

function readState(): PaperAccountState {
  try {
    if (!fs.existsSync(accountPath)) return defaultState();
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(accountPath, 'utf-8')) };
  } catch {
    return defaultState();
  }
}

function writeState(state: PaperAccountState): void {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(accountPath, JSON.stringify(state, null, 2));
}

function round(n: number, decimals = 8): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export class PaperBroker {
  private lastPrice = new Map<string, number>();
  private state: PaperAccountState;

  constructor() {
    this.state = readState();
  }

  reload(): void {
    this.state = readState();
  }

  mark(symbol: string, price: number): void {
    this.lastPrice.set(symbol, price);
  }

  lastMark(symbol: string): number {
    return this.lastPrice.get(symbol) ?? 0;
  }

  private feeBps(): number {
    return loadConfig().paperFeeBps ?? 6;
  }

  private slipBps(): number {
    return loadConfig().paperSlippageBps ?? 2;
  }

  private applySlippage(price: number, side: 'buy' | 'sell'): number {
    const slip = price * (this.slipBps() / 10_000);
    return side === 'buy' ? price + slip : price - slip;
  }

  private feeOn(notional: number): number {
    return Math.abs(notional) * (this.feeBps() / 10_000);
  }

  openTrades(): Trade[] {
    return store.getTrades().filter(t => t.status === 'open' && (t.mode ?? 'paper') === 'paper');
  }

  findOpen(opts: { strategyInstanceId?: string; symbol: string; tag?: string }): Trade | undefined {
    return this.openTrades().find(t => {
      if (t.symbol !== opts.symbol) return false;
      if (opts.strategyInstanceId && t.strategyInstanceId !== opts.strategyInstanceId) return false;
      if (opts.tag != null && t.tag !== opts.tag) return false;
      return true;
    });
  }

  realizedEquity(): number {
    return this.state.startingEquity + this.state.realizedPnl;
  }

  unrealizedPnl(): number {
    let u = 0;
    for (const t of this.openTrades()) {
      const mark = this.lastPrice.get(t.symbol) ?? t.entryPrice;
      u += t.direction === 'bullish'
        ? (mark - t.entryPrice) * t.qty
        : (t.entryPrice - mark) * t.qty;
    }
    return u;
  }

  equity(): number {
    return this.realizedEquity() + this.unrealizedPnl();
  }

  openMarket(req: PaperOpenRequest): Trade {
    const side: 'buy' | 'sell' = req.direction === 'bullish' ? 'buy' : 'sell';
    const fill = this.applySlippage(req.price, side);
    const qty = req.qty;
    const entryFee = this.feeOn(qty * fill);
    const trade: Trade = {
      id: uuidv4(),
      symbol: req.symbol,
      direction: req.direction,
      entryPrice: round(fill, 8),
      stopLoss: req.stopLoss,
      takeProfit: req.takeProfit,
      riskDistance: Math.abs(fill - req.stopLoss),
      riskPercent: req.riskPercent,
      positionSize: req.positionSize,
      leverage: req.leverage,
      qty,
      openedAt: Date.now(),
      fees: entryFee,
      status: 'open',
      isBacktest: false,
      mode: 'paper',
      strategyInstanceId: req.strategyInstanceId,
      strategyType: req.strategyType,
      tag: req.tag,
      patternType: req.patternType ?? req.strategyType ?? 'paper',
      dailyHigh: req.dailyHigh ?? 0,
      dailyLow: req.dailyLow ?? 0,
    };
    store.saveTrade(trade);
    this.mark(req.symbol, fill);
    this.state.updatedAt = Date.now();
    writeState(this.state);
    logger.info('Paper fill opened', {
      symbol: trade.symbol,
      direction: trade.direction,
      fill: trade.entryPrice,
      qty: trade.qty,
      strategyType: trade.strategyType,
    });
    return trade;
  }

  closeTrade(trade: Trade, rawExit: number, status: Exclude<TradeStatus, 'open'>): Trade {
    const side: 'buy' | 'sell' = trade.direction === 'bullish' ? 'sell' : 'buy';
    const fill = this.applySlippage(rawExit, side);
    const exitFee = this.feeOn(trade.qty * fill);
    const rawPnl = trade.direction === 'bullish'
      ? (fill - trade.entryPrice) * trade.qty
      : (trade.entryPrice - fill) * trade.qty;
    const fees = (trade.fees ?? 0) + exitFee;
    const pnl = rawPnl - fees;
    const closed: Trade = {
      ...trade,
      closePrice: round(fill, 8),
      closedAt: Date.now(),
      pnl: round(pnl, 6),
      pnlPercent: trade.positionSize > 0 ? (pnl / trade.positionSize) * 100 : 0,
      fees,
      status,
    };
    store.updateTrade(trade.id, {
      closePrice: closed.closePrice,
      closedAt: closed.closedAt,
      pnl: closed.pnl,
      pnlPercent: closed.pnlPercent,
      fees,
      status,
    });
    this.state.realizedPnl += pnl;
    this.state.totalFees += fees;
    this.state.updatedAt = Date.now();
    writeState(this.state);
    logger.info('Paper fill closed', {
      symbol: trade.symbol,
      status,
      pnl: closed.pnl,
      fill: closed.closePrice,
    });
    return closed;
  }

  onCandle(symbol: string, candle: Candle): Trade[] {
    this.mark(symbol, candle.close);
    const closed: Trade[] = [];
    for (const trade of this.openTrades().filter(t => t.symbol === symbol)) {
      if (trade.direction === 'bullish') {
        const slHit = candle.low <= trade.stopLoss;
        const tpHit = candle.high >= trade.takeProfit;
        if (slHit) closed.push(this.closeTrade(trade, trade.stopLoss, 'closed_sl'));
        else if (tpHit) closed.push(this.closeTrade(trade, trade.takeProfit, 'closed_tp'));
      } else {
        const slHit = candle.high >= trade.stopLoss;
        const tpHit = candle.low <= trade.takeProfit;
        if (slHit) closed.push(this.closeTrade(trade, trade.stopLoss, 'closed_sl'));
        else if (tpHit) closed.push(this.closeTrade(trade, trade.takeProfit, 'closed_tp'));
      }
    }
    return closed;
  }

  applyCashPnl(tradeId: string, amount: number): Trade | null {
    const trade = store.getTrades().find(t => t.id === tradeId);
    if (!trade) return null;
    const next = (trade.pnl ?? 0) + amount;
    this.state.realizedPnl += amount;
    this.state.updatedAt = Date.now();
    writeState(this.state);
    store.updateTrade(tradeId, { pnl: next });
    return { ...trade, pnl: next };
  }

  closeById(tradeId: string, reason: Exclude<TradeStatus, 'open'> = 'closed_manual'): Trade | null {
    const trade = this.openTrades().find(t => t.id === tradeId);
    if (!trade) return null;
    const mark = this.lastPrice.get(trade.symbol) ?? trade.entryPrice;
    return this.closeTrade(trade, mark, reason);
  }

  closeSymbol(symbol: string): Trade[] {
    return this.openTrades()
      .filter(t => t.symbol === symbol)
      .map(t => this.closeTrade(t, this.lastPrice.get(t.symbol) ?? t.entryPrice, 'closed_manual'));
  }

  getPositions(): PaperPositionView[] {
    return this.openTrades().map(t => {
      const mark = this.lastPrice.get(t.symbol) ?? t.entryPrice;
      const uPnl = t.direction === 'bullish'
        ? (mark - t.entryPrice) * t.qty
        : (t.entryPrice - mark) * t.qty;
      return {
        tradeId: t.id,
        symbol: t.symbol,
        side: t.direction === 'bullish' ? 'Buy' : 'Sell',
        direction: t.direction,
        size: String(t.qty),
        qty: t.qty,
        avgPrice: String(t.entryPrice),
        markPrice: String(mark),
        unrealisedPnl: uPnl.toFixed(4),
        stopLoss: String(t.stopLoss),
        takeProfit: String(t.takeProfit),
        strategyType: t.strategyType,
        strategyInstanceId: t.strategyInstanceId,
        mode: 'paper',
        openedAt: t.openedAt,
      };
    });
  }

  getSnapshot(): PaperAccountSnapshot {
    const unrealized = this.unrealizedPnl();
    return {
      mode: 'paper',
      startingEquity: this.state.startingEquity,
      cashEquity: this.realizedEquity(),
      equity: this.realizedEquity() + unrealized,
      realizedPnl: this.state.realizedPnl,
      unrealizedPnl: unrealized,
      totalFees: this.state.totalFees,
      openCount: this.openTrades().length,
      updatedAt: this.state.updatedAt,
    };
  }

  reset(startingEquity?: number): PaperAccountSnapshot {
    for (const t of this.openTrades()) {
      this.closeTrade(t, this.lastPrice.get(t.symbol) ?? t.entryPrice, 'closed_manual');
    }
    const config = loadConfig();
    this.state = {
      startingEquity: startingEquity ?? config.paperStartingEquity ?? 10_000,
      realizedPnl: 0,
      totalFees: 0,
      updatedAt: Date.now(),
    };
    writeState(this.state);
    logger.info('Paper account reset', { startingEquity: this.state.startingEquity });
    return this.getSnapshot();
  }

  /** Zero paper PnL after the trade log has been wiped. Does not write new trades. */
  wipeAfterHistoryClear(): PaperAccountSnapshot {
    const config = loadConfig();
    this.state = {
      startingEquity: this.state.startingEquity || config.paperStartingEquity || 10_000,
      realizedPnl: 0,
      totalFees: 0,
      updatedAt: Date.now(),
    };
    writeState(this.state);
    return this.getSnapshot();
  }
}

export const paperBroker = new PaperBroker();
