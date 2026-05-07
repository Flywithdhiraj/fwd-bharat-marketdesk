function backtestBuildTargetLadder(entry = {}) {
 if (typeof v16BuildAutoTradeTargetLadder === 'function') {
 return v16BuildAutoTradeTargetLadder(entry);
 }
 return [
 { key: 'tp1', stage: 'tp1', label: 'T1', price: Number(entry?.tp1 || entry?.tp || 0) },
 { key: 'tp2', stage: 'tp2', label: 'T2', price: Number(entry?.tp2 || 0) },
 { key: 'tp3', stage: 'tp3', label: 'T3', price: Number(entry?.tp3 || 0) },
 { key: 'tp4', stage: 'tp4', label: 'T4', price: Number(entry?.tp4 || 0) },
 ].filter(level => Number(level.price || 0) > 0).slice(0, 4);
}

function backtestResolveShiftStopPrice(entry = {}, currentIndex = 0, ladder = []) {
 if (typeof v16ResolveAutoTradeShiftStopPrice === 'function') {
 return Number(v16ResolveAutoTradeShiftStopPrice(entry, currentIndex, ladder) || 0);
 }
 if (currentIndex <= 0) return Number(entry?.entry || 0);
 const priorLevel = ladder[currentIndex - 1] || null;
 return Number(priorLevel?.price || entry?.entry || 0);
}

async function fetchBacktestLowerCandles(symbol, resolution, startSec, endSec) {
 const stepSec = 30 * 24 * 60 * 60;
 const rows = [];
 const seen = new Set();
 for (let cursor = startSec; cursor < endSec; cursor += stepSec) {
 const chunkEnd = Math.min(endSec, cursor + stepSec);
 const chunk = await fetchCandlesRange(symbol, resolution, cursor, chunkEnd);
 for (const candle of chunk) {
 const ts = Number(candle?.time || 0);
 if (!(ts > 0) || seen.has(ts)) continue;
 seen.add(ts);
 rows.push(candle);
 }
 }
 return filterClosedCandles(rows.sort((a, b) => a.time - b.time), resolution);
}

async function fetchBacktestReferenceDailySeries(symbols = [], resolution = '1d', limit = 500) {
 const candidates = Array.isArray(symbols) ? symbols : [symbols];
 for (const candidate of candidates) {
 const refSymbol = String(candidate || '').trim().toUpperCase();
 if (!refSymbol) continue;
 const candles = await fetchCandles(refSymbol, resolution, limit, { closedOnly: true });
 if (Array.isArray(candles) && candles.length >= 40) {
 return { symbol: refSymbol, candles };
 }
 }
 return { symbol: String(candidates[0] || '').trim().toUpperCase(), candles: [] };
}

function backtestResolveBenchmarkCondition(value = 0) {
 const val = Number(value || 0);
 return val > 5 ? 'euphoric' : val > 2 ? 'bull' : val < -5 ? 'crash' : val < -2 ? 'bear' : 'neutral';
}

function backtestFindCandleIndexAtOrBefore(candles = [], tsSec = 0) {
 const list = Array.isArray(candles) ? candles : [];
 if (!list.length || !(tsSec > 0)) return -1;
 let lo = 0;
 let hi = list.length - 1;
 let idx = -1;
 while (lo <= hi) {
 const mid = Math.floor((lo + hi) / 2);
 const value = Number(list[mid]?.time || 0);
 if (value <= tsSec) {
 idx = mid;
 lo = mid + 1;
 } else {
 hi = mid - 1;
 }
 }
 return idx;
}

function backtestSliceCandlesToTime(candles = [], tsSec = 0) {
 const idx = backtestFindCandleIndexAtOrBefore(candles, tsSec);
 return idx >= 0 ? candles.slice(0, idx + 1) : [];
}

function backtestBuildProxyTopCoins(symbol, symbolTicker = {}, btcTicker = {}, ethTicker = {}) {
 const seen = new Set();
 const out = [];
 const pushCoin = (sym, ticker = {}) => {
 const refSymbol = String(sym || '').trim().toUpperCase();
 if (!refSymbol || seen.has(refSymbol)) return;
 const price = Number(ticker?.price || 0);
 const vol = Math.max(0, Number(ticker?.usdVol24h || ticker?.volume24h || 0));
 if (!(price > 0) && !(vol > 0)) return;
 seen.add(refSymbol);
 out.push({
 sym: refSymbol,
 change: Number(ticker?.change24h || 0),
 vol,
 fundingRate: Number(ticker?.fundingRate || 0),
 price,
 weight: 0,
 });
 };
 pushCoin('BTCUSD', btcTicker);
 pushCoin('ETHUSD', ethTicker);
 pushCoin(symbol, symbolTicker);
 const totalWeight = out.reduce((sum, coin) => sum + Math.max(1, Number(coin?.vol || 0)), 0) || 1;
 return out
 .sort((a, b) => Number(b?.vol || 0) - Number(a?.vol || 0))
 .map(coin => ({
 ...coin,
 vol: +((Number(coin.vol || 0)) / 1e6).toFixed(1),
 weight: +((Math.max(1, Number(coin.vol || 0)) / totalWeight) * 100).toFixed(1),
 }));
}

function backtestBuildLeadershipProxy(symbol, symbolTicker = {}, btcTicker = {}, ethTicker = {}) {
 const symbolKey = String(symbol || '').trim().toUpperCase();
 const isAlt = !/^(BTC|XBT|ETH)/.test(symbolKey);
 const btcChange = Number(btcTicker?.change24h || 0);
 const ethChange = Number(ethTicker?.change24h || 0);
 const symbolChange = Number(symbolTicker?.change24h || 0);
 let state = 'mixed';
 let label = 'Mixed Leadership';
 let tone = 'muted';
 let copy = 'BTC and ETH are not aligned strongly enough to confirm a clean market proxy.';

 if (btcChange >= 1.25 && ethChange >= 1 && (!isAlt || symbolChange >= 0.75)) {
 state = 'broad_risk_on';
 label = 'Broad Risk-On';
 tone = 'good';
 copy = 'BTC and ETH are rising together and the traded symbol is participating.';
 } else if (btcChange >= 1 && ethChange < 0.5) {
 state = 'btc_only';
 label = 'BTC Only';
 tone = 'warn';
 copy = 'BTC is leading without enough ETH confirmation.';
 } else if (btcChange <= -1.5 && ethChange <= -1 && (!isAlt || symbolChange <= -0.75)) {
 state = 'broad_risk_off';
 label = 'Broad Risk-Off';
 tone = 'bad';
 copy = 'BTC and ETH are both weak and the traded symbol is not resisting the tape.';
 } else if (ethChange >= 1 && btcChange < 0.5 && isAlt && symbolChange >= 0.75) {
 state = 'eth_alt';
 label = 'ETH / Alt Lead';
 tone = 'good';
 copy = 'ETH is carrying the tape and the traded symbol is participating with alt-style strength.';
 }

 return {
 state,
 label,
 tone,
 copy,
 btcChange: +btcChange.toFixed(2),
 ethChange: +ethChange.toFixed(2),
 symbolChange: +symbolChange.toFixed(2),
 btcSymbol: 'BTCUSD',
 ethSymbol: 'ETHUSD',
 };
}

