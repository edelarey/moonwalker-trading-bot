# 🌙 Moonwalker Trading Bot

A Vue + Node app for testing and running multiple strategies on **Bybit USDT perpetual futures**. It starts in **paper mode**: live market data, simulated fills, no orders. Switch to live only after you have saved a sub-account key locally and typed `LIVE` in Settings.

> ⚠️ **Risk warning.** Crypto trading can lose money quickly. Defaults are starting points, not an edge. Paper first. Never risk more than you can afford to lose. Not financial advice.

---

## What it does now

- **Paper broker** (default) — fills at last close plus fee/slippage; SL/TP close on later candles. Never calls Bybit order APIs.
- **Live mode** — same signals, real market orders. Requires locally stored API keys. Live equity is Settings **Equity source**: Unified USDT only, or Bybit total Unified USD collateral (`totalMarginBalance`). Paper stays virtual USDT.
- **Several strategies at once** — each with its own Auto toggle and coin list. Directional perps are fully tradeable; hedge/funding types are paper-complete but only **partially** live (see below).
- **Strategy Manager** — edit params, **Reset defaults** per row, names without a “Default” prefix. Saves persist across backend restarts.
- **Top 50 Bybit USDT perps** in Coin Scanner (up to 50 active).
- **Trade history** kept in `backend/data/trades.json` (paper-account reset does not wipe it; Settings can clear history separately).
- **Keys stay on this machine** — encrypted `backend/data/secrets.json`, gitignored.

Frontend: **http://localhost:5180**  
Backend: **http://localhost:3001**

---

## Strategies

Crypto-perp starting defaults (not claimed optimal). Strategy Manager seeds one named row per type (Break & Bounce, EMA Pullback, … — no “Default” in the name). Edit freely; **Reset defaults** on that row restores these starting values without changing the name, coins, or On/Auto.

**Tradeable** here means the bot can send a real Bybit USDT-perp order that implements the idea. This app only trades **Bybit linear perps**. It does not place Bybit spot, Binance, or options orders.

### Directional (fully tradeable)

Paper and live both open/close Bybit perps (live needs keys + `LIVE`).

| Type | Idea | Starting defaults |
|------|------|-------------------|
| `break_bounce` | Prev-day range break → retest → reversal candle | D / 15m / 5m, 0.08% buffer, UTC 00:00–04:00, 2.5R |
| `ema_pullback` | 9/21 trend, enter on a tap of the fast EMA | 15m, 2% SL / 4% TP |
| `supertrend` | ATR trailing band; trade flips | ATR 10 × 2 on 15m |
| `donchian` | 20-bar channel breakout, ATR stops | 4h, SL 2.5 ATR, TP 4 ATR |
| `adx_di` | +DI/−DI cross only when ADX ≥ min; ATR stops | 1h, ADX 14 ≥ 25, SL 2 ATR, TP 3 ATR |
| `keltner` | EMA ± ATR envelope (breakout or fade) | 1h, EMA 20 ± 1.5 ATR(10), SL 2 ATR, TP 3 ATR |
| `vwap` | Fade extensions from UTC-session VWAP | 5m, 0.6% band |
| `orb` | First N minutes of UTC day set the range | 30m range, 2R, 1 trade/day |
| `rsi` | Extreme mean-reversion | 14 / 20 / 80, 2 confirm candles, 1h |
| `ma_crossover` | Fast/slow MA cross | 20/50 on 4h |
| `bollinger` | Band breakout + volume | 20 / 2σ, 4h, breakout mode |
| `dca` | Timed buys with TP / trail | $50 / 24h, $500 cap, 15% TP |
| `grid` | Geometric grid inside a range | 12 levels, set upper/lower per coin |

Break & Bounce still uses the dedicated engine (blueprint → breakout close → retest → hammer / engulfing / shooting star). Other types go through the strategy registry.

### Hedging / funding (read this before turning Auto on)

