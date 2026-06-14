const {
 AUTO_SHORTLIST_LIMIT,
 AUTO_SCAN_INTERVAL_DEFAULT,
 MAX_SIGNAL_PERSISTENCE_POINTS,
 TIER_PRIORITY,
 buildDecisionShortlist,
 buildRelativeStrengthSnapshot,
 buildTradeQuality,
 classifySymbolMaturity: scanClassifySymbolMaturity,
 computeLeadershipState,
 computeSectorBreadth,
 deriveSignalPersistence,
 formatIndiaTime: scanFormatIndiaTime,
 formatThresholdSummary,
 mergeWatchlists,
 sanitizeKeyLevelSettings: scanSanitizeKeyLevelSettings,
 sanitizeChartDefaults: scanSanitizeChartDefaults,
 sanitizeMarketIndexSettings: scanSanitizeMarketIndexSettings,
 sanitizeRiskTemplates: scanSanitizeRiskTemplates,
 sanitizeChartCacheEnabled: scanSanitizeChartCacheEnabled,
 resolveRiskTemplateForSymbol: scanResolveRiskTemplateForSymbol,
 classifyDeltaInstrument: scanClassifyDeltaInstrument,
 describeDeltaInstrument: scanDescribeDeltaInstrument,
} = globalThis.FWDTradeDeskShared;

function buildDecisionState(results = [], marketIndex = null, manualWatchlist = []) {
 const shortlist = buildDecisionShortlist(results, {
 thresholds: marketIndex?.thresholds || {},
 leadershipState: marketIndex?.leadership?.state || 'mixed',
 limit: AUTO_SHORTLIST_LIMIT,
 });
 const autoWatchlist = shortlist.map(signal => signal.symbol);
 const mergedWatchlist = mergeWatchlists(manualWatchlist, autoWatchlist);
 return {
 shortlist,
 autoWatchlist,
 mergedWatchlist,
 };
}

const CLOSED_CANDLE_FETCH_OPTIONS = Object.freeze({ closedOnly: true });
const SCAN_CANDLE_PACE_MS = 1800;
const SCAN_CANDLE_TIMEOUT_MS = 4 * 60 * 1000;
const SCAN_CANDLE_FETCH_OPTIONS = Object.freeze({
 closedOnly: true,
 force: true,
 throwOnError: true,
 timeoutMs: SCAN_CANDLE_TIMEOUT_MS,
 paceMs: SCAN_CANDLE_PACE_MS,
});
const SCAN_RESUME_CHECKPOINT_KEY = 'mainScanResumeCheckpointV1';
const SCAN_TRANSIENT_RETRY_LIMIT = 3;
const SCAN_TRANSIENT_RETRY_DEFAULT_MS = 2 * 60 * 1000;
const SCAN_CONTEXT_DAILY_CANDLES = 3650;
const SCANNER_ALLOWED_TIMEFRAMES = new Set(['4h', '1d']);
const SCANNER_UNIVERSE_DEFAULT = 'fno_stocks';
const SCANNER_UNIVERSE_LIMITS = Object.freeze({
 fno_stocks: 600,
 nifty500: 700,
 midcap150: 250,
 smallcap250: 400,
 all_nse: 3500,
 nse_rest: 1200,
 nse_af: 900,
 nse_gl: 900,
 nse_mr: 900,
 nse_sz: 900,
 all_bse: 3500,
 bse_only: 1200,
 bse_af: 900,
 bse_gl: 900,
 bse_mr: 900,
 bse_sz: 900,
});
const SCANNER_UNIVERSE_LABELS = Object.freeze({
 fno_stocks: 'F&O Stocks',
 nifty500: 'Nifty 500',
 midcap150: 'Midcap 150',
 smallcap250: 'Smallcap 250',
 all_nse: 'All NSE Equity',
 nse_rest: 'NSE Rest',
 nse_af: 'NSE A-F',
 nse_gl: 'NSE G-L',
 nse_mr: 'NSE M-R',
 nse_sz: 'NSE S-Z',
 all_bse: 'All BSE Equity',
 bse_only: 'BSE Only',
 bse_af: 'BSE A-F',
 bse_gl: 'BSE G-L',
 bse_mr: 'BSE M-R',
 bse_sz: 'BSE S-Z',
});
const SCANNER_MODE_DEFAULT = 'standard';
const SCANNER_MODES = new Set(['standard', 'penny_awakening']);
const SCAN_UNIVERSE_SNAPSHOTS_KEY = 'scanUniverseSnapshotsV1';
const FULL_MARKET_BREADTH_DEEP_SCAN_LIMIT = 900;
const CHUNK_BREADTH_DEEP_SCAN_LIMIT = 650;
const PENNY_AWAKENING_DEEP_SCAN_LIMIT = 350;
const PENNY_AWAKENING_PRICE_MAX = 200;
const PENNY_AWAKENING_PRICE_MIN = 1;
const PENNY_AWAKENING_MIN_TURNOVER = 100000;

function sanitizeScanMode(value = '') {
 const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
 return SCANNER_MODES.has(raw) ? raw : SCANNER_MODE_DEFAULT;
}

function sanitizeScanTimeframe(value = '', fallback = '4h') {
 const raw = String(value || '').trim().toLowerCase();
 if (SCANNER_ALLOWED_TIMEFRAMES.has(raw)) return raw;
 if (raw === '1h' || raw === '60' || raw === '60m' || raw === '240') return '4h';
 if (raw === '1wk' || raw === 'w' || raw === 'week' || raw === 'weekly') return '1d';
 if (raw === 'd' || raw === 'day' || raw === 'daily') return '1d';
 if (raw === '5m' || raw === '3m' || raw === '1m' || raw === '15') return '4h';
 return SCANNER_ALLOWED_TIMEFRAMES.has(fallback) ? fallback : '4h';
}

function sanitizeScanUniverseId(value = '') {
 if (typeof globalThis.normalizeDhanScannerUniverse === 'function') return globalThis.normalizeDhanScannerUniverse(value);
 const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
 if (['nifty500', 'nifty_500'].includes(raw)) return 'nifty500';
 if (['midcap150', 'midcap_150', 'midcap'].includes(raw)) return 'midcap150';
 if (['smallcap250', 'smallcap_250', 'smallcap'].includes(raw)) return 'smallcap250';
 if (['all_nse', 'all', 'nse'].includes(raw)) return 'all_nse';
 if (['nse_rest', 'nse_remaining', 'nse_uncovered', 'nse_ex_overlap', 'nse_ex_core'].includes(raw)) return 'nse_rest';
 if (['all_bse', 'bse'].includes(raw)) return 'all_bse';
 if (['bse_only', 'bse_unique', 'bse_ex_nse', 'bse_not_nse'].includes(raw)) return 'bse_only';
 if (['nse_a_f', 'nse_af', 'nse_1', 'nse_chunk_1'].includes(raw)) return 'nse_af';
 if (['nse_g_l', 'nse_gl', 'nse_2', 'nse_chunk_2'].includes(raw)) return 'nse_gl';
 if (['nse_m_r', 'nse_mr', 'nse_3', 'nse_chunk_3'].includes(raw)) return 'nse_mr';
 if (['nse_s_z', 'nse_sz', 'nse_4', 'nse_chunk_4'].includes(raw)) return 'nse_sz';
 if (['bse_a_f', 'bse_af', 'bse_1', 'bse_chunk_1'].includes(raw)) return 'bse_af';
 if (['bse_g_l', 'bse_gl', 'bse_2', 'bse_chunk_2'].includes(raw)) return 'bse_gl';
 if (['bse_m_r', 'bse_mr', 'bse_3', 'bse_chunk_3'].includes(raw)) return 'bse_mr';
 if (['bse_s_z', 'bse_sz', 'bse_4', 'bse_chunk_4'].includes(raw)) return 'bse_sz';
 return 'fno_stocks';
}

function isFullMarketUniverse(universe = '') {
 return ['all_nse', 'all_bse'].includes(sanitizeScanUniverseId(universe));
}

function isChunkedMarketUniverse(universe = '') {
 return /^(nse|bse)_(af|gl|mr|sz)$/.test(sanitizeScanUniverseId(universe)) || ['nse_rest', 'bse_only'].includes(sanitizeScanUniverseId(universe));
}

function resolveScanLimitForUniverse(universe = SCANNER_UNIVERSE_DEFAULT, configuredLimit = 0) {
 const safeUniverse = sanitizeScanUniverseId(universe);
 const cap = SCANNER_UNIVERSE_LIMITS[safeUniverse] || SCANNER_UNIVERSE_LIMITS.fno_stocks;
 const requested = Number(configuredLimit || 0);
 const fallback = isFullMarketUniverse(safeUniverse) ? 900 : isChunkedMarketUniverse(safeUniverse) ? 650 : safeUniverse === 'nifty500' ? 500 : safeUniverse === 'midcap150' ? 150 : safeUniverse === 'smallcap250' ? 250 : 250;
 if (isFullMarketUniverse(safeUniverse)) return Math.min(cap, Math.max(fallback, requested > 10 ? requested : fallback));
 return Math.min(cap, Math.max(20, requested > 10 ? requested : fallback));
}

function resolveDeepScanLimitForStrategy(strategy = {}, quoteLimit = 0) {
 const universe = sanitizeScanUniverseId(strategy.scanUniverse || SCANNER_UNIVERSE_DEFAULT);
 const mode = sanitizeScanMode(strategy.scanMode || SCANNER_MODE_DEFAULT);
 const requested = Math.max(20, Number(quoteLimit || strategy.maxCoins || 250) || 250);
 if (mode === 'penny_awakening' && !isFullMarketUniverse(universe)) return Math.min(requested, PENNY_AWAKENING_DEEP_SCAN_LIMIT);
 if (isChunkedMarketUniverse(universe)) return Math.min(requested, CHUNK_BREADTH_DEEP_SCAN_LIMIT);
 if (isFullMarketUniverse(universe)) return Math.min(requested, FULL_MARKET_BREADTH_DEEP_SCAN_LIMIT);
 return requested;
}

function getScanUniverseStatusLabel(universe = SCANNER_UNIVERSE_DEFAULT) {
 return SCANNER_UNIVERSE_LABELS[sanitizeScanUniverseId(universe)] || String(universe || 'market universe');
}

async function buildScanUniverseSnapshotPatch(universe = SCANNER_UNIVERSE_DEFAULT, snapshot = {}) {
 const key = sanitizeScanUniverseId(universe || SCANNER_UNIVERSE_DEFAULT);
 const existing = await new Promise(resolve => chrome.storage.local.get([SCAN_UNIVERSE_SNAPSHOTS_KEY], data => resolve(data?.[SCAN_UNIVERSE_SNAPSHOTS_KEY] || {}))).catch(() => ({}));
 const next = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
 next[key] = {
  ...(snapshot || {}),
  universe: key,
  savedAt: Date.now(),
 };
 return { [SCAN_UNIVERSE_SNAPSHOTS_KEY]: next };
}

function describeScanCandidateInstrument(candidate = {}) {
 const instrument = candidate?.dhanInstrument || candidate?.instrument || {};
 const exchangeSegment = String(candidate.exchangeSegment || instrument.exchangeSegment || '').trim().toUpperCase();
 const securityId = String(candidate.securityId || instrument.securityId || '').trim();
 const type = String(candidate.contractType || instrument.instrument || '').trim().toUpperCase();
 return [exchangeSegment, securityId ? `sid ${securityId}` : '', type].filter(Boolean).join(' / ') || 'instrument unknown';
}

function scanFormatInr(value, decimals = 4) {
 const num = Number(value || 0);
 if (!Number.isFinite(num) || !(num > 0)) return 'Rs -';
 return `Rs ${num.toLocaleString('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: Math.max(0, Number(decimals || 0)),
 })}`;
}

function resolveScannerSector(symbol = '', candidate = {}) {
 const instrument = candidate?.dhanInstrument || candidate?.instrument || {};
 const direct = String(candidate?.sector || instrument?.sector || '').trim();
 if (direct && !/^(NSE|BSE|NSE_EQ|BSE_EQ|OTHER)$/i.test(direct)) return direct;
 const resolver = globalThis.FWDTradeDeskShared?.getIndianEquitySector;
 const fromIndianMap = typeof resolver === 'function' ? resolver(symbol || candidate?.symbol || instrument?.tradingSymbol || instrument?.symbol || '') : '';
 if (fromIndianMap) return fromIndianMap;
 return getSector(symbol || candidate?.symbol || instrument?.tradingSymbol || instrument?.symbol || '');
}

function averageVolumeFromCandles(candles = [], period = 20) {
 const rows = (Array.isArray(candles) ? candles : []).filter(row => Number(row?.volume || 0) > 0);
 if (!rows.length) return 0;
 const sample = rows.slice(-Math.max(1, Number(period || 20)));
 return sample.reduce((sum, row) => sum + Number(row.volume || 0), 0) / sample.length;
}

function scorePennyAwakeningQuote(candidate = {}) {
 const ticker = candidate.ticker || {};
 const price = Number(ticker.price || 0);
 const changePct = Number(ticker.change24h || 0);
 const volume = Number(ticker.volume24h || 0);
 const turnover = Number(ticker.inrTurnover24h || ticker.turnover24h || ticker.usdVol24h || 0);
 if (!(price >= PENNY_AWAKENING_PRICE_MIN && price <= PENNY_AWAKENING_PRICE_MAX) || !(volume > 0)) return 0;
 let score = 20;
 score += Math.min(25, Math.max(0, changePct) * 2.5);
 score += Math.min(25, Math.log10(Math.max(10, turnover)) * 3);
 if (turnover >= PENNY_AWAKENING_MIN_TURNOVER) score += 10;
 if (price <= 50) score += 8;
 if (price <= 20) score += 7;
 return Math.round(Math.max(0, Math.min(100, score)));
}

function buildPennyAwakeningInsight(symbol = '', dailyCandles = [], intradayCandles = [], ticker = {}) {
 const daily = Array.isArray(dailyCandles) ? dailyCandles : [];
 const intraday = Array.isArray(intradayCandles) ? intradayCandles : [];
 const latestDaily = daily[daily.length - 1] || {};
 const price = Number(ticker.price || latestDaily.close || 0);
 const volume = Number(ticker.volume24h || latestDaily.volume || 0);
 const turnover = Number(ticker.inrTurnover24h || ticker.turnover24h || ticker.usdVol24h || (price * volume) || 0);
 if (!(price >= PENNY_AWAKENING_PRICE_MIN && price <= PENNY_AWAKENING_PRICE_MAX)) return null;
 const priorDaily = daily.length > 1 ? daily.slice(0, -1) : daily;
 const avg20Volume = averageVolumeFromCandles(priorDaily, 20);
 const avg50Volume = averageVolumeFromCandles(priorDaily, 50);
 const relativeVolume20 = avg20Volume > 0 ? volume / avg20Volume : 0;
 const closes = daily.map(row => Number(row.close || 0)).filter(value => value > 0);
 const highs = priorDaily.map(row => Number(row.high || 0)).filter(value => value > 0);
 const high20 = highs.length ? Math.max(...highs.slice(-20)) : 0;
 const high50 = highs.length ? Math.max(...highs.slice(-50)) : 0;
 const sma10 = typeof sma === 'function' ? sma(closes, 10) : 0;
 const dayHigh = Number(ticker.dayHigh || latestDaily.high || 0);
 const dayLow = Number(ticker.dayLow || latestDaily.low || 0);
 const dayRange = Math.max(0, dayHigh - dayLow);
 const closePosition = dayRange > 0 ? ((price - dayLow) / dayRange) * 100 : 50;
 const intradayVolume = intraday.reduce((sum, row) => sum + Number(row.volume || 0), 0);
 let score = scorePennyAwakeningQuote({ ticker });
 if (relativeVolume20 >= 3) score += 12;
 if (relativeVolume20 >= 5) score += 12;
 if (relativeVolume20 >= 8) score += 10;
 if (high20 > 0 && price > high20) score += 12;
 if (high50 > 0 && price > high50) score += 8;
 if (sma10 > 0 && price > sma10) score += 5;
 if (closePosition >= 75) score += 8;
 if (turnover >= PENNY_AWAKENING_MIN_TURNOVER * 5) score += 6;
 const reasons = [];
 if (relativeVolume20 > 0) reasons.push(`Volume ${relativeVolume20.toFixed(1)}x 20D avg`);
 if (high20 > 0 && price > high20) reasons.push('Above 20D high');
 if (high50 > 0 && price > high50) reasons.push('Above 50D high');
 if (closePosition >= 75) reasons.push('Near day high');
 if (turnover > 0) reasons.push(`Turnover ${scanFormatInr(turnover, 0)}`);
 if (intradayVolume > 0) reasons.push('Intraday activity present');
 return {
  symbol: String(symbol || '').trim().toUpperCase(),
  score: Math.round(Math.max(0, Math.min(100, score))),
  relativeVolume20,
  avg20Volume,
  avg50Volume,
  high20,
  high50,
  closePosition,
  turnover,
  reasons,
  active: score >= 55 || relativeVolume20 >= 3 || (high20 > 0 && price > high20),
 };
}

