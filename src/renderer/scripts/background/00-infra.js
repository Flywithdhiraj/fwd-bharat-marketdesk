// ================================================================
// FWD TradeDesk Pro v14 - Background Service Worker
//
// v14 UPGRADES:
// OK NEW: Webhook System - send signals to Voicenotes/Notion/Discord/Telegram/any URL
// OK NEW: Desktop App Mode - open as standalone pinned window
// OK NEW: App Logo & Branding - proper icons at all sizes
// OK NEW: Multi-webhook support with event filtering
// OK NEW: Webhook retry with exponential backoff
// OK NEW: Webhook test endpoint
//
// Prior features (all retained):
// Market Structure | Volume Climax | Funding Arbitrage | OI Divergence
// Session Tagging | Tiered Sound Alerts | CSV/JSON Export | Sparklines
// Pinned coins | Bug fixes (Funding Rate / BTC OI / Watchlist)
// ================================================================

'use strict';

// -- API Configuration ------------------------------------------
const API_INDIA = 'https://api.india.delta.exchange/v2';
const API_GLOBAL = 'https://api.delta.exchange/v2';
let BASE = API_INDIA;
let detectedRegion = 'india'; // Determines funding rate parsing

let _detectAPIPromise = null;
let _detectAPILastOk = 0;
const DETECT_API_TTL_MS = 30000;
async function detectAPI(forceRefresh = false) {
 if (!forceRefresh && BASE && (Date.now() - _detectAPILastOk) < DETECT_API_TTL_MS) return;
 if (_detectAPIPromise) return _detectAPIPromise;
 _detectAPIPromise = (async () => {
 try {
 const r = await fetch(`${API_INDIA}/tickers?contract_types=perpetual_futures`, { signal: AbortSignal.timeout(8000) });
 if (r.ok) {
 const d = await r.json();
 const list = d.result ?? d.data ?? [];
 if (list.length > 20) {
 BASE = API_INDIA; detectedRegion = 'india';
 _detectAPILastOk = Date.now();
 dlog(`API: India (${list.length} tickers)`); return;
 }
 }
 } catch (_) {}

 try {
 const r = await fetch(`${API_GLOBAL}/tickers?contract_types=perpetual_futures`, { signal: AbortSignal.timeout(8000) });
 if (r.ok) {
 const d = await r.json();
 const list = d.result ?? d.data ?? [];
 BASE = API_GLOBAL; detectedRegion = 'global';
 _detectAPILastOk = Date.now();
 dlog(`API: Global (${list.length} tickers)`); return;
 }
 } catch (_) {}

 dlog('API: Detection failed, defaulting to India');
 })();
 try { await _detectAPIPromise; } finally { _detectAPIPromise = null; }
}

// -- Logging -----------------------------------------------------
const _log = [];
const DEBUG_LOG_LIMIT = 300;
const DEBUG_LOG_PERSIST_LIMIT = 120;
function redactForLog(value) {
 let safe = String(value ?? '');
 safe = safe.replace(/https?:\/\/[^\s"'<>]+/gi, raw => {
 try {
 const url = new URL(raw);
 const cleanPath = url.pathname.replace(/\/bot[^/]+/i, '/bot[redacted]');
 return `${url.protocol}//${url.host}${cleanPath}`;
 } catch (_) {
 return '[url]';
 }
 });
 safe = safe.replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+\/=-]+\b/gi, '$1 [redacted]');
 safe = safe.replace(/("?(?:authorization|botToken|chatId)"?\s*[:=]\s*"?)[^",\s}]+/gi, '$1[redacted]');
 return safe;
}

function dlog(msg) {
 const safe = redactForLog(msg).slice(0, 300);
 _log.push(`[${new Date().toISOString()}] ${safe}`);
 if (_log.length > DEBUG_LOG_LIMIT) _log.splice(0, _log.length - DEBUG_LOG_LIMIT);
 scheduleRuntimeSnapshotPersist();
}
function saveLog() { chrome.storage.local.set({ debugLog: _log.slice(-DEBUG_LOG_PERSIST_LIMIT) }); }

// -- Rate Limiter ------------------------------------------------
const RL = { active: 0, max: 8, gap: 40, lastReq: 0, queue: [] };
const RL_NOTIFY = { active: 0, max: 2, gap: 350, lastReq: 0, queue: [] };
function createApiQuotaState() {
 return {
 lastRequestAt: 0,
 lastOkAt: 0,
 last429At: 0,
 backoffUntil: 0,
 total429: 0,
 consecutive429: 0,
 totalRequests: 0,
 lastStatus: 0,
 lastUrl: '',
 lastError: '',
 severity: 'normal',
 };
}

const V17_API_QUOTA_STATE = createApiQuotaState();
const V17_NOTIFY_QUOTA_STATE = createApiQuotaState();
RL.quota = V17_API_QUOTA_STATE;
RL_NOTIFY.quota = V17_NOTIFY_QUOTA_STATE;

const PERFORMANCE_METRICS_KEY = 'performanceMetricsV17';
const PERFORMANCE_SAMPLE_LIMIT = 80;
const performanceMetrics = {
 startedAt: Date.now(),
 startup: {},
 api: { total: 0, ok: 0, failed: 0, avgMs: 0, maxMs: 0, lastMs: 0, lastStatus: 0, samples: [] },
 scan: { total: 0, avgMs: 0, maxMs: 0, lastMs: 0, lastCount: 0, lastStartedAt: 0, lastEndedAt: 0, samples: [] },
 backtest: { total: 0, avgMs: 0, maxMs: 0, lastMs: 0, lastSymbol: '', samples: [] },
 chart: { total: 0, avgMs: 0, maxMs: 0, lastMs: 0, lastSurface: '', samples: [] },
 websocket: { reconnects: 0, opens: 0, closes: 0, errors: 0, messages: 0, lastHeartbeatAt: 0, lastUrl: '', lastError: '' },
 runtime: { lastSampleAt: 0, memory: null, cpu: null, cache: null },
};
let performancePersistTimer = null;

