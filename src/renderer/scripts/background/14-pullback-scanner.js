'use strict';

(function initPullbackScanner(global) {
 const PULLBACK_DEFAULT_SETTINGS = Object.freeze({
  maxCoins: 500,
  outputLimit: 500,
  minUsdVolume24h: 100000,
  preferredDailyCandles: 140,
  minDailyCandles: 45,
  preferredIntradayCandles: 96,
  minIntradayCandles: 24,
  touchLookback: 6,
  emaTouchTolerancePct: 1.4,
  reclaimLookback: 4,
  maxEntryExtensionPct: 3.2,
  maxWatchExtensionPct: 5.5,
  maxEntryExtensionAtr: 1.35,
  maxWatchExtensionAtr: 2.25,
  freshEntryExtensionPct: 1.4,
  roundNumberTolerancePct: 1.3,
  stopAtrBuffer: 0.18,
  minDailyBodyRatio: 0.28,
  minDailyClosePosition: 0.58,
  minIntradayBodyRatio: 0.38,
  minIntradayClosePosition: 0.62,
 });

 const CLOSED_4H = Object.freeze({ closedOnly: true, timeoutMs: 30000, paceMs: 1800 });
 const CLOSED_DAILY = Object.freeze({ closedOnly: true, timeoutMs: 30000, paceMs: 1800 });

 function pullbackNow() { return Date.now(); }

 function pullbackLog(message) {
  if (typeof global.dlog === 'function') global.dlog(`[PULLBACK] ${message}`);
  else console.log(`[PULLBACK] ${message}`);
 }

 function pullbackRound(value, decimals = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const m = 10 ** decimals;
  return Math.round(n * m) / m;
 }

 function pullbackSma(values = [], period = 20, endIndex = values.length - 1) {
  if (!Array.isArray(values) || period <= 0 || endIndex < period - 1) return null;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i += 1) {
   const value = Number(values[i]);
   if (!Number.isFinite(value)) return null;
   sum += value;
  }
  return sum / period;
 }

 function pullbackEmaSeries(values = [], period = 20) {
  const nums = (Array.isArray(values) ? values : []).map(Number);
  const out = new Array(nums.length).fill(null);
  if (period <= 0 || nums.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i += 1) {
   if (!Number.isFinite(nums[i])) return out;
   seed += nums[i];
  }
  let value = seed / period;
  out[period - 1] = value;
  const k = 2 / (period + 1);
  for (let i = period; i < nums.length; i += 1) {
   if (!Number.isFinite(nums[i])) continue;
   value = nums[i] * k + value * (1 - k);
   out[i] = value;
  }
  return out;
 }

 function pullbackAtr(candles = [], period = 14) {
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
  return pullbackSma(trs, period) || 0;
 }

 function pullbackQuoteVolume(candle = {}) {
  const quoteVolume = Number(candle.quote_volume ?? candle.quoteVolume ?? candle.turnover ?? candle.turnover_usd ?? 0);
  if (Number.isFinite(quoteVolume) && quoteVolume > 0) return quoteVolume;
  const volume = Number(candle.volume || 0);
  const close = Number(candle.close || 0);
  return volume > 0 && close > 0 ? volume * close : 0;
 }

 function pullbackPct(now = 0, prev = 0) {
  const a = Number(now || 0);
  const b = Number(prev || 0);
  if (!(a > 0) || !(b > 0)) return 0;
  return ((a - b) / b) * 100;
 }

 function pullbackClamp(value = 0, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
 }

 function pullbackCandleShape(candle = {}, isShort = false) {
  const open = Number(candle.open || 0);
  const high = Number(candle.high || 0);
  const low = Number(candle.low || 0);
  const close = Number(candle.close || 0);
  const range = high > low ? high - low : 0;
  const body = Math.abs(close - open);
  const closePosition = range > 0
   ? isShort ? (high - close) / range : (close - low) / range
   : 0;
  return {
   open,
   high,
   low,
   close,
   range,
   bodyRatio: range > 0 ? body / range : 0,
   closePosition: pullbackClamp(closePosition, 0, 1),
   directional: isShort ? close < open : close > open,
  };
 }

 function pullbackDailyProof(candle = {}, isShort = false, ema9 = 0, atr14 = 0, settings = PULLBACK_DEFAULT_SETTINGS, context = {}) {
  const shape = pullbackCandleShape(candle, isShort);
  const closeThroughLevel = isShort ? shape.close < ema9 : shape.close > ema9;
  const touchedLevel = isShort ? shape.high >= ema9 : shape.low <= ema9;
  const recentTouch = touchedLevel || context.touchedRecently === true;
  const closeQuality = shape.closePosition >= Number(settings.minDailyClosePosition || 0.58);
  const bodyQuality = shape.bodyRatio >= Number(settings.minDailyBodyRatio || 0.28);
  const atrParticipation = Number(atr14 || 0) > 0 ? shape.range / Number(atr14 || 1) : 0;
  const clean = closeThroughLevel && recentTouch && closeQuality && (bodyQuality || shape.directional);
  const label = clean
   ? isShort ? 'Clean daily rejection' : 'Clean daily reclaim'
   : closeThroughLevel
   ? isShort ? 'Close below 9 EMA, candle weak' : 'Close above 9 EMA, candle weak'
   : isShort ? 'No daily 9 EMA rejection close' : 'No daily 9 EMA reclaim close';
  return {
   clean,
   label,
   closeThroughLevel,
   touchedLevel,
   recentTouch,
   closePosition: pullbackRound(shape.closePosition * 100, 0),
   bodyRatio: pullbackRound(shape.bodyRatio * 100, 0),
   atrParticipation: pullbackRound(atrParticipation, 2),
  };
 }

 function pullbackVwap(candles = []) {
  let pv = 0;
  let vol = 0;
  (Array.isArray(candles) ? candles : []).forEach(candle => {
   const high = Number(candle?.high || 0);
   const low = Number(candle?.low || 0);
   const close = Number(candle?.close || 0);
   const volume = Number(candle?.volume || 0);
   if (!(high > 0) || !(low > 0) || !(close > 0) || !(volume > 0)) return;
   pv += ((high + low + close) / 3) * volume;
   vol += volume;
  });
  return vol > 0 ? pv / vol : 0;
 }

 function pullbackRangeMin(rows = [], key = 'low') {
  const values = (Array.isArray(rows) ? rows : []).map(row => Number(row?.[key] || 0)).filter(value => value > 0);
  return values.length ? Math.min(...values) : 0;
 }

 function pullbackRangeMax(rows = [], key = 'high') {
  const values = (Array.isArray(rows) ? rows : []).map(row => Number(row?.[key] || 0)).filter(value => value > 0);
  return values.length ? Math.max(...values) : 0;
 }

 function pullbackAnalyzeIntradayTiming(intradayCandles = [], context = {}) {
  const settings = { ...PULLBACK_DEFAULT_SETTINGS, ...(context.settings || {}) };
  const rows = (Array.isArray(intradayCandles) ? intradayCandles : []).filter(candle => Number(candle?.close || 0) > 0);
  const isShort = context.direction === 'short';
  if (rows.length < Number(settings.minIntradayCandles || 24)) {
   return {
    state: 'no_4h',
    label: 'No 4H timing',
    ready: false,
    scoreDelta: -8,
    confirmations: [],
    blockers: ['Not enough 4H candles for entry timing'],
   };
  }
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2] || {};
  const closes = rows.map(candle => Number(candle.close || 0));
  const ema9s = pullbackEmaSeries(closes, 9);
  const ema21s = pullbackEmaSeries(closes, 21);
  const ema9 = Number(ema9s[ema9s.length - 1] || 0);
  const ema21 = Number(ema21s[ema21s.length - 1] || 0);
  const vwap = pullbackVwap(rows.slice(-Math.min(48, rows.length)));
  const atr15 = pullbackAtr(rows, 14);
  const shape = pullbackCandleShape(last, isShort);
  const priorRows = rows.slice(Math.max(0, rows.length - 9), Math.max(0, rows.length - 1));
  const priorLow = pullbackRangeMin(priorRows, 'low');
  const priorHigh = pullbackRangeMax(priorRows, 'high');
  const higherLow = !isShort && priorLow > 0 && Number(last.low || 0) >= priorLow * 0.997;
  const lowerHigh = isShort && priorHigh > 0 && Number(last.high || 0) <= priorHigh * 1.003;
  const close = Number(last.close || 0);
  const prevClose = Number(prev.close || 0);
  const emaAligned = isShort
   ? close < ema9 && (!ema21 || ema9 <= ema21 * 1.003)
   : close > ema9 && (!ema21 || ema9 >= ema21 * 0.997);
  const vwapAligned = vwap > 0 ? (isShort ? close < vwap : close > vwap) : true;
  const triggerCandle = shape.closePosition >= Number(settings.minIntradayClosePosition || 0.62)
   && shape.bodyRatio >= Number(settings.minIntradayBodyRatio || 0.38)
   && shape.directional;
  const reclaimOrReject = isShort
   ? close < ema9 && (prevClose >= ema9 || close < Number(prev.low || close))
   : close > ema9 && (prevClose <= ema9 || close > Number(prev.high || close));
  const structureOk = isShort ? lowerHigh : higherLow;
  const ready = !!(emaAligned && vwapAligned && triggerCandle && (structureOk || reclaimOrReject));
  const confirmations = [
   emaAligned ? (isShort ? '4H below 9 EMA' : '4H above 9 EMA') : '',
   vwapAligned ? (isShort ? '4H below VWAP' : '4H above VWAP') : '',
   triggerCandle ? (isShort ? 'Clean 4H rejection candle' : 'Clean 4H reclaim candle') : '',
   structureOk ? (isShort ? 'Lower-high structure' : 'Higher-low structure') : '',
  ].filter(Boolean);
  const blockers = [
   !emaAligned ? (isShort ? '4H not below 9 EMA yet' : '4H not above 9 EMA yet') : '',
   !vwapAligned ? (isShort ? '4H not below VWAP yet' : '4H not above VWAP yet') : '',
   !triggerCandle ? (isShort ? 'Need clean 4H rejection candle' : 'Need clean 4H reclaim candle') : '',
   !structureOk && !reclaimOrReject ? (isShort ? 'Need lower-high or breakdown proof' : 'Need higher-low or breakout proof') : '',
  ].filter(Boolean);
  const trigger = isShort
   ? Math.min(Number(last.low || close), ema9 || close, vwap || close)
   : Math.max(Number(last.high || close), ema9 || close, vwap || close);
  return {
   state: ready ? 'entry_ready' : 'setup_wait_trigger',
   label: ready ? (isShort ? '4H short trigger ready' : '4H long trigger ready') : 'Wait 4H trigger',
   ready,
   scoreDelta: ready ? 12 : -4,
   confirmations,
   blockers,
   triggerPrice: pullbackRound(trigger, 8),
   ema9: pullbackRound(ema9, 8),
   ema21: pullbackRound(ema21, 8),
   vwap: pullbackRound(vwap, 8),
   atr15: pullbackRound(atr15, 8),
   closePosition: pullbackRound(shape.closePosition * 100, 0),
   bodyRatio: pullbackRound(shape.bodyRatio * 100, 0),
   structureOk,
  };
 }

 function pullbackMarketRegimeRead(marketIndex = null, direction = 'long') {
  if (!marketIndex || typeof marketIndex !== 'object') {
   return {
    state: 'unknown',
    label: 'Market unknown',
    fit: true,
    supportive: false,
    scoreDelta: 0,
    blockers: [],
    confirmations: ['Market regime unavailable; do not treat as confirmation'],
   };
  }
  const condition = String(marketIndex.condition || marketIndex.sentiment?.condition || '').toLowerCase();
  const label = marketIndex.sentiment?.label || marketIndex.label || condition || 'Market mixed';
  const changePct = Number(marketIndex.indexChangePct ?? marketIndex.scanChangePct ?? 0);
  const sentimentScore = Number(marketIndex.sentiment?.score ?? marketIndex.sentimentScore ?? 0);
  const breadthPct = Number(marketIndex.sentiment?.breadthPct ?? marketIndex.breadth?.breadthPct ?? 50);
  const leadership = String(marketIndex.leadership?.state || '').toLowerCase();
  const isShort = direction === 'short';
  const longSupport = ['bull', 'euphoric'].includes(condition) || sentimentScore >= 12 || changePct >= 0.35 || breadthPct >= 54 || ['broad_risk_on', 'eth_alt'].includes(leadership);
  const shortSupport = ['bear', 'crash'].includes(condition) || sentimentScore <= -12 || changePct <= -0.35 || breadthPct <= 46 || leadership === 'broad_risk_off';
  const longAgainst = ['bear', 'crash'].includes(condition) || sentimentScore <= -18 || changePct <= -0.65 || leadership === 'broad_risk_off';
  const shortAgainst = ['bull', 'euphoric'].includes(condition) || sentimentScore >= 18 || changePct >= 0.65 || ['broad_risk_on', 'eth_alt'].includes(leadership);
  const supportive = isShort ? shortSupport : longSupport;
  const against = isShort ? shortAgainst : longAgainst;
  const state = against ? 'against' : supportive ? 'aligned' : 'neutral';
  const fit = !against;
  const confirmations = [
   supportive ? `${isShort ? 'Short' : 'Long'} side has market support` : '',
   condition ? `Condition ${condition}` : '',
   Number.isFinite(changePct) ? `FWD index ${pullbackRound(changePct, 2)}%` : '',
  ].filter(Boolean);
  return {
   state,
   label: state === 'against' ? `${label} against ${isShort ? 'short' : 'long'}` : label,
   fit,
   supportive,
   scoreDelta: state === 'aligned' ? 6 : state === 'against' ? -18 : 0,
   condition,
   changePct: pullbackRound(changePct, 2),
   sentimentScore: pullbackRound(sentimentScore, 0),
   breadthPct: pullbackRound(breadthPct, 1),
   leadership,
   confirmations,
   blockers: against ? [`Market regime is against the ${isShort ? 'short' : 'long'} pullback`] : [],
  };
 }

 function pullbackObv(candles = []) {
  let obv = 0;
  return (Array.isArray(candles) ? candles : []).map((candle, index, rows) => {
   if (!index) return obv;
   const close = Number(candle?.close || 0);
   const prev = Number(rows[index - 1]?.close || 0);
   const volume = Number(candle?.volume || 0);
   if (close > prev) obv += volume;
   else if (close < prev) obv -= volume;
   return obv;
  });
 }

 function pullbackRoundSupport(price = 0) {
  const value = Number(price || 0);
  if (!(value > 0)) return 0;
  const pow = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10].map(step => step * pow);
  let best = steps[0];
  steps.forEach(step => {
   const level = Math.round(value / step) * step;
   if (level > 0 && Math.abs(level - value) < Math.abs(best - value)) best = level;
  });
  return best;
 }

 function pullbackLoadStored(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
 }

 async function pullbackSetStatus(status, extra = {}) {
  await chrome.storage.local.set({
   'strategyStatus.pullback': {
    strategyId: 'pullback',
    status,
    ts: pullbackNow(),
    ...extra,
   },
  });
 }

