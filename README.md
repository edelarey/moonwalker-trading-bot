# 🌙 Moonwalker Trading Bot

A full-stack, production-ready GUI trading application implementing the **Break & Bounce scalping strategy** (pure price-action, no indicators) for Bybit USDT perpetual futures.

> ⚠️ **Risk Warning**: Trading cryptocurrencies involves significant risk. This software is for educational purposes. Always test on **testnet** first. Never risk more than you can afford to lose.

---

## 📐 Strategy: Break & Bounce

Pure price-action scalping on Bybit USDT perpetuals.

| Rule | Description |
|------|-------------|
| **1. Daily Blueprint** | At UTC 00:00, fetch & store previous day's high & low for every coin |
| **2. 15m Breakout** | A full 15m candle must close clearly above prev day high (bullish) or below prev day low (bearish) |
| **3. 5m Retest + Reversal** | After breakout, wait for price to retest the broken level. Enter on a valid reversal candle (Hammer, Engulfing, Shooting Star) closing on the 5m chart |
| **4. Risk Management** | SL = beyond reversal candle extreme · TP = 2.5× risk · Max 1 trade/coin/day · Liquidity window only (default UTC 00:00–02:30) |

---

## 🏗️ Architecture

```
moonwalker-trading-bot/
├── backend/                    # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── index.ts            # App entry, HTTP + WebSocket server
│   │   ├── config.ts           # Config loader (.env + config.json)
│   │   ├── logger.ts           # Winston logger
│   │   ├── api/
│   │   │   ├── routes.ts       # REST API routes
│   │   │   └── middleware.ts
│   │   ├── bybit/
│   │   │   ├── client.ts       # Bybit REST v5 client
│   │   │   └── websocket.ts    # Real-time 5m/15m kline subscriptions
│   │   ├── strategy/
│   │   │   ├── breakBounce.ts  # Core strategy engine
│   │   │   ├── candlePatterns.ts  # Pattern detectors
│   │   │   └── riskManager.ts  # SL/TP/position sizing
│   │   ├── backtest/
│   │   │   └── engine.ts       # Historical backtest engine
│   │   ├── scheduler/
│   │   │   └── cron.ts         # UTC midnight daily range refresh
│   │   └── storage/
│   │       ├── jsonStore.ts    # JSON file persistence (default)
│   │       └── store.ts        # Unified store interface
│   ├── data/                   # Runtime JSON data (gitignored)
│   ├── logs/                   # Log files (gitignored)
│   ├── migrations/             # PostgreSQL migrations
│   └── .env.example
│
├── frontend/                   # Vite + Vue 3 + Tailwind/DaisyUI
│   └── src/
│       ├── api/client.ts       # Axios + all API types
│       ├── composables/        # useWebSocket (auto-reconnect)
│       ├── stores/             # Pinia: config, market, trades, backtest
│       ├── components/         # StatCard, TradeRow, EquityCurve, etc.
│       └── views/              # Dashboard, LiveTrading, Backtest, etc.
│
├── docker-compose.yml
├── Dockerfile.backend
└── README.md
```

---

## 🚀 Quick Start (No Docker Required)

