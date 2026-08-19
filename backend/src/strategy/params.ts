import { StrategyInstance, StrategyType } from '../types';
import { normalizeInterval } from './intervals';

/**
 * Accept both frontend aliases and backend canonical param names.
 * Always returns a new object with canonical keys.
 */
export function normalizeParams(type: StrategyType, raw: Record<string, unknown> = {}): Record<string, unknown> {
  const p: Record<string, unknown> = { ...raw };

  if (p.intervalHours != null && p.intervalMinutes == null) {
    p.intervalMinutes = Number(p.intervalHours) * 60;
  }
  if (p.takeProfitPct != null && p.takeProfitPercent == null) p.takeProfitPercent = p.takeProfitPct;
  if (p.stopLossPct != null && p.stopLossPercent == null) p.stopLossPercent = p.stopLossPct;
  if (p.oversold != null && p.oversoldThreshold == null) p.oversoldThreshold = p.oversold;
  if (p.overbought != null && p.overboughtThreshold == null) p.overboughtThreshold = p.overbought;
  if (p.gridLevels != null && p.gridCount == null) p.gridCount = p.gridLevels;
  if (p.fastPeriod != null && p.shortPeriod == null) p.shortPeriod = p.fastPeriod;
  if (p.slowPeriod != null && p.longPeriod == null) p.longPeriod = p.slowPeriod;
  if (p.stdDev != null && p.stdDevMultiplier == null) p.stdDevMultiplier = p.stdDev;
  if (p.maxPositions != null && p.maxTotalInvestment == null && p.investmentAmount != null) {
    p.maxTotalInvestment = Number(p.investmentAmount) * Number(p.maxPositions);
  }
  if (p.timeframe != null) {
    const tf = normalizeInterval(String(p.timeframe));
    if (tf) p.timeframe = tf;
  }

  if (type === 'dca' && p.intervalMinutes == null) p.intervalMinutes = 1440;
  return p;
}

export function normalizeInstance(inst: StrategyInstance): StrategyInstance {
  return {
    ...inst,
    strategyType: (inst.strategyType || (inst as unknown as { type?: StrategyType }).type) as StrategyType,
    params: normalizeParams(inst.strategyType, (inst.params ?? {}) as Record<string, unknown>),
  };
}

export function instanceTimeframe(inst: StrategyInstance): string | null {
  return normalizeInterval(inst.params?.timeframe as string | undefined);
}
