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
  sizingMode: 'risk_percent',
  fixedPositionUsdt: 100,
  leverage: 1,
  stopFillMode: 'bar_close',
  tpMultiplier: 2.5,
  liquidityWindowStart: '00:00',
  liquidityWindowEnd: '04:00',
  maxDailyTradesPerCoin: 1,
  storageMode: (process.env.STORAGE_MODE as 'json' | 'postgres') || 'json',
  testnet: process.env.BYBIT_TESTNET === 'true',
  breakoutBufferPercent: 0.08,
  primaryTimeframe: 'D',
  breakoutTimeframe: '15',
  entryTimeframe: '5',
  tradingMode: 'paper',
  equitySource: 'usdt',
  paperStartingEquity: 10000,
  paperFeeBps: 6,
  paperSlippageBps: 3,
  strategyDefaults: {
    break_bounce: {
      primaryTimeframe: 'D', breakoutTimeframe: '15', entryTimeframe: '5',
      breakoutBufferPercent: 0.08, liquidityWindowStart: '00:00', liquidityWindowEnd: '04:00', tpMultiplier: 2.5,
    },
    dca: {
      investmentAmount: 50, intervalMinutes: 1440, maxTotalInvestment: 500,
      takeProfitPercent: 15, trailingStopPercent: 8, maFilterPeriod: 50, rsiFilterMax: 45,
    },
    grid: {
      upperPrice: 0, lowerPrice: 0, gridCount: 12, investmentPerGrid: 50,
      geometric: true, stopLossBreakoutPercent: 4, leverage: 1,
    },
    ma_crossover: {
      shortPeriod: 20, longPeriod: 50, timeframe: '240',
      stopLossPercent: 3, takeProfitPercent: 8, trailingStopPercent: 4,
    },
    rsi: {
      period: 14, oversoldThreshold: 20, overboughtThreshold: 80, timeframe: '60',
      confirmationCandles: 2, stopLossPercent: 2.5, takeProfitPercent: 5,
    },
    bollinger: {
      period: 20, stdDevMultiplier: 2.0, timeframe: '240', mode: 'breakout',
      volumeConfirmMultiplier: 1.5, squeezeThresholdPercent: 2.0,
      stopLossPercent: 3, takeProfitPercent: 6, trailingStopPercent: 3,
    },
    donchian: {
      period: 20, timeframe: '240', atrPeriod: 14, atrMultiplier: 2.5, takeProfitAtrMultiplier: 4,
    },
    ema_pullback: {
      fastPeriod: 9, slowPeriod: 21, timeframe: '15', stopLossPercent: 2, takeProfitPercent: 4,
    },
    supertrend: { atrPeriod: 10, multiplier: 2, timeframe: '15' },
    vwap: {
      timeframe: '5', deviationPercent: 0.6, stopLossPercent: 1.2, takeProfitPercent: 0.8, sessionResetHour: 0,
    },
    orb: {
      rangeMinutes: 30, timeframe: '5', breakoutBufferPercent: 0.08,
      takeProfitRr: 2, sessionStartHour: 0, maxTradesPerDay: 1,
    },
    funding_arb: {
      timeframe: '60', minFundingRate: 0.0001, exitFundingRate: 0.00003,
      maxBasisPercent: 0.2, stopBasisPercent: 0.5,
    },
    cross_exchange: {
      timeframe: '5', minSpreadPercent: 0.04, exitSpreadPercent: 0.015,
      stopSpreadPercent: 0.2, maxHoldMinutes: 60,
    },
    dynamic_delta: {
      timeframe: '15', hedgeSymbol: 'BTCUSDT', deltaThresholdPercent: 8,
      volTriggerPercent: 1.2, hedgeRatio: 0.5, inventoryUsdt: 2000,
    },
    drawdown_hedge: {
      timeframe: '15', hedgeSymbol: 'BTCUSDT', drawdownPercent: 3,
      recoverPercent: 1.2, hedgePortion: 0.5,
    },
  },
};

export function loadConfig(): AppConfig {
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(raw) as Partial<AppConfig>;
      return {
        ...DEFAULT_CONFIG,
        ...saved,
        strategyDefaults: {
          ...DEFAULT_CONFIG.strategyDefaults,
          ...(saved.strategyDefaults ?? {}),
        },
      };
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