function buildBacktestHistoricalMarketContextProxy(symbol, dailySlice = [], referenceSeries = {}, strat = {}, options = {}) {
 const shared = globalThis.FWDTradeDeskShared || {};
 const detectVolatilityRegimeFn = typeof shared.detectVolatilityRegime === 'function'
 ? shared.detectVolatilityRegime
 : (() => 'UNKNOWN');
 const getRegimeThresholdsFn = typeof shared.getRegimeThresholds === 'function'
 ? shared.getRegimeThresholds
 : ((regime, strategy) => ({ regime: String(regime || 'UNKNOWN').toUpperCase(), ...(strategy || {}) }));
 const buildRelativeStrengthSnapshotFn = typeof shared.buildRelativeStrengthSnapshot === 'function'
 ? shared.buildRelativeStrengthSnapshot
 : (() => ({ composite: 0, state: 'neutral', label: 'RS Mixed', tone: 'muted', vsBtc: 0, vsEth: 0, vsSector: 0 }));
 const formatThresholdSummaryFn = typeof shared.formatThresholdSummary === 'function'
 ? shared.formatThresholdSummary
 : (() => '');
 const dailySec = Math.max(60, Number(options?.dailySec || resolveCandleResolutionSec(strat?.tf1 || '1d') || 86400));
 const signalDailyTsSec = Number(dailySlice[dailySlice.length - 1]?.time || 0);
 if (!(signalDailyTsSec > 0) || dailySlice.length < 2) return null;

 const btcSource = Array.isArray(referenceSeries?.btcDaily) ? referenceSeries.btcDaily : [];
 const ethSource = Array.isArray(referenceSeries?.ethDaily) ? referenceSeries.ethDaily : [];
 const btcSlice = backtestSliceCandlesToTime(btcSource, signalDailyTsSec);
 const ethSlice = backtestSliceCandlesToTime(ethSource, signalDailyTsSec);
 const symbolTicker = buildBacktestHistoricalTicker(dailySlice, [], [], dailySec);
 const btcTicker = /^(BTC|XBT)/i.test(String(symbol || ''))
 ? symbolTicker
 : buildBacktestHistoricalTicker(btcSlice, [], [], dailySec);
 const ethTicker = /^ETH/i.test(String(symbol || ''))
 ? symbolTicker
 : buildBacktestHistoricalTicker(ethSlice, [], [], dailySec);

 const topCoins = backtestBuildProxyTopCoins(symbol, symbolTicker, btcTicker, ethTicker);
 if (!topCoins.length) return null;
 const totalWeight = topCoins.reduce((sum, coin) => sum + Math.max(1, Number(coin?.weight || 0)), 0) || 1;
 const value = topCoins.reduce((sum, coin) => sum + Number(coin?.change || 0) * (Math.max(1, Number(coin?.weight || 0)) / totalWeight), 0);
 const composite = +(10000 * (1 + value / 100)).toFixed(2);

 const historyPoints = [];
 const historyStart = Math.max(1, dailySlice.length - 20);
 for (let idx = historyStart; idx < dailySlice.length; idx++) {
 const pointTsSec = Number(dailySlice[idx]?.time || 0);
 if (!(pointTsSec > 0)) continue;
 const symbolPointTicker = buildBacktestHistoricalTicker(dailySlice.slice(0, idx + 1), [], [], dailySec);
 const btcPointSlice = backtestSliceCandlesToTime(btcSource, pointTsSec);
 const ethPointSlice = backtestSliceCandlesToTime(ethSource, pointTsSec);
 const btcPointTicker = /^(BTC|XBT)/i.test(String(symbol || ''))
 ? symbolPointTicker
 : buildBacktestHistoricalTicker(btcPointSlice, [], [], dailySec);
 const ethPointTicker = /^ETH/i.test(String(symbol || ''))
 ? symbolPointTicker
 : buildBacktestHistoricalTicker(ethPointSlice, [], [], dailySec);
 const pointTopCoins = backtestBuildProxyTopCoins(symbol, symbolPointTicker, btcPointTicker, ethPointTicker);
 if (!pointTopCoins.length) continue;
 const pointWeight = pointTopCoins.reduce((sum, coin) => sum + Math.max(1, Number(coin?.weight || 0)), 0) || 1;
 const pointValue = pointTopCoins.reduce((sum, coin) => sum + Number(coin?.change || 0) * (Math.max(1, Number(coin?.weight || 0)) / pointWeight), 0);
 historyPoints.push({
 composite: +(10000 * (1 + pointValue / 100)).toFixed(2),
 value: +pointValue.toFixed(2),
 ts: (pointTsSec + dailySec) * 1000,
 });
 }

 const regime = detectVolatilityRegimeFn(historyPoints);
 const thresholds = getRegimeThresholdsFn(regime, strat);
 const leadership = backtestBuildLeadershipProxy(symbol, symbolTicker, btcTicker, ethTicker);
 const relativeStrength = buildRelativeStrengthSnapshotFn({
 symbol,
 change24h: symbolTicker.change24h,
 }, {
 btcChange: btcTicker.change24h,
 ethChange: ethTicker.change24h,
 sectorAverage: 0,
 });
 const proxyConfidence = btcSlice.length >= 2 && ethSlice.length >= 2
 ? 'high'
 : (btcSlice.length >= 2 || ethSlice.length >= 2 ? 'medium' : 'low');

 return {
 value: +value.toFixed(2),
 composite,
 condition: backtestResolveBenchmarkCondition(value),
 regime,
 thresholds,
 thresholdSummary: formatThresholdSummaryFn(thresholds),
 leadership,
 topCoins,
 relativeStrength,
 ts: (signalDailyTsSec + dailySec) * 1000,
 proxy: true,
 proxyModel: 'historical_btc_eth_lite',
 proxyConfidence,
 historyWindow: historyPoints.length,
 };
}

function buildBacktestHistoricalTicker(dailySlice = [], lowerSlice = [], fundingSeries = [], dailySec = 86400) {
 const lastDaily = dailySlice[dailySlice.length - 1] || null;
 const prevDaily = dailySlice[dailySlice.length - 2] || null;
 const lastLower = lowerSlice[lowerSlice.length - 1] || null;
 const price = Number(lastLower?.close || lastDaily?.close || 0);
 const prevClose = Number(prevDaily?.close || 0);
 const volume24h = Number(lastDaily?.volume || 0);
 const signalTsSec = Number(lastDaily?.time || 0) + dailySec;
 return {
 price,
 change24h: prevClose > 0 ? +(((price - prevClose) / prevClose) * 100).toFixed(2) : 0,
 volume24h,
 usdVol24h: +(volume24h * price).toFixed(2),
 oi: 0,
 fundingRate: fundingRateAt(fundingSeries, signalTsSec),
 nextFundingAt: signalTsSec > 0 ? (Math.floor(signalTsSec / FUNDING_INTERVAL_SEC) + 1) * FUNDING_INTERVAL_SEC * 1000 : 0,
 };
}

function backtestPriceRound(price, reference = 0) {
 const value = Number(price || 0);
 if (!(value > 0)) return 0;
 if (typeof pricePrecision === 'function') return Number(pricePrecision(value, reference || value) || 0);
 return +value.toFixed(6);
}

function backtestResolveStopVariants() {
 return [
 { key: 'atr_1_2', label: 'ATR 1.2', type: 'atr', atrMultiplier: 1.2 },
 { key: 'atr_1_5', label: 'ATR 1.5', type: 'atr', atrMultiplier: 1.5 },
 { key: 'atr_1_8', label: 'ATR 1.8', type: 'atr', atrMultiplier: 1.8 },
 { key: 'structure', label: 'Structure', type: 'structure' },
 ];
}

function backtestResolveStopVariantMeta(stopVariant = 'atr_1_5') {
 const variants = backtestResolveStopVariants();
 return variants.find(variant => variant.key === stopVariant) || variants[1];
}

