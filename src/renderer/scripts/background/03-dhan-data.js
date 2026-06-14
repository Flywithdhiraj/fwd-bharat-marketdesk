'use strict';

const DHAN_ORDER_DISABLED_ERROR = 'Order placement is disabled. Use your broker app or web terminal for manual trading.';
const DHAN_SCAN_SYMBOL_PRIORITY = [
 'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'SBIN',
 'LT', 'AXISBANK', 'KOTAKBANK', 'BHARTIARTL', 'ITC', 'HINDUNILVR', 'BAJFINANCE', 'MARUTI', 'M&M',
 'SUNPHARMA', 'TITAN', 'ULTRACEMCO', 'ASIANPAINT', 'NTPC', 'POWERGRID', 'ONGC', 'TATASTEEL', 'JSWSTEEL',
 'ADANIENT', 'ADANIPORTS', 'HCLTECH', 'WIPRO', 'TECHM', 'DRREDDY', 'CIPLA', 'EICHERMOT', 'DIVISLAB',
 'COALINDIA', 'GRASIM', 'APOLLOHOSP', 'HEROMOTOCO', 'TATACONSUM', 'SBILIFE', 'BRITANNIA', 'NESTLEIND',
 'HDFCLIFE', 'BAJAJ-AUTO', 'VEDL', 'HINDALCO', 'BANKBARODA', 'PNB', 'DLF', 'TRENT',
];
const DHAN_SCAN_PRIORITY_RANK = new Map(DHAN_SCAN_SYMBOL_PRIORITY.map((symbol, index) => [symbol, index]));
const DHAN_INDEX_TAPE_DEFINITIONS = Object.freeze([
 { symbol: 'NIFTY', label: 'Nifty 50', shortLabel: 'N50', aliases: ['NIFTY', 'NIFTY 50'], securityId: '13' },
 { symbol: 'BANKNIFTY', label: 'Bank Nifty', shortLabel: 'BANK', aliases: ['BANKNIFTY', 'NIFTY BANK'], securityId: '25' },
 { symbol: 'FINNIFTY', label: 'Fin Nifty', shortLabel: 'FIN', aliases: ['FINNIFTY', 'NIFTY FIN SERVICE', 'NIFTY FINANCIAL SERVICES'], securityId: '27' },
 { symbol: 'INDIA VIX', label: 'India VIX', shortLabel: 'VIX', aliases: ['INDIA VIX', 'INDIAVIX'], securityId: '21' },
 { symbol: 'MIDCPNIFTY', label: 'Midcap Nifty', shortLabel: 'MID', aliases: ['MIDCPNIFTY', 'NIFTY MID SELECT'], securityId: '442' },
 { symbol: 'NIFTYIT', label: 'Nifty IT', shortLabel: 'IT', aliases: ['NIFTYIT', 'NIFTY IT'], securityId: '29' },
]);
const DHAN_BENCHMARK_SYMBOLS = Object.freeze(DHAN_INDEX_TAPE_DEFINITIONS.map(item => item.symbol));
const DHAN_LIVE_SCANNER_SUBSCRIPTION_LIMIT = 100;
const DHAN_SCANNER_UNIVERSE_LABELS = Object.freeze({
 fno_stocks: 'F&O Stocks',
 nifty500: 'Nifty 500',
 midcap150: 'Midcap 150',
 smallcap250: 'Smallcap 250',
 all_nse: 'All NSE Equity',
 nse_rest: 'NSE Rest',
 nse_af: 'NSE A-F',
 nse_gl: 'NSE G-L',
 nse_mr: 'NSE M-R',
 nse_sz: 'NSE S-Z',
 all_bse: 'All BSE Equity',
 bse_only: 'BSE Only',
 bse_af: 'BSE A-F',
 bse_gl: 'BSE G-L',
 bse_mr: 'BSE M-R',
 bse_sz: 'BSE S-Z',
});

