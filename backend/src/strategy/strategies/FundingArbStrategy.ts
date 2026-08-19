/**
 * Delta-neutral funding harvest: conceptually long spot + short the perp.
 * Paper models both legs (price PnL nets out; you keep funding when the rate is positive).
 * Live only shorts the Bybit perp — hold the spot yourself or keep this in paper.
 */
import { IStrategy, BacktestStrategyParams, StrategyBacktestResult } from '../IStrategy';
import { Candle, StrategySignal, StrategyInstance, FundingArbParams } from '../../types';
import { fetchFundingHistory, fetchPremium } from '../../bybit/client';
import { paperBroker } from '../../execution/paperBroker';
import { store } from '../../storage/store';
import { logger } from '../../logger';
import { calcSummary, makeBacktestTrade } from '../backtestUtils';

export class FundingArbStrategy implements IStrategy {
  readonly id: string;
  readonly instance: StrategyInstance;
  private params: FundingArbParams;
  private inPosition = new Map<string, boolean>();
  private lastRefresh = new Map<string, number>();
  private lastFundingPaid = new Map<string, number>();

  constructor(instance: StrategyInstance) {
    this.id = instance.id;
    this.instance = instance;
    this.params = instance.params as unknown as FundingArbParams;
  }

  describe(): string {
    return `Funding arb: short perp vs virtual spot when 8h funding ≥ ${(this.params.minFundingRate * 100).toFixed(3)}%.`;
  }

  defaultParams(): FundingArbParams {
    return {
      timeframe: '60',
      minFundingRate: 0.0001,
      exitFundingRate: 0.00003,
      maxBasisPercent: 0.2,
      stopBasisPercent: 0.5,
    };
  }

  onCandle(symbol: string, candle: Candle, interval: string): StrategySignal | null {
    if (String(interval) !== String(this.params.timeframe)) return null;
    void this.refresh(symbol);

    const trade = store.getTrades().find(t =>
      t.status === 'open' && t.strategyInstanceId === this.id && t.symbol === symbol
    );
    if (trade && Date.now() - (this.lastFundingPaid.get(symbol) ?? 0) > 8 * 3600_000) {
      const prem = this.cached.get(symbol);
      if (prem && prem.fundingRate > 0) {
        const credit = trade.positionSize * prem.fundingRate;
        paperBroker.applyCashPnl(trade.id, credit);
        this.lastFundingPaid.set(symbol, Date.now());
        logger.info('Paper funding credit', { symbol, credit, rate: prem.fundingRate });
      }
    }

    const prem = this.cached.get(symbol);
    if (!prem) return null;
    const inPos = this.inPosition.get(symbol) ?? Boolean(trade);

    if (inPos) {
      if (prem.fundingRate <= this.params.exitFundingRate || prem.basisPercent >= this.params.stopBasisPercent) {
        this.inPosition.set(symbol, false);
        return {
          type: 'exit', symbol, price: candle.close, direction: 'bearish',
          metadata: { fundingRate: prem.fundingRate, basisPercent: prem.basisPercent, reason: 'funding_or_basis' },
          generatedAt: candle.openTime,
        };
      }
      return null;
    }

    if (prem.fundingRate >= this.params.minFundingRate && Math.abs(prem.basisPercent) <= this.params.maxBasisPercent) {
      this.inPosition.set(symbol, true);
      const sl = candle.close * (1 + this.params.stopBasisPercent / 100);
      return {
        type: 'entry', direction: 'bearish', symbol, price: candle.close,
        stopLoss: sl,
        takeProfit: candle.close * (1 - this.params.minFundingRate),
        metadata: { fundingRate: prem.fundingRate, basisPercent: prem.basisPercent, legs: 'virtual_spot+short_perp' },
        generatedAt: candle.openTime,
      };
    }
    return null;
  }

  private cached = new Map<string, Awaited<ReturnType<typeof fetchPremium>>>();

  private async refresh(symbol: string): Promise<void> {
    const last = this.lastRefresh.get(symbol) ?? 0;
    if (Date.now() - last < 30_000) return;
    this.lastRefresh.set(symbol, Date.now());
    try {
      this.cached.set(symbol, await fetchPremium(symbol));
    } catch (err) {
      logger.warn('Funding premium fetch failed', { symbol, err });
    }
  }

  async backtest(params: BacktestStrategyParams): Promise<StrategyBacktestResult> {
    const p = params.params as unknown as FundingArbParams;
    const startMs = new Date(params.startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(params.endDate + 'T00:00:00Z').getTime() + 86_400_000;
    const trades = [];
    let equity = params.startingEquity;
    const equityCurve = [{ time: startMs, equity }];

    for (const symbol of params.symbols) {
      const history = await fetchFundingHistory(symbol, startMs, endMs);
      let inPos = false;
      let enteredAt = 0;
      let cash = 0;
      for (const ev of history) {
        if (inPos) cash += (params.startingEquity * params.riskPercent / 100) * ev.rate;
        if (!inPos && ev.rate >= (p.minFundingRate ?? 0.0001)) {
          inPos = true;
          enteredAt = ev.time;
          cash = 0;
        } else if (inPos && ev.rate <= (p.exitFundingRate ?? 0.00003)) {
          equity += cash;
          trades.push(makeBacktestTrade({
            symbol, direction: 'bearish', entryPrice: 1, closePrice: 1 + cash,
            stopLoss: 1, takeProfit: 1, riskPercent: params.riskPercent,
            positionSize: params.startingEquity * params.riskPercent / 100,
            qty: 1, openedAt: enteredAt, closedAt: ev.time, pnl: cash, equity,
            patternType: 'funding_arb', high: ev.rate, low: ev.rate,
          }));
          equityCurve.push({ time: ev.time, equity });
          inPos = false;
        }
      }
      if (inPos && cash !== 0) {
        equity += cash;
        trades.push(makeBacktestTrade({
          symbol, direction: 'bearish', entryPrice: 1, closePrice: 1 + cash,
          stopLoss: 1, takeProfit: 1, riskPercent: params.riskPercent,
          positionSize: params.startingEquity * params.riskPercent / 100,
          qty: 1, openedAt: enteredAt, closedAt: endMs, pnl: cash, equity,
          patternType: 'funding_arb', high: 0, low: 0,
        }));
        equityCurve.push({ time: endMs, equity });
      }
    }

    return {
      strategyType: 'funding_arb',
      instanceName: this.instance.name,
      trades,
      summary: calcSummary(trades, params.startingEquity, equity),
      equityCurve,
    };
  }
}
