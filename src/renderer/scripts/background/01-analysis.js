function parseFundingRate(raw) {
 if (!raw) return 0;
 const f = +raw;
 if (!isFinite(f) || f === 0) return 0;
 // Safety net: if |f| > 0.5, it's clearly already a percentage regardless of region
 if (Math.abs(f) > 0.5) return +f.toFixed(4);
 // Region-aware: India API returns %, Global API returns decimal
 return detectedRegion === 'india'
 ? +f.toFixed(4) // India: use as-is (already %)
 : +(f * 100).toFixed(4); // Global: convert decimal -> %
}

function parseExchangeTimestampMs(raw) {
 const n = Number(raw || 0);
 if (!Number.isFinite(n) || n <= 0) return 0;
 if (n > 1e15) return Math.round(n / 1000); // microseconds
 if (n > 1e12) return Math.round(n); // milliseconds
 return Math.round(n * 1000); // seconds
}

function parseFundingIntervalSeconds(raw, fallback = 28800) {
 const n = Number(raw || 0);
 if (!Number.isFinite(n) || n <= 0) return fallback;
 return Math.round(n);
}

function applyTradeSlippage(price, side, phase = 'entry', extraSlippagePct = 0) {
 const p = Number(price || 0);
 if (!Number.isFinite(p) || p <= 0) return 0;
 const slip = Math.max(0, Number(SLIPPAGE_PCT_PER_SIDE || 0) + Math.max(0, Number(extraSlippagePct || 0))) / 100;
 const isShort = String(side || '').toLowerCase().includes('short');
 if (phase === 'entry') return +(p * (isShort ? (1 - slip) : (1 + slip))).toFixed(6);
 return +(p * (isShort ? (1 + slip) : (1 - slip))).toFixed(6);
}

function buildExecutionRiskProfile(signal = {}) {
 const price = Math.max(0, Number(signal?.price || signal?.entry || signal?.ticker?.price || 0));
 const volume24h = Math.max(0, Number(signal?.volume24h || signal?.ticker?.usdVol24h || signal?.ticker?.volume24h || 0));
 const oi = Math.max(0, Number(signal?.oi || signal?.ticker?.oi || 0));
 const atr = Math.max(0, Number(signal?.daily?.atr || signal?.lower?.atr || 0));
 const atrPct = price > 0 && atr > 0 ? (atr / price) * 100 : 0;
 let estimatedSpreadPct = volume24h >= 25_000_000
 ? 0.03
 : volume24h >= 10_000_000
 ? 0.05
 : volume24h >= 3_000_000
 ? 0.08
 : volume24h >= 1_500_000
 ? 0.12
 : volume24h >= 750_000
 ? 0.18
 : volume24h >= 250_000
 ? 0.28
 : 0.42;
 if (price > 0 && price < 1) estimatedSpreadPct += 0.03;
 if (price > 0 && price < 0.1) estimatedSpreadPct += 0.04;
 if (oi > 0 && oi < 500_000) estimatedSpreadPct += 0.03;
 if (atrPct >= 8) estimatedSpreadPct += 0.08;
 else if (atrPct >= 4) estimatedSpreadPct += 0.04;
 const tier = estimatedSpreadPct >= 0.30
 ? 'elevated'
 : estimatedSpreadPct >= 0.15
 ? 'medium'
 : 'tight';
 const liquidityTier = volume24h >= 10_000_000
 ? 'deep'
 : volume24h >= 1_500_000
 ? 'liquid'
 : volume24h >= 750_000
 ? 'adequate'
 : 'thin';
 return {
 estimatedSpreadPct: +estimatedSpreadPct.toFixed(2),
 extraSlippagePct: +(estimatedSpreadPct * 0.65).toFixed(2),
 tier,
 liquidityTier,
 atrPct: +atrPct.toFixed(2),
 };
}

function calcTradeFee(notional) {
 const n = Math.abs(Number(notional || 0));
 return +(n * (EFFECTIVE_FEE_PCT_PER_SIDE / 100)).toFixed(6);
}

function calcFundingCash(notional, fundingRatePct, side) {
 const n = Math.abs(Number(notional || 0));
 const fr = Number(fundingRatePct || 0);
 if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(fr) || fr === 0) return 0;
 return +(n * (fr / 100) * (String(side || '').includes('short') ? 1 : -1)).toFixed(6);
}

function buildPersistentCandleSymbolKey(symbol, instrument = null) {
 const safeSymbol = String(symbol || '').trim().toUpperCase();
 const exchangeSegment = String(instrument?.exchangeSegment || '').trim().toUpperCase();
 const securityId = String(instrument?.securityId || '').trim();
 return exchangeSegment && securityId ? `${exchangeSegment}_${securityId}_${safeSymbol}` : safeSymbol;
}

function buildPersistentCandleMemoryKey(symbol, resolution, instrument = null) {
 return `candles_raw_${buildPersistentCandleSymbolKey(symbol, instrument)}_${String(resolution || '').trim().toLowerCase()}`;
}

function normalizeCandleTimeSec(value = 0) {
 const raw = Number(value || 0);
 if (!Number.isFinite(raw) || raw <= 0) return 0;
 if (raw > 1e15) return Math.floor(raw / 1000000);
 if (raw > 1000000000000) return Math.floor(raw / 1000);
 return Math.floor(raw);
}

function normalizeCandleRowsForScanner(rows = []) {
 return (Array.isArray(rows) ? rows : [])
 .map(row => ({
 ...row,
 time: normalizeCandleTimeSec(row?.time ?? row?.t ?? row?.timestamp ?? 0),
 }))
 .filter(row => row.time > 0);
}

function mergeCachedCandleRows(existing = [], incoming = []) {
 const merged = new Map();
 normalizeCandleRowsForScanner(existing).forEach(row => {
 const ts = normalizeCandleTimeSec(row?.time || 0);
 if (ts > 0) merged.set(ts, row);
 });
 normalizeCandleRowsForScanner(incoming).forEach(row => {
 const ts = normalizeCandleTimeSec(row?.time || 0);
 if (ts > 0) merged.set(ts, row);
 });
 return Array.from(merged.values()).sort((a, b) => Number(a?.time || 0) - Number(b?.time || 0));
}

function trimPersistentCandleRows(rows = [], resolution = '') {
 const safeRows = normalizeCandleRowsForScanner(rows);
 return safeRows;
}

function candleCacheRefreshMs(resolution = '', options = {}) {
 const periodSec = resolveCandleResolutionSec(resolution);
 if (!(periodSec > 0)) return 5 * 60 * 1000;
 if (options.closedOnly && String(resolution || '').trim().toLowerCase() === '1d') {
  return 12 * 60 * 60 * 1000;
 }
 return Math.max(60 * 1000, Math.min(periodSec * 1000, 6 * 60 * 60 * 1000));
}

function extractDhanRetryAfterMs(message = '') {
 const text = String(message || '');
 const match = text.match(/retry\s+in\s+(\d+)\s*seconds/i);
 if (match) return Math.max(0, Number(match[1] || 0) * 1000);
 return /rate.?limit|cooling down/i.test(text) ? 60000 : 0;
}

function waitForSharedDhanCandleCooldown(waitMs = 0) {
 const safeWaitMs = Math.max(0, Math.min(90000, Number(waitMs || 0)));
 if (!(safeWaitMs > 0)) return Promise.resolve();
 const until = Date.now() + safeWaitMs;
 const active = globalThis.dhanCandleCooldownWait || null;
 if (active && Number(active.until || 0) >= until - 1000 && active.promise) return active.promise;
 const promise = new Promise(resolve => setTimeout(resolve, safeWaitMs + 750));
 globalThis.dhanCandleCooldownWait = { until, promise };
 return promise.finally(() => {
  if (globalThis.dhanCandleCooldownWait?.promise === promise) globalThis.dhanCandleCooldownWait = null;
 });
}

function filterCandlesByRequestedRange(rows = [], startSec = 0, endSec = 0, resolution = '') {
 const periodSec = resolveCandleResolutionSec(resolution);
 return (Array.isArray(rows) ? rows : []).filter(row => {
 const ts = normalizeCandleTimeSec(row?.time || 0);
 return ts > 0 && ts >= startSec && ts <= (endSec + Math.max(0, periodSec));
 });
}

function doesCandleCacheCoverRange(rows = [], startSec = 0, endSec = 0, resolution = '') {
 const safeRows = Array.isArray(rows) ? rows : [];
 if (!safeRows.length) return false;
 const firstTs = normalizeCandleTimeSec(safeRows[0]?.time || 0);
 const lastTs = normalizeCandleTimeSec(safeRows[safeRows.length - 1]?.time || 0);
 const periodSec = resolveCandleResolutionSec(resolution);
 return firstTs > 0 && lastTs > 0 && firstTs <= startSec && (lastTs + Math.max(0, periodSec)) >= endSec;
}

async function loadPersistentCandleCacheRecord(symbol, resolution, instrument = null) {
 const cacheSymbol = buildPersistentCandleSymbolKey(symbol, instrument);
 const memoryKey = buildPersistentCandleMemoryKey(symbol, resolution, instrument);
 const memoryRows = cached(memoryKey);
 if (Array.isArray(memoryRows) && memoryRows.length) {
 return { rows: normalizeCandleRowsForScanner(memoryRows), updatedAt: Date.now(), memoryKey, fromMemory: true };
 }
 if (typeof v17ReadPersistentCandleCache !== 'function') {
 return { rows: [], updatedAt: 0, memoryKey, fromMemory: false };
 }
 const record = await v17ReadPersistentCandleCache(cacheSymbol, resolution);
 const rows = normalizeCandleRowsForScanner(Array.isArray(record?.rows) ? record.rows : []);
 if (rows.length) setCache(memoryKey, rows);
 return {
 rows,
 updatedAt: Number(record?.updatedAt || 0),
 memoryKey,
 fromMemory: false,
 };
}

async function persistPersistentCandleCacheRecord(symbol, resolution, rows = [], instrument = null) {
 const trimmedRows = trimPersistentCandleRows(rows, resolution);
 const cacheSymbol = buildPersistentCandleSymbolKey(symbol, instrument);
 const memoryKey = buildPersistentCandleMemoryKey(symbol, resolution, instrument);
 setCache(memoryKey, trimmedRows);
 if (typeof v17WritePersistentCandleCache === 'function') {
 await v17WritePersistentCandleCache(cacheSymbol, resolution, {
  rows: trimmedRows,
  updatedAt: Date.now(),
  });
 }
 return trimmedRows;
}

async function fetchCandlesRange(symbol, resolution, startSec, endSec, options = {}) {
 const safeSymbol = String(symbol || '').trim().toUpperCase();
 const safeResolution = String(resolution || '').trim();
 const forceRefresh = options?.force === true;
 const nowSec = Math.floor(Date.now() / 1000);
 const refreshMs = candleCacheRefreshMs(safeResolution);
 const persisted = await loadPersistentCandleCacheRecord(safeSymbol, safeResolution);
 const cachedRows = Array.isArray(persisted.rows) ? persisted.rows : [];
 const cachedRange = filterCandlesByRequestedRange(cachedRows, startSec, endSec, safeResolution);
 const rangeCovered = doesCandleCacheCoverRange(cachedRows, startSec, endSec, safeResolution);
 const touchesRecentData = endSec >= (nowSec - Math.max(resolveCandleResolutionSec(safeResolution), 60));
 const cacheFresh = persisted.fromMemory || ((Date.now() - Number(persisted.updatedAt || 0)) < refreshMs);
 if (!forceRefresh && cachedRange.length && rangeCovered && (!touchesRecentData || cacheFresh)) {
  globalThis.dhanCandleFetchStats = {
   ...(globalThis.dhanCandleFetchStats || {}),
   cacheHits: Number(globalThis.dhanCandleFetchStats?.cacheHits || 0) + 1,
  };
  return cachedRange;
 }
 if (typeof globalThis.dhanFetchCandlesForRenderer === 'function') {
 try {
   const fetchedRows = await globalThis.dhanFetchCandlesForRenderer(safeSymbol, safeResolution, startSec, endSec, {
    force: forceRefresh,
   });
   if (fetchedRows?.length) {
    globalThis.dhanCandleFetchStats = {
     ...(globalThis.dhanCandleFetchStats || {}),
     apiFetches: Number(globalThis.dhanCandleFetchStats?.apiFetches || 0) + 1,
     apiRows: Number(globalThis.dhanCandleFetchStats?.apiRows || 0) + fetchedRows.length,
    };
    const mergedRows = await persistPersistentCandleCacheRecord(
    safeSymbol,
    safeResolution,
    mergeCachedCandleRows(cachedRows, fetchedRows)
   );
   return filterCandlesByRequestedRange(mergedRows, startSec, endSec, safeResolution);
  }
 } catch (e) {
  dlog(`Candle range error ${safeSymbol}: ${e.message}`);
 }
 }
 return cachedRange;
}

async function fetchHistoricalFundingSeries(symbol, startSec, endSec) {
 const fundingSymbol = `FUNDING:${String(symbol || '').toUpperCase().trim()}`;
 if (!fundingSymbol || endSec <= startSec) return [];
 const stepSec = 30 * 24 * 60 * 60;
 const out = [];
 const seen = new Set();
 for (let cursor = startSec; cursor < endSec; cursor += stepSec) {
 const chunkEnd = Math.min(endSec, cursor + stepSec);
 const rows = await fetchCandlesRange(fundingSymbol, '1h', cursor, chunkEnd);
 for (const row of rows) {
 if (!row?.time || seen.has(row.time)) continue;
 seen.add(row.time);
 out.push({ time: row.time, rate: Number(row.close || 0) });
 }
 }
 return out.sort((a, b) => a.time - b.time);
}

function fundingRateAt(series, tsSec) {
 if (!Array.isArray(series) || !series.length || !Number.isFinite(tsSec)) return 0;
 let lo = 0, hi = series.length - 1, idx = -1;
 while (lo <= hi) {
 const mid = Math.floor((lo + hi) / 2);
 if (Number(series[mid]?.time || 0) <= tsSec) {
 idx = mid;
 lo = mid + 1;
 } else {
 hi = mid - 1;
 }
 }
 return idx >= 0 ? Number(series[idx]?.rate || 0) : 0;
}

function calcFundingBetween(entryTsSec, exitTsSec, side, notional, fundingSeries) {
 if (!Number.isFinite(entryTsSec) || !Number.isFinite(exitTsSec) || exitTsSec <= entryTsSec) {
 return { fundingPnl: 0, fundingEvents: 0 };
 }
 let nextFundingTs = Math.floor(entryTsSec / FUNDING_INTERVAL_SEC) * FUNDING_INTERVAL_SEC;
 if (nextFundingTs <= entryTsSec) nextFundingTs += FUNDING_INTERVAL_SEC;
 let fundingPnl = 0;
 let fundingEvents = 0;
 while (nextFundingTs <= exitTsSec) {
 const fr = fundingRateAt(fundingSeries, nextFundingTs);
 fundingPnl += calcFundingCash(notional, fr, side);
 fundingEvents++;
 nextFundingTs += FUNDING_INTERVAL_SEC;
 }
 return { fundingPnl: +fundingPnl.toFixed(6), fundingEvents };
}

// ================================================================
// INDUSTRY / SECTOR CLASSIFICATION
// ================================================================
const {
 classifySetupFamily,
 getRegimeThresholds,
 normalizeBaseSymbol,
 isStockToken,
 getSector,
 classifyDeltaInstrument,
 describeDeltaInstrument,
 sanitizeMarketRegime,
 sanitizeKeyLevelSettings: analysisSanitizeKeyLevelSettings,
 resolveRiskTemplateForSymbol: analysisResolveRiskTemplateForSymbol,
} = globalThis.FWDTradeDeskShared;

