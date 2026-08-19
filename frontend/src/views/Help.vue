<script setup lang="ts">
const faqs = [
  { q: 'Why is my breakout not triggering?', a: 'The breakout candle must fully CLOSE beyond the level + buffer. A wick that touches the level is not enough — the full candle body close is required.' },
  { q: 'Why am I not getting entry signals after a breakout?', a: 'The retest must bring price back to within 0.1% of the broken level on the entry candle. If price runs away from the level without retesting, no entry is generated.' },
  { q: 'When does the daily range refresh?', a: 'Automatically at UTC 00:00 via the cron scheduler. You can also force-refresh by calling the /api/daily-ranges/refresh endpoint or restarting the backend.' },
  { q: 'What does "clearly" mean for a breakout?', a: 'The breakout buffer (default 0.05%) means the close must be at least 0.05% beyond the level — not just touching it. This filters out false breakouts.' },
  { q: 'Can I change timeframes while the bot is running?', a: 'Yes, but you must restart the backend for WebSocket re-subscription to take effect. The config is saved immediately, but the live feeds use the timeframes from startup.' },
  { q: 'Why only trade during the liquidity window?', a: 'Crypto markets have higher volume and tighter spreads around the UTC midnight open. Trading outside this window risks poor fills, wider spreads, and choppy price action that generates false signals.' },
  { q: 'What is the maximum number of active symbols?', a: 'You can add unlimited symbols to the list, but only 50 can be enabled (actively tracked) at a time. Inactive symbols stay in the list but receive no WebSocket subscriptions and generate no signals.' },
  { q: 'Did my strategy edits get saved?', a: 'Yes — Update writes params to strategy-instances.json. A backend restart no longer overwrites them. Use Reset defaults on a card (or in the editor) if you want the factory starting values back. Names do not include the word Default; they are just the strategy name.' },
  { q: 'Why is Max Drawdown larger than my stop-loss %?', a: 'MaxDD is the largest peak-to-trough drop in account equity (USDT) across the backtest, not the per-trade stop. Consecutive losers add up. Risk % (default 1%) is how much equity one exact stop costs. This engine also fills exits at the candle close, which can overshoot the stop, and leftover open trades are marked at the last close.' },
  { q: 'Do hedge strategies send live orders?', a: 'dynamic_delta and drawdown_hedge send a Bybit USDT-perp hedge. funding_arb live only shorts the perp (you must hold spot yourself). cross_exchange live only hedges on Bybit — no Binance order is sent. Paper simulates the full idea for all four.' },
]
</script>

