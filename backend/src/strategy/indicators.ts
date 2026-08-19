import { Candle } from '../types';

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = 0;
  for (let i = 0; i < period; i++) e += values[i];
  e /= period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export function rsi(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const ag = gains / period;
  const al = losses / period;
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

export function trueRange(candle: Candle, prevClose: number): number {
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - prevClose),
    Math.abs(candle.low - prevClose),
  );
}

export function atr(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    sum += trueRange(candles[i], candles[i - 1].close);
  }
  return sum / period;
}

export interface AdxSnapshot {
  adx: number;
  plusDI: number;
  minusDI: number;
}

/**
 * Wilder ADX / +DI / −DI. Needs about 2×period+1 bars after the first TR.
 */
export function adx(candles: Candle[], period: number): AdxSnapshot | null {
  if (period < 2 || candles.length < period * 2 + 2) return null;
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(trueRange(candles[i], candles[i - 1].close));
  }
  if (tr.length < period * 2) return null;

  let smTR = 0;
  let smP = 0;
  let smM = 0;
  for (let i = 0; i < period; i++) {
    smTR += tr[i];
    smP += plusDM[i];
    smM += minusDM[i];
  }

  const dx: number[] = [];
  let plusDI = 0;
  let minusDI = 0;
  const pushDx = (): void => {
    plusDI = smTR > 0 ? (100 * smP) / smTR : 0;
    minusDI = smTR > 0 ? (100 * smM) / smTR : 0;
    const denom = plusDI + minusDI;
    dx.push(denom > 0 ? (100 * Math.abs(plusDI - minusDI)) / denom : 0);
  };
  pushDx();

  for (let i = period; i < tr.length; i++) {
    smTR = smTR - smTR / period + tr[i];
    smP = smP - smP / period + plusDM[i];
    smM = smM - smM / period + minusDM[i];
    pushDx();
  }
  if (dx.length < period) return null;

  let adxVal = 0;
  for (let i = 0; i < period; i++) adxVal += dx[i];
  adxVal /= period;
  for (let i = period; i < dx.length; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period;
  }
  return { adx: adxVal, plusDI, minusDI };
}

export function highest(values: number[], period: number, excludeLast = false): number | null {
  const end = excludeLast ? values.length - 1 : values.length;
  const start = end - period;
  if (start < 0) return null;
  let h = -Infinity;
  for (let i = start; i < end; i++) if (values[i] > h) h = values[i];
  return h;
}

export function lowest(values: number[], period: number, excludeLast = false): number | null {
  const end = excludeLast ? values.length - 1 : values.length;
  const start = end - period;
  if (start < 0) return null;
  let l = Infinity;
  for (let i = start; i < end; i++) if (values[i] < l) l = values[i];
  return l;
}

export function utcDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function utcMinutes(ts: number): number {
  const d = new Date(ts);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
