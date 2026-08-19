import { StrategyType } from '../types';
import { factoryParamsFor, TYPE_NAMES } from '../storage/strategyStore';

/** Directional perp types only. Hedges, grid, and DCA are not comparable in a sweep. */
export const SWEEPABLE_TYPES: StrategyType[] = [
  'ema_pullback',
  'supertrend',
  'adx_di',
  'keltner',
  'donchian',
  'vwap',
  'orb',
  'rsi',
  'ma_crossover',
  'bollinger',
  'break_bounce',
];

function withBase(type: StrategyType, patches: Record<string, unknown>[]): Record<string, unknown>[] {
  const base = factoryParamsFor(type);
  return patches.map(p => ({ ...base, ...p }));
}

/** Small common-practice grids. Not a search for optimal settings. */
export function presetGrid(type: StrategyType): Record<string, unknown>[] {
  switch (type) {
    case 'ema_pullback':
      return withBase(type, [
        {},
        { timeframe: '15', stopLossPercent: 1.5, takeProfitPercent: 3 },
        { timeframe: '60', stopLossPercent: 2, takeProfitPercent: 4 },
      ]);
    case 'supertrend':
      return withBase(type, [
        {},
        { timeframe: '15', multiplier: 3 },
        { timeframe: '60', atrPeriod: 10, multiplier: 2 },
      ]);
    case 'adx_di':
      return withBase(type, [
        {},
        { adxMin: 20, atrMultiplier: 2.5, takeProfitAtrMultiplier: 3 },
        { timeframe: '240', adxMin: 25 },
      ]);
    case 'keltner':
      return withBase(type, [
        {},
        { mode: 'mean_reversion' },
        { timeframe: '240', mode: 'breakout' },
      ]);
    case 'donchian':
      return withBase(type, [
        {},
        { atrMultiplier: 2, takeProfitAtrMultiplier: 3 },
        { timeframe: '60' },
      ]);
    case 'vwap':
      return withBase(type, [
        {},
        { deviationPercent: 0.8, stopLossPercent: 1.5, takeProfitPercent: 1 },
        { timeframe: '15' },
      ]);
    case 'orb':
      return withBase(type, [
        {},
        { rangeMinutes: 60, takeProfitRr: 2 },
        { takeProfitRr: 2.5 },
      ]);
    case 'rsi':
      return withBase(type, [
        {},
        { oversoldThreshold: 25, overboughtThreshold: 75 },
        { timeframe: '240' },
      ]);
    case 'ma_crossover':
      return withBase(type, [
        {},
        { shortPeriod: 9, longPeriod: 21, timeframe: '240' },
        { timeframe: '60' },
      ]);
    case 'bollinger':
      return withBase(type, [
        {},
        { mode: 'mean_reversion' },
        { timeframe: '60', mode: 'breakout' },
      ]);
    case 'break_bounce':
      return withBase(type, [
        {},
        { breakoutBufferPercent: 0.05, tpMultiplier: 2 },
        { liquidityWindowEnd: '02:30', tpMultiplier: 2.5 },
      ]);
    default:
      return [factoryParamsFor(type)];
  }
}

export function sweepTypeName(type: StrategyType): string {
  return TYPE_NAMES[type] ?? type;
}

export function paramLabel(type: StrategyType, params: Record<string, unknown>): string {
  const base = factoryParamsFor(type);
  const skip = new Set(['stopFillMode', 'leverage']);
  const bits: string[] = [];
  if (params.timeframe != null) bits.push(String(params.timeframe));
  for (const [k, v] of Object.entries(params)) {
    if (skip.has(k) || k === 'timeframe') continue;
    if (JSON.stringify(v) === JSON.stringify(base[k])) continue;
    bits.push(`${k}=${v}`);
  }
  return bits.length ? bits.join(', ') : 'factory';
}

export function countVariants(types: StrategyType[]): number {
  return types.reduce((n, t) => n + presetGrid(t).length, 0);
}
