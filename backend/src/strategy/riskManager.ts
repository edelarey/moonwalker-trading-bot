import { Candle, BreakoutDirection, ReversalSignal, RetestSignal } from '../types';

/**
 * Calculate stop-loss price.
 * For longs: just below the reversal candle's low (subtract small buffer)
 * For shorts: just above the reversal candle's high (add small buffer)
 */
function calcStopLoss(direction: BreakoutDirection, candle: Candle): number {
  const buffer = (candle.high - candle.low) * 0.05; // 5% of candle range as buffer
  if (direction === 'bullish') {
    return candle.low - buffer;
  } else {
    return candle.high + buffer;
  }
}

/**
 * Calculate take-profit price.
 * TP = entry ± (risk distance × tpMultiplier)
 */
function calcTakeProfit(
  direction: BreakoutDirection,
  entry: number,
  stopLoss: number,
  tpMultiplier: number
): number {
  const riskDistance = Math.abs(entry - stopLoss);
  if (direction === 'bullish') {
    return entry + riskDistance * tpMultiplier;
  } else {
    return entry - riskDistance * tpMultiplier;
  }
}

/**
 * Calculate position size in USDT given risk % and SL distance.
 * positionSize = (equity * riskPercent / 100) / (riskDistance / entryPrice)
 */
export function clampLeverage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(100, Math.round(n * 10) / 10);
}

export function resolveLeverage(
  instParams?: Record<string, unknown>,
  fallback?: unknown,
): number {
  if (instParams && instParams.leverage != null && instParams.leverage !== '') {
    return clampLeverage(instParams.leverage);
  }
  return clampLeverage(fallback ?? 1);
}

export function calcPositionSize(
  equity: number,
  riskPercent: number,
  entryPrice: number,
  stopLoss: number
): { positionSize: number; qty: number } {
  const riskAmount = equity * (riskPercent / 100);
  const riskDistance = Math.abs(entryPrice - stopLoss);
  const riskDistancePercent = riskDistance / entryPrice || 0.01;
  const positionSize = riskAmount / riskDistancePercent;
  const qty = positionSize / entryPrice;
  return { positionSize, qty };
}

export function sizePosition(opts: {
  equity: number;
  entryPrice: number;
  stopLoss: number;
  riskPercent: number;
  sizingMode?: 'risk_percent' | 'fixed_usdt';
  fixedPositionUsdt?: number;
  leverage?: number;
}): { positionSize: number; qty: number; leverage: number } {
  const leverage = clampLeverage(opts.leverage ?? 1);
  if (opts.sizingMode === 'fixed_usdt') {
    const margin = Math.max(1, Number(opts.fixedPositionUsdt) || 100);
    const positionSize = margin * leverage;
    return { positionSize, qty: positionSize / opts.entryPrice, leverage };
  }
  const sized = calcPositionSize(opts.equity, opts.riskPercent, opts.entryPrice, opts.stopLoss);
  return { ...sized, leverage };
}

/**
 * Build a full ReversalSignal from a detected candle pattern during retest.
 */
export function buildReversalSignal(params: {
  retest: RetestSignal;
  patternType: import('../types').CandlePatternType;
  tpMultiplier: number;
}): ReversalSignal {
  const { retest, patternType, tpMultiplier } = params;
  const { breakout } = retest;
  const candle = retest.retestCandle;
  const direction = breakout.direction;

  const entryPrice = candle.close;
  const stopLoss = calcStopLoss(direction, candle);
  const riskDistance = Math.abs(entryPrice - stopLoss);
  const takeProfit = calcTakeProfit(direction, entryPrice, stopLoss, tpMultiplier);

  return {
    symbol: retest.symbol,
    retest,
    patternType,
    entryPrice,
    stopLoss,
    takeProfit,
    riskDistance,
    direction,
    detectedAt: Date.now(),
  };
}