| Type | Idea | Paper | Live Bybit perp | Not implemented |
|------|------|-------|-----------------|-----------------|
| `funding_arb` | Collect positive funding: long spot + short the same perp | **Yes** — virtual spot + short perp; funding is credited on the paper book | **Partial** — only the **short perp**. You must hold spot yourself. Not a complete live arb. | Bybit **spot** orders; automatic two-leg live |
| `cross_exchange` | Inventory/dislocation hedge: fade Bybit vs a more liquid book | **Yes** — Binance USDT-M last is a public **price reference** (no Binance keys). Hedge fills on Bybit. Backtest uses Bybit perp vs Bybit spot. | **Partial** — hedge is a Bybit perp only. **No order is sent to Binance.** | A second exchange, inventory fills on a thin venue |
| `dynamic_delta` | Scale a short hedge when \|net book delta\|/equity or ATR% exceeds a trigger | **Yes** — reads open paper trades; backtest assumes a standing long bag | **Yes** — hedge is a Bybit perp (default `BTCUSDT`). Useful only if you already have directional size. | Options, per-name delta, auto rebalance of every coin |
| `drawdown_hedge` | After a peak-to-trough equity drop, short a portion; cover on recovery | **Yes** — uses paper equity peak | **Yes** — hedge is a Bybit perp. Does not sell coins into stables. | Converting holdings to USDT/USDC, options puts |

**Do not treat `funding_arb` or `cross_exchange` as live “set and forget”.** On live they are one-legged Bybit shorts. Full delta-neutral funding and true cross-exchange hedging need spot and/or another venue, which this bot does not trade.

Hedge defaults:

| Type | Starting defaults |
|------|-------------------|
| `funding_arb` | 1h, enter 8h funding ≥ 0.01%, exit ≤ 0.003%, max basis 0.2% |
| `cross_exchange` | 5m, enter 0.04% gap, exit 0.015%, stop 0.2%, max hold 60m |
| `dynamic_delta` | 15m, hedge `BTCUSDT` if \|delta\| ≥ 8% equity or ATR% ≥ 1.2, hedge 50% |
| `drawdown_hedge` | 15m, short after 3% peak-to-trough, cover at 1.2%, 50% via `BTCUSDT` |

### Strategy Manager

- **Edit** opens the param form for that type (including Break & Bounce timeframes/windows, Bollinger SL/TP, hedge knobs).
- **Reset defaults** writes factory params back to that instance only. Confirm first. Name, symbols, enabled, and Auto are left alone.
- Type is locked on an existing row so changing the dropdown cannot wipe saved params. Create a new row if you want a different type.
- Backend boot **adds missing types** only. It does not overwrite params you saved.
- Position size is global (Settings): `risk_percent` (default 1% of equity if the stop is hit exactly) or `fixed_usdt`. Live equity is Settings **Equity source**: Unified USDT only, or Bybit total Unified USD collateral.

### Backtests

- **Backtest** page: pick any strategy instance, including Break & Bounce. Only **BTCUSDT** is selected until you add coins. Dates, coins, and risk % are remembered in the browser. Date ranges use **dd-mm-YYYY** (day first) in the form and on results.
- PnL is ending equity − start (default **$10,000**). **MaxDD** is the worst peak-to-trough on the closed-trade book in USDT — not the per-trade stop %. Signal backtests exit at **candle close**, which can overshoot the stop; leftover opens are marked at the last close.
- Results live at **BT Results** (`/backtest/results`). `/strategies/results` redirects there.

---

## Quick start

**Prerequisites:** Node.js 20+, npm 10+. API keys are **not** required for paper trading (public klines).

```bash
cd /home/edelarey/dev-personal/moonwalker-trading-bot
cp backend/.env.example backend/.env
# Set ENCRYPTION_KEY to a random 32+ character string (used to encrypt keys later)
npm run install:all
npm run dev
```

