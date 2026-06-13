const fs = require('fs/promises');
const path = require('path');

const DHAN_DATA_SECRET = 'dhan:data-api';
const DHAN_API_BASE = 'https://api.dhan.co/v2';
const DHAN_FEED_WS_URL = 'wss://api-feed.dhan.co';
const DHAN_INSTRUMENT_MASTER_URL = 'https://images.dhan.co/api-data/api-scrip-master.csv';
const DHAN_INSTRUMENT_MASTER_DETAILED_URL = 'https://images.dhan.co/api-data/api-scrip-master-detailed.csv';
const NSE_EQUITY_LIST_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';
const NSE_INDEX_CONSTITUENT_SOURCES = Object.freeze({
 nifty500: {
  id: 'nifty500',
  label: 'Nifty 500',
  url: 'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv',
  fallbackOffset: 0,
  fallbackLimit: 500,
 },
 midcap150: {
  id: 'midcap150',
  label: 'Midcap 150',
  url: 'https://www.niftyindices.com/IndexConstituent/ind_niftymidcap150list.csv',
  fallbackOffset: 500,
  fallbackLimit: 150,
 },
 smallcap250: {
  id: 'smallcap250',
  label: 'Smallcap 250',
  url: 'https://www.niftyindices.com/IndexConstituent/ind_niftysmallcap250list.csv',
  fallbackOffset: 650,
  fallbackLimit: 250,
 },
});
const DHAN_SCANNER_UNIVERSE_DEFINITIONS = Object.freeze([
 {
  id: 'fno_stocks',
  label: 'F&O Stocks',
  shortLabel: 'F&O',
  description: 'NSE equity underlyings that have stock futures/options.',
  defaultLimit: 250,
  maxLimit: 600,
  source: 'Instrument master',
 },
 {
  id: 'nifty500',
  label: 'Nifty 500',
  shortLabel: 'Nifty 500',
  description: 'Nifty 500 constituents mapped to NSE_EQ security IDs.',
  defaultLimit: 500,
  maxLimit: 700,
  source: NSE_INDEX_CONSTITUENT_SOURCES.nifty500.url,
 },
 {
  id: 'midcap150',
  label: 'Midcap 150',
  shortLabel: 'Midcap',
  description: 'Nifty Midcap 150 constituents mapped to NSE_EQ security IDs.',
  defaultLimit: 150,
  maxLimit: 250,
  source: NSE_INDEX_CONSTITUENT_SOURCES.midcap150.url,
 },
 {
  id: 'smallcap250',
  label: 'Smallcap 250',
  shortLabel: 'Smallcap',
  description: 'Nifty Smallcap 250 constituents mapped to NSE_EQ security IDs.',
  defaultLimit: 250,
  maxLimit: 400,
  source: NSE_INDEX_CONSTITUENT_SOURCES.smallcap250.url,
 },
 {
  id: 'all_nse',
  label: 'All NSE Equity',
  shortLabel: 'All NSE',
  description: 'All active NSE_EQ equity symbols available in the instrument master. Use chunk scans for regular runs.',
  defaultLimit: 750,
  maxLimit: 3500,
  source: `${DHAN_INSTRUMENT_MASTER_URL} + ${NSE_EQUITY_LIST_URL}`,
 },
 {
  id: 'nse_rest',
  label: 'NSE Rest',
  shortLabel: 'NSE Rest',
  description: 'NSE equity symbols not already covered by F&O, Nifty 500, Midcap 150, or Smallcap 250 memberships.',
  defaultLimit: 650,
  maxLimit: 1200,
  source: 'All NSE Equity minus primary scanner baskets',
 },
 {
  id: 'nse_af',
  label: 'NSE A-F',
  shortLabel: 'NSE A-F',
  description: 'Active NSE equity symbols from A to F for faster rotating scans.',
  defaultLimit: 650,
  maxLimit: 900,
  source: 'All NSE Equity alphabet chunk',
 },
 {
  id: 'nse_gl',
  label: 'NSE G-L',
  shortLabel: 'NSE G-L',
  description: 'Active NSE equity symbols from G to L for faster rotating scans.',
  defaultLimit: 650,
  maxLimit: 900,
  source: 'All NSE Equity alphabet chunk',
 },
 {
  id: 'nse_mr',
  label: 'NSE M-R',
  shortLabel: 'NSE M-R',
  description: 'Active NSE equity symbols from M to R for faster rotating scans.',
  defaultLimit: 650,
  maxLimit: 900,
  source: 'All NSE Equity alphabet chunk',
 },
 {
  id: 'nse_sz',
  label: 'NSE S-Z',
  shortLabel: 'NSE S-Z',
  description: 'Active NSE equity symbols from S to Z for faster rotating scans.',
  defaultLimit: 650,
  maxLimit: 900,
  source: 'All NSE Equity alphabet chunk',
 },
 {
  id: 'all_bse',
  label: 'All BSE Equity',
  shortLabel: 'All BSE',
  description: 'All active BSE_EQ equity symbols available in the instrument master. Use chunk scans for regular runs.',
  defaultLimit: 750,
  maxLimit: 3500,
  source: DHAN_INSTRUMENT_MASTER_URL,
 },
 {
  id: 'bse_only',
  label: 'BSE Only',
  shortLabel: 'BSE Only',
  description: 'BSE_EQ equity symbols whose trading symbol is not present in the NSE equity universe.',
  defaultLimit: 650,
  maxLimit: 1200,
  source: 'All BSE Equity minus NSE symbols',
 },
 {
  id: 'bse_af',
  label: 'BSE A-F',
  shortLabel: 'BSE A-F',
  description: 'Active BSE equity symbols from A to F for faster rotating scans.',
  defaultLimit: 650,
  maxLimit: 900,
  source: 'All BSE Equity alphabet chunk',
 },
 {
  id: 'bse_gl',
  label: 'BSE G-L',
  shortLabel: 'BSE G-L',
  description: 'Active BSE equity symbols from G to L for faster rotating scans.',
  defaultLimit: 650,
  maxLimit: 900,
  source: 'All BSE Equity alphabet chunk',
 },
 {
  id: 'bse_mr',
  label: 'BSE M-R',
  shortLabel: 'BSE M-R',
  description: 'Active BSE equity symbols from M to R for faster rotating scans.',
  defaultLimit: 650,
  maxLimit: 900,
  source: 'All BSE Equity alphabet chunk',
 },
 {
  id: 'bse_sz',
  label: 'BSE S-Z',
  shortLabel: 'BSE S-Z',
  description: 'Active BSE equity symbols from S to Z for faster rotating scans.',
  defaultLimit: 650,
  maxLimit: 900,
  source: 'All BSE Equity alphabet chunk',
 },
 {
  id: 'indices',
  label: 'FWD Indices',
  shortLabel: 'Indices',
  description: 'Live index instruments for the FWD market tape.',
  defaultLimit: 120,
  maxLimit: 250,
  source: `${DHAN_INSTRUMENT_MASTER_URL} IDX_I`,
 },
]);
const DHAN_ORDER_DISABLED_ERROR = 'Order placement is disabled. Use your broker app or web terminal for manual trading.';
const INSTRUMENT_CACHE_FILE = 'dhan-instruments-cache.json';
const COMMODITY_CANDLE_CACHE_FILE = 'dhan-commodity-candle-cache.json';
const COMMODITY_CONTRACT_ARCHIVE_FILE = 'dhan-commodity-contract-archive.json';
const COMMODITY_SPREAD_HISTORY_FILE = 'dhan-commodity-spread-history.json';
const INSTRUMENT_CACHE_VERSION = 5;
const INSTRUMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DHAN_QUOTE_BATCH_SIZE = 1000;
const DHAN_QUOTE_MIN_INTERVAL_MS = 1250;
const DHAN_QUOTE_RATE_LIMIT_BACKOFF_MS = 5000;
const DHAN_QUOTE_MAX_RETRIES = 1;
const DHAN_CANDLE_MIN_INTERVAL_MS = 300;
const DHAN_OPTION_CHAIN_MIN_INTERVAL_MS = 3000;
const DHAN_OPTION_CHAIN_CACHE_TTL_MS = 30000;
const DHAN_OPTION_EXPIRY_CACHE_TTL_MS = 5 * 60 * 1000;
const COMMODITY_ANALYSIS_CACHE_TTL_MS = 15 * 60 * 1000;
const COMMODITY_DAILY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const COMMODITY_INTRADAY_CACHE_TTL_MS = 10 * 60 * 1000;
const COMMODITY_SPREAD_MAX_DAILY_LOOKBACK_DAYS = 120;
const COMMODITY_SPREAD_DAILY_HISTORY_DAYS = 3 * 365;
const COMMODITY_SPREAD_INTRADAY_HISTORY_DAYS = 90;
const COMMODITY_SPREAD_HISTORY_VERSION = 1;
const COMMODITY_SPREAD_MIN_DECISION_CANDLES = 100;
const COMMODITY_SPREAD_FEATURED_UNDERLYINGS = Object.freeze([
 'SILVERMIC',
 'GOLD',
 'GOLDM',
 'SILVER',
 'SILVERM',
 'CRUDEOIL',
 'CRUDEOILM',
 'NATURALGAS',
 'NATGASMINI',
]);
const DHAN_FUTURES_BROKERAGE_PER_ORDER = 20;
const GST_RATE = 0.18;
const DHAN_OPTION_CHAIN_RATE_LIMIT_BACKOFF_MS = 60 * 1000;
const DHAN_LIVE_FEED_MAX_INSTRUMENTS = 5000;
const DHAN_LIVE_FEED_SUBSCRIBE_CHUNK = 100;
const DHAN_LIVE_FEED_RECONNECT_BASE_MS = 1500;
const DHAN_LIVE_FEED_RECONNECT_MAX_MS = 30000;
const DHAN_FEED_REQUEST_CODES = Object.freeze({
 ticker: 15,
 quote: 17,
 full: 21,
 unsubscribe: 16,
 disconnect: 12,
});
const DHAN_FEED_RESPONSE_CODES = Object.freeze({
 ticker: 2,
 quote: 4,
 oi: 5,
 previousClose: 6,
 marketStatus: 7,
 full: 8,
 disconnect: 50,
});
const DHAN_CANDLE_RATE_LIMIT_BACKOFF_MS = 15000;
const DHAN_CANDLE_MAX_RETRIES = 3;
const DHAN_INTRADAY_CHUNK_DAYS = 90;
const DHAN_INTRADAY_MAX_HISTORY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_TIME_ZONE = 'Asia/Kolkata';
const NSE_BSE_EQUITY_HOLIDAYS_2026 = Object.freeze({
 '2026-01-26': 'Republic Day',
 '2026-03-03': 'Holi',
 '2026-03-26': 'Shri Ram Navami',
 '2026-03-31': 'Shri Mahavir Jayanti',
 '2026-04-03': 'Good Friday',
 '2026-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
 '2026-05-01': 'Maharashtra Day',
 '2026-05-28': 'Bakri Id',
 '2026-06-26': 'Muharram',
 '2026-09-14': 'Ganesh Chaturthi',
 '2026-10-02': 'Mahatma Gandhi Jayanti',
 '2026-10-20': 'Dussehra',
 '2026-11-10': 'Diwali Balipratipada',
 '2026-11-24': 'Prakash Gurpurb Sri Guru Nanak Dev',
 '2026-12-25': 'Christmas',
});
const NSE_BSE_SPECIAL_SESSIONS_2026 = Object.freeze({
 '2026-11-08': {
  label: 'Diwali Laxmi Pujan / Muhurat Trading',
  status: 'special_session_pending',
  note: 'Muhurat trading is expected, but final timings must be updated from the exchange circular when published.',
 },
});
const DHAN_INDEX_PRODUCTS = Object.freeze([
 {
  exchange: 'IDX',
  segment: 'IDX',
  exchangeSegment: 'IDX_I',
  symbol: 'NIFTY',
  tradingSymbol: 'NIFTY',
  securityId: '13',
  lotSize: 1,
  expiry: '',
  strike: 0,
  optionType: '',
  instrument: 'INDEX',
  displayName: 'Nifty 50',
  source: 'dhan-index',
  isBenchmark: true,
 },
 {
  exchange: 'IDX',
  segment: 'IDX',
  exchangeSegment: 'IDX_I',
  symbol: 'BANKNIFTY',
  tradingSymbol: 'BANKNIFTY',
  securityId: '25',
  lotSize: 1,
  expiry: '',
  strike: 0,
  optionType: '',
  instrument: 'INDEX',
  displayName: 'Nifty Bank',
  source: 'dhan-index',
 isBenchmark: false,
 },
 {
  exchange: 'IDX',
  segment: 'IDX',
  exchangeSegment: 'IDX_I',
  symbol: 'FINNIFTY',
  tradingSymbol: 'FINNIFTY',
  securityId: '27',
  lotSize: 1,
  expiry: '',
  strike: 0,
  optionType: '',
  instrument: 'INDEX',
  displayName: 'Nifty Financial Services',
  source: 'dhan-index',
  isBenchmark: false,
 },
 {
  exchange: 'IDX',
  segment: 'IDX',
  exchangeSegment: 'IDX_I',
  symbol: 'NIFTYIT',
  tradingSymbol: 'NIFTYIT',
  securityId: '29',
  lotSize: 1,
  expiry: '',
  strike: 0,
  optionType: '',
  instrument: 'INDEX',
  displayName: 'Nifty IT',
  source: 'dhan-index',
  isBenchmark: false,
 },
 {
  exchange: 'IDX',
  segment: 'IDX',
  exchangeSegment: 'IDX_I',
  symbol: 'MIDCPNIFTY',
  tradingSymbol: 'MIDCPNIFTY',
  securityId: '442',
  lotSize: 1,
  expiry: '',
  strike: 0,
  optionType: '',
  instrument: 'INDEX',
  displayName: 'Nifty Midcap Select',
  source: 'dhan-index',
  isBenchmark: false,
 },
 {
  exchange: 'IDX',
  segment: 'IDX',
  exchangeSegment: 'IDX_I',
  symbol: 'NIFTY 500',
  tradingSymbol: 'NIFTY 500',
  securityId: '19',
  lotSize: 1,
  expiry: '',
  strike: 0,
  optionType: '',
  instrument: 'INDEX',
  displayName: 'Nifty 500',
  source: 'dhan-index',
  isBenchmark: false,
 },
]);
const DHAN_SCAN_SYMBOL_PRIORITY = [
 'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'SBIN',
 'LT', 'AXISBANK', 'KOTAKBANK', 'BHARTIARTL', 'ITC', 'HINDUNILVR', 'BAJFINANCE', 'MARUTI', 'M&M',
 'SUNPHARMA', 'TITAN', 'ULTRACEMCO', 'ASIANPAINT', 'NTPC', 'POWERGRID', 'ONGC', 'TATASTEEL', 'JSWSTEEL',
 'ADANIENT', 'ADANIPORTS', 'HCLTECH', 'WIPRO', 'TECHM', 'DRREDDY', 'CIPLA', 'EICHERMOT', 'DIVISLAB',
 'COALINDIA', 'GRASIM', 'APOLLOHOSP', 'HEROMOTOCO', 'TATACONSUM', 'SBILIFE', 'BRITANNIA', 'NESTLEIND',
 'HDFCLIFE', 'BAJAJ-AUTO', 'VEDL', 'HINDALCO', 'BANKBARODA', 'PNB', 'DLF', 'TRENT',
];
const DHAN_SCAN_PRIORITY_RANK = new Map(DHAN_SCAN_SYMBOL_PRIORITY.map((symbol, index) => [symbol, index]));
const MCX_FEATURED_UNDERLYINGS = Object.freeze([
 'GOLD', 'GOLDM', 'SILVER', 'SILVERM', 'SILVERMIC', 'CRUDEOIL', 'CRUDEOILM',
 'NATURALGAS', 'NATGASMINI', 'COPPER', 'ZINC', 'ALUMINIUM', 'LEAD',
]);
const MCX_FEATURED_RANK = new Map(MCX_FEATURED_UNDERLYINGS.map((symbol, index) => [symbol, index]));

