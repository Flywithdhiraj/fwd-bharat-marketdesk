(() => {
 'use strict';

 const shared = globalThis.FWDTradeDeskShared || {};
 const optionsShared = globalThis.FWDTradeDeskOptions || {};
 const normalizeBaseSymbol = typeof shared.normalizeBaseSymbol === 'function'
 ? shared.normalizeBaseSymbol
 : (value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
 const sanitizeOptionsAutoTradeSettings = typeof optionsShared.sanitizeOptionsAutoTradeSettings === 'function'
 ? optionsShared.sanitizeOptionsAutoTradeSettings
 : (value => value || {});
 const buildDirectionalCreditSpreadFromChain = typeof optionsShared.buildDirectionalCreditSpreadFromChain === 'function'
 ? optionsShared.buildDirectionalCreditSpreadFromChain
 : (() => null);
 const buildShortStraddleForAutoTrade = typeof optionsShared.buildShortStraddleForAutoTrade === 'function'
 ? optionsShared.buildShortStraddleForAutoTrade
 : (() => null);
 const selectBestNativeStraddle = typeof optionsShared.selectBestNativeStraddle === 'function'
 ? optionsShared.selectBestNativeStraddle
 : (() => null);
 const buildNativeStraddleTicketPreview = typeof optionsShared.buildNativeStraddleTicketPreview === 'function'
 ? optionsShared.buildNativeStraddleTicketPreview
 : (() => ({ canPlace: false, reason: 'Preview unavailable' }));
 const buildNativeStraddleMarketContext = typeof optionsShared.buildNativeStraddleMarketContext === 'function'
 ? optionsShared.buildNativeStraddleMarketContext
 : (input => ({
 underlying: String(input?.underlying || 'BTC').trim().toUpperCase() || 'BTC',
 sellPremiumScore: 50,
 recommendedSide: 'wait',
 label: 'Wait',
 tone: 'warn',
 summary: 'Market context unavailable.',
 }));
 const computeVolatilitySkewMetrics = typeof optionsShared.computeVolatilitySkewMetrics === 'function'
 ? optionsShared.computeVolatilitySkewMetrics
 : (() => ({ points: [], regime: { key: 'flat', label: 'Flat Skew', tone: 'info', summary: '' } }));
 const NATIVE_STRADDLE_SOFT_GATE_SCORE = Number(optionsShared.NATIVE_STRADDLE_SOFT_GATE_SCORE || 70);
 const sanitizeOptionLeg = typeof optionsShared.sanitizeOptionLeg === 'function'
 ? optionsShared.sanitizeOptionLeg
 : (value => value || {});
 const summarizeOptionStrategy = typeof optionsShared.summarizeOptionStrategy === 'function'
 ? optionsShared.summarizeOptionStrategy
 : (() => ({ legs: [], maxLoss: null, maxProfit: 0, breakevens: [], greeks: {} }));
 const buildOptionPnlTable = typeof optionsShared.buildOptionPnlTable === 'function'
 ? optionsShared.buildOptionPnlTable
 : (() => []);
 const sanitizeText = typeof shared.sanitizeText === 'function'
 ? shared.sanitizeText
 : ((value, fallback = '', max = 120) => String(value || '').trim().slice(0, max) || fallback);

 const V17_OPTIONS_PRODUCTS_TTL_MS = 60 * 1000;
 const V17_OPTIONS_TICKERS_TTL_MS = 25 * 1000;
 const V17_OPTIONS_LOG_LIMIT = 120;
 const V17_OPTIONS_REPAIR_STATE_KEY = 'optionsExecutionRepairState';
 const v17OptionsProductsCache = new Map();
 const v17OptionsTickersCache = new Map();
 const V17_NATIVE_STRADDLE_FEE_PCT_PER_SIDE = typeof EFFECTIVE_FEE_PCT_PER_SIDE === 'number' ? EFFECTIVE_FEE_PCT_PER_SIDE : 0.059;

 function v17OptionsCacheGet(cache, key, ttlMs) {
 const current = cache.get(String(key || ''));
 if (!current) return null;
 if ((Date.now() - Number(current.ts || 0)) > ttlMs) {
 cache.delete(String(key || ''));
 return null;
 }
 return current.value;
 }

 function v17OptionsCacheSet(cache, key, value) {
 cache.set(String(key || ''), { ts: Date.now(), value });
 return value;
 }

 function v17OptionTs(value = 0) {
 const raw = value == null ? '' : String(value).trim();
 if (!raw) return 0;
 const parser = typeof parseExchangeTimestampMs === 'function'
 ? parseExchangeTimestampMs
 : (raw => {
 const n = Number(raw || 0);
 if (!(n > 0)) return 0;
 if (n > 1e14) return Math.round(n / 1000);
 if (n > 1e12) return Math.round(n);
 return Math.round(n * 1000);
 });
 const numeric = Number(raw);
 if (Number.isFinite(numeric) && numeric > 0) return parser(numeric);
 const isoTs = Date.parse(raw);
 return Number.isFinite(isoTs) && isoTs > 0 ? isoTs : 0;
 }

 function v17ParseOptionSymbol(symbol = '') {
 const raw = String(symbol || '').trim().toUpperCase();
 const parts = raw.split('-').filter(Boolean);
 if (parts.length >= 4 && ['C', 'P', 'MV'].includes(parts[0])) {
 const optionType = parts[0] === 'C' ? 'call' : parts[0] === 'P' ? 'put' : 'straddle';
 const underlying = normalizeBaseSymbol(parts[1]);
 const strike = Number(parts[2] || 0);
 const expiryCode = String(parts[3] || '');
 return { symbol: raw, optionType, underlying, strike, expiryCode };
 }
 return { symbol: raw, optionType: '', underlying: '', strike: 0, expiryCode: '' };
 }

 function v17ExpiryCodeToTs(code = '') {
 const text = String(code || '').trim();
 if (!/^\d{6}$/.test(text)) return 0;
 const day = Number(text.slice(0, 2));
 const month = Number(text.slice(2, 4));
 const year = 2000 + Number(text.slice(4, 6));
 if (!(day > 0) || !(month > 0)) return 0;
 return Date.UTC(year, month - 1, day, 12, 0, 0, 0);
 }

 function v17ExpiryKey(ts = 0) {
 const value = Number(ts || 0);
 if (!(value > 0)) return '';
 return new Date(value).toISOString().slice(0, 10);
 }

 function v17ExpiryLabel(ts = 0) {
 const value = Number(ts || 0);
 if (!(value > 0)) return 'Unknown';
 return new Date(value).toLocaleDateString(undefined, {
 day: '2-digit',
 month: 'short',
 year: '2-digit',
 });
 }

 function v17ResolveDaysToExpiry(expiryTs = 0) {
 const value = Number(expiryTs || 0);
 if (!(value > 0)) return 0;
 return Math.max(0, (value - Date.now()) / 86400000);
 }

 function v17DetectOptionProductType(raw = {}) {
 const optionType = String(raw?.contract_type || raw?.option_type || raw?.optionType || '').toLowerCase();
 if (optionType.includes('call')) return 'call';
 if (optionType.includes('put')) return 'put';
 if (optionType.includes('move') || optionType.includes('straddle')) return 'straddle';
 return v17ParseOptionSymbol(raw?.symbol || raw?.product_symbol || '').optionType;
 }

 function v17DetectOptionUnderlying(raw = {}) {
 const nested = raw?.underlying_asset?.symbol || raw?.underlyingAsset?.symbol || raw?.underlying_asset_symbol || raw?.underlyingAssetSymbol || '';
 const parsed = v17ParseOptionSymbol(raw?.symbol || raw?.product_symbol || '');
 return normalizeBaseSymbol(nested || parsed.underlying || raw?.asset_symbol || '');
 }

 function v17DetectOptionStrike(raw = {}) {
 const parsed = v17ParseOptionSymbol(raw?.symbol || raw?.product_symbol || '');
 return Number(
 raw?.strike_price
 || raw?.strike
 || raw?.strikePrice
 || parsed.strike
 || 0
 );
 }

 function v17NormalizeOptionProduct(raw = {}) {
 const parsed = v17ParseOptionSymbol(raw?.symbol || raw?.product_symbol || '');
 const expiryTs = v17OptionTs(
 raw?.settlement_time
 || raw?.expiration_time
 || raw?.expiry_time
 || raw?.settlementTime
 || raw?.expiryTime
 || v17ExpiryCodeToTs(parsed.expiryCode)
 );
 const contractMultiplier = Number(
 raw?.contract_value
 || raw?.contractValue
 || raw?.contract_size
 || raw?.contractSize
 || 1
 ) || 1;
 return {
 symbol: String(raw?.symbol || raw?.product_symbol || '').trim().toUpperCase(),
 productId: Number(raw?.id || raw?.product_id || 0),
 optionType: v17DetectOptionProductType(raw),
 underlying: v17DetectOptionUnderlying(raw),
 strike: v17DetectOptionStrike(raw),
 expiryTs,
 expiryKey: v17ExpiryKey(expiryTs),
 expiryLabel: v17ExpiryLabel(expiryTs),
 daysToExpiry: v17ResolveDaysToExpiry(expiryTs),
 contractMultiplier,
 quoteCurrency: normalizeBaseSymbol(raw?.quoting_asset?.symbol || raw?.quote_currency || raw?.quoteCurrency || 'USD'),
 raw,
 };
 }

 function v17ReadTickerNumber(raw = {}, keys = []) {
 for (const key of keys) {
 if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
 const value = Number(raw[key]);
 if (Number.isFinite(value)) return value;
 }
 return 0;
 }

 function v17ReadTickerNestedNumber(raw = {}, paths = []) {
 for (const path of paths) {
 let cursor = raw;
 let failed = false;
 for (const key of path) {
 cursor = cursor?.[key];
 if (cursor == null) {
 failed = true;
 break;
 }
 }
 if (failed) continue;
 const value = Number(cursor);
 if (Number.isFinite(value)) return value;
 }
 return 0;
 }

 function v17NormalizeOptionTicker(raw = {}) {
 const parsed = v17ParseOptionSymbol(raw?.symbol || raw?.product_symbol || '');
 const optionType = v17DetectOptionProductType(raw) || parsed.optionType;
 const underlying = v17DetectOptionUnderlying(raw) || parsed.underlying;
 const strike = v17DetectOptionStrike(raw) || parsed.strike;
 const bidPrice = v17ReadTickerNumber(raw, ['best_bid', 'bid', 'bid_price', 'bidPrice'])
 || v17ReadTickerNestedNumber(raw, [['quotes', 'best_bid'], ['quotes', 'bid'], ['quotes', 'bid_price']]);
 const askPrice = v17ReadTickerNumber(raw, ['best_ask', 'ask', 'ask_price', 'askPrice'])
 || v17ReadTickerNestedNumber(raw, [['quotes', 'best_ask'], ['quotes', 'ask'], ['quotes', 'ask_price']]);
 const markPrice = v17ReadTickerNumber(raw, ['mark_price', 'markPrice', 'close', 'last_price', 'price'])
 || v17ReadTickerNestedNumber(raw, [['quotes', 'impact_mid_price']])
 || ((bidPrice > 0 && askPrice > 0) ? (bidPrice + askPrice) / 2 : 0);
 const expiryTs = v17OptionTs(
 raw?.settlement_time
 || raw?.expiration_time
 || raw?.expiry_time
 || raw?.settlementTime
 || raw?.expiryTime
 || v17ExpiryCodeToTs(parsed.expiryCode)
 );
 const delta = v17ReadTickerNumber(raw, ['delta']) || v17ReadTickerNestedNumber(raw, [['greeks', 'delta']]);
 const gamma = v17ReadTickerNumber(raw, ['gamma']) || v17ReadTickerNestedNumber(raw, [['greeks', 'gamma']]);
 const theta = v17ReadTickerNumber(raw, ['theta']) || v17ReadTickerNestedNumber(raw, [['greeks', 'theta']]);
 const vega = v17ReadTickerNumber(raw, ['vega']) || v17ReadTickerNestedNumber(raw, [['greeks', 'vega']]);
 const rho = v17ReadTickerNumber(raw, ['rho']) || v17ReadTickerNestedNumber(raw, [['greeks', 'rho']]);
 const impliedVolatility = v17ReadTickerNumber(raw, ['mark_iv', 'markIv', 'iv', 'implied_volatility', 'impliedVolatility', 'mark_vol'])
 || v17ReadTickerNestedNumber(raw, [['quotes', 'mark_iv'], ['quotes', 'ask_iv'], ['quotes', 'bid_iv'], ['greeks', 'iv']]);
 const oiContracts = v17ReadTickerNumber(raw, ['oi_contracts', 'open_interest_contracts', 'openInterestContracts']);
 const openInterestUsd = v17ReadTickerNumber(raw, ['open_interest_usd', 'oi_value_usd', 'oi_value', 'notional_value']);
 const openInterest = openInterestUsd || oiContracts || v17ReadTickerNumber(raw, ['open_interest', 'oi']);
 const underlyingPrice = v17ReadTickerNumber(raw, ['underlying_price', 'spot_price', 'underlyingPrice', 'index_price', 'indexPrice'])
 || v17ReadTickerNestedNumber(raw, [['greeks', 'spot']]);
 const bidSize = v17ReadTickerNumber(raw, ['best_bid_qty', 'bid_size', 'bidQty', 'bid_quantity'])
 || v17ReadTickerNestedNumber(raw, [['quotes', 'bid_size'], ['quotes', 'best_bid_qty']]);
 const askSize = v17ReadTickerNumber(raw, ['best_ask_qty', 'ask_size', 'askQty', 'ask_quantity'])
 || v17ReadTickerNestedNumber(raw, [['quotes', 'ask_size'], ['quotes', 'best_ask_qty']]);
 return {
 symbol: String(raw?.symbol || raw?.product_symbol || '').trim().toUpperCase(),
 optionType,
 underlying,
 strike,
 expiryTs,
 expiryKey: v17ExpiryKey(expiryTs),
 expiryLabel: v17ExpiryLabel(expiryTs),
 daysToExpiry: v17ResolveDaysToExpiry(expiryTs),
 bidPrice,
 askPrice,
 markPrice,
 lastPrice: v17ReadTickerNumber(raw, ['last_price', 'lastPrice', 'price', 'close']) || markPrice,
 bidSize,
 askSize,
 volume: v17ReadTickerNumber(raw, ['volume', 'volume_24h', 'quote_volume', 'turnover_24h']),
 openInterest,
 openInterestUsd,
 oiContracts,
 impliedVolatility: impliedVolatility > 3 ? impliedVolatility / 100 : impliedVolatility,
 delta,
 gamma,
 theta,
 vega,
 rho,
 underlyingPrice,
 raw,
 };
 }

 async function v17FetchOptionProducts(underlying = '') {
 await detectAPI();
 const safeUnderlying = sanitizeText(underlying, '', 12).toUpperCase();
 const cacheKey = `${BASE || 'delta'}::products::${safeUnderlying || 'ALL'}`;
 const cached = v17OptionsCacheGet(v17OptionsProductsCache, cacheKey, V17_OPTIONS_PRODUCTS_TTL_MS);
 if (cached) return cached;
 const output = [];
 const seen = new Set();
 for (let page = 1; page <= 10; page += 1) {
 let foundNew = false;
 const response = await rateLimitedFetch(`${BASE}/products?page_size=500&page_num=${page}`);
 if (!response?.ok) break;
 const payload = await response.json();
 const list = payload?.result ?? payload?.data ?? (Array.isArray(payload) ? payload : []);
 for (const raw of list) {
 const normalized = v17NormalizeOptionProduct(raw);
 const contractType = String(raw?.contract_type || '').toLowerCase();
 const isOption = normalized.optionType && (
 contractType.includes('option') || contractType.includes('move')
 || normalized.symbol.startsWith('C-')
 || normalized.symbol.startsWith('P-')
 || normalized.symbol.startsWith('MV-')
 );
 if (!isOption || !normalized.symbol || seen.has(normalized.symbol)) continue;
 if (safeUnderlying && normalized.underlying !== safeUnderlying) continue;
 const state = String(raw?.state || '').toLowerCase();
 if (state && ['expired', 'inactive'].includes(state)) continue;
 seen.add(normalized.symbol);
 output.push(normalized);
 foundNew = true;
 }
 if (!foundNew && page > 2) break;
 }
 output.sort((a, b) => a.expiryTs - b.expiryTs || a.strike - b.strike || a.symbol.localeCompare(b.symbol));
 return v17OptionsCacheSet(v17OptionsProductsCache, cacheKey, output);
 }

 async function v17FetchOptionTickers(underlying = '') {
 await detectAPI();
 const safeUnderlying = sanitizeText(underlying, '', 12).toUpperCase();
 const cacheKey = `${BASE || 'delta'}::tickers::${safeUnderlying || 'ALL'}`;
 const cached = v17OptionsCacheGet(v17OptionsTickersCache, cacheKey, V17_OPTIONS_TICKERS_TTL_MS);
 if (cached) return cached;
 const output = new Map();
 const urls = [
 `${BASE}/tickers?contract_types=call_options`,
 `${BASE}/tickers?contract_types=put_options`,
 `${BASE}/tickers`,
 ];
 for (const url of urls) {
 try {
 const response = await rateLimitedFetch(url);
 if (!response?.ok) continue;
 const payload = await response.json();
 const list = payload?.result ?? payload?.data ?? (Array.isArray(payload) ? payload : []);
 list.forEach(raw => {
 const normalized = v17NormalizeOptionTicker(raw);
 if (!normalized.symbol || !normalized.optionType) return;
 if (safeUnderlying && normalized.underlying !== safeUnderlying) return;
 if (!output.has(normalized.symbol)) output.set(normalized.symbol, normalized);
 });
 } catch (_) {
 continue;
 }
 }
 return v17OptionsCacheSet(v17OptionsTickersCache, cacheKey, output);
 }

 async function v17FetchUnderlyingReferencePrice(underlying = '') {
 const base = sanitizeText(underlying, '', 12).toUpperCase();
 if (!base) return 0;
 const candidates = [`${base}USD`, `${base}USDT`, `PERP-${base}USD`];
 for (const symbol of candidates) {
 try {
 const ticker = await v16FetchPublicTicker(symbol);
 const price = Number(ticker?.markPrice || ticker?.price || ticker?.raw?.mark_price || ticker?.raw?.price || 0);
 if (price > 0) return price;
 } catch (_) {
 continue;
 }
 }
 return 0;
 }

 async function v17BuildUnderlyingStraddleMarketContext(underlying = '', fallbackPrice = 0) {
 const base = sanitizeText(underlying || 'BTC', 'BTC', 12).toUpperCase();
 const candidates = [`${base}USD`, `${base}USDT`, `PERP-${base}USD`];
 let ticker = null;
 for (const symbol of candidates) {
 try {
 ticker = await v16FetchPublicTicker(symbol);
 if (ticker) break;
 } catch (_) {
 continue;
 }
 }
 const raw = ticker?.raw || ticker || {};
 return buildNativeStraddleMarketContext({
 underlying: base,
 price: Number(ticker?.markPrice || ticker?.price || raw.mark_price || raw.price || fallbackPrice || 0),
 change24h: Number(ticker?.change24h || raw.change24h || raw.change_24h || raw.price_change_24h || 0),
 move4h: Number(ticker?.move4h || raw.move4h || raw.change4h || 0),
 fundingRate: Number(ticker?.fundingRate || raw.funding_rate_8h || raw.funding_rate || raw.predicted_funding_rate || 0),
 trendScore: Number(ticker?.trendScore || ticker?.score || 50),
 });
 }

 /* ===================================================================
 NATIVE STRADDLE (MV-): Fetch tickers & build chain
 =================================================================== */
 async function v17FetchStraddleTickers(underlying = '') {
 await detectAPI();
 const safeUnderlying = sanitizeText(underlying, '', 12).toUpperCase();
 const cacheKey = `${BASE || 'delta'}::straddle_tickers::${safeUnderlying || 'ALL'}`;
 const cached = v17OptionsCacheGet(v17OptionsTickersCache, cacheKey, V17_OPTIONS_TICKERS_TTL_MS);
 if (cached) return cached;
 const output = new Map();
 const urls = [
 `${BASE}/tickers?contract_types=move_options`,
 `${BASE}/tickers`,
 ];
 for (const url of urls) {
 try {
 const response = await rateLimitedFetch(url);
 if (!response?.ok) continue;
 const payload = await response.json();
 const list = payload?.result ?? payload?.data ?? (Array.isArray(payload) ? payload : []);
 list.forEach(raw => {
 const sym = String(raw?.symbol || raw?.product_symbol || '').trim().toUpperCase();
 if (!sym.startsWith('MV-')) return;
 const normalized = v17NormalizeOptionTicker(raw);
 if (!normalized.symbol) return;
 if (safeUnderlying && normalized.underlying !== safeUnderlying) return;
 if (!output.has(normalized.symbol)) output.set(normalized.symbol, normalized);
 });
 } catch (_) {
 continue;
 }
 }
 return v17OptionsCacheSet(v17OptionsTickersCache, cacheKey, output);
 }

 async function v17GetStraddleChain(payload = {}) {
 const underlying = sanitizeText(payload?.underlying || 'BTC', 'BTC', 12).toUpperCase();
 const products = (await v17FetchOptionProducts(underlying))
 .filter(p => p.underlying === underlying && p.optionType === 'straddle' && p.expiryKey && p.expiryTs > 0);
 if (!products.length) return { ok: false, error: `No native straddle (MV-) products found for ${underlying}` };
 const tickers = await v17FetchStraddleTickers(underlying);
 const expiries = Array.from(new Map(products.map(p => [p.expiryKey, {
 key: p.expiryKey,
 label: p.expiryLabel,
 expiryTs: p.expiryTs,
 daysToExpiry: p.daysToExpiry,
 }])).values()).sort((a, b) => a.expiryTs - b.expiryTs);
 const selectedExpiryKey = expiries.some(e => e.key === payload?.expiryKey)
 ? String(payload.expiryKey)
 : expiries[0]?.key;
 const contracts = products
 .filter(p => !selectedExpiryKey || p.expiryKey === selectedExpiryKey)
 .map(product => {
 const ticker = tickers.get(product.symbol) || {};
 return {
 symbol: product.symbol,
 productId: product.productId,
 optionType: 'straddle',
 underlying: product.underlying,
 strike: product.strike,
 expiryTs: product.expiryTs,
 expiryKey: product.expiryKey,
 expiryLabel: product.expiryLabel,
 daysToExpiry: product.daysToExpiry || v17ResolveDaysToExpiry(product.expiryTs),
 contractMultiplier: product.contractMultiplier || 1,
 markPrice: Number(ticker.markPrice || 0),
 bid: Number(ticker.bidPrice || 0),
 ask: Number(ticker.askPrice || 0),
 lastPrice: Number(ticker.lastPrice || ticker.markPrice || 0),
 volume: Number(ticker.volume || ticker.volumeContracts || 0),
 oiContracts: Number(ticker.oiContracts || ticker.openInterest || 0),
 iv: Number(ticker.impliedVolatility || 0),
 delta: Number(ticker.delta || 0),
 gamma: Number(ticker.gamma || 0),
 theta: Number(ticker.theta || 0),
 vega: Number(ticker.vega || 0),
 underlyingPrice: Number(ticker.underlyingPrice || 0),
 };
 })
 .sort((a, b) => a.strike - b.strike);
 let underlyingPrice = contracts.find(c => c.underlyingPrice > 0)?.underlyingPrice || 0;
 if (!(underlyingPrice > 0)) underlyingPrice = await v17FetchUnderlyingReferencePrice(underlying);
 const marketContext = await v17BuildUnderlyingStraddleMarketContext(underlying, underlyingPrice).catch(() => buildNativeStraddleMarketContext({ underlying, price: underlyingPrice }));
 const atmStrike = contracts.reduce((best, c) => {
 const diff = Math.abs(c.strike - underlyingPrice);
 if (!best || diff < best.diff) return { strike: c.strike, diff };
 return best;
 }, null)?.strike || 0;
 return {
 ok: true,
 underlying,
 underlyingPrice,
 atmStrike,
 marketContext,
 expiryKey: selectedExpiryKey,
 expiries,
 contracts,
 fetchedAt: Date.now(),
 };
 }

 function v17BuildChainRows(products = [], tickers = new Map(), selectedExpiryKey = '') {
 const rowsByStrike = new Map();
 products
 .filter(product => !selectedExpiryKey || product.expiryKey === selectedExpiryKey)
 .forEach(product => {
 const strikeKey = Number(product.strike || 0);
 if (!(strikeKey > 0)) return;
 const bucket = rowsByStrike.get(strikeKey) || { strike: strikeKey, call: null, put: null };
 const ticker = tickers.get(product.symbol) || {};
 const entry = {
 ...sanitizeOptionLeg({
 ...product,
 ...ticker,
 symbol: product.symbol,
 optionType: product.optionType,
 strike: product.strike,
 daysToExpiry: product.daysToExpiry,
 contractMultiplier: product.contractMultiplier,
 underlying: product.underlying,
 expiryTs: product.expiryTs,
 expiryKey: product.expiryKey,
 markPrice: ticker.markPrice,
 bidPrice: ticker.bidPrice,
 askPrice: ticker.askPrice,
 openInterest: ticker.openInterest,
 impliedVolatility: ticker.impliedVolatility,
 delta: ticker.delta,
 gamma: ticker.gamma,
 theta: ticker.theta,
 vega: ticker.vega,
 rho: ticker.rho,
 }),
 productId: product.productId,
 underlyingPrice: Number(ticker.underlyingPrice || 0),
 };
 bucket[product.optionType] = entry;
 rowsByStrike.set(strikeKey, bucket);
 });
 return Array.from(rowsByStrike.values()).sort((a, b) => a.strike - b.strike);
 }

 async function v17GetOptionUniverse(payload = {}) {
 const underlying = sanitizeText(payload?.underlying || '', '', 12).toUpperCase();
 const products = await v17FetchOptionProducts(underlying);
 const byUnderlying = new Map();
 products.forEach(product => {
 if (!product.underlying || !product.expiryKey || !(product.expiryTs > 0)) return;
 const key = product.underlying;
 const bucket = byUnderlying.get(key) || {
 underlying: key,
 expiries: new Map(),
 };
 const expiryBucket = bucket.expiries.get(product.expiryKey) || {
 key: product.expiryKey,
 label: product.expiryLabel,
 expiryTs: product.expiryTs,
 daysToExpiry: product.daysToExpiry,
 calls: 0,
 puts: 0,
 strikes: new Set(),
 };
 expiryBucket.strikes.add(product.strike);
 if (product.optionType === 'call') expiryBucket.calls += 1;
 if (product.optionType === 'put') expiryBucket.puts += 1;
 bucket.expiries.set(product.expiryKey, expiryBucket);
 byUnderlying.set(key, bucket);
 });
 return {
 ok: true,
 underlyings: Array.from(byUnderlying.values())
 .map(item => ({
 underlying: item.underlying,
 expiries: Array.from(item.expiries.values())
 .sort((a, b) => a.expiryTs - b.expiryTs)
 .map(expiry => ({
 key: expiry.key,
 label: expiry.label,
 expiryTs: expiry.expiryTs,
 daysToExpiry: Number(expiry.daysToExpiry || 0),
 calls: expiry.calls,
 puts: expiry.puts,
 strikeCount: expiry.strikes.size,
 })),
 }))
 .sort((a, b) => a.underlying.localeCompare(b.underlying)),
 };
 }

 async function v17GetOptionsChain(payload = {}) {
 const underlying = sanitizeText(payload?.underlying || 'BTC', 'BTC', 12).toUpperCase();
 const products = (await v17FetchOptionProducts(underlying))
 .filter(product => product.underlying === underlying && product.expiryKey && product.expiryTs > 0);
 if (!products.length) throw new Error(`No Delta option products found for ${underlying}`);
 const tickers = await v17FetchOptionTickers(underlying);
 const expiries = Array.from(new Map(products.map(product => [product.expiryKey, {
 key: product.expiryKey,
 label: product.expiryLabel,
 expiryTs: product.expiryTs,
 daysToExpiry: product.daysToExpiry,
 }])).values()).sort((a, b) => a.expiryTs - b.expiryTs);
 const selectedExpiryKey = expiries.some(expiry => expiry.key === payload?.expiryKey)
 ? String(payload.expiryKey)
 : expiries[0]?.key;
 const rows = v17BuildChainRows(products, tickers, selectedExpiryKey);
 let underlyingPrice = rows.find(row => Number(row.call?.underlyingPrice || row.put?.underlyingPrice || 0) > 0)?.call?.underlyingPrice
 || rows.find(row => Number(row.put?.underlyingPrice || row.call?.underlyingPrice || 0) > 0)?.put?.underlyingPrice
 || 0;
 if (!(underlyingPrice > 0)) {
 underlyingPrice = await v17FetchUnderlyingReferencePrice(underlying);
 }
 const atmStrike = rows.reduce((best, row) => {
 const candidateDiff = Math.abs(Number(row.strike || 0) - Number(underlyingPrice || 0));
 if (!best || candidateDiff < best.diff) return { strike: row.strike, diff: candidateDiff };
 return best;
 }, null)?.strike || 0;
 const allContracts = rows.flatMap(row => [row.call, row.put]).filter(Boolean);
 const spreads = allContracts.map(contract => {
 const bid = Number(contract.bidPrice || contract.bid || 0);
 const ask = Number(contract.askPrice || contract.ask || 0);
 const mark = Math.max(Number(contract.markPrice || contract.premium || 0), bid > 0 && ask > 0 ? (bid + ask) / 2 : 0.01);
 return bid > 0 && ask > 0 ? ((ask - bid) / mark) * 100 : 100;
 });
 const liquidCount = allContracts.filter(contract => Number(contract.openInterest || contract.oiContracts || 0) >= 250 && Number(contract.markPrice || 0) > 0).length;
 const quality = {
 contractCount: allContracts.length,
 strikeCount: rows.length,
 avgSpreadPct: spreads.length ? +(spreads.reduce((sum, value) => sum + value, 0) / spreads.length).toFixed(2) : 0,
 tightQuotePct: allContracts.length ? +((spreads.filter(value => value <= 5).length / allContracts.length) * 100).toFixed(1) : 0,
 liquidPct: allContracts.length ? +((liquidCount / allContracts.length) * 100).toFixed(1) : 0,
 staleAfterMs: V17_OPTIONS_TICKERS_TTL_MS,
 source: 'delta_public_rest',
 };
 return {
 ok: true,
 underlying,
 underlyingPrice,
 atmStrike,
 expiryKey: selectedExpiryKey,
 expiries,
 rows,
 quality,
 fetchedAt: Date.now(),
 };
 }

 async function v17GetVolatilitySkew(payload = {}) {
 const chain = await v17GetOptionsChain(payload);
 if (!chain?.ok) return chain;
 const metrics = computeVolatilitySkewMetrics(chain, {
 underlying: chain.underlying,
 expiryKey: chain.expiryKey,
 spotPrice: chain.underlyingPrice,
 });
 const rr = Number(metrics.riskReversal25d || 0);
 const bf = Number(metrics.butterfly25d || 0);
 const tradingNote = rr <= -6
 ? 'Put skew is heavy; treat it as a tail-risk warning and avoid selling downside vol blindly.'
 : rr >= 4
 ? 'Call skew is rich; upside demand is elevated and squeeze conditions may dominate this expiry.'
 : bf >= 3
 ? 'Both wings are rich versus ATM; event or tail premium is elevated across the smile.'
 : 'Skew is relatively balanced; use it as a secondary regime filter rather than a primary trigger.';
 const expirySummaries = [];
 const expiries = Array.isArray(chain.expiries) ? chain.expiries.slice(0, 12) : [];
 for (const expiry of expiries) {
 try {
 const expiryChain = expiry.key === chain.expiryKey ? chain : await v17GetOptionsChain({ ...payload, underlying: chain.underlying, expiryKey: expiry.key, force: false });
 const expiryMetrics = computeVolatilitySkewMetrics(expiryChain, {
 underlying: chain.underlying,
 expiryKey: expiry.key,
 spotPrice: expiryChain?.underlyingPrice || chain.underlyingPrice,
 });
 expirySummaries.push({
 expiryKey: expiry.key,
 expiryLabel: expiry.label || expiry.key,
 expiryTs: Number(expiry.expiryTs || 0),
 daysToExpiry: Number(expiry.daysToExpiry || 0),
 atmIv: Number(expiryMetrics.atmIv || 0),
 riskReversal25d: Number(expiryMetrics.riskReversal25d || 0),
 butterfly25d: Number(expiryMetrics.butterfly25d || 0),
 quoteQuality: expiryMetrics.quoteQuality || null,
 regime: expiryMetrics.regime || { key: 'flat', label: 'Flat Skew', tone: 'info', summary: '' },
 });
 } catch (_) {}
 }
 return {
 ok: true,
 underlying: chain.underlying,
 expiryKey: chain.expiryKey,
 expiryLabel: Array.isArray(chain.expiries) ? (chain.expiries.find(item => item.key === chain.expiryKey)?.label || chain.expiryKey) : chain.expiryKey,
 underlyingPrice: chain.underlyingPrice,
 atmStrike: chain.atmStrike,
 fetchedAt: chain.fetchedAt,
 points: metrics.points,
 metrics: {
 atmIv: Number(metrics.atmIv || 0),
 put25dIv: Number(metrics.put25dIv || 0),
 call25dIv: Number(metrics.call25dIv || 0),
 riskReversal25d: rr,
 butterfly25d: bf,
 put25dStrike: Number(metrics.put25dStrike || 0),
 call25dStrike: Number(metrics.call25dStrike || 0),
 },
 quoteQuality: metrics.quoteQuality || null,
 expirySummaries,
 regime: metrics.regime || { key: 'flat', label: 'Flat Skew', tone: 'info', summary: '' },
 tradingNote,
 };
 }

 function v17ResolveStrategyContextFromLegs(legs = []) {
 const normalized = (Array.isArray(legs) ? legs : []).map(leg => sanitizeOptionLeg(leg));
 const underlyingPrice = normalized.find(leg => Number(leg.underlyingPrice || leg.markPrice || 0) > 0)?.underlyingPrice || 0;
 const daysToExpiry = normalized.reduce((max, leg) => Math.max(max, Number(leg.daysToExpiry || 0)), 0);
 return { underlyingPrice, daysToExpiry };
 }

 async function v17AnalyzeOptionStrategy(payload = {}) {
 const legs = (Array.isArray(payload?.legs) ? payload.legs : []).map(leg => sanitizeOptionLeg(leg));
 if (!legs.length) throw new Error('At least one strategy leg is required');
 const ctx = v17ResolveStrategyContextFromLegs(legs);
 const context = {
 underlyingPrice: Number(payload?.underlyingPrice || ctx.underlyingPrice || 0),
 daysToExpiry: Number(payload?.daysToExpiry || ctx.daysToExpiry || 0),
 targetDays: Number(payload?.targetDays || Math.min(ctx.daysToExpiry || 0, 3) || 0),
 priceRangePct: Number(payload?.priceRangePct || 0.18),
 points: Number(payload?.points || 141),
 rate: Number(payload?.rate || 0),
 };
 const summary = summarizeOptionStrategy(legs, context);
 return {
 ok: true,
 summary,
 pnlTable: buildOptionPnlTable(legs, context),
 };
 }

 function v17ResolveStrategyLimitPrice(leg = {}, entryMode = 'limit') {
 const mode = String(entryMode || '').trim().toLowerCase();
 const side = String(leg.side || '').trim().toLowerCase();
 const bid = Number(leg.bidPrice || 0);
 const ask = Number(leg.askPrice || 0);
 const mark = Number(leg.markPrice || leg.entryPrice || 0);
 if (mode === 'market') return 0;
 if (side === 'sell') return Number((Math.max(mark, bid || 0)).toFixed(4));
 if (side === 'buy') {
 const price = ask > 0 ? ask : (mark > 0 ? mark : bid);
 return Number(price.toFixed(4));
 }
 return Number(mark.toFixed(4));
 }

 async function v17PlaceDirectOptionOrder(leg = {}, access = null, settings = {}) {
 const normalized = sanitizeOptionLeg(leg);
 const resolvedAccess = access || await v16ResolveAuthorizedProfile({ profileId: settings?.profileId || '' }, { tradeRequired: true });
 const product = await v16ResolveProductBySymbol(normalized.symbol);
 if (!product?.id) throw new Error(`No Delta product found for ${normalized.symbol}`);
 const entryMode = String(settings?.entryMode || 'limit').trim().toLowerCase();
 const orderType = entryMode === 'market' ? 'market_order' : 'limit_order';
 const limitPrice = v17ResolveStrategyLimitPrice(normalized, entryMode);
 const estimatedNotional = Math.max(0, Number(normalized.markPrice || normalized.entryPrice || limitPrice || 0)) * Math.max(1, Number(normalized.quantity || 1)) * Math.max(0.000001, Number(normalized.contractMultiplier || 1));
 const maxOrderUSD = Number(resolvedAccess?.profile?.maxOrderSizeUSD || 60);
 if (estimatedNotional > maxOrderUSD) {
 throw new Error(`Leg ${normalized.symbol} estimated notional $${estimatedNotional.toFixed(2)} exceeds profile cap $${maxOrderUSD.toFixed(2)}`);
 }
 const requestBody = {
 product_id: Number(product.id || product.product_id || 0),
 size: Math.max(1, Math.round(Number(normalized.quantity || 1))),
 side: String(normalized.side || 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy',
 order_type: orderType,
 post_only: entryMode === 'maker_only',
 time_in_force: 'gtc',
 client_order_id: `ds_opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 32),
 };
 if (settings?.reduceOnly) requestBody.reduce_only = true;
 if (orderType === 'limit_order') {
 if (!(limitPrice > 0)) throw new Error(`Limit price missing for ${normalized.symbol}`);
 requestBody.limit_price = limitPrice;
 }
 const result = await v16SignedFetch({
 ...v16BuildPrivateAccessArgs(resolvedAccess),
 method: 'POST',
 path: '/orders',
 body: requestBody,
 baseUrl: resolvedAccess.baseUrl,
 });
 return {
 symbol: normalized.symbol,
 side: requestBody.side,
 orderType,
 limitPrice,
 estimatedNotional,
 result,
 };
 }

 async function v17RecordOptionStrategyOrderLog(entry = {}) {
 const logDoc = await storeLocalGet(['optionStrategyOrderLog']);
 const log = Array.isArray(logDoc?.optionStrategyOrderLog) ? logDoc.optionStrategyOrderLog.slice() : [];
 log.unshift({
 ts: Date.now(),
 ...entry,
 });
 await storeLocalSet({ optionStrategyOrderLog: log.slice(0, V17_OPTIONS_LOG_LIMIT) });
 }

 function v17BuildOptionsRepairState(input = {}) {
 const id = String(input.id || `options_repair_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`);
 return {
 id,
 ts: Number(input.ts || Date.now()),
 status: String(input.status || 'open'),
 severity: String(input.severity || 'blocker'),
 source: String(input.source || 'options_execution'),
 message: sanitizeText(input.message, 'Options execution needs manual review before new orders.', 240),
 symbols: Array.isArray(input.symbols) ? input.symbols.map(symbol => sanitizeText(symbol, '', 80)).filter(Boolean) : [],
 details: input.details || {},
 repairActions: Array.isArray(input.repairActions) ? input.repairActions.slice(0, 8) : [
 'Open Manage > Orders and confirm whether any option orders are still working.',
 'Open Manage > Positions and flatten or hedge orphan exposure.',
 'Only resume options trading after the exposure and stop protection are verified.',
 ],
 updatedAt: Date.now(),
 };
 }

 async function v17PersistOptionsRepairState(input = {}) {
 const repair = v17BuildOptionsRepairState(input);
 await storeLocalSet({ [V17_OPTIONS_REPAIR_STATE_KEY]: repair });
 return repair;
 }

 async function v17ReadOptionsRepairState() {
 const stored = await storeLocalGet([V17_OPTIONS_REPAIR_STATE_KEY]);
 const repair = stored?.[V17_OPTIONS_REPAIR_STATE_KEY] || null;
 if (!repair || String(repair.status || '') !== 'open') return null;
 return repair;
 }

 async function v17AssertOptionsExecutionUnlocked() {
 const repair = await v17ReadOptionsRepairState();
 if (!repair) return true;
 throw new Error(`Options execution locked: ${repair.message || 'manual repair required'}`);
 }

 function v17BuildOppositeOptionLeg(leg = {}) {
 const normalized = sanitizeOptionLeg(leg);
 return sanitizeOptionLeg({
 ...normalized,
 side: String(normalized.side || '').toLowerCase() === 'sell' ? 'buy' : 'sell',
 quantity: Math.max(1, Math.round(Number(normalized.quantity || normalized.qty || 1))),
 qty: Math.max(1, Math.round(Number(normalized.quantity || normalized.qty || 1))),
 });
 }

 async function v17PlaceOptionStrategyOrders(payload = {}) {
 const legs = (Array.isArray(payload?.legs) ? payload.legs : []).map(leg => sanitizeOptionLeg(leg));
 if (!legs.length) throw new Error('At least one strategy leg is required');
 await v17AssertOptionsExecutionUnlocked();
 if (!payload?.automated && payload?.previewAccepted !== true) {
 throw new Error('Final options order preview was not accepted. Re-open the ticket and confirm before placing.');
 }
 const access = await v16ResolveAuthorizedProfile(payload, { tradeRequired: true });
 const summaryEnvelope = await v17AnalyzeOptionStrategy({
 legs,
 underlyingPrice: payload?.underlyingPrice,
 daysToExpiry: payload?.daysToExpiry,
 targetDays: payload?.targetDays,
 });
 const allowUndefinedRisk = !!payload?.allowUndefinedRisk;
 if (summaryEnvelope.summary?.hasUndefinedRisk && !allowUndefinedRisk) {
 throw new Error('This option strategy has undefined upside risk. Enable undefined-risk execution explicitly before placing it.');
 }
 const maxRiskUSD = Number(payload?.maxRiskUSD || 0);
 if (maxRiskUSD > 0 && summaryEnvelope.summary?.maxLoss != null && Math.abs(Number(summaryEnvelope.summary.maxLoss || 0)) > maxRiskUSD) {
 throw new Error(`Strategy max loss $${Math.abs(Number(summaryEnvelope.summary.maxLoss || 0)).toFixed(2)} exceeds allowed risk $${maxRiskUSD.toFixed(2)}`);
 }
 const orderedLegs = legs.slice().sort((a, b) => {
 const aSell = String(a.side || '').toLowerCase() === 'sell';
 const bSell = String(b.side || '').toLowerCase() === 'sell';
 return Number(aSell) - Number(bSell);
 });
 const results = [];
 const placedLegs = [];
 const strategyLabel = sanitizeText(payload?.strategyLabel, 'manual_option_strategy', 48);
 try {
 for (const leg of orderedLegs) {
 const placed = await v17PlaceDirectOptionOrder(leg, access, { entryMode: payload?.entryMode || 'limit' });
 results.push(placed);
 placedLegs.push({ leg, placed });
 }
 } catch (error) {
 const compensationResults = [];
 for (const placedLeg of placedLegs.slice().reverse()) {
 try {
 const closeLeg = v17BuildOppositeOptionLeg(placedLeg.leg);
 const closeResult = await v17PlaceDirectOptionOrder(closeLeg, access, {
 entryMode: 'market',
 reduceOnly: true,
 });
 compensationResults.push({ ok: true, symbol: closeLeg.symbol, side: closeLeg.side, result: closeResult });
 } catch (closeError) {
 compensationResults.push({
 ok: false,
 symbol: placedLeg.leg?.symbol || '',
 side: String(placedLeg.leg?.side || ''),
 error: closeError?.message || 'Compensation order failed',
 });
 }
 }
 await v17RecordOptionStrategyOrderLog({
 profileId: access.profileId,
 strategyLabel,
 symbols: legs.map(leg => leg.symbol),
 legs: orderedLegs,
 summary: summaryEnvelope.summary,
 orderCount: results.length,
 status: results.length ? 'partial_failed' : 'failed',
 error: error?.message || 'Strategy order failed',
 results,
 compensationResults,
 automated: !!payload?.automated,
 });
 await v17PersistOptionsRepairState({
 source: 'strategy_basket',
 message: results.length
 ? `Strategy ${strategyLabel} partially placed (${results.length}/${orderedLegs.length}). Verify positions/orders before any new options trade.`
 : `Strategy ${strategyLabel} failed during placement. Verify no orders were accepted before retrying.`,
 symbols: legs.map(leg => leg.symbol),
 details: {
 strategyLabel,
 placedCount: results.length,
 expectedCount: orderedLegs.length,
 error: error?.message || '',
 compensationResults,
 },
 });
 throw new Error(results.length
 ? `Strategy partially placed (${results.length}/${orderedLegs.length}). Rollback attempted; check Orders before retrying. ${error?.message || ''}`.trim()
 : (error?.message || 'Strategy order failed'));
 }
 await v17RecordOptionStrategyOrderLog({
 profileId: access.profileId,
 strategyLabel,
 symbols: legs.map(leg => leg.symbol),
 legs: orderedLegs,
 summary: summaryEnvelope.summary,
 orderCount: results.length,
 status: 'placed',
 automated: !!payload?.automated,
 });
 return {
 ok: true,
 profileId: access.profileId,
 summary: summaryEnvelope.summary,
 results,
 };
 }

 async function v17EmitOptionsAutoTradeNotice(cfg = {}, entry = {}) {
 const symbolList = Array.isArray(entry?.symbols) ? entry.symbols.join(', ') : '';
 const body = `${String(entry?.templateId || 'Option strategy').toUpperCase()}\n${symbolList}\nNet credit: $${Number(entry?.netPremium || 0).toFixed(2)}\nMax loss: ${entry?.maxLoss == null ? 'Undefined' : `$${Math.abs(Number(entry.maxLoss || 0)).toFixed(2)}`}`;
 if (cfg.notifyBrowser && chrome?.notifications?.create) {
 chrome.notifications.create(`options_auto_${Date.now()}`, {
 type: 'basic',
 iconUrl: 'icons/icon128.png',
 title: 'Options auto trade placed',
 message: body,
 });
 }
 if (cfg.notifyTelegram && typeof getStoredTelegramConfig === 'function' && typeof v16SendTelegramTextMessage === 'function') {
 try {
 const telegramCfg = await getStoredTelegramConfig();
 await v16SendTelegramTextMessage(telegramCfg || {}, `Options auto trade placed\n${body}`);
 } catch (_) {
 return;
 }
 }
 }

 function v17ResolveOptionsSignalDirection(signal = {}) {
 const direction = String(signal?.direction || signal?.side || '').toLowerCase();
 if (direction.includes('short') || direction === 'bearish') return 'bearish';
 if (direction.includes('long') || direction === 'bullish') return 'bullish';
 return '';
 }

 async function runOptionsAutoTradeEngine(scanResults = []) {
 const stored = await storeLocalGet(['optionsAutoTradeSettings', 'optionsAutoTradeLog']);
 const cfg = sanitizeOptionsAutoTradeSettings(stored?.optionsAutoTradeSettings || {});
 if (!cfg.enabled) return { ok: true, active: false, placed: 0 };
 await v17AssertOptionsExecutionUnlocked();
 const log = Array.isArray(stored?.optionsAutoTradeLog) ? stored.optionsAutoTradeLog.slice() : [];
 const startOfDay = new Date();
 startOfDay.setHours(0, 0, 0, 0);
 const todayTs = startOfDay.getTime();
 const placedToday = log.filter(item => Number(item?.ts || 0) >= todayTs);
 if (placedToday.length >= cfg.maxStrategiesPerDay) {
 return { ok: true, active: true, placed: 0, skipped: 'daily_limit' };
 }
 const activeCount = placedToday.filter(item => String(item?.status || 'placed') === 'placed').length;
 if (activeCount >= cfg.maxConcurrentStrategies) {
 return { ok: true, active: true, placed: 0, skipped: 'concurrent_limit' };
 }
 const signals = (Array.isArray(scanResults) ? scanResults : [])
 .filter(signal => {
 const base = normalizeBaseSymbol(signal?.symbol || '').replace(/USD(T)?$/i, '');
 return cfg.underlyings.includes(base)
 && Number(signal?.tradeQuality?.score || 0) >= cfg.minTradeQuality
 && !!v17ResolveOptionsSignalDirection(signal);
 })
 .sort((a, b) => Number(b?.tradeQuality?.score || 0) - Number(a?.tradeQuality?.score || 0));
 let placed = 0;
 for (const signal of signals) {
 if ((placedToday.length + placed) >= cfg.maxStrategiesPerDay) break;
 if ((activeCount + placed) >= cfg.maxConcurrentStrategies) break;
 const base = normalizeBaseSymbol(signal?.symbol || '').replace(/USD(T)?$/i, '');
 const direction = v17ResolveOptionsSignalDirection(signal);
 if (!base || !direction) continue;
 const chain = await v17GetOptionsChain({ underlying: base }).catch(() => null);
 if (!chain?.rows?.length) continue;
 const contracts = chain.rows.flatMap(row => [row.call, row.put]).filter(Boolean).map(contract => ({
 ...contract,
 underlyingPrice: Number(chain.underlyingPrice || 0),
 }));
 const strategy = buildDirectionalCreditSpreadFromChain(contracts, direction, cfg);
 if (!strategy?.legs?.length) continue;
 if (strategy.summary?.maxLoss == null && !cfg.allowUndefinedRisk) continue;
 if (strategy.summary?.maxLoss != null && Math.abs(Number(strategy.summary.maxLoss || 0)) > cfg.maxRiskUSD) continue;
 const result = await v17PlaceOptionStrategyOrders({
 legs: strategy.legs,
 underlyingPrice: chain.underlyingPrice,
 daysToExpiry: Math.max(...strategy.legs.map(leg => Number(leg.daysToExpiry || 0)), 0),
 entryMode: cfg.entryMode,
 allowUndefinedRisk: cfg.allowUndefinedRisk,
 maxRiskUSD: cfg.maxRiskUSD,
 strategyLabel: strategy.templateId,
 automated: true,
 }).catch(() => null);
 if (!result?.ok) continue;
 const entry = {
 ts: Date.now(),
 underlying: base,
 templateId: strategy.templateId,
 status: 'placed',
 symbols: strategy.legs.map(leg => leg.symbol),
 netPremium: Number(strategy.summary?.netPremium || 0),
 maxLoss: strategy.summary?.maxLoss,
 };
 log.unshift(entry);
 placed += 1;
 await v17EmitOptionsAutoTradeNotice(cfg, entry).catch(() => {});
 }
 if (placed > 0) {
 await storeLocalSet({ optionsAutoTradeLog: log.slice(0, V17_OPTIONS_LOG_LIMIT) });
 }
 return { ok: true, active: true, placed };
 }

 /* ===================================================================
 STRADDLE AUTO-TRADE: Entry Engine
 =================================================================== */
 const V17_STRADDLE_LOG_LIMIT = 120;
 const V17_STRADDLE_AUTOMATION_STATE_KEY = 'optionsStraddleAutomationState';
 const V17_STRADDLE_MONITOR_INTERVAL_MINUTES = 1;

 function v17GetStartOfDayTs() {
 const start = new Date();
 start.setHours(0, 0, 0, 0);
 return start.getTime();
 }

 function v17ResolveStraddleExpiryBucket(entry = {}) {
 const daysToExpiry = Math.max(0, Number(entry?.daysToExpiry || ((Number(entry?.expiryTs || 0) - Date.now()) / 86400000) || 0));
 if (daysToExpiry <= 1) return 'same_day';
 if (daysToExpiry <= 7) return 'weekly';
 return 'swing';
 }

 function v17ResolveStraddleCooldownRemainingMs(log = [], cfg = {}) {
 const latest = (Array.isArray(log) ? log : []).find(item => Number(item?.ts || 0) > 0);
 if (!latest) return 0;
 const cooldownMs = Math.max(0, Number(cfg.cooldownMinutes || 0) * 60000);
 return Math.max(0, cooldownMs - (Date.now() - Number(latest.ts || 0)));
 }

 function v17NormalizeProtectionSource(value = '', fallback = '') {
 const raw = String(value || '').trim().toLowerCase();
 if (!raw) return fallback;
 if (raw === 'manual') return 'manual_native';
 if (raw === 'app' || raw === 'native') return 'app_native';
 if (raw === 'app_native' || raw === 'manual_native') return raw;
 return fallback || raw;
 }

 function v17NormalizeProtectionState(value = '', fallback = 'missing') {
 const raw = String(value || '').trim().toLowerCase();
 if (!raw) return fallback;
 if (['armed', 'missing', 'manual_native', 'triggered', 'unprotected', 'closed'].includes(raw)) return raw;
 if (['armed_trailing'].includes(raw)) return 'armed';
 if (['stop_pending', 'stop_missing', 'pending'].includes(raw)) return 'missing';
 if (['stopped'].includes(raw)) return 'triggered';
 if (['protection_failed'].includes(raw)) return 'unprotected';
 if (['entry_expired', 'cancelled'].includes(raw)) return 'closed';
 return fallback || raw;
 }

 function v17IsManagedProtectionOrder(order = {}) {
 return String(order?.clientOrderId || order?.client_order_id || '').trim().toLowerCase().startsWith('ds_sl_');
 }

 function v17SelectLatestWorkingOrder(orders = []) {
 return (Array.isArray(orders) ? orders : [])
 .slice()
 .sort((a, b) => {
 const tsA = Number(a?.updatedAt || a?.createdAt || a?.ts || 0);
 const tsB = Number(b?.updatedAt || b?.createdAt || b?.ts || 0);
 return tsB - tsA;
 })[0] || null;
 }

 function v17BuildStraddleProtectionBlockReason(entry = {}) {
 const symbol = String(entry?.symbol || entry?.sourceSymbol || entry?.id || 'straddle').trim();
 return `${symbol}: protection unresolved; add a native stop on Delta or close the live position.`;
 }

 function v17EntryIsProtectionBlocked(entry = {}) {
 if (!['active', 'partial_stop'].includes(String(entry?.status || ''))) return false;
 if (v17NormalizeProtectionState(entry?.protectionState || '', '') === 'unprotected') return true;
 if (v17NormalizeProtectionState(entry?.straddleLeg?.protectionState || '', '') === 'unprotected') return true;
 if (v17NormalizeProtectionState(entry?.callLeg?.protectionState || '', '') === 'unprotected') return true;
 if (v17NormalizeProtectionState(entry?.putLeg?.protectionState || '', '') === 'unprotected') return true;
 return false;
 }

 function v17ResolveSyntheticProtectionState(entry = {}) {
 const states = [
 v17NormalizeProtectionState(entry?.callLeg?.protectionState || '', ''),
 v17NormalizeProtectionState(entry?.putLeg?.protectionState || '', ''),
 ].filter(Boolean);
 if (states.includes('unprotected')) return 'unprotected';
 if (states.includes('manual_native')) return 'manual_native';
 if (states.includes('triggered')) return 'triggered';
 if (states.includes('armed')) return 'armed';
 if (states.includes('closed') && states.every(state => state === 'closed')) return 'closed';
 return 'missing';
 }

 async function v17PersistStraddleAutomationState(cfg = {}, log = [], patch = {}) {
 const safeCfg = sanitizeOptionsAutoTradeSettings(cfg || {});
 const entries = Array.isArray(log) ? log : [];
 const todayTs = v17GetStartOfDayTs();
 const placedToday = entries.filter(item => Number(item?.ts || 0) >= todayTs);
 const activeEntries = entries.filter(item => ['active', 'partial_stop'].includes(String(item?.status || '')));
 const protectionBlockedEntry = entries.find(v17EntryIsProtectionBlocked) || null;
 const protectionBlockedReason = protectionBlockedEntry ? v17BuildStraddleProtectionBlockReason(protectionBlockedEntry) : '';
 const now = Date.now();
 const lastRunAt = Number(patch.lastRunAt || now);
 const state = {
 enabled: !!safeCfg.straddleEnabled,
 nativePreferred: safeCfg.nativeStraddlePreferred !== false,
 monitorIntervalMinutes: V17_STRADDLE_MONITOR_INTERVAL_MINUTES,
 lastRunAt,
 nextRunAt: Number(patch.nextRunAt || (safeCfg.straddleEnabled || activeEntries.length ? lastRunAt + V17_STRADDLE_MONITOR_INTERVAL_MINUTES * 60000 : 0)),
 blockedReason: String(protectionBlockedReason || patch.blockedReason || '').trim(),
 lastDecision: String(protectionBlockedReason ? 'protection_blocked' : (patch.lastDecision || '')).trim(),
 lastPlacedSymbol: String(patch.lastPlacedSymbol || '').trim(),
 lastPlacedUnderlying: String(patch.lastPlacedUnderlying || '').trim().toUpperCase(),
 lastCandidateSymbol: String(patch.lastCandidateSymbol || '').trim(),
 lastCandidateReason: String(patch.lastCandidateReason || '').trim(),
 lastCandidateScore: Number(patch.lastCandidateScore || 0),
 dailyUsed: placedToday.length,
 dailyLimit: Number(safeCfg.maxStrategiesPerDay || 0),
 concurrentUsed: activeEntries.length,
 concurrentLimit: Number(safeCfg.maxConcurrentStrategies || 0),
 cooldownRemainingMs: Number(patch.cooldownRemainingMs ?? v17ResolveStraddleCooldownRemainingMs(entries, safeCfg)),
 allowedUnderlyings: Array.isArray(safeCfg.underlyings) ? safeCfg.underlyings.slice() : [],
 activeUnderlyings: Array.from(new Set(activeEntries.map(item => String(item?.underlying || '').trim().toUpperCase()).filter(Boolean))),
 activeExpiryBuckets: Array.from(new Set(activeEntries.map(item => v17ResolveStraddleExpiryBucket(item)).filter(Boolean))),
 monitorEnabled: !!safeCfg.straddleEnabled || activeEntries.length > 0,
 updatedAt: now,
 };
 await storeLocalSet({ [V17_STRADDLE_AUTOMATION_STATE_KEY]: state });
 return state;
 }

 function v17ResolveStraddleLegQty(leg = {}) {
 return Math.max(1, Math.round(Number(leg.qty ?? leg.quantity ?? 1)));
 }

 function v17ResolveStraddleLegMultiplier(leg = {}) {
 return Math.max(0, Number(leg.contractMultiplier || leg.contractValue || 0));
 }

 async function v17EnsureStraddleLegMeta(leg = {}) {
 const next = { ...(leg || {}) };
 next.qty = v17ResolveStraddleLegQty(next);
 next.quantity = next.qty;
 let multiplier = v17ResolveStraddleLegMultiplier(next);
 let degradedMultiplier = !!next.degradedMultiplier;
 if (!(multiplier > 0)) {
 const symbol = String(next.symbol || '').trim().toUpperCase();
 const resolver = typeof v16ResolveProductBySymbol === 'function' ? v16ResolveProductBySymbol : null;
 const product = symbol && resolver ? await resolver(symbol).catch(() => null) : null;
 if (product) {
 next.productId = Number(next.productId || product.id || product.product_id || 0);
 multiplier = Math.max(0, Number(product.contractMultiplier || product.contract_value || product.contractValue || 0));
 }
 }
 if (!(multiplier > 0)) {
 multiplier = 1;
 degradedMultiplier = true;
 }
 next.contractMultiplier = multiplier;
 next.degradedMultiplier = degradedMultiplier;
 return next;
 }

 function v17ComputeStraddleLegUnrealizedUSD(leg = {}) {
 if (!['live', 'reentered'].includes(String(leg.status || ''))) return 0;
 const side = String(leg.side || 'sell').trim().toLowerCase() === 'buy' ? 'buy' : 'sell';
 const priceDiff = side === 'buy'
 ? Number(leg.currentPrice || 0) - Number(leg.entryPrice || 0)
 : Number(leg.entryPrice || 0) - Number(leg.currentPrice || 0);
 return priceDiff * v17ResolveStraddleLegQty(leg) * Math.max(0.000001, Number(leg.contractMultiplier || 1));
 }

 function v17SyncStraddleLegDerived(leg = {}, defaults = {}) {
 const next = { ...(leg || {}) };
 const qty = v17ResolveStraddleLegQty(next);
 const contractMultiplier = Math.max(0.000001, Number(next.contractMultiplier || 1));
 const realizedPnlUSD = Number(next.realizedPnlUSD ?? next.realizedPnl ?? 0);
 const unrealizedPnlUSD = v17ComputeStraddleLegUnrealizedUSD({ ...next, qty, contractMultiplier });
 const totalPnlUSD = realizedPnlUSD + unrealizedPnlUSD;
 next.qty = qty;
 next.quantity = qty;
 next.contractMultiplier = contractMultiplier;
 next.entryMode = String(next.entryMode || defaults.entryMode || 'limit').trim().toLowerCase() || 'limit';
 next.stopLossPct = Math.max(0, Number(next.stopLossPct ?? defaults.stopLossPct ?? 30));
 next.premiumPerContract = Number(next.entryPrice || 0) * contractMultiplier;
 next.premiumUSD = next.premiumPerContract * qty;
 next.realizedPnlUSD = realizedPnlUSD;
 next.unrealizedPnlUSD = unrealizedPnlUSD;
 next.totalPnlUSD = totalPnlUSD;
 next.realizedPnl = realizedPnlUSD;
 next.totalPnl = totalPnlUSD;
 next.entryOrderId = String(next.entryOrderId || next.orderId || '');
 next.entryOrderState = String(next.entryOrderState || '').trim().toLowerCase();
 next.entryOrderPlacedAt = Number(next.entryOrderPlacedAt || 0);
 next.entryFilledAt = Number(next.entryFilledAt || 0);
 next.stopOrderId = String(next.stopOrderId || '');
 next.stopOrderState = String(next.stopOrderState || '').trim().toLowerCase();
 next.protectionSource = v17NormalizeProtectionSource(next.protectionSource || '', '');
 next.stopOrderPlacedAt = Number(next.stopOrderPlacedAt || 0);
 next.stopOrderUpdatedAt = Number(next.stopOrderUpdatedAt || 0);
 next.lastStopActionAt = Number(next.lastStopActionAt || 0);
 next.protectionState = v17NormalizeProtectionState(next.protectionState || '', next.stopOrderId ? 'armed' : 'missing');
 next.premiumCapturePct = Math.max(0, Number(next.premiumCapturePct ?? defaults.premiumCapturePct ?? 0));
 return next;
 }

 function v17RealizeStraddleLeg(leg = {}, closePrice = null) {
 const next = v17SyncStraddleLegDerived({
 ...(leg || {}),
 currentPrice: closePrice == null ? Number(leg?.currentPrice || 0) : Number(closePrice || 0),
 });
 next.realizedPnlUSD = Number(next.realizedPnlUSD || 0) + Number(next.unrealizedPnlUSD || 0);
 next.unrealizedPnlUSD = 0;
 next.totalPnlUSD = next.realizedPnlUSD;
 next.realizedPnl = next.realizedPnlUSD;
 next.totalPnl = next.totalPnlUSD;
 return next;
 }

 async function v17NormalizeStraddleEntry(entry = {}, defaults = {}) {
 const next = { ...(entry || {}) };
 next.entryMode = String(next.entryMode || defaults.entryMode || 'limit').trim().toLowerCase() || 'limit';
 next.stopLossPct = Math.max(0, Number(next.stopLossPct ?? defaults.stopLossPct ?? 30));
 next.type = String(next.type || (next.straddleLeg ? 'native_straddle' : 'synthetic_straddle') || '');
 next.status = String(next.status || '').trim().toLowerCase();
 next.underlying = String(next.underlying || next.straddleLeg?.underlying || next.callLeg?.underlying || next.putLeg?.underlying || '').trim().toUpperCase();
 next.degradedMultiplier = false;
 const hasClosedAt = Number(next.closedAt || 0) > 0;

 if (next.type === 'native_straddle' && next.straddleLeg) {
 let leg = await v17EnsureStraddleLegMeta(next.straddleLeg);
 leg = v17SyncStraddleLegDerived(leg, defaults);
 leg.status = String(leg.status || '').trim().toLowerCase() || 'live';
 if (hasClosedAt || next.status === 'closed') {
 next.status = 'closed';
 if (['stopped', 'live', 'reentered', 'partial_stop', ''].includes(leg.status)) leg.status = 'closed';
 } else if (next.status === 'partial_stop' && leg.status !== 'stopped') {
 next.status = leg.status === 'closed' ? 'closed' : 'active';
 } else if (!next.status) {
 next.status = ['stopped'].includes(leg.status) ? 'partial_stop' : 'active';
 }
 next.straddleLeg = leg;
 next.symbol = String(next.symbol || leg.symbol || '');
 next.qty = leg.qty;
 next.contractMultiplier = leg.contractMultiplier;
 next.premiumPerContract = leg.premiumPerContract;
 next.premiumUSD = leg.premiumUSD;
 next.realizedPnlUSD = leg.realizedPnlUSD;
 next.unrealizedPnlUSD = leg.unrealizedPnlUSD;
 next.totalPnlUSD = leg.totalPnlUSD;
 next.totalPnl = leg.totalPnlUSD;
 next.stopPrice = Number(leg.stopPrice || 0);
 next.stopOrderId = String(leg.stopOrderId || '');
 next.stopOrderState = String(leg.stopOrderState || '');
 next.protectionState = v17NormalizeProtectionState(leg.protectionState || '', leg.stopOrderId ? 'armed' : 'missing');
 next.protectionSource = v17NormalizeProtectionSource(leg.protectionSource || '', '');
 next.lastStopActionAt = Number(leg.lastStopActionAt || 0);
 next.entryOrderState = String(leg.entryOrderState || '');
 next.reentryCount = Number(leg.reentryCount || 0);
 next.degradedMultiplier = !!leg.degradedMultiplier;
 } else {
 let callLeg = await v17EnsureStraddleLegMeta(next.callLeg || {});
 let putLeg = await v17EnsureStraddleLegMeta(next.putLeg || {});
 callLeg = v17SyncStraddleLegDerived(callLeg, defaults);
 putLeg = v17SyncStraddleLegDerived(putLeg, defaults);
 callLeg.status = String(callLeg.status || '').trim().toLowerCase() || 'live';
 putLeg.status = String(putLeg.status || '').trim().toLowerCase() || 'live';
 if (hasClosedAt || next.status === 'closed') {
 next.status = 'closed';
 if (['stopped', 'live', 'reentered', 'partial_stop', ''].includes(callLeg.status)) callLeg.status = 'closed';
 if (['stopped', 'live', 'reentered', 'partial_stop', ''].includes(putLeg.status)) putLeg.status = 'closed';
 } else if (next.status === 'partial_stop' && ![callLeg.status, putLeg.status].includes('stopped')) {
 next.status = [callLeg.status, putLeg.status].every(status => status === 'closed') ? 'closed' : 'active';
 } else if (!next.status) {
 next.status = [callLeg.status, putLeg.status].includes('stopped') ? 'partial_stop' : 'active';
 }
 next.callLeg = callLeg;
 next.putLeg = putLeg;
 next.symbol = String(next.symbol || `${callLeg.symbol || ''}${callLeg.symbol && putLeg.symbol ? ' / ' : ''}${putLeg.symbol || ''}`.trim());
 next.qty = Math.max(callLeg.qty || 0, putLeg.qty || 0, 1);
 next.contractMultiplier = Math.max(Number(callLeg.contractMultiplier || 0), Number(putLeg.contractMultiplier || 0), 1);
 next.premiumPerContract = Number(callLeg.premiumPerContract || 0) + Number(putLeg.premiumPerContract || 0);
 next.premiumUSD = Number(callLeg.premiumUSD || 0) + Number(putLeg.premiumUSD || 0);
 next.realizedPnlUSD = Number(callLeg.realizedPnlUSD || 0) + Number(putLeg.realizedPnlUSD || 0);
 next.unrealizedPnlUSD = Number(callLeg.unrealizedPnlUSD || 0) + Number(putLeg.unrealizedPnlUSD || 0);
 next.totalPnlUSD = next.realizedPnlUSD + next.unrealizedPnlUSD;
 next.totalPnl = next.totalPnlUSD;
 next.stopPrice = Math.max(Number(callLeg.stopPrice || 0), Number(putLeg.stopPrice || 0), 0);
 next.stopOrderId = String(callLeg.stopOrderId || putLeg.stopOrderId || '');
 next.protectionState = v17ResolveSyntheticProtectionState({ callLeg, putLeg });
 next.protectionSource = v17NormalizeProtectionSource(next.protectionSource || '', '');
 next.reentryCount = Number(callLeg.reentryCount || 0) + Number(putLeg.reentryCount || 0);
 next.degradedMultiplier = !!callLeg.degradedMultiplier || !!putLeg.degradedMultiplier;
 }

 next.realizedPnl = Number(next.realizedPnlUSD || 0);
 next.totalPnl = Number(next.totalPnlUSD || 0);
 next.timeToExpiryMs = Math.max(0, Number(next.expiryTs || 0) - Date.now());
 next.displayStatus = next.status === 'partial_stop' ? 'Partial Stop' : String(next.status || 'active').replace(/_/g, ' ');
 next.sourceSymbol = String(next.straddleLeg?.symbol || next.callLeg?.symbol || '');
 next.stopHealth = v17NormalizeProtectionState(next.protectionState || next.straddleLeg?.protectionState || '', 'missing');
 return next;
 }

 function v17BuildStraddleLegEntry(leg = {}, orderId = '') {
 const side = String(leg.side || 'sell').trim().toLowerCase() === 'buy' ? 'buy' : 'sell';
 const entryPrice = Number(leg.markPrice || leg.premium || 0);
 const stopLossPct = Math.max(0, Number(leg.stopLossPct || 30));
 return {
 symbol: String(leg.symbol || ''),
 productId: Number(leg.productId || 0),
 side,
 entryPrice,
 currentPrice: entryPrice,
 stopPrice: side === 'buy' ? entryPrice * Math.max(0, (100 - stopLossPct) / 100) : entryPrice * (1 + stopLossPct / 100),
 status: 'live',
 reentryCount: 0,
 reentries: [],
 orderId: String(orderId || ''),
 realizedPnl: 0,
 realizedPnlUSD: 0,
 entryOrderId: String(orderId || ''),
 entryOrderPlacedAt: Date.now(),
 entryOrderState: 'working',
 entryFilledAt: 0,
 entryMode: String(leg.entryMode || 'limit').trim().toLowerCase() || 'limit',
 stopLossPct,
 qty: v17ResolveStraddleLegQty(leg),
 quantity: v17ResolveStraddleLegQty(leg),
 contractMultiplier: Math.max(0.000001, Number(leg.contractMultiplier || leg.contractValue || 1)),
 premiumCapturePct: Math.max(0, Number(leg.premiumCapturePct || 0)),
 stopOrderId: '',
 stopOrderState: '',
 protectionSource: '',
 stopOrderPlacedAt: 0,
 stopOrderUpdatedAt: 0,
 lastStopActionAt: 0,
 protectionState: 'armed',
 };
 }

 async function v17BuildNativeStraddleEvaluation(contract = {}, mvChain = {}, cfg = {}, access = null) {
 const spotPrice = Number(mvChain?.underlyingPrice || contract?.underlyingPrice || 0);
 const marketContext = mvChain?.marketContext || await v17BuildUnderlyingStraddleMarketContext(contract?.underlying || mvChain?.underlying || 'BTC', spotPrice).catch(() => buildNativeStraddleMarketContext({ underlying: contract?.underlying || mvChain?.underlying || 'BTC', price: spotPrice }));
 const orderSide = marketContext.recommendedSide === 'buy' ? 'buy' : 'sell';
 const qty = (cfg.autoSizeEnabled && cfg.targetProfitUSD > 0 && Number(contract?.markPrice || 0) > 0)
 ? Math.max(1, Math.ceil(Number(cfg.targetProfitUSD || 0) / (Number(contract.markPrice || 0) * Math.max(0.000001, Number(contract.contractMultiplier || 1)))))
 : 1;
 let skewMetrics = {};
 try {
 const chain = await v17GetOptionsChain({
 underlying: String(contract?.underlying || mvChain?.underlying || '').trim().toUpperCase(),
 expiryKey: String(contract?.expiryKey || mvChain?.expiryKey || '').trim(),
 });
 if (chain?.ok) skewMetrics = computeVolatilitySkewMetrics(chain, {
 underlying: contract?.underlying || mvChain?.underlying,
 expiryKey: contract?.expiryKey || mvChain?.expiryKey,
 spotPrice: chain?.underlyingPrice || spotPrice,
 }) || {};
 } catch (_) {}
 const preview = buildNativeStraddleTicketPreview({
 ...contract,
 qty,
 spotPrice,
 entryMode: cfg.entryMode,
 stopLossPct: cfg.legStopLossPct,
 orderSide,
 }, cfg, {
 profileMaxOrderSizeUSD: Number(access?.profile?.maxOrderSizeUSD || 0),
 strategyBudgetUSD: Number(cfg.maxRiskUSD || 0),
 feePctPerSide: V17_NATIVE_STRADDLE_FEE_PCT_PER_SIDE,
 softGateThreshold: NATIVE_STRADDLE_SOFT_GATE_SCORE,
 riskReversal25d: Number(skewMetrics?.riskReversal25d || 0),
 butterfly25d: Number(skewMetrics?.butterfly25d || 0),
 marketContext,
 });
 return { qty, preview, skewMetrics };
 }

 async function runStraddleAutoTradeEntry() {
 const stored = await storeLocalGet(['optionsAutoTradeSettings', 'optionsStraddleLog']);
 const cfg = sanitizeOptionsAutoTradeSettings(stored?.optionsAutoTradeSettings || {});
 const log = Array.isArray(stored?.optionsStraddleLog) ? stored.optionsStraddleLog.slice() : [];
 const now = Date.now();
 if (!cfg.straddleEnabled) {
 await v17PersistStraddleAutomationState(cfg, log, {
 lastRunAt: now,
 nextRunAt: 0,
 blockedReason: 'Native straddle automation is disabled.',
 lastDecision: 'disabled',
 });
 return { ok: true, active: false, placed: 0 };
 }
 await v17AssertOptionsExecutionUnlocked();
 const todayTs = v17GetStartOfDayTs();
 const placedToday = log.filter(item => Number(item?.ts || 0) >= todayTs);
 if (placedToday.length >= cfg.maxStrategiesPerDay) {
 await v17PersistStraddleAutomationState(cfg, log, {
 lastRunAt: now,
 blockedReason: `Daily strategy cap reached (${placedToday.length}/${cfg.maxStrategiesPerDay}).`,
 lastDecision: 'daily_limit',
 });
 return { ok: true, active: true, placed: 0, skipped: 'daily_limit' };
 }
 const activeCount = log.filter(item => ['active', 'partial_stop'].includes(String(item?.status || ''))).length;
 if (activeCount >= cfg.maxConcurrentStrategies) {
 await v17PersistStraddleAutomationState(cfg, log, {
 lastRunAt: now,
 blockedReason: `Concurrent strategy cap reached (${activeCount}/${cfg.maxConcurrentStrategies}).`,
 lastDecision: 'concurrent_limit',
 });
 return { ok: true, active: true, placed: 0, skipped: 'concurrent_limit' };
 }
 const lastEntry = log.find(item => String(item?.underlying || '') && Number(item?.ts || 0) > 0);
 const cooldownRemainingMs = lastEntry ? Math.max(0, Number(cfg.cooldownMinutes || 0) * 60000 - (now - Number(lastEntry.ts || 0))) : 0;
 if (cooldownRemainingMs > 0) {
 await v17PersistStraddleAutomationState(cfg, log, {
 lastRunAt: now,
 cooldownRemainingMs,
 blockedReason: `Cooldown active for ${Math.ceil(cooldownRemainingMs / 60000)}m after the last straddle entry.`,
 lastDecision: 'cooldown',
 });
 return { ok: true, active: true, placed: 0, skipped: 'cooldown' };
 }

 let placed = 0;
 let blockedReason = '';
 let lastDecision = 'scan_complete';
 let lastCandidateSymbol = '';
 let lastCandidateReason = '';
 let lastCandidateScore = 0;
 let lastPlacedSymbol = '';
 let lastPlacedUnderlying = '';
 let access = null;
 for (const underlying of cfg.underlyings) {
 if ((placedToday.length + placed) >= cfg.maxStrategiesPerDay) break;
 if ((activeCount + placed) >= cfg.maxConcurrentStrategies) break;
 const existing = log.find(item => ['active', 'partial_stop'].includes(String(item?.status || '')) && item.underlying === underlying);
 if (existing) {
 blockedReason = `${underlying}: existing straddle lock is active (${existing.symbol || existing.id}).`;
 lastDecision = 'underlying_lock';
 continue;
 }

 if (!access) {
 try {
 access = await v16ResolveAuthorizedProfile({ profileId: cfg.profileId }, { tradeRequired: true });
 } catch (error) {
 blockedReason = error?.message || 'No authorized Delta options profile available.';
 lastDecision = 'profile_error';
 break;
 }
 }

 // --- Native MV- straddle path (single order, 50% lower fees) ---
 if (cfg.nativeStraddlePreferred) {
 const mvChain = await v17GetStraddleChain({ underlying }).catch(() => null);
 if (mvChain?.ok && mvChain.contracts?.length) {
 const evaluations = [];
 for (const contract of mvChain.contracts) {
 const evaluation = await v17BuildNativeStraddleEvaluation(contract, mvChain, cfg, access);
 evaluations.push({ contract, ...evaluation });
 }
 const eligible = evaluations
 .filter(item => item?.preview?.canPlace)
 .sort((a, b) => Number(b?.preview?.score || 0) - Number(a?.preview?.score || 0));
 const rejected = evaluations
 .filter(item => item?.preview?.canPlace === false)
 .sort((a, b) => Number(b?.preview?.score || 0) - Number(a?.preview?.score || 0));
 const best = eligible[0] || null;
 if (best?.contract) {
 const actionSide = best.preview?.recommendedSide === 'buy' ? 'buy' : 'sell';
 const stopMultiplier = actionSide === 'buy'
 ? Math.max(0, (100 - cfg.legStopLossPct) / 100)
 : 1 + cfg.legStopLossPct / 100;
 const cm = Math.max(0.000001, Number(best.contract.contractMultiplier || 1));
 const autoQty = Math.max(1, Math.round(Number(best.qty || 1)));
 const mvLeg = sanitizeOptionLeg({
 ...best.contract,
 side: actionSide,
 qty: autoQty,
 quantity: autoQty,
 premium: best.contract.markPrice,
 entryPrice: best.contract.markPrice,
 });
 const result = await v17PlaceDirectOptionOrder(mvLeg, access, { entryMode: cfg.entryMode }).catch(error => {
 blockedReason = error?.message || `Native straddle order failed for ${best.contract.symbol}.`;
 lastDecision = 'entry_order_failed';
 return null;
 });
 if (result) {
 const entryId = `mv_${actionSide}_straddle_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
 const entryTs = Date.now();
 const entry = {
 id: entryId,
 ts: entryTs,
 underlying,
 profileId: String(access?.profile?.id || cfg.profileId || ''),
 type: 'native_straddle',
 actionSide,
 entryMode: cfg.entryMode,
 stopLossPct: cfg.legStopLossPct,
 expiryTs: best.contract.expiryTs,
 expiryKey: best.contract.expiryKey,
 atmStrike: mvChain.atmStrike,
 spotAtEntry: Number(mvChain.underlyingPrice || 0),
 status: 'active',
 closedAt: null,
 closeReason: null,
 regimeKey: String(best.preview?.regime?.key || ''),
 regimeLabel: String(best.preview?.regime?.label || ''),
 riskReversal25d: Number(best.preview?.riskReversal25d || 0),
 butterfly25d: Number(best.preview?.butterfly25d || 0),
 hardChecks: Array.isArray(best.preview?.hardChecks) ? best.preview.hardChecks.slice() : [],
 contractThesis: Array.isArray(best.preview?.contractThesis) ? best.preview.contractThesis.slice() : [],
 straddleLeg: {
 symbol: best.contract.symbol,
 productId: best.contract.productId,
 side: actionSide,
 entryPrice: Number(best.contract.markPrice || 0),
 currentPrice: Number(best.contract.markPrice || 0),
 stopPrice: Number(best.contract.markPrice || 0) * stopMultiplier,
 status: 'live',
 reentryCount: 0,
 reentries: [],
 orderId: String(result?.result?.id || ''),
 entryOrderId: String(result?.result?.id || ''),
 entryOrderPlacedAt: entryTs,
 entryOrderState: cfg.entryMode === 'market' ? 'filled_assumed' : 'working',
 entryFilledAt: cfg.entryMode === 'market' ? entryTs : 0,
 realizedPnl: 0,
 realizedPnlUSD: 0,
 score: Number(best.preview?.score || best.contract.score || 0),
 qty: autoQty,
 contractMultiplier: cm,
 entryMode: cfg.entryMode,
 stopLossPct: cfg.legStopLossPct,
 premiumCapturePct: Number(cfg.premiumCapturePct || 0),
 protectionState: cfg.entryMode === 'market' ? 'missing' : 'missing',
 protectionSource: '',
 stopOrderState: '',
 stopOrderPlacedAt: 0,
 stopOrderUpdatedAt: 0,
 lastStopActionAt: 0,
 },
 callLeg: null,
 putLeg: null,
 totalPnl: 0,
 totalPnlUSD: 0,
 notifications: { entryAt: entryTs, stopAt: null, exitAt: null },
 };
 const normalizedEntry = await v17NormalizeStraddleEntry(entry, cfg);
 const slResult = await v17PlaceStraddleStopOrder(normalizedEntry.straddleLeg, normalizedEntry.straddleLeg.stopPrice, access, cfg).catch(() => null);
 const slOrderId = v17ResolveOrderId(slResult);
 if (slOrderId) {
 normalizedEntry.straddleLeg.stopOrderId = slOrderId;
 normalizedEntry.straddleLeg.stopOrderState = 'open';
 normalizedEntry.straddleLeg.protectionSource = 'app_native';
 normalizedEntry.straddleLeg.stopOrderPlacedAt = Date.now();
 normalizedEntry.straddleLeg.stopOrderUpdatedAt = normalizedEntry.straddleLeg.stopOrderPlacedAt;
 normalizedEntry.straddleLeg.lastStopActionAt = normalizedEntry.straddleLeg.stopOrderPlacedAt;
 normalizedEntry.straddleLeg.protectionState = 'armed';
 } else {
 const rollback = { cancelEntry: null, closeEntry: null };
 const entryOrderId = v17ResolveOrderId(result);
 normalizedEntry.status = 'protection_failed';
 normalizedEntry.closeReason = 'stop_protection_failed';
 normalizedEntry.closedAt = Date.now();
 normalizedEntry.straddleLeg.stopOrderState = 'failed';
 normalizedEntry.straddleLeg.protectionSource = '';
 normalizedEntry.straddleLeg.protectionState = 'unprotected';
 normalizedEntry.straddleLeg.protectionError = 'Stop-loss order was not accepted';
 if (entryOrderId) {
 rollback.cancelEntry = await v17CancelStraddleEntryOrder(entryOrderId, normalizedEntry.straddleLeg.productId, access)
 .then(cancelResult => ({ ok: !!cancelResult, result: cancelResult }))
 .catch(error => ({ ok: false, error: error?.message || 'Entry cancel failed' }));
 }
 if (cfg.entryMode === 'market' || Number(normalizedEntry.straddleLeg.entryFilledAt || 0) > 0) {
 const closeLeg = sanitizeOptionLeg({
 ...normalizedEntry.straddleLeg,
 side: actionSide === 'buy' ? 'sell' : 'buy',
 quantity: autoQty,
 qty: autoQty,
 markPrice: Number(best.contract.markPrice || 0),
 entryPrice: Number(best.contract.markPrice || 0),
 });
 rollback.closeEntry = await v17PlaceDirectOptionOrder(closeLeg, access, { entryMode: 'market', reduceOnly: true })
 .then(closeResult => ({ ok: true, result: closeResult }))
 .catch(error => ({ ok: false, error: error?.message || 'Emergency close failed' }));
 if (rollback.closeEntry?.ok) normalizedEntry.straddleLeg.status = 'closed';
 }
 normalizedEntry.straddleLeg.rollback = rollback;
 log.unshift(await v17NormalizeStraddleEntry(normalizedEntry, cfg));
 await storeLocalSet({ optionsStraddleLog: log.slice(0, V17_STRADDLE_LOG_LIMIT) });
 await v17PersistOptionsRepairState({
 source: 'auto_native_straddle',
 message: `Native straddle ${best.contract.symbol} entered without accepted stop protection. New options orders are locked until reviewed.`,
 symbols: [best.contract.symbol],
 details: { entryOrderId, rollback, underlying, expiryKey: best.contract.expiryKey },
 });
 placed = 0;
 lastDecision = 'native_protection_failed';
 blockedReason = normalizedEntry.straddleLeg.protectionError;
 syncOptionsStraddleMonitorAlarm(() => {});
 continue;
 }
 log.unshift(await v17NormalizeStraddleEntry(normalizedEntry, cfg));
 placed += 1;
 lastPlacedSymbol = best.contract.symbol;
 lastPlacedUnderlying = underlying;
 lastDecision = 'placed_native';
 await v17EmitOptionsAutoTradeNotice(cfg, {
 ts: entry.ts,
 underlying,
 templateId: 'auto_native_straddle',
 status: 'placed',
 netPremium: best.preview?.premiumUSD,
 score: best.preview?.score,
 symbols: [best.contract.symbol],
 }).catch(() => {});
 dlog(`Native ${actionSide} straddle placed: ${underlying} ${best.contract.symbol} mark=${best.contract.markPrice.toFixed(4)} score=${Number(best.preview?.score || 0)} slOrderId=${slOrderId || 'n/a'}`);
 continue;
 }
 } else if (rejected[0]?.preview) {
 blockedReason = `${underlying}: ${rejected[0].preview.reason || 'No native contract cleared the hard filters.'}`;
 lastCandidateSymbol = String(rejected[0].contract?.symbol || '');
 lastCandidateReason = String(rejected[0].preview?.reason || '');
 lastCandidateScore = Number(rejected[0].preview?.score || 0);
 lastDecision = 'hard_filter_block';
 continue;
 }
 } else {
 blockedReason = `${underlying}: no MV- native straddle contracts were available for the selected expiry.`;
 lastDecision = 'no_native_contracts';
 continue;
 }
 }
 // --- Fallback: synthetic straddle (two separate legs) ---
 const chain = await v17GetOptionsChain({ underlying }).catch(() => null);
 if (!chain?.rows?.length) {
 blockedReason = `${underlying}: no option chain data available for fallback synthetic straddle.`;
 lastDecision = 'no_fallback_chain';
 continue;
 }
 const straddle = buildShortStraddleForAutoTrade(chain, cfg);
 if (!straddle?.legs?.length) {
 blockedReason = `${underlying}: no synthetic straddle candidate passed the fallback rules.`;
 lastDecision = 'no_fallback_candidate';
 continue;
 }

 const callResult = await v17PlaceDirectOptionOrder(straddle.legs[0], access, { entryMode: cfg.entryMode }).catch(e => { dlog(`Straddle call order err: ${e?.message}`); return null; });
 const putResult = await v17PlaceDirectOptionOrder(straddle.legs[1], access, { entryMode: cfg.entryMode }).catch(e => { dlog(`Straddle put order err: ${e?.message}`); return null; });
 if (!callResult && !putResult) continue;
 if (!callResult || !putResult) {
 const liveLeg = callResult ? straddle.legs[0] : straddle.legs[1];
 const failedLeg = callResult ? straddle.legs[1] : straddle.legs[0];
 const closeLeg = v17BuildOppositeOptionLeg(liveLeg);
 const closeAttempt = await v17PlaceDirectOptionOrder(closeLeg, access, { entryMode: 'market', reduceOnly: true })
 .then(result => ({ ok: true, result }))
 .catch(error => ({ ok: false, error: error?.message || 'Emergency close failed' }));
 await v17PersistOptionsRepairState({
 source: 'synthetic_straddle_partial',
 message: `Synthetic straddle partially placed for ${underlying}. ${liveLeg.symbol} may need review because ${failedLeg.symbol} failed.`,
 symbols: [liveLeg.symbol, failedLeg.symbol],
 details: {
 liveLeg: liveLeg.symbol,
 failedLeg: failedLeg.symbol,
 closeAttempt,
 },
 });
 blockedReason = `${underlying}: synthetic straddle partial execution; emergency close ${closeAttempt.ok ? 'submitted' : 'failed'}.`;
 lastDecision = 'fallback_partial_repair_required';
 continue;
 }

 const entryId = `straddle_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
 const legStopMultiplier = 1 + cfg.legStopLossPct / 100;
 const entry = {
 id: entryId,
 ts: Date.now(),
 underlying,
 profileId: cfg.profileId || '',
 type: 'synthetic_straddle',
 entryMode: cfg.entryMode,
 stopLossPct: cfg.legStopLossPct,
 expiryTs: straddle.expiryTs,
 expiryKey: straddle.expiryKey,
 atmStrike: straddle.atmStrike,
 spotAtEntry: Number(chain.underlyingPrice || 0),
 status: 'active',
 closedAt: null,
 closeReason: null,
 callLeg: v17BuildStraddleLegEntry(straddle.legs[0], callResult?.result?.id || ''),
 putLeg: v17BuildStraddleLegEntry(straddle.legs[1], putResult?.result?.id || ''),
 totalPnl: 0,
 totalPnlUSD: 0,
 notifications: { entryAt: Date.now(), callStopAt: null, putStopAt: null, exitAt: null },
 };
 entry.callLeg.stopPrice = entry.callLeg.entryPrice * legStopMultiplier;
 entry.putLeg.stopPrice = entry.putLeg.entryPrice * legStopMultiplier;
 if (!callResult) { entry.callLeg.status = 'closed'; entry.status = 'partial_stop'; }
 if (!putResult) { entry.putLeg.status = 'closed'; entry.status = 'partial_stop'; }

 log.unshift(await v17NormalizeStraddleEntry(entry, cfg));
 placed += 1;
 lastPlacedSymbol = `${entry.callLeg.symbol} / ${entry.putLeg.symbol}`;
 lastPlacedUnderlying = underlying;
 lastDecision = 'placed_fallback';
 await v17EmitOptionsAutoTradeNotice(cfg, { ts: entry.ts, underlying, templateId: 'auto_short_straddle', status: 'placed', netPremium: straddle.netPremium }).catch(() => {});
 dlog(`Straddle placed: ${underlying} ATM ${straddle.atmStrike} premium=${straddle.netPremium.toFixed(4)}`);
 }
 if (placed > 0) {
 await storeLocalSet({ optionsStraddleLog: log.slice(0, V17_STRADDLE_LOG_LIMIT) });
 }
 await v17PersistStraddleAutomationState(cfg, log, {
 lastRunAt: now,
 blockedReason,
 lastDecision,
 lastPlacedSymbol,
 lastPlacedUnderlying,
 lastCandidateSymbol,
 lastCandidateReason,
 lastCandidateScore,
 });
 syncOptionsStraddleMonitorAlarm(() => {});
 return { ok: true, active: true, placed };
 }

 /* ===================================================================
 STRADDLE AUTO-TRADE: Lifecycle Monitor (runs every 1 min)
 =================================================================== */
 async function v17PlaceStraddleStopOrder(leg, stopPrice, access, cfg) {
 if (!leg?.symbol || !(stopPrice > 0)) return null;
 const product = await v16ResolveProductBySymbol(leg.symbol).catch(() => null);
 if (!product?.id) return null;
 const qty = Math.max(1, Math.round(Number(leg.qty || 1)));
 const entrySide = String(leg.side || 'sell').trim().toLowerCase() === 'buy' ? 'buy' : 'sell';
 const exitSide = entrySide === 'buy' ? 'sell' : 'buy';
 const requestBody = {
 product_id: Number(product.id || product.product_id || 0),
 size: qty,
 side: exitSide,
 order_type: 'market_order',
 stop_order_type: 'stop_loss_order',
 stop_price: Number(stopPrice.toFixed(4)),
 reduce_only: true,
 time_in_force: 'gtc',
 client_order_id: `ds_sl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 32),
 };
 const result = await v16SignedFetch({
 ...v16BuildPrivateAccessArgs(access),
 method: 'POST',
 path: '/orders',
 body: requestBody,
 baseUrl: access.baseUrl,
 }).catch(e => { dlog(`Straddle SL order err: ${e?.message}`); return null; });
 dlog(`SL order placed: ${leg.symbol} stop=${stopPrice.toFixed(4)} qty=${qty} orderId=${result?.id || 'n/a'}`);
 return result;
 }

 function v17ResolveOrderId(result) {
 const direct = result?.id ?? result?.order_id ?? result?.orderId;
 if (direct != null && `${direct}`.trim()) return String(direct);
 const nested = result?.result?.id ?? result?.result?.order_id ?? result?.result?.orderId;
 if (nested != null && `${nested}`.trim()) return String(nested);
 return '';
 }

 async function v17UpdateStraddleStopOrder(orderId, newStopPrice, access) {
 if (!orderId || !(newStopPrice > 0)) return null;
 const requestBody = { id: Number(orderId), stop_price: Number(newStopPrice.toFixed(4)) };
 return v16SignedFetch({
 ...v16BuildPrivateAccessArgs(access),
 method: 'PUT',
 path: '/orders',
 body: requestBody,
 baseUrl: access.baseUrl,
 }).catch(e => { dlog(`Straddle SL update err: ${e?.message}`); return null; });
 }

 async function v17CancelStraddleStopOrder(orderId, productId, access) {
 if (!orderId) return null;
 return v16SignedFetch({
 ...v16BuildPrivateAccessArgs(access),
 method: 'DELETE',
 path: '/orders/' + orderId,
 body: { id: Number(orderId), product_id: Number(productId || 0) },
 baseUrl: access.baseUrl,
 }).catch(e => { dlog(`Straddle SL cancel err: ${e?.message}`); return null; });
 }

 async function v17CancelStraddleEntryOrder(orderId, productId, access) {
 if (!orderId) return null;
 return v16SignedFetch({
 ...v16BuildPrivateAccessArgs(access),
 method: 'DELETE',
 path: `/orders/${orderId}`,
 body: { id: Number(orderId), product_id: Number(productId || 0) },
 baseUrl: access.baseUrl,
 }).catch(e => { dlog(`Straddle entry cancel err: ${e?.message}`); return null; });
 }

 async function v17StraddleCloseLeg(leg, access, cfg) {
 if (!leg?.symbol || leg.status === 'closed') return null;
 // Cancel any existing SL order on the exchange first
 if (leg.stopOrderId) {
 await v17CancelStraddleStopOrder(leg.stopOrderId, leg.productId, access).catch(() => null);
 leg.stopOrderId = '';
 }
 const entrySide = String(leg.side || 'sell').trim().toLowerCase() === 'buy' ? 'buy' : 'sell';
 const closeLeg = sanitizeOptionLeg({ ...leg, side: entrySide === 'buy' ? 'sell' : 'buy', quantity: leg.qty || 1 });
 return v17PlaceDirectOptionOrder(closeLeg, access, { entryMode: cfg?.entryMode || 'market' }).catch(e => {
 dlog(`Straddle close leg err (${leg.symbol}): ${e?.message}`);
 return null;
 });
 }

 async function v17StraddleReenterLeg(leg, access, cfg) {
 if (!leg?.symbol) return null;
 const entrySide = String(leg.side || 'sell').trim().toLowerCase() === 'buy' ? 'buy' : 'sell';
 const sellLeg = sanitizeOptionLeg({ ...leg, side: entrySide, quantity: 1 });
 return v17PlaceDirectOptionOrder(sellLeg, access, { entryMode: cfg?.entryMode || 'limit' }).catch(e => {
 dlog(`Straddle re-entry err (${leg.symbol}): ${e?.message}`);
 return null;
 });
 }

 function v17ResolveNativeStopProtectionOrder(workingOrders = [], leg = {}) {
 const exitSide = String(leg?.side || 'sell').toLowerCase() === 'sell' ? 'buy' : 'sell';
 const stopCandidates = (Array.isArray(workingOrders) ? workingOrders : [])
 .filter(order => String(order?.productSymbol || '').trim().toUpperCase() === String(leg?.symbol || '').trim().toUpperCase())
 .filter(order => !!order?.reduceOnly)
 .filter(order => String(order?.side || '').toLowerCase() === exitSide)
 .filter(order => Number(order?.stopPrice || 0) > 0);
 const tracked = stopCandidates.find(order => String(order?.orderId || order?.id || '') === String(leg?.stopOrderId || ''));
 if (tracked) return { stopOrder: tracked, source: 'app_native' };
 const latest = v17SelectLatestWorkingOrder(stopCandidates);
 if (!latest) return { stopOrder: null, source: '' };
 return { stopOrder: latest, source: v17IsManagedProtectionOrder(latest) ? 'app_native' : 'manual_native' };
 }

 async function runOptionsStraddleMonitor() {
 // Auto-entry: attempt to place new straddle if enabled and limits allow
 if (typeof runStraddleAutoTradeEntry === 'function') {
 try {
 const entryResult = await runStraddleAutoTradeEntry();
 if (entryResult?.placed > 0) {
 dlog('[STRADDLE] Auto-entry placed ' + entryResult.placed + ' new straddle(s)');
 }
 } catch (err) {
 dlog('[STRADDLE] Auto-entry error: ' + String(err?.message || err));
 }
 }

 const stored = await storeLocalGet(['optionsAutoTradeSettings', 'optionsStraddleLog']);
 const cfg = sanitizeOptionsAutoTradeSettings(stored?.optionsAutoTradeSettings || {});
 const log = Array.isArray(stored?.optionsStraddleLog) ? stored.optionsStraddleLog.slice() : [];
 const activeEntries = log.filter(e => ['active', 'partial_stop'].includes(String(e?.status || '')));
 const fetchNativeTickers = typeof globalThis.v17FetchStraddleTickers === 'function' ? globalThis.v17FetchStraddleTickers : v17FetchStraddleTickers;
 const fetchOptionTickers = typeof globalThis.v17FetchOptionTickers === 'function' ? globalThis.v17FetchOptionTickers : v17FetchOptionTickers;
 if (!activeEntries.length && !cfg.straddleEnabled) {
 syncOptionsStraddleMonitorAlarm(() => {});
 return { ok: true, active: 0 };
 }

 let updated = 0;
 const now = Date.now();
 const openOrderSnapshots = new Map();
 const loadWorkingOrders = async (profileId = '') => {
 const key = String(profileId || '').trim();
 if (!key) return [];
 if (!openOrderSnapshots.has(key)) {
 openOrderSnapshots.set(key, v16FetchOpenOrdersForPayload({ profileId: key }, { tradeRequired: true })
 .then(snapshot => (Array.isArray(snapshot?.openOrders) ? snapshot.openOrders : []).map(order => v16NormalizeWorkingOrder(order)))
 .catch(() => []));
 }
 return openOrderSnapshots.get(key);
 };

 for (let i = 0; i < log.length; i++) {
 let entry = await v17NormalizeStraddleEntry(log[i], cfg);
 if (!['active', 'partial_stop'].includes(String(entry?.status || ''))) continue;

 const isNative = entry.type === 'native_straddle' && entry.straddleLeg;

 // --- NATIVE STRADDLE MONITOR ---
 if (isNative) {
 const leg = entry.straddleLeg;
 if (leg.status === 'closed') continue;
 const mvTickers = await fetchNativeTickers(entry.underlying).catch(() => new Map());
 const mvTicker = mvTickers.get(leg.symbol);
 if (mvTicker) leg.currentPrice = Number(mvTicker.markPrice || mvTicker.lastPrice || leg.currentPrice);

 let access;
 try { access = await v16ResolveAuthorizedProfile({ profileId: entry.profileId || cfg.profileId }, { tradeRequired: true }); } catch { continue; }
 const workingOrders = await loadWorkingOrders(entry.profileId || cfg.profileId);
 const entryWorkingOrder = workingOrders.find(order => String(order?.orderId || order?.id || '') === String(leg.entryOrderId || leg.orderId || '') && !order?.reduceOnly);
 const protectionOrder = v17ResolveNativeStopProtectionOrder(workingOrders, leg);
 const stopWorkingOrder = protectionOrder.stopOrder;

 let entryChanged = false;
 const now2 = Date.now();

 if (String(leg.entryMode || cfg.entryMode || 'limit') !== 'market' && !Number(leg.entryFilledAt || 0)) {
 if (entryWorkingOrder) {
 leg.entryOrderState = String(entryWorkingOrder.state || 'open');
 entryChanged = true;
 const entryAgeMs = Math.max(0, now2 - Number(leg.entryOrderPlacedAt || entry.ts || now2));
 if (entryAgeMs >= Number(cfg.entryOrderMaxAgeMinutes || 0) * 60000) {
 await v17CancelStraddleEntryOrder(leg.entryOrderId || leg.orderId, leg.productId, access).catch(() => null);
 if (leg.stopOrderId) await v17CancelStraddleStopOrder(leg.stopOrderId, leg.productId, access).catch(() => null);
 leg.stopOrderId = '';
 leg.stopOrderState = 'cancelled';
 leg.protectionSource = '';
 leg.protectionState = 'closed';
 leg.lastStopActionAt = now2;
 leg.status = 'closed';
 entry.status = 'closed';
 entry.closedAt = now2;
 entry.closeReason = 'entry_order_expired';
 entry.notifications.exitAt = now2;
 entryChanged = true;
 dlog(`Native straddle entry order expired: ${leg.symbol} age=${Math.round(entryAgeMs / 60000)}m`);
 }
 } else {
 leg.entryOrderState = 'filled';
 leg.entryFilledAt = now2;
 entryChanged = true;
 }
 }

 if (stopWorkingOrder) {
 leg.stopOrderState = String(stopWorkingOrder.state || 'open');
 leg.stopOrderUpdatedAt = now2;
 leg.protectionSource = protectionOrder.source || '';
 if (protectionOrder.source === 'app_native') {
 leg.stopOrderId = String(stopWorkingOrder.orderId || stopWorkingOrder.id || '');
 leg.protectionState = 'armed';
 } else {
 leg.stopOrderId = '';
 leg.protectionState = 'manual_native';
 }
 entryChanged = true;
 } else if (entry.status !== 'closed') {
 leg.stopOrderState = Number(leg.entryFilledAt || 0) > 0 || String(leg.entryOrderState || '') === 'filled_assumed' ? 'missing' : 'pending';
 leg.protectionSource = '';
 leg.protectionState = 'missing';
 entryChanged = true;
 }

 const stopCooldownElapsed = (now2 - Number(leg.lastStopActionAt || 0) >= 45000);
 const requiresImmediateProtection = Number(leg.entryFilledAt || 0) > 0 || String(leg.entryOrderState || '') === 'filled_assumed';
 if (
 entry.status !== 'closed'
 && ['live', 'reentered'].includes(leg.status)
 && String(leg.entryOrderState || '') !== 'open'
 && protectionOrder.source !== 'manual_native'
 && ['pending', 'missing', 'cancelled', ''].includes(String(leg.stopOrderState || ''))
 && (requiresImmediateProtection || stopCooldownElapsed)
 ) {
 leg.lastStopActionAt = now2;
 const rearmResult = await v17PlaceStraddleStopOrder(leg, Number(leg.stopPrice || 0), access, cfg).catch(() => null);
 const rearmOrderId = v17ResolveOrderId(rearmResult);
 if (rearmOrderId) {
 leg.stopOrderId = rearmOrderId;
 leg.stopOrderState = 'open';
 leg.protectionSource = 'app_native';
 leg.stopOrderPlacedAt = leg.stopOrderPlacedAt || now2;
 leg.stopOrderUpdatedAt = now2;
 leg.protectionState = 'armed';
 dlog(`Native straddle stop re-armed: ${leg.symbol} stop=${Number(leg.stopPrice || 0).toFixed(4)} orderId=${rearmOrderId}`);
 } else {
 leg.stopOrderState = 'missing';
 leg.protectionSource = '';
 leg.protectionState = requiresImmediateProtection ? 'unprotected' : 'missing';
 dlog(`Native straddle stop re-arm failed: ${leg.symbol} stop=${Number(leg.stopPrice || 0).toFixed(4)} state=${leg.protectionState}`);
 }
 entryChanged = true;
 }

 // Universal time exit
 const minutesLeft = (Number(entry.expiryTs || 0) - now2) / 60000;
 if (minutesLeft <= cfg.closeMinutesBeforeExpiry && minutesLeft > -60 && ['live', 'reentered'].includes(leg.status)) {
 await v17StraddleCloseLeg(leg, access, cfg);
 entry.straddleLeg = v17RealizeStraddleLeg({ ...leg, status: 'closed' });
 entry.straddleLeg.status = 'closed';
 entry.status = 'closed'; entry.closedAt = now2; entry.closeReason = 'time_exit';
 entry.notifications.exitAt = now2; entryChanged = true;
 dlog(`Native straddle time exit: ${entry.underlying} ${entry.id}`);
 }

 // Universal P&L exit
 if (entry.status !== 'closed') {
 const totalPnl = Number(v17SyncStraddleLegDerived(leg, cfg).totalPnlUSD || 0);
 entry.totalPnl = totalPnl;
 entry.totalPnlUSD = totalPnl;
 if (cfg.universalProfitTarget > 0 && totalPnl >= cfg.universalProfitTarget) {
 await v17StraddleCloseLeg(leg, access, cfg);
 entry.straddleLeg = v17RealizeStraddleLeg({ ...leg, status: 'closed' });
 entry.straddleLeg.status = 'closed';
 entry.status = 'closed'; entry.closedAt = now2; entry.closeReason = 'pnl_profit';
 entry.notifications.exitAt = now2; entryChanged = true;
 } else if (cfg.universalLossLimit > 0 && totalPnl <= -cfg.universalLossLimit) {
 await v17StraddleCloseLeg(leg, access, cfg);
 entry.straddleLeg = v17RealizeStraddleLeg({ ...leg, status: 'closed' });
 entry.straddleLeg.status = 'closed';
 entry.status = 'closed'; entry.closedAt = now2; entry.closeReason = 'pnl_loss';
 entry.notifications.exitAt = now2; entryChanged = true;
 }
 }

 if (entry.status !== 'closed' && ['live', 'reentered'].includes(leg.status) && Number(cfg.premiumCapturePct || 0) > 0) {
 const isLongNative = String(leg.side || 'sell').toLowerCase() === 'buy';
 const captureTargetPrice = isLongNative
 ? Number(leg.entryPrice || 0) * (1 + Number(cfg.premiumCapturePct || 0) / 100)
 : Number(leg.entryPrice || 0) * Math.max(0, (100 - Number(cfg.premiumCapturePct || 0)) / 100);
 const captureHit = isLongNative
 ? Number(leg.currentPrice || 0) >= captureTargetPrice
 : Number(leg.currentPrice || 0) <= captureTargetPrice;
 if (captureHit) {
 await v17StraddleCloseLeg(leg, access, cfg);
 entry.straddleLeg = v17RealizeStraddleLeg({ ...leg, status: 'closed' });
 entry.straddleLeg.status = 'closed';
 entry.status = 'closed';
 entry.closedAt = now2;
 entry.closeReason = isLongNative ? 'long_vol_capture' : 'premium_capture';
 entry.notifications.exitAt = now2;
 entryChanged = true;
 dlog(`Native straddle premium capture exit: ${leg.symbol} current=${leg.currentPrice.toFixed(4)} target=${captureTargetPrice.toFixed(4)}`);
 }
 }

 // Per-leg stop-loss
 if (entry.status !== 'closed' && ['live', 'reentered'].includes(leg.status)) {
 const isLongNative = String(leg.side || 'sell').toLowerCase() === 'buy';
 const stopHit = isLongNative
 ? Number(leg.currentPrice || 0) <= Number(leg.stopPrice || 0)
 : Number(leg.currentPrice || 0) >= Number(leg.stopPrice || 0);
 if (stopHit) {
 await v17StraddleCloseLeg(leg, access, cfg);
 entry.straddleLeg = v17RealizeStraddleLeg({ ...leg, status: 'stopped' });
 entry.straddleLeg.status = 'stopped';
 entry.straddleLeg.stopOrderState = 'triggered';
 entry.straddleLeg.protectionSource = leg.protectionSource || '';
 entry.straddleLeg.protectionState = 'triggered';
 entry.notifications.stopAt = now2; entryChanged = true;
 dlog(`Native straddle stopped: ${leg.symbol} entry=${leg.entryPrice.toFixed(4)} current=${leg.currentPrice.toFixed(4)}`);
 if (isLongNative || !cfg.reentryEnabled || entry.straddleLeg.reentryCount >= cfg.maxReentries) {
 entry.status = 'closed'; entry.closedAt = now2; entry.closeReason = 'all_stopped';
 entry.notifications.exitAt = now2;
 } else {
 entry.status = 'partial_stop';
 }
 }
 }

 // Re-entry
 if (entry.status !== 'closed' && String(leg.side || 'sell').toLowerCase() !== 'buy' && cfg.reentryEnabled && leg.status === 'stopped' && leg.reentryCount < cfg.maxReentries) {
 const originalEntry = leg.reentries.length ? leg.reentries[0].entryPrice || leg.entryPrice : leg.entryPrice;
 const reentryThreshold = originalEntry * (1 + cfg.reentryThresholdPct / 100);
 if (leg.currentPrice <= reentryThreshold) {
 const result = await v17StraddleReenterLeg(leg, access, cfg);
 if (result) {
 leg.reentries.push({ ts: now2, entryPrice: leg.currentPrice, exitTs: null, exitPrice: null, exitReason: null });
 leg.entryPrice = leg.currentPrice;
 leg.stopPrice = leg.currentPrice * (1 + cfg.legStopLossPct / 100);
 leg.status = 'reentered'; leg.reentryCount += 1;
 leg.orderId = String(result?.result?.id || leg.orderId);
 leg.entryOrderId = String(result?.result?.id || leg.entryOrderId || '');
 leg.entryOrderPlacedAt = now2;
 leg.entryOrderState = cfg.entryMode === 'market' ? 'filled_assumed' : 'working';
 leg.entryFilledAt = cfg.entryMode === 'market' ? now2 : 0;
 leg.stopOrderId = '';
 leg.stopOrderState = '';
 leg.protectionSource = '';
 leg.protectionState = 'missing';
 entry.status = 'active'; entryChanged = true;
 dlog(`Native straddle re-entered: ${leg.symbol} at ${leg.currentPrice.toFixed(4)} (attempt ${leg.reentryCount})`);
 }
 }
 }

 // Update total P&L
 if (entry.status !== 'closed') {
 entry.straddleLeg = v17SyncStraddleLegDerived(entry.straddleLeg, cfg);
 entry.totalPnl = Number(entry.straddleLeg.totalPnlUSD || 0);
 entry.totalPnlUSD = entry.totalPnl;
 entryChanged = true;
 }

 if (entryChanged) { log[i] = await v17NormalizeStraddleEntry(entry, cfg); updated += 1; }
 continue;
 }

 // --- SYNTHETIC STRADDLE MONITOR (existing dual-leg logic) ---
 // Fetch current prices
 const tickers = await fetchOptionTickers(entry.underlying).catch(() => new Map());
 const callTicker = tickers.get(entry.callLeg?.symbol);
 const putTicker = tickers.get(entry.putLeg?.symbol);
 if (callTicker && entry.callLeg.status !== 'closed') entry.callLeg.currentPrice = Number(callTicker.markPrice || callTicker.lastPrice || entry.callLeg.currentPrice);
 if (putTicker && entry.putLeg.status !== 'closed') entry.putLeg.currentPrice = Number(putTicker.markPrice || putTicker.lastPrice || entry.putLeg.currentPrice);

 let access;
 try { access = await v16ResolveAuthorizedProfile({ profileId: entry.profileId || cfg.profileId }, { tradeRequired: true }); } catch { continue; }

 let entryChanged = false;
 const liveLegKeys = ['callLeg', 'putLeg'].filter(k => ['live', 'reentered'].includes(entry[k]?.status));
 const stoppedLegKeys = ['callLeg', 'putLeg'].filter(k => entry[k]?.status === 'stopped');

 // --- Universal time exit ---
 const minutesLeft = (Number(entry.expiryTs || 0) - now) / 60000;
 if (minutesLeft <= cfg.closeMinutesBeforeExpiry && minutesLeft > -60) {
 for (const k of liveLegKeys) {
 await v17StraddleCloseLeg(entry[k], access, cfg);
 entry[k] = v17RealizeStraddleLeg({ ...entry[k], status: 'closed' });
 entry[k].status = 'closed';
 }
 for (const k of stoppedLegKeys) entry[k].status = 'closed';
 entry.status = 'closed';
 entry.closedAt = now;
 entry.closeReason = 'time_exit';
 entry.notifications.exitAt = now;
 entryChanged = true;
 dlog(`Straddle time exit: ${entry.underlying} ${entry.id}`);
 }

 // --- Universal P&L exit ---
 if (entry.status !== 'closed') {
 const callPnl = Number(v17SyncStraddleLegDerived(entry.callLeg, cfg).totalPnlUSD || 0);
 const putPnl = Number(v17SyncStraddleLegDerived(entry.putLeg, cfg).totalPnlUSD || 0);
 const totalPnl = callPnl + putPnl;
 entry.totalPnl = totalPnl;
 entry.totalPnlUSD = totalPnl;

 if (cfg.universalProfitTarget > 0 && totalPnl >= cfg.universalProfitTarget) {
 for (const k of liveLegKeys) {
 await v17StraddleCloseLeg(entry[k], access, cfg);
 entry[k] = v17RealizeStraddleLeg({ ...entry[k], status: 'closed' });
 entry[k].status = 'closed';
 }
 entry.status = 'closed'; entry.closedAt = now; entry.closeReason = 'pnl_profit';
 entry.notifications.exitAt = now; entryChanged = true;
 dlog(`Straddle profit exit: ${entry.underlying} PnL=${totalPnl.toFixed(4)}`);
 } else if (cfg.universalLossLimit > 0 && totalPnl <= -cfg.universalLossLimit) {
 for (const k of liveLegKeys) {
 await v17StraddleCloseLeg(entry[k], access, cfg);
 entry[k] = v17RealizeStraddleLeg({ ...entry[k], status: 'closed' });
 entry[k].status = 'closed';
 }
 entry.status = 'closed'; entry.closedAt = now; entry.closeReason = 'pnl_loss';
 entry.notifications.exitAt = now; entryChanged = true;
 dlog(`Straddle loss exit: ${entry.underlying} PnL=${totalPnl.toFixed(4)}`);
 }
 }

 // --- Per-leg stop-loss ---
 if (entry.status !== 'closed') {
 for (const k of ['callLeg', 'putLeg']) {
 const leg = entry[k];
 if (!['live', 'reentered'].includes(leg.status)) continue;
 leg.protectionState = 'armed';
 leg.protectionSource = '';
 if (leg.currentPrice >= leg.stopPrice) {
 await v17StraddleCloseLeg(leg, access, cfg);
 entry[k] = v17RealizeStraddleLeg({ ...leg, status: 'stopped' });
 entry[k].status = 'stopped';
 entry[k].protectionState = 'triggered';
 entry.notifications[k === 'callLeg' ? 'callStopAt' : 'putStopAt'] = now;
 entryChanged = true;
 dlog(`Straddle ${k} stopped: ${leg.symbol} entry=${leg.entryPrice.toFixed(4)} current=${leg.currentPrice.toFixed(4)}`);
 }
 }
 const allStopped = ['callLeg', 'putLeg'].every(k => ['stopped', 'closed'].includes(entry[k].status));
 const canReenter = cfg.reentryEnabled && ['callLeg', 'putLeg'].some(k => entry[k].status === 'stopped' && entry[k].reentryCount < cfg.maxReentries);
 if (allStopped && !canReenter) {
 entry.status = 'closed'; entry.closedAt = now; entry.closeReason = 'all_stopped';
 entry.notifications.exitAt = now; entryChanged = true;
 } else if (['callLeg', 'putLeg'].some(k => entry[k].status === 'stopped')) {
 if (entry.status !== 'partial_stop') { entry.status = 'partial_stop'; entryChanged = true; }
 }
 }

 // --- Re-entry logic ---
 if (entry.status !== 'closed' && cfg.reentryEnabled) {
 for (const k of ['callLeg', 'putLeg']) {
 const leg = entry[k];
 if (leg.status !== 'stopped') continue;
 if (leg.reentryCount >= cfg.maxReentries) continue;
 const originalEntry = leg.reentries.length ? leg.reentries[0].entryPrice || leg.entryPrice : leg.entryPrice;
 const reentryThreshold = originalEntry * (1 + cfg.reentryThresholdPct / 100);
 if (leg.currentPrice <= reentryThreshold) {
 const result = await v17StraddleReenterLeg(leg, access, cfg);
 if (result) {
 leg.reentries.push({ ts: now, entryPrice: leg.currentPrice, exitTs: null, exitPrice: null, exitReason: null });
 leg.entryPrice = leg.currentPrice;
 leg.stopPrice = leg.currentPrice * (1 + cfg.legStopLossPct / 100);
 leg.status = 'reentered';
 leg.reentryCount += 1;
 leg.orderId = String(result?.result?.id || leg.orderId);
 leg.protectionState = 'armed';
 leg.protectionSource = '';
 if (entry.status === 'partial_stop') entry.status = 'active';
 entryChanged = true;
 dlog(`Straddle ${k} re-entered: ${leg.symbol} at ${leg.currentPrice.toFixed(4)} (attempt ${leg.reentryCount})`);
 }
 }
 }
 }

 // Update total P&L
 if (entry.status !== 'closed') {
 entry.callLeg = v17SyncStraddleLegDerived(entry.callLeg, cfg);
 entry.putLeg = v17SyncStraddleLegDerived(entry.putLeg, cfg);
 const callPnl = Number(entry.callLeg.totalPnlUSD || 0);
 const putPnl = Number(entry.putLeg.totalPnlUSD || 0);
 entry.totalPnl = callPnl + putPnl;
 entry.totalPnlUSD = entry.totalPnl;
 entryChanged = true;
 }

 if (entryChanged) { log[i] = await v17NormalizeStraddleEntry(entry, cfg); updated += 1; }
 }

 if (updated > 0) {
 await storeLocalSet({ optionsStraddleLog: log.slice(0, V17_STRADDLE_LOG_LIMIT) });
 }
 await v17PersistStraddleAutomationState(cfg, log, {
 lastRunAt: now,
 lastDecision: updated > 0 ? 'monitor_updated' : 'monitor_idle',
 });
 syncOptionsStraddleMonitorAlarm(() => {});
 return { ok: true, active: activeEntries.length, updated };
 }

 /* ===================================================================
 STRADDLE: Manual close by entry ID
 =================================================================== */
 async function v17GetStraddleTicketPreviewEnvelope(msg = {}) {
 const stored = await storeLocalGet(['optionsAutoTradeSettings']);
 const cfg = sanitizeOptionsAutoTradeSettings(stored?.optionsAutoTradeSettings || {});
 const symbol = String(msg?.symbol || '').trim().toUpperCase();
 let contractMultiplier = Math.max(0, Number(msg?.contractMultiplier || 0));
 let productId = Number(msg?.productId || 0);
 if ((!(contractMultiplier > 0) || !(productId > 0)) && symbol && typeof v16ResolveProductBySymbol === 'function') {
 const product = await v16ResolveProductBySymbol(symbol).catch(() => null);
 if (product) {
 contractMultiplier = Math.max(contractMultiplier, Number(product.contractMultiplier || product.contract_value || product.contractValue || 0));
 productId = Math.max(productId, Number(product.id || product.product_id || 0));
 }
 }
 let profileMaxOrderSizeUSD = 0;
 let resolvedProfileId = String(cfg.profileId || msg?.profileId || '').trim();
 if (typeof v16ResolveAuthorizedProfile === 'function') {
 const access = await v16ResolveAuthorizedProfile({ profileId: resolvedProfileId }, { tradeRequired: false }).catch(() => null);
 profileMaxOrderSizeUSD = Number(access?.profile?.maxOrderSizeUSD || 0);
 resolvedProfileId = String(access?.profile?.id || resolvedProfileId || '').trim();
 }
 let skewMetrics = {};
 try {
 const chain = await v17GetOptionsChain({
 underlying: String(msg?.underlying || '').trim().toUpperCase(),
 expiryKey: String(msg?.expiryKey || '').trim(),
 });
 if (chain?.ok) skewMetrics = computeVolatilitySkewMetrics(chain, {
 underlying: msg?.underlying,
 expiryKey: msg?.expiryKey,
 spotPrice: Number(msg?.spotPrice || chain?.underlyingPrice || 0),
 }) || {};
 } catch (_) {}
 const marketContext = await v17BuildUnderlyingStraddleMarketContext(
 String(msg?.underlying || '').trim().toUpperCase() || 'BTC',
 Number(msg?.spotPrice || 0)
 ).catch(() => buildNativeStraddleMarketContext({
 underlying: String(msg?.underlying || 'BTC').trim().toUpperCase(),
 price: Number(msg?.spotPrice || 0),
 }));
 const previewSide = ['buy', 'sell'].includes(String(msg?.side || msg?.orderSide || '').toLowerCase())
 ? String(msg?.side || msg?.orderSide).toLowerCase()
 : (marketContext.recommendedSide === 'buy' ? 'buy' : 'sell');
 const preview = buildNativeStraddleTicketPreview({
 symbol,
 underlying: String(msg?.underlying || '').trim().toUpperCase(),
 qty: Math.max(1, Math.round(Number(msg?.qty || 1))),
 markPrice: Number(msg?.markPrice || 0),
 strike: Number(msg?.strike || 0),
 spotPrice: Number(msg?.spotPrice || 0),
 contractMultiplier: contractMultiplier || 1,
 productId,
 entryMode: cfg.entryMode || msg?.entryMode || 'limit',
 stopLossPct: cfg.legStopLossPct,
 orderSide: previewSide,
 }, cfg, {
 profileMaxOrderSizeUSD,
 strategyBudgetUSD: Number(cfg.maxRiskUSD || 0),
 feePctPerSide: V17_NATIVE_STRADDLE_FEE_PCT_PER_SIDE,
 softGateThreshold: NATIVE_STRADDLE_SOFT_GATE_SCORE,
 riskReversal25d: Number(skewMetrics?.riskReversal25d || 0),
 butterfly25d: Number(skewMetrics?.butterfly25d || 0),
 marketContext,
 });
 return {
 ok: true,
 preview,
 settings: {
 entryMode: String(cfg.entryMode || 'limit'),
 stopLossPct: Math.max(0, Number(cfg.legStopLossPct || 30)),
 closeMinutesBeforeExpiry: Math.max(0, Number(cfg.closeMinutesBeforeExpiry || 30)),
 profileId: resolvedProfileId,
 nativeStraddlePreferred: cfg.nativeStraddlePreferred !== false,
 softGateThreshold: NATIVE_STRADDLE_SOFT_GATE_SCORE,
 },
 };
 }

 async function v17GetStraddleDashboard(msg = {}) {
 const stored = await storeLocalGet(['optionsAutoTradeSettings', 'optionsStraddleLog', V17_STRADDLE_AUTOMATION_STATE_KEY]);
 const cfg = sanitizeOptionsAutoTradeSettings(stored?.optionsAutoTradeSettings || {});
 const rawLog = Array.isArray(stored?.optionsStraddleLog) ? stored.optionsStraddleLog.slice() : [];
 const nativeTickerCache = new Map();
 const optionTickerCache = new Map();
 const fetchNativeTickers = typeof globalThis.v17FetchStraddleTickers === 'function' ? globalThis.v17FetchStraddleTickers : v17FetchStraddleTickers;
 const fetchOptionTickers = typeof globalThis.v17FetchOptionTickers === 'function' ? globalThis.v17FetchOptionTickers : v17FetchOptionTickers;
 let changed = false;
 const entries = [];

 for (const rawEntry of rawLog) {
 const before = JSON.stringify(rawEntry || {});
 let entry = await v17NormalizeStraddleEntry(rawEntry, cfg);
 if (['active', 'partial_stop'].includes(String(entry.status || ''))) {
 if (entry.type === 'native_straddle' && entry.straddleLeg && ['live', 'reentered'].includes(String(entry.straddleLeg.status || ''))) {
 if (!nativeTickerCache.has(entry.underlying)) nativeTickerCache.set(entry.underlying, await fetchNativeTickers(entry.underlying).catch(() => new Map()));
 const mvTicker = nativeTickerCache.get(entry.underlying)?.get(entry.straddleLeg.symbol);
 if (mvTicker) entry.straddleLeg.currentPrice = Number(mvTicker.markPrice || mvTicker.lastPrice || entry.straddleLeg.currentPrice);
 } else {
 if (!optionTickerCache.has(entry.underlying)) optionTickerCache.set(entry.underlying, await fetchOptionTickers(entry.underlying).catch(() => new Map()));
 const tickerMap = optionTickerCache.get(entry.underlying);
 if (tickerMap && entry.callLeg && entry.callLeg.status !== 'closed') {
 const callTicker = tickerMap.get(entry.callLeg.symbol);
 if (callTicker) entry.callLeg.currentPrice = Number(callTicker.markPrice || callTicker.lastPrice || entry.callLeg.currentPrice);
 }
 if (tickerMap && entry.putLeg && entry.putLeg.status !== 'closed') {
 const putTicker = tickerMap.get(entry.putLeg.symbol);
 if (putTicker) entry.putLeg.currentPrice = Number(putTicker.markPrice || putTicker.lastPrice || entry.putLeg.currentPrice);
 }
 }
 }
 entry = await v17NormalizeStraddleEntry(entry, cfg);
 if (before !== JSON.stringify(entry)) changed = true;
 entries.push(entry);
 }

 if (changed) {
 await storeLocalSet({ optionsStraddleLog: entries.slice(0, V17_STRADDLE_LOG_LIMIT) });
 }

 const statusFilter = String(msg?.status || 'all').trim().toLowerCase();
 const underlyingFilter = String(msg?.underlying || 'all').trim().toUpperCase();
 const nativeOnly = !!msg?.nativeOnly;
 const filtered = entries
 .filter(entry => !nativeOnly || entry.type === 'native_straddle')
 .filter(entry => underlyingFilter === 'ALL' || !underlyingFilter || entry.underlying === underlyingFilter)
 .filter(entry => {
 if (statusFilter === 'active') return ['active', 'partial_stop'].includes(String(entry.status || ''));
 if (statusFilter === 'closed') return String(entry.status || '') === 'closed';
 return true;
 })
 .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
 const limit = Math.max(0, Math.round(Number(msg?.limit || 0)));
 const visibleEntries = limit > 0 ? filtered.slice(0, limit) : filtered;
 const summary = {
 activeCount: entries.filter(entry => ['active', 'partial_stop'].includes(String(entry.status || ''))).length,
 closedCount: entries.filter(entry => String(entry.status || '') === 'closed').length,
 activePnlUSD: entries
 .filter(entry => ['active', 'partial_stop'].includes(String(entry.status || '')))
 .reduce((sum, entry) => sum + Number(entry.totalPnlUSD || 0), 0),
 premiumOpenUSD: entries
 .filter(entry => ['active', 'partial_stop'].includes(String(entry.status || '')))
 .reduce((sum, entry) => sum + Number(entry.premiumUSD || 0), 0),
 updatedAt: Date.now(),
 };
 const automation = stored?.[V17_STRADDLE_AUTOMATION_STATE_KEY] || await v17PersistStraddleAutomationState(cfg, entries, { lastDecision: 'dashboard_sync' });
 return { ok: true, entries: visibleEntries, summary, automation };
 }

 async function v17CloseStraddleEntry(entryId = '') {
 const stored = await storeLocalGet(['optionsAutoTradeSettings', 'optionsStraddleLog']);
 const cfg = sanitizeOptionsAutoTradeSettings(stored?.optionsAutoTradeSettings || {});
 const log = Array.isArray(stored?.optionsStraddleLog) ? stored.optionsStraddleLog.slice() : [];
 const idx = log.findIndex(e => e?.id === entryId);
 if (idx < 0) return { ok: false, error: 'Entry not found' };
 const entry = await v17NormalizeStraddleEntry(log[idx], cfg);
 if (entry.status === 'closed') return { ok: true, already: true };
 let access;
 try { access = await v16ResolveAuthorizedProfile({ profileId: entry.profileId || cfg.profileId }, { tradeRequired: true }); } catch (e) { return { ok: false, error: e?.message }; }
 if (entry.type === 'native_straddle' && entry.straddleLeg) {
 const leg = entry.straddleLeg;
 if (['live', 'reentered'].includes(leg.status)) {
 await v17StraddleCloseLeg(leg, access, { entryMode: 'market' });
 entry.straddleLeg = v17RealizeStraddleLeg({ ...leg, status: 'closed' });
 entry.straddleLeg.status = 'closed';
 }
 if (entry.straddleLeg.status === 'stopped') entry.straddleLeg.status = 'closed';
 } else {
 for (const k of ['callLeg', 'putLeg']) {
 if (['live', 'reentered'].includes(entry[k].status)) {
 await v17StraddleCloseLeg(entry[k], access, { entryMode: 'market' });
 entry[k] = v17RealizeStraddleLeg({ ...entry[k], status: 'closed' });
 entry[k].status = 'closed';
 }
 if (entry[k].status === 'stopped') entry[k].status = 'closed';
 }
 }
 entry.status = 'closed'; entry.closedAt = Date.now(); entry.closeReason = 'manual';
 entry.notifications.exitAt = Date.now();
 log[idx] = await v17NormalizeStraddleEntry(entry, cfg);
 await storeLocalSet({ optionsStraddleLog: log.slice(0, V17_STRADDLE_LOG_LIMIT) });
 return { ok: true, entry: log[idx] };
 }

 chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
 if (msg?.action === 'v17:getOptionUniverse') {
 v17GetOptionUniverse(msg)
 .then(sendResponse)
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load option universe' }));
 return true;
 }
 if (msg?.action === 'v17:getOptionsChain') {
 v17GetOptionsChain(msg)
 .then(sendResponse)
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load option chain' }));
 return true;
 }
 if (msg?.action === 'v17:analyzeOptionStrategy') {
 v17AnalyzeOptionStrategy(msg)
 .then(sendResponse)
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to analyze strategy' }));
 return true;
 }
 if (msg?.action === 'v17:getOptionsExecutionHealth') {
 (async () => {
 const stored = await storeLocalGet([V17_OPTIONS_REPAIR_STATE_KEY, 'optionStrategyOrderLog', 'optionsAutoTradeLog', 'optionsStraddleLog']);
 const repair = stored?.[V17_OPTIONS_REPAIR_STATE_KEY] || null;
 const recentStrategy = Array.isArray(stored?.optionStrategyOrderLog) ? stored.optionStrategyOrderLog.slice(0, 5) : [];
 const recentAuto = Array.isArray(stored?.optionsAutoTradeLog) ? stored.optionsAutoTradeLog.slice(0, 5) : [];
 const straddleLog = Array.isArray(stored?.optionsStraddleLog) ? stored.optionsStraddleLog : [];
 const unprotected = straddleLog.filter(entry => {
 const legs = [entry?.straddleLeg, entry?.callLeg, entry?.putLeg].filter(Boolean);
 return ['active', 'partial_stop', 'protection_failed'].includes(String(entry?.status || ''))
 && legs.some(leg => ['missing', 'failed', 'unprotected'].includes(String(leg?.protectionState || leg?.stopOrderState || '').toLowerCase()));
 });
 sendResponse({
 ok: true,
 locked: !!repair && String(repair.status || '') === 'open',
 repair: repair && String(repair.status || '') === 'open' ? repair : null,
 recentStrategy,
 recentAuto,
 unprotectedCount: unprotected.length,
 unprotected: unprotected.slice(0, 6),
 });
 })().catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load options execution health' }));
 return true;
 }
 if (msg?.action === 'v17:placeOptionStrategyOrders') {
 v17PlaceOptionStrategyOrders(msg)
 .then(sendResponse)
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to place option strategy' }));
 return true;
 }
 if (msg?.action === 'v17:startStraddleAutoTrade') {
 runStraddleAutoTradeEntry()
 .then(sendResponse)
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to start straddle' }));
 return true;
 }
 if (msg?.action === 'v17:getStraddleLog') {
 storeLocalGet(['optionsStraddleLog'])
 .then(data => sendResponse({ ok: true, log: data?.optionsStraddleLog || [] }))
 .catch(error => sendResponse({ ok: false, error: error?.message }));
 return true;
 }
 if (msg?.action === 'v17:getStraddleTicketPreview') {
 v17GetStraddleTicketPreviewEnvelope(msg)
 .then(sendResponse)
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to build straddle preview' }));
 return true;
 }
 if (msg?.action === 'v17:getStraddleDashboard') {
 v17GetStraddleDashboard(msg)
 .then(sendResponse)
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load straddle dashboard' }));
 return true;
 }
 if (msg?.action === 'v17:closeStraddleEntry') {
 v17CloseStraddleEntry(msg?.entryId || '')
 .then(sendResponse)
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to close straddle' }));
 return true;
 }
 if (msg?.action === 'v17:getStraddleSettings') {
 storeLocalGet(['optionsAutoTradeSettings'])
 .then(data => sendResponse({ ok: true, settings: sanitizeOptionsAutoTradeSettings(data?.optionsAutoTradeSettings || {}) }))
 .catch(error => sendResponse({ ok: false, error: error?.message }));
 return true;
 }
 if (msg?.action === 'v17:saveStraddleSettings') {
 const validated = sanitizeOptionsAutoTradeSettings(msg?.settings || {});
 storeLocalSet({ optionsAutoTradeSettings: validated })
 .then(() => { syncOptionsStraddleMonitorAlarm(() => {}); sendResponse({ ok: true, settings: validated }); })
 .catch(error => sendResponse({ ok: false, error: error?.message }));
 return true;
 }
 if (msg?.action === 'v17:placeNativeStraddleOrder') {
 (async () => {
 const stored = await storeLocalGet(['optionsAutoTradeSettings', 'optionsStraddleLog']);
 const cfg = sanitizeOptionsAutoTradeSettings(stored?.optionsAutoTradeSettings || {});
 const symbol = String(msg?.symbol || '').trim().toUpperCase();
 const qty = Math.max(1, Math.round(Number(msg?.qty || 1)));
 const side = String(msg?.side || 'sell').toLowerCase() === 'buy' ? 'buy' : 'sell';
 const entryMode = String(cfg.entryMode || msg?.entryMode || 'limit').trim().toLowerCase();
 const stopLossPct = Math.max(0, Number(cfg.legStopLossPct ?? msg?.stopLossPct ?? 30));
 if (!symbol.startsWith('MV-')) throw new Error('Only MV- straddle symbols are supported');
 const access = await v16ResolveAuthorizedProfile({ profileId: cfg.profileId || msg?.profileId || '' }, { tradeRequired: true });
 const previewEnvelope = await v17GetStraddleTicketPreviewEnvelope({
 ...msg,
 symbol,
 qty,
 entryMode,
 stopLossPct,
 profileId: access?.profile?.id || cfg.profileId || msg?.profileId || '',
 });
 const serverPreview = previewEnvelope?.preview || {};
 if (serverPreview?.canPlace !== true) {
 const blocked = Array.isArray(serverPreview?.blockedReasons) && serverPreview.blockedReasons.length
 ? serverPreview.blockedReasons.join('; ')
 : (serverPreview?.reason || 'Native straddle preview gate failed');
 throw new Error(`Native straddle blocked: ${blocked}`);
 }
 const leg = sanitizeOptionLeg({
 symbol, side, qty, quantity: qty,
 markPrice: Number(msg?.markPrice || 0),
 entryPrice: Number(msg?.markPrice || 0),
 bid: Number(msg?.bid || 0),
 ask: Number(msg?.ask || 0),
 productId: Number(msg?.productId || 0),
 contractMultiplier: Number(msg?.contractMultiplier || 1),
 strike: Number(msg?.strike || 0),
 expiryTs: Number(msg?.expiryTs || 0),
 optionType: 'straddle',
 });
 const result = await v17PlaceDirectOptionOrder(leg, access, { entryMode });
 if (result) {
 const log = Array.isArray(stored?.optionsStraddleLog) ? stored.optionsStraddleLog.slice() : [];
 const legStopMultiplier = side === 'buy' ? Math.max(0, (100 - stopLossPct) / 100) : 1 + stopLossPct / 100;
 const entryTs = Date.now();
 const entry = {
 id: `mv_manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
 ts: entryTs,
 underlying: String(msg?.underlying || ''),
 profileId: String(access?.profile?.id || cfg.profileId || msg?.profileId || ''),
 type: 'native_straddle',
 actionSide: side,
 entryMode,
 stopLossPct,
 expiryTs: Number(msg?.expiryTs || 0),
 expiryKey: String(msg?.expiryKey || ''),
 atmStrike: Number(msg?.strike || 0),
 spotAtEntry: Number(msg?.spotPrice || 0),
 status: 'active',
 closedAt: null,
 closeReason: null,
 straddleLeg: {
 symbol,
 productId: Number(msg?.productId || 0),
 side,
 entryPrice: Number(msg?.markPrice || 0),
 currentPrice: Number(msg?.markPrice || 0),
 stopPrice: Number(msg?.markPrice || 0) * legStopMultiplier,
 status: 'live',
 reentryCount: 0,
 reentries: [],
 orderId: String(result?.result?.id || ''),
 entryOrderId: String(result?.result?.id || ''),
 entryOrderPlacedAt: entryTs,
 entryOrderState: entryMode === 'market' ? 'filled_assumed' : 'working',
 entryFilledAt: entryMode === 'market' ? entryTs : 0,
 realizedPnl: 0,
 realizedPnlUSD: 0,
 score: Number(msg?.score || 0),
 qty,
 contractMultiplier: Number(msg?.contractMultiplier || 1),
 entryMode,
 stopLossPct,
 premiumCapturePct: Number(cfg.premiumCapturePct || 0),
 stopOrderId: '',
 stopOrderState: '',
 protectionSource: '',
 stopOrderPlacedAt: 0,
 stopOrderUpdatedAt: 0,
 lastStopActionAt: 0,
 protectionState: entryMode === 'market' ? 'missing' : 'missing',
 },
 callLeg: null,
 putLeg: null,
 totalPnl: 0,
 totalPnlUSD: 0,
 notifications: { entryAt: entryTs, stopAt: null, exitAt: null },
 };
 const normalizedEntry = await v17NormalizeStraddleEntry(entry, cfg);
 // Place actual SL order on Delta Exchange
 let stopError = null;
 const slResult = await v17PlaceStraddleStopOrder(normalizedEntry.straddleLeg, normalizedEntry.straddleLeg.stopPrice, access, cfg)
 .catch(error => { stopError = error; return null; });
 const slOrderId = v17ResolveOrderId(slResult);
 if (slOrderId) {
 normalizedEntry.straddleLeg.stopOrderId = slOrderId;
 normalizedEntry.straddleLeg.stopOrderState = 'open';
 normalizedEntry.straddleLeg.protectionSource = 'app_native';
 normalizedEntry.straddleLeg.stopOrderPlacedAt = Date.now();
 normalizedEntry.straddleLeg.stopOrderUpdatedAt = normalizedEntry.straddleLeg.stopOrderPlacedAt;
 normalizedEntry.straddleLeg.lastStopActionAt = normalizedEntry.straddleLeg.stopOrderPlacedAt;
 normalizedEntry.straddleLeg.protectionState = 'armed';
 } else {
 const rollback = { cancelEntry: null, closeEntry: null };
 const entryOrderId = v17ResolveOrderId(result);
 normalizedEntry.status = 'protection_failed';
 normalizedEntry.closeReason = 'stop_protection_failed';
 normalizedEntry.closedAt = Date.now();
 normalizedEntry.straddleLeg.stopOrderState = 'failed';
 normalizedEntry.straddleLeg.protectionSource = '';
 normalizedEntry.straddleLeg.protectionState = 'unprotected';
 normalizedEntry.straddleLeg.protectionError = stopError?.message || 'Stop-loss order was not accepted';
 if (entryOrderId) {
 rollback.cancelEntry = await v17CancelStraddleEntryOrder(entryOrderId, normalizedEntry.straddleLeg.productId, access)
 .then(cancelResult => ({ ok: !!cancelResult, result: cancelResult }))
 .catch(error => ({ ok: false, error: error?.message || 'Entry cancel failed' }));
 }
 if (entryMode === 'market' || Number(normalizedEntry.straddleLeg.entryFilledAt || 0) > 0) {
 const closeLeg = sanitizeOptionLeg({
 ...normalizedEntry.straddleLeg,
 side: side === 'sell' ? 'buy' : 'sell',
 quantity: qty,
 qty,
 markPrice: Number(msg?.markPrice || 0),
 entryPrice: Number(msg?.markPrice || 0),
 });
 rollback.closeEntry = await v17PlaceDirectOptionOrder(closeLeg, access, { entryMode: 'market', reduceOnly: true })
 .then(closeResult => ({ ok: true, result: closeResult }))
 .catch(error => ({ ok: false, error: error?.message || 'Emergency close failed' }));
 if (rollback.closeEntry?.ok) normalizedEntry.straddleLeg.status = 'closed';
 }
 normalizedEntry.straddleLeg.rollback = rollback;
 log.unshift(await v17NormalizeStraddleEntry(normalizedEntry, cfg));
 await storeLocalSet({ optionsStraddleLog: log.slice(0, V17_STRADDLE_LOG_LIMIT) });
 await v17PersistStraddleAutomationState(cfg, log, {
 lastRunAt: entryTs,
 lastDecision: 'manual_native_protection_failed',
 blockedReason: normalizedEntry.straddleLeg.protectionError,
 lastPlacedSymbol: symbol,
 lastPlacedUnderlying: String(msg?.underlying || ''),
 });
 syncOptionsStraddleMonitorAlarm(() => {});
 const rollbackText = rollback.closeEntry?.ok || rollback.cancelEntry?.ok
 ? 'Rollback attempted; check Orders before retrying.'
 : 'Rollback failed; check Delta Orders immediately.';
 throw new Error(`Stop protection failed for ${symbol}. ${rollbackText}`);
 }
 log.unshift(await v17NormalizeStraddleEntry(normalizedEntry, cfg));
 await storeLocalSet({ optionsStraddleLog: log.slice(0, V17_STRADDLE_LOG_LIMIT) });
 await v17PersistStraddleAutomationState(cfg, log, {
 lastRunAt: entryTs,
 lastDecision: 'manual_native_entry',
 lastPlacedSymbol: symbol,
 lastPlacedUnderlying: String(msg?.underlying || ''),
 });
 syncOptionsStraddleMonitorAlarm(() => {});
 sendResponse({ ok: true, entry: log[0], order: result });
 }
 })().catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to place native straddle order' }));
 return true;
 }
 if (msg?.action === 'v17:getStraddleChain') {
 v17GetStraddleChain(msg)
 .then(sendResponse)
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load straddle chain' }));
 return true;
 }
 if (msg?.action === 'v17:getVolatilitySkew') {
 v17GetVolatilitySkew(msg)
 .then(sendResponse)
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load volatility skew' }));
 return true;
 }
 return false;
 });

 globalThis.v17GetStraddleChain = v17GetStraddleChain;
 globalThis.v17GetVolatilitySkew = v17GetVolatilitySkew;
 globalThis.v17GetOptionUniverse = v17GetOptionUniverse;
 globalThis.v17GetOptionsChain = v17GetOptionsChain;
 globalThis.v17AnalyzeOptionStrategy = v17AnalyzeOptionStrategy;
 globalThis.v17PlaceOptionStrategyOrders = v17PlaceOptionStrategyOrders;
 globalThis.v17GetStraddleTicketPreviewEnvelope = v17GetStraddleTicketPreviewEnvelope;
 globalThis.v17GetStraddleDashboard = v17GetStraddleDashboard;
 globalThis.runOptionsAutoTradeEngine = runOptionsAutoTradeEngine;
 globalThis.runOptionsStraddleMonitor = runOptionsStraddleMonitor;
 globalThis.runStraddleAutoTradeEntry = runStraddleAutoTradeEntry;
})();
