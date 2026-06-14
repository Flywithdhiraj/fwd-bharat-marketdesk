const fs = require('fs/promises');
const path = require('path');
const { readJsonFile, writeJsonFile, removeFileIfExists, listJsonFiles } = require('./json-store');

const MAX_CANDLE_FILES = 12000;
const MAX_CANDLE_BYTES = 4 * 1024 * 1024 * 1024;
const NATIVE_CANDLE_RESOLUTIONS = new Set(['1d', '4h', '1w']);

function candleCacheKey(symbol = '', resolution = '') {
 const safeSymbol = String(symbol || '').trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '_').slice(0, 80);
 const safeResolution = String(resolution || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 24);
 return safeSymbol && safeResolution ? `${safeSymbol}__${safeResolution}` : '';
}

function isNativeCandleResolution(resolution = '') {
 return NATIVE_CANDLE_RESOLUTIONS.has(String(resolution || '').trim().toLowerCase());
}

function createCandleCache({ app, errorJournal } = {}) {
 const dir = () => path.join(app.getPath('userData'), 'candle-store');
 const filePathFor = (symbol = '', resolution = '') => {
  const key = candleCacheKey(symbol, resolution);
  return key ? path.join(dir(), `${key}.json`) : '';
 };

 function normalizeRow(row = {}) {
  const time = Number(row?.time || row?.t || 0);
  const open = Number(row?.open || 0);
  const high = Number(row?.high || 0);
  const low = Number(row?.low || 0);
  const close = Number(row?.close || 0);
  const volume = Number(row?.volume || 0);
  if (!(time > 0) || !(open > 0) || !(high > 0) || !(low > 0) || !(close > 0)) return null;
  if (high < low || open > high || open < low || close > high || close < low) return null;
  if (volume < 0) return null;
  const bodyRef = Math.max(0.00000001, Math.min(open, close));
  if ((high - low) / bodyRef > 20) return null;
  return { ...row, time, open, high, low, close, volume };
 }

 function mergeRows(existing = [], incoming = []) {
  const merged = new Map();
  [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])].forEach(row => {
   const normalized = normalizeRow(row);
   if (normalized) merged.set(normalized.time, normalized);
  });
  return Array.from(merged.values())
  .sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
 }

 async function listRecords() {
  const names = await listJsonFiles(dir());
  const out = [];
  for (const name of names) {
   const record = await readJsonFile(path.join(dir(), name), null);
   if (!record || typeof record !== 'object') continue;
   const rows = Array.isArray(record.rows) ? record.rows.map(normalizeRow).filter(Boolean) : [];
   const symbol = String(record.symbol || '').trim().toUpperCase();
   const resolution = String(record.resolution || '').trim().toLowerCase();
   if (!symbol || !resolution || !rows.length) continue;
   out.push({
    key: String(record.key || name.replace(/\.json$/i, '')).slice(0, 180),
    symbol,
    resolution,
    rows,
    updatedAt: Number(record.updatedAt || 0),
   });
  }
  return out;
 }

 async function enforceLimits() {
  const names = await listJsonFiles(dir());
  const entries = [];
  let totalBytes = 0;
  for (const name of names) {
   const fullPath = path.join(dir(), name);
   try {
    const stat = await fs.stat(fullPath);
    const record = await readJsonFile(fullPath, {});
    const updatedAt = Number(record.updatedAt || stat.mtimeMs || 0);
    entries.push({ path: fullPath, updatedAt, size: stat.size });
    totalBytes += stat.size;
   } catch (error) {
    errorJournal?.append?.('candle-cache:stat', error, { name });
   }
  }
  entries.sort((a, b) => Number(a.updatedAt || 0) - Number(b.updatedAt || 0));
  let removeCount = Math.max(0, entries.length - MAX_CANDLE_FILES);
  for (const entry of entries) {
   if (removeCount <= 0 && totalBytes <= MAX_CANDLE_BYTES) break;
   try {
    await removeFileIfExists(entry.path);
    totalBytes -= Number(entry.size || 0);
    removeCount -= 1;
   } catch (error) {
    errorJournal?.append?.('candle-cache:evict', error, { filePath: entry.path });
   }
  }
 }

 async function put(payload = {}, mode = 'merge') {
  const { symbol, resolution, rows, updatedAt } = payload;
  if (!isNativeCandleResolution(resolution)) return { ok: false, error: 'Native candle-store supports only 1d, 4h and 1w candles.' };
  const filePath = filePathFor(symbol, resolution);
  if (!filePath) return { ok: false, error: 'Symbol and resolution are required.' };
  const current = mode === 'replace' ? {} : await readJsonFile(filePath, {});
  const merged = mergeRows(current.rows, rows);
  if (!merged.length) return { ok: false, error: 'No valid candle rows after integrity validation.' };
  const record = {
   key: candleCacheKey(symbol, resolution),
   symbol: String(symbol || '').trim().toUpperCase(),
   resolution: String(resolution || '').trim().toLowerCase(),
   rows: merged,
   updatedAt: Math.max(Number(updatedAt || 0), Date.now()),
   backfilledAt: Math.max(Number(payload.backfilledAt || 0), Number(current.backfilledAt || 0)),
   coverageStart: Math.max(0, Number(payload.coverageStart || current.coverageStart || 0)),
   coverageEnd: Math.max(0, Number(payload.coverageEnd || current.coverageEnd || 0)),
  };
  await writeJsonFile(filePath, record);
  await enforceLimits();
  return { ok: true, ...record, rowCount: merged.length };
 }

 async function get(symbol, resolution) {
  if (!isNativeCandleResolution(resolution)) {
   return {
    ok: false,
    key: candleCacheKey(symbol, resolution),
    symbol: String(symbol || '').trim().toUpperCase(),
    resolution: String(resolution || '').trim().toLowerCase(),
    rows: [],
    updatedAt: 0,
    error: 'Native candle-store supports only 1d, 4h and 1w candles.',
   };
  }
  const filePath = filePathFor(symbol, resolution);
  if (!filePath) return { ok: false, error: 'Symbol and resolution are required.' };
  const record = await readJsonFile(filePath, {});
  const rows = Array.isArray(record.rows) ? record.rows.map(normalizeRow).filter(Boolean) : [];
  return {
   ok: true,
   key: candleCacheKey(symbol, resolution),
   symbol: String(symbol || '').trim().toUpperCase(),
   resolution: String(resolution || '').trim().toLowerCase(),
   rows,
   updatedAt: Number(record.updatedAt || 0),
   backfilledAt: Number(record.backfilledAt || 0),
   coverageStart: Number(record.coverageStart || 0),
   coverageEnd: Number(record.coverageEnd || 0),
  };
 }

 async function clear(symbol, resolution) {
  const filePath = filePathFor(symbol, resolution);
  if (filePath) {
   await removeFileIfExists(filePath);
   return { ok: true, cleared: true };
  }
  await fs.rm(dir(), { recursive: true, force: true });
  return { ok: true, cleared: true };
 }

 async function stats() {
  const names = await listJsonFiles(dir());
  let latestUpdatedAt = 0;
  let oldestUpdatedAt = 0;
  let bytes = 0;
  for (const name of names) {
   const fullPath = path.join(dir(), name);
   const stat = await fs.stat(fullPath).catch(() => null);
   if (stat) bytes += stat.size;
   const record = await readJsonFile(fullPath, {});
   const updatedAt = Number(record.updatedAt || stat?.mtimeMs || 0);
   if (!(updatedAt > 0)) continue;
   latestUpdatedAt = Math.max(latestUpdatedAt, updatedAt);
   oldestUpdatedAt = oldestUpdatedAt > 0 ? Math.min(oldestUpdatedAt, updatedAt) : updatedAt;
  }
  return { ok: true, supported: true, entries: names.length, latestUpdatedAt, oldestUpdatedAt, bytes, maxEntries: MAX_CANDLE_FILES, maxBytes: MAX_CANDLE_BYTES };
 }

 return {
  dir,
  normalizeRow,
 mergeRows,
  isNativeCandleResolution,
  listRecords,
  put,
  get,
  clear,
  stats,
  enforceLimits,
 };
}

module.exports = {
 createCandleCache,
 candleCacheKey,
 isNativeCandleResolution,
};