function getMarketSession() {
 const h = new Date().getUTCHours();
 if (h >= 0 && h < 8) return 'asia'; // 00-08 UTC
 if (h >= 8 && h < 13) return 'london'; // 08-13 UTC
 if (h >= 13 && h < 22) return 'newyork'; // 13-22 UTC
 return 'late_us'; // 22-24 UTC
}

// Session volatility weights - some sessions historically more volatile
const SESSION_BOOST = { newyork: 1.05, london: 1.03, asia: 1.0, late_us: 0.97 };

// ================================================================
// TECHNICAL INDICATORS
// ================================================================

function ema(arr, period) {
 const p = arr.filter(x => x != null && isFinite(x));
 if (p.length < period) return null;
 const k = 2 / (period + 1);
 let v = 0;
 for (let i = 0; i < period; i++) v += p[i];
 v /= period;
 for (let i = period; i < p.length; i++) v = p[i] * k + v * (1 - k);
 return v;
}

function sma(arr, period) {
 const p = arr.filter(x => x != null && isFinite(x));
 if (p.length < period) return null;
 const s = p.slice(-period);
 return s.reduce((a, b) => a + b, 0) / s.length;
}

function emaSeries(arr, period) {
 if (arr.length < period) return [];
 const k = 2 / (period + 1);
 const out = [];
 let v = 0;
 for (let i = 0; i < period; i++) v += arr[i];
 v /= period;
 out.push(v);
 for (let i = period; i < arr.length; i++) {
 v = arr[i] * k + v * (1 - k);
 out.push(v);
 }
 return out;
}

function rsi(closes, period = 14) {
 if (!closes || closes.length < period + 2) return null;
 const s = closes.slice(-(period * 3));
 let gains = 0, losses = 0;
 for (let i = 1; i <= period; i++) {
 const d = s[i] - s[i - 1];
 d > 0 ? (gains += d) : (losses -= d);
 }
 let ag = gains / period, al = losses / period;
 for (let i = period + 1; i < s.length; i++) {
 const d = s[i] - s[i - 1];
 ag = (ag * (period - 1) + Math.max(d, 0)) / period;
 al = (al * (period - 1) + Math.max(-d, 0)) / period;
 }
 return al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(1);
}

function rsiSeries(closes, period = 14) {
 if (!closes || closes.length < period + 2) return [];
 const out = [];
 let gains = 0, losses = 0;
 for (let i = 1; i <= period; i++) {
 const d = closes[i] - closes[i - 1];
 d > 0 ? (gains += d) : (losses -= d);
 }
 let ag = gains / period, al = losses / period;
 out.push(al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(1));
 for (let i = period + 1; i < closes.length; i++) {
 const d = closes[i] - closes[i - 1];
 ag = (ag * (period - 1) + Math.max(d, 0)) / period;
 al = (al * (period - 1) + Math.max(-d, 0)) / period;
 out.push(al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(1));
 }
 return out;
}

function obv(candles) {
 const out = [0];
 for (let i = 1; i < candles.length; i++) {
 const prev = out[out.length - 1];
 const diff = candles[i].close - candles[i - 1].close;
 out.push(diff > 0 ? prev + candles[i].volume : diff < 0 ? prev - candles[i].volume : prev);
 }
 return out;
}

/**
 * Smart price precision - preserves significant digits for micro-price coins.
 * Prevents toFixed(4) from rounding $0.0000105 -> 0.
 */
function pricePrecision(p) {
 if (!p || !isFinite(p)) return 0;
 if (p >= 1000) return +p.toFixed(2);
 if (p >= 1) return +p.toFixed(4);
 if (p >= 0.01) return +p.toFixed(6);
 if (p >= 0.0001) return +p.toFixed(8);
 if (p >= 0.000001) return +p.toFixed(10);
 return +p.toPrecision(6);
}

function ensurePositivePrice(rawPrice, referencePrice = 0) {
 const raw = Number(rawPrice || 0);
 if (Number.isFinite(raw) && raw > 0) return pricePrecision(raw);
 const reference = Math.max(0, Number(referencePrice || 0));
 if (!(reference > 0)) return 0;
 return pricePrecision(Math.max(reference * 0.05, 1e-10));
}

function atr(candles, p = 14) {
 if (!Array.isArray(candles) || candles.length < p + 1) return 0;
 const trs = [];
 for (let i = 1; i < candles.length; i++) {
 const c = candles[i];
 const pc = candles[i - 1].close;
 trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
 }
 if (trs.length < p) return 0;
 let value = trs.slice(0, p).reduce((sum, tr) => sum + tr, 0) / p;
 for (let i = p; i < trs.length; i++) {
 value = ((value * (p - 1)) + trs[i]) / p;
 }
 return value || 0;
}

function vwap(candles) {
 if (!candles || candles.length < 2) return null;
 let cumTPV = 0, cumVol = 0;
 let prevDay = -1;
 const series = [];
 for (const c of candles) {
 // Reset at UTC session boundary (midnight) - matches TradingView "Session" anchor
 const day = Math.floor(c.time / 86400);
 if (day !== prevDay) {
 cumTPV = 0;
 cumVol = 0;
 prevDay = day;
 }
 const tp = (c.high + c.low + c.close) / 3;
 cumTPV += tp * c.volume;
 cumVol += c.volume;
 series.push(cumVol > 0 ? cumTPV / cumVol : tp);
 }
 return {
 value: series[series.length - 1],
 series,
 priceAbove: candles[candles.length - 1].close > series[series.length - 1],
 };
}

function volumeProfile(candles, bins = 50) {
 if (!candles || candles.length < 10) return null;
 let minP = Infinity, maxP = -Infinity;
 for (const c of candles) {
 if (c.low < minP) minP = c.low;
 if (c.high > maxP) maxP = c.high;
 }
 if (maxP <= minP) return null;
 const step = (maxP - minP) / bins;
 const histogram = new Array(bins).fill(0);
 for (const c of candles) {
 const tp = (c.high + c.low + c.close) / 3;
 histogram[Math.min(Math.floor((tp - minP) / step), bins - 1)] += c.volume;
 }
 let pocIdx = 0, maxVol = 0;
 for (let i = 0; i < bins; i++) if (histogram[i] > maxVol) { maxVol = histogram[i]; pocIdx = i; }
 const poc = minP + (pocIdx + 0.5) * step;
 const totalVol = histogram.reduce((a, b) => a + b, 0);
 const target = totalVol * 0.7;
 let vaVol = histogram[pocIdx], lo = pocIdx, hi = pocIdx;
 while (vaVol < target && (lo > 0 || hi < bins - 1)) {
 const loV = lo > 0 ? histogram[lo - 1] : 0;
 const hiV = hi < bins - 1 ? histogram[hi + 1] : 0;
 if (loV >= hiV && lo > 0) { lo--; vaVol += histogram[lo]; }
 else if (hi < bins - 1) { hi++; vaVol += histogram[hi]; }
 else if (lo > 0) { lo--; vaVol += histogram[lo]; }
 else break;
 }
 const price = candles[candles.length - 1].close;
 return {
 poc: +poc.toFixed(6),
 vah: +(minP + (hi + 1) * step).toFixed(6),
 val: +(minP + lo * step).toFixed(6),
 priceVsVA: price > minP + (hi + 1) * step ? 'above' : price < minP + lo * step ? 'below' : 'inside',
 };
}

function macd(closes, fast = 12, slow = 26, sig = 9) {
 if (!closes || closes.length < slow + sig) return null;
 const emaF = emaSeries(closes, fast);
 const emaS = emaSeries(closes, slow);
 const offset = slow - fast;
 const macdLine = [];
 for (let i = 0; i < emaS.length; i++) {
 const fIdx = i + offset;
 if (fIdx < emaF.length) macdLine.push(emaF[fIdx] - emaS[i]);
 }
 if (macdLine.length < sig) return null;
 const kSig = 2 / (sig + 1);
 let sv = macdLine.slice(0, sig).reduce((a, b) => a + b, 0) / sig;
 const hist = [];
 for (let i = 0; i < macdLine.length; i++) {
 if (i < sig) { hist.push(0); continue; }
 sv = macdLine[i] * kSig + sv * (1 - kSig);
 hist.push(macdLine[i] - sv);
 }
 const last = hist[hist.length - 1], prev = hist[hist.length - 2] || 0;
 return {
 histogram: last, prevHistogram: prev, increasing: last > prev,
 bullCross: prev < 0 && last >= 0, bearCross: prev > 0 && last <= 0,
 };
}



// -- Swing finding ------------------------------------------------
function findSwings(arr, lookback = 30) {
 const recent = arr.slice(-lookback);
 const lows = [], highs = [];
 for (let i = 2; i < recent.length - 2; i++) {
 if (recent[i] < recent[i-1] && recent[i] < recent[i-2] &&
 recent[i] < recent[i+1] && recent[i] < recent[i+2])
 lows.push({ val: recent[i], idx: i });
 if (recent[i] > recent[i-1] && recent[i] > recent[i-2] &&
 recent[i] > recent[i+1] && recent[i] > recent[i+2])
 highs.push({ val: recent[i], idx: i });
 }
 return { lows, highs };
}

function buildAlignedRSIWindow(closes, period = 14, lookback = 40) {
 if (!closes || closes.length < lookback + period) return null;
 const span = Math.min(closes.length, lookback + period + 8);
 const recent = closes.slice(-span);
 const rs = rsiSeries(recent, period);
 const price = recent.slice(period);
 if (price.length < 8 || rs.length < 8) return null;
 const win = Math.min(lookback, price.length, rs.length);
 return {
 price: price.slice(-win),
 rsi: rs.slice(-win),
 };
}

function pairAlignedSwings(priceSeries, rsiSeries, side, lookback = 30, tolerance = 4) {
 const priceSwings = findSwings(priceSeries, Math.min(lookback, priceSeries.length));
 const rsiSwings = findSwings(rsiSeries, Math.min(lookback, rsiSeries.length));
 const pList = side === 'low' ? priceSwings.lows : priceSwings.highs;
 const rList = side === 'low' ? rsiSwings.lows : rsiSwings.highs;
 if (pList.length < 2 || rList.length < 2) return null;

 const matched = [];
 const used = new Set();
 for (let pIdx = pList.length - 1; pIdx >= 0 && matched.length < 2; pIdx--) {
 const p = pList[pIdx];
 let best = null;
 let bestIdx = -1;
 for (let i = rList.length - 1; i >= 0; i--) {
 if (used.has(i)) continue;
 const diff = Math.abs(rList[i].idx - p.idx);
 if (diff > tolerance) continue;
 if (!best || diff < best.diff) {
 best = { price: p, rsi: rList[i], diff };
 bestIdx = i;
 }
 }
 if (!best) continue;
 used.add(bestIdx);
 matched.unshift(best);
 }

 if (matched.length < 2) return null;
 matched.sort((a, b) => a.price.idx - b.price.idx);
 return matched;
}

// -- RSI Divergence -----------------------------------------------
function rsiDivergence(closes, lookback = 30) {
 const aligned = buildAlignedRSIWindow(closes, 14, lookback);
 if (!aligned) return { bull: false, bear: false, strength: 0 };
 const lowPair = pairAlignedSwings(aligned.price, aligned.rsi, 'low', lookback);
 const highPair = pairAlignedSwings(aligned.price, aligned.rsi, 'high', lookback);
 let bull = false, bear = false, strength = 0;
 if (lowPair) {
 const [pp, pc] = lowPair.map(x => x.price);
 const [rp, rc] = lowPair.map(x => x.rsi);
 if (pc.val < pp.val && rc.val > rp.val) {
 bull = true;
 const priceDelta = pp.val > 0 ? Math.abs((pc.val - pp.val) / pp.val) * 100 : 0;
 const rsiDelta = Math.abs(rc.val - rp.val);
 strength = Math.min(10, Math.round(priceDelta + rsiDelta / 4));
 }
 }
 if (highPair) {
 const [pp, pc] = highPair.map(x => x.price);
 const [rp, rc] = highPair.map(x => x.rsi);
 if (pc.val > pp.val && rc.val < rp.val) {
 bear = true;
 const priceDelta = pp.val > 0 ? Math.abs((pc.val - pp.val) / pp.val) * 100 : 0;
 const rsiDelta = Math.abs(rp.val - rc.val);
 strength = Math.min(10, Math.round(priceDelta + rsiDelta / 4));
 }
 }
 return { bull, bear, strength };
}

function rsiReversals(closes, lookback = 30) {
 const aligned = buildAlignedRSIWindow(closes, 14, lookback);
 if (!aligned) return { positive: false, negative: false, strength: 0 };
 const lowPair = pairAlignedSwings(aligned.price, aligned.rsi, 'low', lookback);
 const highPair = pairAlignedSwings(aligned.price, aligned.rsi, 'high', lookback);
 let positive = false, negative = false, strength = 0;
 if (lowPair) {
 const [pp, pc] = lowPair.map(x => x.price);
 const [rp, rc] = lowPair.map(x => x.rsi);
 if (pc.val > pp.val && rc.val < rp.val) {
 positive = true;
 const priceDelta = pp.val > 0 ? Math.abs((pc.val - pp.val) / pp.val) * 100 : 0;
 const rsiDelta = Math.abs(rp.val - rc.val);
 strength = Math.min(10, Math.round(priceDelta + rsiDelta / 4));
 }
 }
 if (highPair) {
 const [pp, pc] = highPair.map(x => x.price);
 const [rp, rc] = highPair.map(x => x.rsi);
 if (pc.val < pp.val && rc.val > rp.val) {
 negative = true;
 const priceDelta = pp.val > 0 ? Math.abs((pc.val - pp.val) / pp.val) * 100 : 0;
 const rsiDelta = Math.abs(rc.val - rp.val);
 strength = Math.max(strength, Math.min(10, Math.round(priceDelta + rsiDelta / 4)));
 }
 }
 return { positive, negative, strength };
}

function cardwellRSIState(closes, period = 14, lookback = 18) {
 const series = rsiSeries(closes, period);
 if (!series.length) {
 return {
 value: null,
 prev: null,
 regime: 'neutral',
 zone: 'neutral',
 bullishShift: false,
 bearishShift: false,
 bullSupportZone: false,
 bearResistanceZone: false,
 high: null,
 low: null,
 };
 }

 const tail = series.slice(-Math.min(lookback, series.length));
 const current = tail[tail.length - 1];
 const prev = tail[tail.length - 2] ?? current;
 const bullInRange = tail.filter(v => v >= 40 && v <= 80).length;
 const bearInRange = tail.filter(v => v >= 20 && v <= 60).length;
 const above60 = tail.filter(v => v >= 60).length;
 const below40 = tail.filter(v => v <= 40).length;
 const last3 = tail.slice(-Math.min(3, tail.length));
 const prior = tail.slice(0, -last3.length);

 let regime = 'neutral';
 if ((above60 >= 2 && bullInRange >= Math.ceil(tail.length * 0.65) && current >= 45) || (current >= 60 && bullInRange >= bearInRange)) {
 regime = 'bull_range';
 } else if ((below40 >= 2 && bearInRange >= Math.ceil(tail.length * 0.65) && current <= 55) || (current <= 40 && bearInRange >= bullInRange)) {
 regime = 'bear_range';
 }

 const bullSupportZone = current >= 40 && current <= 50;
 const bearResistanceZone = current >= 50 && current <= 60;
 const bullishShift = last3.length >= 2 && last3.every(v => v >= 60) && prior.some(v => v < 60);
 const bearishShift = last3.length >= 2 && last3.every(v => v <= 40) && prior.some(v => v > 40);

 let zone = 'neutral';
 if (bullishShift) zone = 'bull_shift';
 else if (bearishShift) zone = 'bear_shift';
 else if (regime === 'bull_range' && bullSupportZone) zone = 'bull_support';
 else if (regime === 'bear_range' && bearResistanceZone) zone = 'bear_resistance';
 else if (regime === 'bull_range') zone = 'bull_range';
 else if (regime === 'bear_range') zone = 'bear_range';

 return {
 value: current,
 prev,
 regime,
 zone,
 bullishShift,
 bearishShift,
 bullSupportZone,
 bearResistanceZone,
 high: Math.max(...tail),
 low: Math.min(...tail),
 };
}

