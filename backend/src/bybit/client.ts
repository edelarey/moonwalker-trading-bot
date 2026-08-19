import { RestClientV5 } from 'bybit-api';
import { logger } from '../logger';
import { Candle, CandleInterval, EquitySource, LiveEquitySnapshot, resolveEquitySource } from '../types';
import { resolveApiCredentials } from '../security/secrets';
import { intervalToMs } from '../strategy/intervals';
import { loadConfig } from '../config';

let _client: RestClientV5 | null = null;

export function getBybitClient(apiKey?: string, apiSecret?: string, testnet?: boolean): RestClientV5 {
  if (!_client) {
    const stored = resolveApiCredentials();
    _client = new RestClientV5({
      key: apiKey || stored.apiKey,
      secret: apiSecret || stored.apiSecret,
      testnet: testnet ?? stored.testnet,
    });
  }
  return _client;
}

export function resetBybitClient(): void {
  _client = null;
}

/**
 * Fetch OHLCV candles from Bybit v5 market kline endpoint.
 * @param symbol e.g. "BTCUSDT"
 * @param interval '5' | '15' | 'D'
 * @param limit max candles to fetch (default 200)
 * @param startTime Unix ms (optional)
 * @param endTime Unix ms (optional)
 */
export async function fetchCandles(
  symbol: string,
  interval: CandleInterval,
  limit = 200,
  startTime?: number,
  endTime?: number,
  category: 'linear' | 'spot' = 'linear',
): Promise<Candle[]> {
  const client = getBybitClient();
  try {
    const params: Record<string, unknown> = {
      category,
      symbol,
      interval,
      limit,
    };
    if (startTime) params.start = startTime;
    if (endTime) params.end = endTime;

    const response = await client.getKline(params as any);

    if (response.retCode !== 0) {
      throw new Error(`Bybit API error: ${response.retMsg}`);
    }

    // Bybit returns [openTime, open, high, low, close, volume, turnover]
    // Newest candle first — reverse to chronological order
    const raw: string[][] = response.result.list as string[][];
    return raw.reverse().map(c => ({
      openTime: parseInt(c[0], 10),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  } catch (err) {
    logger.error('fetchCandles error', { symbol, interval, err });
    throw err;
  }
}

export interface PremiumSnapshot {
  symbol: string;
  fundingRate: number;
  markPrice: number;
  indexPrice: number;
  nextFundingTime: number;
  basisPercent: number;
}

export async function fetchPremium(symbol: string): Promise<PremiumSnapshot> {
  const client = getBybitClient();
  const response = await client.getTickers({ category: 'linear', symbol });
  if (response.retCode !== 0) throw new Error(response.retMsg);
  const t = (response.result.list as any[])[0];
  const mark = parseFloat(t.markPrice) || 0;
  const index = parseFloat(t.indexPrice) || mark;
  return {
    symbol,
    fundingRate: parseFloat(t.fundingRate) || 0,
    markPrice: mark,
    indexPrice: index,
    nextFundingTime: parseInt(t.nextFundingTime, 10) || 0,
    basisPercent: index ? ((mark - index) / index) * 100 : 0,
  };
}

export async function fetchFundingHistory(
  symbol: string,
  startTime: number,
  endTime: number,
): Promise<Array<{ time: number; rate: number }>> {
  const client = getBybitClient();
  const out: Array<{ time: number; rate: number }> = [];
  let cursor = startTime;
  for (let i = 0; i < 20 && cursor < endTime; i++) {
    const response = await client.getFundingRateHistory({
      category: 'linear',
      symbol,
      startTime: cursor,
      endTime,
      limit: 200,
    } as any);
    if (response.retCode !== 0) break;
    const list = (response.result.list as any[]) || [];
    if (!list.length) break;
    for (const row of list) {
      out.push({
        time: parseInt(row.fundingRateTimestamp, 10),
        rate: parseFloat(row.fundingRate) || 0,
      });
    }
    const oldest = Math.min(...list.map((r: any) => parseInt(r.fundingRateTimestamp, 10)));
    const newest = Math.max(...list.map((r: any) => parseInt(r.fundingRateTimestamp, 10)));
    if (newest <= cursor) break;
    cursor = newest + 1;
    if (list.length < 200) break;
    void oldest;
  }
  const byT = new Map<number, number>();
  for (const r of out) byT.set(r.time, r.rate);
  return [...byT.entries()].map(([time, rate]) => ({ time, rate })).sort((a, b) => a.time - b.time);
}

const binanceCache = new Map<string, { price: number; at: number }>();

export async function fetchBinanceLast(symbol: string): Promise<number | null> {
  const hit = binanceCache.get(symbol);
  if (hit && Date.now() - hit.at < 5_000) return hit.price;
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return hit?.price ?? null;
    const data = await res.json() as { price?: string };
    const price = parseFloat(data.price || '');
    if (!Number.isFinite(price)) return hit?.price ?? null;
    binanceCache.set(symbol, { price, at: Date.now() });
    return price;
  } catch {
    return hit?.price ?? null;
  }
}

/** Page through Bybit klines so a multi-week range is not truncated at 1000 bars. */
export async function fetchCandlesRange(
  symbol: string,
  interval: CandleInterval,
  startTime: number,
  endTime: number,
  category: 'linear' | 'spot' = 'linear',
): Promise<Candle[]> {
  const step = intervalToMs(String(interval));
  const out: Candle[] = [];
  let cursor = startTime;
  let guard = 0;
  while (cursor < endTime && guard < 40) {
    guard++;
    const batch = await fetchCandles(symbol, interval, 1000, cursor, endTime, category);
    if (!batch.length) break;
    const fresh = batch.filter(c => c.openTime >= cursor && c.openTime < endTime);
    if (!fresh.length) break;
    out.push(...fresh);
    const lastOpen = fresh[fresh.length - 1].openTime;
    const next = lastOpen + step;
    if (next <= cursor) break;
    cursor = next;
    if (batch.length < 1000) break;
  }
  const byTime = new Map<number, Candle>();
  for (const c of out) byTime.set(c.openTime, c);
  return [...byTime.values()].sort((a, b) => a.openTime - b.openTime);
}

/**
 * Fetch the previous completed day's high & low for a symbol.
 */
export async function fetchPrevDayRange(symbol: string): Promise<{ high: number; low: number }> {
  // Fetch last 2 daily candles: index 0 = yesterday (previous complete day)
  const candles = await fetchCandles(symbol, 'D', 2);
  if (candles.length < 1) throw new Error(`No daily candles for ${symbol}`);
  // The second-to-last is the previous completed day
  const prevDay = candles.length >= 2 ? candles[candles.length - 2] : candles[0];
  return { high: prevDay.high, low: prevDay.low };
}

/**
 * Get current mark price for a symbol.
 */
export async function getMarkPrice(symbol: string): Promise<number> {
  const client = getBybitClient();
  const response = await client.getTickers({ category: 'linear', symbol });
  if (response.retCode !== 0) throw new Error(response.retMsg);
  const ticker = (response.result.list as any[])[0];
  return parseFloat(ticker.markPrice);
}

/**
 * Get account equity (USDT wallet balance).
 */
export async function getAccountEquity(): Promise<number> {
  const snap = await getLiveEquity();
  return snap.equity;
}

function parseWalletNum(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/**
 * Unified USDT coin line, plus Bybit account-level USD margin (totalMarginBalance,
 * then totalEquity, then sum of coin usdValue). Isolated still needs USDT for
 * these linear perps; non-USDT coins only count after they are enabled as
 * collateral in Cross or Portfolio.
 */
export async function getLiveEquity(source?: EquitySource): Promise<LiveEquitySnapshot> {
  const client = getBybitClient();
  const resolved = source ?? resolveEquitySource(loadConfig().equitySource);
  const response = await client.getWalletBalance({ accountType: 'UNIFIED' });
  if (response.retCode !== 0) throw new Error(response.retMsg);
  const acct = response.result.list[0];
  const coins = acct?.coin ?? [];
  const usdt = coins.find(c => c.coin === 'USDT');
  const usdtEquity = parseWalletNum(usdt?.equity) ?? 0;

  const summedUsd = coins.reduce((sum, c) => sum + (parseWalletNum(c.usdValue) ?? 0), 0);
  const unifiedUsdEquity =
    parseWalletNum(acct?.totalMarginBalance)
    ?? parseWalletNum(acct?.totalEquity)
    ?? summedUsd;

  const equity = resolved === 'unified_usd' ? unifiedUsdEquity : usdtEquity;
  return {
    equity,
    mode: 'live',
    equitySource: resolved,
    usdtEquity,
    unifiedUsdEquity,
    currency: resolved === 'unified_usd' ? 'USD' : 'USDT',
  };
}

/**
 * Place a market order with SL and TP.
 */
export async function placeMarketOrder(params: {
  symbol: string;
  side: 'Buy' | 'Sell';
  qty: string;
  stopLoss: string;
  takeProfit: string;
}): Promise<string> {
  const client = getBybitClient();
  const response = await client.submitOrder({
    category: 'linear',
    symbol: params.symbol,
    side: params.side,
    orderType: 'Market',
    qty: params.qty,
    stopLoss: params.stopLoss,
    takeProfit: params.takeProfit,
    timeInForce: 'GoodTillCancel' as any,
    slTriggerBy: 'MarkPrice',
    tpTriggerBy: 'MarkPrice',
  });
  if (response.retCode !== 0) throw new Error(`Order failed: ${response.retMsg}`);
  return response.result.orderId;
}

/**
 * Close a position by placing an opposite market order.
 */
export async function closePosition(symbol: string, side: 'Buy' | 'Sell', qty: string): Promise<string> {
  const client = getBybitClient();
  const closeSide = side === 'Buy' ? 'Sell' : 'Buy';
  const response = await client.submitOrder({
    category: 'linear',
    symbol,
    side: closeSide,
    orderType: 'Market',
    qty,
    reduceOnly: true,
    timeInForce: 'GoodTillCancel' as any,
  });
  if (response.retCode !== 0) throw new Error(`Close failed: ${response.retMsg}`);
  return response.result.orderId;
}

/**
 * Get all open positions.
 */
export async function getOpenPositions(): Promise<any[]> {
  const client = getBybitClient();
  const response = await client.getPositionInfo({ category: 'linear', settleCoin: 'USDT' });
  if (response.retCode !== 0) throw new Error(response.retMsg);
  return (response.result.list as any[]).filter(p => parseFloat(p.size) > 0);
}

export interface MarketTicker {
  symbol: string;
  lastPrice: number;
  turnover24h: number;
  price24hPcnt: number;
  volume24h: number;
}

/**
 * Top USDT linear perps by 24h turnover. Public endpoint — no keys required.
 */
export async function fetchTopLinearMarkets(limit = 50): Promise<MarketTicker[]> {
  const client = getBybitClient();
  const response = await client.getTickers({ category: 'linear' });
  if (response.retCode !== 0) throw new Error(response.retMsg);
  const list = (response.result.list as any[])
    .filter(t => typeof t.symbol === 'string' && t.symbol.endsWith('USDT'))
    .map(t => ({
      symbol: t.symbol as string,
      lastPrice: parseFloat(t.lastPrice) || 0,
      turnover24h: parseFloat(t.turnover24h) || 0,
      price24hPcnt: parseFloat(t.price24hPcnt) || 0,
      volume24h: parseFloat(t.volume24h) || 0,
    }))
    .sort((a, b) => b.turnover24h - a.turnover24h)
    .slice(0, limit);
  return list;
}