function normalizeDhanScannerUniverse(value = '') {
 const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
 if (['fno', 'fno_stock', 'fno_stocks', 'fo'].includes(raw)) return 'fno_stocks';
 if (['idx', 'index', 'indices', 'dhan_indices', 'idx_i'].includes(raw)) return 'indices';
 if (['nifty500', 'nifty_500', 'n500'].includes(raw)) return 'nifty500';
 if (['midcap', 'midcap150', 'midcap_150'].includes(raw)) return 'midcap150';
 if (['smallcap', 'smallcap250', 'smallcap_250'].includes(raw)) return 'smallcap250';
 if (['all', 'all_nse', 'all_equity', 'nse'].includes(raw)) return 'all_nse';
 if (['nse_rest', 'nse_remaining', 'nse_uncovered', 'nse_ex_overlap', 'nse_ex_core'].includes(raw)) return 'nse_rest';
 if (['all_bse', 'bse', 'bse_equity', 'all_bse_equity'].includes(raw)) return 'all_bse';
 if (['bse_only', 'bse_unique', 'bse_ex_nse', 'bse_not_nse'].includes(raw)) return 'bse_only';
 if (['nse_a_f', 'nse_af', 'nse_1', 'nse_chunk_1'].includes(raw)) return 'nse_af';
 if (['nse_g_l', 'nse_gl', 'nse_2', 'nse_chunk_2'].includes(raw)) return 'nse_gl';
 if (['nse_m_r', 'nse_mr', 'nse_3', 'nse_chunk_3'].includes(raw)) return 'nse_mr';
 if (['nse_s_z', 'nse_sz', 'nse_4', 'nse_chunk_4'].includes(raw)) return 'nse_sz';
 if (['bse_a_f', 'bse_af', 'bse_1', 'bse_chunk_1'].includes(raw)) return 'bse_af';
 if (['bse_g_l', 'bse_gl', 'bse_2', 'bse_chunk_2'].includes(raw)) return 'bse_gl';
 if (['bse_m_r', 'bse_mr', 'bse_3', 'bse_chunk_3'].includes(raw)) return 'bse_mr';
 if (['bse_s_z', 'bse_sz', 'bse_4', 'bse_chunk_4'].includes(raw)) return 'bse_sz';
 return raw || 'fno_stocks';
}

async function dhanNative(action, payload = {}) {
 const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
 try {
  const bridge = globalThis.fwdDesktopNative
   || (globalThis.parent && globalThis.parent !== globalThis ? globalThis.parent.fwdDesktopNative : null)
   || (globalThis.top && globalThis.top !== globalThis ? globalThis.top.fwdDesktopNative : null);
  if (!bridge?.sendNativeMessage) {
   const missingBridge = { ok: false, status: 503, error: 'Market-data bridge is not available.' };
   globalThis.fwdRecordDhanNativeApiMetric?.(action, missingBridge, startedAt);
   return missingBridge;
  }
  const response = await bridge.sendNativeMessage({ ...payload, type: 'dhan_data', action });
  globalThis.fwdRecordDhanNativeApiMetric?.(action, response, startedAt);
  return response;
 } catch (error) {
  const failed = { ok: false, status: 500, error: error?.message || 'Market-data bridge failed.' };
  globalThis.fwdRecordDhanNativeApiMetric?.(action, failed, startedAt, error);
  return failed;
 }
}