function backtestResolveStructureStopPrice(signal = {}, dailySlice = [], lowerSlice = []) {
 const dir = String(signal?.direction || '').toLowerCase();
 const entry = Number(signal?.entry || signal?.price || 0);
 const atrValue = Math.max(0, Number(signal?.daily?.atr || signal?.lower?.atr || 0));
 if (!(entry > 0) || !/^(long|short)$/.test(dir)) return 0;

 const lowerCandles = Array.isArray(lowerSlice) && lowerSlice.length ? lowerSlice : [];
 const dailyCandles = Array.isArray(dailySlice) && dailySlice.length ? dailySlice : [];
 const keyLevels = signal?.keyLevels && typeof signal.keyLevels === 'object' ? signal.keyLevels : {};
 const buffer = Math.max(entry * 0.001, atrValue * 0.12, 0.000001);
 const minDistance = Math.max(entry * 0.003, atrValue * 0.6, 0.000001);
 const maxDistance = Math.max(minDistance, atrValue * 2.8);

 if (dir === 'long') {
 const supportLevels = Array.isArray(keyLevels?.support) ? keyLevels.support : [];
 const keySupport = supportLevels
 .map(level => Number(level?.price || 0))
 .filter(level => level > 0 && level < entry)
 .sort((a, b) => b - a)[0] || 0;
 const swingLow = [
 ...lowerCandles.slice(-24).map(candle => Number(candle?.low || 0)),
 ...dailyCandles.slice(-10).map(candle => Number(candle?.low || 0)),
 ].filter(value => value > 0 && value < entry).sort((a, b) => b - a)[0] || 0;
 let stopPrice = Math.max(keySupport, swingLow);
 if (!(stopPrice > 0)) stopPrice = entry - Math.max(minDistance, atrValue || minDistance);
 stopPrice = Math.min(stopPrice, entry - minDistance);
 let distance = entry - stopPrice + buffer;
 if (distance < minDistance) distance = minDistance;
 if (distance > maxDistance) distance = maxDistance;
 return backtestPriceRound(Math.max(0.00000001, entry - distance), entry);
 }

 const resistanceLevels = Array.isArray(keyLevels?.resistance) ? keyLevels.resistance : [];
 const keyResistance = resistanceLevels
 .map(level => Number(level?.price || 0))
 .filter(level => level > entry)
 .sort((a, b) => a - b)[0] || 0;
 const swingHigh = [
 ...lowerCandles.slice(-24).map(candle => Number(candle?.high || 0)),
 ...dailyCandles.slice(-10).map(candle => Number(candle?.high || 0)),
 ].filter(value => value > entry).sort((a, b) => a - b)[0] || 0;
 let stopPrice = Math.min(...[keyResistance, swingHigh].filter(value => value > 0));
 if (!Number.isFinite(stopPrice) || !(stopPrice > entry)) stopPrice = entry + Math.max(minDistance, atrValue || minDistance);
 stopPrice = Math.max(stopPrice, entry + minDistance);
 let distance = stopPrice - entry + buffer;
 if (distance < minDistance) distance = minDistance;
 if (distance > maxDistance) distance = maxDistance;
 return backtestPriceRound(entry + distance, entry);
}

function backtestApplyStopVariantToSignal(signal = {}, dailySlice = [], lowerSlice = [], stopVariant = 'atr_1_5') {
 const entry = Number(signal?.entry || signal?.price || 0);
 const dir = String(signal?.direction || '').toLowerCase();
 if (!(entry > 0) || !/^(long|short)$/.test(dir)) return signal;
 const variant = backtestResolveStopVariantMeta(stopVariant);
 const atrValue = Math.max(0, Number(signal?.daily?.atr || signal?.lower?.atr || 0));
 const targetRR = Math.max(0.1, Number(signal?.riskTemplate?.targetRR || signal?.rr || 2));
 let stopPrice = 0;

 if (variant.type === 'atr') {
 const stopDistance = Math.max(0.00000001, atrValue * Math.max(0.1, Number(variant.atrMultiplier || 1.5)));
 stopPrice = dir === 'long'
 ? backtestPriceRound(Math.max(0.00000001, entry - stopDistance), entry)
 : backtestPriceRound(entry + stopDistance, entry);
 } else {
 stopPrice = backtestResolveStructureStopPrice(signal, dailySlice, lowerSlice);
 }

 if (!(stopPrice > 0)) return signal;
 const stopDistance = Math.abs(entry - stopPrice);
 if (!(stopDistance > 0)) return signal;
 const targetDistance = stopDistance * targetRR;
 const secondaryTargetDistance = targetDistance * 1.5;
 const tertiaryTargetDistance = targetDistance * 2;
 const quaternaryTargetDistance = targetDistance * 2.5;

 const nextSignal = {
 ...signal,
 stopVariant: variant.key,
 stopVariantLabel: variant.label,
 stopVariantType: variant.type,
 sl: stopPrice,
 rr: +(targetDistance / stopDistance).toFixed(1),
 riskTemplate: {
 ...(signal?.riskTemplate || {}),
 atrStopMultiplier: variant.type === 'atr' ? Number(variant.atrMultiplier || signal?.riskTemplate?.atrStopMultiplier || 1.5) : Number(signal?.riskTemplate?.atrStopMultiplier || 1.5),
 targetRR,
 stopModel: variant.type,
 },
 };

 if (dir === 'long') {
 nextSignal.tp1 = backtestPriceRound(entry + targetDistance, entry);
 nextSignal.tp2 = backtestPriceRound(entry + secondaryTargetDistance, entry);
 nextSignal.tp3 = backtestPriceRound(entry + tertiaryTargetDistance, entry);
 nextSignal.tp4 = backtestPriceRound(entry + quaternaryTargetDistance, entry);
 } else {
 nextSignal.tp1 = backtestPriceRound(Math.max(0.00000001, entry - targetDistance), entry);
 nextSignal.tp2 = backtestPriceRound(Math.max(0.00000001, entry - secondaryTargetDistance), entry);
 nextSignal.tp3 = backtestPriceRound(Math.max(0.00000001, entry - tertiaryTargetDistance), entry);
 nextSignal.tp4 = backtestPriceRound(Math.max(0.00000001, entry - quaternaryTargetDistance), entry);
 }
 nextSignal.tp = nextSignal.tp1;
 return nextSignal;
}

async function prepareBacktestSharedData(symbol, strat = {}, opts = {}) {
 const s = { ...defaultStrategy(), ...strat };
 const dailyResolution = s.tf1 || '1d';
 const lowerResolution = s.tf2 || '15m';
 const dailySec = resolveCandleResolutionSec(dailyResolution);
 const lowerSec = resolveCandleResolutionSec(lowerResolution);
 const lookbackDays = sanitizeBacktestLookbackDays(opts?.lookbackDays, 500);
 const dailyCandles = await fetchCandles(symbol, dailyResolution, lookbackDays, { closedOnly: true });
 if (!dailyCandles || dailyCandles.length < 100) {
 return { error: `Not enough data for ${symbol}`, symbol };
 }
 const lowerStartSec = Number(dailyCandles[0]?.time || 0);
 const lowerEndSec = Number(dailyCandles[dailyCandles.length - 1]?.time || 0) + dailySec + lowerSec;
 const lowerCandles = await fetchBacktestLowerCandles(symbol, lowerResolution, lowerStartSec, lowerEndSec);
 if (!lowerCandles || lowerCandles.length < 120) {
 return { error: `Not enough ${lowerResolution} data for ${symbol}`, symbol };
 }
 const fundingSeries = await fetchHistoricalFundingSeries(symbol, dailyCandles[0].time, dailyCandles[dailyCandles.length - 1].time + FUNDING_INTERVAL_SEC);
 const explicitMarketContext = opts?.marketContext || null;
 const referenceSeries = explicitMarketContext
 ? {}
 : {
 btcDaily: (/^(BTC|XBT)/i.test(symbol)
 ? dailyCandles
 : (await fetchBacktestReferenceDailySeries(['BTCUSD', 'XBTUSD', 'BTCUSDT'], dailyResolution, lookbackDays)).candles),
 ethDaily: (/^ETH/i.test(symbol)
 ? dailyCandles
 : (await fetchBacktestReferenceDailySeries(['ETHUSD', 'ETHUSDT'], dailyResolution, lookbackDays)).candles),
 };

 return {
 symbol,
 strategy: s,
 dailyResolution,
 lowerResolution,
 dailySec,
 lowerSec,
 dailyCandles,
 lowerCandles,
 lookbackDays,
 fundingSeries,
 explicitMarketContext,
 referenceSeries,
 };
}

