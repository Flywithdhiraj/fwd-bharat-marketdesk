'use strict';

(function initDarvasScanner(global) {
 const DARVAS_DEFAULT_SETTINGS = Object.freeze({
  maxCoins: 500,
  outputLimit: 500,
  minUsdVolume24h: 100000,
  preferredDailyCandles: 140,
  minDailyCandles: 45,
  preferredIntradayCandles: 96,
  minIntradayCandles: 24,
  boxLookback: 24,
  minBoxAge: 5,
  maxBoxHeightPct: 32,
  tightBoxHeightPct: 16,
  nearTopPct: 2.5,
  breakoutVolumeRatio: 1.45,
  strongVolumeRatio: 2.2,
 });

 const LIVE_15M = Object.freeze({ closedOnly: false });
 const CLOSED_DAILY = Object.freeze({ closedOnly: true });

 function darvasNow() { return Date.now(); }

 function darvasLog(message) {
  if (typeof global.dlog === 'function') global.dlog(`[DARVAS] ${message}`);
  else console.log(`[DARVAS] ${message}`);
 }

 function darvasRound(value, decimals = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const m = 10 ** decimals;
  return Math.round(n * m) / m;
 }

 function darvasSma(values = [], period = 20, endIndex = values.length - 1) {
  if (!Array.isArray(values) || period <= 0 || endIndex < period - 1) return null;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i += 1) {
   const value = Number(values[i]);
   if (!Number.isFinite(value)) return null;
   sum += value;
  }
  return sum / period;
 }

 function darvasEma(values = [], period = 20) {
  const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (nums.length < period) return null;
  const k = 2 / (period + 1);
  let value = nums.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (let i = period; i < nums.length; i += 1) value = nums[i] * k + value * (1 - k);
  return value;
 }

 function darvasAtr(candles = [], period = 14) {
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
  return darvasSma(trs, period) || 0;
 }

 function darvasQuoteVolume(candle = {}) {
  const quoteVolume = Number(candle.quote_volume ?? candle.quoteVolume ?? candle.turnover ?? candle.turnover_usd ?? 0);
  if (Number.isFinite(quoteVolume) && quoteVolume > 0) return quoteVolume;
  const volume = Number(candle.volume || 0);
  const close = Number(candle.close || 0);
  return volume > 0 && close > 0 ? volume * close : 0;
 }

 function darvasPctChange(now = 0, prev = 0) {
  const a = Number(now || 0);
  const b = Number(prev || 0);
  if (!(a > 0) || !(b > 0)) return 0;
  return ((a - b) / b) * 100;
 }

 function darvasLoadStored(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
 }

 async function darvasSetStatus(status, extra = {}) {
  await chrome.storage.local.set({
   'strategyStatus.darvas': {
    strategyId: 'darvas',
    status,
    ts: darvasNow(),
    ...extra,
   },
  });
 }

async function darvasLoadSettings() {
 const stored = await darvasLoadStored(['strategySettings.darvas']);
  const settings = {
   ...DARVAS_DEFAULT_SETTINGS,
   ...(stored['strategySettings.darvas'] || {}),
  };
  settings.maxCoins = Math.max(DARVAS_DEFAULT_SETTINGS.maxCoins, Number(settings.maxCoins || 0));
  settings.outputLimit = Math.max(DARVAS_DEFAULT_SETTINGS.outputLimit, Number(settings.outputLimit || 0));
  return settings;
 }

 function darvasBuildUniverse(tickerMap = {}, products = [], settings = DARVAS_DEFAULT_SETTINGS) {
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
  .slice(0, Math.max(20, Number(settings.maxCoins || DARVAS_DEFAULT_SETTINGS.maxCoins)));
 }

 function darvasFindBox(candles = [], settings = DARVAS_DEFAULT_SETTINGS) {
  const lookback = Math.max(8, Number(settings.boxLookback || DARVAS_DEFAULT_SETTINGS.boxLookback));
  const rows = (Array.isArray(candles) ? candles : []).slice(-(lookback + 1), -1);
  if (rows.length < Math.max(5, Number(settings.minBoxAge || 5))) return null;
  const highs = rows.map(candle => Number(candle.high || candle.close || 0)).filter(value => value > 0);
  const lows = rows.map(candle => Number(candle.low || candle.close || 0)).filter(value => value > 0);
  if (!highs.length || !lows.length) return null;
  const boxTop = Math.max(...highs);
  const boxBottom = Math.min(...lows);
  if (!(boxTop > boxBottom) || !(boxBottom > 0)) return null;
  const topIndex = rows.findIndex(candle => Number(candle.high || candle.close || 0) === boxTop);
  const bottomIndex = rows.findIndex(candle => Number(candle.low || candle.close || 0) === boxBottom);
  const startTime = Number(rows[0]?.time || rows[0]?.ts || rows[0]?.timestamp || 0);
  const endTime = Number(rows[rows.length - 1]?.time || rows[rows.length - 1]?.ts || rows[rows.length - 1]?.timestamp || 0);
  const boxHeightPct = ((boxTop - boxBottom) / boxBottom) * 100;
  const closesInside = rows.filter(candle => Number(candle.close || 0) <= boxTop && Number(candle.close || 0) >= boxBottom).length;
  return {
   boxTop,
   boxBottom,
   boxAge: rows.length,
   startTime,
   endTime,
   topAge: topIndex >= 0 ? rows.length - topIndex : rows.length,
   bottomAge: bottomIndex >= 0 ? rows.length - bottomIndex : rows.length,
   boxHeightPct,
   closesInsidePct: rows.length ? (closesInside / rows.length) * 100 : 0,
  };
 }

 function darvasEventLabel(eventType = '') {
  const map = {
   breakout: 'Box breakout',
   near_breakout: 'Near box top',
   base: 'Box base',
   failed_breakout: 'Failed breakout',
   avoid_box: 'Avoid box',
   review: 'Review',
  };
  return map[eventType] || 'Darvas review';
 }

 function darvasBuildScoreParts(parts = {}) {
  return {
   ...parts,
   rows: Object.entries(parts)
   .filter(([, value]) => Number(value || 0) !== 0)
   .map(([key, value]) => ({
    key,
    label: key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
    value: Number(value || 0),
   })),
  };
 }

 function darvasSignalCounts(results = []) {
  return (Array.isArray(results) ? results : []).reduce((acc, row) => {
   const eventType = String(row?.eventType || row?.raw?.eventType || 'review');
   acc[eventType] = (acc[eventType] || 0) + 1;
   if (row.signal === 'BUY') acc.buy += 1;
   if (row.signal === 'WATCHLIST') acc.watch += 1;
   if (row.signal === 'IGNORE') acc.avoid += 1;
   return acc;
  }, { buy: 0, watch: 0, avoid: 0, breakout: 0, near_breakout: 0, base: 0, failed_breakout: 0, avoid_box: 0, review: 0 });
 }

 function darvasSortRows(results = []) {
  const rank = { breakout: 5, near_breakout: 4, base: 3, failed_breakout: 2, review: 1, avoid_box: 0 };
  return (Array.isArray(results) ? results : []).slice().sort((a, b) => {
   const ar = rank[String(a.eventType || a.raw?.eventType || '')] ?? 0;
   const br = rank[String(b.eventType || b.raw?.eventType || '')] ?? 0;
   return br - ar || Number(b.score || 0) - Number(a.score || 0) || Number(b.raw?.volumeRatio || 0) - Number(a.raw?.volumeRatio || 0);
  });
 }

 function darvasAnalyzeSymbol(symbol, dailyCandles = [], intradayCandles = [], ticker = {}, ctx = {}) {
  const settings = { ...DARVAS_DEFAULT_SETTINGS, ...(ctx.settings || {}) };
  const daily = (Array.isArray(dailyCandles) ? dailyCandles : []).filter(candle => Number(candle?.close || 0) > 0);
  const intraday = (Array.isArray(intradayCandles) ? intradayCandles : []).filter(candle => Number(candle?.close || 0) > 0);
  const last = daily[daily.length - 1] || {};
  const price = Number(ticker?.price || intraday[intraday.length - 1]?.close || last.close || 0);
  const box = darvasFindBox(daily, settings) || { boxTop: 0, boxBottom: 0, boxAge: 0, boxHeightPct: 0, closesInsidePct: 0 };
  const closes = daily.map(candle => Number(candle.close || 0));
  const volumes = daily.map(darvasQuoteVolume);
  const ema20 = darvasEma(closes, 20) || 0;
  const ema50 = darvasEma(closes, 50) || 0;
  const ema100 = darvasEma(closes, 100) || 0;
  const atr14 = darvasAtr(daily, 14);
  const avgVolume20 = darvasSma(volumes, 20, Math.max(0, volumes.length - 2)) || 0;
  const tickerTurnover = Number(ticker?.inrTurnover24h || ticker?.turnover24h || ticker?.usdVol24h || 0);
  const latestQuoteVolume = darvasQuoteVolume(last) || tickerTurnover / 24 || 0;
  const volumeRatio = avgVolume20 > 0 ? latestQuoteVolume / avgVolume20 : 0;
  const move1d = daily.length > 1 ? darvasPctChange(Number(last.close || price), Number(daily[daily.length - 2]?.close || 0)) : Number(ticker?.change24h || 0);
  const move4h = intraday.length > 16 ? darvasPctChange(Number(intraday[intraday.length - 1]?.close || price), Number(intraday[intraday.length - 17]?.close || 0)) : 0;
  const trendUp = price > ema20 && ema20 > ema50 && (!ema100 || ema50 >= ema100 * 0.97);
  const lowLiquidity = tickerTurnover > 0 && tickerTurnover < Number(settings.minUsdVolume24h || 0);
  const boxTop = Number(box.boxTop || 0);
  const boxBottom = Number(box.boxBottom || 0);
  const boxHeightPct = Number(box.boxHeightPct || 0);
  const nearTopPct = boxTop > 0 ? ((boxTop - price) / boxTop) * 100 : 999;
  const breakout = boxTop > 0 && price > boxTop && Number(last.close || price) > boxTop && volumeRatio >= Number(settings.breakoutVolumeRatio || 1.45);
  const nearBreakout = boxTop > 0 && price <= boxTop && nearTopPct >= 0 && nearTopPct <= Number(settings.nearTopPct || 2.5);
  const failedBreakout = boxTop > 0 && Number(last.high || 0) > boxTop && Number(last.close || 0) <= boxTop;
  const tightEnough = boxHeightPct > 0 && boxHeightPct <= Number(settings.maxBoxHeightPct || 32);
  const tightBox = boxHeightPct > 0 && boxHeightPct <= Number(settings.tightBoxHeightPct || 16);
  const insideBox = boxTop > 0 && boxBottom > 0 && price <= boxTop && price >= boxBottom;
  const base = insideBox && tightEnough && box.closesInsidePct >= 70;
  const reasons = [];
  const blockers = [];
  const scoreParts = {};
  if (trendUp) { scoreParts.trend = 20; reasons.push('Trend is above the Darvas momentum EMAs'); }
  else blockers.push('Trend stack is not clean yet');
  if (tightEnough) { scoreParts.boxQuality = tightBox ? 18 : 12; reasons.push(`Box height ${darvasRound(boxHeightPct, 2)}% is usable`); }
  else blockers.push('Box is too wide or not formed');
  if (box.closesInsidePct >= 70) scoreParts.boxRespect = 12;
  if (volumeRatio >= Number(settings.breakoutVolumeRatio || 1.45)) { scoreParts.volume = volumeRatio >= Number(settings.strongVolumeRatio || 2.2) ? 18 : 12; reasons.push(`Volume expanded ${darvasRound(volumeRatio, 2)}x`); }
  else blockers.push('Breakout volume is not confirmed');
  if (breakout) scoreParts.breakout = 20;
  else if (nearBreakout) scoreParts.nearTop = 12;
  else if (base) scoreParts.base = 8;
  if (lowLiquidity) { scoreParts.liquidityPenalty = -18; blockers.push('Liquidity below Darvas scanner threshold'); }
  if (failedBreakout) { scoreParts.failedBreakoutPenalty = -18; blockers.push('Price broke the box top and closed back inside'); }
  if (boxTop <= 0 || boxBottom <= 0) blockers.push('No valid Darvas box yet');

  let eventType = 'review';
  let signal = 'IGNORE';
  let actionLabel = 'Wait for box proof';
  let priorityLabel = 'Review';
  if (failedBreakout) {
   eventType = 'failed_breakout';
   signal = 'IGNORE';
   actionLabel = 'Skip failed breakout';
   priorityLabel = 'Failed box';
  } else if (breakout && trendUp && tightEnough && !lowLiquidity) {
   eventType = 'breakout';
   signal = 'BUY';
   actionLabel = 'Buy breakout';
   priorityLabel = 'Action';
  } else if (nearBreakout && trendUp && tightEnough && !lowLiquidity) {
   eventType = 'near_breakout';
   signal = 'WATCHLIST';
   actionLabel = 'Watch box top';
   priorityLabel = 'Near trigger';
  } else if (base && trendUp && !lowLiquidity) {
   eventType = 'base';
   signal = 'WATCHLIST';
   actionLabel = 'Build watch';
   priorityLabel = 'Base forming';
  } else if (lowLiquidity || !tightEnough) {
   eventType = 'avoid_box';
   signal = 'IGNORE';
   actionLabel = 'Avoid weak box';
   priorityLabel = lowLiquidity ? 'Thin market' : 'Wide box';
  }

  let score = 42 + Object.values(scoreParts).reduce((sum, value) => sum + Number(value || 0), 0);
  if (eventType === 'review') score = Math.min(score, 54);
  if (eventType === 'avoid_box' || eventType === 'failed_breakout') score = Math.min(score, 48);
  score = Math.max(1, Math.min(96, Math.round(score)));
  const risk = Math.max(0, price - boxBottom);
  const boxHeight = Math.max(0, boxTop - boxBottom);
  const entry = breakout ? price : boxTop;
  const target1 = boxTop + boxHeight;
  const target2 = boxTop + boxHeight * 2;
  const riskFlags = [
   lowLiquidity ? 'Thin volume' : '',
   failedBreakout ? 'Failed breakout' : '',
   boxHeightPct > Number(settings.maxBoxHeightPct || 32) ? 'Wide box' : '',
   volumeRatio > 0 && volumeRatio < Number(settings.breakoutVolumeRatio || 1.45) ? 'Volume not confirmed' : '',
  ].filter(Boolean);

  return global.FWDTradeDeskStrategies.normalizeStrategyResult({
   symbol,
   strategyId: 'darvas',
   signal,
   direction: 'long',
   setupLabel: darvasEventLabel(eventType),
   eventType,
   actionLabel,
   priorityLabel,
   score,
   confidence: score,
   entry: darvasRound(entry, 8),
   stop: darvasRound(boxBottom, 8),
   triggerPrice: darvasRound(boxTop, 8),
   riskPercent: price > 0 && risk > 0 ? darvasRound((risk / price) * 100, 2) : 0,
   targets: {
    target1: darvasRound(target1, 8),
    target2R: darvasRound(target1, 8),
    target3R: darvasRound(target2, 8),
    boxTop: darvasRound(boxTop, 8),
    boxBottom: darvasRound(boxBottom, 8),
   },
   reasons: [...reasons, ...blockers].slice(0, 12),
   checks: {
    trendUp,
    tightBox,
    tightEnough,
    breakout,
    nearBreakout,
    base,
    failedBreakout,
    volumeConfirmed: volumeRatio >= Number(settings.breakoutVolumeRatio || 1.45),
    lowLiquidity,
    advisoryOnly: true,
   },
   riskFlags,
   raw: {
    eventType,
    eventLabel: darvasEventLabel(eventType),
    latestPrice: darvasRound(price, 8),
    boxTop: darvasRound(boxTop, 8),
    boxBottom: darvasRound(boxBottom, 8),
    boxAge: Number(box.boxAge || 0),
    boxStartTime: Number(box.startTime || 0),
    boxEndTime: Number(box.endTime || 0),
    boxHeightPct: darvasRound(boxHeightPct, 2),
    closesInsidePct: darvasRound(box.closesInsidePct || 0, 1),
    nearTopPct: darvasRound(nearTopPct, 2),
    ema20: darvasRound(ema20, 8),
    ema50: darvasRound(ema50, 8),
    ema100: darvasRound(ema100, 8),
    atr14: darvasRound(atr14, 8),
    change24h: darvasRound(Number(ticker?.change24h || move1d || 0), 2),
    move4h: darvasRound(move4h, 2),
    volumeRatio: darvasRound(volumeRatio, 2),
    latestQuoteVolume: darvasRound(latestQuoteVolume, 0),
    candleCount15m: intraday.length,
    candleCount1d: daily.length,
    riskFlags,
    scoreParts: darvasBuildScoreParts(scoreParts),
    decision: {
     whySelected: reasons.slice(0, 3),
     whyNotNow: blockers.slice(0, 3),
     nextAction: signal === 'BUY'
      ? 'Review box breakout on chart; scanner-only Darvas setup, no auto order is enabled.'
      : `${actionLabel}; wait for a clean close above the box top with volume.`,
    },
    chartLevels: {
     trigger: darvasRound(boxTop, 8),
     entry: darvasRound(entry, 8),
     stop: darvasRound(boxBottom, 8),
     target1: darvasRound(target1, 8),
     target2: darvasRound(target2, 8),
    },
    darvasBox: boxTop > 0 && boxBottom > 0 && boxTop > boxBottom ? {
     top: darvasRound(boxTop, 8),
     bottom: darvasRound(boxBottom, 8),
     age: Number(box.boxAge || 0),
     startTime: Number(box.startTime || 0),
     endTime: Number(box.endTime || 0),
     eventType,
     label: darvasEventLabel(eventType),
     volumeRatio: darvasRound(volumeRatio, 2),
    } : null,
    mode: 'scanner_only',
   },
  }, 'darvas');
 }

 async function runDarvasScan() {
  if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) throw new Error('Strategy registry not loaded');
  await darvasSetStatus('Loading Darvas box market data...', { active: true, progress: 2 });
  await chrome.storage.local.set({ 'strategyResults.darvas': [] });
  await detectAPI(true);
  const settings = await darvasLoadSettings();
  const tickerMap = await fetchAllTickers();
  const products = await fetchProducts().catch(() => []);
  const universe = darvasBuildUniverse(tickerMap, products, settings);
  const diagnostics = { tickerRows: Object.keys(tickerMap || {}).length, productRows: Array.isArray(products) ? products.length : 0, universeRows: universe.length };
  const skipped = { insufficientHistory: 0, fetchErrors: 0, reviewOnly: 0 };
  const results = [];
  for (let i = 0; i < universe.length; i += 1) {
   const item = universe[i];
   if (i % 5 === 0 || i === universe.length - 1) {
    await darvasSetStatus(`Scanning ${item.symbol} (${i + 1}/${universe.length})`, {
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
    const result = darvasAnalyzeSymbol(item.symbol, daily, Array.isArray(intraday) ? intraday : [], item.ticker, { settings });
    if (result.eventType === 'review') skipped.reviewOnly += 1;
    results.push(result);
   } catch (error) {
    skipped.fetchErrors += 1;
    darvasLog(`${item.symbol} skipped: ${error?.message || error}`);
   }
  }
  const output = darvasSortRows(results).slice(0, Math.max(20, Number(settings.outputLimit || DARVAS_DEFAULT_SETTINGS.outputLimit)));
  const counts = darvasSignalCounts(output);
  await chrome.storage.local.set({
   'strategyResults.darvas': output,
   'strategyStatus.darvas': {
    strategyId: 'darvas',
    status: `OK Done - ${output.length} Darvas rows | Breakout ${counts.breakout || 0}, Near ${counts.near_breakout || 0}, Base ${counts.base || 0}, Failed ${counts.failed_breakout || 0}`,
    active: false,
    progress: 100,
    scanned: results.length,
    total: universe.length,
    eventCounts: counts,
    skipped,
    diagnostics,
    lastScanTs: darvasNow(),
    ts: darvasNow(),
   },
   darvasLastScanTs: darvasNow(),
  });
  darvasLog(`scan done: ${output.length} results`);
  return output;
 }

 async function runDarvasScanFromContext(context) {
  if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) throw new Error('Strategy registry not loaded');
  if (!context?.scanId) throw new Error('Fresh main scan context is required');
  await darvasSetStatus('Deriving Darvas rows from main scan...', { active: true, progress: 5, scanId: context.scanId });
  await chrome.storage.local.set({ 'strategyResults.darvas': [] });
  const settings = await darvasLoadSettings();
  const tickerMap = context.tickerMap || {};
  const products = Array.isArray(context.products) ? context.products : [];
  const universe = darvasBuildUniverse(tickerMap, products, settings);
  const diagnostics = { tickerRows: Object.keys(tickerMap || {}).length, productRows: products.length, universeRows: universe.length };
  const skipped = { insufficientHistory: 0, fetchErrors: 0, reviewOnly: 0, noContextCandles: 0 };
  const getContextCandles = globalThis.FWDTradeDeskScanContext?.getCandles;
  const results = [];
  for (let i = 0; i < universe.length; i += 1) {
   const item = universe[i];
   if (i % 10 === 0 || i === universe.length - 1) {
    await darvasSetStatus(`Deriving ${item.symbol} (${i + 1}/${universe.length})`, {
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
    const result = darvasAnalyzeSymbol(item.symbol, daily, intraday, item.ticker, { settings });
    if (result.eventType === 'review') skipped.reviewOnly += 1;
    results.push(result);
   } catch (error) {
    skipped.fetchErrors += 1;
    darvasLog(`${item.symbol} derive skipped: ${error?.message || error}`);
   }
  }
  const output = darvasSortRows(results).slice(0, Math.max(20, Number(settings.outputLimit || DARVAS_DEFAULT_SETTINGS.outputLimit)));
  const counts = darvasSignalCounts(output);
  await chrome.storage.local.set({
   'strategyResults.darvas': output,
   'strategyStatus.darvas': {
    strategyId: 'darvas',
    status: `Derived - ${output.length} Darvas rows from main scan | Breakout ${counts.breakout || 0}, Near ${counts.near_breakout || 0}, Base ${counts.base || 0}`,
    active: false,
    progress: 100,
    scanned: results.length,
    total: universe.length,
    eventCounts: counts,
    skipped,
    diagnostics,
    source: 'main_scan_context',
    scanId: context.scanId,
    lastScanTs: darvasNow(),
    ts: darvasNow(),
   },
   darvasLastScanTs: darvasNow(),
  });
  return output;
 }

 function getDarvasSnapshot(callback) {
  chrome.storage.local.get([
   'strategyResults.darvas',
   'strategyStatus.darvas',
   'strategySettings.darvas',
  ], data => {
   callback({
    ok: true,
    darvas: {
     results: Array.isArray(data['strategyResults.darvas']) ? data['strategyResults.darvas'] : [],
     status: data['strategyStatus.darvas'] || {},
     settings: data['strategySettings.darvas'] || DARVAS_DEFAULT_SETTINGS,
    },
   });
  });
 }

 chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (typeof isTrustedRuntimeSender === 'function' && !isTrustedRuntimeSender(sender)) {
   sendResponse({ ok: false, error: 'Unauthorized sender' });
   return false;
  }
  if (msg?.action === 'darvas:startScan') {
   const context = globalThis.FWDTradeDeskScanContext?.getFresh?.();
   const runner = context ? () => runDarvasScanFromContext(context) : (msg?.forceIndependent === true ? runDarvasScan : null);
   if (!runner) {
    darvasSetStatus('Run main scan first - Darvas will derive from shared scan data', { active: false, progress: 0 })
    .finally(() => sendResponse({ ok: false, error: 'Run main scan first' }));
    return true;
   }
   runner()
   .then(results => sendResponse({ ok: true, count: results.length }))
   .catch(async error => {
    await darvasSetStatus(`Darvas scan failed - ${error?.message || error}`, { active: false, progress: 0 });
    sendResponse({ ok: false, error: error?.message || String(error) });
   });
   return true;
  }
  if (msg?.action === 'darvas:getResults') {
   getDarvasSnapshot(sendResponse);
   return true;
  }
  if (msg?.action === 'darvas:clearResults') {
   chrome.storage.local.set({
    'strategyResults.darvas': [],
    'strategyStatus.darvas': { strategyId: 'darvas', status: 'Darvas results cleared', active: false, progress: 0, ts: darvasNow() },
   }, () => sendResponse({ ok: true }));
   return true;
  }
  return false;
 });

 global.FWDTradeDeskDarvasScanner = Object.freeze({
  DARVAS_DEFAULT_SETTINGS,
  darvasAnalyzeSymbol,
  darvasSignalCounts,
  darvasSortRows,
  darvasBuildScoreParts,
  darvasEventLabel,
  darvasFindBox,
  runDarvasScan,
  runDarvasScanFromContext,
 });
})(globalThis);
