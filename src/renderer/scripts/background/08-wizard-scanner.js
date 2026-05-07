'use strict';

(function initWizardScanner(global) {
 const WIZARD_DEFAULT_SETTINGS = Object.freeze({
 maxCoins: 180,
 minLatestQuoteVolume: 5000000,
 minAvgQuoteVolume20: 3000000,
 riskPerTradePercent: 0.005,
 accountEquity: 1000,
 minCandles: 90,
 preferredCandles: 420,
 outputLimit: 160,
 });

 const CLOSED_DAILY = Object.freeze({ closedOnly: true });

 function wizardNow() {
 return Date.now();
 }

 function wizardLog(message) {
 if (typeof global.dlog === 'function') global.dlog(`[WIZARD] ${message}`);
 else console.log(`[WIZARD] ${message}`);
 }

 function wizardRound(value, decimals = 4) {
 const n = Number(value);
 if (!Number.isFinite(n)) return 0;
 const m = 10 ** decimals;
 return Math.round(n * m) / m;
 }

 function wizardSma(values = [], period = 20, endIndex = values.length - 1) {
 if (!Array.isArray(values) || period <= 0 || endIndex < period - 1) return null;
 let sum = 0;
 for (let i = endIndex - period + 1; i <= endIndex; i += 1) {
 const value = Number(values[i]);
 if (!Number.isFinite(value)) return null;
 sum += value;
 }
 return sum / period;
 }

 function wizardEma(values = [], period = 20) {
 const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
 if (nums.length < period) return null;
 const k = 2 / (period + 1);
 let value = nums.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
 for (let i = period; i < nums.length; i += 1) value = nums[i] * k + value * (1 - k);
 return value;
 }

 function wizardAtr(candles = [], period = 14) {
 if (typeof global.atr === 'function') return Number(global.atr(candles, period) || 0);
 if (!Array.isArray(candles) || candles.length < period + 1) return 0;
 const trs = [];
 for (let i = 1; i < candles.length; i += 1) {
 const high = Number(candles[i]?.high || 0);
 const low = Number(candles[i]?.low || 0);
 const prevClose = Number(candles[i - 1]?.close || 0);
 if (!(high > 0) || !(low > 0) || !(prevClose > 0)) continue;
 trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
 }
 return wizardSma(trs, period) || 0;
 }

 function wizardQuoteVolume(candle = {}) {
 const quoteVolume = Number(candle.quote_volume ?? candle.quoteVolume ?? candle.turnover ?? candle.turnover_usd ?? 0);
 if (Number.isFinite(quoteVolume) && quoteVolume > 0) return quoteVolume;
 const volume = Number(candle.volume || 0);
 const close = Number(candle.close || 0);
 return volume > 0 && close > 0 ? volume * close : 0;
 }

 function wizardReturn(closes = [], lookback = 30) {
 if (!Array.isArray(closes) || closes.length <= lookback) return 0;
 const now = Number(closes[closes.length - 1] || 0);
 const prev = Number(closes[closes.length - 1 - lookback] || 0);
 if (!(now > 0) || !(prev > 0)) return 0;
 return ((now - prev) / prev) * 100;
 }

 function wizardIsRising(values = [], period = 20) {
 if (!Array.isArray(values) || values.length < period + 1) return false;
 const recent = values.slice(-(period + 1));
 return recent[recent.length - 1] > recent[0];
 }

 function wizardPercentileRanks(items = []) {
 const sorted = items
 .filter(item => Number.isFinite(Number(item.weightedReturn)))
 .slice()
 .sort((a, b) => Number(a.weightedReturn) - Number(b.weightedReturn));
 const denom = Math.max(1, sorted.length - 1);
 const ranks = new Map();
 sorted.forEach((item, index) => {
 const rank = sorted.length === 1 ? 100 : Math.round((index / denom) * 100);
 ranks.set(item.symbol, rank);
 });
 return ranks;
 }

 function wizardHighLow(candles = [], preferred = 365) {
 const count = candles.length >= preferred ? preferred : candles.length >= 180 ? 180 : candles.length >= 90 ? 90 : 0;
 if (!count) return { high: 0, low: 0, period: 0 };
 const recent = candles.slice(-count);
 return {
 high: Math.max(...recent.map(c => Number(c.high || c.close || 0))),
 low: Math.min(...recent.map(c => Number(c.low || c.close || 0)).filter(v => v > 0)),
 period: count,
 };
 }

 function wizardCalculateIndicators(candles = []) {
 const closes = candles.map(c => Number(c.close || 0));
 const volumes = candles.map(c => Number(c.volume || 0));
 const quoteVolumes = candles.map(wizardQuoteVolume);
 const highLow = wizardHighLow(candles, 365);
 const sma200Series = [];
 for (let i = 0; i < closes.length; i += 1) {
 const value = wizardSma(closes, 200, i);
 if (value != null) sma200Series.push(value);
 }
 return {
 close: Number(closes[closes.length - 1] || 0),
 sma50: wizardSma(closes, 50),
 sma150: wizardSma(closes, 150),
 sma200: wizardSma(closes, 200),
 sma200Rising20: wizardIsRising(sma200Series, 20),
 ema10: wizardEma(closes, 10),
 ema20: wizardEma(closes, 20),
 atr14: wizardAtr(candles, 14),
 return30d: wizardReturn(closes, 30),
 return90d: wizardReturn(closes, 90),
 return180d: wizardReturn(closes, 180),
 highPeriod: highLow.period,
 high: highLow.high,
 low: highLow.low,
 avgVolume20: wizardSma(volumes, 20) || 0,
 avgVolume50: wizardSma(volumes, 50) || 0,
 avgQuoteVolume20: wizardSma(quoteVolumes, 20) || 0,
 latestQuoteVolume: quoteVolumes[quoteVolumes.length - 1] || 0,
 latestVolume: volumes[volumes.length - 1] || 0,
 };
 }

 function wizardMarketHealth(btcCandles = []) {
 const ind = wizardCalculateIndicators(btcCandles);
 const pass = ind.close > 0
 && ind.sma50 > 0
 && ind.sma200 > 0
 && ind.close > ind.sma50
 && ind.close > ind.sma200
 && ind.sma50 > ind.sma200
 && ind.sma200Rising20;
 return {
 pass,
 close: wizardRound(ind.close, 2),
 sma50: wizardRound(ind.sma50, 2),
 sma200: wizardRound(ind.sma200, 2),
 sma200Rising20: !!ind.sma200Rising20,
 reasons: pass
 ? ['BTC market health passed']
 : ['BTC market health not ready'],
 };
 }

 function wizardLiquidityPass(indicators = {}, ticker = {}, settings = WIZARD_DEFAULT_SETTINGS, candleCount = 0) {
 const latestQuoteVolume = Math.max(Number(indicators.latestQuoteVolume || 0), Number(ticker.usdVol24h || 0));
 const avgQuoteVolume20 = Number(indicators.avgQuoteVolume20 || 0);
 const pass = candleCount >= settings.minCandles
 && latestQuoteVolume >= settings.minLatestQuoteVolume
 && avgQuoteVolume20 >= settings.minAvgQuoteVolume20;
 return {
 pass,
 latestQuoteVolume,
 avgQuoteVolume20,
 reasons: [
 candleCount >= settings.minCandles ? 'Enough daily candles' : 'Less than 90 daily candles',
 latestQuoteVolume >= settings.minLatestQuoteVolume ? 'Latest liquidity passed' : 'Latest liquidity too low',
 avgQuoteVolume20 >= settings.minAvgQuoteVolume20 ? '20D liquidity passed' : '20D liquidity too low',
 ],
 };
 }

 function wizardTrendTemplate(ind = {}, rsScore = 0) {
 const checks = {
 closeAboveSma150: ind.close > ind.sma150,
 closeAboveSma200: ind.close > ind.sma200,
 sma150AboveSma200: ind.sma150 > ind.sma200,
 sma200Rising20: !!ind.sma200Rising20,
 sma50AboveSma150: ind.sma50 > ind.sma150,
 sma50AboveSma200: ind.sma50 > ind.sma200,
 closeAboveSma50: ind.close > ind.sma50,
 thirtyPctAboveLow: ind.low > 0 && ind.close >= 1.3 * ind.low,
 withinTwentyFivePctHigh: ind.high > 0 && ind.close >= 0.75 * ind.high,
 rsStrong: Number(rsScore || 0) >= 70,
 };
 const pass = Object.values(checks).every(Boolean);
 return {
 pass,
 checks,
 reasons: [
 pass ? 'Trend template passed' : 'Trend template incomplete',
 checks.rsStrong ? 'RS Strong' : 'RS below 70',
 ],
 };
 }

 function wizardDetectPivots(candles = [], pivot = 2) {
 const highs = [];
 const lows = [];
 for (let i = pivot; i < candles.length - pivot; i += 1) {
 const high = Number(candles[i]?.high || 0);
 const low = Number(candles[i]?.low || 0);
 let isHigh = high > 0;
 let isLow = low > 0;
 for (let j = i - pivot; j <= i + pivot; j += 1) {
 if (j === i) continue;
 if (Number(candles[j]?.high || 0) >= high) isHigh = false;
 if (Number(candles[j]?.low || 0) <= low) isLow = false;
 }
 if (isHigh) highs.push({ index: i, price: high, time: candles[i]?.time || 0 });
 if (isLow) lows.push({ index: i, price: low, time: candles[i]?.time || 0 });
 }
 return { highs, lows };
 }

 function wizardDetectVcp(candles = [], indicators = {}) {
 if (!Array.isArray(candles) || candles.length < 90) {
 return { detected: false, contractionCount: 0, contractions: [], volumeDryupScore: 0, pivotPrice: 0, finalContractionLow: 0, reasons: ['Need at least 90 daily candles'] };
 }
 const recent = candles.slice(-90);
 const prior = candles.slice(Math.max(0, candles.length - 180), Math.max(0, candles.length - 90));
 const priorLow = Math.min(...prior.map(c => Number(c.low || c.close || 0)).filter(v => v > 0));
 const baseHigh = Math.max(...recent.map(c => Number(c.high || 0)));
 const baseLow = Math.min(...recent.map(c => Number(c.low || 0)).filter(v => v > 0));
 const currentClose = Number(candles[candles.length - 1]?.close || 0);
 const priorAdvance = priorLow > 0 && baseHigh > 0 ? ((baseHigh - priorLow) / priorLow) * 100 : 0;
 const { highs, lows } = wizardDetectPivots(recent, 2);
 const swings = [...highs.map(p => ({ ...p, type: 'high' })), ...lows.map(p => ({ ...p, type: 'low' }))]
 .sort((a, b) => a.index - b.index);
 const contractions = [];
 for (let i = 0; i < swings.length - 1; i += 1) {
 const high = swings[i].type === 'high' ? swings[i] : null;
 if (!high) continue;
 const nextLow = swings.slice(i + 1).find(item => item.type === 'low' && item.price < high.price);
 if (!nextLow) continue;
 const pct = ((high.price - nextLow.price) / high.price) * 100;
 if (pct > 1 && pct < 45) contractions.push({ pct, high: high.price, low: nextLow.price, highIndex: high.index, lowIndex: nextLow.index });
 }
 const lastThree = contractions.slice(-3);
 const contractionPcts = lastThree.map(item => wizardRound(item.pct, 2));
 const shrinking = lastThree.length >= 2
 && lastThree[1].pct < lastThree[0].pct * 0.8
 && (lastThree.length < 3 || lastThree[2].pct < lastThree[1].pct * 0.8);
 const finalContraction = lastThree[lastThree.length - 1] || null;
 const finalDepthOk = !!finalContraction && finalContraction.pct <= 12;
 const finalLowIndex = finalContraction ? Math.max(0, recent.length - 90 + finalContraction.lowIndex) : candles.length - 1;
 const finalSlice = candles.slice(Math.max(0, finalLowIndex - 10), finalLowIndex + 1);
 const finalAvgVolume = finalSlice.length
 ? finalSlice.reduce((sum, candle) => sum + Number(candle.volume || 0), 0) / finalSlice.length
 : 0;
 const avgVolume50 = Number(indicators.avgVolume50 || 0);
 const volumeDryup = avgVolume50 > 0 && finalAvgVolume < avgVolume50 * 0.7;
 const volumeDryupScore = avgVolume50 > 0 ? Math.max(0, Math.min(100, Math.round((1 - (finalAvgVolume / avgVolume50)) * 100))) : 0;
 const nearBaseHigh = baseHigh > 0 && currentClose >= baseHigh * 0.85;
 const baseRangeOk = baseHigh > 0 && baseLow > 0 && ((baseHigh - baseLow) / baseHigh) * 100 <= 35;
 const detected = priorAdvance >= 25
 && shrinking
 && finalDepthOk
 && volumeDryup
 && nearBaseHigh
 && baseRangeOk;
 return {
 detected,
 contractionCount: lastThree.length,
 contractions: contractionPcts,
 volumeDryupScore,
 baseStart: recent[0]?.time || 0,
 baseEnd: recent[recent.length - 1]?.time || 0,
 pivotPrice: wizardRound(baseHigh, 8),
 finalContractionLow: finalContraction ? wizardRound(finalContraction.low, 8) : 0,
 priorAdvance: wizardRound(priorAdvance, 2),
 reasons: [
 priorAdvance >= 25 ? 'Prior advance confirmed' : 'Prior advance too weak',
 shrinking ? 'VCP contractions shrinking' : 'VCP contractions not clean',
 finalDepthOk ? 'Final contraction controlled' : 'Final contraction too deep',
 volumeDryup ? 'Volume dry-up confirmed' : 'Volume dry-up missing',
 nearBaseHigh ? 'Close near base high' : 'Close too far from base high',
 ],
 };
 }

 function wizardBreakout(ind = {}, marketHealth = {}, liquidity = {}, trend = {}, vcp = {}) {
 const pivot = Number(vcp.pivotPrice || 0);
 const close = Number(ind.close || 0);
 const volume = Number(ind.latestVolume || 0);
 const avgVolume50 = Number(ind.avgVolume50 || 0);
 const checks = {
 marketHealthy: !!marketHealth.pass,
 liquidityPassed: !!liquidity.pass,
 trendPassed: !!trend.pass,
 vcpDetected: !!vcp.detected,
 closeAbovePivot: pivot > 0 && close > pivot,
 volumeBreakout: avgVolume50 > 0 && volume > 1.5 * avgVolume50,
 notExtended: pivot > 0 && close <= pivot * 1.03,
 };
 const pass = Object.values(checks).every(Boolean);
 return {
 pass,
 checks,
 breakoutVolumeRatio: avgVolume50 > 0 ? wizardRound(volume / avgVolume50, 2) : 0,
 reasons: [
 checks.closeAbovePivot ? 'Breakout Ready' : 'Below pivot',
 checks.volumeBreakout ? 'Breakout volume confirmed' : 'Breakout volume missing',
 checks.notExtended ? 'Entry not extended' : 'Breakout too extended',
 ],
 };
 }

 function wizardRisk(entry = 0, pivot = 0, atr14 = 0, finalContractionLow = 0, settings = WIZARD_DEFAULT_SETTINGS) {
 const candidates = [finalContractionLow, pivot - 1.5 * atr14, entry * 0.92]
 .map(Number)
 .filter(value => Number.isFinite(value) && value > 0 && value < entry);
 const stop = candidates.length ? Math.max(...candidates) : 0;
 const risk = stop > 0 && entry > stop ? entry - stop : 0;
 const riskPercent = risk > 0 ? (risk / entry) * 100 : 0;
 const riskAmount = Number(settings.accountEquity || 0) * Number(settings.riskPerTradePercent || 0.005);
 const qty = risk > 0 ? riskAmount / risk : 0;
 return {
 entry,
 stop,
 risk,
 riskPercent,
 target2R: entry + 2 * risk,
 target3R: entry + 3 * risk,
 positionQty: qty,
 pass: riskPercent > 0 && riskPercent <= 8,
 reason: riskPercent > 8 ? 'Risk Too Wide' : 'Risk accepted',
 };
 }

 function wizardScore(parts = {}) {
 let score = 0;
 if (parts.trend?.pass) score += 30;
 score += Math.min(20, Math.max(0, (Number(parts.rsScore || 0) / 100) * 20));
 if (parts.vcp?.detected) score += 25;
 else if (parts.vcp?.contractionCount >= 2) score += 12;
 score += Math.min(10, Math.max(0, (Number(parts.vcp?.volumeDryupScore || 0) / 100) * 10));
 if (parts.breakout?.checks?.volumeBreakout) score += 10;
 if (parts.marketHealth?.pass) score += 5;
 return Math.round(Math.max(0, Math.min(100, score)));
 }

 function wizardLabel(score = 0) {
 if (score >= 85) return 'A+ Setup';
 if (score >= 75) return 'Good Setup';
 if (score >= 65) return 'Watchlist';
 return 'Ignore';
 }

 function wizardActionLabel(signal = 'IGNORE', score = 0) {
 const normalized = String(signal || 'IGNORE').toUpperCase();
 if (normalized === 'BUY') return 'Buy now';
 if (normalized === 'WATCHLIST') return Number(score || 0) >= 75 ? 'Wait for breakout' : 'Watch only';
 if (normalized === 'SELL') return 'Short watch';
 return 'Ignore';
 }

 function wizardSignalCounts(results = []) {
 return (Array.isArray(results) ? results : []).reduce((acc, row) => {
 const signal = String(row?.signal || 'IGNORE').toUpperCase();
 acc[signal] = (acc[signal] || 0) + 1;
 return acc;
 }, { BUY: 0, WATCHLIST: 0, SELL: 0, IGNORE: 0 });
 }

 function wizardPriorityLabel(signal = 'IGNORE', score = 0, checks = {}) {
 const normalized = String(signal || 'IGNORE').toUpperCase();
 const n = Number(score || 0);
 if (normalized === 'BUY') return n >= 85 ? 'Best now' : 'Actionable';
 if (normalized === 'SELL') return 'Short watch';
 if (normalized === 'WATCHLIST' && checks?.breakoutReady) return 'Near entry';
 if (normalized === 'WATCHLIST') return n >= 75 ? 'Developing fast' : 'Developing';
 return n >= 45 ? 'Monitor only' : 'Avoid';
 }

 function wizardNextAction(signal = 'IGNORE', parts = {}) {
 const normalized = String(signal || 'IGNORE').toUpperCase();
 if (normalized === 'BUY') return 'Entry is allowed by scanner rules; confirm chart and size manually.';
 if (normalized === 'SELL') return 'Short-side watch only; confirm breakdown and borrow/liquidity rules manually.';
 if (!parts?.trend?.pass) return 'Wait for trend template to pass.';
 if (!parts?.vcp?.detected) return 'Wait for a cleaner base/VCP contraction.';
 if (!parts?.breakout?.pass) return 'Wait for close above pivot with breakout volume.';
 if (!parts?.risk?.pass) return 'Wait for tighter stop distance before action.';
 return 'Keep on watchlist until price and volume trigger together.';
 }

 function wizardReasonPack(signal = 'IGNORE', parts = {}, row = {}) {
 const top = [];
 const wait = [];
 const checks = parts?.breakout?.checks || {};
 if (parts?.trend?.pass) top.push('Trend template passed');
 else wait.push('Trend template incomplete');
 if (Number(row.rsScore || 0) >= 70) top.push(`RS ${Math.round(Number(row.rsScore || 0))}`);
 else wait.push('RS below leadership threshold');
 if (parts?.vcp?.detected) top.push(`VCP confirmed with ${parts.vcp.contractionCount || 0} contractions`);
 else wait.push('VCP/base not confirmed');
 if (checks.volumeBreakout) top.push('Breakout volume present');
 else wait.push('Breakout volume missing');
 if (parts?.risk?.pass) top.push('Risk accepted');
 else wait.push(parts?.risk?.reason || 'Risk not accepted');
 if (String(signal || '').toUpperCase() === 'SELL') top.unshift('Short-side downtrend confirmed');
 return {
 whySelected: top.slice(0, 3),
 whyNotNow: wait.slice(0, 3),
 nextAction: wizardNextAction(signal, parts),
 };
 }

 function wizardBacktestRule(candles = []) {
 const rows = Array.isArray(candles) ? candles : [];
 const samples = [];
 for (let i = 220; i < rows.length - 21; i += 5) {
 const slice = rows.slice(0, i + 1);
 const ind = wizardCalculateIndicators(slice);
 const trend = wizardTrendTemplate(ind, 75);
 const recentVolume = Number(ind.latestVolume || 0);
 const avgVolume50 = Number(ind.avgVolume50 || 0);
 const close = Number(ind.close || 0);
 const future20 = Number(rows[i + 20]?.close || 0);
 if (!trend.pass || !(close > 0) || !(future20 > 0)) continue;
 const volumeOk = avgVolume50 > 0 ? recentVolume >= avgVolume50 * 0.85 : true;
 if (!volumeOk) continue;
 const ret20 = ((future20 - close) / close) * 100;
 samples.push(ret20);
 }
 const count = samples.length;
 const avg20dReturn = count ? samples.reduce((sum, value) => sum + value, 0) / count : 0;
 const winRate = count ? (samples.filter(value => value > 0).length / count) * 100 : 0;
 return {
 label: count >= 12 ? 'Trend rule sample' : count ? 'Thin sample' : 'No sample',
 samples: count,
 winRate: wizardRound(winRate, 1),
 avg20dReturn: wizardRound(avg20dReturn, 2),
 best20dReturn: count ? wizardRound(Math.max(...samples), 2) : 0,
 worst20dReturn: count ? wizardRound(Math.min(...samples), 2) : 0,
 };
 }

 async function wizardUpdateWatchAging(strategyId = 'wizard', results = []) {
 const key = `strategyLabWatchAging.${strategyId}`;
 const ts = wizardNow();
 const stored = await new Promise(resolve => chrome.storage.local.get([key], resolve));
 const prior = stored[key] && typeof stored[key] === 'object' ? stored[key] : {};
 const next = { ...prior };
 const enriched = (Array.isArray(results) ? results : []).map(row => {
 const symbol = String(row?.symbol || '').toUpperCase();
 const tracked = symbol && ['BUY', 'WATCHLIST', 'SELL'].includes(String(row?.signal || '').toUpperCase());
 if (!tracked) return row;
 const old = prior[symbol] || {};
 const scans = Number(old.scans || 0) + 1;
 const score = Number(row.score || 0);
 const previousScore = Number(old.lastScore || score);
 const aging = {
 firstSeen: Number(old.firstSeen || ts),
 lastSeen: ts,
 scans,
 lastSignal: row.signal,
 lastScore: score,
 scoreTrend: score > previousScore ? 'improving' : score < previousScore ? 'weakening' : 'steady',
 };
 next[symbol] = aging;
 return {
 ...row,
 raw: {
 ...(row.raw || {}),
 watchAging: aging,
 },
 };
 });
 await chrome.storage.local.set({ [key]: next });
 return enriched;
 }

 function wizardBuildResult(row = {}, context = {}) {
 const ind = row.indicators;
 const liquidity = wizardLiquidityPass(ind, row.ticker, context.settings, row.candles.length);
 const trend = wizardTrendTemplate(ind, row.rsScore);
 const vcp = wizardDetectVcp(row.candles, ind);
 const breakout = wizardBreakout(ind, context.marketHealth, liquidity, trend, vcp);
 const risk = wizardRisk(ind.close, vcp.pivotPrice, ind.atr14, vcp.finalContractionLow, context.settings);
 const score = wizardScore({ trend, rsScore: row.rsScore, vcp, breakout, marketHealth: context.marketHealth });
 const shortTrend = ind.close > 0
 && ind.sma50 > 0
 && ind.sma150 > 0
 && ind.close < ind.sma50
 && ind.sma50 < ind.sma150
 && ind.return30d < -8
 && ind.return90d < -15;
 const shortScore = shortTrend ? Math.max(65, Math.min(92, Math.round((100 - row.rsScore) * 0.45 + Math.abs(ind.return90d) * 0.8))) : 0;
 const setupLabel = wizardLabel(score);
 const signal = breakout.pass && risk.pass ? 'BUY' : shortScore >= 75 ? 'SELL' : score >= 65 || shortScore >= 65 ? 'WATCHLIST' : 'IGNORE';
 const direction = signal === 'SELL' ? 'short' : signal === 'BUY' ? 'long' : shortScore > score ? 'watch_short' : 'watch_long';
 const finalScore = Math.max(score, shortScore);
 const checks = {
 marketHealth: !!context.marketHealth.pass,
 liquidityPassed: liquidity.pass,
 trendPassed: trend.pass,
 shortTrend,
 rsStrong: row.rsScore >= 70,
 vcpDetected: vcp.detected,
 breakoutReady: breakout.pass,
 riskAccepted: risk.pass,
 };
 const actionLabel = wizardActionLabel(signal, finalScore);
 const priorityLabel = wizardPriorityLabel(signal, finalScore, checks);
 const decision = wizardReasonPack(signal, { trend, vcp, breakout, risk }, row);
 const ruleBacktest = wizardBacktestRule(row.candles);
 const reasons = [
 ...trend.reasons,
 shortTrend ? 'Short-side downtrend confirmed' : '',
 liquidity.pass ? 'Liquidity passed' : 'Liquidity filter failed',
 row.rsScore >= 70 ? 'RS Strong' : 'RS not strong enough',
 vcp.detected ? `VCP with ${vcp.contractionCount} contractions` : 'VCP not confirmed',
 ...breakout.reasons,
 risk.reason,
 ].filter(Boolean);
 return global.FWDTradeDeskStrategies.normalizeStrategyResult({
 symbol: row.symbol,
 signal,
 direction,
 setupLabel,
 actionLabel,
 priorityLabel,
 score: finalScore,
 entry: wizardRound(ind.close, 8),
 stop: wizardRound(direction.includes('short') ? ind.close + (ind.atr14 * 1.5) : risk.stop, 8),
 riskPercent: wizardRound(risk.riskPercent, 2),
 targets: {
 target2R: wizardRound(risk.target2R, 8),
 target3R: wizardRound(risk.target3R, 8),
 positionQty: wizardRound(risk.positionQty, 6),
 },
 reasons,
 checks,
 rsScore: row.rsScore,
 raw: {
 close: wizardRound(ind.close, 8),
 priorityLabel,
 decision,
 ruleBacktest,
 shortScore,
 rsScore: row.rsScore,
 weightedReturn: wizardRound(row.weightedReturn, 2),
 return30d: wizardRound(ind.return30d, 2),
 return90d: wizardRound(ind.return90d, 2),
 return180d: wizardRound(ind.return180d, 2),
 btcRelative30d: wizardRound(ind.return30d - context.btcReturn30d, 2),
 btcRelative90d: wizardRound(ind.return90d - context.btcReturn90d, 2),
 pivotPrice: vcp.pivotPrice,
 contractions: vcp.contractions,
 contractionCount: vcp.contractionCount,
 volumeDryupScore: vcp.volumeDryupScore,
 breakoutVolumeRatio: breakout.breakoutVolumeRatio,
 latestQuoteVolume: wizardRound(liquidity.latestQuoteVolume, 0),
 avgQuoteVolume20: wizardRound(liquidity.avgQuoteVolume20, 0),
 atr14: wizardRound(ind.atr14, 8),
 highPeriod: ind.highPeriod,
 mode: 'scanner_only',
 },
 }, 'wizard');
 }

 async function wizardSetStatus(status, extra = {}) {
 await chrome.storage.local.set({
 'strategyStatus.wizard': {
 strategyId: 'wizard',
 status,
 ts: wizardNow(),
 ...extra,
 },
 });
 }

 async function wizardLoadSettings() {
 const stored = await new Promise(resolve => chrome.storage.local.get(['strategySettings.wizard'], resolve));
 return {
 ...WIZARD_DEFAULT_SETTINGS,
 ...(stored['strategySettings.wizard'] || {}),
 };
 }

 async function wizardFetchBtcCandles(limit) {
 for (const symbol of ['BTCUSD', 'BTCUSDT', 'XBTUSD']) {
 const candles = await fetchCandles(symbol, '1d', limit, CLOSED_DAILY);
 if (Array.isArray(candles) && candles.length >= 220) return { symbol, candles };
 }
 return { symbol: '', candles: [] };
 }

 async function runWizardScan() {
 if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) {
 throw new Error('Strategy registry not loaded');
 }
 await wizardSetStatus('Loading Delta market data...', { active: true, progress: 2 });
 await chrome.storage.local.set({ 'strategyResults.wizard': [] });
 await detectAPI(true);
 const settings = await wizardLoadSettings();
 const tickerMap = await fetchAllTickers();
 const products = await fetchProducts().catch(() => []);
 const productSymbols = new Set(products.map(item => String(item.symbol || '').toUpperCase()));
 const universe = Object.entries(tickerMap)
 .filter(([symbol, ticker]) => {
 const sym = String(symbol || '').toUpperCase();
 if (!sym || productSymbols.size && !productSymbols.has(sym)) return false;
 if (!sym.endsWith('USD') && !sym.endsWith('USDT')) return false;
 return Number(ticker?.price || 0) > 0;
 })
 .map(([symbol, ticker]) => ({ symbol, ticker }))
 .sort((a, b) => Number(b.ticker?.usdVol24h || 0) - Number(a.ticker?.usdVol24h || 0))
 .slice(0, Math.max(20, Number(settings.maxCoins || WIZARD_DEFAULT_SETTINGS.maxCoins)));
 await wizardSetStatus('Loading BTC market health...', { active: true, progress: 6, total: universe.length });
 const btc = await wizardFetchBtcCandles(settings.preferredCandles);
 const marketHealth = wizardMarketHealth(btc.candles);
 const btcInd = wizardCalculateIndicators(btc.candles || []);
 const rows = [];
 for (let i = 0; i < universe.length; i += 1) {
 const item = universe[i];
 if (i % 5 === 0 || i === universe.length - 1) {
 await wizardSetStatus(`Scanning ${item.symbol} (${i + 1}/${universe.length})`, {
 active: true,
 progress: Math.round(8 + (i / Math.max(1, universe.length)) * 82),
 scanned: i + 1,
 total: universe.length,
 marketHealth,
 });
 }
 try {
 const candles = await fetchCandles(item.symbol, '1d', settings.preferredCandles, CLOSED_DAILY);
 if (!Array.isArray(candles) || candles.length < settings.minCandles) continue;
 const indicators = wizardCalculateIndicators(candles);
 const weightedReturn = (0.5 * indicators.return90d) + (0.3 * indicators.return30d) + (0.2 * indicators.return180d);
 rows.push({ ...item, candles, indicators, weightedReturn });
 } catch (error) {
 wizardLog(`${item.symbol} skipped: ${error?.message || error}`);
 }
 }
 const ranks = wizardPercentileRanks(rows);
 const builtResults = rows.map(row => {
 row.rsScore = ranks.get(row.symbol) || 0;
 return wizardBuildResult(row, {
 settings,
 marketHealth,
 btcReturn30d: btcInd.return30d || 0,
 btcReturn90d: btcInd.return90d || 0,
 });
 })
 .sort((a, b) => {
 const signalRank = { BUY: 5, WATCHLIST: 4, SELL: 3, IGNORE: 1 };
 return (signalRank[b.signal] || 0) - (signalRank[a.signal] || 0)
 || Number(b.score || 0) - Number(a.score || 0)
 || Number(b.raw?.rsScore || 0) - Number(a.raw?.rsScore || 0);
 })
 .slice(0, Math.max(20, Number(settings.outputLimit || WIZARD_DEFAULT_SETTINGS.outputLimit)));
 const results = await wizardUpdateWatchAging('wizard', builtResults);
 const signalCounts = wizardSignalCounts(results);
 await chrome.storage.local.set({
 'strategyResults.wizard': results,
 'strategyStatus.wizard': {
 strategyId: 'wizard',
 status: `OK Done - ${results.length} Wizard rows | Buy ${signalCounts.BUY || 0}, Watch ${signalCounts.WATCHLIST || 0}, Sell ${signalCounts.SELL || 0}, Ignore ${signalCounts.IGNORE || 0}`,
 active: false,
 progress: 100,
 scanned: rows.length,
 total: universe.length,
 signalCounts,
 marketHealth,
 lastScanTs: wizardNow(),
 ts: wizardNow(),
 },
 wizardLastScanTs: wizardNow(),
 wizardMarketHealth: marketHealth,
 });
 wizardLog(`scan done: ${results.length} results`);
 return results;
 }

 function getWizardSnapshot(callback) {
 chrome.storage.local.get([
 'strategyResults.wizard',
 'strategyStatus.wizard',
 'strategySettings.wizard',
 'strategyResults.stage',
 'strategyStatus.stage',
 'strategySettings.stage',
'strategyResults.radar',
'strategyStatus.radar',
'strategySettings.radar',
'strategyResults.reversal',
'strategyStatus.reversal',
'strategySettings.reversal',
'scanResults',
'scanStatus',
'lastScanTs',
 ], data => {
 callback({
 ok: true,
 registry: global.FWDTradeDeskStrategies?.listStrategies?.() || [],
 current: {
 results: Array.isArray(data.scanResults) ? data.scanResults : [],
 status: data.scanStatus || '',
 lastScanTs: data.lastScanTs || 0,
 },
 wizard: {
 results: Array.isArray(data['strategyResults.wizard']) ? data['strategyResults.wizard'] : [],
 status: data['strategyStatus.wizard'] || {},
 settings: data['strategySettings.wizard'] || WIZARD_DEFAULT_SETTINGS,
 },
 stage: {
  results: Array.isArray(data['strategyResults.stage']) ? data['strategyResults.stage'] : [],
  status: data['strategyStatus.stage'] || {},
  settings: data['strategySettings.stage'] || {},
 },
radar: {
 results: Array.isArray(data['strategyResults.radar']) ? data['strategyResults.radar'] : [],
 status: data['strategyStatus.radar'] || {},
 settings: data['strategySettings.radar'] || {},
},
reversal: {
 results: Array.isArray(data['strategyResults.reversal']) ? data['strategyResults.reversal'] : [],
 status: data['strategyStatus.reversal'] || {},
 settings: data['strategySettings.reversal'] || {},
},
});
 });
}

 chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
 if (typeof isTrustedRuntimeSender === 'function' && !isTrustedRuntimeSender(sender)) {
 sendResponse({ ok: false, error: 'Unauthorized sender' });
 return false;
 }
 if (msg?.action === 'wizard:startScan') {
 runWizardScan()
 .then(results => sendResponse({ ok: true, count: results.length }))
 .catch(async error => {
 await wizardSetStatus(`Wizard scan failed - ${error?.message || error}`, { active: false, progress: 0 });
 sendResponse({ ok: false, error: error?.message || String(error) });
 });
 return true;
 }
 if (msg?.action === 'wizard:getResults') {
 getWizardSnapshot(sendResponse);
 return true;
 }
 if (msg?.action === 'wizard:clearResults') {
 chrome.storage.local.set({
 'strategyResults.wizard': [],
 'strategyStatus.wizard': { strategyId: 'wizard', status: 'Wizard results cleared', active: false, progress: 0, ts: wizardNow() },
 }, () => sendResponse({ ok: true }));
 return true;
 }
 return false;
 });

 global.FWDTradeDeskWizardScanner = Object.freeze({
 WIZARD_DEFAULT_SETTINGS,
 wizardCalculateIndicators,
 wizardMarketHealth,
 wizardLiquidityPass,
 wizardTrendTemplate,
 wizardDetectVcp,
 wizardBreakout,
 wizardRisk,
 wizardScore,
 wizardLabel,
 wizardActionLabel,
 wizardSignalCounts,
 wizardPriorityLabel,
 wizardBacktestRule,
 wizardUpdateWatchAging,
 wizardPercentileRanks,
 runWizardScan,
 });
})(globalThis);
