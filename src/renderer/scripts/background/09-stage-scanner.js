'use strict';

(function initStageScanner(global) {
 const STAGE_DEFAULT_SETTINGS = Object.freeze({
 maxCoins: 500,
 minLatestQuoteVolume: 50000,
 minAvgQuoteVolume20: 30000,
 minWeeklyCandles: 42,
 preferredDailyCandles: 620,
 outputLimit: 500,
 maPeriodWeeks: 30,
 maSlopeWeeks: 5,
 rangeWeeks: 16,
 priorTrendWeeks: 28,
 flatSlopePct: 2.25,
 risingSlopePct: 1.5,
 decliningSlopePct: -1.5,
 maxSidewaysRangePct: 45,
 touchTolerancePct: 0.025,
 volumeBreakoutRatio: 1.5,
 strongBreakoutVolumeRatio: 3,
 highVolumeRatio: 1.2,
 lowVolumeRatio: 0.85,
 priorAdvancePct: 40,
 });

 const CLOSED_DAILY = Object.freeze({ closedOnly: true, timeoutMs: 30000, paceMs: 1800 });
 const STAGE_LABELS = Object.freeze({
 STAGE_I: 'Stage I - Base / Consolidation',
 STAGE_II: 'Stage II - Uptrend',
 STAGE_III: 'Stage III - Distribution / Protect',
 STAGE_IV: 'Stage IV - Downtrend',
 REVIEW: 'Review - Not enough evidence',
 });
 const ACTION_LABELS = Object.freeze({
 STAGE_I: 'Watch Base',
 STAGE_II: 'Buy / Hold',
 STAGE_III: 'Protect Profit',
 STAGE_IV: 'Avoid Long / Short Watch',
 REVIEW: 'Review Manually',
 });

 function stageNow() {
 return Date.now();
 }

 function stageLog(message) {
 if (typeof global.dlog === 'function') global.dlog(`[STAGE] ${message}`);
 else console.log(`[STAGE] ${message}`);
 }

 function stageRound(value, decimals = 4) {
 const n = Number(value);
 if (!Number.isFinite(n)) return 0;
 const m = 10 ** decimals;
 return Math.round(n * m) / m;
 }

 function stageSma(values = [], period = 20, endIndex = values.length - 1) {
 if (!Array.isArray(values) || period <= 0 || endIndex < period - 1) return null;
 let sum = 0;
 for (let i = endIndex - period + 1; i <= endIndex; i += 1) {
 const value = Number(values[i]);
 if (!Number.isFinite(value)) return null;
 sum += value;
 }
 return sum / period;
 }

 function stageMedian(values = []) {
 const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
 if (!nums.length) return 0;
 const mid = Math.floor(nums.length / 2);
 return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
 }

 function stageQuoteVolume(candle = {}) {
 const quoteVolume = Number(candle.quote_volume ?? candle.quoteVolume ?? candle.turnover ?? candle.turnover_usd ?? 0);
 if (Number.isFinite(quoteVolume) && quoteVolume > 0) return quoteVolume;
 const volume = Number(candle.volume || 0);
 const close = Number(candle.close || 0);
 return volume > 0 && close > 0 ? volume * close : 0;
 }

 function stageWeekStartSec(timeSec = 0) {
 const date = new Date(Number(timeSec || 0) * 1000);
 if (!Number.isFinite(date.getTime())) return 0;
 const day = date.getUTCDay();
 const diff = (day + 6) % 7;
 return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diff) / 1000;
 }

 function stageBuildWeeklyCandles(dailyCandles = []) {
 const rows = (Array.isArray(dailyCandles) ? dailyCandles : [])
 .map(candle => ({
 time: Number(candle?.time || 0),
 open: Number(candle?.open || candle?.close || 0),
 high: Number(candle?.high || candle?.close || 0),
 low: Number(candle?.low || candle?.close || 0),
 close: Number(candle?.close || 0),
 volume: Number(candle?.volume || 0),
 quoteVolume: stageQuoteVolume(candle),
 }))
 .filter(candle => candle.time > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0)
 .sort((a, b) => a.time - b.time);
 const weeks = [];
 let active = null;
 rows.forEach(candle => {
 const weekStart = stageWeekStartSec(candle.time);
 if (!weekStart) return;
 if (!active || active.time !== weekStart) {
 if (active) weeks.push(active);
 active = {
 time: weekStart,
 open: candle.open || candle.close,
 high: candle.high,
 low: candle.low,
 close: candle.close,
 volume: candle.volume || 0,
 quoteVolume: candle.quoteVolume || 0,
 dayCount: 1,
 };
 return;
 }
 active.high = Math.max(active.high, candle.high);
 active.low = Math.min(active.low, candle.low);
 active.close = candle.close;
 active.volume += candle.volume || 0;
 active.quoteVolume += candle.quoteVolume || 0;
 active.dayCount += 1;
 });
 if (active) weeks.push(active);
 return weeks;
 }

 function stageAtr(candles = [], period = 14) {
 if (!Array.isArray(candles) || candles.length < period + 1) return 0;
 const trs = [];
 for (let i = 1; i < candles.length; i += 1) {
 const high = Number(candles[i]?.high || 0);
 const low = Number(candles[i]?.low || 0);
 const prevClose = Number(candles[i - 1]?.close || 0);
 if (!(high > 0) || !(low > 0) || !(prevClose > 0)) continue;
 trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
 }
 return stageSma(trs, period) || 0;
 }

 function stageDetectPivots(candles = [], pivot = 2) {
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

 function stageStructure(candles = []) {
 const recent = (Array.isArray(candles) ? candles : []).slice(-26);
 const { highs, lows } = stageDetectPivots(recent, 2);
 const lastHighs = highs.slice(-2);
 const lastLows = lows.slice(-2);
 const tolerance = 0.01;
 const higherHighs = lastHighs.length >= 2 && lastHighs[1].price > lastHighs[0].price * (1 + tolerance);
 const higherLows = lastLows.length >= 2 && lastLows[1].price > lastLows[0].price * (1 + tolerance);
 const lowerHighs = lastHighs.length >= 2 && lastHighs[1].price < lastHighs[0].price * (1 - tolerance);
 const lowerLows = lastLows.length >= 2 && lastLows[1].price < lastLows[0].price * (1 - tolerance);
 return {
 structure: higherHighs && higherLows ? 'uptrend' : lowerHighs && lowerLows ? 'downtrend' : 'range',
 higherHighs,
 higherLows,
 lowerHighs,
 lowerLows,
 swingHighs: lastHighs.map(item => stageRound(item.price, 6)),
 swingLows: lastLows.map(item => stageRound(item.price, 6)),
 };
 }

 function stageCountTouches(candles = [], price = 0, field = 'high', tolerancePct = 0.025) {
 if (!(price > 0)) return 0;
 const tolerance = Math.max(0.001, Number(tolerancePct || 0.025));
 return (Array.isArray(candles) ? candles : []).filter(candle => {
 const value = Number(candle?.[field] || 0);
 return value > 0 && Math.abs(value - price) / price <= tolerance;
 }).length;
 }

 function stageCrossCount(candles = [], maSeries = [], period = 30) {
 let crosses = 0;
 let prev = 0;
 const start = Math.max(period - 1, candles.length - 18);
 for (let i = start; i < candles.length; i += 1) {
 const close = Number(candles[i]?.close || 0);
 const ma = Number(maSeries[i] || 0);
 if (!(close > 0) || !(ma > 0)) continue;
 const sign = close >= ma ? 1 : -1;
 if (prev && prev !== sign) crosses += 1;
 prev = sign;
 }
 return crosses;
 }

 function stageBuildMetrics(weekly = [], settings = STAGE_DEFAULT_SETTINGS) {
 const closes = weekly.map(candle => Number(candle.close || 0));
 const volumes = weekly.map(candle => Number(candle.volume || 0));
 const quoteVolumes = weekly.map(candle => Number(candle.quoteVolume || 0));
 const maPeriod = Math.max(10, Number(settings.maPeriodWeeks || 30));
 const rangeWeeks = Math.max(8, Number(settings.rangeWeeks || 16));
 const slopeWeeks = Math.max(3, Number(settings.maSlopeWeeks || 5));
 const maSeries = closes.map((_, index) => stageSma(closes, maPeriod, index));
 const lastIndex = weekly.length - 1;
 const latest = weekly[lastIndex] || {};
 const close = Number(latest.close || 0);
 const ma30 = Number(maSeries[lastIndex] || 0);
 const prevMa = Number(maSeries[Math.max(0, lastIndex - slopeWeeks)] || 0);
 const ma30Slope5wPct = ma30 > 0 && prevMa > 0 ? ((ma30 - prevMa) / prevMa) * 100 : 0;
 const rangeWindow = weekly.slice(Math.max(0, weekly.length - rangeWeeks - 1), Math.max(0, weekly.length - 1));
 const fallbackWindow = weekly.slice(-rangeWeeks);
 const supportWindow = rangeWindow.length >= 6 ? rangeWindow : fallbackWindow;
 const rangeHigh = Math.max(...supportWindow.map(candle => Number(candle.high || 0)).filter(value => value > 0));
 const rangeLow = Math.min(...supportWindow.map(candle => Number(candle.low || 0)).filter(value => value > 0));
 const rangePct = rangeHigh > 0 && rangeLow > 0 ? ((rangeHigh - rangeLow) / rangeLow) * 100 : 0;
 const avgVolume10 = stageSma(volumes, 10) || 0;
 const prevVolume10 = stageSma(volumes, 10, Math.max(0, lastIndex - 10)) || 0;
 const latestVolume = Number(latest.volume || 0);
 const volumeRatio10w = avgVolume10 > 0 ? latestVolume / avgVolume10 : 0;
 const volumeTrendRatio = prevVolume10 > 0 ? avgVolume10 / prevVolume10 : 1;
 const avgQuoteVolume20 = stageSma(quoteVolumes, 20) || 0;
 const latestQuoteVolume = Number(latest.quoteVolume || 0);
 const atr14 = stageAtr(weekly, 14);
 const atrRatio = close > 0 ? (atr14 / close) * 100 : 0;
 const atrHistory = [];
 for (let i = Math.max(15, weekly.length - 30); i < weekly.length; i += 1) {
 const val = stageAtr(weekly.slice(0, i + 1), 14);
 if (val > 0 && Number(weekly[i]?.close || 0) > 0) atrHistory.push((val / Number(weekly[i].close)) * 100);
 }
 const atrMedian = stageMedian(atrHistory);
 const structure = stageStructure(weekly);
 const supportTouches = Number.isFinite(rangeLow) ? stageCountTouches(supportWindow, rangeLow, 'low', settings.touchTolerancePct) : 0;
 const resistanceTouches = Number.isFinite(rangeHigh) ? stageCountTouches(supportWindow, rangeHigh, 'high', settings.touchTolerancePct) : 0;
 const priorIndex = Math.max(0, weekly.length - rangeWeeks - Number(settings.priorTrendWeeks || 28));
 const priorClose = Number(weekly[priorIndex]?.close || 0);
 const priorTrendPct = priorClose > 0 && Number.isFinite(rangeHigh) ? ((rangeHigh - priorClose) / priorClose) * 100 : 0;
 const priceCrossesMa = stageCrossCount(weekly, maSeries, maPeriod);
 const aroundMaWeeks = weekly.slice(-Math.min(18, weekly.length)).filter((candle, idx, arr) => {
 const absoluteIndex = weekly.length - arr.length + idx;
 const ma = Number(maSeries[absoluteIndex] || 0);
 return ma > 0 && Number(candle.low || 0) <= ma && Number(candle.high || 0) >= ma;
 }).length;
 const aboveMaWeeks = weekly.slice(-Math.min(10, weekly.length)).filter((candle, idx, arr) => {
 const absoluteIndex = weekly.length - arr.length + idx;
 const ma = Number(maSeries[absoluteIndex] || 0);
 return ma > 0 && Number(candle.close || 0) > ma;
 }).length;
 const belowMaWeeks = weekly.slice(-Math.min(10, weekly.length)).filter((candle, idx, arr) => {
 const absoluteIndex = weekly.length - arr.length + idx;
 const ma = Number(maSeries[absoluteIndex] || 0);
 return ma > 0 && Number(candle.close || 0) < ma;
 }).length;
 const breakout = Number.isFinite(rangeHigh) && close > rangeHigh;
 const breakdown = Number.isFinite(rangeLow) && close < rangeLow;
 const recentLow = Math.min(...weekly.slice(-10).map(candle => Number(candle.low || 0)).filter(value => value > 0));
 const recentHigh = Math.max(...weekly.slice(-10).map(candle => Number(candle.high || 0)).filter(value => value > 0));
 return {
 close,
 ma30,
 ma30Slope5wPct,
 rangeHigh: Number.isFinite(rangeHigh) ? rangeHigh : 0,
 rangeLow: Number.isFinite(rangeLow) ? rangeLow : 0,
 rangePct,
 volumeRatio10w,
 volumeTrendRatio,
 latestVolume,
 avgVolume10,
 latestQuoteVolume,
 avgQuoteVolume20,
 atr14,
 atrRatio,
 atrMedian,
 priorTrendPct,
 supportTouches,
 resistanceTouches,
 priceCrossesMa,
 aroundMaWeeks,
 aboveMaWeeks,
 belowMaWeeks,
 breakout,
 breakdown,
 recentLow,
 recentHigh,
 structure,
 maSeries,
 };
 }

 function stageScoreMetrics(metrics = {}, settings = STAGE_DEFAULT_SETTINGS) {
 const close = Number(metrics.close || 0);
 const ma30 = Number(metrics.ma30 || 0);
 const slope = Number(metrics.ma30Slope5wPct || 0);
 const priceAboveMa = close > ma30;
 const priceBelowMa = close < ma30;
 const maFlat = Math.abs(slope) <= Number(settings.flatSlopePct || 2.25);
 const maRising = slope >= Number(settings.risingSlopePct || 1.5);
 const maDeclining = slope <= Number(settings.decliningSlopePct || -1.5);
 const sideways = Number(metrics.rangePct || 0) > 0 && Number(metrics.rangePct || 0) <= Number(settings.maxSidewaysRangePct || 45);
 const volumeDrying = Number(metrics.volumeTrendRatio || 1) <= Number(settings.lowVolumeRatio || 0.85);
 const highVolume = Number(metrics.volumeTrendRatio || 1) >= Number(settings.highVolumeRatio || 1.2) || Number(metrics.volumeRatio10w || 0) >= Number(settings.highVolumeRatio || 1.2);
 const breakoutVolume = Number(metrics.volumeRatio10w || 0) >= Number(settings.volumeBreakoutRatio || 1.5);
 const strongBreakoutVolume = Number(metrics.volumeRatio10w || 0) >= Number(settings.strongBreakoutVolumeRatio || 3);
 const priorUptrend = Number(metrics.priorTrendPct || 0) >= Number(settings.priorAdvancePct || 45);
 const structureUp = metrics.structure?.structure === 'uptrend';
 const structureDown = metrics.structure?.structure === 'downtrend';
 const rangeTouched = Number(metrics.supportTouches || 0) >= 2 && Number(metrics.resistanceTouches || 0) >= 2;
 const choppy = Number(metrics.priceCrossesMa || 0) >= 2 || Number(metrics.aroundMaWeeks || 0) >= 4;
 const volatilityWide = Number(metrics.atrMedian || 0) > 0 && Number(metrics.atrRatio || 0) >= Number(metrics.atrMedian || 0) * 1.15;

 const scores = {
 STAGE_I: 0,
 STAGE_II: 0,
 STAGE_III: 0,
 STAGE_IV: 0,
 };
 if (maFlat) scores.STAGE_I += 25;
 if (sideways) scores.STAGE_I += 20;
 if (choppy) scores.STAGE_I += 10;
 if (volumeDrying) scores.STAGE_I += 18;
 if (!priorUptrend) scores.STAGE_I += 12;
 if (rangeTouched) scores.STAGE_I += 15;

 if (priceAboveMa) scores.STAGE_II += 20;
 if (maRising) scores.STAGE_II += 22;
 if (structureUp) scores.STAGE_II += 16;
 if (metrics.breakout) scores.STAGE_II += 16;
 if (breakoutVolume) scores.STAGE_II += 10;
 if (strongBreakoutVolume) scores.STAGE_II += 8;
 if (Number(metrics.aboveMaWeeks || 0) >= 7) scores.STAGE_II += 8;

 if (priorUptrend) scores.STAGE_III += 24;
 if (maFlat || (slope < Number(settings.risingSlopePct || 1.5) && slope > Number(settings.decliningSlopePct || -1.5))) scores.STAGE_III += 18;
 if (sideways) scores.STAGE_III += 15;
 if (highVolume) scores.STAGE_III += 15;
 if (choppy) scores.STAGE_III += 16;
 if (volatilityWide) scores.STAGE_III += 8;
 if (priceBelowMa && !metrics.breakdown) scores.STAGE_III += 8;

 if (priceBelowMa) scores.STAGE_IV += 22;
 if (maDeclining) scores.STAGE_IV += 22;
 if (metrics.breakdown) scores.STAGE_IV += 22;
 if (structureDown) scores.STAGE_IV += 14;
 if (Number(metrics.belowMaWeeks || 0) >= 7) scores.STAGE_IV += 8;
 if (close <= Number(metrics.recentLow || 0) * 1.02) scores.STAGE_IV += 8;

 return {
 scores,
 flags: {
 priceAboveMa,
 priceBelowMa,
 maFlat,
 maRising,
 maDeclining,
 sideways,
 volumeDrying,
 highVolume,
 breakoutVolume,
 strongBreakoutVolume,
 priorUptrend,
 structureUp,
 structureDown,
 rangeTouched,
 choppy,
 volatilityWide,
 },
 };
 }

 function stageClassify(weekly = [], settings = STAGE_DEFAULT_SETTINGS) {
 if (!Array.isArray(weekly) || weekly.length < Number(settings.minWeeklyCandles || 42)) {
 return {
 stage: 'REVIEW',
 stageLabel: STAGE_LABELS.REVIEW,
 actionLabel: ACTION_LABELS.REVIEW,
 confidence: 0,
 score: 0,
 signal: 'IGNORE',
 reasons: ['Need more weekly history'],
 checks: {},
 raw: { stageMetrics: { reviewFlag: 'insufficient_weekly_history' } },
 };
 }
 const metrics = stageBuildMetrics(weekly, settings);
 const { scores, flags } = stageScoreMetrics(metrics, settings);
 let stage = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || 'REVIEW';
 if (scores.STAGE_IV >= 58 && (metrics.breakdown || (flags.priceBelowMa && flags.maDeclining))) {
 stage = 'STAGE_IV';
 } else if (scores.STAGE_III >= 58 && flags.priorUptrend && (flags.maFlat || flags.choppy || flags.highVolume)) {
 stage = 'STAGE_III';
 } else if (scores.STAGE_II >= 58 && flags.priceAboveMa && (flags.maRising || metrics.breakout || flags.structureUp)) {
 stage = 'STAGE_II';
 } else if (scores.STAGE_I >= 50) {
 stage = 'STAGE_I';
 }
 const confidence = Math.max(0, Math.min(95, Math.round(scores[stage] || 0)));
 const isBuy = stage === 'STAGE_II' && confidence >= 70 && flags.priceAboveMa;
 const isShortWatch = stage === 'STAGE_IV' && confidence >= 70 && flags.priceBelowMa;
 const signal = isBuy ? 'BUY' : (stage === 'STAGE_I' || stage === 'STAGE_II') ? 'WATCHLIST' : 'IGNORE';
 const direction = isBuy ? 'long' : isShortWatch ? 'short' : stage === 'STAGE_IV' ? 'watch_short' : 'watch_long';
 const priorityLabel = stagePriorityLabel(stage, confidence, flags, metrics);
 const triggerPrice = stageRound(metrics.rangeHigh, 8);
 const protectLevel = stage === 'STAGE_II'
 ? stageRound(Math.max(Number(metrics.rangeLow || 0), Number(metrics.ma30 || 0) * 0.98), 8)
 : stageRound(Number(metrics.rangeLow || 0), 8);
 const exitPrice = stage === 'STAGE_III' || stage === 'STAGE_IV'
 ? stageRound(Number(metrics.rangeLow || metrics.ma30 || 0), 8)
 : 0;
 const entry = stage === 'STAGE_II' ? stageRound(metrics.close, 8) : stage === 'STAGE_I' ? triggerPrice : 0;
 const stop = stage === 'STAGE_II' || stage === 'STAGE_I' ? protectLevel : exitPrice;
 const risk = entry > 0 && stop > 0 && entry > stop ? entry - stop : 0;
 const stageMetrics = {
 ma30: stageRound(metrics.ma30, 8),
 ma30Slope5wPct: stageRound(metrics.ma30Slope5wPct, 2),
 rangeHigh: stageRound(metrics.rangeHigh, 8),
 rangeLow: stageRound(metrics.rangeLow, 8),
 volumeRatio10w: stageRound(metrics.volumeRatio10w, 2),
 avgQuoteVolume20: stageRound(metrics.avgQuoteVolume20, 0),
 latestQuoteVolume: stageRound(metrics.latestQuoteVolume, 0),
 atrRatio: stageRound(metrics.atrRatio, 2),
 priorTrendPct: stageRound(metrics.priorTrendPct, 2),
 supportTouches: metrics.supportTouches,
 resistanceTouches: metrics.resistanceTouches,
 reviewFlag: confidence < 58 ? 'low_confidence' : '',
 rangePct: stageRound(metrics.rangePct, 2),
 volumeTrendRatio: stageRound(metrics.volumeTrendRatio, 2),
 priceCrossesMa: metrics.priceCrossesMa,
 aroundMaWeeks: metrics.aroundMaWeeks,
 close: stageRound(metrics.close, 8),
 breakout: !!metrics.breakout,
 breakdown: !!metrics.breakdown,
 structure: metrics.structure?.structure || 'range',
 };
 const reasons = [
 `${STAGE_LABELS[stage]} detected`,
 flags.maRising ? '30WMA turning up' : flags.maDeclining ? '30WMA declining' : flags.maFlat ? '30WMA flat' : '30WMA mixed',
 flags.priceAboveMa ? 'Price above 30WMA' : flags.priceBelowMa ? 'Price below 30WMA' : 'Price near 30WMA',
 flags.sideways ? 'Range behavior present' : 'Range is wide or expanding',
 flags.highVolume ? 'Relative weekly volume elevated' : flags.volumeDrying ? 'Volume drying up' : 'Volume neutral',
 flags.priorUptrend ? 'Prior Stage II advance present' : 'No strong prior advance',
 metrics.breakout ? 'Breakout above range' : metrics.breakdown ? 'Breakdown below range' : 'Inside range',
 ].filter(Boolean);
 return global.FWDTradeDeskStrategies.normalizeStrategyResult({
 symbol: '',
 strategyId: 'stage',
 signal,
 direction,
 setupLabel: STAGE_LABELS[stage],
 stage,
 stageLabel: STAGE_LABELS[stage],
 actionLabel: ACTION_LABELS[stage],
 priorityLabel,
 confidence,
 score: confidence,
 entry,
 stop,
 protectLevel,
 exitPrice,
 triggerPrice,
 riskPercent: entry > 0 && risk > 0 ? (risk / entry) * 100 : 0,
 targets: {
 triggerPrice,
 protectLevel,
 exitPrice,
 rangeHigh: stageMetrics.rangeHigh,
 rangeLow: stageMetrics.rangeLow,
 ma30: stageMetrics.ma30,
 target2R: risk > 0 ? stageRound(entry + 2 * risk, 8) : 0,
 },
 reasons,
 checks: {
 maFlat: flags.maFlat,
 maRising: flags.maRising,
 maDeclining: flags.maDeclining,
 priceAboveMa: flags.priceAboveMa,
 priceBelowMa: flags.priceBelowMa,
 sideways: flags.sideways,
 priorUptrend: flags.priorUptrend,
 highVolume: flags.highVolume,
 volumeDrying: flags.volumeDrying,
 breakout: !!metrics.breakout,
 breakdown: !!metrics.breakdown,
 rangeTouched: flags.rangeTouched,
 choppy: flags.choppy,
 },
 raw: {
 stageMetrics,
 flags,
 scores,
 priorityLabel,
 decision: stageReasonPack(stage, flags, metrics, confidence),
 },
 }, 'stage');
 }

 function stagePriorityLabel(stage = 'REVIEW', confidence = 0, flags = {}, metrics = {}) {
 const conf = Number(confidence || 0);
 if (stage === 'STAGE_II' && conf >= 70 && flags.priceAboveMa) return metrics.breakout ? 'Best now' : 'Buy/Hold';
 if (stage === 'STAGE_II') return 'Near entry';
 if (stage === 'STAGE_I') return metrics.breakout ? 'Breakout watch' : 'Base watch';
 if (stage === 'STAGE_III') return 'Protect now';
 if (stage === 'STAGE_IV') return 'Avoid long';
 return 'Review data';
 }

 function stageReasonPack(stage = 'REVIEW', flags = {}, metrics = {}, confidence = 0) {
 const whySelected = [];
 const whyNotNow = [];
 if (flags.maRising) whySelected.push('30WMA turning up');
 if (flags.maFlat) whySelected.push('30WMA flat');
 if (flags.maDeclining) whySelected.push('30WMA declining');
 if (flags.priceAboveMa) whySelected.push('Price above 30WMA');
 if (flags.priceBelowMa) whySelected.push('Price below 30WMA');
 if (flags.sideways) whySelected.push('Range behavior present');
 if (flags.highVolume) whySelected.push('Relative volume elevated');
 if (flags.volumeDrying) whySelected.push('Volume drying up');
 if (stage === 'STAGE_I') whyNotNow.push('Needs breakout above range');
 if (stage === 'STAGE_II' && !metrics.breakout) whyNotNow.push('Inside or near range; entry should be controlled');
 if (stage === 'STAGE_III') whyNotNow.push('Distribution risk; protect profit first');
 if (stage === 'STAGE_IV') whyNotNow.push('Downtrend; avoid long setups');
 if (stage === 'REVIEW') whyNotNow.push('Not enough stage evidence');
 const nextAction = stage === 'STAGE_II'
 ? 'Buy or hold only with manual confirmation and protect level respected.'
 : stage === 'STAGE_I'
 ? 'Set alert above range high and wait for volume confirmation.'
 : stage === 'STAGE_III'
 ? 'Tighten protection and prepare exit if support fails.'
 : stage === 'STAGE_IV'
 ? 'Avoid long; only monitor for short-side rules.'
 : 'Review chart manually after more weekly history.';
 return {
 whySelected: whySelected.slice(0, 3),
 whyNotNow: whyNotNow.slice(0, 3),
 nextAction,
 confidence: stageRound(confidence, 0),
 };
 }

 function stageRuleEvidence(weekly = [], targetStage = 'STAGE_II', settings = STAGE_DEFAULT_SETTINGS) {
 const rows = Array.isArray(weekly) ? weekly : [];
 const samples = [];
 for (let i = Number(settings.minWeeklyCandles || 42); i < rows.length - 8; i += 3) {
 const result = stageClassify(rows.slice(0, i + 1), settings);
 if (result.stage !== targetStage) continue;
 const close = Number(rows[i]?.close || 0);
 const future = Number(rows[i + 8]?.close || 0);
 if (!(close > 0) || !(future > 0)) continue;
 samples.push(((future - close) / close) * 100);
 }
 const count = samples.length;
 const avg8wReturn = count ? samples.reduce((sum, value) => sum + value, 0) / count : 0;
 const winRate = count ? (samples.filter(value => targetStage === 'STAGE_IV' ? value < 0 : value > 0).length / count) * 100 : 0;
 return {
 label: count >= 8 ? `${targetStage.replace('STAGE_', 'Stage ')} rule sample` : count ? 'Thin sample' : 'No sample',
 samples: count,
 winRate: stageRound(winRate, 1),
 avg8wReturn: stageRound(avg8wReturn, 2),
 best8wReturn: count ? stageRound(Math.max(...samples), 2) : 0,
 worst8wReturn: count ? stageRound(Math.min(...samples), 2) : 0,
 };
 }

 function stageAnalyzeSymbol(symbol = '', dailyCandles = [], ticker = {}, settings = STAGE_DEFAULT_SETTINGS) {
 const weekly = stageBuildWeeklyCandles(dailyCandles);
 const result = stageClassify(weekly, settings);
 const safeSymbol = String(symbol || '').trim().toUpperCase();
 result.symbol = safeSymbol;
 result.raw = {
 ...(result.raw || {}),
 latestPrice: Number(ticker?.price || result.raw?.stageMetrics?.close || 0),
 latestQuoteVolume: Number(ticker?.usdVol24h || 0),
 weeklyBars: weekly.length,
 candlePolicy: 'closed_only_daily_to_weekly',
 ruleEvidence: stageRuleEvidence(weekly, result.stage, settings),
 };
 return result;
 }

 async function stageSetStatus(status, extra = {}) {
 await chrome.storage.local.set({
 'strategyStatus.stage': {
 strategyId: 'stage',
 status,
 ts: stageNow(),
 ...extra,
 },
 });
 }

async function stageLoadSettings() {
 const stored = await new Promise(resolve => chrome.storage.local.get(['strategySettings.stage'], resolve));
 const settings = {
  ...STAGE_DEFAULT_SETTINGS,
  ...(stored['strategySettings.stage'] || {}),
  };
 settings.maxCoins = Math.max(STAGE_DEFAULT_SETTINGS.maxCoins, Number(settings.maxCoins || 0));
 settings.outputLimit = Math.max(STAGE_DEFAULT_SETTINGS.outputLimit, Number(settings.outputLimit || 0));
 return settings;
 }

 function stageBuildUniverse(tickerMap = {}, products = [], settings = STAGE_DEFAULT_SETTINGS) {
 const productSymbols = new Set((Array.isArray(products) ? products : []).map(item => String(item.symbol || '').toUpperCase()));
 return Object.entries(tickerMap)
 .filter(([symbol, ticker]) => {
 const sym = String(symbol || '').toUpperCase();
 if (!sym || productSymbols.size && !productSymbols.has(sym)) return false;
 if (!(Number(ticker?.price || 0) > 0)) return false;
 const latestQuoteVolume = Number(ticker?.inrTurnover24h || ticker?.turnover24h || ticker?.usdVol24h || 0);
 return !(latestQuoteVolume > 0) || latestQuoteVolume >= Number(settings.minLatestQuoteVolume || 0);
 })
 .map(([symbol, ticker]) => ({ symbol, ticker }))
 .sort((a, b) => Number(b.ticker?.usdVol24h || 0) - Number(a.ticker?.usdVol24h || 0))
 .slice(0, Math.max(20, Number(settings.maxCoins || STAGE_DEFAULT_SETTINGS.maxCoins)));
 }

 function stageUniverseDiagnostics(tickerMap = {}, products = [], settings = STAGE_DEFAULT_SETTINGS) {
 const productSymbols = new Set((Array.isArray(products) ? products : []).map(item => String(item.symbol || '').toUpperCase()));
 const diagnostics = {
 tickerRows: 0,
 productMatched: 0,
 usdPerpRows: 0,
 pricedRows: 0,
 lowLatestLiquidity: 0,
 universeRows: 0,
 };
 Object.entries(tickerMap || {}).forEach(([symbol, ticker]) => {
 diagnostics.tickerRows += 1;
 const sym = String(symbol || '').toUpperCase();
 if (!sym || productSymbols.size && !productSymbols.has(sym)) return;
 diagnostics.productMatched += 1;
 diagnostics.usdPerpRows += 1;
 if (!(Number(ticker?.price || 0) > 0)) return;
 diagnostics.pricedRows += 1;
 const latestQuoteVolume = Number(ticker?.inrTurnover24h || ticker?.turnover24h || ticker?.usdVol24h || 0);
 if (latestQuoteVolume > 0 && latestQuoteVolume < Number(settings.minLatestQuoteVolume || 0)) diagnostics.lowLatestLiquidity += 1;
 });
 return diagnostics;
 }

 function stageCounts(results = []) {
 return (Array.isArray(results) ? results : []).reduce((acc, row) => {
 const key = String(row?.stage || 'REVIEW');
 acc[key] = (acc[key] || 0) + 1;
 return acc;
 }, { STAGE_I: 0, STAGE_II: 0, STAGE_III: 0, STAGE_IV: 0, REVIEW: 0 });
 }

 function stageSortRows(results = []) {
 const stageRank = { STAGE_II: 5, STAGE_I: 4, STAGE_III: 3, STAGE_IV: 2, REVIEW: 1 };
 return (Array.isArray(results) ? results : []).slice().sort((a, b) => {
 return (stageRank[b.stage] || 0) - (stageRank[a.stage] || 0)
 || Number(b.confidence || b.score || 0) - Number(a.confidence || a.score || 0)
 || String(a.symbol || '').localeCompare(String(b.symbol || ''));
 });
 }

 async function stageUpdateLifecycleState(results = []) {
 const ts = stageNow();
 const keys = ['strategyLabStageLastMap', 'strategyLabStageTransitions', 'strategyLabWatchAging.stage'];
 const stored = await new Promise(resolve => chrome.storage.local.get(keys, resolve));
 const lastMap = stored.strategyLabStageLastMap && typeof stored.strategyLabStageLastMap === 'object' ? stored.strategyLabStageLastMap : {};
 const transitions = Array.isArray(stored.strategyLabStageTransitions) ? stored.strategyLabStageTransitions.slice(-80) : [];
 const agingMap = stored['strategyLabWatchAging.stage'] && typeof stored['strategyLabWatchAging.stage'] === 'object' ? stored['strategyLabWatchAging.stage'] : {};
 const nextLastMap = { ...lastMap };
 const nextAgingMap = { ...agingMap };
 const enriched = (Array.isArray(results) ? results : []).map(row => {
 const symbol = String(row?.symbol || '').toUpperCase();
 if (!symbol) return row;
 const stage = String(row.stage || 'REVIEW');
 const prior = lastMap[symbol] || {};
 let transition = null;
 if (prior.stage && prior.stage !== stage) {
 transition = {
 symbol,
 fromStage: prior.stage,
 toStage: stage,
 fromLabel: prior.stageLabel || prior.stage,
 toLabel: row.stageLabel || stage,
 ts,
 };
 transitions.push(transition);
 }
 nextLastMap[symbol] = {
 stage,
 stageLabel: row.stageLabel || stage,
 confidence: Number(row.confidence || row.score || 0),
 ts,
 };
 const tracked = ['STAGE_I', 'STAGE_II', 'STAGE_III'].includes(stage);
 let aging = null;
 if (tracked) {
 const old = agingMap[symbol] || {};
 const score = Number(row.confidence || row.score || 0);
 const previousScore = Number(old.lastScore || score);
 aging = {
 firstSeen: Number(old.firstSeen || ts),
 lastSeen: ts,
 scans: Number(old.scans || 0) + 1,
 lastSignal: row.signal,
 lastStage: stage,
 lastScore: score,
 scoreTrend: score > previousScore ? 'improving' : score < previousScore ? 'weakening' : 'steady',
 };
 nextAgingMap[symbol] = aging;
 }
 return {
 ...row,
 raw: {
 ...(row.raw || {}),
 stageTransition: transition,
 watchAging: aging,
 },
 };
 });
 await chrome.storage.local.set({
 strategyLabStageLastMap: nextLastMap,
 strategyLabStageTransitions: transitions.slice(-100),
 'strategyLabWatchAging.stage': nextAgingMap,
 });
 return { results: enriched, transitions: transitions.slice(-20) };
 }

 async function runStageScan() {
 if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) {
 throw new Error('Strategy registry not loaded');
 }
 await stageSetStatus('Loading market data...', { active: true, progress: 2 });
 await chrome.storage.local.set({ 'strategyResults.stage': [] });
 await detectAPI(true);
 const settings = await stageLoadSettings();
 const tickerMap = await fetchAllTickers();
 const products = await fetchProducts().catch(() => []);
 const diagnostics = stageUniverseDiagnostics(tickerMap, products, settings);
 const universe = stageBuildUniverse(tickerMap, products, settings);
 diagnostics.universeRows = universe.length;
 await stageSetStatus('Building weekly stage context...', { active: true, progress: 6, total: universe.length });
 const results = [];
 const skipped = {
 insufficientHistory: 0,
 review: 0,
 lowAverageLiquidity: 0,
 fetchErrors: 0,
 };
 for (let i = 0; i < universe.length; i += 1) {
 const item = universe[i];
 if (i % 5 === 0 || i === universe.length - 1) {
 await stageSetStatus(`Scanning ${item.symbol} (${i + 1}/${universe.length})`, {
 active: true,
 progress: Math.round(8 + (i / Math.max(1, universe.length)) * 86),
 scanned: i + 1,
 total: universe.length,
 });
 }
 try {
 const candles = await fetchCandles(item.symbol, '1d', settings.preferredDailyCandles, CLOSED_DAILY);
 const safeCandles = Array.isArray(candles) ? candles : [];
 if (safeCandles.length < Number(settings.minWeeklyCandles || 42) * 5) skipped.insufficientHistory += 1;
 const result = stageAnalyzeSymbol(item.symbol, safeCandles, item.ticker, settings);
 if (!result.symbol) continue;
 if (result.stage === 'REVIEW') skipped.review += 1;
 const avgQuoteVolume20 = Number(result.raw?.stageMetrics?.avgQuoteVolume20 || 0);
 if (avgQuoteVolume20 && avgQuoteVolume20 < Number(settings.minAvgQuoteVolume20 || 0)) {
 skipped.lowAverageLiquidity += 1;
 result.reasons = [...(result.reasons || []), 'Average liquidity below stage threshold'];
 result.checks = { ...(result.checks || {}), avgLiquidityPassed: false };
 result.raw = { ...(result.raw || {}), stageDiagnostics: { lowAverageLiquidity: true } };
 } else {
 result.checks = { ...(result.checks || {}), avgLiquidityPassed: true };
 }
 results.push(result);
 } catch (error) {
 skipped.fetchErrors += 1;
 stageLog(`${item.symbol} skipped: ${error?.message || error}`);
 }
 }
 const lifecycle = await stageUpdateLifecycleState(results);
 const sortedResults = stageSortRows(lifecycle.results);
 const output = sortedResults.slice(0, Math.max(20, Number(settings.outputLimit || STAGE_DEFAULT_SETTINGS.outputLimit)));
 const counts = stageCounts(output);
 const allStageCounts = stageCounts(results);
 await chrome.storage.local.set({
 'strategyResults.stage': output,
 'strategyStatus.stage': {
 strategyId: 'stage',
 status: `OK Done - ${output.length} Stage rows | II ${allStageCounts.STAGE_II || 0}, I ${allStageCounts.STAGE_I || 0}, III ${allStageCounts.STAGE_III || 0}, IV ${allStageCounts.STAGE_IV || 0}, Review ${allStageCounts.REVIEW || 0}`,
 active: false,
 progress: 100,
 scanned: results.length,
 total: universe.length,
 stageCounts: counts,
 allStageCounts,
 stageTransitions: lifecycle.transitions,
 skipped,
 diagnostics,
 lastScanTs: stageNow(),
 ts: stageNow(),
 },
 stageLastScanTs: stageNow(),
 });
 stageLog(`scan done: ${output.length} results`);
 return output;
 }

 async function runStageScanFromContext(context) {
 if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) throw new Error('Strategy registry not loaded');
 if (!context?.scanId) throw new Error('Fresh main scan context is required');
 await stageSetStatus('Deriving Stage rows from main scan...', { active: true, progress: 5, scanId: context.scanId });
 await chrome.storage.local.set({ 'strategyResults.stage': [] });
 const settings = await stageLoadSettings();
 const tickerMap = context.tickerMap || {};
 const products = Array.isArray(context.products) ? context.products : [];
 const diagnostics = stageUniverseDiagnostics(tickerMap, products, settings);
 const universe = stageBuildUniverse(tickerMap, products, settings);
 diagnostics.universeRows = universe.length;
 const getContextCandles = globalThis.FWDTradeDeskScanContext?.getCandles;
 const results = [];
 const skipped = { insufficientHistory: 0, review: 0, lowAverageLiquidity: 0, fetchErrors: 0, noContextCandles: 0 };
 for (let i = 0; i < universe.length; i += 1) {
 const item = universe[i];
 if (i % 10 === 0 || i === universe.length - 1) {
 await stageSetStatus(`Deriving ${item.symbol} (${i + 1}/${universe.length})`, {
 active: true,
 progress: Math.round(8 + (i / Math.max(1, universe.length)) * 86),
 scanned: i + 1,
 total: universe.length,
 scanId: context.scanId,
 });
 }
 try {
 const safeCandles = getContextCandles?.(context, item.symbol, '1d', settings.preferredDailyCandles) || [];
 if (!safeCandles.length) {
 skipped.noContextCandles += 1;
 continue;
 }
 if (safeCandles.length < Number(settings.minWeeklyCandles || 42) * 5) skipped.insufficientHistory += 1;
 const result = stageAnalyzeSymbol(item.symbol, safeCandles, item.ticker, settings);
 if (!result.symbol) continue;
 if (result.stage === 'REVIEW') skipped.review += 1;
 const avgQuoteVolume20 = Number(result.raw?.stageMetrics?.avgQuoteVolume20 || 0);
 if (avgQuoteVolume20 && avgQuoteVolume20 < Number(settings.minAvgQuoteVolume20 || 0)) {
 skipped.lowAverageLiquidity += 1;
 result.reasons = [...(result.reasons || []), 'Average liquidity below stage threshold'];
 result.checks = { ...(result.checks || {}), avgLiquidityPassed: false };
 result.raw = { ...(result.raw || {}), stageDiagnostics: { lowAverageLiquidity: true } };
 } else {
 result.checks = { ...(result.checks || {}), avgLiquidityPassed: true };
 }
 results.push(result);
 } catch (error) {
 skipped.fetchErrors += 1;
 stageLog(`${item.symbol} derive skipped: ${error?.message || error}`);
 }
 }
 const lifecycle = await stageUpdateLifecycleState(results);
 const sortedResults = stageSortRows(lifecycle.results);
 const output = sortedResults.slice(0, Math.max(20, Number(settings.outputLimit || STAGE_DEFAULT_SETTINGS.outputLimit)));
 const counts = stageCounts(output);
 const allStageCounts = stageCounts(results);
 await chrome.storage.local.set({
 'strategyResults.stage': output,
 'strategyStatus.stage': {
 strategyId: 'stage',
 status: `Derived - ${output.length} Stage rows from main scan | II ${allStageCounts.STAGE_II || 0}, I ${allStageCounts.STAGE_I || 0}, III ${allStageCounts.STAGE_III || 0}`,
 active: false,
 progress: 100,
 scanned: results.length,
 total: universe.length,
 stageCounts: counts,
 allStageCounts,
 stageTransitions: lifecycle.transitions,
 skipped,
 diagnostics,
 source: 'main_scan_context',
 scanId: context.scanId,
 lastScanTs: stageNow(),
 ts: stageNow(),
 },
 stageLastScanTs: stageNow(),
 });
 return output;
 }

 function getStageSnapshot(callback) {
 chrome.storage.local.get([
 'strategyResults.stage',
 'strategyStatus.stage',
 'strategySettings.stage',
 ], data => {
 callback({
 ok: true,
 stage: {
 results: Array.isArray(data['strategyResults.stage']) ? data['strategyResults.stage'] : [],
 status: data['strategyStatus.stage'] || {},
 settings: data['strategySettings.stage'] || STAGE_DEFAULT_SETTINGS,
 },
 });
 });
 }

 chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
 if (typeof isTrustedRuntimeSender === 'function' && !isTrustedRuntimeSender(sender)) {
 sendResponse({ ok: false, error: 'Unauthorized sender' });
 return false;
 }
 if (msg?.action === 'stage:startScan') {
 const context = globalThis.FWDTradeDeskScanContext?.getFresh?.();
 const runner = context ? () => runStageScanFromContext(context) : (msg?.forceIndependent === true ? runStageScan : null);
 if (!runner) {
 stageSetStatus('Run main scan first - Stage will derive from shared scan data', { active: false, progress: 0 })
 .finally(() => sendResponse({ ok: false, error: 'Run main scan first' }));
 return true;
 }
 runner()
 .then(results => sendResponse({ ok: true, count: results.length }))
 .catch(async error => {
 await stageSetStatus(`Stage scan failed - ${error?.message || error}`, { active: false, progress: 0 });
 sendResponse({ ok: false, error: error?.message || String(error) });
 });
 return true;
 }
 if (msg?.action === 'stage:getResults') {
 getStageSnapshot(sendResponse);
 return true;
 }
 if (msg?.action === 'stage:clearResults') {
 chrome.storage.local.set({
 'strategyResults.stage': [],
 'strategyStatus.stage': { strategyId: 'stage', status: 'Stage results cleared', active: false, progress: 0, ts: stageNow() },
 }, () => sendResponse({ ok: true }));
 return true;
 }
 return false;
 });

 global.FWDTradeDeskStageScanner = Object.freeze({
 STAGE_DEFAULT_SETTINGS,
 stageBuildWeeklyCandles,
 stageBuildMetrics,
 stageScoreMetrics,
 stageClassify,
 stageAnalyzeSymbol,
 stageCounts,
 stageSortRows,
 stageUniverseDiagnostics,
 stageRuleEvidence,
 stageUpdateLifecycleState,
 runStageScan,
 runStageScanFromContext,
 });
})(globalThis);
