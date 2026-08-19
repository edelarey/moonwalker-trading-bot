import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig } from '../config';
import { logger } from '../logger';
import { BacktestSummary, StopFillMode, StrategyInstance, StrategyType } from '../types';
import { toIsoDate, dayStartUtcMs } from '../util/dates';
import { resolveStopFillMode } from './stopFill';
import { strategyRegistry } from './registry';
import { clearCandleRangeCache } from '../bybit/client';
import { saveStrategyInstance } from '../storage/strategyStore';
import { SWEEPABLE_TYPES, paramLabel, presetGrid, sweepTypeName } from './sweepGrids';

export interface SweepSlice {
  startDate: string;
  endDate: string;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  profitFactor: number | null;
}

export interface SweepCandidate {
  id: string;
  strategyType: StrategyType;
  typeName: string;
  label: string;
  params: Record<string, unknown>;
  inSample: SweepSlice | null;
  holdout: SweepSlice | null;
  holdoutScore: number | null;
  error?: string;
}

export interface SweepRequest {
  symbols: string[];
  startDate: string;
  endDate: string;
  holdoutStart: string;
  types: StrategyType[];
  riskPercent: number;
  stopFillMode: StopFillMode;
  startingEquity: number;
}

export interface SweepJob {
  id: string;
  status: 'running' | 'done' | 'cancelled' | 'error';
  request: SweepRequest;
  total: number;
  done: number;
  currentLabel: string;
  startedAt: number;
  finishedAt: number | null;
  candidates: SweepCandidate[];
  error?: string;
}

const dataDir = path.join(__dirname, '..', '..', 'data');
const persistPath = path.join(dataDir, 'sweep-last.json');

let job: SweepJob | null = loadPersisted();
let cancelFlag = false;
let running = false;

function loadPersisted(): SweepJob | null {
  try {
    if (!fs.existsSync(persistPath)) return null;
    return JSON.parse(fs.readFileSync(persistPath, 'utf-8')) as SweepJob;
  } catch {
    return null;
  }
}

function persist(): void {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (job) fs.writeFileSync(persistPath, JSON.stringify(job, null, 2));
  } catch (err) {
    logger.warn('sweep persist failed', { err });
  }
}

