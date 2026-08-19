import { Candle } from '../types';

export type StopFillMode = 'stop_price' | 'bar_close';

export function resolveStopFillMode(
  instParams?: Record<string, unknown>,
  fallback?: unknown,
): StopFillMode {
  const raw = instParams?.stopFillMode ?? fallback;
  return raw === 'stop_price' ? 'stop_price' : 'bar_close';
}

/** If this bar trades through SL/TP, where a resting stop/target would fill. */
export function fillStopOnBar(opts: {
  direction: 'bullish' | 'bearish';
  stopLoss: number;
  takeProfit: number;
  candle: Candle;
}): { price: number; reason: 'sl' | 'tp' | 'gap' } | null {
  const { direction, stopLoss: sl, takeProfit: tp, candle: c } = opts;
  if (!(sl > 0) || !(c.open > 0)) return null;

  if (direction === 'bullish') {
    if (c.open <= sl) return { price: c.open, reason: 'gap' };
    if (c.low <= sl) return { price: sl, reason: 'sl' };
    if (tp > 0 && c.high >= tp) return { price: tp, reason: 'tp' };
    return null;
  }
  if (c.open >= sl) return { price: c.open, reason: 'gap' };
  if (c.high >= sl) return { price: sl, reason: 'sl' };
  if (tp > 0 && c.low <= tp) return { price: tp, reason: 'tp' };
  return null;
}