function dhanToTickerMap(ltpPayload = {}, instruments = []) {
 const byInstrumentKey = new Map();
 const bySecurityId = new Map();
 const duplicateSecurityIds = new Set();
 for (const item of (Array.isArray(instruments) ? instruments : [])) {
  const securityId = String(item?.securityId || '').trim();
  const exchangeSegment = String(item?.exchangeSegment || '').trim().toUpperCase();
  if (!securityId) continue;
  if (exchangeSegment) byInstrumentKey.set(`${exchangeSegment}:${securityId}`, item);
  if (bySecurityId.has(securityId)) duplicateSecurityIds.add(securityId);
  else bySecurityId.set(securityId, item);
 }
 duplicateSecurityIds.forEach(securityId => bySecurityId.delete(securityId));
 const data = ltpPayload?.data?.data || ltpPayload?.data || ltpPayload?.raw?.data || {};
 const map = {};
 Object.entries(data || {}).forEach(([exchangeSegment, rows]) => {
  Object.entries(rows || {}).forEach(([securityId, quote]) => {
   const segment = String(exchangeSegment || '').trim().toUpperCase();
   const id = String(securityId || '').trim();
   const instrument = byInstrumentKey.get(`${segment}:${id}`) || bySecurityId.get(id) || {};
   const symbol = String(instrument.tradingSymbol || instrument.symbol || securityId).trim().toUpperCase();
   const price = Number(quote?.last_price || quote?.lastPrice || quote?.ltp || quote?.LTP || 0);
   if (!symbol || !(price > 0)) return;
   const ohlc = quote?.ohlc || quote?.OHLC || quote?.ohlcData || {};
   const volume = Number(
    quote?.volume
    || quote?.volumeTraded
    || quote?.totalTradedVolume
    || quote?.total_volume
    || ohlc.volume
    || 0
   ) || 0;
   const open = Number(quote?.open || quote?.open_price || quote?.openPrice || ohlc.open || 0);
   const prevClose = Number(
    quote?.close
    || quote?.close_price
    || quote?.closePrice
    || quote?.previous_close
    || quote?.prev_close
    || quote?.prevClose
    || ohlc.close
    || 0
   );
   const rawPointChange = Number(
    quote?.net_change
    ?? quote?.netChange
    ?? quote?.change
    ?? 0
   );
   const rawChangePct = Number(
    quote?.change_percent
    ?? quote?.changePercent
    ?? quote?.pct_change
    ?? quote?.percentChange
    ?? 0
   );
   const derivedPrevClose = prevClose > 0 ? prevClose : (Number.isFinite(rawPointChange) && price - rawPointChange > 0 ? price - rawPointChange : 0);
   const pointChange = derivedPrevClose > 0 ? price - derivedPrevClose : (Number.isFinite(rawPointChange) ? rawPointChange : 0);
   const changePct = derivedPrevClose > 0 ? (pointChange / derivedPrevClose) * 100 : open > 0 ? ((price - open) / open) * 100 : rawChangePct;
   map[symbol] = {
    price,
    change24h: Number.isFinite(changePct) ? +changePct.toFixed(2) : 0,
    volume24h: volume,
    turnover24h: volume * price,
    inrTurnover24h: volume * price,
    usdVol24h: volume * price,
    dayOpen: open,
    dayHigh: Number(quote?.high || quote?.high_price || quote?.highPrice || ohlc.high || 0) || 0,
    dayLow: Number(quote?.low || quote?.low_price || quote?.lowPrice || ohlc.low || 0) || 0,
    prevClose: derivedPrevClose,
    pointChange: Number.isFinite(pointChange) ? +pointChange.toFixed(2) : 0,
    oi: Number(quote?.oi || quote?.open_interest || 0) || 0,
    fundingRate: 0,
    nextFundingAt: 0,
    productId: securityId,
    contractType: instrument.instrument || 'EQUITY',
    productTradingStatus: 'manual_trading_only',
     securityId,
     exchangeSegment,
     dhanInstrument: instrument,
     source: 'dhan',
    };
  });
 });
 return map;
}