// -- OBV Divergence -----------------------------------------------
function obvDivergence(candles, lookback = 20) {
 if (!candles || candles.length < lookback) return { bull: false, bear: false };
 const recent = candles.slice(-lookback);
 const o = obv(recent);
 const closes = recent.map(c => c.close);
 const pSlope = (closes[closes.length - 1] - closes[0]) / closes[0];
 const oSlope = o.length > 1 ? (o[o.length - 1] - o[0]) : 0;
 return { bull: pSlope < -0.02 && oSlope > 0, bear: pSlope > 0.02 && oSlope < 0 };
}

// -- EMA Crossover ------------------------------------------------
function emaCrossover(closes, fast = 9, mid = 30) {
 if (!closes || closes.length < mid + 3) return { bull: false, bear: false };
 const pts = [];
 for (let i = closes.length - 3; i < closes.length; i++) {
 const sl = closes.slice(0, i + 1);
 pts.push({ f: ema(sl, fast), m: ema(sl, mid) });
 }
 const n = pts.length;
 return {
 bull: n >= 2 && pts[n-2].f <= pts[n-2].m && pts[n-1].f > pts[n-1].m,
 bear: n >= 2 && pts[n-2].f >= pts[n-2].m && pts[n-1].f < pts[n-1].m,
 };
}

function trendStrength(closes, look = 20) {
 if (!closes || closes.length < 5) return 0.5;
 const s = closes.slice(-Math.min(look, closes.length));
 let up = 0;
 for (let i = 1; i < s.length; i++) if (s[i] > s[i - 1]) up++;
 return up / (s.length - 1);
}

function volSpike(candles, mult = 1.5) {
 if (candles.length < 20) return false;
 const vols = candles.map(c => c.volume);
 const avg = sma(vols.slice(0, -1), 20);
 return avg ? vols[vols.length - 1] > avg * mult : false;
}

function detectSwingPoints(candles, lookback = 40, pivot = 2, minMovePct = 0.003) {
 if (!candles || candles.length < lookback) return { highs: [], lows: [] };
 const recent = candles.slice(-lookback);
 const highs = [];
 const lows = [];

 for (let i = pivot; i < recent.length - pivot; i++) {
 const c = recent[i];
 let isHigh = true;
 let isLow = true;
 for (let j = i - pivot; j <= i + pivot; j++) {
 if (j === i) continue;
 if (recent[j].high >= c.high) isHigh = false;
 if (recent[j].low <= c.low) isLow = false;
 if (!isHigh && !isLow) break;
 }
 if (isHigh) highs.push({ val: c.high, idx: i, ts: c.time });
 if (isLow) lows.push({ val: c.low, idx: i, ts: c.time });
 }

 function filterNoise(points) {
 if (points.length < 2) return points;
 const out = [points[0]];
 for (let i = 1; i < points.length; i++) {
 const prev = out[out.length - 1];
 const move = Math.abs(points[i].val - prev.val) / Math.max(prev.val, 1e-8);
 if (move >= minMovePct) out.push(points[i]);
 else if (i === points.length - 1) out[out.length - 1] = points[i];
 }
 return out;
 }

 return { highs: filterNoise(highs), lows: filterNoise(lows) };
}

function buildLevelBuckets(values, tolerancePct = 0.0035) {
 const buckets = [];
 for (const v of values) {
 if (!isFinite(v) || v <= 0) continue;
 let merged = false;
 for (const b of buckets) {
 if (Math.abs(v - b.price) / b.price <= tolerancePct) {
 b.touches++;
 b.price = (b.price * (b.touches - 1) + v) / b.touches;
 merged = true;
 break;
 }
 }
 if (!merged) buckets.push({ price: v, touches: 1 });
 }
 return buckets;
}

function mergeLevels(levels, tolerancePct = 0.0035) {
 const merged = [];
 for (const l of levels) {
 let found = null;
 for (const m of merged) {
 if (Math.abs(l.price - m.price) / m.price <= tolerancePct) {
 found = m;
 break;
 }
 }
 if (found) {
 const foundTouches = Math.max(1, Number(found.touches || found.touch_count || 1));
 const levelTouches = Math.max(1, Number(l.touches || l.touch_count || 1));
 const totalTouches = foundTouches + levelTouches;
 found.price = (Number(found.price || 0) * foundTouches + Number(l.price || 0) * levelTouches) / totalTouches;
 found.touches = totalTouches;
 found.touch_count = Math.max(Number(found.touch_count || 0), Number(l.touch_count || 0), totalTouches);
 found.zoneLow = Math.min(Number(found.zoneLow || found.lower || found.price), Number(l.zoneLow || l.lower || l.price));
 found.zoneHigh = Math.max(Number(found.zoneHigh || found.upper || found.price), Number(l.zoneHigh || l.upper || l.price));
 found.strengthPct = Math.max(Number(found.strengthPct || 0), Number(l.strengthPct || 0));
 found.score = Math.max(Number(found.score || 0), Number(l.score || 0));
 found.smartScore = Math.max(Number(found.smartScore || 0), Number(l.smartScore || 0));
 found.rejectionCount = Math.max(Number(found.rejectionCount || 0), Number(l.rejectionCount || 0));
 found.breakoutRetests = Math.max(Number(found.breakoutRetests || 0), Number(l.breakoutRetests || 0));
 found.consolidationBars = Math.max(Number(found.consolidationBars || 0), Number(l.consolidationBars || 0));
 found.volumeScore = Math.max(Number(found.volumeScore || 0), Number(l.volumeScore || 0));
 found.tf = String(found.tf || '').includes(l.tf) ? found.tf : `${found.tf || ''}${found.tf ? ',' : ''}${l.tf || ''}`;
 found.pivots = [
 ...(Array.isArray(found.pivots) ? found.pivots : []),
 ...(Array.isArray(l.pivots) ? l.pivots : []),
 ...(Array.isArray(l.sourcePivots) ? l.sourcePivots : []),
 ].slice(-40);
 found.sourcePivots = [
 ...(Array.isArray(found.sourcePivots) ? found.sourcePivots : []),
 ...(Array.isArray(l.sourcePivots) ? l.sourcePivots : []),
 ...(Array.isArray(l.pivots) ? l.pivots : []),
 ].slice(-40);
 } else {
 merged.push({ ...l });
 }
 }
 return merged;
}

function detectPivotCandidates(candles, pivotLength = 6) {
 if (!Array.isArray(candles) || candles.length < (pivotLength * 2) + 1) {
 return { highs: [], lows: [] };
 }
 const highs = [];
 const lows = [];
 for (let i = pivotLength; i < candles.length - pivotLength; i++) {
 const pivot = candles[i];
 let isHigh = true;
 let isLow = true;
 for (let j = i - pivotLength; j <= i + pivotLength; j++) {
 if (j === i) continue;
 if (Number(candles[j]?.high || 0) >= Number(pivot?.high || 0)) isHigh = false;
 if (Number(candles[j]?.low || 0) <= Number(pivot?.low || 0)) isLow = false;
 if (!isHigh && !isLow) break;
 }
 if (isHigh) highs.push({ price: Number(pivot.high || 0), ts: pivot.time, kind: 'resistance' });
 if (isLow) lows.push({ price: Number(pivot.low || 0), ts: pivot.time, kind: 'support' });
 }
 return { highs, lows };
}

function clusterPivotLevels(points, {
 toleranceAbs = 0,
 currentPrice = 0,
 pivotMemory = 50,
 maxLevels = 4,
 tfLabel = '',
 kind = 'resistance',
} = {}) {
 const recent = (Array.isArray(points) ? points : [])
 .filter(point => Number(point?.price || 0) > 0)
 .slice(-Math.max(4, Number(pivotMemory || 50)));
 if (!recent.length) return [];
 const basePrice = Number(currentPrice || recent[recent.length - 1]?.price || 0);
 const tolerance = Math.max(
 Number(toleranceAbs || 0),
 basePrice > 0 ? basePrice * (tfLabel === '1D' ? 0.0026 : 0.0016) : 0
 );
 const zones = [];
 for (const point of recent) {
 let match = null;
 for (const zone of zones) {
 if (Math.abs(Number(point.price || 0) - zone.price) <= tolerance) {
 match = zone;
 break;
 }
 }
 if (match) {
 const totalTouches = match.touches + 1;
 match.price = ((match.price * match.touches) + Number(point.price || 0)) / totalTouches;
 match.touches = totalTouches;
 match.lastTs = Math.max(match.lastTs, Number(point.ts || 0));
 match.pivots.push({ price: Number(point.price || 0), ts: Number(point.ts || 0) });
 } else {
 zones.push({
 price: Number(point.price || 0),
 touches: 1,
 lastTs: Number(point.ts || 0),
 tf: tfLabel,
 kind,
 pivots: [{ price: Number(point.price || 0), ts: Number(point.ts || 0) }],
 });
 }
 }
 const relativeToPrice = (zone) => basePrice > 0 ? Math.abs(zone.price - basePrice) / basePrice : 0;
 return zones
 .map(zone => ({
 ...zone,
 strengthPct: +(Math.min(100, (zone.touches / Math.max(1, recent.length)) * 100)).toFixed(1),
 }))
 .sort((a, b) => {
 if (b.touches !== a.touches) return b.touches - a.touches;
 const gap = relativeToPrice(a) - relativeToPrice(b);
 if (Math.abs(gap) > 1e-10) return gap;
 return b.lastTs - a.lastTs;
 })
 .slice(0, Math.max(1, Number(maxLevels || 4)));
}

function selectDirectionalLevels(levels, currentPrice, side = 'resistance', maxLevels = 2) {
 const list = Array.isArray(levels) ? levels.slice() : [];
 if (!list.length) return [];
 const limit = Math.max(1, Number(maxLevels || 2));
 const rankLevels = (items = []) => items.slice().sort((a, b) => {
 if (b.touches !== a.touches) return b.touches - a.touches;
 if (Math.abs(Number(b.strengthPct || 0) - Number(a.strengthPct || 0)) > 1e-10) {
 return Number(b.strengthPct || 0) - Number(a.strengthPct || 0);
 }
 const aGap = Number(currentPrice || 0) > 0 ? Math.abs(a.price - currentPrice) : 0;
 const bGap = Number(currentPrice || 0) > 0 ? Math.abs(b.price - currentPrice) : 0;
 if (Math.abs(aGap - bGap) > 1e-10) return aGap - bGap;
 return b.lastTs - a.lastTs;
 });
 const directional = Number(currentPrice || 0) > 0
 ? list.filter(level => side === 'resistance' ? level.price >= currentPrice : level.price <= currentPrice)
 : list.slice();
 let ranked = rankLevels(directional.length ? directional : list).slice(0, limit);
 if (ranked.length < limit) {
 const used = new Set(ranked.map(level => `${level.price}:${level.touches}:${level.lastTs}`));
 const fallback = rankLevels(list).filter(level => !used.has(`${level.price}:${level.touches}:${level.lastTs}`));
 ranked = ranked.concat(fallback.slice(0, limit - ranked.length));
 }
 return ranked
 .sort((a, b) => side === 'resistance' ? a.price - b.price : b.price - a.price);
}

function keyLevelAverage(values = []) {
 const cleaned = (Array.isArray(values) ? values : [])
 .map(value => Number(value || 0))
 .filter(value => Number.isFinite(value) && value > 0);
 if (!cleaned.length) return 0;
 return cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length;
}

function keyLevelStrengthLabel(score = 0, touchCount = 0) {
 const touches = Number(touchCount || 0);
 if (touches >= 15) return 'Strong';
 if (touches >= 8) return 'Medium';
 if (touches >= 4) return 'Weak';
 return 'Developing';
}

function brokerKeyLevelRole(index = 0) {
 const roles = [
 { color: 'red', colorRole: 'resistance-major', roleLabel: '', label: 'Strong Resistance' },
 { color: 'orange', colorRole: 'resistance-minor', roleLabel: '', label: 'Breakout Retest Zone' },
 { color: 'blue', colorRole: 'support-near', roleLabel: '', label: 'Support Zone' },
 { color: 'yellow', colorRole: 'support-deep', roleLabel: '', label: 'Major Bottom Support' },
 ];
 return roles[Math.max(0, Math.min(roles.length - 1, Number(index || 0)))] || roles[0];
}

function detectKeyLevelReactionEvent(rows = [], index = 0, low = 0, high = 0, kind = 'support', width = 0) {
 const candle = rows[index] || {};
 const prev = rows[index - 1] || {};
 const close = Number(candle.close || 0);
 const open = Number(candle.open || 0);
 const candleLow = Number(candle.low || close || 0);
 const candleHigh = Number(candle.high || close || 0);
 const prevClose = Number(prev.close || 0);
 const time = Number(candle.time || 0);
 if (!(time > 0) || !(close > 0) || !(candleLow > 0) || !(candleHigh > 0) || !(low > 0) || !(high > 0)) return null;
 const range = Math.max(candleHigh - candleLow, close * 0.0001);
 const body = Math.max(Math.abs(close - open), range * 0.12);
 const touched = candleLow <= high && candleHigh >= low;
 const upperWick = Math.max(0, candleHigh - Math.max(open, close));
 const lowerWick = Math.max(0, Math.min(open, close) - candleLow);
 const nearLow = Math.max(0, low - Math.max(width, close * 0.0008));
 const nearHigh = high + Math.max(width, close * 0.0008);
 const lookback = rows.slice(Math.max(0, index - 5), index);
 const nearBars = lookback.filter(item => {
 const itemClose = Number(item.close || 0);
 const itemLow = Number(item.low || itemClose || 0);
 const itemHigh = Number(item.high || itemClose || 0);
 return itemClose >= nearLow && itemClose <= nearHigh && itemLow <= nearHigh && itemHigh >= nearLow;
 }).length;
 const hadCloseAbove = rows.slice(Math.max(0, index - 12), index).some(item => Number(item.close || 0) > high);
 const hadCloseBelow = rows.slice(Math.max(0, index - 12), index).some(item => Number(item.close || 0) < low);
 const breakoutUp = prevClose > 0 && prevClose <= high && close > high && (touched || nearBars >= 3);
 const breakoutDown = prevClose > 0 && prevClose >= low && close < low && (touched || nearBars >= 3);
 const retestAbove = touched && close > high && prevClose > high && hadCloseBelow;
 const retestBelow = touched && close < low && prevClose < low && hadCloseAbove;
 if (nearBars >= 3 && (breakoutUp || breakoutDown)) {
 return { type: 'consolidation-breakout', index, time, price: close, score: 5 + nearBars, volume: Number(candle.volume || 0) };
 }
 if (retestAbove || retestBelow) {
 return { type: 'retest', index, time, price: close, score: 8, volume: Number(candle.volume || 0) };
 }
 if (breakoutUp || breakoutDown) {
 return { type: 'breakout', index, time, price: close, score: 6, volume: Number(candle.volume || 0) };
 }
 if (!touched) return null;
 if (kind === 'resistance') {
 const wickReject = upperWick >= Math.max(body * 0.65, range * 0.24);
 if (wickReject && close < high) return { type: 'rejection', index, time, price: Math.min(candleHigh, high), score: 7 + (upperWick / range), volume: Number(candle.volume || 0) };
 } else {
 const wickBounce = lowerWick >= Math.max(body * 0.65, range * 0.24);
 if (wickBounce && close > low) return { type: 'bounce', index, time, price: Math.max(candleLow, low), score: 7 + (lowerWick / range), volume: Number(candle.volume || 0) };
 }
 return null;
}

