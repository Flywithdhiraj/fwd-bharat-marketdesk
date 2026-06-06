'use strict';

(function initRadarScanner(global) {
 const RADAR_DEFAULT_SETTINGS = Object.freeze({
  maxCoins: 500,
  outputLimit: 500,
  focusLimit: 10,
  freshListingLimit: 5,
  minUsdVolume24h: 75000,
  preferredIntradayCandles: 120,
  minIntradayCandles: 24,
  preferredDailyCandles: 120,
  minDailyCandles: 30,
  freshListingFirstSeenHours: 72,
  volumeRatioTrigger: 1.8,
  strongVolumeRatio: 3,
  pressureMovePct: 5,
  heavyPressureMovePct: 10,
  breakoutLookback: 36,
  vwapTolerancePct: 0.012,
  replayHorizons: Object.freeze([
   ['4h', 4 * 60 * 60000],
   ['1h', 60 * 60000],
   ['4h', 4 * 60 * 60000],
  ]),
 });

 const CLOSED_4H = Object.freeze({ closedOnly: true, timeoutMs: 30000, paceMs: 1800 });
 const CLOSED_DAILY = Object.freeze({ closedOnly: true, timeoutMs: 30000, paceMs: 1800 });

 function radarNow() {
  return Date.now();
 }

 function radarLog(message) {
  if (typeof global.dlog === 'function') global.dlog(`[RADAR] ${message}`);
  else console.log(`[RADAR] ${message}`);
 }

 function radarRound(value, decimals = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const m = 10 ** decimals;
  return Math.round(n * m) / m;
 }

 function radarSma(values = [], period = 20, endIndex = values.length - 1) {
  if (!Array.isArray(values) || period <= 0 || endIndex < period - 1) return null;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i += 1) {
   const value = Number(values[i]);
   if (!Number.isFinite(value)) return null;
   sum += value;
  }
  return sum / period;
 }

 function radarEma(values = [], period = 20) {
  const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (nums.length < period) return null;
  const k = 2 / (period + 1);
  let value = nums.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (let i = period; i < nums.length; i += 1) value = nums[i] * k + value * (1 - k);
  return value;
 }

 function radarAtr(candles = [], period = 14) {
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
  return radarSma(trs, period) || 0;
 }

 function radarQuoteVolume(candle = {}) {
  const quoteVolume = Number(candle.quote_volume ?? candle.quoteVolume ?? candle.turnover ?? candle.turnover_usd ?? 0);
  if (Number.isFinite(quoteVolume) && quoteVolume > 0) return quoteVolume;
  const volume = Number(candle.volume || 0);
  const close = Number(candle.close || 0);
  return volume > 0 && close > 0 ? volume * close : 0;
 }

 function radarObv(candles = []) {
  const out = [];
  let value = 0;
  for (let i = 0; i < candles.length; i += 1) {
   const close = Number(candles[i]?.close || 0);
   const prev = Number(candles[i - 1]?.close || close);
   const volume = Number(candles[i]?.volume || 0);
   if (i > 0 && close > prev) value += volume;
   else if (i > 0 && close < prev) value -= volume;
   out.push(value);
  }
  return out;
 }

 function radarVwap(candles = []) {
  let pv = 0;
  let vol = 0;
  (Array.isArray(candles) ? candles : []).forEach(candle => {
   const high = Number(candle?.high || candle?.close || 0);
   const low = Number(candle?.low || candle?.close || 0);
   const close = Number(candle?.close || 0);
   const volume = Number(candle?.volume || 0);
   const typical = (high + low + close) / 3;
   if (typical > 0 && volume > 0) {
    pv += typical * volume;
    vol += volume;
   }
  });
  return vol > 0 ? pv / vol : 0;
 }

 function radarPctChange(now = 0, prev = 0) {
  const a = Number(now || 0);
  const b = Number(prev || 0);
  if (!(a > 0) || !(b > 0)) return 0;
  return ((a - b) / b) * 100;
 }

 function radarHighLow(candles = [], lookback = 36) {
  const rows = (Array.isArray(candles) ? candles : []).slice(-Math.max(3, lookback + 1), -1);
  const highs = rows.map(c => Number(c.high || c.close || 0)).filter(value => value > 0);
  const lows = rows.map(c => Number(c.low || c.close || 0)).filter(value => value > 0);
  return {
   resistance: highs.length ? Math.max(...highs) : 0,
   support: lows.length ? Math.min(...lows) : 0,
  };
 }

 function radarMedian(values = []) {
  const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
 }

 function radarBuildFirstSeenMap(symbols = [], prior = {}, now = radarNow()) {
  const next = {};
  Object.entries(prior && typeof prior === 'object' ? prior : {}).forEach(([symbol, ts]) => {
   const safeSymbol = String(symbol || '').toUpperCase();
   const safeTs = Number(ts || 0);
   if (safeSymbol && safeTs > 0 && now - safeTs < 30 * 86400000) next[safeSymbol] = safeTs;
  });
  symbols.forEach(symbol => {
   const safeSymbol = String(symbol || '').toUpperCase();
   if (safeSymbol && !next[safeSymbol]) next[safeSymbol] = now;
  });
  return next;
 }

 function radarLoadStored(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
 }

 async function radarSetStatus(status, extra = {}) {
  await chrome.storage.local.set({
   'strategyStatus.radar': {
    strategyId: 'radar',
    status,
    ts: radarNow(),
    ...extra,
   },
  });
 }

async function radarLoadSettings() {
 const stored = await radarLoadStored(['strategySettings.radar']);
  const settings = {
   ...RADAR_DEFAULT_SETTINGS,
   ...(stored['strategySettings.radar'] || {}),
  };
  settings.maxCoins = Math.max(RADAR_DEFAULT_SETTINGS.maxCoins, Number(settings.maxCoins || 0));
  settings.outputLimit = Math.max(RADAR_DEFAULT_SETTINGS.outputLimit, Number(settings.outputLimit || 0));
  return settings;
 }

 function radarBuildUniverse(tickerMap = {}, products = [], firstSeenMap = {}, settings = RADAR_DEFAULT_SETTINGS) {
  const productSymbols = new Set((Array.isArray(products) ? products : []).map(item => String(item.symbol || '').toUpperCase()));
  const now = radarNow();
  const freshMs = Number(settings.freshListingFirstSeenHours || settings.newCoinFirstSeenHours || 72) * 3600000;
  return Object.entries(tickerMap || {})
  .filter(([symbol, ticker]) => {
   const sym = String(symbol || '').toUpperCase();
 if (!sym || productSymbols.size && !productSymbols.has(sym)) return false;
 if (!(Number(ticker?.price || 0) > 0)) return false;
   const firstSeen = Number(firstSeenMap[sym] || now);
   const fresh = now - firstSeen <= freshMs;
   const turnover = Number(ticker?.inrTurnover24h || ticker?.turnover24h || ticker?.usdVol24h || 0);
   return fresh || !(turnover > 0) || turnover >= Number(settings.minUsdVolume24h || 0);
  })
  .map(([symbol, ticker]) => ({
   symbol: String(symbol || '').toUpperCase(),
   ticker,
   firstSeenTs: Number(firstSeenMap[String(symbol || '').toUpperCase()] || now),
  }))
  .sort((a, b) => {
   const aFresh = now - Number(a.firstSeenTs || now) <= freshMs ? 1 : 0;
   const bFresh = now - Number(b.firstSeenTs || now) <= freshMs ? 1 : 0;
   return bFresh - aFresh || Number(b.ticker?.usdVol24h || 0) - Number(a.ticker?.usdVol24h || 0);
  })
  .slice(0, Math.max(20, Number(settings.maxCoins || RADAR_DEFAULT_SETTINGS.maxCoins)));
 }

 function radarSignalCounts(results = []) {
  return (Array.isArray(results) ? results : []).reduce((acc, row) => {
   const eventType = String(row?.eventType || row?.raw?.eventType || 'review');
   acc[eventType] = (acc[eventType] || 0) + 1;
   if (row.signal === 'BUY') acc.buy += 1;
   if (row.signal === 'SELL') acc.sell += 1;
   if (row.signal === 'WATCHLIST') acc.watch += 1;
   if (row.signal === 'IGNORE') acc.avoid += 1;
   return acc;
  }, { buy: 0, sell: 0, watch: 0, avoid: 0, breakout: 0, ema_obv: 0, pressure: 0, fresh_listing: 0, new_coin: 0, vwap: 0, avoid_trap: 0, review: 0 });
 }

 function radarBuildScoreParts(parts = {}) {
  const rows = [
   ['Base event', Number(parts.base || 0)],
   ['Volume expansion', Number(parts.volume || 0)],
   ['EMA structure', Number(parts.ema || 0)],
   ['OBV validation', Number(parts.obv || 0)],
   ['Resistance/support break', Number(parts.level || 0)],
   ['VWAP decision', Number(parts.vwap || 0)],
   ['Fresh listing activity', Number(parts.newCoin || 0)],
   ['Thin volume penalty', Number(parts.liquidityPenalty || 0)],
   ['Extended candle penalty', Number(parts.extensionPenalty || 0)],
  ].filter(([, value]) => value !== 0);
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  return {
   rows: rows.map(([label, value]) => ({ label, value: radarRound(value, 0) })),
   total: radarRound(total, 0),
  };
 }

 function radarBuildNewCoinTimeline(row = {}) {
  const firstSeenTs = Number(row.firstSeenTs || 0);
  const price = Number(row.price || 0);
  const candles = Array.isArray(row.intradayCandles) ? row.intradayCandles : [];
  const lows = candles.map(c => Number(c.low || c.close || 0)).filter(v => v > 0);
  const highs = candles.map(c => Number(c.high || c.close || 0)).filter(v => v > 0);
  const first = candles[0] || {};
  const firstPrice = Number(first.open || first.close || price || 0);
  const maxHigh = highs.length ? Math.max(...highs) : price;
  const minLow = lows.length ? Math.min(...lows) : price;
  const pumpPct = firstPrice > 0 && maxHigh > 0 ? radarPctChange(maxHigh, firstPrice) : 0;
  const pullbackPct = maxHigh > 0 && price > 0 ? radarPctChange(price, maxHigh) : 0;
  return {
   firstSeenTs,
   firstPrice: radarRound(firstPrice, 8),
   maxHigh: radarRound(maxHigh, 8),
   minLow: radarRound(minLow, 8),
   currentPrice: radarRound(price, 8),
   maxPumpPct: radarRound(pumpPct, 2),
   pullbackFromHighPct: radarRound(pullbackPct, 2),
   ageMinutes: firstSeenTs > 0 ? Math.max(0, Math.round((radarNow() - firstSeenTs) / 60000)) : 0,
  };
 }

 function radarReplayKey(row = {}) {
  return `${String(row.symbol || '').toUpperCase()}:${String(row.eventType || row.raw?.eventType || 'review')}:${Number(row.ts || 0)}`;
 }

 function radarReplayDirection(row = {}) {
  return String(row.direction || '').includes('short') ? 'short' : 'long';
 }

 function radarReplayReturnPct(row = {}, currentPrice = 0) {
  const entry = Number(row.entry || row.raw?.latestPrice || 0);
  const price = Number(currentPrice || 0);
  if (!(entry > 0) || !(price > 0)) return 0;
  const raw = radarPctChange(price, entry);
  return radarReplayDirection(row) === 'short' ? -raw : raw;
 }

 function radarUpdateReplayTracker(previousRows = [], tickerMap = {}, priorTracker = {}, settings = RADAR_DEFAULT_SETTINGS) {
  const now = radarNow();
  const tracker = priorTracker && typeof priorTracker === 'object' ? { ...priorTracker } : {};
  const resolved = [];
  Object.entries(tracker).forEach(([key, item]) => {
   if (!item || typeof item !== 'object') {
    delete tracker[key];
    return;
   }
   const symbol = String(item.symbol || '').toUpperCase();
   const ticker = tickerMap[symbol] || {};
   const price = Number(ticker.price || 0);
   const horizons = Array.isArray(item.horizons) ? item.horizons : [];
   let changed = false;
   horizons.forEach(horizon => {
    if (horizon.done || now < Number(horizon.dueTs || 0) || !(price > 0)) return;
    horizon.done = true;
    horizon.price = radarRound(price, 8);
    horizon.returnPct = radarRound(radarReplayReturnPct(item, price), 2);
    horizon.hit = horizon.returnPct > 0;
    changed = true;
    resolved.push({ symbol, label: horizon.label, returnPct: horizon.returnPct, hit: horizon.hit });
   });
   item.updatedTs = changed ? now : Number(item.updatedTs || now);
   if (now - Number(item.ts || now) > 24 * 3600000) delete tracker[key];
  });
  (Array.isArray(previousRows) ? previousRows : []).slice(0, 60).forEach(row => {
   const key = radarReplayKey(row);
   if (!key || tracker[key] || !row?.symbol || !(Number(row.entry || 0) > 0)) return;
   tracker[key] = {
    key,
    symbol: String(row.symbol || '').toUpperCase(),
    eventType: row.eventType || row.raw?.eventType || 'review',
    direction: radarReplayDirection(row),
    entry: Number(row.entry || 0),
    score: Number(row.score || 0),
    ts: Number(row.ts || now),
    horizons: (settings.replayHorizons || RADAR_DEFAULT_SETTINGS.replayHorizons).map(([label, ms]) => ({
     label,
     dueTs: Number(row.ts || now) + Number(ms || 0),
     done: false,
     price: 0,
     returnPct: 0,
     hit: false,
    })),
   };
  });
  const completed = Object.values(tracker).filter(item => Array.isArray(item.horizons) && item.horizons.some(h => h.done));
  const doneHorizons = completed.flatMap(item => item.horizons.filter(h => h.done));
  const wins = doneHorizons.filter(h => h.hit).length;
  return {
   tracker,
   summary: {
    tracked: Object.keys(tracker).length,
    completed: doneHorizons.length,
    winRate: doneHorizons.length ? radarRound((wins / doneHorizons.length) * 100, 1) : 0,
    lastResolved: resolved.slice(-8),
   },
  };
 }

 function radarAttachReplay(rows = [], tracker = {}) {
  return (Array.isArray(rows) ? rows : []).map(row => {
   const matches = Object.values(tracker || {})
   .filter(item => String(item.symbol || '').toUpperCase() === String(row.symbol || '').toUpperCase())
   .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
   const latest = matches[0] || null;
   return {
    ...row,
    raw: {
     ...(row.raw || {}),
     replay: latest ? {
      eventType: latest.eventType,
      entry: latest.entry,
      ts: latest.ts,
      horizons: latest.horizons,
     } : null,
    },
   };
  });
 }

 function radarNotificationRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
  .filter(row => ['breakout', 'pressure', 'fresh_listing', 'new_coin', 'ema_obv'].includes(String(row.eventType || row.raw?.eventType || '')))
  .filter(row => Number(row.score || 0) >= 78)
  .slice(0, 4);
 }

 function radarNotificationState(row = {}) {
  return {
   setupKey: `${String(row.symbol || '').toUpperCase()}:${String(row.eventType || row.raw?.eventType || '')}`,
   score: Math.round(Number(row.score || 0)),
   ts: radarNow(),
  };
 }

 function radarShouldInterruptForSetup(row = {}, prior = {}) {
  const next = radarNotificationState(row);
  if (!next.setupKey || next.score < 78) return { ok: false, next };
  if (!prior || typeof prior !== 'object' || !prior.setupKey) return { ok: true, next };
  if (next.setupKey !== String(prior.setupKey || '')) return { ok: true, next };
  if (next.score >= Number(prior.score || 0) + 8) return { ok: true, next };
  if (radarNow() - Number(prior.ts || 0) > 4 * 60 * 60 * 1000) return { ok: true, next };
  return { ok: false, next };
 }

 async function radarMaybeNotify(rows = [], settings = RADAR_DEFAULT_SETTINGS) {
  const data = await radarLoadStored(['strategyLabScannerNotificationsEnabled', 'strategyLabRadarNotificationsEnabled', 'strategyLabRadarLastNotificationKey', 'strategyLabRadarLastNotificationState']);
  if (data.strategyLabScannerNotificationsEnabled !== true || data.strategyLabRadarNotificationsEnabled !== true) return;
  const picked = radarNotificationRows(rows)[0];
  if (!picked) return;
  const interrupt = radarShouldInterruptForSetup(picked, data.strategyLabRadarLastNotificationState);
  if (!interrupt.ok) return;
  const key = `${picked.symbol}:${picked.eventType}:${Math.floor(radarNow() / 3600000)}`;
  if (key === data.strategyLabRadarLastNotificationKey) return;
  await chrome.storage.local.set({ strategyLabRadarLastNotificationKey: key, strategyLabRadarLastNotificationState: interrupt.next });
  const eventLabel = picked.raw?.eventLabel || picked.setupLabel || 'Radar event';
  const title = `[Radar] ${picked.symbol} ${eventLabel}`;
  const message = `${picked.actionLabel || 'Review'} | Score ${Math.round(Number(picked.score || 0))} | ${picked.raw?.volumeRatio ? `${picked.raw.volumeRatio}x volume` : 'Radar active'}`;
  if (typeof v16PushNotificationFeed === 'function') {
   await v16PushNotificationFeed({
    tone: Number(picked.score || 0) >= 78 ? 'success' : 'info',
    title,
    symbol: picked.symbol,
    sourceScannerId: 'radar',
    sourceScannerName: 'Live Radar',
    sourceType: 'scanner',
    what: `${picked.actionLabel || 'Review'} | Score ${Math.round(Number(picked.score || 0))} | ${eventLabel}`,
    why: Array.isArray(picked.reasons) && picked.reasons.length ? picked.reasons.slice(0, 3).join(' | ') : 'Radar detected live market activity worth checking.',
    next: 'Open Strategy Lab or the chart to verify entry, stop, volume, and trend context.',
    action: 'Use this as an alert, not an automatic live-trade command.',
   }).catch(() => null);
  }
  try {
   chrome.notifications?.create?.(`fwd-radar-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 1,
   });
  } catch (error) {
   radarLog(`Notification skipped: ${error?.message || error}`);
  }
 }

 function radarEventLabel(eventType = '') {
  const type = String(eventType || '').toLowerCase();
  if (type === 'breakout') return 'Breaking Resistance';
  if (type === 'ema_obv') return 'EMA + OBV Valid';
  if (type === 'pressure') return 'Pressure Move';
  if (type === 'fresh_listing' || type === 'new_coin') return 'Fresh Listing Active';
  if (type === 'vwap') return 'VWAP Retest';
  if (type === 'avoid_trap') return 'Avoid / Trap';
  return 'Review';
 }

 function radarAnalyzeSymbol(symbol = '', intradayCandles = [], dailyCandles = [], ticker = {}, context = {}) {
  const settings = context.settings || RADAR_DEFAULT_SETTINGS;
  const rows = Array.isArray(intradayCandles) ? intradayCandles : [];
  const daily = Array.isArray(dailyCandles) ? dailyCandles : [];
  const latest = rows[rows.length - 1] || {};
  const price = Number(ticker?.price || latest.close || 0);
  const closes = rows.map(candle => Number(candle.close || 0));
  const volumes = rows.map(candle => Number(candle.volume || 0));
  const quoteVolumes = rows.map(radarQuoteVolume);
  const latestVolume = Number(volumes[volumes.length - 1] || 0);
  const avgVolume20 = radarSma(volumes, 20) || radarMedian(volumes.slice(-30));
  const latestQuoteVolume = Number(quoteVolumes[quoteVolumes.length - 1] || 0);
  const avgQuoteVolume20 = radarSma(quoteVolumes, 20) || radarMedian(quoteVolumes.slice(-30));
  const volumeRatio = avgVolume20 > 0 ? latestVolume / avgVolume20 : 0;
  const ema9 = radarEma(closes, 9);
  const ema30 = radarEma(closes, 30);
  const ema100 = radarEma(closes, 100);
  const obvSeries = radarObv(rows);
  const obvNow = Number(obvSeries[obvSeries.length - 1] || 0);
  const obvPrev = Number(obvSeries[Math.max(0, obvSeries.length - 12)] || 0);
  const obvSlope = obvNow - obvPrev;
  const vwap = radarVwap(rows.slice(-96));
  const levels = radarHighLow(rows, Number(settings.breakoutLookback || 36));
  const atr14 = radarAtr(rows, 14);
  const prior4h = closes.length > 16 ? closes[closes.length - 17] : 0;
  const move4h = radarPctChange(price, prior4h);
  const dailyMove = Number(ticker?.change24h || 0) || (daily.length > 1 ? radarPctChange(price, Number(daily[daily.length - 2]?.close || 0)) : 0);
  const firstSeenTs = Number(context.firstSeenTs || radarNow());
  const isFirstSeenNew = radarNow() - firstSeenTs <= Number(settings.freshListingFirstSeenHours || settings.newCoinFirstSeenHours || 72) * 3600000;
  const isShortHistory = rows.length < Number(settings.minIntradayCandles || 36) || daily.length < Number(settings.minDailyCandles || 30);
  const isNewCoin = isFirstSeenNew || isShortHistory;
  const emaBull = ema9 > 0 && ema30 > 0 && ema100 > 0 && ema9 > ema30 && ema30 > ema100 && price >= ema9 * 0.995;
  const emaBear = ema9 > 0 && ema30 > 0 && ema100 > 0 && ema9 < ema30 && ema30 < ema100 && price <= ema9 * 1.005;
  const obvUp = obvSlope > Math.max(0, Math.abs(obvPrev) * 0.015);
  const obvDown = obvSlope < -Math.max(0, Math.abs(obvPrev) * 0.015);
  const breakout = levels.resistance > 0 && price > levels.resistance * 1.002 && volumeRatio >= Number(settings.volumeRatioTrigger || 1.8);
  const breakdown = levels.support > 0 && price < levels.support * 0.998 && volumeRatio >= Number(settings.volumeRatioTrigger || 1.8);
  const vwapReclaim = vwap > 0 && price > vwap && Math.abs(price - vwap) / vwap <= Number(settings.vwapTolerancePct || 0.012) && volumeRatio >= 1.15;
  const vwapLoss = vwap > 0 && price < vwap && Math.abs(price - vwap) / vwap <= Number(settings.vwapTolerancePct || 0.012) && volumeRatio >= 1.15;
  const pressureDown = dailyMove <= -Number(settings.pressureMovePct || 5) || move4h <= -3 || (breakdown && obvDown);
  const pressureUp = dailyMove >= Number(settings.pressureMovePct || 5) || move4h >= 3;
  const tickerTurnover = Number(ticker?.inrTurnover24h || ticker?.turnover24h || ticker?.usdVol24h || 0);
  const lowLiquidity = tickerTurnover > 0 && tickerTurnover < Number(settings.minUsdVolume24h || 0);
  const extended = atr14 > 0 && Math.abs(price - Number(closes[Math.max(0, closes.length - 8)] || price)) > atr14 * 3.2;
  const riskFlags = [
   lowLiquidity ? 'Thin volume' : '',
   extended ? 'Extended candle' : '',
   isShortHistory ? 'Short history' : '',
  ].filter(Boolean);
  const checks = {
   breakout,
   breakdown,
   emaBull,
   emaBear,
   obvUp,
   obvDown,
   volumeExpansion: volumeRatio >= Number(settings.volumeRatioTrigger || 1.8),
   strongVolume: volumeRatio >= Number(settings.strongVolumeRatio || 3),
   vwapReclaim,
   vwapLoss,
   pressureDown,
   pressureUp,
   isNewCoin,
   lowLiquidity,
   extended,
   advisoryOnly: true,
  };

  let eventType = 'review';
  let signal = 'WATCHLIST';
  let direction = 'watch_long';
  let actionLabel = 'Watch only';
  let priorityLabel = 'Review';
  let score = 30;
  const scoreParts = { base: 30 };
  const reasons = [];
  const blockers = [];

  if (breakout && emaBull && obvUp) {
   eventType = 'breakout';
   signal = 'BUY';
   direction = 'long';
   actionLabel = 'Preview long';
   priorityLabel = 'Best now';
   score = 82;
   scoreParts.base = 42;
   scoreParts.level = 18;
   scoreParts.ema = 12;
   scoreParts.obv = 10;
   reasons.push('Resistance break with volume expansion');
   reasons.push('EMA 9/30/100 aligned upward');
   reasons.push('OBV confirms accumulation');
  } else if (emaBull && obvUp && volumeRatio >= 1.15) {
   eventType = 'ema_obv';
   signal = 'WATCHLIST';
   direction = 'watch_long';
   actionLabel = 'Wait for trigger';
   priorityLabel = 'Near entry';
   score = 72;
   scoreParts.base = 36;
   scoreParts.ema = 20;
   scoreParts.obv = 12;
   reasons.push('EMA 9/30/100 aligned upward');
   reasons.push('OBV confirms buyer pressure');
  } else if (pressureDown) {
   eventType = 'pressure';
   signal = breakdown ? 'SELL' : 'WATCHLIST';
   direction = breakdown ? 'short' : 'watch_short';
   actionLabel = breakdown ? 'Preview short' : 'Watch pressure';
   priorityLabel = dailyMove <= -Number(settings.heavyPressureMovePct || 10) ? 'Heavy pressure' : 'Pressure watch';
   score = breakdown ? 76 : 66;
   scoreParts.base = breakdown ? 38 : 34;
   scoreParts.level = breakdown ? 14 : 0;
   scoreParts.obv = obvDown ? 10 : 0;
   reasons.push(`${radarRound(dailyMove, 2)}% 24h move pressure`);
   if (breakdown) reasons.push('Support break with volume');
   if (obvDown) reasons.push('OBV confirms distribution');
  } else if (isNewCoin && (pressureUp || volumeRatio >= 1.5 || vwapReclaim)) {
   eventType = 'new_coin';
   signal = 'WATCHLIST';
   direction = pressureDown ? 'watch_short' : 'watch_long';
   actionLabel = 'Fresh listing watch';
   priorityLabel = 'Fresh opportunity';
   score = 68;
   scoreParts.base = 34;
   scoreParts.newCoin = 18;
   reasons.push(isFirstSeenNew ? 'Product first seen recently' : 'Limited candle history');
   reasons.push(volumeRatio >= 1.5 ? 'Early volume expansion' : 'Fresh market structure forming');
  } else if (vwapReclaim || vwapLoss) {
   eventType = 'vwap';
   signal = 'WATCHLIST';
   direction = vwapReclaim ? 'watch_long' : 'watch_short';
   actionLabel = vwapReclaim ? 'Watch reclaim' : 'Watch VWAP loss';
   priorityLabel = 'VWAP decision';
   score = 61;
   scoreParts.base = 33;
   scoreParts.vwap = 18;
   reasons.push(vwapReclaim ? 'Price reclaimed VWAP area' : 'Price losing VWAP area');
  }

  if (lowLiquidity || extended || (eventType === 'review' && !checks.volumeExpansion)) {
   blockers.push(lowLiquidity ? 'Liquidity below radar threshold' : '');
   blockers.push(extended ? 'Move is extended versus ATR' : '');
   blockers.push(!checks.volumeExpansion ? 'Volume expansion not confirmed' : '');
  }
  if (riskFlags.length && score < 78) {
   eventType = eventType === 'review' ? 'avoid_trap' : eventType;
   if (lowLiquidity || extended) {
    signal = signal === 'BUY' ? 'WATCHLIST' : signal;
    priorityLabel = lowLiquidity ? 'Thin market' : priorityLabel;
   }
  }

  scoreParts.volume = checks.strongVolume ? 7 : checks.volumeExpansion ? 4 : 0;
  scoreParts.newCoin += isNewCoin ? 4 : 0;
  scoreParts.liquidityPenalty = lowLiquidity ? -18 : 0;
  scoreParts.extensionPenalty = extended ? -10 : 0;
  score += scoreParts.volume;
  score += isNewCoin ? 4 : 0;
  score += scoreParts.liquidityPenalty;
  score += scoreParts.extensionPenalty;
  score = Math.max(1, Math.min(96, Math.round(score)));

  const riskDistance = Math.max(atr14 * 1.4, price * 0.018);
  const longStop = price > 0 ? Math.max(0, price - riskDistance) : 0;
  const shortStop = price > 0 ? price + riskDistance : 0;
  const isShort = String(direction).includes('short');
  const entry = price;
  const stop = isShort ? shortStop : longStop;
  const risk = Math.abs(entry - stop);
  const target1 = isShort ? entry - risk * 1.5 : entry + risk * 1.5;
  const target2 = isShort ? entry - risk * 2.5 : entry + risk * 2.5;

  return global.FWDTradeDeskStrategies.normalizeStrategyResult({
   symbol,
   strategyId: 'radar',
   signal,
   direction,
   setupLabel: radarEventLabel(eventType),
   eventType,
   actionLabel,
   priorityLabel,
   score,
   confidence: score,
   entry: radarRound(entry, 8),
   stop: radarRound(stop, 8),
   riskPercent: entry > 0 && risk > 0 ? radarRound((risk / entry) * 100, 2) : 0,
   targets: {
    target1: radarRound(target1, 8),
    target2R: radarRound(target1, 8),
    target3R: radarRound(target2, 8),
    resistance: radarRound(levels.resistance, 8),
    support: radarRound(levels.support, 8),
    vwap: radarRound(vwap, 8),
   },
   reasons: [...reasons, ...blockers.filter(Boolean)].slice(0, 12),
   checks,
   riskFlags,
   raw: {
    eventType,
    eventLabel: radarEventLabel(eventType),
    latestPrice: radarRound(price, 8),
    move4h: radarRound(move4h, 2),
    change24h: radarRound(dailyMove, 2),
    volumeRatio: radarRound(volumeRatio, 2),
    latestQuoteVolume: radarRound(Math.max(latestQuoteVolume, Number(ticker?.usdVol24h || 0)), 0),
    avgQuoteVolume20: radarRound(avgQuoteVolume20, 0),
    ema9: radarRound(ema9, 8),
    ema30: radarRound(ema30, 8),
    ema100: radarRound(ema100, 8),
    obvSlope: radarRound(obvSlope, 2),
    vwap: radarRound(vwap, 8),
    resistance: radarRound(levels.resistance, 8),
    support: radarRound(levels.support, 8),
    atr14: radarRound(atr14, 8),
    openInterest: radarRound(Number(ticker?.oi || 0), 0),
    firstSeenTs,
    isFirstSeenNew,
    isShortHistory,
    candleCount4h: rows.length,
    candleCount1d: daily.length,
    riskFlags,
    scoreParts: radarBuildScoreParts(scoreParts),
    newCoinTimeline: isNewCoin ? radarBuildNewCoinTimeline({ firstSeenTs, price, intradayCandles: rows }) : null,
    avoidTrap: {
     active: eventType === 'avoid_trap' || lowLiquidity || extended || (!checks.volumeExpansion && score < 55),
     reasons: [
      lowLiquidity ? 'Thin volume can slip entries and exits' : '',
      extended ? 'Move is already extended versus ATR' : '',
      !checks.volumeExpansion ? 'No volume confirmation yet' : '',
      checks.vwapLoss && !checks.breakdown ? 'VWAP loss without clean support break' : '',
     ].filter(Boolean),
    },
    decision: {
     whySelected: reasons.slice(0, 3),
     whyNotNow: blockers.filter(Boolean).slice(0, 3),
     nextAction: riskFlags.length
      ? `${actionLabel}; confirm chart because ${riskFlags.join(', ').toLowerCase()}.`
      : `${actionLabel}; advisory only, confirm chart before any manual order.`,
    },
    mode: 'scanner_only',
   },
  }, 'radar');
 }

 function radarSortRows(results = []) {
  const eventRank = { breakout: 7, ema_obv: 6, pressure: 5, fresh_listing: 4, new_coin: 4, vwap: 3, review: 2, avoid_trap: 1 };
  return (Array.isArray(results) ? results : []).slice().sort((a, b) => {
   return (eventRank[b.eventType || b.raw?.eventType] || 0) - (eventRank[a.eventType || a.raw?.eventType] || 0)
   || Number(b.score || 0) - Number(a.score || 0)
   || Number(b.raw?.volumeRatio || 0) - Number(a.raw?.volumeRatio || 0)
   || String(a.symbol || '').localeCompare(String(b.symbol || ''));
  });
 }

 async function runRadarScan() {
  if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) {
   throw new Error('Strategy registry not loaded');
  }
  await radarSetStatus('Loading live market data...', { active: true, progress: 2 });
  await chrome.storage.local.set({ 'strategyResults.radar': [] });
  await detectAPI(true);
  const settings = await radarLoadSettings();
  const tickerMap = await fetchAllTickers();
  const products = await fetchProducts().catch(() => []);
  const symbols = Array.from(new Set([
   ...Object.keys(tickerMap || {}),
   ...(Array.isArray(products) ? products.map(item => item.symbol) : []),
  ].map(symbol => String(symbol || '').toUpperCase()).filter(Boolean)));
  const stored = await radarLoadStored(['strategyLabRadarFirstSeen']);
  const replayStored = await radarLoadStored(['strategyLabRadarReplay', 'strategyResults.radar']);
  const firstSeenMap = radarBuildFirstSeenMap(symbols, stored.strategyLabRadarFirstSeen || {});
  await chrome.storage.local.set({ strategyLabRadarFirstSeen: firstSeenMap });
  const universe = radarBuildUniverse(tickerMap, products, firstSeenMap, settings);
  const skipped = { insufficientIntraday: 0, fetchErrors: 0, reviewOnly: 0 };
  const diagnostics = {
   tickerRows: Object.keys(tickerMap || {}).length,
   productRows: Array.isArray(products) ? products.length : 0,
   universeRows: universe.length,
   freshRows: universe.filter(item => radarNow() - Number(item.firstSeenTs || radarNow()) <= Number(settings.freshListingFirstSeenHours || settings.newCoinFirstSeenHours || 72) * 3600000).length,
  };
  const results = [];
  for (let i = 0; i < universe.length; i += 1) {
   const item = universe[i];
   if (i % 5 === 0 || i === universe.length - 1) {
    await radarSetStatus(`Scanning ${item.symbol} (${i + 1}/${universe.length})`, {
     active: true,
     progress: Math.round(6 + (i / Math.max(1, universe.length)) * 88),
     scanned: i + 1,
     total: universe.length,
    });
   }
   try {
    const intraday = await fetchCandles(item.symbol, '4h', settings.preferredIntradayCandles, CLOSED_4H);
    const safeIntraday = Array.isArray(intraday) ? intraday : [];
    if (safeIntraday.length < Math.min(12, Number(settings.minIntradayCandles || 36))) {
     skipped.insufficientIntraday += 1;
     continue;
    }
    const daily = await fetchCandles(item.symbol, '1d', settings.preferredDailyCandles, CLOSED_DAILY).catch(() => []);
    const result = radarAnalyzeSymbol(item.symbol, safeIntraday, Array.isArray(daily) ? daily : [], item.ticker, {
     settings,
     firstSeenTs: item.firstSeenTs,
    });
    if (result.eventType === 'review') skipped.reviewOnly += 1;
    results.push(result);
   } catch (error) {
    skipped.fetchErrors += 1;
    radarLog(`${item.symbol} skipped: ${error?.message || error}`);
   }
  }
  const replay = radarUpdateReplayTracker(replayStored['strategyResults.radar'] || [], tickerMap, replayStored.strategyLabRadarReplay || {}, settings);
  const sorted = radarSortRows(radarAttachReplay(results, replay.tracker));
  const output = sorted.slice(0, Math.max(20, Number(settings.outputLimit || RADAR_DEFAULT_SETTINGS.outputLimit)));
  const counts = radarSignalCounts(output);
  await chrome.storage.local.set({
   'strategyResults.radar': output,
   'strategyStatus.radar': {
    strategyId: 'radar',
    status: `OK Done - ${output.length} Radar rows | Breakout ${counts.breakout || 0}, EMA+OBV ${counts.ema_obv || 0}, Pressure ${counts.pressure || 0}, Fresh ${counts.fresh_listing || counts.new_coin || 0}`,
    active: false,
    progress: 100,
    scanned: results.length,
    total: universe.length,
    eventCounts: counts,
    skipped,
    diagnostics,
    replaySummary: replay.summary,
    lastScanTs: radarNow(),
    ts: radarNow(),
   },
   strategyLabRadarReplay: replay.tracker,
   radarLastScanTs: radarNow(),
  });
  await radarMaybeNotify(output, settings);
  radarLog(`scan done: ${output.length} results`);
  return output;
 }

 async function runRadarScanFromContext(context) {
  if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) throw new Error('Strategy registry not loaded');
  if (!context?.scanId) throw new Error('Fresh main scan context is required');
  await radarSetStatus('Deriving Radar rows from main scan...', { active: true, progress: 5, scanId: context.scanId });
  await chrome.storage.local.set({ 'strategyResults.radar': [] });
  const settings = await radarLoadSettings();
  const tickerMap = context.tickerMap || {};
  const products = Array.isArray(context.products) ? context.products : [];
  const symbols = Array.from(new Set([
   ...Object.keys(tickerMap || {}),
   ...products.map(item => item.symbol),
  ].map(symbol => String(symbol || '').toUpperCase()).filter(Boolean)));
  const stored = await radarLoadStored(['strategyLabRadarFirstSeen']);
  const replayStored = await radarLoadStored(['strategyLabRadarReplay', 'strategyResults.radar']);
  const firstSeenMap = radarBuildFirstSeenMap(symbols, stored.strategyLabRadarFirstSeen || {});
  await chrome.storage.local.set({ strategyLabRadarFirstSeen: firstSeenMap });
  const universe = radarBuildUniverse(tickerMap, products, firstSeenMap, settings);
  const skipped = { insufficientIntraday: 0, fetchErrors: 0, reviewOnly: 0, noContextCandles: 0 };
  const diagnostics = {
   tickerRows: Object.keys(tickerMap || {}).length,
   productRows: products.length,
   universeRows: universe.length,
   freshRows: universe.filter(item => radarNow() - Number(item.firstSeenTs || radarNow()) <= Number(settings.freshListingFirstSeenHours || settings.newCoinFirstSeenHours || 72) * 3600000).length,
  };
  const getContextCandles = globalThis.FWDTradeDeskScanContext?.getCandles;
  const results = [];
  for (let i = 0; i < universe.length; i += 1) {
   const item = universe[i];
   if (i % 10 === 0 || i === universe.length - 1) {
    await radarSetStatus(`Deriving ${item.symbol} (${i + 1}/${universe.length})`, {
     active: true,
     progress: Math.round(6 + (i / Math.max(1, universe.length)) * 88),
     scanned: i + 1,
     total: universe.length,
     scanId: context.scanId,
    });
   }
   try {
    const safeIntraday = getContextCandles?.(context, item.symbol, '4h', settings.preferredIntradayCandles) || [];
    if (safeIntraday.length < Math.min(12, Number(settings.minIntradayCandles || 36))) {
     skipped.insufficientIntraday += 1;
     if (!safeIntraday.length) skipped.noContextCandles += 1;
     continue;
    }
    const daily = getContextCandles?.(context, item.symbol, '1d', settings.preferredDailyCandles) || [];
    const result = radarAnalyzeSymbol(item.symbol, safeIntraday, daily, item.ticker, { settings, firstSeenTs: item.firstSeenTs });
    if (result.eventType === 'review') skipped.reviewOnly += 1;
    results.push(result);
   } catch (error) {
    skipped.fetchErrors += 1;
    radarLog(`${item.symbol} derive skipped: ${error?.message || error}`);
   }
  }
  const replay = radarUpdateReplayTracker(replayStored['strategyResults.radar'] || [], tickerMap, replayStored.strategyLabRadarReplay || {}, settings);
  const sorted = radarSortRows(radarAttachReplay(results, replay.tracker));
  const output = sorted.slice(0, Math.max(20, Number(settings.outputLimit || RADAR_DEFAULT_SETTINGS.outputLimit)));
  const counts = radarSignalCounts(output);
  await chrome.storage.local.set({
   'strategyResults.radar': output,
   'strategyStatus.radar': {
    strategyId: 'radar',
    status: `Derived - ${output.length} Radar rows from main scan | Breakout ${counts.breakout || 0}, EMA+OBV ${counts.ema_obv || 0}, Pressure ${counts.pressure || 0}`,
    active: false,
    progress: 100,
    scanned: results.length,
    total: universe.length,
    eventCounts: counts,
    skipped,
    diagnostics,
    replaySummary: replay.summary,
    source: 'main_scan_context',
    scanId: context.scanId,
    lastScanTs: radarNow(),
    ts: radarNow(),
   },
   strategyLabRadarReplay: replay.tracker,
   radarLastScanTs: radarNow(),
  });
  await radarMaybeNotify(output, settings);
  return output;
 }

 function getRadarSnapshot(callback) {
  chrome.storage.local.get([
   'strategyResults.radar',
   'strategyStatus.radar',
   'strategySettings.radar',
  ], data => {
   callback({
    ok: true,
    radar: {
     results: Array.isArray(data['strategyResults.radar']) ? data['strategyResults.radar'] : [],
     status: data['strategyStatus.radar'] || {},
     settings: data['strategySettings.radar'] || RADAR_DEFAULT_SETTINGS,
    },
   });
  });
 }

 chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (typeof isTrustedRuntimeSender === 'function' && !isTrustedRuntimeSender(sender)) {
   sendResponse({ ok: false, error: 'Unauthorized sender' });
   return false;
  }
  if (msg?.action === 'radar:startScan') {
   const context = globalThis.FWDTradeDeskScanContext?.getFresh?.();
   const runner = context ? () => runRadarScanFromContext(context) : (msg?.forceIndependent === true ? runRadarScan : null);
   if (!runner) {
    radarSetStatus('Run main scan first - Radar will derive from shared scan data', { active: false, progress: 0 })
    .finally(() => sendResponse({ ok: false, error: 'Run main scan first' }));
    return true;
   }
   runner()
   .then(results => sendResponse({ ok: true, count: results.length }))
   .catch(async error => {
    await radarSetStatus(`Radar scan failed - ${error?.message || error}`, { active: false, progress: 0 });
    sendResponse({ ok: false, error: error?.message || String(error) });
   });
   return true;
  }
  if (msg?.action === 'radar:getResults') {
   getRadarSnapshot(sendResponse);
   return true;
  }
  if (msg?.action === 'radar:clearResults') {
   chrome.storage.local.set({
    'strategyResults.radar': [],
    'strategyStatus.radar': { strategyId: 'radar', status: 'Radar results cleared', active: false, progress: 0, ts: radarNow() },
   }, () => sendResponse({ ok: true }));
   return true;
  }
  return false;
 });

 global.FWDTradeDeskRadarScanner = Object.freeze({
  RADAR_DEFAULT_SETTINGS,
  radarAnalyzeSymbol,
  radarBuildFirstSeenMap,
  radarBuildUniverse,
  radarSignalCounts,
  radarSortRows,
  radarEventLabel,
  radarBuildScoreParts,
  radarUpdateReplayTracker,
  runRadarScan,
  runRadarScanFromContext,
 });
})(globalThis);