function performanceNow() {
 return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function trimPerformanceSamples(samples = []) {
 while (samples.length > PERFORMANCE_SAMPLE_LIMIT) samples.shift();
 return samples;
}

function recordTimedMetric(section, sample = {}) {
 const target = performanceMetrics[section];
 if (!target) return;
 const durationMs = Math.max(0, Number(sample.durationMs || 0));
 target.total = Number(target.total || 0) + 1;
 target.lastMs = +durationMs.toFixed(1);
 target.maxMs = Math.max(Number(target.maxMs || 0), target.lastMs);
 target.avgMs = +(((Number(target.avgMs || 0) * Math.max(0, target.total - 1)) + target.lastMs) / target.total).toFixed(1);
 target.samples = trimPerformanceSamples([...(Array.isArray(target.samples) ? target.samples : []), {
 ts: Date.now(),
 durationMs: target.lastMs,
 ...sample,
 }]);
 schedulePerformanceMetricsPersist();
}

function recordApiLatency(url = '', response = null, startedAt = 0, error = null) {
 const durationMs = performanceNow() - Number(startedAt || performanceNow());
 const api = performanceMetrics.api;
 const status = Number(response?.status || 0);
 api.total += 1;
 if (response?.ok) api.ok += 1;
 if (error || (status >= 400)) api.failed += 1;
 api.lastMs = +durationMs.toFixed(1);
 api.lastStatus = status;
 api.maxMs = Math.max(Number(api.maxMs || 0), api.lastMs);
 api.avgMs = +(((Number(api.avgMs || 0) * Math.max(0, api.total - 1)) + api.lastMs) / api.total).toFixed(1);
 api.samples = trimPerformanceSamples([...(Array.isArray(api.samples) ? api.samples : []), {
 ts: Date.now(),
 ms: api.lastMs,
 status,
 ok: !!response?.ok,
 path: (() => {
 try { const u = new URL(String(url || '')); return `${u.host}${u.pathname}`.slice(0, 120); } catch (_) { return String(url || '').slice(0, 120); }
 })(),
 error: error ? String(error?.message || error).slice(0, 120) : '',
 }]);
 schedulePerformanceMetricsPersist();
}

function recordWebSocketMetric(event = '', detail = {}) {
 const ws = performanceMetrics.websocket;
 if (event === 'open') ws.opens += 1;
 if (event === 'reconnect') ws.reconnects += 1;
 if (event === 'close') ws.closes += 1;
 if (event === 'error') ws.errors += 1;
 if (event === 'message') ws.messages += 1;
 if (event === 'message' || event === 'open') ws.lastHeartbeatAt = Date.now();
 if (detail.url) ws.lastUrl = String(detail.url || '').slice(0, 160);
 if (detail.error) ws.lastError = String(detail.error || '').slice(0, 160);
 schedulePerformanceMetricsPersist();
}

async function sampleNativeRuntimeStats() {
 try {
 const native = await sendDesktopNativeMessage({ type: 'performance_native_stats' });
 performanceMetrics.runtime.lastSampleAt = Date.now();
 if (native?.memory) performanceMetrics.runtime.memory = native.memory;
 if (native?.cpu) performanceMetrics.runtime.cpu = native.cpu;
 if (native?.cache) performanceMetrics.runtime.cache = native.cache;
 if (native?.readyToShowMs) performanceMetrics.startup.readyToShowMs = Number(native.readyToShowMs || 0);
 schedulePerformanceMetricsPersist();
 return native;
 } catch (_) {
 return null;
 }
}

function buildPerformanceMetricsSnapshot() {
 return JSON.parse(JSON.stringify({
 ...performanceMetrics,
 apiQuota: v17GetApiQuotaState(V17_API_QUOTA_STATE),
 notifyQuota: v17GetApiQuotaState(V17_NOTIFY_QUOTA_STATE),
 savedAt: Date.now(),
 }));
}

function schedulePerformanceMetricsPersist() {
 clearTimeout(performancePersistTimer);
 performancePersistTimer = setTimeout(() => {
 chrome.storage.local.set({ [PERFORMANCE_METRICS_KEY]: buildPerformanceMetricsSnapshot() }).catch(() => {});
 }, 500);
}

globalThis.fwdRecordPerformanceMetric = recordTimedMetric;
globalThis.fwdRecordWebSocketMetric = recordWebSocketMetric;
globalThis.fwdSampleNativeRuntimeStats = sampleNativeRuntimeStats;

function queueRateLimitedFetch(bucket, url, opts = {}) {
 return new Promise((resolve, reject) => {
 bucket.queue.push({ url, opts, resolve, reject });
 drainQueue(bucket);
 });
}

function rateLimitedFetch(url, opts = {}) {
 return queueRateLimitedFetch(RL, url, opts);
}

function rateLimitedNotifyFetch(url, opts = {}) {
 return queueRateLimitedFetch(RL_NOTIFY, url, opts);
}

function v17ResolveRetryAfterMs(response) {
 try {
 const raw = response?.headers?.get?.('retry-after');
 if (!raw) return 0;
 const numericSeconds = Number(raw);
 if (Number.isFinite(numericSeconds) && numericSeconds >= 0) return numericSeconds * 1000;
 const absoluteTs = Date.parse(raw);
 if (Number.isFinite(absoluteTs) && absoluteTs > Date.now()) return absoluteTs - Date.now();
 } catch (_) {}
 return 0;
}

function v17UpdateApiQuotaSeverity(quota = V17_API_QUOTA_STATE) {
 const now = Date.now();
 if (quota.backoffUntil > now) {
 quota.severity = 'critical';
 } else if (quota.last429At > 0 && (now - quota.last429At) < (5 * 60 * 1000)) {
 quota.severity = 'warn';
 } else {
 quota.severity = 'normal';
 }
}

function v17RecordApiQuotaResponse(bucket = RL, url = '', response = null) {
 const quota = bucket.quota || V17_API_QUOTA_STATE;
 const status = Number(response?.status || 0);
 quota.totalRequests += 1;
 quota.lastRequestAt = Date.now();
 quota.lastStatus = status;
 quota.lastUrl = String(url || '');
 if (status === 429) {
 const retryAfterMs = Math.max(15000, v17ResolveRetryAfterMs(response) || (Math.min(120000, 15000 * Math.max(1, quota.consecutive429 + 1))));
 quota.last429At = Date.now();
 quota.total429 += 1;
 quota.consecutive429 += 1;
 quota.backoffUntil = Math.max(quota.backoffUntil || 0, Date.now() + retryAfterMs);
 quota.lastError = `429 Too Many Requests (${Math.round(retryAfterMs / 1000)}s backoff)`;
 } else if (status > 0) {
 quota.lastOkAt = response?.ok ? Date.now() : quota.lastOkAt;
 quota.consecutive429 = 0;
 if (response?.ok) {
 quota.backoffUntil = 0;
 quota.lastError = '';
 } else {
 quota.lastError = status >= 400 ? `HTTP ${status}` : '';
 }
 }
 v17UpdateApiQuotaSeverity(quota);
}

function v17RecordApiQuotaError(bucket = RL, url = '', error = null) {
 const quota = bucket.quota || V17_API_QUOTA_STATE;
 quota.totalRequests += 1;
 quota.lastRequestAt = Date.now();
 quota.lastUrl = String(url || '');
 quota.lastError = String(error?.message || error || '').trim();
 quota.lastStatus = /^429\b/.test(quota.lastError) ? 429 : 0;
 if (quota.lastStatus === 429 || /rate limit|too many/i.test(quota.lastError)) {
 quota.last429At = Date.now();
 quota.total429 += 1;
 quota.consecutive429 += 1;
 quota.backoffUntil = Math.max(quota.backoffUntil || 0, Date.now() + Math.min(120000, 15000 * Math.max(1, quota.consecutive429)));
 }
 v17UpdateApiQuotaSeverity(quota);
}

function v17GetApiQuotaState(quota = V17_API_QUOTA_STATE) {
 v17UpdateApiQuotaSeverity(quota);
 return {
 ...quota,
 backoffRemainingMs: Math.max(0, Number(quota.backoffUntil || 0) - Date.now()),
 };
}

function drainQueue(bucket) {
 if (!bucket.queue.length || bucket.active >= bucket.max) return;
 const quotaState = v17GetApiQuotaState(bucket.quota || V17_API_QUOTA_STATE);
 if (quotaState.backoffRemainingMs > 0) {
 setTimeout(() => drainQueue(bucket), Math.min(quotaState.backoffRemainingMs, 30000));
 return;
 }
 const wait = Math.max(0, bucket.lastReq + bucket.gap - Date.now());
 setTimeout(() => {
 if (!bucket.queue.length || bucket.active >= bucket.max) return;
 const { url, opts, resolve, reject } = bucket.queue.shift();
 bucket.active++;
 bucket.lastReq = Date.now();
 const startedAt = performanceNow();
 fetch(url, { ...opts, headers: { Accept: 'application/json', ...opts.headers } })
 .then(response => {
 v17RecordApiQuotaResponse(bucket, url, response);
 recordApiLatency(url, response, startedAt, null);
 resolve(response);
 })
 .catch(error => {
 v17RecordApiQuotaError(bucket, url, error);
 recordApiLatency(url, null, startedAt, error);
 reject(error);
 })
 .finally(() => { bucket.active--; drainQueue(bucket); });
 }, wait);
}

// -- Cache (5-min TTL) -------------------------------------------
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const ALERT_STORAGE_LIMIT = 500;
const FUNDING_MIN_VOLUME_DEFAULT = 100000;
const SYMBOL_REFRESH_TTL_MS = 15000;
const V17_CANDLE_CACHE_DB_NAME = 'FWDTradeDeskCandleCacheV1';
const V17_CANDLE_CACHE_DB_VERSION = 1;
const V17_CANDLE_CACHE_STORE = 'candles';
const V17_NATIVE_CANDLE_RESOLUTIONS = new Set(['1d', '15m']);
const { sanitizeAutoScanInterval, sanitizeAlertTone, sanitizeBacktestMinScore, sanitizeBacktestLookbackDays } = globalThis.FWDTradeDeskShared;
const FUNDING_INTERVAL_SEC = 8 * 60 * 60;
const WEBHOOK_FAILURE_THRESHOLD = 3;
const WEBHOOK_COOLDOWN_MS = 15 * 60 * 1000;
const BROKERAGE_PCT_PER_SIDE = 0.05;
const GST_ON_BROKERAGE = 0.18;
const EFFECTIVE_FEE_PCT_PER_SIDE = BROKERAGE_PCT_PER_SIDE * (1 + GST_ON_BROKERAGE);
const SLIPPAGE_PCT_PER_SIDE = 0.10;
const BACKTEST_BREAKEVEN_R = 1;
const BACKTEST_STOP_COOLDOWN_BARS = 5;
const BACKTEST_STAKE = 100;

const symbolRefreshInFlight = new Map();
let correlationBuildInFlight = null;
let v17CandleCacheDbPromise = null;

function cached(key) {
 const e = cache.get(key);
 return (e && Date.now() - e.ts < CACHE_TTL) ? e.data : null;
}
function setCache(key, data) {
 cache.set(key, { data, ts: Date.now() });
 if (cache.size > 300) {
 const cut = Date.now() - CACHE_TTL;
 for (const [k, v] of cache) if (v.ts < cut) cache.delete(k);
 }
 scheduleRuntimeSnapshotPersist();
}

function v17CanUseIndexedDb() {
 return typeof indexedDB !== 'undefined' && indexedDB && typeof indexedDB.open === 'function';
}

function v17BuildCandleCacheStoreKey(symbol = '', resolution = '') {
 const safeSymbol = String(symbol || '').trim().toUpperCase();
 const safeResolution = String(resolution || '').trim().toLowerCase();
 return safeSymbol && safeResolution ? `${safeSymbol}__${safeResolution}` : '';
}

async function v17ReadNativeCandleCache(symbol = '', resolution = '') {
 if (!V17_NATIVE_CANDLE_RESOLUTIONS.has(String(resolution || '').trim().toLowerCase())) return null;
 const response = await sendDesktopNativeMessage({ type: 'candle_get', symbol, resolution });
 return response?.ok ? response : null;
}

async function v17WriteNativeCandleCache(symbol = '', resolution = '', payload = {}) {
 if (!V17_NATIVE_CANDLE_RESOLUTIONS.has(String(resolution || '').trim().toLowerCase())) return null;
 return sendDesktopNativeMessage({
 type: 'candle_put',
 symbol,
 resolution,
 rows: Array.isArray(payload.rows) ? payload.rows : [],
 });
}

function v17OpenCandleCacheDb() {
 if (!v17CanUseIndexedDb()) return Promise.resolve(null);
 if (v17CandleCacheDbPromise) return v17CandleCacheDbPromise;
 v17CandleCacheDbPromise = new Promise(resolve => {
 try {
 const req = indexedDB.open(V17_CANDLE_CACHE_DB_NAME, V17_CANDLE_CACHE_DB_VERSION);
 req.onupgradeneeded = () => {
 const db = req.result;
 if (!db.objectStoreNames.contains(V17_CANDLE_CACHE_STORE)) {
 const store = db.createObjectStore(V17_CANDLE_CACHE_STORE, { keyPath: 'key' });
 store.createIndex('updatedAt', 'updatedAt', { unique: false });
 }
 };
 req.onsuccess = () => resolve(req.result);
 req.onerror = () => {
 dlog(`IndexedDB candle cache unavailable: ${req.error?.message || 'open failed'}`);
 v17CandleCacheDbPromise = null;
 resolve(null);
 };
 } catch (error) {
 dlog(`IndexedDB candle cache error: ${error?.message || error}`);
 v17CandleCacheDbPromise = null;
 resolve(null);
 }
 });
 return v17CandleCacheDbPromise;
}

async function v17ReadPersistentCandleCache(symbol = '', resolution = '') {
 const key = v17BuildCandleCacheStoreKey(symbol, resolution);
 if (!key) return null;
 const nativeRecord = await v17ReadNativeCandleCache(symbol, resolution);
 if (nativeRecord && Array.isArray(nativeRecord.rows)) return nativeRecord;
 const db = await v17OpenCandleCacheDb();
 if (!db) return null;
 return new Promise(resolve => {
 try {
 const tx = db.transaction(V17_CANDLE_CACHE_STORE, 'readonly');
 const store = tx.objectStore(V17_CANDLE_CACHE_STORE);
 const req = store.get(key);
 req.onsuccess = () => resolve(req.result || null);
 req.onerror = () => resolve(null);
 } catch (_) {
 resolve(null);
 }
 });
}

async function v17WritePersistentCandleCache(symbol = '', resolution = '', payload = {}) {
 const key = v17BuildCandleCacheStoreKey(symbol, resolution);
 if (!key) return false;
 const nativeWrite = await v17WriteNativeCandleCache(symbol, resolution, payload);
 if (nativeWrite?.ok) return true;
 const db = await v17OpenCandleCacheDb();
 if (!db) return !!nativeWrite?.ok;
 const safePayload = payload && typeof payload === 'object' ? payload : {};
 return new Promise(resolve => {
 try {
 const tx = db.transaction(V17_CANDLE_CACHE_STORE, 'readwrite');
 const store = tx.objectStore(V17_CANDLE_CACHE_STORE);
 store.put({
 key,
 symbol: String(symbol || '').trim().toUpperCase(),
 resolution: String(resolution || '').trim().toLowerCase(),
 rows: Array.isArray(safePayload.rows) ? safePayload.rows : [],
 updatedAt: Number(safePayload.updatedAt || Date.now()),
 });
 tx.oncomplete = () => resolve(true);
 tx.onerror = () => resolve(!!nativeWrite?.ok);
 tx.onabort = () => resolve(!!nativeWrite?.ok);
 } catch (_) {
 resolve(!!nativeWrite?.ok);
 }
 });
}

async function v17GetPersistentCandleCacheStats() {
 const nativeStats = await sendDesktopNativeMessage({ type: 'candle_stats' });
 if (nativeStats?.ok) {
 return {
 supported: true,
 source: 'native',
 entries: Number(nativeStats.entries || 0),
 latestUpdatedAt: Number(nativeStats.latestUpdatedAt || 0),
 oldestUpdatedAt: Number(nativeStats.oldestUpdatedAt || 0),
 };
 }
 const db = await v17OpenCandleCacheDb();
 if (!db) {
 return { supported: false, entries: 0, latestUpdatedAt: 0, oldestUpdatedAt: 0 };
 }
 return new Promise(resolve => {
 try {
 const tx = db.transaction(V17_CANDLE_CACHE_STORE, 'readonly');
 const store = tx.objectStore(V17_CANDLE_CACHE_STORE);
 const countReq = store.count();
 const index = store.index('updatedAt');
 const latestReq = index.openCursor(null, 'prev');
 const oldestReq = index.openCursor(null, 'next');
 const state = { supported: true, entries: 0, latestUpdatedAt: 0, oldestUpdatedAt: 0 };
 countReq.onsuccess = () => { state.entries = Number(countReq.result || 0); };
 latestReq.onsuccess = () => { state.latestUpdatedAt = Number(latestReq.result?.value?.updatedAt || 0); };
 oldestReq.onsuccess = () => { state.oldestUpdatedAt = Number(oldestReq.result?.value?.updatedAt || 0); };
 tx.oncomplete = () => resolve(state);
 tx.onerror = () => resolve(state);
 tx.onabort = () => resolve(state);
 } catch (_) {
 resolve({ supported: true, entries: 0, latestUpdatedAt: 0, oldestUpdatedAt: 0 });
 }
 });
}

async function v17ClearPersistentCandleCache() {
 const db = await v17OpenCandleCacheDb();
 for (const key of Array.from(cache.keys())) {
 if (String(key || '').startsWith('candles_')) cache.delete(key);
 }
 const nativeClear = await sendDesktopNativeMessage({ type: 'candle_clear' });
 if (!db) return nativeClear || { ok: false, cleared: false };
 return new Promise(resolve => {
 try {
 const tx = db.transaction(V17_CANDLE_CACHE_STORE, 'readwrite');
 tx.objectStore(V17_CANDLE_CACHE_STORE).clear();
 tx.oncomplete = () => resolve({ ok: true, cleared: true });
 tx.onerror = () => resolve({ ok: false, cleared: false });
 tx.onabort = () => resolve({ ok: false, cleared: false });
 } catch (_) {
 resolve({ ok: false, cleared: false });
 }
 });
}

async function v17MigrateIndexedDbCandlesToNative() {
 if (!globalThis.fwdDesktopNative?.sendNativeMessage) return false;
 const markerKey = 'v17IndexedDbCandlesMigratedToNativeV1';
 const marker = await storeLocalGet([markerKey]).catch(() => ({}));
 if (marker?.[markerKey] === true) return true;
 const db = await v17OpenCandleCacheDb();
 if (!db) return false;
 const records = [];
 let migrated = 0;
 await new Promise(resolve => {
 try {
 const tx = db.transaction(V17_CANDLE_CACHE_STORE, 'readonly');
 const store = tx.objectStore(V17_CANDLE_CACHE_STORE);
 const req = store.openCursor();
 req.onsuccess = () => {
 const cursor = req.result;
 if (!cursor) return;
 const record = cursor.value || {};
 const resolution = String(record.resolution || '').trim().toLowerCase();
 if (V17_NATIVE_CANDLE_RESOLUTIONS.has(resolution) && Array.isArray(record.rows) && record.rows.length) {
 records.push(record);
 }
 cursor.continue();
 };
 tx.oncomplete = () => resolve();
 tx.onerror = () => resolve();
 tx.onabort = () => resolve();
 } catch (_) {
 resolve();
 }
 });
 for (const record of records) {
 const resolution = String(record.resolution || '').trim().toLowerCase();
 const write = await v17WriteNativeCandleCache(record.symbol, resolution, record).catch(() => null);
 if (write?.ok) migrated += 1;
 }
 await storeLocalSet({ [markerKey]: true, v17IndexedDbCandlesMigratedToNativeAt: Date.now(), v17IndexedDbCandlesMigratedToNativeCount: migrated });
 dlog(`IndexedDB candle migration to native complete: ${migrated} records`);
 return true;
}
globalThis.v17GetApiQuotaState = v17GetApiQuotaState;
globalThis.v17GetPersistentCandleCacheStats = v17GetPersistentCandleCacheStats;
globalThis.v17ClearPersistentCandleCache = v17ClearPersistentCandleCache;
v17MigrateIndexedDbCandlesToNative().catch(error => dlog(`IndexedDB candle migration error: ${error?.message || error}`));

function sanitizeFundingMinVolume(v) {
 const n = Number(v);
 if (!isFinite(n) || n < 0) return FUNDING_MIN_VOLUME_DEFAULT;
 return Math.max(0, Math.round(n));
}

function sanitizeTelegramConfig(cfg) {
 const botToken = String(cfg?.botToken || '').trim();
 const chatId = String(cfg?.chatId || '').trim();
 const minScoreRaw = Number(cfg?.minScore);
 const minScore = Number.isFinite(minScoreRaw) ? Math.max(0, Math.min(100, Math.round(minScoreRaw))) : 85;
 const enabled = !!cfg?.enabled && !!botToken && !!chatId;
 const hourlySummaryEnabled = !!cfg?.hourlySummaryEnabled;
 return { enabled, botToken, chatId, minScore, hourlySummaryEnabled };
}

function storeLocalGet(keys) {
 return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storeLocalSet(items) {
 return new Promise(resolve => chrome.storage.local.set(items, resolve));
}

function storeSessionGet(keys) {
 return new Promise(resolve => chrome.storage.session.get(keys, resolve));
}

function storeSessionSet(items) {
 return new Promise(resolve => chrome.storage.session.set(items, resolve));
}

async function sendDesktopNativeMessage(message = {}) {
 try {
 if (!globalThis.fwdDesktopNative?.sendNativeMessage) return null;
 const response = await globalThis.fwdDesktopNative.sendNativeMessage(message);
 return response?.ok ? response : null;
 } catch (_) {
 return null;
 }
}

async function readNativeSecret(name = '') {
 const response = await sendDesktopNativeMessage({ type: 'secure_secret_get', name });
 return response?.value?.value || response?.value || null;
}

async function writeNativeSecret(name = '', value = {}) {
 return sendDesktopNativeMessage({ type: 'secure_secret_set', name, value });
}

async function deleteNativeSecret(name = '') {
 return sendDesktopNativeMessage({ type: 'secure_secret_delete', name });
}

function webhookSecretName(hookId = '') {
 return `webhook:${sanitizeWebhookId(hookId)}`;
}

const RUNTIME_SNAPSHOT_KEY = 'dsRuntimeSnapshotV17';
const RUNTIME_SNAPSHOT_MAX_CACHE_ENTRIES = 24;
const RUNTIME_SNAPSHOT_MAX_LOG_ENTRIES = 80;
const SECURE_STORAGE_WARNING_KEY = 'secureStorageWarning';
const SENSITIVE_CONFIG_MIGRATED_KEY = 'sensitiveConfigMigratedV2';
let runtimeSnapshotHydrated = false;
let runtimeSnapshotPersistTimer = null;
let sensitiveConfigMigrationPromise = null;

function buildRuntimeSnapshot() {
 const cacheEntries = Array.from(cache.entries())
 .map(([key, entry]) => ({
 key,
 ts: Number(entry?.ts || 0),
 data: entry?.data ?? null,
 }))
 .filter(entry => entry.key && entry.ts > 0)
 .sort((a, b) => b.ts - a.ts)
 .slice(0, RUNTIME_SNAPSHOT_MAX_CACHE_ENTRIES);
 return {
 savedAt: Date.now(),
 base: BASE,
 detectedRegion,
 detectLastOk: _detectAPILastOk,
 cacheEntries,
 debugLog: _log.slice(-RUNTIME_SNAPSHOT_MAX_LOG_ENTRIES),
 };
}

async function persistRuntimeSnapshot() {
 if (!chrome?.storage?.session) return false;
 clearTimeout(runtimeSnapshotPersistTimer);
 runtimeSnapshotPersistTimer = null;
 try {
 await storeSessionSet({ [RUNTIME_SNAPSHOT_KEY]: buildRuntimeSnapshot() });
 return true;
 } catch (_) {
 return false;
 }
}

function scheduleRuntimeSnapshotPersist() {
 if (!runtimeSnapshotHydrated) return;
 clearTimeout(runtimeSnapshotPersistTimer);
 runtimeSnapshotPersistTimer = setTimeout(() => {
 persistRuntimeSnapshot().catch(() => {});
 }, 250);
}

async function restoreRuntimeSnapshot() {
 if (!chrome?.storage?.session) {
 runtimeSnapshotHydrated = true;
 return;
 }
 try {
 const data = await storeSessionGet(RUNTIME_SNAPSHOT_KEY);
 const snapshot = data?.[RUNTIME_SNAPSHOT_KEY];
 if (snapshot && typeof snapshot === 'object') {
 if (snapshot.base === API_INDIA || snapshot.base === API_GLOBAL) BASE = snapshot.base;
 if (snapshot.detectedRegion === 'india' || snapshot.detectedRegion === 'global') detectedRegion = snapshot.detectedRegion;
 _detectAPILastOk = Number(snapshot.detectLastOk || 0);
 cache.clear();
 (Array.isArray(snapshot.cacheEntries) ? snapshot.cacheEntries : []).forEach(entry => {
 const key = String(entry?.key || '').trim();
 const ts = Number(entry?.ts || 0);
 if (!key || !ts) return;
 cache.set(key, {
 data: entry?.data ?? null,
 ts,
 });
 });
 _log.length = 0;
 (Array.isArray(snapshot.debugLog) ? snapshot.debugLog : [])
 .slice(-RUNTIME_SNAPSHOT_MAX_LOG_ENTRIES)
 .forEach(line => _log.push(String(line || '')));
 }
 } catch (_) {
 // Ignore snapshot restore issues and continue with a clean worker boot.
 } finally {
 runtimeSnapshotHydrated = true;
 }
}

restoreRuntimeSnapshot().catch(() => {
 runtimeSnapshotHydrated = true;
});

sampleNativeRuntimeStats().catch(() => {});
setInterval(() => {
 sampleNativeRuntimeStats().catch(() => {});
}, 60000);

chrome.runtime.onSuspend?.addListener(() => {
 saveLog();
 persistRuntimeSnapshot().catch(() => {});
});

function mergeWebhookSecrets(hook, secretMap) {
 const safeHook = { ...(hook || {}) };
 const secretHeaders = secretMap?.[safeHook.id] || null;
 if (secretHeaders?.Authorization) {
 safeHook.headers = { ...(safeHook.headers || {}), Authorization: secretHeaders.Authorization };
 safeHook.hasAuthHeader = true;
 } else if (safeHook.headers?.Authorization) {
 const nextHeaders = { ...safeHook.headers };
 delete nextHeaders.Authorization;
 safeHook.headers = Object.keys(nextHeaders).length ? nextHeaders : null;
 safeHook.hasAuthHeader = !!safeHook.hasAuthHeader;
 }
 return safeHook;
}

async function migrateSensitiveConfig(options = {}) {
 if (sensitiveConfigMigrationPromise) return sensitiveConfigMigrationPromise;
 sensitiveConfigMigrationPromise = (async () => {
 if (!options.force) {
 const migrationState = await storeLocalGet(SENSITIVE_CONFIG_MIGRATED_KEY);
 if (migrationState?.[SENSITIVE_CONFIG_MIGRATED_KEY] === true) return;
 }
 const localData = await storeLocalGet(['telegram', 'webhooks']);
 const sessionData = await storeSessionGet(['telegramSecret', 'webhookSecrets']);

 const nextLocal = {};
 const nextSession = {};
 let nativeSecretFallbackUsed = false;

 const telegram = localData.telegram || {};
 const telegramSecret = sessionData.telegramSecret || {};
 const nativeTelegramSecret = await readNativeSecret('telegram');
 let telegramStoredNatively = !!(nativeTelegramSecret?.botToken || nativeTelegramSecret?.chatId);
 if ((telegram.botToken || telegram.chatId || telegramSecret.botToken || telegramSecret.chatId) && !nativeTelegramSecret?.botToken && !nativeTelegramSecret?.chatId) {
 const nativeWrite = await writeNativeSecret('telegram', {
 botToken: String(telegramSecret.botToken || telegram.botToken || '').trim(),
 chatId: String(telegramSecret.chatId || telegram.chatId || '').trim(),
 });
 if (nativeWrite) {
 telegramStoredNatively = true;
 nextSession.telegramSecret = {};
 } else {
 nativeSecretFallbackUsed = true;
 }
 }
 if ((telegram.botToken || telegram.chatId) && !telegramSecret.botToken && !telegramSecret.chatId && !telegramStoredNatively) {
 nativeSecretFallbackUsed = true;
 nextSession.telegramSecret = {
 botToken: String(telegram.botToken || '').trim(),
 chatId: String(telegram.chatId || '').trim(),
 };
 }
 if ((telegramSecret.botToken || telegramSecret.chatId) && !telegramStoredNatively) {
 nativeSecretFallbackUsed = true;
 }
 if (Object.prototype.hasOwnProperty.call(telegram, 'botToken') || Object.prototype.hasOwnProperty.call(telegram, 'chatId')) {
 const nextTelegram = { ...telegram };
 delete nextTelegram.botToken;
 delete nextTelegram.chatId;
 nextLocal.telegram = nextTelegram;
 }

 const storedSecrets = { ...(sessionData.webhookSecrets || {}) };
 let webhookSecretsChanged = false;
 let webhooksChanged = false;
 const hooks = [];
 for (const hook of Array.isArray(localData.webhooks) ? localData.webhooks : []) {
 const nextHook = sanitizeWebhookRecord(hook || {});
 const authHeader = String(nextHook.headers?.Authorization || '').trim();
 const sessionAuthHeader = String(storedSecrets[nextHook.id]?.Authorization || '').trim();
 const nativeSecret = await readNativeSecret(webhookSecretName(nextHook.id));
 const nativeAuthHeader = String(nativeSecret?.Authorization || '').trim();
 let webhookStoredNatively = !!nativeAuthHeader;
 if ((authHeader || sessionAuthHeader) && !nativeAuthHeader) {
 const nativeWrite = await writeNativeSecret(webhookSecretName(nextHook.id), { Authorization: authHeader || sessionAuthHeader });
 if (nativeWrite && storedSecrets[nextHook.id]) {
 webhookStoredNatively = true;
 delete storedSecrets[nextHook.id];
 webhookSecretsChanged = true;
 } else if (nativeWrite) {
 webhookStoredNatively = true;
 } else {
 nativeSecretFallbackUsed = true;
 }
 } else if (nativeAuthHeader && storedSecrets[nextHook.id]) {
 delete storedSecrets[nextHook.id];
 webhookSecretsChanged = true;
 }
 if (authHeader && !storedSecrets[nextHook.id]?.Authorization && !nativeAuthHeader) {
 nativeSecretFallbackUsed = true;
 storedSecrets[nextHook.id] = { ...(storedSecrets[nextHook.id] || {}), Authorization: authHeader };
 webhookSecretsChanged = true;
 }
 if (nextHook.headers?.Authorization) {
 const nextHeaders = { ...(nextHook.headers || {}) };
 delete nextHeaders.Authorization;
 nextHook.headers = Object.keys(nextHeaders).length ? nextHeaders : null;
 webhooksChanged = true;
 }
 const hasAuthHeader = !!(authHeader || storedSecrets[nextHook.id]?.Authorization || nativeAuthHeader || webhookStoredNatively);
 if (!!nextHook.hasAuthHeader !== hasAuthHeader) {
 nextHook.hasAuthHeader = hasAuthHeader;
 webhooksChanged = true;
 }
 hooks.push(nextHook);
 }

 const validHookIds = new Set(hooks.map(h => h.id).filter(Boolean));
 for (const hookId of Object.keys(storedSecrets)) {
 if (!validHookIds.has(hookId)) {
 delete storedSecrets[hookId];
 webhookSecretsChanged = true;
 }
 }

 if (webhooksChanged) nextLocal.webhooks = hooks;
 if (webhookSecretsChanged) nextSession.webhookSecrets = storedSecrets;
 if (Object.values(storedSecrets).some(secret => secret?.Authorization)) nativeSecretFallbackUsed = true;
 nextLocal[SECURE_STORAGE_WARNING_KEY] = nativeSecretFallbackUsed
 ? {
 active: true,
 level: 'warn',
 message: 'Native secret encryption is unavailable. Notification secrets are held only in session fallback storage.',
 updatedAt: Date.now(),
 }
 : { active: false, updatedAt: Date.now() };

 if (Object.keys(nextSession).length) await storeSessionSet(nextSession);
 nextLocal[SENSITIVE_CONFIG_MIGRATED_KEY] = true;
 if (Object.keys(nextLocal).length) await storeLocalSet(nextLocal);
 })();
 try {
 return await sensitiveConfigMigrationPromise;
 } finally {
 sensitiveConfigMigrationPromise = null;
 }
}

async function getStoredTelegramConfig() {
 await migrateSensitiveConfig();
 const [localData, sessionData, nativeSecret] = await Promise.all([
 storeLocalGet('telegram'),
 storeSessionGet('telegramSecret'),
 readNativeSecret('telegram'),
 ]);
 return sanitizeTelegramConfig({
 ...(localData.telegram || {}),
 ...(sessionData.telegramSecret || {}),
 ...(nativeSecret || {}),
 });
}

async function getStoredWebhooks() {
 await migrateSensitiveConfig();
 const [localData, sessionData] = await Promise.all([
 storeLocalGet('webhooks'),
 storeSessionGet('webhookSecrets'),
 ]);
 const secretMap = sessionData.webhookSecrets || {};
 const hooks = [];
 for (const hook of (localData.webhooks || [])) {
 const nativeSecret = await readNativeSecret(webhookSecretName(hook?.id));
 const nativeMap = nativeSecret?.Authorization ? { [hook.id]: { Authorization: nativeSecret.Authorization } } : {};
 hooks.push(sanitizeWebhookRecord(mergeWebhookSecrets(hook, { ...secretMap, ...nativeMap })));
 }
 return hooks;
}

function isTrustedRuntimeSender(sender) {
 if (!sender) return false;
 if (globalThis.fwdDesktopNative?.sendNativeMessage && sender.desktopTrusted !== true) return false;
 if (sender.id && sender.id !== chrome.runtime.id) return false;
 const extOrigin = `chrome-extension://${chrome.runtime.id}`;
 if (sender.origin && sender.origin !== extOrigin) return false;
 if (sender.url && !sender.url.startsWith(`${extOrigin}/`)) return false;
 return true;
}

function isPrivateIpv4(host) {
 if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
 const parts = host.split('.').map(n => Number(n));
 if (parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
 return (
 parts[0] === 10 ||
 parts[0] === 127 ||
 (parts[0] === 169 && parts[1] === 254) ||
 (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
 (parts[0] === 192 && parts[1] === 168)
 );
}

function isBlockedWebhookHost(hostname) {
 const host = String(hostname || '').trim().toLowerCase();
 if (!host) return true;
 if (host === 'localhost' || host === 'local' || host.endsWith('.localhost')) return true;
 if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
 if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
 return isPrivateIpv4(host);
}

function validateWebhookTarget(rawUrl) {
 try {
 const url = new URL(String(rawUrl || '').trim());
 if (url.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS');
 if (url.username || url.password) throw new Error('Webhook URL must not include credentials');
 if (isBlockedWebhookHost(url.hostname)) throw new Error('Webhook host is not allowed');
 return { ok: true, url: url.toString(), host: url.hostname };
 } catch (e) {
 return { ok: false, error: e?.message || 'Invalid webhook URL' };
 }
}

function isDeltaExchangeHost(hostname) {
 const host = String(hostname || '').trim().toLowerCase();
 return [
 'api.delta.exchange',
 'api.india.delta.exchange',
 'www.delta.exchange',
 'india.delta.exchange',
 'delta.exchange',
 ].includes(host);
}

function getWebhookOriginPattern(rawUrl) {
 const url = new URL(String(rawUrl || '').trim());
 return `${url.protocol}//${url.host}/*`;
}

function hasOriginPermission(originPattern) {
 return new Promise(resolve => {
 try {
 chrome.permissions.contains({ origins: [originPattern] }, granted => resolve(!!granted));
 } catch (_) {
 resolve(false);
 }
 });
}

async function ensureWebhookTargetPermission(rawUrl) {
 const target = validateWebhookTarget(rawUrl);
 if (!target.ok) return target;
 if (isDeltaExchangeHost(target.host)) return { ...target, optional: false };
 const originPattern = getWebhookOriginPattern(target.url);
 const granted = await hasOriginPermission(originPattern);
 if (!granted) {
 return {
 ok: false,
 error: `Permission not granted for webhook host ${target.host}`,
 host: target.host,
 originPattern,
 };
 }
 return { ...target, originPattern, optional: true };
}

const WEBHOOK_FORMATS = new Set(['json', 'discord', 'slack']);
const WEBHOOK_EVENTS = new Set(['signal_alert', 'scan_complete', 'funding_extreme', 'test']);

function sanitizeWebhookId(value = '') {
 const raw = String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
 return raw || `wh_${Date.now().toString(36)}`;
}

function sanitizeWebhookHeaders(headers = {}) {
 const next = {};
 Object.entries(headers || {}).forEach(([rawName, rawValue]) => {
 const name = String(rawName || '').trim();
 const value = String(rawValue || '').trim();
 if (!name || !value) return;
 if (!/^[A-Za-z0-9-]{1,40}$/.test(name)) return;
 next[name] = value.slice(0, 500);
 });
 return Object.keys(next).length ? next : null;
}

function sanitizeWebhookRecord(hook = {}) {
 const format = String(hook?.format || '').trim().toLowerCase();
 const events = Array.from(new Set(
 (Array.isArray(hook?.events) ? hook.events : [])
 .map(event => String(event || '').trim().toLowerCase())
 .filter(event => WEBHOOK_EVENTS.has(event))
 ));
 const lastFired = Number(hook?.lastFired);
 const cooldownUntil = Number(hook?.cooldownUntil);
 const consecutiveFailures = Number(hook?.consecutiveFailures);
 return {
 ...hook,
 id: sanitizeWebhookId(hook?.id),
 name: String(hook?.name || 'Webhook').replace(/\s+/g, ' ').trim().slice(0, 48) || 'Webhook',
 url: String(hook?.url || '').trim(),
 format: WEBHOOK_FORMATS.has(format) ? format : 'json',
 events,
 headers: sanitizeWebhookHeaders(hook?.headers || {}),
 enabled: hook?.enabled !== false,
 lastStatus: ['ok', 'error'].includes(String(hook?.lastStatus || '').toLowerCase())
 ? String(hook.lastStatus).toLowerCase()
 : null,
 lastFired: Number.isFinite(lastFired) && lastFired > 0 ? Math.round(lastFired) : null,
 cooldownUntil: Number.isFinite(cooldownUntil) && cooldownUntil > 0 ? Math.round(cooldownUntil) : 0,
 consecutiveFailures: Number.isFinite(consecutiveFailures)
 ? Math.max(0, Math.min(99, Math.round(consecutiveFailures)))
 : 0,
 lastError: redactForLog(String(hook?.lastError || '')).slice(0, 160),
 hasAuthHeader: !!hook?.hasAuthHeader,
 };
}

function formatWebhookPauseMessage(untilTs) {
 return `Paused until ${new Date(untilTs).toISOString()}`;
}

async function readStoredWebhook(hookId) {
 if (!hookId) return null;
 const hooks = await getStoredWebhooks();
 return hooks.find(h => h.id === hookId) || null;
}

async function mutateStoredWebhook(hookId, updater) {
 if (!hookId) return null;
 return new Promise(resolve => {
 chrome.storage.local.get('webhooks', d => {
 const hooks = d.webhooks || [];
 const idx = hooks.findIndex(h => h.id === hookId);
 if (idx < 0) {
 resolve(null);
 return;
 }
 const nextHook = updater({ ...hooks[idx] });
 if (!nextHook) {
 resolve(hooks[idx]);
 return;
 }
 hooks[idx] = sanitizeWebhookRecord(nextHook);
 chrome.storage.local.set({ webhooks: hooks }, () => resolve(nextHook));
 });
 });
}

async function markWebhookSuccess(hookId, ts) {
 return mutateStoredWebhook(hookId, hook => ({
 ...hook,
 lastStatus: 'ok',
 lastFired: ts,
 lastError: null,
 consecutiveFailures: 0,
 cooldownUntil: 0,
 }));
}

async function markWebhookFailure(hookId, hookName, ts, errorMessage) {
 let cooldownTriggered = false;
 let cooldownUntil = 0;
 const nextHook = await mutateStoredWebhook(hookId, hook => {
 const currentCooldown = Number(hook.cooldownUntil || 0);
 const isCoolingDown = currentCooldown > ts;
 const failures = isCoolingDown ? Number(hook.consecutiveFailures || 0) : Number(hook.consecutiveFailures || 0) + 1;
 cooldownUntil = currentCooldown;
 if (!isCoolingDown && failures >= WEBHOOK_FAILURE_THRESHOLD) {
 cooldownUntil = ts + WEBHOOK_COOLDOWN_MS;
 cooldownTriggered = true;
 }
 return {
 ...hook,
 lastStatus: 'error',
 lastFired: ts,
 lastError: cooldownUntil > ts ? formatWebhookPauseMessage(cooldownUntil) : errorMessage,
 consecutiveFailures: cooldownUntil > ts ? 0 : failures,
 cooldownUntil,
 };
 });

 if (cooldownTriggered && nextHook?.name) {
 chrome.notifications.create(`webhook_pause_${hookId}_${ts}`, {
 type: 'basic',
 iconUrl: 'icons/icon48.png',
 title: 'Webhook paused after repeated failures',
 message: `${nextHook.name} is paused for 15 minutes.`,
 priority: 1,
 });
 dlog(`Link Webhook "${nextHook.name}" paused for 15m after repeated failures`);
 }

 return { hook: nextHook, cooldownTriggered, cooldownUntil };
}

function wait(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
}

function setAutoScanSchedule(enable, interval, done = () => {}) {
 const safeInterval = sanitizeAutoScanInterval(interval);
 chrome.alarms.clear('autoScan', () => {
 if (enable) {
 chrome.alarms.create('autoScan', { periodInMinutes: safeInterval });
 }
 chrome.storage.local.set({ autoScan: !!enable, autoScanInterval: safeInterval }, () => {
 done({ enabled: !!enable, interval: safeInterval });
 });
 });
}

const CUSTOM_ALERT_ALARM_NAME = 'customAlertsPoll';
const CUSTOM_ALERT_ALARM_INTERVAL_MINUTES = 1;
const AUTO_TRADE_MONITOR_ALARM_NAME = 'autoTradeMonitor';
const AUTO_TRADE_MONITOR_INTERVAL_MINUTES = 1;
const DCA_BOT_MONITOR_ALARM_NAME = 'dcaBotMonitor';
const DCA_BOT_MONITOR_INTERVAL_MINUTES = 1;
const OPTIONS_STRADDLE_MONITOR_ALARM = 'optionsStraddleMonitor';
const OPTIONS_STRADDLE_MONITOR_INTERVAL_MINUTES = 1;

function syncCustomAlertPollingAlarm(done = () => {}) {
 chrome.storage.local.get(['customAlerts'], data => {
 const alerts = Array.isArray(data?.customAlerts) ? data.customAlerts : [];
 const hasEnabledAlerts = alerts.some(alert => alert?.enabled);
 chrome.alarms.clear(CUSTOM_ALERT_ALARM_NAME, () => {
 if (hasEnabledAlerts) {
 chrome.alarms.create(CUSTOM_ALERT_ALARM_NAME, { periodInMinutes: CUSTOM_ALERT_ALARM_INTERVAL_MINUTES });
 }
 done({ enabled: hasEnabledAlerts, interval: CUSTOM_ALERT_ALARM_INTERVAL_MINUTES });
 });
 });
}

function syncAutoTradeMonitorAlarm(done = () => {}) {
 chrome.storage.local.get(['autoTrade', 'autoTradeLog', 'autoTradeSettings'], data => {
 const activeEntries = Array.isArray(data?.autoTradeLog)
 ? data.autoTradeLog.filter(entry => {
 const status = String(entry?.status || '').toLowerCase();
 return !['closed', 'cancelled', 'failed'].includes(status)
 && Number(entry?.ts || 0) > Date.now() - (3 * 24 * 60 * 60 * 1000);
 })
 : [];
 const shouldRun = !!data?.autoTrade || activeEntries.length > 0;
 chrome.alarms.clear(AUTO_TRADE_MONITOR_ALARM_NAME, () => {
 if (shouldRun) {
 chrome.alarms.create(AUTO_TRADE_MONITOR_ALARM_NAME, { periodInMinutes: AUTO_TRADE_MONITOR_INTERVAL_MINUTES });
 }
 done({ enabled: shouldRun, interval: AUTO_TRADE_MONITOR_INTERVAL_MINUTES });
 });
 });
}

function syncDcaBotMonitorAlarm(done = () => {}) {
 chrome.storage.local.get(['dcaBotSettings', 'dcaBotState'], data => {
 const sanitize = typeof sanitizeDcaBotSettings === 'function'
 ? sanitizeDcaBotSettings
 : globalThis.FWDTradeDeskShared?.sanitizeDcaBotSettings;
 const cfg = typeof sanitize === 'function'
 ? sanitize(data?.dcaBotSettings || {})
 : (data?.dcaBotSettings || {});
 const hasOpenCycle = Number(data?.dcaBotState?.orderCount || 0) > 0
 && Number(data?.dcaBotState?.updatedAt || 0) > Date.now() - (7 * 24 * 60 * 60 * 1000);
 const shouldRun = !!cfg.enabled || hasOpenCycle;
 chrome.alarms.clear(DCA_BOT_MONITOR_ALARM_NAME, () => {
 if (shouldRun) {
 chrome.alarms.create(DCA_BOT_MONITOR_ALARM_NAME, { periodInMinutes: DCA_BOT_MONITOR_INTERVAL_MINUTES });
 }
 done({ enabled: shouldRun, interval: DCA_BOT_MONITOR_INTERVAL_MINUTES });
 });
 });
}

function syncOptionsStraddleMonitorAlarm(done = () => {}) {
 chrome.storage.local.get(['optionsAutoTradeSettings', 'optionsStraddleLog'], data => {
 const cfg = (typeof sanitizeOptionsAutoTradeSettings === 'function' ? sanitizeOptionsAutoTradeSettings : globalThis.FWDTradeDeskOptions?.sanitizeOptionsAutoTradeSettings)?.(data?.optionsAutoTradeSettings || {}) || {};
 const activeEntries = Array.isArray(data?.optionsStraddleLog)
 ? data.optionsStraddleLog.filter(entry => {
 const status = String(entry?.status || '').toLowerCase();
 return ['active', 'partial_stop'].includes(status)
 && Number(entry?.ts || 0) > Date.now() - (3 * 24 * 60 * 60 * 1000);
 })
 : [];
 const shouldRun = !!cfg.straddleEnabled || activeEntries.length > 0;
 chrome.alarms.clear(OPTIONS_STRADDLE_MONITOR_ALARM, () => {
 if (shouldRun) {
 chrome.alarms.create(OPTIONS_STRADDLE_MONITOR_ALARM, { periodInMinutes: OPTIONS_STRADDLE_MONITOR_INTERVAL_MINUTES });
 }
 done({ enabled: shouldRun, interval: OPTIONS_STRADDLE_MONITOR_INTERVAL_MINUTES });
 });
 });
}

const TELEGRAM_SUMMARY_ALARM = 'telegramHourlySummary';
const TELEGRAM_SUMMARY_INTERVAL_MINUTES = 60;

// SEC-06: Use getStoredTelegramConfig() which merges native + session + local sources,
// so the alarm still works after sensitive config migration removes plaintext tokens.
function syncTelegramSummaryAlarm(done = () => {}) {
 getStoredTelegramConfig().then(tg => {
 const shouldRun = !!tg.hourlySummaryEnabled && !!(tg.botToken || '').trim() && !!(tg.chatId || '').trim();
 chrome.alarms.clear(TELEGRAM_SUMMARY_ALARM, () => {
 if (shouldRun) {
 chrome.alarms.create(TELEGRAM_SUMMARY_ALARM, { periodInMinutes: TELEGRAM_SUMMARY_INTERVAL_MINUTES });
 }
 done({ enabled: shouldRun });
 });
 }).catch(() => {
 done({ enabled: false });
 });
}
async function sendTelegramHourlySummary() {
 const telegramCfg = await getStoredTelegramConfig();
 // Hourly summary works independently - only needs botToken, chatId, and hourlySummaryEnabled
 if (!telegramCfg?.botToken || !telegramCfg.chatId || !telegramCfg.hourlySummaryEnabled) return;
 const snapshot = await storeLocalGet(['v16LiveSnapshot', 'autoTradeLog', 'optionsStraddleLog']);
 let liveData = snapshot?.v16LiveSnapshot || {};
 let positions = Array.isArray(liveData.marginedPositions || liveData.positions)
 ? (liveData.marginedPositions || liveData.positions)
 : [];
 const straddleLog = Array.isArray(snapshot?.optionsStraddleLog) ? snapshot.optionsStraddleLog : [];
 const activeStraddles = straddleLog.filter(e => ['active', 'partial_stop'].includes(String(e?.status || '').toLowerCase()));
 if (!positions.length && typeof runV16PrivateAccountSnapshot === 'function') {
 try {
 liveData = await runV16PrivateAccountSnapshot('', { force: true });
 positions = Array.isArray(liveData?.marginedPositions || liveData?.positions)
 ? (liveData.marginedPositions || liveData.positions)
 : [];
 } catch (error) {
 dlog(`Telegram summary snapshot refresh failed: ${error?.message || error}`);
 }
 }
 if (!positions.length && !activeStraddles.length) return;
 let totalUpnl = 0;
 const lines = [];
 for (const pos of positions) {
 const sym = String(pos.product_symbol || pos.symbol || '');
 const side = Number(pos.size || 0) < 0 ? 'SHORT' : 'LONG';
 const upnl = Number(pos.unrealized_pnl || pos.pnl || 0);
 const entry = Number(pos.entry_price || 0);
 const mark = Number(pos.mark_price || 0);
 totalUpnl += upnl;
 lines.push(`${sym} ${side} | E:$${entry.toFixed(2)} M:$${mark.toFixed(2)} | PnL:${upnl >= 0 ? '+' : ''}$${upnl.toFixed(4)}`);
 }
 // Straddle log summary
 for (const se of activeStraddles) {
 const leg = se.straddleLeg;
 if (!leg) continue;
 const pnl = Number(se.totalPnl || 0);
 totalUpnl += pnl;
 lines.push(`${leg.symbol} SHORT(straddle) | E:$${Number(leg.entryPrice || 0).toFixed(2)} M:$${Number(leg.currentPrice || 0).toFixed(2)} | PnL:${pnl >= 0 ? '+' : ''}$${pnl.toFixed(4)}`);
 }
 const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
 const text = [
 `Chart *Hourly Position Summary* - ${time}`,
 `*${positions.length + activeStraddles.length} positions open*`,
 `*Running P&L:* ${totalUpnl >= 0 ? '+' : ''}$${totalUpnl.toFixed(4)}`,
 '',
 ...lines,
 ].join('\n');
 const url = `https://api.telegram.org/bot${encodeURIComponent(telegramCfg.botToken)}/sendMessage`;
 const response = await fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ chat_id: telegramCfg.chatId, text, parse_mode: 'Markdown' }),
 });
 if (!response?.ok) {
 const bodyText = await response.text().catch(() => '');
 throw new Error(`Telegram summary request failed (${response?.status || 'unknown'}): ${bodyText || 'no response body'}`);
 }
 return true;
}

async function saveAlertsWithLimit(alerts) {
 while (alerts.length > ALERT_STORAGE_LIMIT) alerts.pop();
 try {
 await chrome.storage.local.set({ alertHistory: alerts });
 return;
 } catch (e) {
 dlog(`Alerts save retry: ${e.message}`);
 }

 // Quota fallback: compact oldest entries, then trim further.
 const compactFrom = Math.floor(alerts.length * 0.35);
 for (let i = compactFrom; i < alerts.length; i++) {
 const a = alerts[i];
 const compactLevels = levels =>
 Array.isArray(levels)
 ? levels.slice(0, 2).map(l => ({
 price: l?.price,
 touches: l?.touches || 0,
 strengthPct: l?.strengthPct || 0,
 tf: l?.tf || '',
 }))
 : [];
 const compactKeyLevels = a.keyLevels ? {
 config: a.keyLevels?.config || null,
 resistance: compactLevels(a.keyLevels.resistance),
 support: compactLevels(a.keyLevels.support),
 byTimeframe: {
 '1D': {
 resistance: compactLevels(a.keyLevels?.byTimeframe?.['1D']?.resistance),
 support: compactLevels(a.keyLevels?.byTimeframe?.['1D']?.support),
 },
 '15m': {
 resistance: compactLevels(a.keyLevels?.byTimeframe?.['15m']?.resistance),
 support: compactLevels(a.keyLevels?.byTimeframe?.['15m']?.support),
 },
 },
 } : null;
 alerts[i] = {
 symbol: a.symbol,
 direction: a.direction,
 score: a.score,
 alertTier: a.alertTier,
 ts: a.ts,
 entry: a.entry,
 sl: a.sl,
 tp1: a.tp1,
 rr: a.rr,
 alertKey: a.alertKey,
 sector: a.sector,
 reasons: Array.isArray(a.reasons) ? a.reasons.slice(0, 2) : [],
 keyLevels: compactKeyLevels,
 };
 }
 while (alerts.length > 1200) alerts.pop();
 await chrome.storage.local.set({ alertHistory: alerts });
}

// ================================================================
// BUG FIX #1 - FUNDING RATE SMART PARSING
// Delta India returns funding already as percentage (0.0426 = 0.0426%)
// Delta Global returns decimal (0.000426 = 0.0426%)
// Old code always did * 100, causing 100x inflation on India API
// ================================================================