Open **http://localhost:5180**.

1. Stay on **Paper** (default).
2. **Coin Scanner** — enable coins from the top 50 (or add any USDT perp).
3. **Trading** or **Strategy Manager** — turn **On** + **Auto** on one or more strategies and pick coins.
4. Turn **On** + **Auto** on the strategy row (Break & Bounce uses the same toggles; it only fires inside the UTC liquidity window).
5. Watch **Positions** for paper fills and SL/TP closes.

### One terminal vs two processes

`npm run dev` is **one terminal**, not one process. A parent (`concurrently`) starts two children:

1. **Backend** on port 3001.
2. **Frontend** (Vite on 5180), but only after `wait-on` sees `127.0.0.1:3001`. That avoids the Vite `ws proxy error: ECONNREFUSED 127.0.0.1:3001` you get if the UI boots first.

**Ctrl+C** sends SIGTERM to both. The backend shuts down gracefully (cron, Bybit socket, HTTP, logs), then Vite exits. You should not need a second terminal for day-to-day work.

| | Combined `npm run dev` | Split terminals |
|--|------------------------|-----------------|
| Logs | One window, prefixed `backend` / `frontend` | Separate |
| Stop | Ctrl+C stops both | You must stop each yourself |
| Crash | If one child dies, the other is stopped (`-k`) | The other keeps running |
| Restart one side | Stop the whole command, or use the split scripts | Restart only that terminal |
| Debugger | Slightly clumsier | Attach to one process easily |

This is **dev only**. Production still runs the compiled backend by itself; Vite is not the production server.

To run them apart (debugging, keep the UI up while the API restarts):

```bash
npm run dev:backend    # http://localhost:3001
npm run dev:frontend    # http://localhost:5180  (start after the API is up)
```

---

## Paper vs live

| Mode | Data | Orders | Keys |
|------|------|--------|------|
| **Paper** (default) | Live Bybit klines | Local simulation | Not needed |
| **Live** | Same klines | `placeMarketOrder` on Bybit | Required |

On **Trading** or **Settings**: click Paper, or type `LIVE` and confirm. Live is rejected until keys are saved. Sidebar badge is a shortcut to Settings.

Paper fill model: last close ± slippage (default **3 bps**), taker fee (default **6 bps**). If a candle tags both SL and TP, the **stop** is filled.

---

## Bybit sub-account keys

Save them in **Settings → Bybit sub-account** (label, key, secret, testnet toggle).

- Encrypted with `ENCRYPTION_KEY` into `backend/data/secrets.json` (file mode `0600`).
- `backend/data/*.json` and `backend/.env` are gitignored. Keys are never committed and never sent back to the UI (only a hint like `••••Ab12`).
- Use a **sub-account** with Contract Trade and **no withdrawal**.
- Optional fallback: `BYBIT_API_KEY` / `BYBIT_API_SECRET` in `backend/.env`.

Removing keys in Settings deletes the local file and forces Paper mode.

---

## Configuration

### `backend/.env`

```env
# Optional fallback — prefer Settings UI for keys
BYBIT_API_KEY=
BYBIT_API_SECRET=
BYBIT_TESTNET=true

PORT=3001
NODE_ENV=development
STORAGE_MODE=json
ENCRYPTION_KEY=change_this_to_a_random_32_char_string
```

### `frontend/.env` (optional)

```env
VITE_API_URL=http://localhost:3001
```

The Vite dev server proxies `/api` and `/ws` to the backend, so this is only needed if the UI talks to the API on another host.