function normalizeHeaderName(value = '') {
 return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function splitCsvLine(line = '') {
 const out = [];
 let current = '';
 let quoted = false;
 for (let i = 0; i < line.length; i++) {
  const ch = line[i];
  if (ch === '"') {
   if (quoted && line[i + 1] === '"') {
    current += '"';
    i++;
   } else {
    quoted = !quoted;
   }
  } else if (ch === ',' && !quoted) {
   out.push(current);
   current = '';
  } else {
   current += ch;
  }
 }
 out.push(current);
 return out.map(item => item.trim());
}

function parseCsv(text = '') {
 const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
 if (!lines.length) return [];
 const headers = splitCsvLine(lines[0]).map(normalizeHeaderName);
 return lines.slice(1).map(line => {
  const values = splitCsvLine(line);
  return headers.reduce((row, header, index) => {
   row[header || `col${index}`] = values[index] ?? '';
   return row;
  }, {});
 });
}

function pick(row = {}, names = []) {
 const normalizedRow = Object.entries(row || {}).reduce((out, [key, value]) => {
  out[normalizeHeaderName(key)] = value;
  return out;
 }, {});
 for (const name of names) {
  const key = normalizeHeaderName(name);
  if (normalizedRow[key] != null && String(normalizedRow[key]).trim() !== '') return normalizedRow[key];
 }
 return '';
}

function normalizeUniverseId(value = '') {
 const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
 if (['fno', 'fno_stock', 'fno_stocks', 'f_and_o', 'fo', 'f_o'].includes(raw)) return 'fno_stocks';
 if (['all', 'all_nse', 'nse', 'all_equity', 'all_nse_equity'].includes(raw)) return 'all_nse';
 if (['nse_rest', 'nse_remaining', 'nse_uncovered', 'nse_ex_overlap', 'nse_ex_core'].includes(raw)) return 'nse_rest';
 if (['all_bse', 'bse', 'bse_equity', 'all_bse_equity'].includes(raw)) return 'all_bse';
 if (['bse_only', 'bse_unique', 'bse_ex_nse', 'bse_not_nse'].includes(raw)) return 'bse_only';
 if (['nse_a_f', 'nse_af', 'nse_1', 'nse_chunk_1', 'nse_chunk_af'].includes(raw)) return 'nse_af';
 if (['nse_g_l', 'nse_gl', 'nse_2', 'nse_chunk_2', 'nse_chunk_gl'].includes(raw)) return 'nse_gl';
 if (['nse_m_r', 'nse_mr', 'nse_3', 'nse_chunk_3', 'nse_chunk_mr'].includes(raw)) return 'nse_mr';
 if (['nse_s_z', 'nse_sz', 'nse_4', 'nse_chunk_4', 'nse_chunk_sz'].includes(raw)) return 'nse_sz';
 if (['bse_a_f', 'bse_af', 'bse_1', 'bse_chunk_1', 'bse_chunk_af'].includes(raw)) return 'bse_af';
 if (['bse_g_l', 'bse_gl', 'bse_2', 'bse_chunk_2', 'bse_chunk_gl'].includes(raw)) return 'bse_gl';
 if (['bse_m_r', 'bse_mr', 'bse_3', 'bse_chunk_3', 'bse_chunk_mr'].includes(raw)) return 'bse_mr';
 if (['bse_s_z', 'bse_sz', 'bse_4', 'bse_chunk_4', 'bse_chunk_sz'].includes(raw)) return 'bse_sz';
 if (['idx', 'index', 'indices', 'dhan_indices', 'dhan_index', 'idx_i'].includes(raw)) return 'indices';
 if (['nifty_500', 'nifty500', 'n500'].includes(raw)) return 'nifty500';
 if (['midcap', 'midcap_150', 'midcap150', 'nifty_midcap_150'].includes(raw)) return 'midcap150';
 if (['smallcap', 'smallcap_250', 'smallcap250', 'nifty_smallcap_250'].includes(raw)) return 'smallcap250';
 return raw || 'fno_stocks';
}

function normalizeUniverseSymbol(value = '') {
 return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function getUniverseDefinition(id = '') {
 const safeId = normalizeUniverseId(id);
 return DHAN_SCANNER_UNIVERSE_DEFINITIONS.find(item => item.id === safeId)
  || DHAN_SCANNER_UNIVERSE_DEFINITIONS[0];
}

function normalizeExchangeToken(value = '') {
 const raw = String(value || '').trim().toUpperCase();
 if (['NSE', 'NFO', 'NSEFO', 'NSE_FO', 'NSE_FNO'].includes(raw)) return raw === 'NSE' ? 'NSE' : 'NSE_FNO';
 if (['BSE', 'BFO', 'BSEFO', 'BSE_FO', 'BSE_FNO'].includes(raw)) return raw === 'BSE' ? 'BSE' : 'BSE_FNO';
 if (['IDX', 'INDEX', 'INDICES', 'NSE_INDEX', 'NSE_IDX', 'BSE_INDEX', 'BSE_IDX'].includes(raw)) return 'IDX';
 return raw;
}

function normalizeSegmentToken(value = '') {
 const raw = String(value || '').trim().toUpperCase();
 if (['E', 'EQ', 'EQUITY', 'CASH'].includes(raw)) return 'EQ';
 if (['D', 'FO', 'FNO', 'NFO', 'DERIVATIVE', 'DERIVATIVES'].includes(raw)) return 'FNO';
 if (['C', 'CUR', 'CDS', 'CURRENCY'].includes(raw)) return 'CURRENCY';
 if (['I', 'IDX', 'INDEX', 'INDICES'].includes(raw)) return 'IDX';
 if (['M', 'MCX', 'COMM', 'COMMODITY'].includes(raw)) return 'COMM';
 return raw;
}

function normalizeInstrumentType(value = '', optionType = '') {
 const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
 if (['INDEX', 'IDX', 'INDICES'].includes(raw)) return 'INDEX';
 if (['OPTIDX', 'OPTSTK', 'FUTIDX', 'FUTSTK', 'FUTCOM', 'OPTFUT', 'FUTCUR', 'OPTCUR'].includes(raw)) return raw;
 if (['OPTION', 'OPTIONS'].includes(raw)) return optionType ? 'OPTIDX' : 'OPTSTK';
 if (['FUTURE', 'FUTURES'].includes(raw)) return 'FUTSTK';
 if (['EQUITY', 'EQ', 'STOCK'].includes(raw)) return 'EQUITY';
 return raw || (optionType ? 'OPTIDX' : 'EQUITY');
}

function normalizeExchangeSegment(value = '', exchange = '', segment = '', instrument = '') {
 const raw = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
 if (/^(NSE|BSE)_(EQ|FNO|CURRENCY)$/.test(raw) || raw === 'IDX_I' || raw === 'MCX_COMM') return raw;
 if (['IDX', 'INDEX', 'INDICES', 'NSE_INDEX', 'NSE_IDX', 'BSE_INDEX', 'BSE_IDX'].includes(raw)) return 'IDX_I';
 if (['NFO', 'NSEFO', 'NSE_FO'].includes(raw)) return 'NSE_FNO';
 if (['BFO', 'BSEFO', 'BSE_FO'].includes(raw)) return 'BSE_FNO';
 if (['CDS', 'NSE_CDS', 'NSE_CUR'].includes(raw)) return 'NSE_CURRENCY';
 if (['BCD', 'BSE_CDS', 'BSE_CUR'].includes(raw)) return 'BSE_CURRENCY';
 const ex = String(exchange || '').trim().toUpperCase();
 const normalizedExchange = normalizeExchangeToken(ex);
 const seg = normalizeSegmentToken(segment);
 const type = normalizeInstrumentType(instrument);
 if (type === 'INDEX' || seg === 'IDX' || normalizedExchange === 'IDX') return 'IDX_I';
 if (normalizedExchange === 'MCX' || seg === 'COMM') return 'MCX_COMM';
 if (seg === 'CURRENCY') return normalizedExchange === 'BSE' || normalizedExchange === 'BSE_FNO' ? 'BSE_CURRENCY' : 'NSE_CURRENCY';
 if (normalizedExchange === 'BSE' || normalizedExchange === 'BSE_FNO') return seg === 'FNO' || /^(OPT|FUT)/.test(type) ? 'BSE_FNO' : 'BSE_EQ';
 if (seg === 'FNO' || normalizedExchange === 'NSE_FNO' || /^(OPT|FUT)/.test(type)) return 'NSE_FNO';
 return 'NSE_EQ';
}

function normalizeInstrument(row = {}) {
 const exchange = normalizeExchangeToken(pick(row, ['exchange', 'exch_id', 'exch_id', 'sem_exm_exch_id', 'exm_exchange']));
 const segment = normalizeSegmentToken(pick(row, ['segment', 'segment_name', 'sem_segment', 'sem_segment_code']));
 const symbol = String(pick(row, ['symbol', 'symbol_name', 'sm_symbol_name', 'sem_symbol', 'underlying_symbol']) || '').trim().toUpperCase();
 const tradingSymbol = String(pick(row, ['trading_symbol', 'tradingSymbol', 'sem_trading_symbol', 'display_name', 'sem_custom_symbol']) || symbol).trim().toUpperCase();
 const securityId = String(pick(row, ['security_id', 'securityId', 'sem_smst_security_id']) || '').trim();
 const optionType = String(pick(row, ['option_type', 'optionType', 'sem_option_type']) || '').trim().toUpperCase();
 const strike = Number(pick(row, ['strike', 'strike_price', 'sem_strike_price']) || 0);
 const expiry = String(pick(row, ['expiry', 'expiry_date', 'sem_expiry_date']) || '').trim();
 const instrumentType = normalizeInstrumentType(pick(row, ['instrument', 'instrument_type', 'instrumentType', 'sem_instrument_name']), optionType);
 const exchangeSegment = normalizeExchangeSegment(pick(row, ['exchange_segment', 'exchangeSegment', 'exch_segment']), exchange, segment, instrumentType);
 const underlyingSecurityId = String(pick(row, ['underlying_security_id', 'underlyingSecurityId', 'sem_underlying_security_id']) || '').trim();
 const underlyingSymbol = String(pick(row, ['underlying_symbol', 'underlyingSymbol', 'sem_underlying_symbol']) || '').trim().toUpperCase();
 if (!securityId || !tradingSymbol || !(/^(NSE|BSE|IDX|MCX)_/.test(exchangeSegment))) return null;
 return {
  exchange: exchange || exchangeSegment.split('_')[0],
  segment: segment || exchangeSegment,
  exchangeSegment,
  symbol: symbol || tradingSymbol,
  tradingSymbol,
  securityId,
  lotSize: Number(pick(row, ['lot_size', 'lotSize', 'sem_lot_units']) || 1) || 1,
  expiry,
  strike: Number.isFinite(strike) ? strike : 0,
  optionType,
  instrument: instrumentType,
  series: String(pick(row, ['series', 'sem_series']) || '').trim().toUpperCase(),
  sector: String(pick(row, ['sector', 'industry', 'industry_name', 'sem_sector', 'sem_industry']) || '').trim(),
  buySellIndicator: String(pick(row, ['buy_sell_indicator']) || '').trim().toUpperCase(),
  underlyingSecurityId,
  underlyingSymbol,
 };
}

function compactInstrument(item = {}) {
 if (!item || typeof item !== 'object') return null;
 const securityId = String(item.securityId || '').trim();
 const tradingSymbol = String(item.tradingSymbol || item.symbol || '').trim().toUpperCase();
 if (!securityId || !tradingSymbol) return null;
 return {
  exchange: String(item.exchange || '').trim().toUpperCase(),
  segment: String(item.segment || '').trim().toUpperCase(),
  exchangeSegment: String(item.exchangeSegment || '').trim().toUpperCase(),
  symbol: String(item.symbol || tradingSymbol).trim().toUpperCase(),
  tradingSymbol,
  securityId,
  lotSize: Number(item.lotSize || 1) || 1,
  expiry: String(item.expiry || '').trim(),
  strike: Number(item.strike || 0) || 0,
  optionType: String(item.optionType || '').trim().toUpperCase(),
  instrument: String(item.instrument || '').trim().toUpperCase(),
  series: String(item.series || '').trim().toUpperCase(),
  sector: String(item.sector || '').trim(),
  buySellIndicator: String(item.buySellIndicator || '').trim().toUpperCase(),
  underlyingSecurityId: String(item.underlyingSecurityId || '').trim(),
  underlyingSymbol: String(item.underlyingSymbol || '').trim().toUpperCase(),
  fnoStock: !!item.fnoStock,
  universe: item.universe || undefined,
  displayName: item.displayName || undefined,
  source: item.source || undefined,
  universeTags: Array.isArray(item.universeTags) ? item.universeTags.map(normalizeUniverseId).filter(Boolean) : undefined,
  isBenchmark: !!item.isBenchmark,
 };
}

function compactUniverseCatalog(catalog = {}) {
 const memberships = {};
 Object.entries(catalog.memberships || {}).forEach(([id, values]) => {
  const safeId = normalizeUniverseId(id);
  const list = Array.isArray(values) ? values.map(value => String(value || '').trim()).filter(Boolean) : [];
  if (safeId && list.length) memberships[safeId] = Array.from(new Set(list));
 });
 const counts = Object.entries(memberships).reduce((out, [id, values]) => {
  out[id] = values.length;
  return out;
 }, {});
 const sourceStatus = Object.entries(catalog.sourceStatus || {}).reduce((out, [id, status]) => {
  out[normalizeUniverseId(id)] = {
   ok: status?.ok !== false,
   count: Number(status?.count || 0),
   url: String(status?.url || ''),
   error: String(status?.error || ''),
   fallback: !!status?.fallback,
  };
  return out;
 }, {});
 const definitions = DHAN_SCANNER_UNIVERSE_DEFINITIONS.map(definition => ({
  ...definition,
  count: counts[definition.id] || 0,
  available: (counts[definition.id] || 0) > 0,
  sourceStatus: sourceStatus[definition.id] || null,
 }));
 return {
  version: 1,
  fetchedAt: Number(catalog.fetchedAt || Date.now()),
  definitions,
  memberships,
  counts,
  sourceStatus,
 };
}

function compactInstrumentCache(cache = {}) {
 const instruments = (Array.isArray(cache.instruments) ? cache.instruments : []).map(compactInstrument).filter(Boolean);
 const bySecurityId = new Map(instruments.map(item => [String(item.securityId || ''), item]));
 const fnoStockUniverse = (Array.isArray(cache.fnoStockUniverse) ? cache.fnoStockUniverse : [])
 .map(item => {
  const base = bySecurityId.get(String(item.securityId || '')) || compactInstrument(item);
  return base ? { ...base, fnoStock: true, universe: 'FNO_STOCK' } : null;
 })
 .filter(Boolean);
 return {
  version: INSTRUMENT_CACHE_VERSION,
  source: cache.source || DHAN_INSTRUMENT_MASTER_URL,
  detailedSource: cache.detailedSource || DHAN_INSTRUMENT_MASTER_DETAILED_URL,
  fetchedAt: Number(cache.fetchedAt || Date.now()),
  instruments,
  fnoStockUniverse,
  fnoUnderlyingIds: Array.isArray(cache.fnoUnderlyingIds) ? cache.fnoUnderlyingIds.map(String).filter(Boolean) : fnoStockUniverse.map(item => String(item.securityId || '')).filter(Boolean),
  universeCatalog: compactUniverseCatalog(cache.universeCatalog || {}),
 };
}

function isDhanFnoStockDerivativeRow(row = {}) {
 const exchange = String(pick(row, ['exch_id', 'exchange']) || '').trim().toUpperCase();
 const segment = normalizeSegmentToken(pick(row, ['segment', 'segment_name']));
 const instrument = normalizeInstrumentType(pick(row, ['instrument', 'instrument_type']));
 const underlyingId = String(pick(row, ['underlying_security_id']) || '').trim();
 const underlyingSymbol = String(pick(row, ['underlying_symbol']) || '').trim().toUpperCase();
 return exchange === 'NSE'
  && segment === 'FNO'
  && ['FUTSTK', 'OPTSTK'].includes(instrument)
  && underlyingId
  && !/NSETEST/.test(underlyingSymbol);
}

function buildFnoStockUniverse(instruments = [], detailedRows = []) {
 const fnoUnderlyingIds = new Set(
  (Array.isArray(detailedRows) ? detailedRows : [])
  .filter(isDhanFnoStockDerivativeRow)
  .map(row => String(pick(row, ['underlying_security_id']) || '').trim())
  .filter(Boolean)
 );
 const fnoStocks = (Array.isArray(instruments) ? instruments : [])
 .filter(item => (
  item.exchangeSegment === 'NSE_EQ'
  && item.instrument === 'EQUITY'
  && (!item.series || item.series === 'EQ')
  && fnoUnderlyingIds.has(String(item.securityId || ''))
 ))
 .map(item => ({ ...item, fnoStock: true, universe: 'FNO_STOCK' }))
 .sort((a, b) => {
  const ar = rankInstrumentForScanner(a);
  const br = rankInstrumentForScanner(b);
  if (ar !== br) return ar - br;
  return String(a.tradingSymbol || a.symbol || '').localeCompare(String(b.tradingSymbol || b.symbol || ''));
 });
 return { fnoUnderlyingIds: Array.from(fnoUnderlyingIds), fnoStocks };
}

function parseDerivativeExpiryMs(expiry = '') {
 const raw = String(expiry || '').trim();
 if (!raw) return 0;
 const parsed = Date.parse(raw.replace(' ', 'T'));
 return Number.isFinite(parsed) ? parsed : 0;
}

function buildFnoCarryContracts(instruments = [], fnoStockUniverse = [], nowMs = Date.now()) {
 const spots = new Map((Array.isArray(fnoStockUniverse) ? fnoStockUniverse : [])
  .filter(isNseEquityInstrument)
  .map(item => [String(item.securityId || ''), item]));
 const spotsBySymbol = new Map();
 Array.from(spots.values()).forEach(item => {
  [item.tradingSymbol, item.symbol].forEach(value => {
   const symbol = String(value || '').trim().toUpperCase();
   if (symbol) spotsBySymbol.set(symbol, item);
  });
 });
 const contractsByUnderlying = new Map();
 (Array.isArray(instruments) ? instruments : []).forEach(item => {
  const exchangeSegment = String(item.exchangeSegment || '').trim().toUpperCase();
  const instrument = String(item.instrument || '').trim().toUpperCase();
  const underlyingSecurityId = String(item.underlyingSecurityId || '').trim();
  const expiryMs = parseDerivativeExpiryMs(item.expiry);
  const name = `${item.symbol || ''} ${item.tradingSymbol || ''} ${item.underlyingSymbol || ''}`.toUpperCase();
  if (exchangeSegment !== 'NSE_FNO' || instrument !== 'FUTSTK') return;
  if (/NSETEST/.test(name)) return;
  if (!(expiryMs > Number(nowMs || 0))) return;
  const spot = spots.get(underlyingSecurityId) || Array.from(spotsBySymbol.entries())
   .find(([symbol]) => String(item.tradingSymbol || '').toUpperCase().startsWith(`${symbol}-`))?.[1];
  if (!spot) return;
  const securityId = String(spot.securityId || '').trim();
  const list = contractsByUnderlying.get(securityId) || [];
  list.push({ ...item, expiryMs });
  contractsByUnderlying.set(securityId, list);
 });
 return Array.from(contractsByUnderlying.entries()).map(([underlyingSecurityId, futures]) => {
  futures.sort((a, b) => a.expiryMs - b.expiryMs);
  return {
   underlyingSecurityId,
   spot: spots.get(underlyingSecurityId),
   nearFuture: futures[0],
   nextFuture: futures[1] || null,
  };
 }).sort((a, b) => rankInstrumentForScanner(a.spot) - rankInstrumentForScanner(b.spot));
}

function buildCommodityFuturePairs(instruments = [], nowMs = Date.now()) {
 const contractsByUnderlying = new Map();
 (Array.isArray(instruments) ? instruments : []).forEach(item => {
  const exchangeSegment = String(item.exchangeSegment || '').trim().toUpperCase();
  const instrument = String(item.instrument || '').trim().toUpperCase();
  const expiryMs = parseDerivativeExpiryMs(item.expiry);
  if (exchangeSegment !== 'MCX_COMM' || instrument !== 'FUTCOM' || !(expiryMs > Number(nowMs || 0))) return;
  const underlying = String(item.underlyingSymbol || item.symbol || '').trim().toUpperCase();
  if (!underlying) return;
  const rows = contractsByUnderlying.get(underlying) || [];
  rows.push({ ...item, expiryMs });
  contractsByUnderlying.set(underlying, rows);
 });
 return Array.from(contractsByUnderlying.entries()).map(([underlying, futures]) => {
  futures.sort((a, b) => a.expiryMs - b.expiryMs);
  return {
   symbol: underlying,
   nearFuture: futures[0],
   nextFuture: futures[1] || null,
   futures,
   expiryCount: futures.length,
  };
 }).sort((a, b) => {
  const ar = MCX_FEATURED_RANK.has(a.symbol) ? MCX_FEATURED_RANK.get(a.symbol) : 999;
  const br = MCX_FEATURED_RANK.has(b.symbol) ? MCX_FEATURED_RANK.get(b.symbol) : 999;
  return ar - br || a.symbol.localeCompare(b.symbol);
 });
}

const MCX_PRICE_MULTIPLIERS = Object.freeze({
 GOLD: 100,
 GOLDM: 10,
 SILVER: 30,
 SILVERM: 5,
 SILVERMIC: 1,
 CRUDEOIL: 100,
 CRUDEOILM: 10,
 NATURALGAS: 1250,
 NATGASMINI: 250,
});

const MCX_MATCHED_SPREAD_FAMILIES = Object.freeze([
 ['GOLD', 'GOLDM'],
 ['SILVER', 'SILVERM', 'SILVERMIC'],
 ['CRUDEOIL', 'CRUDEOILM'],
 ['NATURALGAS', 'NATGASMINI'],
]);

function commodityPriceMultiplier(instrument = {}) {
 const symbol = String(instrument.underlyingSymbol || instrument.symbol || '').trim().toUpperCase();
 const known = Object.prototype.hasOwnProperty.call(MCX_PRICE_MULTIPLIERS, symbol);
 return {
  symbol,
  multiplier: known ? MCX_PRICE_MULTIPLIERS[symbol] : 1,
  known,
 };
}

function commodityMatchedLotRatio(firstInstrument = {}, secondInstrument = {}) {
 const first = commodityPriceMultiplier(firstInstrument);
 const second = commodityPriceMultiplier(secondInstrument);
 if (!(first.multiplier > 0) || !(second.multiplier > 0)) return { firstLots: 1, secondLots: 1, matched: false };
 const larger = Math.max(first.multiplier, second.multiplier);
 const smaller = Math.min(first.multiplier, second.multiplier);
 const ratio = larger / smaller;
 if (!Number.isInteger(ratio) || ratio > 100) return { firstLots: 1, secondLots: 1, matched: false };
 return {
  firstLots: first.multiplier === larger ? 1 : ratio,
  secondLots: second.multiplier === larger ? 1 : ratio,
  matched: true,
 };
}

function buildCommoditySpreadPairs(commodityPairs = []) {
 const primaryCalendarRows = [];
 const extendedCalendarRows = [];
 const matchedRows = [];
 const bySymbol = new Map((Array.isArray(commodityPairs) ? commodityPairs : []).map(pair => [String(pair.symbol || '').toUpperCase(), pair]));
 (Array.isArray(commodityPairs) ? commodityPairs : []).forEach(pair => {
  const futures = Array.isArray(pair.futures) ? pair.futures : [pair.nearFuture, pair.nextFuture].filter(Boolean);
  for (let nearIndex = 0; nearIndex < futures.length; nearIndex += 1) {
   for (let farIndex = nearIndex + 1; farIndex < futures.length; farIndex += 1) {
    const nearInstrument = futures[nearIndex];
    const farInstrument = futures[farIndex];
    const target = nearIndex === 0 && farIndex === 1 ? primaryCalendarRows : extendedCalendarRows;
    target.push({
     key: `calendar:${nearInstrument.securityId}:${farInstrument.securityId}`,
     type: 'calendar',
     family: pair.symbol,
     label: `${pair.symbol} ${nearIndex === 0 && farIndex === 1 ? 'near / next' : 'calendar'}`,
     firstInstrument: nearInstrument,
     secondInstrument: farInstrument,
     firstRole: 'near',
     secondRole: 'far',
     firstLots: 1,
     secondLots: 1,
     canonicalLabel: 'Far - Near',
    });
   }
  }
 });
 MCX_MATCHED_SPREAD_FAMILIES.forEach(family => {
  for (let firstIndex = 0; firstIndex < family.length; firstIndex += 1) {
   for (let secondIndex = firstIndex + 1; secondIndex < family.length; secondIndex += 1) {
    const firstPair = bySymbol.get(family[firstIndex]);
    const secondPair = bySymbol.get(family[secondIndex]);
    if (!firstPair || !secondPair) continue;
    const secondByExpiry = new Map((secondPair.futures || []).map(instrument => [String(instrument.expiry || ''), instrument]));
    (firstPair.futures || []).forEach(firstInstrument => {
     const secondInstrument = secondByExpiry.get(String(firstInstrument.expiry || ''));
     if (!secondInstrument) return;
     const ratio = commodityMatchedLotRatio(firstInstrument, secondInstrument);
     if (!ratio.matched) return;
     matchedRows.push({
      key: `matched:${firstInstrument.securityId}:${secondInstrument.securityId}`,
      type: 'matched',
      family: `${family[firstIndex]} / ${family[secondIndex]}`,
      label: `${family[firstIndex]} / ${family[secondIndex]} matched`,
      firstInstrument,
      secondInstrument,
      firstRole: family[firstIndex],
      secondRole: family[secondIndex],
      firstLots: ratio.firstLots,
      secondLots: ratio.secondLots,
      canonicalLabel: `${family[secondIndex]} - ${family[firstIndex]}`,
     });
    });
   }
  }
 });
 return [...primaryCalendarRows, ...matchedRows, ...extendedCalendarRows];
}

function buildCommoditySpreadCandles(firstRows = [], secondRows = []) {
 const secondByTime = new Map((Array.isArray(secondRows) ? secondRows : []).map(row => [Number(row.time), row]));
 return (Array.isArray(firstRows) ? firstRows : []).map(first => {
  const second = secondByTime.get(Number(first.time));
  if (!second) return null;
  const firstOpen = Number(first.open || 0);
  const firstHigh = Number(first.high || 0);
  const firstLow = Number(first.low || 0);
  const firstClose = Number(first.close || 0);
  const secondOpen = Number(second.open || 0);
  const secondHigh = Number(second.high || 0);
  const secondLow = Number(second.low || 0);
  const secondClose = Number(second.close || 0);
  if (![firstOpen, firstHigh, firstLow, firstClose, secondOpen, secondHigh, secondLow, secondClose].every(Number.isFinite)) return null;
  return {
   time: Number(first.time),
   open: +(secondOpen - firstOpen).toFixed(4),
   high: +(secondHigh - firstLow).toFixed(4),
   low: +(secondLow - firstHigh).toFixed(4),
   close: +(secondClose - firstClose).toFixed(4),
   volume: Math.min(Number(first.volume || 0), Number(second.volume || 0)),
 };
 }).filter(Boolean).sort((a, b) => a.time - b.time);
}

function buildCommoditySpreadClosePoints(firstRows = [], secondRows = []) {
 const firstByTime = new Map((Array.isArray(firstRows) ? firstRows : [])
  .filter(row => Number.isFinite(Number(row?.time)))
  .map(row => [Number(row.time), row]));
 const secondByTime = new Map((Array.isArray(secondRows) ? secondRows : []).map(row => [Number(row.time), row]));
 return [...firstByTime.values()].map(first => {
  const second = secondByTime.get(Number(first.time));
  if (!second) return null;
  const firstClose = Number(first.close);
  const secondClose = Number(second.close);
  if (!Number.isFinite(firstClose) || !Number.isFinite(secondClose)) return null;
  const close = +(secondClose - firstClose).toFixed(4);
  return {
   time: Number(first.time),
   open: close,
   high: close,
   low: close,
   close,
   value: close,
   volume: Math.min(Number(first.volume || 0), Number(second.volume || 0)),
   firstVolume: Number(first.volume || 0),
   secondVolume: Number(second.volume || 0),
   firstOi: Number(first.oi || 0),
   secondOi: Number(second.oi || 0),
  };
 }).filter(Boolean).sort((a, b) => a.time - b.time);
}

function buildCommoditySynchronizedSpreadCandles(firstRows = [], secondRows = [], bucketSeconds = 3600) {
 const firstByTime = new Map((Array.isArray(firstRows) ? firstRows : [])
  .filter(row => Number.isFinite(Number(row?.time)))
  .map(row => [Number(row.time), row]));
 const secondByTime = new Map((Array.isArray(secondRows) ? secondRows : []).map(row => [Number(row.time), row]));
 const observations = [...firstByTime.values()].map(first => {
  const second = secondByTime.get(Number(first.time));
  if (!second) return null;
  const firstClose = Number(first.close);
  const secondClose = Number(second.close);
  if (!Number.isFinite(firstClose) || !Number.isFinite(secondClose)) return null;
  return {
   time: Number(first.time),
   close: +(secondClose - firstClose).toFixed(4),
   volume: Math.min(Number(first.volume || 0), Number(second.volume || 0)),
  };
 }).filter(Boolean).sort((a, b) => a.time - b.time);
 const buckets = new Map();
 observations.forEach(row => {
  const time = Math.floor(Number(row.time) / bucketSeconds) * bucketSeconds;
  const active = buckets.get(time);
  if (!active) {
   buckets.set(time, {
    time,
    open: row.close,
    high: row.close,
    low: row.close,
    close: row.close,
    volume: row.volume,
    synchronizedObservations: 1,
   });
   return;
  }
  active.high = Math.max(active.high, row.close);
  active.low = Math.min(active.low, row.close);
  active.close = row.close;
  active.volume += row.volume;
  active.synchronizedObservations += 1;
 });
 return [...buckets.values()]
  .filter(row => row.synchronizedObservations > 0)
  .sort((a, b) => a.time - b.time);
}

function commoditySpreadEma(values = [], period = 20) {
 const rows = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
 if (rows.length < period) return null;
 const multiplier = 2 / (period + 1);
 let current = rows.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
 rows.slice(period).forEach(value => { current = ((value - current) * multiplier) + current; });
 return current;
}

function commoditySpreadStats(rows = [], lookback = 60) {
 const closes = (Array.isArray(rows) ? rows : []).map(row => Number(row.close)).filter(Number.isFinite);
 if (!closes.length) return null;
 const sample = closes.slice(-Math.max(20, Number(lookback || 60)));
 const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
 const variance = sample.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / sample.length;
 const deviation = Math.sqrt(variance);
 const latest = closes[closes.length - 1];
 const sorted = sample.slice().sort((a, b) => a - b);
 const percentile = sorted.length > 1
  ? sorted.filter(value => value <= latest).length / sorted.length * 100
  : 50;
 const trueRanges = rows.map((row, index) => {
  const high = Number(row.high);
  const low = Number(row.low);
  const previous = Number(rows[index - 1]?.close);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  return index === 0 || !Number.isFinite(previous)
   ? high - low
   : Math.max(high - low, Math.abs(high - previous), Math.abs(low - previous));
 }).filter(value => Number.isFinite(value) && value >= 0);
 const atrRows = trueRanges.slice(-14);
 const atr14 = atrRows.length ? atrRows.reduce((sum, value) => sum + value, 0) / atrRows.length : 0;
 const recentChanges = closes.slice(-7).slice(1).map((value, index) => value - closes.slice(-7)[index]);
 return {
  latest,
  mean,
  deviation,
  zScore: deviation > 0 ? (latest - mean) / deviation : 0,
  percentile,
  ema9: commoditySpreadEma(closes, 9),
  ema30: commoditySpreadEma(closes, 30),
  ema100: commoditySpreadEma(closes, 100),
  atr14,
  momentum5: closes.length >= 6 ? latest - closes[closes.length - 6] : 0,
  risingSessions: recentChanges.filter(value => value > 0).length,
  fallingSessions: recentChanges.filter(value => value < 0).length,
  previous: closes.length >= 2 ? closes[closes.length - 2] : latest,
  count: closes.length,
 };
}

function buildCommoditySpreadBands(rows = [], period = 60) {
 const closes = (Array.isArray(rows) ? rows : []).map(row => Number(row.close));
 const mean = new Array(closes.length).fill(null);
 const upper1 = new Array(closes.length).fill(null);
 const lower1 = new Array(closes.length).fill(null);
 const upper2 = new Array(closes.length).fill(null);
 const lower2 = new Array(closes.length).fill(null);
 const zScore = new Array(closes.length).fill(null);
 for (let index = period - 1; index < closes.length; index += 1) {
  const sample = closes.slice(index - period + 1, index + 1).filter(Number.isFinite);
  if (sample.length < period) continue;
  const average = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const variance = sample.reduce((sum, value) => sum + ((value - average) ** 2), 0) / sample.length;
  const deviation = Math.sqrt(variance);
  mean[index] = average;
  upper1[index] = average + deviation;
  lower1[index] = average - deviation;
  upper2[index] = average + deviation * 2;
  lower2[index] = average - deviation * 2;
  zScore[index] = deviation > 0 ? (closes[index] - average) / deviation : 0;
 }
 return { mean, upper1, lower1, upper2, lower2, zScore };
}

function buildCommoditySpreadRollEvents(points = [], pair = {}) {
 const rows = Array.isArray(points) ? points : [];
 const events = [];
 let oiCrossoverStreak = 0;
 let volumeCrossoverStreak = 0;
 rows.forEach((row, index) => {
  const firstOi = Number(row.firstOi || 0);
  const secondOi = Number(row.secondOi || 0);
  const firstVolume = Number(row.firstVolume || 0);
  const secondVolume = Number(row.secondVolume || 0);
  oiCrossoverStreak = firstOi > 0 && secondOi > firstOi ? oiCrossoverStreak + 1 : 0;
  volumeCrossoverStreak = !(firstOi > 0 && secondOi > 0) && secondVolume > firstVolume ? volumeCrossoverStreak + 1 : 0;
  if (oiCrossoverStreak === 2 || volumeCrossoverStreak === 2) {
   events.push({
    time: Number(row.time),
    type: oiCrossoverStreak === 2 ? 'liquidity_oi' : 'liquidity_volume',
    label: oiCrossoverStreak === 2 ? 'OI liquidity roll signal' : 'Volume liquidity roll signal',
    sourceQuality: 'dhan_rolling_expiry_code',
   });
  }
 });
 const firstExpiryMs = parseDerivativeExpiryMs(pair.firstInstrument?.expiry);
 if (firstExpiryMs > 0) {
  const forcedTime = Math.floor((firstExpiryMs - 5 * DAY_MS) / 1000);
  const nearest = rows.find(row => Number(row.time) >= forcedTime);
  if (nearest && !events.some(event => Math.abs(event.time - Number(nearest.time)) < 3 * DAY_MS / 1000)) {
   events.push({
    time: Number(nearest.time),
    type: 'expiry_fallback',
    label: 'Five-day expiry roll fallback',
    sourceQuality: 'exact_active_contract',
   });
  }
 }
 return events.sort((a, b) => a.time - b.time);
}

function buildCommoditySpreadDecision({
 dailyRows = [],
 intradayRows = [],
 pair = {},
 snapshot = {},
 minimumHistory = COMMODITY_SPREAD_MIN_DECISION_CANDLES,
} = {}) {
 const daily = commoditySpreadStats(dailyRows, 60);
 const intraday = commoditySpreadStats(intradayRows, 30);
 const blockers = [];
 if (!daily || daily.count < minimumHistory) blockers.push(`At least ${minimumHistory} matched daily spread closes are required.`);
 const separation = daily
  ? Math.min(Math.abs(Number(daily.ema9) - Number(daily.ema30)), Math.abs(Number(daily.ema30) - Number(daily.ema100)))
  : 0;
 const meaningfulSeparation = daily
  ? separation >= Math.max(Number(daily.atr14 || 0) * 0.1, Math.abs(Number(daily.latest || 0)) * 0.001)
  : false;
 const trendUp = !!daily && [daily.ema9, daily.ema30, daily.ema100].every(Number.isFinite)
  && daily.latest >= daily.ema9 && daily.ema9 > daily.ema30 && daily.ema30 > daily.ema100
  && daily.momentum5 > 0 && daily.risingSessions >= 4 && meaningfulSeparation;
 const trendDown = !!daily && [daily.ema9, daily.ema30, daily.ema100].every(Number.isFinite)
  && daily.latest <= daily.ema9 && daily.ema9 < daily.ema30 && daily.ema30 < daily.ema100
  && daily.momentum5 < 0 && daily.fallingSessions >= 4 && meaningfulSeparation;
 const regime = trendUp || trendDown ? 'trend' : 'range';
 const intradayUp = !!intraday && intraday.count >= 9 && intraday.latest > intraday.previous && intraday.momentum5 > 0;
 const intradayDown = !!intraday && intraday.count >= 9 && intraday.latest < intraday.previous && intraday.momentum5 < 0;
 let action = 'WAIT';
 let reason = 'No trend or mean-reversion trigger is confirmed.';
 if (regime === 'trend' && trendUp && intradayUp) {
  action = 'BUY_SPREAD';
  reason = 'Daily spread trend is widening and synchronized 60-minute momentum confirms.';
 } else if (regime === 'trend' && trendDown && intradayDown) {
  action = 'SELL_SPREAD';
  reason = 'Daily spread trend is narrowing and synchronized 60-minute momentum confirms.';
 } else if (regime === 'range' && daily?.zScore <= -1.5 && intradayUp) {
  action = 'BUY_SPREAD';
  reason = 'Spread is unusually narrow and synchronized 60-minute prices are reversing upward.';
 } else if (regime === 'range' && daily?.zScore >= 1.5 && intradayDown) {
  action = 'SELL_SPREAD';
  reason = 'Spread is unusually wide and synchronized 60-minute prices are reversing downward.';
 }
 if (!intraday || intraday.count < 9) blockers.push('Synchronized 60-minute confirmation is not available yet.');
 const safeguards = snapshot.safeguards || commoditySpreadSafeguards(pair, snapshot);
 blockers.push(...(safeguards.warnings || []));
 const costs = snapshot.costs || commoditySpreadCostEstimate(pair, snapshot);
 const entry = action === 'BUY_SPREAD'
  ? Number(snapshot.wideningEntrySpread)
  : action === 'SELL_SPREAD'
   ? Number(snapshot.narrowingEntrySpread)
   : Number(snapshot.spread ?? daily?.latest);
 if (action === 'BUY_SPREAD' && !snapshot.wideningDepth) blockers.push('Executable depth is incomplete for BUY far / SELL near.');
 if (action === 'SELL_SPREAD' && !snapshot.narrowingDepth) blockers.push('Executable depth is incomplete for SELL far / BUY near.');
 const atr = Math.max(Number(daily?.atr14 || 0), Number(daily?.deviation || 0) * 0.25);
 const mean = Number(daily?.mean || entry || 0);
 const deviation = Number(daily?.deviation || 0);
 const trendTarget = action === 'BUY_SPREAD' ? entry + atr * 2 : action === 'SELL_SPREAD' ? entry - atr * 2 : null;
 const target = action === 'WAIT' ? null : regime === 'range' ? mean : trendTarget;
 const zBoundary = action === 'BUY_SPREAD'
  ? mean - deviation * 2.5
  : action === 'SELL_SPREAD'
   ? mean + deviation * 2.5
   : null;
 const atrStop = action === 'BUY_SPREAD' ? entry - atr : action === 'SELL_SPREAD' ? entry + atr : null;
 const stop = action === 'BUY_SPREAD'
  ? Math.max(Number(zBoundary), Number(atrStop))
  : action === 'SELL_SPREAD'
   ? Math.min(Number(zBoundary), Number(atrStop))
   : null;
 const targetMove = target == null || !Number.isFinite(entry) ? 0 : Math.abs(target - entry);
 const slippage = action === 'BUY_SPREAD'
  ? Number(costs.wideningSlippagePoints || 0)
  : action === 'SELL_SPREAD'
   ? Number(costs.narrowingSlippagePoints || 0)
   : 0;
 const costRequiredMove = (Number(costs.brokerageBreakevenPoints || 0) + slippage) * 1.1;
 const costEdgeAvailable = action !== 'WAIT' && targetMove > costRequiredMove;
 if (action !== 'WAIT' && !costEdgeAvailable) blockers.push('Expected target does not clear brokerage, GST, visible slippage, and the safety buffer.');
 if (blockers.length) action = 'WAIT';
 if (action === 'WAIT' && !blockers.length) blockers.push(reason);
 const valuePerPoint = Number(costs.valuePerSpreadPoint || 0);
 const expectedGrossPnl = targetMove * valuePerPoint;
 const expectedNetPnl = Math.max(0, expectedGrossPnl - Number(costs.fixedBrokerageAndGst || 0) - slippage * valuePerPoint);
 const rawConfidence = daily
  ? Math.min(100, Math.round(
   Math.min(35, daily.count / minimumHistory * 35)
   + (intraday?.count >= 30 ? 25 : intraday?.count >= 9 ? 15 : 0)
   + (regime === 'trend' ? meaningfulSeparation ? 25 : 10 : Math.min(25, Math.abs(daily.zScore) * 12))
   + (snapshot.depthConfirmed ? 15 : 0)
  ))
  : 0;
 return {
  action,
  regime,
  confidence: rawConfidence >= 75 ? 'high' : rawConfidence >= 50 ? 'medium' : 'low',
  confidenceScore: rawConfidence,
  reason,
  blockers: Array.from(new Set(blockers)),
  zScore: daily ? +daily.zScore.toFixed(2) : null,
  percentile: daily ? +daily.percentile.toFixed(1) : null,
  mean: daily ? +daily.mean.toFixed(4) : null,
  deviation: daily ? +daily.deviation.toFixed(4) : null,
  ema9: daily?.ema9 == null ? null : +daily.ema9.toFixed(4),
  ema30: daily?.ema30 == null ? null : +daily.ema30.toFixed(4),
  ema100: daily?.ema100 == null ? null : +daily.ema100.toFixed(4),
  atr14: daily ? +daily.atr14.toFixed(4) : null,
  entry: Number.isFinite(entry) ? +entry.toFixed(4) : null,
  stop: stop == null || !Number.isFinite(stop) ? null : +stop.toFixed(4),
  target: target == null || !Number.isFinite(target) ? null : +target.toFixed(4),
  targetMove: +targetMove.toFixed(4),
  costRequiredMove: +costRequiredMove.toFixed(4),
  costEdgeAvailable,
  expectedGrossPnl: +expectedGrossPnl.toFixed(2),
  expectedNetPnl: +expectedNetPnl.toFixed(2),
  breakevenPoints: costs.brokerageBreakevenPoints ?? null,
  legs: action === 'BUY_SPREAD'
   ? { first: 'SELL', second: 'BUY', label: `BUY ${pair.secondRole || 'far'} / SELL ${pair.firstRole || 'near'}` }
   : action === 'SELL_SPREAD'
    ? { first: 'BUY', second: 'SELL', label: `SELL ${pair.secondRole || 'far'} / BUY ${pair.firstRole || 'near'}` }
    : { first: '', second: '', label: 'WAIT' },
  dailyCandles: daily?.count || 0,
  intradayCandles: intraday?.count || 0,
 };
}

function filterCandleRowsByTime(rows = [], startMs = 0, endMs = Date.now()) {
 const startSec = Math.floor(Math.max(0, Number(startMs || 0)) / 1000);
 const endSec = Math.ceil(Math.max(Number(startMs || 0), Number(endMs || Date.now())) / 1000);
 return (Array.isArray(rows) ? rows : []).filter(row => {
  const time = Number(row?.time || 0);
  return Number.isFinite(time) && time >= startSec && time <= endSec;
 });
}

function commoditySpreadHistoryWindow(pair = {}, resolution = '1d', requestedStart = 0, requestedEnd = Date.now()) {
 const end = Number(requestedEnd || Date.now()) || Date.now();
 let start = Number(requestedStart || 0) || (end - 730 * DAY_MS);
 if (String(resolution || '1d').toLowerCase() !== '1d') return { start, end };
 const expiryTimes = [pair.firstInstrument?.expiry, pair.secondInstrument?.expiry]
  .map(parseDerivativeExpiryMs)
  .filter(value => value > 0);
 const frontExpiryMs = expiryTimes.length ? Math.min(...expiryTimes) : 0;
 if (frontExpiryMs > 0) {
  start = Math.max(start, frontExpiryMs - (COMMODITY_SPREAD_MAX_DAILY_LOOKBACK_DAYS * DAY_MS));
 }
 return { start, end };
}

function clipCommoditySpreadRowsForPair(pair = {}, firstRows = [], secondRows = [], resolution = '1d', requestedStart = 0, requestedEnd = Date.now()) {
 const window = commoditySpreadHistoryWindow(pair, resolution, requestedStart, requestedEnd);
 const firstClipped = filterCandleRowsByTime(firstRows, window.start, window.end);
 const secondClipped = filterCandleRowsByTime(secondRows, window.start, window.end);
 const firstUnderlying = normalizeUniverseSymbol(pair.firstInstrument?.underlyingSymbol || pair.firstInstrument?.symbol || '');
 const secondUnderlying = normalizeUniverseSymbol(pair.secondInstrument?.underlyingSymbol || pair.secondInstrument?.symbol || '');
 const isCalendarPair = firstUnderlying && firstUnderlying === secondUnderlying
  && String(pair.firstInstrument?.expiry || '') !== String(pair.secondInstrument?.expiry || '');
 if (!isCalendarPair) {
  return { ...window, firstRows: firstClipped, secondRows: secondClipped };
 }
 const secondByTime = new Map(secondClipped.map(row => [Number(row.time), row]));
 const duplicateTimes = new Set();
 firstClipped.forEach(first => {
  const second = secondByTime.get(Number(first.time));
  if (!second) return;
  const firstValues = [first.open, first.high, first.low, first.close, first.volume].map(value => Number(value || 0));
  const secondValues = [second.open, second.high, second.low, second.close, second.volume].map(value => Number(value || 0));
  if (firstValues.every((value, index) => Number.isFinite(value) && value === secondValues[index])) {
   duplicateTimes.add(Number(first.time));
  }
 });
 return {
  ...window,
  firstRows: firstClipped.filter(row => !duplicateTimes.has(Number(row.time))),
  secondRows: secondClipped.filter(row => !duplicateTimes.has(Number(row.time))),
 };
}

function analyzeCommoditySpreadCandles(candles = []) {
 const rows = Array.isArray(candles) ? candles : [];
 const closes = rows.map(row => Number(row.close)).filter(Number.isFinite);
 if (closes.length < 100) return { direction: 'range', score: 0, confidence: 'low', reasons: ['At least 100 matched spread candles are required for Three EMA analysis.'] };
 const spreadEma = (source = [], period = 20) => {
  const values = source.map(row => Number(row?.close)).filter(Number.isFinite);
  if (values.length < period) return 0;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  values.slice(period).forEach(value => { current = ((value - current) * multiplier) + current; });
  return current;
 };
 const spreadObv = source => {
  let current = 0;
  return source.map((row, index) => {
   if (index > 0) {
    const close = Number(row?.close || 0);
    const previous = Number(source[index - 1]?.close || 0);
    const volume = Math.max(0, Number(row?.volume || 0));
    if (close > previous) current += volume;
    else if (close < previous) current -= volume;
   }
   return current;
  });
 };
 const spreadAtr = (source = [], period = 14) => {
  const values = [];
  for (let index = 1; index < source.length; index += 1) {
   const high = Number(source[index]?.high || 0);
   const low = Number(source[index]?.low || 0);
   const previous = Number(source[index - 1]?.close || 0);
   if ([high, low, previous].every(Number.isFinite)) values.push(Math.max(high - low, Math.abs(high - previous), Math.abs(low - previous)));
  }
  const recent = values.slice(-period);
  return recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : 0;
 };
 const latest = closes[closes.length - 1];
 const ema9 = spreadEma(rows, 9);
 const ema30 = spreadEma(rows, 30);
 const ema100 = spreadEma(rows, 100);
 const atr14 = spreadAtr(rows, 14);
 const obv = spreadObv(rows);
 const obvNow = Number(obv[obv.length - 1] || 0);
 const obvPrevious = Number(obv[Math.max(0, obv.length - 12)] || 0);
 const obvSlope = obvNow - obvPrevious;
 const lookback = closes.slice(-20);
 const mean = lookback.reduce((sum, value) => sum + value, 0) / lookback.length;
 const variance = lookback.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / lookback.length;
 const deviation = Math.sqrt(variance);
 const zScore = deviation > 0 ? (latest - mean) / deviation : 0;
 const momentum = latest - closes[Math.max(0, closes.length - 6)];
 const slope = ema9 - spreadEma(rows.slice(0, -3), 9);
 const emaBull = latest >= ema9 && ema9 > ema30 && ema30 > ema100;
 const emaBear = latest <= ema9 && ema9 < ema30 && ema30 < ema100;
 const obvUp = obvSlope > 0;
 const obvDown = obvSlope < 0;
 let score = 0;
 const reasons = [];
 if (emaBull) { score += 48; reasons.push('Spread EMA 9/30/100 is aligned upward.'); }
 if (emaBear) { score -= 48; reasons.push('Spread EMA 9/30/100 is aligned downward.'); }
 if (obvUp) { score += 22; reasons.push('Spread OBV confirms buyer pressure.'); }
 if (obvDown) { score -= 22; reasons.push('Spread OBV confirms seller pressure.'); }
 if (slope > 0) score += 10;
 if (slope < 0) score -= 10;
 if (momentum > 0) score += 8;
 if (momentum < 0) score -= 8;
 if (zScore > 1.5) reasons.push('Spread is extended above its 20-bar mean.');
 if (zScore < -1.5) reasons.push('Spread is extended below its 20-bar mean.');
 const direction = emaBull && obvUp ? 'widening' : emaBear && obvDown ? 'narrowing' : 'range';
 const triggerBuffer = Math.max(atr14 * 0.1, Math.abs(latest) * 0.0005);
 const entryTrigger = direction === 'widening' ? latest + triggerBuffer : direction === 'narrowing' ? latest - triggerBuffer : latest;
 const stopSpread = direction === 'widening'
  ? Math.min(ema30, latest - atr14)
  : direction === 'narrowing'
   ? Math.max(ema30, latest + atr14)
   : null;
 const targetSpread = direction === 'widening'
  ? latest + atr14 * 2
  : direction === 'narrowing'
   ? latest - atr14 * 2
   : null;
 return {
  direction,
  score: Math.round(Math.min(100, Math.abs(score))),
  confidence: Math.abs(score) >= 55 ? 'high' : Math.abs(score) >= 32 ? 'medium' : 'low',
  latest: +latest.toFixed(4),
  ema9: +ema9.toFixed(4),
  ema30: +ema30.toFixed(4),
  ema100: +ema100.toFixed(4),
  atr14: +atr14.toFixed(4),
  obvSlope: +obvSlope.toFixed(2),
  emaBull,
  emaBear,
  obvUp,
  obvDown,
  entryTrigger: +entryTrigger.toFixed(4),
  stopSpread: stopSpread == null ? null : +stopSpread.toFixed(4),
  targetSpread: targetSpread == null ? null : +targetSpread.toFixed(4),
  zScore: +zScore.toFixed(2),
  momentum: +momentum.toFixed(4),
  reasons: reasons.slice(0, 4),
 };
}

function commoditySpreadCostEstimate(pair = {}, snapshot = {}) {
 const firstUnits = commodityPriceMultiplier(pair.firstInstrument);
 const secondUnits = commodityPriceMultiplier(pair.secondInstrument);
 const firstExposure = Number(pair.firstLots || 1) * firstUnits.multiplier;
 const secondExposure = Number(pair.secondLots || 1) * secondUnits.multiplier;
 const matchedExposure = firstExposure === secondExposure;
 const valuePerSpreadPoint = matchedExposure ? firstExposure : Math.min(firstExposure, secondExposure);
 const executedOrders = 4;
 const brokerage = executedOrders * DHAN_FUTURES_BROKERAGE_PER_ORDER;
 const brokerageGst = brokerage * GST_RATE;
 const wideningSlippagePoints = snapshot.wideningEntrySpread == null ? null : Math.max(0, Number(snapshot.wideningEntrySpread) - Number(snapshot.spread || 0));
 const narrowingSlippagePoints = snapshot.narrowingEntrySpread == null ? null : Math.max(0, Number(snapshot.spread || 0) - Number(snapshot.narrowingEntrySpread));
 return {
  executedOrders,
  brokeragePerOrder: DHAN_FUTURES_BROKERAGE_PER_ORDER,
  brokerage: +brokerage.toFixed(2),
  brokerageGst: +brokerageGst.toFixed(2),
  fixedBrokerageAndGst: +(brokerage + brokerageGst).toFixed(2),
  statutoryChargesIncluded: false,
  valuePerSpreadPoint: +valuePerSpreadPoint.toFixed(4),
  matchedExposure,
  wideningSlippagePoints: wideningSlippagePoints == null ? null : +wideningSlippagePoints.toFixed(4),
  narrowingSlippagePoints: narrowingSlippagePoints == null ? null : +narrowingSlippagePoints.toFixed(4),
  brokerageBreakevenPoints: valuePerSpreadPoint > 0 ? +((brokerage + brokerageGst) / valuePerSpreadPoint).toFixed(4) : null,
 };
}

function commoditySpreadSafeguards(pair = {}, snapshot = {}, nowMs = Date.now()) {
 const firstExpiryMs = parseDerivativeExpiryMs(pair.firstInstrument?.expiry);
 const secondExpiryMs = parseDerivativeExpiryMs(pair.secondInstrument?.expiry);
 const nearestExpiryMs = Math.min(firstExpiryMs || Number.MAX_SAFE_INTEGER, secondExpiryMs || Number.MAX_SAFE_INTEGER);
 const daysToNearestExpiry = nearestExpiryMs < Number.MAX_SAFE_INTEGER ? Math.max(0, (nearestExpiryMs - nowMs) / DAY_MS) : 0;
 const firstPrice = Number(snapshot.firstPrice || 0);
 const secondPrice = Number(snapshot.secondPrice || 0);
 const firstWidth = Number(snapshot.firstAsk || 0) > 0 && Number(snapshot.firstBid || 0) > 0 ? Number(snapshot.firstAsk) - Number(snapshot.firstBid) : null;
 const secondWidth = Number(snapshot.secondAsk || 0) > 0 && Number(snapshot.secondBid || 0) > 0 ? Number(snapshot.secondAsk) - Number(snapshot.secondBid) : null;
 const firstWidthPct = firstWidth != null && firstPrice > 0 ? firstWidth / firstPrice * 100 : null;
 const secondWidthPct = secondWidth != null && secondPrice > 0 ? secondWidth / secondPrice * 100 : null;
 const warnings = [];
 if (daysToNearestExpiry < 5) warnings.push('Nearest leg expires in less than 5 days.');
 if (!snapshot.depthConfirmed) warnings.push('Both legs do not have complete executable depth.');
 if (Number(snapshot.firstVolume || 0) <= 0 || Number(snapshot.secondVolume || 0) <= 0) warnings.push('One or both legs have no reported volume.');
 if (Number(snapshot.firstOi || 0) <= 0 || Number(snapshot.secondOi || 0) <= 0) warnings.push('One or both legs have no reported open interest.');
 if (Math.max(firstWidthPct || 0, secondWidthPct || 0) > 0.15) warnings.push('Bid/ask width is above 0.15% on a spread leg.');
 return {
  tradeAllowed: warnings.length === 0,
  warnings,
  daysToNearestExpiry: +daysToNearestExpiry.toFixed(2),
  firstWidthPct: firstWidthPct == null ? null : +firstWidthPct.toFixed(4),
  secondWidthPct: secondWidthPct == null ? null : +secondWidthPct.toFixed(4),
 };
}

function buildCommoditySpreadHistory({
 buyRows = [],
 sellRows = [],
 buyInstrument = {},
 sellInstrument = {},
 entryBuyPrice = 0,
 entrySellPrice = 0,
 buyLots = 1,
 sellLots = 1,
 costs = 0,
} = {}) {
 const buyEntry = Number(entryBuyPrice || 0);
 const sellEntry = Number(entrySellPrice || 0);
 if (!(buyEntry > 0) || !(sellEntry > 0)) return { points: [], error: 'Enter valid buy and sell entry prices.' };
 const buyUnits = commodityPriceMultiplier(buyInstrument);
 const sellUnits = commodityPriceMultiplier(sellInstrument);
 const longLots = Math.max(1, Math.round(Number(buyLots || 1)));
 const shortLots = Math.max(1, Math.round(Number(sellLots || 1)));
 const buyExposure = longLots * buyUnits.multiplier;
 const sellExposure = shortLots * sellUnits.multiplier;
 const entrySpread = sellEntry - buyEntry;
 const flatCosts = Math.max(0, Number(costs || 0));
 const sells = new Map((Array.isArray(sellRows) ? sellRows : []).map(row => [Number(row.time), row]));
 const points = (Array.isArray(buyRows) ? buyRows : []).map(buy => {
  const sell = sells.get(Number(buy.time));
  const buyClose = Number(buy.close || 0);
  const sellClose = Number(sell?.close || 0);
  if (!(buyClose > 0) || !(sellClose > 0)) return null;
  const grossPnl = ((buyClose - buyEntry) * buyExposure) + ((sellEntry - sellClose) * sellExposure);
  return {
   time: Number(buy.time),
   buyClose: +buyClose.toFixed(4),
   sellClose: +sellClose.toFixed(4),
   spread: +(sellClose - buyClose).toFixed(4),
   grossPnl: +grossPnl.toFixed(2),
   netPnl: +(grossPnl - flatCosts).toFixed(2),
  };
 }).filter(Boolean).sort((a, b) => a.time - b.time);
 const grossValues = points.map(point => point.grossPnl);
 return {
  points,
  entrySpread: +entrySpread.toFixed(4),
  buyMultiplier: buyUnits.multiplier,
  sellMultiplier: sellUnits.multiplier,
  multiplierKnown: buyUnits.known && sellUnits.known,
  buyExposure,
  sellExposure,
  matchedExposure: buyExposure === sellExposure,
  latest: points[points.length - 1] || null,
  maximumGrossPnl: grossValues.length ? +Math.max(...grossValues).toFixed(2) : null,
  minimumGrossPnl: grossValues.length ? +Math.min(...grossValues).toFixed(2) : null,
  costs: +flatCosts.toFixed(2),
 };
}

function rankInstrumentForScanner(item = {}) {
 const symbol = String(item.symbol || '').trim().toUpperCase();
 const tradingSymbol = String(item.tradingSymbol || '').trim().toUpperCase();
 const exchangeSegment = String(item.exchangeSegment || '').trim().toUpperCase();
 const instrument = String(item.instrument || '').trim().toUpperCase();
 const preferred = Math.min(
  DHAN_SCAN_PRIORITY_RANK.has(symbol) ? DHAN_SCAN_PRIORITY_RANK.get(symbol) : 9999,
  DHAN_SCAN_PRIORITY_RANK.has(tradingSymbol) ? DHAN_SCAN_PRIORITY_RANK.get(tradingSymbol) : 9999
 );
 const segmentRank = exchangeSegment === 'IDX_I' ? 0
  : exchangeSegment === 'NSE_EQ' ? 1
  : exchangeSegment === 'BSE_EQ' ? 2
  : exchangeSegment === 'NSE_FNO' ? 3
  : exchangeSegment === 'BSE_FNO' ? 4
  : 9;
 const instrumentPenalty = instrument === 'INDEX' || instrument === 'EQUITY' ? 0 : 25;
 return preferred * 100 + segmentRank * 10 + instrumentPenalty;
}

function isNseEquityInstrument(item = {}) {
 return !!(String(item.exchangeSegment || '').trim().toUpperCase() === 'NSE_EQ'
  && String(item.instrument || '').trim().toUpperCase() === 'EQUITY'
  && (!item.series || String(item.series || '').trim().toUpperCase() === 'EQ')
  && String(item.securityId || '').trim());
}

function isBseEquityInstrument(item = {}) {
 return !!(String(item.exchangeSegment || '').trim().toUpperCase() === 'BSE_EQ'
  && String(item.instrument || '').trim().toUpperCase() === 'EQUITY'
  && (!item.series || String(item.series || '').trim().toUpperCase() === 'EQ')
  && String(item.securityId || '').trim());
}

const EQUITY_ALPHABET_CHUNKS = Object.freeze({
 af: /^[A-F]/,
 gl: /^[G-L]/,
 mr: /^[M-R]/,
 sz: /^[S-Z0-9]/,
});

function getEquityChunkKey(item = {}) {
 const symbol = normalizeUniverseSymbol(item.tradingSymbol || item.symbol || '');
 const first = symbol.charAt(0);
 if (!first) return 'sz';
 if (EQUITY_ALPHABET_CHUNKS.af.test(first)) return 'af';
 if (EQUITY_ALPHABET_CHUNKS.gl.test(first)) return 'gl';
 if (EQUITY_ALPHABET_CHUNKS.mr.test(first)) return 'mr';
 return 'sz';
}

function buildBseOnlyUniverse(allBse = [], allNse = []) {
 const nseSymbols = new Set((Array.isArray(allNse) ? allNse : []).flatMap(getInstrumentSymbolKeys));
 return (Array.isArray(allBse) ? allBse : []).filter(item => getInstrumentSymbolKeys(item).every(key => !nseSymbols.has(key)));
}

function buildAlphabetUniverseMemberships(prefix = '', items = []) {
 const base = {};
 ['af', 'gl', 'mr', 'sz'].forEach(chunk => {
  const id = `${prefix}_${chunk}`;
  base[id] = annotateUniverse(
   (Array.isArray(items) ? items : []).filter(item => getEquityChunkKey(item) === chunk),
   id
  ).map(item => String(item.securityId));
 });
 return base;
}

function sortUniverseInstruments(items = []) {
 return (Array.isArray(items) ? items : []).slice().sort((a, b) => {
  const ar = rankInstrumentForScanner(a);
  const br = rankInstrumentForScanner(b);
  if (ar !== br) return ar - br;
  return String(a.tradingSymbol || a.symbol || '').localeCompare(String(b.tradingSymbol || b.symbol || ''));
 });
}

function getInstrumentSymbolKeys(item = {}) {
 return [
  item.symbol,
  item.tradingSymbol,
  String(item.tradingSymbol || '').replace(/-EQ$/i, ''),
  String(item.symbol || '').replace(/-EQ$/i, ''),
 ].map(normalizeUniverseSymbol).filter(Boolean);
}

async function fetchCsvText(url = '') {
 const response = await fetch(url, {
  headers: {
   Accept: 'text/csv,*/*',
   'User-Agent': 'FWD-Bharat-MarketDesk/0.1 NSE universe sync',
  },
  signal: AbortSignal.timeout(45000),
 });
 if (!response.ok) throw new Error(`HTTP ${response.status}`);
 return response.text();
}

async function fetchUniverseSourceRows(source = {}) {
 try {
  const text = await fetchCsvText(source.url);
  const rows = parseCsv(text);
  const symbols = rows
  .map(row => normalizeUniverseSymbol(pick(row, ['symbol', 'SYMBOL'])))
  .filter(Boolean);
  return {
   ok: true,
   url: source.url,
   symbols: Array.from(new Set(symbols)),
   count: symbols.length,
  };
 } catch (error) {
  return {
   ok: false,
   url: source.url,
   symbols: [],
   count: 0,
   error: error?.message || String(error || 'Universe source fetch failed.'),
  };
 }
}

async function fetchNseAllEquitySymbolSet() {
 const source = { id: 'all_nse', label: 'NSE Listed Equity', url: NSE_EQUITY_LIST_URL };
 const result = await fetchUniverseSourceRows(source);
 return {
  ...result,
  symbols: new Set(result.symbols || []),
 };
}

async function fetchIndexUniverseSources() {
 const entries = await Promise.all(Object.values(NSE_INDEX_CONSTITUENT_SOURCES).map(async source => {
  const result = await fetchUniverseSourceRows(source);
  return [source.id, { ...source, ...result, symbols: new Set(result.symbols || []) }];
 }));
 return Object.fromEntries(entries);
}

function mapSymbolsToNseInstruments(allNseInstruments = [], symbolSet = new Set()) {
 if (!symbolSet || !symbolSet.size) return [];
 return allNseInstruments.filter(item => getInstrumentSymbolKeys(item).some(key => symbolSet.has(key)));
}

function fallbackUniverseSlice(allNseInstruments = [], source = {}) {
 const offset = Math.max(0, Number(source.fallbackOffset || 0));
 const limit = Math.max(1, Number(source.fallbackLimit || 250));
 return allNseInstruments.slice(offset, offset + limit);
}

function annotateUniverse(items = [], universeId = '') {
 const safeId = normalizeUniverseId(universeId);
 return (Array.isArray(items) ? items : []).map(item => ({
  ...item,
  universe: item.universe || safeId.toUpperCase(),
  universeTags: Array.from(new Set([...(Array.isArray(item.universeTags) ? item.universeTags : []), safeId])),
 }));
}

function buildUniverseCatalog({ instruments = [], fnoStockUniverse = [], indexSources = {}, nseAllSource = null } = {}) {
 const allNseBase = sortUniverseInstruments((Array.isArray(instruments) ? instruments : []).filter(isNseEquityInstrument));
 const allBseBase = sortUniverseInstruments((Array.isArray(instruments) ? instruments : []).filter(isBseEquityInstrument));
 const allNseAllowed = nseAllSource?.ok && nseAllSource.symbols?.size
  ? mapSymbolsToNseInstruments(allNseBase, nseAllSource.symbols)
  : allNseBase;
 const allNse = annotateUniverse(allNseAllowed.length ? allNseAllowed : allNseBase, 'all_nse');
 const allBse = annotateUniverse(allBseBase, 'all_bse');
 const bseOnly = annotateUniverse(buildBseOnlyUniverse(allBse, allNse), 'bse_only');
 const fno = annotateUniverse(fnoStockUniverse, 'fno_stocks');
 const indices = annotateUniverse(sortUniverseInstruments((Array.isArray(instruments) ? instruments : []).filter(item => String(item.exchangeSegment || '').toUpperCase() === 'IDX_I')), 'indices');
 const memberships = {
  all_nse: allNse.map(item => String(item.securityId)),
  ...buildAlphabetUniverseMemberships('nse', allNse),
  all_bse: allBse.map(item => String(item.securityId)),
  bse_only: bseOnly.map(item => String(item.securityId)),
  ...buildAlphabetUniverseMemberships('bse', allBse),
  fno_stocks: fno.map(item => String(item.securityId)),
  indices: indices.map(item => String(item.securityId)),
 };
 const sourceStatus = {
  all_nse: {
   ok: nseAllSource?.ok !== false,
   count: allNse.length,
   url: NSE_EQUITY_LIST_URL,
   error: nseAllSource?.error || '',
   fallback: !(nseAllSource?.ok && nseAllSource?.symbols?.size),
  },
  fno_stocks: {
   ok: true,
   count: fno.length,
   url: DHAN_INSTRUMENT_MASTER_DETAILED_URL,
   error: '',
  fallback: false,
  },
  indices: {
   ok: true,
   count: indices.length,
   url: DHAN_INSTRUMENT_MASTER_URL,
   error: '',
   fallback: false,
  },
  all_bse: {
   ok: true,
   count: allBse.length,
   url: DHAN_INSTRUMENT_MASTER_URL,
   error: '',
   fallback: false,
  },
  bse_only: {
   ok: true,
   count: bseOnly.length,
   url: 'All BSE Equity minus NSE symbols',
   error: '',
   fallback: false,
  },
 };
 Object.entries(buildAlphabetUniverseMemberships('nse', allNse)).forEach(([id, rows]) => {
  sourceStatus[id] = {
   ok: true,
   count: rows.length,
   url: 'All NSE Equity alphabet chunk',
   error: '',
   fallback: false,
  };
 });
 Object.entries(buildAlphabetUniverseMemberships('bse', allBse)).forEach(([id, rows]) => {
  sourceStatus[id] = {
   ok: true,
   count: rows.length,
   url: 'All BSE Equity alphabet chunk',
   error: '',
   fallback: false,
  };
 });
 Object.values(NSE_INDEX_CONSTITUENT_SOURCES).forEach(source => {
  const fetched = indexSources[source.id] || {};
  let mapped = mapSymbolsToNseInstruments(allNse, fetched.symbols || new Set());
  const fallback = !mapped.length;
  if (fallback) mapped = fallbackUniverseSlice(allNse, source);
 memberships[source.id] = annotateUniverse(mapped, source.id).map(item => String(item.securityId));
  sourceStatus[source.id] = {
   ok: fetched.ok !== false && !fallback,
   count: memberships[source.id].length,
   url: source.url,
   error: fallback ? (fetched.error || 'Using ranked NSE fallback because constituent CSV did not map.') : '',
  fallback,
  };
 });
 const coveredCoreIds = new Set([
  ...memberships.fno_stocks,
  ...Object.keys(NSE_INDEX_CONSTITUENT_SOURCES).flatMap(id => memberships[id] || []),
 ].map(String));
 memberships.nse_rest = annotateUniverse(
  allNse.filter(item => !coveredCoreIds.has(String(item.securityId || ''))),
  'nse_rest'
 ).map(item => String(item.securityId));
 sourceStatus.nse_rest = {
  ok: true,
  count: memberships.nse_rest.length,
  url: 'All NSE Equity minus F&O/Nifty/Midcap/Smallcap overlap',
  error: '',
  fallback: false,
 };
 return compactUniverseCatalog({
  fetchedAt: Date.now(),
  memberships,
  sourceStatus,
 });
}

function getUniverseMembershipSet(cache = {}, universe = '') {
 const safeUniverse = normalizeUniverseId(universe);
 const catalog = compactUniverseCatalog(cache.universeCatalog || {});
 const list = catalog.memberships?.[safeUniverse] || [];
 return {
  id: safeUniverse,
  definition: getUniverseDefinition(safeUniverse),
  catalog,
  securityIds: new Set(list.map(value => String(value || '').trim()).filter(Boolean)),
 };
}

function normalizeResolution(resolution = '') {
 const requested = String(resolution || '4h').trim().toLowerCase();
 const raw = ['5m', '5', '4h', '240m', '240', '1h', '60m', '60', '1d', '1w'].includes(requested) ? requested : '4h';
 if (raw === '1d' || raw === '1w') return { kind: 'historical', interval: '1D', seconds: raw === '1w' ? 7 * 86400 : 86400, aggregateSeconds: raw === '1w' ? 7 * 86400 : 0 };
 const minuteMap = { '5m': 5, '5': 5, '1h': 60, '60m': 60, '60': 60 };
 const minutes = raw === '4h' || raw === '240m' || raw === '240' ? 60 : (minuteMap[raw] || 60);
 const allowed = [1, 5, 15, 25, 60];
 return {
  kind: 'intraday',
  interval: String(allowed.includes(minutes) ? minutes : 15),
  seconds: raw === '4h' || raw === '240m' || raw === '240' ? 4 * 3600 : (allowed.includes(minutes) ? minutes : 60) * 60,
  aggregateSeconds: raw === '4h' || raw === '240m' || raw === '240' ? 4 * 3600 : 0,
 };
}

function formatDateOnly(ms) {
 return new Date(ms).toISOString().slice(0, 10);
}

function formatDateTime(ms) {
 const d = new Date(ms);
 const yyyy = d.getFullYear();
 const mm = String(d.getMonth() + 1).padStart(2, '0');
 const dd = String(d.getDate()).padStart(2, '0');
 const hh = String(d.getHours()).padStart(2, '0');
 const mi = String(d.getMinutes()).padStart(2, '0');
 const ss = String(d.getSeconds()).padStart(2, '0');
 return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function normalizeDhanCandles(payload = {}) {
 const open = Array.isArray(payload.open) ? payload.open : [];
 const high = Array.isArray(payload.high) ? payload.high : [];
 const low = Array.isArray(payload.low) ? payload.low : [];
 const close = Array.isArray(payload.close) ? payload.close : [];
 const volume = Array.isArray(payload.volume) ? payload.volume : [];
 const oi = Array.isArray(payload.open_interest)
  ? payload.open_interest
  : Array.isArray(payload.oi)
   ? payload.oi
   : [];
 const timestamp = Array.isArray(payload.timestamp) ? payload.timestamp : [];
 return timestamp.map((ts, index) => {
  const rawTime = Number(ts || 0);
  const time = rawTime > 1000000000000 ? Math.floor(rawTime / 1000) : Math.floor(rawTime);
  return {
   time,
   open: Number(open[index] || 0),
   high: Number(high[index] || 0),
   low: Number(low[index] || 0),
   close: Number(close[index] || 0),
   volume: Number(volume[index] || 0),
   oi: Number(oi[index] || 0),
  };
 }).filter(row => row.time > 0 && row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0);
}

function sleep(ms = 0) {
 return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function chunkArray(items = [], size = 1) {
 const chunkSize = Math.max(1, Number(size || 1));
 const chunks = [];
 for (let index = 0; index < items.length; index += chunkSize) chunks.push(items.slice(index, index + chunkSize));
 return chunks;
}

function flattenInstrumentGroups(groups = {}) {
 return Object.entries(groups).flatMap(([exchangeSegment, securityIds]) => (
  Array.isArray(securityIds) ? securityIds.map(securityId => ({ exchangeSegment, securityId })) : []
 ));
}

function groupQuoteBatch(items = []) {
 return items.reduce((groups, item) => {
  if (!item?.exchangeSegment || !Number.isFinite(Number(item.securityId))) return groups;
  groups[item.exchangeSegment] = groups[item.exchangeSegment] || [];
  groups[item.exchangeSegment].push(Number(item.securityId));
  return groups;
 }, {});
}

function normalizeFeedMode(mode = 'quote') {
 const safe = String(mode || '').trim().toLowerCase();
 if (safe === 'ticker' || safe === 'ltp') return 'ticker';
 if (safe === 'full' || safe === 'depth') return 'full';
 return 'quote';
}

function feedRequestCodeForMode(mode = 'quote') {
 return DHAN_FEED_REQUEST_CODES[normalizeFeedMode(mode)] || DHAN_FEED_REQUEST_CODES.quote;
}

function toArrayBuffer(input) {
 if (input instanceof ArrayBuffer) return input;
 if (ArrayBuffer.isView(input)) return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
 if (Buffer.isBuffer(input)) return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
 return null;
}

function parseDhanFeedPacket(input) {
 const buffer = toArrayBuffer(input);
 if (!buffer || buffer.byteLength < 8) return null;
 const view = new DataView(buffer);
 const code = view.getUint8(0);
 const messageLength = view.getUint16(1, true);
 const exchangeSegmentCode = view.getUint8(3);
 const securityId = view.getInt32(4, true);
 const packet = {
  ok: true,
  code,
  messageLength,
  exchangeSegmentCode,
  securityId,
  key: String(securityId || ''),
  ts: Date.now(),
 };
 if (code === DHAN_FEED_RESPONSE_CODES.ticker && buffer.byteLength >= 16) {
  return {
   ...packet,
   type: 'ticker',
   lastPrice: Number(view.getFloat32(8, true).toFixed(4)),
   lastTradeTime: view.getInt32(12, true),
  };
 }
 if (code === DHAN_FEED_RESPONSE_CODES.quote && buffer.byteLength >= 50) {
  return {
   ...packet,
   type: 'quote',
   lastPrice: Number(view.getFloat32(8, true).toFixed(4)),
   lastTradedQuantity: view.getInt16(12, true),
   lastTradeTime: view.getInt32(14, true),
   averageTradePrice: Number(view.getFloat32(18, true).toFixed(4)),
   volume: view.getInt32(22, true),
   totalSellQuantity: view.getInt32(26, true),
   totalBuyQuantity: view.getInt32(30, true),
   open: Number(view.getFloat32(34, true).toFixed(4)),
   close: Number(view.getFloat32(38, true).toFixed(4)),
   high: Number(view.getFloat32(42, true).toFixed(4)),
   low: Number(view.getFloat32(46, true).toFixed(4)),
  };
 }
 if (code === DHAN_FEED_RESPONSE_CODES.oi && buffer.byteLength >= 12) {
  return { ...packet, type: 'oi', openInterest: view.getInt32(8, true) };
 }
 if (code === DHAN_FEED_RESPONSE_CODES.previousClose && buffer.byteLength >= 16) {
  return {
   ...packet,
   type: 'previous_close',
   previousClose: Number(view.getFloat32(8, true).toFixed(4)),
   previousOpenInterest: view.getInt32(12, true),
  };
 }
 if (code === DHAN_FEED_RESPONSE_CODES.full && buffer.byteLength >= 62) {
  return {
   ...packet,
   type: 'full',
   lastPrice: Number(view.getFloat32(8, true).toFixed(4)),
   lastTradedQuantity: view.getInt16(12, true),
   lastTradeTime: view.getInt32(14, true),
   averageTradePrice: Number(view.getFloat32(18, true).toFixed(4)),
   volume: view.getInt32(22, true),
   totalSellQuantity: view.getInt32(26, true),
   totalBuyQuantity: view.getInt32(30, true),
   openInterest: view.getInt32(34, true),
   highestOpenInterest: view.getInt32(38, true),
   lowestOpenInterest: view.getInt32(42, true),
   open: Number(view.getFloat32(46, true).toFixed(4)),
   close: Number(view.getFloat32(50, true).toFixed(4)),
   high: Number(view.getFloat32(54, true).toFixed(4)),
   low: Number(view.getFloat32(58, true).toFixed(4)),
  };
 }
 if (code === DHAN_FEED_RESPONSE_CODES.marketStatus) return { ...packet, type: 'market_status' };
 if (code === DHAN_FEED_RESPONSE_CODES.disconnect) {
  return { ...packet, type: 'disconnect', reasonCode: buffer.byteLength >= 10 ? view.getInt16(8, true) : 0 };
 }
 return { ...packet, type: 'unknown' };
}

function mergeDhanFeedTick(previous = {}, tick = {}, instrument = null) {
 const next = {
  ...previous,
  ...tick,
  instrument: instrument || previous.instrument || null,
  symbol: instrument?.symbol || instrument?.tradingSymbol || previous.symbol || '',
  tradingSymbol: instrument?.tradingSymbol || previous.tradingSymbol || '',
  exchangeSegment: instrument?.exchangeSegment || previous.exchangeSegment || '',
  securityId: String(tick.securityId || previous.securityId || instrument?.securityId || ''),
  updatedAt: Date.now(),
 };
 if (tick.lastPrice != null) next.lastPrice = Number(tick.lastPrice || 0);
 if (tick.openInterest != null) next.openInterest = Number(tick.openInterest || 0);
 if (tick.previousOpenInterest != null) next.previousOpenInterest = Number(tick.previousOpenInterest || 0);
 return next;
}

function finiteNumber(value, fallback = 0) {
 const num = Number(value);
 return Number.isFinite(num) ? num : fallback;
}

function normalizeOptionSide(side = {}, strike = 0, type = 'ce') {
 const greeks = side?.greeks || {};
 const oi = finiteNumber(side.oi, 0);
 const previousOi = finiteNumber(side.previous_oi, 0);
 return {
  type,
  strike: finiteNumber(strike, 0),
  securityId: String(side.security_id || ''),
  lastPrice: finiteNumber(side.last_price, 0),
  averagePrice: finiteNumber(side.average_price, 0),
  volume: finiteNumber(side.volume, 0),
  previousVolume: finiteNumber(side.previous_volume, 0),
  oi,
  previousOi,
  oiChange: oi - previousOi,
  bid: finiteNumber(side.top_bid_price, 0),
  bidQuantity: finiteNumber(side.top_bid_quantity, 0),
  ask: finiteNumber(side.top_ask_price, 0),
  askQuantity: finiteNumber(side.top_ask_quantity, 0),
  iv: finiteNumber(side.implied_volatility, 0),
  delta: finiteNumber(greeks.delta, 0),
  gamma: finiteNumber(greeks.gamma, 0),
  theta: finiteNumber(greeks.theta, 0),
  vega: finiteNumber(greeks.vega, 0),
 };
}

function normalizeDhanOptionChainResponse(response = {}, request = {}) {
 const root = response?.data?.data || response?.data || {};
 const oc = root.oc || {};
 const underlyingPrice = finiteNumber(root.last_price || root.underlying_price || root.ltp, 0);
 const rows = Object.entries(oc).map(([strikeKey, value]) => {
  const strike = finiteNumber(strikeKey, 0);
  const ce = normalizeOptionSide(value?.ce || {}, strike, 'ce');
  const pe = normalizeOptionSide(value?.pe || {}, strike, 'pe');
  return {
   strike,
   ce,
   pe,
   totalOi: ce.oi + pe.oi,
   totalVolume: ce.volume + pe.volume,
   pcrStrike: ce.oi > 0 ? pe.oi / ce.oi : 0,
   distance: underlyingPrice > 0 ? strike - underlyingPrice : 0,
  };
 }).filter(row => row.strike > 0).sort((a, b) => a.strike - b.strike);
 const totalCallOi = rows.reduce((sum, row) => sum + row.ce.oi, 0);
 const totalPutOi = rows.reduce((sum, row) => sum + row.pe.oi, 0);
 const totalCallVolume = rows.reduce((sum, row) => sum + row.ce.volume, 0);
 const totalPutVolume = rows.reduce((sum, row) => sum + row.pe.volume, 0);
 const maxCallOiRow = rows.reduce((best, row) => row.ce.oi > (best?.ce?.oi || 0) ? row : best, null);
 const maxPutOiRow = rows.reduce((best, row) => row.pe.oi > (best?.pe?.oi || 0) ? row : best, null);
 const atm = rows.reduce((best, row) => {
  if (!best) return row;
  return Math.abs(row.strike - underlyingPrice) < Math.abs(best.strike - underlyingPrice) ? row : best;
 }, null);
 const painRows = rows.map(row => {
  const settlement = row.strike;
  const pain = rows.reduce((sum, item) => (
   sum
   + Math.max(0, settlement - item.strike) * item.ce.oi
   + Math.max(0, item.strike - settlement) * item.pe.oi
  ), 0);
  return { strike: settlement, pain };
 }).sort((a, b) => a.pain - b.pain);
 const maxPain = painRows[0] || null;
 const callIvRows = rows.filter(row => row.ce.iv > 0);
 const putIvRows = rows.filter(row => row.pe.iv > 0);
 const avg = list => list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
 const averageCallIv = avg(callIvRows.map(row => row.ce.iv));
 const averagePutIv = avg(putIvRows.map(row => row.pe.iv));
 const atmIvSkew = atm ? finiteNumber(atm.pe.iv - atm.ce.iv, 0) : 0;
 const summary = {
  underlying: request.underlying || request.symbol || '',
  expiry: request.expiry || '',
  underlyingPrice,
  strikeCount: rows.length,
  totalCallOi,
  totalPutOi,
  totalCallVolume,
  totalPutVolume,
  pcrOi: totalCallOi > 0 ? totalPutOi / totalCallOi : 0,
  pcrVolume: totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0,
  maxPainStrike: maxPain?.strike || 0,
  maxPainValue: maxPain?.pain || 0,
  atmStrike: atm?.strike || 0,
  callWall: maxCallOiRow?.strike || 0,
  putWall: maxPutOiRow?.strike || 0,
  averageCallIv,
  averagePutIv,
  ivSkew: averagePutIv - averageCallIv,
  atmIvSkew,
 };
 return {
  ...response,
  normalized: true,
  underlying: root,
  summary,
  rows,
  painRows,
 };
}

function mergePlainObjectsDeep(base = {}, patch = {}) {
 const output = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
 Object.entries(patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}).forEach(([key, value]) => {
  if (
   value
   && typeof value === 'object'
   && !Array.isArray(value)
   && output[key]
   && typeof output[key] === 'object'
   && !Array.isArray(output[key])
  ) {
   output[key] = mergePlainObjectsDeep(output[key], value);
  } else {
   output[key] = value;
  }
 });
 return output;
}

function mergeDhanFeedResponses(responses = [], instruments = {}) {
 const failed = responses.find(response => !response?.ok);
 if (failed) return failed;
 const data = responses.reduce((merged, response) => {
  const body = response?.data && typeof response.data === 'object' ? response.data : {};
  return mergePlainObjectsDeep(merged, body);
 }, {});
 return {
  ok: true,
  status: responses[0]?.status || 200,
  data,
  raw: data,
  instruments,
  batches: responses.length,
  apiCalls: responses.length,
 };
}

function buildInstrumentLookup(instruments = []) {
 const byKey = new Map();
 const bySecurityId = new Map();
 const duplicates = new Set();
 for (const item of (Array.isArray(instruments) ? instruments : [])) {
  const securityId = String(item?.securityId || '').trim();
  const exchangeSegment = String(item?.exchangeSegment || '').trim().toUpperCase();
  if (!securityId) continue;
  if (exchangeSegment) byKey.set(`${exchangeSegment}:${securityId}`, item);
  if (bySecurityId.has(securityId)) duplicates.add(securityId);
  else bySecurityId.set(securityId, item);
 }
 duplicates.forEach(securityId => bySecurityId.delete(securityId));
 return { byKey, bySecurityId };
}

function buildIntradayChunks(startMs = 0, endMs = 0, maxDays = DHAN_INTRADAY_CHUNK_DAYS) {
 const start = Number(startMs || 0);
 const end = Number(endMs || 0);
 if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start >= end) return [{ startMs: start, endMs: end }];
 const maxSpan = Math.max(1, Number(maxDays || DHAN_INTRADAY_CHUNK_DAYS)) * DAY_MS;
 const chunks = [];
 let cursor = start;
 while (cursor < end) {
  const chunkEnd = Math.min(end, cursor + maxSpan);
  chunks.push({ startMs: cursor, endMs: chunkEnd });
  cursor = chunkEnd + 1000;
 }
 return chunks;
}

function getIstDateParts(input = Date.now()) {
 const date = input instanceof Date ? input : new Date(input);
 const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
 }).formatToParts(date).reduce((out, part) => {
  if (part.type !== 'literal') out[part.type] = part.value;
  return out;
 }, {});
 const hour = Number(parts.hour || 0);
 return {
  date,
  year: Number(parts.year || 0),
  month: Number(parts.month || 0),
  day: Number(parts.day || 0),
  weekday: String(parts.weekday || ''),
  hour: hour === 24 ? 0 : hour,
  minute: Number(parts.minute || 0),
  second: Number(parts.second || 0),
  dateKey: `${parts.year}-${parts.month}-${parts.day}`,
 };
}