function dhanInstrumentToProduct(item = {}) {
 const symbol = String(item.tradingSymbol || item.symbol || item.securityId || '').trim().toUpperCase();
 const isIndex = String(item.instrument || '').trim().toUpperCase() === 'INDEX';
 const indexDefinition = isIndex
  ? DHAN_INDEX_TAPE_DEFINITIONS.find(definition => (definition.aliases || []).some(alias => normalizeDhanIndexTapeKey(alias) === normalizeDhanIndexTapeKey(symbol)))
  : null;
 const instrumentDescription = isIndex
  ? `${indexDefinition?.label || item.displayName || item.tradingSymbol || symbol} live index`
  : `${item.exchangeSegment || item.exchange || 'NSE/BSE'} ${item.instrument || item.segment || ''}`.trim();
 const selectedUniverse = normalizeDhanScannerUniverse(item.selectedUniverse || item.universe || '');
 const universeLabel = item.universeLabel || DHAN_SCANNER_UNIVERSE_LABELS[selectedUniverse] || 'Market Universe';
 return {
  id: item.securityId || symbol,
  symbol,
  name: item.tradingSymbol || item.symbol || symbol,
  description: instrumentDescription,
  instrumentDescription,
  contractType: item.instrument || '',
  state: 'active',
  status: 'active',
  tradingStatus: 'manual_trading_only',
  launchTime: '',
  createdAt: '',
  updatedAt: '',
   tags: ['Market Data Only', 'Manual Trading Only', universeLabel, item.fnoStock ? 'F&O Stock' : '', isIndex ? 'Index' : ''].filter(Boolean),
  sector: isIndex ? 'Benchmark Index' : (item.sector || globalThis.FWDTradeDeskShared?.getSector?.(symbol) || item.exchangeSegment || item.exchange || 'NSE/BSE'),
  assetClass: isIndex ? 'indian_index' : 'indian_equity',
   assetLabel: isIndex ? 'NSE Index' : universeLabel,
   assetBadge: isIndex ? 'Index' : universeLabel,
  assetInfo: 'Read-only market-data instrument',
  underlyingSymbol: item.symbol || symbol,
  underlyingName: item.symbol || symbol,
  fundingIntervalSeconds: 0,
  securityId: item.securityId,
  exchangeSegment: item.exchangeSegment,
  lotSize: item.lotSize,
  expiry: item.expiry,
  strike: item.strike,
  optionType: item.optionType,
   dhanInstrument: item,
   fnoStock: !!item.fnoStock,
   isBenchmark: !!item.isBenchmark,
   selectedUniverse,
   universeLabel,
   universeTags: Array.isArray(item.universeTags) ? item.universeTags : [],
  };
}

function dhanInstrumentRank(product = {}) {
 const symbol = String(product.symbol || product.tradingSymbol || '').trim().toUpperCase();
 const underlying = String(product.underlyingSymbol || product.name || '').trim().toUpperCase();
 const exchangeSegment = String(product.exchangeSegment || product.dhanInstrument?.exchangeSegment || '').trim().toUpperCase();
 const instrument = String(product.contractType || product.dhanInstrument?.instrument || '').trim().toUpperCase();
 const preferred = Math.min(
  DHAN_SCAN_PRIORITY_RANK.has(symbol) ? DHAN_SCAN_PRIORITY_RANK.get(symbol) : 9999,
  DHAN_SCAN_PRIORITY_RANK.has(underlying) ? DHAN_SCAN_PRIORITY_RANK.get(underlying) : 9999
 );
 const segmentRank = exchangeSegment === 'IDX_I' ? 0
  : exchangeSegment === 'NSE_EQ' ? 1
  : exchangeSegment === 'BSE_EQ' ? 2
  : exchangeSegment === 'NSE_FNO' ? 3
  : exchangeSegment === 'BSE_FNO' ? 4
  : 9;
 const instrumentPenalty = instrument === 'EQUITY' || instrument === 'INDEX' ? 0 : 25;
 return preferred * 100 + segmentRank * 10 + instrumentPenalty + symbol.localeCompare(underlying || symbol);
}

function sortDhanProductsForScan(products = []) {
 return (Array.isArray(products) ? products : [])
 .filter(product => product?.symbol && product?.dhanInstrument?.securityId)
 .sort((a, b) => {
  const ar = dhanInstrumentRank(a);
  const br = dhanInstrumentRank(b);
  if (ar !== br) return ar - br;
  return String(a.symbol || '').localeCompare(String(b.symbol || ''));
 });
}

async function dhanFetchProductsForRenderer(options = {}) {
 const universe = normalizeDhanScannerUniverse(options.universe || 'fno_stocks');
 const response = await dhanNative('instruments', {
  force: !!options.force,
  query: options.query || '',
  universe,
  limit: Math.max(1, Number(options.limit || 1500)),
 });
 if (!response?.ok) throw new Error(response?.error || 'Market instruments unavailable.');
 const products = (Array.isArray(response.products) ? response.products : []).map(dhanInstrumentToProduct);
 globalThis.dhanLastUniverseMeta = {
  universe: response.universe || universe,
  label: response.universeLabel || DHAN_SCANNER_UNIVERSE_LABELS[universe] || universe,
  description: response.universeDescription || '',
  count: Number(response.universeCount || products.length || 0),
  returned: products.length,
  catalog: response.universeCatalog || null,
  fetchedAt: response.fetchedAt || Date.now(),
 };
 return sortDhanProductsForScan(products).slice(0, Math.max(1, Number(options.limit || 1500)));
}