function selectBacktestStopSweepRecommendation(variants = []) {
 const eligible = (Array.isArray(variants) ? variants : [])
 .filter(variant => !variant?.error && Number(variant?.summary?.totalTrades || 0) > 0);
 if (!eligible.length) return null;

 const minDrawdown = Math.min(...eligible.map(variant => Number(variant?.summary?.maxDD || 0)));
 const controlled = eligible.filter(variant => Number(variant?.summary?.maxDD || 0) <= (minDrawdown + 6));
 const pool = controlled.length ? controlled : eligible;
 const ranked = pool.slice().sort((a, b) =>
 Number(b?.summary?.expectancy || 0) - Number(a?.summary?.expectancy || 0)
 || Number(b?.summary?.profitFactor || 0) - Number(a?.summary?.profitFactor || 0)
 || Number(b?.summary?.totalPnl || 0) - Number(a?.summary?.totalPnl || 0)
 || Number(a?.summary?.maxDD || 0) - Number(b?.summary?.maxDD || 0)
 || Number(b?.summary?.totalTrades || 0) - Number(a?.summary?.totalTrades || 0)
 );
 const best = ranked[0] || null;
 if (!best) return null;
 return {
 key: String(best?.config?.stopVariant || best?.variant || ''),
 label: String(best?.config?.stopVariantLabel || best?.label || best?.variant || ''),
 summary: best.summary,
 rationale: [
 `expectancy ${Number(best?.summary?.expectancy || 0) >= 0 ? '+' : ''}${Number(best?.summary?.expectancy || 0).toFixed(2)}%`,
 `PF ${Number(best?.summary?.profitFactor || 0).toFixed(2)}`,
 `maxDD ${Number(best?.summary?.maxDD || 0).toFixed(2)}%`,
 ].join(' | '),
 };
}

async function runBacktestStopSweep(symbol, strat = {}, opts = {}) {
 await detectAPI();
 const sharedData = opts?.sharedData || await prepareBacktestSharedData(symbol, strat, opts);
 if (sharedData?.error) {
 return { symbol, ts: Date.now(), error: sharedData.error, variants: [], recommended: null };
 }
 const s = sharedData.strategy || { ...defaultStrategy(), ...strat };
 const minScore = sanitizeBacktestMinScore(opts.minScore, 75);
 const variants = [];
 for (const variant of backtestResolveStopVariants()) {
 const result = await runBacktest(symbol, s, {
 ...opts,
 sharedData,
 includeStopSweep: false,
 stopVariant: variant.key,
 });
 variants.push({
 variant: variant.key,
 label: variant.label,
 type: variant.type,
 error: result?.error || '',
 summary: result?.summary || {},
 config: result?.config || {},
 });
 }
 const recommended = selectBacktestStopSweepRecommendation(variants);
 return {
 symbol,
 ts: Date.now(),
 minScore,
 lookbackDays: sanitizeBacktestLookbackDays(opts.lookbackDays, 500),
 variants,
 recommended,
 comparedOn: ['expectancy', 'profitFactor', 'maxDD', 'totalPnl'],
 };
}

function applyBacktestProxyConfidenceGuard(signal = {}, marketContext = null, minScoreFilter = 75) {
 const activeThresholds = signal?.activeThresholds && typeof signal.activeThresholds === 'object'
 ? signal.activeThresholds
 : {};
 const baseSetupScore = Number(activeThresholds?.setupScore || 60);
 const baseWatchScore = Number(activeThresholds?.watchScore || 45);
 const tradeQuality = Number(signal?.tradeQuality?.score || 0);
 const score = Number(signal?.score || 0);
 const proxyConfidence = String(marketContext?.proxyConfidence || '').trim().toLowerCase();
 const leadershipState = String(marketContext?.leadership?.state || 'mixed').trim().toLowerCase();
 const regime = String(marketContext?.regime || signal?.marketRegime || 'UNKNOWN').trim().toUpperCase();

 const profile = proxyConfidence === 'low'
 ? { scorePenalty: 8, tradeQualityPenalty: 8, setupBuffer: 6, watchBuffer: 4 }
 : proxyConfidence === 'medium'
 ? { scorePenalty: 4, tradeQualityPenalty: 4, setupBuffer: 3, watchBuffer: 2 }
 : null;

 if (!marketContext?.proxy || !profile) {
 return {
 passed: true,
 confidence: proxyConfidence || 'high',
 adjustedScore: score,
 adjustedTradeQuality: tradeQuality,
 thresholds: {
 setupScore: baseSetupScore,
 watchScore: baseWatchScore,
 },
 reasons: [],
 };
 }

 const reasons = [];
 const adjustedScore = Math.max(0, score - profile.scorePenalty);
 const adjustedTradeQuality = Math.max(0, tradeQuality - profile.tradeQualityPenalty);
 const setupScore = Math.max(minScoreFilter, baseSetupScore + profile.setupBuffer);
 const watchScore = Math.max(baseWatchScore, setupScore - 12, baseWatchScore + profile.watchBuffer);
 const isWeakBackdrop = leadershipState === 'mixed' || regime === 'UNKNOWN';
 const isBlockedBackdrop = proxyConfidence === 'low' && (isWeakBackdrop || regime === 'CHOPPY');

 reasons.push(`${proxyConfidence} proxy confidence`);
 if (profile.scorePenalty > 0) reasons.push(`score -${profile.scorePenalty}`);
 if (profile.tradeQualityPenalty > 0) reasons.push(`trade quality -${profile.tradeQualityPenalty}`);
 if (isWeakBackdrop) reasons.push(`leadership ${leadershipState || 'mixed'}`);
 if (regime === 'CHOPPY') reasons.push('proxy regime choppy');
 if (regime === 'UNKNOWN') reasons.push('proxy regime unknown');

 const passed = !isBlockedBackdrop
 && adjustedScore >= setupScore
 && adjustedTradeQuality >= 75;

 return {
 passed,
 confidence: proxyConfidence,
 adjustedScore,
 adjustedTradeQuality,
 thresholds: {
 setupScore,
 watchScore,
 },
 reasons,
 };
}