function clusterKeyLevelReactionEvents(events = [], mergeWindow = 10) {
 const sorted = (Array.isArray(events) ? events : [])
 .filter(event => Number(event?.index || 0) >= 0 && Number(event?.time || 0) > 0)
 .sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
 const clusters = [];
 sorted.forEach(event => {
 const last = clusters[clusters.length - 1];
 if (last && Number(event.index || 0) - Number(last.endIndex || 0) <= mergeWindow) {
 last.endIndex = Number(event.index || 0);
 last.events += 1;
 last.volume += Number(event.volume || 0);
 if (Number(event.score || 0) >= Number(last.marker.score || 0)) last.marker = event;
 return;
 }
 clusters.push({
 startIndex: Number(event.index || 0),
 endIndex: Number(event.index || 0),
 events: 1,
 volume: Number(event.volume || 0),
 marker: event,
 });
 });
 return clusters;
}

function analyzeKeyLevelZone(level = {}, candles = [], zoneLow = 0, zoneHigh = 0, currentPrice = 0, kind = 'support', tfLabel = '') {
 const rows = (Array.isArray(candles) ? candles : [])
 .map(candle => ({
 time: Number(candle?.time || 0),
 open: Number(candle?.open || 0),
 high: Number(candle?.high || 0),
 low: Number(candle?.low || 0),
 close: Number(candle?.close || 0),
 volume: Number(candle?.volume || 0),
 }))
 .filter(candle => candle.time > 0 && candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0 && candle.high >= candle.low);
 const price = Number(level.price || level.mid || currentPrice || 0);
 const low = Math.min(Number(zoneLow || price || 0), Number(zoneHigh || price || 0));
 const high = Math.max(Number(zoneLow || price || 0), Number(zoneHigh || price || 0));
 if (!(price > 0) || !(low > 0) || !(high > 0) || !rows.length) {
 return {
 touchCount: Math.max(0, Number(level.touches || level.touch_count || 0)),
 rejectionCount: 0,
 breakoutRetests: 0,
 consolidationBars: 0,
 recencyScore: 0,
 volumeScore: 0,
 smartScore: 0,
 };
 }
 const width = Math.max(high - low, price * 0.0008);
 const nearLow = Math.max(0, low - width * 1.2);
 const nearHigh = high + width * 1.2;
 const avgVolume = keyLevelAverage(rows.slice(-Math.min(rows.length, 160)).map(candle => candle.volume));
 let consolidationBars = 0;
 let nearRun = 0;
 let maxNearRun = 0;
 const events = [];

 for (let index = 0; index < rows.length; index += 1) {
 const candle = rows[index];
 const range = Math.max(candle.high - candle.low, price * 0.0001);
 const bodyLow = Math.min(candle.open, candle.close);
 const bodyHigh = Math.max(candle.open, candle.close);
 const bodyNear = bodyLow <= nearHigh && bodyHigh >= nearLow;
 if (bodyNear) {
 nearRun += 1;
 maxNearRun = Math.max(maxNearRun, nearRun);
 if (range <= width * 4.2 || Math.abs(candle.close - candle.open) <= range * 0.45) consolidationBars += 1;
 } else {
 nearRun = 0;
 }
 const reaction = detectKeyLevelReactionEvent(rows, index, low, high, kind, width);
 if (reaction) events.push(reaction);
 }

 const clusters = clusterKeyLevelReactionEvents(events, 10);
 const finalTouchCount = clusters.length;
 const rejectionCount = clusters.filter(cluster => ['rejection', 'bounce'].includes(cluster.marker?.type)).length;
 const breakoutRetests = clusters.filter(cluster => ['breakout', 'retest', 'consolidation-breakout'].includes(cluster.marker?.type)).length;
 const latestTouchIndex = clusters.length ? Number(clusters[clusters.length - 1].endIndex || 0) : -1;
 const touchedVolume = clusters.reduce((sum, cluster) => sum + Number(cluster.volume || 0), 0);
 const avgTouchedVolume = clusters.length > 0 ? touchedVolume / clusters.length : 0;
 const volumeRatio = avgVolume > 0 && avgTouchedVolume > 0 ? avgTouchedVolume / avgVolume : 0;
 const volumeScore = volumeRatio > 0 ? Math.min(18, Math.max(0, 6 + (volumeRatio - 1) * 10)) : 0;
 const recencyScore = latestTouchIndex >= 0 ? Math.max(0, Math.min(18, ((latestTouchIndex + 1) / rows.length) * 18)) : 0;
 const rejectionScore = Math.min(30, rejectionCount * 5.2);
 const retestScore = Math.min(24, breakoutRetests * 12);
 const consolidationScore = Math.min(18, consolidationBars * 0.9 + Math.max(0, maxNearRun - 3) * 1.4);
 const distancePct = currentPrice > 0 ? Math.abs(price - currentPrice) / currentPrice : 0;
 const proximityScore = currentPrice > 0 ? Math.max(0, 22 - distancePct * 650) : 10;
 const directionalScore = currentPrice > 0
 ? ((kind === 'resistance' && price >= currentPrice) || (kind === 'support' && price <= currentPrice) ? 10 : -7)
 : 0;
 const tf = String(tfLabel || level.tf || '').trim().toUpperCase();
 const timeframeScore = tf === '1D' ? 8 : tf === 'COMBINED' ? 7 : 4;
 const smartScore = Math.max(0, Math.round(
 finalTouchCount * 8
 + rejectionScore
 + retestScore
 + consolidationScore
 + recencyScore
 + volumeScore
 + proximityScore
 + directionalScore
 + timeframeScore
 ));
 return {
 touchCount: finalTouchCount,
 rejectionCount,
 rejectionStrength: +rejectionScore.toFixed(1),
 breakoutRetests,
 consolidationBars,
 recencyScore: +recencyScore.toFixed(1),
 volumeScore: +volumeScore.toFixed(1),
 volumeRatio: +volumeRatio.toFixed(2),
 smartScore,
 strength: keyLevelStrengthLabel(smartScore, finalTouchCount),
 reactionClusters: clusters.slice(-24).map(cluster => ({
 type: cluster.marker?.type || 'reaction',
 time: Number(cluster.marker?.time || 0),
 price: pricePrecision(cluster.marker?.price || price),
 index: Number(cluster.marker?.index || 0),
 events: Number(cluster.events || 1),
 })),
 };
}

function buildBrokerKeyLevels(zones = [], currentPrice = 0) {
 const rankedAll = (Array.isArray(zones) ? zones : [])
 .filter(zone => Number(zone?.price || zone?.mid || 0) > 0)
 .map(zone => {
 const mid = Number(zone.price || zone.mid || 0);
 const lower = Math.min(Number(zone.zoneLow || zone.lower || mid), Number(zone.zoneHigh || zone.upper || mid));
 const upper = Math.max(Number(zone.zoneLow || zone.lower || mid), Number(zone.zoneHigh || zone.upper || mid));
 const inferredKind = currentPrice > 0
 ? (mid >= currentPrice ? 'resistance' : 'support')
 : (String(zone.kind || '').toLowerCase() === 'resistance' ? 'resistance' : 'support');
 return {
 ...zone,
 price: mid,
 zoneLow: lower,
 zoneHigh: upper,
 mid,
 lower,
 upper,
 kind: inferredKind,
 score: Number(zone.smartScore || zone.score || 0),
 touch_count: Math.max(0, Math.round(Number(zone.touch_count || zone.touches || 0))),
 };
 })
 .sort((a, b) => {
 const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
 if (scoreDiff) return scoreDiff;
 const touchDiff = Number(b.touch_count || 0) - Number(a.touch_count || 0);
 if (touchDiff) return touchDiff;
 return Math.abs(Number(a.price || 0) - Number(currentPrice || 0)) - Math.abs(Number(b.price || 0) - Number(currentPrice || 0));
 });
 const major = rankedAll.filter(zone => Number(zone.touch_count || zone.touches || 0) >= 4);
 const ranked = major.length >= 4 ? major : rankedAll;
 const selected = [];
 const seen = new Set();
 const addZone = (zone = null) => {
 if (!zone || selected.length >= 4) return;
 const key = Math.round(Number(zone.price || 0) * 1000000);
 if (seen.has(key)) return;
 seen.add(key);
 selected.push(zone);
 };
 const above = ranked.filter(zone => !currentPrice || Number(zone.price || 0) >= currentPrice);
 const below = ranked.filter(zone => currentPrice && Number(zone.price || 0) < currentPrice);
 above.slice(0, 2).forEach(addZone);
 below.slice(0, 2).forEach(addZone);
 ranked.forEach(addZone);
 const output = selected
 .slice(0, 4)
 .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
 .map((zone, index) => {
 const role = brokerKeyLevelRole(index);
 const mid = pricePrecision(Number(zone.price || zone.mid || 0));
 const lower = pricePrecision(Number(zone.zoneLow || zone.lower || mid));
 const upper = pricePrecision(Number(zone.zoneHigh || zone.upper || mid));
 const kind = currentPrice > 0 ? (mid >= currentPrice ? 'resistance' : 'support') : zone.kind;
 const touchCount = Math.max(0, Math.round(Number(zone.touch_count || zone.touches || 0)));
 const score = Math.round(Number(zone.score || zone.smartScore || 0));
 return {
 ...zone,
 upper,
 lower,
 mid,
 price: mid,
 zoneLow: lower,
 zoneHigh: upper,
 type: kind === 'resistance' ? 'Resistance' : 'Support',
 kind,
 color: role.color,
 colorRole: role.colorRole,
 roleLabel: role.roleLabel,
 label: role.label,
 touch_count: touchCount,
 touches: touchCount,
 strength: zone.strength || keyLevelStrengthLabel(score, touchCount),
 score,
 smartScore: score,
 reactionClusters: Array.isArray(zone.reactionClusters) ? zone.reactionClusters.slice(-24) : [],
 };
 });
 return output;
}

function swingDirectionVotes(values, tol = 0.0015) {
 let up = 0;
 let down = 0;
 for (let i = 1; i < values.length; i++) {
 const prev = values[i - 1];
 const cur = values[i];
 if (!isFinite(prev) || !isFinite(cur) || prev <= 0) continue;
 const pct = (cur - prev) / prev;
 if (pct > tol) up++;
 else if (pct < -tol) down++;
 }
 return { up, down };
}

// -- Market Structure Detection - NEW v14 ------------------------
// Strict rule core: HH+HL => uptrend, LH+LL => downtrend.
// Extra guardrail: broader swing drift to avoid false flips on minor bounces.
function marketStructure(candles, lookback = 30) {
 if (!candles || candles.length < lookback) return null;
 const { highs: swingHighs, lows: swingLows } = detectSwingPoints(candles, lookback, 2, 0.0025);

 let structure = 'ranging';
 if (swingHighs.length >= 2 && swingLows.length >= 2) {
 const [h1, h2] = swingHighs.slice(-2);
 const [l1, l2] = swingLows.slice(-2);
 const tol = 0.0015;
 const hh = h2.val > h1.val * (1 + tol);
 const hl = l2.val > l1.val * (1 + tol);
 const lh = h2.val < h1.val * (1 - tol);
 const ll = l2.val < l1.val * (1 - tol);
 const recentHighVals = swingHighs.slice(-5).map(s => s.val);
 const recentLowVals = swingLows.slice(-5).map(s => s.val);
 const hv = swingDirectionVotes(recentHighVals, tol);
 const lv = swingDirectionVotes(recentLowVals, tol);
 const upVotes = hv.up + lv.up;
 const downVotes = hv.down + lv.down;

 const firstHigh = recentHighVals[0];
 const lastHigh = recentHighVals[recentHighVals.length - 1];
 const firstLow = recentLowVals[0];
 const lastLow = recentLowVals[recentLowVals.length - 1];
 const highDrift = firstHigh > 0 ? (lastHigh - firstHigh) / firstHigh : 0;
 const lowDrift = firstLow > 0 ? (lastLow - firstLow) / firstLow : 0;
 const broadTol = 0.01; // 1% minimum drift to avoid noise
 const broaderUp = highDrift > broadTol && lowDrift > broadTol;
 const broaderDown = highDrift < -broadTol && lowDrift < -broadTol;

 if (hh && hl && (broaderUp || upVotes >= downVotes + 1)) {
 structure = 'uptrend';
 } else if (lh && ll && (broaderDown || downVotes >= upVotes + 1)) {
 structure = 'downtrend';
 } else if (broaderDown && downVotes >= upVotes) {
 structure = 'downtrend';
 } else if (broaderUp && upVotes >= downVotes) {
 structure = 'uptrend';
 } else if (hh && ll) {
 structure = 'expanding';
 } else if (lh && hl) {
 structure = 'contracting';
 }
 }

 return {
 structure,
 bullish: structure === 'uptrend',
 bearish: structure === 'downtrend',
 swingHighs: swingHighs.slice(-3).map(s => s.val),
 swingLows: swingLows.slice(-3).map(s => s.val),
 };
}