async function pullbackLoadSettings() {
 const stored = await pullbackLoadStored(['strategySettings.pullback']);
  const settings = {
   ...PULLBACK_DEFAULT_SETTINGS,
   ...(stored['strategySettings.pullback'] || {}),
  };
  settings.maxCoins = Math.max(PULLBACK_DEFAULT_SETTINGS.maxCoins, Number(settings.maxCoins || 0));
  settings.outputLimit = Math.max(PULLBACK_DEFAULT_SETTINGS.outputLimit, Number(settings.outputLimit || 0));
  return settings;
 }

 function pullbackBuildUniverse(tickerMap = {}, products = [], settings = PULLBACK_DEFAULT_SETTINGS) {
  const productSymbols = new Set((Array.isArray(products) ? products : []).map(item => String(item.symbol || '').toUpperCase()));
  return Object.entries(tickerMap || {})
  .filter(([symbol, ticker]) => {
   const sym = String(symbol || '').toUpperCase();
 if (!sym || productSymbols.size && !productSymbols.has(sym)) return false;
 if (!(Number(ticker?.price || 0) > 0)) return false;
   const turnover = Number(ticker?.inrTurnover24h || ticker?.turnover24h || ticker?.usdVol24h || 0);
   return !(turnover > 0) || turnover >= Number(settings.minUsdVolume24h || 0);
  })
  .map(([symbol, ticker]) => ({ symbol: String(symbol || '').toUpperCase(), ticker }))
  .sort((a, b) => Number(b.ticker?.usdVol24h || 0) - Number(a.ticker?.usdVol24h || 0))
  .slice(0, Math.max(20, Number(settings.maxCoins || PULLBACK_DEFAULT_SETTINGS.maxCoins)));
 }

 function pullbackEventLabel(eventType = '') {
 const map = {
   ema_reclaim: '9 EMA Reclaim',
   ema_pullback: '9 EMA Pullback',
   round_support: 'Round Support Bounce',
   trend_watch: 'Trend Pullback Watch',
   ema_reject_short: '9 EMA Rejection Short',
   ema_pullback_short: '9 EMA Short Pullback',
   round_resistance_short: 'Round Resistance Reject',
   trend_watch_short: 'Downtrend Pullback Watch',
   avoid_chase: 'Avoid Chase',
   review: 'Review',
  };
  return map[eventType] || 'Pullback Review';
 }

 function pullbackBuildScoreParts(parts = {}) {
  const rows = [
   ['Trend stack', Number(parts.trend || 0)],
   ['9 EMA touch', Number(parts.touch || 0)],
   ['Reclaim/reject proof', Number(parts.reclaim || 0)],
   ['Daily candle proof', Number(parts.candleProof || 0)],
   ['4H timing trigger', Number(parts.intradayTiming || 0)],
   ['Market regime', Number(parts.marketRegime || 0)],
   ['OBV confirmation', Number(parts.obv || 0)],
   ['Risk reward', Number(parts.riskReward || 0)],
   ['Round support', Number(parts.roundSupport || 0)],
   ['Market penalty', Number(parts.marketPenalty || 0)],
   ['Extension penalty', Number(parts.extensionPenalty || 0)],
   ['Liquidity penalty', Number(parts.liquidityPenalty || 0)],
  ].filter(([, value]) => value !== 0);
  return {
   rows: rows.map(([label, value]) => ({ label, value: pullbackRound(value, 0) })),
   total: pullbackRound(rows.reduce((sum, [, value]) => sum + value, 0), 0),
  };
 }

 function pullbackSignalCounts(results = []) {
  return (Array.isArray(results) ? results : []).reduce((acc, row) => {
   const eventType = String(row?.eventType || row?.raw?.eventType || 'review');
   if (row.signal === 'BUY') acc.buy += 1;
   else if (row.signal === 'SELL') acc.sell += 1;
   else if (row.signal === 'WATCHLIST') acc.watch += 1;
   else acc.avoid += 1;
   if (String(row?.direction || row?.raw?.direction || '').toLowerCase() === 'short') acc.short += 1;
   else if (String(row?.direction || row?.raw?.direction || '').toLowerCase() === 'long') acc.long += 1;
   acc[eventType] = (acc[eventType] || 0) + 1;
   return acc;
  }, { buy: 0, sell: 0, watch: 0, avoid: 0, long: 0, short: 0, ema_reclaim: 0, ema_pullback: 0, round_support: 0, trend_watch: 0, ema_reject_short: 0, ema_pullback_short: 0, round_resistance_short: 0, trend_watch_short: 0, avoid_chase: 0, review: 0 });
 }

 function pullbackSortRows(results = []) {
  const rank = { ema_reclaim: 6, ema_reject_short: 6, round_support: 5, round_resistance_short: 5, ema_pullback: 4, ema_pullback_short: 4, trend_watch: 3, trend_watch_short: 3, review: 1, avoid_chase: 0 };
  const workflowRank = { entry_ready: 8, daily_setup_wait_trigger: 6, near_pullback_wait_proof: 4, trend_watch: 3, review: 1, avoid_late: 0 };
  return (Array.isArray(results) ? results : []).slice().sort((a, b) => {
   const ar = rank[String(a.eventType || a.raw?.eventType || '')] ?? 0;
   const br = rank[String(b.eventType || b.raw?.eventType || '')] ?? 0;
   const aw = workflowRank[String(a.raw?.workflowStage || '')] ?? 0;
   const bw = workflowRank[String(b.raw?.workflowStage || '')] ?? 0;
   return bw - aw || br - ar || Number(b.score || 0) - Number(a.score || 0) || Number(a.raw?.extensionPct || 999) - Number(b.raw?.extensionPct || 999);
  });
 }

 function pullbackAnalyzeSymbol(symbol, dailyCandles = [], intradayCandles = [], ticker = {}, ctx = {}) {
  const settings = { ...PULLBACK_DEFAULT_SETTINGS, ...(ctx.settings || {}) };
  const daily = (Array.isArray(dailyCandles) ? dailyCandles : []).filter(candle => Number(candle?.close || 0) > 0);
  const intraday = (Array.isArray(intradayCandles) ? intradayCandles : []).filter(candle => Number(candle?.close || 0) > 0);
  const last = daily[daily.length - 1] || {};
  const prev = daily[daily.length - 2] || {};
  const price = Number(ticker?.price || intraday[intraday.length - 1]?.close || last.close || 0);
  const closes = daily.map(candle => Number(candle.close || 0));
  const highs = daily.map(candle => Number(candle.high || candle.close || 0));
  const lows = daily.map(candle => Number(candle.low || candle.close || 0));
  const ema9s = pullbackEmaSeries(closes, 9);
  const ema21s = pullbackEmaSeries(closes, 21);
  const ema50s = pullbackEmaSeries(closes, 50);
  const lastIndex = daily.length - 1;
  const ema9 = Number(ema9s[lastIndex] || 0);
  const ema21 = Number(ema21s[lastIndex] || 0);
  const ema50 = Number(ema50s[lastIndex] || 0);
  const ema9Prev = Number(ema9s[Math.max(0, lastIndex - 5)] || 0);
  const ema21Prev = Number(ema21s[Math.max(0, lastIndex - 8)] || 0);
  const atr14 = pullbackAtr(daily, 14);
  const obv = pullbackObv(daily);
  const obvNow = Number(obv[lastIndex] || 0);
  const obvPrev = Number(obv[Math.max(0, lastIndex - 10)] || 0);
  const volumes = daily.map(pullbackQuoteVolume);
  const avgVolume20 = pullbackSma(volumes, 20, Math.max(0, volumes.length - 2)) || 0;
  const tickerTurnover = Number(ticker?.inrTurnover24h || ticker?.turnover24h || ticker?.usdVol24h || 0);
  const latestQuoteVolume = pullbackQuoteVolume(last) || tickerTurnover / 24 || 0;
  const volumeRatio = avgVolume20 > 0 ? latestQuoteVolume / avgVolume20 : 0;
  const lowLiquidity = tickerTurnover > 0 && tickerTurnover < Number(settings.minUsdVolume24h || 0);
  const trendUp = price > ema21 && ema9 > ema21 && (!ema50 || ema21 >= ema50 * 0.97) && ema9 > ema9Prev && ema21 >= ema21Prev * 0.985;
  const trendDown = price < ema21 && ema9 < ema21 && (!ema50 || ema21 <= ema50 * 1.03) && ema9 < ema9Prev && ema21 <= ema21Prev * 1.015;
  const shortBias = trendDown && !trendUp;
  const direction = shortBias ? 'short' : 'long';
  const obvUp = obvNow >= obvPrev;
  const obvDown = obvNow <= obvPrev;
  const touchRows = [];
  const lookback = Math.max(2, Number(settings.touchLookback || 6));
  for (let i = Math.max(0, daily.length - lookback); i < daily.length; i += 1) {
   const ema = Number(ema9s[i] || 0);
   if (!(ema > 0)) continue;
   const low = Number(lows[i] || 0);
   const high = Number(highs[i] || 0);
   const close = Number(closes[i] || 0);
   const touched = low <= ema * (1 + Number(settings.emaTouchTolerancePct || 1.4) / 100) && high >= ema * (1 - Number(settings.emaTouchTolerancePct || 1.4) / 100);
   const undercut = low < ema && close >= ema * 0.995;
   if (touched || undercut) touchRows.push({ index: i, candle: daily[i], ema, low, high, close, touched, undercut });
  }
  const lastTouch = touchRows[touchRows.length - 1] || null;
  const touchedRecently = !!lastTouch;
  const undercutRecently = touchRows.some(row => row.undercut || Number(row.close || 0) < Number(row.ema || 0));
  const overcutRecently = touchRows.some(row => Number(row.high || 0) > Number(row.ema || 0) || Number(row.close || 0) > Number(row.ema || 0));
  const dailyProof = pullbackDailyProof(last, shortBias, ema9, atr14, settings, { touchedRecently });
  const rawReclaim = touchedRecently && price > ema9 && (Number(last.close || price) > ema9 || Number(prev.close || 0) < Number(ema9s[lastIndex - 1] || 0));
  const rawReject = touchedRecently && price < ema9 && (Number(last.close || price) < ema9 || Number(prev.close || 0) > Number(ema9s[lastIndex - 1] || 0));
  const reclaim = rawReclaim && dailyProof.clean;
  const reject = rawReject && dailyProof.clean;
  const recentHigh20 = Math.max(...highs.slice(Math.max(0, highs.length - 22), Math.max(0, highs.length - 1)).filter(value => value > 0), 0);
  const recentLow20 = Math.min(...lows.slice(Math.max(0, lows.length - 22), Math.max(0, lows.length - 1)).filter(value => value > 0));
  const extensionPct = ema9 > 0 ? pullbackPct(price, ema9) : 0;
  const shortExtensionPct = ema9 > 0 ? pullbackPct(ema9, price) : 0;
  const activeExtensionPct = Math.max(0, shortBias ? shortExtensionPct : extensionPct);
  const directionalExtension = shortBias ? Math.max(0, ema9 - price) : Math.max(0, price - ema9);
  const extensionAtr = atr14 > 0 ? directionalExtension / atr14 : 0;
  const entryFresh = activeExtensionPct <= Number(settings.freshEntryExtensionPct || 1.4) && extensionAtr <= 0.75;
  const lateEntry = activeExtensionPct > Number(settings.maxEntryExtensionPct || 3.2) || extensionAtr > Number(settings.maxEntryExtensionAtr || 1.35);
  const veryLateEntry = activeExtensionPct > Number(settings.maxWatchExtensionPct || 5.5) || extensionAtr > Number(settings.maxWatchExtensionAtr || 2.25);
  const timingRead = pullbackAnalyzeIntradayTiming(intraday, { direction, settings });
  const marketRead = pullbackMarketRegimeRead(ctx.marketIndex, direction);
  const roundSupport = pullbackRoundSupport(shortBias ? (lastTouch?.high || Number(last.high || 0) || price) : (lastTouch?.low || Number(last.low || 0) || price));
  const roundSupportDistancePct = roundSupport > 0 ? Math.abs(((Number(shortBias ? (lastTouch?.high || last.high || price) : (lastTouch?.low || last.low || price)) - roundSupport) / roundSupport) * 100) : 999;
  const roundSupportHit = roundSupport > 0 && roundSupportDistancePct <= Number(settings.roundNumberTolerancePct || 1.3);
  const touchLow = Number(lastTouch?.low || last.low || price);
  const touchHigh = Number(lastTouch?.high || last.high || price);
  const stop = shortBias
   ? Math.max(0, touchHigh + atr14 * Number(settings.stopAtrBuffer || 0.18))
   : Math.max(0, touchLow - atr14 * Number(settings.stopAtrBuffer || 0.18));
  const entry = shortBias ? (reject ? price : ema9) : (reclaim ? price : ema9);
  const risk = entry > 0 && stop > 0 ? (shortBias ? stop - entry : entry - stop) : 0;
  const target1 = shortBias
   ? (Number.isFinite(recentLow20) && recentLow20 > 0 && recentLow20 < entry ? recentLow20 : entry - risk * 2)
   : (recentHigh20 > entry ? recentHigh20 : entry + risk * 2);
  const target2 = shortBias ? entry - risk * 2 : entry + risk * 2;
  const target3 = shortBias ? entry - risk * 3 : entry + risk * 3;
  const rrToTarget1 = risk > 0 ? (shortBias && target1 < entry ? (entry - target1) / risk : !shortBias && target1 > entry ? (target1 - entry) / risk : 0) : 0;
  const scoreParts = {};
  const reasons = [];
  const blockers = [];
  if (shortBias) { scoreParts.trend = 22; reasons.push('Trend stack is down: price below 21 EMA and 9 EMA below 21 EMA'); }
  else if (trendUp) { scoreParts.trend = 22; reasons.push('Trend stack is up: price above 21 EMA and 9 EMA above 21 EMA'); }
  else blockers.push('Trend stack is not strong enough for a pullback setup');
  if (touchedRecently) { scoreParts.touch = 20; reasons.push(shortBias ? 'Price recently rallied into the 9 EMA' : 'Price recently touched or undercut the 9 EMA'); }
  else blockers.push('No recent 9 EMA touch');
  if (shortBias && reject) { scoreParts.reclaim = 18; reasons.push('Price rejected the 9 EMA after the pullback rally'); }
  else if (!shortBias && reclaim) { scoreParts.reclaim = 18; reasons.push('Price reclaimed the 9 EMA after the pullback'); }
  else if (touchedRecently && (rawReject || rawReclaim)) blockers.push(dailyProof.label);
  else if (touchedRecently) blockers.push(shortBias ? 'Wait for a close back below the 9 EMA' : 'Wait for a close back above the 9 EMA');
  if (shortBias ? obvDown : obvUp) { scoreParts.obv = 10; reasons.push(shortBias ? 'OBV is confirming distribution' : 'OBV is supporting the trend'); }
  else blockers.push(shortBias ? 'OBV is not confirming distribution' : 'OBV is not confirming accumulation');
  if (rrToTarget1 >= 1.4) scoreParts.riskReward = rrToTarget1 >= 2 ? 12 : 8;
  else blockers.push('Reward is not strong enough from current price');
  if (roundSupportHit) { scoreParts.roundSupport = 8; reasons.push(shortBias ? `Rally rejected round/resistance area near ${pullbackRound(roundSupport, 8)}` : `Pullback respected round/support area near ${pullbackRound(roundSupport, 8)}`); }
  if (dailyProof.clean) { scoreParts.candleProof = 10; reasons.push(dailyProof.label); }
  else if (touchedRecently) blockers.push(shortBias ? 'Daily rejection candle is not clean yet' : 'Daily reclaim candle is not clean yet');
  if (timingRead.ready) { scoreParts.intradayTiming = 12; reasons.push(timingRead.label); }
  else if (touchedRecently) blockers.push(timingRead.blockers[0] || 'Wait for 4H timing trigger');
  if (marketRead.supportive) { scoreParts.marketRegime = 6; reasons.push(marketRead.confirmations[0] || 'Market regime supports pullback side'); }
  if (!marketRead.fit) { scoreParts.marketPenalty = -18; blockers.push(marketRead.blockers[0] || 'Market regime is against this setup'); }
  if (!entryFresh && touchedRecently) blockers.push(`${shortBias ? 'Short' : 'Long'} entry is not close to the 9 EMA sweet spot`);
  if (lateEntry) { scoreParts.extensionPenalty = -18; blockers.push(shortBias ? `Price is ${pullbackRound(activeExtensionPct, 2)}% / ${pullbackRound(extensionAtr, 2)} ATR below 9 EMA; do not chase short` : `Price is ${pullbackRound(activeExtensionPct, 2)}% / ${pullbackRound(extensionAtr, 2)} ATR above 9 EMA; do not chase`); }
  if (lowLiquidity) { scoreParts.liquidityPenalty = -16; blockers.push('Liquidity below pullback scanner threshold'); }

  let eventType = 'review';
  let signal = 'IGNORE';
  let actionLabel = 'Review manually';
  let priorityLabel = 'Review';
  const longDailySetup = !shortBias && trendUp && reclaim && !lowLiquidity && rrToTarget1 >= 1.2;
  const shortDailySetup = shortBias && reject && !lowLiquidity && rrToTarget1 >= 1.2;
  const rawDailySetup = !shortBias ? rawReclaim : rawReject;
  const dailySetup = longDailySetup || shortDailySetup;
  const entryReady = dailySetup && timingRead.ready && marketRead.fit && !lateEntry;
  if (veryLateEntry || lateEntry) {
   eventType = 'avoid_chase';
   signal = 'IGNORE';
   actionLabel = shortBias ? 'Avoid chasing short' : 'Avoid chasing';
   priorityLabel = shortBias ? 'Too far below 9 EMA' : 'Too far above 9 EMA';
  } else if (entryReady && shortBias) {
   eventType = roundSupportHit ? 'round_resistance_short' : 'ema_reject_short';
   signal = 'SELL';
   actionLabel = roundSupportHit ? 'Sell resistance reject now' : 'Sell 9 EMA reject now';
   priorityLabel = 'Entry ready';
  } else if (entryReady && !shortBias) {
   eventType = roundSupportHit ? 'round_support' : 'ema_reclaim';
   signal = 'BUY';
   actionLabel = roundSupportHit ? 'Buy support reclaim now' : 'Buy 9 EMA reclaim now';
   priorityLabel = 'Entry ready';
  } else if (shortDailySetup || longDailySetup) {
   eventType = shortBias
    ? (roundSupportHit ? 'round_resistance_short' : 'ema_reject_short')
    : (roundSupportHit ? 'round_support' : 'ema_reclaim');
   signal = 'WATCHLIST';
   actionLabel = !marketRead.fit
    ? 'Market against - wait'
    : timingRead.ready
    ? 'Setup valid - review manually'
    : 'Daily setup - wait 4H trigger';
   priorityLabel = !marketRead.fit ? 'Blocked by market' : 'Setup valid';
  } else if (rawDailySetup && touchedRecently && !lowLiquidity) {
   eventType = shortBias ? 'ema_pullback_short' : 'ema_pullback';
   signal = 'WATCHLIST';
   actionLabel = shortBias ? 'Wait clean daily rejection' : 'Wait clean daily reclaim';
   priorityLabel = 'Candle proof needed';
  } else if (shortBias && touchedRecently && !lowLiquidity) {
   eventType = 'ema_pullback_short';
   signal = 'WATCHLIST';
   actionLabel = 'Wait for 9 EMA rejection';
   priorityLabel = 'Short near entry';
  } else if (trendUp && touchedRecently && !lowLiquidity) {
   eventType = 'ema_pullback';
   signal = 'WATCHLIST';
   actionLabel = 'Wait for 9 EMA reclaim';
   priorityLabel = 'Near entry';
  } else if (shortBias && !lowLiquidity) {
   eventType = 'trend_watch_short';
   signal = 'WATCHLIST';
   actionLabel = 'Wait for short pullback';
   priorityLabel = 'Downtrend watch';
  } else if (trendUp && !lowLiquidity) {
   eventType = 'trend_watch';
   signal = 'WATCHLIST';
   actionLabel = 'Wait for pullback';
   priorityLabel = 'Trend watch';
  } else if (lateEntry) {
   eventType = 'avoid_chase';
   signal = 'IGNORE';
   actionLabel = shortBias ? 'Wait for next short pullback' : 'Wait for next pullback';
   priorityLabel = 'Late';
  }

  let score = 38 + Object.values(scoreParts).reduce((sum, value) => sum + Number(value || 0), 0);
  if (eventType === 'review') score = Math.min(score, 54);
  if (eventType === 'avoid_chase') score = Math.min(score, 48);
  score = Math.max(1, Math.min(96, Math.round(score)));

  const riskFlags = [
   lowLiquidity ? 'Thin volume' : '',
   !(shortBias || trendUp) ? 'Trend not clean' : '',
   shortBias && !reject && touchedRecently ? 'Needs clean 9 EMA rejection candle' : '',
   !shortBias && !reclaim && touchedRecently ? 'Needs clean reclaim candle' : '',
   dailySetup && !timingRead.ready ? '4H trigger not ready' : '',
   !marketRead.fit ? 'Market regime against setup' : '',
   lateEntry ? (shortBias ? 'Late below 9 EMA' : 'Late above 9 EMA') : '',
   rrToTarget1 > 0 && rrToTarget1 < 1.4 ? 'Weak reward from current price' : '',
  ].filter(Boolean);

  const workflowStage = eventType === 'avoid_chase'
   ? 'avoid_late'
   : entryReady
   ? 'entry_ready'
   : dailySetup
   ? 'daily_setup_wait_trigger'
   : touchedRecently
   ? 'near_pullback_wait_proof'
   : (shortBias || trendUp)
   ? 'trend_watch'
   : 'review';
  const workflowLabel = workflowStage === 'entry_ready'
   ? 'Entry ready now'
   : workflowStage === 'daily_setup_wait_trigger'
   ? 'Daily setup valid'
   : workflowStage === 'near_pullback_wait_proof'
   ? 'Near pullback'
   : workflowStage === 'avoid_late'
   ? 'Avoid late chase'
   : workflowStage === 'trend_watch'
   ? 'Trend watch'
   : 'Review';
  const tradePlan = {
   state: workflowStage,
   label: workflowLabel,
   entryCommand: entryReady
    ? shortBias
     ? `Sell below ${pullbackRound(timingRead.triggerPrice || entry, 8)} after 4H rejection`
     : `Buy above ${pullbackRound(timingRead.triggerPrice || entry, 8)} after 4H reclaim`
    : dailySetup
    ? shortBias ? 'Daily short setup valid - wait for 4H trigger' : 'Daily long setup valid - wait for 4H trigger'
    : eventType === 'avoid_chase'
    ? shortBias ? 'Do not short here; wait for a fresh 9 EMA rally' : 'Do not buy here; wait for a fresh 9 EMA pullback'
    : actionLabel,
   invalidation: shortBias ? `Invalid above ${pullbackRound(stop, 8)}` : `Invalid below ${pullbackRound(stop, 8)}`,
   target: pullbackRound(target1, 8),
   trigger: pullbackRound(timingRead.triggerPrice || entry, 8),
   entryFresh,
   lateEntry,
  };

  return global.FWDTradeDeskStrategies.normalizeStrategyResult({
   symbol,
   strategyId: 'pullback',
   signal,
   direction,
   setupLabel: pullbackEventLabel(eventType),
   eventType,
   actionLabel,
   priorityLabel,
   score,
   confidence: score,
   entry: pullbackRound(entry, 8),
   stop: pullbackRound(stop, 8),
   triggerPrice: pullbackRound(timingRead.triggerPrice || (shortBias ? (price < ema9 ? price : ema9) : (price > ema9 ? price : ema9)), 8),
   riskPercent: entry > 0 && risk > 0 ? pullbackRound((risk / entry) * 100, 2) : 0,
   targets: {
    target1: pullbackRound(target1, 8),
    target2R: pullbackRound(target2, 8),
    target3R: pullbackRound(target3, 8),
    previousHigh: pullbackRound(recentHigh20, 8),
    previousLow: pullbackRound(Number.isFinite(recentLow20) ? recentLow20 : 0, 8),
    ema9: pullbackRound(ema9, 8),
    ema21: pullbackRound(ema21, 8),
    roundSupport: pullbackRound(roundSupport, 8),
   },
   reasons: [...reasons, ...blockers].slice(0, 12),
   checks: {
    trendUp,
    trendDown,
    touchedRecently,
    undercutRecently,
    overcutRecently,
    reclaim,
    reject,
    rawReclaim,
    rawReject,
    cleanDailyCandle: dailyProof.clean,
    intradayReady: timingRead.ready,
    marketFit: marketRead.fit,
    entryFresh,
    obvUp: shortBias ? obvDown : obvUp,
    roundSupportHit,
    lateChase: lateEntry,
    lowLiquidity,
    advisoryOnly: true,
   },
   riskFlags,
   raw: {
    eventType,
    eventLabel: pullbackEventLabel(eventType),
    direction,
    workflowStage,
    workflowLabel,
    tradePlan,
    latestPrice: pullbackRound(price, 8),
    bestEntry: pullbackRound(entry, 8),
    idealPullback: pullbackRound(ema9, 8),
    stop: pullbackRound(stop, 8),
    ema9: pullbackRound(ema9, 8),
    ema21: pullbackRound(ema21, 8),
    ema50: pullbackRound(ema50, 8),
    ema9SlopePct: ema9Prev > 0 ? pullbackRound(pullbackPct(ema9, ema9Prev), 2) : 0,
    ema21SlopePct: ema21Prev > 0 ? pullbackRound(pullbackPct(ema21, ema21Prev), 2) : 0,
    extensionPct: pullbackRound(activeExtensionPct, 2),
    extensionAtr: pullbackRound(extensionAtr, 2),
    entryFresh,
    touchLow: pullbackRound(touchLow, 8),
    touchHigh: pullbackRound(touchHigh, 8),
    touchAge: lastTouch ? Math.max(0, daily.length - 1 - lastTouch.index) : null,
    roundSupport: pullbackRound(roundSupport, 8),
    roundSupportDistancePct: pullbackRound(roundSupportDistancePct, 2),
    previousHigh: pullbackRound(recentHigh20, 8),
    previousLow: pullbackRound(Number.isFinite(recentLow20) ? recentLow20 : 0, 8),
    rrToTarget1: pullbackRound(rrToTarget1, 2),
    atr14: pullbackRound(atr14, 8),
    volumeRatio: pullbackRound(volumeRatio, 2),
    latestQuoteVolume: pullbackRound(latestQuoteVolume, 0),
    change24h: pullbackRound(Number(ticker?.change24h || pullbackPct(Number(last.close || price), Number(prev.close || 0)) || 0), 2),
    candleCount4h: intraday.length,
    candleCount1d: daily.length,
    dailyProof,
    timing: timingRead,
    marketRegime: marketRead,
    riskFlags,
    scoreParts: pullbackBuildScoreParts(scoreParts),
    decision: {
     whySelected: reasons.slice(0, 3),
     whyNotNow: blockers.slice(0, 3),
     nextAction: entryReady
      ? `${tradePlan.entryCommand}. ${tradePlan.invalidation}. Scanner-only; no auto order is enabled.`
      : eventType === 'avoid_chase'
      ? tradePlan.entryCommand
      : dailySetup
      ? tradePlan.entryCommand
      : shortBias
      ? 'Wait for a clean 9 EMA rejection candle with stop above the pullback high.'
      : 'Wait for a clean 9 EMA reclaim candle with stop below the pullback low.',
    },
    chartLevels: {
     idealEntry: pullbackRound(ema9, 8),
     trigger: pullbackRound(timingRead.triggerPrice || (shortBias ? (price < ema9 ? price : ema9) : (price > ema9 ? price : ema9)), 8),
     entry: pullbackRound(entry, 8),
     stop: pullbackRound(stop, 8),
     target1: pullbackRound(target1, 8),
     target2: pullbackRound(target2, 8),
     target3: pullbackRound(target3, 8),
    },
    mode: 'scanner_only',
   },
  }, 'pullback');
 }

 async function runPullbackScan() {
  if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) throw new Error('Strategy registry not loaded');
  await pullbackSetStatus('Loading pullback market data...', { active: true, progress: 2 });
  await chrome.storage.local.set({ 'strategyResults.pullback': [] });
  await detectAPI(true);
  const settings = await pullbackLoadSettings();
  const marketStore = await pullbackLoadStored(['marketIndex']);
  const marketIndex = marketStore.marketIndex || null;
  const tickerMap = await fetchAllTickers();
  const products = await fetchProducts().catch(() => []);
  const universe = pullbackBuildUniverse(tickerMap, products, settings);
  const diagnostics = { tickerRows: Object.keys(tickerMap || {}).length, productRows: Array.isArray(products) ? products.length : 0, universeRows: universe.length };
  const skipped = { insufficientHistory: 0, fetchErrors: 0, reviewOnly: 0 };
  const results = [];
  for (let i = 0; i < universe.length; i += 1) {
   const item = universe[i];
   if (i % 5 === 0 || i === universe.length - 1) {
    await pullbackSetStatus(`Scanning ${item.symbol} (${i + 1}/${universe.length})`, {
     active: true,
     progress: Math.round(5 + (i / Math.max(1, universe.length)) * 90),
     scanned: i + 1,
     total: universe.length,
    });
   }
   try {
    const daily = await fetchCandles(item.symbol, '1d', settings.preferredDailyCandles, CLOSED_DAILY);
    if (!Array.isArray(daily) || daily.length < Number(settings.minDailyCandles || 45)) {
     skipped.insufficientHistory += 1;
     continue;
    }
    const intraday = await fetchCandles(item.symbol, '4h', settings.preferredIntradayCandles, CLOSED_4H).catch(() => []);
    const result = pullbackAnalyzeSymbol(item.symbol, daily, Array.isArray(intraday) ? intraday : [], item.ticker, { settings, marketIndex });
    if (result.eventType === 'review') skipped.reviewOnly += 1;
    results.push(result);
   } catch (error) {
    skipped.fetchErrors += 1;
    pullbackLog(`${item.symbol} skipped: ${error?.message || error}`);
   }
  }
  const output = pullbackSortRows(results).slice(0, Math.max(20, Number(settings.outputLimit || PULLBACK_DEFAULT_SETTINGS.outputLimit)));
  const counts = pullbackSignalCounts(output);
  await chrome.storage.local.set({
   'strategyResults.pullback': output,
   'strategyStatus.pullback': {
    strategyId: 'pullback',
    status: `OK Done - ${output.length} pullback rows | Long ${counts.long || 0}, Short ${counts.short || 0}, Reclaim ${counts.ema_reclaim || 0}, Reject ${counts.ema_reject_short || 0}, Avoid ${counts.avoid_chase || 0}`,
    active: false,
    progress: 100,
    scanned: results.length,
    total: universe.length,
    eventCounts: counts,
    skipped,
    diagnostics,
    lastScanTs: pullbackNow(),
    ts: pullbackNow(),
   },
   pullbackLastScanTs: pullbackNow(),
  });
  pullbackLog(`scan done: ${output.length} results`);
  return output;
 }

 async function runPullbackScanFromContext(context) {
  if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) throw new Error('Strategy registry not loaded');
  if (!context?.scanId) throw new Error('Fresh main scan context is required');
  await pullbackSetStatus('Deriving pullback rows from main scan...', { active: true, progress: 5, scanId: context.scanId });
  await chrome.storage.local.set({ 'strategyResults.pullback': [] });
  const settings = await pullbackLoadSettings();
  const marketIndex = context.marketIndex || null;
  const tickerMap = context.tickerMap || {};
  const products = Array.isArray(context.products) ? context.products : [];
  const universe = pullbackBuildUniverse(tickerMap, products, settings);
  const diagnostics = { tickerRows: Object.keys(tickerMap || {}).length, productRows: products.length, universeRows: universe.length };
  const skipped = { insufficientHistory: 0, fetchErrors: 0, reviewOnly: 0, noContextCandles: 0 };
  const getContextCandles = globalThis.FWDTradeDeskScanContext?.getCandles;
  const results = [];
  for (let i = 0; i < universe.length; i += 1) {
   const item = universe[i];
   if (i % 10 === 0 || i === universe.length - 1) {
    await pullbackSetStatus(`Deriving ${item.symbol} (${i + 1}/${universe.length})`, {
     active: true,
     progress: Math.round(5 + (i / Math.max(1, universe.length)) * 90),
     scanned: i + 1,
     total: universe.length,
     scanId: context.scanId,
    });
   }
   try {
    const daily = getContextCandles?.(context, item.symbol, '1d', settings.preferredDailyCandles) || [];
    if (!Array.isArray(daily) || daily.length < Number(settings.minDailyCandles || 45)) {
     skipped.insufficientHistory += 1;
     if (!daily.length) skipped.noContextCandles += 1;
     continue;
    }
    const intraday = getContextCandles?.(context, item.symbol, '4h', settings.preferredIntradayCandles) || [];
    const result = pullbackAnalyzeSymbol(item.symbol, daily, intraday, item.ticker, { settings, marketIndex });
    if (result.eventType === 'review') skipped.reviewOnly += 1;
    results.push(result);
   } catch (error) {
    skipped.fetchErrors += 1;
    pullbackLog(`${item.symbol} derive skipped: ${error?.message || error}`);
   }
  }
  const output = pullbackSortRows(results).slice(0, Math.max(20, Number(settings.outputLimit || PULLBACK_DEFAULT_SETTINGS.outputLimit)));
  const counts = pullbackSignalCounts(output);
  await chrome.storage.local.set({
   'strategyResults.pullback': output,
   'strategyStatus.pullback': {
    strategyId: 'pullback',
    status: `Derived - ${output.length} pullback rows from main scan | Long ${counts.long || 0}, Short ${counts.short || 0}, Reclaim ${counts.ema_reclaim || 0}, Reject ${counts.ema_reject_short || 0}`,
    active: false,
    progress: 100,
    scanned: results.length,
    total: universe.length,
    eventCounts: counts,
    skipped,
    diagnostics,
    source: 'main_scan_context',
    scanId: context.scanId,
    lastScanTs: pullbackNow(),
    ts: pullbackNow(),
   },
   pullbackLastScanTs: pullbackNow(),
  });
  return output;
 }

 function getPullbackSnapshot(callback) {
  chrome.storage.local.get([
   'strategyResults.pullback',
   'strategyStatus.pullback',
   'strategySettings.pullback',
  ], data => {
   callback({
    ok: true,
    pullback: {
     results: Array.isArray(data['strategyResults.pullback']) ? data['strategyResults.pullback'] : [],
     status: data['strategyStatus.pullback'] || {},
     settings: data['strategySettings.pullback'] || PULLBACK_DEFAULT_SETTINGS,
    },
   });
  });
 }

 chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (typeof isTrustedRuntimeSender === 'function' && !isTrustedRuntimeSender(sender)) {
   sendResponse({ ok: false, error: 'Unauthorized sender' });
   return false;
  }
  if (msg?.action === 'pullback:startScan') {
   const context = globalThis.FWDTradeDeskScanContext?.getFresh?.();
   const runner = context ? () => runPullbackScanFromContext(context) : (msg?.forceIndependent === true ? runPullbackScan : null);
   if (!runner) {
    pullbackSetStatus('Run main scan first - Pullback will derive from shared scan data', { active: false, progress: 0 })
    .finally(() => sendResponse({ ok: false, error: 'Run main scan first' }));
    return true;
   }
   runner()
   .then(results => sendResponse({ ok: true, count: results.length }))
   .catch(async error => {
    await pullbackSetStatus(`Pullback scan failed - ${error?.message || error}`, { active: false, progress: 0 });
    sendResponse({ ok: false, error: error?.message || String(error) });
   });
   return true;
  }
  if (msg?.action === 'pullback:getResults') {
   getPullbackSnapshot(sendResponse);
   return true;
  }
  if (msg?.action === 'pullback:clearResults') {
   chrome.storage.local.set({
    'strategyResults.pullback': [],
    'strategyStatus.pullback': { strategyId: 'pullback', status: 'Pullback results cleared', active: false, progress: 0, ts: pullbackNow() },
   }, () => sendResponse({ ok: true }));
   return true;
  }
  return false;
 });

 global.FWDTradeDeskPullbackScanner = Object.freeze({
  PULLBACK_DEFAULT_SETTINGS,
  pullbackAnalyzeSymbol,
  pullbackSignalCounts,
  pullbackSortRows,
  pullbackBuildScoreParts,
  pullbackEventLabel,
  runPullbackScan,
  runPullbackScanFromContext,
 });
})(globalThis);