<template>
  <div class="space-y-4 max-w-4xl">
    <h1 class="text-2xl font-bold">📖 Help &amp; Strategy Guide</h1>

    <!-- Strategy Overview — always visible -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-5">
        <h2 class="text-lg font-bold mb-2">🏄 Break &amp; Bounce Strategy Overview</h2>
        <p class="text-sm text-base-content/80 leading-relaxed mb-4">
          The Break &amp; Bounce strategy is a pure price-action scalping method for USDT perpetual futures.
          It identifies when price breaks out of the previous period's range, waits for a retest of the broken level,
          then enters on a confirming reversal candle.
        </p>
        <div class="space-y-3">
          <div class="flex gap-3 p-3 rounded-lg bg-base-300">
            <span class="text-xl flex-shrink-0">1️⃣</span>
            <div><p class="font-semibold text-sm">Daily Blueprint</p><p class="text-xs text-base-content/60 mt-0.5">At the start of each period, the previous period's high and low are recorded as the key levels to watch.</p></div>
          </div>
          <div class="flex gap-3 p-3 rounded-lg bg-base-300">
            <span class="text-xl flex-shrink-0">2️⃣</span>
            <div><p class="font-semibold text-sm">Breakout Confirmation</p><p class="text-xs text-base-content/60 mt-0.5">A full breakout candle must close clearly beyond the level — above for longs (bullish), below for shorts (bearish).</p></div>
          </div>
          <div class="flex gap-3 p-3 rounded-lg bg-base-300">
            <span class="text-xl flex-shrink-0">3️⃣</span>
            <div><p class="font-semibold text-sm">Retest + Reversal Entry</p><p class="text-xs text-base-content/60 mt-0.5">After the breakout, price must return to test the broken level. A reversal candle pattern (Hammer, Engulfing, Shooting Star) on the entry timeframe triggers the trade.</p></div>
          </div>
          <div class="flex gap-3 p-3 rounded-lg bg-base-300">
            <span class="text-xl flex-shrink-0">4️⃣</span>
            <div><p class="font-semibold text-sm">Risk Management</p><p class="text-xs text-base-content/60 mt-0.5">Stop-loss is placed just beyond the reversal candle's extreme. Take-profit is 2.5× the risk distance (configurable). Only 1 trade per coin per period, only during the configured liquidity window.</p></div>
          </div>
        </div>
      </div>
    </div>

    <div class="card bg-base-200 border border-base-300">
      <div class="card-body p-5 space-y-3">
        <h2 class="text-lg font-bold">📚 All strategies</h2>
        <p class="text-sm text-base-content/80">
          Strategy Manager seeds one row per type. Edit parameters, then <strong>Reset defaults</strong> to restore the starting values. Names are just the strategy (no “Default” prefix).
          Directional types open/close Bybit USDT perps in paper and live. Hedge types are paper-complete; live is often one-legged — see the table.
        </p>
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead><tr><th>Strategy</th><th>Type</th><th>Idea</th><th>Starting params</th></tr></thead>
            <tbody>
              <tr><td class="font-semibold text-sm">Break &amp; Bounce</td><td class="font-mono text-xs">break_bounce</td><td class="text-xs">Prev-period range → breakout close → retest → reversal candle</td><td class="text-xs font-mono">D / 15m / 5m, 0.08% buffer, UTC 00:00–04:00, 2.5R</td></tr>
              <tr><td class="font-semibold text-sm">EMA Pullback</td><td class="font-mono text-xs">ema_pullback</td><td class="text-xs">9/21 trend; enter on a tap of the fast EMA</td><td class="text-xs font-mono">15m, 2% SL / 4% TP</td></tr>
              <tr><td class="font-semibold text-sm">Supertrend</td><td class="font-mono text-xs">supertrend</td><td class="text-xs">ATR trailing band; trade flips</td><td class="text-xs font-mono">ATR 10 × 2 on 15m</td></tr>
              <tr><td class="font-semibold text-sm">Donchian Breakout</td><td class="font-mono text-xs">donchian</td><td class="text-xs">20-bar channel break, ATR stops</td><td class="text-xs font-mono">4h, SL 2.5 ATR, TP 4 ATR</td></tr>
              <tr><td class="font-semibold text-sm">VWAP Fade</td><td class="font-mono text-xs">vwap</td><td class="text-xs">Fade UTC-session VWAP extensions</td><td class="text-xs font-mono">5m, 0.6% band, 1.2% SL / 0.8% TP</td></tr>
              <tr><td class="font-semibold text-sm">Opening Range Breakout</td><td class="font-mono text-xs">orb</td><td class="text-xs">First N minutes of the UTC day set the range</td><td class="text-xs font-mono">30m range, 2R, 1 trade/day</td></tr>
              <tr><td class="font-semibold text-sm">RSI</td><td class="font-mono text-xs">rsi</td><td class="text-xs">Extreme mean-reversion</td><td class="text-xs font-mono">14 / 20 / 80, 2 confirms, 1h, 2.5% SL</td></tr>
              <tr><td class="font-semibold text-sm">MA Crossover</td><td class="font-mono text-xs">ma_crossover</td><td class="text-xs">Fast/slow MA cross</td><td class="text-xs font-mono">20/50 on 4h, 3% SL / 8% TP</td></tr>
              <tr><td class="font-semibold text-sm">Bollinger</td><td class="font-mono text-xs">bollinger</td><td class="text-xs">Band breakout + volume (or mean-reversion mode)</td><td class="text-xs font-mono">20 / 2σ, 4h, 3% SL / 6% TP</td></tr>
              <tr><td class="font-semibold text-sm">DCA</td><td class="font-mono text-xs">dca</td><td class="text-xs">Timed buys with TP / trail</td><td class="text-xs font-mono">$50 / 24h, $500 cap, 15% TP</td></tr>
              <tr><td class="font-semibold text-sm">Grid</td><td class="font-mono text-xs">grid</td><td class="text-xs">Geometric grid inside a range</td><td class="text-xs font-mono">12 levels, 4% range-break stop</td></tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Hedging / funding — read before Auto</p>
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead><tr><th>Strategy</th><th>Paper</th><th>Live Bybit perp</th><th>Not implemented</th></tr></thead>
            <tbody>
              <tr><td class="font-semibold text-sm">Funding Arb</td><td class="text-xs">Virtual spot + short perp; funding credited</td><td class="text-xs">Short perp only — hold spot yourself</td><td class="text-xs">Bybit spot orders</td></tr>
              <tr><td class="font-semibold text-sm">Cross-Exchange Hedge</td><td class="text-xs">Binance last is a price reference; hedge on Bybit</td><td class="text-xs">Bybit perp only — no Binance order</td><td class="text-xs">Second exchange</td></tr>
              <tr><td class="font-semibold text-sm">Dynamic Delta Hedge</td><td class="text-xs">Hedges when |delta| or ATR% is high</td><td class="text-xs">Bybit perp (default BTCUSDT)</td><td class="text-xs">Options, per-name delta</td></tr>
              <tr><td class="font-semibold text-sm">Drawdown Hedge</td><td class="text-xs">Shorts after a paper-equity drop</td><td class="text-xs">Bybit perp; does not sell coins to stables</td><td class="text-xs">USDT conversion, puts</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Timeframe Setup -->
    <details class="group bg-base-200 border border-base-300 rounded-xl overflow-hidden">
      <summary class="flex items-center justify-between px-5 py-4 cursor-pointer font-semibold text-base select-none list-none hover:bg-base-300 transition-colors">
        <span>⏱️ Timeframe Setup</span>
        <span class="text-lg transition-transform duration-200 group-open:rotate-180">▼</span>
      </summary>
      <div class="px-5 pb-5 pt-3 border-t border-base-300 space-y-4">
        <p class="text-sm text-base-content/70">Break &amp; Bounce uses three timeframes. Set them on the <strong>Break &amp; Bounce</strong> row in Strategy Manager (not on Trading).</p>
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead><tr><th>Setting</th><th>Default</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td class="font-semibold text-sm">📅 Blueprint Candle</td><td class="font-mono">D (Daily)</td><td class="text-xs text-base-content/70">The primary timeframe used to define the high/low range. The previous completed candle of this type sets the key levels. Weekly gives wider, more significant levels. Monthly is for very high-timeframe swing trading.</td></tr>
              <tr><td class="font-semibold text-sm">📊 Breakout Candle</td><td class="font-mono">15m</td><td class="text-xs text-base-content/70">Must close clearly beyond the blueprint level to confirm a breakout. Lower timeframes (5m) give earlier but noisier signals. Higher timeframes (1h, 4h) give fewer but more reliable signals.</td></tr>
              <tr><td class="font-semibold text-sm">🕯️ Entry Candle</td><td class="font-mono">5m</td><td class="text-xs text-base-content/70">The timeframe used to detect the retest and reversal candle pattern. Should be equal to or lower than the Breakout Candle. This is where Hammers, Engulfing candles, etc. are detected.</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">Common Preset Combinations</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div class="p-3 rounded-lg bg-base-300 text-xs"><p class="font-semibold text-profit mb-1">✅ Default (Balanced)</p><p class="font-mono">D / 15m / 5m</p><p class="text-base-content/50 mt-1">Best starting point for most traders.</p></div>
            <div class="p-3 rounded-lg bg-base-300 text-xs"><p class="font-semibold mb-1">🛡️ Conservative</p><p class="font-mono">D / 1h / 15m</p><p class="text-base-content/50 mt-1">Fewer signals, higher quality. Good for busy traders.</p></div>
            <div class="p-3 rounded-lg bg-base-300 text-xs"><p class="font-semibold text-warning mb-1">⚡ Aggressive</p><p class="font-mono">D / 5m / 1m</p><p class="text-base-content/50 mt-1">Many signals, higher noise. Requires close attention.</p></div>
            <div class="p-3 rounded-lg bg-base-300 text-xs"><p class="font-semibold text-info mb-1">📈 Swing</p><p class="font-mono">W / 4h / 1h</p><p class="text-base-content/50 mt-1">Weekly levels with 4h breakout. Longer-term trades.</p></div>
          </div>
        </div>
        <div class="alert alert-info text-xs py-2"><span>⚠ Timeframe changes take effect after restarting the backend (WebSocket re-subscription is required).</span></div>
      </div>
    </details>

    <!-- Risk Parameters -->
    <details class="group bg-base-200 border border-base-300 rounded-xl overflow-hidden">
      <summary class="flex items-center justify-between px-5 py-4 cursor-pointer font-semibold text-base select-none list-none hover:bg-base-300 transition-colors">
        <span>⚖️ Risk Parameters</span>
        <span class="text-lg transition-transform duration-200 group-open:rotate-180">▼</span>
      </summary>
      <div class="px-5 pb-5 pt-3 border-t border-base-300 space-y-3">
        <p class="text-sm text-base-content/70">Account-wide risk % / size / leverage live in <strong>Settings</strong>. Break &amp; Bounce window, buffer, and TP multiplier live on that strategy in Strategy Manager.</p>
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead><tr><th>Setting</th><th>Default</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td class="font-semibold text-sm">Risk % per trade</td><td class="font-mono">1%</td><td class="text-xs text-base-content/70">Maximum % of account equity risked on a single trade. 1% is the recommended maximum for conservative trading. On a $10,000 account, 1% = $100 max risk per trade.</td></tr>
              <tr><td class="font-semibold text-sm">TP Multiplier (R:R)</td><td class="font-mono">2.5</td><td class="text-xs text-base-content/70">Take-profit = (Entry-to-SL distance) × this multiplier. At 2.5, you aim to make 2.5× what you risk. Higher = fewer wins, bigger winners. Lower = more wins, smaller gains.</td></tr>
              <tr><td class="font-semibold text-sm">Liquidity Window Start</td><td class="font-mono">00:00 UTC</td><td class="text-xs text-base-content/70">The strategy only enters new trades after this UTC time each day. Midnight UTC marks the start of the most liquid crypto trading session.</td></tr>
              <tr><td class="font-semibold text-sm">Liquidity Window End</td><td class="font-mono">02:30 UTC</td><td class="text-xs text-base-content/70">No new trade entries after this time. Limits trading to the high-volume 2.5-hour window after the UTC open. Adjust for NY Open (13:30 UTC) if preferred.</td></tr>
              <tr><td class="font-semibold text-sm">Max trades/coin/day</td><td class="font-mono">1</td><td class="text-xs text-base-content/70">Maximum entries per coin per calendar day. Keeps 1 prevents revenge-trading after a stop-loss.</td></tr>
              <tr><td class="font-semibold text-sm">Breakout Buffer %</td><td class="font-mono">0.05%</td><td class="text-xs text-base-content/70">The breakout candle's close must exceed the level by at least this percentage. Prevents false breakouts where the candle barely touches the level.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="alert alert-success text-xs py-2"><span>💡 For a $10,000 account with 1% risk and 2.5 TP multiplier: a winning trade makes ~$250, a losing trade costs ~$100. You only need to win 29% of trades to break even.</span></div>
      </div>
    </details>

    <details class="group bg-base-200 border border-base-300 rounded-xl overflow-hidden">
      <summary class="flex items-center justify-between px-5 py-4 cursor-pointer font-semibold text-base select-none list-none hover:bg-base-300 transition-colors">
        <span>📄 Paper Trading</span>
        <span class="text-lg transition-transform duration-200 group-open:rotate-180">▼</span>
      </summary>
      <div class="px-5 pb-5 pt-3 border-t border-base-300 space-y-3 text-sm text-base-content/80">
        <ol class="list-decimal list-inside space-y-1">
          <li>Leave Trading Mode on <strong>Paper</strong> in Settings (default).</li>
          <li>In Strategy Manager, pick one strategy and one liquid symbol (BTCUSDT).</li>
          <li>Click <strong>Deploy paper</strong> — that enables the strategy and Auto (same for Break &amp; Bounce).</li>
          <li>Watch Positions: a signal should open a paper fill, then SL/TP close it on later candles.</li>
          <li>Compare with a historical backtest on the same params before considering Live.</li>
        </ol>
        <p class="text-xs text-base-content/60">Paper fills use the last close plus configured fee and slippage (defaults 6 bps / 3 bps). If a candle tags both SL and TP, the stop is filled (conservative). Settings can reset the paper account (keeps history) or clear trade / backtest history.</p>
      </div>
    </details>

    <details class="group bg-base-200 border border-base-300 rounded-xl overflow-hidden">
      <summary class="flex items-center justify-between px-5 py-4 cursor-pointer font-semibold text-base select-none list-none hover:bg-base-300 transition-colors">
        <span>🤖 Extra strategies (detail)</span>
        <span class="text-lg transition-transform duration-200 group-open:rotate-180">▼</span>
      </summary>
      <div class="px-5 pb-5 pt-3 border-t border-base-300 overflow-x-auto">
        <p class="text-sm text-base-content/70 mb-3">The full list is at the top of this page. Notes that are easy to miss:</p>
        <table class="table table-sm">
          <thead><tr><th>Type</th><th>Idea</th></tr></thead>
          <tbody>
            <tr><td class="font-mono text-xs">donchian</td><td class="text-xs">Stops are ATR multiples, not a %. The backtest also exits if price closes back through the channel, which can be past the ATR stop.</td></tr>
            <tr><td class="font-mono text-xs">ema_pullback</td><td class="text-xs">9/21 EMA trend; enter when price tags the fast EMA and closes back with the trend. Less noisy than a raw crossover.</td></tr>
            <tr><td class="font-mono text-xs">supertrend</td><td class="text-xs">ATR trailing band. Stay in the move until the band flips.</td></tr>
            <tr><td class="font-mono text-xs">vwap</td><td class="text-xs">Fade extensions away from the UTC-session VWAP; target is VWAP itself. Tight SL makes notional large when sizing by risk %.</td></tr>
            <tr><td class="font-mono text-xs">orb</td><td class="text-xs">First N minutes after UTC midnight set a range; trade the first close beyond it.</td></tr>
            <tr><td class="font-mono text-xs">funding_arb</td><td class="text-xs">Paper: virtual spot + short perp when 8h funding is rich. Live only shorts the perp.</td></tr>
            <tr><td class="font-mono text-xs">cross_exchange</td><td class="text-xs">Fade Bybit vs Binance (public ticker). Live hedge is Bybit only. Backtest uses Bybit perp vs spot.</td></tr>
            <tr><td class="font-mono text-xs">dynamic_delta</td><td class="text-xs">Hedge net long inventory when |delta|/equity or ATR% exceeds a trigger.</td></tr>
            <tr><td class="font-mono text-xs">drawdown_hedge</td><td class="text-xs">After a peak-to-trough equity drop, short a portion; cover when drawdown shrinks.</td></tr>
          </tbody>
        </table>
      </div>
    </details>

    <!-- Live Trading Controls -->
    <details class="group bg-base-200 border border-base-300 rounded-xl overflow-hidden">
      <summary class="flex items-center justify-between px-5 py-4 cursor-pointer font-semibold text-base select-none list-none hover:bg-base-300 transition-colors">
        <span>🤖 Live Trading Controls</span>
        <span class="text-lg transition-transform duration-200 group-open:rotate-180">▼</span>
      </summary>
      <div class="px-5 pb-5 pt-3 border-t border-base-300 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-4 rounded-lg bg-base-300 space-y-2">
            <p class="font-semibold text-sm">🔵 Auto OFF (default)</p>
            <p class="text-xs text-base-content/70">Each strategy in <strong>Trading</strong> / Strategy Manager has its own Auto toggle (including Break &amp; Bounce). Off = signals still show in the feed, no fills.</p>
          </div>
          <div class="p-4 rounded-lg bg-base-300 space-y-2">
            <p class="font-semibold text-sm text-warning">⚡ Auto ON</p>
            <p class="text-xs text-base-content/70">That strategy opens trades on its signals in the current Paper/Live mode. <strong class="text-warning">Keep Paper until a strategy looks stable in backtests and paper fills.</strong></p>
          </div>
        </div>
        <div class="p-4 rounded-lg bg-base-300 space-y-2">
          <p class="font-semibold text-sm">📄 Paper vs Testnet vs Live</p>
          <p class="text-xs text-base-content/70"><strong>Paper</strong> (default) uses live Bybit prices and simulates fills, fees, and SL/TP locally. No API keys and no orders. <strong>Bybit testnet</strong> is a separate exchange sandbox — only used if Trading Mode is Live and <code>BYBIT_TESTNET=true</code>. <strong>Live</strong> sends real orders. Switch modes in <strong>Settings</strong>.</p>
          <p class="text-xs text-loss font-medium mt-1">⚠ Stay in paper until a strategy shows stable paper results. Type LIVE in Settings to leave paper mode.</p>
        </div>
      </div>
    </details>

    <!-- Backtesting -->
    <details class="group bg-base-200 border border-base-300 rounded-xl overflow-hidden">
      <summary class="flex items-center justify-between px-5 py-4 cursor-pointer font-semibold text-base select-none list-none hover:bg-base-300 transition-colors">
        <span>🧪 Backtesting</span>
        <span class="text-lg transition-transform duration-200 group-open:rotate-180">▼</span>
      </summary>
      <div class="px-5 pb-5 pt-3 border-t border-base-300 space-y-4">
        <ol class="list-decimal list-inside space-y-1 text-sm text-base-content/80">
          <li>Go to <strong>Backtest</strong> in the sidebar</li>
          <li>Pick a strategy (Break &amp; Bounce is in the same list as the others). Params come from Strategy Manager</li>
          <li>Select a date range. Risk % is how much equity one exact stop costs (default 1%)</li>
          <li>Only <strong>BTCUSDT</strong> is selected by default. Your last coins, dates, and risk are remembered in the browser</li>
          <li>Strategy params are read-only here — edit them in Strategy Manager</li>
          <li>Click <strong>▶ Run Backtest</strong>. Results open at <strong>BT Results</strong> (same page as Strategy Results)</li>
          <li>PnL is ending equity − start (default $10,000). MaxDD is the worst peak-to-trough on the closed-trade book, in USDT</li>
          <li>Each result lists the <strong>settings used for that run</strong> (strategy params, risk %, leverage) plus size / leverage / qty on every trade</li>
        </ol>
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead><tr><th>Metric</th><th>What it means</th><th>Target</th></tr></thead>
            <tbody>
              <tr><td class="font-semibold text-sm">Win Rate</td><td class="text-xs text-base-content/70">% of trades that hit take-profit</td><td class="text-xs text-profit">&gt; 40%</td></tr>
              <tr><td class="font-semibold text-sm">Profit Factor</td><td class="text-xs text-base-content/70">Gross profit ÷ gross loss. &gt;1 = profitable</td><td class="text-xs text-profit">&gt; 1.5</td></tr>
              <tr><td class="font-semibold text-sm">Max Drawdown</td><td class="text-xs text-base-content/70">Largest peak-to-trough equity drop</td><td class="text-xs text-profit">&lt; 15%</td></tr>
              <tr><td class="font-semibold text-sm">Avg R:R</td><td class="text-xs text-base-content/70">Average reward-to-risk ratio achieved</td><td class="text-xs text-profit">&gt; 2.0</td></tr>
            </tbody>
          </table>
        </div>
        <div class="alert text-xs py-2"><span>⚠ Past performance does not guarantee future results. Backtest results are simulated and do not account for slippage or exchange fees.</span></div>
      </div>
    </details>

    <!-- Candle Patterns -->
    <details class="group bg-base-200 border border-base-300 rounded-xl overflow-hidden">
      <summary class="flex items-center justify-between px-5 py-4 cursor-pointer font-semibold text-base select-none list-none hover:bg-base-300 transition-colors">
        <span>🕯️ Candle Patterns</span>
        <span class="text-lg transition-transform duration-200 group-open:rotate-180">▼</span>
      </summary>
      <div class="px-5 pb-5 pt-3 border-t border-base-300 space-y-4">
        <p class="text-sm text-base-content/70">These are the five reversal patterns the bot detects on the entry candle timeframe.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Bullish patterns -->
          <div class="p-4 rounded-lg bg-base-300 space-y-2">
            <p class="font-semibold text-sm text-profit">🟢 Bullish Patterns (Long entries)</p>
            <div class="space-y-3 mt-2">
              <div class="flex gap-3">
                <pre class="text-xs text-profit font-mono leading-tight flex-shrink-0">  |
  |
 [■]
  |
  |
  |</pre>
                <div><p class="font-semibold text-xs">Hammer</p><p class="text-xs text-base-content/60">Small body at the top, long lower wick ≥ 2× body size. Signals rejection of lower prices after a retest.</p></div>
              </div>
              <div class="flex gap-3">
                <pre class="text-xs text-profit font-mono leading-tight flex-shrink-0">  |
  |
  |
 [■]
  |</pre>
                <div><p class="font-semibold text-xs">Inverted Hammer</p><p class="text-xs text-base-content/60">Long upper wick ≥ 2× body, small body at the bottom. Bulls attempted a rally. Entry on close.</p></div>
              </div>
              <div class="flex gap-3">
                <pre class="text-xs text-profit font-mono leading-tight flex-shrink-0"> [▓]