function detectKeyLevels(dayCandles, tf15Candles, currentPrice, rawSettings = {}) {
 const settings = analysisSanitizeKeyLevelSettings(rawSettings || {});
 const price = Number(currentPrice || 0);

 function enrichLevels(levels = [], tfLabel, kind, zoneWidthAbs = 0, sourceCandles = []) {
 return (levels || []).map(level => {
 const rawPrice = Number(level.price || level.mid || 0);
 const zoneWidth = Math.max(Number(zoneWidthAbs || 0), rawPrice * 0.0015);
 const zoneHalfWidth = Math.max(rawPrice * 0.00075, zoneWidth * 0.5);
 const zoneLow = Number(level.zoneLow || level.lower || 0) > 0
 ? Math.min(Number(level.zoneLow || level.lower || 0), rawPrice)
 : Math.max(0, rawPrice - zoneHalfWidth);
 const zoneHigh = Number(level.zoneHigh || level.upper || 0) > 0
 ? Math.max(Number(level.zoneHigh || level.upper || 0), rawPrice)
 : Math.max(0, rawPrice + zoneHalfWidth);
 const sourcePivots = [
 ...(Array.isArray(level.pivots) ? level.pivots : []),
 ...(Array.isArray(level.sourcePivots) ? level.sourcePivots : []),
 ].map(pivot => ({
 price: +Number(pivot.price || 0).toFixed(6),
 ts: Number(pivot.ts || pivot.time || 0),
 })).filter(pivot => pivot.price > 0 && pivot.ts > 0);
 const lowFromAtr = Math.max(0, rawPrice - zoneHalfWidth);
 const highFromAtr = Math.max(0, rawPrice + zoneHalfWidth);
 const metrics = analyzeKeyLevelZone(level, sourceCandles, lowFromAtr, highFromAtr, price, kind, tfLabel);
 const touchCount = Math.max(0, Number(metrics.touchCount || 0));
 const score = Math.max(Number(level.score || 0), Number(level.smartScore || 0), Number(metrics.smartScore || 0));
 return {
 price: +rawPrice.toFixed(6),
 zoneLow: +Math.max(0, lowFromAtr).toFixed(6),
 zoneHigh: +Math.max(0, highFromAtr).toFixed(6),
 upper: +Math.max(0, highFromAtr).toFixed(6),
 lower: +Math.max(0, lowFromAtr).toFixed(6),
 mid: +rawPrice.toFixed(6),
 zoneWidth: +zoneWidth.toFixed(6),
 touches: touchCount,
 touch_count: touchCount,
 strengthPct: +Math.max(Number(level.strengthPct || 0), Math.min(100, score)).toFixed(1),
 score,
 smartScore: score,
 strength: metrics.strength || keyLevelStrengthLabel(score, touchCount),
 rejectionCount: metrics.rejectionCount,
 rejectionStrength: metrics.rejectionStrength,
 breakoutRetests: metrics.breakoutRetests,
 consolidationBars: metrics.consolidationBars,
 recencyScore: metrics.recencyScore,
 volumeScore: metrics.volumeScore,
 volumeRatio: metrics.volumeRatio,
 reactionClusters: metrics.reactionClusters || [],
 tf: tfLabel,
 kind,
 type: kind === 'resistance' ? 'Resistance' : 'Support',
 sourcePivots: settings.showPivotCircles
 ? sourcePivots.slice(-24)
 : [],
 };
 });
 }

 function buildTfLevels(candles, tfLabel) {
 const pivotData = detectPivotCandidates(candles || [], settings.pivotLength);
 const atrValue = atr(candles || [], 14);
 const toleranceAbs = Math.max(
 Number(atrValue || 0) * (tfLabel === '1D' ? 0.45 : 0.25),
 price > 0 ? price * (tfLabel === '1D' ? 0.0045 : 0.0022) : 0
 );
 const zoneWidthAbs = Math.max(
 price > 0 ? price * 0.0015 : 0,
 Number(atrValue || 0) * 0.25
 );
 const maxPoolSize = Math.max(settings.numberOfLevels * 2, 8);
 const resistancePool = clusterPivotLevels(pivotData.highs, {
 toleranceAbs,
 currentPrice: price,
 pivotMemory: settings.pivotMemory,
 maxLevels: maxPoolSize,
 tfLabel,
 kind: 'resistance',
 });
 const supportPool = clusterPivotLevels(pivotData.lows, {
 toleranceAbs,
 currentPrice: price,
 pivotMemory: settings.pivotMemory,
 maxLevels: maxPoolSize,
 tfLabel,
 kind: 'support',
 });
 const resistance = selectDirectionalLevels(resistancePool, price, 'resistance', settings.numberOfLevels);
 const support = selectDirectionalLevels(supportPool, price, 'support', settings.numberOfLevels);
 return {
 toleranceAbs,
 zoneWidthAbs,
 resistance: enrichLevels(resistance, tfLabel, 'resistance', zoneWidthAbs, candles || []),
 support: enrichLevels(support, tfLabel, 'support', zoneWidthAbs, candles || []),
 };
 }

 const dayLevels = buildTfLevels(dayCandles || [], '1D');
 const tf15Levels = buildTfLevels(tf15Candles || [], '4h');
 const allKeyLevelCandles = [...(Array.isArray(dayCandles) ? dayCandles : []), ...(Array.isArray(tf15Candles) ? tf15Candles : [])]
 .filter(candle => Number(candle?.time || 0) > 0)
 .sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
 const combined = {
 resistance: enrichLevels(
 selectDirectionalLevels(
 mergeLevels([...(dayLevels.resistance || []), ...(tf15Levels.resistance || [])], 0.0035),
 price,
 'resistance',
 settings.numberOfLevels
 ),
 'combined',
 'resistance',
 Math.max(dayLevels.zoneWidthAbs || 0, tf15Levels.zoneWidthAbs || 0),
 allKeyLevelCandles
 ),
 support: enrichLevels(
 selectDirectionalLevels(
 mergeLevels([...(dayLevels.support || []), ...(tf15Levels.support || [])], 0.0035),
 price,
 'support',
 settings.numberOfLevels
 ),
 'combined',
 'support',
 Math.max(dayLevels.zoneWidthAbs || 0, tf15Levels.zoneWidthAbs || 0),
 allKeyLevelCandles
 ),
 };
 const brokerLevels = buildBrokerKeyLevels([...(combined.resistance || []), ...(combined.support || [])], price);

 return {
 config: settings,
 levels: brokerLevels,
 smartLevels: brokerLevels,
 majorLevels: brokerLevels,
 resistance: combined.resistance,
 support: combined.support,
 byTimeframe: {
 '1D': {
 resistance: dayLevels.resistance,
 support: dayLevels.support,
 },
 '4h': {
 resistance: tf15Levels.resistance,
 support: tf15Levels.support,
 },
 },
 };
}

function keyLevelBias(price, direction, keyLevels, atrValue) {
 if (!price || !keyLevels) return { scoreAdj: 0, blockLong: false, blockShort: false };
 const minDist = Math.max((atrValue || 0) * 0.45, price * 0.004);
 const nearestRes = (keyLevels.resistance || []).reduce((m, r) => {
 const d = r.price - price;
 if (d < 0) return m;
 return !m || d < m.dist ? { dist: d, level: r } : m;
 }, null);
 const nearestSup = (keyLevels.support || []).reduce((m, s) => {
 const d = price - s.price;
 if (d < 0) return m;
 return !m || d < m.dist ? { dist: d, level: s } : m;
 }, null);

 let scoreAdj = 0;
 let blockLong = false;
 let blockShort = false;
 if ((direction === 'long' || direction === 'watch_long') && nearestRes) {
 if (nearestRes.dist <= minDist) { scoreAdj -= 8; if (direction === 'long') blockLong = true; }
 else if (nearestRes.dist <= minDist * 1.6) scoreAdj -= 3;
 }
 if ((direction === 'short' || direction === 'watch_short') && nearestSup) {
 if (nearestSup.dist <= minDist) { scoreAdj -= 8; if (direction === 'short') blockShort = true; }
 else if (nearestSup.dist <= minDist * 1.6) scoreAdj -= 3;
 }
 if ((direction === 'long' || direction === 'watch_long') && nearestSup && nearestSup.dist <= minDist * 1.2) scoreAdj += 2;
 if ((direction === 'short' || direction === 'watch_short') && nearestRes && nearestRes.dist <= minDist * 1.2) scoreAdj += 2;

 return { scoreAdj, blockLong, blockShort };
}

function fmtLevel(v) {
 if (!isFinite(v) || v <= 0) return '0';
 if (v >= 1000) return v.toFixed(1);
 if (v >= 1) return v.toFixed(4);
 return v.toFixed(6);
}

// -- Volume Climax Detection - NEW v14 ---------------------------
// Extreme volume candles that signal potential exhaustion or capitulation
function volumeClimax(candles, lookback = 20) {
 if (!candles || candles.length < lookback + 5) return null;
 const recent = candles.slice(-(lookback + 1));
 const hist = recent.slice(0, -1);
 const last = candles[candles.length - 1];
 const avgVol = hist.reduce((s, c) => s + c.volume, 0) / hist.length;
 if (avgVol <= 0) return null;

 const ratio = last.volume / avgVol;
 const isClimax = ratio > 2.5;
 const body = Math.abs(last.close - last.open);
 const range = last.high - last.low || 1;
 const exhaustion = isClimax && body / range < 0.3; // Doji on climax vol
 const buying = isClimax && last.close > last.open; // Bullish engulf on high vol
 const selling = isClimax && last.close < last.open; // Bearish engulf on high vol

 return {
 isClimax,
 isBuyingClimax: buying, // Could signal local top
 isSellingClimax: selling, // Could signal local bottom
 exhaustion, // Doji = indecision at extreme volume
 volumeRatio: +ratio.toFixed(2),
 };
}

// -- OI + Price Divergence - NEW v14 -----------------------------
function oiPriceDivergence(oi, prevOI, change24h) {
 if (!oi || !prevOI || prevOI <= 0) return null;
 const oiChg = (oi - prevOI) / prevOI;
 const priceChg = change24h / 100;
 if (Math.abs(oiChg) < 0.05) return null; // Not significant

 if (oiChg > 0.05 && priceChg < -0.03)
 return { type: 'bearish', desc: 'OI up Price down - long trap risk', oiChgPct: +(oiChg*100).toFixed(1) };
 if (oiChg < -0.05 && priceChg > 0.03)
 return { type: 'bullish', desc: 'OI down Price up - short squeeze', oiChgPct: +(oiChg*100).toFixed(1) };
 if (oiChg > 0.05 && priceChg > 0.03)
 return { type: 'bullish', desc: 'OI up Price up - trend confirmation', oiChgPct: +(oiChg*100).toFixed(1) };
 if (oiChg < -0.05 && priceChg < -0.03)
 return { type: 'bearish', desc: 'OI down Price down - longs exiting', oiChgPct: +(oiChg*100).toFixed(1) };
 return null;
}

// -- Funding Rate Arbitrage - NEW v14 ----------------------------
// Finds coins with extreme funding vs market average (arb opportunity)
function fundingArbitrage(tickerMap, minUsdVolume = FUNDING_MIN_VOLUME_DEFAULT) {
 const entries = Object.entries(tickerMap)
 .filter(([, t]) => t.fundingRate !== 0 && t.usdVol24h >= minUsdVolume)
 .map(([sym, t]) => ({ sym, fr: t.fundingRate, vol: t.usdVol24h, price: t.price, sector: getSector(sym) }));

 if (!entries.length) return null;
 const avgFunding = entries.reduce((s, e) => s + e.fr, 0) / entries.length;
 const extremePos = entries.filter(e => e.fr > 0.03).sort((a, b) => b.fr - a.fr).slice(0, 10);
 const extremeNeg = entries.filter(e => e.fr < -0.03).sort((a, b) => a.fr - b.fr).slice(0, 10);

 return {
 extremePositive: extremePos, // Longs paying heavily - contrarian short opportunity
 extremeNegative: extremeNeg, // Shorts paying heavily - contrarian long opportunity
 avgFunding: +avgFunding.toFixed(4),
 marketBias: avgFunding > 0.01 ? 'overleveraged_long' : avgFunding < -0.01 ? 'overleveraged_short' : 'balanced',
 minUsdVolume,
 timestamp: Date.now(),
 };
}

function pearsonCorr(a, b) {
 const n = Math.min(a.length, b.length);
 if (n < 5) return 0;
 const as = a.slice(-n), bs = b.slice(-n);
 const ma = as.reduce((s, x) => s + x, 0) / n;
 const mb = bs.reduce((s, x) => s + x, 0) / n;
 let num = 0, da = 0, db = 0;
 for (let i = 0; i < n; i++) {
 num += (as[i] - ma) * (bs[i] - mb);
 da += (as[i] - ma) ** 2;
 db += (bs[i] - mb) ** 2;
 }
 return (!da || !db) ? 0 : +(num / Math.sqrt(da * db)).toFixed(3);
}

function normalizeOrderbookLevels(levels, side) {
 if (!Array.isArray(levels)) return [];
 const out = levels.map((l) => {
 if (Array.isArray(l)) {
 const p = +l[0];
 const s = +(l[1] ?? l[2] ?? 0);
 return { price: p, size: s };
 }
 const p = +(l?.price ?? l?.p ?? l?.rate ?? 0);
 const s = +(l?.size ?? l?.quantity ?? l?.qty ?? l?.volume ?? 0);
 return { price: p, size: s };
 }).filter(l => isFinite(l.price) && l.price > 0 && isFinite(l.size) && l.size > 0);
 out.sort((a, b) => side === 'bids' ? b.price - a.price : a.price - b.price);
 return out.slice(0, 20).map(l => ({ price: +l.price.toFixed(6), size: +l.size.toFixed(4) }));
}

function parseOrderbookPayload(payload) {
 const raw = payload?.result || payload?.data || payload || {};
 const bids = normalizeOrderbookLevels(
 raw?.bids || raw?.buy || raw?.buy_book || raw?.bid || raw?.buy_orders,
 'bids'
 );
 const asks = normalizeOrderbookLevels(
 raw?.asks || raw?.sell || raw?.sell_book || raw?.ask || raw?.sell_orders,
 'asks'
 );
 if (!bids.length && !asks.length) return null;
 return { bids, asks };
}

async function fetchOrderbookLite(symbol) {
 const s = String(symbol || '').toUpperCase().trim();
 if (!s) return { symbol: s, bids: [], asks: [], ts: Date.now(), error: 'Invalid symbol' };
 const cKey = `orderbook_${s}`;
 const c = cache.get(cKey);
 if (c && Date.now() - c.ts < SYMBOL_REFRESH_TTL_MS) return c.data;

 const endpoints = [
 `${BASE}/l2orderbook/${encodeURIComponent(s)}`,
 `${BASE}/l2orderbook?symbol=${encodeURIComponent(s)}`,
 `${BASE}/orderbook/${encodeURIComponent(s)}`,
 `${BASE}/orderbook?symbol=${encodeURIComponent(s)}`,
 ];

 for (const url of endpoints) {
 try {
 const r = await rateLimitedFetch(url, { signal: AbortSignal.timeout(6000) });
 if (!r.ok) continue;
 const d = await r.json();
 const parsed = parseOrderbookPayload(d);
 if (!parsed) continue;
 const out = { symbol: s, bids: parsed.bids, asks: parsed.asks, ts: Date.now() };
 cache.set(cKey, { data: out, ts: Date.now() });
 return out;
 } catch (_) {}
 }
 return { symbol: s, bids: [], asks: [], ts: Date.now(), error: 'Orderbook unavailable' };
}

async function buildCorrelationMatrix(results, strat) {
 const symbols = [...new Set((results || [])
 .slice()
 .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
 .slice(0, 20)
 .map(r => r.symbol)
 .filter(Boolean)
 )];
 if (symbols.length < 2) return null;

 const resolution = strat?.tf2 || '4h';
 const candlesList = await Promise.all(symbols.map(sym => fetchCandles(sym, resolution, 100)));
 const series = [];
 for (let i = 0; i < symbols.length; i++) {
 const c = candlesList[i];
 if (!c || c.length < 60) continue;
 series.push({ symbol: symbols[i], closes: c.slice(-100).map(x => x.close) });
 }
 if (series.length < 2) return null;

 const finalSymbols = series.map(s => s.symbol);
 const matrix = finalSymbols.map((_, i) =>
 finalSymbols.map((__, j) => {
 if (i === j) return 1;
 return pearsonCorr(series[i].closes, series[j].closes);
 })
 );
 return {
 symbols: finalSymbols,
 matrix,
 candles: 100,
 resolution,
 updatedAt: Date.now(),
 };
}

async function buildAndStoreCorrelationMatrix(results, strat) {
 if (correlationBuildInFlight) return correlationBuildInFlight;
 correlationBuildInFlight = (async () => {
 try {
 const corr = await buildCorrelationMatrix(results, strat);
 if (corr) {
 await chrome.storage.local.set({ correlationMatrix: corr });
 dlog(`Correlation matrix updated (${corr.symbols.length}x${corr.symbols.length})`);
 }
 return corr;
 } catch (e) {
 dlog(`Correlation matrix error: ${e.message}`);
 return null;
 } finally {
 correlationBuildInFlight = null;
 }
 })();
 return correlationBuildInFlight;
}

