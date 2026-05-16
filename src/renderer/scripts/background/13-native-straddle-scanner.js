'use strict';

(function initNativeStraddleScanner(global) {
 const shared = global.FWDTradeDeskShared || {};
 const options = global.FWDTradeDeskOptions || {};
 const CACHE_KEY = 'nativeStraddleScannerCache';
 const RESULT_KEY = 'strategyResults.native_straddle';
 const STATUS_KEY = 'strategyStatus.native_straddle';
 const SETTINGS_KEY = 'strategySettings.native_straddle';
 const NOTIFY_ENABLED_KEY = 'strategyLabNativeStraddleNotificationsEnabled';
 const NOTIFY_LAST_KEY = 'strategyLabNativeStraddleLastNotificationKey';
 const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
 const RESULT_CACHE_TTL_MS = 15 * 60 * 1000;
 const CHAIN_CACHE_TTL_MS = 15 * 60 * 1000;
 const MIN_EXPIRY_FRESH_MS = 5 * 60 * 1000;
 const NATIVE_EXPIRY_BUCKETS = Object.freeze(['daily', 'weekly', 'monthly']);

 const DEFAULT_SETTINGS = Object.freeze({
  underlyings: Object.freeze(['BTC', 'ETH']),
  outputLimit: 12,
  minActionScore: 62,
  notifyScore: 68,
  preferNearestExpiry: true,
  expiryModes: Object.freeze(['daily', 'weekly', 'monthly']),
  minExpiryFreshMinutes: 5,
  chainCacheMinutes: 15,
 });

 const normalizeBaseSymbol = typeof shared.normalizeBaseSymbol === 'function'
 ? shared.normalizeBaseSymbol
 : value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

 function now() {
  return Date.now();
 }

 function log(message) {
  if (typeof global.dlog === 'function') global.dlog(`[NATIVE-STRADDLE] ${message}`);
  else console.log(`[NATIVE-STRADDLE] ${message}`);
 }

 function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const m = 10 ** decimals;
  return Math.round(n * m) / m;
 }

 function clampScore(value) {
  return Math.max(1, Math.min(99, Math.round(Number(value || 0))));
 }

 function sanitizeExpiryModes(value) {
  const raw = Array.isArray(value)
  ? value
  : String(value || '').split(/[\s,;]+/g).filter(Boolean);
  const seen = new Set();
  const modes = [];
  raw.forEach(item => {
   const mode = String(item || '').trim().toLowerCase();
   if (!NATIVE_EXPIRY_BUCKETS.includes(mode) || seen.has(mode)) return;
   seen.add(mode);
   modes.push(mode);
  });
  return modes.length ? modes : DEFAULT_SETTINGS.expiryModes.slice();
 }

 function nativeExpiryBucketFromMs(ms = 0) {
  const hours = Math.max(0, Number(ms || 0) / 3600000);
  if (hours <= 36) return 'daily';
  if (hours <= 10 * 24) return 'weekly';
  return 'monthly';
 }

 function parseNativeStraddleSymbol(symbol = '') {
  const match = String(symbol || '').trim().toUpperCase().match(/^MV-([A-Z0-9]+)-(\d+(?:\.\d+)?)-(\d{6})$/);
  if (!match) return null;
  const token = match[3];
  const day = Number(token.slice(0, 2));
  const month = Number(token.slice(2, 4));
  const year = 2000 + Number(token.slice(4, 6));
  if (!(day > 0) || !(month >= 1 && month <= 12)) return null;
  const sessionStartTs = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  return {
   symbol: match[0],
   underlying: normalizeBaseSymbol(match[1]),
   strike: Number(match[2] || 0),
   expiryToken: token,
   sessionStartTs,
   sessionEndTs: sessionStartTs + 24 * 60 * 60 * 1000,
  };
 }

 function enrichNativeExpiry(contract = {}, ts = now()) {
  const parsed = parseNativeStraddleSymbol(contract.symbol);
  const expiryTs = Number(contract.expiryTs || parsed?.sessionEndTs || 0);
  const msLeft = Math.max(0, expiryTs - ts);
  return {
   ...contract,
   expiryTs,
   expiryBucket: nativeExpiryBucketFromMs(msLeft),
   expiresInHours: round(msLeft / 3600000, 2),
   expirySessionStartTs: parsed?.sessionStartTs || 0,
   expirySessionEndTs: parsed?.sessionEndTs || 0,
   expiryToken: parsed?.expiryToken || contract.expiryToken || '',
  };
 }

 function isNativeExpiryTradable(contract = {}, settings = DEFAULT_SETTINGS, ts = now()) {
  const row = enrichNativeExpiry(contract, ts);
  const state = String(contract.state || contract.status || contract.raw?.state || '').toLowerCase();
  if (state.includes('expired') || state.includes('inactive') || state.includes('settled')) return false;
  const minFreshMs = Math.max(0, Number(settings.minExpiryFreshMinutes || DEFAULT_SETTINGS.minExpiryFreshMinutes)) * 60000;
  if (!(Number(row.expiryTs || 0) > ts + Math.max(MIN_EXPIRY_FRESH_MS, minFreshMs))) return false;
  return sanitizeExpiryModes(settings.expiryModes).includes(row.expiryBucket);
 }

 function chainHasTradableContracts(chain = {}, settings = DEFAULT_SETTINGS) {
  const contracts = Array.isArray(chain.contracts) ? chain.contracts : [];
  return contracts.some(contract => String(contract.symbol || '').startsWith('MV-') && isNativeExpiryTradable(contract, settings));
 }

 function localGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, data => resolve(data || {})));
 }

 function localSet(payload) {
  return new Promise(resolve => chrome.storage.local.set(payload, () => resolve()));
 }

 async function setStatus(status, extra = {}) {
  await localSet({
   [STATUS_KEY]: {
    strategyId: 'native_straddle',
    status,
    ts: now(),
    ...extra,
   },
  });
 }

 async function loadSettings() {
  const data = await localGet([SETTINGS_KEY]);
  const raw = data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === 'object' ? data[SETTINGS_KEY] : {};
  const underlyings = Array.isArray(raw.underlyings)
  ? raw.underlyings.map(normalizeBaseSymbol).filter(Boolean).slice(0, 8)
  : DEFAULT_SETTINGS.underlyings.slice();
  return {
   ...DEFAULT_SETTINGS,
   ...raw,
   underlyings: underlyings.length ? underlyings : DEFAULT_SETTINGS.underlyings.slice(),
   outputLimit: Math.max(2, Math.min(40, Number(raw.outputLimit || DEFAULT_SETTINGS.outputLimit))),
   minActionScore: Math.max(1, Math.min(99, Number(raw.minActionScore || DEFAULT_SETTINGS.minActionScore))),
   notifyScore: Math.max(1, Math.min(99, Number(raw.notifyScore || DEFAULT_SETTINGS.notifyScore))),
   expiryModes: sanitizeExpiryModes(raw.expiryModes || DEFAULT_SETTINGS.expiryModes),
   minExpiryFreshMinutes: Math.max(1, Math.min(240, Number(raw.minExpiryFreshMinutes || DEFAULT_SETTINGS.minExpiryFreshMinutes))),
   chainCacheMinutes: Math.max(1, Math.min(60, Number(raw.chainCacheMinutes || DEFAULT_SETTINGS.chainCacheMinutes))),
  };
 }

 async function loadCache() {
  const data = await localGet([CACHE_KEY]);
  const cache = data[CACHE_KEY] && typeof data[CACHE_KEY] === 'object' ? data[CACHE_KEY] : {};
  const chains = cache.chains && typeof cache.chains === 'object' ? { ...cache.chains } : {};
  const results = cache.results && typeof cache.results === 'object' ? cache.results : null;
  let changed = false;
  Object.keys(chains).forEach(key => {
   if (now() - Number(chains[key]?.ts || 0) > CACHE_TTL_MS) {
    delete chains[key];
    changed = true;
   }
  });
 const safeResults = results && now() - Number(results.ts || 0) <= RESULT_CACHE_TTL_MS ? results : null;
  if (results && !safeResults) changed = true;
  const next = { chains, results: safeResults, savedAt: now(), ttlMs: CACHE_TTL_MS };
  if (changed) await localSet({ [CACHE_KEY]: next });
  return next;
 }

 async function saveCache(patch = {}) {
  const current = await loadCache();
  const next = {
   ...current,
   ...patch,
   chains: { ...(current.chains || {}), ...(patch.chains || {}) },
   savedAt: now(),
   ttlMs: CACHE_TTL_MS,
  };
  await localSet({ [CACHE_KEY]: next });
  return next;
 }

 function compactChain(chain = {}) {
  return {
   ok: !!chain.ok,
   underlying: normalizeBaseSymbol(chain.underlying),
   underlyingPrice: Number(chain.underlyingPrice || 0),
   atmStrike: Number(chain.atmStrike || 0),
   expiryKey: String(chain.expiryKey || ''),
   expiries: Array.isArray(chain.expiries) ? chain.expiries.slice(0, 12) : [],
   expiryBuckets: chain.expiryBuckets || null,
   marketContext: chain.marketContext || null,
   contracts: Array.isArray(chain.contracts) ? chain.contracts.slice(0, 80) : [],
   fetchedAt: Number(chain.fetchedAt || now()),
  };
 }

 async function fetchNativeChain(underlying = 'BTC', optionsArg = {}) {
  const safeUnderlying = normalizeBaseSymbol(underlying) || 'BTC';
  const settings = optionsArg.settings || DEFAULT_SETTINGS;
  const cache = await loadCache();
  const cached = cache.chains?.[safeUnderlying];
  const chainTtlMs = Math.max(CHAIN_CACHE_TTL_MS, Number(settings.chainCacheMinutes || DEFAULT_SETTINGS.chainCacheMinutes) * 60000);
  if (!optionsArg.force && cached && now() - Number(cached.ts || 0) <= chainTtlMs && cached.value?.ok && chainHasTradableContracts(cached.value, settings)) {
   return { ...cached.value, cacheHit: true };
  }
  if (typeof global.v17GetStraddleChain !== 'function') {
   throw new Error('Native straddle chain service is not loaded');
  }
  const chain = await global.v17GetStraddleChain({
   underlying: safeUnderlying,
   expiryModes: settings.expiryModes,
   minExpiryFreshMinutes: settings.minExpiryFreshMinutes,
  });
  if (!chain?.ok) throw new Error(chain?.error || `Native straddle chain unavailable for ${safeUnderlying}`);
 const value = compactChain(chain);
 await saveCache({ chains: { [safeUnderlying]: { ts: now(), value } } });
 return value;
 }

 function candleClose(candle = {}) {
  return Number(candle.close ?? candle.c ?? candle.price ?? candle.markPrice ?? 0);
 }

 function candleHigh(candle = {}) {
  return Number(candle.high ?? candle.h ?? candleClose(candle));
 }

 function candleLow(candle = {}) {
  return Number(candle.low ?? candle.l ?? candleClose(candle));
 }

 function pctMove(from = 0, to = 0) {
  const start = Number(from || 0);
  const end = Number(to || 0);
  return start > 0 ? ((end - start) / start) * 100 : 0;
 }

 function simpleEma(values = [], period = 9) {
  const list = values.map(Number).filter(Number.isFinite);
  if (!list.length) return 0;
  const k = 2 / (Math.max(1, period) + 1);
  return list.reduce((ema, value, index) => index === 0 ? value : (value * k) + (ema * (1 - k)), list[0]);
 }

 function buildPremiumRead(symbol = '', candles = [], fallbackPrice = 0) {
  const rows = (Array.isArray(candles) ? candles : []).filter(candle => candleClose(candle) > 0);
  const closes = rows.map(candleClose);
  const price = Number(closes.at(-1) || fallbackPrice || 0);
  const move2h = closes.length >= 9 ? pctMove(closes.at(-9), price) : 0;
  const move4h = closes.length >= 17 ? pctMove(closes.at(-17), price) : 0;
  const ema9 = simpleEma(closes.slice(-80), 9);
  const ema30 = simpleEma(closes.slice(-120), 30);
  const emaSpreadPct = price > 0 ? ((ema9 - ema30) / price) * 100 : 0;
  const recent = rows.slice(-32);
  const trueRanges = recent.slice(1).map((candle, index) => {
   const prevClose = candleClose(recent[index]);
   return Math.max(
    candleHigh(candle) - candleLow(candle),
    Math.abs(candleHigh(candle) - prevClose),
    Math.abs(candleLow(candle) - prevClose)
   );
  }).filter(value => value > 0);
  const atrPct = price > 0 && trueRanges.length ? ((trueRanges.reduce((sum, value) => sum + value, 0) / trueRanges.length) / price) * 100 : 0;
  const risingFast = move2h >= 8 || move4h >= 12 || emaSpreadPct >= 5;
  const fallingFast = move2h <= -8 || move4h <= -12 || emaSpreadPct <= -5;
  const trendState = risingFast ? 'rising' : fallingFast ? 'falling' : Math.abs(move4h) <= 5 && Math.abs(emaSpreadPct) <= 3 ? 'flat' : 'mixed';
  return {
   symbol,
   price,
   move2h,
   move4h,
   emaSpreadPct,
   atrPct,
   trendState,
   risingFast,
   fallingFast,
   candles15m: rows.length,
   fetchedAt: now(),
  };
 }

 async function fetchNativePremiumRead(symbol = '', fallbackPrice = 0) {
  const safeSymbol = String(symbol || '').trim().toUpperCase();
  if (!safeSymbol || typeof global.fetchCandles !== 'function') return buildPremiumRead(safeSymbol, [], fallbackPrice);
  try {
   const candles = await global.fetchCandles(safeSymbol, '15m', 96, { closedOnly: true });
   return buildPremiumRead(safeSymbol, candles, fallbackPrice);
  } catch (_) {
   return buildPremiumRead(safeSymbol, [], fallbackPrice);
  }
 }

 async function analyzeContract(contract = {}, chain = {}, settings = DEFAULT_SETTINGS, extras = {}) {
  const spot = Number(chain.underlyingPrice || contract.underlyingPrice || 0);
  const marketContext = chain.marketContext || contract.marketContext || { underlying: chain.underlying || contract.underlying || 'BTC' };
  const premiumRead = extras.premiumRead || await fetchNativePremiumRead(contract.symbol, contract.markPrice);
  const analysis = typeof options.analyzeNativeStraddleContract === 'function'
  ? options.analyzeNativeStraddleContract(contract, spot, 'neutral', settings, { marketContext })
  : {
   score: 50,
   spreadPct: contract.markPrice > 0 && contract.ask > 0 && contract.bid > 0 ? ((contract.ask - contract.bid) / contract.markPrice) * 100 : 100,
   premiumPerContract: Number(contract.markPrice || 0) * Number(contract.contractMultiplier || 1),
   breakEvenLow: Number(contract.strike || 0) - Number(contract.markPrice || 0),
   breakEvenHigh: Number(contract.strike || 0) + Number(contract.markPrice || 0),
   marketContext,
   components: {},
  };
  return { ...contract, ...analysis, marketContext: analysis.marketContext || marketContext, premiumRead, score: clampScore(analysis.score) };
 }

 function scoreForSide(side = 'avoid', row = {}) {
  const marketContext = row.marketContext || {};
  const liquidity = Number(row.components?.liquidityScore || 0);
  const spread = Number(row.components?.spreadScore || 0);
  const moveFit = Number(row.components?.moveFitScore || 0);
  if (side === 'sell') return clampScore(row.score);
  if (side === 'buy') {
   return clampScore(((100 - Number(marketContext.sellPremiumScore || 50)) * 0.65) + (liquidity * 16) + (spread * 12) + (moveFit * 8));
 }
 return clampScore(Math.min(55, Math.max(20, (Number(row.score || 0) + Number(marketContext.sellPremiumScore || 50)) / 2)));
 }

 function resolveNativeStraddleGates(row = {}, settings = DEFAULT_SETTINGS) {
  const marketContext = row.marketContext || {};
  const premiumRead = row.premiumRead || {};
  const hasPremium = Number(row.markPrice || 0) > 0 && Number(row.premiumPerContract || 0) > 0;
  const spreadPct = Number(row.spreadPct || 100);
  const sellSpreadOk = spreadPct <= 12;
  const buySpreadOk = spreadPct <= 20;
  const liquidEnough = Number(row.volume || 0) > 0 || Number(row.oiContracts || 0) > 0;
  const marketCalmForSell = marketContext.recommendedSide === 'sell'
  && marketContext.calmForSell === true
  && marketContext.hardExpansion !== true
  && marketContext.breakoutRisk !== true;
  const premiumNotExpanding = premiumRead.risingFast !== true && !['rising'].includes(String(premiumRead.trendState || '').toLowerCase());
  const premiumExpansion = premiumRead.risingFast === true || Number(premiumRead.move2h || 0) >= 8 || Number(premiumRead.move4h || 0) >= 12;
  const sellAllowed = hasPremium
  && sellSpreadOk
  && liquidEnough
  && marketCalmForSell
  && premiumNotExpanding
  && Number(row.score || 0) >= Number(settings.minActionScore || 62);
  const buyWatch = hasPremium
  && buySpreadOk
  && liquidEnough
  && (marketContext.recommendedSide === 'buy' || premiumExpansion)
  && marketContext.recommendedSide !== 'sell';
  const reasons = [];
  if (!hasPremium) reasons.push('Missing valid premium');
  if (!liquidEnough) reasons.push('No usable volume/open interest');
  if (!sellSpreadOk) reasons.push(`Spread ${round(spreadPct, 2)}% is too wide for sell premium`);
  if (!marketCalmForSell) reasons.push(`${marketContext.underlying || 'BTC'} is not calm/range-bound enough for fresh short premium`);
  if (!premiumNotExpanding) reasons.push('MV premium is rising on the 15m chart');
  return {
   hasPremium,
   sellSpreadOk,
   buySpreadOk,
   liquidEnough,
   marketCalmForSell,
   premiumNotExpanding,
   premiumExpansion,
   sellAllowed,
   buyWatch,
   noTradeReasons: reasons,
  };
 }

 function chooseAction(row = {}, settings = DEFAULT_SETTINGS) {
  const gates = resolveNativeStraddleGates(row, settings);
  if (gates.sellAllowed) {
   return { action: 'sell', signal: 'SELL', label: 'Sell Premium', eventType: 'sell_straddle', priority: Number(row.score || 0) >= 78 ? 'Best sell premium' : 'Review sell premium', gates };
  }
  if (gates.buyWatch) {
   return { action: 'buy', signal: 'BUY', label: 'Buy Vol Watch', eventType: 'buy_straddle', priority: 'Watch long volatility', gates };
  }
  return { action: 'avoid', signal: 'IGNORE', label: 'No Trade', eventType: 'avoid_straddle', priority: gates.noTradeReasons[0] || 'Wait for cleaner setup', gates };
 }

 function buildReasons(row = {}, action = {}) {
  const marketContext = row.marketContext || {};
  const premiumRead = row.premiumRead || {};
  return [
   marketContext.summary || '',
   premiumRead.candles15m ? `MV premium 15m ${premiumRead.trendState || 'mixed'}: ${round(premiumRead.move2h, 2)}% 2h, ${round(premiumRead.move4h, 2)}% 4h` : 'MV premium chart read unavailable; keep this advisory only.',
   `Strike ${round(row.strike, 0)} near spot ${round(row.spot || row.underlyingPrice || 0, 0)}`,
   `Premium ${round(row.premiumPerContract || 0, 2)} | spread ${round(row.spreadPct || 0, 2)}%`,
   `OI ${round(row.oiContracts || 0, 0)} | volume ${round(row.volume || 0, 0)}`,
   action.action === 'sell' ? 'Sell premium requires BTC calm, MV premium not expanding, and a clean MV quote.' : '',
   action.action === 'buy' ? 'Short premium blocked; scanner is watching long-vol only.' : '',
   action.action === 'avoid' ? `No trade: ${(action.gates?.noTradeReasons || ['data, liquidity, and regime are not clean']).slice(0, 2).join(' | ')}` : '',
  ].filter(Boolean).slice(0, 8);
 }

 function buildResult(row = {}, chain = {}, settings = DEFAULT_SETTINGS) {
  const action = chooseAction(row, settings);
  const actionScore = scoreForSide(action.action, row);
  const gates = action.gates || resolveNativeStraddleGates(row, settings);
  const side = action.action === 'buy' ? 'buy' : action.action === 'sell' ? 'sell' : '';
  const stopPct = 30;
  const entry = Number(row.markPrice || 0);
  const stop = side === 'buy' ? entry * ((100 - stopPct) / 100) : side === 'sell' ? entry * (1 + stopPct / 100) : 0;
  const takeProfit = side === 'buy' ? entry * 1.45 : side === 'sell' ? entry * 0.55 : 0;
  return global.FWDTradeDeskStrategies.normalizeStrategyResult({
   symbol: String(row.symbol || '').toUpperCase(),
   strategyId: 'native_straddle',
   signal: action.signal,
   setupLabel: action.label,
   direction: action.action === 'buy' ? 'buy_vol' : action.action === 'sell' ? 'sell_vol' : 'avoid',
   eventType: action.eventType,
   actionLabel: action.label,
   priorityLabel: action.priority,
   score: actionScore,
   confidence: actionScore,
   entry: round(entry, 4),
   stop: round(stop, 4),
   riskPercent: entry > 0 && stop > 0 ? round(Math.abs(entry - stop) / entry * 100, 2) : 0,
   targets: {
    target1: round(takeProfit, 4),
    breakEvenLow: round(row.breakEvenLow || 0, 2),
    breakEvenHigh: round(row.breakEvenHigh || 0, 2),
    strike: round(row.strike || 0, 0),
    underlyingPrice: round(chain.underlyingPrice || row.spot || 0, 2),
   },
  reasons: buildReasons(row, action),
  checks: {
   advisoryOnly: true,
   noAutoTrade: true,
   cacheTtlHours: 24,
   resultCacheMinutes: Math.round(RESULT_CACHE_TTL_MS / 60000),
   chainCacheMinutes: settings.chainCacheMinutes,
   expiryModes: settings.expiryModes,
   spreadOk: action.action === 'sell' ? gates.sellSpreadOk : gates.buySpreadOk,
   hasPremium: Number(row.markPrice || 0) > 0,
   marketCalmForSell: gates.marketCalmForSell,
   premiumNotExpanding: gates.premiumNotExpanding,
   nativeMvContract: String(row.symbol || '').startsWith('MV-'),
   },
   riskFlags: action.action === 'avoid' ? ['No native straddle trade now', ...(gates.noTradeReasons || []).slice(0, 3)] : (action.action === 'buy' ? ['Buy-vol watch only; no short premium'] : []),
   raw: {
    underlying: chain.underlying || row.underlying || '',
    expiryKey: row.expiryKey || chain.expiryKey || '',
    expiryLabel: row.expiryLabel || '',
    daysToExpiry: round(row.daysToExpiry || 0, 3),
    expiryTs: Number(row.expiryTs || 0),
    expiryBucket: row.expiryBucket || '',
    expiresInHours: round(row.expiresInHours || 0, 2),
    strike: Number(row.strike || 0),
    markPrice: entry,
    bid: Number(row.bid || row.bidPrice || 0),
    ask: Number(row.ask || row.askPrice || 0),
    premiumPerContract: round(row.premiumPerContract || 0, 2),
    spreadPct: round(row.spreadPct || 0, 2),
    theta: Number(row.theta || 0),
    iv: Number(row.iv || 0),
    volume: Number(row.volume || 0),
    openInterest: Number(row.oiContracts || 0),
    marketContext: row.marketContext || null,
    premiumRead: row.premiumRead || null,
    recommendationMode: action.label,
    gateReasons: gates.noTradeReasons || [],
    eventLabel: action.label,
    chartSymbol: String(row.symbol || '').toUpperCase(),
    timeframe: '15m',
    cacheTtlMs: RESULT_CACHE_TTL_MS,
    productCacheTtlMs: CACHE_TTL_MS,
    fetchedAt: Number(chain.fetchedAt || now()),
    chartTradingDraft: {
     symbol: String(row.symbol || '').toUpperCase(),
     side,
     entry: round(entry, 4),
     stopLoss: round(stop, 4),
     takeProfit: round(takeProfit, 4),
     size: 1,
     sizeMode: 'contracts',
     orderType: 'market_order',
     entryMode: 'market',
     source: 'native-straddle-scanner',
     note: `${action.label}. Advisory only; confirm the 15m native straddle chart before any manual order.`,
     updatedAt: now(),
    },
    decision: {
     whySelected: buildReasons(row, action).slice(0, 3),
     whyNotNow: action.action === 'avoid' ? buildReasons(row, action).slice(0, 3) : [],
     nextAction: `${action.label}; open the 15m chart and confirm manually.`,
    },
    mode: 'scanner_only',
   },
  }, 'native_straddle');
 }

 async function bestRowForChain(chain = {}, settings = DEFAULT_SETTINGS) {
 const contracts = Array.isArray(chain.contracts) ? chain.contracts : [];
 const candidates = contracts
  .map(contract => enrichNativeExpiry(contract))
  .filter(contract => String(contract.symbol || '').startsWith('MV-') && isNativeExpiryTradable(contract, settings));
 const scored = (await Promise.all(candidates.map(async contract => {
  const premiumRead = await fetchNativePremiumRead(contract.symbol, contract.markPrice);
  return analyzeContract(contract, chain, settings, { premiumRead });
 }))).sort((a, b) => {
   const sideA = chooseAction(a, settings).action;
   const sideB = chooseAction(b, settings).action;
   return scoreForSide(sideB, b) - scoreForSide(sideA, a)
   || Math.abs(Number(a.strike || 0) - Number(chain.underlyingPrice || 0)) - Math.abs(Number(b.strike || 0) - Number(chain.underlyingPrice || 0));
  });
  return scored[0] || null;
 }

 function sortResults(rows = []) {
  const rank = { SELL: 3, BUY: 2, WATCHLIST: 1, IGNORE: 0 };
  return rows.slice().sort((a, b) => {
   return (rank[b.signal] || 0) - (rank[a.signal] || 0)
   || Number(b.score || 0) - Number(a.score || 0)
   || String(a.raw?.underlying || a.symbol || '').localeCompare(String(b.raw?.underlying || b.symbol || ''));
  });
 }

 function countResults(rows = []) {
  return rows.reduce((acc, row) => {
   if (row.signal === 'SELL') acc.sell += 1;
   else if (row.signal === 'BUY') acc.buy += 1;
   else acc.avoid += 1;
   const eventType = String(row.eventType || row.raw?.eventType || 'avoid');
   acc[eventType] = (acc[eventType] || 0) + 1;
   return acc;
  }, { buy: 0, sell: 0, avoid: 0, buy_straddle: 0, sell_straddle: 0, avoid_straddle: 0 });
 }

 function notificationRows(rows = [], settings = DEFAULT_SETTINGS) {
  return rows
  .filter(row => ['BUY', 'SELL'].includes(String(row.signal || '')))
  .filter(row => Number(row.score || 0) >= Number(settings.notifyScore || DEFAULT_SETTINGS.notifyScore))
  .slice(0, 3);
 }

 async function maybeNotify(rows = [], settings = DEFAULT_SETTINGS) {
  const data = await localGet([NOTIFY_ENABLED_KEY, NOTIFY_LAST_KEY]);
  if (data[NOTIFY_ENABLED_KEY] === false) return;
  const picked = notificationRows(rows, settings)[0];
  if (!picked) return;
  const key = `${picked.symbol}:${picked.signal}:${picked.raw?.expiryKey || ''}:${Math.floor(Number(picked.ts || now()) / 900000)}`;
  if (key === data[NOTIFY_LAST_KEY]) return;
  await localSet({ [NOTIFY_LAST_KEY]: key });
  const underlying = picked.raw?.underlying || picked.symbol;
  const title = `[Native Straddle] ${underlying} ${picked.actionLabel || 'Native Straddle'}`;
  if (typeof v16PushNotificationFeed === 'function') {
   await v16PushNotificationFeed({
    tone: picked.signal === 'SELL' ? 'success' : 'info',
    title,
    symbol: picked.symbol,
    sourceScannerId: 'native_straddle',
    sourceScannerName: 'Native Straddle',
    sourceType: 'scanner',
    what: `${picked.symbol} | Score ${Math.round(Number(picked.score || 0))} | ${picked.raw?.expiryLabel || picked.raw?.expiryKey || 'nearest expiry'}`,
    why: Array.isArray(picked.reasons) && picked.reasons.length ? picked.reasons.slice(0, 3).join(' | ') : 'Native straddle scanner found a BTC/ETH volatility setup.',
    next: 'Open Options or the chart before acting; this scanner is advisory only.',
    action: 'Review live premium, spread, liquidity, and 15m chart context.',
   }).catch(() => null);
  }
  try {
   chrome.notifications?.create?.(`fwd-native-straddle-${now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message: `${picked.symbol} | Score ${Math.round(Number(picked.score || 0))} | ${picked.raw?.expiryLabel || picked.raw?.expiryKey || 'nearest expiry'}`,
    priority: 1,
   });
  } catch (error) {
   log(`Notification skipped: ${error?.message || error}`);
  }
 }

 async function runNativeStraddleScan(payload = {}) {
  if (!global.FWDTradeDeskStrategies?.normalizeStrategyResult) throw new Error('Strategy registry not loaded');
  const settings = await loadSettings();
  const underlyings = Array.isArray(payload.underlyings) && payload.underlyings.length
  ? payload.underlyings.map(normalizeBaseSymbol).filter(Boolean)
  : settings.underlyings;
  await setStatus('Scanning native straddles...', { active: true, progress: 5, total: underlyings.length });
  await localSet({ [RESULT_KEY]: [] });
  const rows = [];
  const skipped = { noChain: 0, noContract: 0, fetchErrors: 0 };
  const diagnostics = {
   underlyings: underlyings.length,
   productCacheTtlHours: 24,
   resultCacheMinutes: Math.round(RESULT_CACHE_TTL_MS / 60000),
   chainCacheMinutes: settings.chainCacheMinutes,
   expiryModes: settings.expiryModes,
   cachedChains: 0,
  };
  for (let i = 0; i < underlyings.length; i += 1) {
   const underlying = underlyings[i];
   await setStatus(`Scanning ${underlying} native straddle (${i + 1}/${underlyings.length})`, {
    active: true,
    progress: Math.round(8 + (i / Math.max(1, underlyings.length)) * 82),
    scanned: i + 1,
    total: underlyings.length,
   });
   try {
    const chain = await fetchNativeChain(underlying, { force: payload.force === true, settings });
    if (chain.cacheHit) diagnostics.cachedChains += 1;
    if (!chain?.ok) {
     skipped.noChain += 1;
     continue;
    }
    const best = await bestRowForChain(chain, settings);
    if (!best) {
     skipped.noContract += 1;
     continue;
    }
    rows.push(buildResult(best, chain, settings));
   } catch (error) {
    skipped.fetchErrors += 1;
    log(`${underlying} skipped: ${error?.message || error}`);
   }
  }
  const output = sortResults(rows).slice(0, settings.outputLimit);
  const counts = countResults(output);
  const status = {
   strategyId: 'native_straddle',
   status: `OK Done - ${output.length} Native Straddle rows | Sell ${counts.sell}, Buy ${counts.buy}, Avoid ${counts.avoid}`,
   active: false,
   progress: 100,
   scanned: underlyings.length,
   total: underlyings.length,
   eventCounts: counts,
   skipped,
   diagnostics,
   lastScanTs: now(),
   ts: now(),
  };
  await localSet({
   [RESULT_KEY]: output,
   [STATUS_KEY]: status,
   nativeStraddleLastScanTs: now(),
  });
  await saveCache({ results: { ts: now(), rows: output, status } });
  await maybeNotify(output, settings);
  log(`scan done: ${output.length} results`);
  return output;
 }

 function getSnapshot(callback) {
  chrome.storage.local.get([RESULT_KEY, STATUS_KEY, SETTINGS_KEY, CACHE_KEY], data => {
   callback({
    ok: true,
    native_straddle: {
     results: Array.isArray(data[RESULT_KEY]) ? data[RESULT_KEY] : [],
     status: data[STATUS_KEY] || {},
     settings: data[SETTINGS_KEY] || DEFAULT_SETTINGS,
     cache: data[CACHE_KEY] || null,
    },
   });
  });
 }

 chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (typeof isTrustedRuntimeSender === 'function' && !isTrustedRuntimeSender(sender)) {
   sendResponse({ ok: false, error: 'Unauthorized sender' });
   return false;
  }
  if (msg?.action === 'native-straddle:startScan') {
   runNativeStraddleScan(msg)
   .then(results => sendResponse({ ok: true, count: results.length }))
   .catch(async error => {
    await setStatus(`Native Straddle scan failed - ${error?.message || error}`, { active: false, progress: 0 });
    sendResponse({ ok: false, error: error?.message || String(error) });
   });
   return true;
  }
  if (msg?.action === 'native-straddle:getResults') {
   getSnapshot(sendResponse);
   return true;
  }
  if (msg?.action === 'native-straddle:clearResults') {
   chrome.storage.local.set({
    [RESULT_KEY]: [],
    [STATUS_KEY]: { strategyId: 'native_straddle', status: 'Native Straddle results cleared', active: false, progress: 0, ts: now() },
   }, () => sendResponse({ ok: true }));
   return true;
  }
  return false;
 });

 global.FWDTradeDeskNativeStraddleScanner = Object.freeze({
  DEFAULT_SETTINGS,
  runNativeStraddleScan,
  fetchNativeChain,
  bestRowForChain,
  buildResult,
 });
})(globalThis);