function getNseBseMarketSession(input = Date.now()) {
 const parts = getIstDateParts(input);
 const minuteOfDay = parts.hour * 60 + parts.minute;
 const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun';
 const holiday = NSE_BSE_EQUITY_HOLIDAYS_2026[parts.dateKey] || '';
 const special = NSE_BSE_SPECIAL_SESSIONS_2026[parts.dateKey] || null;
 const base = {
  ok: true,
  exchange: 'NSE/BSE',
  segment: 'equity_and_derivatives',
  timezone: IST_TIME_ZONE,
  date: parts.dateKey,
  day: parts.weekday,
  time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  schedule: {
   preOpen: '09:00-09:15',
   normal: '09:15-15:30',
   closing: '15:30-16:00',
  },
  isWeekend: weekend,
  isHoliday: !!holiday,
  holiday,
  specialSession: special,
 };
 if (special && weekend) {
  return {
   ...base,
   isOpen: false,
   phase: special.status || 'special_session_pending',
   label: special.label,
   message: special.note || 'Special session timings are not configured yet.',
  };
 }
 if (weekend) {
  return { ...base, isOpen: false, phase: 'weekend_closed', label: 'Weekend closed', message: 'NSE/BSE regular equity markets are closed on weekends.' };
 }
 if (holiday) {
  return { ...base, isOpen: false, phase: 'holiday_closed', label: holiday, message: `NSE/BSE regular equity markets are closed for ${holiday}.` };
 }
 if (minuteOfDay < 9 * 60) return { ...base, isOpen: false, phase: 'pre_market_wait', label: 'Before pre-open', message: 'Regular pre-open starts at 09:00 IST.' };
 if (minuteOfDay < 9 * 60 + 15) return { ...base, isOpen: false, phase: 'pre_open', label: 'Pre-open', message: 'Pre-open session is running; normal trading starts at 09:15 IST.' };
 if (minuteOfDay < 15 * 60 + 30) return { ...base, isOpen: true, phase: 'normal_open', label: 'Market open', message: 'NSE/BSE normal trading session is open.' };
 if (minuteOfDay < 16 * 60) return { ...base, isOpen: false, phase: 'closing_session', label: 'Closing session', message: 'Normal trading is closed; closing/post-close workflow may be active.' };
 return { ...base, isOpen: false, phase: 'after_market', label: 'After market', message: 'NSE/BSE regular equity market is closed for the day.' };
}