function backtestIncrementAuditCounter(counters = {}, key = '', amount = 1) {
 const safeKey = String(key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'unknown';
 counters[safeKey] = Math.max(0, Number(counters[safeKey] || 0) + Number(amount || 0));
 return counters;
}

function sanitizeBacktestDirection(value = 'both') {
 const safe = String(value || 'both').trim().toLowerCase();
 return ['long', 'short', 'both'].includes(safe) ? safe : 'both';
}

function sanitizeBacktestPct(value, fallback = 0) {
 const n = Number(value);
 return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : Math.max(0, Number(fallback || 0));
}

function resolveBacktestStrategyPreset(value = 'scanner') {
 const safe = String(value || 'scanner').trim().toLowerCase();
 return ['scanner', 'funding', 'breakout', 'mean_reversion'].includes(safe) ? safe : 'scanner';
}

function applyBacktestPresetToStrategy(strategy = {}, preset = 'scanner') {
 const s = { ...(strategy || {}) };
 const safePreset = resolveBacktestStrategyPreset(preset);
 if (safePreset === 'funding') {
 return {
 ...s,
 minFundingAbs: Math.max(0.01, Number(s.minFundingAbs || 0.01)),
 minScore: Math.max(70, Number(s.minScore || 0)),
 };
 }
 if (safePreset === 'breakout') {
 return {
 ...s,
 breakoutVolumeRatio: Math.max(1.5, Number(s.breakoutVolumeRatio || 1.5)),
 minScore: Math.max(78, Number(s.minScore || 0)),
 };
 }
 if (safePreset === 'mean_reversion') {
 return {
 ...s,
 minScore: Math.max(76, Number(s.minScore || 0)),
 };
 }
 return s;
}

function backtestAccumulateAuditBucket(buckets = {}, key = '', label = '', trade = {}) {
 const safeKey = String(key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'unknown';
 const bucket = buckets[safeKey] || {
 key: safeKey,
 label: String(label || safeKey || 'Unknown').trim() || 'Unknown',
 totalTrades: 0,
 wins: 0,
 losses: 0,
 totalPnl: 0,
 winPnl: 0,
 lossPnl: 0,
 totalMfe: 0,
 totalMae: 0,
 runningEquity: 0,
 peakEquity: 0,
 maxDD: 0,
 };
 const pnlPct = Number(trade?.pnlPct || 0);
 bucket.totalTrades += 1;
 if (pnlPct > 0) bucket.wins += 1;
 else if (pnlPct < 0) bucket.losses += 1;
 bucket.totalPnl = +(bucket.totalPnl + pnlPct).toFixed(2);
 if (pnlPct > 0) bucket.winPnl = +(bucket.winPnl + pnlPct).toFixed(2);
 if (pnlPct < 0) bucket.lossPnl = +(bucket.lossPnl + Math.abs(pnlPct)).toFixed(2);
 bucket.totalMfe = +(bucket.totalMfe + Number(trade?.mfePct || 0)).toFixed(2);
 bucket.totalMae = +(bucket.totalMae + Number(trade?.maePct || 0)).toFixed(2);
 bucket.runningEquity = +(bucket.runningEquity + pnlPct).toFixed(2);
 if (bucket.runningEquity > bucket.peakEquity) bucket.peakEquity = bucket.runningEquity;
 bucket.maxDD = +Math.max(Number(bucket.maxDD || 0), Number(bucket.peakEquity || 0) - Number(bucket.runningEquity || 0)).toFixed(2);
 buckets[safeKey] = bucket;
 return bucket;
}

function backtestFinalizeAuditBuckets(buckets = {}) {
 return Object.fromEntries(
 Object.entries(buckets || {}).map(([key, bucket]) => {
 const totalTrades = Math.max(0, Number(bucket?.totalTrades || 0));
 const totalPnl = Number(bucket?.totalPnl || 0);
 const wins = Math.max(0, Number(bucket?.wins || 0));
 const losses = Math.max(0, Number(bucket?.losses || 0));
 return [key, {
 key: String(bucket?.key || key),
 label: String(bucket?.label || key || 'Unknown'),
 summary: {
 totalTrades,
 wins,
 losses,
 winRate: totalTrades > 0 ? +((wins / totalTrades) * 100).toFixed(1) : 0,
 expectancy: totalTrades > 0 ? +(totalPnl / totalTrades).toFixed(2) : 0,
 totalPnl: +totalPnl.toFixed(2),
 profitFactor: Number(bucket?.lossPnl || 0) > 0 ? +(Number(bucket?.winPnl || 0) / Number(bucket?.lossPnl || 0)).toFixed(2) : 999,
 maxDD: +Number(bucket?.maxDD || 0).toFixed(2),
 avgMfe: totalTrades > 0 ? +(Number(bucket?.totalMfe || 0) / totalTrades).toFixed(2) : 0,
 avgMae: totalTrades > 0 ? +(Number(bucket?.totalMae || 0) / totalTrades).toFixed(2) : 0,
 },
 }];
 })
 );
}

function simulateBacktestTrade({
 signal,
 dir,
 lowerCandles = [],
 futureLowerStartIndex = 0,
 entryTsSec = 0,
 lowerResolution = '15m',
 fundingSeries = [],
 feePctPerSide = EFFECTIVE_FEE_PCT_PER_SIDE,
 slippagePctPerSide = SLIPPAGE_PCT_PER_SIDE,
}) {
 const entry = Number(signal?.entry || 0);
 const stopLoss = Number(signal?.sl || 0);
 const ladder = backtestBuildTargetLadder(signal);
 const initialTarget = Number(signal?.tp || ladder[0]?.price || 0);
 if (!(entry > 0) || !(stopLoss > 0) || !(initialTarget > 0) || futureLowerStartIndex >= lowerCandles.length) {
 return null;
 }

 const baseSlippagePct = sanitizeBacktestPct(slippagePctPerSide, SLIPPAGE_PCT_PER_SIDE);
 const feePct = sanitizeBacktestPct(feePctPerSide, EFFECTIVE_FEE_PCT_PER_SIDE);
 const calcBacktestFee = notional => +(Math.abs(Number(notional || 0)) * (feePct / 100)).toFixed(6);
 const applyBacktestSlippage = (price, side, phase = 'entry', extraPct = 0) => {
 const p = Number(price || 0);
 if (!Number.isFinite(p) || p <= 0) return 0;
 const slip = Math.max(0, baseSlippagePct + Math.max(0, Number(extraPct || 0))) / 100;
 const isShort = String(side || '').toLowerCase().includes('short');
 if (phase === 'entry') return +(p * (isShort ? (1 - slip) : (1 + slip))).toFixed(6);
 return +(p * (isShort ? (1 + slip) : (1 - slip))).toFixed(6);
 };
 const extraSlippagePct = Math.max(0, Number(signal?.executionRisk?.extraSlippagePct || signal?.estimatedExtraSlippagePct || 0));
 const estimatedSpreadPct = Math.max(0, Number(signal?.executionRisk?.estimatedSpreadPct || signal?.estimatedSpreadPct || 0));
 const entryFill = applyBacktestSlippage(entry, dir, 'entry', extraSlippagePct);
 const qty = BACKTEST_STAKE / entryFill;
 const entryFee = calcBacktestFee(entryFill * qty);
 const initialRisk = Math.abs(entryFill - stopLoss);
 let activeTargetIndex = 0;
 let activeTargetPrice = initialTarget;
 let stop = stopLoss;
 let stopState = 'initial';
 let outcome = 'expired';
 let exitPrice = Number(lowerCandles[lowerCandles.length - 1]?.close || entry);
 let exitPriceFill = applyBacktestSlippage(exitPrice, dir, 'exit', extraSlippagePct);
 let exitBar = Math.max(0, lowerCandles.length - futureLowerStartIndex);
 let exitTs = Number(lowerCandles[lowerCandles.length - 1]?.time || entryTsSec);
 let mfePct = 0;
 let maePct = 0;
 let targetShiftCount = 0;
 const isLong = dir === 'long';

 for (let j = futureLowerStartIndex; j < lowerCandles.length; j++) {
 const candle = lowerCandles[j];
 const favorablePx = isLong ? Number(candle?.high || 0) : Number(candle?.low || 0);
 const adversePx = isLong ? Number(candle?.low || 0) : Number(candle?.high || 0);
 const favorablePct = isLong
 ? ((favorablePx - entryFill) / entryFill) * 100
 : ((entryFill - favorablePx) / entryFill) * 100;
 const adversePct = isLong
 ? ((entryFill - adversePx) / entryFill) * 100
 : ((adversePx - entryFill) / entryFill) * 100;
 if (Number.isFinite(favorablePct)) mfePct = Math.max(mfePct, favorablePct);
 if (Number.isFinite(adversePct)) maePct = Math.max(maePct, adversePct);

 const hitStop = isLong
 ? Number(candle?.low || 0) <= stop
 : Number(candle?.high || 0) >= stop;
 if (hitStop) {
 outcome = stopState === 'breakeven' ? 'breakeven' : 'stop_loss';
 exitPrice = stop;
 exitPriceFill = applyBacktestSlippage(exitPrice, dir, 'exit', extraSlippagePct);
 exitBar = (j - futureLowerStartIndex) + 1;
 exitTs = Number(candle?.time || entryTsSec);
 break;
 }

 const distToCurrentTarget = activeTargetPrice - entryFill;
 const nearCurrentTargetThreshold = entryFill + (0.9 * distToCurrentTarget);
 const canAdvance = activeTargetIndex >= 0 && activeTargetIndex < (ladder.length - 1);
 const shouldAdvance = canAdvance && (
 isLong
 ? Number(candle?.high || 0) >= nearCurrentTargetThreshold
 : Number(candle?.low || 0) <= nearCurrentTargetThreshold
 );
 if (shouldAdvance) {
 const nextTargetLevel = ladder[activeTargetIndex + 1];
 const shiftedStop = Number(backtestResolveShiftStopPrice({ ...signal, entry: entryFill }, activeTargetIndex, ladder) || stop);
 if (shiftedStop > 0) {
 stop = isLong ? Math.max(stop, shiftedStop) : Math.min(stop, shiftedStop);
 }
 activeTargetIndex += 1;
 activeTargetPrice = Number(nextTargetLevel?.price || activeTargetPrice);
 stopState = activeTargetIndex === 1 ? 'breakeven' : `shift_${ladder[activeTargetIndex - 1]?.stage || 'target'}`;
 targetShiftCount += 1;
 continue;
 }

 const hitTarget = activeTargetPrice > 0 && (
 isLong
 ? Number(candle?.high || 0) >= activeTargetPrice
 : Number(candle?.low || 0) <= activeTargetPrice
 );
 if (hitTarget && activeTargetIndex >= (ladder.length - 1)) {
 outcome = 'take_profit';
 exitPrice = activeTargetPrice;
 exitPriceFill = applyBacktestSlippage(exitPrice, dir, 'exit', extraSlippagePct);
 exitBar = (j - futureLowerStartIndex) + 1;
 exitTs = Number(candle?.time || entryTsSec);
 break;
 }
 }

 const exitFee = calcBacktestFee(exitPriceFill * qty);
 const funding = calcFundingBetween(entryTsSec, exitTs, dir, entryFill * qty, fundingSeries);
 const grossPnlCash = (exitPriceFill - entryFill) * qty * (dir === 'short' ? -1 : 1);
 const netPnlCash = grossPnlCash - entryFee - exitFee + funding.fundingPnl;
 const pnlPct = +(netPnlCash / BACKTEST_STAKE * 100).toFixed(2);

 return {
 outcome,
 entryFill,
 exitPrice,
 exitPriceFill,
 stop,
 stopState,
 exitBar,
 exitTs,
 pnlPct,
 pnlCash: +netPnlCash.toFixed(4),
 maePct: +maePct.toFixed(2),
 mfePct: +mfePct.toFixed(2),
 rr: initialRisk > 0 ? +(Math.abs(initialTarget - entryFill) / initialRisk).toFixed(1) : 0,
 fundingPnl: +funding.fundingPnl.toFixed(4),
 fundingEvents: funding.fundingEvents,
 entryFee: +entryFee.toFixed(4),
 exitFee: +exitFee.toFixed(4),
 extraSlippagePct: +extraSlippagePct.toFixed(2),
 estimatedSpreadPct: +estimatedSpreadPct.toFixed(2),
 targetShiftCount,
 lowerResolution,
 initialTarget: +initialTarget.toFixed(6),
 activeTargetStage: ladder[Math.min(activeTargetIndex, Math.max(0, ladder.length - 1))]?.stage || 'tp1',
 };
}

async function runBacktest(symbol, strat = {}, opts = {}) {
 const backtestStartedAt = performanceNow();
 dlog(`Backtest: ${symbol}`);
 await detectAPI();
 const sharedData = opts?.sharedData || await prepareBacktestSharedData(symbol, strat, opts);
 if (sharedData?.error) return { error: sharedData.error, symbol };
 const strategyPreset = resolveBacktestStrategyPreset(opts?.strategyPreset || 'scanner');
 const s = applyBacktestPresetToStrategy(sharedData.strategy || { ...defaultStrategy(), ...strat }, strategyPreset);
 const minScoreFilter = sanitizeBacktestMinScore(opts.minScore, 75);
 const directionFilter = sanitizeBacktestDirection(opts?.direction || 'both');
 const feePctPerSide = sanitizeBacktestPct(opts?.feePctPerSide, EFFECTIVE_FEE_PCT_PER_SIDE);
 const slippagePctPerSide = sanitizeBacktestPct(opts?.slippagePctPerSide, SLIPPAGE_PCT_PER_SIDE);
 const {
 dailyResolution,
 lowerResolution,
 dailySec,
 lowerSec,
 dailyCandles,
 lowerCandles,
 fundingSeries,
 explicitMarketContext,
 referenceSeries,
 } = sharedData;
 const stopVariant = String(opts?.stopVariant || 'atr_1_5').trim().toLowerCase() || 'atr_1_5';
 const stopVariantMeta = backtestResolveStopVariantMeta(stopVariant);

 const results = [];
 const audit = {
 attemptedBars: 0,
 qualifiedSignals: 0,
 rejectedByReason: {},
 bySetupFamily: {},
 byRegime: {},
 byProxyConfidence: {},
 };
 let lastBar = -5;
 let cooldownUntilTsSec = 0;
 const minDailyLook = Math.max((s.ema3 || 100) + 5, 80);
 const minLowerLook = Math.max(60, (s.ema3 || 100) + 5);
 let lowerSliceEndIndex = -1;

 for (let i = minDailyLook; i < dailyCandles.length - 1; i++) {
 if (i > minDailyLook && i % 50 === 0) {
 await wait(0);
 }
 if (i - lastBar < 3) continue;
 const signalTsSec = Number(dailyCandles[i]?.time || 0) + dailySec;
 if (signalTsSec <= cooldownUntilTsSec) continue;

 while ((lowerSliceEndIndex + 1) < lowerCandles.length) {
 const nextCandle = lowerCandles[lowerSliceEndIndex + 1];
 const nextCloseSec = Number(nextCandle?.time || 0) + lowerSec;
 if (nextCloseSec > signalTsSec) break;
 lowerSliceEndIndex += 1;
 }
 if (lowerSliceEndIndex < (minLowerLook - 1)) continue;

 const dailySlice = dailyCandles.slice(0, i + 1);
 const lowerSlice = lowerCandles.slice(0, lowerSliceEndIndex + 1);
 const ticker = buildBacktestHistoricalTicker(dailySlice, lowerSlice, fundingSeries, dailySec);
 const marketContext = explicitMarketContext || buildBacktestHistoricalMarketContextProxy(symbol, dailySlice, referenceSeries, s, { dailySec });
 const baseSignal = analyseCoin(symbol, dailySlice, lowerSlice, ticker, s, marketContext);
 audit.attemptedBars += 1;
 const signal = backtestApplyStopVariantToSignal(baseSignal, dailySlice, lowerSlice, stopVariant);
 if (!signal?.mtfConfirmed) {
 backtestIncrementAuditCounter(audit.rejectedByReason, 'not_confirmed');
 continue;
 }
 if (!Number.isFinite(signal.score)) {
 backtestIncrementAuditCounter(audit.rejectedByReason, 'invalid_score');
 continue;
 }
 if (signal.score < minScoreFilter) {
 backtestIncrementAuditCounter(audit.rejectedByReason, 'score_filter');
 continue;
 }

 signal.tradeQuality = signal.tradeQuality || buildTradeQuality(signal, {
 marketRegime: signal.marketRegime,
 setupFamilyAllowedInRegime: signal.setupFamilyAllowedInRegime,
 relativeStrength: marketContext?.relativeStrength,
 leadershipState: marketContext?.leadership?.state || 'mixed',
 });
 const proxyGuard = applyBacktestProxyConfidenceGuard(signal, marketContext, minScoreFilter);
 if (!proxyGuard.passed) {
 backtestIncrementAuditCounter(audit.rejectedByReason, 'proxy_guard');
 continue;
 }
 const decisionSignal = {
 ...signal,
 score: proxyGuard.adjustedScore,
 tradeQuality: {
 ...(signal?.tradeQuality || {}),
 score: proxyGuard.adjustedTradeQuality,
 },
 activeThresholds: {
 ...(signal?.activeThresholds || {}),
 setupScore: proxyGuard.thresholds.setupScore,
 watchScore: proxyGuard.thresholds.watchScore,
 },
 };
 const decision = resolveDecisionAction(decisionSignal, decisionSignal.activeThresholds || {});
 const dir = String(signal?.direction || '').toLowerCase();
 if (directionFilter !== 'both' && dir !== directionFilter) {
 backtestIncrementAuditCounter(audit.rejectedByReason, 'direction_filter');
 continue;
 }
 const qualifies = decision?.action === 'TRADE NOW'
 && /^(long|short)$/.test(dir)
 && Number(signal?.entry || 0) > 0
 && Number(signal?.sl || 0) > 0
 && backtestBuildTargetLadder(signal).length > 0;
 if (!qualifies) {
 backtestIncrementAuditCounter(audit.rejectedByReason, decision?.action === 'TRADE NOW' ? 'risk_structure_invalid' : 'decision_not_trade_now');
 continue;
 }
 audit.qualifiedSignals += 1;

 const trade = simulateBacktestTrade({
 signal,
 dir,
 lowerCandles,
 futureLowerStartIndex: lowerSliceEndIndex + 1,
 entryTsSec: signalTsSec,
 lowerResolution,
 fundingSeries,
 feePctPerSide,
 slippagePctPerSide,
 });
 if (!trade) {
 backtestIncrementAuditCounter(audit.rejectedByReason, 'simulation_unavailable');
 continue;
 }

 results.push({
 date: new Date(signalTsSec * 1000).toLocaleDateString(),
 ts: signalTsSec,
 dir,
 outcome: trade.outcome,
 signalScore: signal.score,
 tradeQuality: Number(signal?.tradeQuality?.score || 0),
 effectiveSignalScore: Number(proxyGuard.adjustedScore || signal.score || 0),
 effectiveTradeQuality: Number(proxyGuard.adjustedTradeQuality || signal?.tradeQuality?.score || 0),
 setupFamily: signal.setupFamily || '',
 marketCondition: String(marketContext?.condition || 'neutral'),
 marketRegime: signal.marketRegime || 'UNKNOWN',
 marketLeadershipState: String(marketContext?.leadership?.state || 'mixed'),
 marketProxyModel: String(marketContext?.proxyModel || (explicitMarketContext ? 'manual_override' : 'none')),
 marketProxyConfidence: String(marketContext?.proxyConfidence || (explicitMarketContext ? 'override' : 'low')),
 marketProxyGuardReasons: proxyGuard.reasons || [],
 entry: +trade.entryFill.toFixed(4),
 rawEntry: +Number(signal.entry || 0).toFixed(4),
 sl: +Number(signal.sl || 0).toFixed(4),
 tp: +trade.initialTarget.toFixed(4),
 tp1: +Number(signal.tp1 || 0).toFixed(4),
 tp2: +Number(signal.tp2 || 0).toFixed(4),
 tp3: +Number(signal.tp3 || 0).toFixed(4),
 tp4: +Number(signal.tp4 || 0).toFixed(4),
 finalStop: +trade.stop.toFixed(4),
 exit: +trade.exitPriceFill.toFixed(4),
 rawExit: +Number(trade.exitPrice || 0).toFixed(4),
 pnlPct: trade.pnlPct,
 pnlCash: trade.pnlCash,
 rr: trade.rr,
 barsHeld: trade.exitBar,
 holdResolution: trade.lowerResolution,
 maePct: trade.maePct,
 mfePct: trade.mfePct,
 fundingPnl: trade.fundingPnl,
 fundingEvents: trade.fundingEvents,
 entryFee: trade.entryFee,
 exitFee: trade.exitFee,
 stopState: trade.stopState,
 targetShiftCount: trade.targetShiftCount,
 targetAutoShiftStage: trade.activeTargetStage,
 estimatedSpreadPct: trade.estimatedSpreadPct,
 extraSlippagePct: trade.extraSlippagePct,
 });
 backtestAccumulateAuditBucket(audit.bySetupFamily, signal.setupFamily || 'mixed', signal.setupFamilyLabel || signal.setupFamily || 'Mixed', trade);
 backtestAccumulateAuditBucket(audit.byRegime, signal.marketRegime || 'UNKNOWN', signal.marketRegime || 'UNKNOWN', trade);
 backtestAccumulateAuditBucket(audit.byProxyConfidence, proxyGuard.confidence || 'high', proxyGuard.confidence || 'high', trade);
 lastBar = i;
 if (['stop_loss', 'breakeven'].includes(trade.outcome)) {
 cooldownUntilTsSec = Math.max(cooldownUntilTsSec, Number(trade.exitTs || signalTsSec) + (BACKTEST_STOP_COOLDOWN_BARS * dailySec));
 }
 }

 if (!results.length) {
 if (typeof fwdRecordPerformanceMetric === 'function') {
 fwdRecordPerformanceMetric('backtest', {
 durationMs: performanceNow() - backtestStartedAt,
 symbol: String(symbol || '').toUpperCase(),
 trades: 0,
 lookbackDays: sanitizeBacktestLookbackDays(sharedData?.lookbackDays, 500),
 empty: true,
 attemptedBars: audit.attemptedBars,
 });
 }
 return {
 error: `No signals for ${symbol} (score filter: >= ${minScoreFilter})`,
 symbol,
 ts: Date.now(),
 config: {
 minScore: minScoreFilter,
 lookbackDays: sanitizeBacktestLookbackDays(sharedData?.lookbackDays, 500),
 stopVariant: stopVariantMeta.key,
 stopVariantLabel: stopVariantMeta.label,
 strategyPreset,
 direction: directionFilter,
 },
 audit: {
 attemptedBars: audit.attemptedBars,
 qualifiedSignals: audit.qualifiedSignals,
 rejectedByReason: Object.entries(audit.rejectedByReason)
 .sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0))
 .map(([reason, count]) => ({ reason, count: Number(count || 0) })),
 bySetupFamily: backtestFinalizeAuditBuckets(audit.bySetupFamily),
 byRegime: backtestFinalizeAuditBuckets(audit.byRegime),
 byProxyConfidence: backtestFinalizeAuditBuckets(audit.byProxyConfidence),
 },
 };
 }

 const wins = results.filter(r => r.pnlPct > 0).length;
 const losses = results.filter(r => r.pnlPct < 0).length;
 const closed = wins + losses;
 const winPnl = results.filter(r => r.pnlPct > 0).reduce((s, r) => s + r.pnlPct, 0);
 const lossPnl = Math.abs(results.filter(r => r.pnlPct < 0).reduce((s, r) => s + r.pnlPct, 0));
 const totalPnl = +results.reduce((s, r) => s + r.pnlPct, 0).toFixed(2);
 const totalFundingPct = +results.reduce((s, r) => s + (Number(r.fundingPnl || 0) / BACKTEST_STAKE * 100), 0).toFixed(2);
 const totalFeesPct = +results.reduce((s, r) => s + ((Number(r.entryFee || 0) + Number(r.exitFee || 0)) / BACKTEST_STAKE * 100), 0).toFixed(2);
 const expectancy = results.length ? +(totalPnl / results.length).toFixed(2) : 0;
 const avgHoldBars = results.length ? +(results.reduce((s, r) => s + Number(r.barsHeld || 0), 0) / results.length).toFixed(1) : 0;
 const avgMfe = results.length ? +(results.reduce((s, r) => s + Number(r.mfePct || 0), 0) / results.length).toFixed(2) : 0;
 const avgMae = results.length ? +(results.reduce((s, r) => s + Number(r.maePct || 0), 0) / results.length).toFixed(2) : 0;
 const avgEstimatedSpreadPct = results.length ? +(results.reduce((sum, row) => sum + Number(row.estimatedSpreadPct || 0), 0) / results.length).toFixed(2) : 0;
 const avgExtraSlippagePct = results.length ? +(results.reduce((sum, row) => sum + Number(row.extraSlippagePct || 0), 0) / results.length).toFixed(2) : 0;
 const avgFundingPct = results.length ? +(totalFundingPct / results.length).toFixed(3) : 0;
 let maxConsecutiveLosses = 0, lossRun = 0;
 for (const r of results) {
 if (Number(r.pnlPct || 0) < 0) {
 lossRun++;
 maxConsecutiveLosses = Math.max(maxConsecutiveLosses, lossRun);
 } else {
 lossRun = 0;
 }
 }

 let peak = 0, dd = 0, run = 0;
 const equity = [0];
 for (const r of results) {
 run += r.pnlPct;
 equity.push(+run.toFixed(2));
 if (run > peak) peak = run;
 if (peak - run > dd) dd = peak - run;
 }

 const result = {
 symbol, trades: results, ts: Date.now(), equity,
 config: {
 minScore: minScoreFilter,
 lookbackDays: sanitizeBacktestLookbackDays(sharedData?.lookbackDays, 500),
 signalModel: 'analyseCoin',
 entryDecision: 'TRADE NOW',
 exitModel: 'target_ladder_auto_shift',
 marketContextModel: explicitMarketContext ? 'manual_override' : 'historical_btc_eth_lite',
 stopVariant: stopVariantMeta.key,
 stopVariantLabel: stopVariantMeta.label,
 stopVariantType: stopVariantMeta.type,
 tf1: dailyResolution,
 tf2: lowerResolution,
 feePctPerSide: +feePctPerSide.toFixed(3),
 slippagePctPerSide: +slippagePctPerSide.toFixed(3),
 strategyPreset,
 direction: directionFilter,
 avgEstimatedSpreadPct,
 avgExtraSlippagePct,
 dynamicExecutionPenalty: true,
 cooldownBars: BACKTEST_STOP_COOLDOWN_BARS,
 },
 summary: {
 totalTrades: results.length, wins, losses,
 expired: results.filter(r => r.outcome === 'expired').length,
 winRate: closed > 0 ? +(wins / closed * 100).toFixed(1) : 0,
 totalPnl, avgWin: wins > 0 ? +(winPnl / wins).toFixed(2) : 0,
 avgLoss: losses > 0 ? -(lossPnl / losses).toFixed(2) : 0,
 maxDD: +dd.toFixed(2),
 profitFactor: lossPnl > 0 ? +(winPnl / lossPnl).toFixed(2) : 999,
 longTrades: results.filter(r => r.dir === 'long').length,
 shortTrades: results.filter(r => r.dir === 'short').length,
 avgHoldBars,
 avgMfe,
 avgMae,
 expectancy,
 totalFundingPct,
 avgFundingPct,
 totalFeesPct,
 avgEstimatedSpreadPct,
 avgExtraSlippagePct,
 maxConsecutiveLosses,
 breakevenPct: +((results.filter(r => r.outcome === 'breakeven').length / results.length) * 100).toFixed(1),
 targetPct: +((results.filter(r => r.outcome === 'take_profit').length / results.length) * 100).toFixed(1),
 },
 audit: {
 attemptedBars: audit.attemptedBars,
 qualifiedSignals: audit.qualifiedSignals,
 rejectedByReason: Object.entries(audit.rejectedByReason)
 .sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0))
 .map(([reason, count]) => ({ reason, count: Number(count || 0) })),
 bySetupFamily: backtestFinalizeAuditBuckets(audit.bySetupFamily),
 byRegime: backtestFinalizeAuditBuckets(audit.byRegime),
 byProxyConfidence: backtestFinalizeAuditBuckets(audit.byProxyConfidence),
 },
 };
 if (opts?.includeStopSweep) {
 result.stopSweep = await runBacktestStopSweep(symbol, s, {
 ...opts,
 sharedData,
 includeStopSweep: false,
 });
 }
 if (typeof fwdRecordPerformanceMetric === 'function') {
 fwdRecordPerformanceMetric('backtest', {
 durationMs: performanceNow() - backtestStartedAt,
 symbol: String(symbol || '').toUpperCase(),
 trades: results.length,
 lookbackDays: sanitizeBacktestLookbackDays(sharedData?.lookbackDays, 500),
 });
 }
 return result;
}