function addDaysIso(iso: string, days: number): string {
  const ms = dayStartUtcMs(iso) + days * 86_400_000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function defaultHoldoutStart(startDate: string, endDate: string): string {
  const a = dayStartUtcMs(startDate);
  const b = dayStartUtcMs(endDate);
  const spanDays = Math.max(1, Math.round((b - a) / 86_400_000));
  const holdDays = Math.max(1, Math.floor(spanDays * 0.3));
  const start = addDaysIso(endDate, -holdDays);
  return start > startDate ? start : addDaysIso(startDate, 1);
}

function sliceFromSummary(startDate: string, endDate: string, s: BacktestSummary): SweepSlice {
  return {
    startDate,
    endDate,
    totalTrades: s.totalTrades,
    winRate: s.winRate,
    totalPnl: s.totalPnl,
    maxDrawdown: s.maxDrawdown,
    maxDrawdownPercent: s.maxDrawdownPercent,
    profitFactor: s.profitFactor,
  };
}

/** Rank holdout only. Null if too few trades — not a live recommendation. */
export function holdoutScore(slice: SweepSlice | null): number | null {
  if (!slice || slice.totalTrades < 8) return null;
  const pfRaw = slice.profitFactor;
  const pf = pfRaw == null || !Number.isFinite(pfRaw) ? 3 : Math.min(Math.max(pfRaw, 0), 3);
  const dd = Math.max(slice.maxDrawdownPercent, 0.5);
  return (pf * Math.log(1 + slice.totalTrades)) / (1 + dd / 10);
}

function dummyInstance(type: StrategyType, params: Record<string, unknown>, symbols: string[]): StrategyInstance {
  return {
    id: `sweep-${uuidv4()}`,
    name: sweepTypeName(type),
    strategyType: type,
    symbols,
    params,
    enabled: false,
    autoMode: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

async function runSlice(
  type: StrategyType,
  params: Record<string, unknown>,
  symbols: string[],
  startDate: string,
  endDate: string,
  riskPercent: number,
  startingEquity: number,
  leverage: number,
): Promise<SweepSlice> {
  const inst = dummyInstance(type, params, symbols);
  const result = await strategyRegistry.runBacktest(inst, {
    symbols,
    startDate,
    endDate,
    params,
    riskPercent,
    startingEquity,
    leverage,
  });
  return sliceFromSummary(startDate, endDate, result.summary);
}

export function getSweepJob(): SweepJob | null {
  return job;
}

export function sweepPresets(): Array<{ type: StrategyType; name: string; variantCount: number }> {
  return SWEEPABLE_TYPES.map(type => ({
    type,
    name: sweepTypeName(type),
    variantCount: presetGrid(type).length,
  }));
}

export function parseSweepRequest(body: Record<string, unknown>): SweepRequest {
  const config = loadConfig();
  const symbols = (Array.isArray(body.symbols) ? body.symbols.map(String) : ['BTCUSDT'])
    .map(s => s.toUpperCase())
    .filter(Boolean)
    .slice(0, 2);
  if (!symbols.length) throw new Error('Pick 1 or 2 symbols');

  const startDate = toIsoDate(body.startDate);
  const endDate = toIsoDate(body.endDate);
  if (!startDate || !endDate || startDate >= endDate) throw new Error('Need a start date before the end date');

  const holdoutStart = toIsoDate(body.holdoutStart) || defaultHoldoutStart(startDate, endDate);
  if (holdoutStart <= startDate || holdoutStart > endDate) {
    throw new Error('Holdout start must be after the in-sample start and on or before the end date');
  }
  const inSampleEnd = addDaysIso(holdoutStart, -1);
  if (inSampleEnd < startDate) throw new Error('In-sample window is empty — move holdout later');

  const types = (Array.isArray(body.types) ? body.types : SWEEPABLE_TYPES)
    .map(t => String(t) as StrategyType)
    .filter(t => SWEEPABLE_TYPES.includes(t));
  if (!types.length) throw new Error('Select at least one sweepable strategy type');

  const stopFillMode = resolveStopFillMode({ stopFillMode: body.stopFillMode }, config.stopFillMode);
  const riskPercent = Number(body.riskPercent);
  return {
    symbols,
    startDate,
    endDate,
    holdoutStart,
    types,
    riskPercent: Number.isFinite(riskPercent) && riskPercent > 0 ? riskPercent : config.riskPercent,
    stopFillMode,
    startingEquity: config.paperStartingEquity ?? 10_000,
  };
}

export function startSweep(body: Record<string, unknown>): SweepJob {
  if (running) throw new Error('A sweep is already running');
  const request = parseSweepRequest(body);
  const candidates: SweepCandidate[] = [];
  for (const type of request.types) {
    for (const variant of presetGrid(type)) {
      const params = { ...variant, stopFillMode: request.stopFillMode };
      candidates.push({
        id: uuidv4(),
        strategyType: type,
        typeName: sweepTypeName(type),
        label: paramLabel(type, params),
        params,
        inSample: null,
        holdout: null,
        holdoutScore: null,
      });
    }
  }
  cancelFlag = false;
  job = {
    id: uuidv4(),
    status: 'running',
    request,
    total: candidates.length,
    done: 0,
    currentLabel: '',
    startedAt: Date.now(),
    finishedAt: null,
    candidates,
  };
  persist();
  void runJob();
  return job;
}

export function cancelSweep(): SweepJob | null {
  if (job && job.status === 'running') cancelFlag = true;
  return job;
}

async function runJob(): Promise<void> {
  if (!job) return;
  running = true;
  const current = job;
  const req = current.request;
  const inSampleEnd = addDaysIso(req.holdoutStart, -1);
  const config = loadConfig();
  const leverage = config.leverage || 1;
  clearCandleRangeCache();
  logger.info('Sweep started', {
    id: current.id,
    types: req.types,
    variants: current.total,
    symbols: req.symbols,
  });
  try {
    for (const c of current.candidates) {
      if (cancelFlag) {
        current.status = 'cancelled';
        break;
      }
      current.currentLabel = `${c.typeName} · ${c.label}`;
      persist();
      try {
        c.inSample = await runSlice(
          c.strategyType, c.params, req.symbols,
          req.startDate, inSampleEnd,
          req.riskPercent, req.startingEquity, leverage,
        );
        if (cancelFlag) {
          current.status = 'cancelled';
          current.done++;
          break;
        }
        c.holdout = await runSlice(
          c.strategyType, c.params, req.symbols,
          req.holdoutStart, req.endDate,
          req.riskPercent, req.startingEquity, leverage,
        );
        c.holdoutScore = holdoutScore(c.holdout);
      } catch (err: any) {
        c.error = err?.message ?? String(err);
        logger.warn('Sweep candidate failed', { type: c.strategyType, label: c.label, err: c.error });
      }
      current.done++;
      persist();
    }
    if (current.status === 'running') current.status = 'done';
  } catch (err: any) {
    current.status = 'error';
    current.error = err?.message ?? String(err);
    logger.error('Sweep failed', { err: current.error });
  } finally {
    current.finishedAt = Date.now();
    current.currentLabel = '';
    running = false;
    cancelFlag = false;
    persist();
    logger.info('Sweep finished', { id: current.id, status: current.status, done: current.done, total: current.total });
  }
}

export function cloneSweepCandidate(candidateId: string): StrategyInstance {
  if (!job) throw new Error('No sweep results');
  const c = job.candidates.find(x => x.id === candidateId);
  if (!c) throw new Error('Candidate not found');
  const { stopFillMode, ...rest } = c.params;
  const inst: StrategyInstance = {
    id: uuidv4(),
    name: `${c.typeName} (${c.label})`.slice(0, 80),
    strategyType: c.strategyType,
    symbols: job.request.symbols,
    params: { ...rest, ...(stopFillMode ? { stopFillMode } : {}) },
    enabled: false,
    autoMode: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveStrategyInstance(inst);
  return inst;
}

export { SWEEPABLE_TYPES };