### Global params (Settings / Trading)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `tradingMode` | `paper` | `paper` or `live` |
| `equitySource` | `usdt` | Live only. `usdt` = Unified USDT coin line. `unified_usd` = Bybit `totalMarginBalance` (enabled collateral after haircuts). Paper stays virtual USDT. Isolated still needs USDT. These perps still settle in USDT. |
| `riskPercent` | `1` | % of that live (or paper) equity risked per sized trade |
| `leverage` | `1` | Perp multiplier (1–100). Strategy instance can override. Fixed USDT notional = USDT × leverage |
| `stopFillMode` | `bar_close` | Backtest SL/TP: `stop_price` fills when the bar trades through the level; `bar_close` waits for the close. Per-strategy override in Strategy Manager. Live always uses exchange stops. |
| `tpMultiplier` | `2.5` | Break & Bounce take-profit = risk × this |
| `liquidityWindowStart` / `End` | `00:00` / `04:00` UTC | Break & Bounce entry window |
| `maxDailyTradesPerCoin` | `1` | Break & Bounce cap |
| `breakoutBufferPercent` | `0.08` | Close must clear the level by this % |
| `paperStartingEquity` | `10000` | Virtual USDT |
| `paperFeeBps` | `6` | ~0.06% taker |
| `paperSlippageBps` | `3` | Applied on paper entry/exit |

Strategy-specific params are edited per instance in Strategy Manager.

---

## GUI

| Page | Description |
|------|-------------|
| **Dashboard** | Paper/live badge, equity (paper USDT, or live USDT / Unified USD per Settings), PnL, breakouts, recent trades |
| **Coin Scanner** | Top 50 Bybit USDT perps by 24h turnover; enable up to 50; add others manually |
| **Trading** | Paper/Live switch and **all strategies** (including Break & Bounce) with On / Auto / coin chips. Strategy rules live in Strategy Manager; account size defaults in Settings |
| **Positions** | Open book + full history (filter paper/live, coin, strategy); CSV export |
| **Backtest** | Historical run for any strategy instance (including Break & Bounce); BTCUSDT default; form remembered; date range **dd-mm-YYYY** |
| **BT Results** | Summary metrics (incl. MaxDD USDT and %), equity curve, trade list |
| **Strategy Manager** | Create/edit/reset-defaults/delete instances, deploy paper, run backtests |
| **Settings** | Mode switch, live equity source, paper reset, clear trade/backtest history, **sub-account keys**, risk % / sizing |
| **Help** | Full strategy catalog, hedge tradeability, paper workflow, FAQ |

---

## Testing a strategy

1. Leave mode on **Paper**.
2. Enable **BTCUSDT** (or ETH) only at first.
3. Deploy **one** strategy (e.g. EMA pullback on 15m — more signals).
4. Confirm: signal → paper fill on Positions → SL or TP close → equity moves.
5. Run a historical backtest with the same params.
6. Paper for several sessions. Break & Bounce and ORB are session-bound (UTC).
7. Only then consider live with tiny size.

---

## Architecture

```
moonwalker-trading-bot/
├── backend/src/
│   ├── index.ts                 # HTTP + frontend WebSocket, boot
│   ├── config.ts                # .env + data/config.json
│   ├── execution/
│   │   ├── paperBroker.ts       # Virtual account, fills, SL/TP
│   │   └── executionService.ts  # Routes paper vs live
│   ├── security/secrets.ts      # Encrypted local API keys
│   ├── bybit/                   # REST v5 + kline WebSocket
│   ├── strategy/
│   │   ├── breakBounce.ts       # Dedicated B&B engine
│   │   ├── registry.ts          # All other strategy types
│   │   ├── runtime.ts           # Enable/warmup/subscribe
│   │   └── strategies/          # RSI, EMA, Supertrend, ORB, …
│   ├── backtest/engine.ts       # Historical B&B
│   ├── storage/                 # JSON trades, ranges, instances
│   └── api/routes.ts
├── frontend/                    # Vite + Vue 3, port 5180
└── README.md
```

Signals (Break & Bounce reversals and registry `entry`/`exit`) go through `executionService`. If `tradingMode === 'paper'`, `placeMarketOrder` is never called.

