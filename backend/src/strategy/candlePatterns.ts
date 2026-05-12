import { Candle, CandlePatternType } from '../types';

/**
 * Candle body helpers
 */
function body(c: Candle): number {
  return Math.abs(c.close - c.open);
}

function upperWick(c: Candle): number {
  return c.high - Math.max(c.open, c.close);
}

function lowerWick(c: Candle): number {
  return Math.min(c.open, c.close) - c.low;
}

function range(c: Candle): number {
  return c.high - c.low;
}

function isBullish(c: Candle): boolean {
  return c.close > c.open;
}

function isBearish(c: Candle): boolean {
  return c.close < c.open;
}

/**
 * Hammer: small body at top, long lower wick >= 2x body, small upper wick
 * Bullish reversal after downtrend/retest
 */
export function isHammer(c: Candle): boolean {
  const b = body(c);
  const lw = lowerWick(c);
  const uw = upperWick(c);
  const r = range(c);
  if (r === 0) return false;
  return lw >= 2 * b && uw <= 0.1 * r && b > 0;
}

/**
 * Inverted Hammer: small body at bottom, long upper wick >= 2x body, small lower wick
 * Bullish reversal signal
 */
export function isInvertedHammer(c: Candle): boolean {
  const b = body(c);
  const lw = lowerWick(c);
  const uw = upperWick(c);
  const r = range(c);
  if (r === 0) return false;
  return uw >= 2 * b && lw <= 0.1 * r && b > 0;
}

/**
 * Bullish Engulfing: current bullish candle body fully engulfs prior bearish candle body
 */
export function isBullishEngulfing(prev: Candle, curr: Candle): boolean {
  return (
    isBearish(prev) &&
    isBullish(curr) &&
    curr.open <= prev.close &&
    curr.close >= prev.open
  );
}

/**
 * Shooting Star: small body at bottom, long upper wick >= 2x body, small lower wick
 * Bearish reversal signal
 */
export function isShootingStar(c: Candle): boolean {
  const b = body(c);
  const lw = lowerWick(c);
  const uw = upperWick(c);
  const r = range(c);
  if (r === 0) return false;
  return uw >= 2 * b && lw <= 0.1 * r && b > 0 && isBearish(c);
}

/**
 * Bearish Engulfing: current bearish candle body fully engulfs prior bullish candle body
 */
export function isBearishEngulfing(prev: Candle, curr: Candle): boolean {
  return (
    isBullish(prev) &&
    isBearish(curr) &&
    curr.open >= prev.close &&
    curr.close <= prev.open
  );
}

/**
 * Detect any bullish reversal pattern on the current 5m candle.
 * Returns the pattern type or null.
 */
export function detectBullishPattern(
  prev: Candle | null,
  curr: Candle
): CandlePatternType | null {
  if (isHammer(curr)) return 'hammer';
  if (isInvertedHammer(curr)) return 'inverted_hammer';
  if (prev && isBullishEngulfing(prev, curr)) return 'bullish_engulfing';
  return null;
}

/**
 * Detect any bearish reversal pattern on the current 5m candle.
 * Returns the pattern type or null.
 */
export function detectBearishPattern(
  prev: Candle | null,
  curr: Candle
): CandlePatternType | null {
  if (isShootingStar(curr)) return 'shooting_star';
  if (prev && isBearishEngulfing(prev, curr)) return 'bearish_engulfing';
  return null;
}