function buildPennyAwakeningResult(symbol = '', dailyCandles = [], intradayCandles = [], ticker = {}, base = {}) {
 const insight = buildPennyAwakeningInsight(symbol, dailyCandles, intradayCandles, ticker);
 if (!insight || !insight.active) return null;
 const price = Number(ticker.price || dailyCandles?.[dailyCandles.length - 1]?.close || 0);
 const direction = Number(ticker.change24h || 0) >= 0 ? 'long' : 'watch';
 const atrValue = typeof atr === 'function' ? atr(dailyCandles, 14) : 0;
 const stopBuffer = Math.max(price * 0.05, atrValue || 0);
 return {
  ...base,
  symbol: insight.symbol,
  score: insight.score,
  rawScore: insight.score,
  direction,
  price,
  entry: price,
  sl: price > 0 ? pricePrecision(Math.max(0.01, price - stopBuffer)) : 0,
  tp1: price > 0 ? pricePrecision(price * 1.08) : 0,
  tp2: price > 0 ? pricePrecision(price * 1.16) : 0,
  rr: 1.6,
  change24h: Number(ticker.change24h || 0),
  volume24h: Number(ticker.volume24h || 0),
  turnover24h: insight.turnover,
  sector: base.sector || getSector(symbol),
  mtfConfirmed: insight.score >= 70,
  spike: true,
  setupLabel: 'Penny Awakening',
  scannerMode: 'penny_awakening',
  pennyAwakening: insight,
  reasons: [`Penny Awakening: ${insight.reasons.slice(0, 4).join(' | ') || 'unusual activity'}`],
  ts: Date.now(),
 };
}

function rankScanCandidates(candidates = [], strategy = {}, watchlist = new Set()) {
 const mode = sanitizeScanMode(strategy.scanMode || SCANNER_MODE_DEFAULT);
 return (Array.isArray(candidates) ? candidates : []).sort((a, b) => {
  const aPin = watchlist.has(a.symbol) ? 1 : 0;
  const bPin = watchlist.has(b.symbol) ? 1 : 0;
  if (aPin !== bPin) return bPin - aPin;
  const aPenny = scorePennyAwakeningQuote(a);
  const bPenny = scorePennyAwakeningQuote(b);
  if (mode === 'penny_awakening' && aPenny !== bPenny) return bPenny - aPenny;
  const aMove = Math.abs(Number(a.ticker?.change24h || 0));
  const bMove = Math.abs(Number(b.ticker?.change24h || 0));
  const aVolume = Number(a.ticker?.usdVol24h || 0);
  const bVolume = Number(b.ticker?.usdVol24h || 0);
  const aBlend = aVolume + (aPenny * 10000000) + (aMove * 1000000);
  const bBlend = bVolume + (bPenny * 10000000) + (bMove * 1000000);
  return bBlend - aBlend;
 });
}
const SCAN_PARTIAL_CHECKPOINT_EVERY = 20;
const STRATEGY_LAB_PARTIAL_DERIVE_MIN_MS = 75 * 1000;
let lastStrategyLabPartialDeriveAt = 0;
const MARKET_INDEX_HISTORY_LIMIT = 5000;
const MARKET_INDEX_HISTORY_SCHEMA_VERSION = 2;
const MARKET_INDEX_BASE_VALUE = 10000;
const MARKET_INDEX_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MARKET_INDEX_CHANGE_TARGET_TOLERANCE_MS = 90 * 60 * 1000;
const MARKET_INDEX_REBALANCE_DEFAULT_DAYS = 7;
const MARKET_INDEX_RETENTION_MULTIPLIER = 1.5;
const MARKET_INDEX_CORE_LOCK_RATIO = 0.7;
const DHAN_SCAN_INDEX_TAPE_DEFINITIONS = Object.freeze([
 { symbol: 'NIFTY', label: 'Nifty 50', shortLabel: 'N50', aliases: ['NIFTY', 'NIFTY 50'] },
 { symbol: 'BANKNIFTY', label: 'Bank Nifty', shortLabel: 'BANK', aliases: ['BANKNIFTY', 'NIFTY BANK'] },
 { symbol: 'FINNIFTY', label: 'Fin Nifty', shortLabel: 'FIN', aliases: ['FINNIFTY', 'NIFTY FINANCIAL SERVICES'] },
 { symbol: 'INDIA VIX', label: 'India VIX', shortLabel: 'VIX', aliases: ['INDIA VIX', 'INDIAVIX'] },
 { symbol: 'MIDCPNIFTY', label: 'Midcap Nifty', shortLabel: 'MID', aliases: ['MIDCPNIFTY', 'NIFTY MID SELECT'] },
 { symbol: 'NIFTYIT', label: 'Nifty IT', shortLabel: 'IT', aliases: ['NIFTYIT', 'NIFTY IT'] },
]);
const MARKET_INDEX_EXCLUDED_BASES = new Set([
 'USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD', 'USDP', 'PYUSD', 'GUSD',
 'PAXG', 'XAUT', 'XAN', 'SLVON',
 'BTCDOM',
]);

function applyFundingDecisionContext(results = [], threshold = 0) {
 const limit = Math.abs(Number(threshold || 0));
 (Array.isArray(results) ? results : []).forEach(signal => {
 signal.fundingDecisionThresholdPct = limit;
 });
 return results;
}

function normalizeIndexSymbol(symbol = '') {
 return String(symbol || '').trim().toUpperCase();
}

function getIndexBaseSymbol(symbol = '') {
 const normalized = normalizeIndexSymbol(symbol);
 if (normalized.endsWith('USDT')) return normalized.slice(0, -4);
 if (normalized.endsWith('USD')) return normalized.slice(0, -3);
 return normalized;
}

function isIndexEligibleSymbol(symbol = '', ticker = {}) {
 const normalized = normalizeIndexSymbol(symbol);
 if (!normalized) return false;
 const base = getIndexBaseSymbol(normalized);
 if (!base || MARKET_INDEX_EXCLUDED_BASES.has(base) || /DOM$/.test(base)) return false;
 return Number(ticker?.usdVol24h || ticker?.volume || ticker?.turnover || 0) > 0 && Number(ticker?.price || ticker?.ltp || 0) > 0;
}

function isManuallyExcludedIndexSymbol(symbol = '', excludedSymbols = new Set()) {
 const normalized = normalizeIndexSymbol(symbol);
 const base = getIndexBaseSymbol(normalized);
 return excludedSymbols.has(normalized) || excludedSymbols.has(base);
}

function buildBenchmarkEligibleUniverse(tickerMap = {}) {
 return Object.entries(tickerMap)
 .filter(([sym, t]) => isIndexEligibleSymbol(sym, t));
}

