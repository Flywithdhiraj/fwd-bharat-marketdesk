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
const MARKET_INDEX_HISTORY_LIMIT = 5000;

function applyFundingDecisionContext(results = [], threshold = 0) {
 const limit = Math.abs(Number(threshold || 0));
 (Array.isArray(results) ? results : []).forEach(signal => {
 signal.fundingDecisionThresholdPct = limit;
 });
 return results;
}

function buildBenchmarkEligibleUniverse(tickerMap = {}) {
 const EXCLUDE = /PAXG|XAUT|USDT(USD)?$|BTCDOM/;
 return Object.entries(tickerMap)
 .filter(([sym, t]) => !EXCLUDE.test(sym) && (sym.endsWith('USD') || sym.endsWith('USDT'))
 && t.usdVol24h > 0 && t.price > 0);
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
 const composite = +(10000 * (1 + value / 100)).toFixed(2);
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
 notes: 'Internal benchmark inspired by CF-style broad-cap and free-float weighting, using Delta liquidity and open-interest proxy data.',
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
 notes: 'Internal benchmark inspired by S&P-style top-index construction, using buffered top-10 selection and equal weights on the Delta universe.',
 });

 return { cf, sp };
}

function calcMarketIndex(tickerMap, prevMarketIndex = null, marketIndexSettings = {}) {
 const indexSettings = scanSanitizeMarketIndexSettings(marketIndexSettings || {});
 const excludedSymbols = new Set((indexSettings.excludedSymbols || []).map(symbol => String(symbol || '').toUpperCase()));
 const allTickers = buildBenchmarkEligibleUniverse(tickerMap);
 const eligibleTickers = allTickers.filter(([sym]) => !excludedSymbols.has(String(sym || '').toUpperCase()));
 dlog(`FWD-10: ${eligibleTickers.length} eligible from ${Object.keys(tickerMap).length} (excluded ${excludedSymbols.size})`);
 const configuredMaxConstituents = Math.max(1, Number(indexSettings.maxConstituents || 10));
 const tickers = eligibleTickers.sort((a, b) => b[1].usdVol24h - a[1].usdVol24h).slice(0, configuredMaxConstituents);
 if (!tickers.length) { dlog('FWD-10: null'); return null; }
 const totalVol = tickers.reduce((s, [, t]) => s + (t.usdVol24h || 1), 0);
 if (!totalVol) return null;
 const equalWeight = tickers.length ? (100 / tickers.length) : 0;
 const val = tickers.reduce((s, [, t]) => s + ((t.change24h || 0) / tickers.length), 0);
 const condition = resolveBenchmarkCondition(val);
 const compositeValue = +(10000 * (1 + val / 100)).toFixed(2);
 const benchmarks = calcInternalBenchmarkSuite(tickerMap, prevMarketIndex);
 dlog(`FWD-10: ${val.toFixed(2)}% | ${condition} | composite ${compositeValue}`);
 return {
 value: +val.toFixed(2), condition, composite: compositeValue,
 totalVolumeUSD: totalVol, ts: Date.now(),
 method: 'Equal-weight composite',
 selectionLabel: tickers.length < configuredMaxConstituents
 ? `Top ${tickers.length} liquid coins (max ${configuredMaxConstituents})`
 : `Top ${tickers.length} liquid coins`,
 configuredMaxConstituents,
 excludedSymbols: Array.from(excludedSymbols),
 benchmarks,
 topCoins: tickers.map(([sym, t]) => ({
 sym, change: t.change24h || 0,
 weight: +equalWeight.toFixed(2),
 vol: +((t.usdVol24h || 0) / 1e6).toFixed(1),
 price: t.price || 0, fundingRate: t.fundingRate || 0,
 })),
 };
}

// -- Volatility Regime Detection ---------------------------------
// Uses rolling market-index history to classify current market regime.
// Returns one of: TRENDING, HIGH_VOL, LOW_VOL, CHOPPY, UNKNOWN.