function mergeCandleRows(chunks = []) {
 const byTime = new Map();
 for (const chunk of chunks) {
  for (const row of (Array.isArray(chunk?.rows) ? chunk.rows : [])) {
   if (Number(row?.time || 0) > 0) byTime.set(Number(row.time), row);
  }
 }
 return [...byTime.values()].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
}

function aggregateCandleRows(rows = [], bucketSeconds = 0) {
 const seconds = Number(bucketSeconds || 0);
 if (!(seconds > 60)) return Array.isArray(rows) ? rows : [];
 const buckets = new Map();
 for (const row of (Array.isArray(rows) ? rows : [])) {
  const time = Number(row?.time || 0);
  if (!(time > 0)) continue;
  const bucketTime = Math.floor(time / seconds) * seconds;
  const active = buckets.get(bucketTime);
  if (!active) {
   buckets.set(bucketTime, {
    time: bucketTime,
    open: Number(row.open || row.close || 0),
    high: Number(row.high || row.close || 0),
    low: Number(row.low || row.close || 0),
    close: Number(row.close || 0),
    volume: Number(row.volume || 0),
   });
   continue;
  }
  active.high = Math.max(active.high, Number(row.high || row.close || active.high));
  active.low = Math.min(active.low, Number(row.low || row.close || active.low));
  active.close = Number(row.close || active.close);
  active.volume += Number(row.volume || 0);
 }
 return [...buckets.values()].filter(row => row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0).sort((a, b) => a.time - b.time);
}

