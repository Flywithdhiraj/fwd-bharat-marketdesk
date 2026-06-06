'use strict';

(() => {
 const AUTO_SCAN_INTERVALS = [1, 2, 3, 5, 15];
 const AUTO_SCAN_INTERVAL_DEFAULT = 15;
 const ALERT_TONES = ['classic', 'beacon', 'pulse', 'chime', 'siren'];
 const MARKET_DATA_MODES = ['auto', 'polling', 'websocket'];
 const MARKET_REGIMES = ['TRENDING', 'HIGH_VOL', 'LOW_VOL', 'CHOPPY', 'UNKNOWN'];
 const ACCOUNT_CAPABILITIES = ['Public', 'ReadOnly', 'TradeEnabled'];
 const ACCOUNT_CAPABILITY_META = Object.freeze({
 Public: Object.freeze({
 label: 'Public',
 shortLabel: 'Public',
 tone: 'public',
 desk: 'Public Desk',
 description: 'Scanner, research, and risk tools with no account attachment.',
 allowsAccountRead: false,
 allowsTrade: false,
 }),
 ReadOnly: Object.freeze({
 label: 'ReadOnly',
 shortLabel: 'ReadOnly',
 tone: 'readonly',
 desk: 'Read-Only Desk',
 description: 'Portfolio-aware desktop with account context, but no live execution actions.',
 allowsAccountRead: true,
 allowsTrade: false,
 }),
 TradeEnabled: Object.freeze({
 label: 'TradeEnabled',
 shortLabel: 'Trade',
 tone: 'trade',
 desk: 'Trade Desk',
 description: 'Execution-ready architecture. v16.0 stays in preview mode until keys are loaded.',
 allowsAccountRead: true,
 allowsTrade: true,
 }),
 });

 const SECTORS = {
 'Index': ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'],
 'Banking & Finance': ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK', 'BANKBARODA', 'PNB', 'INDUSINDBK', 'AUBANK', 'BAJFINANCE', 'BAJAJFINSV', 'SBILIFE', 'HDFCLIFE'],
 'IT Services': ['TCS', 'INFY', 'HCLTECH', 'WIPRO', 'TECHM', 'LTIM', 'PERSISTENT', 'MPHASIS', 'COFORGE'],
 'Energy & Utilities': ['RELIANCE', 'ONGC', 'NTPC', 'POWERGRID', 'TATAPOWER', 'ADANIENSOL', 'ADANIGREEN', 'COALINDIA', 'BPCL', 'IOC'],
 'Consumer': ['ITC', 'HINDUNILVR', 'NESTLEIND', 'BRITANNIA', 'TATACONSUM', 'MARICO', 'DABUR', 'VBL', 'DMART'],
 'Auto': ['MARUTI', 'M&M', 'TATAMOTORS', 'BAJAJ-AUTO', 'EICHERMOT', 'HEROMOTOCO', 'TVSMOTOR', 'ASHOKLEY'],
 'Pharma & Healthcare': ['SUNPHARMA', 'CIPLA', 'DRREDDY', 'DIVISLAB', 'APOLLOHOSP', 'LUPIN', 'TORNTPHARM', 'ZYDUSLIFE'],
 'Metals & Materials': ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL', 'JINDALSTEL', 'NATIONALUM', 'ULTRACEMCO', 'GRASIM', 'SHREECEM'],
 'Capital Goods': ['LT', 'SIEMENS', 'ABB', 'BEL', 'BHEL', 'HAL', 'CUMMINSIND', 'POLYCAB'],
 'Telecom & Media': ['BHARTIARTL', 'IDEA', 'INDUSTOWER', 'SUNTV', 'NAUKRI', 'ZOMATO'],
 'Realty & Infra': ['DLF', 'LODHA', 'GODREJPROP', 'OBEROIRLTY', 'IRCTC', 'CONCOR', 'ADANIPORTS'],
 'Other': [],
 };

 function normalizeIndianEquitySymbol(value = '') {
 const raw = String(value || '').trim().toUpperCase();
 return raw
 .replace(/\.(NS|BO|BSE|NSE)$/i, '')
 .replace(/-(EQ|BE|BZ|SM|ST|X|XT|A|B|T)$/i, '')
 .replace(/_(EQ|NSE|BSE)$/i, '')
 .replace(/\s+/g, '');
 }

 function getIndianEquitySector(value = '') {
 const raw = normalizeIndianEquitySymbol(value);
 if (!raw) return '';
 const aliases = new Set([raw]);
 aliases.add(raw.replace(/&/g, 'AND'));
 aliases.add(raw.replace(/AND/g, '&'));
 const extra = {
  'Banking & Finance': ['CANBK', 'FEDERALBNK', 'IDFCFIRSTB', 'RBLBANK', 'BANDHANBNK', 'UNIONBANK', 'IOB', 'INDIANB', 'LICHSGFIN', 'RECLTD', 'PFC', 'IRFC', 'IEX', 'CDSL', 'BSE', 'MCX', 'ANGELONE', '360ONE', 'JIOFIN', 'LICI', 'ICICIGI', 'ICICIPRULI', 'HDFCAMC', 'ABCAPITAL'],
  'IT Services': ['TATAELXSI', 'KPITTECH', 'OFSS', 'CYIENT', 'SONATSOFTW', 'BSOFT', 'LTTS', 'INTELLECT', 'HAPPSTMNDS', 'NEWGEN'],
  'Energy & Utilities': ['OIL', 'PETRONET', 'GAIL', 'IGL', 'MGL', 'GSPL', 'SJVN', 'NHPC', 'JSWENERGY', 'TORNTPOWER', 'ADANIPOWER', 'INOXWIND', 'SUZLON'],
  'Consumer': ['TITAN', 'TRENT', 'NYKAA', 'PAGEIND', 'JUBLFOOD', 'DEVYANI', 'UBL', 'UNITDSPR', 'COLPAL', 'GODREJCP', 'EMAMILTD', 'PATANJALI', 'VOLTAS', 'CROMPTON', 'BLUESTARCO', 'KALYANKJIL'],
  'Auto': ['BOSCHLTD', 'MOTHERSON', 'BHARATFORG', 'MRF', 'BALKRISIND', 'APOLLOTYRE', 'EXIDEIND', 'AMARAJABAT', 'ESCORTS', 'SONACOMS', 'UNOMINDA', 'TIINDIA', 'OLECTRA'],
  'Pharma & Healthcare': ['MAXHEALTH', 'FORTIS', 'MEDANTA', 'ALKEM', 'MANKIND', 'LAURUSLABS', 'IPCALAB', 'ABBOTINDIA', 'AJANTPHARM', 'NATCOPHARM', 'SYNGENE', 'GRANULES', 'METROPOLIS', 'LALPATHLAB'],
  'Metals & Materials': ['SAIL', 'NMDC', 'APLAPOLLO', 'RATNAMANI', 'HINDCOPPER', 'HINDZINC', 'CENTURYPLY', 'ACC', 'AMBUJACEM', 'DALBHARAT', 'RAMCOCEM', 'JKCEMENT', 'JKLAKSHMI', 'AIAENG'],
  'Capital Goods': ['CGPOWER', 'THERMAX', 'VOLTAMP', 'HAVELLS', 'KEI', 'KAYNES', 'DIXON', 'BDL', 'MAZDOCK', 'COCHINSHIP', 'RVNL', 'IRCON', 'NBCC', 'ENGINERSIN', 'KPRMILL'],
  'Telecom & Media': ['TATACOMM', 'HFCL', 'DISHTV', 'PVRINOX', 'SAREGAMA', 'NETWORK18', 'ZEEL'],
  'Realty & Infra': ['PHOENIXLTD', 'PRESTIGE', 'BRIGADE', 'SOBHA', 'MAHLIFE', 'NBCC', 'PNCINFRA', 'KNRCON', 'NCC', 'JWL', 'GPPL'],
  'Chemicals': ['PIDILITIND', 'UPL', 'SRF', 'AARTIIND', 'DEEPAKNTR', 'TATACHEM', 'NAVINFLUOR', 'ATUL', 'ALKYLAMINE', 'FLUOROCHEM', 'CLEAN', 'BALAMINES'],
  'Textiles': ['VARDHMAN', 'TRIDENT', 'WELSPUNLIV', 'RAYMOND', 'ARVIND', 'GARFIBRES'],
 };
 for (const [label, symbols] of Object.entries(SECTORS)) {
  if ((symbols || []).some(symbol => aliases.has(normalizeIndianEquitySymbol(symbol)))) return label;
 }
 for (const [label, symbols] of Object.entries(extra)) {
  if ((symbols || []).some(symbol => aliases.has(normalizeIndianEquitySymbol(symbol)))) return label;
 }
 return '';
 }

 const RWA_ASSET_TYPES = Object.freeze({
 tokenized_stock: Object.freeze({
 label: 'Tokenized Stock',
 badge: 'RWA / Stock',
 sector: 'RWA',
 keywords: ['XSTOCK', 'TOKENIZED STOCK', 'STOCK TOKEN', 'EQUITY TOKEN', 'TOKENISED STOCK', 'TOKENISED EQUITY'],
 }),
 tokenized_etf: Object.freeze({
 label: 'Tokenized ETF',
 badge: 'RWA / ETF',
 sector: 'RWA',
 keywords: ['TOKENIZED ETF', 'ETF TOKEN', 'TOKENISED ETF'],
 }),
 tokenized_treasury: Object.freeze({
 label: 'Tokenized Treasury',
 badge: 'RWA / Treasury',
 sector: 'RWA',
 keywords: ['TOKENIZED TREASURY', 'TREASURY TOKEN', 'T-BILL', 'TBILL', 'GOVERNMENT BOND', 'US TREASURY', 'TOKENISED TREASURY'],
 }),
 tokenized_commodity: Object.freeze({
 label: 'Tokenized Commodity',
 badge: 'RWA / Commodity',
 sector: 'RWA',
 keywords: ['TOKENIZED GOLD', 'TOKENIZED SILVER', 'GOLD TOKEN', 'SILVER TOKEN', 'TOKENIZED COMMODITY', 'TOKENISED COMMODITY', 'PRECIOUS METAL'],
 }),
 tokenized_real_estate: Object.freeze({
 label: 'Tokenized Real Estate',
 badge: 'RWA / Real Estate',
 sector: 'RWA',
 keywords: ['TOKENIZED REAL ESTATE', 'REAL ESTATE TOKEN', 'PROPERTY TOKEN', 'TOKENISED REAL ESTATE'],
 }),
 tokenized_credit: Object.freeze({
 label: 'Tokenized Credit',
 badge: 'RWA / Credit',
 sector: 'RWA',
 keywords: ['PRIVATE CREDIT', 'TOKENIZED CREDIT', 'CREDIT TOKEN', 'TOKENISED CREDIT'],
 }),
 });

 const RWA_METADATA_KEYWORDS = Object.freeze([
 'RWA',
 'REAL WORLD ASSET',
 'REAL-WORLD ASSET',
 'REAL ASSET',
 'REAL-ASSET',
 'TOKENIZED',
 'TOKENISED',
 'XSTOCK',
 'STOCK',
 'EQUITY',
 'ETF',
 'TREASURY',
 'T-BILL',
 'TBILL',
 'BOND',
 'COMMODITY',
 'GOLD',
 'SILVER',
 'REAL ESTATE',
 'PROPERTY',
 'PRIVATE CREDIT',
 'CREDIT',
 ]);

 const RWA_CRYPTO_ASSET_EXCLUSIONS = Object.freeze(new Set([
 'BTC',
 'ETH',
 'SOL',
 'XRP',
 'BNB',
 'ADA',
 'DOGE',
 'TRX',
 'LTC',
 'BCH',
 'ETC',
 'DOT',
 'AVAX',
 'NEAR',
 'APT',
 'SUI',
 'ATOM',
 'LINK',
 'UNI',
 'AAVE',
 'INJ',
 'MKR',
 'LDO',
 'CRV',
 'DYDX',
 'SUSHI',
 'PENDLE',
 'JUP',
 'GMX',
 'ENA',
 'ONDO',
 'FRAX',
 'RUNE',
 '1INCH',
 ]));

 const TOKENIZED_STOCK_PRODUCTS = Object.freeze({
 AAPLX: Object.freeze({ stockSymbol: 'AAPL', company: 'Apple Inc.', displayName: 'Apple xStock' }),
 AMZNX: Object.freeze({ stockSymbol: 'AMZN', company: 'Amazon.com Inc.', displayName: 'Amazon xStock' }),
 GOOGLX: Object.freeze({ stockSymbol: 'GOOGL', company: 'Alphabet Inc.', displayName: 'Alphabet xStock' }),
 METAX: Object.freeze({ stockSymbol: 'META', company: 'Meta Platforms Inc.', displayName: 'Meta xStock' }),
 MSFTX: Object.freeze({ stockSymbol: 'MSFT', company: 'Microsoft Corp.', displayName: 'Microsoft xStock' }),
 NVDAX: Object.freeze({ stockSymbol: 'NVDA', company: 'NVIDIA Corp.', displayName: 'NVIDIA xStock' }),
 TSLAX: Object.freeze({ stockSymbol: 'TSLA', company: 'Tesla Inc.', displayName: 'Tesla xStock' }),
 });
 const DELTA_BASE_ASSET_NAMES = Object.freeze({
 BTC: 'Bitcoin',
 ETH: 'Ethereum',
 PAXG: 'PAX Gold Token',
 SOL: 'Solana',
 XRP: 'XRP',
 BNB: 'BNB',
 ADA: 'Cardano',
 DOGE: 'Dogecoin',
 TRX: 'TRON',
 LTC: 'Litecoin',
 BCH: 'Bitcoin Cash',
 AVAX: 'Avalanche',
 LINK: 'Chainlink',
 UNI: 'Uniswap',
 AAVE: 'Aave',
 XAUT: 'Tether Gold Token',
 });
 const STOCK_TOKEN_MAP = {
 TSLA: ['TSLA', 'TSLAX'],
 AAPL: ['AAPL', 'AAPLX'],
 AMZN: ['AMZN', 'AMZNX'],
 NVDA: ['NVDA', 'NVDAX'],
 META: ['META', 'METAX'],
 GOOGL: ['GOOGL', 'GOOGLX'],
 MSFT: ['MSFT', 'MSFTX'],
 };
 const STOCK_TOKEN_SET = new Set(Object.values(STOCK_TOKEN_MAP).flat());
 const REGIME_THRESHOLD_PRESETS = Object.freeze({
 TRENDING: Object.freeze({ alertScore: 60, setupScore: 53, watchScore: 38, minScore: 10 }),
 HIGH_VOL: Object.freeze({ alertScore: 75, setupScore: 68, watchScore: 55, minScore: 22 }),
 LOW_VOL: Object.freeze({ alertScore: 70, setupScore: 63, watchScore: 48, minScore: 14 }),
 CHOPPY: Object.freeze({ alertScore: 82, setupScore: 74, watchScore: 62, minScore: 28 }),
 UNKNOWN: Object.freeze({ alertScore: 65, setupScore: 60, watchScore: 45, minScore: 15 }),
 });
 const REGIME_META = Object.freeze({
 TRENDING: Object.freeze({ label: 'TRENDING', tone: 'good', color: 'green', copy: 'Directional tape with efficient follow-through.' }),
 HIGH_VOL: Object.freeze({ label: 'HIGH_VOL', tone: 'bad', color: 'red', copy: 'Expansion / liquidation conditions with elevated breakout failure risk.' }),
 LOW_VOL: Object.freeze({ label: 'LOW_VOL', tone: 'muted', color: 'grey', copy: 'Compressed grind conditions that need tighter selectivity.' }),
 CHOPPY: Object.freeze({ label: 'CHOPPY', tone: 'warn', color: 'orange', copy: 'Back-and-forth range action with poor directional efficiency.' }),
 UNKNOWN: Object.freeze({ label: 'UNKNOWN', tone: 'muted', color: 'grey', copy: 'Insufficient history for a reliable volatility-structure read.' }),
 });
 const MAX_SIGNAL_PERSISTENCE_POINTS = 8;
 const AUTO_SHORTLIST_LIMIT = 5;
 const DECISION_ACTION_THRESHOLDS = Object.freeze({
 tradeNowTradeQuality: 75,
 watchCloseTradeQuality: 65,
 shortlistTradeQuality: 58,
 watchCloseScoreFloor: 55,
 shortlistScoreFloor: 45,
 });
 const TIER_PRIORITY = Object.freeze({ execute: 3, setup: 2, watch: 1, none: 0 });
 const SETUP_FAMILY_META = Object.freeze({
 continuation: Object.freeze({ label: 'Continuation', shortLabel: 'Trend OK', tone: 'good', copy: 'Directional continuation with aligned structure.' }),
 pullback: Object.freeze({ label: 'Pullback', shortLabel: 'Pullback', tone: 'good', copy: 'Trend pullback into structure or VWAP support.' }),
 breakout_retest: Object.freeze({ label: 'Breakout Retest', shortLabel: 'Retest', tone: 'good', copy: 'Breakout holding above or below reclaimed structure.' }),
 liquidation_reversal: Object.freeze({ label: 'Liquidation Reversal', shortLabel: 'Liq Reversal', tone: 'warn', copy: 'Crowded expansion move that favors a snapback.' }),
 reclaim: Object.freeze({ label: 'Reclaim', shortLabel: 'Reclaim', tone: 'warn', copy: 'Price is reclaiming key structure after a failed breakdown or breakout.' }),
 crowding_unwind: Object.freeze({ label: 'Crowding Unwind', shortLabel: 'Crowding', tone: 'warn', copy: 'Crowded positioning with unwind risk.' }),
 compression_breakout: Object.freeze({ label: 'Compression Breakout', shortLabel: 'Compression', tone: 'muted', copy: 'Low-volatility squeeze with breakout potential.' }),
 tight_continuation: Object.freeze({ label: 'Tight Continuation', shortLabel: 'Tight Trend', tone: 'muted', copy: 'Orderly continuation in a quiet tape.' }),
 fade_extreme: Object.freeze({ label: 'Fade Extreme', shortLabel: 'Fade', tone: 'warn', copy: 'Fade setup against stretched price and crowding.' }),
 mean_reversion: Object.freeze({ label: 'Mean Reversion', shortLabel: 'Mean Revert', tone: 'warn', copy: 'Back-and-forth tape that favors reverting to balance.' }),
 mixed: Object.freeze({ label: 'Mixed', shortLabel: 'Mixed', tone: 'muted', copy: 'No clear setup-family edge yet.' }),
 });
 const REGIME_SETUP_PREFERENCES = Object.freeze({
 TRENDING: Object.freeze(['continuation', 'pullback', 'breakout_retest']),
 HIGH_VOL: Object.freeze(['liquidation_reversal', 'reclaim', 'crowding_unwind']),
 LOW_VOL: Object.freeze(['compression_breakout', 'tight_continuation', 'pullback']),
 CHOPPY: Object.freeze(['fade_extreme', 'mean_reversion']),
 UNKNOWN: Object.freeze(['continuation', 'pullback', 'reclaim', 'mixed']),
 });
 const SYMBOL_MATURITY_STATES = Object.freeze(['new', 'probation', 'validated']);

 function sanitizeAutoScanInterval(v) {
 const n = Math.round(Number(v));
 return AUTO_SCAN_INTERVALS.includes(n) ? n : AUTO_SCAN_INTERVAL_DEFAULT;
 }

 function sanitizeAlertTone(v) {
 const tone = String(v || '').trim().toLowerCase();
 return ALERT_TONES.includes(tone) ? tone : 'classic';
 }

 function sanitizeKeyLevelSettings(raw = {}) {
 const displayStrengthAs = String(raw?.displayStrengthAs || '').trim().toLowerCase() === 'percent'
 ? 'percent'
 : 'count';
 return {
 pivotLength: clampNumber(raw?.pivotLength, 6, 2, 20, 0),
 pivotMemory: clampNumber(raw?.pivotMemory, 50, 4, 200, 0),
 numberOfLevels: clampNumber(raw?.numberOfLevels, 4, 1, 8, 0),
 displayStrengthAs,
 showPivotCircles: raw?.showPivotCircles !== false,
 showLevelGlow: raw?.showLevelGlow !== false,
 thickness: clampNumber(raw?.thickness, 3, 1, 8, 0),
 };
 }

 function sanitizeChartDefaults(raw = {}) {
 const preset = String(raw?.defaultPreset || '').trim().toLowerCase();
 return {
 defaultPreset: ['clean', 'ema', 'ema_obv', 'key', 'trade', 'decision', 'trend', 'momentum', 'analysis'].includes(preset) ? preset : 'clean',
 showOrders: !!raw?.showOrders,
 showVwap: !!raw?.showVwap,
 };
 }

 function sanitizeRiskTemplate(raw = {}, defaults = {}) {
 return {
 atrPeriod: 14,
 atrStopMultiplier: clampNumber(raw?.atrStopMultiplier, defaults?.atrStopMultiplier ?? 1.5, 0.1, 10, 2),
 targetRR: clampNumber(raw?.targetRR, defaults?.targetRR ?? 2.0, 0.1, 10, 2),
 };
 }

 function sanitizeRiskTemplates(raw = {}) {
 const templateDefault = sanitizeRiskTemplate(raw?.default || {}, {
 atrStopMultiplier: 1.5,
 targetRR: 2.0,
 });
 const bySymbolEntries = Object.entries(raw?.bySymbol || {})
 .map(([symbol, template]) => {
 const normalized = sanitizeText(symbol, '', 40).toUpperCase();
 if (!normalized) return null;
 return [normalized, sanitizeRiskTemplate(template || {}, templateDefault)];
 })
 .filter(Boolean);
 return {
 default: templateDefault,
 bySymbol: Object.fromEntries(bySymbolEntries),
 };
 }

 function resolveRiskTemplateForSymbol(symbol = '', riskTemplates = {}) {
 const templates = sanitizeRiskTemplates(riskTemplates || {});
 const key = sanitizeText(symbol, '', 40).toUpperCase();
 const override = key ? templates.bySymbol[key] : null;
 return sanitizeRiskTemplate({
 ...(templates.default || {}),
 ...(override || {}),
 }, templates.default || {});
 }

 function sanitizeChartCacheEnabled(value) {
 return value !== false;
 }

 function sanitizeMarketDataMode(value) {
 const mode = String(value || '').trim().toLowerCase();
 return MARKET_DATA_MODES.includes(mode) ? mode : 'auto';
 }

 function sanitizeMarketRegime(value) {
 const regime = String(value || '').trim().toUpperCase();
 return MARKET_REGIMES.includes(regime) ? regime : 'UNKNOWN';
 }

 function normalizePositionSide(value, fallback = 'long') {
 const raw = String(value || '').trim().toLowerCase();
 if (raw === 'sell' || raw.includes('short')) return 'short';
 if (raw === 'buy' || raw.includes('long')) return 'long';
 return String(fallback || '').trim().toLowerCase() === 'short' ? 'short' : 'long';
 }

 function normalizeOrderSide(value, fallback = 'buy') {
 const raw = String(value || '').trim().toLowerCase();
 if (raw === 'sell' || raw.includes('short')) return 'sell';
 if (raw === 'buy' || raw.includes('long')) return 'buy';
 return String(fallback || '').trim().toLowerCase() === 'sell' ? 'sell' : 'buy';
 }

 function firstPositiveNumber(candidates = []) {
 for (const value of candidates) {
 const n = Number(value);
 if (Number.isFinite(n) && n > 0) return n;
 }
 return 0;
 }

 function resolveBracketProtectionLevels(source = {}) {
 const raw = source?.raw && typeof source.raw === 'object' ? source.raw : source;
 const role = String(source?.role || raw?.role || '').trim().toLowerCase();
 const stopNode = source?.stop_loss_order || source?.stopLossOrder || raw?.stop_loss_order || raw?.stopLossOrder || {};
 const targetNode = source?.take_profit_order || source?.takeProfitOrder || raw?.take_profit_order || raw?.takeProfitOrder || {};
 const stopRolePrice = role === 'stop_loss'
 ? firstPositiveNumber([
 source?.stopPrice,
 source?.stop_price,
 source?.limitPrice,
 source?.limit_price,
 source?.price,
 raw?.stopPrice,
 raw?.stop_price,
 raw?.limitPrice,
 raw?.limit_price,
 raw?.price,
 ])
 : 0;
 const targetRolePrice = role === 'take_profit'
 ? firstPositiveNumber([
 source?.limitPrice,
 source?.limit_price,
 source?.price,
 source?.stopPrice,
 source?.stop_price,
 raw?.limitPrice,
 raw?.limit_price,
 raw?.price,
 raw?.stopPrice,
 raw?.stop_price,
 ])
 : 0;
 const stopLoss = firstPositiveNumber([
 source?.stopLoss,
 source?.sl,
 source?.bracketStopLossPrice,
 source?.bracket_stop_loss_price,
 source?.stopLossPrice,
 source?.stop_loss_price,
 raw?.stopLoss,
 raw?.sl,
 raw?.bracketStopLossPrice,
 raw?.bracket_stop_loss_price,
 raw?.stopLossPrice,
 raw?.stop_loss_price,
 stopNode?.stop_price,
 stopNode?.stopPrice,
 stopNode?.limit_price,
 stopNode?.limitPrice,
 stopRolePrice,
 ]);
 const takeProfit = firstPositiveNumber([
 source?.takeProfit,
 source?.tp1,
 source?.tp,
 source?.bracketTakeProfitPrice,
 source?.bracket_take_profit_price,
 source?.takeProfitPrice,
 source?.take_profit_price,
 raw?.takeProfit,
 raw?.tp1,
 raw?.tp,
 raw?.bracketTakeProfitPrice,
 raw?.bracket_take_profit_price,
 raw?.takeProfitPrice,
 raw?.take_profit_price,
 targetNode?.stop_price,
 targetNode?.stopPrice,
 targetNode?.limit_price,
 targetNode?.limitPrice,
 targetRolePrice,
 ]);
 const stopLimitPrice = firstPositiveNumber([
 source?.bracketStopLossLimitPrice,
 source?.bracket_stop_loss_limit_price,
 raw?.bracketStopLossLimitPrice,
 raw?.bracket_stop_loss_limit_price,
 stopNode?.limit_price,
 stopNode?.limitPrice,
 ]);
 const takeProfitLimitPrice = firstPositiveNumber([
 source?.bracketTakeProfitLimitPrice,
 source?.bracket_take_profit_limit_price,
 raw?.bracketTakeProfitLimitPrice,
 raw?.bracket_take_profit_limit_price,
 targetNode?.limit_price,
 targetNode?.limitPrice,
 ]);
 return {
 stopLoss,
 takeProfit,
 stopLimitPrice,
 takeProfitLimitPrice,
 hasStop: stopLoss > 0,
 hasTakeProfit: takeProfit > 0,
 hasFullProtection: stopLoss > 0 && takeProfit > 0,
 };
 }

 function resolveBracketTrailAmount(source = {}) {
 const raw = source?.raw && typeof source.raw === 'object' ? source.raw : source;
 const meta = source?.meta_data || source?.metaData || raw?.meta_data || raw?.metaData || {};
 const stopNode = source?.stop_loss_order || source?.stopLossOrder || raw?.stop_loss_order || raw?.stopLossOrder || {};
 return firstPositiveNumber([
 source?.trailAmount,
 source?.trail_amount,
 source?.trailingAmount,
 source?.trailing_amount,
 source?.bracketTrailAmount,
 source?.bracket_trail_amount,
 source?.bracketTrailingAmount,
 source?.bracket_trailing_amount,
 raw?.trailAmount,
 raw?.trail_amount,
 raw?.trailingAmount,
 raw?.trailing_amount,
 raw?.bracketTrailAmount,
 raw?.bracket_trail_amount,
 raw?.bracketTrailingAmount,
 raw?.bracket_trailing_amount,
 meta?.trailAmount,
 meta?.trail_amount,
 meta?.trailingAmount,
 meta?.trailing_amount,
 meta?.bracketTrailAmount,
 meta?.bracket_trail_amount,
 stopNode?.trailAmount,
 stopNode?.trail_amount,
 stopNode?.trailingAmount,
 stopNode?.trailing_amount,
 stopNode?.bracketTrailAmount,
 stopNode?.bracket_trail_amount,
 ]);
 }

 function hasCompleteBracketProtection(source = {}) {
 return resolveBracketProtectionLevels(source).hasFullProtection;
 }

 function getRegimeThresholds(regime = 'UNKNOWN', strategy = null) {
 const normalizedRegime = sanitizeMarketRegime(regime);
 const preset = REGIME_THRESHOLD_PRESETS[normalizedRegime] || REGIME_THRESHOLD_PRESETS.UNKNOWN;
 const strategyObj = strategy && typeof strategy === 'object' ? strategy : {};
 const pick = (key, fallback, min = 0, max = 100) => {
 const value = Number(strategyObj?.[key]);
 return Number.isFinite(value) ? clampNumber(value, fallback, min, max, 0) : fallback;
 };
 return {
 regime: normalizedRegime,
 alertScore: pick('alertScore', preset.alertScore),
 setupScore: pick('setupScore', preset.setupScore),
 watchScore: pick('watchScore', preset.watchScore),
 minScore: pick('minScore', preset.minScore),
 };
 }

 function detectVolatilityRegime(indexHistory) {
 if (!Array.isArray(indexHistory) || indexHistory.length < 12) return 'UNKNOWN';
 const values = indexHistory
 .slice(-20)
 .map(item => Number(item?.composite || 0))
 .filter(value => Number.isFinite(value) && value > 0);
 if (values.length < 12) return 'UNKNOWN';
 const ranges = [];
 for (let i = 1; i < values.length; i++) {
 ranges.push(Math.abs(values[i] - values[i - 1]));
 }
 if (!ranges.length) return 'UNKNOWN';
 const recentWindow = ranges.slice(-5);
 const recentAtr = recentWindow.reduce((sum, value) => sum + value, 0) / recentWindow.length;
 const averageAtr = ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
 const volatilityRatio = averageAtr > 0 ? recentAtr / averageAtr : 1;
 const trendWindow = values.slice(-10);
 const netMove = Math.abs(trendWindow[trendWindow.length - 1] - trendWindow[0]);
 const pathLength = trendWindow.slice(1).reduce((sum, value, index) => sum + Math.abs(value - trendWindow[index]), 0);
 const efficiencyRatio = pathLength > 0 ? netMove / pathLength : 0;
 if (volatilityRatio > 1.5) return 'HIGH_VOL';
 if (efficiencyRatio > 0.6) return 'TRENDING';
 if (volatilityRatio < 0.6) return 'LOW_VOL';
 return 'CHOPPY';
 }

 function getMarketRegimeMeta(regime = 'UNKNOWN') {
 const normalizedRegime = sanitizeMarketRegime(regime);
 return REGIME_META[normalizedRegime] || REGIME_META.UNKNOWN;
 }

 function getSetupFamilyMeta(family = 'mixed') {
 const normalized = String(family || '').trim().toLowerCase();
 return SETUP_FAMILY_META[normalized] || SETUP_FAMILY_META.mixed;
 }

 function getAllowedSetupFamilies(regime = 'UNKNOWN') {
 const normalized = sanitizeMarketRegime(regime);
 return REGIME_SETUP_PREFERENCES[normalized] || REGIME_SETUP_PREFERENCES.UNKNOWN;
 }

 function classifySetupFamily(signal = {}, marketRegime = 'UNKNOWN') {
 const regime = sanitizeMarketRegime(marketRegime || signal?.marketRegime || 'UNKNOWN');
 const trendRatio = Number(signal?.lower?.trendRatio || signal?.daily?.trendRatio || 0);
 const fundingRate = Math.abs(Number(signal?.fundingRate || signal?.ticker?.fundingRate || 0));
 const change24h = Math.abs(Number(signal?.change24h || signal?.ticker?.change24h || 0));
 const hasClimax = !!signal?.daily?.volumeClimax?.isClimax;
 const hasLiquidation = !!signal?.liquidationRisk;
 const hasSpike = !!signal?.spike;
 const priceAboveVwap = signal?.lower?.vwapAbove;
 const structureBull = !!(signal?.lower?.marketStructure?.bullish || signal?.daily?.marketStructure?.bullish);
 const structureBear = !!(signal?.lower?.marketStructure?.bearish || signal?.daily?.marketStructure?.bearish);
 const structureAligned = structureBull || structureBear;
 const trendSetup = signal?.emergingMove?.mode === 'trend' || (!!signal?.mtfConfirmed && trendRatio >= 0.6);
 const reversalSetup = signal?.emergingMove?.mode === 'reversal' || hasClimax || hasLiquidation;
 const stretched = fundingRate >= 0.05 || change24h >= 8 || hasSpike;
 const orderly = trendRatio >= 0.65 && !hasSpike && !stretched;
 const reclaiming = signal?.direction === 'long'
 ? priceAboveVwap === true && !structureBear
 : signal?.direction === 'short'
 ? priceAboveVwap === false && !structureBull
 : structureAligned;
 let family = 'mixed';
 let confidence = 0.4;

 if (regime === 'TRENDING') {
 if (trendSetup && structureAligned && priceAboveVwap !== null && trendRatio >= 0.72) {
 family = 'continuation';
 confidence = 0.84;
 } else if (trendSetup && structureAligned) {
 family = 'pullback';
 confidence = 0.74;
 } else if (trendSetup && reclaiming) {
 family = 'breakout_retest';
 confidence = 0.69;
 }
 } else if (regime === 'HIGH_VOL') {
 if (hasLiquidation || (reversalSetup && stretched)) {
 family = 'liquidation_reversal';
 confidence = 0.83;
 } else if (reclaiming && stretched) {
 family = 'reclaim';
 confidence = 0.71;
 } else if (stretched) {
 family = 'crowding_unwind';
 confidence = 0.65;
 }
 } else if (regime === 'LOW_VOL') {
 if (trendSetup && !stretched && trendRatio < 0.55) {
 family = 'compression_breakout';
 confidence = 0.78;
 } else if (trendSetup && orderly) {
 family = 'tight_continuation';
 confidence = 0.73;
 } else if (trendSetup && structureAligned) {
 family = 'pullback';
 confidence = 0.66;
 }
 } else if (regime === 'CHOPPY') {
 if (reversalSetup && stretched) {
 family = 'fade_extreme';
 confidence = 0.82;
 } else if (!trendSetup || trendRatio < 0.4) {
 family = 'mean_reversion';
 confidence = 0.72;
 }
 }

 if (family === 'mixed') {
 if (reversalSetup && stretched) {
 family = 'fade_extreme';
 confidence = 0.63;
 } else if (trendSetup && orderly) {
 family = 'continuation';
 confidence = 0.62;
 } else if (reclaiming) {
 family = 'reclaim';
 confidence = 0.58;
 }
 }

 const meta = getSetupFamilyMeta(family);
 const allowedFamilies = getAllowedSetupFamilies(regime);
 const allowedInRegime = allowedFamilies.includes(family) || family === 'mixed';
 return {
 family,
 label: meta.label,
 shortLabel: meta.shortLabel,
 tone: meta.tone,
 copy: meta.copy,
 confidence: clampNumber(confidence, 0.5, 0, 1, 2),
 allowedInRegime,
 regime,
 };
 }

 function computeLeadershipState(marketIndex = {}, scanResults = []) {
 const coins = Array.isArray(marketIndex?.topCoins) ? marketIndex.topCoins : [];
 const btc = coins.find(coin => /^(BTC|XBT)/.test(String(coin?.sym || '')));
 const eth = coins.find(coin => /^ETH/.test(String(coin?.sym || '')));
 const altSignals = (Array.isArray(scanResults) ? scanResults : []).filter(signal => !/^(BTC|XBT|ETH)/.test(String(signal?.symbol || '')));
 const altLongs = altSignals.filter(signal => String(signal?.direction || '').includes('long')).length;
 const altShorts = altSignals.filter(signal => String(signal?.direction || '').includes('short')).length;
 const altBreadth = altLongs - altShorts;
 const btcChange = Number(btc?.change || 0);
 const ethChange = Number(eth?.change || 0);
 let state = 'mixed';
 let label = 'Mixed Leadership';
 let tone = 'muted';
 let copy = 'BTC, ETH, and alt participation are not aligned enough for leadership confirmation.';

 if (btcChange >= 1.25 && ethChange >= 1 && altBreadth >= 2) {
 state = 'broad_risk_on';
 label = 'Broad Risk-On';
 tone = 'good';
 copy = 'BTC and ETH lead while alt participation confirms.';
 } else if (btcChange >= 1 && ethChange < 0.5 && altBreadth <= 0) {
 state = 'btc_only';
 label = 'BTC Only';
 tone = 'warn';
 copy = 'BTC is leading without ETH or alt confirmation.';
 } else if (btcChange <= -1.5 && ethChange <= -1 && altBreadth < -2) {
 state = 'broad_risk_off';
 label = 'Broad Risk-Off';
 tone = 'bad';
 copy = 'Weak BTC and ETH leadership with negative alt participation.';
 } else if (ethChange >= 1 && btcChange < 0.5 && altBreadth > 0) {
 state = 'eth_alt';
 label = 'ETH / Alt Lead';
 tone = 'good';
 copy = 'ETH and alts are carrying the tape more than BTC.';
 }

 return {
 state,
 label,
 tone,
 copy,
 btcChange: clampNumber(btcChange, 0, -100, 100, 2),
 ethChange: clampNumber(ethChange, 0, -100, 100, 2),
 altBreadth,
 altLongs,
 altShorts,
 btcSymbol: btc?.sym || 'BTCUSD',
 ethSymbol: eth?.sym || 'ETHUSD',
 };
 }

 function buildRelativeStrengthSnapshot(signal = {}, benchmarks = {}) {
 const symbolChange = Number(signal?.change24h || 0);
 const btcChange = Number(benchmarks?.btcChange || 0);
 const ethChange = Number(benchmarks?.ethChange || 0);
 const sectorAverage = Number(benchmarks?.sectorAverage || 0);
 const vsBtc = clampNumber(symbolChange - btcChange, 0, -100, 100, 2);
 const vsEth = clampNumber(symbolChange - ethChange, 0, -100, 100, 2);
 const vsSector = clampNumber(symbolChange - sectorAverage, 0, -100, 100, 2);
 const composite = clampNumber((vsBtc * 0.4) + (vsEth * 0.25) + (vsSector * 0.35), 0, -100, 100, 2);
 let state = 'neutral';
 let label = 'RS Mixed';
 let tone = 'muted';
 if (composite >= 3) {
 state = 'strong';
 label = 'RS Strong';
 tone = 'good';
 } else if (composite <= -3) {
 state = 'weak';
 label = 'RS Weak';
 tone = 'bad';
 }
 return {
 vsBtc,
 vsEth,
 vsSector,
 composite,
 state,
 label,
 tone,
 };
 }

 function computeSectorBreadth(scanResults = []) {
 const summary = {};
 (Array.isArray(scanResults) ? scanResults : []).forEach(signal => {
 const sector = String(signal?.sector || 'Other');
 if (!summary[sector]) {
 summary[sector] = {
 sector,
 count: 0,
 bullish: 0,
 bearish: 0,
 avgScore: 0,
 avgChange24h: 0,
 avgTradeQuality: 0,
 topSymbol: '',
 topScore: -Infinity,
 topTradeQuality: -Infinity,
 breadthState: 'balanced',
 breadthScore: 0,
 tone: 'muted',
 };
 }
 const bucket = summary[sector];
 bucket.count += 1;
 bucket.avgScore += Number(signal?.score || 0);
 bucket.avgChange24h += Number(signal?.change24h || 0);
 bucket.avgTradeQuality += Number(signal?.tradeQuality?.score || 0);
 if (String(signal?.direction || '').includes('long')) bucket.bullish += 1;
 if (String(signal?.direction || '').includes('short')) bucket.bearish += 1;
 const rankValue = Number(signal?.tradeQuality?.score || signal?.score || 0);
 if (rankValue > bucket.topTradeQuality || (rankValue === bucket.topTradeQuality && Number(signal?.score || 0) > bucket.topScore)) {
 bucket.topTradeQuality = rankValue;
 bucket.topScore = Number(signal?.score || 0);
 bucket.topSymbol = String(signal?.symbol || '');
 }
 });
 Object.values(summary).forEach(bucket => {
 bucket.avgScore = bucket.count ? Math.round(bucket.avgScore / bucket.count) : 0;
 bucket.avgChange24h = bucket.count ? clampNumber(bucket.avgChange24h / bucket.count, 0, -100, 100, 2) : 0;
 bucket.avgTradeQuality = bucket.count ? Math.round(bucket.avgTradeQuality / bucket.count) : 0;
 bucket.breadthScore = bucket.bullish - bucket.bearish;
 if (bucket.breadthScore >= 3) {
 bucket.breadthState = 'confirmed';
 bucket.tone = 'good';
 } else if (bucket.breadthScore <= -2) {
 bucket.breadthState = 'weak';
 bucket.tone = 'bad';
 } else {
 bucket.breadthState = 'balanced';
 bucket.tone = 'muted';
 }
 });
 const ordered = Object.values(summary).sort((a, b) => b.avgScore - a.avgScore || b.breadthScore - a.breadthScore);
 return {
 bySector: summary,
 leaders: ordered.slice(0, 3),
 laggards: ordered.slice().sort((a, b) => a.breadthScore - b.breadthScore || a.avgScore - b.avgScore).slice(0, 3),
 };
 }

 function deriveSignalPersistence(history = []) {
 const rows = Array.isArray(history)
 ? history.filter(item => item && Number.isFinite(Number(item?.score))).slice(-MAX_SIGNAL_PERSISTENCE_POINTS)
 : [];
 if (!rows.length) {
 return {
 scans: 0,
 trend: 'fresh',
 scoreVelocity: 'flat',
 tierStability: 'new',
 spikeRisk: false,
 label: 'Fresh',
 tone: 'muted',
 };
 }
 const latest = rows[rows.length - 1];
 const oldest = rows[0];
 const delta = Number(latest?.score || 0) - Number(oldest?.score || 0);
 const previous = rows.length > 1 ? rows[rows.length - 2] : null;
 const previousDelta = previous ? Number(latest?.score || 0) - Number(previous?.score || 0) : 0;
 let trend = 'flat';
 let label = `Persistent ${rows.length} scans`;
 let tone = 'muted';
 if (delta >= 8) {
 trend = 'improving';
 label = `Persistent ${rows.length} scans`;
 tone = 'good';
 } else if (delta <= -8) {
 trend = 'degrading';
 label = 'Fading';
 tone = 'bad';
 }
 const latestTier = String(latest?.alertTier || 'none').toLowerCase();
 const stabilityCount = rows.filter(item => String(item?.alertTier || 'none').toLowerCase() === latestTier && latestTier !== 'none').length;
 const tierStability = latestTier === 'none'
 ? 'developing'
 : stabilityCount >= 3
 ? 'persistent'
 : rows.length >= 2 ? 'building' : 'new';
 const scoreVelocity = previousDelta >= 2 ? 'rising' : previousDelta <= -2 ? 'falling' : 'flat';
 const strongRows = rows.filter(item => Number(item?.score || 0) >= 60).length;
 const spikeRisk = rows.length >= 3 && strongRows <= 1 && Number(latest?.score || 0) - Number(rows[rows.length - 2]?.score || 0) >= 10;
 return {
 scans: rows.length,
 trend,
 scoreVelocity,
 tierStability,
 spikeRisk,
 label,
 tone: spikeRisk ? 'warn' : tone,
 scoreDelta: clampNumber(delta, 0, -100, 100, 1),
 latestTier,
 };
 }

 function buildTradeQuality(signal = {}, context = {}) {
 const baseScore = Number(signal?.score ?? signal?.rawScore ?? 0);
 const regime = sanitizeMarketRegime(context?.marketRegime || signal?.marketRegime || 'UNKNOWN');
 const setupAllowed = context?.setupFamilyAllowedInRegime !== false;
 const rsComposite = Number(context?.relativeStrength?.composite || signal?.relativeStrength?.composite || 0);
 const sectorState = String(context?.sectorBreadthState || signal?.sectorBreadthState || 'balanced');
 const leadershipState = String(context?.leadershipState || signal?.marketLeadership?.state || 'mixed');
 const persistence = context?.persistence || signal?.signalPersistence || {};
 const fundingRate = Math.abs(Number(signal?.fundingRate || 0));
 const hasClimax = !!signal?.daily?.volumeClimax?.isClimax;
 const liquidity = Number(signal?.volume24h || 0);
 const atr = Number(signal?.daily?.atr || signal?.lower?.atr || 0);
 const price = Number(signal?.entry || signal?.price || 0);
 const stopDistancePct = price > 0 && Number.isFinite(Number(signal?.sl))
 ? Math.abs((price - Number(signal.sl || 0)) / price) * 100
 : 0;
 let score = baseScore;
 const components = [];

 if (setupAllowed) {
 score += 4;
 components.push('setup-regime fit');
 } else {
 score -= 8;
 components.push('setup-regime mismatch');
 }
 if (regime === 'CHOPPY' && signal?.mtfConfirmed) score -= 4;
 if (regime === 'TRENDING' && signal?.mtfConfirmed) score += 3;
 if (rsComposite >= 4) {
 score += 6;
 components.push('RS confirms');
 } else if (rsComposite <= -4) {
 score -= 8;
 components.push('RS weak');
 }
 if (sectorState === 'confirmed') {
 score += 4;
 components.push('breadth confirms');
 } else if (sectorState === 'weak') {
 score -= 5;
 components.push('breadth weak');
 }
 if (leadershipState === 'broad_risk_on' || leadershipState === 'eth_alt') {
 score += 3;
 components.push('leadership aligned');
 } else if (leadershipState === 'broad_risk_off' || leadershipState === 'btc_only') {
 score -= 3;
 components.push('leadership hostile');
 }
 if (persistence?.trend === 'improving') {
 score += 5;
 components.push('persistent move');
 } else if (persistence?.trend === 'degrading') {
 score -= 5;
 components.push('momentum fading');
 }
 if (persistence?.spikeRisk) {
 score -= 6;
 components.push('one-scan spike');
 }
 if (fundingRate >= 0.08 || hasClimax) {
 score -= 4;
 components.push('crowding risk');
 }
 if (liquidity >= 5000000) {
 score += 2;
 components.push('liquidity OK');
 } else if (liquidity > 0 && liquidity < 750000) {
 score -= 5;
 components.push('thin liquidity');
 }
 if (atr > 0 && stopDistancePct > 0) {
 if (stopDistancePct >= 1 && stopDistancePct <= 4.5) {
 score += 3;
 components.push('stop clean');
 } else if (stopDistancePct > 7) {
 score -= 5;
 components.push('stop wide');
 }
 }

 score = Math.max(0, Math.min(100, Math.round(score)));
 const tone = score >= 75 ? 'good' : score >= 60 ? 'warn' : score >= 45 ? 'muted' : 'bad';
 const label = score >= 75 ? 'A-grade' : score >= 60 ? 'Manageable' : score >= 45 ? 'Selective' : 'Fragile';
 return {
 score,
 tone,
 label,
 summary: components.slice(0, 3).join(' | ') || 'Base chart quality only',
 components,
 };
 }

 function normalizeSymbolList(symbols = [], limit = 0) {
 const seen = new Set();
 const output = [];
 (Array.isArray(symbols) ? symbols : []).forEach(symbol => {
 const normalized = sanitizeText(symbol, '', 40).toUpperCase();
 if (!normalized || seen.has(normalized)) return;
 seen.add(normalized);
 output.push(normalized);
 });
 return limit > 0 ? output.slice(0, limit) : output;
 }

 function sanitizeBlockedSymbolList(symbols = [], limit = 120) {
 const rawList = Array.isArray(symbols)
 ? symbols
 : String(symbols || '')
 .split(/[\s,;]+/g)
 .filter(Boolean);
 return normalizeSymbolList(rawList, limit);
 }

 function sanitizeMarketIndexSettings(raw = {}) {
 const source = raw && typeof raw === 'object' ? raw : {};
 const rawExcludedSymbols = Array.isArray(source?.excludedSymbols)
 ? source.excludedSymbols
 : String(source?.excludedSymbols || source?.excludeSymbols || '')
 .split(/[\s,;]+/g)
 .filter(Boolean);
 return {
 maxConstituents: clampNumber(source?.maxConstituents ?? source?.topCount, 100, 3, 100, 0),
 rebalanceDays: clampNumber(source?.rebalanceDays, 7, 1, 90, 0),
 rebuildNonce: clampNumber(source?.rebuildNonce, 0, 0, Number.MAX_SAFE_INTEGER, 0),
 excludedSymbols: normalizeSymbolList(rawExcludedSymbols, 100),
 weighting: 'equal',
 };
 }

 function sanitizeSetupFamilyKey(value = '') {
 return String(value || '')
 .trim()
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, '_')
 .replace(/^_+|_+$/g, '');
 }

 function normalizeEntryTriggerMode(value = '') {
 const normalized = String(value || '').trim().toLowerCase();
 if (['balanced_confirm', 'strict_retest', 'loose_confirm', 'off'].includes(normalized)) return normalized;
 return 'balanced_confirm';
 }

 function resolveEntryTrigger(signal = {}, settings = {}) {
 const cfg = sanitizeAutoTradeSettings(settings || {});
 const mode = normalizeEntryTriggerMode(cfg.entryTriggerMode);
 const required = cfg.entryTriggerRequired !== false && mode !== 'off';
 const direction = String(signal?.direction || signal?.side || '').trim().toLowerCase();
 const side = direction.startsWith('short') || direction === 'sell'
 ? 'short'
 : direction.startsWith('long') || direction === 'buy'
 ? 'long'
 : '';
 const entry = Math.max(0, Number(signal?.entry || signal?.price || 0));
 const lower = signal?.lower && typeof signal.lower === 'object' ? signal.lower : {};
 const daily = signal?.daily && typeof signal.daily === 'object' ? signal.daily : {};
 const price = Math.max(0, Number(lower?.price || signal?.price || signal?.entry || 0));
 const atr = Math.max(0, Number(lower?.atr || daily?.atr || 0));
 const atrPct = entry > 0 && atr > 0 ? (atr / entry) * 100 : 0;
 const refs = [lower?.vwap, lower?.emaF, lower?.emaM, lower?.emaS, daily?.emaF]
 .map(value => Number(value || 0))
 .filter(value => value > 0);
 const nearestRef = refs.reduce((nearest, value) => {
 if (!(nearest > 0)) return value;
 return Math.abs(value - entry) < Math.abs(nearest - entry) ? value : nearest;
 }, 0);
 const chasePct = entry > 0 && nearestRef > 0 ? Math.abs(entry - nearestRef) / entry * 100 : 0;
 const maxChasePct = Math.max(0.65, Math.min(3.5, (atrPct > 0 ? atrPct * 1.8 : 1.2)));
 const noChase = !(chasePct > 0) || chasePct <= maxChasePct;
 const reasons = [];
 const confirmations = [];

 if (!required) {
 return {
 mode,
 required: false,
 passed: true,
 side,
 triggerType: 'not_required',
 label: 'Entry trigger not required',
 tone: 'muted',
 reasons: ['entry trigger not required'],
 confirmations,
 noChase: true,
 chasePct: +chasePct.toFixed(2),
 maxChasePct: +maxChasePct.toFixed(2),
 };
 }
 if (!side) reasons.push('direction unavailable');
 if (!(entry > 0)) reasons.push('entry unavailable');
 if (!noChase) reasons.push(`entry extended ${chasePct.toFixed(2)}% from mean`);

 const structure = lower?.marketStructure || {};
 const closeConfirms = side === 'long'
 ? !!(
 lower?.emaCross === 'bull'
 || structure?.bullish
 || (price > 0 && Number(lower?.emaM || 0) > 0 && price >= Number(lower.emaM))
 || lower?.vwapAbove === true
 )
 : !!(
 lower?.emaCross === 'bear'
 || structure?.bearish
 || (price > 0 && Number(lower?.emaM || 0) > 0 && price <= Number(lower.emaM))
 || lower?.vwapAbove === false
 );
 if (closeConfirms) confirmations.push('close confirms direction');

 const holdRefs = [lower?.vwap, lower?.emaF, lower?.emaM]
 .map(value => Number(value || 0))
 .filter(value => value > 0);
 const holdThreshold = Math.max(entry * 0.0045, atr > 0 ? atr * 0.35 : 0);
 const heldMean = holdRefs.some(ref => Math.abs(entry - ref) <= holdThreshold);
 if (heldMean && closeConfirms) confirmations.push('retest/hold near mean');

 const keyLevels = signal?.keyLevels && typeof signal.keyLevels === 'object' ? signal.keyLevels : {};
 const supportLevels = Array.isArray(keyLevels?.support) ? keyLevels.support : [];
 const resistanceLevels = Array.isArray(keyLevels?.resistance) ? keyLevels.resistance : [];
 const zoneThreshold = Math.max(entry * 0.009, atr > 0 ? atr * 0.75 : 0);
 const hasPullbackZone = side === 'long'
 ? supportLevels.some(level => {
 const priceValue = Number(level?.price || 0);
 return priceValue > 0 && priceValue <= entry && Math.abs(entry - priceValue) <= zoneThreshold;
 })
 : resistanceLevels.some(level => {
 const priceValue = Number(level?.price || 0);
 return priceValue > 0 && priceValue >= entry && Math.abs(entry - priceValue) <= zoneThreshold;
 });
 if (hasPullbackZone) confirmations.push('pullback into key zone');

 const hasConfirmation = confirmations.length > 0;
 const passed = !!(
 side
 && entry > 0
 && noChase
 && (
 mode === 'loose_confirm'
 ? (hasConfirmation || closeConfirms)
 : mode === 'strict_retest'
 ? (confirmations.includes('retest/hold near mean') || confirmations.includes('pullback into key zone'))
 : hasConfirmation
 )
 );
 if (!hasConfirmation) reasons.push('no close/retest/key-zone confirmation');
 if (mode === 'strict_retest' && passed === false && hasConfirmation) reasons.push('strict retest not confirmed');
 const triggerType = confirmations.includes('pullback into key zone')
 ? 'pullback_zone'
 : confirmations.includes('retest/hold near mean')
 ? 'retest_hold'
 : confirmations.includes('close confirms direction')
 ? 'close_confirm'
 : 'none';
 return {
 mode,
 required,
 passed,
 side,
 triggerType,
 label: passed ? 'Entry confirmed' : 'Entry trigger waiting',
 tone: passed ? 'good' : 'warn',
 reasons: passed ? confirmations.slice(0, 3) : reasons.slice(0, 4),
 confirmations,
 noChase,
 chasePct: +chasePct.toFixed(2),
 maxChasePct: +maxChasePct.toFixed(2),
 atrPct: +atrPct.toFixed(2),
 };
 }

 function resolveRiskQualityGate(signal = {}, settings = {}) {
 const cfg = sanitizeAutoTradeSettings(settings || {});
 const required = cfg.riskQualityRequired !== false;
 const direction = String(signal?.direction || signal?.side || '').trim().toLowerCase();
 const side = direction.startsWith('short') || direction === 'sell' ? 'short' : 'long';
 const entry = Math.max(0, Number(signal?.entry || signal?.price || 0));
 const stop = Math.max(0, Number(signal?.sl || signal?.stopLoss || 0));
 const target = Math.max(0, Number(signal?.tp1 || signal?.tp || signal?.takeProfit || 0));
 const price = Math.max(0, Number(signal?.lower?.price || signal?.price || entry || 0));
 const risk = entry > 0 && stop > 0 ? Math.abs(entry - stop) : 0;
 const reward = entry > 0 && target > 0 ? Math.abs(target - entry) : 0;
 const rr = risk > 0 ? reward / risk : 0;
 const stopDistancePct = entry > 0 && risk > 0 ? (risk / entry) * 100 : 0;
 const entryDistancePct = entry > 0 && price > 0 ? Math.abs(price - entry) / entry * 100 : 0;
 const minRr = Number(cfg.riskQualityMinRewardRisk || 1.15);
 const maxStopPct = Number(cfg.riskQualityMaxStopDistancePct || 3.5);
 const maxEntryPct = Number(cfg.riskQualityMaxEntryDistancePct || 1.8);
 const tq = Number(signal?.tradeQuality?.score || signal?.tradeQuality || 0);
 const reasons = [];
 const confirmations = [];
 if (!required) {
 return {
 required: false,
 passed: true,
 label: 'Risk gate advisory',
 tone: 'muted',
 side,
 rr: +rr.toFixed(2),
 stopDistancePct: +stopDistancePct.toFixed(2),
 entryDistancePct: +entryDistancePct.toFixed(2),
 reasons: ['risk quality gate not required'],
 confirmations,
 };
 }
 if (!(entry > 0)) reasons.push('entry price missing');
 if (!(stop > 0)) reasons.push('stop price missing');
 if (!(target > 0)) reasons.push('target price missing');
 if (risk > 0 && reward > 0 && rr < minRr) reasons.push(`reward:risk ${rr.toFixed(2)} below ${minRr.toFixed(2)}`);
 else if (risk > 0 && reward > 0) confirmations.push(`reward:risk ${rr.toFixed(2)}`);
 if (stopDistancePct > maxStopPct) reasons.push(`stop distance ${stopDistancePct.toFixed(2)}% above ${maxStopPct.toFixed(2)}%`);
 else if (stopDistancePct > 0) confirmations.push(`stop distance ${stopDistancePct.toFixed(2)}%`);
 if (entryDistancePct > maxEntryPct) reasons.push(`entry drift ${entryDistancePct.toFixed(2)}% above ${maxEntryPct.toFixed(2)}%`);
 else if (entryDistancePct > 0) confirmations.push(`entry drift ${entryDistancePct.toFixed(2)}%`);
 if (tq > 0 && tq < Number(cfg.minScore || 75)) reasons.push(`trade quality ${Math.round(tq)} below ${Math.round(Number(cfg.minScore || 75))}`);
 const passed = reasons.length === 0;
 return {
 required,
 passed,
 label: passed ? 'Risk quality passed' : 'Risk quality blocked',
 tone: passed ? 'good' : 'bad',
 side,
 rr: +rr.toFixed(2),
 stopDistancePct: +stopDistancePct.toFixed(2),
 entryDistancePct: +entryDistancePct.toFixed(2),
 minRewardRisk: +minRr.toFixed(2),
 maxStopDistancePct: +maxStopPct.toFixed(2),
 maxEntryDistancePct: +maxEntryPct.toFixed(2),
 reasons: passed ? confirmations.slice(0, 4) : reasons.slice(0, 5),
 confirmations,
 };
 }

 function normalizeShadowTrade(signal = {}, trigger = {}, now = Date.now()) {
 const symbol = sanitizeText(signal?.symbol || '', '', 40).toUpperCase();
 const direction = String(signal?.direction || '').trim().toLowerCase();
 const side = direction.startsWith('short') ? 'short' : 'long';
 const entry = Math.max(0, Number(signal?.entry || signal?.price || 0));
 const stopLoss = Math.max(0, Number(signal?.sl || signal?.stopLoss || 0));
 const takeProfit = Math.max(0, Number(signal?.tp1 || signal?.tp || signal?.takeProfit || 0));
 const setupFamily = sanitizeSetupFamilyKey(signal?.setupFamily || signal?.setupFamilyLabel || 'mixed') || 'mixed';
 const timeframe = sanitizeText(signal?.lower?.label || signal?.tf2 || signal?.timeframe || '4h', '4h', 16);
 const marketRegime = sanitizeMarketRegime(signal?.marketRegime || 'UNKNOWN');
 const idSeed = [
 symbol,
 side,
 setupFamily,
 timeframe,
 Math.round(Number(now || Date.now()) / 60000),
 ].join('_');
 return {
 id: `paper_${idSeed}`,
 source: 'paper',
 symbol,
 side,
 status: 'open',
 openedAt: Number(now || Date.now()),
 updatedAt: Number(now || Date.now()),
 closedAt: 0,
 entryPrice: entry,
 exitPrice: 0,
 stopLoss,
 takeProfit,
 pnl: 0,
 pnlPct: 0,
 rMultiple: null,
 outcome: 'open',
 setupFamilyKey: setupFamily,
 setupFamily,
 setupFamilyLabel: sanitizeText(signal?.setupFamilyLabel || setupFamily.replace(/_/g, ' '), setupFamily, 80),
 timeframe,
 marketRegime,
 tradeQuality: Number(signal?.tradeQuality?.score || signal?.tradeQuality || 0),
 score: Number(signal?.score || 0),
 trigger,
 triggerType: trigger?.triggerType || '',
 maxFavorablePct: 0,
 maxAdversePct: 0,
 lastCandleTime: 0,
 };
 }

 function updateShadowTradeWithCandles(trade = {}, candles = []) {
 if (!trade || typeof trade !== 'object') return trade;
 if (String(trade.status || 'open').toLowerCase() !== 'open') return trade;
 const rows = Array.isArray(candles) ? candles : [];
 const side = String(trade.side || '').toLowerCase() === 'short' ? 'short' : 'long';
 const entry = Number(trade.entryPrice || trade.entry || 0);
 const stop = Number(trade.stopLoss || trade.sl || 0);
 const target = Number(trade.takeProfit || trade.tp || trade.tp1 || 0);
 if (!(entry > 0) || !(stop > 0) || !(target > 0)) return trade;
 let next = { ...trade };
 const openedAt = Number(next.openedAt || 0);
 const lastSeen = Number(next.lastCandleTime || 0);
 for (const candle of rows) {
 const rawTs = Number(candle?.time || candle?.ts || 0);
 const ts = rawTs > 0 && rawTs < 1e12 ? rawTs * 1000 : rawTs;
 if (!(ts > 0) || ts <= lastSeen || (openedAt > 0 && ts < openedAt)) continue;
 const high = Number(candle?.high || 0);
 const low = Number(candle?.low || 0);
 const close = Number(candle?.close || 0);
 if (!(high > 0) || !(low > 0)) continue;
 const favorablePct = side === 'short'
 ? ((entry - low) / entry) * 100
 : ((high - entry) / entry) * 100;
 const adversePct = side === 'short'
 ? ((high - entry) / entry) * 100
 : ((entry - low) / entry) * 100;
 next.maxFavorablePct = Math.max(Number(next.maxFavorablePct || 0), Number.isFinite(favorablePct) ? favorablePct : 0);
 next.maxAdversePct = Math.max(Number(next.maxAdversePct || 0), Number.isFinite(adversePct) ? adversePct : 0);
 next.lastCandleTime = ts;
 const hitStop = side === 'short' ? high >= stop : low <= stop;
 const hitTarget = side === 'short' ? low <= target : high >= target;
 if (!hitStop && !hitTarget) continue;
 const exitPrice = hitStop ? stop : target;
 const gained = side === 'short' ? (entry - exitPrice) : (exitPrice - entry);
 const risk = Math.abs(entry - stop);
 next = {
 ...next,
 status: 'closed',
 closedAt: ts,
 updatedAt: ts,
 exitPrice,
 pnl: +gained.toFixed(6),
 pnlPct: entry > 0 ? +((gained / entry) * 100).toFixed(4) : 0,
 rMultiple: risk > 0 ? +(gained / risk).toFixed(2) : null,
 outcome: hitStop ? 'loss' : 'win',
 closePrice: close > 0 ? close : exitPrice,
 };
 break;
 }
 return next;
 }

 function buildSetupPerformance(trades = [], liveTrades = [], options = {}) {
 const minSample = clampNumber(options?.minSample, 20, 1, 500, 0);
 const rows = new Map();
 const addTrade = (trade = {}, source = 'paper') => {
 const status = String(trade?.status || '').toLowerCase();
 if (status && status !== 'closed') return;
 const closedAt = Number(trade?.closedAt || trade?.ts || 0);
 if (!(closedAt > 0)) return;
 const familyKey = sanitizeSetupFamilyKey(trade?.setupFamilyKey || trade?.setupFamily || trade?.setupFamilyLabel || 'untagged') || 'untagged';
 const timeframe = sanitizeText(trade?.timeframe || trade?.tf2 || '4h', '4h', 16);
 const marketRegime = sanitizeMarketRegime(trade?.marketRegime || 'UNKNOWN');
 const key = `${familyKey}|${timeframe}|${marketRegime}`;
 const row = rows.get(key) || {
 key,
 familyKey,
 family: sanitizeText(trade?.setupFamilyLabel || trade?.setupFamily || familyKey.replace(/_/g, ' '), familyKey, 80),
 timeframe,
 marketRegime,
 trades: 0,
 wins: 0,
 losses: 0,
 paperTrades: 0,
 liveTrades: 0,
 totalR: 0,
 rCount: 0,
 totalPnl: 0,
 tradeQualitySum: 0,
 tradeQualityCount: 0,
 lastClosedAt: 0,
 equity: 0,
 peak: 0,
 maxDrawdown: 0,
 };
 const hasR = trade?.rMultiple !== null && trade?.rMultiple !== undefined && trade?.rMultiple !== '';
 const rRaw = Number(trade?.rMultiple);
 const pnlRaw = Number(trade?.pnlPct ?? trade?.pnl ?? 0);
 const scoreValue = hasR && Number.isFinite(rRaw) ? rRaw : pnlRaw;
 row.trades += 1;
 if (source === 'paper') row.paperTrades += 1;
 else row.liveTrades += 1;
 if (scoreValue > 0) row.wins += 1;
 if (scoreValue < 0) row.losses += 1;
 if (hasR && Number.isFinite(rRaw)) {
 row.totalR += rRaw;
 row.rCount += 1;
 }
 if (Number.isFinite(pnlRaw)) row.totalPnl += pnlRaw;
 const tq = Number(trade?.tradeQuality || trade?.tradeQualityScore || 0);
 if (tq > 0) {
 row.tradeQualitySum += tq;
 row.tradeQualityCount += 1;
 }
 row.lastClosedAt = Math.max(row.lastClosedAt, closedAt);
 row.equity += scoreValue;
 row.peak = Math.max(row.peak, row.equity);
 row.maxDrawdown = Math.max(row.maxDrawdown, row.peak - row.equity);
 rows.set(key, row);
 };
 (Array.isArray(trades) ? trades : []).forEach(trade => addTrade(trade, 'paper'));
 (Array.isArray(liveTrades) ? liveTrades : []).forEach(trade => addTrade(trade, 'live'));
 const list = Array.from(rows.values()).map(row => {
 const expectancy = row.trades > 0
 ? +(row.totalPnl / row.trades).toFixed(2)
 : 0;
 const avgR = row.rCount > 0 ? +(row.totalR / row.rCount).toFixed(2) : null;
 const edgeValue = avgR != null ? avgR : expectancy;
 const status = row.trades < minSample
 ? 'proving'
 : edgeValue > 0
 ? 'positive_edge'
 : 'weak_edge';
 return {
 key: row.key,
 familyKey: row.familyKey,
 family: row.family,
 timeframe: row.timeframe,
 marketRegime: row.marketRegime,
 trades: row.trades,
 wins: row.wins,
 losses: row.losses,
 paperTrades: row.paperTrades,
 liveTrades: row.liveTrades,
 winRate: row.trades > 0 ? +((row.wins / row.trades) * 100).toFixed(1) : 0,
 expectancy,
 avgR,
 maxDrawdown: +row.maxDrawdown.toFixed(2),
 avgTradeQuality: row.tradeQualityCount > 0 ? +(row.tradeQualitySum / row.tradeQualityCount).toFixed(1) : null,
 lastClosedAt: row.lastClosedAt,
 status,
 statusLabel: status === 'positive_edge' ? 'Positive Edge' : status === 'weak_edge' ? 'Weak Edge' : 'Proving',
 tone: status === 'positive_edge' ? 'good' : status === 'weak_edge' ? 'bad' : 'warn',
 };
 }).sort((a, b) =>
 Number(b.trades || 0) - Number(a.trades || 0)
 || Number(b.expectancy || 0) - Number(a.expectancy || 0)
 || Number(b.winRate || 0) - Number(a.winRate || 0)
 );
 return {
 updatedAt: Date.now(),
 minSample,
 rows: Object.fromEntries(list.map(row => [row.key, row])),
 list,
 };
 }

 function sanitizeAutoTradeSettings(raw = {}) {
 const entryMode = String(raw?.entryMode || '').trim().toLowerCase();
 const entryTriggerMode = normalizeEntryTriggerMode(raw?.entryTriggerMode);
 const defaultMinScore = clampNumber(raw?.minScore, 75, 75, 100, 0);
 return {
 minScore: defaultMinScore,
 autoSizeUSD: clampNumber(raw?.autoSizeUSD, 5, 1, 60, 0),
 minLiquidityUSD: clampNumber(raw?.minLiquidityUSD, 750000, 0, 1000000000, 0),
 probationMinLiquidityUSD: clampNumber(raw?.probationMinLiquidityUSD, 1500000, 0, 1000000000, 0),
 validatedMaxSpreadPct: clampNumber(raw?.validatedMaxSpreadPct, 0.28, 0.01, 5, 2),
 probationMaxSpreadPct: clampNumber(raw?.probationMaxSpreadPct, 0.18, 0.01, 5, 2),
 maxPerScan: clampNumber(raw?.maxPerScan, 2, 1, 5, 0),
 maxPerDay: clampNumber(raw?.maxPerDay, 6, 1, 50, 0),
 maxConcurrent: clampNumber(raw?.maxConcurrent, 5, 1, 5, 0),
 correlationLimitEnabled: raw?.correlationLimitEnabled !== false,
 maxCorrelatedExposure: clampNumber(raw?.maxCorrelatedExposure, 1, 1, 5, 0),
 correlationThreshold: clampNumber(raw?.correlationThreshold, 0.9, 0.5, 0.99, 2),
 dailyLossLimitUSD: clampNumber(raw?.dailyLossLimitUSD, 8, 1, 10000, 0),
 entryMode: ['maker_only', 'maker_preferred', 'limit', 'market'].includes(entryMode) ? entryMode : 'maker_only',
 cooldownSec: clampNumber(raw?.cooldownSec, 90, 30, 86400, 0),
 profileId: sanitizeText(raw?.profileId, '', 80),
 reverseSignals: raw?.reverseSignals === true,
 notifyBrowser: raw?.notifyBrowser !== false,
 notifyTelegram: raw?.notifyTelegram !== false,
 closeOnFlip: raw?.closeOnFlip !== false,
 maxAdverseFundingRatePct: clampNumber(raw?.maxAdverseFundingRatePct, 0.05, 0, 5, 4),
 fundingCloseMinutesBeforeSettlement: clampNumber(raw?.fundingCloseMinutesBeforeSettlement, 0, 0, 120, 0),
 fundingMinHoldHours: clampNumber(raw?.fundingMinHoldHours, 12, 0, 168, 0),
 fundingCloseOnlyInProfit: raw?.fundingCloseOnlyInProfit !== false,
 paperTrackingEnabled: raw?.paperTrackingEnabled !== false,
 entryTriggerMode,
 entryTriggerRequired: raw?.entryTriggerRequired !== false,
 setupPerformanceMinSample: clampNumber(raw?.setupPerformanceMinSample, 20, 1, 500, 0),
 riskQualityRequired: raw?.riskQualityRequired !== false,
 riskQualityMinRewardRisk: clampNumber(raw?.riskQualityMinRewardRisk, 1.15, 0.2, 10, 2),
 riskQualityMaxStopDistancePct: clampNumber(raw?.riskQualityMaxStopDistancePct, 3.5, 0.05, 50, 2),
 riskQualityMaxEntryDistancePct: clampNumber(raw?.riskQualityMaxEntryDistancePct, 1.8, 0.05, 50, 2),
 probationSizePct: clampNumber(raw?.probationSizePct, 90, 85, 100, 0),
 maturityNewDailyBars: clampNumber(raw?.maturityNewDailyBars, 45, 10, 200, 0),
 maturityNewLowerBars: clampNumber(raw?.maturityNewLowerBars, 90, 20, 400, 0),
 maturityProbationDailyBars: clampNumber(raw?.maturityProbationDailyBars, 120, 20, 240, 0),
 maturityProbationLowerBars: clampNumber(raw?.maturityProbationLowerBars, 120, 40, 400, 0),
 };
 }

 function sanitizeDcaBotSettings(raw = {}) {
 const entryMode = String(raw?.entryMode || '').trim().toLowerCase();
 const side = String(raw?.side || '').trim().toLowerCase();
 return {
 enabled: raw?.enabled === true,
 symbol: sanitizeText(raw?.symbol || 'BTCUSD', 'BTCUSD', 32).toUpperCase(),
 side: side === 'short' || side === 'sell' ? 'short' : 'long',
 orderSizeUSD: clampNumber(raw?.orderSizeUSD, 5, 1, 100000, 0),
 maxOrders: clampNumber(raw?.maxOrders, 5, 1, 100, 0),
 maxDailyUSD: clampNumber(raw?.maxDailyUSD, 25, 1, 1000000, 0),
 intervalMinutes: clampNumber(raw?.intervalMinutes, 60, 1, 10080, 0),
 priceStepPct: clampNumber(raw?.priceStepPct, 1.5, 0, 100, 2),
 takeProfitPct: clampNumber(raw?.takeProfitPct, 1.2, 0.1, 100, 2),
 stopLossPct: clampNumber(raw?.stopLossPct, 8, 0.1, 100, 2),
 entryMode: ['maker_only', 'maker_preferred', 'limit', 'market'].includes(entryMode) ? entryMode : 'maker_only',
 profileId: sanitizeText(raw?.profileId, '', 80),
 notifyBrowser: raw?.notifyBrowser !== false,
 notifyTelegram: raw?.notifyTelegram !== false,
 };
 }

 function classifySymbolMaturity(signal = {}, settings = {}) {
 const cfg = sanitizeAutoTradeSettings(settings || {});
 const history = signal?.historyQuality && typeof signal.historyQuality === 'object'
 ? signal.historyQuality
 : signal?.history && typeof signal.history === 'object'
 ? signal.history
 : {};
 const dailyBars = Math.max(0, Number(signal?.dailyBars ?? history?.dailyBars ?? 0));
 const lowerBars = Math.max(0, Number(signal?.lowerBars ?? history?.lowerBars ?? 0));
 const missingHistory = dailyBars <= 0 || lowerBars <= 0;
 const newDailyBars = Math.max(1, Number(cfg.maturityNewDailyBars || 45));
 const newLowerBars = Math.max(1, Number(cfg.maturityNewLowerBars || 90));
 const probationDailyBars = Math.max(newDailyBars, Number(cfg.maturityProbationDailyBars || 120));
 const probationLowerBars = Math.max(newLowerBars, Number(cfg.maturityProbationLowerBars || 120));
 const probationSizePct = Math.max(85, Math.min(100, Number(cfg.probationSizePct || 90)));
 const reasons = [];
 let state = 'validated';
 let autoTradeAllowed = true;
 let sizeMultiplierPct = 100;

 if (missingHistory) {
 state = 'new';
 autoTradeAllowed = true;
 sizeMultiplierPct = 100;
 reasons.push('history missing');
 } else if (dailyBars < newDailyBars || lowerBars < newLowerBars) {
 state = 'new';
 autoTradeAllowed = true;
 sizeMultiplierPct = 100;
 if (dailyBars < newDailyBars) reasons.push(`daily history ${dailyBars} < ${newDailyBars}`);
 if (lowerBars < newLowerBars) reasons.push(`lower-TF history ${lowerBars} < ${newLowerBars}`);
 } else if (dailyBars < probationDailyBars || lowerBars < probationLowerBars) {
 state = 'probation';
 sizeMultiplierPct = probationSizePct;
 if (dailyBars < probationDailyBars) reasons.push(`daily history ${dailyBars} < ${probationDailyBars}`);
 if (lowerBars < probationLowerBars) reasons.push(`lower-TF history ${lowerBars} < ${probationLowerBars}`);
 }

 const label = state === 'validated'
 ? 'Validated'
 : state === 'probation'
 ? 'Probation'
 : 'New';
 const summary = state === 'validated'
 ? 'history validated'
 : state === 'probation'
 ? `probation size ${probationSizePct}%`
 : 'history building';

 return {
 state: SYMBOL_MATURITY_STATES.includes(state) ? state : 'validated',
 label,
 dailyBars,
 lowerBars,
 autoTradeAllowed,
 probationary: state === 'probation',
 validated: state === 'validated',
 sizeMultiplierPct,
 reasons,
 summary,
 };
 }

 function resolveFundingDecision(signal = {}) {
 const threshold = Math.abs(Number(signal?.fundingDecisionThresholdPct || 0));
 const fundingRate = Number(signal?.fundingRate || signal?.ticker?.fundingRate || 0);
 const direction = String(signal?.direction || '').toLowerCase();
 const side = direction.startsWith('short')
 ? 'short'
 : direction.startsWith('long')
 ? 'long'
 : '';
 const blocked = !!(
 threshold > 0
 && fundingRate
 && side
 && (
 (side === 'long' && fundingRate >= threshold)
 || (side === 'short' && fundingRate <= -threshold)
 )
 );
 return {
 blocked,
 side,
 threshold,
 fundingRate,
 reason: blocked
 ? `funding adverse ${fundingRate >= 0 ? '+' : ''}${fundingRate.toFixed(4)}%/8h`
 : '',
 };
 }

 function resolveDecisionAction(signal = {}, thresholds = {}) {
 const score = Number(signal?.score || 0);
 const tradeQuality = Number(signal?.tradeQuality?.score || 0);
 const direction = String(signal?.direction || '').toLowerCase();
 const fundingDecision = resolveFundingDecision(signal);
 const activeThresholds = signal?.activeThresholds && typeof signal.activeThresholds === 'object'
 ? signal.activeThresholds
 : {};
 const setupThreshold = Number(thresholds?.setupScore ?? activeThresholds?.setupScore ?? 60);
 const watchThreshold = Number(thresholds?.watchScore ?? activeThresholds?.watchScore ?? 45);
 const action = !fundingDecision.blocked
 && tradeQuality >= DECISION_ACTION_THRESHOLDS.tradeNowTradeQuality
 && score >= setupThreshold
 && !direction.startsWith('watch')
 ? 'TRADE NOW'
 : !fundingDecision.blocked
 && tradeQuality >= DECISION_ACTION_THRESHOLDS.watchCloseTradeQuality
 && score >= Math.max(watchThreshold, DECISION_ACTION_THRESHOLDS.watchCloseScoreFloor)
 ? 'WATCH CLOSE'
 : 'PASS';
 const shortlistEligible = !fundingDecision.blocked
 && tradeQuality >= DECISION_ACTION_THRESHOLDS.shortlistTradeQuality
 && score >= Math.max(watchThreshold, DECISION_ACTION_THRESHOLDS.shortlistScoreFloor);
 return {
 action,
 shortlistEligible,
 setupThreshold,
 watchThreshold,
 fundingDecision,
 tradeQuality,
 score,
 direction,
 };
 }

 function buildDecisionShortlist(scanResults = [], context = {}) {
 const thresholds = context?.thresholds || {};
 const limit = clampNumber(context?.limit, AUTO_SHORTLIST_LIMIT, 1, 20, 0);
 return (Array.isArray(scanResults) ? scanResults : [])
 .filter(signal => signal && sanitizeText(signal?.symbol, '', 40))
 .map(signal => {
 const tradeQuality = Number(signal?.tradeQuality?.score || 0);
 const rs = Number((signal?.rsComposite ?? signal?.relativeStrength?.composite) || 0);
 const setupAllowed = signal?.setupFamilyAllowedInRegime !== false;
 const persistence = signal?.signalPersistence || {};
 const sectorState = String(signal?.sectorBreadthState || 'balanced');
 const leadershipState = String(signal?.marketLeadership?.state || context?.leadershipState || 'mixed');
 const direction = String(signal?.direction || '').toLowerCase();
 const alertTier = String(signal?.alertTier || 'none').toLowerCase();
 const symbol = sanitizeText(signal?.symbol, '', 40).toUpperCase();
 let decisionScore = tradeQuality;
 const reasons = [];

 if (signal?.mtfConfirmed) {
 decisionScore += 5;
 reasons.push('MTF confirmed');
 }
 if (setupAllowed) {
 decisionScore += 4;
 reasons.push('regime fit');
 } else {
 decisionScore -= 8;
 }
 if (alertTier === 'execute') {
 decisionScore += 8;
 reasons.push('execute-ready');
 } else if (alertTier === 'setup') {
 decisionScore += 4;
 }
 if (!direction.startsWith('watch')) decisionScore += 3;
 else decisionScore -= 2;
 if (rs >= 3) {
 decisionScore += 4;
 reasons.push('RS strong');
 } else if (rs <= -3) {
 decisionScore -= 6;
 }
 if (persistence?.trend === 'improving') {
 decisionScore += 4;
 reasons.push('persistent');
 } else if (persistence?.spikeRisk) {
 decisionScore -= 6;
 }
 if (sectorState === 'confirmed') {
 decisionScore += 3;
 reasons.push('breadth confirms');
 } else if (sectorState === 'weak') {
 decisionScore -= 6;
 }
 if (leadershipState === 'broad_risk_off') decisionScore -= 4;
 if (leadershipState === 'btc_only' && !/^(BTC|XBT|ETH)/i.test(symbol)) decisionScore -= 3;

 const decision = resolveDecisionAction(signal, thresholds);
 if (decision?.fundingDecision?.blocked) {
 decisionScore -= 14;
 reasons.unshift('funding adverse');
 }
 const action = decision.action;
 return {
 ...signal,
 symbol,
 decisionScore: Math.round(clampNumber(decisionScore, 0, 0, 150, 0)),
 shortlistAction: action,
 shortlistTone: action === 'TRADE NOW' ? 'good' : action === 'WATCH CLOSE' ? 'warn' : 'muted',
 shortlistReason: reasons[0] || 'best current candidate',
 shortlistSummary: reasons.slice(0, 3).join(' | ') || 'best current candidate',
 shortlistEligible: decision.shortlistEligible,
 fundingDecision: decision.fundingDecision,
 };
 })
 .filter(signal => signal.shortlistEligible)
 .sort((a, b) => Number(b.decisionScore || 0) - Number(a.decisionScore || 0)
 || Number(b.tradeQuality?.score || 0) - Number(a.tradeQuality?.score || 0)
 || Number(b.score || 0) - Number(a.score || 0)
 || String(a.symbol || '').localeCompare(String(b.symbol || '')))
 .slice(0, limit)
 .map((signal, index) => ({
 ...signal,
 shortlistRank: index + 1,
 shortlistLabel: `#${index + 1} ${signal.shortlistAction}`,
 }));
 }

 function mergeWatchlists(manualWatchlist = [], autoWatchlist = [], limit = 0) {
 return normalizeSymbolList([...(manualWatchlist || []), ...(autoWatchlist || [])], limit);
 }

 function formatThresholdSummary(thresholds = {}) {
 const execute = Math.round(Number(thresholds?.alertScore || 0));
 const setup = Math.round(Number(thresholds?.setupScore || 0));
 const watch = Math.round(Number(thresholds?.watchScore || 0));
 return `Execute >= ${execute} | Setup >= ${setup} | Watch >= ${watch}`;
 }

 function clampNumber(v, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, digits = 4) {
 const n = Number(v);
 if (!Number.isFinite(n)) return fallback;
 const bounded = Math.max(min, Math.min(max, n));
 if (!Number.isFinite(digits) || digits < 0) return bounded;
 return +bounded.toFixed(digits);
 }

 function sanitizeText(v, fallback = '', max = 120) {
 const text = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
 if (!text) return fallback;
 return text.slice(0, Math.max(0, max));
 }

 function sanitizeAccountId(v, prefix = 'acct') {
 const base = sanitizeText(v, '', 48).replace(/[^A-Za-z0-9_-]/g, '');
 return base || `${prefix}_${Date.now().toString(36)}`;
 }

 function sanitizeAccountCapability(v) {
 const raw = String(v || '').trim().toLowerCase();
 if (raw === 'readonly' || raw === 'read-only' || raw === 'read_only') return 'ReadOnly';
 if (raw === 'tradeenabled' || raw === 'trade-enabled' || raw === 'trade_enabled' || raw === 'trade') return 'TradeEnabled';
 return 'Public';
 }

 function getAccountCapabilityMeta(v) {
 return ACCOUNT_CAPABILITY_META[sanitizeAccountCapability(v)] || ACCOUNT_CAPABILITY_META.Public;
 }

 function sanitizeKillSwitchState(state = {}) {
 return {
 enabled: !!state.enabled,
 reason: sanitizeText(state.reason, '', 140),
 scope: sanitizeText(state.scope, 'global', 24) || 'global',
 triggeredBy: sanitizeText(state.triggeredBy, '', 48),
 updatedAt: clampNumber(state.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER, 0),
 };
 }

 const VAR_FAVORED_SLOT_RATIO = 0.7;

 function sanitizeVarMaxPositions(value, fallback = 10) {
 return clampNumber(value, fallback, 1, 50, 0);
 }

 function resolveVarPreferredSide(context = {}) {
 const condition = String(context.marketCondition || context.marketIndex?.condition || '').trim().toLowerCase();
 if (['bull', 'euphoric'].includes(condition)) return 'long';
 if (['bear', 'crash'].includes(condition)) return 'short';

 const marketValue = Number(context.marketValue ?? context.marketIndex?.value);
 if (Number.isFinite(marketValue) && marketValue !== 0) return marketValue > 0 ? 'long' : 'short';

 const explicitSide = String(
 context.preferredSide
 || context.signalSide
 || context.side
 || context.direction
 || ''
 ).trim().toLowerCase();
 if (explicitSide.includes('short') || explicitSide === 'sell') return 'short';
 if (explicitSide.includes('long') || explicitSide === 'buy') return 'long';

 const regime = sanitizeMarketRegime(context.marketRegime || context.marketIndex?.regime || 'UNKNOWN');
 if (regime.includes('BEAR')) return 'short';
 return 'neutral';
 }

 function resolveVarPositionCaps(profile = {}, context = {}) {
 const legacyTotal = Number(profile.varMaxLongPositions || 0) + Number(profile.varMaxShortPositions || 0);
 const totalSlots = sanitizeVarMaxPositions(
 profile.varMaxPositions ?? profile.varTotalPositions,
 legacyTotal > 0 ? legacyTotal : 10
 );
 const preferredSide = resolveVarPreferredSide(context);
 if (preferredSide === 'neutral') {
 const longSlots = Math.ceil(totalSlots / 2);
 const shortSlots = Math.max(0, totalSlots - longSlots);
 return {
 totalSlots,
 preferredSide,
 oppositeSide: 'neutral',
 preferredSlots: longSlots,
 oppositeSlots: shortSlots,
 longSlots,
 shortSlots,
 favoredRatio: 0.5,
 longAllocationPct: 50,
 shortAllocationPct: 50,
 };
 }
 const preferredSlots = Math.min(totalSlots, Math.max(1, Math.ceil(totalSlots * VAR_FAVORED_SLOT_RATIO)));
 const oppositeSlots = Math.max(0, totalSlots - preferredSlots);
 const longSlots = preferredSide === 'long' ? preferredSlots : oppositeSlots;
 const shortSlots = preferredSide === 'short' ? preferredSlots : oppositeSlots;
 return {
 totalSlots,
 preferredSide,
 oppositeSide: preferredSide === 'long' ? 'short' : 'long',
 preferredSlots,
 oppositeSlots,
 longSlots,
 shortSlots,
 favoredRatio: VAR_FAVORED_SLOT_RATIO,
 longAllocationPct: preferredSide === 'long' ? 70 : 30,
 shortAllocationPct: preferredSide === 'short' ? 70 : 30,
 };
 }

 const SINGLE_ACCOUNT_PROFILE_ID = 'primary';
 const SINGLE_CREDENTIAL_ALIAS = 'FWD TradeDesk Pro/primary';

 function createAccountProfile(overrides = {}, timestamp = Date.now()) {
 const id = SINGLE_ACCOUNT_PROFILE_ID;
 const capability = sanitizeAccountCapability(overrides.capability);
 const baseBalance = clampNumber(overrides.baseBalance, 1000, 0, 1000000000, 2);
 const credentialSource = String(overrides.credentialSource || '').trim().toLowerCase() === 'native_host'
 ? 'native_host'
 : 'extension';
 return {
 id,
 username: sanitizeText(overrides.username || overrides.userName, '', 64),
 name: sanitizeText(overrides.name, getAccountCapabilityMeta(capability).desk, 48),
 capability,
 venue: sanitizeText(overrides.venue, 'Delta Exchange', 48),
 desk: sanitizeText(overrides.desk, getAccountCapabilityMeta(capability).desk, 64),
 credentialSource,
 credentialAlias: SINGLE_CREDENTIAL_ALIAS,
 credentialLabel: sanitizeText(overrides.credentialLabel, '', 48),
 baseBalance,
 sessionStartBalance: clampNumber(overrides.sessionStartBalance, baseBalance, 0, 1000000000, 2),
 riskPerTradePct: clampNumber(overrides.riskPerTradePct, 1, 0.1, 25, 2),
 dailyLossLimitPct: clampNumber(overrides.dailyLossLimitPct, 3, 0.1, 50, 2),
 maxOrderSizeUSD: clampNumber(overrides.maxOrderSizeUSD, 60, 1, 1000000, 2),
 blockedSymbols: sanitizeBlockedSymbolList(overrides.blockedSymbols || overrides.tradeBlockedSymbols || []),
 // VAR - Value at Risk fields
 varMaxDrawdownPct: clampNumber(overrides.varMaxDrawdownPct, 40, 1, 100, 1),
 varCycleCount: clampNumber(overrides.varCycleCount, 4, 1, 20, 0),
 varMaxPositions: sanitizeVarMaxPositions(
 overrides.varMaxPositions ?? overrides.varTotalPositions,
 (Number(overrides.varMaxLongPositions || 0) + Number(overrides.varMaxShortPositions || 0)) || 10
 ),
 varMaxTradesPerSector: clampNumber(overrides.varMaxTradesPerSector, 2, 1, 20, 0),
 varMaxLossPerTradeUSD: clampNumber(overrides.varMaxLossPerTradeUSD, 20, 0, 1000000, 2),
 notes: sanitizeText(overrides.notes, '', 280),
 createdAt: clampNumber(overrides.createdAt, timestamp, 0, Number.MAX_SAFE_INTEGER, 0),
 updatedAt: clampNumber(overrides.updatedAt, timestamp, 0, Number.MAX_SAFE_INTEGER, 0),
 };
 }

 function sanitizeAccountMetadata(raw = {}) {
 const timestamp = Date.now();
 const rawProfiles = Array.isArray(raw.profiles) && raw.profiles.length
 ? raw.profiles
 : [raw.activeProfile || {}];
 const activeSource = rawProfiles.find(profile => sanitizeAccountId(profile?.id) === sanitizeAccountId(raw.activeProfileId))
 || rawProfiles[0]
 || {};
 const sourceProfiles = [activeSource];
 const seen = new Set();
 const profiles = sourceProfiles.map((profile, index) => {
 const next = createAccountProfile(profile, timestamp);
 if (seen.has(next.id)) next.id = sanitizeAccountId(`${next.id}_${index}`);
 seen.add(next.id);
 return next;
 }).filter(Boolean);
 if (!profiles.length) profiles.push(createAccountProfile({}, timestamp));
 const activeProfileId = SINGLE_ACCOUNT_PROFILE_ID;
 const selectedProfileId = activeProfileId;
 return {
 version: sanitizeText(raw.version, '16.0.0', 16),
 activeProfileId,
 profiles,
 killSwitch: sanitizeKillSwitchState(raw.killSwitch || {}),
 ui: {
 selectedProfileId,
 },
 updatedAt: clampNumber(raw.updatedAt, timestamp, 0, Number.MAX_SAFE_INTEGER, 0),
 };
 }

 function sanitizeAccountSecrets(raw = {}, profiles = []) {
 const rawEntries = Object.entries(raw || {});
 const preferred = raw?.[SINGLE_ACCOUNT_PROFILE_ID] || rawEntries[0]?.[1] || {};
 const secret = preferred || {};
 const clean = {
 tradingKey: sanitizeText(secret.tradingKey, '', 120),
 tradingSecret: sanitizeText(secret.tradingSecret, '', 180),
 label: sanitizeText(secret.label, '', 48),
 updatedAt: clampNumber(secret.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER, 0),
 };
 return (clean.tradingKey || clean.tradingSecret || clean.label || clean.updatedAt)
 ? { [SINGLE_ACCOUNT_PROFILE_ID]: clean }
 : {};
 }

 function createDefaultAccountState(raw = {}) {
 const metadata = sanitizeAccountMetadata(raw.metadata || raw);
 const secrets = sanitizeAccountSecrets(raw.secrets || {}, metadata.profiles);
 return { metadata, secrets };
 }

 function normalizeBaseSymbol(sym) {
 return String(sym || '')
 .toUpperCase()
 .replace(/[^A-Z0-9]/g, '')
 .replace(/PERP$/, '')
 .replace(/USDT?$/, '');
 }

 function buildDeltaInstrumentText(symbolOrProduct = '', description = '') {
 const raw = typeof symbolOrProduct === 'object' && symbolOrProduct !== null ? symbolOrProduct : {};
 const values = [
 description,
 raw.symbol,
 raw.product_symbol,
 raw.productSymbol,
 raw.code,
 raw.description,
 raw.name,
 raw.contract_type,
 raw.contractType,
 raw.asset_class,
 raw.assetClass,
 raw.category,
 raw.sub_category,
 raw.subCategory,
 raw.instrument_type,
 raw.instrumentType,
 raw.underlying_asset?.symbol,
 raw.underlying_asset?.name,
 raw.underlyingAsset?.symbol,
 raw.underlyingAsset?.name,
 raw.quoting_asset?.symbol,
 raw.settling_asset?.symbol,
 Array.isArray(raw.tags) ? raw.tags.join(' ') : '',
 ].filter(Boolean);
 return values.map(value => String(value || '').toUpperCase()).join(' ');
 }

 function classifyRwaTypeFromDeltaText(text = '', base = '') {
 const upper = String(text || '').toUpperCase();
 if (!upper) return '';
 if (/\b(XSTOCK|STOCK|EQUITY)\b/.test(upper)) return 'tokenized_stock';
 if (/\bETF\b/.test(upper)) return 'tokenized_etf';
 if (/\b(TREASURY|T-BILL|TBILL|GOVERNMENT BOND|BOND)\b/.test(upper)) return 'tokenized_treasury';
 if (/\b(COMMODITY|GOLD|SILVER|PRECIOUS METAL)\b/.test(upper)) return 'tokenized_commodity';
 if (/\b(REAL ESTATE|PROPERTY)\b/.test(upper)) return 'tokenized_real_estate';
 if (/\b(PRIVATE CREDIT|CREDIT)\b/.test(upper)) return 'tokenized_credit';
 const normalizedBase = normalizeBaseSymbol(base);
 if (normalizedBase && !RWA_CRYPTO_ASSET_EXCLUSIONS.has(normalizedBase) && /\b(RWA|REAL[-\s]?WORLD ASSET|REAL[-\s]?ASSET|TOKENIZED|TOKENISED)\b/.test(upper)) {
 return 'tokenized_rwa';
 }
 return '';
 }

 function buildGenericRwaMeta(assetClass = 'tokenized_rwa') {
 const known = RWA_ASSET_TYPES[assetClass];
 if (known) return known;
 return {
 label: 'Tokenized RWA',
 badge: 'RWA',
 sector: 'RWA',
 keywords: RWA_METADATA_KEYWORDS,
 };
 }

 function inferEquityTickerFromRwaSymbol(symbol = '') {
 const base = normalizeBaseSymbol(symbol);
 if (!base) return '';
 if (base.endsWith('X') && base.length > 2) return base.slice(0, -1);
 return base;
 }

 function inferRwaAssetInfo(symbolOrProduct = '', description = '') {
 const raw = typeof symbolOrProduct === 'object' && symbolOrProduct !== null ? symbolOrProduct : {};
 const symbol = String(raw.symbol || raw.product_symbol || raw.productSymbol || symbolOrProduct || '').trim().toUpperCase();
 const text = buildDeltaInstrumentText(symbolOrProduct, description);
 const underlyingSymbol = String(raw.underlying_asset?.symbol || raw.underlyingAsset?.symbol || '').trim().toUpperCase();
 const underlyingName = sanitizeText(raw.underlying_asset?.name || raw.underlyingAsset?.name || '', '', 80);
 const base = normalizeBaseSymbol(symbol);
 const dynamicAssetClass = classifyRwaTypeFromDeltaText(text, base);
 if (dynamicAssetClass) {
 const meta = buildGenericRwaMeta(dynamicAssetClass);
 const ticker = dynamicAssetClass === 'tokenized_stock'
 ? (underlyingSymbol || inferEquityTickerFromRwaSymbol(symbol))
 : (underlyingSymbol || base);
 const displayName = dynamicAssetClass === 'tokenized_stock'
 ? `${ticker || 'Equity'} xStock`
 : `${underlyingName || ticker || meta.label}`;
 return {
 assetClass: dynamicAssetClass,
 assetLabel: meta.label,
 assetBadge: meta.badge,
 sector: 'RWA',
 displayName,
 underlyingSymbol: ticker,
 underlyingName: underlyingName || ticker,
 info: `${displayName} is classified from Delta Exchange product metadata as ${meta.label}. The scanner groups it under RWA instead of normal crypto sectors.`,
 };
 }
 for (const [assetClass, meta] of Object.entries(RWA_ASSET_TYPES)) {
 const matched = meta.keywords.some(keyword => text.includes(keyword));
 if (!matched) continue;
 const ticker = assetClass === 'tokenized_stock'
 ? (underlyingSymbol || inferEquityTickerFromRwaSymbol(symbol))
 : (underlyingSymbol || normalizeBaseSymbol(symbol));
 const displayName = assetClass === 'tokenized_stock'
 ? `${ticker || 'Equity'} xStock`
 : `${underlyingName || ticker || meta.label} ${meta.label}`;
 return {
 assetClass,
 assetLabel: meta.label,
 assetBadge: meta.badge,
 sector: meta.sector,
 displayName,
 underlyingSymbol: ticker,
 underlyingName: underlyingName || ticker,
 info: `${displayName} is treated as ${meta.label}. The scanner separates it from normal crypto flow because it represents a tokenized real-world asset exposure.`,
 };
 }
 return null;
 }

 function resolveTokenizedStockMeta(symbolOrProduct = '', description = '') {
 const raw = typeof symbolOrProduct === 'object' && symbolOrProduct !== null ? symbolOrProduct : {};
 const symbol = normalizeBaseSymbol(
 raw.symbol
 || raw.product_symbol
 || raw.productSymbol
 || raw.code
 || symbolOrProduct
 );
 const text = [
 description,
 raw.description,
 raw.name,
 raw.underlying_asset?.symbol,
 raw.underlyingAsset?.symbol,
 ].map(value => String(value || '').toUpperCase()).join(' ');
 const direct = TOKENIZED_STOCK_PRODUCTS[symbol] || (symbol.endsWith('X') ? TOKENIZED_STOCK_PRODUCTS[symbol] : null);
 if (direct) return { tokenSymbol: symbol, ...direct };
 const byStock = Object.entries(TOKENIZED_STOCK_PRODUCTS).find(([, meta]) => symbol === meta.stockSymbol || text.includes(`${meta.stockSymbol}X`) || text.includes(meta.company.toUpperCase()));
 if (byStock) return { tokenSymbol: byStock[0], ...byStock[1] };
 return null;
 }

 function classifyDeltaInstrument(symbolOrProduct = '', description = '') {
 const inferredRwa = inferRwaAssetInfo(symbolOrProduct, description);
 if (inferredRwa) return inferredRwa;
 return {
 assetClass: 'crypto_derivative',
 assetLabel: 'Crypto',
 assetBadge: 'Crypto',
 sector: '',
 displayName: '',
 underlyingSymbol: '',
 underlyingName: '',
 info: '',
 };
 }

 function titleCaseAssetCode(value = '') {
 return String(value || '')
 .replace(/^\d+/, '')
 .replace(/([A-Z])([A-Z0-9]*)/g, part => part.charAt(0) + part.slice(1).toLowerCase())
 .trim();
 }

 function describeDeltaInstrument(symbolOrProduct = '', description = '') {
 const raw = typeof symbolOrProduct === 'object' && symbolOrProduct !== null ? symbolOrProduct : {};
 const symbol = String(raw.symbol || raw.product_symbol || raw.productSymbol || symbolOrProduct || '').trim().toUpperCase();
 const cleanDescription = sanitizeText(description || raw.description || raw.name || '', '', 120);
 if (cleanDescription && cleanDescription.toUpperCase() !== symbol) return cleanDescription;
 const inferredRwa = inferRwaAssetInfo(raw.symbol ? raw : symbol, cleanDescription);
 if (inferredRwa?.displayName) return `${inferredRwa.displayName} Perpetual`;
 const base = normalizeBaseSymbol(symbol);
 const assetName = DELTA_BASE_ASSET_NAMES[base] || titleCaseAssetCode(base);
 return assetName ? `${assetName} Perpetual` : symbol;
 }

 function isStockToken(base) {
 if (!base) return false;
 const inferredRwa = inferRwaAssetInfo(base);
 if (inferredRwa?.assetClass === 'tokenized_stock') return true;
 if (String(base || '').toUpperCase().endsWith('X')) return true;
 return false;
 }

 function getSector(sym) {
 const raw = String(sym || '').toUpperCase();
 const indianSector = getIndianEquitySector(raw);
 if (indianSector) return indianSector;
 const base = normalizeBaseSymbol(raw);
 const assetInfo = inferRwaAssetInfo(raw);
 if (assetInfo?.sector) return assetInfo.sector;
 if (isStockToken(base)) return 'RWA';
 const candidates = [raw];
 if (base) candidates.push(`${base}USD`, `${base}USDT`, `${base}XUSD`);
 for (const [label, coins] of Object.entries(SECTORS)) {
 if (candidates.some(candidate => coins.includes(candidate))) return label;
 }
 return 'Other';
 }

 const MANAGE_STORE_DB = 'FWDTradeDeskManageStore';
 const MANAGE_STORE_VERSION = 1;
 const MANAGE_STORE_NAME = 'documents';
 let manageStoreOpenPromise = null;

 async function nativeJournalMessage(message = {}) {
 try {
 if (!globalThis.fwdDesktopNative?.sendNativeMessage) return null;
 const response = await globalThis.fwdDesktopNative.sendNativeMessage(message);
 return response?.ok ? response : null;
 } catch (_) {
 return null;
 }
 }

 function isNativeJournalKey(key = '') {
 const value = String(key || '');
 return value === 'v16LiveJournalNotes' || value === 'v16LiveEquityHistory' || value.startsWith('manage.');
 }

 function canUseManageStore() {
 return typeof indexedDB !== 'undefined';
 }

 function openManageStore() {
 if (!canUseManageStore()) return Promise.reject(new Error('IndexedDB unavailable'));
 if (manageStoreOpenPromise) return manageStoreOpenPromise;
 manageStoreOpenPromise = new Promise((resolve, reject) => {
 try {
 const request = indexedDB.open(MANAGE_STORE_DB, MANAGE_STORE_VERSION);
 request.onupgradeneeded = () => {
 const db = request.result;
 if (!db.objectStoreNames.contains(MANAGE_STORE_NAME)) {
 db.createObjectStore(MANAGE_STORE_NAME, { keyPath: 'key' });
 }
 };
 request.onsuccess = () => resolve(request.result);
 request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
 } catch (error) {
 reject(error);
 }
 }).catch(error => {
 manageStoreOpenPromise = null;
 throw error;
 });
 return manageStoreOpenPromise;
 }

 function manageStoreTx(mode, task) {
 return openManageStore().then(db => new Promise((resolve, reject) => {
 try {
 const tx = db.transaction(MANAGE_STORE_NAME, mode);
 const store = tx.objectStore(MANAGE_STORE_NAME);
 const result = task(store, tx);
 tx.oncomplete = () => resolve(result);
 tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
 tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
 } catch (error) {
 reject(error);
 }
 }));
 }

 function manageStoreGet(key, fallback = null) {
 if (!key) return Promise.resolve(fallback);
 if (isNativeJournalKey(key)) {
 return nativeJournalMessage({ type: 'journal_get', key: String(key) })
 .then(response => response && Object.prototype.hasOwnProperty.call(response, 'value') && response.value !== null ? response.value : null)
 .then(nativeValue => nativeValue !== null ? nativeValue : manageStoreGetIndexedDb(key, fallback));
 }
 return manageStoreGetIndexedDb(key, fallback);
 }

 function manageStoreGetIndexedDb(key, fallback = null) {
 return manageStoreTx('readonly', store => new Promise((resolve, reject) => {
 const request = store.get(String(key));
 request.onsuccess = () => {
 const record = request.result;
 resolve(record && Object.prototype.hasOwnProperty.call(record, 'value') ? record.value : fallback);
 };
 request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
 })).catch(() => fallback);
 }

 function manageStoreSet(key, value) {
 if (!key) return Promise.resolve(false);
 const nextValue = (() => {
 if (key === 'manage.liveEquity' && value && typeof value === 'object' && Array.isArray(value.points) && value.points.length > 1500) {
 return {
 ...value,
 archivedPointCount: Number(value.archivedPointCount || 0) + Math.max(0, value.points.length - 1500),
 points: value.points.slice(-1500),
 };
 }
 if (key === 'manage.liveLedger' && value && typeof value === 'object') {
 return {
 ...value,
 trades: Array.isArray(value.trades) ? value.trades.slice(-1000) : value.trades,
 fills: Array.isArray(value.fills) ? value.fills.slice(-1000) : value.fills,
 orderHistory: Array.isArray(value.orderHistory) ? value.orderHistory.slice(-1000) : value.orderHistory,
 rawFills: Array.isArray(value.rawFills) ? value.rawFills.slice(-1000) : value.rawFills,
 rawOrderHistory: Array.isArray(value.rawOrderHistory) ? value.rawOrderHistory.slice(-1000) : value.rawOrderHistory,
 };
 }
 return value;
 })();
 if (isNativeJournalKey(key)) {
 nativeJournalMessage({ type: 'journal_set', key: String(key), value: nextValue }).catch(() => {});
 }
 return manageStoreTx('readwrite', store => {
 store.put({
 key: String(key),
 value: nextValue,
 updatedAt: Date.now(),
 });
 return true;
 }).catch(() => false);
 }

 function manageStoreDelete(key) {
 if (!key) return Promise.resolve(false);
 return manageStoreTx('readwrite', store => {
 store.delete(String(key));
 return true;
 }).catch(() => false);
 }

 function manageStoreCleanup(options = {}) {
 const keepKeys = new Set(
 Array.isArray(options.keepKeys)
 ? options.keepKeys.filter(Boolean).map(key => String(key))
 : []
 );
 const maxAgeMs = Math.max(0, Number(options.maxAgeMs || 0));
 const staleBefore = maxAgeMs > 0 ? Date.now() - maxAgeMs : 0;
 return manageStoreTx('readwrite', store => new Promise((resolve, reject) => {
 let scanned = 0;
 let deleted = 0;
 const request = store.openCursor();
 request.onsuccess = () => {
 const cursor = request.result;
 if (!cursor) {
 resolve({ ok: true, scanned, deleted });
 return;
 }
 const record = cursor.value || {};
 const key = String(record.key || cursor.key || '');
 const updatedAt = Number(record.updatedAt || 0);
 const isUnknown = keepKeys.size > 0 && !keepKeys.has(key);
 const isExpired = staleBefore > 0 && updatedAt > 0 && updatedAt < staleBefore;
 scanned += 1;
 if (key && (isUnknown || isExpired)) {
 store.delete(key);
 deleted += 1;
 }
 cursor.continue();
 };
 request.onerror = () => reject(request.error || new Error('IndexedDB cursor failed'));
 })).catch(() => ({ ok: false, scanned: 0, deleted: 0 }));
 }

 function manageStoreGetMany(keys = []) {
 const safeKeys = Array.isArray(keys) ? keys.filter(Boolean).map(key => String(key)) : [];
 if (!safeKeys.length) return Promise.resolve({});
 return manageStoreTx('readonly', store => Promise.all(safeKeys.map(key => new Promise(resolve => {
 const request = store.get(key);
 request.onsuccess = () => {
 const record = request.result;
 resolve([key, record && Object.prototype.hasOwnProperty.call(record, 'value') ? record.value : null]);
 };
 request.onerror = () => resolve([key, null]);
 })).then(entries => Object.fromEntries(entries)))).catch(() => ({})).then(async indexedValues => {
 const nativeEntries = await Promise.all(safeKeys
 .filter(isNativeJournalKey)
 .map(async key => [key, await nativeJournalMessage({ type: 'journal_get', key })]));
 nativeEntries.forEach(([key, response]) => {
 if (response && Object.prototype.hasOwnProperty.call(response, 'value') && response.value !== null) {
 indexedValues[key] = response.value;
 }
 });
 return indexedValues;
 });
 }

 globalThis.FWDTradeDeskShared = Object.freeze({
 ALERT_TONES,
 ACCOUNT_CAPABILITIES,
 ACCOUNT_CAPABILITY_META,
 AUTO_SCAN_INTERVALS,
 AUTO_SCAN_INTERVAL_DEFAULT,
 MARKET_DATA_MODES,
 MARKET_REGIMES,
 REGIME_THRESHOLD_PRESETS,
 DECISION_ACTION_THRESHOLDS,
 AUTO_SHORTLIST_LIMIT,
 MAX_SIGNAL_PERSISTENCE_POINTS,
 SECTORS,
 DELTA_BASE_ASSET_NAMES,
 RWA_ASSET_TYPES,
 TOKENIZED_STOCK_PRODUCTS,
 TIER_PRIORITY,
 buildDecisionShortlist,
 clampNumber,
 classifySetupFamily,
 computeLeadershipState,
 computeSectorBreadth,
 createAccountProfile,
 createDefaultAccountState,
 deriveSignalPersistence,
 buildRelativeStrengthSnapshot,
 buildTradeQuality,
 resolveVarPositionCaps,
 resolveDecisionAction,
 resolveEntryTrigger,
 resolveRiskQualityGate,
 normalizeShadowTrade,
 updateShadowTradeWithCandles,
 buildSetupPerformance,
 getAccountCapabilityMeta,
 getAllowedSetupFamilies,
 mergeWatchlists,
 sanitizeAutoScanInterval,
 sanitizeAccountCapability,
 sanitizeAccountId,
 sanitizeAccountMetadata,
 sanitizeAccountSecrets,
 sanitizeAlertTone,
 sanitizeAutoTradeSettings,
 sanitizeDcaBotSettings,
 sanitizeChartCacheEnabled,
 sanitizeChartDefaults,
 sanitizeMarketDataMode,
 sanitizeMarketIndexSettings,
 sanitizeMarketRegime,
 sanitizeKillSwitchState,
 sanitizeKeyLevelSettings,
 sanitizeRiskTemplate,
 sanitizeRiskTemplates,
 sanitizeVarMaxPositions,
 sanitizeText,
 sanitizeBlockedSymbolList,
 normalizeSymbolList,
 classifySymbolMaturity,
 resolveRiskTemplateForSymbol,
 detectVolatilityRegime,
 getMarketRegimeMeta,
 getRegimeThresholds,
 getSetupFamilyMeta,
 formatThresholdSummary,
 normalizeBaseSymbol,
 normalizeIndianEquitySymbol,
 getIndianEquitySector,
 inferRwaAssetInfo,
 resolveTokenizedStockMeta,
 classifyDeltaInstrument,
 describeDeltaInstrument,
 resolveBracketProtectionLevels,
 resolveBracketTrailAmount,
 hasCompleteBracketProtection,
 normalizeOrderSide,
 normalizePositionSide,
 isStockToken,
 getSector,
 manageStoreCleanup,
 manageStoreDelete,
 manageStoreGet,
 manageStoreGetMany,
 manageStoreSet,
 });
})();