async function sendTelegramSignal(telegramCfg, result, tierLabel) {
 if (!telegramCfg?.enabled || !telegramCfg.botToken || !telegramCfg.chatId) return false;
 const ts = new Date(result?.ts || Date.now()).toLocaleString();
 const text =
 `Alert FWDTradeDesk Alert\n` +
 `Coin: ${result.symbol}\n` +
 `Score: ${result.score}/100\n` +
 `Entry: $${result.entry ? result.entry.toFixed(4) : '-'}\n` +
 `Trend: ${String(result.direction || '').toUpperCase()}\n` +
 `Tier: ${tierLabel}\n` +
 `Time: ${ts}`;
 const url = `https://api.telegram.org/bot${encodeURIComponent(telegramCfg.botToken)}/sendMessage`;
 const payload = {
 chat_id: telegramCfg.chatId,
 text,
 parse_mode: 'HTML',
 disable_web_page_preview: true,
 };

 const maxAttempts = 3;
 for (let attempt = 1; attempt <= maxAttempts; attempt++) {
 try {
 const resp = await rateLimitedNotifyFetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 signal: AbortSignal.timeout(10000),
 });

 if (resp.ok) return true;

 if (resp.status === 429) {
 let retryAfterSec = 0;
 try {
 const j = await resp.json();
 retryAfterSec = Number(j?.parameters?.retry_after || 0);
 } catch (_) {
 const errText = await resp.text().catch(() => resp.statusText);
 const m = String(errText).match(/retry after\s+(\d+)/i);
 if (m) retryAfterSec = Number(m[1] || 0);
 }
 const waitMs = Math.max(1100, (retryAfterSec + 1) * 1000);
 if (attempt < maxAttempts) {
 dlog(`Telegram throttled (429): wait ${Math.round(waitMs / 1000)}s and retry (${attempt}/${maxAttempts})`);
 await wait(waitMs);
 continue;
 }
 dlog('Telegram send failed (429)');
 return false;
 }

 dlog(`Telegram send failed (${resp.status})`);
 return false;
 } catch (e) {
 if (attempt < maxAttempts) {
 await wait(1000 * attempt);
 continue;
 }
 dlog(`Telegram send error: ${e?.message || 'request failed'}`);
 return false;
 }
 }
 return false;
}

function classifyAlertTier(result, strat) {
 if (!result) return null;
 const thresholds = result?.activeThresholds || getRegimeThresholds(result?.marketRegime || strat?.marketRegime, strat);
 if (result.score >= thresholds.alertScore && result.mtfConfirmed) return 'execute';
 if (result.score >= thresholds.setupScore && result.reasons.length >= 2) return 'setup';
 if (result.score >= thresholds.watchScore && (
 result.daily?.rsiBullishShift || result.daily?.rsiBearishShift ||
 result.daily?.rsiPositiveReversal || result.daily?.rsiNegativeReversal ||
 result.daily?.rsiDivergence || result.daily?.obvDivergence ||
 result.daily?.emaCross || result.spike || result.liquidationRisk
 )) return 'watch';
 if (result.pinned && result.score > 20) return 'watch';
 return null;
}

function classifyEmergingMove(daily, lower, ticker) {
 if (!daily?.valid || !lower?.valid) return null;

 const change24h = Number(ticker?.change24h || 0);
 const volume24h = Number(ticker?.usdVol24h || ticker?.volume24h || 0);

 const lowerBullImpulse =
 (lower.marketStructure?.bullish || lower.emaBull || lower.emaCross === 'bull') &&
 lower.price > lower.emaM &&
 lower.price > lower.emaS &&
 lower.vwapAbove === true;
 const lowerBearImpulse =
 (lower.marketStructure?.bearish || lower.emaBear || lower.emaCross === 'bear') &&
 lower.price < lower.emaM &&
 lower.price < lower.emaS &&
 lower.vwapAbove === false;

 const dailyWeakBullContext =
 !daily.emaBull &&
 !daily.marketStructure?.bullish &&
 (daily.rsiBullishShift || daily.rsiPositiveReversal || daily.obvDivergence === 'bull' || daily.price > daily.emaF);
 const dailyWeakBearContext =
 !daily.emaBear &&
 !daily.marketStructure?.bearish &&
 (daily.rsiBearishShift || daily.rsiNegativeReversal || daily.obvDivergence === 'bear' || daily.price < daily.emaF);

 const reversalLong = lowerBullImpulse && dailyWeakBullContext;
 const reversalShort = lowerBearImpulse && dailyWeakBearContext;
 const trendIgnitionLong =
 !reversalLong &&
 lowerBullImpulse &&
 (daily.emaBull || daily.marketStructure?.bullish) &&
 (lower.obvBull || lower.spike);
 const trendIgnitionShort =
 !reversalShort &&
 lowerBearImpulse &&
 (daily.emaBear || daily.marketStructure?.bearish) &&
 (lower.obvBear || lower.spike);

 if (!reversalLong && !reversalShort && !trendIgnitionLong && !trendIgnitionShort) return null;

 const side = reversalShort || trendIgnitionShort ? 'short' : 'long';
 const mode = reversalLong || reversalShort ? 'reversal' : 'trend';
 const factors = [];

 if (lower.emaCross === 'bull') factors.push('4H bull cross');
 if (lower.emaCross === 'bear') factors.push('4H bear cross');
 if (lower.marketStructure?.bullish) factors.push('4H structure up');
 if (lower.marketStructure?.bearish) factors.push('4H structure down');
 if (lower.vwapAbove === true) factors.push('4H above VWAP');
 if (lower.vwapAbove === false) factors.push('4H below VWAP');
 if (lower.obvBull) factors.push('OBV bid');
 if (lower.obvBear) factors.push('OBV offer');
 if (lower.spike) factors.push('volume expansion');
 if (mode === 'reversal' && daily.rsiBullishShift) factors.push('1D RSI shift');
 if (mode === 'reversal' && daily.rsiBearishShift) factors.push('1D RSI shift');
 if (mode === 'reversal' && daily.rsiPositiveReversal) factors.push('1D positive reversal');
 if (mode === 'reversal' && daily.rsiNegativeReversal) factors.push('1D negative reversal');
 if (mode === 'reversal' && daily.obvDivergence === 'bull') factors.push('1D OBV divergence');
 if (mode === 'reversal' && daily.obvDivergence === 'bear') factors.push('1D OBV divergence');
 if (Math.abs(change24h) >= 5) factors.push(`24h ${change24h > 0 ? '+' : ''}${change24h.toFixed(1)}%`);
 if (volume24h >= 1000000) factors.push(`liquidity $${(volume24h / 1000000).toFixed(1)}M`);

 const strengthScore = [
 lower.spike,
 lower.obvBull || lower.obvBear,
 Math.abs(change24h) >= 5,
 volume24h >= 1000000,
 mode === 'reversal' ? (daily.rsiPositiveReversal || daily.rsiNegativeReversal || daily.obvDivergence) : (daily.emaBull || daily.emaBear || daily.marketStructure?.bullish || daily.marketStructure?.bearish),
 ].filter(Boolean).length;
 const strength = strengthScore >= 4 ? 'prime' : strengthScore >= 3 ? 'strong' : 'early';

 return {
 side,
 mode,
 strength,
 label: `${mode === 'reversal' ? 'Emerging Reversal' : 'Trend Ignition'} ${side === 'long' ? 'Long' : 'Short'}`,
 note:
 mode === 'reversal'
 ? `4H ${side} impulse while 1D is still repairing`
 : `4H ${side} impulse expanding inside the broader trend`,
 factors: factors.slice(0, 4),
 };
}

function resolveMarketContext(marketContext = null, strat = {}) {
 const condition = typeof marketContext === 'string'
 ? String(marketContext || '').trim().toLowerCase()
 : String(marketContext?.condition || '').trim().toLowerCase();
 const thresholds = getRegimeThresholds(
 marketContext?.regime || strat?.marketRegime || 'UNKNOWN',
 strat
 );
 return {
 condition,
 regime: sanitizeMarketRegime(thresholds.regime),
 thresholds,
 };
}

function applyRegimeScoreAdjustment(score = 0, marketContext = {}, signal = {}) {
 const baseScore = Math.round(Number(score || 0));
 const regime = sanitizeMarketRegime(marketContext?.regime || signal?.marketRegime || 'UNKNOWN');
 const fundingRate = Math.abs(Number(signal?.fundingRate || signal?.ticker?.fundingRate || 0));
 const change24h = Math.abs(Number(signal?.ticker?.change24h || signal?.change24h || 0));
 const trendRatio = Number(signal?.lower?.trendRatio || 0);
 const isTrendSetup = signal?.emergingMove?.mode === 'trend'
 || (!!signal?.mtfConfirmed && trendRatio >= 0.62);
 const isReversalSetup = signal?.emergingMove?.mode === 'reversal'
 || !!signal?.daily?.volumeClimax?.isClimax;
 const isCrowdedTape = fundingRate >= 0.05 || change24h >= 8 || !!signal?.spike;
 const hasCleanStructure = !!(
 signal?.lower?.marketStructure?.bullish
 || signal?.lower?.marketStructure?.bearish
 || signal?.lower?.emaCross
 );

 let delta = 0;
 if (regime === 'TRENDING') {
 if (isTrendSetup) delta += signal?.mtfConfirmed ? 4 : 2;
 if (isReversalSetup && !isCrowdedTape) delta -= 3;
 } else if (regime === 'HIGH_VOL') {
 if (isTrendSetup && !isReversalSetup) delta -= isCrowdedTape ? 6 : 4;
 if (isReversalSetup) delta += isCrowdedTape ? 4 : 2;
 } else if (regime === 'LOW_VOL') {
 if (isTrendSetup && signal?.mtfConfirmed && !signal?.spike) delta += 2;
 if (signal?.spike || isCrowdedTape) delta -= 3;
 } else if (regime === 'CHOPPY') {
 if (isTrendSetup) delta -= 4;
 if (!hasCleanStructure) delta -= 6;
 if (isReversalSetup && isCrowdedTape) delta += 1;
 }

 delta = Math.max(-10, Math.min(6, delta));
 return {
 regime,
 delta,
 score: Math.max(0, Math.min(100, baseScore + delta)),
 };
}

// ================================================================
// CANDLE PARSER & FETCHER
// ================================================================
function parseCandle(c) {
 let time, open, high, low, close, volume, quoteVolume;
 if (Array.isArray(c)) {
 [time, open, high, low, close, volume, quoteVolume] = c;
 } else {
 time = c?.time ?? c?.t ?? 0;
 open = c?.open ?? c?.o ?? 0;
 high = c?.high ?? c?.h ?? 0;
 low = c?.low ?? c?.l ?? 0;
 close = c?.close ?? c?.c ?? 0;
 volume = c?.volume ?? c?.v ?? c?.turnover ?? 0;
 quoteVolume = c?.quote_volume ?? c?.quoteVolume ?? c?.turnover_usd ?? c?.turnover_24h ?? 0;
 }
 close = +close; high = +high; low = +low; open = +open; volume = +volume; quoteVolume = +quoteVolume; time = normalizeCandleTimeSec(time);
 if (!close || !high || !low || isNaN(close) || close <= 0) return null;
 return { time, open: open || close, high, low, close, volume: volume || 0, quoteVolume: quoteVolume || 0, quote_volume: quoteVolume || 0 };
}

const RES_MAP = {
 '1w':['1w'], '1wk':['1w'], W:['1w'],
 '1d':['1d'], '4h':['4h'], '1h':['1h'], '30m':['30m'],
 '5m':['4h'], '3m':['4h'], '1m':['4h'],
 D:['1d'], '60':['4h'], '5':['4h'], '240':['4h'], '720':['4h'],
};
const SECS_MAP = {
 '1w':604800,
 '1d':86400, '4h':14400, '1h':3600, '30m':1800,
 '5m':14400, '3m':14400, '1m':14400, '12h':14400,
};

function resolveCandleResolutionSec(resolution = '') {
 const resOpts = RES_MAP[resolution] || [resolution];
 return SECS_MAP[resOpts[0]] || 900;
}

function filterClosedCandles(candles = [], resolution = '', options = {}) {
 const list = Array.isArray(candles) ? candles.slice() : [];
 if (!list.length) return list;
 const periodSec = resolveCandleResolutionSec(resolution);
 const nowSec = Math.floor(Number(options.nowSec || (Date.now() / 1000)));
 const closeBufferSec = Math.max(0, Number(options.closeBufferSec ?? 2));
 if (!(periodSec > 0) || !(nowSec > 0)) return list;
 const cutoffSec = nowSec - closeBufferSec;
 return list.filter(candle => {
 const openSec = normalizeCandleTimeSec(candle?.time || 0);
 return openSec > 0 && (openSec + periodSec) <= cutoffSec;
 });
}