// ================================================================
// WEBHOOK SYSTEM - NEW v14
// Send signals to Voicenotes, Notion, Discord, Telegram, Slack, etc.
// ================================================================

async function fireWebhooks(eventType, payload) {
 try {
 const d = await new Promise(r => chrome.storage.local.get('webhooks', r));
 const hooks = d.webhooks || [];
 if (!hooks.length) return;

 const activeHooks = hooks.filter(h => h.enabled && h.events.includes(eventType));
 if (!activeHooks.length) return;

 dlog(`Link Webhooks: Firing ${activeHooks.length} hook(s) for "${eventType}"`);

 for (const hook of activeHooks) {
 sendWebhook(hook, eventType, payload);
 }
 } catch (e) {
 dlog(`Link Webhook error: ${e.message}`);
 }
}

async function sendWebhook(hook, eventType, payload, retryCount = 0) {
 const MAX_RETRIES = 3;
 const storedHook = hook?.id ? await readStoredWebhook(hook.id) : null;
 const activeHook = storedHook || hook;
 if (!activeHook?.enabled) return;

 const cooldownUntil = Number(activeHook.cooldownUntil || 0);
 if (cooldownUntil > Date.now()) {
 if (activeHook.id) {
 await mutateStoredWebhook(activeHook.id, current => ({
 ...current,
 lastStatus: 'error',
 lastError: formatWebhookPauseMessage(cooldownUntil),
 }));
 }
 return;
 }

 const body = formatWebhookPayload(activeHook, eventType, payload);
 const target = await ensureWebhookTargetPermission(activeHook?.url);

 if (!target.ok) {
 dlog(`Link X Webhook "${activeHook?.name || 'unnamed'}" blocked: ${target.error}`);
 if (activeHook?.id) await markWebhookFailure(activeHook.id, activeHook.name, Date.now(), target.error.slice(0, 80));
 return;
 }

 try {
 const headers = { 'Content-Type': 'application/json' };
 // Add custom headers if specified
 if (activeHook.headers) {
 for (const [k, v] of Object.entries(activeHook.headers)) {
 headers[k] = v;
 }
 }

 const resp = await rateLimitedNotifyFetch(target.url, {
 method: 'POST',
 headers,
 body: JSON.stringify(body),
 signal: AbortSignal.timeout(10000),
 });

 if (resp.ok) {
 dlog(`Link OK Webhook sent to "${activeHook.name}" (${eventType})`);
 await markWebhookSuccess(activeHook.id, Date.now());
 } else {
 const failureTs = Date.now();
 dlog(`Link X Webhook "${activeHook.name}" failed: HTTP ${resp.status}`);
 const state = await markWebhookFailure(activeHook.id, activeHook.name, failureTs, `HTTP ${resp.status}`);

 // Retry with exponential backoff
 if (retryCount < MAX_RETRIES && resp.status >= 500 && !state.cooldownTriggered) {
 const delay = Math.pow(2, retryCount) * 1000;
 setTimeout(() => sendWebhook(activeHook, eventType, payload, retryCount + 1), delay);
 }
 }
 } catch (e) {
 const failureTs = Date.now();
 const errorMessage = redactForLog(e?.message || 'request failed').slice(0, 80);
 dlog(`Link X Webhook "${activeHook.name}" error: ${errorMessage}`);
 const state = await markWebhookFailure(activeHook.id, activeHook.name, failureTs, errorMessage);
 if (retryCount < MAX_RETRIES && !state.cooldownTriggered) {
 const delay = Math.pow(2, retryCount) * 1000;
 setTimeout(() => sendWebhook(activeHook, eventType, payload, retryCount + 1), delay);
 }
 }
}