---

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PUT | `/api/config` | App config (live mode rejected without keys) |
| GET/POST/DELETE | `/api/symbols` | Tracked symbols |
| POST | `/api/symbols/bulk` | Enable a list (e.g. from top 50) |
| GET | `/api/markets/top` | Top USDT linear perps by turnover |
| GET/PUT/DELETE | `/api/keys` | Key **status** / save / clear (secret never returned) |
| GET | `/api/trades` | All trades |
| GET | `/api/trades/export-csv` | CSV export |
| GET | `/api/positions` | Paper book or Bybit positions |
| POST | `/api/positions/:symbol/close` | Close paper or live |
| GET | `/api/account/equity` | Paper snapshot, or live `{ equity, equitySource, usdtEquity, unifiedUsdEquity }` |
| GET/POST | `/api/paper/account`, `/api/paper/reset` | Paper account |
| POST/GET | `/api/backtest/run`, `/api/backtest/results` | B&B backtest |
| GET/POST/PUT/DELETE | `/api/strategies` | Strategy instances |
| GET | `/api/strategies/defaults/:type` | Factory starting params for a type |
| POST | `/api/strategies/:id/reset-defaults` | Restore factory params (keeps name/coins/On/Auto) |
| POST | `/api/strategies/:id/backtest` | Instance backtest |
| DELETE | `/api/trades` / `/api/backtest/results` | Clear history (see Settings) |

### WebSocket (`ws://localhost:3001/ws`, proxied as `/ws` on 5180)

```json
{ "type": "candle", "symbol": "BTCUSDT", "interval": "15", "candle": { }, "confirmed": true }
{ "type": "breakout", "signal": { } }
{ "type": "retest", "signal": { } }
{ "type": "reversal", "signal": { } }
{ "type": "strategy_signal", "strategyId": "…", "strategyName": "…", "signal": { } }
{ "type": "trade_opened", "trade": { } }
{ "type": "trade_closed", "trade": { } }
{ "type": "paper_account", "account": { } }
```

---

## Data files (gitignored)

`backend/data/` is created at runtime:

| File | Contents |
|------|----------|
| `config.json` | Symbols, risk, `tradingMode`, strategy default templates |
| `trades.json` | All paper + live trades (history is kept) |
| `paper-account.json` | Virtual equity / realized PnL |
| `strategy-instances.json` | Your strategy configs |
| `secrets.json` | Encrypted API key + secret |
| `daily-ranges.json` | Prev-day highs/lows |
| `backtest-results.json` | Last 50 B&B backtests |

---

## Security

- Default mode is **paper**. Live needs keys **and** typing `LIVE`.
- Secrets live only under `backend/data/` and `backend/.env` (both gitignored).
- Set a real `ENCRYPTION_KEY` before saving keys.
- Header / sidebar show **PAPER** or **LIVE**.
- Per-strategy Auto is off until you turn it on (including Break & Bounce).

---

## Scripts

```bash
# root
npm run install:all
npm run dev                 # one terminal, two processes: API then Vite. Ctrl+C stops both
npm run dev:backend         # API only (3001)
npm run dev:frontend        # Vite only (5180) — wait until the API is listening
npm run build:frontend

# backend/
npm run dev | build | start

# frontend/
npm run dev                 # http://localhost:5180 (strictPort)
npm run build | preview
```

---

## Tech stack

**Backend:** Node 20, TypeScript, Express, `bybit-api`, node-cron, Winston, optional Drizzle/pg.  
**Frontend:** Vue 3, Vite 5 (port 5180), Pinia, Vue Router, Tailwind + DaisyUI, lightweight-charts, Axios.

---

## Break & Bounce candle patterns

| Pattern | Direction |
|---------|-----------|
| Hammer / inverted hammer | Bullish |
| Bullish engulfing | Bullish |
| Shooting star | Bearish |
| Bearish engulfing | Bearish |

---

## License

MIT — use at your own risk. Not financial advice.