function normalizeDhanIndexTapeKey(value = '') {
 return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function buildDhanIndexFallbackProduct(definition = {}) {
 return dhanInstrumentToProduct({
  exchange: 'IDX',
  segment: 'IDX',
  exchangeSegment: 'IDX_I',
  symbol: definition.symbol,
  tradingSymbol: definition.symbol,
  securityId: definition.securityId,
  lotSize: 1,
  expiry: '',
  strike: 0,
  optionType: '',
  instrument: 'INDEX',
  displayName: definition.label,
  source: 'dhan-index-fallback',
  isBenchmark: definition.symbol === 'NIFTY',
 });
}

function resolveDhanIndexTapeProducts(products = []) {
 const available = new Map();
 (Array.isArray(products) ? products : []).forEach(product => {
  const instrument = product?.dhanInstrument || {};
  const keys = [
   product.symbol,
   product.name,
   product.underlyingSymbol,
   instrument.symbol,
   instrument.tradingSymbol,
   instrument.displayName,
  ].map(normalizeDhanIndexTapeKey).filter(Boolean);
  keys.forEach(key => {
   if (!available.has(key)) available.set(key, product);
  });
 });
 return DHAN_INDEX_TAPE_DEFINITIONS.map(definition => {
  const matched = (definition.aliases || [definition.symbol])
  .map(normalizeDhanIndexTapeKey)
  .map(key => available.get(key))
  .find(Boolean);
  return matched || buildDhanIndexFallbackProduct(definition);
 });
}

async function dhanFetchTickerMapForRenderer(options = {}) {
 const universe = normalizeDhanScannerUniverse(options.universe || 'fno_stocks');
 const limit = Math.max(1, Number(options.limit || 1500));
 const subscribeLiveFeed = options.subscribeLiveFeed !== false && options.autoSubscribeLiveFeed !== false;
 const broadUniverse = ['nifty500', 'midcap150', 'smallcap250', 'all_nse', 'nse_rest', 'all_bse', 'bse_only', 'nse_af', 'nse_gl', 'nse_mr', 'nse_sz', 'bse_af', 'bse_gl', 'bse_mr', 'bse_sz'].includes(universe);
 const quoteAction = String(options.quoteAction || options.marketFeedAction || (broadUniverse ? 'ohlc' : 'quotes')).trim().toLowerCase();
 const quoteBatchSize = universe === 'all_nse' || universe === 'all_bse' ? 1000 : 500;
 const quotePaceMs = universe === 'all_nse' || universe === 'all_bse' ? 1300 : universe === 'nifty500' ? 1200 : 1100;
 const [fnoProducts, benchmarkProducts] = await Promise.all([
  dhanFetchProductsForRenderer({ limit, universe }),
  dhanNative('instruments', { universe: 'indices', limit: 200 })
  .then(response => (response?.ok ? (response.products || []).map(dhanInstrumentToProduct) : []))
  .catch(() => []),
 ]);
 const benchmarkProductsForTape = resolveDhanIndexTapeProducts(benchmarkProducts);
 const benchmarkSecurityIds = new Set(benchmarkProductsForTape.map(product => String(product.securityId || product.dhanInstrument?.securityId || '')).filter(Boolean));
 const products = [
  ...benchmarkProductsForTape,
  ...fnoProducts.filter(product => !benchmarkSecurityIds.has(String(product.securityId || product.dhanInstrument?.securityId || ''))),
 ];
 const instruments = products.map(product => product.dhanInstrument).filter(Boolean);
 const expectedBreadth = Math.max(1, fnoProducts.length);
 const fetchFeed = async action => {
  const response = await dhanNative(action, { symbols: instruments, batchSize: quoteBatchSize, paceMs: quotePaceMs });
  const map = response?.ok ? dhanToTickerMap(response, instruments) : {};
  return { response, map, action };
 };
 let quoteResult = await fetchFeed(quoteAction === 'ltp' ? 'ltp' : quoteAction === 'quotes' || quoteAction === 'quote' ? 'quotes' : 'ohlc');
 if (
  quoteResult.response?.ok
  && Object.keys(quoteResult.map || {}).length < Math.min(expectedBreadth, Math.max(25, Math.floor(expectedBreadth * 0.4)))
  && quoteResult.action !== 'ohlc'
 ) {
  dlog?.(`Market ${quoteResult.action} returned only ${Object.keys(quoteResult.map || {}).length}/${expectedBreadth}; retrying OHLC breadth feed.`);
  quoteResult = await fetchFeed('ohlc');
 }
 const quote = quoteResult.response;
 if (!quote?.ok) {
  const message = quote?.error || 'Market quote unavailable.';
  dlog?.(`Market quote unavailable: ${message}`);
  const error = new Error(message);
  error.status = quote?.status || 0;
 error.isRateLimit = Number(quote?.status || 0) === 429 || /too many|rate.?limit|blocked/i.test(message);
 throw error;
 }
 const map = quoteResult.map || dhanToTickerMap(quote, instruments);
 dlog?.(`Market feed ${quoteResult.action} batch=${quoteBatchSize} rows=${Object.keys(map).length}/${expectedBreadth} for ${DHAN_SCANNER_UNIVERSE_LABELS[universe] || universe}.`);
 if (!Object.keys(map).length) {
  const error = new Error(`Market data returned 0 quote rows for ${DHAN_SCANNER_UNIVERSE_LABELS[universe] || universe}.`);
  error.status = quote?.status || 0;
  throw error;
 }
 if (Object.keys(map).length < expectedBreadth) {
  dlog?.(`Market ${quoteResult.action} returned ${Object.keys(map).length}/${expectedBreadth} rows for ${DHAN_SCANNER_UNIVERSE_LABELS[universe] || universe}.`);
 }
 if (subscribeLiveFeed) {
  const liveSymbols = instruments.slice(0, DHAN_INDEX_TAPE_DEFINITIONS.length + DHAN_LIVE_SCANNER_SUBSCRIPTION_LIMIT);
  dhanNative('live_feed_subscribe', { symbols: liveSymbols, mode: 'quote', owner: 'scanner' }).catch(() => {});
 }
 return map;
}

async function dhanFetchCandlesForRenderer(symbol, resolution, startSec, endSec, options = {}) {
 const response = await dhanNative('candles', {
  symbol,
  instrument: options.instrument || options.dhanInstrument || null,
  resolution,
  start: startSec,
  end: endSec,
  force: options.force === true,
  timeoutMs: Math.max(3000, Number(options.timeoutMs || 15000)),
  paceMs: Math.max(0, Number(options.paceMs || 0)),
  failFastOnRateLimit: options.failFastOnRateLimit === true,
 });
 if (!response?.ok) throw new Error(response?.error || 'Market candles unavailable.');
 const rows = (Array.isArray(response.rows) ? response.rows : []).sort((a, b) => a.time - b.time);
 if (!rows.length) {
  const req = response.request || {};
  const chunks = Array.isArray(response.chunks) ? response.chunks : [];
  const range = chunks.length ? `${chunks[0]?.fromDate || '?'} -> ${chunks[chunks.length - 1]?.toDate || '?'}` : 'no returned chunk range';
  dlog?.(`Candle empty ${String(symbol || '').toUpperCase()} ${resolution}: ${req.exchangeSegment || options.instrument?.exchangeSegment || '?'}:${req.securityId || options.instrument?.securityId || '?'} ${range}`);
 }
 return rows;
}

async function dhanBlockOrderPlacement() {
 return { ok: false, status: 403, error: DHAN_ORDER_DISABLED_ERROR };
}

globalThis.dhanNative = dhanNative;
globalThis.dhanFetchProductsForRenderer = dhanFetchProductsForRenderer;
globalThis.dhanFetchTickerMapForRenderer = dhanFetchTickerMapForRenderer;
globalThis.dhanFetchCandlesForRenderer = dhanFetchCandlesForRenderer;
globalThis.dhanBlockOrderPlacement = dhanBlockOrderPlacement;
globalThis.normalizeDhanScannerUniverse = normalizeDhanScannerUniverse;