function formatWebhookPayload(hook, eventType, data) {
 const base = {
 source: 'FWD TradeDesk Pro',
 event: eventType,
 timestamp: new Date().toISOString(),
 region: detectedRegion,
 session: getMarketSession(),
 };

 // Discord format
 if (hook.format === 'discord') {
 const embed = {
 title: `Signal FWD TradeDesk Pro: ${eventType}`,
 color: eventType === 'signal_alert' ? 0xff4560 : eventType === 'scan_complete' ? 0x00e5a0 : 0xffc840,
 timestamp: base.timestamp,
 footer: { text: 'FWD TradeDesk Pro' },
 fields: [],
 };
 if (data.symbol) embed.fields.push({ name: 'Symbol', value: data.symbol, inline: true });
 if (data.direction) embed.fields.push({ name: 'Direction', value: data.direction.toUpperCase(), inline: true });
 if (data.score) embed.fields.push({ name: 'Score', value: `${data.score}/100`, inline: true });
 if (data.price) embed.fields.push({ name: 'Price', value: `$${data.price}`, inline: true });
 if (data.count !== undefined) embed.fields.push({ name: 'Signals', value: String(data.count), inline: true });
 if (data.notes) embed.description = data.notes;
 return { embeds: [embed] };
 }

 // Slack format
 if (hook.format === 'slack') {
 let text = `*Signal FWD TradeDesk Pro - ${eventType}*\n`;
 if (data.symbol) text += `Symbol: *${data.symbol}* | `;
 if (data.direction) text += `Dir: *${data.direction.toUpperCase()}* | `;
 if (data.score) text += `Score: *${data.score}/100* | `;
 if (data.price) text += `Price: $${data.price}`;
 if (data.notes) text += `\n${data.notes}`;
 return { text };
 }

 // Voicenotes / Generic JSON format (default)
 return { ...base, data };
}

// ================================================================
// AUTO-SCAN
// ================================================================
