import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { AppConfig } from './types';

dotenv.config();

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const configPath = path.join(dataDir, 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  symbols: [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
    'LTCUSDT', 'ATOMUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT',
    'OPUSDT', 'INJUSDT', 'SUIUSDT', 'TIAUSDT', 'SEIUSDT',
  ].map(symbol => ({ symbol, enabled: true, addedAt: Date.now() })),
  riskPercent: 1,
  tpMultiplier: 2.5,
  liquidityWindowStart: '00:00',
  liquidityWindowEnd: '02:30',
  maxDailyTradesPerCoin: 1,
  storageMode: (process.env.STORAGE_MODE as 'json' | 'postgres') || 'json',
  testnet: process.env.BYBIT_TESTNET === 'true',
  breakoutBufferPercent: 0.05,
  primaryTimeframe: 'D',
  breakoutTimeframe: '15',
  entryTimeframe: '5',
};

export function loadConfig(): AppConfig {
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

export function saveConfig(config: AppConfig): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  BYBIT_API_KEY: process.env.BYBIT_API_KEY || '',
  BYBIT_API_SECRET: process.env.BYBIT_API_SECRET || '',
  BYBIT_TESTNET: process.env.BYBIT_TESTNET === 'true',
  DATABASE_URL: process.env.DATABASE_URL || '',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'default_key_change_me_32chars!!',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
};
