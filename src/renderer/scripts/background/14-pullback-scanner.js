'use strict';

(function initPullbackScanner(global) {
 const PULLBACK_DEFAULT_SETTINGS = Object.freeze({
  maxCoins: 180,
  outputLimit: 180,
  minUsdVolume24h: 100000,
  preferredDailyCandles: 140,
  minDailyCandles: 45,
  preferredIntradayCandles: 96,
  minIntradayCandles: 24,
  touchLookback: 6,
  emaTouchTolerancePct: 1.4,
  reclaimLookback: 4,
  maxEntryExtensionPct: 7.5,
  maxWatchExtensionPct: 10,
  roundNumberTolerancePct: 1.3,
  stopAtrBuffer: 0.18,
 });

 const LIVE_15M = Object.freeze({ closedOnly: false });
 const CLOSED_DAILY = Object.freeze({ closedOnly: true });

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
  return {
   ...PULLBACK_DEFAULT_SETTINGS,
   ...(stored['strategySettings.pullback'] || {}),
  };
 }

 function pullbackBuildUniverse(tickerMap = {}, products = [], settings = PULLBACK_DEFAULT_SETTINGS) {
  const productSymbols = new Set((Array.isArray(products) ? products : []).map(item => String(item.symbol || '').toUpperCase()));
  return Object.entries(tickerMap || {})
  .filter(([symbol, ticker]) => {
   const sym = String(symbol || '').toUpperCase();
   if (!sym || productSymbols.size && !productSymbols.has(sym)) return false;
   if (!sym.endsWith('USD') && !sym.endsWith('USDT')) return false;
   if (!(Number(ticker?.price || 0) > 0)) return false;
   return Number(ticker?.usdVol24h || 0) >= Number(settings.minUsdVolume24h || 0);
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
   ['OBV confirmation', Number(parts.obv || 0)],
   ['Risk reward', Number(parts.riskReward || 0)],
   ['Round support', Number(parts.roundSupport || 0)],
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
  return (Array.isArray(results) ? results : []).slice().sort((a, b) => {
   const ar = rank[String(a.eventType || a.raw?.eventType || '')] ?? 0;
   const br = rank[String(b.eventType || b.raw?.eventType || '')] ?? 0;
   return br - ar || Number(b.score || 0) - Number(a.score || 0) || Number(a.raw?.extensionPct || 999) - Number(b.raw?.extensionPct || 999);
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
  const latestQuoteVolume = pullbackQuoteVolume(last) || Number(ticker?.usdVol24h || 0) / 24 || 0;
  const volumeRatio = avgVolume20 > 0 ? latestQuoteVolume / avgVolume20 : 0;
  const lowLiquidity = Number(ticker?.usdVol24h || 0) < Number(settings.minUsdVolume24h || 0);
  const trendUp = price > ema21 && ema9 > ema21 && (!ema50 || ema21 >= ema50 * 0.97) && ema9 > ema9Prev && ema21 >= ema21Prev * 0.985;
  const trendDown = price < ema21 && ema9 < ema21 && (!ema50 || ema21 <= ema50 * 1.03) && ema9 < ema9Prev && ema21 <= ema21Prev * 1.015;
  const shortBias = trendDown && !trendUp;
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
  const reclaim = touchedRecently && price > ema9 && (Number(last.close || price) > ema9 || Number(prev.close || 0) < Number(ema9s[lastIndex - 1] || 0));
  const reject = touchedRecently && price < ema9 && (Number(last.close || price) < ema9 || Number(prev.close || 0) > Number(ema9s[lastIndex - 1] || 0));
  const recentHigh20 = Math.max(...highs.slice(Math.max(0, highs.length - 22), Math.max(0, highs.length - 1)).filter(value => value > 0), 0);
  const recentLow20 = Math.min(...lows.slice(Math.max(0, lows.length - 22), Math.max(0, lows.length - 1)).filter(value => value > 0));
  const extensionPct = ema9 > 0 ? pullbackPct(price, ema9) : 0;
  const shortExtensionPct = ema9 > 0 ? pullbackPct(ema9, price) : 0;
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
  else if (touchedRecently) blockers.push(shortBias ? 'Wait for a close back below the 9 EMA' : 'Wait for a close back above the 9 EMA');
  if (shortBias ? obvDown : obvUp) { scoreParts.obv = 10; reasons.push(shortBias ? 'OBV is confirming distribution' : 'OBV is supporting the trend'); }
  else blockers.push(shortBias ? 'OBV is not confirming distribution' : 'OBV is not confirming accumulation');
  if (rrToTarget1 >= 1.4) scoreParts.riskReward = rrToTarget1 >= 2 ? 12 : 8;
  else blockers.push('Reward is not strong enough from current price');
  if (roundSupportHit) { scoreParts.roundSupport = 8; reasons.push(shortBias ? `Rally rejected round/resistance area near ${pullbackRound(roundSupport, 8)}` : `Pullback respected round/support area near ${pullbackRound(roundSupport, 8)}`); }
  const activeExtensionPct = shortBias ? shortExtensionPct : extensionPct;
  if (activeExtensionPct > Number(settings.maxEntryExtensionPct || 7.5)) { scoreParts.extensionPenalty = -18; blockers.push(shortBias ? `Price is ${pullbackRound(activeExtensionPct, 2)}% below 9 EMA; do not chase short` : `Price is ${pullbackRound(activeExtensionPct, 2)}% above 9 EMA; do not chase`); }
  if (lowLiquidity) { scoreParts.liquidityPenalty = -16; blockers.push('Liquidity below pullback scanner threshold'); }

  let eventType = 'review';
  let signal = 'IGNORE';
  let actionLabel = 'Review manually';
  let priorityLabel = 'Review';
  if (activeExtensionPct > Number(settings.maxWatchExtensionPct || 10)) {
   eventType = 'avoid_chase';
   signal = 'IGNORE';
   actionLabel = shortBias ? 'Avoid chasing short' : 'Avoid chasing';
   priorityLabel = shortBias ? 'Short too extended' : 'Too extended';
  } else if (shortBias && reject && !lowLiquidity && rrToTarget1 >= 1.2 && activeExtensionPct <= Number(settings.maxEntryExtensionPct || 7.5)) {
   eventType = roundSupportHit ? 'round_resistance_short' : 'ema_reject_short';
   signal = 'SELL';
   actionLabel = roundSupportHit ? 'Short resistance reject' : 'Short 9 EMA reject';
   priorityLabel = 'Action';
  } else if (!shortBias && trendUp && reclaim && !lowLiquidity && rrToTarget1 >= 1.2 && extensionPct <= Number(settings.maxEntryExtensionPct || 7.5)) {
   eventType = roundSupportHit ? 'round_support' : 'ema_reclaim';
   signal = 'BUY';
   actionLabel = roundSupportHit ? 'Long support reclaim' : 'Long 9 EMA reclaim';
   priorityLabel = 'Action';
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
  } else if (activeExtensionPct > Number(settings.maxEntryExtensionPct || 7.5)) {
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
   shortBias && !reject && touchedRecently ? 'Needs 9 EMA rejection candle' : '',
   !shortBias && !reclaim && touchedRecently ? 'Needs reclaim candle' : '',
   activeExtensionPct > Number(settings.maxEntryExtensionPct || 7.5) ? (shortBias ? 'Late below 9 EMA' : 'Late above 9 EMA') : '',
   rrToTarget1 > 0 && rrToTarget1 < 1.4 ? 'Weak reward from current price' : '',
  ].filter(Boolean);

  return global.FWDTradeDeskStrategies.normalizeStrategyResult({
   symbol,
   strategyId: 'pullback',
   signal,
   direction: shortBias ? 'short' : 'long',
   setupLabel: pullbackEventLabel(eventType),
   eventType,
   actionLabel,
   priorityLabel,
   score,
   confidence: score,
   entry: pullbackRound(entry, 8),
   stop: pullbackRound(stop, 8),
   triggerPrice: pullbackRound(shortBias ? (price < ema9 ? price : ema9) : (price > ema9 ? price : ema9), 8),
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
    obvUp: shortBias ? obvDown : obvUp,
    roundSupportHit,
    lateChase: activeExtensionPct > Number(settings.maxEntryExtensionPct || 7.5),
    lowLiquidity,
    advisoryOnly: true,
   },
   riskFlags,
   raw: {
    eventType,
    eventLabel: pullbackEventLabel(eventType),
    direction: shortBias ? 'short' : 'long',
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
    candleCount15m: intraday.length,
    candleCount1d: daily.length,
    riskFlags,
    scoreParts: pullbackBuildScoreParts(scoreParts),
    decision: {
     whySelected: reasons.slice(0, 3),
     whyNotNow: blockers.slice(0, 3),
     nextAction: signal === 'BUY' || signal === 'SELL'
      ? 'Review the daily candle and 15m timing; scanner-only pullback setup, no auto order is enabled.'
      : eventType === 'avoid_chase'
      ? (shortBias ? 'Do not chase this short after extension; wait for the next 9 EMA rally and rejection.' : 'Do not chase this candle; wait for the next 9 EMA pullback or a tighter base.')
      : shortBias
      ? 'Wait for a clean 9 EMA rejection candle with stop above the pullback high.'
      : 'Wait for a clean 9 EMA reclaim candle with stop below the pullback low.',
    },
    chartLevels: {
     idealEntry: pullbackRound(ema9, 8),
     trigger: pullbackRound(shortBias ? (price < ema9 ? price : ema9) : (price > ema9 ? price : ema9), 8),
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
    const intraday = await fetchCandles(item.symbol, '15m', settings.preferredIntradayCandles, LIVE_15M).catch(() => []);
    const result = pullbackAnalyzeSymbol(item.symbol, daily, Array.isArray(intraday) ? intraday : [], item.ticker, { settings });
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
    const intraday = getContextCandles?.(context, item.symbol, '15m', settings.preferredIntradayCandles) || [];
    const result = pullbackAnalyzeSymbol(item.symbol, daily, intraday, item.ticker, { settings });
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