function normalizeDhanIndexTapeKey(value = '') {
 return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function resolveDhanIndexTicker(tickerMap = {}, definition = {}) {
 const direct = tickerMap[definition.symbol];
 if (direct) return { symbol: definition.symbol, ticker: direct };
 const entries = Object.entries(tickerMap || {});
 const aliases = new Set((definition.aliases || [definition.symbol]).map(normalizeDhanIndexTapeKey));
 const matched = entries.find(([symbol]) => aliases.has(normalizeDhanIndexTapeKey(symbol)));
 return matched ? { symbol: matched[0], ticker: matched[1] } : null;
}

function buildDhanIndexQuoteTape(tickerMap = {}) {
 return DHAN_SCAN_INDEX_TAPE_DEFINITIONS.map(definition => {
  const resolved = resolveDhanIndexTicker(tickerMap, definition);
  const ticker = resolved?.ticker || null;
  const price = Number(ticker?.price || 0);
  if (!(price > 0)) return null;
  const prevClose = Number(ticker?.prevClose || 0);
  const storedPointChange = Number(ticker?.pointChange ?? ticker?.netChange ?? 0);
  const pointChange = Number.isFinite(storedPointChange) && Math.abs(storedPointChange) > 0.0001
  ? storedPointChange
  : (prevClose > 0 ? price - prevClose : 0);
  const changeBasis = prevClose > 0 ? prevClose : (price - pointChange > 0 ? price - pointChange : 0);
  const changePct = Number(ticker?.change24h || (changeBasis > 0 ? (pointChange / changeBasis) * 100 : 0));
  return {
   symbol: definition.symbol,
   sourceSymbol: resolved.symbol,
   label: definition.label,
   shortLabel: definition.shortLabel,
   price: roundIndexNumber(price, 2),
   changePct: roundIndexNumber(changePct),
   pointChange: roundIndexNumber(pointChange, 2),
   prevClose: roundIndexNumber(prevClose, 2),
   dayHigh: roundIndexNumber(Number(ticker?.dayHigh || 0), 2),
   dayLow: roundIndexNumber(Number(ticker?.dayLow || 0), 2),
   securityId: ticker?.securityId || ticker?.productId || '',
   exchangeSegment: ticker?.exchangeSegment || 'IDX_I',
  };
 }).filter(Boolean);
}

function resolveBenchmarkCondition(value = 0) {
 const val = Number(value || 0);
 return val > 5 ? 'euphoric' : val > 2 ? 'bull' : val < -5 ? 'crash' : val < -2 ? 'bear' : 'neutral';
}

function resolveLiquidityProxy(ticker = {}) {
 const usdVol = Math.max(1, Number(ticker?.usdVol24h || 0));
 const oi = Math.max(Number(ticker?.oi || 0), usdVol * 0.25);
 return Math.sqrt(usdVol) * Math.sqrt(oi);
}

function buildBenchmarkSnapshot(code, label, method, constituents = [], extras = {}) {
 if (!constituents.length) return null;
 const totalWeight = constituents.reduce((sum, item) => sum + Number(item.weight || 0), 0) || 1;
 const value = constituents.reduce((sum, item) => sum + Number(item.change || 0) * (Number(item.weight || 0) / totalWeight), 0);
 const composite = +(MARKET_INDEX_BASE_VALUE * (1 + value / 100)).toFixed(2);
 return {
 code,
 label,
 method,
 value: +value.toFixed(2),
 composite,
 condition: resolveBenchmarkCondition(value),
 constituents: constituents.map((item, index) => ({
 sym: item.sym,
 rank: index + 1,
 change: +Number(item.change || 0).toFixed(2),
 weight: +Number(item.weight || 0).toFixed(2),
 vol: +((Number(item.vol || 0)) / 1e6).toFixed(1),
 price: Number(item.price || 0),
 fundingRate: Number(item.fundingRate || 0),
 oi: Number(item.oi || 0),
 })),
 ...extras,
 };
}

function calcInternalBenchmarkSuite(tickerMap = {}, prevMarketIndex = null) {
 const universe = buildBenchmarkEligibleUniverse(tickerMap)
 .map(([sym, t]) => ({
 sym,
 price: Number(t.price || 0),
 change: Number(t.change24h || 0),
 vol: Number(t.usdVol24h || 0),
 oi: Number(t.oi || 0),
 fundingRate: Number(t.fundingRate || 0),
 proxyFloat: resolveLiquidityProxy(t),
 }))
 .filter(item => item.vol > 0 && item.price > 0)
 .sort((a, b) => b.vol - a.vol);
 if (!universe.length) return { cf: null, sp: null };

 const totalUniverseVol = universe.reduce((sum, item) => sum + item.vol, 0) || 1;
 const prevCf = new Set((prevMarketIndex?.benchmarks?.cf?.constituents || []).map(item => String(item?.sym || '').toUpperCase()).filter(Boolean));
 const prevSp = new Set((prevMarketIndex?.benchmarks?.sp?.constituents || []).map(item => String(item?.sym || '').toUpperCase()).filter(Boolean));

 let runningCoverage = 0;
 const cfSelected = [];
 for (const item of universe) {
 const sharePct = (item.vol / totalUniverseVol) * 100;
 const withinPrimaryCoverage = runningCoverage < 95;
 const withinRetentionBuffer = runningCoverage < 97.5 && prevCf.has(item.sym);
 if (cfSelected.length < 5 || withinPrimaryCoverage || withinRetentionBuffer) {
 cfSelected.push({ ...item });
 }
 runningCoverage += sharePct;
 if (cfSelected.length >= 20) break;
 if (runningCoverage >= 99 && cfSelected.length >= 5) break;
 }
 const cfTotalProxy = cfSelected.reduce((sum, item) => sum + item.proxyFloat, 0) || 1;
 const cfConstituents = cfSelected.map(item => ({
 ...item,
 weight: (item.proxyFloat / cfTotalProxy) * 100,
 }));
 const cf = buildBenchmarkSnapshot('CF', 'CF-style', 'Free-float proxy', cfConstituents, {
 selectionLabel: '95% liquidity coverage with retention buffer',
 coveragePct: +cfSelected.reduce((sum, item) => sum + (item.vol / totalUniverseVol) * 100, 0).toFixed(1),
 notes: 'Internal benchmark using NSE/BSE liquidity and breadth proxy data.',
 });

 const spRanked = universe.filter(item => item.vol >= 500000);
 const spTargetCount = Math.min(10, spRanked.length);
 const spLocked = spRanked.slice(0, Math.min(8, spTargetCount));
 const spSelected = [];
 const spSeen = new Set();
 spLocked.forEach(item => {
 spSeen.add(item.sym);
 spSelected.push(item);
 });
 const spBufferPool = spRanked.slice(spLocked.length, Math.min(spRanked.length, 14));
 spBufferPool.forEach(item => {
 if (spSelected.length >= spTargetCount || spSeen.has(item.sym) || !prevSp.has(item.sym)) return;
 spSeen.add(item.sym);
 spSelected.push(item);
 });
 spRanked.forEach(item => {
 if (spSelected.length >= spTargetCount || spSeen.has(item.sym)) return;
 spSeen.add(item.sym);
 spSelected.push(item);
 });
 const spWeight = spSelected.length ? (100 / spSelected.length) : 0;
 const spConstituents = spSelected.map(item => ({
 ...item,
 weight: spWeight,
 }));
 const sp = buildBenchmarkSnapshot('SP', 'S&P-style', 'Top 10 equal weight', spConstituents, {
 selectionLabel: 'Top 10 with retention buffer',
 coveragePct: +spSelected.reduce((sum, item) => sum + (item.vol / totalUniverseVol) * 100, 0).toFixed(1),
 notes: 'Internal benchmark using buffered top selection and equal weights on the selected universe.',
 });

 return { cf, sp };
}

function roundIndexNumber(value = 0, digits = 2) {
 const numeric = Number(value);
 if (!Number.isFinite(numeric)) return 0;
 return +numeric.toFixed(digits);
}

function buildMarketIndexSettingsHash(indexSettings = {}) {
 return [
 Number(indexSettings.maxConstituents || 100),
 Number(indexSettings.rebalanceDays || MARKET_INDEX_REBALANCE_DEFAULT_DAYS),
 (indexSettings.excludedSymbols || []).map(normalizeIndexSymbol).sort().join(','),
 ].join('|');
}

function selectMarketIndexConstituents(universe = [], prevState = null, maxConstituents = 10) {
 const maxCount = Math.max(1, Math.floor(Number(maxConstituents || 10)));
 const ranked = universe
 .map(([sym, ticker]) => ({
 sym: normalizeIndexSymbol(sym),
 ticker,
 price: Number(ticker?.price || 0),
 vol: Number(ticker?.usdVol24h || 0),
 }))
 .filter(item => item.sym && item.price > 0 && item.vol > 0)
 .sort((a, b) => b.vol - a.vol);
 const rankMap = new Map(ranked.map((item, index) => [item.sym, index + 1]));
 const bySymbol = new Map(ranked.map(item => [item.sym, item]));
 const selected = [];
 const seen = new Set();
 const push = item => {
 if (!item || seen.has(item.sym) || selected.length >= maxCount) return;
 seen.add(item.sym);
 selected.push(item);
 };
 const coreCount = Math.min(maxCount, Math.max(1, Math.ceil(maxCount * MARKET_INDEX_CORE_LOCK_RATIO)));
 ranked.slice(0, coreCount).forEach(push);
 const retentionCutoff = Math.max(maxCount, Math.ceil(maxCount * MARKET_INDEX_RETENTION_MULTIPLIER));
 (prevState?.constituents || []).forEach(previous => {
 const sym = normalizeIndexSymbol(previous?.sym);
 const item = bySymbol.get(sym);
 const rank = rankMap.get(sym) || Infinity;
 if (item && rank <= retentionCutoff) push(item);
 });
 ranked.forEach(push);
 return selected;
}

function buildRebalancedMarketIndexState(selected = [], composite = MARKET_INDEX_BASE_VALUE, now = Date.now(), metadata = {}) {
 const active = selected.filter(item => Number(item?.price || item?.ticker?.price || 0) > 0);
 const equalWeight = active.length ? (1 / active.length) : 0;
 const safeComposite = Number(composite || MARKET_INDEX_BASE_VALUE) > 0 ? Number(composite || MARKET_INDEX_BASE_VALUE) : MARKET_INDEX_BASE_VALUE;
 const constituents = active.map((item, index) => {
 const price = Number(item.price || item.ticker?.price || 0);
 const units = price > 0 ? (safeComposite * equalWeight) / price : 0;
 return {
 sym: normalizeIndexSymbol(item.sym),
 rank: index + 1,
 units,
 weight: equalWeight * 100,
 price,
 lastPrice: price,
 vol: Number(item.vol || item.ticker?.usdVol24h || 0),
 };
 });
 return {
 baseValue: MARKET_INDEX_BASE_VALUE,
 divisor: 1,
 composite: roundIndexNumber(safeComposite),
 lastComposite: roundIndexNumber(safeComposite),
 lastPrices: constituents.reduce((acc, item) => {
 acc[item.sym] = item.lastPrice;
 return acc;
 }, {}),
 constituents,
 settingsHash: metadata.settingsHash || '',
 lastRebalancedAt: now,
 lastRebalanceReason: metadata.reason || 'scheduled',
 rebuildNonce: Number(metadata.rebuildNonce || 0),
 };
}

function calculateMarketIndexCompositeFromState(state = null, tickerMap = {}) {
 const constituents = Array.isArray(state?.constituents) ? state.constituents : [];
 if (!constituents.length) {
 return {
 composite: MARKET_INDEX_BASE_VALUE,
 missing: [],
 usedFallback: false,
 totalVolumeUSD: 0,
 liveConstituents: [],
 };
 }
 let marketValue = 0;
 let totalVolumeUSD = 0;
 const missing = [];
 const liveConstituents = constituents.map((item, index) => {
 const sym = normalizeIndexSymbol(item?.sym);
 const ticker = tickerMap[sym] || null;
 const livePrice = Number(ticker?.price || 0);
 const fallbackPrice = Number(state?.lastPrices?.[sym] || item?.lastPrice || item?.price || 0);
 const price = livePrice > 0 ? livePrice : fallbackPrice;
 if (!(livePrice > 0)) missing.push(sym);
 const units = Number(item?.units || 0);
 marketValue += units * price;
 totalVolumeUSD += Number(ticker?.usdVol24h || item?.vol || 0);
 return {
 sym,
 rank: index + 1,
 units,
 weight: Number(item?.weight || 0),
 price,
 lastPrice: price,
 vol: Number(ticker?.usdVol24h || item?.vol || 0),
 change: Number(ticker?.change24h || 0),
 fundingRate: Number(ticker?.fundingRate || 0),
 oi: Number(ticker?.oi || 0),
 stale: !(livePrice > 0),
 };
 });
 const divisor = Number(state?.divisor || 1) || 1;
 return {
 composite: roundIndexNumber(marketValue / divisor),
 missing,
 usedFallback: missing.length > 0,
 totalVolumeUSD,
 liveConstituents,
 };
}

function marketIndexHistoryPoints(history = []) {
 return (Array.isArray(history) ? history : [])
 .map(item => ({
 ts: Number(item?.ts || 0),
 composite: Number(item?.composite || 0),
 }))
 .filter(item => Number.isFinite(item.ts) && item.ts > 0 && Number.isFinite(item.composite) && item.composite > 0)
 .sort((a, b) => a.ts - b.ts);
}

function resolveMarketIndexChangeBaseline(history = [], currentTs = Date.now(), windowMs = MARKET_INDEX_CHANGE_WINDOW_MS) {
 const rows = marketIndexHistoryPoints(history).filter(item => item.ts < currentTs - 1000);
 if (!rows.length) return null;
 const targetTs = currentTs - Math.max(1, Number(windowMs || MARKET_INDEX_CHANGE_WINDOW_MS));
 let best = rows[0];
 let bestGap = Math.abs(best.ts - targetTs);
 rows.forEach(item => {
 const gap = Math.abs(item.ts - targetTs);
 if (gap < bestGap) {
 best = item;
 bestGap = gap;
 }
 });
 const ageMs = Math.max(0, currentTs - best.ts);
 const exactRollingWindow = Math.abs(ageMs - MARKET_INDEX_CHANGE_WINDOW_MS) <= MARKET_INDEX_CHANGE_TARGET_TOLERANCE_MS;
 return {
 ...best,
 targetTs,
 ageMs,
 basis: exactRollingWindow ? 'rolling_24h' : 'since_available_history',
 label: exactRollingWindow ? '24h' : 'history',
 };
}

function applyMarketIndexWindowChange(marketIndex = null, history = [], now = Date.now()) {
 if (!marketIndex || !(Number(marketIndex.composite) > 0)) return marketIndex;
 const composite = Number(marketIndex.composite || 0);
 const fallbackPrevious = Number(marketIndex.previousComposite || marketIndex.scanPreviousComposite || 0);
 const fallbackPoints = Number(marketIndex.indexChangePoints || marketIndex.scanChangePoints || 0);
 const fallbackPct = Number(marketIndex.indexChangePct || marketIndex.scanChangePct || 0);
 const baseline = resolveMarketIndexChangeBaseline(history, Number(marketIndex.ts || now) || now);
 const baseComposite = Number(baseline?.composite || fallbackPrevious || 0);
 const points = baseComposite > 0 ? composite - baseComposite : fallbackPoints;
 const pct = baseComposite > 0 ? (points / baseComposite) * 100 : fallbackPct;
 const basis = baseline?.basis || 'since_previous_scan';
 const label = baseline?.label || 'scan';
 return {
 ...marketIndex,
 scanChangePct: Number.isFinite(Number(marketIndex.scanChangePct)) ? marketIndex.scanChangePct : roundIndexNumber(fallbackPct),
 scanChangePoints: Number.isFinite(Number(marketIndex.scanChangePoints)) ? marketIndex.scanChangePoints : roundIndexNumber(fallbackPoints),
 scanPreviousComposite: Number.isFinite(Number(marketIndex.scanPreviousComposite)) ? marketIndex.scanPreviousComposite : roundIndexNumber(fallbackPrevious),
 indexChangePct: roundIndexNumber(pct),
 indexChangePoints: roundIndexNumber(points),
 indexChangeBasis: basis,
 indexChangeWindowLabel: label,
 indexChangeWindowMs: baseline ? Math.round(Number(baseline.ageMs || 0)) : 0,
 indexChangeBaselineTs: Number(baseline?.ts || 0),
 indexChangeBaselineComposite: baseComposite > 0 ? roundIndexNumber(baseComposite) : 0,
 previousComposite: baseComposite > 0 ? roundIndexNumber(baseComposite) : roundIndexNumber(fallbackPrevious),
 };
}

function clampFundingCrowdingValue(value = 0, min = 0, max = 100) {
 const numeric = Number(value);
 if (!Number.isFinite(numeric)) return min;
 return Math.max(min, Math.min(max, numeric));
}

function buildFundingCrowdingIndex(rows = [], prevOIData = {}, previousSentiment = {}) {
 const total = Math.max(1, rows.length);
 const fundingRows = rows.map(item => {
 const fundingRate = Number(item.fundingRate || 0);
 const absRate = Math.abs(fundingRate);
 const volume = Math.max(0, Number(item.vol || 0));
 const weight = clampFundingCrowdingValue(Math.sqrt(Math.max(volume, 1_000_000) / 1_000_000), 1, 12);
 const prevOi = Number(prevOIData?.[item.sym] || 0);
 const oi = Number(item.oi || 0);
 const oiChangePct = prevOi > 0 && oi > 0 ? ((oi - prevOi) / prevOi) * 100 : 0;
 const oiFactor = oiChangePct > 0
 ? 1 + clampFundingCrowdingValue(oiChangePct / 40, 0, 0.35)
 : 1 - clampFundingCrowdingValue(Math.abs(oiChangePct) / 50, 0, 0.20);
 const magnitudeScore = clampFundingCrowdingValue((absRate / 0.12) * 100, 0, 100);
 const score = clampFundingCrowdingValue(magnitudeScore * oiFactor, 0, 100);
 return {
 sym: item.sym,
 fundingRate,
 absRate,
 direction: fundingRate > 0 ? 'longs_crowded' : fundingRate < 0 ? 'shorts_crowded' : 'flat',
 weight,
 score,
 weightedScore: score * weight,
 oiChangePct,
 volume,
 };
 });
 const totalWeight = fundingRows.reduce((sum, item) => sum + item.weight, 0) || total;
 const fundingStressPct = fundingRows.filter(item => item.absRate >= 0.05).length / total * 100;
 const extremeFundingPct = fundingRows.filter(item => item.absRate >= 0.10).length / total * 100;
 const longPressure = fundingRows.filter(item => item.fundingRate > 0).reduce((sum, item) => sum + item.weightedScore, 0) / totalWeight;
 const shortPressure = fundingRows.filter(item => item.fundingRate < 0).reduce((sum, item) => sum + item.weightedScore, 0) / totalWeight;
 const rawPressure = fundingRows.reduce((sum, item) => sum + item.weightedScore, 0) / totalWeight;
 const oiConfirmationPct = fundingRows.filter(item => item.absRate >= 0.03 && item.oiChangePct >= 5).length / total * 100;
 const fundingCrowdingIndex = clampFundingCrowdingValue((rawPressure * 0.72) + (fundingStressPct * 0.16) + (extremeFundingPct * 0.08) + (oiConfirmationPct * 0.04), 0, 100);
 const biasDelta = longPressure - shortPressure;
 const bias = Math.abs(biasDelta) < 4
 ? 'balanced'
 : biasDelta > 0
 ? 'longs_crowded'
 : 'shorts_crowded';
 const previousIndex = Number(previousSentiment?.fundingCrowdingIndex);
 const shock = Number.isFinite(previousIndex) ? fundingCrowdingIndex - previousIndex : 0;
 const topContributors = fundingRows
 .filter(item => item.score >= 15 || item.absRate >= 0.03)
 .sort((a, b) => b.weightedScore - a.weightedScore)
 .slice(0, 5)
 .map(item => ({
 sym: item.sym,
 fundingRate: roundIndexNumber(item.fundingRate, 4),
 score: roundIndexNumber(item.score, 1),
 oiChangePct: roundIndexNumber(item.oiChangePct, 1),
 direction: item.direction,
 }));
 return {
 fundingStressPct: roundIndexNumber(fundingStressPct, 1),
 fundingCrowdingIndex: roundIndexNumber(fundingCrowdingIndex, 1),
 fundingLongPressure: roundIndexNumber(longPressure, 1),
 fundingShortPressure: roundIndexNumber(shortPressure, 1),
 fundingCrowdingBias: bias,
 fundingCrowdingShock: roundIndexNumber(shock, 1),
 fundingOiConfirmationPct: roundIndexNumber(oiConfirmationPct, 1),
 extremeFundingPct: roundIndexNumber(extremeFundingPct, 1),
 topFundingCrowding: topContributors,
 };
}

function fundingCrowdingLabel(value = 0) {
 const score = Number(value || 0);
 if (score >= 75) return 'Extreme';
 if (score >= 60) return 'Squeeze risk';
 if (score >= 40) return 'Crowded';
 if (score >= 20) return 'Watch';
 return 'Calm';
}

function buildFwdSentimentTape(constituents = [], prevOIData = {}, previousSentiment = {}) {
 const rows = (Array.isArray(constituents) ? constituents : []).filter(item => Number(item?.price || 0) > 0);
 if (!rows.length) {
 return {
 value: 0,
 score: 0,
 condition: 'neutral',
 label: 'Neutral',
 advancing: 0,
 declining: 0,
 breadthPct: 50,
 advancingVolumePct: 50,
 fundingStressPct: 0,
 fundingCrowdingIndex: 0,
 fundingCrowdingBias: 'balanced',
 fundingCrowdingShock: 0,
 fundingLongPressure: 0,
 fundingShortPressure: 0,
 fundingOiConfirmationPct: 0,
 extremeFundingPct: 0,
 topFundingCrowding: [],
 oiExpansionPct: 0,
 drivers: ['No eligible live constituents yet'],
 };
 }
 const total = rows.length;
 const totalVolume = rows.reduce((sum, item) => sum + Number(item.vol || 0), 0) || 1;
 const advancingRows = rows.filter(item => Number(item.change || 0) > 0);
 const decliningRows = rows.filter(item => Number(item.change || 0) < 0);
 const value = rows.reduce((sum, item) => sum + Number(item.change || 0), 0) / total;
 const breadthPct = (advancingRows.length / total) * 100;
 const advancingVolumePct = advancingRows.reduce((sum, item) => sum + Number(item.vol || 0), 0) / totalVolume * 100;
 const btc = rows.find(item => /^(BTC|XBT)/.test(String(item.sym || '')));
 const eth = rows.find(item => /^ETH/.test(String(item.sym || '')));
 const fundingCrowding = buildFundingCrowdingIndex(rows, prevOIData, previousSentiment);
 const oiExpansionRows = rows.filter(item => {
 const prev = Number(prevOIData?.[item.sym] || 0);
 const oi = Number(item.oi || 0);
 return prev > 0 && oi > 0 && ((oi - prev) / prev) >= 0.05;
 });
 const oiExpansionPct = (oiExpansionRows.length / total) * 100;
 const leadershipBonus = (Number(btc?.change || 0) >= 1 && Number(eth?.change || 0) >= 1)
 ? 10
 : (Number(btc?.change || 0) <= -1 && Number(eth?.change || 0) <= -1)
 ? -10
 : 0;
 const score = Math.max(-100, Math.min(100,
 (value * 8)
 + ((breadthPct - 50) * 0.7)
 + ((advancingVolumePct - 50) * 0.35)
 + leadershipBonus
 + (oiExpansionPct * 0.12)
 - (fundingCrowding.fundingCrowdingIndex * 0.22)
 ));
 const condition = resolveBenchmarkCondition(value);
 const label = score >= 35 ? 'Risk On'
 : score <= -35 ? 'Risk Off'
 : score >= 12 ? 'Constructive'
 : score <= -12 ? 'Defensive'
 : 'Neutral';
 const drivers = [
 `${advancingRows.length}/${total} constituents advancing`,
 `${roundIndexNumber(advancingVolumePct, 1)}% of basket volume in advancing names`,
 btc || eth ? `Large-cap proxy ${roundIndexNumber(Number(btc?.change || 0))}% / ${roundIndexNumber(Number(eth?.change || 0))}%` : 'Large-cap leadership proxy unavailable',
 `${fundingCrowdingLabel(fundingCrowding.fundingCrowdingIndex)} activity crowding ${roundIndexNumber(fundingCrowding.fundingCrowdingIndex, 1)}/100`,
 oiExpansionPct > 0 ? `${roundIndexNumber(oiExpansionPct, 1)}% OI expansion` : 'No broad OI expansion',
 ].slice(0, 5);
 return {
 value: roundIndexNumber(value),
 score: Math.round(score),
 condition,
 label,
 advancing: advancingRows.length,
 declining: decliningRows.length,
 breadthPct: roundIndexNumber(breadthPct, 1),
 advancingVolumePct: roundIndexNumber(advancingVolumePct, 1),
 ...fundingCrowding,
 oiExpansionPct: roundIndexNumber(oiExpansionPct, 1),
 btcChange: roundIndexNumber(Number(btc?.change || 0)),
 ethChange: roundIndexNumber(Number(eth?.change || 0)),
 drivers,
 };
}

function calcMarketIndex(tickerMap, prevMarketIndex = null, marketIndexSettings = {}, prevOIData = {}) {
 const indexTape = buildDhanIndexQuoteTape(tickerMap);
 const niftyQuote = indexTape.find(item => item.symbol === 'NIFTY') || null;
 const nifty = tickerMap.NIFTY || tickerMap['NIFTY 50'] || null;
 const fnoRows = Object.entries(tickerMap || {})
 .filter(([sym, ticker]) => !indexTape.some(item => item.sourceSymbol === sym || item.symbol === sym) && isIndexEligibleSymbol(sym, ticker))
 .map(([sym, ticker], index) => ({
  sym,
  rank: index + 1,
  units: 1,
  weight: 0,
  price: Number(ticker?.price || 0),
  lastPrice: Number(ticker?.price || 0),
  vol: Number(ticker?.usdVol24h || ticker?.volume24h || 0),
  change: Number(ticker?.change24h || 0),
  fundingRate: 0,
  oi: Number(ticker?.oi || 0),
  stale: false,
 }))
 .filter(row => row.price > 0)
 .sort((a, b) => b.vol - a.vol);
 if (!niftyQuote?.price && !nifty?.price && !fnoRows.length) { dlog('Index tape: unavailable'); return null; }
 const composite = Number(niftyQuote?.price || nifty?.price || prevMarketIndex?.composite || MARKET_INDEX_BASE_VALUE);
 const previousComposite = Number(prevMarketIndex?.composite || composite);
 const indexChangePct = Number(niftyQuote?.changePct ?? nifty?.change24h ?? (previousComposite > 0 ? ((composite - previousComposite) / previousComposite) * 100 : 0));
 const selected = fnoRows.slice(0, 250);
 const totalVol = selected.reduce((sum, item) => sum + Number(item.vol || 0), 0);
 const equalWeight = selected.length ? 100 / selected.length : 0;
 const liveConstituents = selected.map((item, index) => ({ ...item, rank: index + 1, weight: equalWeight }));
 const sentiment = buildFwdSentimentTape(liveConstituents, prevOIData, prevMarketIndex?.sentiment || {});
 const now = Date.now();
 const updatedState = {
  baseValue: composite,
  divisor: 1,
  composite,
  lastComposite: composite,
  lastPrices: { NIFTY: composite },
  constituents: [{ sym: 'NIFTY', rank: 1, units: 1, weight: 100, price: composite, lastPrice: composite, vol: Number(nifty?.usdVol24h || 0) }],
  settingsHash: 'NIFTY50',
  lastRebalancedAt: now,
  lastRebalanceReason: 'dhan_benchmark',
  rebuildNonce: 0,
 };
 const breadthConstituents = liveConstituents.map(item => ({
  sym: item.sym,
  change: roundIndexNumber(item.change),
  weight: roundIndexNumber(item.weight),
  vol: roundIndexNumber((item.vol || 0) / 1e6, 1),
  price: item.price || 0,
  fundingRate: item.fundingRate || 0,
  oi: item.oi || 0,
  units: item.units,
  stale: item.stale,
 }));
 dlog(`Indices: NIFTY ${roundIndexNumber(composite)} (${roundIndexNumber(indexChangePct)}%) | BANK ${roundIndexNumber(indexTape.find(item => item.symbol === 'BANKNIFTY')?.changePct || 0)}% | IT ${roundIndexNumber(indexTape.find(item => item.symbol === 'NIFTYIT')?.changePct || 0)}% | F&O breadth ${sentiment.breadthPct}% ${sentiment.condition}`);
 return {
  value: sentiment.value,
  condition: sentiment.condition,
  composite,
  indexValue: composite,
  indexChangePct: roundIndexNumber(indexChangePct),
  indexChangePoints: roundIndexNumber(composite - previousComposite),
  previousComposite: roundIndexNumber(previousComposite),
  scanChangePct: roundIndexNumber(indexChangePct),
  scanChangePoints: roundIndexNumber(composite - previousComposite),
  scanPreviousComposite: roundIndexNumber(previousComposite),
  indexChangeBasis: 'since_previous_scan',
 indexChangeWindowLabel: 'scan',
 indexChangeWindowMs: 0,
 indexChangeBaselineTs: 0,
 indexChangeBaselineComposite: 0,
  sentiment,
  totalVolumeUSD: totalVol, ts: Date.now(),
  method: 'FWD Index benchmark',
  selectionLabel: `FWD Index tape with ${liveConstituents.length} F&O stock breadth rows`,
  configuredMaxConstituents: liveConstituents.length,
  excludedSymbols: [],
  indexState: updatedState,
  rebalanced: false,
  rebalanceReason: 'dhan_benchmark',
  lastRebalancedAt: updatedState.lastRebalancedAt,
  nextRebalanceAt: Number(updatedState.lastRebalancedAt || now) + (24 * 60 * 60 * 1000),
  missingConstituents: (niftyQuote?.price || nifty?.price) ? [] : ['NIFTY'],
  benchmarks: Object.fromEntries(indexTape.map(item => [item.symbol, item])),
  indexTape,
  benchmarkSymbol: 'NIFTY',
  benchmarkLabel: 'Nifty 50',
  fnoConstituents: breadthConstituents,
  topStocks: breadthConstituents,
  topCoins: breadthConstituents,
 };
}

// -- Volatility Regime Detection ---------------------------------
// Uses rolling market-index history to classify current market regime.
// Returns one of: TRENDING, HIGH_VOL, LOW_VOL, CHOPPY, UNKNOWN.

// -- Liquidation Risk --------------------------------------------
// Note: Dhan data channels do not expose a dedicated market-wide
// liquidation stream. This is an inference proxy using crowded funding
// + rising OI to approximate liquidation-cluster risk.
function liquidationRisk(ticker, prevOI) {
 if (!ticker?.fundingRate) return null;
 const fr = ticker.fundingRate;
 const oiChg = prevOI > 0 ? (ticker.oi - prevOI) / prevOI : 0;
 if (Math.abs(fr) > 0.05 && oiChg > 0.05) {
 return {
 risk: fr > 0 ? 'long_liquidation' : 'short_squeeze',
 fundingRate: fr, oiChange: +(oiChg * 100).toFixed(1),
 severity: Math.abs(fr) > 0.1 ? 'extreme' : 'high',
 };
 }
 return null;
}

// ================================================================
// CSV EXPORT HELPER - NEW v14
// ================================================================
function resultsToCSV(results) {
 const headers = [
 'Symbol','Sector','Score','Direction','MTF','Price','Change24h%',
  'Turnover24h_INR','OI','ActivityBias','Entry','SL','TP1','TP2','RR',
 'RSI','VWAP','MarketStructure','Session','Reasons','Timestamp',
 ];
 const rows = results.map(r => [
 r.symbol, r.sector, r.score, r.direction, r.mtfConfirmed ? 1 : 0,
 r.price, r.change24h, r.volume24h?.toFixed(0) || 0, r.oi,
 r.fundingRate, r.entry, r.sl, r.tp1, r.tp2, r.rr,
 r.daily?.rsi || '', r.daily?.vwap || '',
 r.daily?.marketStructure?.structure || '',
 r.session || '',
 (r.reasons || []).join(' | '),
 r.ts ? new Date(r.ts).toISOString() : '',
 ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
 return [headers.join(','), ...rows].join('\n');
}

// ================================================================
// DEFAULT STRATEGY
// ================================================================
function defaultStrategy() {
 return {
  ema1: 9, ema2: 30, ema3: 100, obvPeriod: 50,
  tf1: '1d', tf2: '4h',
  minScore: 15, alertScore: 65, maxCoins: 500, minVolume: 0,
  scanUniverse: SCANNER_UNIVERSE_DEFAULT,
  scanMode: SCANNER_MODE_DEFAULT,
  fundingMinVolume: FUNDING_MIN_VOLUME_DEFAULT,
 notify: true, soundAlert: true,
 autoScan: false, autoScanInterval: AUTO_SCAN_INTERVAL_DEFAULT,
 // Sound customization - NEW v14
 soundTier1: 'execute', // Tier 1 (highest) = execute
 soundTier2: 'setup', // Tier 2 = setup
 soundTier3: 'watch', // Tier 3 = watch
 alertTone: 'classic',
 keyLevelSettings: scanSanitizeKeyLevelSettings({}),
 chartDefaults: scanSanitizeChartDefaults({ defaultPreset: 'clean', showOrders: false, showVwap: false }),
 marketIndexSettings: scanSanitizeMarketIndexSettings({}),
 riskTemplates: scanSanitizeRiskTemplates({}),
 chartCacheEnabled: scanSanitizeChartCacheEnabled(true),
 marketDataMode: 'auto',
 };
}

function scanSoundEnabled(strategy = {}) {
 return strategy?.soundAlert !== false;
}

let scanRunPromise = null;

function toSignalHistorySnapshot(result = {}) {
 return {
 score: Math.round(Number(result?.score || 0)),
 rawScore: Math.round(Number(result?.rawScore || 0)),
 alertTier: String(result?.alertTier || 'none').toLowerCase(),
 direction: String(result?.direction || ''),
 regime: String(result?.marketRegime || 'UNKNOWN'),
 rsComposite: Number(result?.relativeStrength?.composite || 0),
 ts: Number(result?.ts || Date.now()),
 };
}

function enrichSignalIntelligence(results = [], marketIndex = null, signalHistoryStore = {}) {
 const btcCoin = Array.isArray(marketIndex?.topCoins)
 ? marketIndex.topCoins.find(coin => /^(BTC|XBT)/.test(String(coin?.sym || '')))
 : null;
 const ethCoin = Array.isArray(marketIndex?.topCoins)
 ? marketIndex.topCoins.find(coin => /^ETH/.test(String(coin?.sym || '')))
 : null;
 const sectorContext = computeSectorBreadth(results);
 const leadership = computeLeadershipState(marketIndex, results);
 const historyStore = signalHistoryStore && typeof signalHistoryStore === 'object' ? { ...signalHistoryStore } : {};

 results.forEach(result => {
 const sectorState = sectorContext.bySector[result.sector || 'Other'] || null;
 const relativeStrength = buildRelativeStrengthSnapshot(result, {
 btcChange: btcCoin?.change || 0,
 ethChange: ethCoin?.change || 0,
 sectorAverage: sectorState?.avgChange24h || 0,
 });
 result.relativeStrength = relativeStrength;
 result.rsComposite = relativeStrength.composite;
 result.rsState = relativeStrength.state;
 result.rsLabel = relativeStrength.label;
 result.marketLeadership = leadership;
 result.leadershipState = leadership.state;
 result.sectorBreadthState = sectorState?.breadthState || 'balanced';
 result.sectorLeader = sectorState?.topSymbol || '';

 const symbolKey = String(result.symbol || '').toUpperCase();
 const nextHistory = Array.isArray(historyStore[symbolKey]) ? historyStore[symbolKey].slice() : [];
 nextHistory.push(toSignalHistorySnapshot(result));
 if (nextHistory.length > MAX_SIGNAL_PERSISTENCE_POINTS) {
 nextHistory.splice(0, nextHistory.length - MAX_SIGNAL_PERSISTENCE_POINTS);
 }
 historyStore[symbolKey] = nextHistory;
 result.signalPersistence = deriveSignalPersistence(nextHistory);
 });

 results.forEach(result => {
 const sectorState = sectorContext.bySector[result.sector || 'Other'] || null;
 result.tradeQuality = buildTradeQuality(result, {
 marketRegime: result.marketRegime,
 setupFamilyAllowedInRegime: result.setupFamilyAllowedInRegime,
 relativeStrength: result.relativeStrength,
 sectorBreadthState: sectorState?.breadthState || 'balanced',
 leadershipState: leadership.state,
 persistence: result.signalPersistence,
 });
 });

 const finalSectorContext = computeSectorBreadth(results);
 return {
 results,
 signalHistoryStore: historyStore,
 sectorSummary: finalSectorContext.bySector,
 sectorBreadth: finalSectorContext,
 marketLeadership: leadership,
 };
}

async function markScanStopped(status = 'Ready - Click SCAN NOW', progress = 0) {
 await chrome.storage.local.set({
 scanActive: false,
 scanHeartbeat: Date.now(),
 scanStatus: status,
 scanProgress: progress,
 });
}

function isScanStopRequested() {
 return globalThis.scanAbortRequested === true;
}

async function throwIfScanStopRequested() {
 if (!isScanStopRequested()) return;
 const reason = String(globalThis.scanAbortReason || 'user');
 const status = reason === 'deadline'
  ? 'Scan paused at its safety deadline; automatic resume is scheduled'
  : 'Scan stopped by user';
 await markScanStopped(status, 0);
 const error = new Error(status);
 error.scanAbortReason = reason;
 throw error;
}

function buildScanResumeFingerprint(candidates = [], strat = {}) {
 const symbols = (Array.isArray(candidates) ? candidates : [])
  .map(item => String(item?.symbol || '').trim().toUpperCase())
  .filter(Boolean)
  .sort();
 return [
  sanitizeScanUniverseId(strat.scanUniverse),
  sanitizeScanMode(strat.scanMode),
  sanitizeScanTimeframe(strat.tf1, '1d'),
  sanitizeScanTimeframe(strat.tf2, '4h'),
  symbols.join(','),
 ].join('|');
}

async function readScanResumeCheckpoint(candidates = [], strat = {}) {
 const data = await new Promise(resolve => chrome.storage.local.get([SCAN_RESUME_CHECKPOINT_KEY], resolve));
 const checkpoint = data?.[SCAN_RESUME_CHECKPOINT_KEY];
 if (!checkpoint || checkpoint.fingerprint !== buildScanResumeFingerprint(candidates, strat)) return null;
 return checkpoint;
}

async function saveScanResumeCheckpoint(candidates = [], strat = {}, details = {}) {
 const completedSymbols = Array.from(details.completedSymbols || [])
  .map(symbol => String(symbol || '').trim().toUpperCase())
  .filter(Boolean);
 const checkpoint = {
  version: 1,
  fingerprint: buildScanResumeFingerprint(candidates, strat),
  universe: sanitizeScanUniverseId(strat.scanUniverse),
  scanMode: sanitizeScanMode(strat.scanMode),
  tf1: sanitizeScanTimeframe(strat.tf1, '1d'),
  tf2: sanitizeScanTimeframe(strat.tf2, '4h'),
  candidateSymbols: candidates.map(item => String(item?.symbol || '').trim().toUpperCase()).filter(Boolean),
  completedSymbols,
  results: Array.isArray(details.results) ? details.results : [],
  noHistoryCount: Math.max(0, Number(details.noHistoryCount || 0)),
  updatedAt: Date.now(),
 };
 await chrome.storage.local.set({ [SCAN_RESUME_CHECKPOINT_KEY]: checkpoint });
 return checkpoint;
}

function scanRetryDelayMs(error) {
 const message = String(error?.message || error || '');
 const match = message.match(/retry(?: in| after)?\s*(\d+)\s*(?:seconds?|s)\b/i);
 if (match) return Math.max(15000, Number(match[1]) * 1000);
 return SCAN_TRANSIENT_RETRY_DEFAULT_MS;
}

function isTransientScanError(error) {
 const message = String(error?.message || error || '');
 return Number(error?.status || 0) === 429
  || /rate.?limit|too many|cooling down|timeout|timed out|network|fetch failed|market api|temporarily|blocked/i.test(message);
}

async function waitForScanRetry(delayMs) {
 const endAt = Date.now() + Math.max(1000, Number(delayMs || 0));
 while (Date.now() < endAt) {
  await throwIfScanStopRequested();
  await wait(Math.min(5000, endAt - Date.now()));
 }
}

async function setScanLiveFeedPaused(paused = true) {
 if (typeof globalThis.dhanNative !== 'function') return null;
 const action = paused ? 'live_feed_pause' : 'live_feed_resume';
 try {
  const response = await globalThis.dhanNative(action, { reason: 'scanner' });
  if (response?.ok && paused) dlog(`Live feed paused for scan (${response.instrumentCount || 0} subscription(s) preserved)`);
  if (response?.ok && !paused) dlog(`Live feed resumed after scan (${response.instrumentCount || 0} subscription(s))`);
  return response;
 } catch (error) {
  dlog(`Live feed ${paused ? 'pause' : 'resume'} skipped: ${error?.message || error}`);
  return null;
 }
}

async function savePartialScanCheckpoint(scanContext, details = {}) {
 if (!scanContext) return null;
 const candleSymbols = scanContext.candles instanceof Map ? scanContext.candles.size : 0;
 const scanResults = Array.isArray(details.results) ? details.results.slice() : [];
 if (!candleSymbols && !scanResults.length) return null;
 const scannedRows = Math.max(0, Number(details.scannedRows || 0));
 const candidateRows = Math.max(scannedRows, Number(details.candidateRows || 0));
 try {
 const context = await globalThis.FWDTradeDeskScanContext?.finalize?.(scanContext, {
 tickerMap: details.tickerMap || scanContext.tickerMap || {},
 products: Array.isArray(details.products) ? details.products : scanContext.products || [],
 marketIndex: details.marketIndex || scanContext.marketIndex || null,
 fundingHeatmap: Array.isArray(details.fundingHeatmap) ? details.fundingHeatmap : scanContext.fundingHeatmap || [],
 scanResults,
 decisionShortlist: [],
 partial: true,
 scannedRows,
 candidateRows,
 });
 await chrome.storage.local.set({
 scanPartialAvailable: true,
 scanPartialTs: Date.now(),
 scanResults,
 scanPartialProgress: {
 scannedRows,
 candidateRows,
 signalRows: scanResults.length,
 candleSymbols,
 },
 });
 const nowMs = Date.now();
 if (
 candleSymbols >= 20
 && nowMs - lastStrategyLabPartialDeriveAt > STRATEGY_LAB_PARTIAL_DERIVE_MIN_MS
 && globalThis.FWDTradeDeskScanContext?.deriveAll
 ) {
 lastStrategyLabPartialDeriveAt = nowMs;
 globalThis.FWDTradeDeskScanContext.deriveAll({ includeNative: false, source: 'partial_checkpoint' })
 .catch(error => dlog(`Strategy Lab partial derive failed: ${error?.message || error}`));
 }
 return context;
 } catch (error) {
 dlog(`Partial scan checkpoint failed: ${error?.message || error}`);
 return null;
 }
}

// ================================================================
// RUN SCAN - v14
// ================================================================
async function runScan() {
  globalThis.scanAbortRequested = false;
  globalThis.scanAbortReason = '';
  globalThis.dhanCandleFetchStats = { cacheHits: 0, fallbackCacheHits: 0, apiFetches: 0, apiRows: 0, startedAt: Date.now() };
  const scanStartedAt = performanceNow();
  let liveFeedPausedForScan = false;
 const scanContext = globalThis.FWDTradeDeskScanContext?.create?.({ startedAt: Date.now() }) || null;
 dlog('=== v14 SCAN START ===');
 await chrome.storage.local.set({
 alerts: [],
 scanActive: true,
 scanHeartbeat: Date.now(),
 scanStatus: 'Preparing scanner...',
 scanProgress: 2,
 });
 await detectAPI(true);
 dlog(`API: ${BASE} (${detectedRegion})`);
 const pauseResponse = await setScanLiveFeedPaused(true);
 liveFeedPausedForScan = !!pauseResponse?.ok;

 const storeData = await new Promise(r => chrome.storage.local.get(['strategy', 'watchlist', 'manualWatchlist', 'signalHistoryStore', 'marketIndex', 'autoTradeSettings'], r));
 const strat = {
  ...defaultStrategy(),
  ...(storeData.strategy || {}),
  marketIndexSettings: scanSanitizeMarketIndexSettings(storeData.strategy?.marketIndexSettings || {}),
  };
  strat.alertTone = sanitizeAlertTone(strat.alertTone);
   strat.tf1 = sanitizeScanTimeframe(strat.tf1, '1d');
   strat.tf2 = sanitizeScanTimeframe(strat.tf2, '4h');
   strat.scanUniverse = sanitizeScanUniverseId(strat.scanUniverse || SCANNER_UNIVERSE_DEFAULT);
   strat.scanMode = sanitizeScanMode(strat.scanMode || SCANNER_MODE_DEFAULT);
   if (isFullMarketUniverse(strat.scanUniverse) && strat.scanMode === 'penny_awakening') {
    strat.scanMode = 'standard';
   }
   const manualWatchlist = mergeWatchlists(storeData.manualWatchlist || storeData.watchlist || []);
   const watchlist = new Set(manualWatchlist);
  const telegramCfg = await getStoredTelegramConfig();
  dlog(`Telegram alerts: ${telegramCfg.enabled ? `enabled (score>=${telegramCfg.minScore})` : 'disabled (enable in HOOKS)'}`);
  let minScore = strat.minScore || 15;
   const configuredMaxCoins = Number(strat.maxCoins || 0);
   const maxCoins = resolveScanLimitForUniverse(strat.scanUniverse, configuredMaxCoins);
   const deepScanLimit = resolveDeepScanLimitForStrategy(strat, maxCoins);
   if (configuredMaxCoins <= 10) {
    strat.maxCoins = maxCoins;
   chrome.storage.local.set({ strategy: strat }).catch(() => {});
   dlog(`Strategy max scan symbols raised to ${maxCoins} for ${strat.scanUniverse}`);
  }
 const minVol = strat.minVolume || 0;
 const fundingMinVolume = sanitizeFundingMinVolume(strat.fundingMinVolume);
 strat.fundingMinVolume = fundingMinVolume;
 const fundingDecisionThresholdPct = Math.max(0, Number(storeData.autoTradeSettings?.maxAdverseFundingRatePct || 0.05));

  const universeLabelForStatus = getScanUniverseStatusLabel(strat.scanUniverse);
  const universeRequest = { universe: strat.scanUniverse, limit: Math.max(maxCoins, 50), subscribeLiveFeed: false };
  await chrome.storage.local.set({
   scanStatus: `Preparing ${universeLabelForStatus} scan (${maxCoins} symbols)...`,
   scanProgress: 3,
   scanHeartbeat: Date.now(),
   scanResults: [],
   scannedStocks: 0,
   totalStocks: maxCoins,
   scannerUniverseMeta: {
    universe: strat.scanUniverse,
    label: universeLabelForStatus,
     requested: maxCoins,
     deepScanLimit,
     deepTotal: deepScanLimit,
     completed: false,
     partial: false,
     scanMode: strat.scanMode,
    scanned: 0,
    count: 0,
    returned: 0,
    fetchedAt: Date.now(),
   },
  });
  let tickerMap = {};
  try {
   tickerMap = await fetchAllTickers(universeRequest);
  } catch (error) {
   const message = String(error?.message || error || 'Market-data load failed.');
   const rateLimited = error?.isRateLimit || Number(error?.status || 0) === 429 || /too many|rate.?limit|blocked/i.test(message);
   const status = rateLimited
    ? `Scan stopped - data rate limit while loading ${strat.scanUniverse}; wait 2-5 minutes or use F&O/Nifty 500`
    : `Scan stopped - market-data load failed: ${message.slice(0, 120)}`;
   await markScanStopped(status, 0);
   dlog(status);
   throw error;
  }
  await throwIfScanStopRequested();
  if (!Object.keys(tickerMap || {}).length) {
   const status = `Scan stopped - no quote rows for ${strat.scanUniverse}; try F&O/Nifty 500 or retry after API cooldown`;
   await markScanStopped(status, 0);
   dlog(status);
   throw new Error(status);
  }
  const universeMeta = globalThis.dhanLastUniverseMeta || { universe: strat.scanUniverse, label: universeLabelForStatus, returned: Object.keys(tickerMap || {}).length };
   universeMeta.requested = maxCoins;
   universeMeta.deepScanLimit = deepScanLimit;
   universeMeta.scanMode = strat.scanMode;
 if (scanContext) scanContext.tickerMap = tickerMap;
 await throwIfScanStopRequested();

 await chrome.storage.local.set({
  scanStatus: `Loaded ${Object.keys(tickerMap || {}).length} quotes for ${universeMeta.label || 'market'}; preparing scan...`,
  scanProgress: 4,
  scanHeartbeat: Date.now(),
  scannerUniverseMeta: {
   universe: universeMeta.universe || strat.scanUniverse,
   label: universeMeta.label || strat.scanUniverse,
    requested: maxCoins,
    deepScanLimit,
    deepTotal: deepScanLimit,
    completed: false,
    partial: false,
    scanMode: strat.scanMode,
   count: Number(universeMeta.count || 0),
   returned: Number(universeMeta.returned || Object.keys(tickerMap || {}).length || 0),
   scanned: 0,
   fetchedAt: universeMeta.fetchedAt || Date.now(),
  },
 });
 fetchDeltaRateLimitQuota()
 .then(quota => {
   if (quota) {
    chrome.storage.local.set({ deltaRateLimitQuota: quota }).catch(() => {});
    dlog(`Market API quota: current=${quota.currentQuota} resetMs=${quota.remainingMs}`);
   }
  })
 .catch(error => dlog(`Market quota check failed: ${error?.message || error}`));
  let products = Object.keys(tickerMap).map(sym => {
 const instrumentDescription = scanDescribeDeltaInstrument(sym);
  const assetInfo = scanClassifyDeltaInstrument(sym);
  const ticker = tickerMap[sym] || {};
  const dhanInstrument = ticker.dhanInstrument || null;
  return {
 symbol: sym,
 name: instrumentDescription,
 description: instrumentDescription,
 instrumentDescription,
 sector: assetInfo.sector || resolveScannerSector(sym, { dhanInstrument, sector: ticker.sector }),
 assetClass: assetInfo.assetClass,
 assetLabel: assetInfo.assetLabel,
 assetBadge: assetInfo.assetBadge,
  assetInfo: assetInfo.info,
  underlyingSymbol: assetInfo.underlyingSymbol,
  underlyingName: assetInfo.underlyingName,
  securityId: ticker.securityId || dhanInstrument?.securityId || '',
  exchangeSegment: ticker.exchangeSegment || dhanInstrument?.exchangeSegment || '',
  contractType: ticker.contractType || dhanInstrument?.instrument || '',
  dhanInstrument,
  };
  });
  try {
  const apiProducts = await fetchProducts(universeRequest);
  if (apiProducts.length > 0) {
 const apiSet = new Set(apiProducts.map(p => p.symbol));
 products = [...apiProducts, ...products.filter(p => !apiSet.has(p.symbol))];
 const productIntervalMap = new Map(apiProducts.map(p => [p.symbol, Number(p.fundingIntervalSeconds || 0)]));
 Object.entries(tickerMap).forEach(([sym, ticker]) => {
 const intervalSeconds = productIntervalMap.get(sym);
 if (intervalSeconds > 0) ticker.fundingIntervalSeconds = intervalSeconds;
 });
 }
  } catch (e) { dlog(`Products err: ${e.message}`); }
  if (scanContext) scanContext.products = products;
  await chrome.storage.local.set({
  scannerUniverseMeta: {
   universe: universeMeta.universe || strat.scanUniverse,
   label: universeMeta.label || strat.scanUniverse,
   requested: maxCoins,
   deepScanLimit,
   deepTotal: deepScanLimit,
   completed: false,
   partial: false,
   scanMode: strat.scanMode,
   count: Number(universeMeta.count || products.length || 0),
   returned: Number(universeMeta.returned || Object.keys(tickerMap || {}).length || 0),
   fetchedAt: universeMeta.fetchedAt || Date.now(),
  },
  scannerUniverseCatalog: universeMeta.catalog || null,
  });

 // Previous OI
 const prevOIData = (await new Promise(r => chrome.storage.local.get('prevOI', r))).prevOI || {};

 // Market Index
 let marketIndex = calcMarketIndex(tickerMap, storeData.marketIndex || null, strat.marketIndexSettings || {}, prevOIData);
 if (marketIndex) {
 // Persist long FWD-100 history for regime detection and the Chart workspace.
 const histData = await new Promise(r => chrome.storage.local.get(['marketIndexHistory', 'marketIndexHistoryMigration'], r));
 const storedHistory = Array.isArray(histData.marketIndexHistory) ? histData.marketIndexHistory : [];
 const hasLegacyHistory = storedHistory.some(item => Number(item?.schemaVersion || 0) !== MARKET_INDEX_HISTORY_SCHEMA_VERSION);
 const migration = hasLegacyHistory
 ? {
 schemaVersion: MARKET_INDEX_HISTORY_SCHEMA_VERSION,
 migratedAt: Date.now(),
 legacyCount: storedHistory.length,
 reason: 'Started clean cumulative equal-weight FWD-100 history; older reset-style snapshots are not mixed into v2 charts.',
 }
 : (histData.marketIndexHistoryMigration || null);
 const indexHistory = hasLegacyHistory ? [] : storedHistory;
 marketIndex = applyMarketIndexWindowChange(marketIndex, indexHistory, Date.now());
 const fnoConstituents = Array.isArray(marketIndex.fnoConstituents)
 ? marketIndex.fnoConstituents
 : (Array.isArray(marketIndex.topStocks) ? marketIndex.topStocks : (Array.isArray(marketIndex.topCoins) ? marketIndex.topCoins : []));
 const indexTopCount = fnoConstituents.length;
 const indexAdvancing = fnoConstituents.filter(stock => Number(stock?.change || 0) > 0).length;
 const indexDeclining = fnoConstituents.filter(stock => Number(stock?.change || 0) < 0).length;
 const indexBreadthPct = Number.isFinite(Number(marketIndex.sentiment?.breadthPct))
 ? Number(marketIndex.sentiment.breadthPct)
 : (indexTopCount > 0 ? (indexAdvancing / indexTopCount) * 100 : 50);
 const indexAdvanceDeclineRatio = indexAdvancing / Math.max(1, indexDeclining);
 indexHistory.push({
 schemaVersion: MARKET_INDEX_HISTORY_SCHEMA_VERSION,
 composite: marketIndex.composite,
 value: marketIndex.value,
 indexChangePct: marketIndex.indexChangePct,
 indexChangePoints: marketIndex.indexChangePoints,
 indexChangeBasis: marketIndex.indexChangeBasis || '',
 indexChangeWindowLabel: marketIndex.indexChangeWindowLabel || '',
 indexChangeWindowMs: marketIndex.indexChangeWindowMs || 0,
 indexChangeBaselineTs: marketIndex.indexChangeBaselineTs || 0,
 indexChangeBaselineComposite: marketIndex.indexChangeBaselineComposite || 0,
 scanChangePct: marketIndex.scanChangePct,
 scanChangePoints: marketIndex.scanChangePoints,
 scanPreviousComposite: marketIndex.scanPreviousComposite,
 sentimentValue: marketIndex.sentiment?.value ?? marketIndex.value,
 sentimentScore: marketIndex.sentiment?.score ?? 0,
 sentimentLabel: marketIndex.sentiment?.label || '',
 sentimentDrivers: marketIndex.sentiment?.drivers || [],
 breadthPct: roundIndexNumber(indexBreadthPct, 1),
 advancingVolumePct: roundIndexNumber(Number(marketIndex.sentiment?.advancingVolumePct ?? indexBreadthPct), 1),
 fundingStressPct: roundIndexNumber(Number(marketIndex.sentiment?.fundingStressPct ?? 0), 1),
 fundingCrowdingIndex: roundIndexNumber(Number(marketIndex.sentiment?.fundingCrowdingIndex ?? marketIndex.sentiment?.fundingStressPct ?? 0), 1),
 fundingCrowdingBias: marketIndex.sentiment?.fundingCrowdingBias || 'balanced',
 fundingCrowdingShock: roundIndexNumber(Number(marketIndex.sentiment?.fundingCrowdingShock ?? 0), 1),
 fundingLongPressure: roundIndexNumber(Number(marketIndex.sentiment?.fundingLongPressure ?? 0), 1),
 fundingShortPressure: roundIndexNumber(Number(marketIndex.sentiment?.fundingShortPressure ?? 0), 1),
 fundingOiConfirmationPct: roundIndexNumber(Number(marketIndex.sentiment?.fundingOiConfirmationPct ?? 0), 1),
 extremeFundingPct: roundIndexNumber(Number(marketIndex.sentiment?.extremeFundingPct ?? 0), 1),
 topFundingCrowding: marketIndex.sentiment?.topFundingCrowding || [],
 advanceDeclineRatio: roundIndexNumber(indexAdvanceDeclineRatio, 2),
 condition: marketIndex.condition,
 totalVolumeUSD: marketIndex.totalVolumeUSD,
 topCount: indexTopCount,
 advancing: indexAdvancing,
 declining: indexDeclining,
 rebalanced: !!marketIndex.rebalanced,
 rebalanceReason: marketIndex.rebalanceReason || '',
 ts: marketIndex.ts,
 });
 if (indexHistory.length > MARKET_INDEX_HISTORY_LIMIT) {
 indexHistory.splice(0, indexHistory.length - MARKET_INDEX_HISTORY_LIMIT);
 }

 const regime = globalThis.FWDTradeDeskShared.detectVolatilityRegime(indexHistory);
 marketIndex.regime = regime;
 marketIndex.thresholds = globalThis.FWDTradeDeskShared.getRegimeThresholds(regime);
 marketIndex.thresholdSummary = formatThresholdSummary(marketIndex.thresholds);
 await chrome.storage.local.set({ marketIndex, marketIndexHistory: indexHistory, marketIndexHistoryMigration: migration });
 dlog(`NIFTY 50: index=${marketIndex.composite} move=${marketIndex.indexChangePct}% | breadth=${marketIndex.value}% ${marketIndex.condition} | regime=${regime}`);

 // Apply regime-aware thresholds to strategy
 const activeThresholds = marketIndex.thresholds;
 strat.marketRegime = activeThresholds.regime;
 strat.alertScore = activeThresholds.alertScore;
 strat.setupScore = activeThresholds.setupScore;
 strat.watchScore = activeThresholds.watchScore;
 strat.minScore = activeThresholds.minScore;
 minScore = strat.minScore;
 }

 // Activity heatmap. Legacy storage keys are retained so existing panes and
 // backups keep loading, but Dhan rows are treated as turnover/OI activity.
 const fundingRates = {}, fundingHeatmap = [];
 Object.entries(tickerMap).forEach(([sym, t]) => {
 fundingRates[sym] = t.fundingRate ?? 0;
 fundingHeatmap.push({
 symbol: sym, sector: resolveScannerSector(sym, { dhanInstrument: t.dhanInstrument, sector: t.sector }),
 fundingRate: t.fundingRate || 0, change24h: t.change24h || 0,
 nextFundingAt: t.nextFundingAt || 0,
 fundingIntervalSeconds: Number(t.fundingIntervalSeconds || 28800),
 oi: t.oi || 0, volume: t.usdVol24h || 0, price: t.price || 0,
 });
 });
 fundingHeatmap.sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));

 // Activity opportunities. Legacy key retained for compatibility.
 const fundingArb = fundingArbitrage(tickerMap, fundingMinVolume);

 await chrome.storage.local.set({ fundingRates, fundingHeatmap, fundingArbitrage: fundingArb });
 if (scanContext) scanContext.fundingHeatmap = fundingHeatmap;

 // NSE/BSE benchmark reference
 await chrome.storage.local.set({ scanStatus: 'Loading Nifty 50 benchmark reference...', scanProgress: 6, scanHeartbeat: Date.now() });
 let benchmarkRef = null;
 let benchmarkSymbol = '';
 for (const s of ['NIFTY', 'SENSEX', 'BANKNIFTY', 'FINNIFTY']) {
 benchmarkRef = await fetchCandles(s, strat.tf1 || '1d', 100, CLOSED_CANDLE_FETCH_OPTIONS);
 if (scanContext && Array.isArray(benchmarkRef) && benchmarkRef.length) {
 globalThis.FWDTradeDeskScanContext?.recordCandles?.(scanContext, s, strat.tf1 || '1d', benchmarkRef);
 }
 if (benchmarkRef?.length >= 20) {
 benchmarkSymbol = s;
 break;
 }
 }
 const benchmarkCloses = benchmarkRef?.map(c => c.close) ?? null;

 await chrome.storage.local.set({ totalCoins: products.length, totalStocks: products.length });

 // Filter & sort candidates (pinned symbols always included). All NSE breadth can load thousands
 // of quotes, then this ranker promotes penny/relative-move candidates before candle fetches.
 let candidates = products
 .map(p => ({ ...p, ticker: tickerMap[p.symbol] || null }))
 .filter(p => p.ticker?.price &&
  (minVol <= 0 || p.ticker.usdVol24h >= minVol || watchlist.has(p.symbol)));

 candidates = rankScanCandidates(candidates, strat, watchlist);
 if (candidates.length > deepScanLimit) candidates = candidates.slice(0, deepScanLimit);
  dlog(`Candidates: ${candidates.length} deep (${watchlist.size} pinned, mode=${strat.scanMode}, universe=${universeMeta.label || strat.scanUniverse}, breadth=${maxCoins}, returned=${Object.keys(tickerMap || {}).length}, candle pace=${SCAN_CANDLE_PACE_MS}ms)`);
 const deepTotal = candidates.length;
 const resumeCheckpoint = await readScanResumeCheckpoint(candidates, strat);
 const completedSymbols = new Set(Array.isArray(resumeCheckpoint?.completedSymbols) ? resumeCheckpoint.completedSymbols : []);
 const resumedRows = completedSymbols.size;
 await chrome.storage.local.set({
  scannedCoins: resumedRows,
  scannedStocks: resumedRows,
  scanStatus: resumedRows
   ? `Resuming ${universeMeta.label || 'Market'} scan from ${resumedRows}/${deepTotal} completed stocks...`
   : `Starting ${universeMeta.label || 'Market'} scan...`,
 });
 if (resumedRows) dlog(`Resuming durable scan checkpoint: ${resumedRows}/${deepTotal} symbols already completed`);

 // Scan each symbol
 const results = Array.isArray(resumeCheckpoint?.results) ? resumeCheckpoint.results.slice() : [];
 const alertsData = await new Promise(r => chrome.storage.local.get(['alertHistory'], r));
 let alerts = Array.isArray(alertsData.alertHistory) ? alertsData.alertHistory : [];
 const currentAlerts = [];
 // -- Auto-expire stale alerts by tier --
 const _now = Date.now();
 const ALERT_EXPIRY_MS = { watch: 2 * 3600000, setup: 6 * 3600000, execute: 24 * 3600000 };
 const preExpireCount = alerts.length;
 alerts = alerts.filter(a => {
 if (a.starred || a.pinned) return true; // never expire starred/pinned
 const tier = a.alertTier || 'watch';
 const maxAge = ALERT_EXPIRY_MS[tier] || ALERT_EXPIRY_MS.watch;
 return (_now - (a.ts || 0)) < maxAge;
 });
 if (alerts.length < preExpireCount) {
 dlog(`Alert auto-expiry: removed ${preExpireCount - alerts.length} stale alerts (${alerts.length} remaining)`);
 }
 while (alerts.length > ALERT_STORAGE_LIMIT) alerts.pop();
 const alertKeys = new Set(alerts.map(a => a.alertKey).filter(Boolean));
 const session = getMarketSession();
 dlog(`Session: ${session}`);
 // Telegram queue keeps service worker alive until sends are attempted.
 let telegramQueue = Promise.resolve();
 let tgQueued = 0;
 let tgSent = 0;
 let tgFailed = 0;
 let tgSkippedByScore = 0;
 const TELEGRAM_GAP_MS = 1100; // avoid Telegram per-chat rate limit spikes

 const enqueueTelegramSignal = (res, tierLabel) => {
 if (!telegramCfg.enabled) return;
 tgQueued++;
 telegramQueue = telegramQueue.then(async () => {
 const ok = await sendTelegramSignal(telegramCfg, res, tierLabel);
 if (ok) tgSent++;
 else tgFailed++;
 await wait(TELEGRAM_GAP_MS);
 }).catch(() => {
 tgFailed++;
 });
 };

 let noHistoryCount = Math.max(0, Number(resumeCheckpoint?.noHistoryCount || 0));
 for (let i = 0; i < candidates.length; i++) {
 await throwIfScanStopRequested();
 if (i > 0 && i % 20 === 0) {
 await wait(0);
 }
  const { symbol, ticker } = candidates[i];
  if (completedSymbols.has(symbol)) continue;
  const candleOptions = { ...SCAN_CANDLE_FETCH_OPTIONS, instrument: candidates[i].dhanInstrument || null };
 const completedBefore = completedSymbols.size;
 const pct = Math.round(8 + (completedBefore / candidates.length) * 88);
 if (i % 1 === 0 || i === candidates.length - 1) {
 await chrome.storage.local.set({
  scanStatus: `Scanning ${universeMeta.label || 'Market'}: ${symbol} (completed ${completedBefore}/${deepTotal}, pending ${Math.max(0, deepTotal - completedBefore)})`,
 scanProgress: pct,
 scanHeartbeat: Date.now(),
 scannedCoins: completedBefore,
 scannedStocks: completedBefore,
 scannerUniverseMeta: {
  universe: universeMeta.universe || strat.scanUniverse,
   label: universeMeta.label || strat.scanUniverse,
   requested: maxCoins,
   deepScanLimit,
   deepTotal,
   completed: false,
   partial: false,
   scanMode: strat.scanMode,
   count: Number(universeMeta.count || products.length || 0),
  returned: Number(universeMeta.returned || Object.keys(tickerMap || {}).length || 0),
  scanned: completedBefore,
  pending: Math.max(0, deepTotal - completedBefore),
  fetchedAt: universeMeta.fetchedAt || Date.now(),
 },
 });
 }

 let symbolCompleted = false;
 let transientAttempts = 0;
 while (!symbolCompleted) {
 try {
 await chrome.storage.local.set({ scanHeartbeat: Date.now() });
  const dCandles = await fetchCandles(symbol, strat.tf1 || '1d', SCAN_CONTEXT_DAILY_CANDLES, candleOptions);
 if (!Array.isArray(dCandles) || !dCandles.length) {
  noHistoryCount++;
  if (noHistoryCount <= 20 || noHistoryCount % 25 === 0) {
    dlog(`Candle skipped ${symbol}: no historical data returned for ${strat.tf1 || '1d'} (${describeScanCandidateInstrument(candidates[i])}); skipped ${noHistoryCount}/${i + 1}.`);
  }
  symbolCompleted = true;
  break;
 }
  const m2Candles = await fetchCandles(symbol, strat.tf2 || '4h', 50, candleOptions);
 if (scanContext) {
 globalThis.FWDTradeDeskScanContext?.recordCandles?.(scanContext, symbol, strat.tf1 || '1d', dCandles || []);
 globalThis.FWDTradeDeskScanContext?.recordCandles?.(scanContext, symbol, strat.tf2 || '4h', m2Candles || []);
 }
 if (!m2Candles) noHistoryCount++;

  let result = analyseCoin(symbol, dCandles || [], m2Candles || [], ticker, strat, marketIndex);
  const pennyInsight = buildPennyAwakeningInsight(symbol, dCandles || [], m2Candles || [], ticker);
  if (!result && strat.scanMode === 'penny_awakening') {
   result = buildPennyAwakeningResult(symbol, dCandles || [], m2Candles || [], ticker, {
    instrumentDescription: candidates[i].instrumentDescription || candidates[i].description || candidates[i].name || symbol,
    assetClass: candidates[i].assetClass || 'indian_equity',
    assetLabel: candidates[i].assetLabel || universeMeta.label || 'NSE Equity',
    assetBadge: candidates[i].assetBadge || universeMeta.label || 'NSE',
   });
  }
 if (!result) {
  symbolCompleted = true;
  break;
 }
  if (pennyInsight?.active) {
   result.pennyAwakening = pennyInsight;
   result.scannerMode = strat.scanMode;
   if (strat.scanMode === 'penny_awakening') {
    result.score = Math.max(Number(result.score || 0), Number(pennyInsight.score || 0));
    result.rawScore = Math.max(Number(result.rawScore || 0), Number(pennyInsight.score || 0));
    result.spike = true;
    result.setupLabel = result.setupLabel || 'Penny Awakening';
    result.reasons = Array.from(new Set([
     ...(Array.isArray(result.reasons) ? result.reasons : []),
     `Penny Awakening: ${pennyInsight.reasons.slice(0, 4).join(' | ') || 'unusual activity'}`,
    ]));
   }
  }
  result.candlePolicy = 'closed_only';
 result.historyQuality = {
 dailyBars: Array.isArray(dCandles) ? dCandles.length : 0,
 lowerBars: Array.isArray(m2Candles) ? m2Candles.length : 0,
 };
 result.symbolMaturity = scanClassifySymbolMaturity(result, storeData.autoTradeSettings || {});
 result.instrumentDescription = candidates[i].instrumentDescription || candidates[i].description || candidates[i].name || result.instrumentDescription || result.name || result.symbol;
 result.name = result.instrumentDescription;
 result.assetClass = result.assetClass || candidates[i].assetClass || 'indian_equity';
 result.assetLabel = result.assetLabel || candidates[i].assetLabel || universeMeta.label || 'NSE Equity';
 result.assetBadge = result.assetBadge || candidates[i].assetBadge || universeMeta.label || 'NSE';
 result.assetInfo = result.assetInfo || candidates[i].assetInfo || '';
 result.underlyingSymbol = result.underlyingSymbol || candidates[i].underlyingSymbol || '';
 result.underlyingName = result.underlyingName || candidates[i].underlyingName || '';
 result.sector = resolveScannerSector(symbol, candidates[i]);

 // Always include pinned symbols regardless of minScore
 if (result.score < minScore && !watchlist.has(symbol)) {
  symbolCompleted = true;
  break;
 }

 // BUG FIX #3: Mark pinned symbols
 result.pinned = watchlist.has(symbol);

 results.push(result);

 // Benchmark correlation
 if (benchmarkCloses && dCandles?.length >= 10) {
 result.btcCorr = pearsonCorr(benchmarkCloses, dCandles.map(c => c.close));
 result.benchmarkCorr = result.btcCorr;
 result.benchmarkSymbol = benchmarkSymbol || 'NIFTY';
 }

 // Sentiment
 result.sentiment = calcSentiment(ticker, prevOIData[symbol]);

 // OI analysis
 const curOI = result.oi || 0;
 if (curOI > 0 && prevOIData[symbol] > 0) {
 const oiChg = (curOI - prevOIData[symbol]) / prevOIData[symbol];
 result.oiSpike = Math.abs(oiChg) > 0.08;
 result.oiConfirmed = oiChg > 0.08 && Math.abs(result.change24h) > 1;
 result.shortsCovering = oiChg < -0.08 && result.change24h > 1;
 result.oiChangePct = +(oiChg * 100).toFixed(1);
 // OI + Price Divergence - NEW v14
 result.oiPriceDivergence = oiPriceDivergence(curOI, prevOIData[symbol], result.change24h);
 }

 result.liquidationRisk = liquidationRisk(ticker, prevOIData[symbol]);

 // Tiered alerts with sound tier - NEW v14
 const alertTier = classifyAlertTier(result, strat);
 result.alertTier = alertTier;

 if (alertTier) {
 const alertKey = `${symbol}_${alertTier}_${Math.floor(Date.now() / 600000)}`;
 if (!alertKeys.has(alertKey)) {
 alertKeys.add(alertKey);
 const tierLabel = { execute: 'Red EXECUTE', setup: ' SETUP', watch: 'Yellow WATCH' }[alertTier];
 const alertEntry = { ...result, ts: Date.now(), alertKey, alertTier };
 currentAlerts.unshift(alertEntry);
 alerts.unshift(alertEntry);
 await saveAlertsWithLimit(alerts);

 if (alertTier === 'execute' && strat.notify !== false) {
 const alertReasons = Array.isArray(result.reasons) ? result.reasons.filter(Boolean) : [];
 const desktopTitle = `${symbol} ${result.direction.toUpperCase()} - EXECUTE ${result.score}/100`;
 const desktopMessage = [
 ...alertReasons.slice(0, 2),
 result.entry ? `Entry ${scanFormatInr(result.entry)}` : ''
 ].filter(Boolean).join(' | ');
 if (typeof v16PushNotificationFeed === 'function') {
 v16PushNotificationFeed({
 tone: 'success',
 title: `[Current] ${symbol} ${result.direction.toUpperCase()} execute`,
 symbol,
 sourceScannerId: 'current',
 sourceScannerName: 'Current Live',
 sourceType: 'scanner',
 what: `${symbol} ${result.direction.toUpperCase()} score ${result.score}/100 | entry ${scanFormatInr(result.entry)}`,
 why: result.reasons?.slice(0, 3).join(' | ') || 'Current scanner marked this as an execute alert.',
 next: 'Review the signal, breadth, slot state, and manual ticket preview before action.',
 action: 'Open Scanner or the manual review ticket for the full decision state.',
 }).catch(() => null);
 }
 chrome.notifications.create(`alert_${symbol}_${Date.now()}`, {
 type: 'basic', iconUrl: 'icons/icon48.png',
 title: desktopTitle,
 message: desktopMessage || 'Current scanner marked this as an execute alert.',
 priority: 2,
 });
 }
 dlog(` ${tierLabel} ${symbol} score=${result.score}`);
 // Fire webhook for signal alerts - NEW v14
 if (typeof fireWebhooks === 'function') {
 fireWebhooks('signal_alert', {
 symbol, direction: result.direction, score: result.score,
 tier: alertTier, tierLabel, price: result.entry,
 reasons: result.reasons?.slice(0, 5),
 mtfConfirmed: result.mtfConfirmed,
 rsi: result.daily?.rsi ?? result.lower?.rsi ?? null,
 funding: result.fundingRate ?? 0,
 sl: result.sl,
 tp: result.tp1,
 tp1: result.tp1,
 tp2: result.tp2,
 rr: result.rr,
 sector: result.sector, session: getMarketSession(),
 });
 }
 if (Number(result.score || 0) >= telegramCfg.minScore) {
 enqueueTelegramSignal(result, tierLabel);
 } else {
 tgSkippedByScore++;
 }
 }
 }
 symbolCompleted = true;
 } catch (e) {
  dlog(`Error ${symbol}: ${e.message}`);
  if (!isTransientScanError(e) || transientAttempts >= SCAN_TRANSIENT_RETRY_LIMIT) throw e;
  transientAttempts += 1;
  const retryMs = scanRetryDelayMs(e);
  await saveScanResumeCheckpoint(candidates, strat, { completedSymbols, results, noHistoryCount });
  await chrome.storage.local.set({
   scanStatus: `Market API cooldown at ${symbol}; resuming automatically in ${Math.ceil(retryMs / 60000)} minute(s) (completed ${completedSymbols.size}/${deepTotal})`,
   scanHeartbeat: Date.now(),
  });
  dlog(`Transient scan failure ${symbol}; retry ${transientAttempts}/${SCAN_TRANSIENT_RETRY_LIMIT} after ${Math.ceil(retryMs / 1000)}s`);
  await waitForScanRetry(retryMs);
 }
 }
 completedSymbols.add(symbol);
 await saveScanResumeCheckpoint(candidates, strat, { completedSymbols, results, noHistoryCount });
 const completedRows = completedSymbols.size;
 if (completedRows % 10 === 0 || completedRows === deepTotal) {
 await chrome.storage.local.set({
 scanStatus: completedRows === deepTotal
 ? `Finishing ${universeMeta.label || 'Market'} scan (${completedRows}/${deepTotal} scanned)...`
 : `Scanning ${universeMeta.label || 'Market'}: completed ${completedRows}/${deepTotal}, pending ${Math.max(0, deepTotal - completedRows)}`,
 scanProgress: Math.round(8 + (completedRows / Math.max(1, deepTotal)) * 88),
 scanHeartbeat: Date.now(),
 scannedCoins: completedRows,
 scannedStocks: completedRows,
 scannerUniverseMeta: {
  universe: universeMeta.universe || strat.scanUniverse,
  label: universeMeta.label || strat.scanUniverse,
  requested: maxCoins,
  deepScanLimit,
  deepTotal,
  completed: false,
  partial: false,
  scanMode: strat.scanMode,
  count: Number(universeMeta.count || products.length || 0),
  returned: Number(universeMeta.returned || Object.keys(tickerMap || {}).length || 0),
  scanned: completedRows,
  pending: Math.max(0, deepTotal - completedRows),
  fetchedAt: universeMeta.fetchedAt || Date.now(),
 },
 });
 }
 if (completedRows > 0 && (completedRows % SCAN_PARTIAL_CHECKPOINT_EVERY === 0 || completedRows === candidates.length)) {
 await savePartialScanCheckpoint(scanContext, {
 tickerMap,
 products,
 marketIndex,
 fundingHeatmap,
 results,
 scannedRows: completedRows,
 candidateRows: candidates.length,
 });
 }
 }

 if (telegramCfg.enabled && tgQueued > 0) {
 await telegramQueue;
 dlog(`Telegram queue done: queued=${tgQueued} sent=${tgSent} failed=${tgFailed} skippedByScore=${tgSkippedByScore} (min=${telegramCfg.minScore})`);
 } else if (telegramCfg.enabled) {
 dlog(`Telegram queue: no new alerts to send (min=${telegramCfg.minScore}, skippedByScore=${tgSkippedByScore}, dedupe window may apply)`);
 }

 applyFundingDecisionContext(results, fundingDecisionThresholdPct);
 const intelligence = enrichSignalIntelligence(results, marketIndex, storeData.signalHistoryStore || {});
 const enrichedResults = intelligence.results;
 if (marketIndex) {
 marketIndex.leadership = intelligence.marketLeadership;
 marketIndex.sentiment = {
 ...(marketIndex.sentiment || {}),
 leadershipState: intelligence.marketLeadership?.state || 'mixed',
 leadershipLabel: intelligence.marketLeadership?.label || 'Mixed Leadership',
 sectorLeaders: intelligence.sectorBreadth?.leaders || [],
 sectorLaggards: intelligence.sectorBreadth?.laggards || [],
 liveSignalCount: enrichedResults.length,
 };
 marketIndex.thresholdSummary = formatThresholdSummary(marketIndex.thresholds || {});
 marketIndex.breadth = {
 leaderSectors: intelligence.sectorBreadth.leaders,
 laggardSectors: intelligence.sectorBreadth.laggards,
 };
 }
  const decisionState = buildDecisionState(enrichedResults, marketIndex, manualWatchlist);
  const candleFetchStats = {
  cacheHits: Number(globalThis.dhanCandleFetchStats?.cacheHits || 0),
  fallbackCacheHits: Number(globalThis.dhanCandleFetchStats?.fallbackCacheHits || 0),
  apiFetches: Number(globalThis.dhanCandleFetchStats?.apiFetches || 0),
  apiRows: Number(globalThis.dhanCandleFetchStats?.apiRows || 0),
  rateLimitWaits: Number(globalThis.dhanCandleFetchStats?.rateLimitWaits || 0),
  persistedRows: Number(globalThis.dhanCandleFetchStats?.persistedRows || 0),
  incrementalRequests: Number(globalThis.dhanCandleFetchStats?.incrementalRequests || 0),
  noHistory: noHistoryCount,
  deepScanLimit,
  quoteBreadth: Object.keys(tickerMap || {}).length,
  };

  // Sort: pinned first, then by trade quality / score
 enrichedResults.sort((a, b) => {
 if (a.pinned && !b.pinned) return -1;
 if (!a.pinned && b.pinned) return 1;
 return Number(b.tradeQuality?.score || 0) - Number(a.tradeQuality?.score || 0)
 || Number(b.score || 0) - Number(a.score || 0)
 || Number(b.rsComposite || 0) - Number(a.rsComposite || 0);
 });

 // Save OI snapshot
 const oiSnap = {};
 enrichedResults.forEach(r => { if (r.oi > 0) oiSnap[r.symbol] = r.oi; });
 await chrome.storage.local.set({ prevOI: oiSnap });

 // Determine highest triggered sound tier - NEW v14
 const topTier = enrichedResults.reduce((top, r) => {
 if (r.alertTier && (TIER_PRIORITY[r.alertTier] || 0) > (TIER_PRIORITY[top] || 0)) return r.alertTier;
 return top;
 }, null);

 // -- Trim large stores to avoid kQuotaBytes overflow --
 // signalHistoryStore can grow unbounded; keep only last 200 symbols
 if (intelligence.signalHistoryStore && typeof intelligence.signalHistoryStore === 'object') {
 const histKeys = Object.keys(intelligence.signalHistoryStore);
 if (histKeys.length > 200) {
 const sorted = histKeys.sort((a, b) => {
 const aTs = intelligence.signalHistoryStore[a]?.lastTs || 0;
 const bTs = intelligence.signalHistoryStore[b]?.lastTs || 0;
 return bTs - aTs;
 });
 sorted.slice(200).forEach(k => delete intelligence.signalHistoryStore[k]);
 dlog(`[STORAGE] Compacted signal history cache: kept latest 200 of ${histKeys.length} symbols.`);
 }
 }

 // -- Save scan results to storage (with quota-exceeded fallback) --
 let storageSaveOk = true;
 const scanCompletedAt = Date.now();
 const scanCompletedLabel = scanFormatIndiaTime(scanCompletedAt);
 const scannerUniverseSnapshot = {
  scanResults: enrichedResults,
  alerts: currentAlerts,
  decisionShortlist: decisionState.shortlist,
  autoWatchlist: decisionState.autoWatchlist,
  manualWatchlist,
  watchlist: decisionState.mergedWatchlist,
  sectorSummary: intelligence.sectorSummary,
  sectorBreadth: intelligence.sectorBreadth,
  candleFetchStats,
  marketIndex,
 lastScan: scanCompletedLabel,
 lastScanTs: scanCompletedAt,
 scannedStocks: deepTotal,
  totalStocks: deepTotal,
  scannerUniverseMeta: {
   universe: universeMeta.universe || strat.scanUniverse,
   label: universeMeta.label || strat.scanUniverse,
   requested: deepTotal,
   deepScanLimit,
   deepTotal,
   completed: true,
   partial: false,
   scanMode: strat.scanMode,
   count: deepTotal,
   sourceCount: Number(universeMeta.count || products.length || 0),
   returned: Number(universeMeta.returned || Object.keys(tickerMap || {}).length || 0),
   scanned: deepTotal,
   pending: 0,
   skippedNoHistory: noHistoryCount,
   candleFetchStats,
   fetchedAt: universeMeta.fetchedAt || Date.now(),
  },
 };
 const universeSnapshotPatch = await buildScanUniverseSnapshotPatch(universeMeta.universe || strat.scanUniverse, scannerUniverseSnapshot);
 try {
 await chrome.storage.local.set({
 ...universeSnapshotPatch,
 alerts: currentAlerts,
 alertHistory: alerts,
 scanResults: enrichedResults,
 decisionShortlist: decisionState.shortlist,
 autoWatchlist: decisionState.autoWatchlist,
 manualWatchlist,
 watchlist: decisionState.mergedWatchlist,
 scanPartialAvailable: false,
 scanPartialProgress: null,
 sectorSummary: intelligence.sectorSummary,
 sectorBreadth: intelligence.sectorBreadth,
  signalHistoryStore: intelligence.signalHistoryStore,
  candleFetchStats,
  marketIndex,
 scanStatus: `OK Done - ${enrichedResults.length} signals from ${deepTotal} ${universeMeta.label || 'symbols'} (${noHistoryCount} skipped no-history)`,
 scanProgress: 100, lastScan: scanCompletedLabel, lastScanTs: scanCompletedAt,
 totalCoins: deepTotal, scannedCoins: deepTotal,
 totalStocks: deepTotal, scannedStocks: deepTotal,
 scannerUniverseMeta: {
  universe: universeMeta.universe || strat.scanUniverse,
  label: universeMeta.label || strat.scanUniverse,
  requested: deepTotal,
  deepScanLimit,
  deepTotal,
  completed: true,
  partial: false,
  scanMode: strat.scanMode,
  count: deepTotal,
  sourceCount: Number(universeMeta.count || products.length || 0),
  returned: Number(universeMeta.returned || Object.keys(tickerMap || {}).length || 0),
  scanned: deepTotal,
  pending: 0,
  skippedNoHistory: noHistoryCount,
  candleFetchStats,
  fetchedAt: universeMeta.fetchedAt || Date.now(),
 },
 session,
 soundAlert: topTier !== null && scanSoundEnabled(strat),
 soundTier: scanSoundEnabled(strat) ? topTier : null, // NEW: 'execute' | 'setup' | 'watch' | null
 scanActive: false,
 scanHeartbeat: Date.now(),
 [SCAN_RESUME_CHECKPOINT_KEY]: null,
 });
 } catch (saveErr) {
 storageSaveOk = false;
 dlog(`[STORAGE] Warning Save failed: ${String(saveErr?.message || saveErr).slice(0, 150)}`);
 // Emergency trim: aggressively reduce data and retry
 try {
 alerts.splice(200);
 await chrome.storage.local.set({
 ...universeSnapshotPatch,
 alerts: currentAlerts,
 alertHistory: alerts,
 scanResults: enrichedResults,
 decisionShortlist: decisionState.shortlist,
 autoWatchlist: decisionState.autoWatchlist,
 manualWatchlist,
 watchlist: decisionState.mergedWatchlist,
 scanPartialAvailable: false,
  scanPartialProgress: null,
  candleFetchStats,
  marketIndex,
 scanStatus: `OK Done - ${enrichedResults.length} signals (trimmed, ${noHistoryCount} skipped no-history)`,
 scanProgress: 100, lastScan: scanCompletedLabel, lastScanTs: scanCompletedAt,
 totalCoins: deepTotal, scannedCoins: deepTotal,
 totalStocks: deepTotal, scannedStocks: deepTotal,
 scannerUniverseMeta: {
  universe: universeMeta.universe || strat.scanUniverse,
  label: universeMeta.label || strat.scanUniverse,
  requested: deepTotal,
  deepScanLimit,
  deepTotal,
  completed: true,
  partial: false,
  scanMode: strat.scanMode,
  count: deepTotal,
  sourceCount: Number(universeMeta.count || products.length || 0),
  returned: Number(universeMeta.returned || Object.keys(tickerMap || {}).length || 0),
  scanned: deepTotal,
  pending: 0,
  skippedNoHistory: noHistoryCount,
  candleFetchStats,
  fetchedAt: universeMeta.fetchedAt || Date.now(),
 },
 session,
 scanActive: false,
 scanHeartbeat: Date.now(),
 });
 dlog('[STORAGE] OK Retry save succeeded after emergency trim');
 } catch (retryErr) {
 dlog(`[STORAGE] X Retry also failed: ${String(retryErr?.message || retryErr).slice(0, 100)}`);
 // Minimal save to clear scan lock
 chrome.storage.local.set({ scanActive: false, scanHeartbeat: Date.now() }).catch(() => {});
 }
 }
 saveLog();
  dlog(`Candles: ${candleFetchStats.cacheHits + candleFetchStats.fallbackCacheHits} cached, ${candleFetchStats.apiFetches} fetched, ${noHistoryCount} no-history, ${candleFetchStats.apiRows} rows`);
  dlog(`=== v14 SCAN DONE - ${results.length} signals, ${candidates.length} scanned, ${noHistoryCount} skipped no-history ===`);
 try {
 chrome.notifications.create(`scan_complete_${Date.now()}`, {
  type: 'basic',
  iconUrl: 'icons/icon48.png',
  title: 'Scan complete',
  message: `${universeMeta.label || 'Market'}: ${enrichedResults.length} signals from ${candidates.length} scanned (${noHistoryCount} no-history skipped).`,
  priority: 1,
 });
 } catch (_) {}

 // -- Check custom price alerts --
 await checkCustomAlerts(tickerMap, telegramCfg);

 // Fire webhook for scan completion - NEW v14
 if (typeof fireWebhooks === 'function') {
 fireWebhooks('scan_complete', {
 count: enrichedResults.length,
 totalScanned: candidates.length,
 totalCoins: products.length,
 topSignals: enrichedResults.slice(0, 5).map(r => ({
 symbol: r.symbol, score: r.score, direction: r.direction, tier: r.alertTier, tradeQuality: r.tradeQuality?.score || 0,
 })),
 marketCondition: marketIndex?.condition || 'unknown',
 session,
 timestamp: new Date().toISOString(),
 });
 }

 // Build correlation matrix asynchronously so popup UI remains responsive.
 buildAndStoreCorrelationMatrix(enrichedResults, strat).catch(() => {});

 if (typeof fwdRecordPerformanceMetric === 'function') {
 fwdRecordPerformanceMetric('scan', {
 durationMs: performanceNow() - scanStartedAt,
 count: enrichedResults.length,
 scannedCoins: candidates.length,
 totalCoins: products.length,
 storageSaveOk,
 });
 }
 if (scanContext) {
 await globalThis.FWDTradeDeskScanContext?.finalize?.(scanContext, {
 tickerMap,
 products,
 marketIndex,
 fundingHeatmap,
 scanResults: enrichedResults,
 decisionShortlist: decisionState.shortlist,
 partial: false,
 scannedRows: candidates.length,
 candidateRows: candidates.length,
 });
 await globalThis.FWDTradeDeskScanContext?.deriveAll?.({ includeNative: false, source: 'main_scan_complete' })
 .catch(error => dlog(`Strategy Lab derive after scan failed: ${error?.message || error}`));
 }
 if (liveFeedPausedForScan) await setScanLiveFeedPaused(false);
 return enrichedResults;
}

async function refreshSingleSymbol(symbol) {
 const sym = String(symbol || '').toUpperCase().trim();
 if (!sym) return { ok: false, error: 'Invalid symbol' };

 const existing = symbolRefreshInFlight.get(sym);
 if (existing && Date.now() - existing.ts < SYMBOL_REFRESH_TTL_MS) {
 return existing.promise;
 }

 const promise = (async () => {
 await detectAPI();
 const d = await new Promise(r => chrome.storage.local.get(['strategy', 'marketIndex', 'prevOI', 'scanResults', 'watchlist', 'manualWatchlist', 'signalHistoryStore', 'autoTradeSettings'], r));
 const strat = {
 ...defaultStrategy(),
 ...(d.strategy || {}),
 marketIndexSettings: scanSanitizeMarketIndexSettings(d.strategy?.marketIndexSettings || {}),
 };
 const activeThresholds = globalThis.FWDTradeDeskShared.getRegimeThresholds(d.marketIndex?.regime, d.strategy || {});
 strat.marketRegime = activeThresholds.regime;
 strat.alertScore = activeThresholds.alertScore;
 strat.setupScore = activeThresholds.setupScore;
 strat.watchScore = activeThresholds.watchScore;
 strat.minScore = activeThresholds.minScore;
 const tickerMap = await fetchAllTickers();
 const ticker = tickerMap[sym];
 if (!ticker) return { ok: false, error: `Ticker not found: ${sym}` };

 const [dCandles, m2Candles] = await Promise.all([
 fetchCandles(sym, strat.tf1 || '1d', 200, CLOSED_CANDLE_FETCH_OPTIONS),
 fetchCandles(sym, strat.tf2 || '4h', 200, CLOSED_CANDLE_FETCH_OPTIONS),
 ]);
 if (!dCandles?.length && !m2Candles?.length) {
 return { ok: false, error: `No candles for ${sym}` };
 }

 const result = analyseCoin(sym, dCandles || [], m2Candles || [], ticker, strat, d.marketIndex);
 if (!result) return { ok: false, error: `Analysis failed for ${sym}` };
 result.candlePolicy = 'closed_only';
 result.historyQuality = {
 dailyBars: Array.isArray(dCandles) ? dCandles.length : 0,
 lowerBars: Array.isArray(m2Candles) ? m2Candles.length : 0,
 };
 result.symbolMaturity = scanClassifySymbolMaturity(result, d.autoTradeSettings || {});

 const prevOI = d.prevOI || {};
 result.sentiment = calcSentiment(ticker, prevOI[sym]);
 const curOI = result.oi || 0;
 if (curOI > 0 && prevOI[sym] > 0) {
 const oiChg = (curOI - prevOI[sym]) / prevOI[sym];
 result.oiSpike = Math.abs(oiChg) > 0.08;
 result.oiConfirmed = oiChg > 0.08 && Math.abs(result.change24h) > 1;
 result.shortsCovering = oiChg < -0.08 && result.change24h > 1;
 result.oiChangePct = +(oiChg * 100).toFixed(1);
 result.oiPriceDivergence = oiPriceDivergence(curOI, prevOI[sym], result.change24h);
 }
 result.liquidationRisk = liquidationRisk(ticker, prevOI[sym]);

 const manualWatchlist = mergeWatchlists(d.manualWatchlist || d.watchlist || []);
 const watchlist = new Set(manualWatchlist);
 result.pinned = watchlist.has(sym);

 result.alertTier = classifyAlertTier(result, strat);
 result.fundingDecisionThresholdPct = Math.max(0, Number(d.autoTradeSettings?.maxAdverseFundingRatePct || 0.05));

 const scanResults = Array.isArray(d.scanResults) ? d.scanResults.slice() : [];
 const idx = scanResults.findIndex(r => r.symbol === sym);
 if (idx >= 0) scanResults[idx] = result;
 else scanResults.unshift(result);
 const intelligence = enrichSignalIntelligence(scanResults, d.marketIndex || null, d.signalHistoryStore || {});
 const decisionState = buildDecisionState(intelligence.results, d.marketIndex || null, manualWatchlist);
 intelligence.results.sort((a, b) => Number(b.tradeQuality?.score || 0) - Number(a.tradeQuality?.score || 0) || Number(b.score || 0) - Number(a.score || 0));
 await chrome.storage.local.set({
 scanResults: intelligence.results,
 decisionShortlist: decisionState.shortlist,
 autoWatchlist: decisionState.autoWatchlist,
 manualWatchlist,
 watchlist: decisionState.mergedWatchlist,
 sectorSummary: intelligence.sectorSummary,
 sectorBreadth: intelligence.sectorBreadth,
 signalHistoryStore: intelligence.signalHistoryStore,
 lastSymbolRefresh: Date.now(),
 });
 return { ok: true, result: intelligence.results.find(item => item.symbol === sym) || result };
 })().finally(() => {
 symbolRefreshInFlight.delete(sym);
 });

 symbolRefreshInFlight.set(sym, { ts: Date.now(), promise });
 return promise;
}

// ================================================================
// CUSTOM PRICE ALERTS - check against live tickers
// ================================================================

async function checkCustomAlerts(tickerMap, telegramCfg) {
 try {
 const {
 customAlerts = [],
 customAlertPriceHistory = {},
 strategy = {},
 } = await chrome.storage.local.get(['customAlerts', 'customAlertPriceHistory', 'strategy']);
 if (!customAlerts.length) return;
 const soundEnabled = scanSoundEnabled({ ...defaultStrategy(), ...(strategy || {}) });

 let anyTriggered = false;
 const now = Date.now();
 const priceHistory = customAlertPriceHistory || {};

 for (const alert of customAlerts) {
 if (!alert.enabled || (alert.triggered && !alert.repeating)) continue;

 let fired = false;
 let message = '';

 if (alert.type === 'price_cross') {
 const ticker = tickerMap[alert.symbol];
 if (!ticker) continue;
 const currentPrice = ticker.price || 0;
 if (!currentPrice) continue;

 if (alert.direction === 'above' && currentPrice >= alert.targetPrice) {
 fired = true;
 message = ` ${alert.symbol} crossed ABOVE ${scanFormatInr(alert.targetPrice)}\nCurrent: ${scanFormatInr(currentPrice)}`;
 } else if (alert.direction === 'below' && currentPrice <= alert.targetPrice) {
 fired = true;
 message = ` ${alert.symbol} crossed BELOW ${scanFormatInr(alert.targetPrice)}\nCurrent: ${scanFormatInr(currentPrice)}`;
 }

 } else if (alert.type === 'pct_change') {
 const symbols = alert.symbol === 'ALL' ? Object.keys(tickerMap) : [alert.symbol];
 for (const sym of symbols) {
 const ticker = tickerMap[sym];
 if (!ticker?.price) continue;

 // Store price snapshot for time-window tracking
 if (!priceHistory[sym]) priceHistory[sym] = [];
 priceHistory[sym].push({ ts: now, price: ticker.price });
 // Keep only recent entries (24h max)
 priceHistory[sym] = priceHistory[sym].filter(p => now - p.ts < 24 * 60 * 60 * 1000);

 // Find price from N minutes ago
 const windowMs = (alert.timeWindowMinutes || 60) * 60 * 1000;
 const pastEntries = priceHistory[sym].filter(p => now - p.ts >= windowMs * 0.8 && now - p.ts <= windowMs * 1.5);
 if (!pastEntries.length) continue;

 const pastPrice = pastEntries[0].price;
 const changePct = ((ticker.price - pastPrice) / pastPrice) * 100;

 const isTriggered =
 (alert.pctDirection === 'up' && changePct >= alert.pctThreshold) ||
 (alert.pctDirection === 'down' && changePct <= -alert.pctThreshold) ||
 (alert.pctDirection === 'either' && Math.abs(changePct) >= alert.pctThreshold);

 if (isTriggered) {
 fired = true;
 message = `Chart ${sym} moved ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% in ${alert.timeWindowMinutes}m\nCurrent: ${scanFormatInr(ticker.price)}`;
 break; // Only fire for first symbol match
 }
 }

 } else if (alert.type === 'funding_rate') {
 const symbols = alert.symbol === 'ALL' ? Object.keys(tickerMap) : [alert.symbol];
 for (const sym of symbols) {
 const ticker = tickerMap[sym];
 const fr = ticker?.fundingRate;
 if (fr == null) continue;

 const isTriggered =
 (alert.fundingDirection === 'above' && fr >= alert.fundingThreshold) ||
 (alert.fundingDirection === 'below' && fr <= -alert.fundingThreshold) ||
 (alert.fundingDirection === 'either' && Math.abs(fr) >= alert.fundingThreshold);

 if (isTriggered) {
 fired = true;
 message = ` ${sym} funding rate: ${fr >= 0 ? '+' : ''}${fr.toFixed(4)}%\nThreshold: ${alert.fundingThreshold}%`;
 break;
 }
 }
 }

 if (fired) {
 alert.triggered = true;
 alert.triggeredAt = now;
 if (!alert.repeating) alert.enabled = false;
 anyTriggered = true;

 const fullMessage = message + (alert.note ? `\nNote: ${alert.note}` : '');

 // Chrome push notification
 chrome.notifications.create(`custom_alert_${alert.id}_${now}`, {
 type: 'basic',
 iconUrl: 'icons/icon48.png',
 title: 'FWDTradeDesk Custom Alert',
 message: fullMessage.replace(/\n/g, ' | '),
 priority: 2,
 });

 // Telegram
 if (telegramCfg?.enabled && telegramCfg.botToken && telegramCfg.chatId) {
 const tgText = ` <b>Custom Alert</b>\n${fullMessage}\nTime: ${new Date().toLocaleString()}`;
 try {
 await rateLimitedNotifyFetch(
 `https://api.telegram.org/bot${encodeURIComponent(telegramCfg.botToken)}/sendMessage`,
 {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ chat_id: telegramCfg.chatId, text: tgText, parse_mode: 'HTML', disable_web_page_preview: true }),
 signal: AbortSignal.timeout(10000),
 }
 );
 } catch (e) { dlog(`Custom alert Telegram error: ${e.message}`); }
 }

 // Sound flag for popup
 await chrome.storage.local.set({
 soundAlert: soundEnabled,
 soundTier: soundEnabled ? 'execute' : null,
 });

 dlog(`CUSTOM ALERT FIRED: ${alert.type} - ${message.split('\n')[0]}`);
 }
 }

 // Save updated alerts + price history
 await chrome.storage.local.set({ customAlerts, customAlertPriceHistory: priceHistory });

 } catch (e) {
 dlog(`Custom alerts check error: ${e.message}`);
 }
}

let customAlertPollPromise = null;

async function runCustomAlertPollingPass() {
 if (customAlertPollPromise) return customAlertPollPromise;
 customAlertPollPromise = (async () => {
 try {
 await detectAPI();
 const { customAlerts = [] } = await chrome.storage.local.get(['customAlerts']);
 if (!customAlerts.some(alert => alert?.enabled)) return { ok: true, skipped: true };
 const tickerMap = await fetchAllTickers();
 const telegramCfg = await loadStoredTelegramConfig();
 await checkCustomAlerts(tickerMap, telegramCfg);
 return { ok: true };
 } catch (error) {
 dlog(`Custom alert poll error: ${error?.message || error}`);
 return { ok: false, error: error?.message || 'custom_alert_poll_failed' };
 } finally {
 customAlertPollPromise = null;
 }
 })();
 return customAlertPollPromise;
}