async function fetchCandles(symbol, resolution, limit = 200, options = {}) {
 const closedOnly = !!options?.closedOnly;
 const forceRefresh = options?.force === true;
 const timeoutMs = Math.max(0, Number(options?.timeoutMs || 0));
 const instrument = options?.instrument || options?.dhanInstrument || null;
 const instrumentKey = instrument?.exchangeSegment && instrument?.securityId
 ? `${String(instrument.exchangeSegment).trim().toUpperCase()}:${String(instrument.securityId).trim()}`
 : String(symbol || '').trim().toUpperCase();
 const cKey = `${instrumentKey}_${resolution}_${closedOnly ? 'closed' : 'live'}`;
 const c = forceRefresh ? null : cached(cKey);
 if (c) {
  globalThis.dhanCandleFetchStats = {
   ...(globalThis.dhanCandleFetchStats || {}),
   cacheHits: Number(globalThis.dhanCandleFetchStats?.cacheHits || 0) + 1,
  };
  return c;
 }
 const safeSymbol = String(symbol || '').trim().toUpperCase();
 const safeResolution = String(resolution || '').trim();
 const secs = resolveCandleResolutionSec(resolution);
 const end = Math.floor(Date.now() / 1000);
 const start = end - (limit + 50) * secs;
 const refreshMs = candleCacheRefreshMs(safeResolution, { closedOnly });
 const persisted = await loadPersistentCandleCacheRecord(safeSymbol, safeResolution, instrument);
 const cachedRows = Array.isArray(persisted.rows) ? persisted.rows : [];
 const persistedCandles = (() => {
 if (!cachedRows.length) return [];
 let rows = cachedRows.slice();
 if (closedOnly) rows = filterClosedCandles(rows, safeResolution);
 return rows.slice(-limit);
 })();
 const lastCachedTs = cachedRows.length ? Number(cachedRows[cachedRows.length - 1]?.time || 0) : 0;
 const cacheFresh = persisted.fromMemory || ((Date.now() - Number(persisted.updatedAt || 0)) < refreshMs);
 const largeNativeHistoryRequest = ['4h', '1d', '1w'].includes(safeResolution) && Number(limit || 0) >= 1000;
 const reusableClosedSeries = closedOnly && cacheFresh;
 const reusableLiveSeries = lastCachedTs >= (end - Math.max(secs, 60)) && cacheFresh;
 if (!forceRefresh && !largeNativeHistoryRequest && persistedCandles.length >= Math.min(20, limit) && (reusableClosedSeries || reusableLiveSeries)) {
  globalThis.dhanCandleFetchStats = {
   ...(globalThis.dhanCandleFetchStats || {}),
   cacheHits: Number(globalThis.dhanCandleFetchStats?.cacheHits || 0) + 1,
  };
  setCache(cKey, persistedCandles);
  return persistedCandles;
  }
 const oldestCachedTs = cachedRows.length ? Number(cachedRows[0]?.time || 0) : 0;
 const cachedCoverageEnough = cachedRows.length >= Math.max(20, Number(limit || 0))
  || (oldestCachedTs > 0 && oldestCachedTs <= (start + (secs * 7)));
 const overlapBars = closedOnly ? 2 : 4;
 const incrementalStart = lastCachedTs > 0 && cachedCoverageEnough
 ? Math.max(start, lastCachedTs - (secs * overlapBars))
 : start;
 if (lastCachedTs > 0) {
  globalThis.dhanCandleFetchStats = {
   ...(globalThis.dhanCandleFetchStats || {}),
   persistedRows: Number(globalThis.dhanCandleFetchStats?.persistedRows || 0) + cachedRows.length,
   incrementalRequests: Number(globalThis.dhanCandleFetchStats?.incrementalRequests || 0) + (incrementalStart > start ? 1 : 0),
  };
 }
 const withCandleTimeout = promise => {
  if (!(timeoutMs > 0)) return promise;
  return Promise.race([
   promise,
   new Promise((_, reject) => setTimeout(() => reject(new Error(`Candle timeout after ${timeoutMs}ms`)), timeoutMs)),
  ]);
 };
 if (typeof globalThis.dhanFetchCandlesForRenderer === 'function') {
 try {
   const fetchedRows = await withCandleTimeout(globalThis.dhanFetchCandlesForRenderer(safeSymbol, safeResolution, incrementalStart || start, end, {
    timeoutMs,
    paceMs: Math.max(0, Number(options?.paceMs || 0)),
   failFastOnRateLimit: true,
   instrument,
   force: forceRefresh,
   }));
   if (fetchedRows?.length) {
    globalThis.dhanCandleFetchStats = {
     ...(globalThis.dhanCandleFetchStats || {}),
     apiFetches: Number(globalThis.dhanCandleFetchStats?.apiFetches || 0) + 1,
     apiRows: Number(globalThis.dhanCandleFetchStats?.apiRows || 0) + fetchedRows.length,
    };
    const mergedRows = await persistPersistentCandleCacheRecord(
    safeSymbol,
    safeResolution,
    mergeCachedCandleRows(cachedRows, fetchedRows),
    instrument
    );
   let candles = mergedRows.slice();
   if (closedOnly) candles = filterClosedCandles(candles, safeResolution);
   candles = candles.slice(-limit);
   if (candles.length) {
    setCache(cKey, candles);
    return candles;
   }
  }
  } catch (e) {
   const message = String(e?.message || e || '');
   const retryAfterMs = extractDhanRetryAfterMs(message);
   if (retryAfterMs > 0 && options?._rateLimitRetry !== true) {
    globalThis.dhanCandleFetchStats = {
     ...(globalThis.dhanCandleFetchStats || {}),
     rateLimitWaits: Number(globalThis.dhanCandleFetchStats?.rateLimitWaits || 0) + 1,
    };
    dlog(`Candle rate-limit pause ${safeSymbol} ${safeResolution}: waiting ${Math.ceil(retryAfterMs / 1000)}s before retry`);
    await waitForSharedDhanCandleCooldown(retryAfterMs);
    return fetchCandles(symbol, resolution, limit, {
     ...options,
     _rateLimitRetry: true,
     timeoutMs: Math.max(timeoutMs || 0, retryAfterMs + 45000),
    });
   }
   const instrumentLabel = instrument?.exchangeSegment && instrument?.securityId
   ? `${String(instrument.exchangeSegment).trim().toUpperCase()}:${String(instrument.securityId).trim()}`
   : 'instrument unresolved';
   if (/DH-905|incorrect parameters|no data present/i.test(message)) {
    dlog(`Candle skipped ${safeSymbol}: market feed returned no/invalid candle data for ${safeResolution} (${instrumentLabel}) - ${message.slice(0, 160)}`);
   } else {
    dlog(`Candle error ${safeSymbol} ${safeResolution} (${instrumentLabel}): ${message}`);
   }
  }
 }
  if (persistedCandles.length >= 20) {
  globalThis.dhanCandleFetchStats = {
   ...(globalThis.dhanCandleFetchStats || {}),
   fallbackCacheHits: Number(globalThis.dhanCandleFetchStats?.fallbackCacheHits || 0) + 1,
  };
  setCache(cKey, persistedCandles);
  return persistedCandles;
 }
 return null;
}

// ================================================================
// FETCH ALL TICKERS
// BUG FIX #2: OI multi-field detection + debug log for BTC
// ================================================================
async function fetchAllTickers(options = {}) {
 if (typeof globalThis.dhanFetchTickerMapForRenderer === 'function') {
 try {
  const dhanMap = await globalThis.dhanFetchTickerMapForRenderer(options);
  const universe = globalThis.dhanLastUniverseMeta?.label || options.universe || 'Market universe';
  dlog(`Tickers: ${Object.keys(dhanMap || {}).length} NSE/BSE symbols (${universe})`);
  return dhanMap || {};
 } catch (e) {
  dlog(`Ticker error: ${e.message}`);
  throw e;
 }
 }
 dlog('Market-data bridge unavailable; scanner cannot load NSE/BSE quotes.');
 throw new Error('Market-data bridge unavailable; scanner cannot load NSE/BSE quotes.');
}

// -- Fetch all products -------------------------------------------
async function fetchProducts(options = {}) {
 if (typeof globalThis.dhanFetchProductsForRenderer === 'function') {
 try {
  const products = await globalThis.dhanFetchProductsForRenderer({
   limit: Math.max(1, Number(options.limit || 3000)),
   universe: options.universe || 'fno_stocks',
   force: !!options.force,
  });
  const universe = globalThis.dhanLastUniverseMeta?.label || options.universe || 'Market universe';
  dlog(`Products: ${products.length} (${universe})`);
  return products;
 } catch (e) {
  dlog(`Product error: ${e.message}`);
  return [];
 }
 }
 dlog('Market-data bridge unavailable; product master cannot load.');
 return [];
}

// ================================================================
// SENTIMENT ENGINE
// ================================================================
function calcSentiment(ticker, prevOI) {
 if (!ticker) return { score: 0, label: 'neutral' };
 let score = 0;
 const fr = ticker.fundingRate || 0;
 if (fr > 0.05) score -= 2;
 else if (fr > 0.02) score -= 1;
 else if (fr < -0.05) score += 2;
 else if (fr < -0.02) score += 1;
 const curOI = ticker.oi || 0;
 if (prevOI && prevOI > 0 && curOI > 0) {
 const oiChg = (curOI - prevOI) / prevOI;
 if (oiChg > 0.1) score += 1;
 else if (oiChg < -0.1) score -= 1;
 }
 if (ticker.usdVol24h > 50000000) score += 1;
 if (ticker.change24h > 5) score += 1;
 else if (ticker.change24h < -5) score -= 1;
 const label = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'neutral';
 return { score: Math.max(-5, Math.min(5, score)), label };
}

// ================================================================
// ANALYSE ONE TIMEFRAME - v14 scoring (max 100)
// ================================================================
function analyseTF(candles, label, strat) {
 if (!candles || candles.length < 20) return { valid: false, label };
 const closes = candles.map(c => c.close);
 const e1 = strat.ema1 || 9, e2 = strat.ema2 || 30, e3 = strat.ema3 || 100;
 const maxP = Math.max(20, Math.floor(closes.length * 0.9));
 const p1 = Math.min(e1, maxP), p2 = Math.min(e2, maxP), p3 = Math.min(e3, maxP);

 const emaF = ema(closes, p1), emaM = ema(closes, p2), emaS = ema(closes, p3);
 if (!emaF || !emaM || !emaS) return { valid: false, label };
 const price = closes[closes.length - 1];
 const emaBull = emaF > emaM && emaM > emaS;
 const emaBear = emaF < emaM && emaM < emaS;
 const partBull = emaF > emaM || emaM > emaS;
 const partBear = emaF < emaM || emaM < emaS;
 const cross = emaCrossover(closes, p1, p2);

 const obvArr = obv(candles);
 const obvNow = obvArr[obvArr.length - 1];
 const obvSMA = sma(obvArr, Math.min(50, Math.floor(obvArr.length * 0.8)));
 const obvRefIdx = Math.max(0, obvArr.length - 6);
 const obvRef = obvArr[obvRefIdx] ?? obvNow;
 const obvRising = obvNow > obvRef;
 const obvFalling = obvNow < obvRef;
 const obvBull = obvSMA !== null ? obvNow > obvSMA : obvRising;
 const obvBear = obvSMA !== null ? obvNow < obvSMA : obvFalling;

 const rsiState = cardwellRSIState(closes, 14, 18);
 const rsiVal = rsiState.value;
 const rsiZone = rsiState.zone;
 const rDiv = rsiDivergence(closes, 30);
 const rRev = rsiReversals(closes, 30);
 const oDiv = obvDivergence(candles, 20);

 const useVwap = label !== '1D';
 const vwapData = useVwap ? vwap(candles) : null;
 let vwapUp = false, vwapDown = false;
 if (vwapData?.series?.length >= 6) {
 const vLast = vwapData.series[vwapData.series.length - 1];
 const vPrev = vwapData.series[vwapData.series.length - 6];
 if (isFinite(vLast) && isFinite(vPrev) && Math.abs(vPrev) > 0) {
 const slopePct = (vLast - vPrev) / Math.abs(vPrev);
 vwapUp = slopePct > 0.0005;
 vwapDown = slopePct < -0.0005;
 }
 }
 const vwapFlat = !vwapUp && !vwapDown;

 const msLookback = label === '1D' ? 80 : 40;
 const ms = marketStructure(candles, Math.min(msLookback, candles.length));
 const tr = trendStrength(closes, 20);
 const mc = macd(closes);

 function rsiScore(dir, state) {
 const rv = Number(state?.value);
 if (!Number.isFinite(rv)) return 0;
 if (dir === 'long') {
 if (state.regime === 'bull_range') {
 if (state.bullSupportZone) return 15;
 if (rv >= 50 && rv < 65) return 12;
 if (rv >= 65 && rv <= 80) return 10;
 if (rv > 80) return 8;
 if (rv >= 35) return 5;
 return 2;
 }
 if (state.bullishShift) return 12;
 if (state.regime === 'bear_range') {
 if (rv >= 60) return 7;
 if (rv >= 50) return 4;
 return 0;
 }
 if (rv >= 45 && rv <= 60) return 8;
 if (rv > 60) return 6;
 if (rv >= 35) return 5;
 return 0;
 }
 if (state.regime === 'bear_range') {
 if (state.bearResistanceZone) return 15;
 if (rv >= 35 && rv < 50) return 12;
 if (rv >= 20 && rv < 35) return 10;
 if (rv < 20) return 8;
 if (rv <= 65) return 6;
 return 2;
 }
 if (state.bearishShift) return 12;
 if (state.regime === 'bull_range') {
 if (rv <= 40) return 7;
 if (rv <= 50) return 4;
 return 0;
 }
 if (rv >= 40 && rv <= 55) return 8;
 if (rv < 40) return 6;
 if (rv <= 65) return 5;
 return 0;
 }

 const longEma = (price > emaS ? 10 : 0) + (price > emaM ? 8 : 0) + (price > emaF ? 7 : 0);
 const shortEma = (price < emaS ? 10 : 0) + (price < emaM ? 8 : 0) + (price < emaF ? 7 : 0);

 const longStructure = ms?.bullish ? 12 : (ms?.bearish ? 0 : 5);
 const shortStructure = ms?.bearish ? 12 : (ms?.bullish ? 0 : 5);

 let longMacd = 0, shortMacd = 0;
 if (mc) {
 const longHistSupport = mc.histogram > 0;
 const shortHistSupport = mc.histogram < 0;
 if (mc.bullCross && longHistSupport) longMacd = 10;
 else if (longHistSupport) longMacd = 6;
 if (mc.bearCross && shortHistSupport) shortMacd = 10;
 else if (shortHistSupport) shortMacd = 6;
 }

 let longObv = 6, shortObv = 6;
 if (obvBull && obvRising) {
 longObv = 15;
 shortObv = 0;
 } else if (obvBear && obvFalling) {
 longObv = 0;
 shortObv = 15;
 }

 let longVwap = 0, shortVwap = 0;
 if (vwapData) {
 if (vwapData.priceAbove && vwapUp) longVwap = 10;
 else if (vwapData.priceAbove && vwapFlat) longVwap = 7;
 if (!vwapData.priceAbove && vwapDown) shortVwap = 10;
 else if (!vwapData.priceAbove && vwapFlat) shortVwap = 7;
 }

 const longTrend = tr >= 0.62 ? 8 : tr >= 0.55 ? 4 : 0;
 const shortTrend = tr <= 0.38 ? 8 : tr <= 0.45 ? 4 : 0;

 const longBonus = Math.min(5, (cross.bull ? 3 : 0) + ((emaBull && ms?.bullish && (!useVwap || vwapData?.priceAbove) && obvBull) ? 2 : 0));
 const shortBonus = Math.min(5, (cross.bear ? 3 : 0) + ((emaBear && ms?.bearish && (!useVwap || (vwapData && !vwapData.priceAbove)) && obvBear) ? 2 : 0));
 const longCardwellBonus = Math.min(5, (rsiState.bullishShift ? 2 : 0) + (rRev.positive ? 3 : 0));
 const shortCardwellBonus = Math.min(5, (rsiState.bearishShift ? 2 : 0) + (rRev.negative ? 3 : 0));

 const longPts = {
 ema: longEma,
 obv: longObv,
 rsi: rsiScore('long', rsiState),
 vwap: longVwap,
 vwapMax: useVwap ? 10 : 0,
 structure: longStructure,
 trend: longTrend,
 macd: longMacd,
 bonuses: Math.min(8, longBonus + longCardwellBonus),
 price: 0,
 };
 const shortPts = {
 ema: shortEma,
 obv: shortObv,
 rsi: rsiScore('short', rsiState),
 vwap: shortVwap,
 vwapMax: useVwap ? 10 : 0,
 structure: shortStructure,
 trend: shortTrend,
 macd: shortMacd,
 bonuses: Math.min(8, shortBonus + shortCardwellBonus),
 price: 0,
 };

 const longTotal = Math.min(100, longPts.ema + longPts.obv + longPts.rsi + longPts.vwap + longPts.structure + longPts.trend + longPts.macd + longPts.bonuses);
 const shortTotal = Math.min(100, shortPts.ema + shortPts.obv + shortPts.rsi + shortPts.vwap + shortPts.structure + shortPts.trend + shortPts.macd + shortPts.bonuses);
 const activeDir = shortTotal > longTotal ? 'short' : (longTotal > shortTotal ? 'long' : (emaBear || cross.bear ? 'short' : 'long'));
 const score = activeDir === 'long' ? longTotal : shortTotal;
 const spike = volSpike(candles, 1.5);
 const vc = volumeClimax(candles, 20);
 const vp = volumeProfile(candles);
 const atrVal = atr(candles, 14);

 return {
 valid: true, label, score, price: +price.toFixed(6),
 emaBull, emaBear, partBull, partBear, obvBull, obvBear,
 rsi: rsiVal, rsiZone, rsiRegime: rsiState.regime,
 rsiBullishShift: rsiState.bullishShift,
 rsiBearishShift: rsiState.bearishShift,
 rsiSupportZone: rsiState.bullSupportZone,
 rsiResistanceZone: rsiState.bearResistanceZone,
 rsiPositiveReversal: rRev.positive,
 rsiNegativeReversal: rRev.negative,
 rsiDivStrength: rDiv.strength,
 rsiReversalStrength: rRev.strength,
 trendRatio: +tr.toFixed(2), spike,
 emaF: +emaF.toFixed(6), emaM: +emaM.toFixed(6), emaS: +emaS.toFixed(6),
 atr: +atrVal.toFixed(6),
 vwap: vwapData ? +vwapData.value.toFixed(6) : null,
 vwapAbove: vwapData?.priceAbove ?? null,
 volumeProfile: vp,
 marketStructure: ms,
 volumeClimax: vc,
 emaCross: cross.bull ? 'bull' : cross.bear ? 'bear' : null,
 rsiDivergence: rDiv.bull ? 'bull' : rDiv.bear ? 'bear' : null,
 rsiDivergenceRole: rDiv.bull ? 'bounce' : rDiv.bear ? 'correction' : null,
 obvDivergence: oDiv.bull ? 'bull' : oDiv.bear ? 'bear' : null,
 macdSignal: mc ? (mc.bullCross ? 'bull_cross' : mc.bearCross ? 'bear_cross' : mc.increasing ? 'rising' : 'falling') : null,
 pts: activeDir === 'long' ? longPts : shortPts,
 };
}

