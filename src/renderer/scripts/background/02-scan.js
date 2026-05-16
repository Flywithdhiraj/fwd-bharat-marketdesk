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
const SCAN_CANDLE_FETCH_OPTIONS = Object.freeze({ closedOnly: true, timeoutMs: 30000 });
const SCAN_PARTIAL_CHECKPOINT_EVERY = 20;
const MARKET_INDEX_HISTORY_LIMIT = 5000;
const MARKET_INDEX_HISTORY_SCHEMA_VERSION = 2;
const MARKET_INDEX_BASE_VALUE = 10000;
const MARKET_INDEX_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MARKET_INDEX_CHANGE_TARGET_TOLERANCE_MS = 90 * 60 * 1000;
const MARKET_INDEX_REBALANCE_DEFAULT_DAYS = 7;
const MARKET_INDEX_RETENTION_MULTIPLIER = 1.5;
const MARKET_INDEX_CORE_LOCK_RATIO = 0.7;
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
 if (!normalized || (!normalized.endsWith('USD') && !normalized.endsWith('USDT'))) return false;
 const base = getIndexBaseSymbol(normalized);
 if (!base || MARKET_INDEX_EXCLUDED_BASES.has(base) || /DOM$/.test(base)) return false;
 return Number(ticker?.usdVol24h || 0) > 0 && Number(ticker?.price || 0) > 0;
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

function buildFwdSentimentTape(constituents = [], prevOIData = {}) {
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
 const fundingStressPct = rows.filter(item => Math.abs(Number(item.fundingRate || 0)) >= 0.05).length / total * 100;
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
 - (fundingStressPct * 0.2)
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
 btc || eth ? `BTC ${roundIndexNumber(Number(btc?.change || 0))}% / ETH ${roundIndexNumber(Number(eth?.change || 0))}% leadership` : 'BTC/ETH leadership unavailable',
 fundingStressPct > 0 ? `${roundIndexNumber(fundingStressPct, 1)}% funding stress` : 'Funding stress contained',
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
 fundingStressPct: roundIndexNumber(fundingStressPct, 1),
 oiExpansionPct: roundIndexNumber(oiExpansionPct, 1),
 btcChange: roundIndexNumber(Number(btc?.change || 0)),
 ethChange: roundIndexNumber(Number(eth?.change || 0)),
 drivers,
 };
}