[■■■]</pre>
                <div><p class="font-semibold text-xs">Bullish Engulfing</p><p class="text-xs text-base-content/60">Current bullish candle body fully covers the prior bearish body. Strong reversal signal.</p></div>
              </div>
            </div>
          </div>
          <!-- Bearish patterns -->
          <div class="p-4 rounded-lg bg-base-300 space-y-2">
            <p class="font-semibold text-sm text-loss">🔴 Bearish Patterns (Short entries)</p>
            <div class="space-y-3 mt-2">
              <div class="flex gap-3">
                <pre class="text-xs text-loss font-mono leading-tight flex-shrink-0">  |
  |
  |
 [▓]</pre>
                <div><p class="font-semibold text-xs">Shooting Star</p><p class="text-xs text-base-content/60">Long upper wick ≥ 2× body, small bearish body at the bottom. Price rallied and was rejected hard.</p></div>
              </div>
              <div class="flex gap-3">
                <pre class="text-xs text-loss font-mono leading-tight flex-shrink-0">[■■■]
 [▓▓]</pre>
                <div><p class="font-semibold text-xs">Bearish Engulfing</p><p class="text-xs text-base-content/60">Current bearish candle body fully covers the prior bullish body. Strong bearish reversal signal.</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </details>

    <!-- Strategy Manager -->
    <details class="group bg-base-200 border border-base-300 rounded-xl overflow-hidden">
      <summary class="flex items-center justify-between px-5 py-4 cursor-pointer font-semibold text-base select-none list-none hover:bg-base-300 transition-colors">
        <span>🤖 Strategy Manager</span>
        <span class="text-lg transition-transform duration-200 group-open:rotate-180">▼</span>
      </summary>
      <div class="px-5 pb-5 pt-3 border-t border-base-300 space-y-4">
        <p class="text-sm text-base-content/70">
          Strategy Manager is the library. One row is seeded per type (Break &amp; Bounce, EMA Pullback, VWAP Fade, the four hedges, and the rest).
          Edit and <strong>Update</strong> — params persist across restarts. <strong>Reset defaults</strong> on the card or in the editor restores factory starting params only (name, coins, and On/Auto are kept).
          Type is locked when you edit an existing row so a dropdown click cannot wipe params. Deploy paper/live from the card, or send the instance to Backtest.
        </p>

        <!-- DCA -->
        <details class="group/inner bg-base-300 border border-base-300 rounded-lg overflow-hidden">
          <summary class="flex items-center justify-between px-4 py-3 cursor-pointer font-semibold text-sm select-none list-none hover:bg-base-100/10 transition-colors">
            <span>🔄 DCA (Dollar-Cost Averaging)</span>
            <span class="text-sm transition-transform duration-200 group-open/inner:rotate-180">▼</span>
          </summary>
          <div class="px-4 pb-4 pt-3 border-t border-base-200/30 space-y-3">
            <p class="text-sm text-base-content/70">Invests a fixed amount at regular time intervals regardless of price, averaging down the cost basis over time. Simple, passive, and effective for accumulating assets during sideways or slowly declining markets.</p>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead><tr><th>Parameter</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td class="font-semibold text-sm">Investment Amount</td><td class="text-xs text-base-content/70">USDT to invest per interval. Each buy order will use this fixed amount.</td></tr>
                  <tr><td class="font-semibold text-sm">Interval (Hours)</td><td class="text-xs text-base-content/70">How often to place a buy order — e.g. 24 = buy once every 24 hours.</td></tr>
                  <tr><td class="font-semibold text-sm">Max Positions</td><td class="text-xs text-base-content/70">Maximum number of open DCA positions allowed at once. Limits total capital exposure.</td></tr>
                  <tr><td class="font-semibold text-sm">Take Profit %</td><td class="text-xs text-base-content/70">Percentage gain at which to close a position and realise profit.</td></tr>
                  <tr><td class="font-semibold text-sm">Stop Loss %</td><td class="text-xs text-base-content/70">Percentage loss at which to close a position to limit downside.</td></tr>
                </tbody>
              </table>
            </div>
            <div class="alert alert-success text-xs py-2"><span>🛡️ Risk Profile: <strong>Low</strong>. Best in sideways or slowly declining markets. Reduces average cost over time.</span></div>
          </div>
        </details>

        <!-- Grid Trading -->
        <details class="group/inner bg-base-300 border border-base-300 rounded-lg overflow-hidden">
          <summary class="flex items-center justify-between px-4 py-3 cursor-pointer font-semibold text-sm select-none list-none hover:bg-base-100/10 transition-colors">
            <span>🔲 Grid Trading</span>
            <span class="text-sm transition-transform duration-200 group-open/inner:rotate-180">▼</span>
          </summary>
          <div class="px-4 pb-4 pt-3 border-t border-base-200/30 space-y-3">
            <p class="text-sm text-base-content/70">Places buy and sell orders at regular price intervals (a "grid") between an upper and lower price range. Profits from price oscillation within the range — each time price moves up one level the bot sells, and when it drops the bot buys back.</p>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead><tr><th>Parameter</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td class="font-semibold text-sm">Upper Price</td><td class="text-xs text-base-content/70">Top of the price grid range (USDT). Orders above this level will not be placed.</td></tr>
                  <tr><td class="font-semibold text-sm">Lower Price</td><td class="text-xs text-base-content/70">Bottom of the price grid range (USDT). Orders below this level will not be placed.</td></tr>
                  <tr><td class="font-semibold text-sm">Grid Levels</td><td class="text-xs text-base-content/70">Number of grid lines within the range. More levels = tighter spacing = more frequent but smaller trades.</td></tr>
                  <tr><td class="font-semibold text-sm">Investment Per Grid</td><td class="text-xs text-base-content/70">USDT allocated to each individual grid level order.</td></tr>
                </tbody>
              </table>
            </div>
            <div class="alert alert-warning text-xs py-2"><span>🛡️ Risk Profile: <strong>Low-Medium</strong>. Best in range-bound (sideways) markets. Loses if price trends strongly outside the configured range.</span></div>
          </div>
        </details>

        <!-- MA Crossover -->
        <details class="group/inner bg-base-300 border border-base-300 rounded-lg overflow-hidden">
          <summary class="flex items-center justify-between px-4 py-3 cursor-pointer font-semibold text-sm select-none list-none hover:bg-base-100/10 transition-colors">
            <span>📊 MA Crossover (Moving Average Crossover)</span>
            <span class="text-sm transition-transform duration-200 group-open/inner:rotate-180">▼</span>
          </summary>
          <div class="px-4 pb-4 pt-3 border-t border-base-200/30 space-y-3">
            <p class="text-sm text-base-content/70">Generates buy signals when a fast moving average crosses above a slow moving average, and sell signals when it crosses below. A classic trend-following system that captures momentum shifts.</p>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead><tr><th>Parameter</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td class="font-semibold text-sm">Fast Period</td><td class="text-xs text-base-content/70">Number of candles for the fast MA (e.g. 9). Reacts quickly to price changes.</td></tr>
                  <tr><td class="font-semibold text-sm">Slow Period</td><td class="text-xs text-base-content/70">Number of candles for the slow MA (e.g. 21). Provides the trend baseline.</td></tr>
                  <tr><td class="font-semibold text-sm">Signal Period</td><td class="text-xs text-base-content/70">Smoothing period applied to the crossover signal (e.g. 9). Similar to the MACD signal line — reduces noise.</td></tr>
                  <tr><td class="font-semibold text-sm">Timeframe</td><td class="text-xs text-base-content/70">Candle interval on which to calculate the MAs: 1m / 5m / 15m / 1h / 4h / 1d.</td></tr>
                </tbody>
              </table>
            </div>
            <div class="alert text-xs py-2"><span>🛡️ Risk Profile: <strong>Medium</strong>. Works well in trending markets; prone to false signals (whipsaws) in sideways conditions.</span></div>
          </div>
        </details>

        <!-- RSI Mean-Reversion -->
        <details class="group/inner bg-base-300 border border-base-300 rounded-lg overflow-hidden">
          <summary class="flex items-center justify-between px-4 py-3 cursor-pointer font-semibold text-sm select-none list-none hover:bg-base-100/10 transition-colors">
            <span>📊 RSI Mean-Reversion</span>
            <span class="text-sm transition-transform duration-200 group-open/inner:rotate-180">▼</span>
          </summary>
          <div class="px-4 pb-4 pt-3 border-t border-base-200/30 space-y-3">
            <p class="text-sm text-base-content/70">Uses the Relative Strength Index (RSI) to identify overbought and oversold conditions. Buys when RSI falls below the oversold threshold and sells when RSI exceeds the overbought threshold — trading the expectation that extreme readings revert to the mean.</p>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead><tr><th>Parameter</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td class="font-semibold text-sm">Period</td><td class="text-xs text-base-content/70">Number of candles used to calculate RSI. Standard value: 14.</td></tr>
                  <tr><td class="font-semibold text-sm">Overbought Level</td><td class="text-xs text-base-content/70">RSI value above which the asset is considered overbought — a sell signal is generated. Standard: 70.</td></tr>
                  <tr><td class="font-semibold text-sm">Oversold Level</td><td class="text-xs text-base-content/70">RSI value below which the asset is considered oversold — a buy signal is generated. Standard: 30.</td></tr>
                  <tr><td class="font-semibold text-sm">Timeframe</td><td class="text-xs text-base-content/70">Candle interval on which to calculate the RSI.</td></tr>
                </tbody>
              </table>
            </div>
            <div class="alert alert-warning text-xs py-2"><span>🛡️ Risk Profile: <strong>Low-Medium</strong>. Works well in range-bound markets; can suffer losses in strong sustained trends where RSI remains extreme.</span></div>
          </div>
        </details>

        <!-- Bollinger Bands -->
        <details class="group/inner bg-base-300 border border-base-300 rounded-lg overflow-hidden">
          <summary class="flex items-center justify-between px-4 py-3 cursor-pointer font-semibold text-sm select-none list-none hover:bg-base-100/10 transition-colors">
            <span>🎯 Bollinger Bands</span>
            <span class="text-sm transition-transform duration-200 group-open/inner:rotate-180">▼</span>
          </summary>
          <div class="px-4 pb-4 pt-3 border-t border-base-200/30 space-y-3">
            <p class="text-sm text-base-content/70">Uses Bollinger Bands — a moving average with upper and lower standard deviation bands — to identify volatility squeezes and mean-reversion opportunities. Buys when price approaches the lower band and sells near the upper band.</p>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead><tr><th>Parameter</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td class="font-semibold text-sm">Period</td><td class="text-xs text-base-content/70">Number of candles for the moving average basis of the bands. Standard: 20.</td></tr>
                  <tr><td class="font-semibold text-sm">Std Dev Multiplier</td><td class="text-xs text-base-content/70">Number of standard deviations for band width. Standard: 2.0. Wider bands (e.g. 2.5) = fewer but higher-confidence signals.</td></tr>
                  <tr><td class="font-semibold text-sm">Timeframe</td><td class="text-xs text-base-content/70">Candle interval for band calculation.</td></tr>
                </tbody>
              </table>
            </div>
            <div class="alert alert-warning text-xs py-2"><span>🛡️ Risk Profile: <strong>Low-Medium</strong>. Effective in mean-reverting, range-bound markets. May generate losses during strong breakout trends.</span></div>
          </div>
        </details>

        <!-- Deploying Strategies -->
        <details class="group/inner bg-base-300 border border-base-300 rounded-lg overflow-hidden">
          <summary class="flex items-center justify-between px-4 py-3 cursor-pointer font-semibold text-sm select-none list-none hover:bg-base-100/10 transition-colors">
            <span>🚀 Deploying Strategies</span>
            <span class="text-sm transition-transform duration-200 group-open/inner:rotate-180">▼</span>
          </summary>
          <div class="px-4 pb-4 pt-3 border-t border-base-200/30 space-y-3">
            <p class="text-sm text-base-content/70">Once you have saved a strategy in the Strategy Manager, you can deploy it in two ways:</p>
            <div class="space-y-2">
              <div class="flex gap-3 p-3 rounded-lg bg-base-200">
                <span class="text-lg flex-shrink-0">📡</span>
                <div>
                  <p class="font-semibold text-xs">Live Trading</p>
                  <p class="text-xs text-base-content/60 mt-0.5">Go to <strong>Live Trading</strong> → select a saved strategy → enable it to run live against the real (or testnet) market. Each enabled strategy watches its assigned symbol list independently.</p>
                </div>
              </div>
              <div class="flex gap-3 p-3 rounded-lg bg-base-200">
                <span class="text-lg flex-shrink-0">🧪</span>
                <div>
                  <p class="font-semibold text-xs">Backtest</p>
                  <p class="text-xs text-base-content/60 mt-0.5">Go to <strong>Backtest</strong> → select a saved strategy → set a date range → run a historical simulation. Use the results to validate and refine parameters before going live.</p>
                </div>
              </div>
              <div class="flex gap-3 p-3 rounded-lg bg-base-200">
                <span class="text-lg flex-shrink-0">⚡</span>
                <div>
                  <p class="font-semibold text-xs">Parallel Strategies</p>
                  <p class="text-xs text-base-content/60 mt-0.5">Multiple strategies can run in parallel — each with its own symbol list and independent parameters. Build a diversified library of strategies to spread risk across different market conditions.</p>
                </div>
              </div>
            </div>
          </div>
        </details>

      </div>
    </details>

    <!-- FAQ -->
    <details class="group bg-base-200 border border-base-300 rounded-xl overflow-hidden">
      <summary class="flex items-center justify-between px-5 py-4 cursor-pointer font-semibold text-base select-none list-none hover:bg-base-300 transition-colors">
        <span>❓ FAQ</span>
        <span class="text-lg transition-transform duration-200 group-open:rotate-180">▼</span>
      </summary>
      <div class="px-5 pb-5 pt-3 border-t border-base-300 space-y-3">
        <div v-for="(item, i) in faqs" :key="i" class="p-3 rounded-lg bg-base-300">
          <p class="font-semibold text-sm mb-1">{{ item.q }}</p>
          <p class="text-xs text-base-content/70">{{ item.a }}</p>
        </div>
      </div>
    </details>
  </div>
</template>
