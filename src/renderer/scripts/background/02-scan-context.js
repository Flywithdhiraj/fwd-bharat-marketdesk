'use strict';

(function initSharedMainScanContext(global) {
 const DEFAULT_TTL_MS = 8 * 60 * 1000;
 const BUFFER_MS = 90 * 1000;
 const DURABLE_CONTEXT_KEY = 'lastMainScanContextSnapshotV1';
 let latestContext = null;
 let restorePromise = null;
 let deriveQueue = Promise.resolve();
 let latestDeriveRequest = null;

 function now() {
  return Date.now();
 }

 function safeId() {
  return `scan-${now()}-${Math.random().toString(36).slice(2, 8)}`;
 }

 function cloneRows(rows = []) {
  return Array.isArray(rows) ? rows.slice() : [];
 }

 function normalizeResolution(resolution = '') {
  return String(resolution || '').trim().toLowerCase();
 }

 function normalizeSymbol(symbol = '') {
  return String(symbol || '').trim().toUpperCase();
 }

 function getConfiguredTtlMs() {
  const shared = global.FWDTradeDeskShared || {};
  const sanitize = shared.sanitizeAutoScanInterval;
  return new Promise(resolve => {
   try {
    chrome.storage.local.get(['autoScanInterval', 'strategy'], data => {
     const rawInterval = data?.autoScanInterval ?? data?.strategy?.autoScanInterval;
     const minutes = typeof sanitize === 'function' ? sanitize(rawInterval) : Math.max(1, Number(rawInterval || 5));
     resolve(Math.max(DEFAULT_TTL_MS, (Number(minutes || 5) * 60 * 1000) + BUFFER_MS));
    });
   } catch (_) {
    resolve(DEFAULT_TTL_MS);
   }
  });
 }

 function buildMeta(context = latestContext) {
  if (!context) return null;
  return {
   scanId: context.scanId,
   startedAt: context.startedAt,
   finishedAt: context.finishedAt || 0,
   expiresAt: context.expiresAt || 0,
   tickerRows: Object.keys(context.tickerMap || {}).length,
   productRows: Array.isArray(context.products) ? context.products.length : 0,
   signalRows: Array.isArray(context.scanResults) ? context.scanResults.length : 0,
   candleSymbols: context.candles instanceof Map ? context.candles.size : 0,
   partial: !!context.partial,
   scannedRows: Number(context.scannedRows || 0),
   candidateRows: Number(context.candidateRows || 0),
   durable: context.durable === true,
  };
 }

 function buildDurableSnapshot(context = latestContext) {
  if (!context) return null;
  const candleSymbols = context.candles instanceof Map
   ? Array.from(context.candles.keys()).filter(Boolean)
   : [];
  const candleSymbolSet = new Set(candleSymbols);
  const tickerMap = Object.fromEntries(
   Object.entries(context.tickerMap || {}).filter(([symbol]) => candleSymbolSet.has(normalizeSymbol(symbol)))
  );
  const products = (Array.isArray(context.products) ? context.products : [])
   .filter(product => candleSymbolSet.has(normalizeSymbol(product?.symbol)));
  return {
   scanId: context.scanId,
   startedAt: Number(context.startedAt || 0),
   finishedAt: Number(context.finishedAt || 0),
   expiresAt: Number(context.expiresAt || 0),
   tickerMap,
   products,
   marketIndex: context.marketIndex || null,
   fundingHeatmap: Array.isArray(context.fundingHeatmap) ? context.fundingHeatmap : [],
   scanResults: Array.isArray(context.scanResults) ? context.scanResults : [],
   decisionShortlist: Array.isArray(context.decisionShortlist) ? context.decisionShortlist : [],
   partial: !!context.partial,
   scannedRows: Number(context.scannedRows || 0),
   candidateRows: Number(context.candidateRows || 0),
   candleSymbols,
  };
 }

 function create(seed = {}) {
  const scanId = seed.scanId || safeId();
  return {
   scanId,
   startedAt: Number(seed.startedAt || now()),
   finishedAt: 0,
   expiresAt: 0,
   tickerMap: seed.tickerMap || {},
   products: Array.isArray(seed.products) ? seed.products : [],
   marketIndex: seed.marketIndex || null,
   fundingHeatmap: Array.isArray(seed.fundingHeatmap) ? seed.fundingHeatmap : [],
   scanResults: Array.isArray(seed.scanResults) ? seed.scanResults : [],
   decisionShortlist: Array.isArray(seed.decisionShortlist) ? seed.decisionShortlist : [],
   partial: !!seed.partial,
   scannedRows: Number(seed.scannedRows || 0),
   candidateRows: Number(seed.candidateRows || 0),
   durable: seed.durable === true,
   candles: new Map(),
  };
 }

 function recordCandles(context, symbol = '', resolution = '', rows = []) {
  if (!context || !(context.candles instanceof Map)) return;
  const safeSymbol = normalizeSymbol(symbol);
 const safeResolution = normalizeResolution(resolution);
 if (!safeSymbol || !safeResolution || !Array.isArray(rows) || !rows.length) return;
 const current = context.candles.get(safeSymbol) || {};
  const maxRows = safeResolution === '1d' || safeResolution === '1w' ? 260 : 320;
  current[safeResolution] = rows.slice(-maxRows);
 context.candles.set(safeSymbol, current);
 }

 function getCandles(context, symbol = '', resolution = '', limit = 0) {
  const safeSymbol = normalizeSymbol(symbol);
  const safeResolution = normalizeResolution(resolution);
  const rows = context?.candles instanceof Map ? context.candles.get(safeSymbol)?.[safeResolution] : null;
  if (!Array.isArray(rows)) return [];
  const safeLimit = Number(limit || 0);
  return safeLimit > 0 ? rows.slice(-safeLimit) : rows.slice();
 }

 async function finalize(context, patch = {}) {
  if (!context) return null;
  const ttlMs = await getConfiguredTtlMs();
  context.finishedAt = Number(patch.finishedAt || now());
  context.expiresAt = context.finishedAt + ttlMs;
  context.tickerMap = patch.tickerMap || context.tickerMap || {};
  context.products = Array.isArray(patch.products) ? patch.products : context.products || [];
  context.marketIndex = patch.marketIndex || context.marketIndex || null;
  context.fundingHeatmap = Array.isArray(patch.fundingHeatmap) ? patch.fundingHeatmap : context.fundingHeatmap || [];
  context.scanResults = Array.isArray(patch.scanResults) ? patch.scanResults : context.scanResults || [];
  context.decisionShortlist = Array.isArray(patch.decisionShortlist) ? patch.decisionShortlist : context.decisionShortlist || [];
  context.partial = !!patch.partial;
  context.scannedRows = Number(patch.scannedRows || context.scannedRows || 0);
  context.candidateRows = Number(patch.candidateRows || context.candidateRows || 0);
  context.durable = true;
  latestContext = context;
  const meta = buildMeta(context);
  try {
   await chrome.storage.local.set({ lastMainScanContextMeta: meta });
  } catch (_) {}
  try {
   await chrome.storage.local.set({ [DURABLE_CONTEXT_KEY]: buildDurableSnapshot(context) });
  } catch (_) {}
  return context;
 }

 function getLatest() {
  return latestContext;
 }

 function getFresh() {
  if (!latestContext) return null;
  latestContext.stale = Number(latestContext.expiresAt || 0) <= now();
  return latestContext;
 }

 async function restoreDurable() {
  if (latestContext) return latestContext;
  if (restorePromise) return restorePromise;
  restorePromise = new Promise(resolve => {
   try {
    chrome.storage.local.get([DURABLE_CONTEXT_KEY], async data => {
     const snapshot = data?.[DURABLE_CONTEXT_KEY];
     if (!snapshot?.scanId) {
      resolve(null);
      return;
     }
     const context = create({ ...snapshot, durable: true });
     context.finishedAt = Number(snapshot.finishedAt || 0);
     context.expiresAt = Number(snapshot.expiresAt || 0);
     const symbols = Array.isArray(snapshot.candleSymbols) ? snapshot.candleSymbols : [];
     for (const symbol of symbols) {
      for (const resolution of ['1d', '4h']) {
       try {
        const record = await loadPersistentCandleCacheRecord(symbol, resolution);
        recordCandles(context, symbol, resolution, record?.rows || []);
       } catch (_) {}
      }
     }
     context.stale = Number(context.expiresAt || 0) <= now();
     latestContext = context;
     resolve(context);
    });
   } catch (_) {
    resolve(null);
   }
  }).finally(() => {
   restorePromise = null;
  });
  return restorePromise;
 }

 async function getAvailable() {
  return getFresh() || await restoreDurable();
 }

 async function setUnifiedStatus(status, extra = {}) {
  try {
   await chrome.storage.local.set({
    strategyLabUnifiedScanStatus: {
     status,
     ts: now(),
     ...extra,
    },
   });
  } catch (_) {}
 }

 function cloneContextForDerive(context) {
  const clone = create({
   scanId: context.scanId,
   startedAt: context.startedAt,
   tickerMap: { ...(context.tickerMap || {}) },
   products: cloneRows(context.products),
   marketIndex: context.marketIndex,
   fundingHeatmap: cloneRows(context.fundingHeatmap),
   scanResults: cloneRows(context.scanResults),
   decisionShortlist: cloneRows(context.decisionShortlist),
   partial: !!context.partial,
   scannedRows: Number(context.scannedRows || 0),
   candidateRows: Number(context.candidateRows || 0),
   durable: context.durable === true,
  });
  clone.finishedAt = Number(context.finishedAt || 0);
  clone.expiresAt = Number(context.expiresAt || 0);
  clone.stale = !!context.stale;
  if (context.candles instanceof Map) {
   context.candles.forEach((resolutions, symbol) => {
    Object.entries(resolutions || {}).forEach(([resolution, rows]) => {
     recordCandles(clone, symbol, resolution, cloneRows(rows));
    });
   });
  }
  return clone;
 }

 async function readStrategyRows(strategyId) {
  return new Promise(resolve => {
   const resultKey = `strategyResults.${strategyId}`;
   const statusKey = `strategyStatus.${strategyId}`;
   try {
    chrome.storage.local.get([resultKey, statusKey], data => resolve({
     rows: Array.isArray(data?.[resultKey]) ? data[resultKey] : [],
     status: data?.[statusKey] || {},
    }));
   } catch (_) {
    resolve({ rows: [], status: {} });
   }
  });
 }

 function mergeStrategyRows(previousRows = [], nextRows = []) {
  const merged = new Map();
  previousRows.forEach(row => {
   const symbol = normalizeSymbol(row?.symbol);
   if (symbol) merged.set(symbol, row);
  });
  nextRows.forEach(row => {
   const symbol = normalizeSymbol(row?.symbol);
   if (symbol) merged.set(symbol, row);
  });
  return Array.from(merged.values()).sort((a, b) =>
   Number(b?.score || b?.confidence || 0) - Number(a?.score || a?.confidence || 0)
   || normalizeSymbol(a?.symbol).localeCompare(normalizeSymbol(b?.symbol))
  );
 }

 async function runStrategyDerive(strategyId, runner, context) {
  const previous = await readStrategyRows(strategyId);
  const result = typeof runner === 'function' ? await runner() : null;
  if (!Array.isArray(result)) return result;
  if (String(previous.status?.scanId || '') !== String(context.scanId || '')) return result;
  const merged = mergeStrategyRows(previous.rows, result);
  if (merged.length <= result.length) return result;
  const resultKey = `strategyResults.${strategyId}`;
  const statusKey = `strategyStatus.${strategyId}`;
  const current = await readStrategyRows(strategyId);
  await chrome.storage.local.set({
   [resultKey]: merged,
   [statusKey]: {
    ...(current.status || {}),
    retainedRows: merged.length - result.length,
    mergedRows: merged.length,
   },
  });
  return merged;
 }

 async function executeDerive(context, options = {}, request = {}) {
  if (
   latestDeriveRequest
   && latestDeriveRequest.scanId === request.scanId
   && Number(latestDeriveRequest.scannedRows || 0) > Number(request.scannedRows || 0)
  ) {
   return { ok: true, skipped: true, reason: 'Superseded by newer scan checkpoint', scanId: request.scanId, derived: {} };
  }
 if (!context) {
  await setUnifiedStatus('Run main scan first - no saved scanner context', { active: false, ok: false });
  return { ok: false, error: 'No saved scanner context' };
 }
 await global.FWDTradeDeskBackgroundLazyModules?.ensureStrategyLabScannersLoaded?.({ includeNative: false, includeCryptoOnly: false });
 await setUnifiedStatus(context.partial ? 'Deriving Strategy Lab from partial scanner checkpoint' : 'Deriving Strategy Lab scanners from main scan context', {
 active: true,
 scanId: context.scanId,
 partial: !!context.partial,
 scannedRows: Number(context.scannedRows || 0),
 candidateRows: Number(context.candidateRows || 0),
 });
 const tasks = [
   ['wizard', () => global.FWDTradeDeskWizardScanner?.runWizardScanFromContext?.(context)],
   ['stage', () => global.FWDTradeDeskStageScanner?.runStageScanFromContext?.(context)],
   ['radar', () => global.FWDTradeDeskRadarScanner?.runRadarScanFromContext?.(context)],
   ['reversal', () => global.FWDTradeDeskReversalScanner?.runReversalScanFromContext?.(context)],
   ['darvas', () => global.FWDTradeDeskDarvasScanner?.runDarvasScanFromContext?.(context)],
   ['pullback', () => global.FWDTradeDeskPullbackScanner?.runPullbackScanFromContext?.(context)],
  ];
  const derived = {};
  for (const [id, runner] of tasks) {
   try {
    const result = await runStrategyDerive(id, runner, context);
    if (Array.isArray(result)) derived[id] = { ok: true, count: result.length };
    else if (result && result.ok === false) derived[id] = result;
    else derived[id] = { ok: false, error: 'Scanner derive function unavailable' };
   } catch (error) {
    derived[id] = { ok: false, error: error?.message || String(error) };
   }
  }
  await setUnifiedStatus(context.partial ? 'Strategy Lab derived from partial scanner checkpoint' : 'Strategy Lab derived from main scan context', {
   active: false,
   ok: true,
   scanId: context.scanId,
   partial: !!context.partial,
   scannedRows: Number(context.scannedRows || 0),
   candidateRows: Number(context.candidateRows || 0),
   derived,
   finishedAt: now(),
  });
  return {
   ok: true,
   scanId: context.scanId,
   partial: !!context.partial,
   scannedRows: Number(context.scannedRows || 0),
   candidateRows: Number(context.candidateRows || 0),
   mainCount: Array.isArray(context.scanResults) ? context.scanResults.length : 0,
   derived,
  };
 }

 async function deriveAll(options = {}) {
  const available = getFresh() || await restoreDurable();
  if (!available) {
   await setUnifiedStatus('Run main scan first - no saved scanner context', { active: false, ok: false });
   return { ok: false, error: 'No saved scanner context' };
  }
  const context = cloneContextForDerive(available);
  const request = {
   scanId: context.scanId,
   scannedRows: Number(context.scannedRows || 0),
   candidateRows: Number(context.candidateRows || 0),
   partial: !!context.partial,
   source: String(options.source || ''),
  };
  latestDeriveRequest = request;
  const queued = deriveQueue
   .catch(() => null)
   .then(() => executeDerive(context, options, request));
  deriveQueue = queued.catch(() => null);
  return queued;
 }

 global.FWDTradeDeskScanContext = Object.freeze({
  create,
  recordCandles,
  getCandles,
  finalize,
 getLatest,
  getFresh,
  getAvailable,
  restoreDurable,
  buildMeta,
  deriveAll,
  setUnifiedStatus,
 });
 restoreDurable().catch(() => {});
})(globalThis);
