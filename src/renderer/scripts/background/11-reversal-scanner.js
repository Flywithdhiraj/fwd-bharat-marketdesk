'use strict';

(function initReversalScanner(global) {
 const REVERSAL_DEFAULT_SETTINGS = Object.freeze({
  maxCoins: 500,
  outputLimit: 500,
  minUsdVolume24h: 100000,
  preferredIntradayCandles: 120,
  minIntradayCandles: 24,
  preferredDailyCandles: 120,
  minDailyCandles: 45,
  rsiExtremeHigh: 72,
  rsiExtremeLow: 28,
  zScoreExtreme: 2.1,
  vwapStretchPct: 3.5,
  move24hExtremePct: 8,
  volumeClimaxRatio: 2.4,
 });

 const CLOSED_4H = Object.freeze({ closedOnly: true, timeoutMs: 30000, paceMs: 1800 });
 const CLOSED_DAILY = Object.freeze({ closedOnly: true, timeoutMs: 30000, paceMs: 1800 });

 function reversalNow() {
  return Date.now();
 }

 function reversalLog(message) {
  if (typeof global.dlog === 'function') global.dlog(`[REVERSAL] ${message}`);
  else console.log(`[REVERSAL] ${message}`);
 }

 function reversalRound(value, decimals = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const m = 10 ** decimals;
  return Math.round(n * m) / m;
 }

 function reversalSma(values = [], period = 20, endIndex = values.length - 1) {
  if (!Array.isArray(values) || period <= 0 || endIndex < period - 1) return null;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i += 1) {
   const value = Number(values[i]);
   if (!Number.isFinite(value)) return null;
   sum += value;
  }
  return sum / period;
 }

 function reversalStdev(values = []) {
  const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (nums.length < 2) return 0;
  const avg = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  const variance = nums.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
 }

 function reversalEma(values = [], period = 20) {
  const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (nums.length < period) return null;
  const k = 2 / (period + 1);
  let value = nums.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (let i = period; i < nums.length; i += 1) value = nums[i] * k + value * (1 - k);
  return value;
 }

 function reversalRsi(values = [], period = 14) {
  const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (nums.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = nums.length - period; i < nums.length; i += 1) {
   const diff = nums[i] - nums[i - 1];
   if (diff >= 0) gains += diff;
   else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
 }

 function reversalAtr(candles = [], period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
   const high = Number(candles[i]?.high || 0);
   const low = Number(candles[i]?.low || 0);
   const prevClose = Number(candles[i - 1]?.close || 0);
   if (!(high > 0) || !(low > 0) || !(prevClose > 0)) continue;
   trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return reversalSma(trs, period) || 0;
 }

 function reversalQuoteVolume(candle = {}) {
  const quoteVolume = Number(candle.quote_volume ?? candle.quoteVolume ?? candle.turnover ?? candle.turnover_usd ?? 0);
  if (Number.isFinite(quoteVolume) && quoteVolume > 0) return quoteVolume;
  const volume = Number(candle.volume || 0);
  const close = Number(candle.close || 0);
  return volume > 0 && close > 0 ? volume * close : 0;
 }

 function reversalVwap(candles = []) {
  let pv = 0;
  let vol = 0;
  (Array.isArray(candles) ? candles : []).forEach(candle => {
   const high = Number(candle.high || 0);
   const low = Number(candle.low || 0);
   const close = Number(candle.close || 0);
   const volume = Number(candle.volume || 0);
   if (!(high > 0) || !(low > 0) || !(close > 0) || !(volume > 0)) return;
   pv += ((high + low + close) / 3) * volume;
   vol += volume;
  });
  return vol > 0 ? pv / vol : 0;
 }

 function reversalPctChange(now = 0, prev = 0) {
  const a = Number(now || 0);
  const b = Number(prev || 0);
  if (!(a > 0) || !(b > 0)) return 0;
  return ((a - b) / b) * 100;
 }

 function reversalHighLow(candles = [], lookback = 48) {
  const rows = (Array.isArray(candles) ? candles : []).slice(-lookback);
  const highs = rows.map(candle => Number(candle.high || 0)).filter(value => value > 0);
  const lows = rows.map(candle => Number(candle.low || 0)).filter(value => value > 0);
  return {
   high: highs.length ? Math.max(...highs) : 0,
   low: lows.length ? Math.min(...lows) : 0,
   mid: highs.length && lows.length ? (Math.max(...highs) + Math.min(...lows)) / 2 : 0,
  };
 }

 async function reversalLoadStored(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
 }

 async function reversalSetStatus(status, extra = {}) {
  await chrome.storage.local.set({
   'strategyStatus.reversal': {
    strategyId: 'reversal',
    status,
    ts: reversalNow(),
    ...extra,
   },
  });
 }

async function reversalLoadSettings() {
 const stored = await reversalLoadStored(['strategySettings.reversal']);
  const settings = {
   ...REVERSAL_DEFAULT_SETTINGS,
   ...(stored['strategySettings.reversal'] || {}),
  };
  settings.maxCoins = Math.max(REVERSAL_DEFAULT_SETTINGS.maxCoins, Number(settings.maxCoins || 0));
  settings.outputLimit = Math.max(REVERSAL_DEFAULT_SETTINGS.outputLimit, Number(settings.outputLimit || 0));
  return settings;
 }

 function reversalBuildUniverse(tickerMap = {}, products = [], settings = REVERSAL_DEFAULT_SETTINGS) {
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
  .slice(0, Math.max(20, Number(settings.maxCoins || REVERSAL_DEFAULT_SETTINGS.maxCoins)));
 }

 function reversalSignalCounts(results = []) {
  return (Array.isArray(results) ? results : []).reduce((acc, row) => {
   const signal = String(row?.signal || 'IGNORE').toUpperCase();
   const eventType = String(row?.eventType || row?.raw?.eventType || 'review');
   if (signal === 'BUY') acc.buy += 1;
   else if (signal === 'SELL') acc.sell += 1;
   else if (signal === 'WATCHLIST') acc.watch += 1;
   else acc.avoid += 1;
   acc[eventType] = (acc[eventType] || 0) + 1;
   return acc;
  }, { buy: 0, sell: 0, watch: 0, avoid: 0, fade_extreme: 0, liquidation_reversal: 0, mean_reversion: 0, reclaim: 0, avoid_chase: 0, review: 0 });
 }

 function reversalEventLabel(eventType = '') {
  const key = String(eventType || '').trim();
  if (key === 'fade_extreme') return 'Fade Extreme';
  if (key === 'liquidation_reversal') return 'Liquidation Reversal';
  if (key === 'mean_reversion') return 'Mean Reversion';
  if (key === 'reclaim') return 'Failed Break Reclaim';
  if (key === 'avoid_chase') return 'Avoid Chase';
  return 'Review';
 }

 function reversalBuildScoreParts(parts = {}) {
  const rows = [
   ['RSI stretch', Number(parts.rsi || 0)],
   ['VWAP stretch', Number(parts.vwap || 0)],
   ['Z-score', Number(parts.zScore || 0)],
   ['Volume climax', Number(parts.volume || 0)],
   ['Reclaim trigger', Number(parts.reclaim || 0)],
   ['Liquidity penalty', Number(parts.liquidityPenalty || 0)],
   ['Trend penalty', Number(parts.trendPenalty || 0)],
  ].filter(([, value]) => value !== 0);
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  return {
   rows: rows.map(([label, value]) => ({ label, value: reversalRound(value, 0) })),
   total: reversalRound(total, 0),
  };
 }

 function reversalSortRows(results = []) {
  const eventRank = { liquidation_reversal: 6, fade_extreme: 5, reclaim: 4, mean_reversion: 3, avoid_chase: 2, review: 1 };
  const signalRank = { BUY: 3, SELL: 3, WATCHLIST: 2, IGNORE: 1 };
  return (Array.isArray(results) ? results : []).slice().sort((a, b) => {
   return (eventRank[b.eventType] || 0) - (eventRank[a.eventType] || 0)
   || (signalRank[b.signal] || 0) - (signalRank[a.signal] || 0)
   || Number(b.score || 0) - Number(a.score || 0)
   || String(a.symbol || '').localeCompare(String(b.symbol || ''));
  });
 }

 function reversalAnalyzeSymbol(symbol = '', intradayCandles = [], dailyCandles = [], ticker = {}, context = {}) {
  if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) {
   throw new Error('Strategy registry not loaded');
  }
  const settings = context.settings || REVERSAL_DEFAULT_SETTINGS;
  const rows = Array.isArray(intradayCandles) ? intradayCandles : [];
  const daily = Array.isArray(dailyCandles) ? dailyCandles : [];
  const latest = rows[rows.length - 1] || {};
  const price = Number(ticker?.price || latest.close || 0);
  const closes = rows.map(candle => Number(candle.close || 0)).filter(Number.isFinite);
  const dailyCloses = daily.map(candle => Number(candle.close || 0)).filter(Number.isFinite);
  const volumes = rows.map(candle => Number(candle.volume || 0));
  const quoteVolumes = rows.map(reversalQuoteVolume);
  const avgVolume20 = reversalSma(volumes, 20) || 0;
  const latestVolume = Number(volumes[volumes.length - 1] || 0);
  const volumeRatio = avgVolume20 > 0 ? latestVolume / avgVolume20 : 0;
  const latestQuoteVolume = Math.max(Number(quoteVolumes[quoteVolumes.length - 1] || 0), Number(ticker?.usdVol24h || 0));
  const vwap = reversalVwap(rows.slice(-96));
  const ema20 = reversalEma(closes, 20) || 0;
  const ema50 = reversalEma(closes, 50) || 0;
  const ema100 = reversalEma(closes, 100) || 0;
  const rsi14 = reversalRsi(closes, 14);
  const atr14 = reversalAtr(rows, 14);
  const recent = closes.slice(-48);
  const mean48 = reversalSma(recent, Math.min(48, recent.length), recent.length - 1) || 0;
  const stdev48 = reversalStdev(recent);
  const zScore = stdev48 > 0 && price > 0 ? (price - mean48) / stdev48 : 0;
  const levels = reversalHighLow(rows, 48);
  const prior4h = closes.length > 16 ? closes[closes.length - 17] : 0;
  const move4h = reversalPctChange(price, prior4h);
  const dailyMove = Number(ticker?.change24h || 0) || (dailyCloses.length > 1 ? reversalPctChange(price, dailyCloses[dailyCloses.length - 2]) : 0);
  const vwapDistancePct = vwap > 0 && price > 0 ? ((price - vwap) / vwap) * 100 : 0;
  const trendUp = ema20 > ema50 && ema50 > ema100;
  const trendDown = ema20 < ema50 && ema50 < ema100;
  const closeBackInsideHigh = levels.high > 0 && price < levels.high * 0.995 && Number(latest.high || 0) > levels.high * 1.004;
  const closeBackInsideLow = levels.low > 0 && price > levels.low * 1.005 && Number(latest.low || 0) < levels.low * 0.996;
  const stretchedUp = price > 0 && (Number(rsi14 || 0) >= Number(settings.rsiExtremeHigh || 72) || zScore >= Number(settings.zScoreExtreme || 2.1) || vwapDistancePct >= Number(settings.vwapStretchPct || 3.5) || dailyMove >= Number(settings.move24hExtremePct || 8));
  const stretchedDown = price > 0 && (Number(rsi14 || 0) <= Number(settings.rsiExtremeLow || 28) || zScore <= -Number(settings.zScoreExtreme || 2.1) || vwapDistancePct <= -Number(settings.vwapStretchPct || 3.5) || dailyMove <= -Number(settings.move24hExtremePct || 8));
  const volumeClimax = volumeRatio >= Number(settings.volumeClimaxRatio || 2.4);
  const tickerTurnover = Number(ticker?.inrTurnover24h || ticker?.turnover24h || ticker?.usdVol24h || 0);
  const liquidityValue = tickerTurnover > 0 ? tickerTurnover : latestQuoteVolume;
  const lowLiquidity = liquidityValue > 0 && liquidityValue < Number(settings.minUsdVolume24h || 0);
  const canFadeLong = stretchedDown && (closeBackInsideLow || volumeClimax);
  const canFadeShort = stretchedUp && (closeBackInsideHigh || volumeClimax);
  let eventType = 'review';
  let signal = 'IGNORE';
  let direction = 'watch';
  let actionLabel = 'Review manually';
  let priorityLabel = 'No edge';
  let score = 35;
  const reasons = [];
  const blockers = [];
  const scoreParts = {};

  if (canFadeLong || canFadeShort) {
   eventType = volumeClimax ? 'liquidation_reversal' : 'fade_extreme';
   signal = canFadeLong ? 'BUY' : 'SELL';
   direction = canFadeLong ? 'long' : 'short';
   actionLabel = canFadeLong ? 'Preview bounce' : 'Preview fade';
   priorityLabel = volumeClimax ? 'Climax reversal' : 'Extreme fade';
   score = volumeClimax ? 76 : 70;
   reasons.push(canFadeLong ? 'Downside stretch favors bounce only after reclaim evidence' : 'Upside stretch favors fade only after failed breakout evidence');
   if (volumeClimax) reasons.push('Volume climax confirms emotional move');
   if (closeBackInsideHigh || closeBackInsideLow) reasons.push('Price snapped back inside the recent range');
  } else if ((stretchedDown && closeBackInsideLow) || (stretchedUp && closeBackInsideHigh)) {
   eventType = 'reclaim';
   signal = 'WATCHLIST';
   direction = stretchedDown ? 'watch_long' : 'watch_short';
   actionLabel = stretchedDown ? 'Watch reclaim long' : 'Watch failed breakout short';
   priorityLabel = 'Reclaim watch';
   score = 64;
   reasons.push('Failed breakdown/breakout needs one more confirmation candle');
  } else if (Math.abs(vwapDistancePct) >= Number(settings.vwapStretchPct || 3.5) || Math.abs(zScore) >= Number(settings.zScoreExtreme || 2.1)) {
   eventType = 'mean_reversion';
   signal = 'WATCHLIST';
   direction = vwapDistancePct < 0 || zScore < 0 ? 'watch_long' : 'watch_short';
   actionLabel = 'Wait for VWAP reversion trigger';
   priorityLabel = 'Stretch watch';
   score = 58;
   reasons.push('Price is stretched from balance but trigger is not confirmed');
  }

  if (Number(rsi14 || 50) >= Number(settings.rsiExtremeHigh || 72) || Number(rsi14 || 50) <= Number(settings.rsiExtremeLow || 28)) scoreParts.rsi = 14;
  if (Math.abs(vwapDistancePct) >= Number(settings.vwapStretchPct || 3.5)) scoreParts.vwap = 14;
  if (Math.abs(zScore) >= Number(settings.zScoreExtreme || 2.1)) scoreParts.zScore = 13;
  if (volumeClimax) scoreParts.volume = 14;
  if (closeBackInsideHigh || closeBackInsideLow) scoreParts.reclaim = 12;
  if (lowLiquidity) scoreParts.liquidityPenalty = -18;
  if ((signal === 'SELL' && trendUp && !closeBackInsideHigh) || (signal === 'BUY' && trendDown && !closeBackInsideLow)) scoreParts.trendPenalty = -8;
  if (lowLiquidity) blockers.push('Liquidity below reversal threshold');
  if (signal === 'SELL' && trendUp && !closeBackInsideHigh) blockers.push('Primary trend still up; wait for failed breakout close');
  if (signal === 'BUY' && trendDown && !closeBackInsideLow) blockers.push('Primary trend still down; wait for reclaim close');
  if (eventType === 'review') blockers.push('No stretch or reclaim trigger');

  score = Math.max(1, Math.min(96, Math.round(score + Object.values(scoreParts).reduce((sum, value) => sum + Number(value || 0), 0))));
  if (lowLiquidity || (score < 55 && eventType !== 'review')) {
   if (signal === 'BUY' || signal === 'SELL') signal = 'WATCHLIST';
   if (eventType !== 'review') eventType = 'avoid_chase';
   priorityLabel = lowLiquidity ? 'Thin market' : 'Avoid chase';
   actionLabel = 'Wait for cleaner confirmation';
  }

  const isShort = String(direction).includes('short') || signal === 'SELL';
  const riskDistance = Math.max(atr14 * 1.25, price * 0.018);
  const stop = price > 0 ? (isShort ? price + riskDistance : Math.max(0, price - riskDistance)) : 0;
  const targetBalance = vwap > 0 ? vwap : mean48;
  const target1 = targetBalance > 0 ? targetBalance : (isShort ? price - riskDistance * 1.4 : price + riskDistance * 1.4);
  const target2 = levels.mid > 0 ? levels.mid : (isShort ? price - riskDistance * 2.2 : price + riskDistance * 2.2);
  const risk = Math.abs(price - stop);
  const riskFlags = [
   lowLiquidity ? 'Thin volume' : '',
   Math.abs(vwapDistancePct) >= 8 ? 'Very far from VWAP' : '',
   volumeClimax ? 'Climax volume' : '',
  ].filter(Boolean);

  return global.FWDTradeDeskStrategies.normalizeStrategyResult({
   symbol,
   strategyId: 'reversal',
   signal,
   direction,
   setupLabel: reversalEventLabel(eventType),
   eventType,
   actionLabel,
   priorityLabel,
   score,
   confidence: score,
   entry: reversalRound(price, 8),
   stop: reversalRound(stop, 8),
   riskPercent: price > 0 && risk > 0 ? reversalRound((risk / price) * 100, 2) : 0,
   targets: {
    target1: reversalRound(target1, 8),
    target2R: reversalRound(target1, 8),
    target3R: reversalRound(target2, 8),
    vwap: reversalRound(vwap, 8),
    mean48: reversalRound(mean48, 8),
    rangeMid: reversalRound(levels.mid, 8),
   },
   reasons: [...reasons, ...blockers].slice(0, 12),
   checks: {
    stretchedUp,
    stretchedDown,
    closeBackInsideHigh,
    closeBackInsideLow,
    volumeClimax,
    lowLiquidity,
    trendUp,
    trendDown,
    advisoryOnly: true,
   },
   riskFlags,
   raw: {
    eventType,
    eventLabel: reversalEventLabel(eventType),
    latestPrice: reversalRound(price, 8),
    rsi14: reversalRound(rsi14, 2),
    zScore: reversalRound(zScore, 2),
    vwap: reversalRound(vwap, 8),
    vwapDistancePct: reversalRound(vwapDistancePct, 2),
    mean48: reversalRound(mean48, 8),
    ema20: reversalRound(ema20, 8),
    ema50: reversalRound(ema50, 8),
    ema100: reversalRound(ema100, 8),
    atr14: reversalRound(atr14, 8),
    change24h: reversalRound(dailyMove, 2),
    move4h: reversalRound(move4h, 2),
    volumeRatio: reversalRound(volumeRatio, 2),
    latestQuoteVolume: reversalRound(latestQuoteVolume, 0),
    rangeHigh: reversalRound(levels.high, 8),
    rangeLow: reversalRound(levels.low, 8),
    rangeMid: reversalRound(levels.mid, 8),
    candleCount4h: rows.length,
    candleCount1d: daily.length,
    riskFlags,
    scoreParts: reversalBuildScoreParts(scoreParts),
    decision: {
     whySelected: reasons.slice(0, 3),
     whyNotNow: blockers.slice(0, 3),
     nextAction: signal === 'BUY' || signal === 'SELL'
      ? `${actionLabel}; scanner-only reversal setup, confirm failed extension on chart.`
      : `${actionLabel}; no live order path is enabled from Reversal Lab.`,
    },
    mode: 'scanner_only',
   },
  }, 'reversal');
 }

 async function runReversalScan() {
  if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) {
   throw new Error('Strategy registry not loaded');
  }
  await reversalSetStatus('Loading reversal market data...', { active: true, progress: 2 });
  await chrome.storage.local.set({ 'strategyResults.reversal': [] });
  await detectAPI(true);
  const settings = await reversalLoadSettings();
  const tickerMap = await fetchAllTickers();
  const products = await fetchProducts().catch(() => []);
  const universe = reversalBuildUniverse(tickerMap, products, settings);
  const diagnostics = {
   tickerRows: Object.keys(tickerMap || {}).length,
   productRows: Array.isArray(products) ? products.length : 0,
   universeRows: universe.length,
  };
  const skipped = { insufficientHistory: 0, fetchErrors: 0, reviewOnly: 0 };
  const results = [];
  for (let i = 0; i < universe.length; i += 1) {
   const item = universe[i];
   if (i % 5 === 0 || i === universe.length - 1) {
    await reversalSetStatus(`Scanning ${item.symbol} (${i + 1}/${universe.length})`, {
     active: true,
     progress: Math.round(5 + (i / Math.max(1, universe.length)) * 90),
     scanned: i + 1,
     total: universe.length,
    });
   }
   try {
    const intraday = await fetchCandles(item.symbol, '4h', settings.preferredIntradayCandles, CLOSED_4H);
    const safeIntraday = Array.isArray(intraday) ? intraday : [];
    if (safeIntraday.length < Number(settings.minIntradayCandles || 72)) {
     skipped.insufficientHistory += 1;
     continue;
    }
    const daily = await fetchCandles(item.symbol, '1d', settings.preferredDailyCandles, CLOSED_DAILY).catch(() => []);
    const result = reversalAnalyzeSymbol(item.symbol, safeIntraday, Array.isArray(daily) ? daily : [], item.ticker, { settings });
    if (result.eventType === 'review') skipped.reviewOnly += 1;
    results.push(result);
   } catch (error) {
    skipped.fetchErrors += 1;
    reversalLog(`${item.symbol} skipped: ${error?.message || error}`);
   }
  }
  const output = reversalSortRows(results).slice(0, Math.max(20, Number(settings.outputLimit || REVERSAL_DEFAULT_SETTINGS.outputLimit)));
  const counts = reversalSignalCounts(output);
  await chrome.storage.local.set({
   'strategyResults.reversal': output,
   'strategyStatus.reversal': {
    strategyId: 'reversal',
    status: `OK Done - ${output.length} Reversal rows | Fade ${counts.fade_extreme || 0}, Liq ${counts.liquidation_reversal || 0}, Mean ${counts.mean_reversion || 0}, Avoid ${counts.avoid_chase || 0}`,
    active: false,
    progress: 100,
    scanned: results.length,
    total: universe.length,
    eventCounts: counts,
    skipped,
    diagnostics,
    lastScanTs: reversalNow(),
    ts: reversalNow(),
   },
   reversalLastScanTs: reversalNow(),
  });
  reversalLog(`scan done: ${output.length} results`);
  return output;
 }

 async function runReversalScanFromContext(context) {
  if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) throw new Error('Strategy registry not loaded');
  if (!context?.scanId) throw new Error('Fresh main scan context is required');
  await reversalSetStatus('Deriving Reversal rows from main scan...', { active: true, progress: 5, scanId: context.scanId });
  await chrome.storage.local.set({ 'strategyResults.reversal': [] });
  const settings = await reversalLoadSettings();
  const tickerMap = context.tickerMap || {};
  const products = Array.isArray(context.products) ? context.products : [];
  const universe = reversalBuildUniverse(tickerMap, products, settings);
  const diagnostics = { tickerRows: Object.keys(tickerMap || {}).length, productRows: products.length, universeRows: universe.length };
  const skipped = { insufficientHistory: 0, fetchErrors: 0, reviewOnly: 0, noContextCandles: 0 };
  const getContextCandles = globalThis.FWDTradeDeskScanContext?.getCandles;
  const results = [];
  for (let i = 0; i < universe.length; i += 1) {
   const item = universe[i];
   if (i % 10 === 0 || i === universe.length - 1) {
    await reversalSetStatus(`Deriving ${item.symbol} (${i + 1}/${universe.length})`, {
     active: true,
     progress: Math.round(5 + (i / Math.max(1, universe.length)) * 90),
     scanned: i + 1,
     total: universe.length,
     scanId: context.scanId,
    });
   }
   try {
    const safeIntraday = getContextCandles?.(context, item.symbol, '4h', settings.preferredIntradayCandles) || [];
    if (safeIntraday.length < Number(settings.minIntradayCandles || 72)) {
     skipped.insufficientHistory += 1;
     if (!safeIntraday.length) skipped.noContextCandles += 1;
     continue;
    }
    const daily = getContextCandles?.(context, item.symbol, '1d', settings.preferredDailyCandles) || [];
    const result = reversalAnalyzeSymbol(item.symbol, safeIntraday, daily, item.ticker, { settings });
    if (result.eventType === 'review') skipped.reviewOnly += 1;
    results.push(result);
   } catch (error) {
    skipped.fetchErrors += 1;
    reversalLog(`${item.symbol} derive skipped: ${error?.message || error}`);
   }
  }
  const output = reversalSortRows(results).slice(0, Math.max(20, Number(settings.outputLimit || REVERSAL_DEFAULT_SETTINGS.outputLimit)));
  const counts = reversalSignalCounts(output);
  await chrome.storage.local.set({
   'strategyResults.reversal': output,
   'strategyStatus.reversal': {
    strategyId: 'reversal',
    status: `Derived - ${output.length} Reversal rows from main scan | Fade ${counts.fade_extreme || 0}, Liq ${counts.liquidation_reversal || 0}, Mean ${counts.mean_reversion || 0}`,
    active: false,
    progress: 100,
    scanned: results.length,
    total: universe.length,
    eventCounts: counts,
    skipped,
    diagnostics,
    source: 'main_scan_context',
    scanId: context.scanId,
    lastScanTs: reversalNow(),
    ts: reversalNow(),
   },
   reversalLastScanTs: reversalNow(),
  });
  return output;
 }

 function getReversalSnapshot(callback) {
  chrome.storage.local.get([
   'strategyResults.reversal',
   'strategyStatus.reversal',
   'strategySettings.reversal',
  ], data => {
   callback({
    ok: true,
    reversal: {
     results: Array.isArray(data['strategyResults.reversal']) ? data['strategyResults.reversal'] : [],
     status: data['strategyStatus.reversal'] || {},
     settings: data['strategySettings.reversal'] || REVERSAL_DEFAULT_SETTINGS,
    },
   });
  });
 }

 chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (typeof isTrustedRuntimeSender === 'function' && !isTrustedRuntimeSender(sender)) {
   sendResponse({ ok: false, error: 'Unauthorized sender' });
   return false;
  }
  if (msg?.action === 'reversal:startScan') {
   const context = globalThis.FWDTradeDeskScanContext?.getFresh?.();
   const runner = context ? () => runReversalScanFromContext(context) : (msg?.forceIndependent === true ? runReversalScan : null);
   if (!runner) {
    reversalSetStatus('Run main scan first - Reversal will derive from shared scan data', { active: false, progress: 0 })
    .finally(() => sendResponse({ ok: false, error: 'Run main scan first' }));
    return true;
   }
   runner()
   .then(results => sendResponse({ ok: true, count: results.length }))
   .catch(async error => {
    await reversalSetStatus(`Reversal scan failed - ${error?.message || error}`, { active: false, progress: 0 });
    sendResponse({ ok: false, error: error?.message || String(error) });
   });
   return true;
  }
  if (msg?.action === 'reversal:getResults') {
   getReversalSnapshot(sendResponse);
   return true;
  }
  if (msg?.action === 'reversal:clearResults') {
   chrome.storage.local.set({
    'strategyResults.reversal': [],
    'strategyStatus.reversal': { strategyId: 'reversal', status: 'Reversal results cleared', active: false, progress: 0, ts: reversalNow() },
   }, () => sendResponse({ ok: true }));
   return true;
  }
  return false;
 });

 global.FWDTradeDeskReversalScanner = Object.freeze({
  REVERSAL_DEFAULT_SETTINGS,
  reversalAnalyzeSymbol,
  reversalSignalCounts,
  reversalSortRows,
  reversalBuildScoreParts,
  reversalEventLabel,
  runReversalScan,
  runReversalScanFromContext,
 });
})(globalThis);