function calcMarketIndex(tickerMap, prevMarketIndex = null, marketIndexSettings = {}, prevOIData = {}) {
 const indexSettings = scanSanitizeMarketIndexSettings(marketIndexSettings || {});
 const excludedSymbols = new Set((indexSettings.excludedSymbols || []).map(symbol => String(symbol || '').toUpperCase()));
 const allTickers = buildBenchmarkEligibleUniverse(tickerMap);
 const eligibleTickers = allTickers.filter(([sym]) => !isManuallyExcludedIndexSymbol(sym, excludedSymbols));
 dlog(`FWD-100: ${eligibleTickers.length} eligible from ${Object.keys(tickerMap).length} (excluded ${excludedSymbols.size})`);
 const configuredMaxConstituents = Math.max(1, Number(indexSettings.maxConstituents || 100));
 const settingsHash = buildMarketIndexSettingsHash(indexSettings);
 const now = Date.now();
 const prevState = prevMarketIndex?.indexState || null;
 const prevRebuildNonce = Number(prevState?.rebuildNonce || 0);
 const rebuildNonce = Number(indexSettings.rebuildNonce || 0);
 const rebalanceMs = Math.max(1, Number(indexSettings.rebalanceDays || MARKET_INDEX_REBALANCE_DEFAULT_DAYS)) * 24 * 60 * 60 * 1000;
 const settingsChanged = !!prevState?.settingsHash && prevState.settingsHash !== settingsHash;
 const manualRebuild = rebuildNonce > prevRebuildNonce;
 const scheduledRebalance = !prevState?.lastRebalancedAt || (now - Number(prevState.lastRebalancedAt || 0)) >= rebalanceMs;
 const selected = selectMarketIndexConstituents(eligibleTickers, prevState, configuredMaxConstituents);
 if (!selected.length) { dlog('FWD-100: null'); return null; }
 const reason = !prevState ? 'initial'
 : manualRebuild ? 'manual'
 : settingsChanged ? 'settings'
 : scheduledRebalance ? 'weekly'
 : 'carry';
 const shouldRebalance = reason !== 'carry';
 const previousComposite = Number(prevState?.lastComposite || prevMarketIndex?.composite || MARKET_INDEX_BASE_VALUE);
 const oldStateCalc = prevState ? calculateMarketIndexCompositeFromState(prevState, tickerMap) : null;
 const currentCompositeBeforeRebalance = oldStateCalc?.composite || previousComposite || MARKET_INDEX_BASE_VALUE;
 const state = shouldRebalance
 ? buildRebalancedMarketIndexState(selected, currentCompositeBeforeRebalance, now, { settingsHash, reason, rebuildNonce })
 : prevState;
 const calculated = calculateMarketIndexCompositeFromState(state, tickerMap);
 const indexChangePct = previousComposite > 0
 ? ((calculated.composite - previousComposite) / previousComposite) * 100
 : 0;
 const updatedState = {
 ...state,
 composite: calculated.composite,
 lastComposite: calculated.composite,
 lastPrices: calculated.liveConstituents.reduce((acc, item) => {
 acc[item.sym] = item.price;
 return acc;
 }, {}),
 constituents: calculated.liveConstituents.map(item => ({
 sym: item.sym,
 rank: item.rank,
 units: item.units,
 weight: item.weight,
 price: item.price,
 lastPrice: item.price,
 vol: item.vol,
 })),
 settingsHash,
 rebuildNonce,
 };
 const sentiment = buildFwdSentimentTape(calculated.liveConstituents, prevOIData);
 const totalVol = calculated.totalVolumeUSD;
 const benchmarks = calcInternalBenchmarkSuite(tickerMap, prevMarketIndex);
 dlog(`FWD-100: index ${calculated.composite} (${roundIndexNumber(indexChangePct)}%) | sentiment ${sentiment.value}% ${sentiment.condition} | ${reason}`);
 return {
 value: sentiment.value,
 condition: sentiment.condition,
 composite: calculated.composite,
 indexValue: calculated.composite,
 indexChangePct: roundIndexNumber(indexChangePct),
 indexChangePoints: roundIndexNumber(calculated.composite - previousComposite),
 previousComposite: roundIndexNumber(previousComposite),
 scanChangePct: roundIndexNumber(indexChangePct),
 scanChangePoints: roundIndexNumber(calculated.composite - previousComposite),
 scanPreviousComposite: roundIndexNumber(previousComposite),
 indexChangeBasis: 'since_previous_scan',
 indexChangeWindowLabel: 'scan',
 indexChangeWindowMs: 0,
 indexChangeBaselineTs: 0,
 indexChangeBaselineComposite: 0,
 sentiment,
 totalVolumeUSD: totalVol, ts: Date.now(),
 method: 'Cumulative equal-weight index',
 selectionLabel: calculated.liveConstituents.length < configuredMaxConstituents
 ? `Top ${calculated.liveConstituents.length} liquid coins (max ${configuredMaxConstituents})`
 : `Top ${calculated.liveConstituents.length} liquid coins`,
 configuredMaxConstituents,
 excludedSymbols: Array.from(excludedSymbols),
 indexState: updatedState,
 rebalanced: shouldRebalance,
 rebalanceReason: reason,
 lastRebalancedAt: updatedState.lastRebalancedAt,
 nextRebalanceAt: Number(updatedState.lastRebalancedAt || now) + rebalanceMs,
 missingConstituents: calculated.missing,
 benchmarks,
 topCoins: calculated.liveConstituents.map(item => ({
 sym: item.sym,
 change: roundIndexNumber(item.change),
 weight: roundIndexNumber(item.weight),
 vol: roundIndexNumber((item.vol || 0) / 1e6, 1),
 price: item.price || 0,
 fundingRate: item.fundingRate || 0,
 oi: item.oi || 0,
 units: item.units,
 stale: item.stale,
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
 scanPartialProgress: {
 scannedRows,
 candidateRows,
 signalRows: scanResults.length,
 candleSymbols,
 },
 });
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
 const scanStartedAt = performanceNow();
 const scanContext = globalThis.FWDTradeDeskScanContext?.create?.({ startedAt: Date.now() }) || null;
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
 if (scanContext) scanContext.tickerMap = tickerMap;

 await chrome.storage.local.set({ scanStatus: 'Loading products...', scanProgress: 4, scanHeartbeat: Date.now() });
 fetchDeltaRateLimitQuota()
 .then(quota => {
  if (quota) {
   chrome.storage.local.set({ deltaRateLimitQuota: quota }).catch(() => {});
   dlog(`Delta quota: current=${quota.currentQuota} resetMs=${quota.remainingMs}`);
  }
 })
 .catch(error => dlog(`Delta quota check failed: ${error?.message || error}`));
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
 if (scanContext) scanContext.products = products;

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
 condition: marketIndex.condition,
 totalVolumeUSD: marketIndex.totalVolumeUSD,
 topCount: Array.isArray(marketIndex.topCoins) ? marketIndex.topCoins.length : 0,
 advancing: Array.isArray(marketIndex.topCoins) ? marketIndex.topCoins.filter(coin => Number(coin?.change || 0) > 0).length : 0,
 declining: Array.isArray(marketIndex.topCoins) ? marketIndex.topCoins.filter(coin => Number(coin?.change || 0) < 0).length : 0,
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
 dlog(`FWD-100: index=${marketIndex.composite} move=${marketIndex.indexChangePct}% | sentiment=${marketIndex.value}% ${marketIndex.condition} | regime=${regime}`);

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
 if (scanContext) scanContext.fundingHeatmap = fundingHeatmap;

 // BTC reference
 await chrome.storage.local.set({ scanStatus: 'Loading BTC ref...', scanProgress: 6, scanHeartbeat: Date.now() });
 let btcRef = null;
 for (const s of ['BTCUSD', 'BTCUSDT', 'XBTUSD']) {
 btcRef = await fetchCandles(s, strat.tf1 || '1d', 100, CLOSED_CANDLE_FETCH_OPTIONS);
 if (scanContext && Array.isArray(btcRef) && btcRef.length) {
 globalThis.FWDTradeDeskScanContext?.recordCandles?.(scanContext, s, strat.tf1 || '1d', btcRef);
 }
 if (btcRef?.length >= 20) break;
 }
 const btcCloses = btcRef?.map(c => c.close) ?? null;

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
 await chrome.storage.local.set({ scanHeartbeat: Date.now() });
 const [dCandles, m2Candles] = await Promise.all([
 fetchCandles(symbol, strat.tf1 || '1d', 200, SCAN_CANDLE_FETCH_OPTIONS),
 fetchCandles(symbol, strat.tf2 || '15m', 200, SCAN_CANDLE_FETCH_OPTIONS),
 ]);
 if (scanContext) {
 globalThis.FWDTradeDeskScanContext?.recordCandles?.(scanContext, symbol, strat.tf1 || '1d', dCandles || []);
 globalThis.FWDTradeDeskScanContext?.recordCandles?.(scanContext, symbol, strat.tf2 || '15m', m2Candles || []);
 }
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
 if (typeof v16PushNotificationFeed === 'function') {
 v16PushNotificationFeed({
 tone: 'success',
 title: `[Current] ${symbol} ${result.direction.toUpperCase()} execute`,
 symbol,
 sourceScannerId: 'current',
 sourceScannerName: 'Current Live',
 sourceType: 'scanner',
 what: `${symbol} ${result.direction.toUpperCase()} score ${result.score}/100 | entry $${result.entry?.toFixed(4) || '-'}`,
 why: result.reasons?.slice(0, 3).join(' | ') || 'Current scanner marked this as an execute alert.',
 next: 'Review the signal, funding, slot state, and protection preview before live action.',
 action: 'Open Scanner or Live Trading Analytics for the full decision state.',
 }).catch(() => null);
 }
 chrome.notifications.create(`alert_${symbol}_${Date.now()}`, {
 type: 'basic', iconUrl: 'icons/icon48.png',
 title: `[Current] ${tierLabel} ${result.score}/100 - ${symbol} ${result.direction.toUpperCase()}`,
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
 if (i > 0 && ((i + 1) % SCAN_PARTIAL_CHECKPOINT_EVERY === 0 || i === candidates.length - 1)) {
 await savePartialScanCheckpoint(scanContext, {
 tickerMap,
 products,
 marketIndex,
 fundingHeatmap,
 results,
 scannedRows: i + 1,
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
 scanPartialAvailable: false,
 scanPartialProgress: null,
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
 scanPartialAvailable: false,
 scanPartialProgress: null,
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
