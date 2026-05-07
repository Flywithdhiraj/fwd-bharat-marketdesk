'use strict';

(function initFWDTradeDeskV16CapabilitiesCore(global) {
 const V16_ACCOUNT_METADATA_KEY = 'dsAccountMetadataV16';
 const V16_ACCOUNT_SECRETS_KEY = 'dsAccountSecretsV16';
 const V16_STORAGE_DEP_KEYS = new Set([
 V16_ACCOUNT_METADATA_KEY,
 V16_ACCOUNT_SECRETS_KEY,
 'analyticsPositions',
 'scanResults',
 'marketIndex',
 'alerts',
 'lastScan',
 'strategy',
 ]);
 const V16_LIVE_SNAPSHOT_KEY = 'v16LiveAccountSnapshot';
 const V16_LIVE_EQUITY_HISTORY_KEY = 'v16LiveEquityHistory';
 const V16_LIVE_JOURNAL_NOTES_KEY = 'v16LiveJournalNotes';
 const V16_LIVE_ANALYTICS_VIEW_KEY = 'v16LiveAnalyticsView';
 const V16_LIVE_ORDER_CHART_STORE_KEY = 'v16LiveOrderChartCache';
 const V16_MANAGE_STORE_KEYS = Object.freeze({
 liveLedger: 'manage.liveLedger',
 liveEquity: 'manage.liveEquity',
 });
 const V16_MANAGE_REVIEW_CHECKS = Object.freeze([
 { key: 'followedPlan', label: 'Plan' },
 { key: 'respectedRisk', label: 'Risk' },
 { key: 'cleanExecution', label: 'Execution' },
 ]);
 const V16_PRIVATE_SOCKET_TIMEOUT_MS = 2600;
 const V16_PRIVATE_VIEW_CACHE_TTL_MS = 30000;
 const V16_LIVE_ORDER_CHART_CACHE_TTL_MS = 60000;
 const V16_PRIVATE_SOCKET_URLS = Object.freeze({
 india: 'wss://socket.india.delta.exchange',
 global: 'wss://socket.delta.exchange',
 });
 const V16_PRODUCT_DEFINITION_TTL_MS = 10 * 60 * 1000;
 const v16ProductDefinitionCache = new Map();

 function v16Esc(value) {
 return String(value == null ? '' : value)
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#39;');
 }

 function clonePlain(value) {
 return JSON.parse(JSON.stringify(value));
 }

 function v16FormatSignedCash(value) {
 const amount = Number(value || 0);
 if (typeof global.formatReportMoney === 'function') return global.formatReportMoney(amount, 2, { signed: true });
 const sign = amount >= 0 ? '+' : '-';
 return `${sign}$${Math.abs(amount).toFixed(2)}`;
 }

 function v16UniqueTextParts(parts = []) {
 const seen = new Set();
 return parts.filter(part => {
 const text = String(part || '').trim();
 if (!text) return false;
 const key = text.toLowerCase();
 if (seen.has(key)) return false;
 seen.add(key);
 return true;
 });
 }

 function v16JoinUniqueParts(parts = [], separator = ' | ') {
 return v16UniqueTextParts(parts).join(separator);
 }

 function v16ReadableCapabilityLabel(value = '') {
 return String(value || '')
 .replace(/([a-z])([A-Z])/g, '$1 $2')
 .trim();
 }

 function v16ShortBaseUrl(url = '') {
 return String(url || '')
 .replace(/^https?:\/\//i, '')
 .replace(/\/v2\/?$/i, '');
 }

 function v16FmtPrice(value) {
 if (typeof global.fmtPrice === 'function') return global.fmtPrice(value);
 const n = Number(value || 0);
 if (!Number.isFinite(n)) return '0.00';
 if (Math.abs(n) >= 1000) return n.toFixed(2);
 if (Math.abs(n) >= 1) return n.toFixed(4);
 return n.toFixed(6);
 }

 function v16FmtNumber(value, digits = 2) {
 const n = Number(value || 0);
 if (!Number.isFinite(n)) return '0';
 return n.toFixed(digits);
 }

 function v16FmtSigned(value, prefix = '$', digits = 2) {
 const n = Number(value || 0);
 if (prefix === '$' && typeof global.formatReportMoney === 'function') {
 return global.formatReportMoney(Number.isFinite(n) ? n : 0, digits, { signed: true });
 }
 if (!Number.isFinite(n)) return `${prefix}0.00`;
 const sign = n >= 0 ? '+' : '-';
 return `${sign}${prefix}${Math.abs(n).toFixed(digits)}`;
 }

 function v16FmtSignedPct(value) {
 const n = Number(value || 0);
 if (!Number.isFinite(n)) return '0.00%';
 return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
 }

 function v16FormatDurationShort(ms = 0) {
 const totalSeconds = Math.max(1, Math.ceil(Number(ms || 0) / 1000));
 if (totalSeconds < 60) return `${totalSeconds}s`;
 const minutes = Math.ceil(totalSeconds / 60);
 if (minutes < 60) return `${minutes}m`;
 const hours = Math.ceil(minutes / 60);
 return `${hours}h`;
 }

 function v16ToEpochMs(value) {
 if (typeof value === 'string') {
 const text = value.trim();
 if (!text) return 0;
 const parsedDate = Date.parse(text);
 if (Number.isFinite(parsedDate) && parsedDate > 0) return Math.round(parsedDate);
 }
 const raw = Number(value || 0);
 if (!Number.isFinite(raw) || raw <= 0) return 0;
 if (raw > 1e15) return Math.round(raw / 1000);
 if (raw > 1e12) return Math.round(raw);
 if (raw > 1e9) return Math.round(raw * 1000);
 return Math.round(raw * 1000);
 }

 function v16FormatTs(value) {
 const ts = v16ToEpochMs(value);
 if (!ts) return '-';
 return new Date(ts).toLocaleString();
 }

 function v16NormalizeRateLimitMeta(meta = null) {
 const until = Number(meta?.until || 0);
 if (!until || until <= Date.now()) return null;
 return {
 ...meta,
 active: true,
 waitMs: Math.max(1000, until - Date.now()),
 };
 }

 function v16StartOfToday() {
 const now = new Date();
 now.setHours(0, 0, 0, 0);
 return now.getTime();
 }

 function v16NumericField(source = {}, keys = []) {
 for (const key of keys) {
 const value = Number(source?.[key]);
 if (Number.isFinite(value)) return value;
 }
 return 0;
 }

 function v16TextField(source = {}, keys = [], fallback = '') {
 for (const key of keys) {
 const value = String(source?.[key] || '').trim();
 if (value) return value;
 }
 return fallback;
 }

 function v16NormalizeSymbol(value = '') {
 return String(value || '').toUpperCase().trim();
 }

 function v16NormalizeProductDefinition(product = {}) {
 const symbol = v16NormalizeSymbol(product?.symbol || product?.product_symbol || '');
 const contractValueRaw = Number(product?.contract_value || product?.contractValue || 0);
 const contractValue = Number.isFinite(contractValueRaw) && contractValueRaw > 0 ? contractValueRaw : 1;
 const contractUnitCurrency = v16NormalizeSymbol(product?.contract_unit_currency || product?.contractUnitCurrency || '');
 const underlyingAsset = product?.underlying_asset || product?.underlyingAsset || {};
 const rawProductType = String(
 product?.product_type
 || product?.productType
 || product?.contract_type
 || product?.contractType
 || product?.kind
 || product?.instrument_type
 || product?.instrumentType
 || ''
 ).toLowerCase();
 const optionType = String(
 product?.option_type
 || product?.optionType
 || product?.contract_option_type
 || ''
 ).toLowerCase();
 const strike = Number(
 product?.strike_price
 || product?.strikePrice
 || product?.exercise_price
 || 0
 ) || 0;
 const expiryAt = v16ToEpochMs(
 product?.settlement_time
 || product?.expiry_time
 || product?.expiryTime
 || product?.settlement_at
 || product?.expires_at
 || 0
 );
 const underlyingAssetSymbol = v16NormalizeSymbol(
 underlyingAsset?.symbol || product?.underlying_asset_symbol || product?.underlyingAssetSymbol || ''
 );
 const instrumentClassifier = globalThis.FWDTradeDeskShared?.classifyDeltaInstrument;
 const assetInfo = typeof instrumentClassifier === 'function'
 ? instrumentClassifier(product, product?.description || product?.name || '')
 : { assetClass: 'crypto_derivative', assetLabel: 'Crypto', assetBadge: 'Crypto', displayName: '', info: '', underlyingSymbol: '', underlyingName: '' };
 const inferredProductType = (
 optionType
 || strike > 0
 || expiryAt > 0 && symbol.includes('-')
 || rawProductType.includes('option')
 )
 ? 'options'
 : 'futures';
 const displayMultiplier = contractUnitCurrency && underlyingAssetSymbol && contractUnitCurrency === underlyingAssetSymbol
 ? contractValue
 : 1;
 return {
 symbol,
 contractValue,
 contractUnitCurrency,
 underlyingAssetSymbol,
 displayMultiplier,
 displayUnit: contractUnitCurrency && underlyingAssetSymbol && contractUnitCurrency === underlyingAssetSymbol
 ? underlyingAssetSymbol
 : 'contracts',
 assetClass: assetInfo.assetClass,
 assetLabel: assetInfo.assetLabel,
 assetBadge: assetInfo.assetBadge,
 assetDisplayName: assetInfo.displayName,
 assetInfo: assetInfo.info,
 underlyingSymbol: assetInfo.underlyingSymbol || underlyingAssetSymbol,
 underlyingName: assetInfo.underlyingName,
 productType: inferredProductType,
 rawProductType,
 expiryAt,
 strike,
 optionType,
 fetchedAt: Date.now(),
 };
 }

 function v16GetCachedProductDefinition(symbol = '') {
 const normalizedSymbol = v16NormalizeSymbol(symbol);
 if (!normalizedSymbol) return null;
 const cached = v16ProductDefinitionCache.get(normalizedSymbol);
 if (!cached) return null;
 if ((Date.now() - Number(cached.fetchedAt || 0)) > V16_PRODUCT_DEFINITION_TTL_MS) {
 v16ProductDefinitionCache.delete(normalizedSymbol);
 return null;
 }
 return cached;
 }

 function v16DisplayQuantity(value = 0, definition = null) {
 const multiplier = Number(definition?.displayMultiplier || 1);
 return +(Number(value || 0) * (multiplier > 0 ? multiplier : 1)).toFixed(8);
 }

 function v16DisplayUnit(definition = null) {
 return String(definition?.displayUnit || 'contracts').trim() || 'contracts';
 }

 function v16DecorateDisplaySizing(record = {}, productDefinitions = new Map()) {
 const definition = productDefinitions.get(v16NormalizeSymbol(record.symbol)) || null;
 return {
 ...record,
 contractValue: Number(definition?.contractValue || 1),
 displayUnit: v16DisplayUnit(definition),
 displaySize: v16DisplayQuantity(record.size || 0, definition),
 displayRemainingSize: v16DisplayQuantity(record.remainingSize || record.size || 0, definition),
 };
 }

 global.FWDTradeDeskV16CapabilitiesCore = Object.freeze({
 V16_ACCOUNT_METADATA_KEY,
 V16_ACCOUNT_SECRETS_KEY,
 V16_STORAGE_DEP_KEYS,
 V16_LIVE_SNAPSHOT_KEY,
 V16_LIVE_EQUITY_HISTORY_KEY,
 V16_LIVE_JOURNAL_NOTES_KEY,
 V16_LIVE_ANALYTICS_VIEW_KEY,
 V16_LIVE_ORDER_CHART_STORE_KEY,
 V16_MANAGE_STORE_KEYS,
 V16_MANAGE_REVIEW_CHECKS,
 V16_PRIVATE_SOCKET_TIMEOUT_MS,
 V16_PRIVATE_VIEW_CACHE_TTL_MS,
 V16_LIVE_ORDER_CHART_CACHE_TTL_MS,
 V16_PRIVATE_SOCKET_URLS,
 V16_PRODUCT_DEFINITION_TTL_MS,
 clonePlain,
 v16DecorateDisplaySizing,
 v16DisplayQuantity,
 v16DisplayUnit,
 v16Esc,
 v16FmtNumber,
 v16FmtPrice,
 v16FmtSigned,
 v16FmtSignedPct,
 v16FormatDurationShort,
 v16FormatSignedCash,
 v16FormatTs,
 v16GetCachedProductDefinition,
 v16JoinUniqueParts,
 v16NormalizeProductDefinition,
 v16NormalizeRateLimitMeta,
 v16NormalizeSymbol,
 v16NumericField,
 v16ProductDefinitionCache,
 v16ReadableCapabilityLabel,
 v16ShortBaseUrl,
 v16StartOfToday,
 v16TextField,
 v16ToEpochMs,
 v16UniqueTextParts,
 });
}(globalThis));