function isDhanRateLimitResponse(response = {}) {
 const text = [
  response.status,
  response.error,
  response.raw?.errorType,
  response.raw?.errorCode,
  response.raw?.errorMessage,
  response.raw?.message,
  JSON.stringify(response.data || ''),
  JSON.stringify(response.raw || ''),
 ].map(value => String(value || '')).join(' ');
 return response.status === 429 || /\b805\b|DH-904|Rate_Limit|too many requests|rate limit|user being blocked/i.test(text);
}

function dhanErrorMessage(data = null, fallback = '') {
 if (data && typeof data === 'object') {
  return data.errorMessage || data.message || data.error || data.remarks?.error_message || fallback;
 }
 return String(data || fallback || '');
}

function isDhanNoHistoricalDataResponse(response = {}) {
 const text = [
  response.status,
  response.error,
  response.raw?.errorType,
  response.raw?.errorCode,
  response.raw?.errorMessage,
  response.raw?.message,
 ].map(value => String(value || '')).join(' ');
 return /DH-905|DH-907|unable to fetch data|incorrect parameters|no data present|Missing required fields/i.test(text);
}

function createDhanDataService({ app, credentialStore, errorJournal } = {}) {
 const cachePath = () => path.join(app.getPath('userData'), INSTRUMENT_CACHE_FILE);
 const commodityCandleCachePath = () => path.join(app.getPath('userData'), COMMODITY_CANDLE_CACHE_FILE);
 const commodityContractArchivePath = () => path.join(app.getPath('userData'), COMMODITY_CONTRACT_ARCHIVE_FILE);
 const commoditySpreadHistoryPath = () => path.join(app.getPath('userData'), COMMODITY_SPREAD_HISTORY_FILE);
 let nextQuoteRequestAt = 0;
 let nextCandleRequestAt = 0;
 let candleBlockedUntil = 0;
 let nextOptionChainRequestAt = 0;
 let optionChainBlockedUntil = 0;
 const optionExpiryCache = new Map();
 const optionChainCache = new Map();
 const optionChainInFlight = new Map();
 let commodityAnalysisCache = null;
 let commodityCandleCacheMemory = null;
 let commodityContractArchiveMemory = null;
 let commoditySpreadHistoryMemory = null;
 let commoditySpreadBackfillPromise = null;
 let commoditySpreadBackfillStatus = {
  running: false,
  cancelRequested: false,
  startedAt: 0,
  completedAt: 0,
  currentUnderlying: '',
  completed: 0,
  total: 0,
  errors: [],
 };
 let liveSocket = null;
 let liveFeedMode = 'quote';
 let liveFeedDesired = false;
 let liveFeedPaused = false;
 let liveFeedReconnectTimer = null;
 let liveFeedReconnectAttempt = 0;
 let liveFeedLastError = '';
 let liveFeedLastConnectAt = 0;
 let liveFeedLastMessageAt = 0;
 const liveFeedInstruments = new Map();
 const liveFeedTicks = new Map();
 const liveFeedOwners = new Map();
 let instrumentCacheMemory = null;

 async function readCommodityContractArchive() {
  if (commodityContractArchiveMemory) return commodityContractArchiveMemory;
  try {
   const parsed = JSON.parse(await fs.readFile(commodityContractArchivePath(), 'utf8'));
   commodityContractArchiveMemory = parsed && typeof parsed === 'object'
    ? parsed
    : { version: 1, updatedAt: 0, contracts: {}, pairSnapshots: {} };
  } catch (_) {
   commodityContractArchiveMemory = { version: 1, updatedAt: 0, contracts: {}, pairSnapshots: {} };
  }
  return commodityContractArchiveMemory;
 }

 async function writeCommodityContractArchive(archive = {}) {
  commodityContractArchiveMemory = archive;
  try {
   await fs.writeFile(commodityContractArchivePath(), JSON.stringify(archive));
  } catch (error) {
   errorJournal?.append?.('dhan:commodity-contract-archive-write', error);
  }
 }

 async function archiveCommodityContracts(instruments = [], nowMs = Date.now()) {
  const archive = await readCommodityContractArchive();
  archive.contracts = archive.contracts && typeof archive.contracts === 'object' ? archive.contracts : {};
  archive.pairSnapshots = archive.pairSnapshots && typeof archive.pairSnapshots === 'object' ? archive.pairSnapshots : {};
  const commodityInstruments = (Array.isArray(instruments) ? instruments : []).filter(item => (
   item?.exchangeSegment === 'MCX_COMM' && item?.instrument === 'FUTCOM' && item?.securityId
  ));
  commodityInstruments.forEach(item => {
   const key = String(item.securityId);
   const previous = archive.contracts[key] || {};
   archive.contracts[key] = {
    securityId: key,
    exchangeSegment: 'MCX_COMM',
    instrument: 'FUTCOM',
    underlyingSymbol: String(item.underlyingSymbol || item.symbol || '').toUpperCase(),
    symbol: item.symbol || '',
    tradingSymbol: item.tradingSymbol || '',
    expiry: item.expiry || '',
    lotSize: Number(item.lotSize || 1),
    firstSeenAt: Number(previous.firstSeenAt || nowMs),
    lastSeenAt: nowMs,
   };
  });
  buildCommodityFuturePairs(commodityInstruments, nowMs)
   .filter(pair => COMMODITY_SPREAD_FEATURED_UNDERLYINGS.includes(pair.symbol) && pair.nextFuture)
   .forEach(pair => {
    const list = Array.isArray(archive.pairSnapshots[pair.symbol]) ? archive.pairSnapshots[pair.symbol] : [];
    const snapshot = {
     observedAt: nowMs,
     nearSecurityId: String(pair.nearFuture.securityId),
     farSecurityId: String(pair.nextFuture.securityId),
     nearExpiry: pair.nearFuture.expiry || '',
     farExpiry: pair.nextFuture.expiry || '',
    };
    const previous = list[list.length - 1];
    if (!previous || previous.nearSecurityId !== snapshot.nearSecurityId || previous.farSecurityId !== snapshot.farSecurityId) {
     list.push(snapshot);
    } else {
     previous.observedAt = nowMs;
    }
    archive.pairSnapshots[pair.symbol] = list.slice(-60);
   });
  archive.version = 1;
  archive.updatedAt = nowMs;
  await writeCommodityContractArchive(archive);
  return archive;
 }

 async function readCommoditySpreadHistory() {
  if (commoditySpreadHistoryMemory) return commoditySpreadHistoryMemory;
  try {
   const parsed = JSON.parse(await fs.readFile(commoditySpreadHistoryPath(), 'utf8'));
   commoditySpreadHistoryMemory = parsed && typeof parsed === 'object'
    ? parsed
    : { version: COMMODITY_SPREAD_HISTORY_VERSION, updatedAt: 0, families: {} };
  } catch (_) {
   commoditySpreadHistoryMemory = { version: COMMODITY_SPREAD_HISTORY_VERSION, updatedAt: 0, families: {} };
  }
  commoditySpreadHistoryMemory.families = commoditySpreadHistoryMemory.families && typeof commoditySpreadHistoryMemory.families === 'object'
   ? commoditySpreadHistoryMemory.families
   : {};
  return commoditySpreadHistoryMemory;
 }

 async function writeCommoditySpreadHistory(store = {}) {
  store.version = COMMODITY_SPREAD_HISTORY_VERSION;
  store.updatedAt = Date.now();
  commoditySpreadHistoryMemory = store;
  try {
   await fs.writeFile(commoditySpreadHistoryPath(), JSON.stringify(store));
  } catch (error) {
   errorJournal?.append?.('dhan:commodity-spread-history-write', error);
  }
 }

 async function readCommodityCandleCache() {
  if (commodityCandleCacheMemory) return commodityCandleCacheMemory;
  try {
   const parsed = JSON.parse(await fs.readFile(commodityCandleCachePath(), 'utf8'));
   commodityCandleCacheMemory = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
   commodityCandleCacheMemory = {};
  }
  return commodityCandleCacheMemory;
 }

 async function writeCommodityCandleCache(cache = {}) {
  const entries = Object.entries(cache || {})
   .sort((a, b) => Number(b[1]?.fetchedAt || 0) - Number(a[1]?.fetchedAt || 0))
   .slice(0, 180);
  commodityCandleCacheMemory = Object.fromEntries(entries);
  try {
   await fs.writeFile(commodityCandleCachePath(), JSON.stringify(commodityCandleCacheMemory));
  } catch (error) {
   errorJournal?.append?.('dhan:commodity-candle-cache-write', error);
  }
 }

 async function getCommodityCachedCandles(instrument = {}, resolution = '1d', start = 0, end = Date.now(), options = {}) {
  const key = `${instrument.securityId}:${resolution}`;
  const cache = await readCommodityCandleCache();
  const cached = cache[key];
  const ttl = resolution === '1d' ? COMMODITY_DAILY_CACHE_TTL_MS : COMMODITY_INTRADAY_CACHE_TTL_MS;
  const covers = Number(cached?.start || 0) <= Number(start || 0) + DAY_MS && Number(cached?.end || 0) >= Number(end || 0) - DAY_MS;
  if (!options.force && cached && Date.now() - Number(cached.fetchedAt || 0) < ttl && covers && Array.isArray(cached.rows)) {
   return { ok: true, rows: cached.rows, cached: true };
  }
  const cachedRows = Array.isArray(cached?.rows) ? cached.rows : [];
  const lastCachedTimeMs = cachedRows.length ? Number(cachedRows[cachedRows.length - 1]?.time || 0) * 1000 : 0;
  const canGapFetch = !options.force && cachedRows.length >= 20 && Number(cached?.start || 0) <= Number(start || 0) + DAY_MS && lastCachedTimeMs > 0;
  const gapStart = canGapFetch ? Math.max(Number(start || 0), lastCachedTimeMs - (resolution === '1d' ? DAY_MS * 2 : DAY_MS)) : start;
  const response = await getCandles({ instrument, symbol: instrument.tradingSymbol, resolution, start: gapStart, end, timeoutMs: 45000 });
  if (response?.ok && Array.isArray(response.rows) && response.rows.length) {
   const rows = canGapFetch ? mergeCandleRows([{ rows: cachedRows }, { rows: response.rows }]) : response.rows;
   cache[key] = { fetchedAt: Date.now(), start: canGapFetch ? Math.min(Number(cached?.start || start), Number(start || 0)) : start, end, rows };
   await writeCommodityCandleCache(cache);
   return { ...response, rows, cached: false, incremental: canGapFetch };
  }
  return response;
 }

 function optionCooldownResponse() {
  const retryAfterMs = Math.max(0, optionChainBlockedUntil - Date.now());
  return {
   ok: false,
   status: 429,
   retryAfterMs,
   error: `Option chain is cooling down after a rate-limit warning. Retry in ${Math.max(1, Math.ceil(retryAfterMs / 1000))} seconds.`,
  };
 }

 function handleOptionRateLimit(response = {}) {
  if (!isDhanRateLimitResponse(response)) return null;
  optionChainBlockedUntil = Math.max(optionChainBlockedUntil, Date.now() + DHAN_OPTION_CHAIN_RATE_LIMIT_BACKOFF_MS);
  return optionCooldownResponse();
 }

 async function readCredentials() {
  const response = await credentialStore.getSecureSecret(DHAN_DATA_SECRET);
  if (response?.ok === false) {
   return {
    clientId: '',
    accessToken: '',
    dataMode: 'rest',
    updatedAt: 0,
    error: response.error || 'Market-data API credentials are not available.',
   };
  }
  const value = response?.value?.value || response?.value || {};
  return {
   clientId: String(value.clientId || '').trim(),
   accessToken: String(value.accessToken || '').trim(),
   dataMode: String(value.dataMode || 'rest').trim().toLowerCase() || 'rest',
   updatedAt: Number(value.updatedAt || 0),
  };
 }

 async function saveCredentials(value = {}) {
  const clientId = String(value.clientId || '').trim();
  const accessToken = String(value.accessToken || '').trim();
  if (!clientId || !accessToken) return { ok: false, error: 'Client ID and access token are required.' };
  return credentialStore.setSecureSecret(DHAN_DATA_SECRET, {
   clientId,
   accessToken,
   dataMode: String(value.dataMode || 'rest').trim().toLowerCase() || 'rest',
   updatedAt: Date.now(),
  });
 }

 async function deleteCredentials() {
  return credentialStore.deleteSecureSecret(DHAN_DATA_SECRET);
 }

 async function dhanFetch(pathname = '', options = {}) {
  const credentials = await readCredentials();
  if (!credentials.clientId || !credentials.accessToken) {
   return { ok: false, status: 401, error: credentials.error || 'Market-data API credentials are not configured.' };
  }
  let response;
  try {
   response = await fetch(`${DHAN_API_BASE}${pathname}`, {
    method: options.method || 'GET',
    headers: {
     Accept: 'application/json',
     'Content-Type': 'application/json',
     'access-token': credentials.accessToken,
     'client-id': credentials.clientId,
     'User-Agent': 'FWD-TradeDesk-Pro-NSE-BSE',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(Number(options.timeoutMs || 30000)),
   });
  } catch (error) {
   return { ok: false, status: 0, error: error?.message || 'Dhan network request failed.' };
  }
  const text = await response.text();
  let data = null;
  try {
   data = text ? JSON.parse(text) : null;
  } catch {
   data = text;
  }
  if (!response.ok) {
   return { ok: false, status: response.status, error: dhanErrorMessage(data, text || `HTTP ${response.status}`), raw: data };
  }
  return { ok: true, status: response.status, data, raw: data };
 }

 async function loadInstrumentCache(force = false) {
  if (!force && instrumentCacheMemory && Date.now() - Number(instrumentCacheMemory.fetchedAt || 0) < INSTRUMENT_CACHE_TTL_MS) {
   return instrumentCacheMemory;
  }
  if (!force) {
   try {
    const rawCached = JSON.parse(await fs.readFile(cachePath(), 'utf8'));
    const rawVersion = Number(rawCached?.version || 0);
    const rawHadHeavyRows = Array.isArray(rawCached?.instruments) && rawCached.instruments.some(item => item && typeof item === 'object' && item.raw);
    const cached = compactInstrumentCache(rawCached);
    if (
     rawVersion >= INSTRUMENT_CACHE_VERSION
     && Array.isArray(cached?.instruments)
     && Array.isArray(cached?.fnoStockUniverse)
     && Date.now() - Number(cached.fetchedAt || 0) < INSTRUMENT_CACHE_TTL_MS
    ) {
     instrumentCacheMemory = cached;
     await archiveCommodityContracts(cached.instruments, Date.now());
     if (rawVersion < INSTRUMENT_CACHE_VERSION || rawHadHeavyRows) {
      try {
       await fs.writeFile(cachePath(), JSON.stringify(cached));
      } catch (error) {
       errorJournal?.append?.('dhan:cache-compact', error);
      }
     }
     return instrumentCacheMemory;
    }
   } catch (_) {}
  }
 const response = await fetch(DHAN_INSTRUMENT_MASTER_URL, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Instrument master failed: HTTP ${response.status}`);
  const [text, detailedText] = await Promise.all([
   response.text(),
   fetch(DHAN_INSTRUMENT_MASTER_DETAILED_URL, { signal: AbortSignal.timeout(45000) })
   .then(res => (res.ok ? res.text() : ''))
   .catch(() => ''),
  ]);
  const detailedRows = detailedText ? parseCsv(detailedText) : [];
  const detailedInstruments = detailedRows.map(normalizeInstrument).filter(Boolean);
  const detailBySecurityId = new Map(detailedInstruments.map(item => [String(item.securityId || ''), item]));
  const instruments = [
   ...DHAN_INDEX_PRODUCTS,
   ...parseCsv(text).map(normalizeInstrument).filter(Boolean),
  ].map(item => {
   const detail = detailBySecurityId.get(String(item.securityId || ''));
   if (!detail) return compactInstrument(item);
   return compactInstrument({
    ...item,
    underlyingSecurityId: detail.underlyingSecurityId || item.underlyingSecurityId,
    underlyingSymbol: detail.underlyingSymbol || item.underlyingSymbol,
   });
  }).filter(Boolean);
  const fnoUniverse = buildFnoStockUniverse(instruments, detailedRows);
  const [indexSources, nseAllSource] = await Promise.all([
   fetchIndexUniverseSources(),
   fetchNseAllEquitySymbolSet().catch(error => ({ ok: false, symbols: new Set(), error: error?.message || String(error), url: NSE_EQUITY_LIST_URL })),
  ]);
  const universeCatalog = buildUniverseCatalog({
   instruments,
   fnoStockUniverse: fnoUniverse.fnoStocks,
   indexSources,
   nseAllSource,
  });
  const cache = compactInstrumentCache({
   version: INSTRUMENT_CACHE_VERSION,
   source: DHAN_INSTRUMENT_MASTER_URL,
   detailedSource: DHAN_INSTRUMENT_MASTER_DETAILED_URL,
   fetchedAt: Date.now(),
   instruments,
   fnoStockUniverse: fnoUniverse.fnoStocks,
   fnoUnderlyingIds: fnoUniverse.fnoUnderlyingIds,
   universeCatalog,
  });
  instrumentCacheMemory = cache;
  await fs.writeFile(cachePath(), JSON.stringify(cache));
  await archiveCommodityContracts(cache.instruments, Date.now());
  return instrumentCacheMemory;
 }

 async function findInstrument(symbolOrSecurityId = '') {
  const target = String(symbolOrSecurityId || '').trim().toUpperCase();
  if (!target) return null;
  const cache = await loadInstrumentCache(false);
  const exactSecurity = cache.instruments.find(item => String(item.securityId || '').toUpperCase() === target);
  if (exactSecurity) return exactSecurity;
  const matches = cache.instruments.filter(item => String(item.tradingSymbol || '').toUpperCase() === target || String(item.symbol || '').toUpperCase() === target);
  if (!matches.length) return null;
  return matches.sort((a, b) => {
   const ar = rankInstrumentForScanner(a) + (a.fnoStock ? -5 : 0) + (String(a.exchangeSegment || '').toUpperCase() === 'NSE_FNO' ? 100 : 0);
   const br = rankInstrumentForScanner(b) + (b.fnoStock ? -5 : 0) + (String(b.exchangeSegment || '').toUpperCase() === 'NSE_FNO' ? 100 : 0);
   if (ar !== br) return ar - br;
   return String(a.tradingSymbol || a.symbol || '').localeCompare(String(b.tradingSymbol || b.symbol || ''));
  })[0] || null;
 }

 async function getProducts(message = {}) {
  const cache = await loadInstrumentCache(!!message.force);
  const q = String(message.query || '').trim().toUpperCase();
  const requestedUniverse = normalizeUniverseId(message.universe || message.scope || 'fno_stocks');
  const membership = getUniverseMembershipSet(cache, requestedUniverse);
  const definition = membership.definition;
  const limit = Math.max(1, Math.min(Number(definition.maxLimit || 5000), Number(message.limit || definition.defaultLimit || 1000)));
  const byEquitySecurityId = new Map((Array.isArray(cache.instruments) ? cache.instruments : [])
  .filter(isNseEquityInstrument)
  .map(item => [String(item.securityId || ''), item]));
  const byAnySecurityId = new Map((Array.isArray(cache.instruments) ? cache.instruments : []).map(item => [String(item.securityId || ''), item]));
  const source = membership.securityIds.size
   ? Array.from(membership.securityIds).map(securityId => {
    const id = String(securityId || '');
    return byEquitySecurityId.get(id) || byAnySecurityId.get(id);
   }).filter(Boolean)
   : (Array.isArray(cache.fnoStockUniverse) ? cache.fnoStockUniverse : []);
  const instruments = sortUniverseInstruments(source)
  .filter(item => !q || item.tradingSymbol.includes(q) || item.symbol.includes(q) || item.securityId === q)
  .slice(0, limit)
  .map(item => ({
   ...item,
   selectedUniverse: definition.id,
   universeLabel: definition.label,
   universeTags: Array.from(new Set([...(Array.isArray(item.universeTags) ? item.universeTags : []), definition.id])),
  }));
  const catalog = compactUniverseCatalog(cache.universeCatalog || {});
  return {
   ok: true,
   products: instruments,
   fetchedAt: cache.fetchedAt,
   count: cache.instruments.length,
   universe: definition.id,
   universeLabel: definition.label,
   universeDescription: definition.description,
   universeCount: catalog.counts?.[definition.id] || source.length,
   universeCatalog: catalog,
   fnoStockCount: Array.isArray(cache.fnoStockUniverse) ? cache.fnoStockUniverse.length : 0,
  };
 }

 async function getLtp(message = {}) {
  return getMarketFeed(message, '/marketfeed/ltp');
 }

async function getMarketFeed(message = {}, endpoint = '/marketfeed/ltp') {
  const symbols = Array.isArray(message.symbols) ? message.symbols : [message.symbol || message.securityId].filter(Boolean);
  const requested = [];
  for (const value of symbols) {
   const instrument = typeof value === 'object' ? value : await findInstrument(value);
   if (!instrument?.securityId || !instrument.exchangeSegment) continue;
   requested.push({ exchangeSegment: instrument.exchangeSegment, securityId: Number(instrument.securityId) });
  }
  const allGroups = groupQuoteBatch(requested);
  if (!requested.length) return { ok: false, status: 404, error: 'No valid instruments were found for the market-feed request.', instruments: allGroups };
  const batches = chunkArray(flattenInstrumentGroups(allGroups), Math.min(DHAN_QUOTE_BATCH_SIZE, Math.max(1, Number(message.batchSize || DHAN_QUOTE_BATCH_SIZE))));
  const responses = [];
  for (const batch of batches) {
   let response = null;
   for (let attempt = 0; attempt <= DHAN_QUOTE_MAX_RETRIES; attempt += 1) {
    const waitMs = Math.max(0, nextQuoteRequestAt - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    nextQuoteRequestAt = Date.now() + Math.max(DHAN_QUOTE_MIN_INTERVAL_MS, Number(message.paceMs || DHAN_QUOTE_MIN_INTERVAL_MS));
    response = await dhanFetch(endpoint, { method: 'POST', body: groupQuoteBatch(batch) });
    if (!isDhanRateLimitResponse(response)) break;
    nextQuoteRequestAt = Date.now() + DHAN_QUOTE_RATE_LIMIT_BACKOFF_MS;
    if (attempt < DHAN_QUOTE_MAX_RETRIES) await sleep(DHAN_QUOTE_RATE_LIMIT_BACKOFF_MS);
   }
   responses.push(response);
   if (!response.ok) break;
  }
  return mergeDhanFeedResponses(responses, allGroups);
 }

 function extractQuoteForInstrument(response = {}, instrument = {}) {
  const root = response?.data?.data || response?.data || {};
  const segment = String(instrument.exchangeSegment || '').trim().toUpperCase();
  const securityId = String(instrument.securityId || '').trim();
  return root?.[segment]?.[securityId] || null;
 }

 function depthFillForQuantity(quote = {}, side = '', requiredQuantity = 0) {
  const levels = Array.isArray(quote?.depth?.[side]) ? quote.depth[side] : [];
  const required = Math.max(1, Number(requiredQuantity || 0) || 1);
  let remaining = required;
  let availableQuantity = 0;
  let value = 0;
  let bestPrice = 0;
  levels.forEach(item => {
   const price = Number(item?.price || 0);
   const quantity = Math.max(0, Number(item?.quantity || 0) || 0);
   if (!(price > 0) || !(quantity > 0)) return;
   if (!bestPrice) bestPrice = price;
   availableQuantity += quantity;
   const fillQuantity = Math.min(remaining, quantity);
   if (fillQuantity > 0) {
    value += fillQuantity * price;
    remaining -= fillQuantity;
   }
  });
  return {
   bestPrice,
   availableQuantity,
   complete: remaining <= 0,
   vwap: remaining <= 0 ? value / required : 0,
  };
 }

 function buildFnoCarryRow(pair = {}, quoteResponse = {}, nowMs = Date.now()) {
  const spotQuote = extractQuoteForInstrument(quoteResponse, pair.spot);
  const futureQuote = extractQuoteForInstrument(quoteResponse, pair.nearFuture);
  const nextQuote = pair.nextFuture ? extractQuoteForInstrument(quoteResponse, pair.nextFuture) : null;
  const spotPrice = Number(spotQuote?.last_price || spotQuote?.lastPrice || spotQuote?.ltp || 0);
  const futurePrice = Number(futureQuote?.last_price || futureQuote?.lastPrice || futureQuote?.ltp || 0);
  if (!(spotPrice > 0) || !(futurePrice > 0) || !pair.nearFuture?.expiryMs) return null;
  const hoursToExpiry = (Number(pair.nearFuture.expiryMs) - Number(nowMs || Date.now())) / (60 * 60 * 1000);
  if (!(hoursToExpiry > 0)) return null;
  const daysToExpiry = hoursToExpiry / 24;
  const basis = futurePrice - spotPrice;
  const basisPct = (basis / spotPrice) * 100;
  const carryComparable = daysToExpiry >= 1;
  const annualizedCarryPct = carryComparable ? basisPct * (365 / daysToExpiry) : null;
  const lotSize = Number(pair.nearFuture.lotSize || 1) || 1;
  const nextFuturePrice = Number(nextQuote?.last_price || nextQuote?.lastPrice || nextQuote?.ltp || 0);
  const spotBuyFill = depthFillForQuantity(spotQuote, 'sell', lotSize);
  const futureSellFill = depthFillForQuantity(futureQuote, 'buy', lotSize);
  const spotSellFill = depthFillForQuantity(spotQuote, 'buy', lotSize);
  const futureBuyFill = depthFillForQuantity(futureQuote, 'sell', lotSize);
  const spotAsk = spotBuyFill.vwap;
  const futureBid = futureSellFill.vwap;
  const spotBid = spotSellFill.vwap;
  const futureAsk = futureBuyFill.vwap;
  const depthConfirmed = spotBuyFill.complete && futureSellFill.complete;
  const reverseDepthConfirmed = spotSellFill.complete && futureBuyFill.complete;
  const executableBasis = depthConfirmed ? futureBid - spotAsk : null;
  const executableBasisPct = depthConfirmed ? (executableBasis / spotAsk) * 100 : null;
  const executableAnnualCarryPct = depthConfirmed && carryComparable
   ? executableBasisPct * (365 / daysToExpiry)
   : null;
  const reverseBasis = reverseDepthConfirmed ? futureAsk - spotBid : null;
  return {
   symbol: pair.spot.tradingSymbol || pair.spot.symbol,
   spotInstrument: pair.spot,
   nearFuture: pair.nearFuture,
   nextFuture: pair.nextFuture || null,
   spotPrice,
   futurePrice,
   nextFuturePrice: nextFuturePrice > 0 ? nextFuturePrice : 0,
   basis: +basis.toFixed(4),
   basisPct: +basisPct.toFixed(4),
   annualizedCarryPct: annualizedCarryPct == null ? null : +annualizedCarryPct.toFixed(4),
   carryComparable,
   daysToExpiry: +daysToExpiry.toFixed(2),
   lotSize,
   grossBasisPerLot: +(basis * lotSize).toFixed(2),
   spotBid: spotBid > 0 ? +spotBid.toFixed(4) : 0,
   spotAsk: spotAsk > 0 ? +spotAsk.toFixed(4) : 0,
   futureBid: futureBid > 0 ? +futureBid.toFixed(4) : 0,
   futureAsk: futureAsk > 0 ? +futureAsk.toFixed(4) : 0,
   spotBestAsk: spotBuyFill.bestPrice > 0 ? +spotBuyFill.bestPrice.toFixed(4) : 0,
   futureBestBid: futureSellFill.bestPrice > 0 ? +futureSellFill.bestPrice.toFixed(4) : 0,
   spotAskAvailableQuantity: spotBuyFill.availableQuantity,
   futureBidAvailableQuantity: futureSellFill.availableQuantity,
   depthConfirmed,
   reverseDepthConfirmed,
   executableBasis: executableBasis == null ? null : +executableBasis.toFixed(4),
   executableBasisPct: executableBasisPct == null ? null : +executableBasisPct.toFixed(4),
   executableAnnualCarryPct: executableAnnualCarryPct == null ? null : +executableAnnualCarryPct.toFixed(4),
   executableGrossPerLot: executableBasis == null ? null : +(executableBasis * lotSize).toFixed(2),
   reverseBasis: reverseBasis == null ? null : +reverseBasis.toFixed(4),
   cashRequiredPerLot: depthConfirmed ? +(spotAsk * lotSize).toFixed(2) : +(spotPrice * lotSize).toFixed(2),
   calendarSpread: nextFuturePrice > 0 ? +(nextFuturePrice - futurePrice).toFixed(4) : null,
   oi: Number(futureQuote?.oi || futureQuote?.open_interest || 0) || 0,
   volume: Number(futureQuote?.volume || futureQuote?.total_volume || 0) || 0,
   mode: depthConfirmed ? 'executable_top_of_book' : 'indicative_ltp_basis',
  };
 }

 function buildCommoditySnapshotRow(pair = {}, quoteResponse = {}, nowMs = Date.now()) {
  const nearQuote = extractQuoteForInstrument(quoteResponse, pair.nearFuture);
  const nextQuote = pair.nextFuture ? extractQuoteForInstrument(quoteResponse, pair.nextFuture) : null;
  const nearPrice = Number(nearQuote?.last_price || nearQuote?.lastPrice || nearQuote?.ltp || 0);
  const nextPrice = Number(nextQuote?.last_price || nextQuote?.lastPrice || nextQuote?.ltp || 0);
  if (!(nearPrice > 0)) return null;
  const nearDays = Math.max(0, (Number(pair.nearFuture?.expiryMs || 0) - Number(nowMs || Date.now())) / DAY_MS);
  const nextDays = pair.nextFuture ? Math.max(0, (Number(pair.nextFuture.expiryMs || 0) - Number(nowMs || Date.now())) / DAY_MS) : null;
  const termDays = nextDays == null ? null : Math.max(0, nextDays - nearDays);
  const indicativeSpread = nextPrice > 0 ? nextPrice - nearPrice : null;
  const annualizedSpreadPct = indicativeSpread != null && termDays > 0
   ? (indicativeSpread / nearPrice) * (365 / termDays) * 100
   : null;
  const quantity = Math.max(1, Number(pair.nearFuture?.lotSize || 1) || 1);
  const buyNear = depthFillForQuantity(nearQuote, 'sell', quantity);
  const sellNear = depthFillForQuantity(nearQuote, 'buy', quantity);
  const buyFar = depthFillForQuantity(nextQuote, 'sell', quantity);
  const sellFar = depthFillForQuantity(nextQuote, 'buy', quantity);
  const carryDepth = !!pair.nextFuture && buyNear.complete && sellFar.complete;
  const reverseDepth = !!pair.nextFuture && sellNear.complete && buyFar.complete;
  const carrySpread = carryDepth ? sellFar.vwap - buyNear.vwap : null;
  const reverseSpread = reverseDepth ? sellNear.vwap - buyFar.vwap : null;
  const executableDirection = carrySpread == null && reverseSpread == null
   ? ''
   : Number(carrySpread ?? -Infinity) >= Number(reverseSpread ?? -Infinity)
    ? 'Buy near / Sell far'
    : 'Sell near / Buy far';
  const executableSpread = executableDirection === 'Buy near / Sell far' ? carrySpread : reverseSpread;
  return {
   symbol: pair.symbol,
   nearFuture: pair.nearFuture,
   nextFuture: pair.nextFuture || null,
   expiryCount: Number(pair.expiryCount || 1),
   nearPrice: +nearPrice.toFixed(4),
   nextPrice: nextPrice > 0 ? +nextPrice.toFixed(4) : 0,
   nearDays: +nearDays.toFixed(2),
   nextDays: nextDays == null ? null : +nextDays.toFixed(2),
   termDays: termDays == null ? null : +termDays.toFixed(2),
   indicativeSpread: indicativeSpread == null ? null : +indicativeSpread.toFixed(4),
   annualizedSpreadPct: annualizedSpreadPct == null ? null : +annualizedSpreadPct.toFixed(4),
   oi: Number(nearQuote?.oi || nearQuote?.open_interest || 0) || 0,
   volume: Number(nearQuote?.volume || nearQuote?.total_volume || 0) || 0,
   nearBid: sellNear.bestPrice > 0 ? +sellNear.bestPrice.toFixed(4) : 0,
   nearAsk: buyNear.bestPrice > 0 ? +buyNear.bestPrice.toFixed(4) : 0,
   nextBid: sellFar.bestPrice > 0 ? +sellFar.bestPrice.toFixed(4) : 0,
   nextAsk: buyFar.bestPrice > 0 ? +buyFar.bestPrice.toFixed(4) : 0,
   depthConfirmed: carryDepth || reverseDepth,
   executableDirection,
   executableSpread: executableSpread == null ? null : +executableSpread.toFixed(4),
   quoteQuantity: quantity,
  };
 }

 async function getFnoCarry(message = {}) {
  const cache = await loadInstrumentCache(!!message.forceInstruments);
  const nowMs = Number(message.at || Date.now()) || Date.now();
  const q = String(message.query || '').trim().toUpperCase();
  const maxRows = Math.max(1, Math.min(250, Number(message.limit || 209)));
  const contracts = buildFnoCarryContracts(cache.instruments, cache.fnoStockUniverse, nowMs)
   .filter(pair => !q || String(pair.spot.tradingSymbol || pair.spot.symbol || '').includes(q))
   .slice(0, maxRows);
  const instruments = contracts.flatMap(pair => [pair.spot, pair.nearFuture, pair.nextFuture].filter(Boolean));
  if (!instruments.length) return {
   ok: true,
   rows: [],
   totalContracts: 0,
   updatedAt: Date.now(),
   message: 'No active NSE stock future contracts were found.',
  };
  const quotes = await getMarketFeed({
   symbols: instruments,
   batchSize: DHAN_QUOTE_BATCH_SIZE,
   paceMs: DHAN_QUOTE_MIN_INTERVAL_MS,
  }, '/marketfeed/quote');
  if (!quotes?.ok) return quotes;
  const rows = contracts.map(pair => buildFnoCarryRow(pair, quotes, nowMs)).filter(Boolean)
   .sort((a, b) => Math.abs(b.executableAnnualCarryPct ?? b.annualizedCarryPct ?? 0) - Math.abs(a.executableAnnualCarryPct ?? a.annualizedCarryPct ?? 0));
  const premiums = rows.filter(row => row.basis > 0);
  const discounts = rows.filter(row => row.basis < 0);
  const depthRows = rows.filter(row => row.depthConfirmed);
  const comparablePremiums = depthRows.filter(row => row.carryComparable && row.executableBasis > 0);
  const comparableDiscounts = depthRows.filter(row => row.carryComparable && row.executableBasis < 0);
  return {
   ok: true,
   rows,
   totalContracts: contracts.length,
   quotedContracts: rows.length,
   premiums: premiums.length,
   discounts: discounts.length,
   depthConfirmedRows: depthRows.length,
   expiryDayRows: rows.filter(row => !row.carryComparable).length,
   strongestPremium: comparablePremiums.slice().sort((a, b) => b.executableAnnualCarryPct - a.executableAnnualCarryPct)[0] || null,
   strongestDiscount: comparableDiscounts.slice().sort((a, b) => a.executableAnnualCarryPct - b.executableAnnualCarryPct)[0] || null,
   updatedAt: Date.now(),
   apiCalls: Number(quotes.apiCalls || 0),
   methodology: 'Execution basis uses one-lot cash buy and futures sell VWAP from one depth snapshot. Costs, financing and corporate actions must still be checked.',
  };
 }

 async function getCommoditySnapshot(message = {}) {
  const cache = await loadInstrumentCache(!!message.forceInstruments);
  const nowMs = Number(message.at || Date.now()) || Date.now();
  const q = String(message.query || '').trim().toUpperCase();
  const maxRows = Math.max(1, Math.min(80, Number(message.limit || 40)));
  const pairs = buildCommodityFuturePairs(cache.instruments, nowMs)
   .filter(pair => !q || pair.symbol.includes(q) || String(pair.nearFuture?.tradingSymbol || '').includes(q))
   .slice(0, maxRows);
  const instruments = pairs.flatMap(pair => [pair.nearFuture, pair.nextFuture].filter(Boolean));
  if (!instruments.length) return {
   ok: true,
   rows: [],
   totalUnderlyings: 0,
   updatedAt: Date.now(),
   message: 'No active MCX commodity futures were found.',
  };
  const quotes = await getMarketFeed({
   symbols: instruments,
   batchSize: DHAN_QUOTE_BATCH_SIZE,
   paceMs: DHAN_QUOTE_MIN_INTERVAL_MS,
  }, '/marketfeed/quote');
  if (!quotes?.ok) return quotes;
  const rows = pairs.map(pair => buildCommoditySnapshotRow(pair, quotes, nowMs)).filter(Boolean)
   .sort((a, b) => {
    const ar = MCX_FEATURED_RANK.has(a.symbol) ? MCX_FEATURED_RANK.get(a.symbol) : 999;
    const br = MCX_FEATURED_RANK.has(b.symbol) ? MCX_FEATURED_RANK.get(b.symbol) : 999;
    return ar - br || Math.abs(Number(b.annualizedSpreadPct || 0)) - Math.abs(Number(a.annualizedSpreadPct || 0));
   });
  return {
   ok: true,
   readOnly: true,
   rows,
   totalUnderlyings: pairs.length,
   pairedUnderlyings: rows.filter(row => row.nextFuture).length,
   depthConfirmedRows: rows.filter(row => row.depthConfirmed).length,
   updatedAt: Date.now(),
   apiCalls: Number(quotes.apiCalls || 0),
   methodology: 'Calendar spread observation compares near and next MCX futures. It is not physical cash-and-carry and is not an order recommendation.',
  };
 }

 function buildCommoditySpreadSnapshotRow(pair = {}, quoteResponse = {}) {
  const firstQuote = extractQuoteForInstrument(quoteResponse, pair.firstInstrument);
  const secondQuote = extractQuoteForInstrument(quoteResponse, pair.secondInstrument);
  const firstPrice = Number(firstQuote?.last_price || firstQuote?.lastPrice || firstQuote?.ltp || 0);
  const secondPrice = Number(secondQuote?.last_price || secondQuote?.lastPrice || secondQuote?.ltp || 0);
  if (!(firstPrice > 0) || !(secondPrice > 0)) return null;
  const firstQuantity = Math.max(1, Number(pair.firstInstrument?.lotSize || 1) * Number(pair.firstLots || 1));
  const secondQuantity = Math.max(1, Number(pair.secondInstrument?.lotSize || 1) * Number(pair.secondLots || 1));
  const buyFirst = depthFillForQuantity(firstQuote, 'sell', firstQuantity);
  const sellFirst = depthFillForQuantity(firstQuote, 'buy', firstQuantity);
  const buySecond = depthFillForQuantity(secondQuote, 'sell', secondQuantity);
  const sellSecond = depthFillForQuantity(secondQuote, 'buy', secondQuantity);
  const wideningDepth = sellFirst.complete && buySecond.complete;
  const narrowingDepth = buyFirst.complete && sellSecond.complete;
  const snapshot = {
   ...pair,
   firstPrice: +firstPrice.toFixed(4),
   secondPrice: +secondPrice.toFixed(4),
   spread: +(secondPrice - firstPrice).toFixed(4),
   wideningEntrySpread: wideningDepth ? +(buySecond.vwap - sellFirst.vwap).toFixed(4) : null,
   narrowingEntrySpread: narrowingDepth ? +(sellSecond.vwap - buyFirst.vwap).toFixed(4) : null,
   wideningDepth,
   narrowingDepth,
   depthConfirmed: wideningDepth || narrowingDepth,
   firstQuantity,
   secondQuantity,
   firstBid: sellFirst.bestPrice > 0 ? +sellFirst.bestPrice.toFixed(4) : 0,
   firstAsk: buyFirst.bestPrice > 0 ? +buyFirst.bestPrice.toFixed(4) : 0,
   secondBid: sellSecond.bestPrice > 0 ? +sellSecond.bestPrice.toFixed(4) : 0,
   secondAsk: buySecond.bestPrice > 0 ? +buySecond.bestPrice.toFixed(4) : 0,
   firstVolume: Number(firstQuote?.volume || 0) || 0,
   secondVolume: Number(secondQuote?.volume || 0) || 0,
   firstOi: Number(firstQuote?.oi || firstQuote?.open_interest || 0) || 0,
   secondOi: Number(secondQuote?.oi || secondQuote?.open_interest || 0) || 0,
   executableUpdatedAt: Date.now(),
  };
  return {
   ...snapshot,
   costs: commoditySpreadCostEstimate(pair, snapshot),
   safeguards: commoditySpreadSafeguards(pair, snapshot),
  };
 }

 async function resolveCommoditySpreadPair(message = {}) {
  const firstInstrument = message.firstInstrument && typeof message.firstInstrument === 'object'
   ? message.firstInstrument
   : await findInstrument(message.firstSymbol || message.firstSecurityId);
  const secondInstrument = message.secondInstrument && typeof message.secondInstrument === 'object'
   ? message.secondInstrument
   : await findInstrument(message.secondSymbol || message.secondSecurityId);
  if (!firstInstrument || !secondInstrument
   || firstInstrument.exchangeSegment !== 'MCX_COMM' || secondInstrument.exchangeSegment !== 'MCX_COMM'
   || firstInstrument.instrument !== 'FUTCOM' || secondInstrument.instrument !== 'FUTCOM') return null;
  return {
   key: String(message.key || `custom:${firstInstrument.securityId}:${secondInstrument.securityId}`),
   type: String(message.type || 'calendar') === 'matched' ? 'matched' : 'calendar',
   family: String(message.family || firstInstrument.underlyingSymbol || firstInstrument.symbol || 'MCX'),
   label: String(message.label || `${firstInstrument.tradingSymbol} / ${secondInstrument.tradingSymbol}`),
   canonicalLabel: String(message.canonicalLabel || 'Second - First'),
   firstInstrument,
   secondInstrument,
   firstRole: String(message.firstRole || 'first'),
   secondRole: String(message.secondRole || 'second'),
   firstLots: Math.max(1, Math.round(Number(message.firstLots || 1))),
   secondLots: Math.max(1, Math.round(Number(message.secondLots || 1))),
  };
 }

 async function resolveCommodityCalendarPairByUnderlying(underlying = '', options = {}) {
  const symbol = String(underlying || '').trim().toUpperCase();
  if (!symbol) return null;
  const cache = await loadInstrumentCache(options.forceInstruments === true);
  const family = buildCommodityFuturePairs(cache.instruments, Number(options.at || Date.now()) || Date.now())
   .find(item => item.symbol === symbol && item.nearFuture && item.nextFuture);
  if (!family) return null;
  return {
   key: `calendar:${family.nearFuture.securityId}:${family.nextFuture.securityId}`,
   type: 'calendar',
   family: symbol,
   label: `${symbol} near / next`,
   canonicalLabel: 'Far - Near',
   firstInstrument: family.nearFuture,
   secondInstrument: family.nextFuture,
   firstRole: 'near',
   secondRole: 'far',
   firstLots: 1,
   secondLots: 1,
  };
 }

 async function fetchCommoditySpreadHistoryEntry(pair = {}, options = {}) {
  const nowMs = Number(options.end || Date.now()) || Date.now();
  const dailyStart = Number(options.dailyStart || nowMs - COMMODITY_SPREAD_DAILY_HISTORY_DAYS * DAY_MS);
  const intradayStart = Number(options.intradayStart || nowMs - COMMODITY_SPREAD_INTRADAY_HISTORY_DAYS * DAY_MS);
  const nearDaily = await getCandles({
    instrument: pair.firstInstrument,
    resolution: '1d',
    expiryCode: 0,
    oi: true,
    start: dailyStart,
    end: nowMs,
    timeoutMs: 45000,
   });
  const farDaily = await getCandles({
    instrument: pair.firstInstrument,
    resolution: '1d',
    expiryCode: 1,
    oi: true,
    start: dailyStart,
    end: nowMs,
    timeoutMs: 45000,
   });
  if (!nearDaily?.ok || !farDaily?.ok) {
   throw new Error(nearDaily?.error || farDaily?.error || `${pair.family} rolling daily history failed.`);
  }
  const daily = buildCommoditySpreadClosePoints(nearDaily.rows, farDaily.rows);
  const nearIntraday = await getCommodityCachedCandles(pair.firstInstrument, '5m', intradayStart, nowMs, { force: options.force === true });
  const farIntraday = await getCommodityCachedCandles(pair.secondInstrument, '5m', intradayStart, nowMs, { force: options.force === true });
  const intraday = nearIntraday?.ok && farIntraday?.ok
   ? buildCommoditySynchronizedSpreadCandles(nearIntraday.rows, farIntraday.rows, 3600)
   : [];
  const rollEvents = buildCommoditySpreadRollEvents(daily, pair);
  return {
   family: pair.family,
   pair,
   daily,
   intraday,
   bands: buildCommoditySpreadBands(daily, 60),
   rollEvents,
   coverage: {
    requestedDailyDays: COMMODITY_SPREAD_DAILY_HISTORY_DAYS,
    requestedIntradayDays: COMMODITY_SPREAD_INTRADAY_HISTORY_DAYS,
    dailyCandles: daily.length,
    intradayCandles: intraday.length,
    dailyStart: daily[0]?.time || 0,
    dailyEnd: daily[daily.length - 1]?.time || 0,
    intradayStart: intraday[0]?.time || 0,
    intradayEnd: intraday[intraday.length - 1]?.time || 0,
   },
   sourceQuality: {
    daily: 'dhan_rolling_expiry_code',
    intraday: intraday.length ? 'exact_active_contract_synchronized_5m' : 'unavailable',
    exactHistoricalContractArchive: false,
    note: 'Daily history uses Dhan rolling expiry codes. Exact contract identities are archived prospectively from this release.',
   },
   fetchedAt: Date.now(),
  };
 }

 async function runCommoditySpreadBackfill(options = {}) {
  const force = options.force === true;
  const requested = Array.isArray(options.underlyings) && options.underlyings.length
   ? options.underlyings
   : COMMODITY_SPREAD_FEATURED_UNDERLYINGS;
  const underlyings = Array.from(new Set(requested.map(value => String(value || '').trim().toUpperCase()).filter(Boolean)));
  const store = await readCommoditySpreadHistory();
  commoditySpreadBackfillStatus = {
   running: true,
   cancelRequested: false,
   startedAt: Date.now(),
   completedAt: 0,
   currentUnderlying: '',
   completed: 0,
   total: underlyings.length,
   errors: [],
  };
  for (const underlying of underlyings) {
   if (commoditySpreadBackfillStatus.cancelRequested) break;
   commoditySpreadBackfillStatus.currentUnderlying = underlying;
   try {
    const existing = store.families[underlying];
    const pair = await resolveCommodityCalendarPairByUnderlying(underlying);
    if (!pair) throw new Error('Active near/next MCX contracts were not found.');
    const pairChanged = String(existing?.pair?.firstInstrument?.securityId || '') !== String(pair.firstInstrument.securityId)
     || String(existing?.pair?.secondInstrument?.securityId || '') !== String(pair.secondInstrument.securityId);
    const fresh = existing && !pairChanged && Date.now() - Number(existing.fetchedAt || 0) < COMMODITY_DAILY_CACHE_TTL_MS;
    if (!force && fresh) {
     commoditySpreadBackfillStatus.completed += 1;
     continue;
    }
    store.families[underlying] = await fetchCommoditySpreadHistoryEntry(pair, { force });
    await writeCommoditySpreadHistory(store);
   } catch (error) {
    commoditySpreadBackfillStatus.errors.push({ underlying, error: error?.message || String(error) });
    errorJournal?.append?.('dhan:commodity-spread-backfill', error, { underlying });
   }
   commoditySpreadBackfillStatus.completed += 1;
  }
  commoditySpreadBackfillStatus.running = false;
  commoditySpreadBackfillStatus.completedAt = Date.now();
  commoditySpreadBackfillStatus.currentUnderlying = '';
  return { ...commoditySpreadBackfillStatus };
 }

async function startCommoditySpreadBackfill(message = {}) {
  if (commoditySpreadBackfillPromise) {
   return { ok: true, started: false, status: { ...commoditySpreadBackfillStatus } };
  }
  const requested = Array.isArray(message.underlyings) && message.underlyings.length
   ? message.underlyings
   : COMMODITY_SPREAD_FEATURED_UNDERLYINGS;
  commoditySpreadBackfillStatus = {
   running: true,
   cancelRequested: false,
   startedAt: Date.now(),
   completedAt: 0,
   currentUnderlying: '',
   completed: 0,
   total: Array.from(new Set(requested.map(value => String(value || '').trim().toUpperCase()).filter(Boolean))).length,
   errors: [],
  };
  commoditySpreadBackfillPromise = runCommoditySpreadBackfill(message)
   .catch(error => {
    commoditySpreadBackfillStatus.running = false;
    commoditySpreadBackfillStatus.completedAt = Date.now();
    commoditySpreadBackfillStatus.errors.push({ underlying: commoditySpreadBackfillStatus.currentUnderlying, error: error?.message || String(error) });
   })
   .finally(() => {
    commoditySpreadBackfillPromise = null;
   });
  return { ok: true, started: true, status: { ...commoditySpreadBackfillStatus } };
 }

 async function getCommoditySpreadBackfillStatus() {
  const store = await readCommoditySpreadHistory();
  const storedFamilies = Object.keys(store.families || {}).filter(key => Number(store.families[key]?.coverage?.dailyCandles || 0) > 0);
  const status = { ...commoditySpreadBackfillStatus };
  if (!status.running && !status.startedAt && storedFamilies.length) {
   status.completed = storedFamilies.length;
   status.total = COMMODITY_SPREAD_FEATURED_UNDERLYINGS.length;
   status.completedAt = Number(store.updatedAt || 0);
  }
  return { ok: true, status, storedFamilies };
 }

 function cancelCommoditySpreadBackfill() {
  commoditySpreadBackfillStatus.cancelRequested = true;
  return { ok: true, status: { ...commoditySpreadBackfillStatus } };
 }

 async function getCommoditySpreadExpiryCatalog(message = {}) {
  const underlying = String(message.underlying || message.family || '').trim().toUpperCase();
  const archive = await readCommodityContractArchive();
  const contracts = Object.values(archive.contracts || {})
   .filter(item => !underlying || item.underlyingSymbol === underlying)
   .sort((a, b) => parseDerivativeExpiryMs(a.expiry) - parseDerivativeExpiryMs(b.expiry));
  return {
   ok: true,
   underlying,
   contracts,
   pairSnapshots: underlying ? (archive.pairSnapshots?.[underlying] || []) : archive.pairSnapshots || {},
   updatedAt: Number(archive.updatedAt || 0),
   methodology: 'Contract identities are retained prospectively. Historical Dhan rolling expiry-code segments are labelled separately.',
  };
 }

 async function getCommoditySpreadContinuousChart(message = {}) {
  const underlying = String(message.underlying || message.family || message.firstInstrument?.underlyingSymbol || '').trim().toUpperCase();
  const view = ['current', 'historical', 'continuous'].includes(String(message.view || '').toLowerCase())
   ? String(message.view).toLowerCase()
   : 'continuous';
  const resolution = String(message.resolution || '1d').toLowerCase();
  const pair = await resolveCommoditySpreadPair(message) || await resolveCommodityCalendarPairByUnderlying(underlying);
  if (!pair) return { ok: false, status: 404, error: 'Active near/next commodity contracts were not found.' };
  const store = await readCommoditySpreadHistory();
  let entry = store.families[pair.family];
  const pairChanged = String(entry?.pair?.firstInstrument?.securityId || '') !== String(pair.firstInstrument.securityId)
   || String(entry?.pair?.secondInstrument?.securityId || '') !== String(pair.secondInstrument.securityId);
  if (!entry || pairChanged || message.force === true) {
   try {
    entry = await fetchCommoditySpreadHistoryEntry(pair, { force: message.force === true });
    store.families[pair.family] = entry;
    await writeCommoditySpreadHistory(store);
   } catch (error) {
    return { ok: false, status: 502, error: error?.message || 'Commodity spread history could not be built.' };
   }
  }
  const quoteResponse = await getMarketFeed({ symbols: [pair.firstInstrument, pair.secondInstrument] }, '/marketfeed/quote');
  const snapshot = quoteResponse?.ok ? buildCommoditySpreadSnapshotRow(pair, quoteResponse) : { ...pair };
  let rows = resolution === '1d' ? entry.daily : entry.intraday;
  if (view === 'current') {
   const currentStart = parseDerivativeExpiryMs(pair.firstInstrument.expiry) - COMMODITY_SPREAD_MAX_DAILY_LOOKBACK_DAYS * DAY_MS;
   rows = rows.filter(row => Number(row.time) * 1000 >= currentStart);
  }
  const decision = buildCommoditySpreadDecision({
   dailyRows: entry.daily,
   intradayRows: entry.intraday,
   pair,
   snapshot,
  });
  const archive = await readCommodityContractArchive();
  const pairSnapshots = archive.pairSnapshots?.[pair.family] || [];
  const sourceQuality = {
   ...entry.sourceQuality,
   exactHistoricalContractArchive: pairSnapshots.length > 1,
   archivedPairSnapshots: pairSnapshots.length,
  };
  return {
   ok: true,
   readOnly: true,
   symbol: `MCX-SPREAD:${pair.key}`,
   displayName: `${pair.label} | ${pair.canonicalLabel}`,
   timeframe: resolution === '1d' ? '1d' : '1h',
   chartType: resolution === '1d' ? 'line' : 'candles',
   candles: rows,
   points: resolution === '1d' ? rows : [],
   bands: entry.bands,
   rollEvents: entry.rollEvents,
   coverage: entry.coverage,
   sourceQuality,
   regime: decision.regime,
   zScore: decision.zScore,
   percentile: decision.percentile,
   action: decision.action,
   decision,
   legs: decision.legs,
   executableEntry: decision.entry,
   stop: decision.stop,
   target: decision.target,
   costAdjustedEdge: {
    targetMove: decision.targetMove,
    requiredMove: decision.costRequiredMove,
    available: decision.costEdgeAvailable,
    expectedNetPnl: decision.expectedNetPnl,
   },
   confidence: decision.confidence,
   blockers: decision.blockers,
   pair,
   snapshot,
   view,
   historyMode: view === 'current'
    ? 'active_contract_pair'
    : view === 'historical'
     ? 'archived_contract_catalog_with_dhan_rolling_chart'
     : 'continuous_dhan_rolling',
   expiryCatalog: Object.values(archive.contracts || {}).filter(item => item.underlyingSymbol === pair.family),
   pairSnapshots,
   expiryCatalogCount: Object.values(archive.contracts || {}).filter(item => item.underlyingSymbol === pair.family).length,
   methodology: resolution === '1d'
    ? `${view === 'historical' ? 'Archived contract identities are shown separately; unavailable expired-contract candles are not fabricated. ' : ''}Daily continuous spread uses Far close minus Near close. It does not fabricate synthetic daily highs or lows.`
    : 'Hourly spread candles aggregate synchronized five-minute Far-close minus Near-close observations.',
  };
 }

 async function getCommoditySpreadChart(message = {}) {
  const pair = await resolveCommoditySpreadPair(message);
  if (!pair) return { ok: false, status: 400, error: 'Synthetic spread chart supports two MCX futures contracts only.' };
  const resolution = String(message.resolution || '1d');
  const end = Number(message.end || Date.now()) || Date.now();
  const start = Number(message.start || (end - (resolution === '1d' ? 730 : 90) * DAY_MS)) || (end - 730 * DAY_MS);
  const [firstHistory, secondHistory] = await Promise.all([
   getCommodityCachedCandles(pair.firstInstrument, resolution, start, end, { force: message.force === true }),
   getCommodityCachedCandles(pair.secondInstrument, resolution, start, end, { force: message.force === true }),
  ]);
  if (!firstHistory?.ok || !secondHistory?.ok) return !firstHistory?.ok ? firstHistory : secondHistory;
  const clipped = clipCommoditySpreadRowsForPair(pair, firstHistory.rows, secondHistory.rows, resolution, start, end);
  const candles = buildCommoditySpreadCandles(clipped.firstRows, clipped.secondRows);
  const analysis = analyzeCommoditySpreadCandles(candles);
  return {
   ok: true,
   readOnly: true,
   symbol: `MCX-SPREAD:${pair.key}`,
   displayName: `${pair.label} | ${pair.canonicalLabel}`,
   timeframe: resolution,
   candles,
   analysis,
   pair,
   historyStart: clipped.start,
   historyEnd: clipped.end,
   discardedCandles: Math.max(0, Number(firstHistory.rows?.length || 0) - clipped.firstRows.length) + Math.max(0, Number(secondHistory.rows?.length || 0) - clipped.secondRows.length),
   methodology: 'Synthetic spread candle is second-leg price minus first-leg price. Daily spread history is clipped to the active front-contract window so stale/continuous futures rows are not mixed into the chart. A rising chart is widening; a falling chart is narrowing.',
  };
 }

 async function getCommoditySpreadScanner(message = {}) {
  const cache = await loadInstrumentCache(!!message.forceInstruments);
  const nowMs = Number(message.at || Date.now()) || Date.now();
  const limit = Math.max(1, Math.min(40, Number(message.limit || 24)));
  const type = String(message.spreadType || 'all').toLowerCase();
  const query = String(message.query || '').trim().toUpperCase();
  const pairs = buildCommoditySpreadPairs(buildCommodityFuturePairs(cache.instruments, nowMs))
   .filter(pair => type === 'all' || pair.type === type)
   .filter(pair => !query || `${pair.family} ${pair.label} ${pair.firstInstrument?.tradingSymbol} ${pair.secondInstrument?.tradingSymbol}`.toUpperCase().includes(query))
   .slice(0, limit);
  const instruments = Array.from(new Map(pairs.flatMap(pair => [pair.firstInstrument, pair.secondInstrument]).map(instrument => [String(instrument.securityId), instrument])).values());
  if (!instruments.length) return { ok: true, rows: [], totalPairs: 0, updatedAt: Date.now() };
  const quotes = await getMarketFeed({ symbols: instruments, batchSize: DHAN_QUOTE_BATCH_SIZE, paceMs: DHAN_QUOTE_MIN_INTERVAL_MS }, '/marketfeed/quote');
  if (!quotes?.ok) return quotes;
  const snapshots = pairs.map(pair => buildCommoditySpreadSnapshotRow(pair, quotes)).filter(Boolean);
  const start = nowMs - Math.max(120, Number(message.historyDays || 365)) * DAY_MS;
  const historyBySecurityId = new Map();
  for (const instrument of instruments) {
   try {
    const history = await getCommodityCachedCandles(instrument, '1d', start, nowMs, { force: message.force === true });
    historyBySecurityId.set(String(instrument.securityId), history?.ok ? (history.rows || []) : []);
   } catch (_) {
    historyBySecurityId.set(String(instrument.securityId), []);
   }
  }
  const rows = [];
  const spreadHistoryStore = await readCommoditySpreadHistory();
  for (const row of snapshots) {
   const firstRows = historyBySecurityId.get(String(row.firstInstrument?.securityId)) || [];
   const secondRows = historyBySecurityId.get(String(row.secondInstrument?.securityId)) || [];
   const clipped = clipCommoditySpreadRowsForPair(row, firstRows, secondRows, '1d', start, nowMs);
   const candles = buildCommoditySpreadCandles(clipped.firstRows, clipped.secondRows);
   const stored = spreadHistoryStore.families?.[row.family] || null;
   const decision = buildCommoditySpreadDecision({
    dailyRows: stored?.daily?.length ? stored.daily : buildCommoditySpreadClosePoints(clipped.firstRows, clipped.secondRows),
    intradayRows: stored?.intraday || [],
    pair: row,
    snapshot: row,
   });
   const direction = decision.action === 'BUY_SPREAD' ? 'widening' : decision.action === 'SELL_SPREAD' ? 'narrowing' : 'range';
   rows.push({
    ...row,
    analysis: {
     ...decision,
     direction,
     tradeAllowed: decision.action !== 'WAIT',
     score: decision.confidenceScore,
     entryTrigger: decision.entry,
     stopSpread: decision.stop,
     targetSpread: decision.target,
     reasons: [decision.reason],
     },
    matchedCandles: candles.length,
    continuousCoverage: stored?.coverage || null,
    sourceQuality: stored?.sourceQuality || null,
   });
  }
  rows.sort((a, b) => Number(b.analysis?.score || 0) - Number(a.analysis?.score || 0) || String(a.label).localeCompare(String(b.label)));
  return {
   ok: true,
   readOnly: true,
   rows,
   totalPairs: pairs.length,
   widening: rows.filter(row => row.analysis?.direction === 'widening').length,
   narrowing: rows.filter(row => row.analysis?.direction === 'narrowing').length,
   ranging: rows.filter(row => row.analysis?.direction === 'range').length,
   updatedAt: Date.now(),
   methodology: 'Direction is derived from the synthetic spread series, not from the current bid/ask snapshot. No order is placed.',
  };
 }

 async function getCommoditySpreadQuotes(message = {}) {
  const rawPairs = Array.isArray(message.pairs) ? message.pairs.slice(0, 40) : [];
  const pairs = [];
  for (const raw of rawPairs) {
   const pair = await resolveCommoditySpreadPair(raw);
   if (pair) pairs.push(pair);
  }
  const instruments = Array.from(new Map(pairs.flatMap(pair => [pair.firstInstrument, pair.secondInstrument]).map(instrument => [String(instrument.securityId), instrument])).values());
  if (!instruments.length) return { ok: true, rows: [], updatedAt: Date.now() };
  const quotes = await getMarketFeed({ symbols: instruments, batchSize: DHAN_QUOTE_BATCH_SIZE, paceMs: DHAN_QUOTE_MIN_INTERVAL_MS }, '/marketfeed/quote');
  if (!quotes?.ok) return quotes;
  return {
   ok: true,
   readOnly: true,
   rows: pairs.map(pair => buildCommoditySpreadSnapshotRow(pair, quotes)).filter(Boolean),
   updatedAt: Date.now(),
   methodology: 'Executable spread prices are refreshed from Dhan market depth snapshots.',
  };
 }

 async function getCommodityMarginPreview(message = {}) {
  const rawLegs = Array.isArray(message.legs) ? message.legs.slice(0, 2) : [];
  if (!rawLegs.length) return { ok: false, status: 400, error: 'Select at least one commodity future leg for margin preview.' };
  const productType = String(message.productType || 'MARGIN').trim().toUpperCase() === 'INTRADAY' ? 'INTRADAY' : 'MARGIN';
  const credentials = await readCredentials();
  if (!credentials.clientId || !credentials.accessToken) {
   return { ok: false, status: 401, error: credentials.error || 'Market-data API credentials are not configured.' };
  }
  const legs = [];
  for (const rawLeg of rawLegs) {
   const instrument = await findInstrument(rawLeg?.securityId || rawLeg?.tradingSymbol || rawLeg?.symbol);
   if (!instrument || instrument.exchangeSegment !== 'MCX_COMM' || instrument.instrument !== 'FUTCOM') {
    return { ok: false, status: 400, error: 'Margin preview supports active MCX commodity futures only.' };
   }
   const transactionType = String(rawLeg.transactionType || '').trim().toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
   const quantity = Math.max(1, Math.round(Number(rawLeg.quantity || instrument.lotSize || 1)));
   const price = Math.max(0, Number(rawLeg.price || 0));
   if (!(price > 0)) return { ok: false, status: 400, error: `A current price is required for ${instrument.tradingSymbol}.` };
   legs.push({
    instrument,
    transactionType,
    quantity,
    price: +price.toFixed(4),
    request: {
     dhanClientId: credentials.clientId,
     exchangeSegment: 'MCX_COMM',
     transactionType,
     quantity,
     productType,
     securityId: String(instrument.securityId),
     price: +price.toFixed(4),
     triggerPrice: 0,
    },
   });
  }
  let combined = null;
  let calculationMode = 'individual_legs';
  if (legs.length > 1) {
   const multi = await dhanFetch('/margincalculator/multi', {
    method: 'POST',
    body: {
     includePosition: true,
     includeOrder: true,
     dhanClientId: credentials.clientId,
     scripList: legs.map(leg => {
      const { dhanClientId, ...request } = leg.request;
      return request;
     }),
    },
   });
   if (multi.ok) {
    const value = multi.data || {};
    combined = {
     totalMargin: finiteNumber(value.totalMargin ?? value.total_margin, 0),
     spanMargin: finiteNumber(value.spanMargin ?? value.span_margin, 0),
     exposureMargin: finiteNumber(value.exposureMargin ?? value.exposure_margin, 0),
     variableMargin: finiteNumber(value.variableMargin ?? value.variable_margin ?? value.commodity_margin, 0),
     brokerage: finiteNumber(value.brokerage, 0),
     availableBalance: finiteNumber(value.availableBalance ?? value.available_balance, 0),
     insufficientBalance: finiteNumber(value.insufficientBalance ?? value.insufficient_balance, 0),
     hedgeBenefit: finiteNumber(value.hedgeBenefit ?? value.hedge_benefit, 0),
    };
    calculationMode = 'combined_margin';
   }
  }
  const previews = [];
  for (const leg of legs) {
   const response = await dhanFetch('/margincalculator', { method: 'POST', body: leg.request });
   if (!response.ok) return response;
   const value = response.data || {};
   previews.push({
    tradingSymbol: leg.instrument.tradingSymbol,
    securityId: leg.instrument.securityId,
    transactionType: leg.transactionType,
    quantity: leg.quantity,
    price: leg.price,
    totalMargin: finiteNumber(value.totalMargin, 0),
    spanMargin: finiteNumber(value.spanMargin, 0),
    exposureMargin: finiteNumber(value.exposureMargin, 0),
    variableMargin: finiteNumber(value.variableMargin, 0),
    brokerage: finiteNumber(value.brokerage, 0),
    availableBalance: finiteNumber(value.availableBalance, 0),
    insufficientBalance: finiteNumber(value.insufficientBalance, 0),
    leverage: String(value.leverage || ''),
   });
  }
  const individualTotal = previews.reduce((summary, leg) => ({
   totalMargin: summary.totalMargin + leg.totalMargin,
   spanMargin: summary.spanMargin + leg.spanMargin,
   exposureMargin: summary.exposureMargin + leg.exposureMargin,
   variableMargin: summary.variableMargin + leg.variableMargin,
   brokerage: summary.brokerage + leg.brokerage,
   availableBalance: Math.max(summary.availableBalance, leg.availableBalance),
   insufficientBalance: summary.insufficientBalance + leg.insufficientBalance,
  }), { totalMargin: 0, spanMargin: 0, exposureMargin: 0, variableMargin: 0, brokerage: 0, availableBalance: 0, insufficientBalance: 0 });
  return {
   ok: true,
   readOnly: true,
   orderPlacementDisabled: true,
   productType,
   calculationMode,
   legs: previews,
   total: combined?.totalMargin > 0 ? combined : individualTotal,
   unhedgedTotal: individualTotal,
   updatedAt: Date.now(),
   methodology: calculationMode === 'combined_margin'
    ? 'Broker combined-leg margin preview. Margin values are indicative for the current session and no order is placed.'
    : 'Broker individual-leg margin preview. Combined spread margin benefit is unavailable; no order is placed.',
  };
 }

 async function getCommoditySpreadHistory(message = {}) {
  const buyInstrument = message.buyInstrument && typeof message.buyInstrument === 'object'
   ? message.buyInstrument
   : await findInstrument(message.buySymbol || message.buySecurityId);
  const sellInstrument = message.sellInstrument && typeof message.sellInstrument === 'object'
   ? message.sellInstrument
   : await findInstrument(message.sellSymbol || message.sellSecurityId);
  if (!buyInstrument || !sellInstrument
   || buyInstrument.exchangeSegment !== 'MCX_COMM' || sellInstrument.exchangeSegment !== 'MCX_COMM'
   || buyInstrument.instrument !== 'FUTCOM' || sellInstrument.instrument !== 'FUTCOM') {
   return { ok: false, status: 400, error: 'Spread history supports two MCX futures contracts only.' };
  }
  const end = Number(message.end || Date.now()) || Date.now();
  const start = Number(message.start || (end - 180 * DAY_MS)) || (end - 180 * DAY_MS);
  const [buyHistory, sellHistory] = await Promise.all([
   getCandles({
    instrument: buyInstrument,
    symbol: buyInstrument.tradingSymbol,
    resolution: '1d',
    expiryCode: Number(message.buyExpiryCode || 0),
    start,
    end,
    timeoutMs: 45000,
   }),
   getCandles({
    instrument: sellInstrument,
    symbol: sellInstrument.tradingSymbol,
    resolution: '1d',
    expiryCode: Number(message.sellExpiryCode || 0),
    start,
    end,
    timeoutMs: 45000,
   }),
  ]);
  if (!buyHistory?.ok || !sellHistory?.ok) {
   const failed = !buyHistory?.ok ? buyHistory : sellHistory;
   const failedInstrument = !buyHistory?.ok ? buyInstrument : sellInstrument;
   if (isDhanNoHistoricalDataResponse(failed)) {
    return {
     ...failed,
     error: `Dhan did not return daily candles for ${failedInstrument.tradingSymbol || 'the selected MCX future'} in this date range. Use the previous completed trading day, or try again after Dhan publishes today's EOD candle.`,
    };
   }
   return failed;
  }
  const study = buildCommoditySpreadHistory({
   buyRows: buyHistory.rows,
   sellRows: sellHistory.rows,
   buyInstrument,
   sellInstrument,
   entryBuyPrice: message.entryBuyPrice,
   entrySellPrice: message.entrySellPrice,
   buyLots: message.buyLots,
   sellLots: message.sellLots,
   costs: message.costs,
  });
  if (study.error) return { ok: false, status: 400, error: study.error };
  return {
   ok: true,
   readOnly: true,
   closeToCloseOnly: true,
   mode: String(message.mode || 'calendar') === 'sizeMatched' ? 'sizeMatched' : 'calendar',
   buyInstrument,
   sellInstrument,
   buyLots: Math.max(1, Math.round(Number(message.buyLots || 1))),
   sellLots: Math.max(1, Math.round(Number(message.sellLots || 1))),
   frontExpiry: buyInstrument.expiry,
   ...study,
   methodology: 'Historical chart uses matched daily closing prices for the selected futures legs. It is indicative research only; brokerage, statutory charges, slippage and expiry handling must be reviewed before any trade.',
  };
 }

 function commodityEma(rows = [], period = 20) {
  const values = (Array.isArray(rows) ? rows : []).map(row => Number(row?.close || 0)).filter(value => value > 0);
  if (values.length < period) return 0;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  values.slice(period).forEach(value => { current = ((value - current) * multiplier) + current; });
  return current;
 }

 function commodityAtr(rows = [], period = 14) {
  const candles = Array.isArray(rows) ? rows : [];
  if (candles.length < period + 1) return 0;
  const values = [];
  for (let index = 1; index < candles.length; index += 1) {
   const high = Number(candles[index]?.high || 0);
   const low = Number(candles[index]?.low || 0);
   const previous = Number(candles[index - 1]?.close || 0);
   if (high > 0 && low > 0 && previous > 0) values.push(Math.max(high - low, Math.abs(high - previous), Math.abs(low - previous)));
  }
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(period, values.length));
 }

 function buildCommodityLabRow(row = {}, daily = [], intraday = [], nowMs = Date.now()) {
  const current = Number(row.nearPrice || daily[daily.length - 1]?.close || 0);
  const ema20 = commodityEma(daily, 20);
  const ema50 = commodityEma(daily, 50);
  const ema200 = commodityEma(daily, 200);
  const ema4h = commodityEma(intraday, 20);
  const atr14 = commodityAtr(daily, 14);
  const expiryMs = new Date(String(row.nearFuture?.expiry || '').replace(' ', 'T')).getTime();
  const daysToExpiry = Number.isFinite(expiryMs) ? Math.max(0, (expiryMs - nowMs) / DAY_MS) : 0;
  const historyDays = daily.length > 1 ? Math.round((Number(daily[daily.length - 1].time) - Number(daily[0].time)) / 86400) : 0;
  const longTrend = ema50 > 0 && ema200 > 0 && current > ema50 && ema50 > ema200;
  const shortTrend = ema50 > 0 && ema200 > 0 && current < ema50 && ema50 < ema200;
  const bullishTiming = ema4h > 0 && Number(intraday[intraday.length - 1]?.close || current) >= ema4h;
  const bearishTiming = ema4h > 0 && Number(intraday[intraday.length - 1]?.close || current) <= ema4h;
  const distanceToEma20 = ema20 > 0 && current > 0 ? Math.abs(current - ema20) : 0;
  const nearPullback = atr14 > 0 && distanceToEma20 <= atr14 * 1.35;
  const rollRisk = daysToExpiry < 5;
  let direction = longTrend ? 'long' : shortTrend ? 'short' : 'neutral';
  let eventType = direction === 'neutral' ? 'range_watch' : 'trend_watch';
  let score = direction === 'neutral' ? 38 : 58;
  if (row.depthConfirmed) score += 8;
  if (longTrend && bullishTiming || shortTrend && bearishTiming) {
   score += 12;
   eventType = 'trend_confirmed';
  }
  if (nearPullback && (longTrend && bullishTiming || shortTrend && bearishTiming)) {
   score += 14;
   eventType = 'pullback_ready';
  }
  if (Math.abs(Number(row.annualizedSpreadPct || 0)) >= 6) score += 5;
  if (rollRisk) score -= 22;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const signal = rollRisk ? 'WATCHLIST' : score >= 78 ? (direction === 'short' ? 'SELL' : 'BUY') : score >= 50 ? 'WATCHLIST' : 'IGNORE';
  const actionLabel = rollRisk
   ? 'Roll to next contract first'
   : eventType === 'pullback_ready'
   ? `${direction === 'short' ? 'Short' : 'Long'} setup review`
   : eventType === 'trend_confirmed'
   ? 'Trend confirmed - wait for pullback'
   : 'Observe regime';
  return {
   symbol: row.nearFuture?.tradingSymbol || row.symbol,
   underlying: row.symbol,
   strategyId: 'commodity',
   signal,
   direction,
   eventType,
   setupLabel: eventType.replace(/_/g, ' '),
   actionLabel,
   priorityLabel: rollRisk ? 'Expiry risk' : score >= 78 ? 'Entry review' : score >= 58 ? 'Trend watch' : 'Observe',
   score,
   entry: current,
   stop: atr14 > 0 ? +(direction === 'short' ? current + atr14 : current - atr14).toFixed(4) : 0,
   triggerPrice: current,
   nearFuture: row.nearFuture,
   nextFuture: row.nextFuture,
   raw: {
    continuousMode: 'front_month_expiry_code_0',
    dailyCandles: daily.length,
    intradayCandles: intraday.length,
    historyDays,
    latestPrice: current,
    ema20: +ema20.toFixed(4),
    ema50: +ema50.toFixed(4),
    ema200: +ema200.toFixed(4),
    ema4h: +ema4h.toFixed(4),
    atr14: +atr14.toFixed(4),
    annualizedSpreadPct: Number(row.annualizedSpreadPct || 0),
    indicativeSpread: Number(row.indicativeSpread || 0),
    daysToExpiry: +daysToExpiry.toFixed(1),
    depthConfirmed: !!row.depthConfirmed,
    trendLabel: longTrend ? 'Bull trend' : shortTrend ? 'Bear trend' : 'Range / transition',
    timingLabel: !intraday.length ? '4H timing queued for leaders' : bullishTiming && longTrend ? '4H bullish confirmation' : bearishTiming && shortTrend ? '4H bearish confirmation' : '4H timing not confirmed',
    rollRisk,
   },
   checks: {
    continuousDailyHistory: daily.length >= 100,
    longTrend,
    shortTrend,
    nearPullback,
    intradayConfirmation: bullishTiming || bearishTiming,
    depthObserved: !!row.depthConfirmed,
    rollRisk,
   },
   canLiveTrade: false,
   canPaperTrade: true,
   ts: Date.now(),
  };
 }

 async function getCommodityAnalysis(message = {}) {
  const limit = Math.max(1, Math.min(20, Number(message.limit || 13)));
  const query = String(message.query || '').trim().toUpperCase();
  const cacheKey = `${limit}:${query}:${Math.max(730, Number(message.dailyDays || 1095))}:${Math.min(DHAN_INTRADAY_CHUNK_DAYS, Math.max(5, Number(message.intradayDays || DHAN_INTRADAY_CHUNK_DAYS)))}`;
  if (!message.force && commodityAnalysisCache?.key === cacheKey && Date.now() - commodityAnalysisCache.fetchedAt < COMMODITY_ANALYSIS_CACHE_TTL_MS) {
   return { ...commodityAnalysisCache.response, cached: true };
  }
  const snapshot = await getCommoditySnapshot({ limit, query });
  if (!snapshot.ok) return snapshot;
  const analysisInputs = [];
  const nowMs = Date.now();
  const dailyStart = nowMs - (Math.max(730, Number(message.dailyDays || 1095)) * DAY_MS);
  const intradayDays = Math.min(DHAN_INTRADAY_CHUNK_DAYS, Math.max(5, Number(message.intradayDays || DHAN_INTRADAY_CHUNK_DAYS)));
  const intradayStart = nowMs - (intradayDays * DAY_MS);
  for (const row of snapshot.rows.slice(0, limit)) {
   try {
    const dailyResponse = await getCandles({ instrument: row.nearFuture, symbol: row.nearFuture?.tradingSymbol, resolution: '1d', start: dailyStart, end: nowMs, timeoutMs: 45000 });
    if (!dailyResponse.ok || !(dailyResponse.rows || []).length) continue;
    analysisInputs.push({ row, daily: dailyResponse.rows || [] });
   } catch (error) {
    errorJournal?.append?.('dhan:commodity-lab-row', error, { symbol: row.symbol });
   }
  }
  let rows = analysisInputs.map(input => buildCommodityLabRow(input.row, input.daily, [], nowMs));
  rows.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.underlying || '').localeCompare(String(b.underlying || '')));
  const timingSymbols = new Set(rows.filter(row => !row.raw?.rollRisk && row.direction !== 'neutral').slice(0, 3).map(row => row.symbol));
  for (const input of analysisInputs.filter(item => timingSymbols.has(item.row.nearFuture?.tradingSymbol || item.row.symbol))) {
   try {
    const intradayResponse = await getCandles({ instrument: input.row.nearFuture, symbol: input.row.nearFuture?.tradingSymbol, resolution: '4h', start: intradayStart, end: nowMs, timeoutMs: 45000 });
    if (!intradayResponse.ok || !(intradayResponse.rows || []).length) continue;
    const revised = buildCommodityLabRow(input.row, input.daily, intradayResponse.rows || [], nowMs);
    rows = rows.map(row => row.symbol === revised.symbol ? revised : row);
   } catch (error) {
    errorJournal?.append?.('dhan:commodity-lab-timing', error, { symbol: input.row.symbol });
   }
  }
  rows.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.underlying || '').localeCompare(String(b.underlying || '')));
  const response = {
   ok: true,
   readOnly: true,
   results: rows,
   status: {
    strategyId: 'commodity',
    status: `Commodity Lab complete - ${rows.length} MCX rows analyzed`,
    active: false,
    scanned: rows.length,
    total: snapshot.rows.length,
    lastScanTs: Date.now(),
    diagnostics: {
     dailyDaysRequested: Math.round((nowMs - dailyStart) / DAY_MS),
     intradayDaysRequested: Math.round((nowMs - intradayStart) / DAY_MS),
     pairedUnderlyings: snapshot.pairedUnderlyings,
     depthConfirmedRows: snapshot.depthConfirmedRows,
     cacheTtlMinutes: Math.round(COMMODITY_ANALYSIS_CACHE_TTL_MS / 60000),
     timedCandidates: timingSymbols.size,
    },
   },
   methodology: 'Trend uses rolling front-month daily candles requested with expiryCode 0; entry timing uses the active near future 4H chart; spread uses near versus next active futures. Manual review only.',
  };
  commodityAnalysisCache = { key: cacheKey, fetchedAt: Date.now(), response };
  return response;
 }

 async function getCandles(message = {}) {
  const instrument = message.instrument && typeof message.instrument === 'object' ? message.instrument : await findInstrument(message.symbol || message.securityId);
  if (!instrument) return { ok: false, status: 404, error: 'Instrument/security ID was not found in the local market-data cache.' };
  const resolution = normalizeResolution(message.resolution || '4h');
  const endMs = Number(message.end || 0) > 1000000000000 ? Number(message.end) : (Number(message.end || 0) > 0 ? Number(message.end) * 1000 : Date.now());
  const requestedStartMs = Number(message.start || 0) > 1000000000000 ? Number(message.start) : (Number(message.start || 0) > 0 ? Number(message.start) * 1000 : endMs - (resolution.kind === 'historical' ? 730 * 86400000 : 30 * 86400000));
  const intradayEarliestMs = endMs - (DHAN_INTRADAY_MAX_HISTORY_DAYS * DAY_MS);
  const startMs = resolution.kind === 'intraday' ? Math.max(requestedStartMs, intradayEarliestMs) : requestedStartMs;
  const baseBody = {
   securityId: String(instrument.securityId),
   exchangeSegment: instrument.exchangeSegment,
   instrument: instrument.instrument || 'EQUITY',
   oi: message.oi === true,
  };
  if (resolution.kind === 'historical') baseBody.expiryCode = Math.max(0, Math.round(Number(message.expiryCode || 0)));
  else baseBody.interval = resolution.interval;
  const endpoint = resolution.kind === 'historical' ? '/charts/historical' : '/charts/intraday';
  const ranges = resolution.kind === 'intraday'
   ? buildIntradayChunks(startMs, endMs, Number(message.chunkDays || DHAN_INTRADAY_CHUNK_DAYS))
   : [{ startMs, endMs }];
  const chunks = [];
  const currentCooldownMs = Math.max(0, candleBlockedUntil - Date.now());
  if (currentCooldownMs > 0 && message.failFastOnRateLimit === true) {
   return {
    ok: false,
    status: 429,
    retryAfterMs: currentCooldownMs,
    error: `Chart data is cooling down after a Dhan rate-limit warning. Retry in ${Math.max(1, Math.ceil(currentCooldownMs / 1000))} seconds.`,
   };
  }
  for (const range of ranges) {
   const body = {
    ...baseBody,
    fromDate: resolution.kind === 'historical' ? formatDateOnly(range.startMs) : formatDateTime(range.startMs),
    toDate: resolution.kind === 'historical' ? formatDateOnly(range.endMs) : formatDateTime(range.endMs),
   };
   let response = null;
   for (let attempt = 0; attempt <= DHAN_CANDLE_MAX_RETRIES; attempt++) {
    const waitMs = Math.max(0, nextCandleRequestAt - Date.now(), candleBlockedUntil - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    nextCandleRequestAt = Date.now() + Math.max(DHAN_CANDLE_MIN_INTERVAL_MS, Number(message.paceMs || DHAN_CANDLE_MIN_INTERVAL_MS));
    response = await dhanFetch(endpoint, {
     method: 'POST',
     body,
     timeoutMs: Math.max(3000, Number(message.timeoutMs || 15000)),
    });
    if (!isDhanRateLimitResponse(response)) break;
    const backoffMs = DHAN_CANDLE_RATE_LIMIT_BACKOFF_MS * (attempt + 1);
    candleBlockedUntil = Math.max(candleBlockedUntil, Date.now() + backoffMs);
    nextCandleRequestAt = Math.max(nextCandleRequestAt, candleBlockedUntil);
    if (message.failFastOnRateLimit === true) {
     return {
      ...response,
      status: 429,
      retryAfterMs: Math.max(0, candleBlockedUntil - Date.now()),
      error: `Chart data is cooling down after a Dhan rate-limit warning. Retry in ${Math.max(1, Math.ceil(Math.max(0, candleBlockedUntil - Date.now()) / 1000))} seconds.`,
     };
    }
    if (attempt < DHAN_CANDLE_MAX_RETRIES) await sleep(backoffMs);
   }
   if (!response.ok) {
    if (isDhanRateLimitResponse(response)) {
     const retryAfterMs = Math.max(0, candleBlockedUntil - Date.now());
     return {
      ...response,
      status: 429,
      retryAfterMs,
      error: `Chart data is cooling down after a Dhan rate-limit warning. Retry in ${Math.max(1, Math.ceil(retryAfterMs / 1000))} seconds.`,
     };
    }
    return response;
   }
   chunks.push({
    ...response,
    fromDate: body.fromDate,
    toDate: body.toDate,
    rows: normalizeDhanCandles(response.data || {}),
   });
  }
  const lastResponse = chunks[chunks.length - 1] || { ok: true, status: 200, data: {} };
  const mergedRows = aggregateCandleRows(mergeCandleRows(chunks), resolution.aggregateSeconds || 0);
  return {
   ...lastResponse,
   instrument,
   rows: mergedRows,
   chunks: chunks.map(chunk => ({ fromDate: chunk.fromDate, toDate: chunk.toDate, count: chunk.rows.length })),
   apiCalls: chunks.length,
   request: {
    securityId: String(instrument.securityId || ''),
    exchangeSegment: String(instrument.exchangeSegment || ''),
    instrument: String(instrument.instrument || ''),
    resolution: message.resolution || '4h',
    endpoint,
   },
  };
 }

 function liveFeedStatus(extra = {}) {
  const readyState = liveSocket ? liveSocket.readyState : -1;
  const connected = readyState === 1;
  const instruments = Array.from(liveFeedInstruments.values());
  const ticks = Array.from(liveFeedTicks.values())
  .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
 return {
   ok: true,
   readOnly: true,
   enabled: connected,
   connected,
   paused: liveFeedPaused,
   status: liveFeedPaused ? 'paused' : connected ? 'connected' : liveFeedDesired ? 'connecting' : 'stopped',
   mode: 'websocket',
   feedMode: liveFeedMode,
   subscribed: instruments.length > 0,
   instrumentCount: instruments.length,
   tickCount: ticks.length,
   lastConnectAt: liveFeedLastConnectAt,
   lastMessageAt: liveFeedLastMessageAt,
   lastError: liveFeedLastError,
   instruments: instruments.map(item => ({
    symbol: item.symbol || item.tradingSymbol || '',
    tradingSymbol: item.tradingSymbol || item.symbol || '',
    exchangeSegment: item.exchangeSegment,
    securityId: String(item.securityId || ''),
   })),
   ticks: ticks.slice(0, Math.max(1, Math.min(500, Number(extra.limit || 80)))),
   message: liveFeedPaused
    ? 'Live market feed is paused for the active scanner run.'
    : connected
    ? 'Live market feed is connected. This is read-only market data.'
    : liveFeedLastError || 'Live market feed is not connected.',
   ...extra,
  };
 }

 function closeLiveFeedSocket(sendDisconnect = true) {
  if (liveFeedReconnectTimer) {
   clearTimeout(liveFeedReconnectTimer);
   liveFeedReconnectTimer = null;
  }
  const socket = liveSocket;
  liveSocket = null;
  if (!socket) return;
  try {
   if (sendDisconnect && socket.readyState === 1) {
    socket.send(JSON.stringify({ RequestCode: DHAN_FEED_REQUEST_CODES.disconnect }));
   }
  } catch (_) {}
  try { socket.close(); } catch (_) {}
 }

 function scheduleLiveFeedReconnect() {
  if (!liveFeedDesired || liveFeedPaused || liveFeedReconnectTimer || !liveFeedInstruments.size) return;
  const delay = Math.min(DHAN_LIVE_FEED_RECONNECT_MAX_MS, DHAN_LIVE_FEED_RECONNECT_BASE_MS * (2 ** Math.min(5, liveFeedReconnectAttempt)));
  liveFeedReconnectAttempt += 1;
  liveFeedReconnectTimer = setTimeout(() => {
   liveFeedReconnectTimer = null;
   connectLiveFeed().catch(error => {
    liveFeedLastError = error?.message || String(error || 'Live feed reconnect failed.');
    scheduleLiveFeedReconnect();
   });
  }, delay);
 }

 function sendLiveFeedSubscriptions() {
  if (!liveSocket || liveSocket.readyState !== 1) return;
  const requestCode = feedRequestCodeForMode(liveFeedMode);
  const instruments = Array.from(liveFeedInstruments.values()).slice(0, DHAN_LIVE_FEED_MAX_INSTRUMENTS);
  for (const chunk of chunkArray(instruments, DHAN_LIVE_FEED_SUBSCRIBE_CHUNK)) {
   liveSocket.send(JSON.stringify({
    RequestCode: requestCode,
    InstrumentCount: chunk.length,
    InstrumentList: chunk.map(item => ({
     ExchangeSegment: item.exchangeSegment,
     SecurityId: String(item.securityId),
    })),
   }));
  }
 }

 function normalizeLiveFeedOwner(value = '') {
  return String(value || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'default';
 }

 function liveFeedOwnerHasSecurity(securityId = '', exceptOwner = '') {
  const key = String(securityId || '').trim();
  const skip = normalizeLiveFeedOwner(exceptOwner);
  for (const [owner, ids] of liveFeedOwners.entries()) {
   if (owner !== skip && ids.has(key)) return true;
  }
  return false;
 }

 async function restartLiveFeedIfNeeded() {
  closeLiveFeedSocket(false);
  if (!liveFeedInstruments.size) {
   liveFeedDesired = false;
   liveFeedPaused = false;
   return liveFeedStatus({ status: 'stopped' });
  }
  liveFeedDesired = true;
  if (!liveFeedPaused) await connectLiveFeed();
  return liveFeedStatus();
 }

 async function connectLiveFeed() {
  const credentials = await readCredentials();
  if (!credentials.clientId || !credentials.accessToken) {
   liveFeedLastError = credentials.error || 'Client ID and access token are required for the live feed.';
   return liveFeedStatus({ ok: false, status: 'missing_credentials', error: liveFeedLastError });
  }
  const WebSocketCtor = global.WebSocket;
  if (typeof WebSocketCtor !== 'function') {
   liveFeedLastError = 'This Electron/Node runtime does not expose a WebSocket client.';
   return liveFeedStatus({ ok: false, status: 'unsupported', error: liveFeedLastError });
  }
  closeLiveFeedSocket(false);
  liveFeedDesired = true;
  liveFeedPaused = false;
  const url = `${DHAN_FEED_WS_URL}?version=2&token=${encodeURIComponent(credentials.accessToken)}&clientId=${encodeURIComponent(credentials.clientId)}&authType=2`;
  const socket = new WebSocketCtor(url);
  liveSocket = socket;
  try { socket.binaryType = 'arraybuffer'; } catch (_) {}
  socket.onopen = () => {
   liveFeedLastConnectAt = Date.now();
   liveFeedLastError = '';
   liveFeedReconnectAttempt = 0;
   sendLiveFeedSubscriptions();
  };
  socket.onmessage = event => {
   liveFeedLastMessageAt = Date.now();
   const packet = parseDhanFeedPacket(event.data);
   if (!packet) return;
   if (packet.type === 'disconnect') {
    liveFeedLastError = `Live feed disconnected (${packet.reasonCode || 'unknown'}).`;
    return;
   }
   const key = String(packet.securityId || '');
   if (!key) return;
   const instrument = liveFeedInstruments.get(key) || null;
   const previous = liveFeedTicks.get(key) || {};
   liveFeedTicks.set(key, mergeDhanFeedTick(previous, packet, instrument));
  };
  socket.onerror = event => {
   liveFeedLastError = event?.message || 'Live feed error.';
  };
  socket.onclose = event => {
   if (liveSocket === socket) liveSocket = null;
   if (liveFeedDesired) {
    liveFeedLastError = event?.reason || liveFeedLastError || `Live feed closed (${event?.code || 0}).`;
    scheduleLiveFeedReconnect();
   }
  };
  return liveFeedStatus({ status: 'connecting' });
 }

 async function subscribeLiveFeed(message = {}) {
  const owner = normalizeLiveFeedOwner(message.owner || message.source || 'default');
  liveFeedMode = normalizeFeedMode(message.mode || message.feedMode || liveFeedMode || 'quote');
  const symbols = Array.isArray(message.symbols) ? message.symbols : [message.symbol || message.securityId].filter(Boolean);
  const requested = [];
  for (const value of symbols) {
   const instrument = typeof value === 'object' ? value : await findInstrument(value);
   if (!instrument?.securityId || !instrument.exchangeSegment) continue;
   requested.push(instrument);
  }
  if (!requested.length) return liveFeedStatus({ ok: false, error: 'No valid instruments were found for live-feed subscription.' });
  const ownedIds = liveFeedOwners.get(owner) || new Set();
  requested.slice(0, DHAN_LIVE_FEED_MAX_INSTRUMENTS).forEach(instrument => {
   const key = String(instrument.securityId);
   liveFeedInstruments.set(key, instrument);
   ownedIds.add(key);
  });
  liveFeedOwners.set(owner, ownedIds);
  liveFeedDesired = true;
  liveFeedPaused = false;
  if (!liveSocket || liveSocket.readyState > 1) await connectLiveFeed();
  else if (liveSocket.readyState === 1) sendLiveFeedSubscriptions();
  return liveFeedStatus({ requested: requested.length, owner });
 }

 async function unsubscribeLiveFeed(message = {}) {
  const owner = message.owner || message.source ? normalizeLiveFeedOwner(message.owner || message.source) : '';
  const symbols = Array.isArray(message.symbols) ? message.symbols : [message.symbol || message.securityId].filter(Boolean);
  if (message.all === true || (!symbols.length && !owner)) {
   liveFeedInstruments.clear();
   liveFeedTicks.clear();
   liveFeedOwners.clear();
   liveFeedDesired = false;
   liveFeedPaused = false;
   closeLiveFeedSocket(true);
   return liveFeedStatus({ status: 'stopped' });
  }
  const ids = symbols.length
   ? new Set(symbols.map(item => String(typeof item === 'object' ? item.securityId : item).trim()).filter(Boolean))
   : new Set(owner ? Array.from(liveFeedOwners.get(owner) || []) : []);
  if (owner) {
   const ownerIds = liveFeedOwners.get(owner) || new Set();
   ids.forEach(id => ownerIds.delete(id));
   if (ownerIds.size) liveFeedOwners.set(owner, ownerIds);
   else liveFeedOwners.delete(owner);
  }
  for (const key of ids) {
   if (!liveFeedOwnerHasSecurity(key, owner)) {
    liveFeedInstruments.delete(key);
    liveFeedTicks.delete(key);
   }
  }
  if (!liveFeedInstruments.size) {
   liveFeedDesired = false;
   liveFeedPaused = false;
   closeLiveFeedSocket(true);
   return liveFeedStatus({ owner: owner || undefined });
  }
  const restarted = await restartLiveFeedIfNeeded();
  return { ...restarted, owner: owner || undefined };
 }

 async function pauseLiveFeed() {
  liveFeedPaused = true;
  liveFeedDesired = liveFeedInstruments.size > 0;
  closeLiveFeedSocket(true);
  return liveFeedStatus({ status: 'paused', reason: 'scanner' });
 }

 async function resumeLiveFeed() {
  liveFeedPaused = false;
  if (liveFeedInstruments.size) {
   liveFeedDesired = true;
   if (!liveSocket || liveSocket.readyState > 1) await connectLiveFeed();
   else if (liveSocket.readyState === 1) sendLiveFeedSubscriptions();
  }
  return liveFeedStatus({ status: liveFeedInstruments.size ? 'resuming' : 'stopped' });
 }

 async function getLiveFeed(message = {}) {
  const action = String(message.action || '').trim();
  if (action === 'live_feed_subscribe') return subscribeLiveFeed(message);
  if (action === 'live_feed_unsubscribe') return unsubscribeLiveFeed(message);
  if (action === 'live_feed_pause') return pauseLiveFeed(message);
  if (action === 'live_feed_resume') return resumeLiveFeed(message);
  if (action === 'live_feed_status') return liveFeedStatus(message);
  if (Array.isArray(message.symbols) || message.symbol || message.securityId) return subscribeLiveFeed(message);
  return liveFeedStatus(message);
 }

async function getOptionChain(message = {}) {
  const underlying = await findInstrument(message.underlying || message.symbol || 'NIFTY');
  if (!underlying) return { ok: false, status: 404, error: 'Underlying was not found in instrument cache.' };
  let expiry = String(message.expiry || '').trim();
  if (optionChainBlockedUntil > Date.now()) return optionCooldownResponse();
  if (!expiry) {
   const expiryResponse = await getOptionExpiries({ underlying: underlying.symbol || underlying.tradingSymbol });
   if (!expiryResponse?.ok) return expiryResponse;
   expiry = String(expiryResponse.expiries?.[0] || '').trim();
   if (!expiry) return { ok: false, status: 404, error: 'No option-chain expiry returned for this underlying.' };
  }
  const key = `${underlying.exchangeSegment}:${underlying.securityId}:${expiry}`;
  const cached = optionChainCache.get(key);
  if (!message.force && cached && Date.now() - cached.fetchedAt < DHAN_OPTION_CHAIN_CACHE_TTL_MS) {
   return { ...cached.response, cached: true };
  }
  if (optionChainInFlight.has(key)) return optionChainInFlight.get(key);
  const request = (async () => {
   const optionWaitMs = Math.max(0, nextOptionChainRequestAt - Date.now());
   if (optionWaitMs > 0) await sleep(optionWaitMs);
   if (optionChainBlockedUntil > Date.now()) return optionCooldownResponse();
   nextOptionChainRequestAt = Date.now() + Math.max(DHAN_OPTION_CHAIN_MIN_INTERVAL_MS, Number(message.paceMs || DHAN_OPTION_CHAIN_MIN_INTERVAL_MS));
   const response = await dhanFetch('/optionchain', {
    method: 'POST',
    body: {
     UnderlyingScrip: Number(underlying.securityId),
     UnderlyingSeg: underlying.exchangeSegment,
     Expiry: expiry,
    },
   });
   const rateLimited = handleOptionRateLimit(response);
   if (rateLimited) return rateLimited;
   if (!response.ok) return response;
   const normalized = normalizeDhanOptionChainResponse(response, {
    underlying: underlying.tradingSymbol || underlying.symbol || message.underlying || message.symbol || 'NIFTY',
    expiry,
   });
   optionChainCache.set(key, { fetchedAt: Date.now(), response: normalized });
   return normalized;
  })().finally(() => optionChainInFlight.delete(key));
  optionChainInFlight.set(key, request);
  return request;
 }

 async function getOptionExpiries(message = {}) {
  const underlying = await findInstrument(message.underlying || message.symbol || 'NIFTY');
  if (!underlying) return { ok: false, status: 404, error: 'Underlying was not found in instrument cache.' };
  if (optionChainBlockedUntil > Date.now()) return optionCooldownResponse();
  const key = `${underlying.exchangeSegment}:${underlying.securityId}`;
  const cached = optionExpiryCache.get(key);
  if (!message.force && cached && Date.now() - cached.fetchedAt < DHAN_OPTION_EXPIRY_CACHE_TTL_MS) {
   return { ...cached.response, cached: true };
  }
  const waitMs = Math.max(0, nextOptionChainRequestAt - Date.now());
  if (waitMs > 0) await sleep(waitMs);
  if (optionChainBlockedUntil > Date.now()) return optionCooldownResponse();
  nextOptionChainRequestAt = Date.now() + DHAN_OPTION_CHAIN_MIN_INTERVAL_MS;
  const response = await dhanFetch('/optionchain/expirylist', {
   method: 'POST',
   body: {
    UnderlyingScrip: Number(underlying.securityId),
    UnderlyingSeg: underlying.exchangeSegment,
   },
  });
  const rateLimited = handleOptionRateLimit(response);
  if (rateLimited) return rateLimited;
  const payload = {
   ...response,
   underlying: {
    symbol: underlying.symbol,
    tradingSymbol: underlying.tradingSymbol,
    securityId: underlying.securityId,
    exchangeSegment: underlying.exchangeSegment,
   },
   expiries: Array.isArray(response?.data?.data) ? response.data.data : [],
  };
  if (payload.ok) optionExpiryCache.set(key, { fetchedAt: Date.now(), response: payload });
  return payload;
 }

async function testConnection() {
  const credentials = await readCredentials();
  if (!credentials.clientId || !credentials.accessToken) return { ok: false, status: 401, error: credentials.error || 'Client ID and access token are required.' };
  const cache = await loadInstrumentCache(false).catch(error => ({ instruments: [], error: error?.message || String(error) }));
  const sample = cache.instruments?.find(item => item.tradingSymbol === 'NIFTY' || item.symbol === 'NIFTY') || cache.instruments?.[0];
  const ltp = sample ? await getLtp({ symbols: [sample] }) : { ok: true, skipped: true };
  const authFailed = !ltp?.ok && /auth|token|client/i.test(String(ltp?.error || ''));
  return {
   ok: !!ltp?.ok,
   dataOnly: true,
   manualTradingOnly: true,
   mode: credentials.dataMode || 'rest',
   instrumentCount: Number(cache.instruments?.length || 0),
   sample: sample ? { tradingSymbol: sample.tradingSymbol, securityId: sample.securityId, exchangeSegment: sample.exchangeSegment } : null,
   ltpStatus: ltp?.status || 0,
   rawError: ltp?.error || cache.error || '',
   error: ltp?.ok
    ? ''
    : authFailed
    ? 'The market-data API rejected the Client ID / Access Token. Generate a fresh access token, confirm both credentials belong to the same account, save them again, then test.'
    : (ltp?.error || cache.error || 'Market-data API test failed.'),
  };
 }

 async function handle(message = {}) {
  const action = String(message.action || '').trim();
  if (['place_order', 'modify_order', 'cancel_order', 'order'].includes(action) || /^order/i.test(action)) {
   return { ok: false, status: 403, error: DHAN_ORDER_DISABLED_ERROR };
  }
  if (action === 'credentials_get') {
   const credentials = await readCredentials();
   return { ok: true, configured: !!(credentials.clientId && credentials.accessToken), clientId: credentials.clientId, dataMode: credentials.dataMode, updatedAt: credentials.updatedAt };
  }
  if (action === 'credentials_set') return saveCredentials(message);
  if (action === 'credentials_delete') return deleteCredentials();
  if (action === 'test') return testConnection();
  if (action === 'market_session' || action === 'session' || action === 'market_status') return getNseBseMarketSession(message.at || message.ts || Date.now());
  if (action === 'instruments') return getProducts(message);
  if (action === 'ltp') return getLtp(message);
  if (action === 'quotes' || action === 'quote') return getMarketFeed(message, '/marketfeed/quote');
  if (action === 'ohlc') return getMarketFeed(message, '/marketfeed/ohlc');
   if (action === 'fno_carry') return getFnoCarry(message);
   if (action === 'commodity_snapshot') return getCommoditySnapshot(message);
   if (action === 'commodity_spread_scanner') return getCommoditySpreadScanner(message);
   if (action === 'commodity_spread_chart') return getCommoditySpreadChart(message);
   if (action === 'commodity_spread_continuous_chart') return getCommoditySpreadContinuousChart(message);
   if (action === 'commodity_spread_history_backfill_start') return startCommoditySpreadBackfill(message);
   if (action === 'commodity_spread_history_backfill_status') return getCommoditySpreadBackfillStatus();
   if (action === 'commodity_spread_history_backfill_cancel') return cancelCommoditySpreadBackfill();
   if (action === 'commodity_spread_expiry_catalog') return getCommoditySpreadExpiryCatalog(message);
   if (action === 'commodity_spread_quotes') return getCommoditySpreadQuotes(message);
   if (action === 'commodity_margin_preview') return getCommodityMarginPreview(message);
   if (action === 'commodity_spread_history') return getCommoditySpreadHistory(message);
   if (action === 'commodity_analysis') return getCommodityAnalysis(message);
  if (action === 'candles' || action === 'historical') return getCandles(message);
  if (action === 'live_feed' || action === 'live_feed_status' || action === 'live_feed_subscribe' || action === 'live_feed_unsubscribe' || action === 'live_feed_pause' || action === 'live_feed_resume') return getLiveFeed(message);
  if (action === 'option_expiries' || action === 'option_chain_expiries') return getOptionExpiries(message);
  if (action === 'option_chain') return getOptionChain(message);
  return { ok: false, status: 400, error: `Unsupported market-data action: ${action || 'unknown'}` };
 }

 return { handle, testConnection, getProducts, getLtp, getCandles, getLiveFeed, readCredentials, saveCredentials };
}

module.exports = {
 createDhanDataService,
 DHAN_ORDER_DISABLED_ERROR,
 __private: {
  normalizeExchangeSegment,
  normalizeInstrument,
  normalizeResolution,
  buildFnoStockUniverse,
  buildFnoCarryContracts,
  buildCommodityFuturePairs,
  buildCommoditySpreadPairs,
  buildCommoditySpreadCandles,
  buildCommoditySpreadClosePoints,
  buildCommoditySynchronizedSpreadCandles,
  buildCommoditySpreadBands,
  buildCommoditySpreadRollEvents,
  buildCommoditySpreadDecision,
  clipCommoditySpreadRowsForPair,
  analyzeCommoditySpreadCandles,
  commoditySpreadCostEstimate,
  commoditySpreadSafeguards,
  buildCommoditySpreadHistory,
  commodityPriceMultiplier,
  commodityMatchedLotRatio,
  parseDerivativeExpiryMs,
  buildUniverseCatalog,
  normalizeUniverseId,
  isNseEquityInstrument,
  isBseEquityInstrument,
  buildIntradayChunks,
  getNseBseMarketSession,
  mergeCandleRows,
  aggregateCandleRows,
  normalizeDhanCandles,
  dhanErrorMessage,
  isDhanNoHistoricalDataResponse,
  groupQuoteBatch,
  flattenInstrumentGroups,
  mergeDhanFeedResponses,
  parseDhanFeedPacket,
  normalizeDhanOptionChainResponse,
  feedRequestCodeForMode,
  limits: Object.freeze({
   quoteMinIntervalMs: DHAN_QUOTE_MIN_INTERVAL_MS,
   candleMinIntervalMs: DHAN_CANDLE_MIN_INTERVAL_MS,
   optionChainMinIntervalMs: DHAN_OPTION_CHAIN_MIN_INTERVAL_MS,
   optionChainCacheTtlMs: DHAN_OPTION_CHAIN_CACHE_TTL_MS,
   optionChainBackoffMs: DHAN_OPTION_CHAIN_RATE_LIMIT_BACKOFF_MS,
   quoteBatchSize: DHAN_QUOTE_BATCH_SIZE,
   liveFeedMaxInstruments: DHAN_LIVE_FEED_MAX_INSTRUMENTS,
   liveFeedSubscribeChunk: DHAN_LIVE_FEED_SUBSCRIBE_CHUNK,
  }),
 },
};