// -- Liquidation Risk --------------------------------------------
// Note: Delta public channels do not expose a dedicated market-wide
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
 'Volume24h_USD','OI','FundingRate%','Entry','SL','TP1','TP2','RR',
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
 tf1: '1d', tf2: '15m',
 minScore: 15, alertScore: 65, maxCoins: 500, minVolume: 0,
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

// ================================================================
// RUN SCAN - v14
// ================================================================
async function runScan() {
 const scanStartedAt = performanceNow();
 dlog('=== v14 SCAN START ===');
 await chrome.storage.local.set({
 alerts: [],
 scanActive: true,
 scanHeartbeat: Date.now(),
 scanStatus: 'Loading tickers...',
 scanProgress: 2,
 });
 await detectAPI(true);
 dlog(`API: ${BASE} (${detectedRegion})`);

 const storeData = await new Promise(r => chrome.storage.local.get(['strategy', 'watchlist', 'manualWatchlist', 'signalHistoryStore', 'marketIndex', 'autoTradeSettings'], r));
 const strat = {
 ...defaultStrategy(),
 ...(storeData.strategy || {}),
 marketIndexSettings: scanSanitizeMarketIndexSettings(storeData.strategy?.marketIndexSettings || {}),
 };
 strat.alertTone = sanitizeAlertTone(strat.alertTone);
 const manualWatchlist = mergeWatchlists(storeData.manualWatchlist || storeData.watchlist || []);
 const watchlist = new Set(manualWatchlist);
 const telegramCfg = await getStoredTelegramConfig();
 dlog(`Telegram alerts: ${telegramCfg.enabled ? `enabled (score>=${telegramCfg.minScore})` : 'disabled (enable in HOOKS)'}`);
 let minScore = strat.minScore || 15;
 const maxCoins = strat.maxCoins || 500;
 const minVol = strat.minVolume || 0;
 const fundingMinVolume = sanitizeFundingMinVolume(strat.fundingMinVolume);
 strat.fundingMinVolume = fundingMinVolume;
 const fundingDecisionThresholdPct = Math.max(0, Number(storeData.autoTradeSettings?.maxAdverseFundingRatePct || 0.05));

 const tickerMap = await fetchAllTickers();

 await chrome.storage.local.set({ scanStatus: 'Loading products...', scanProgress: 4, scanHeartbeat: Date.now() });
 let products = Object.keys(tickerMap).map(sym => {
 const instrumentDescription = scanDescribeDeltaInstrument(sym);
 const assetInfo = scanClassifyDeltaInstrument(sym);
 return {
 symbol: sym,
 name: instrumentDescription,
 description: instrumentDescription,
 instrumentDescription,
 sector: assetInfo.sector || getSector(sym),
 assetClass: assetInfo.assetClass,
 assetLabel: assetInfo.assetLabel,
 assetBadge: assetInfo.assetBadge,
 assetInfo: assetInfo.info,
 underlyingSymbol: assetInfo.underlyingSymbol,
 underlyingName: assetInfo.underlyingName,
 };
 });
 try {
 const apiProducts = await fetchProducts();
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

 // Market Index
 const marketIndex = calcMarketIndex(tickerMap, storeData.marketIndex || null, strat.marketIndexSettings || {});
 if (marketIndex) {
 // Persist long FWD-10 history for regime detection and the Chart workspace.
 const histData = await new Promise(r => chrome.storage.local.get(['marketIndexHistory'], r));
 const indexHistory = Array.isArray(histData.marketIndexHistory) ? histData.marketIndexHistory : [];
 indexHistory.push({
 composite: marketIndex.composite,
 value: marketIndex.value,
 condition: marketIndex.condition,
 totalVolumeUSD: marketIndex.totalVolumeUSD,
 topCount: Array.isArray(marketIndex.topCoins) ? marketIndex.topCoins.length : 0,
 advancing: Array.isArray(marketIndex.topCoins) ? marketIndex.topCoins.filter(coin => Number(coin?.change || 0) > 0).length : 0,
 declining: Array.isArray(marketIndex.topCoins) ? marketIndex.topCoins.filter(coin => Number(coin?.change || 0) < 0).length : 0,
 ts: marketIndex.ts,
 });
 if (indexHistory.length > MARKET_INDEX_HISTORY_LIMIT) {
 indexHistory.splice(0, indexHistory.length - MARKET_INDEX_HISTORY_LIMIT);
 }

 const regime = globalThis.FWDTradeDeskShared.detectVolatilityRegime(indexHistory);
 marketIndex.regime = regime;
 marketIndex.thresholds = globalThis.FWDTradeDeskShared.getRegimeThresholds(regime);
 marketIndex.thresholdSummary = formatThresholdSummary(marketIndex.thresholds);
 await chrome.storage.local.set({ marketIndex, marketIndexHistory: indexHistory });
 dlog(`FWD-10: ${marketIndex.value}% | ${marketIndex.condition} | regime=${regime}`);

 // Apply regime-aware thresholds to strategy
 const activeThresholds = marketIndex.thresholds;
 strat.marketRegime = activeThresholds.regime;
 strat.alertScore = activeThresholds.alertScore;
 strat.setupScore = activeThresholds.setupScore;
 strat.watchScore = activeThresholds.watchScore;
 strat.minScore = activeThresholds.minScore;
 minScore = strat.minScore;
 }

 // Funding heatmap
 const fundingRates = {}, fundingHeatmap = [];
 Object.entries(tickerMap).forEach(([sym, t]) => {
 fundingRates[sym] = t.fundingRate ?? 0;
 fundingHeatmap.push({
 symbol: sym, sector: getSector(sym),
 fundingRate: t.fundingRate || 0, change24h: t.change24h || 0,
 nextFundingAt: t.nextFundingAt || 0,
 fundingIntervalSeconds: Number(t.fundingIntervalSeconds || 28800),
 oi: t.oi || 0, volume: t.usdVol24h || 0, price: t.price || 0,
 });
 });
 fundingHeatmap.sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));

 // Funding Arbitrage - NEW v14
 const fundingArb = fundingArbitrage(tickerMap, fundingMinVolume);

 await chrome.storage.local.set({ fundingRates, fundingHeatmap, fundingArbitrage: fundingArb });

 // BTC reference
 await chrome.storage.local.set({ scanStatus: 'Loading BTC ref...', scanProgress: 6, scanHeartbeat: Date.now() });
 let btcRef = null;
 for (const s of ['BTCUSD', 'BTCUSDT', 'XBTUSD']) {
 btcRef = await fetchCandles(s, strat.tf1 || '1d', 100, CLOSED_CANDLE_FETCH_OPTIONS);
 if (btcRef?.length >= 20) break;
 }
 const btcCloses = btcRef?.map(c => c.close) ?? null;

 // Previous OI
 const prevOIData = (await new Promise(r => chrome.storage.local.get('prevOI', r))).prevOI || {};
 await chrome.storage.local.set({ totalCoins: products.length });

 // Filter & sort candidates (pinned coins always included)
 let candidates = products
 .map(p => ({ ...p, ticker: tickerMap[p.symbol] || null }))
 .filter(p => p.ticker?.price &&
 (minVol <= 0 || p.ticker.usdVol24h >= minVol || watchlist.has(p.symbol)));

 // Sort: pinned first, then by volume
 candidates.sort((a, b) => {
 const aPin = watchlist.has(a.symbol) ? 1 : 0;
 const bPin = watchlist.has(b.symbol) ? 1 : 0;
 if (aPin !== bPin) return bPin - aPin;
 return (b.ticker?.usdVol24h || 0) - (a.ticker?.usdVol24h || 0);
 });
 if (candidates.length > maxCoins) candidates = candidates.slice(0, maxCoins);
 dlog(`Candidates: ${candidates.length} (${watchlist.size} pinned)`);
 await chrome.storage.local.set({ scannedCoins: candidates.length });

 // Scan each coin
 const results = [];
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

 for (let i = 0; i < candidates.length; i++) {
 if (i > 0 && i % 20 === 0) {
 await wait(0);
 }
 const { symbol, ticker } = candidates[i];
 const pct = Math.round(8 + (i / candidates.length) * 88);
 if (i % 5 === 0 || i === candidates.length - 1) {
 await chrome.storage.local.set({
 scanStatus: `Scanning ${symbol} (${i + 1}/${candidates.length})`,
 scanProgress: pct,
 scanHeartbeat: Date.now(),
 });
 }

 try {
 const [dCandles, m2Candles] = await Promise.all([
 fetchCandles(symbol, strat.tf1 || '1d', 200, CLOSED_CANDLE_FETCH_OPTIONS),
 fetchCandles(symbol, strat.tf2 || '15m', 200, CLOSED_CANDLE_FETCH_OPTIONS),
 ]);
 if (!dCandles && !m2Candles) continue;

 const result = analyseCoin(symbol, dCandles || [], m2Candles || [], ticker, strat, marketIndex);
 if (!result) continue;
 result.candlePolicy = 'closed_only';
 result.historyQuality = {
 dailyBars: Array.isArray(dCandles) ? dCandles.length : 0,
 lowerBars: Array.isArray(m2Candles) ? m2Candles.length : 0,
 };
 result.symbolMaturity = scanClassifySymbolMaturity(result, storeData.autoTradeSettings || {});
 result.instrumentDescription = candidates[i].instrumentDescription || candidates[i].description || candidates[i].name || result.instrumentDescription || result.name || result.symbol;
 result.name = result.instrumentDescription;
 result.assetClass = result.assetClass || candidates[i].assetClass || 'crypto_derivative';
 result.assetLabel = result.assetLabel || candidates[i].assetLabel || 'Crypto';
 result.assetBadge = result.assetBadge || candidates[i].assetBadge || 'Crypto';
 result.assetInfo = result.assetInfo || candidates[i].assetInfo || '';
 result.underlyingSymbol = result.underlyingSymbol || candidates[i].underlyingSymbol || '';
 result.underlyingName = result.underlyingName || candidates[i].underlyingName || '';

 // Always include pinned coins regardless of minScore
 if (result.score < minScore && !watchlist.has(symbol)) continue;

 // BUG FIX #3: Mark pinned coins
 result.pinned = watchlist.has(symbol);

 results.push(result);

 // BTC correlation
 if (btcCloses && dCandles?.length >= 10)
 result.btcCorr = pearsonCorr(btcCloses, dCandles.map(c => c.close));

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
 chrome.notifications.create(`alert_${symbol}_${Date.now()}`, {
 type: 'basic', iconUrl: 'icons/icon48.png',
 title: `${tierLabel} ${result.score}/100 - ${symbol} ${result.direction.toUpperCase()}`,
 message: `${result.reasons.slice(0, 3).join(' | ')} | $${result.entry?.toFixed(4) || '-'}`,
 priority: 2,
 });
 }
 dlog(` ${tierLabel} ${symbol} score=${result.score}`);
 // Fire webhook for signal alerts - NEW v14
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
 if (Number(result.score || 0) >= telegramCfg.minScore) {
 enqueueTelegramSignal(result, tierLabel);
 } else {
 tgSkippedByScore++;
 }
 }
 }
 } catch (e) { dlog(`Error ${symbol}: ${e.message}`); }
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
 marketIndex.thresholdSummary = formatThresholdSummary(marketIndex.thresholds || {});
 marketIndex.breadth = {
 leaderSectors: intelligence.sectorBreadth.leaders,
 laggardSectors: intelligence.sectorBreadth.laggards,
 };
 }
 const decisionState = buildDecisionState(enrichedResults, marketIndex, manualWatchlist);

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
 dlog(`[STORAGE] Trimmed signalHistoryStore: ${histKeys.length} -> 200`);
 }
 }

 // -- Save scan results to storage (with quota-exceeded fallback) --
 let storageSaveOk = true;
 try {
 await chrome.storage.local.set({
 alerts: currentAlerts,
 alertHistory: alerts,
 scanResults: enrichedResults,
 decisionShortlist: decisionState.shortlist,
 autoWatchlist: decisionState.autoWatchlist,
 manualWatchlist,
 watchlist: decisionState.mergedWatchlist,
 sectorSummary: intelligence.sectorSummary,
 sectorBreadth: intelligence.sectorBreadth,
 signalHistoryStore: intelligence.signalHistoryStore,
 marketIndex,
 scanStatus: `OK Done - ${enrichedResults.length} signals from ${candidates.length} coins`,
 scanProgress: 100, lastScan: new Date().toLocaleTimeString(), lastScanTs: Date.now(),
 totalCoins: products.length, scannedCoins: candidates.length,
 session,
 soundAlert: topTier !== null && scanSoundEnabled(strat),
 soundTier: scanSoundEnabled(strat) ? topTier : null, // NEW: 'execute' | 'setup' | 'watch' | null
 scanActive: false,
 scanHeartbeat: Date.now(),
 });
 } catch (saveErr) {
 storageSaveOk = false;
 dlog(`[STORAGE] Warning Save failed: ${String(saveErr?.message || saveErr).slice(0, 150)}`);
 // Emergency trim: aggressively reduce data and retry
 try {
 alerts.splice(200);
 await chrome.storage.local.set({
 alerts: currentAlerts,
 alertHistory: alerts,
 scanResults: enrichedResults,
 decisionShortlist: decisionState.shortlist,
 autoWatchlist: decisionState.autoWatchlist,
 manualWatchlist,
 watchlist: decisionState.mergedWatchlist,
 marketIndex,
 scanStatus: `OK Done - ${enrichedResults.length} signals (trimmed)`,
 scanProgress: 100, lastScan: new Date().toLocaleTimeString(), lastScanTs: Date.now(),
 totalCoins: products.length, scannedCoins: candidates.length,
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
 dlog(`=== v14 SCAN DONE - ${results.length} signals ===`);

 // -- Check custom price alerts --
 await checkCustomAlerts(tickerMap, telegramCfg);

 // Fire webhook for scan completion - NEW v14
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

 // Build correlation matrix asynchronously so popup UI remains responsive.
 buildAndStoreCorrelationMatrix(enrichedResults, strat).catch(() => {});

 // -- Auto-Trade Engine: ALWAYS runs even if storage save failed --
 // enrichedResults are in memory - no storage dependency for order placement.
 if (typeof runAutoTradeEngine === 'function') {
 runAutoTradeEngine(enrichedResults).catch(err => dlog(`[AUTO-TRADE] Engine error: ${String(err?.message || err)} ${String(err?.stack || '').slice(0, 200)}`));
 }
 if (typeof runOptionsAutoTradeEngine === 'function') {
 runOptionsAutoTradeEngine(enrichedResults).catch(err => dlog(`[OPTIONS-AUTO] Engine error: ${String(err?.message || err)} ${String(err?.stack || '').slice(0, 200)}`));
 }

 if (typeof fwdRecordPerformanceMetric === 'function') {
 fwdRecordPerformanceMetric('scan', {
 durationMs: performanceNow() - scanStartedAt,
 count: enrichedResults.length,
 scannedCoins: candidates.length,
 totalCoins: products.length,
 storageSaveOk,
 });
 }
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
 fetchCandles(sym, strat.tf2 || '15m', 200, CLOSED_CANDLE_FETCH_OPTIONS),
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
 message = ` ${alert.symbol} crossed ABOVE $${alert.targetPrice}\nCurrent: $${currentPrice.toFixed(6)}`;
 } else if (alert.direction === 'below' && currentPrice <= alert.targetPrice) {
 fired = true;
 message = ` ${alert.symbol} crossed BELOW $${alert.targetPrice}\nCurrent: $${currentPrice.toFixed(6)}`;
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
 message = `Chart ${sym} moved ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% in ${alert.timeWindowMinutes}m\nCurrent: $${ticker.price.toFixed(6)}`;
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


// ================================================================
// BACKTEST
// ================================================================
