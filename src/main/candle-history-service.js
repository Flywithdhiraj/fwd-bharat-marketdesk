const path = require('path');
const { readJsonFile, writeJsonFile } = require('./json-store');

const HISTORY_STATE_FILE = 'candle-history-state.json';
const HISTORY_UNIVERSE_FILE = 'candle-history-universe.json';
const HISTORY_RESOLUTIONS = Object.freeze(['1d', '15m']);
const DEFAULT_BASE_URL = 'https://api.india.delta.exchange/v2';
const EARLIEST_START_SEC = Math.floor(Date.UTC(2024, 0, 1) / 1000);
const RESOLUTION_META = Object.freeze({
 '1d': { delta: '1d', stepSec: 365 * 24 * 60 * 60, overlapSec: 5 * 24 * 60 * 60 },
 '15m': { delta: '15m', stepSec: 7 * 24 * 60 * 60, overlapSec: 4 * 60 * 60 },
});
const REQUEST_COOLDOWN_MS = 1750;
const RETRY_DELAY_MS = 60000;

function delay(ms = 0) {
 return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function normalizeSymbol(symbol = '') {
 return String(symbol || '').trim().toUpperCase();
}

function isPerpetualCoinSymbol(symbol = '') {
 const safe = normalizeSymbol(symbol);
 if (!safe || safe.includes('-') || safe.includes(':')) return false;
 if (/^(C|P|MV)-/i.test(safe)) return false;
 return /^[A-Z0-9]{2,30}USD(T)?$/.test(safe);
}

function normalizeProduct(product = {}, fallbackSymbol = '') {
 const symbol = normalizeSymbol(product.symbol || fallbackSymbol);
 if (!isPerpetualCoinSymbol(symbol)) return null;
 const quote = symbol.endsWith('USDT') ? 'USDT' : 'USD';
 const base = symbol.slice(0, -quote.length);
 const contractType = String(product.contract_type || product.contractType || '').toLowerCase();
 if (contractType && !contractType.includes('perpetual') && !contractType.includes('future')) return null;
 return {
  symbol,
  base,
  quote,
  active: product.state ? String(product.state || '').toLowerCase() !== 'expired' : true,
  lastSeenAt: Date.now(),
 };
}

function parseCandle(row = {}) {
 const rawTime = Number(row.time || row.t || 0);
 const time = rawTime > 0 && rawTime < 1000000000000 ? rawTime * 1000 : rawTime;
 const open = Number(row.open || row.o || 0);
 const high = Number(row.high || row.h || 0);
 const low = Number(row.low || row.l || 0);
 const close = Number(row.close || row.c || 0);
 const volume = Number(row.volume || row.v || 0);
 if (!(time > 0) || !(open > 0) || !(high > 0) || !(low > 0) || !(close > 0)) return null;
 return { time, open, high, low, close, volume: Math.max(0, volume) };
}

function rowsRange(rows = []) {
 const safeRows = Array.isArray(rows) ? rows : [];
 const first = safeRows[0];
 const last = safeRows[safeRows.length - 1];
 return {
  rowCount: safeRows.length,
  oldestTime: Number(first?.time || 0),
  newestTime: Number(last?.time || 0),
 };
}

function createCandleHistoryService({ app, candleCache, errorJournal } = {}) {
 const statePath = () => path.join(app.getPath('userData'), HISTORY_STATE_FILE);
 const universePath = () => path.join(app.getPath('userData'), HISTORY_UNIVERSE_FILE);
 let workerActive = false;
 let workerPromise = null;
 let lastRequestAt = 0;

 async function readState() {
  const state = await readJsonFile(statePath(), {});
  return {
   version: 1,
   status: 'idle',
   startedAt: 0,
   pausedAt: 0,
   updatedAt: 0,
   tasks: {},
   ...(state && typeof state === 'object' ? state : {}),
  };
 }

 async function writeState(nextState = {}) {
  const state = { ...(nextState || {}), updatedAt: Date.now() };
  await writeJsonFile(statePath(), state);
  return state;
 }

 async function throttledFetchJson(url = '') {
  const waitMs = REQUEST_COOLDOWN_MS - (Date.now() - lastRequestAt);
  if (waitMs > 0) await delay(waitMs);
  lastRequestAt = Date.now();
  const response = await fetch(url, {
   headers: { Accept: 'application/json', 'User-Agent': 'FWD-TradeDesk-Pro' },
   signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let payload = null;
  try {
   payload = text ? JSON.parse(text) : null;
  } catch {
   payload = text;
  }
  if (!response.ok) {
   const retryAfter = Number(response.headers.get('retry-after') || 0);
   const error = new Error(payload?.error?.code || payload?.error || payload?.message || `HTTP ${response.status}`);
   error.retryAfterMs = retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAY_MS;
   throw error;
  }
  return payload;
 }

 async function resolveUniverse(baseUrl = DEFAULT_BASE_URL) {
  const bySymbol = new Map();
  const productUrls = [
   `${baseUrl}/products?contract_types=perpetual_futures&page_size=500&page_num=1`,
   `${baseUrl}/products?contract_types=perpetual_futures&page_size=500&page_num=2`,
  ];
  for (const url of productUrls) {
   try {
    const payload = await throttledFetchJson(url);
    const rows = payload?.result ?? payload?.data ?? [];
    (Array.isArray(rows) ? rows : []).forEach(row => {
     const product = normalizeProduct(row);
     if (product) bySymbol.set(product.symbol, product);
    });
   } catch (error) {
    errorJournal?.append?.('candle-history:products', error, { url });
   }
  }
  try {
   const payload = await throttledFetchJson(`${baseUrl}/tickers?contract_types=perpetual_futures`);
   const rows = payload?.result ?? payload?.data ?? [];
   (Array.isArray(rows) ? rows : []).forEach(row => {
    const product = normalizeProduct(row);
    if (product) bySymbol.set(product.symbol, { ...(bySymbol.get(product.symbol) || {}), ...product });
   });
  } catch (error) {
   errorJournal?.append?.('candle-history:tickers', error);
  }
  const products = Array.from(bySymbol.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  await writeJsonFile(universePath(), { version: 1, baseUrl, fetchedAt: Date.now(), products });
  return products;
 }

 function taskKey(symbol = '', resolution = '') {
  return `${normalizeSymbol(symbol)}__${String(resolution || '').trim().toLowerCase()}`;
 }

 async function ensureTasks(state = {}, options = {}) {
  const baseUrl = String(options.baseUrl || state.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const products = await resolveUniverse(baseUrl);
  const tasks = { ...(state.tasks || {}) };
  products.filter(product => product.active).forEach(product => {
   HISTORY_RESOLUTIONS.forEach(resolution => {
    const key = taskKey(product.symbol, resolution);
    if (!tasks[key]) {
     tasks[key] = {
      key,
      symbol: product.symbol,
      resolution,
      status: 'pending',
      cursorEndSec: Math.floor(Date.now() / 1000),
      lastSavedTime: 0,
      rowCount: 0,
      attempts: 0,
      error: '',
      updatedAt: Date.now(),
     };
    }
   });
  });
  return {
   ...state,
   baseUrl,
   universeCount: products.length,
   tasks,
  };
 }

 async function fetchCandleChunk({ baseUrl, symbol, resolution, startSec, endSec }) {
  const meta = RESOLUTION_META[resolution];
  const url = `${baseUrl}/history/candles?symbol=${encodeURIComponent(symbol)}&resolution=${meta.delta}&start=${Math.floor(startSec)}&end=${Math.floor(endSec)}`;
  const payload = await throttledFetchJson(url);
  const rows = payload?.result ?? payload?.data ?? (Array.isArray(payload) ? payload : []);
  return (Array.isArray(rows) ? rows : []).map(parseCandle).filter(Boolean).sort((a, b) => a.time - b.time);
 }

 async function runOneTask(state = {}, task = {}) {
  const meta = RESOLUTION_META[task.resolution];
  if (!meta) return { ...task, status: 'failed', error: 'Unsupported candle resolution', updatedAt: Date.now() };
  const existing = await candleCache.get(task.symbol, task.resolution).catch(() => null);
  const existingRows = Array.isArray(existing?.rows) ? existing.rows : [];
  const existingRange = rowsRange(existingRows);
  const nowSec = Math.floor(Date.now() / 1000);
  let cursorEndSec = Number(task.cursorEndSec || 0);
  if (!(cursorEndSec > 0)) {
   cursorEndSec = existingRange.oldestTime > 0 ? Math.floor(existingRange.oldestTime / 1000) - 1 : nowSec;
  }
  if (existingRange.newestTime > 0 && Math.floor(existingRange.newestTime / 1000) < (nowSec - meta.overlapSec)) {
   const startSec = Math.max(EARLIEST_START_SEC, Math.floor(existingRange.newestTime / 1000) - meta.overlapSec);
   const forwardRows = await fetchCandleChunk({ baseUrl: state.baseUrl || DEFAULT_BASE_URL, symbol: task.symbol, resolution: task.resolution, startSec, endSec: nowSec });
   if (forwardRows.length) {
    const write = await candleCache.put({ symbol: task.symbol, resolution: task.resolution, rows: forwardRows }, 'merge');
    task = { ...task, rowCount: Number(write.rowCount || existingRange.rowCount), lastSavedTime: Number(write.rows?.[write.rows.length - 1]?.time || existingRange.newestTime || 0) };
   }
  }
  if (cursorEndSec <= EARLIEST_START_SEC) {
   const finalRecord = await candleCache.get(task.symbol, task.resolution).catch(() => null);
   const finalRange = rowsRange(finalRecord?.rows || []);
   return {
    ...task,
    status: 'complete',
    cursorEndSec: EARLIEST_START_SEC,
    rowCount: finalRange.rowCount,
    lastSavedTime: finalRange.newestTime,
    error: '',
    updatedAt: Date.now(),
   };
  }
  const chunkEnd = Math.min(cursorEndSec, nowSec);
  const chunkStart = Math.max(EARLIEST_START_SEC, chunkEnd - meta.stepSec);
  const rows = await fetchCandleChunk({ baseUrl: state.baseUrl || DEFAULT_BASE_URL, symbol: task.symbol, resolution: task.resolution, startSec: chunkStart, endSec: chunkEnd });
  let rowCount = existingRange.rowCount;
  let lastSavedTime = existingRange.newestTime;
  if (rows.length) {
   const write = await candleCache.put({ symbol: task.symbol, resolution: task.resolution, rows }, 'merge');
   rowCount = Number(write.rowCount || rowCount || 0);
   lastSavedTime = Number(write.rows?.[write.rows.length - 1]?.time || lastSavedTime || 0);
  }
  const nextCursor = chunkStart - 1;
  return {
   ...task,
   status: nextCursor <= EARLIEST_START_SEC ? 'complete' : 'pending',
   cursorEndSec: Math.max(EARLIEST_START_SEC, nextCursor),
   rowCount,
   lastSavedTime,
   attempts: 0,
   error: '',
   updatedAt: Date.now(),
  };
 }

 function summarize(state = {}) {
  const tasks = Object.values(state.tasks || {});
  const byStatus = tasks.reduce((acc, task) => {
   const key = String(task.status || 'pending');
   acc[key] = (acc[key] || 0) + 1;
   return acc;
  }, {});
  return {
   ok: true,
   status: state.status || 'idle',
   baseUrl: state.baseUrl || DEFAULT_BASE_URL,
   universeCount: Number(state.universeCount || 0),
   taskCount: tasks.length,
   byStatus,
   rows: tasks.reduce((sum, task) => sum + Number(task.rowCount || 0), 0),
   active: workerActive,
   updatedAt: Number(state.updatedAt || 0),
   sample: tasks.slice(0, 12),
  };
 }

 async function workerLoop() {
  while (workerActive) {
   let state = await readState();
   state = await ensureTasks(state);
   state.status = 'running';
   const tasks = state.tasks || {};
   const next = Object.values(tasks).find(task => ['pending', 'failed', 'running'].includes(String(task.status || 'pending')));
   if (!next) {
    await writeState({ ...state, status: 'complete' });
    workerActive = false;
    break;
   }
   tasks[next.key] = { ...next, status: 'running', updatedAt: Date.now() };
   state.tasks = tasks;
   await writeState(state);
   try {
    const updatedTask = await runOneTask(state, tasks[next.key]);
    state = await readState();
    state.tasks = { ...(state.tasks || {}), [updatedTask.key]: updatedTask };
    await writeState({ ...state, status: workerActive ? 'running' : 'paused' });
   } catch (error) {
    errorJournal?.append?.('candle-history:task', error, { symbol: next.symbol, resolution: next.resolution });
    state = await readState();
    const attempts = Number(next.attempts || 0) + 1;
    state.tasks = {
     ...(state.tasks || {}),
     [next.key]: {
      ...next,
      status: 'failed',
      attempts,
      error: error?.message || String(error || 'Backfill failed'),
      updatedAt: Date.now(),
     },
    };
    await writeState({ ...state, status: workerActive ? 'running' : 'paused' });
    await delay(Math.max(REQUEST_COOLDOWN_MS, Number(error?.retryAfterMs || RETRY_DELAY_MS)));
   }
  }
 }

 async function start(options = {}) {
  let state = await readState();
  state = await ensureTasks(state, options);
  state.status = 'running';
  state.startedAt = state.startedAt || Date.now();
  await writeState(state);
  workerActive = true;
  if (!workerPromise) {
   workerPromise = workerLoop().finally(() => {
    workerPromise = null;
   });
  }
  return summarize(await readState());
 }

 async function pause() {
  workerActive = false;
  const state = await readState();
  await writeState({ ...state, status: 'paused', pausedAt: Date.now() });
  return summarize(await readState());
 }

 async function status() {
  return summarize(await readState());
 }

 async function refreshUniverse(options = {}) {
  let state = await readState();
  state = await ensureTasks(state, options);
  await writeState(state);
  return summarize(state);
 }

 return {
  start,
  pause,
  status,
  refreshUniverse,
 };
}

module.exports = { createCandleHistoryService };