// ================================================================
// ANALYSE ONE COIN
// ================================================================
function analyseCoin(symbol, dCandles, m2Candles, ticker, strat, marketContextInput) {
 const daily = analyseTF(dCandles, '1D', strat);
 const lower = analyseTF(m2Candles, strat.tf2 || '4h', strat);
 if (!daily.valid && !lower.valid) return null;
 const marketContext = resolveMarketContext(marketContextInput, strat);

 const dS = daily.valid ? daily.score : 0;
 const lS = lower.valid ? lower.score : 0;
 let avgScore = (daily.valid && lower.valid)
 ? Math.round(dS * 0.45 + lS * 0.55)
 : (daily.valid ? dS : lS);

 // Market-adaptive + session boost
 const session = getMarketSession();
 const sessionMult = SESSION_BOOST[session] || 1;
 if (marketContext.condition === 'bull' || marketContext.condition === 'euphoric') {
 if (daily.valid && daily.emaBull) avgScore = Math.min(avgScore + 5, 100);
 } else if (marketContext.condition === 'bear' || marketContext.condition === 'crash') {
 if (daily.valid && daily.emaBear) avgScore = Math.min(avgScore + 5, 100);
 }
 avgScore = Math.min(Math.round(avgScore * sessionMult), 100);

 const dBull = daily.valid && (daily.emaBull || daily.emaCross === 'bull');
 const dBear = daily.valid && (daily.emaBear || daily.emaCross === 'bear');
 const lBull = lower.valid && (lower.emaBull || lower.emaCross === 'bull');
 const lBear = lower.valid && (lower.emaBear || lower.emaCross === 'bear');
 const rsiContBull = daily.valid && (daily.rsiBullishShift || daily.rsiPositiveReversal);
 const rsiContBear = daily.valid && (daily.rsiBearishShift || daily.rsiNegativeReversal);
 const obvDivBull = daily.valid && daily.obvDivergence === 'bull';
 const obvDivBear = daily.valid && daily.obvDivergence === 'bear';
 const dMsBull = daily.valid && daily.marketStructure?.bullish;
 const dMsBear = daily.valid && daily.marketStructure?.bearish;
 const lMsBull = lower.valid && lower.marketStructure?.bullish;
 const lMsBear = lower.valid && lower.marketStructure?.bearish;
 const lPriceBull = lower.valid && lower.price > lower.emaM && lower.price > lower.emaS;
 const lPriceBear = lower.valid && lower.price < lower.emaM && lower.price < lower.emaS;
 const lVwapBull = lower.valid && lower.vwapAbove === true;
 const lVwapBear = lower.valid && lower.vwapAbove === false;

 // Direction engine: prioritize lower-TF market structure + price/EMA + VWAP + EMA cross.
 let bullVotes = 0;
 let bearVotes = 0;
 if (lMsBull) bullVotes += 5;
 if (lMsBear) bearVotes += 5;
 if (lPriceBull) bullVotes += 4;
 if (lPriceBear) bearVotes += 4;
 if (lVwapBull) bullVotes += 3;
 if (lVwapBear) bearVotes += 3;
 if (lower.emaCross === 'bull') bullVotes += 3;
 if (lower.emaCross === 'bear') bearVotes += 3;
 if (dMsBull) bullVotes += 3;
 if (dMsBear) bearVotes += 3;
 if (dBull) bullVotes += 2;
 if (dBear) bearVotes += 2;
 if (rsiContBull) bullVotes += 2;
 if (rsiContBear) bearVotes += 2;
 if (obvDivBull) bullVotes += 1;
 if (obvDivBear) bearVotes += 1;

 const voteGap = bullVotes - bearVotes;
 const longCore = lMsBull && lPriceBull && lVwapBull;
 const shortCore = lMsBear && lPriceBear && lVwapBear;
 const dailyOpposesLong = daily.valid && (dBear || dMsBear || daily.rsiBearishShift || daily.rsiNegativeReversal);
 const dailyOpposesShort = daily.valid && (dBull || dMsBull || daily.rsiBullishShift || daily.rsiPositiveReversal);

 let direction = 'watch_long';
 if (longCore && !dailyOpposesLong && (dBull || dMsBull || voteGap >= 3)) {
 direction = 'long';
 } else if (shortCore && !dailyOpposesShort && (dBear || dMsBear || voteGap <= -3)) {
 direction = 'short';
 } else if (voteGap >= 6) {
 direction = 'long';
 } else if (voteGap <= -6) {
 direction = 'short';
 } else if (voteGap > 0) {
 direction = 'watch_long';
 } else if (voteGap < 0) {
 direction = 'watch_short';
 } else if (dBull || lBull || rsiContBull || obvDivBull) {
 direction = 'watch_long';
 } else if (dBear || lBear || rsiContBear || obvDivBear) {
 direction = 'watch_short';
 }

 // Final guardrail against trend mislabelling on 4H.
 if (direction === 'long' && (lMsBear || lPriceBear || lVwapBear)) {
 direction = 'watch_long';
 avgScore = Math.max(0, avgScore - 6);
 }
 if (direction === 'short' && (lMsBull || lPriceBull || lVwapBull)) {
 direction = 'watch_short';
 avgScore = Math.max(0, avgScore - 6);
 }

 // Strict MTF guardrail: if daily is opposite, do not allow confirmed long/short.
 let downgradedByDailyConflict = false;
 if (direction === 'long' && dailyOpposesLong) {
 direction = 'watch_long';
 downgradedByDailyConflict = true;
 avgScore = Math.max(0, avgScore - 16);
 avgScore = Math.min(avgScore, 74);
 }
 if (direction === 'short' && dailyOpposesShort) {
 direction = 'watch_short';
 downgradedByDailyConflict = true;
 avgScore = Math.max(0, avgScore - 16);
 avgScore = Math.min(avgScore, 74);
 }

 // Penalize opposite 1D vs lower-TF regime even when still directional.
 const oppositeRegime = (dMsBull && lMsBear) || (dMsBear && lMsBull) || (dBull && lBear) || (dBear && lBull);
 if (oppositeRegime) {
 avgScore = Math.max(0, avgScore - 10);
 }

 const price = ticker?.price || daily.price || lower.price || 0;
 const atrV = daily.valid && daily.atr > 0 ? daily.atr : (lower.valid ? lower.atr : 0);
 const riskTemplate = analysisResolveRiskTemplateForSymbol(symbol, strat?.riskTemplates || {});
 const stopAtrMultiplier = Math.max(0.1, Number(riskTemplate?.atrStopMultiplier || 1.5));
 const targetRR = Math.max(0.1, Number(riskTemplate?.targetRR || 2));
 const stopDistance = Math.max(0, atrV * stopAtrMultiplier);
 const targetDistance = stopDistance * targetRR;
 const secondaryTargetDistance = targetDistance * 1.5;
 const tertiaryTargetDistance = targetDistance * 2;
 const quaternaryTargetDistance = targetDistance * 2.5;
 const keyLevels = detectKeyLevels(dCandles, m2Candles, price, strat?.keyLevelSettings || {});
 const klBias = keyLevelBias(price, direction, keyLevels, atrV);
 avgScore = Math.max(0, Math.min(100, Math.round(avgScore + klBias.scoreAdj)));
 if (klBias.blockLong && direction === 'long') direction = 'watch_long';
 if (klBias.blockShort && direction === 'short') direction = 'watch_short';
 const mtfConfirmed = direction === 'long' || direction === 'short';
 const dailyConfirmation = direction === 'long'
 ? { passed: !!(daily.valid && (dBull || dMsBull) && !dailyOpposesLong), side: 'long' }
 : direction === 'short'
 ? { passed: !!(daily.valid && (dBear || dMsBear) && !dailyOpposesShort), side: 'short' }
 : { passed: false, side: direction.includes('short') ? 'short' : 'long' };

 const isBull = direction.includes('long');
 // Use pricePrecision() instead of toFixed(4) - prevents micro-price coins
 // (e.g. $0.000012) from having their SL/TP rounded to zero.
 const sl = isBull
 ? ensurePositivePrice(price - stopDistance, price)
 : pricePrecision(price + stopDistance);
 const tp1 = isBull
 ? pricePrecision(price + targetDistance)
 : ensurePositivePrice(price - targetDistance, price);
 const tp2 = isBull
 ? pricePrecision(price + secondaryTargetDistance)
 : ensurePositivePrice(price - secondaryTargetDistance, price);
 const tp3 = isBull
 ? pricePrecision(price + tertiaryTargetDistance)
 : ensurePositivePrice(price - tertiaryTargetDistance, price);
 const tp4 = isBull
 ? pricePrecision(price + quaternaryTargetDistance)
 : ensurePositivePrice(price - quaternaryTargetDistance, price);
 const rr = stopDistance > 0 && targetDistance > 0 ? +(targetDistance / stopDistance).toFixed(1) : 0;

 const spike = (daily.valid && daily.spike) || (lower.valid && lower.spike);

 // Sparklines - last 20 daily closes for mini chart
 const sparkline = dCandles ? dCandles.slice(-20).map(c => +c.close.toFixed(6)) : [];

 // Reasons
 const reasons = [];
 if (mtfConfirmed) reasons.push('MTF aligned');
 if (dailyConfirmation.passed) reasons.push(`1D confirms ${dailyConfirmation.side}`);
 if (daily.emaCross) reasons.push(`Daily EMA ${daily.emaCross} cross`);
 if (lower.emaCross) reasons.push(`${strat.tf2 || '4h'} EMA ${lower.emaCross} cross`);
 if (lower.marketStructure) reasons.push(`${strat.tf2 || '4h'} structure: ${lower.marketStructure.structure}`);
 if (lower.vwapAbove !== null) reasons.push(
 `${strat.tf2 || '4h'} ${lower.vwapAbove ? 'above' : 'below'} VWAP`
 );
 if (daily.rsiBullishShift) reasons.push('RSI bullish range shift');
 if (daily.rsiBearishShift) reasons.push('RSI bearish range shift');
 if (daily.rsiSupportZone) reasons.push('RSI bull support zone (40-50)');
 if (daily.rsiResistanceZone) reasons.push('RSI bear resistance zone (50-60)');
 if (daily.rsiPositiveReversal) reasons.push(`RSI positive reversal (str:${daily.rsiReversalStrength || 0})`);
 if (daily.rsiNegativeReversal) reasons.push(`RSI negative reversal (str:${daily.rsiReversalStrength || 0})`);
 if (daily.rsiDivergence) reasons.push(`RSI ${daily.rsiDivergence} div = ${daily.rsiDivergenceRole} (str:${daily.rsiDivStrength})`);
 if (daily.obvDivergence) reasons.push(`OBV ${daily.obvDivergence} div`);
 if (daily.macdSignal?.includes('cross')) reasons.push(`MACD ${daily.macdSignal}`);
 if (spike) reasons.push('Volume spike');
 if (daily.volumeProfile) reasons.push(`VP: ${daily.volumeProfile.priceVsVA}`);
 if (daily.marketStructure) reasons.push(`Structure: ${daily.marketStructure.structure}`);
 if (downgradedByDailyConflict) reasons.push('1D opposes lower-TF direction');
 if (keyLevels.resistance.length || keyLevels.support.length) {
 const rTxt = keyLevels.resistance.map(l => fmtLevel(l.price)).join(', ');
 const sTxt = keyLevels.support.map(l => fmtLevel(l.price)).join(', ');
 if (rTxt) reasons.push(`R: ${rTxt}`);
 if (sTxt) reasons.push(`S: ${sTxt}`);
 }
 if (klBias.blockLong || klBias.blockShort) reasons.push('Near key level');
 if (daily.volumeClimax?.isClimax) {
 reasons.push(daily.volumeClimax.exhaustion ? 'Vol climax exhaustion' :
 daily.volumeClimax.isBuyingClimax ? 'Buying climax' : 'Selling climax');
 }

 const emergingMove = classifyEmergingMove(daily, lower, ticker);
 const setupFamily = classifySetupFamily({
 ticker,
 fundingRate: ticker?.fundingRate || 0,
 change24h: ticker?.change24h || 0,
 daily: daily.valid ? daily : null,
 lower: lower.valid ? lower : null,
 direction,
 mtfConfirmed,
 emergingMove,
 spike,
 }, marketContext.regime);
 const rawScore = avgScore;
 const executionRisk = buildExecutionRiskProfile({
 symbol,
 price,
 volume24h: ticker?.usdVol24h || ticker?.volume24h || 0,
 oi: ticker?.oi || 0,
 daily: daily.valid ? daily : null,
 lower: lower.valid ? lower : null,
 ticker,
 });
 const regimeAdjustment = applyRegimeScoreAdjustment(avgScore, marketContext, {
 ticker,
 fundingRate: ticker?.fundingRate || 0,
 daily: daily.valid ? daily : null,
 lower: lower.valid ? lower : null,
 direction,
 mtfConfirmed,
 emergingMove,
 spike,
 });
 avgScore = regimeAdjustment.score;
 if (direction.startsWith('watch') && avgScore > 79) avgScore = 79;

 const instrumentDescription = describeDeltaInstrument(symbol);
 const assetInfo = classifyDeltaInstrument(symbol, instrumentDescription);
 return {
 symbol, price, sector: assetInfo.sector || getSector(symbol),
 name: instrumentDescription,
 instrumentDescription,
 assetClass: assetInfo.assetClass,
 assetLabel: assetInfo.assetLabel,
 assetBadge: assetInfo.assetBadge,
 assetInfo: assetInfo.info,
 assetDisplayName: assetInfo.displayName,
 underlyingSymbol: assetInfo.underlyingSymbol,
 underlyingName: assetInfo.underlyingName,
 change24h: ticker?.change24h || 0,
 volume24h: ticker?.usdVol24h || ticker?.volume24h || 0,
 oi: ticker?.oi || 0,
 fundingRate: ticker?.fundingRate || 0,
 nextFundingAt: ticker?.nextFundingAt || 0,
 fundingIntervalSeconds: ticker?.fundingIntervalSeconds || 28800,
 executionRisk,
 estimatedSpreadPct: executionRisk.estimatedSpreadPct,
 estimatedExtraSlippagePct: executionRisk.extraSlippagePct,
 direction, mtfConfirmed, score: avgScore,
 dailyConfirmation,
 rawScore,
 marketRegime: marketContext.regime,
 activeThresholds: marketContext.thresholds,
 regimeScoreDelta: regimeAdjustment.delta,
 emergingMove,
 setupFamily: setupFamily.family,
 setupFamilyLabel: setupFamily.label,
 setupFamilyConfidence: setupFamily.confidence,
 setupFamilyAllowedInRegime: setupFamily.allowedInRegime,
 setupFamilyTone: setupFamily.tone,
 daily: daily.valid ? daily : null,
 lower: lower.valid ? lower : null,
 keyLevels,
 entry: price, sl, tp1, tp2, tp3, tp4, rr, riskTemplate, spike, reasons, sparkline,
 session, ts: Date.now(),
 };
}

// ================================================================
// MARKET INDEX (FWD-10)
// ================================================================
