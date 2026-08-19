/** Convert UI / config timeframe strings to Bybit kline interval tokens. */
export function normalizeInterval(raw?: string | null): string | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  const map: Record<string, string> = {
    '1': '1', '1m': '1',
    '3': '3', '3m': '3',
    '5': '5', '5m': '5',
    '15': '15', '15m': '15',
    '30': '30', '30m': '30',
    '60': '60', '1h': '60', '60m': '60',
    '120': '120', '2h': '120',
    '240': '240', '4h': '240',
    '360': '360', '6h': '360',
    '720': '720', '12h': '720',
    'd': 'D', '1d': 'D', 'day': 'D',
    'w': 'W', '1w': 'W',
    'm': 'M', '1mo': 'M', 'month': 'M',
  };
  return map[v] ?? String(raw);
}

export function intervalToMs(interval: string): number {
  const n = normalizeInterval(interval) ?? interval;
  if (n === 'D') return 86_400_000;
  if (n === 'W') return 7 * 86_400_000;
  if (n === 'M') return 30 * 86_400_000;
  const minutes = parseInt(n, 10);
  return Number.isFinite(minutes) ? minutes * 60_000 : 60_000;
}