### Prerequisites
- Node.js 20+
- npm 10+
- A Bybit account with API keys (use **testnet** to start — [create testnet keys here](https://testnet.bybit.com))

### 1. Navigate to the project
```bash
cd /home/ed/dev/moonwalker-trading-bot
```

### 2. Start the backend
```bash
cd backend
cp .env.example .env
# Edit .env — add your Bybit testnet API keys (BYBIT_API_KEY, BYBIT_API_SECRET)
# Leave BYBIT_TESTNET=true
npm install
npm run dev
# Backend running at http://localhost:3001
```

### 3. Start the frontend (new terminal)
```bash
cd frontend
npm install
npm run dev
# App running at http://localhost:5173
```

Open **http://localhost:5173** — done. No Docker, no database setup needed (JSON file storage is the default).

### Or — start both with one command
```bash
cd /home/ed/dev/moonwalker-trading-bot
npm run dev
```
This starts both backend (port 3001) and frontend (port 5173) in parallel.

---

## ⚙️ Configuration

Edit `backend/.env`:

```env
# Bybit API — testnet recommended to start
BYBIT_API_KEY=your_api_key_here
BYBIT_API_SECRET=your_api_secret_here
BYBIT_TESTNET=true

# Server
PORT=3001
NODE_ENV=development

# Storage: 'json' (default) or 'postgres'
STORAGE_MODE=json

# PostgreSQL (only if STORAGE_MODE=postgres)
DATABASE_URL=postgresql://user:password@localhost:5432/moonwalker

# 32-char encryption key for stored API keys
ENCRYPTION_KEY=change_this_to_a_random_32_char_string
```

### Strategy parameters (editable in the GUI under Settings / Live Trading)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `riskPercent` | `1` | % of equity risked per trade |
| `tpMultiplier` | `2.5` | Take-profit = risk × multiplier |
| `liquidityWindowStart` | `00:00` | UTC time to start trading |
| `liquidityWindowEnd` | `02:30` | UTC time to stop trading |
| `maxDailyTradesPerCoin` | `1` | Max entries per coin per day |
| `breakoutBufferPercent` | `0.05` | Extra buffer for breakout confirmation |

---

## 🖥️ GUI Features

| Page | Description |
|------|-------------|
| **Dashboard** | Live status all coins, daily ranges, equity curve, recent breakouts & trades |
| **Coin Scanner** | Add/remove/toggle up to 20 USDT perpetual symbols |
| **Live Trading** | Toggle AUTO mode, adjust risk parameters, live reversal signal feed |
| **Positions** | Live Bybit positions with one-click manual close + full trade history |
| **Backtest** | Date range picker, multi-coin select, run historical backtest |
| **BT Results** | Win rate, profit factor, max drawdown, equity curve, trade list, CSV export |
| **Settings** | API keys note, testnet toggle, storage mode selector |

---

## 🧪 Running a Backtest

1. Go to **Backtest** in the sidebar
2. Select date range (e.g. 2024-01-01 → 2024-12-31)
3. Select symbols (e.g. BTCUSDT, ETHUSDT, SOLUSDT)
4. Adjust parameters if needed
5. Click **▶ Run Backtest**
6. Results appear automatically in **BT Results**
7. Export to CSV with one click

The backtest engine fetches real Bybit historical klines and runs the identical Break & Bounce logic — same code as live trading.

---

## 🐳 Docker (Optional — Production)

### Start with Docker Compose (includes PostgreSQL)
```bash
# Create backend .env first
cp backend/.env.example backend/.env
# Edit backend/.env

docker-compose up -d
```

- Backend: http://localhost:3001
- PostgreSQL: localhost:5432

### Build frontend for production
```bash
cd frontend
npm run build
# Serve dist/ with nginx or any static host
```

### Full docker-compose with frontend nginx (optional)
Add a frontend service to `docker-compose.yml`:
```yaml
  frontend:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./frontend/dist:/usr/share/nginx/html
    depends_on:
      - backend
```

---

## 📊 REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get app config |
| PUT | `/api/config` | Update config |
| GET | `/api/symbols` | List tracked symbols |
| POST | `/api/symbols` | Add symbol |
| DELETE | `/api/symbols/:symbol` | Remove symbol |
| GET | `/api/daily-ranges` | Get stored daily ranges |
| POST | `/api/daily-ranges/refresh` | Force refresh daily ranges |
| GET | `/api/trades` | Get all trades |
| GET | `/api/trades/export-csv` | Export trades as CSV |
| GET | `/api/positions` | Get live Bybit positions |
| POST | `/api/positions/:symbol/close` | Close a position |
| GET | `/api/account/equity` | Get USDT equity |
| POST | `/api/backtest/run` | Run backtest |
| GET | `/api/backtest/results` | List backtest results |
| GET | `/api/backtest/results/:id/export-csv` | Export backtest as CSV |

### WebSocket (`ws://localhost:3001/ws`)
Push events from backend to frontend:
```json
{ "type": "breakout", "signal": { "symbol": "BTCUSDT", "direction": "bullish", ... } }
{ "type": "retest",   "signal": { ... } }
{ "type": "reversal", "signal": { "symbol": "BTCUSDT", "patternType": "hammer", "entryPrice": 65000, ... } }
{ "type": "trade_opened", "trade": { ... } }
{ "type": "candle",   "symbol": "BTCUSDT", "interval": "5", "candle": { ... }, "confirmed": true }
```

---

## 🔒 Security Notes

- **API keys** are stored in `backend/.env` and never sent to the frontend
- Always start on **testnet** (`BYBIT_TESTNET=true`) — switch to mainnet only after thorough testing
- Set `ENCRYPTION_KEY` to a strong random 32-character string
- The GUI has a prominent **TESTNET / MAINNET** indicator in the Dashboard header
- AUTO mode requires explicit toggle — manual override always available

---

## 🛠️ Development Scripts

### Backend
```bash
cd backend
npm run dev       # Start dev server (ts-node-dev, hot reload)
npm run build     # Compile TypeScript → dist/
npm start         # Run compiled production build
```

### Frontend
```bash
cd frontend
npm run dev       # Vite dev server (http://localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build
```

---

## 📦 Tech Stack

### Backend
- **Node.js 20** + **TypeScript 5** (strict)
- **Express 4** — REST API
- **bybit-api** — Official Bybit v5 REST + WebSocket
- **node-cron** — Daily range refresh scheduler
- **Winston** — Structured logging (console + file)
- **Drizzle ORM** + **pg** — PostgreSQL support
- **ws** — Internal WebSocket server (frontend push)

### Frontend
- **Vue 3** + **TypeScript** (Composition API + `<script setup>` only)
- **Vite 5** — Build tool
- **Pinia** — State management
- **Vue Router 4** — Routing
- **Tailwind CSS 3** + **DaisyUI 4** — UI (dark mode default)
- **lightweight-charts** (TradingView) — Equity curve & price charts
- **Axios** — HTTP client

---

## 📁 Data Files (JSON mode)

Stored in `backend/data/` (auto-created, gitignored):

| File | Contents |
|------|----------|
| `config.json` | App config (symbols, risk params) |
| `trades.json` | All trades (live + paper) |
| `daily-ranges.json` | Previous day highs & lows |
| `backtest-results.json` | Backtest result history (last 50) |

---

## 🗃️ PostgreSQL (Optional)

Set `STORAGE_MODE=postgres` and `DATABASE_URL` in `.env`, then run migrations:
```bash
cd backend
psql $DATABASE_URL -f migrations/0001_init.sql
```

Or use Docker Compose which starts a pre-configured PostgreSQL instance.

---

## ⚡ Candle Patterns Implemented

| Pattern | Direction | Description |
|---------|-----------|-------------|
| **Hammer** | Bullish | Small body at top, lower wick ≥ 2× body |
| **Inverted Hammer** | Bullish | Small body at bottom, upper wick ≥ 2× body |
| **Bullish Engulfing** | Bullish | Bullish candle body fully engulfs prior bearish body |
| **Shooting Star** | Bearish | Small bearish body at bottom, upper wick ≥ 2× body |
| **Bearish Engulfing** | Bearish | Bearish candle body fully engulfs prior bullish body |

---

## 📄 License

MIT — use at your own risk. Not financial advice.
