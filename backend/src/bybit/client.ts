import { RestClientV5 } from 'bybit-api';
import { logger } from '../logger';
import { Candle, CandleInterval } from '../types';
import { resolveApiCredentials } from '../security/secrets';

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
  endTime?: number
): Promise<Candle[]> {
  const client = getBybitClient();
  try {
    const params: Record<string, unknown> = {
      category: 'linear',
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
  const client = getBybitClient();
  const response = await client.getWalletBalance({ accountType: 'UNIFIED' });
  if (response.retCode !== 0) throw new Error(response.retMsg);
  const coin = (response.result.list[0].coin as any[]).find(c => c.coin === 'USDT');
  return coin ? parseFloat(coin.equity) : 0;
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
