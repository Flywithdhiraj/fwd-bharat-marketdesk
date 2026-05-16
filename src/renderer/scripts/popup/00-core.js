// ================================================================

// FWD TradeDesk Pro v15 - Popup UI

// v15 Shell: Workspaces | Trust Layer | Overview Deck

// Sparklines | Market Structure | Volume Climax | Funding Arbitrage

// CSV Export | Session Badge | OI Divergence

// ================================================================



// -- State ------------------------------------------------------

let currentModal = null;

let scanning = false;

let pollTimer = null;

let currentWatchlist = [];
let currentAlertsCache = [];
let currentAnalyticsPositions = [];
let desktopApiRegion = 'india';
let isDesktopMode = new URLSearchParams(location.search).get('desktop') === '1';
let fundingView = 'heatmap'; // 'heatmap' | 'arbitrage'
let alertTierFilter = '';
let alertSortMode = 'portfolio';

let scannerPreset = '';

let scannerSessionFilter = '';

let workspaceFocusMode = false;
let workspaceScrollCollapsed = false;
let workspaceScrollIgnoreUntil = 0;
let lastActivePaneScrollTop = 0;
let desktopZoomMode = false;
let desktopPaneRevealRequested = false;
let lastScanRecoveryAt = 0;
let lastWatchlistClickedSymbol = '';


let analyticsRenderInFlight = false;

let lastAnalyticsScanEpoch = 0;

let lastAnalyticsScanMarker = '';

let analyticsFocusMode = false;

let workspaceGroup = 'command';

let activeWorkspaceTab = 'home';
const workspaceVisitedTabs = new Set(['home']);
const watchRefreshInFlight = new Map();
let commandPaletteSnapshot = {};

const ALERT_TONES = ['classic', 'beacon', 'pulse', 'chime', 'siren'];

const AUTO_SCAN_INTERVALS = [1, 2, 3, 5, 15];

const AUTO_SCAN_INTERVAL_DEFAULT = 15;

const ANALYTICS_HISTORY_LIMIT = 120;
const BACKUP_DB_NAME = 'fwd_tradedesk_v14_local_backup';

const BACKUP_DB_STORE = 'handles';

const BACKUP_HANDLE_KEY = 'backup_dir';

const BACKUP_FILE_PREFIX = 'fwd_tradedesk_pro_backup';

const ALERT_ARCHIVE_FILE_PREFIX = 'fwd_tradedesk_pro_alert_archive';

const KEEP_ALERTS_DEFAULT = 600;

const KEEP_ALERTS_MIN = 100;

const KEEP_ALERTS_MAX = 1800;

const SCAN_HEARTBEAT_STALE_MS = 20000;

let backupDirHandle = null;

let backupStatusTimer = null;

let lastAutoBackupScan = '';

let lastArchiveCheckAt = 0;

let archiveInFlight = false;

const WORKSPACE_GROUP_META = {

 command: {

 label: 'Command Center',

 tabs: ['home'],
 title: 'Command Center',

 copy: 'Daily risk, execution state, scan health, and the next actions that matter now.',

 },

 markets: {

 label: 'Markets',

 tabs: ['scanner', 'strategies', 'watchlist', 'options', 'chart'],
 title: 'Scanner',
 copy: 'Scan symbols, review watchlists, inspect native straddles, and open a clean chart from one market workspace.',
 },

 trading: {

 label: 'Trading',

 tabs: ['positions', 'orders', 'funds'],
 title: 'Positions',
 copy: 'Manage open exposure, working orders, funds, and execution state without leaving the trading desk.',
 },

 risk: {

 label: 'Risk & Automation',

 tabs: ['riskcalc', 'webhooks'],
 title: 'Risk Cockpit',
 copy: 'Control position sizing, auto-trade safety, API setup, integrations, and recovery settings.',
 },

 reports: {

 label: 'Reports',

 tabs: ['liveanalytics', 'tradecheck', 'funding', 'corr'],

 title: 'Funding',

 copy: 'Review journal, P&L, funding, and correlation evidence before changing risk.',

 },

 settings: {

 label: 'Settings',

 tabs: ['strategy', 'debug'],

 title: 'Settings',

 copy: 'Control display currency, scanner defaults, API safety, notifications, backup, and diagnostics.',

 },

};

const TAB_TITLES = {

 home: 'Command Center',

 scanner: 'Scanner',
 strategies: 'Strategy Lab',

 watchlist: 'Watchlist',
 options: 'Native Straddle',
 chart: 'Chart',
 liveanalytics: 'Analytics',
 tradecheck: 'Trade Check & Paper',
 funds: 'Funds',
 positions: 'Positions',
 orders: 'Orders',
 riskcalc: 'Risk Cockpit',
 funding: 'Funding',

 corr: 'Correlation Matrix',


 strategy: 'Settings',

 webhooks: 'Automation',

 debug: 'Debug',

};



// -- Sector Map -------------------------------------------------

const { SECTORS, normalizeBaseSymbol, isStockToken, getSector, classifyDeltaInstrument, describeDeltaInstrument, sanitizeAutoScanInterval, sanitizeAlertTone } = globalThis.FWDTradeDeskShared;













function sanitizeTelegramMinScore(v, fallback = 85) {
 const n = Math.round(Number(v));
 if (!Number.isFinite(n)) return fallback;

 return Math.max(0, Math.min(100, n));

}



function sanitizeKeepAlerts(v) {
 const n = Math.round(Number(v));
 if (!Number.isFinite(n)) return KEEP_ALERTS_DEFAULT;
 return Math.max(KEEP_ALERTS_MIN, Math.min(KEEP_ALERTS_MAX, n));
}

function sanitizeExternalBackupConfig(cfg = {}) {
 return {

 enabled: !!cfg.enabled,

 autoBackup: !!cfg.autoBackup,

 autoArchive: !!cfg.autoArchive,

 keepAlerts: sanitizeKeepAlerts(cfg.keepAlerts),

 folderName: String(cfg.folderName || '').trim(),

 totalArchived: Number(cfg.totalArchived || 0),

 lastArchiveAt: Number(cfg.lastArchiveAt || 0),

 lastArchiveFile: String(cfg.lastArchiveFile || ''),

 updatedAt: Number(cfg.updatedAt || 0),

 };

}















function normalizeSectorLabel(label) {
 return label === 'Stocks' ? 'Stock' : (label || 'Other');
}

function isExtensionContextInvalidatedError(err) {
 const msg = String(err?.message || err || '').toLowerCase();
 return msg.includes('extension context invalidated')
 || msg.includes('context invalidated')
 || msg.includes('receiving end does not exist');
}

function isExtensionContextAvailable() {
 try {
 return !!(globalThis.chrome?.runtime?.id);
 } catch (_) {
 return false;
 }
}

function wrapPopupRuntimeMessaging() {
 const runtime = globalThis.chrome?.runtime;
 if (!runtime || typeof runtime.sendMessage !== 'function' || runtime.sendMessage.__deltaPopupWrapped) return;
 const originalSendMessage = runtime.sendMessage.bind(runtime);
 const wrappedSendMessage = function(message, optionsOrCallback, maybeCallback) {
 let options;
 let callback;
 if (typeof optionsOrCallback === 'function') {
 callback = optionsOrCallback;
 } else {
 options = optionsOrCallback;
 callback = typeof maybeCallback === 'function' ? maybeCallback : null;
 }
 let handled = false;
 const done = (payload) => {
 if (handled) return payload;
 handled = true;
 if (typeof callback !== 'function') return;
 try { callback(payload); } catch (_) {}
 return payload;
 };
 if (!isExtensionContextAvailable()) {
 done({ ok: false, error: 'Extension context invalidated' });
 return undefined;
 }
 const wrappedCallback = (response) => {
 const runtimeError = globalThis.chrome?.runtime?.lastError || null;
 if (runtimeError) {
 done({ ok: false, error: runtimeError.message || 'Runtime request failed' });
 return;
 }
 done(response);
 };
 try {
 const request = options !== undefined
 ? originalSendMessage(message, options, wrappedCallback)
 : originalSendMessage(message, wrappedCallback);
 if (request && typeof request.catch === 'function') {
 return request.catch(error => done({
 ok: false,
 error: error?.message || 'Runtime request failed',
 }));
 }
 return request;
 } catch (error) {
 done({ ok: false, error: error?.message || 'Runtime request failed' });
 return undefined;
 }
 };
 wrappedSendMessage.__deltaPopupWrapped = true;
 wrappedSendMessage.__deltaPopupOriginal = originalSendMessage;
 runtime.sendMessage = wrappedSendMessage;
}

wrapPopupRuntimeMessaging();

function getLiveAlertSnapshot(alerts = [], scanResults = []) {
 const scanList = Array.isArray(scanResults) ? scanResults : [];
 const _rawList = Array.isArray(alerts) ? alerts : [];
 // -- Auto-expire stale alerts in popup display --
 const _now = Date.now();
 const _EXPIRY = { watch: 2 * 3600000, setup: 6 * 3600000, execute: 24 * 3600000 };
 const alertList = _rawList.filter(a => {
 if (a.starred || a.pinned) return true;
 const tier = a.alertTier || 'watch';
 const maxAge = _EXPIRY[tier] || _EXPIRY.watch;
 return (_now - (a.ts || 0)) < maxAge;
 });
 const scanMap = new Map();
 scanList.forEach(result => {
 const sym = String(result?.symbol || '').toUpperCase();
 if (sym) scanMap.set(sym, result);
 });

 const latestBySymbol = new Map();
 alertList.forEach(alert => {
 const sym = String(alert?.symbol || '').toUpperCase();
 if (!sym) return;
 if (scanMap.size && !scanMap.has(sym)) return;
 const existing = latestBySymbol.get(sym);
 if (!existing || Number(alert?.ts || 0) >= Number(existing?.ts || 0)) {
 latestBySymbol.set(sym, alert);
 }
 });

 return Array.from(latestBySymbol.values()).map(alert => {
 const sym = String(alert?.symbol || '').toUpperCase();
 const scanMatch = scanMap.get(sym);
 if (!scanMatch) return alert;
 return {
 ...alert,
 ...scanMatch,
 symbol: scanMatch.symbol || alert.symbol,
 ts: Number(alert?.ts || scanMatch?.ts || Date.now()),
 alertTier: alert?.alertTier || scanMatch?.alertTier,
 reasons: Array.isArray(scanMatch?.reasons) && scanMatch.reasons.length
 ? scanMatch.reasons
 : alert?.reasons,
 };
 });
}


function getTFKeyLevels(keyLevels, tfLabel) {

 const tf = keyLevels?.byTimeframe?.[tfLabel];

 if (tf) {

 return {

 resistance: Array.isArray(tf.resistance) ? tf.resistance : [],

 support: Array.isArray(tf.support) ? tf.support : [],

 };

 }



 const fallbackFor = (levels) => {

 if (!Array.isArray(levels) || !levels.length) return [];

 const hasTagged = levels.some(l => typeof l?.tf === 'string' && l.tf.trim());

 if (!hasTagged) return tfLabel === '1D' ? levels.slice(0, 2) : [];

 return levels.filter(l =>

 typeof l?.tf === 'string' &&

 l.tf.split(',').map(x => x.trim()).includes(tfLabel)

 );

 };



 return {

 resistance: fallbackFor(keyLevels?.resistance),

 support: fallbackFor(keyLevels?.support),

 };

}



function formatKeyLevelList(levels, max = 2) {

 if (!Array.isArray(levels) || !levels.length) return '-';

 return levels.slice(0, max).map(l => `$${fmtPrice(l.price)} (x${l.touches || 0})`).join(', ');

}



// -- Storage helper ---------------------------------------------

const NATIVE_JOURNAL_KEYS = new Set(['v16LiveJournalNotes', 'v16LiveEquityHistory']);

function getRequestedStorageKeys(keys) {
 if (Array.isArray(keys)) return keys.map(key => String(key || ''));
 if (typeof keys === 'string') return [keys];
 if (keys && typeof keys === 'object') return Object.keys(keys);
 return [];
}

async function sendDesktopNativeMessage(message = {}) {
 try {
 if (!window.fwdDesktopNative?.sendNativeMessage) return null;
 const response = await window.fwdDesktopNative.sendNativeMessage(message);
 return response?.ok ? response : null;
 } catch (_) {
 return null;
 }
}

async function readNativeJournalValues(keys = []) {
 const entries = await Promise.all(keys
 .filter(key => NATIVE_JOURNAL_KEYS.has(key))
 .map(async key => [key, await sendDesktopNativeMessage({ type: 'journal_get', key })]));
 return entries.reduce((acc, [key, response]) => {
 if (response && Object.prototype.hasOwnProperty.call(response, 'value') && response.value !== null) {
 acc[key] = response.value;
 }
 return acc;
 }, {});
}

async function writeNativeJournalValues(items = {}) {
 const entries = Object.entries(items || {}).filter(([key]) => NATIVE_JOURNAL_KEYS.has(key));
 if (!entries.length) return new Set();
 const writes = await Promise.all(entries.map(async ([key, value]) => {
 const response = await sendDesktopNativeMessage({ type: 'journal_set', key, value });
 if (response?.ok && key === 'v16LiveEquityHistory' && Array.isArray(value) && value.length > 1500) {
 sendDesktopNativeMessage({ type: 'journal_archive', key, keep: 1500 }).catch(() => {});
 }
 return response?.ok ? key : '';
 }));
 return new Set(writes.filter(Boolean));
}

function omitStorageKeys(items = {}, keysToOmit = new Set()) {
 return Object.fromEntries(Object.entries(items || {}).filter(([key]) => !keysToOmit.has(key)));
}

async function removeLocalStorageKeys(keys = []) {
 const safeKeys = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
 if (!safeKeys.length || !isExtensionContextAvailable()) return true;
 return new Promise(resolve => {
 try {
 chrome.storage.local.remove(safeKeys, () => resolve(!chrome.runtime?.lastError));
 } catch (_) {
 resolve(false);
 }
 });
}

async function getRendererStorageSnapshot(options = {}) {
 const includeNativeJournal = !!options.includeNativeJournal;
 const data = await new Promise(resolve => chrome.storage.local.get(null, snapshot => resolve(snapshot || {})));
 if (includeNativeJournal) {
 return {
 ...(data || {}),
 ...(await readNativeJournalValues([...NATIVE_JOURNAL_KEYS])),
 };
 }
 const filtered = { ...(data || {}) };
 NATIVE_JOURNAL_KEYS.forEach(key => delete filtered[key]);
 return filtered;
}

async function migrateLocalJournalKeysToNative() {
 if (!isExtensionContextAvailable() || !window.fwdDesktopNative?.sendNativeMessage) return false;
 const legacy = await new Promise(resolve => chrome.storage.local.get([...NATIVE_JOURNAL_KEYS], data => resolve(data || {})));
 const legacyEntries = Object.fromEntries(Object.entries(legacy).filter(([, value]) => value !== undefined && value !== null));
 if (!Object.keys(legacyEntries).length) return false;
 const nativeWrittenKeys = await writeNativeJournalValues(legacyEntries);
 if (nativeWrittenKeys.size) await removeLocalStorageKeys([...nativeWrittenKeys]);
 return nativeWrittenKeys.size > 0;
}

async function storeGet(keys) {
 const requestedKeys = getRequestedStorageKeys(keys);
 return new Promise(resolve => {
 if (!isExtensionContextAvailable()) {
 resolve({});
 return;
 }
 try {
 chrome.storage.local.get(keys, data => {
 if (chrome.runtime?.lastError && isExtensionContextInvalidatedError(chrome.runtime.lastError)) {
 resolve({});
 return;
 }
 if (chrome.runtime?.lastError) {
 reportUiError('Storage read failed', chrome.runtime.lastError.message || 'Local storage read failed.');
 resolve({});
 return;
 }
 resolve(data || {});
 });
 } catch (err) {
 if (isExtensionContextInvalidatedError(err)) {
 resolve({});
 return;
 }
 throw err;
 }
 }).then(async data => ({
 ...(data || {}),
 ...(await readNativeJournalValues(requestedKeys)),
 }));
}

async function updateSecureStorageWarningBanner() {
 const banner = document.getElementById('secureStorageWarningBanner');
 const textEl = document.getElementById('secureStorageWarningText');
 if (!banner || !textEl) return;
 const data = await storeGet('secureStorageWarning');
 const warning = data?.secureStorageWarning || {};
 if (!warning.active) {
 banner.hidden = true;
 banner.setAttribute('aria-hidden', 'true');
 textEl.textContent = '';
 return;
 }
 textEl.textContent = warning.message || 'Native secret encryption is unavailable. Review notification secret storage.';
 banner.hidden = false;
 banner.setAttribute('aria-hidden', 'false');
}

globalThis.updateSecureStorageWarningBanner = updateSecureStorageWarningBanner;

const FWD_UI_DELEGATE_ROOTS = new WeakMap();

function getUiDelegateBucket(root, eventType) {
 const resolvedRoot = root || document;
 let rootMap = FWD_UI_DELEGATE_ROOTS.get(resolvedRoot);
 if (!rootMap) {
 rootMap = new Map();
 FWD_UI_DELEGATE_ROOTS.set(resolvedRoot, rootMap);
 }
 if (!rootMap.has(eventType)) {
 const handlers = [];
 rootMap.set(eventType, handlers);
 resolvedRoot.addEventListener(eventType, event => {
 handlers.forEach(entry => {
 const match = event.target?.closest?.(entry.selector);
 if (!match || !resolvedRoot.contains(match)) return;
 if (entry.once && entry.used) return;
 entry.used = true;
 if (entry.preventDefault) event.preventDefault();
 entry.handler(event, match);
 });
 });
 }
 return rootMap.get(eventType);
}

function delegateUiEvent(eventType, selector, handler, options = {}) {
 const normalizedEvent = String(eventType || '').trim();
 const normalizedSelector = String(selector || '').trim();
 if (!normalizedEvent || !normalizedSelector || typeof handler !== 'function') return () => {};
 const bucket = getUiDelegateBucket(options.root || document, normalizedEvent);
 const entry = {
 selector: normalizedSelector,
 handler,
 preventDefault: !!options.preventDefault,
 once: !!options.once,
 used: false,
 };
 bucket.push(entry);
 return () => {
 const index = bucket.indexOf(entry);
 if (index >= 0) bucket.splice(index, 1);
 };
}

function setUiText(id, text = '', className = '') {
 const el = document.getElementById(id);
 if (!el) return null;
 el.textContent = String(text ?? '');
 if (className) el.className = className;
 return el;
}

function setUiDisabled(target, disabled = true) {
 const el = typeof target === 'string' ? document.getElementById(target) : target;
 if (el) el.disabled = !!disabled;
 return el;
}

globalThis.FWDTradeDeskUi = {
 ...(globalThis.FWDTradeDeskUi || {}),
 delegate: delegateUiEvent,
 setText: setUiText,
 setDisabled: setUiDisabled,
};

const DEFAULT_REPORT_DISPLAY_USD_INR_RATE = 85;
let reportDisplayCurrency = 'USD';
let reportDisplayUsdInrRate = DEFAULT_REPORT_DISPLAY_USD_INR_RATE;

function normalizeReportDisplayCurrency(value = '') {
 const safe = String(value || '').trim().toUpperCase();
 return safe === 'INR' ? 'INR' : 'USD';
}

function setReportDisplayCurrency(value = '') {
 reportDisplayCurrency = normalizeReportDisplayCurrency(value);
 document.body.dataset.reportCurrency = reportDisplayCurrency;
 return reportDisplayCurrency;
}

function normalizeReportDisplayUsdInrRate(value = DEFAULT_REPORT_DISPLAY_USD_INR_RATE) {
 const raw = Number(value);
 if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_REPORT_DISPLAY_USD_INR_RATE;
 return Math.min(1000, Math.max(1, Number(raw.toFixed(4))));
}

function setReportDisplayUsdInrRate(value = DEFAULT_REPORT_DISPLAY_USD_INR_RATE) {
 reportDisplayUsdInrRate = normalizeReportDisplayUsdInrRate(value);
 document.body.dataset.reportUsdInrRate = String(reportDisplayUsdInrRate);
 return reportDisplayUsdInrRate;
}

function getReportDisplayUsdInrRate() {
 return normalizeReportDisplayUsdInrRate(reportDisplayUsdInrRate);
}

function getReportDisplayCurrency() {
 return normalizeReportDisplayCurrency(reportDisplayCurrency);
}

function formatReportMoney(value, digits = 2, { signed = false, compact = false } = {}) {
 const raw = Number(value || 0);
 if (!Number.isFinite(raw)) return getReportDisplayCurrency() === 'INR' ? 'Rs 0.00' : '$0.00';
 const currency = getReportDisplayCurrency();
 const display = currency === 'INR' ? raw * getReportDisplayUsdInrRate() : raw;
 const abs = Math.abs(display);
 const sign = signed ? (display >= 0 ? '+' : '-') : (display < 0 ? '-' : '');
 const amount = compact && typeof fmtLarge === 'function'
 ? fmtLarge(abs)
 : abs.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
 return currency === 'INR' ? `${sign}Rs ${amount}` : `${sign}$${amount}`;
}

globalThis.DEFAULT_REPORT_DISPLAY_USD_INR_RATE = DEFAULT_REPORT_DISPLAY_USD_INR_RATE;
globalThis.normalizeReportDisplayCurrency = normalizeReportDisplayCurrency;
globalThis.setReportDisplayCurrency = setReportDisplayCurrency;
globalThis.getReportDisplayCurrency = getReportDisplayCurrency;
globalThis.normalizeReportDisplayUsdInrRate = normalizeReportDisplayUsdInrRate;
globalThis.setReportDisplayUsdInrRate = setReportDisplayUsdInrRate;
globalThis.getReportDisplayUsdInrRate = getReportDisplayUsdInrRate;
globalThis.formatReportMoney = formatReportMoney;

async function storeSet(items) {
 const nativeWrittenKeys = await writeNativeJournalValues(items);
 const localItems = omitStorageKeys(items, nativeWrittenKeys);
 const writeLocalKeys = Object.keys(localItems);
 return new Promise(resolve => {
 if (!isExtensionContextAvailable()) {
 resolve(false);
 return;
 }
 const finish = async ok => {
 if (nativeWrittenKeys.size) await removeLocalStorageKeys([...nativeWrittenKeys]);
 resolve(ok || nativeWrittenKeys.size > 0);
 };
 try {
 if (!writeLocalKeys.length) {
 finish(true);
 return;
 }
 chrome.storage.local.set(localItems, () => {
 if (chrome.runtime?.lastError && isExtensionContextInvalidatedError(chrome.runtime.lastError)) {
 finish(false);
 return;
 }
 if (chrome.runtime?.lastError) {
 reportUiError('Storage save failed', chrome.runtime.lastError.message || 'Local storage save failed.');
 finish(false);
 return;
 }
 finish(true);
 });
 } catch (err) {
 if (isExtensionContextInvalidatedError(err)) {
 finish(false);
 return;
 }
 throw err;
 }
 });
}

function storeRemove(keys) {
 return new Promise(resolve => {
 if (!isExtensionContextAvailable()) {
 resolve(false);
 return;
 }
 try {
 chrome.storage.local.remove(keys, () => {
 if (chrome.runtime?.lastError && isExtensionContextInvalidatedError(chrome.runtime.lastError)) {
 resolve(false);
 return;
 }
 if (chrome.runtime?.lastError) {
 reportUiError('Storage cleanup failed', chrome.runtime.lastError.message || 'Local storage cleanup failed.');
 resolve(false);
 return;
 }
 resolve(true);
 });
 } catch (err) {
 if (isExtensionContextInvalidatedError(err)) {
 resolve(false);
 return;
 }
 throw err;
 }
 });
}

function sessionGet(keys) {
 return new Promise(resolve => {
 if (!isExtensionContextAvailable() || !chrome.storage?.session) {
 resolve({});
 return;
 }
 try {
 chrome.storage.session.get(keys, data => {
 if (chrome.runtime?.lastError && isExtensionContextInvalidatedError(chrome.runtime.lastError)) {
 resolve({});
 return;
 }
 resolve(data || {});
 });
 } catch (err) {
 if (isExtensionContextInvalidatedError(err)) {
 resolve({});
 return;
 }
 throw err;
 }
 });
}

function sessionSet(items) {
 return new Promise(resolve => {
 if (!isExtensionContextAvailable() || !chrome.storage?.session) {
 resolve(false);
 return;
 }
 try {
 chrome.storage.session.set(items, () => {
 if (chrome.runtime?.lastError && isExtensionContextInvalidatedError(chrome.runtime.lastError)) {
 resolve(false);
 return;
 }
 resolve(true);
 });
 } catch (err) {
 if (isExtensionContextInvalidatedError(err)) {
 resolve(false);
 return;
 }
 throw err;
 }
 });
}

window.addEventListener('unhandledrejection', event => {
 if (isExtensionContextInvalidatedError(event.reason)) {
 event.preventDefault();
 }
});


async function migrateLegacyTelegramConfig() {

 const [localData, sessionData] = await Promise.all([

 storeGet(['telegram']),

 sessionGet(['telegramSecret']),

 ]);

 const telegram = localData.telegram || {};

 const secret = sessionData.telegramSecret || {};

 const nativeSecret = await sendDesktopNativeMessage({ type: 'secure_secret_get', name: 'telegram' });
 const nativeValue = nativeSecret?.value?.value || nativeSecret?.value || {};
 const hasNativeSecret = !!(nativeValue.botToken || nativeValue.chatId);

 const nextSecret = {

 botToken: String(nativeValue.botToken || secret.botToken || telegram.botToken || '').trim(),

 chatId: String(nativeValue.chatId || secret.chatId || telegram.chatId || '').trim(),

 };



 const nextTelegram = { ...telegram };

 delete nextTelegram.botToken;

 delete nextTelegram.chatId;



 const writes = [];

 let nativeSecretWrite = null;
 if ((nextSecret.botToken || nextSecret.chatId) &&
 (nextSecret.botToken !== String(nativeValue.botToken || '') || nextSecret.chatId !== String(nativeValue.chatId || ''))) {
 nativeSecretWrite = await sendDesktopNativeMessage({ type: 'secure_secret_set', name: 'telegram', value: nextSecret });
 }

 if ((nextSecret.botToken || nextSecret.chatId) &&

 (nextSecret.botToken !== String(secret.botToken || '') || nextSecret.chatId !== String(secret.chatId || ''))) {

 writes.push((nativeSecretWrite || hasNativeSecret) ? sessionSet({ telegramSecret: {} }) : sessionSet({ telegramSecret: nextSecret }));

 }

 if (Object.prototype.hasOwnProperty.call(telegram, 'botToken') || Object.prototype.hasOwnProperty.call(telegram, 'chatId')) {

 writes.push(storeSet({ telegram: nextTelegram }));

 }

 if (writes.length) await Promise.all(writes);



 return { meta: nextTelegram, secret: nextSecret };

}



async function loadStoredTelegramConfig() {

 const { meta, secret } = await migrateLegacyTelegramConfig();

 return {

 ...(meta || {}),

 ...(secret || {}),

 };

}



async function saveStoredTelegramConfig(cfg) {

 const existing = await loadStoredTelegramConfig().catch(() => ({}));

 const rawBotToken = String(cfg?.botToken || '').trim();

 const rawChatId = String(cfg?.chatId || '').trim();

 const clearSecrets = cfg?.clearSecrets === true;

 const botToken = clearSecrets ? '' : (rawBotToken || String(existing?.botToken || '').trim());

 const chatId = clearSecrets ? '' : (rawChatId || String(existing?.chatId || '').trim());

 const telegram = {

 enabled: !!cfg?.enabled && !!botToken && !!chatId,

 minScore: sanitizeTelegramMinScore(cfg?.minScore, 85),

 hourlySummaryEnabled: !!cfg?.hourlySummaryEnabled,

 };

 const telegramSecret = {

 botToken,

 chatId,

 };

 const nativeSecretWrite = botToken || chatId
 ? await sendDesktopNativeMessage({ type: 'secure_secret_set', name: 'telegram', value: telegramSecret })
 : (clearSecrets ? await sendDesktopNativeMessage({ type: 'secure_secret_delete', name: 'telegram' }) : null);

 await Promise.all([

 storeSet({ telegram }),

 (nativeSecretWrite || (!clearSecrets && (botToken || chatId))) ? sessionSet({ telegramSecret: nativeSecretWrite ? {} : telegramSecret }) : sessionSet({ telegramSecret }),

 ]);

 chrome.runtime.sendMessage({ action: "syncTelegramSummaryAlarm" }, () => {

 if (chrome.runtime.lastError) { /* background not ready */ }

 });

 return { ...telegram, ...telegramSecret };

}



function getWorkspaceGroupForTab(tab) {

 const raw = String(tab || '').trim();
 const key = raw === 'analytics' ? 'liveanalytics' : raw;
 return Object.entries(WORKSPACE_GROUP_META).find(([, meta]) => meta.tabs.includes(key))?.[0] || 'command';

}



function renderActiveWorkspaceTab(tab, preloaded = null) {
 workspaceVisitedTabs.add(tab);
 clearWorkspaceTabDirty?.(tab);
 ensurePaneRendered?.(tab);

 if (tab === 'debug') {
 if (typeof renderDebug === 'function') renderDebug();
 return;
 }

 if (tab === 'home') updateWorkspaceInsights();

 if (tab === 'scanner') renderScanner(preloaded);

 if (tab === 'strategies') globalThis.renderStrategyLab?.();

 if (tab === 'watchlist') renderWatchlist(preloaded);

 if (tab === 'options') renderOptionsWorkspace?.();
 if (tab === 'chart') globalThis.renderChartWorkspacePane?.();
 if (tab === 'liveanalytics') globalThis.renderV16LiveAnalyticsPane?.(preloaded, false);
 if (tab === 'tradecheck') globalThis.renderV16TradeCheckPane?.(null, false);
 if (tab === 'funds') globalThis.renderV16FundsPane?.(preloaded, false);

 if (tab === 'positions') globalThis.renderV16PositionsPane?.(preloaded, false);
 if (tab === 'orders') globalThis.renderV16OrdersPane?.(preloaded, false);
 if (tab === 'riskcalc') {
 globalThis.renderV16RiskBridgeBanner?.();
 globalThis.renderV16RiskManageBoard?.();
 globalThis.renderV16VarDashboard?.();
 if (typeof calcRisk === 'function') calcRisk();
 }
 if (tab === 'funding') {
 if (fundingView === 'arbitrage' && typeof renderFundingArbitrage === 'function') renderFundingArbitrage();
 else renderFundingHeatmap();
 }
 if (tab === 'corr') renderCorrelationMatrix();
 if (tab === 'webhooks' && typeof renderWebhooks === 'function') renderWebhooks();

}



function syncWorkspaceShell() {
 document.body.dataset.workspaceGroup = workspaceGroup;
 document.body.dataset.workspaceTab = activeWorkspaceTab;
 const groupMeta = WORKSPACE_GROUP_META[workspaceGroup] || WORKSPACE_GROUP_META.command;
 const secondaryTabs = new Set(groupMeta.secondaryTabs || []);
 document.querySelectorAll('.workspace-group').forEach(btn => {
 btn.classList.toggle('active', btn.dataset.group === workspaceGroup);
 btn.setAttribute('aria-pressed', btn.dataset.group === workspaceGroup ? 'true' : 'false');
 });
 document.querySelectorAll('.tab').forEach(btn => {

 const hidden = btn.dataset.group !== workspaceGroup || secondaryTabs.has(btn.dataset.tab);
 const selected = btn.dataset.tab === activeWorkspaceTab;
 btn.classList.toggle('group-hidden', hidden);

 btn.classList.toggle('active', selected);
 btn.setAttribute('aria-selected', selected ? 'true' : 'false');
 btn.setAttribute('tabindex', hidden ? '-1' : (selected ? '0' : '-1'));
 if (hidden) btn.setAttribute('aria-hidden', 'true');
 else btn.removeAttribute('aria-hidden');
 });

 document.querySelectorAll('.pane').forEach(pane => {

 const isActive = pane.id === `pane-${activeWorkspaceTab}`;
 pane.classList.toggle('active', isActive);
 pane.setAttribute('aria-hidden', isActive ? 'false' : 'true');
 });

 document.querySelectorAll('.settings-jump').forEach(btn => {

 btn.classList.toggle('active', btn.dataset.tab === activeWorkspaceTab);

 });

 document.querySelectorAll('.settings-drawer-item').forEach(btn => {
 btn.classList.toggle('active', btn.dataset.settingsTab === activeWorkspaceTab);
 });
 const drawerWrap = document.getElementById('settingsDrawerWrap');
 const drawer = document.getElementById('settingsDrawer');
 const drawerToggle = document.getElementById('btnSettingsDrawer');
 if (drawerWrap) drawerWrap.hidden = workspaceGroup !== 'settings' || !secondaryTabs.size;
 if (drawerToggle) {
 const activeSecondary = secondaryTabs.has(activeWorkspaceTab);
 drawerToggle.classList.toggle('active', activeSecondary);
 drawerToggle.textContent = activeSecondary ? (TAB_TITLES[activeWorkspaceTab] || 'More') : 'More';
 }
 if (workspaceGroup !== 'settings' && drawer && drawerToggle) {
 drawer.hidden = true;
 drawerToggle.setAttribute('aria-expanded', 'false');
 }

 const labelEl = document.getElementById('workspaceLabel');

 const titleEl = document.getElementById('workspaceTitle');

 const copyEl = document.getElementById('workspaceCopy');

 if (labelEl) labelEl.textContent = groupMeta.label;

 if (titleEl) titleEl.textContent = TAB_TITLES[activeWorkspaceTab] || groupMeta.title;

 if (copyEl) copyEl.textContent = groupMeta.copy;

}




function requestDesktopPaneReveal() {

 if (!isDesktopMode) return;

 desktopPaneRevealRequested = true;

}

function resetDesktopViewport() {

 if (!isDesktopMode) return;

 requestAnimationFrame(() => {

 const app = document.getElementById('app');

 if (app) app.scrollTop = 0;

 });

}

function ensureDesktopActivePaneVisible(force = false) {

 if (!isDesktopMode) return;

 const shouldReveal = !!force || desktopPaneRevealRequested;

 desktopPaneRevealRequested = false;

 if (!shouldReveal) return;

 requestAnimationFrame(() => {

 const app = document.getElementById('app');

 const pane = document.querySelector('.pane.active');

 const workspaceShell = document.querySelector('.workspace-shell');

 if (!app || !pane) return;

 const visibleTop = app.scrollTop;

 const visibleBottom = visibleTop + app.clientHeight;

 const paneTop = pane.offsetTop;

 const paneBottom = paneTop + pane.offsetHeight;

 const workspaceTop = workspaceShell ? workspaceShell.offsetTop : 0;

 const workspaceBottom = workspaceShell ? (workspaceTop + workspaceShell.offsetHeight) : paneTop;

 const paneVisible = Math.max(0, Math.min(visibleBottom, paneBottom) - Math.max(visibleTop, paneTop));

 const hasWorkspaceInView = workspaceTop >= visibleTop && workspaceBottom <= visibleBottom;

 if (hasWorkspaceInView && paneVisible >= 180) return;

 if (paneTop <= visibleBottom - 180) return;

 app.scrollTo({
 top: Math.max(0, workspaceTop - 8),
 behavior: 'smooth',
 });

 });

}

function setWorkspaceGroup(group, persist = true, revealPane = false) {
 const safeGroup = WORKSPACE_GROUP_META[group] ? group : 'command';
 const previousTab = activeWorkspaceTab;
 workspaceGroup = safeGroup;
 if (!WORKSPACE_GROUP_META[safeGroup].tabs.includes(activeWorkspaceTab)) {
 activeWorkspaceTab = WORKSPACE_GROUP_META[safeGroup].tabs[0];
 }
 syncWorkspaceShell();
 const activePane = document.getElementById(`pane-${activeWorkspaceTab}`);
 if (activePane && activeWorkspaceTab !== previousTab) {
 activePane.scrollTop = 0;
 lastActivePaneScrollTop = 0;
 }
 Promise.resolve(globalThis.ensurePopupFeatureModulesForTab?.(activeWorkspaceTab))
 .catch(error => reportUiError('Workspace failed to load', error, { timeoutMs: 7000 }))
 .finally(() => {
 (globalThis.scheduleWorkspaceTabRender || renderActiveWorkspaceTab)(activeWorkspaceTab);
 });

 ensureDesktopActivePaneVisible(revealPane);
 if (persist) chrome.storage.local.set({ workspaceGroup: safeGroup, activeWorkspaceTab });
}

function setActiveWorkspaceTab(tab, persist = true, revealPane = false) {
 const normalizedTab = tab === 'analytics' ? 'liveanalytics'
 : tab === 'alerts' ? 'scanner'
 : tab;
 const safeTab = TAB_TITLES[normalizedTab] ? normalizedTab : 'home';
 const previousTab = activeWorkspaceTab;
 const nextGroup = getWorkspaceGroupForTab(safeTab);
 workspaceGroup = nextGroup;
 activeWorkspaceTab = safeTab;
 syncWorkspaceShell();
 const activePane = document.getElementById(`pane-${safeTab}`);
 if (activePane && safeTab !== previousTab) {
 activePane.scrollTop = 0;
 lastActivePaneScrollTop = 0;
 }
 if (analyticsFocusMode) {
 setAnalyticsFocusMode(false);
 }
 Promise.resolve(globalThis.ensurePopupFeatureModulesForTab?.(safeTab))
 .catch(error => reportUiError('Workspace failed to load', error, { timeoutMs: 7000 }))
 .finally(() => {
 (globalThis.scheduleWorkspaceTabRender || renderActiveWorkspaceTab)(safeTab);
 });
 syncWorkspaceScrollState();

 ensureDesktopActivePaneVisible(revealPane);
 if (persist) chrome.storage.local.set({ activeWorkspaceTab: safeTab, workspaceGroup: nextGroup });
}
globalThis.setActiveWorkspaceTab = setActiveWorkspaceTab;

function escapeHtml(value) {
 return String(value == null ? '' : value)
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#39;');
}

let systemToastTimer = null;

function showSystemToast(title, message, tone = 'info', timeoutMs = 5000) {
 const toast = document.getElementById('systemToast');
 const titleEl = document.getElementById('systemToastTitle');
 const messageEl = document.getElementById('systemToastMessage');
 if (!toast || !titleEl || !messageEl) return;
 const safeTone = ({ ok: 'success', danger: 'error' })[String(tone || '').trim().toLowerCase()] || String(tone || 'info');
 toast.classList.remove('info', 'warn', 'error', 'success');
 toast.classList.add(['info', 'warn', 'error', 'success'].includes(safeTone) ? safeTone : 'info');
 titleEl.textContent = String(title || 'Notice');
 messageEl.textContent = String(message || '');
 toast.hidden = false;
 clearTimeout(systemToastTimer);
 if (timeoutMs > 0) systemToastTimer = setTimeout(() => hideSystemToast(), timeoutMs);
}

function hideSystemToast() {
 const toast = document.getElementById('systemToast');
 if (toast) toast.hidden = true;
 clearTimeout(systemToastTimer);
}

function showToast(alert = null) {
 if (!alert || typeof alert !== 'object') {
 showSystemToast('Notice', String(alert || ''), 'info', 4200);
 return;
 }
 const symbol = String(alert.symbol || 'Signal').toUpperCase();
 const direction = String(alert.direction || '').toLowerCase();
 const side = direction.includes('short') ? 'SELL' : direction ? 'BUY' : 'SETUP';
 const score = Number(alert.score || 0);
 const tier = String(alert.alertTier || (score >= 75 ? 'execute' : score >= 60 ? 'setup' : 'watch')).toUpperCase();
 const reasons = Array.isArray(alert.reasons) ? alert.reasons.filter(Boolean) : [];
 const detail = reasons.length
 ? reasons.slice(0, 2).join(' | ')
 : `${side} ${symbol} | ${score}/100 | ${tier}`;
 const tone = direction.includes('short')
 ? 'warn'
 : score >= 75
 ? 'success'
 : 'info';
 showSystemToast(`${symbol} ${side}`, detail, tone, 5200);
}

function reportUiError(title, error, options = {}) {
 const detail = typeof error === 'string' ? error : (error?.message || options.fallback || 'Something went wrong.');
 showSystemToast(title || 'Action failed', detail, options.tone || 'error', options.timeoutMs || 6500);
}

function confirmDestructiveAction(message, options = {}) {
 const detail = String(message || 'Are you sure?');
 showSystemToast(options.title || 'Confirmation required', detail, 'warn', 2800);
 return window.confirm(detail);
}

function buildSkeletonMarkup(count = 3, variant = 'rows') {
 const cards = Array.from({ length: Math.max(1, count) }, () => `
 <div class="ds-skeleton-card">
 <div class="ds-skeleton-line short"></div>
 <div class="ds-skeleton-line long"></div>
 <div class="ds-skeleton-line mid"></div>
 </div>`).join('');
 return `<div class="ds-skeleton-grid ${escapeHtml(variant)}" aria-hidden="true">${cards}</div>`;
}

function getMarketDataModeLabel(mode) {
 const normalized = String(mode || '').trim().toLowerCase();
 if (normalized === 'polling') return 'Polling';
 if (normalized === 'websocket') return 'WebSocket Preferred';
 return 'Auto';
}

function getMarketDataSourceLabel(source) {
 const normalized = String(source || '').trim().toLowerCase();
 if (normalized === 'socket') return 'WebSocket';
 if (normalized === 'socket+rest') return 'WebSocket + REST';
 if (normalized === 'rest') return 'Polling / REST';
 if (normalized === 'batch') return 'Batch Scan';
 return 'Unknown';
}

function formatUiAge(timestamp) {
 const ts = Number(timestamp || 0);
 if (!ts) return 'Not yet';
 const diffMs = Math.max(0, Date.now() - ts);
 const diffSec = Math.round(diffMs / 1000);
 if (diffSec < 5) return 'just now';
 if (diffSec < 60) return `${diffSec}s ago`;
 const diffMin = Math.round(diffSec / 60);
 if (diffMin < 60) return `${diffMin}m ago`;
 const diffHr = Math.round(diffMin / 60);
 if (diffHr < 24) return `${diffHr}h ago`;
 const diffDay = Math.round(diffHr / 24);
 return `${diffDay}d ago`;
}

function buildMarketDataStatusPills(items = []) {
 return items
 .filter(item => item && (item.label || item.value))
 .map(item => buildTrustPill(item.label || '', item.value || '', item.tone || ''))
 .join('');
}

window.showSystemToast = showSystemToast;
window.hideSystemToast = hideSystemToast;
window.showToast = showToast;
window.reportUiError = reportUiError;
window.confirmDestructiveAction = confirmDestructiveAction;
window.buildSkeletonMarkup = buildSkeletonMarkup;
window.getMarketDataModeLabel = getMarketDataModeLabel;
window.getMarketDataSourceLabel = getMarketDataSourceLabel;
window.formatUiAge = formatUiAge;
window.buildMarketDataStatusPills = buildMarketDataStatusPills;

const SETUP_METADATA_KEY = 'dsAccountMetadataV16';
const SETUP_SECRETS_KEY = 'dsAccountSecretsV16';
const SETUP_PRIMARY_PROFILE_ID = 'primary';
const commandPaletteState = {
 open: false,
 query: '',
 activeIndex: 0,
 commands: [],
};

function buildTrustPill(label, value, tone = '') {

 return `<span class="trust-pill ${escapeHtml(tone)}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></span>`;
}



function buildOverviewCard(key, label, value, sub, tab, attrs = '') {
 const normalizedTab = tab === 'alerts' ? 'scanner' : tab;
 return `<div class="overview-card k-${escapeHtml(key)}" data-tab="${escapeHtml(normalizedTab)}"${attrs ? ' ' + attrs : ''}>
 <div class="overview-card-top">

 <div class="overview-card-label">${escapeHtml(label)}</div>
 <div>-></div>

 </div>

 <div class="overview-card-value">${escapeHtml(value)}</div>
 <div class="overview-card-sub">${sub}</div>

 </div>`;

}


function buildCommandMetricCard(key, label, value, detail, tone = '', tab = '') {
 const tabAttr = tab ? ` data-tab="${escapeHtml(tab)}"` : '';
 return `<button class="command-metric-card ${escapeHtml(tone)}" data-command-card="${escapeHtml(key)}"${tabAttr} type="button">
 <span class="command-metric-rule"></span>
 <span>${escapeHtml(label)}</span>
 <strong>${escapeHtml(value)}</strong>
 <small>${escapeHtml(detail)}</small>
 </button>`;
}

function commandBucketMeta(action = {}) {
 const bucket = String(action?.bucket || '').trim().toLowerCase();
 const tone = String(action?.tone || '').trim().toLowerCase();
 if (bucket === 'do_now' || tone === 'hot') return { label: 'Do now', tone: 'hot' };
 if (bucket === 'protect' || tone === 'danger') return { label: 'Protect first', tone: 'danger' };
 if (bucket === 'wait' || tone === 'waiting') return { label: 'Wait', tone: 'waiting' };
 if (bucket === 'paper' || /paper/i.test(String(action?.title || ''))) return { label: 'Paper only', tone: 'paper' };
 if (bucket === 'review' || tone === 'warn') return { label: 'Review', tone: 'warn' };
 return { label: bucket ? bucket.replace(/_/g, ' ') : 'Review', tone: tone || 'info' };
}

function buildCommandAction(label, detail, tab, tone = '') {
 return `<button class="command-action ${escapeHtml(tone)}" data-tab="${escapeHtml(tab)}" type="button">
 <span class="command-action-route">${escapeHtml(String(tab || '').toUpperCase())}</span>
 <span>${escapeHtml(label)}</span>
 <small>${escapeHtml(detail)}</small>
 </button>`;
}

function buildBrainActionCard(action = {}) {
 const tab = action.targetTab || 'scanner';
 const actionAttr = action.targetAction ? ` data-setup-action="${escapeHtml(action.targetAction)}"` : '';
 const confidence = Number(action.confidence || 0);
 const bucketMeta = commandBucketMeta(action);
 const evidence = action.evidence || {};
 const stats = [
 evidence.score != null ? `Score ${Number(evidence.score || 0)}` : '',
 evidence.tradeQuality != null ? `TQ ${Number(evidence.tradeQuality || 0)}` : '',
 evidence.edge || '',
 ].filter(Boolean).join(' | ');
 return `<button class="command-action command-brain-action ${escapeHtml(bucketMeta.tone)}" data-tab="${escapeHtml(tab)}"${actionAttr} type="button">
 <span class="command-action-route">${escapeHtml(bucketMeta.label)}</span>
 <span>${escapeHtml(action.title || 'Review action')}</span>
 <small>${escapeHtml(action.what || '')}</small>
 <small class="command-brain-when">When: ${escapeHtml(action.when || 'Review context.')}</small>
 <div class="command-brain-foot">
 <b>${escapeHtml(String(confidence || '--'))}%</b>
 <em>${escapeHtml(stats || action.source || 'Action Brain')}</em>
 </div>
 </button>`;
}

function resolveCommandNextStep(model = {}, topAction = null) {
 if (model.killValue === 'On') {
  return {
   label: 'Blocked',
   title: 'Kill switch is on',
   detail: model.killDetail || 'New live orders are blocked until safety settings are cleared.',
   tab: 'strategy',
   tone: 'danger',
  };
 }
 if (Number(model.ordersValue || 0) > 0) {
  return {
   label: 'Order review',
   title: 'Review pending orders before new action',
   detail: model.ordersDetail || 'Open order cache has pending orders.',
   tab: 'orders',
   tone: 'warn',
  };
 }
 if (topAction) {
  const bucketMeta = commandBucketMeta(topAction);
  return {
   label: bucketMeta.label,
   title: topAction.title || 'Review best action',
   detail: topAction.what || topAction.when || 'Open the target workspace for the next decision.',
   tab: topAction.targetTab || 'scanner',
   action: topAction.targetAction || '',
   tone: bucketMeta.tone,
  };
 }
 if (!model.scanResults.length) {
  return {
   label: 'Start',
   title: 'Run a fresh scan',
   detail: 'No scan results are loaded yet. Start with the scanner before reviewing risk or execution.',
   tab: 'scanner',
   tone: 'info',
  };
 }
 if (model.executeCount > 0) {
  return {
   label: 'Do now',
   title: 'Review execute alerts',
   detail: `${model.executeCount} execute alert${model.executeCount === 1 ? '' : 's'} ready for decision.`,
   tab: 'scanner',
   tone: 'hot',
  };
 }
 return {
  label: 'Wait',
  title: 'No urgent action',
  detail: 'Scanner, API, and risk state are visible. Wait for a stronger setup or refresh the scan.',
  tab: 'scanner',
  tone: 'waiting',
 };
}

function resolveSetupProfile(metadata = {}) {
 const profiles = Array.isArray(metadata?.profiles) ? metadata.profiles : [];
 return profiles.find(profile => String(profile?.id || '') === String(metadata?.activeProfileId || ''))
 || profiles[0]
 || null;
}

function resolveSetupCapabilityMeta(profile = null) {
 const capability = String(profile?.capability || 'Public');
 const helper = globalThis.FWDTradeDeskShared?.getAccountCapabilityMeta;
 if (typeof helper === 'function') return helper(capability);
 return {
 label: capability.replace(/([a-z])([A-Z])/g, '$1 $2'),
 allowsAccountRead: capability === 'ReadOnly' || capability === 'TradeEnabled',
 allowsTrade: capability === 'TradeEnabled',
 };
}

async function resolveSetupReadinessModel(snapshot = null) {
 const data = snapshot || await storeGet([
 SETUP_METADATA_KEY,
 SETUP_SECRETS_KEY,
 'v16LiveAccountSnapshot',
 'lastScan',
 'lastScanTs',
 'scanResults',
 'autoTradeSettings',
 'autoTrade',
 ]);
 const sessionSecrets = await sessionGet(SETUP_SECRETS_KEY).catch(() => ({}));
 const metadata = data?.[SETUP_METADATA_KEY] || {};
 const profile = typeof globalThis.getV16ActiveAccountProfile === 'function'
 ? globalThis.getV16ActiveAccountProfile()
 : resolveSetupProfile(metadata);
 const killSwitch = typeof globalThis.getV16KillSwitchState === 'function'
 ? globalThis.getV16KillSwitchState()
 : (metadata?.killSwitch || {});
 const capabilityMeta = resolveSetupCapabilityMeta(profile);
 const storedSecrets = data?.[SETUP_SECRETS_KEY] || {};
 const sessionSecretStore = sessionSecrets?.[SETUP_SECRETS_KEY] || {};
 const secret = storedSecrets?.[profile?.id] || storedSecrets?.[SETUP_PRIMARY_PROFILE_ID] || sessionSecretStore?.[profile?.id] || sessionSecretStore?.[SETUP_PRIMARY_PROFILE_ID] || {};
 const usesNative = String(profile?.credentialSource || '').trim().toLowerCase() === 'native_host';
 const hasCredential = usesNative || !!(String(secret?.tradingKey || '').trim() && String(secret?.tradingSecret || '').trim());
 const snapshotState = data?.v16LiveAccountSnapshot || null;
 const appLock = globalThis.FWDAppLock?.getStatus?.() || {};
 const scanResults = Array.isArray(data?.scanResults) ? data.scanResults : [];
 const profileSaved = !!profile?.id && Number(profile?.updatedAt || 0) > 0;
 const riskReady = Number(profile?.baseBalance || 0) > 0
 && Number(profile?.riskPerTradePct || 0) > 0
 && Number(profile?.dailyLossLimitPct || 0) > 0
 && Number(profile?.maxOrderSizeUSD || 0) > 0;
 const liveProfileReady = !!profile?.id && capabilityMeta.allowsAccountRead;
 const liveTradeReady = !!profile?.id && capabilityMeta.allowsTrade && hasCredential && !killSwitch?.enabled;
 const apiReady = !!snapshotState || (!capabilityMeta.allowsAccountRead && !!data?.lastScan);
 const scanReady = !!data?.lastScan || scanResults.length > 0;
 const steps = [
 {
 key: 'lock',
 label: 'App Lock',
 value: appLock.configured ? (appLock.unlocked ? 'Unlocked' : 'Locked') : 'Set up',
 detail: appLock.configured ? 'Desktop security is configured.' : 'Create a local app password before storing keys.',
 tone: appLock.configured && appLock.unlocked ? 'good' : appLock.configured ? 'warn' : 'bad',
 done: appLock.configured === true,
 action: appLock.configured ? 'security' : 'security',
 },
 {
 key: 'profile',
 label: 'Profile',
 value: profileSaved ? capabilityMeta.label : 'Missing',
 detail: profileSaved ? `${profile.name || 'Primary'} | ${profile.venue || 'Delta Exchange'}` : 'Save the primary trading profile.',
 tone: profileSaved ? 'good' : 'bad',
 done: profileSaved,
 action: 'profile',
 },
 {
 key: 'api',
 label: 'API',
 value: apiReady ? 'Ready' : liveProfileReady ? 'Test' : 'Public',
 detail: apiReady ? 'Market or private exchange data has responded.' : liveProfileReady ? 'Run API check after adding keys.' : 'Public scanner can run without private keys.',
 tone: apiReady ? 'good' : liveProfileReady ? 'warn' : 'info',
 done: apiReady || !liveProfileReady,
 action: 'connection',
 },
 {
 key: 'risk',
 label: 'Risk',
 value: riskReady ? 'Configured' : 'Review',
 detail: riskReady ? `${Number(profile?.riskPerTradePct || 0).toFixed(2)}% risk | max $${Number(profile?.maxOrderSizeUSD || 0).toFixed(0)}` : 'Set balance, risk, daily loss, and max order size.',
 tone: riskReady ? 'good' : 'warn',
 done: riskReady,
 action: 'risk',
 },
 {
 key: 'scan',
 label: 'First Scan',
 value: scanReady ? 'Done' : 'Run',
 detail: scanReady ? `Last scan ${data?.lastScan || 'available'}` : 'Run one scan to populate scanner, command center, and research tools.',
 tone: scanReady ? 'good' : 'warn',
 done: scanReady,
 action: 'scan',
 },
 {
 key: 'live',
 label: 'Live Trading',
 value: liveTradeReady ? 'Allowed' : killSwitch?.enabled ? 'Locked' : capabilityMeta.allowsTrade ? 'Needs Key' : 'Off',
 detail: killSwitch?.enabled ? 'Kill switch blocks new live orders.' : liveTradeReady ? 'Trade profile, credentials, and guards are ready.' : 'Keep off until profile, keys, and risk are verified.',
 tone: liveTradeReady ? 'good' : killSwitch?.enabled ? 'bad' : 'warn',
 done: liveTradeReady || !capabilityMeta.allowsTrade,
 action: killSwitch?.enabled ? 'api-keys' : 'guards',
 },
 ];
 const blocker = steps.find(step => !step.done);
 const readyCount = steps.filter(step => step.done).length;
 return {
 profile,
 capabilityMeta,
 killSwitch,
 steps,
 readyCount,
 totalCount: steps.length,
 liveTradeReady,
 needsSetup: !!blocker,
 primaryAction: blocker?.action || 'scan',
 primaryLabel: blocker ? `Fix ${blocker.label}` : 'Run Scan',
 };
}

function setupActionTarget(action = '') {
 const normalized = String(action || '').trim();
 if (normalized === 'scan') return { tab: 'scanner', click: 'btnScan' };
 if (normalized === 'riskcalc') return { tab: 'riskcalc' };
 const settingsPanels = new Set(['scanner-rules', 'strategy-profiles', 'charts', 'profile', 'paper-mode', 'api-keys', 'connection', 'security', 'risk', 'guards', 'var', 'risk-templates', 'futures-auto', 'backup', 'recovery', 'api', 'dca', 'options-auto', 'straddle-auto']);
 if (settingsPanels.has(normalized)) return { tab: 'strategy', settingsTarget: normalized };
 return { tab: normalized || 'home' };
}

function runSetupAction(action = '') {
 const target = setupActionTarget(action);
 if (target.tab) setActiveWorkspaceTab(target.tab, true, true);
 if (target.click) setTimeout(() => document.getElementById(target.click)?.click(), 80);
 if (target.settingsTarget) {
 setTimeout(() => {
 document.querySelector(`[data-settings-target="${target.settingsTarget}"]`)?.click();
 }, 120);
 }
}

async function renderSetupReadiness(snapshot = null) {
 const strip = document.getElementById('setupReadiness');
 const guide = document.getElementById('setupGuide');
 if (!strip && !guide) return;
 const model = await resolveSetupReadinessModel(snapshot).catch(() => null);
 if (!model) return;
 const stripHtml = `
 <div class="setup-readiness-left">
 <div class="setup-readiness-score ${model.liveTradeReady ? 'good' : model.needsSetup ? 'warn' : 'good'}">${model.readyCount}/${model.totalCount}</div>
 <div>
 <div class="setup-readiness-title">${model.liveTradeReady ? 'Trading profile ready' : model.needsSetup ? 'Trading profile not ready' : 'Research desk ready'}</div>
 <div class="setup-readiness-copy">${model.liveTradeReady ? 'Live trading is allowed by profile, credentials, guards, and kill switch.' : 'Complete the checklist before enabling live execution.'}</div>
 </div>
 </div>
 <div class="setup-readiness-steps">
 ${model.steps.map(step => `<button class="setup-readiness-pill ${step.tone}" data-setup-action="${escapeHtml(step.action)}" type="button"><span>${escapeHtml(step.label)}</span><strong>${escapeHtml(step.value)}</strong></button>`).join('')}
 </div>
 <button class="setup-readiness-action" data-setup-action="${escapeHtml(model.primaryAction)}" type="button">${escapeHtml(model.primaryLabel)}</button>`;
 if (strip) strip.innerHTML = stripHtml;
 if (guide) {
 guide.hidden = !model.needsSetup;
 guide.innerHTML = model.needsSetup ? `
 <div class="setup-guide-head">
 <div><strong>First-Time Setup</strong><span>Finish these items once, then the desk stays quiet.</span></div>
 <button class="setup-guide-close" data-setup-guide-dismiss type="button">Hide</button>
 </div>
 <div class="setup-guide-grid">
 ${model.steps.map(step => `<button class="setup-guide-item ${step.done ? 'done' : step.tone}" data-setup-action="${escapeHtml(step.action)}" type="button">
 <span>${step.done ? 'Done' : 'Next'}</span>
 <strong>${escapeHtml(step.label)}</strong>
 <small>${escapeHtml(step.detail)}</small>
 </button>`).join('')}
 </div>` : '';
 }
 [strip, guide].filter(Boolean).forEach(root => {
 root.querySelectorAll('[data-setup-action]').forEach(button => {
 button.addEventListener('click', () => runSetupAction(button.dataset.setupAction || ''));
 });
 root.querySelector('[data-setup-guide-dismiss]')?.addEventListener('click', () => {
 if (guide) guide.hidden = true;
 });
 });
}

async function recordPopupPerformanceMetric(section = '', sample = {}) {
 const key = 'performanceMetricsV17';
 const targetSection = String(section || '').trim();
 if (!targetSection) return false;
 const current = (await storeGet(key))?.[key] || {};
 const target = current[targetSection] && typeof current[targetSection] === 'object' ? current[targetSection] : {};
 const durationMs = Math.max(0, Number(sample.durationMs || 0));
 const total = Number(target.total || 0) + 1;
 const lastMs = +durationMs.toFixed(1);
 const samples = Array.isArray(target.samples) ? target.samples.slice(-79) : [];
 samples.push({ ts: Date.now(), durationMs: lastMs, ...sample });
 await storeSet({
 [key]: {
 ...current,
 [targetSection]: {
 ...target,
 total,
 lastMs,
 maxMs: Math.max(Number(target.maxMs || 0), lastMs),
 avgMs: +(((Number(target.avgMs || 0) * Math.max(0, total - 1)) + lastMs) / total).toFixed(1),
 lastSurface: sample.surface || target.lastSurface || '',
 samples,
 },
 savedAt: Date.now(),
 },
 });
 return true;
}

globalThis.recordPopupPerformanceMetric = recordPopupPerformanceMetric;

function buildCommandPaletteCommands() {
 const commands = [
 { id: 'scan', title: 'Scan Now', subtitle: 'Run the scanner immediately', keywords: 'scan market refresh signals', action: () => { setActiveWorkspaceTab('scanner', true, true); setTimeout(() => document.getElementById('btnScan')?.click(), 80); } },
 { id: 'home', title: 'Command Center', subtitle: 'Open daily operating dashboard', keywords: 'home dashboard command center', tab: 'home' },
 { id: 'scanner', title: 'Scanner', subtitle: 'Review signals and alerts', keywords: 'signals alerts execute setup scanner', tab: 'scanner' },
 { id: 'watchlist', title: 'Watchlist', subtitle: 'Open pinned symbols and custom alerts', keywords: 'watchlist pinned custom alert', tab: 'watchlist' },
 { id: 'chart', title: 'Chart Workspace', subtitle: 'Open clean key-level chart workspace', keywords: 'chart key levels candle tradingview', tab: 'chart' },
 { id: 'options', title: 'Native Straddle', subtitle: 'Open lightweight MV straddle scanner view', keywords: 'options native straddle scanner mv', tab: 'options' },
 { id: 'analytics', title: 'Analytics', subtitle: 'Open live analytics and journal', keywords: 'analytics journal pnl history', tab: 'liveanalytics' },
 { id: 'funds', title: 'Funds', subtitle: 'Open wallet and cash movement view', keywords: 'funds wallet balance cash', tab: 'funds' },
 { id: 'positions', title: 'Positions', subtitle: 'Manage exposure, stops, targets, journal', keywords: 'positions exposure stop target close flatten', tab: 'positions' },
 { id: 'orders', title: 'Orders', subtitle: 'Review open orders, audit, notifications', keywords: 'orders audit notifications reconciliation', tab: 'orders' },
 { id: 'riskcalc', title: 'Risk Cockpit', subtitle: 'Position sizing, guards, VAR', keywords: 'risk var sizing leverage loss guard', tab: 'riskcalc' },
 { id: 'funding', title: 'Funding Map', subtitle: 'Crowding and funding research', keywords: 'funding crowding heatmap arbitrage', tab: 'funding' },
 { id: 'corr', title: 'Correlation Matrix', subtitle: 'Cluster risk and hedges', keywords: 'correlation matrix cluster hedge', tab: 'corr' },
 { id: 'settings-profile', title: 'Profile Settings', subtitle: 'User profile, mode, venue', keywords: 'profile mode user venue read trade', action: () => runSetupAction('profile') },
 { id: 'settings-paper', title: 'Paper Trading', subtitle: 'Forward test without live futures orders', keywords: 'paper trading shadow ledger forward test', action: () => runSetupAction('paper-mode') },
 { id: 'settings-presets', title: 'Strategy Profiles', subtitle: 'Apply scanner and risk presets', keywords: 'strategy profile preset risk scanner paper', action: () => runSetupAction('strategy-profiles') },
 { id: 'settings-api', title: 'API Keys', subtitle: 'Credentials and kill switch', keywords: 'api key secret credential kill switch', action: () => runSetupAction('api-keys') },
 { id: 'settings-risk', title: 'Risk Settings', subtitle: 'Balance, day loss, order size', keywords: 'risk settings balance daily loss order size', action: () => runSetupAction('risk') },
 { id: 'connection', title: 'Connection Check', subtitle: 'Run market-data readiness checks', keywords: 'connection api health market data check', action: () => runSetupAction('connection') },
 { id: 'recovery', title: 'Recovery Center', subtitle: 'Fix blocked setup and stale runtime state', keywords: 'recovery error fix blocked cooldown stale runtime', action: () => runSetupAction('recovery') },
 { id: 'webhooks', title: 'Telegram & Webhooks', subtitle: 'External alerts and automation', keywords: 'telegram webhook automation alerts', tab: 'webhooks' },
 { id: 'debug', title: 'Debug Log', subtitle: 'Open raw diagnostics', keywords: 'debug log diagnostics', tab: 'debug' },
 ];
 const symbolMap = new Map();
 const addSymbolCommand = (symbol, signal = null, source = 'Symbol') => {
 const key = String(symbol || '').trim().toUpperCase();
 if (!key || symbolMap.has(key)) return;
 symbolMap.set(key, {
 id: `symbol-${key}`,
 title: `Symbol: ${key}`,
 subtitle: `${source} | open chart workspace`,
 keywords: `symbol switch chart ${key} ${String(signal?.setupFamilyLabel || signal?.setupFamily || '').toLowerCase()}`,
 action: () => openChartForSymbolCommand(key, signal),
 });
 };
 (Array.isArray(commandPaletteSnapshot.scanResults) ? commandPaletteSnapshot.scanResults : [])
 .slice()
 .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))
 .slice(0, 30)
 .forEach(signal => addSymbolCommand(signal?.symbol, signal, 'Scan result'));
 [
 ...(Array.isArray(commandPaletteSnapshot.watchlist) ? commandPaletteSnapshot.watchlist : []),
 ...(Array.isArray(commandPaletteSnapshot.manualWatchlist) ? commandPaletteSnapshot.manualWatchlist : []),
 ].slice(0, 30).forEach(symbol => addSymbolCommand(symbol, null, 'Watchlist'));
 return [...commands, ...symbolMap.values()];
}

function openChartForSymbolCommand(symbol, signal = null) {
 const key = String(symbol || '').trim().toUpperCase();
 if (!key) return;
 setActiveWorkspaceTab('chart', true, true);
 const chartApi = globalThis.FWDTradeDeskChartWorkspace || {};
 if (signal && typeof chartApi.setChartSymbolFromSignal === 'function') {
 chartApi.setChartSymbolFromSignal(signal, {
 symbol: key,
 chartViewMode: 'tab',
 preset: 'key',
 timeframe: '15m',
 primaryTimeframe: '15m',
 }).catch(() => {});
 return;
 }
 if (typeof chartApi.setChartState === 'function') {
 chartApi.setChartState({
 symbol: key,
 chartViewMode: 'tab',
 preset: 'key',
 timeframe: '15m',
 primaryTimeframe: '15m',
 executionTimeframe: '15m',
 refreshNonce: Date.now(),
 }).catch(() => {});
 }
}

function commandMatches(command, query = '') {
 const q = String(query || '').trim().toLowerCase();
 if (!q) return true;
 return [command.title, command.subtitle, command.keywords, command.id]
 .some(value => String(value || '').toLowerCase().includes(q));
}

function executeCommand(command) {
 if (!command) return;
 closeCommandPalette();
 if (typeof command.action === 'function') {
 command.action();
 return;
 }
 if (command.tab) setActiveWorkspaceTab(command.tab, true, true);
}

function renderCommandPaletteList() {
 const list = document.getElementById('commandPaletteList');
 if (!list) return;
 const commands = commandPaletteState.commands.filter(command => commandMatches(command, commandPaletteState.query)).slice(0, 10);
 commandPaletteState.activeIndex = Math.max(0, Math.min(commandPaletteState.activeIndex, Math.max(0, commands.length - 1)));
 if (!commands.length) {
 list.innerHTML = `<div class="command-palette-empty">No matching command</div>`;
 return;
 }
 list.innerHTML = commands.map((command, index) => `<button class="command-palette-item ${index === commandPaletteState.activeIndex ? 'active' : ''}" data-command-id="${escapeHtml(command.id)}" type="button">
 <span>${escapeHtml(command.title)}</span>
 <small>${escapeHtml(command.subtitle)}</small>
 </button>`).join('');
 list.querySelectorAll('[data-command-id]').forEach(button => {
 button.addEventListener('click', () => {
 const command = commands.find(item => item.id === button.dataset.commandId);
 executeCommand(command);
 });
 });
}

function openCommandPalette(initialQuery = '') {
 const overlay = document.getElementById('commandPaletteOverlay');
 const input = document.getElementById('commandPaletteInput');
 if (!overlay || !input) return;
 commandPaletteState.open = true;
 commandPaletteState.query = initialQuery;
 commandPaletteState.activeIndex = 0;
 commandPaletteState.commands = buildCommandPaletteCommands();
 overlay.hidden = false;
 input.value = initialQuery;
 renderCommandPaletteList();
 setTimeout(() => input.focus(), 0);
}

function closeCommandPalette() {
 const overlay = document.getElementById('commandPaletteOverlay');
 if (overlay) overlay.hidden = true;
 commandPaletteState.open = false;
 commandPaletteState.query = '';
}

function bindCommandPalette() {
 const overlay = document.getElementById('commandPaletteOverlay');
 const input = document.getElementById('commandPaletteInput');
 document.getElementById('commandPaletteClose')?.addEventListener('click', closeCommandPalette);
 overlay?.addEventListener('click', event => {
 if (event.target === overlay) closeCommandPalette();
 });
 input?.addEventListener('input', () => {
 commandPaletteState.query = input.value || '';
 commandPaletteState.activeIndex = 0;
 renderCommandPaletteList();
 });
 input?.addEventListener('keydown', event => {
 const matches = commandPaletteState.commands.filter(command => commandMatches(command, commandPaletteState.query)).slice(0, 10);
 if (event.key === 'ArrowDown') {
 event.preventDefault();
 commandPaletteState.activeIndex = matches.length ? Math.min(matches.length - 1, commandPaletteState.activeIndex + 1) : 0;
 renderCommandPaletteList();
 }
 if (event.key === 'ArrowUp') {
 event.preventDefault();
 commandPaletteState.activeIndex = Math.max(0, commandPaletteState.activeIndex - 1);
 renderCommandPaletteList();
 }
 if (event.key === 'Enter') {
 event.preventDefault();
 executeCommand(matches[commandPaletteState.activeIndex]);
 }
 if (event.key === 'Escape') {
 event.preventDefault();
 closeCommandPalette();
 }
 });
}

document.addEventListener('DOMContentLoaded', () => {
 bindCommandPalette();
 migrateLocalJournalKeysToNative().catch(() => {});
});

document.addEventListener('keydown', event => {
 const tag = (event.target?.tagName || '').toLowerCase();
 const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable;
 const key = String(event.key || '').toLowerCase();
 if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'k') {
 event.preventDefault();
 runSetupAction('api-keys');
 return;
 }
 if ((event.ctrlKey || event.metaKey) && key === 'k') {
 event.preventDefault();
 openCommandPalette();
 return;
 }
 if (!isTyping && event.altKey && key === 's') {
 event.preventDefault();
 openCommandPalette('symbol');
 return;
 }
 if (!isTyping && event.altKey && key === 'c') {
 event.preventDefault();
 setActiveWorkspaceTab('chart', true, true);
 return;
 }
 if (!isTyping && event.altKey && key === 'o') {
 event.preventDefault();
 setActiveWorkspaceTab('orders', true, true);
 return;
 }
 if (!isTyping && event.altKey && key === 'p') {
 event.preventDefault();
 setActiveWorkspaceTab('positions', true, true);
 return;
 }
 if (!isTyping && key === '/') {
 event.preventDefault();
 openCommandPalette();
 return;
 }
 if (commandPaletteState.open && key === 'escape') {
 event.preventDefault();
 closeCommandPalette();
 }
});

function resolveCommandCenterModel(d = {}) {
 const scanResults = Array.isArray(d.scanResults) ? d.scanResults : [];
 const alerts = getLiveAlertSnapshot(d.alerts, scanResults);
 const watchlist = Array.isArray(d.watchlist) ? d.watchlist : [];
 const manualWatchlist = Array.isArray(d.manualWatchlist) ? d.manualWatchlist : [];
 const manualPositions = Array.isArray(d.analyticsPositions) ? d.analyticsPositions : [];
 const snapshot = d.v16LiveAccountSnapshot || null;
 const livePositions = Array.isArray(snapshot?.marginedPositions)
 ? snapshot.marginedPositions.filter(p => Number(p?.size || 0) !== 0)
 : [];
 const liveOrders = Array.isArray(snapshot?.openOrders)
 ? snapshot.openOrders.filter(order => ['open', 'pending'].includes(String(order?.state || '').toLowerCase()))
 : [];
 const positions = livePositions.length ? livePositions : manualPositions;
 const executeCount = alerts.filter(a => String(a.alertTier || '').toLowerCase() === 'execute').length;
 const setupCount = alerts.filter(a => String(a.alertTier || '').toLowerCase() === 'setup').length;
 const scanActive = !!d.scanActive || /loading|scanning/i.test(String(d.scanStatus || ''));
 const scanLabel = scanActive ? 'Scanning' : (d.lastScan ? 'Idle' : 'Not Run');
 const scanDetail = scanActive
 ? `${Number(d.scanProgress || 0)}% complete`
 : (d.lastScan ? `Last scan ${d.lastScan}` : 'Run the first scan to fill the desk.');
 const killSwitch = typeof globalThis.getV16KillSwitchState === 'function'
 ? globalThis.getV16KillSwitchState()
 : { enabled: false, reason: '' };
 const profile = typeof globalThis.getV16ActiveAccountProfile === 'function'
 ? globalThis.getV16ActiveAccountProfile()
 : {};
 const capabilityMeta = typeof getAccountCapabilityMeta === 'function'
 ? getAccountCapabilityMeta(profile?.capability)
 : null;
 const apiValue = snapshot?.rateLimit ? 'Cooling' : (snapshot ? 'Connected' : (profile?.id ? 'Configured' : 'Not Ready'));
 const apiDetail = snapshot?.baseUrl
 ? `${String(snapshot.region || '').toUpperCase() || 'Delta'} ${snapshot.cached ? 'cached' : 'live'} snapshot`
 : (profile?.id ? `${capabilityMeta?.label || 'Profile'} profile selected` : 'Add or select an account profile.');
 const riskBudget = Number(d.autoTradeSettings?.dailyLossLimitUSD || 0);
 const dailyLoss = Number(d.autoTradeDailyLoss || d.autoTradeDecisionAuditV16?.dailyLossUsed || 0);
 const riskValue = riskBudget > 0 ? `$${Math.max(0, dailyLoss).toFixed(0)} / $${riskBudget.toFixed(0)}` : `${positions.length} open`;
 const riskDetail = riskBudget > 0 ? 'Daily loss guard usage' : 'Open exposure count';
 const slotMax = Number(d.autoTradeDecisionAuditV16?.maxConcurrent || d.autoTradeSettings?.maxConcurrent || 0);
 const slotUsed = Number(d.autoTradeDecisionAuditV16?.openCount || (livePositions.length + liveOrders.filter(order => !order?.reduce_only && !order?.reduceOnly).length) || positions.length);
 const pendingDetail = liveOrders.length ? `${liveOrders.length} live order${liveOrders.length === 1 ? '' : 's'} waiting` : 'No cached pending orders';
 const brainInput = {
 ...d,
 killSwitch,
 };
 const brain = globalThis.FWDTradeDeskActionBrain?.buildActionBrain
 ? globalThis.FWDTradeDeskActionBrain.buildActionBrain(brainInput)
 : null;
 const learning = brain?.learning || {};
 const automationOn = !!d.autoTradeSettings?.enabled || !!d.autoTrade;
 const executionMode = automationOn ? 'Live rules on' : Number(learning.paperOpen || 0) || Number(learning.paperClosed || 0) ? 'Paper learning' : 'Manual review';
 const actions = [
 executeCount
 ? ['Review execute queue', `${executeCount} execute alert${executeCount === 1 ? '' : 's'} ready`, 'scanner', 'hot']
 : ['Scan market now', scanActive ? 'Scan is already running' : 'Refresh all trade candidates', 'scanner', ''],
 positions.length
 ? ['Manage open exposure', `${positions.length} active position${positions.length === 1 ? '' : 's'}`, 'positions', 'warn']
 : ['Check position desk', 'Load live account or add manual positions', 'positions', ''],
 liveOrders.length
 ? ['Review pending orders', pendingDetail, 'orders', 'warn']
 : ['Open orders desk', 'No pending orders in cache', 'orders', ''],
 killSwitch?.enabled
 ? ['Open safety settings', killSwitch.reason || 'Kill switch is armed', 'strategy', 'danger']
 : ['Open Risk Cockpit', slotMax ? `Slots ${slotUsed}/${slotMax} used` : 'Confirm size, VAR, and exposure', 'riskcalc', ''],
 watchlist.length || manualWatchlist.length
 ? ['Refresh watchlist', `${Math.max(watchlist.length, manualWatchlist.length)} symbols tracked`, 'watchlist', '']
 : ['Build watchlist', 'Pin setups you want to monitor', 'watchlist', ''],
 ];
 return {
 scanLabel,
 scanDetail,
 scanTone: scanActive ? 'warn' : (d.lastScan ? 'good' : 'bad'),
 apiValue,
 apiDetail,
 apiTone: snapshot?.rateLimit ? 'warn' : (snapshot || profile?.id ? 'good' : 'bad'),
 killValue: killSwitch?.enabled ? 'On' : 'Off',
 killDetail: killSwitch?.enabled ? (killSwitch.reason || 'New live orders blocked') : 'No kill-switch block active',
 killTone: killSwitch?.enabled ? 'bad' : 'good',
 riskValue,
 riskDetail,
 riskTone: riskBudget > 0 && dailyLoss >= riskBudget ? 'bad' : (positions.length ? 'warn' : 'good'),
 positionsValue: String(positions.length),
 positionsDetail: livePositions.length ? 'Live Delta positions' : 'Manual/tracked positions',
 ordersValue: String(liveOrders.length),
 ordersDetail: pendingDetail,
 scanResults,
 executeCount,
 setupCount,
 watchlist,
 actions,
 brain,
 learning,
 executionMode,
 };
}

function renderCommandCenter(d = {}) {
 const root = document.getElementById('commandCenter');
 if (!root) return;
 const model = resolveCommandCenterModel(d);
 const metricsHtml = [
 buildCommandMetricCard('risk', 'Today Open Risk', model.riskValue, model.riskDetail, model.riskTone, 'riskcalc'),
 buildCommandMetricCard('positions', 'Active Positions', model.positionsValue, model.positionsDetail, model.positionsValue === '0' ? '' : 'warn', 'positions'),
 buildCommandMetricCard('orders', 'Pending Orders', model.ordersValue, model.ordersDetail, model.ordersValue === '0' ? 'good' : 'warn', 'orders'),
 buildCommandMetricCard('kill', 'Kill Switch', model.killValue, model.killDetail, model.killTone, 'strategy'),
 buildCommandMetricCard('api', 'API State', model.apiValue, model.apiDetail, model.apiTone, 'funds'),
 buildCommandMetricCard('scan', 'Scan Health', model.scanLabel, model.scanDetail, model.scanTone, 'scanner'),
 ].join('');
 const brain = model.brain || null;
 const brainActions = Array.isArray(brain?.actions) ? brain.actions : [];
 const actionsHtml = brainActions.length
 ? brainActions.slice(0, 6).map(buildBrainActionCard).join('')
 : model.actions.slice(0, 5)
 .map(action => buildCommandAction(action[0], action[1], action[2], action[3]))
 .join('');
 const topAction = brain?.top || null;
 const nextStep = resolveCommandNextStep(model, topAction);
 const queueState = nextStep.label;
 const learning = model.learning || {};
 const emptyDesk = !model.scanResults.length;
 const nextTabLabel = {
  riskcalc: 'Risk Cockpit',
  strategy: 'Settings',
  scanner: 'Scanner',
  orders: 'Orders',
  positions: 'Positions',
  funds: 'Funds',
  liveanalytics: 'Journal',
  watchlist: 'Watchlist',
 }[nextStep.tab] || nextStep.tab || 'workspace';
 const blockerTitle = model.killValue === 'On'
 ? 'Live orders blocked'
 : Number(model.ordersValue || 0) > 0
 ? 'Pending order review'
 : model.apiValue === 'Cooling'
 ? 'API cooldown active'
 : emptyDesk
 ? 'No scan loaded'
 : 'No hard blocker';
 const blockerDetail = model.killValue === 'On'
 ? model.killDetail
 : Number(model.ordersValue || 0) > 0
 ? model.ordersDetail
 : model.apiValue === 'Cooling'
 ? model.apiDetail
 : emptyDesk
 ? 'Run one scan so the desk can rank candidates and risk.'
 : 'Risk, API, and queue state are clear enough for review.';
 const emptyHtml = emptyDesk ? `<div class="command-empty-panel">
 <div>
 <span>Getting started state</span>
 <strong>Run one scan to fill the decision queue</strong>
 <small>The Command Center becomes useful after it has current scanner rows, alert tiers, and account state.</small>
 </div>
 <div class="command-empty-actions">
 <button type="button" data-tab="scanner" data-scan-now="1">Run scan</button>
 <button type="button" data-tab="strategy">Check setup</button>
 <button type="button" data-tab="riskcalc">Review risk</button>
 </div>
 </div>` : '';
 root.innerHTML = `
 <div class="command-center-head">
 <section class="command-next-card ${escapeHtml(nextStep.tone)}">
 <div class="command-next-main">
 <div class="command-next-label-row">
 <span class="command-live-pill ${escapeHtml(nextStep.tone)}">${escapeHtml(queueState)}</span>
 <div class="command-eyebrow">Decision-first cockpit</div>
 </div>
 <h2>${escapeHtml(nextStep.title)}</h2>
 <p>${escapeHtml(nextStep.detail)}</p>
 <div class="command-head-actions">
 <button class="command-secondary" data-tab="${escapeHtml(nextStep.tab)}"${nextStep.action ? ` data-setup-action="${escapeHtml(nextStep.action)}"` : ''} type="button">Open ${escapeHtml(nextTabLabel)}</button>
 <button class="command-primary" data-tab="scanner" data-scan-now="1" type="button">Scan Now</button>
 </div>
 </div>
 <aside class="command-next-support" aria-label="Decision support">
 <div class="command-next-stat">
 <span>Blocker</span>
 <strong>${escapeHtml(blockerTitle)}</strong>
 <small>${escapeHtml(blockerDetail)}</small>
 </div>
 <div class="command-next-stat">
 <span>Execution</span>
 <strong>${model.killValue === 'On' ? 'Locked' : model.ordersValue !== '0' ? 'Review orders' : model.executionMode}</strong>
 <small>${escapeHtml(model.executeCount)} execute alert${model.executeCount === 1 ? '' : 's'} / ${escapeHtml(model.ordersValue)} pending order${model.ordersValue === '1' ? '' : 's'}</small>
 </div>
 <div class="command-next-why">
 <span>Why this is first</span>
 <strong>${escapeHtml(emptyDesk ? 'The desk has no current market ranking.' : topAction?.source || 'Risk state and queue state are highest priority.')}</strong>
 <small>${escapeHtml(emptyDesk ? 'Scan first, then confirm risk before acting.' : topAction?.when || 'The supporting metrics below explain whether to act, wait, or protect first.')}</small>
 </div>
 </aside>
 </section>
 </div>
 <div class="command-day-strip">
 <button type="button" data-tab="scanner"><span>Market scan</span><strong>${escapeHtml(model.scanLabel)}</strong></button>
 <button type="button" data-tab="liveanalytics"><span>Paper learning</span><strong>${escapeHtml(String(learning.paperClosed || 0))} closed</strong></button>
 <button type="button" data-tab="liveanalytics"><span>Open paper</span><strong>${escapeHtml(String(learning.paperOpen || 0))}</strong></button>
 <button type="button" data-tab="funds"><span>API</span><strong>${escapeHtml(model.apiValue)}</strong></button>
 </div>
 <div class="command-metric-grid">${metricsHtml}</div>
 <div class="command-lower-grid">
 <section class="command-panel">
 <div class="command-panel-title">Action Brain Queue</div>
 <div class="command-action-list">${actionsHtml}${emptyHtml}</div>
 </section>
 <section class="command-panel command-snapshot-panel">
 <div class="command-panel-title">Decision Snapshot</div>
 <div class="command-snapshot-status ${escapeHtml(nextStep.tone)}">
 <strong>${escapeHtml(nextStep.title)}</strong>
 <span>${escapeHtml(nextStep.detail)}</span>
 </div>
 <div class="command-snapshot-row"><span>Trade desk</span><strong>${escapeHtml(model.scanLabel)}</strong></div>
 <div class="command-snapshot-row"><span>Mode</span><strong>${escapeHtml(model.executionMode)}</strong></div>
 <div class="command-snapshot-row"><span>Paper edge</span><strong>${escapeHtml(String(learning.setupRows || 0))} setup rows</strong></div>
 <div class="command-snapshot-row"><span>Min sample</span><strong>${escapeHtml(String(learning.minSample || '--'))}</strong></div>
 <div class="command-snapshot-row"><span>Execution</span><strong>${model.killValue === 'On' ? 'Locked' : model.ordersValue !== '0' ? 'Review orders' : 'Ready'}</strong></div>
 <div class="command-snapshot-row"><span>Private API</span><strong>${escapeHtml(model.apiValue)}</strong></div>
 <div class="command-snapshot-row"><span>Queue</span><strong>${escapeHtml(model.executeCount)} execute / ${escapeHtml(model.ordersValue)} orders</strong></div>
 </section>
 </div>
 `;
 root.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => {
   const setupAction = button.dataset.setupAction;
   if (setupAction) {
    runSetupAction(setupAction);
    return;
   }
   const tab = button.dataset.tab;
 if (button.classList.contains('command-primary') || button.dataset.scanNow === '1') {
 document.getElementById('btnScan')?.click();
 }
 if (tab) setActiveWorkspaceTab(tab, true, true);
 });
 });
}






async function updateWorkspaceInsights(snapshot = null) {
 const d = snapshot || await storeGet([
 'scanStatus', 'lastScan', 'alerts', 'watchlist', 'analyticsPositions',
 'marketIndex', 'scanResults', 'scanActive', 'scanProgress', 'manualWatchlist',
 'v16LiveAccountSnapshot', 'autoTradeSettings', 'autoTradeDailyLoss',
 'autoTradeDecisionAuditV16', 'v16ShadowTradeLedgerV1', 'v16SetupPerformanceV1',
 SETUP_METADATA_KEY, SETUP_SECRETS_KEY,
 ]);
 commandPaletteSnapshot = d || {};
 renderCommandCenter(d);
 renderSetupReadiness(d);
 const scanResults = Array.isArray(d.scanResults) ? d.scanResults : [];
 const alerts = getLiveAlertSnapshot(d.alerts, scanResults);
 const watchlist = Array.isArray(d.watchlist) ? d.watchlist : [];
 const positions = Array.isArray(d.analyticsPositions) ? d.analyticsPositions : [];
 const executeCount = alerts.filter(a => String(a.alertTier || '').toLowerCase() === 'execute').length;
 const setupCount = alerts.filter(a => String(a.alertTier || '').toLowerCase() === 'setup').length;
 const watchAlertCount = alerts.filter(a => String(a.alertTier || '').toLowerCase() === 'watch').length;
 const marketIndex = d.marketIndex || null;
 const regimeValue = marketIndex?.regime ? String(marketIndex.regime).replace(/_/g, ' ') : 'READY';
 const sentimentValue = Number(marketIndex?.sentiment?.value ?? marketIndex?.value ?? NaN);
 const indexMove = Number(marketIndex?.indexChangePct ?? NaN);
 const regimeDelta = Number.isFinite(sentimentValue)
 ? `Sent ${sentimentValue >= 0 ? '+' : ''}${sentimentValue.toFixed(2)}% | Index ${Number.isFinite(indexMove) ? `${indexMove >= 0 ? '+' : ''}${indexMove.toFixed(2)}%` : '-'}`
 : 'No index yet';
 const leadershipLabel = marketIndex?.leadership?.label || 'Mixed Leadership';
 const thresholdSummary = marketIndex?.thresholdSummary || 'Execute >= 65 | Setup >= 60 | Watch >= 45';
 const strengthRank = { prime: 3, strong: 2, early: 1 };
 const emergingCandidates = scanResults
 .filter(r => r?.emergingMove)
 .sort((a, b) => {
 const aRank = strengthRank[a.emergingMove?.strength] || 0;
 const bRank = strengthRank[b.emergingMove?.strength] || 0;
 return bRank - aRank || Number(b.score || 0) - Number(a.score || 0);
 });
 const emergingFocus = emergingCandidates[0] || null;
 const emergingCount = emergingCandidates.length;
 const emergingValue = emergingCount ? `${emergingCount}` : 'QUIET';
 const emergingTopList = emergingCandidates.slice(0, 3).map(r => r.symbol).join(' | ');
 const emergingSub = emergingFocus?.emergingMove
 ? `<strong>${emergingFocus.symbol}</strong> | ${emergingFocus.emergingMove.mode === 'reversal' ? 'Reversal' : 'Ignition'} ${String(emergingFocus.emergingMove.strength || '').toUpperCase()}${emergingCount > 1 ? ` | +${emergingCount - 1} more` : ''}<br/>${emergingTopList}`
 : 'No emerging move in the current scan snapshot';
 const scanTone = d.scanStatus && d.scanStatus !== 'done' ? 'warn' : (d.lastScan ? 'ok' : 'fail');
 const trustHtml = [
 buildTrustPill('Status', d.scanStatus && d.scanStatus !== 'done' ? 'Scanning' : 'Idle', scanTone),
 buildTrustPill('Last Scan', d.lastScan || 'Not run', d.lastScan ? 'ok' : 'fail'),
 buildTrustPill('Alert Stack', `${executeCount} exec | ${setupCount} setup | ${watchAlertCount} watch`, executeCount ? 'warn' : ''),
 buildTrustPill('Portfolio', `${positions.length} manual | ${watchlist.length} watch`, positions.length || watchlist.length ? 'ok' : ''),
 buildTrustPill('Leadership', leadershipLabel, marketIndex?.leadership?.tone === 'bad' ? 'warn' : 'ok'),
 buildTrustPill('Thresholds', thresholdSummary, 'ok'),
 ].join('');
 const trustEl = document.getElementById('trustBar');
 if (trustEl) trustEl.innerHTML = trustHtml;

 const overviewHtml = [
 buildOverviewCard('regime', 'Market Regime', regimeValue, `<strong>${regimeDelta}</strong> on FWD-10 | ${leadershipLabel} | ${scanResults.length} live signals`, 'scanner'),
 buildOverviewCard(
 'emerging',
 'Emerging Move',
 emergingValue,
 emergingSub,
 'scanner',
 emergingFocus?.symbol ? `data-sym="${esc(emergingFocus.symbol)}"` : ''
 ),
 buildOverviewCard('execute', 'Execute Queue', String(executeCount), `${alerts.length} live alerts | click to review active setups`, 'alerts'),
 buildOverviewCard('watch', 'Watchlist', String(watchlist.length), `${watchlist.length ? 'Pinned ideas ready for refresh' : 'No pinned coins yet'}`, 'watchlist'),
 buildOverviewCard('portfolio', 'Portfolio', String(positions.length), `${positions.length ? 'Tracked positions ready in Position Desk' : 'Use Position Desk for live exposure and review'}`, 'positions'),
 buildOverviewCard('review', 'Review', 'Live Journal', 'Trade history and journal now live in Analytics', 'liveanalytics'),
 buildOverviewCard('research', 'Research', String(scanResults.length), 'Funding and matrix use the latest scan snapshot', 'funding'),
 ].join('');
 const overviewEl = document.getElementById('overviewGrid');
 if (overviewEl) {
 overviewEl.innerHTML = overviewHtml;
 overviewEl.querySelectorAll('.overview-card').forEach(card => {
 card.addEventListener('click', () => {
 const sym = card.dataset.sym;
 if (sym) {
 const match = scanResults.find(r => String(r.symbol || '').toUpperCase() === String(sym).toUpperCase());
 setActiveWorkspaceTab('scanner', true, true);
 if (match) {
 openModal(match);
 return;
 }
 }
 setActiveWorkspaceTab(card.dataset.tab, true, true);
 });
 });
 }
}

function setAnalyticsFocusMode(enabled, persist = true) {
 analyticsFocusMode = !!enabled;

 document.body.classList.toggle('analytics-focus-mode', analyticsFocusMode);

 ['btnAnalyticsFocus'].forEach(id => {

 const btn = document.getElementById(id);

 if (!btn) return;

 btn.classList.toggle('active', analyticsFocusMode);

 btn.textContent = analyticsFocusMode ? 'Full View' : 'Compact View';

 btn.title = analyticsFocusMode

 ? 'Show full analytics layout'

 : 'Use compact analytics layout';

 });

 if (persist) {

 chrome.storage.local.set({ analyticsFocusMode });

 }

}



function setWorkspaceFocusMode(enabled, persist = true) {

 workspaceFocusMode = !!enabled;

 document.body.classList.toggle('workspace-focus-mode', workspaceFocusMode);

 const btn = document.getElementById('btnWorkspaceFocus');

 if (btn) {

 btn.classList.toggle('active', workspaceFocusMode);

 btn.textContent = workspaceFocusMode ? 'Full View' : 'Compact View';

 btn.title = workspaceFocusMode

 ? 'Show full workspace layout'

 : 'Use compact workspace layout';

 }

 if (workspaceFocusMode) {

 setWorkspaceScrollCollapsed(false);

 } else {

 syncWorkspaceScrollState();

 }

 if (persist) chrome.storage.local.set({ workspaceFocusMode });

}



function setWorkspaceScrollCollapsed(enabled) {

 const nextState = !!enabled && !workspaceFocusMode;

 if (workspaceScrollCollapsed === nextState) return;

 workspaceScrollCollapsed = nextState;

 workspaceScrollIgnoreUntil = Date.now() + 240;

 document.body.classList.toggle('workspace-scroll-collapsed', workspaceScrollCollapsed);

}



function syncWorkspaceScrollState() {

 const pane = document.getElementById(`pane-${activeWorkspaceTab}`);

 if (!pane) return;

 lastActivePaneScrollTop = Number(pane.scrollTop || 0);

 if (workspaceFocusMode) {

 setWorkspaceScrollCollapsed(false);

 return;

 }

 if (activeWorkspaceTab !== 'scanner') {
 setWorkspaceScrollCollapsed(false);

 return;

 }

 setWorkspaceScrollCollapsed(lastActivePaneScrollTop > 240);

}



function isExternalBackupSupported() {

 return typeof window.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined';

}



function openBackupDB() {

 return new Promise((resolve, reject) => {

 if (typeof indexedDB === 'undefined') {

 reject(new Error('IndexedDB unavailable'));

 return;

 }

 const req = indexedDB.open(BACKUP_DB_NAME, 1);

 req.onupgradeneeded = () => {

 const db = req.result;

 if (!db.objectStoreNames.contains(BACKUP_DB_STORE)) {

 db.createObjectStore(BACKUP_DB_STORE);

 }

 };

 req.onsuccess = () => resolve(req.result);

 req.onerror = () => reject(req.error || new Error('Backup DB open failed'));

 });

}



async function idbSetBackupHandle(handle) {

 const db = await openBackupDB();

 await new Promise((resolve, reject) => {

 const tx = db.transaction(BACKUP_DB_STORE, 'readwrite');

 tx.oncomplete = () => resolve();

 tx.onerror = () => reject(tx.error || new Error('Backup handle save failed'));

 tx.objectStore(BACKUP_DB_STORE).put(handle, BACKUP_HANDLE_KEY);

 });

 db.close();

}



async function idbGetBackupHandle() {

 const db = await openBackupDB();

 const handle = await new Promise((resolve, reject) => {

 const tx = db.transaction(BACKUP_DB_STORE, 'readonly');

 const req = tx.objectStore(BACKUP_DB_STORE).get(BACKUP_HANDLE_KEY);

 req.onsuccess = () => resolve(req.result || null);

 req.onerror = () => reject(req.error || new Error('Backup handle read failed'));

 });

 db.close();

 return handle;

}



async function ensureBackupFolderPermission(handle, write = true) {

 if (!handle || typeof handle.queryPermission !== 'function') return false;

 const mode = write ? 'readwrite' : 'read';

 const queried = await handle.queryPermission({ mode });

 if (queried === 'granted') return true;

 if (typeof handle.requestPermission !== 'function') return false;

 const requested = await handle.requestPermission({ mode });

 return requested === 'granted';

}



function formatBackupFileStamp(d = new Date()) {

 const pad = n => String(n).padStart(2, '0');

 return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

}



function setBackupStatus(msg, color = '') {

 const out = document.getElementById('backupSaveOK');

 if (!out) return;

 out.textContent = msg || '';

 out.style.color = color || '';

 clearTimeout(backupStatusTimer);

 if (msg) {

 backupStatusTimer = setTimeout(() => {

 out.textContent = '';

 out.style.color = '';

 }, 4500);

 }

}



function setBackupPathLabel(folderName) {

 const input = document.getElementById('sBackupPath');

 if (!input) return;

 const safeName = String(folderName || '').trim();

 input.value = safeName ? `${safeName} (full path hidden by Chrome)` : 'Not selected';

 input.dataset.folderName = safeName;

}



async function writeLocalBackup(reason = 'manual') {

 if (!isExternalBackupSupported()) {

 setBackupStatus('Local folder backup is not supported in this browser build.', '#ff4560');

 return { ok: false, error: 'not_supported' };

 }

 try {

 if (!backupDirHandle) {

 backupDirHandle = await idbGetBackupHandle();

 }

 if (!backupDirHandle) {

 setBackupStatus('Select a backup folder first.', '#ff4560');

 return { ok: false, error: 'no_folder' };

 }

 const allowed = await ensureBackupFolderPermission(backupDirHandle, true);

 if (!allowed) {

 setBackupStatus('Folder permission denied. Re-select folder.', '#ff4560');

 return { ok: false, error: 'permission_denied' };

 }

 const allData = await getRendererStorageSnapshot({ includeNativeJournal: true });

 const payload = {

 app: 'FWD TradeDesk Pro',

 version: '1',

 reason,

 exportedAt: new Date().toISOString(),

 data: allData,

 };

 const fileName = `${BACKUP_FILE_PREFIX}_${formatBackupFileStamp()}.json`;

 const fileHandle = await backupDirHandle.getFileHandle(fileName, { create: true });

 const writable = await fileHandle.createWritable();

 await writable.write(JSON.stringify(payload, null, 2));

 await writable.close();

 setBackupStatus(`OK Backup saved: ${fileName}`, '#00e5a0');

 return { ok: true, fileName };

 } catch (e) {

 const msg = e?.name === 'AbortError' ? 'Folder selection cancelled.' : `Backup failed: ${e.message || 'unknown error'}`;

 setBackupStatus(msg, '#ff4560');

 return { ok: false, error: e?.message || 'backup_failed' };

 }

}



async function archiveOldAlertsToLocal(reason = 'manual_archive') {

 if (archiveInFlight) return { ok: false, error: 'archive_in_flight' };

 archiveInFlight = true;

 try {

 if (!isExternalBackupSupported()) {

 setBackupStatus('Local folder archive is not supported in this browser build.', '#ff4560');

 return { ok: false, error: 'not_supported' };

 }

 const d = await storeGet(['externalBackup', 'alertHistory']);
 const ext = sanitizeExternalBackupConfig(d.externalBackup || {});

 const alerts = Array.isArray(d.alertHistory) ? d.alertHistory : [];
 const keepAlerts = sanitizeKeepAlerts(ext.keepAlerts);



 if (!ext.enabled) {

 setBackupStatus('Enable local backup first.', '#ff4560');

 return { ok: false, error: 'backup_disabled' };

 }

 if (alerts.length <= keepAlerts) {

 setBackupStatus(`No archive needed. Alerts in Chrome: ${alerts.length}/${keepAlerts}`, '#ffc840');

 return { ok: true, archived: 0 };

 }

 if (!backupDirHandle) backupDirHandle = await idbGetBackupHandle();

 if (!backupDirHandle) {

 setBackupStatus('Select a backup folder first.', '#ff4560');

 return { ok: false, error: 'no_folder' };

 }

 const allowed = await ensureBackupFolderPermission(backupDirHandle, true);

 if (!allowed) {

 setBackupStatus('Folder permission denied. Re-select folder.', '#ff4560');

 return { ok: false, error: 'permission_denied' };

 }



 const archiveChunk = alerts.slice(keepAlerts); // oldest entries

 const remaining = alerts.slice(0, keepAlerts);

 const newestArchived = archiveChunk[0]?.ts || null;

 const oldestArchived = archiveChunk[archiveChunk.length - 1]?.ts || null;

 const fileName = `${ALERT_ARCHIVE_FILE_PREFIX}_${formatBackupFileStamp()}.json`;

 const payload = {

 app: 'FWD TradeDesk Pro',

 version: '1',

 type: 'alerts_archive',

 reason,

 exportedAt: new Date().toISOString(),

 archivedCount: archiveChunk.length,

 keptInChrome: keepAlerts,

 archivedTsRange: {

 newest: newestArchived ? new Date(newestArchived).toISOString() : null,

 oldest: oldestArchived ? new Date(oldestArchived).toISOString() : null,

 },

 alerts: archiveChunk,

 };



 const fileHandle = await backupDirHandle.getFileHandle(fileName, { create: true });

 const writable = await fileHandle.createWritable();

 await writable.write(JSON.stringify(payload, null, 2));

 await writable.close();



 const nextExt = {

 ...ext,

 keepAlerts,

 totalArchived: Math.max(0, Number(ext.totalArchived || 0)) + archiveChunk.length,

 lastArchiveAt: Date.now(),

 lastArchiveFile: fileName,

 updatedAt: Date.now(),

 };

 await chrome.storage.local.set({ alertHistory: remaining, externalBackup: nextExt });
 setBackupStatus(`OK Archived ${archiveChunk.length} alerts to ${fileName}`, '#00e5a0');

 return { ok: true, archived: archiveChunk.length, fileName };

 } catch (e) {

 setBackupStatus(`Archive failed: ${e.message || 'unknown error'}`, '#ff4560');

 return { ok: false, error: e?.message || 'archive_failed' };

 } finally {

 archiveInFlight = false;

 }

}



// -- Session Badge (v14) ----------------------------------------

function getSessionInfo() {

 const h = new Date().getUTCHours();

 if (h >= 0 && h < 8) return { key: 'asia', label: 'Asia', title: 'Asia session' };

 if (h >= 8 && h < 13) return { key: 'london', label: 'London', title: 'London session' };

 if (h >= 13 && h < 22) return { key: 'newyork', label: 'New York', title: 'New York session' };

 return { key: 'closed', label: 'Late', title: 'Late session' };

}



function updateSessionBadge() {

 const el = document.getElementById('sessionBadge');

 if (!el) return;

 const s = getSessionInfo();

 el.textContent = s.label;
 el.title = s.title || 'Current market session';

 el.className = 'session-badge ' + s.key;

}



function applyTheme(theme) {
 void theme;
 document.body.setAttribute('data-theme', 'dark');
}

async function sendDesktopNativeMessageRaw(message = {}) {
 try {
 if (!window.fwdDesktopNative?.sendNativeMessage) return { ok: false, error: 'Desktop backup bridge is not available.' };
 return await window.fwdDesktopNative.sendNativeMessage(message);
 } catch (error) {
 return { ok: false, error: error?.message || 'Desktop backup bridge failed.' };
 }
}

async function exportFullAppBackup(reason = 'manual') {
 try {
 const rendererStorage = await getRendererStorageSnapshot({ includeNativeJournal: false });
 const response = await sendDesktopNativeMessageRaw({
 type: 'app_backup_export',
 reason,
 rendererStorage,
 });
 if (!response?.ok) {
 if (response?.canceled) {
 setBackupStatus('Full backup cancelled.', '#ffc840');
 return response;
 }
 setBackupStatus(`Full backup failed: ${response?.error || 'unknown error'}`, '#ff4560');
 return response || { ok: false, error: 'backup_failed' };
 }
 const summary = response.summary || {};
 const candleRows = Number(summary.candleRows || 0);
 setBackupStatus(candleRows > 0
 ? `OK Full backup saved: ${response.fileName || 'backup file'} (${Number(summary.candleFiles || 0)} candle files, ${candleRows} rows)`
 : `Backup saved but candle history is empty. Start 1D + 15M backfill before laptop migration.`, candleRows > 0 ? '#00e5a0' : '#ffc840');
 return response;
 } catch (error) {
 setBackupStatus(`Full backup failed: ${error?.message || 'unknown error'}`, '#ff4560');
 return { ok: false, error: error?.message || 'backup_failed' };
 }
}

async function exportReleaseDiagnostics(reason = 'manual') {
 const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
 try {
  const [rendererStorage, nativeStats, nativeErrors, candleStats] = await Promise.all([
   getRendererStorageSnapshot({ includeNativeJournal: false }).catch(error => ({ error: error?.message || 'renderer storage failed' })),
   sendDesktopNativeMessageRaw({ type: 'performance_native_stats' }).catch(error => ({ ok: false, error: error?.message || 'native stats failed' })),
   sendDesktopNativeMessageRaw({ type: 'error_journal_get', limit: 80 }).catch(error => ({ ok: false, error: error?.message || 'error journal failed' })),
   sendDesktopNativeMessageRaw({ type: 'candle_stats' }).catch(error => ({ ok: false, error: error?.message || 'candle stats failed' })),
  ]);
  const debugLog = await new Promise(resolve => {
   try {
    chrome.runtime.sendMessage({ action: 'getDebug' }, logs => resolve(Array.isArray(logs) ? logs.slice(-300) : []));
   } catch (_) {
    resolve([]);
   }
  });
  const diagnostics = {
   app: {
    name: 'FWD TradeDesk Pro',
    version: '0.1.0',
    reason,
    exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    href: location.href,
    desktopMode: !!isDesktopMode,
    activeWorkspaceTab,
    workspaceGroup,
   },
   nativeStats,
   candleStats,
   nativeErrors,
   debugLog,
   rendererStorageSummary: {
    keys: Object.keys(rendererStorage || {}).sort(),
    scanResults: Array.isArray(rendererStorage?.scanResults) ? rendererStorage.scanResults.length : 0,
    alerts: Array.isArray(rendererStorage?.alerts) ? rendererStorage.alerts.length : 0,
    alertHistory: Array.isArray(rendererStorage?.alertHistory) ? rendererStorage.alertHistory.length : 0,
    watchlist: Array.isArray(rendererStorage?.watchlist) ? rendererStorage.watchlist.length : 0,
    hasStrategy: !!rendererStorage?.strategy,
    hasOptionsState: !!rendererStorage?.dsOptionsWorkspaceStateV17,
    hasChartState: !!rendererStorage?.dsDetachedChartStateV17,
   },
  };
  const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fwd-tradedesk-pro-diagnostics-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { ok: true, fileName: a.download, diagnostics };
 } catch (error) {
  return { ok: false, error: error?.message || 'diagnostics_export_failed' };
 }
}

async function importFullAppBackup() {
 try {
 const response = await sendDesktopNativeMessageRaw({ type: 'app_backup_import', mode: 'merge' });
 if (!response?.ok) {
 if (response?.canceled) {
 setBackupStatus('Restore cancelled.', '#ffc840');
 return response;
 }
 setBackupStatus(`Restore failed: ${response?.error || 'unknown error'}`, '#ff4560');
 return response || { ok: false, error: 'restore_failed' };
 }
 const rendererStorage = response.rendererStorage && typeof response.rendererStorage === 'object' ? response.rendererStorage : {};
 if (Object.keys(rendererStorage).length) {
 const nativeRendererKeys = Object.fromEntries(Object.entries(rendererStorage).filter(([key]) => NATIVE_JOURNAL_KEYS.has(key)));
 const localRendererKeys = omitStorageKeys(rendererStorage, new Set(Object.keys(nativeRendererKeys)));
 await writeNativeJournalValues(nativeRendererKeys);
 await chrome.storage.local.set({
 ...localRendererKeys,
 restoredBackupAt: Date.now(),
 restoredBackupFile: response.fileName || '',
 });
 await removeLocalStorageKeys(Object.keys(nativeRendererKeys));
 }
 const summary = response.summary || {};
 setBackupStatus(`OK Backup restored: ${Number(summary.rendererKeys || 0)} settings, ${Number(summary.candleFiles || 0)} candle files. Restart app to reload all restored data.`, '#00e5a0');
 return response;
 } catch (error) {
 setBackupStatus(`Restore failed: ${error?.message || 'unknown error'}`, '#ff4560');
 return { ok: false, error: error?.message || 'restore_failed' };
 }
}

function formatCandleHistoryStatus(response = {}) {
 if (!response?.ok) return `History status unavailable: ${response?.error || 'unknown error'}`;
 const byStatus = response.byStatus || {};
 const done = Number(byStatus.complete || 0);
 const running = Number(byStatus.running || 0);
 const failed = Number(byStatus.failed || 0);
 const pending = Number(byStatus.pending || 0);
 const total = Number(response.taskCount || 0);
 const rows = Number(response.rows || 0);
 const universe = Number(response.universeCount || 0);
 return `History ${response.status || 'idle'} | coins ${universe} | tasks ${done}/${total} complete, ${running} running, ${pending} pending, ${failed} failed | rows ${rows}`;
}

async function refreshCandleHistoryStatus() {
 const out = document.getElementById('candleHistoryStatus');
 if (!out) return null;
 const response = await sendDesktopNativeMessageRaw({ type: 'candle_history_status' });
 out.textContent = formatCandleHistoryStatus(response);
 out.className = `save-ok ${response?.ok && response.status === 'running' ? 'good' : response?.ok && response.status === 'complete' ? 'good' : response?.ok ? '' : 'bad'}`;
 return response;
}

async function startCandleHistoryBackfill() {
 const out = document.getElementById('candleHistoryStatus');
 if (out) out.textContent = 'Starting 1D and 15M perpetual-coin backfill...';
 const response = await sendDesktopNativeMessageRaw({ type: 'candle_history_start' });
 if (out) out.textContent = formatCandleHistoryStatus(response);
 return response;
}

async function pauseCandleHistoryBackfill() {
 const response = await sendDesktopNativeMessageRaw({ type: 'candle_history_pause' });
 const out = document.getElementById('candleHistoryStatus');
 if (out) out.textContent = formatCandleHistoryStatus(response);
 return response;
}

async function loadTheme() {
 await storeRemove(['uiTheme']);
 applyTheme('dark');
}

function setDesktopZoomMode(enabled, persist = true) {
 desktopZoomMode = !!enabled;
 document.body.classList.toggle('desktop-zoom-out', isDesktopMode && desktopZoomMode);
 const btn = document.getElementById('btnDesktopZoom');
 if (btn) {
 btn.classList.toggle('active', desktopZoomMode);
 btn.textContent = desktopZoomMode ? 'Full View' : 'Compact View';
 btn.title = desktopZoomMode ? 'Restore full workspace scale' : 'Use compact workspace scale';
 }
 if (persist) chrome.storage.local.set({ desktopZoomMode });
}


function applyStoredFilterUi() {

 document.querySelectorAll('#scannerPresets .preset-btn').forEach(btn => {

 btn.classList.toggle('active', (btn.dataset.preset || '') === scannerPreset);

 });

 document.querySelectorAll('#scannerSessions .preset-btn').forEach(btn => {

 btn.classList.toggle('active', (btn.dataset.session || '') === scannerSessionFilter);

 });

 document.querySelectorAll('#alertSortRow .bsm').forEach(btn => {

 btn.classList.toggle('active', (btn.dataset.alertSort || 'portfolio') === alertSortMode);

 });

 setWorkspaceFocusMode(workspaceFocusMode, false);

}



// -- Boot -------------------------------------------------------

function buildDeltaTradeUrl(symbol, region = desktopApiRegion) {
 const productSymbol = String(symbol || '').toUpperCase().trim();
 const assetSymbol = normalizeBaseSymbol(productSymbol);
 const safeProduct = encodeURIComponent(productSymbol);
 const safeAsset = encodeURIComponent(assetSymbol);
 const host = String(region || '').toLowerCase() === 'global'
 ? 'https://global.delta.exchange'
 : 'https://www.delta.exchange';
 if (!safeProduct) return host;
 if (!safeAsset) return `${host}/app/futures/trade/${safeProduct}`;
 return `${host}/app/futures/trade/${safeAsset}/${safeProduct}`;
}

function closeModal() {
 const overlay = document.getElementById('overlay');
 if (overlay) overlay.style.display = 'none';
}

function buildModalFold(label, copy, body, opts = {}) {
 if (!String(body || '').trim()) return '';
 const openAttr = opts.open ? ' open' : '';
 return `<details class="mo-fold"${openAttr}>
 <summary class="mo-fold-sum">
 <div class="mo-fold-title">
 <span class="mo-fold-label">${esc(label)}</span>
 <span class="mo-fold-copy">${esc(copy || '')}</span>
 </div>
 <span class="mo-fold-caret">v</span>
 </summary>
 <div class="mo-fold-body">${body}</div>
 </details>`;
}

function seedRiskCalculatorFromSignal(signal) {
 const entry = toPosNum(signal?.entry || signal?.price);
 const sl = toPosNum(signal?.sl);
 if (!entry || !sl) return false;
 const entryEl = document.getElementById('rcEntry');
 const slEl = document.getElementById('rcSL');
 if (!entryEl || !slEl) return false;
 entryEl.value = String(entry);
 slEl.value = String(sl);
 globalThis.activateV16RiskBridge?.(signal);
 calcRisk();
 return true;
}

async function refreshCurrentModalSignal() {
 const symbol = sanitizeAnalyticsSymbol(currentModal?.symbol || '');
 if (!symbol) return;
 chrome.runtime.sendMessage({ action: 'refreshSymbol', symbol }, async (resp) => {
 if (resp?.ok && resp.result) {
 currentModal = resp.result;
 openModal(resp.result);
 if (document.getElementById('pane-watchlist')?.classList.contains('active')) {
 await (globalThis.scheduleWorkspaceTabRender?.('watchlist') || renderWatchlist());
 }
 if (document.getElementById('pane-scanner')?.classList.contains('active')) {
 await (globalThis.scheduleWorkspaceTabRender?.('scanner') || renderScanner());
 }
 }
 });
}

function buildSignalModalBody(r) {
 const score = Number(r?.score || 0);
 const scoreColor = score >= 80 ? '#00e5a0' : score >= 60 ? '#ffc840' : '#ff4560';
 const daily = r?.daily || {};
 const lower = r?.lower || {};
 const fundingRate = Number(r?.fundingRate || 0);
 const fundingText = fundingRate !== 0
 ? `${fundingRate > 0 ? '+' : ''}${fundingRate.toFixed(4)}% ${fundingRate > 0 ? '(longs pay - bearish)' : '(shorts pay - bullish)'}`
 : '0%';
 const sector = normalizeSectorLabel(r?.sector || getSector(r?.symbol));
 const isBull = String(r?.direction || '').includes('long');
 const emerging = r?.emergingMove || null;
 const tier = String(r?.alertTier || (score >= 75 ? 'execute' : score >= 60 ? 'setup' : 'watch')).toUpperCase();
 const actionTone = score >= 75 && r?.mtfConfirmed ? 'ok' : score >= 60 ? 'warn' : 'fail';
 const actionText = score >= 75 && r?.mtfConfirmed
 ? 'Executable now'
 : score >= 60
 ? 'Setup forming'
 : 'Monitor only';
 const isPinned = Array.isArray(currentWatchlist) && currentWatchlist.includes(r?.symbol);
 const thesisList = Array.isArray(r?.reasons) && r.reasons.length
 ? r.reasons.slice(0, 3).map(esc)
 : [
 `${r?.mtfConfirmed ? 'MTF confirmed' : 'Single timeframe'} ${isBull ? 'long' : 'short'} setup`,
 `Sector: ${esc(sector)}`,
 `Funding: ${esc(fundingText)}`,
 ];
 const confirmParts = [
 r?.mtfConfirmed ? 'MTF confirmed' : 'Awaiting full MTF alignment',
 daily?.emaBull ? '1D bullish bias' : daily?.emaBear ? '1D bearish bias' : '1D bias neutral',
 r?.spike ? 'Volume spike' : '',
 r?.btcCorr != null ? (Number(r.btcCorr) > 0.85 ? 'BTC-led move' : 'Independent move') : '',
 ].filter(Boolean);
 const invalidationText = isBull
 ? `Fails below $${fmtPrice(r?.sl)}`
 : `Fails above $${fmtPrice(r?.sl)}`;
 const triggerText = thesisList.join(' | ');
 const heroHTML = `
 <div class="mo-hero">
 <div class="mo-hero-top">
 <div class="mo-score-block">
 <div class="mo-score-val" style="color:${scoreColor}">${score}/100${score >= 80 ? ' Hot' : ''}</div>
 <div class="mo-score-copy">${r?.mtfConfirmed ? 'MTF confirmed' : 'Partial confirmation'} | ${esc(String(r?.direction || '').toUpperCase())} | ${esc(sector)}${r?.session ? ' | ' + esc(String(r.session).toUpperCase()) : ''}</div>
 </div>
 <div class="mo-hero-tags">
 <span class="mo-tag ${actionTone}">${actionText}</span>
 <span class="mo-tag info">${esc(tier)}</span>
 <span class="mo-tag ${Number(r?.rr || 0) >= 2 ? 'ok' : 'warn'}">R:R 1:${Number(r?.rr || 0)}</span>
 <span class="mo-tag ${fundingRate > 0.05 ? 'fail' : fundingRate < -0.05 ? 'ok' : 'warn'}">${fundingRate !== 0 ? `${fundingRate > 0 ? '+' : ''}${fundingRate.toFixed(4)}% FR` : 'Funding Flat'}</span>
 <span class="mo-tag info">${timeAgo(r?.ts || Date.now())}</span>
 </div>
 </div>
 <div class="mo-hero-grid">
 <div class="mo-hero-card"><span>Entry</span><b>$${fmtPrice(r?.entry)}</b></div>
 <div class="mo-hero-card"><span>Stop</span><b style="color:#ff6b84">$${fmtPrice(r?.sl)}</b></div>
 <div class="mo-hero-card"><span>Target</span><b style="color:#00e5a0">$${fmtPrice(r?.tp1)}</b></div>
 <div class="mo-hero-card"><span>24h Change</span><b style="color:${Number(r?.change24h || 0) >= 0 ? '#00e5a0' : '#ff6b84'}">${Number(r?.change24h || 0) >= 0 ? '+' : ''}${Number(r?.change24h || 0).toFixed(2)}%</b></div>
 </div>
 ${emerging ? `<div class="mo-emerging ${emerging.side === 'short' ? 'short' : 'long'}">
 <div class="mo-emerging-kicker">${esc(emerging.mode === 'reversal' ? 'Emerging Reversal' : 'Trend Ignition')} | ${esc(String(emerging.strength || '').toUpperCase())}</div>
 <div class="mo-emerging-title">${esc(emerging.label || '')}</div>
 <div class="mo-emerging-copy">${esc(emerging.note || '')}${Array.isArray(emerging.factors) && emerging.factors.length ? ' | ' + esc(emerging.factors.join(' | ')) : ''}</div>
 </div>` : ''}
 <div class="mo-brief-grid">
 <div class="mo-brief">
 <div class="mo-brief-label">Why Now</div>
 <div class="mo-brief-copy">${triggerText}</div>
 </div>
 <div class="mo-brief">
 <div class="mo-brief-label">Invalidation</div>
 <div class="mo-brief-copy">${invalidationText} | ATR guide in the trade plan below.</div>
 </div>
 <div class="mo-brief">
 <div class="mo-brief-label">Confirmation</div>
 <div class="mo-brief-copy">${confirmParts.slice(0, 3).join(' | ')}</div>
 </div>
 <div class="mo-brief">
 <div class="mo-brief-label">Execution Note</div>
 <div class="mo-brief-copy">${actionText} based on score, timeframe alignment, and current signal quality.</div>
 </div>
 </div>
 <div class="mo-actions">
 <button class="mo-action-btn ${isPinned ? 'warn' : 'primary'}" id="moToggleWatch">${isPinned ? 'Remove Watch' : 'Add Watch'}</button>
 <button class="mo-action-btn" id="moToRisk">Send To Risk</button>
 <button class="mo-action-btn" id="moRefreshSignal">Refresh Signal</button>
 </div>
 </div>`;

 const vwapSource = lower?.vwap != null ? lower : daily?.vwap != null ? daily : null;
 const vwapHTML = vwapSource?.vwap != null ? `
 <div class="mo-section">VWAP ANALYSIS</div>
 <div class="mo-row"><span class="mo-label">${esc(vwapSource.label || '15m')} VWAP</span><span class="mo-val">$${fmtPrice(vwapSource.vwap)}</span></div>
 <div class="mo-row"><span class="mo-label">Price vs VWAP</span><span class="mo-val" style="color:${vwapSource.vwapAbove ? '#00e5a0' : '#ff4560'}">${vwapSource.vwapAbove ? 'Above VWAP - bullish' : 'Below VWAP - bearish'}</span></div>` : '';

 const volumeProfile = daily?.volumeProfile;
 const volumeProfileHTML = volumeProfile ? `
 <div class="mo-section">VOLUME PROFILE</div>
 <div class="mo-row"><span class="mo-label">POC (Point of Control)</span><span class="mo-val">$${fmtPrice(volumeProfile.poc)}</span></div>
 <div class="mo-row"><span class="mo-label">Value Area High</span><span class="mo-val">$${fmtPrice(volumeProfile.vah)}</span></div>
 <div class="mo-row"><span class="mo-label">Value Area Low</span><span class="mo-val">$${fmtPrice(volumeProfile.val)}</span></div>
 <div class="mo-row"><span class="mo-label">Price vs Value Area</span><span class="mo-val" style="color:${volumeProfile.priceVsVA === 'above VA' ? '#00e5a0' : volumeProfile.priceVsVA === 'below VA' ? '#ff4560' : '#ffc840'}">${esc(volumeProfile.priceVsVA || 'inside')}</span></div>` : '';

 const sentiment = r?.sentiment;
 const sentimentHTML = sentiment ? `
 <div class="mo-section">SENTIMENT ANALYSIS</div>
 <div class="mo-row"><span class="mo-label">Sentiment Score</span><span class="mo-val" style="color:${sentiment.score > 0 ? '#00e5a0' : sentiment.score < 0 ? '#ff4560' : '#ffc840'}">${sentiment.score > 0 ? '+' : ''}${sentiment.score}</span></div>
 <div class="mo-row"><span class="mo-label">Verdict</span><span class="mo-val" style="color:${sentiment.label === 'bullish' ? '#00e5a0' : sentiment.label === 'bearish' ? '#ff4560' : '#ffc840'}">${esc(String(sentiment.label || '').toUpperCase())}</span></div>` : '';

 const oiHTML = (r?.oiSpike || r?.oiConfirmed || r?.shortsCovering) ? `
 <div class="mo-section">OPEN INTEREST ANALYSIS</div>
 <div class="mo-row"><span class="mo-label">OI Change</span><span class="mo-val" style="color:${Number(r?.oiChangePct || 0) > 0 ? '#00e5a0' : '#ff4560'}">${Number(r?.oiChangePct || 0) > 0 ? '+' : ''}${Number(r?.oiChangePct || 0)}%</span></div>
 ${r?.oiConfirmed ? '<div class="mo-row"><span class="mo-label">Signal</span><span class="mo-val" style="color:#00e5a0">OI + Price Rising - Real Conviction</span></div>' : ''}
 ${r?.shortsCovering ? '<div class="mo-row"><span class="mo-label">Signal</span><span class="mo-val" style="color:#ffc840">Shorts Covering</span></div>' : ''}` : '';

 const corrHTML = r?.btcCorr != null ? `
 <div class="mo-section">BTC CORRELATION</div>
 <div class="mo-row"><span class="mo-label">Pearson Corr</span><span class="mo-val" style="color:${Number(r.btcCorr) > 0.85 ? '#ff4560' : Number(r.btcCorr) > 0.6 ? '#ffc840' : '#00e5a0'}">${Number(r.btcCorr) > 0 ? '+' : ''}${Number(r.btcCorr).toFixed(3)}</span></div>
 <div class="mo-row"><span class="mo-label">Verdict</span><span class="mo-val" style="font-size:11px">${Number(r.btcCorr) > 0.85 ? 'BTC-driven move' : Number(r.btcCorr) > 0.6 ? 'Moderate correlation' : 'Independent setup'}</span></div>` : '';

 const marketStructure = daily?.marketStructure;
 const msHTML = marketStructure ? `
 <div class="mo-section">MARKET STRUCTURE (v14)</div>
 <div class="mo-row"><span class="mo-label">Structure</span><span class="mo-val" style="color:${marketStructure.bullish ? '#00e5a0' : marketStructure.bearish ? '#ff4560' : '#ffc840'}">${typeof msIcon === 'function' ? msIcon(marketStructure.structure) + ' ' : ''}${esc(String(marketStructure.structure || '').toUpperCase())}</span></div>
 ${Array.isArray(marketStructure.swingHighs) && marketStructure.swingHighs.length ? `<div class="mo-row"><span class="mo-label">Swing Highs</span><span class="mo-val">$${marketStructure.swingHighs.map(fmtPrice).join(', $')}</span></div>` : ''}
 ${Array.isArray(marketStructure.swingLows) && marketStructure.swingLows.length ? `<div class="mo-row"><span class="mo-label">Swing Lows</span><span class="mo-val">$${marketStructure.swingLows.map(fmtPrice).join(', $')}</span></div>` : ''}` : '';

 const kl1D = typeof getTFKeyLevels === 'function' ? getTFKeyLevels(r?.keyLevels, '1D') : { resistance: [], support: [] };
 const kl15m = typeof getTFKeyLevels === 'function' ? getTFKeyLevels(r?.keyLevels, '15m') : { resistance: [], support: [] };
 const formatLevels = typeof formatKeyLevelList === 'function'
 ? formatKeyLevelList
 : (levels = []) => Array.isArray(levels) && levels.length ? levels.map(v => `$${fmtPrice(v)}`).join(', ') : '-';
 const keyLevelsHTML = `
 <div class="mo-section">KEY LEVELS (SUPPORT / RESISTANCE)</div>
 <div class="mo-row"><span class="mo-label">1D Resistance</span><span class="mo-val">${formatLevels(kl1D.resistance)}</span></div>
 <div class="mo-row"><span class="mo-label">1D Support</span><span class="mo-val">${formatLevels(kl1D.support)}</span></div>
 <div class="mo-row"><span class="mo-label">15m Resistance</span><span class="mo-val">${formatLevels(kl15m.resistance)}</span></div>
 <div class="mo-row"><span class="mo-label">15m Support</span><span class="mo-val">${formatLevels(kl15m.support)}</span></div>`;

 const volumeClimax = daily?.volumeClimax;
 const volumeClimaxHTML = volumeClimax?.isClimax ? `
 <div class="mo-section">VOLUME CLIMAX (v14)</div>
 <div class="mo-row"><span class="mo-label">Volume Ratio</span><span class="mo-val" style="color:#ff8c00">${esc(String(volumeClimax.volumeRatio || ''))}x avg</span></div>
 <div class="mo-row"><span class="mo-label">Type</span><span class="mo-val" style="color:${volumeClimax.exhaustion ? '#ffc840' : volumeClimax.isBuyingClimax ? '#00e5a0' : '#ff4560'}">${volumeClimax.exhaustion ? 'Exhaustion' : volumeClimax.isBuyingClimax ? 'Buying Climax' : 'Selling Climax'}</span></div>` : '';

 const entryPrice = Number(r?.entry || r?.price || 0);
 const atrValue = Number(daily?.atr || lower?.atr || (entryPrice * 0.02) || 0);
 const initialSL = Number(r?.sl || (isBull ? entryPrice - (atrValue * 1.5) : entryPrice + (atrValue * 1.5)) || 0);
 const initialTP = Number(r?.tp1 || (isBull ? entryPrice + (atrValue * 3) : entryPrice - (atrValue * 3)) || 0);
 const slMin = isBull ? +(entryPrice - atrValue * 6).toFixed(6) : +(entryPrice + 0.0001).toFixed(6);
 const slMax = isBull ? +(entryPrice - 0.0001).toFixed(6) : +(entryPrice + atrValue * 6).toFixed(6);
 const tpMin = isBull ? +(entryPrice + 0.0001).toFixed(6) : +(entryPrice - atrValue * 8).toFixed(6);
 const tpMax = isBull ? +(entryPrice + atrValue * 8).toFixed(6) : +(entryPrice - 0.0001).toFixed(6);
 const sliderStep = +(atrValue * 0.05).toFixed(6) || 0.0001;
 const rrHTML = entryPrice > 0 ? `
 <div class="mo-section">INTERACTIVE R:R CALCULATOR</div>
 <div class="rri-wrap">
 <div class="rri-info">Drag sliders to customise SL/TP</div>
 <div class="rri-row"><span class="rri-label">Stop Loss</span>
 <input type="range" class="rri-slider sl-slider" id="rrSlSL" min="${slMin}" max="${slMax}" step="${sliderStep}" value="${initialSL}"/>
 <span class="rri-val red" id="rrSlVal">$${fmtPrice(initialSL)}</span></div>
 <div class="rri-row"><span class="rri-label">Take Profit</span>
 <input type="range" class="rri-slider tp-slider" id="rrSlTP" min="${tpMin}" max="${tpMax}" step="${sliderStep}" value="${initialTP}"/>
 <span class="rri-val green" id="rrTpVal">$${fmtPrice(initialTP)}</span></div>
 <div class="rri-result">
 <div class="rri-rr-display">R:R = 1:<span id="rrLive" class="rri-rr-num">-</span></div>
 <div class="rri-advice" id="rrAdvice">-</div>
 </div>
 <div class="rri-ref">Entry: <b>$${fmtPrice(entryPrice)}</b> | Direction: <b>${esc(String(r?.direction || '').toUpperCase())}</b> | ATR: <b>${fmtPrice(atrValue)}</b></div>
 </div>` : '';

 const scoreHTML = (label, tf) => {
 if (!tf) return '';
 const pts = tf.pts || {};
 const vwapMax = Number.isFinite(pts.vwapMax) ? pts.vwapMax : 10;
 const bias = tf.emaBull ? 'BULLISH' : tf.emaBear ? 'BEARISH' : 'NEUTRAL';
 const biasColor = tf.emaBull ? '#00e5a0' : tf.emaBear ? '#ff4560' : '#7a8ab0';
 const msText = tf.marketStructure?.structure ? String(tf.marketStructure.structure).toUpperCase() : 'N/A';
 return `
 <div style="font-size:11px;color:#7a8ab0;margin:8px 0 4px;font-weight:700">${esc(label)}</div>
 <div class="score-bk">
 <div class="sb-item"><span class="sb-label">Bias</span><span class="sb-val" style="color:${biasColor}">${bias}</span></div>
 <div class="sb-item"><span class="sb-label">Structure</span><span class="sb-val">${esc(msText)}</span></div>
 <div class="sb-item"><span class="sb-label">EMA Align</span><span class="sb-val">${Number(pts.ema || 0)}/25</span></div>
 <div class="sb-item"><span class="sb-label">OBV</span><span class="sb-val">${Number(pts.obv || 0)}/15</span></div>
 <div class="sb-item"><span class="sb-label">RSI (${Number(tf.rsi || 0) || '-'})</span><span class="sb-val">${Number(pts.rsi || 0)}/15</span></div>
 <div class="sb-item"><span class="sb-label">VWAP</span><span class="sb-val">${Number(pts.vwap || 0)}/${vwapMax}</span></div>
 <div class="sb-item"><span class="sb-label">Structure Pts</span><span class="sb-val">${Number(pts.structure || 0)}/12</span></div>
 <div class="sb-item"><span class="sb-label">Trend</span><span class="sb-val">${Number(pts.trend || 0)}/8</span></div>
 <div class="sb-item"><span class="sb-label">MACD</span><span class="sb-val">${Number(pts.macd || 0)}/10</span></div>
 ${pts.bonuses ? `<div class="sb-item" style="background:rgba(255,200,64,.06)"><span class="sb-label">Bonuses</span><span class="sb-val">+${typeof pts.bonuses === 'number' ? pts.bonuses : 0}</span></div>` : ''}
 <div class="sb-item" style="background:rgba(0,229,192,.06)"><span class="sb-label">Total</span><span class="sb-val">${Number(tf.score || 0)}/100</span></div>
 </div>`;
 };

 const sparkSection = typeof buildSparklineSVG === 'function' && r?.sparkline
 ? `<div class="mo-section">PRICE SPARKLINE (20 candles)</div>${buildSparklineSVG(r.sparkline, r.direction)}`
 : '';
 const historyHTML = typeof buildSignalHistorySection === 'function' ? buildSignalHistorySection(r?.symbol) : '';
 const orderbookHTML = typeof loadOrderbookLite === 'function'
 ? `<div class="mo-section">ORDERBOOK WALLS (LITE)</div><div class="ob-lite" id="obLiteRows"><div class="ob-empty">Loading orderbook...</div></div>`
 : '';
 const marketDataBody = `
 ${sparkSection}
 <div class="mo-row"><span class="mo-label">Price</span><span class="mo-val">$${fmtPrice(r?.price)}</span></div>
 <div class="mo-row"><span class="mo-label">24h Change</span><span class="mo-val" style="color:${Number(r?.change24h || 0) >= 0 ? '#00e5a0' : '#ff4560'}">${Number(r?.change24h || 0) >= 0 ? '+' : ''}${Number(r?.change24h || 0).toFixed(2)}%</span></div>
 <div class="mo-row"><span class="mo-label">Volume 24h</span><span class="mo-val">$${typeof fmtLarge === 'function' ? fmtLarge(r?.volume24h) : fmtPrice(r?.volume24h)}</span></div>
 <div class="mo-row"><span class="mo-label">Open Interest</span><span class="mo-val">$${typeof fmtLarge === 'function' ? fmtLarge(r?.oi) : fmtPrice(r?.oi)}</span></div>
 <div class="mo-row"><span class="mo-label">Funding Rate</span><span class="mo-val" style="color:${fundingRate > 0 ? '#ff4560' : fundingRate < 0 ? '#00e5a0' : '#7a8ab0'}">${esc(fundingText)}</span></div>
 <div class="mo-row"><span class="mo-label">Sector</span><span class="mo-val">${esc(sector)}</span></div>`;

 const ladderLevels = [
 { label: 'T1', price: Number(r?.tp1 || 0), note: 'Active target on entry' },
 { label: 'T2', price: Number(r?.tp2 || 0), note: 'Auto-shift target after T1 nears' },
 { label: 'T3', price: Number(r?.tp3 || 0), note: 'Auto-shift target after T2 nears' },
 { label: 'T4', price: Number(r?.tp4 || 0), note: 'Final capped target' },
 ].filter(level => level.price > 0);
 const targetLines = [
 Number(r?.tp1 || 0) > 0 ? `<b>TP1</b> <span style="color:#00e5a0">$${fmtPrice(r.tp1)}</span>` : '',
 Number(r?.tp2 || 0) > 0 ? `<b>TP2</b> <span style="color:#00e5a0">$${fmtPrice(r.tp2)}</span>` : '',
 Number(r?.tp3 || 0) > 0 ? `<b>TP3</b> <span style="color:#00e5a0">$${fmtPrice(r.tp3)}</span>` : '',
 Number(r?.tp4 || 0) > 0 ? `<b>TP4</b> <span style="color:#00e5a0">$${fmtPrice(r.tp4)}</span>` : '',
 ].filter(Boolean).join('<br/>');
 const ladderGrid = ladderLevels.length ? `
 <div class="mo-decision-grid">
 ${ladderLevels.map((level, index) => `<div><span>${level.label}</span><strong>$${fmtPrice(level.price)}</strong><small>${index === 0 ? level.note : `${level.note} | capped ladder`}</small></div>`).join('')}
 </div>` : '';
 const postEntryRules = [
 Number(r?.tp2 || 0) > 0 ? 'Near T1 -> move target to T2 and stop to Entry' : '',
 Number(r?.tp3 || 0) > 0 ? 'Near T2 -> move target to T3 and stop to T1' : '',
 Number(r?.tp4 || 0) > 0 ? 'Near T3 -> move target to T4 and stop to T2' : '',
 ].filter(Boolean);
 const tradePlanBody = `
 <div class="mo-plan">
 <b>Entry</b> $${fmtPrice(r?.entry)}<br/>
 <b>Stop Loss</b> <span style="color:#ff4560">$${fmtPrice(r?.sl)}</span> (1.5x ATR)<br/>
 ${targetLines}<br/>
 <b>R:R</b> 1:${Number(r?.rr || 0)} | <b>Direction</b> ${esc(String(r?.direction || '').toUpperCase())}
 </div>
 ${ladderGrid}
 <div class="mo-decision-reasons">
 ${postEntryRules.length
 ? postEntryRules.map(rule => `<div>${esc(rule)}</div>`).join('')
 : '<div>No post-entry auto-shift ladder is configured for this signal.</div>'}
 </div>
 ${rrHTML}`;

 const dailyBias = daily?.emaBull ? 'Bullish' : daily?.emaBear ? 'Bearish' : 'Neutral';
 const lowerBias = lower?.emaBull ? 'Bullish' : lower?.emaBear ? 'Bearish' : 'Neutral';
 const dailyIndicators = [
 daily?.emaBull ? 'EMA trend up' : daily?.emaBear ? 'EMA trend down' : 'EMA mixed',
 daily?.vwapAbove === true ? 'Above VWAP' : daily?.vwapAbove === false ? 'Below VWAP' : '',
 Number.isFinite(Number(daily?.rsi)) ? `RSI ${Number(daily.rsi).toFixed(1)}` : '',
 daily?.macdBull ? 'MACD bull' : daily?.macdBear ? 'MACD bear' : '',
 ].filter(Boolean).join(' | ') || 'Daily indicators not available';
 const lowerIndicators = [
 lower?.emaBull ? 'EMA trend up' : lower?.emaBear ? 'EMA trend down' : 'EMA mixed',
 lower?.vwapAbove === true ? 'Above VWAP' : lower?.vwapAbove === false ? 'Below VWAP' : '',
 Number.isFinite(Number(lower?.rsi)) ? `RSI ${Number(lower.rsi).toFixed(1)}` : '',
 lower?.macdBull ? 'MACD bull' : lower?.macdBear ? 'MACD bear' : '',
 ].filter(Boolean).join(' | ') || '15m indicators not available';
 const timeframeBody = `
 <div class="mo-row"><span class="mo-label">1D Score</span><span class="mo-val">${Number(daily?.score || 0)}/100 | ${dailyBias}</span></div>
 <div class="mo-row"><span class="mo-label">15m Score</span><span class="mo-val">${Number(lower?.score || 0)}/100 | ${lowerBias}</span></div>
 <div class="mo-row"><span class="mo-label">MTF Status</span><span class="mo-val">${r?.mtfConfirmed ? 'Confirmed across 1D and 15m' : 'Partial alignment, wait for confirmation'}</span></div>
 <div class="mo-row"><span class="mo-label">1D Indicators</span><span class="mo-val">${esc(dailyIndicators)}</span></div>
 <div class="mo-row"><span class="mo-label">15m Indicators</span><span class="mo-val">${esc(lowerIndicators)}</span></div>
 <div class="mo-row"><span class="mo-label">Trigger Context</span><span class="mo-val">${r?.spike ? 'Volume spike present' : 'No volume spike'} | ${r?.oiConfirmed ? 'OI confirmed' : 'OI neutral'} | ${esc(fundingText)}</span></div>`;

 const technicalBody = [vwapHTML, volumeProfileHTML, msHTML, keyLevelsHTML, volumeClimaxHTML, oiHTML, corrHTML, sentimentHTML]
 .filter(Boolean)
 .join('');
 const evidenceBody = [historyHTML, orderbookHTML].filter(Boolean).join('');
 const scoreBody = `${scoreHTML('DAILY (1D)', daily)}${scoreHTML('15M TRIGGER', lower)}`;
 const folds = [
 buildModalFold('Signal Breakdown', 'Daily score, 15m trigger, and key indicators.', timeframeBody, { open: false }),
 buildModalFold('Trade Plan', 'Entry, stop, targets, and adjustable reward-to-risk.', tradePlanBody, { open: true }),
 '<div id="v16SignalDecisionBlock"></div>',
 buildModalFold('Market Data', 'Latest snapshot, price context, and session-level freshness.', marketDataBody, { open: false }),
 buildModalFold('Technical Drivers', 'Trend, VWAP, profile, structure, crowding, and correlations.', technicalBody, { open: false }),
 evidenceBody ? buildModalFold('Evidence Trail', 'Signal history and lightweight orderbook context.', evidenceBody, { open: false }) : '',
 buildModalFold('Score Breakdown', 'Full component scoring by timeframe.', scoreBody, { open: false }),
 ].filter(Boolean).join('');
 return `${heroHTML}${folds}`;
}

function closePreTradeChecklist() {
 const overlay = document.getElementById('checklistOverlay');
 if (overlay) overlay.style.display = 'none';
}

function tfBias(tf) {
 if (!tf) return 'unknown';
 let bull = 0;
 let bear = 0;
 if (tf.marketStructure?.bullish === true) bull += 4;
 if (tf.marketStructure?.bearish === true) bear += 4;
 const price = Number(tf.price);
 const emaM = Number(tf.emaM);
 const emaS = Number(tf.emaS);
 if (Number.isFinite(price) && Number.isFinite(emaM) && Number.isFinite(emaS)) {
 if (price > emaM && price > emaS) bull += 3;
 if (price < emaM && price < emaS) bear += 3;
 }
 if (tf.emaBull) bull += 2;
 if (tf.emaBear) bear += 2;
 if (tf.vwapAbove === true) bull += 1;
 if (tf.vwapAbove === false) bear += 1;
 if (tf.emaCross === 'bull') bull += 1;
 if (tf.emaCross === 'bear') bear += 1;
 if (bull >= bear + 2) return 'long';
 if (bear >= bull + 2) return 'short';
 return 'neutral';
}

function resolveChecklistMTF(signal) {
 const wanted = String(signal?.direction || '').includes('long') ? 'long' : 'short';
 const dailyBias = tfBias(signal?.daily);
 const lowerBias = tfBias(signal?.lower);
 const aligned = dailyBias === lowerBias && (dailyBias === 'long' || dailyBias === 'short');
 const sideMatch = aligned && dailyBias === wanted;
 const ok = !!signal?.mtfConfirmed || sideMatch;
 return { ok, wanted, dailyBias, lowerBias, aligned, sideMatch };
}

function getChecklistConfig() {
 const profile = typeof getV16ActiveAccountProfile === 'function' ? getV16ActiveAccountProfile() : {};
 return {
 minRR: Number(profile.checklistMinRR ?? 2),
 minScore: Number(profile.checklistMinScore ?? 60),
 maxPositions: Number(profile.checklistMaxPositions ?? 10),
 };
}

function getChecklistGrade(pct) {
 if (pct >= 85) return { letter: 'A', tone: 'good', label: 'Excellent' };
 if (pct >= 70) return { letter: 'B', tone: 'good', label: 'Good' };
 if (pct >= 50) return { letter: 'C', tone: 'warn', label: 'Fair' };
 return { letter: 'D', tone: 'bad', label: 'Weak' };
}

function showPreTradeChecklist(signal) {
 if (!signal || typeof signal !== 'object') return;
 const overlay = document.getElementById('checklistOverlay');
 const body = document.getElementById('checklistBody');
 const closeBtn = document.getElementById('checklistClose');
 const cancelBtn = document.getElementById('checklistCancel');
 const placeBtn = document.getElementById('checklistPlaceTrade');
 const deltaBtn = document.getElementById('checklistOpenDelta');
 if (!overlay || !body || !closeBtn || !cancelBtn || !placeBtn || !deltaBtn) {
 reportUiError('Checklist unavailable', new Error('Checklist modal controls are not mounted.'));
 return;
 }

 chrome.storage.local.get('marketIndex', ({ marketIndex: marketIndex }) => {
 const cfg = getChecklistConfig();
 const mtf = resolveChecklistMTF(signal);
 const isLong = String(signal?.direction || '').includes('long');
 const marketStructure = signal?.daily?.marketStructure;
 const lowerTfLabel = signal?.lower?.label || '15m';
 const liveMetrics = typeof v16LiveAccountView !== 'undefined' ? v16LiveAccountView.lastPositionMetrics : null;
 const openPositionCount = liveMetrics?.positions?.length || 0;
 const todayPnl = Number(liveMetrics?.netPnl || 0);
 const activeProfile = typeof getV16ActiveAccountProfile === 'function' ? getV16ActiveAccountProfile() : {};
 const dailyLossLimitPct = Number(activeProfile?.dailyLossLimitPct || 3);
 const baseBalance = Number(activeProfile?.baseBalance || 1000);
 const dailyLossLimit = baseBalance * (dailyLossLimitPct / 100);
 const dailyLossBreached = todayPnl < 0 && Math.abs(todayPnl) >= dailyLossLimit;
 const fundingRate = signal?.fundingRate ?? signal?.daily?.fundingRate ?? null;
 const fundingOk = fundingRate != null
 ? (isLong ? fundingRate <= 0.01 : fundingRate >= -0.01)
 : null;

 const items = [
 {
 key: 'mtf',
 label: `MTF Confirmed (1D: ${mtf.dailyBias.toUpperCase()} | ${lowerTfLabel}: ${mtf.lowerBias.toUpperCase()})`,
 ok: mtf.ok,
 required: true,
 category: 'Technical',
 },
 {
 key: 'rr',
 label: `R:R >= 1:${cfg.minRR} (current: 1:${signal?.rr || 0})`,
 ok: Number(signal?.rr || 0) >= cfg.minRR,
 required: true,
 category: 'Technical',
 },
 {
 key: 'score',
 label: `Signal score >= ${cfg.minScore} (current: ${signal?.score || 0})`,
 ok: Number(signal?.score || 0) >= cfg.minScore,
 required: true,
 category: 'Technical',
 },
 {
 key: 'delta10',
 label: `FWD Sentiment ${isLong ? 'positive' : 'negative'} (${marketIndex ? `${Number((marketIndex.sentiment?.value ?? marketIndex.value) || 0) >= 0 ? '+' : ''}${Number((marketIndex.sentiment?.value ?? marketIndex.value) || 0)}%` : 'no data'})`,
 ok: marketIndex ? (isLong ? Number((marketIndex.sentiment?.value ?? marketIndex.value) || 0) > 0 : Number((marketIndex.sentiment?.value ?? marketIndex.value) || 0) < 0) : null,
 required: false,
 category: 'Macro',
 },
 {
 key: 'rsi',
 label: `RSI regime supports trade (${signal?.daily?.rsiZone || signal?.daily?.rsiRegime || '?'})`,
 ok: isLong
 ? !!(signal?.daily?.rsiSupportZone || signal?.daily?.rsiPositiveReversal || signal?.daily?.rsiBullishShift || signal?.daily?.rsiRegime === 'bull_range')
 : !!(signal?.daily?.rsiResistanceZone || signal?.daily?.rsiNegativeReversal || signal?.daily?.rsiBearishShift || signal?.daily?.rsiRegime === 'bear_range'),
 required: false,
 category: 'Technical',
 },
 {
 key: 'vwap',
 label: 'Lower-TF VWAP confirms direction',
 ok: signal?.lower?.vwapAbove != null ? (isLong ? signal.lower.vwapAbove : !signal.lower.vwapAbove) : null,
 required: false,
 category: 'Technical',
 },
 {
 key: 'volume',
 label: 'Volume spike detected',
 ok: !!signal?.spike || null,
 required: false,
 category: 'Technical',
 },
 {
 key: 'structure',
 label: `Market structure favourable (${marketStructure?.structure || '?'})`,
 ok: marketStructure ? (isLong ? marketStructure.bullish : marketStructure.bearish) : null,
 required: false,
 category: 'Technical',
 },
 {
 key: 'funding',
 label: `Funding rate supports ${isLong ? 'long' : 'short'} (${fundingRate != null ? `${fundingRate >= 0 ? '+' : ''}${Number(fundingRate).toFixed(4)}%` : 'no data'})`,
 ok: fundingOk,
 required: false,
 category: 'Macro',
 },
 {
 key: 'dailyLoss',
 label: `Daily loss limit not breached (${dailyLossBreached ? 'BREACHED' : 'OK'} - limit $${dailyLossLimit.toFixed(0)})`,
 ok: !dailyLossBreached,
 required: false,
 category: 'Risk',
 },
 {
 key: 'maxPositions',
 label: `Open positions under limit (${openPositionCount}/${cfg.maxPositions})`,
 ok: openPositionCount < cfg.maxPositions,
 required: false,
 category: 'Risk',
 },
 ];

 const varProfile = activeProfile || {};
 const varCaps = typeof resolveSharedVarPositionCaps === 'function'
 ? resolveSharedVarPositionCaps(varProfile, { marketIndex })
 : {
 longSlots: Number(varProfile.varMaxLongPositions ?? 6),
 shortSlots: Number(varProfile.varMaxShortPositions ?? 4),
 preferredSide: Number(marketIndex?.value || 0) < 0 ? 'short' : 'long',
 };
 const varMaxLong = Number(varCaps.longSlots ?? 7);
 const varMaxShort = Number(varCaps.shortSlots ?? 3);
 const varMaxPerSector = Number(varProfile.varMaxTradesPerSector ?? 2);
 const varMaxLossPerTrade = Number(varProfile.varMaxLossPerTradeUSD ?? 20);
 const livePositions = Array.isArray(liveMetrics?.positions) ? liveMetrics.positions : [];
 const varLongCount = livePositions.filter(p => p.side === 'long').length;
 const varShortCount = livePositions.filter(p => p.side === 'short').length;
 const signalSector = typeof getSector === 'function' ? getSector(signal?.symbol || '') : 'Other';
 const sectorCount = livePositions.filter(p => {
 const sector = typeof getSector === 'function' ? getSector(p.symbol || p.product_symbol || '') : 'Other';
 return sector === signalSector;
 }).length;
 const stopLossPrice = Number(signal?.sl || signal?.stopLoss || 0);
 const estimatedLoss = Number(signal?.entry || 0) > 0 && stopLossPrice > 0
 ? Math.abs(Number(signal.entry) - stopLossPrice) * Number(signal?.contracts || 1)
 : null;

 items.push(
 {
 key: 'varDirection',
 label: `${isLong ? 'Long' : 'Short'} position slots available (${isLong ? varLongCount : varShortCount}/${isLong ? varMaxLong : varMaxShort}) | ${String(varCaps.preferredSide || 'long').toUpperCase()} bias`,
 ok: isLong ? varLongCount < varMaxLong : varShortCount < varMaxShort,
 required: false,
 category: 'VAR',
 },
 {
 key: 'varSector',
 label: `Sector limit: ${signalSector} (${sectorCount}/${varMaxPerSector})`,
 ok: sectorCount < varMaxPerSector,
 required: false,
 category: 'VAR',
 },
 {
 key: 'varPerTradeLoss',
 label: `Per-trade loss within cap ($${varMaxLossPerTrade})${estimatedLoss != null ? ` - est. $${estimatedLoss.toFixed(2)}` : ''}`,
 ok: estimatedLoss != null ? estimatedLoss <= varMaxLossPerTrade : null,
 required: false,
 category: 'VAR',
 },
 );

 const enabledItems = items.filter(item => item.ok !== null);
 const requiredFails = items.filter(item => item.required && item.ok === false).length;
 const canTrade = requiredFails === 0;
 const passedCount = enabledItems.filter(item => item.ok === true).length;
 const totalEnabled = enabledItems.length;
 const confidencePct = totalEnabled > 0 ? Math.round((passedCount / totalEnabled) * 100) : 0;
 const grade = getChecklistGrade(confidencePct);
 const reasons = [];
 if (canTrade) {
 reasons.push('All required conditions met.');
 } else {
 items.filter(item => item.required && item.ok === false).forEach(item => {
 if (item.key === 'mtf') reasons.push(`1D is ${mtf.dailyBias}, ${lowerTfLabel} is ${mtf.lowerBias} (need both ${mtf.wanted}).`);
 else if (item.key === 'rr') reasons.push(`R:R only 1:${signal?.rr || 0} - minimum 1:${cfg.minRR}.`);
 else if (item.key === 'score') reasons.push(`Score ${signal?.score || 0} below minimum ${cfg.minScore}.`);
 else reasons.push(item.label);
 });
 }

 const ringRadius = 28;
 const ringCirc = 2 * Math.PI * ringRadius;
 const ringOffset = ringCirc - (confidencePct / 100) * ringCirc;
 const ringColor = grade.tone === 'good' ? '#2fe0a1' : grade.tone === 'warn' ? '#f0bf52' : '#ff6b82';
 const categories = ['Technical', 'Macro', 'Risk', 'VAR'];

 body.innerHTML = `
 <div class="cl-header">
 <div class="cl-header-info">
 <div class="cl-symbol">${esc(String(signal?.symbol || '').toUpperCase())}</div>
 <div class="cl-signal-meta">${esc(String(signal?.direction || '').toUpperCase())} | Score ${Number(signal?.score || 0)}/100 | Entry $${fmtPrice(signal?.entry)}</div>
 </div>
 <div class="cl-confidence-ring">
 <svg width="68" height="68" viewBox="0 0 68 68">
 <circle cx="34" cy="34" r="${ringRadius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
 <circle cx="34" cy="34" r="${ringRadius}" fill="none" stroke="${ringColor}" stroke-width="4"
 stroke-dasharray="${ringCirc}" stroke-dashoffset="${ringOffset}"
 stroke-linecap="round" transform="rotate(-90 34 34)"
 style="transition: stroke-dashoffset 0.6s ease"/>
 </svg>
 <div class="cl-confidence-inner">
 <div class="cl-confidence-grade ${grade.tone}">${grade.letter}</div>
 <div class="cl-confidence-pct">${confidencePct}%</div>
 </div>
 </div>
 </div>

 <div class="cl-items-wrap">
 ${categories.map(category => {
 const catItems = items.filter(item => item.category === category);
 if (!catItems.length) return '';
 return `
 <div class="cl-category">
 <div class="cl-category-label">${category}</div>
 ${catItems.map(item => `
 <div class="cl-item-card ${item.ok === true ? 'ok' : item.ok === false ? 'fail' : 'neutral'}">
 <span class="cl-icon">${item.ok === true ? 'OK' : item.ok === false ? 'X' : '?'}</span>
 <span class="cl-label">${esc(item.label)}</span>
 ${item.required ? '<span class="cl-req">REQ</span>' : ''}
 </div>`).join('')}
 </div>`;
 }).join('')}
 </div>

 <div class="cl-progress-bar-wrap">
 <div class="cl-progress-bar">
 <div class="cl-progress-fill" style="width:${confidencePct}%;background:${ringColor}"></div>
 </div>
 <div class="cl-progress-label">${passedCount}/${totalEnabled} checks passed | Grade ${grade.letter} | ${grade.label}</div>
 </div>

 <div class="cl-verdict ${canTrade ? 'pass' : 'fail-hard'}">
 <div class="cl-verdict-title">${canTrade ? 'TAKE THE TRADE' : 'DO NOT TRADE'}</div>
 <div class="cl-verdict-reasons">${reasons.map(reason => esc(reason)).join('<br>')}</div>
 </div>`;

 const tradeUrl = buildDeltaTradeUrl(signal?.symbol);
 placeBtn.hidden = !canTrade;
 placeBtn.disabled = !canTrade;
 placeBtn.dataset.checklistSignal = 'active';
 deltaBtn.hidden = false;
 deltaBtn.dataset.tradeUrl = tradeUrl;
 window._checklistSignal = signal;

 overlay.onclick = event => {
 if (event.target === overlay) closePreTradeChecklist();
 };
 closeBtn.onclick = () => closePreTradeChecklist();
 cancelBtn.onclick = () => closePreTradeChecklist();
 deltaBtn.onclick = () => {
 const url = deltaBtn.dataset.tradeUrl;
 if (url) window.open(url, '_blank', 'noopener,noreferrer');
 };
 placeBtn.onclick = async () => {
 try {
 await globalThis.ensurePopupFeatureModulesForTab?.('positions');
 if (typeof globalThis.openV16LiveTradeOrderPreview !== 'function') {
 throw new Error('Live order preview is not ready yet.');
 }
 closePreTradeChecklist();
 await globalThis.openV16LiveTradeOrderPreview(signal);
 } catch (error) {
 reportUiError('Checklist unavailable', error);
 }
 };

 overlay.style.display = 'flex';
 });
}

async function openModal(signal) {
 if (!signal || typeof signal !== 'object') return;
 currentModal = signal;

 const overlay = document.getElementById('overlay');
 const title = document.getElementById('moTitle');
 const body = document.getElementById('moBody');
 const closeBtn = document.getElementById('moClose');
 const openBtn = document.getElementById('btnOpenInDelta');
 const previewBtn = document.getElementById('btnLiveTradePreview');
 const checklistBtn = document.getElementById('btnToJrnl');
 if (!overlay || !title || !body) return;

 title.textContent = `${String(signal.symbol || '').toUpperCase()} ${String(signal.direction || '').toUpperCase()}`;
 body.innerHTML = buildSignalModalBody(signal);
 overlay.style.display = 'flex';
 document.getElementById('moAddAnalytics')?.remove();
 if (typeof loadOrderbookLite === 'function') loadOrderbookLite(signal.symbol);
 void globalThis.v16RenderSignalDecisionBlock?.(signal);

 overlay.onclick = event => {
 if (event.target === overlay) closeModal();
 };
 closeBtn.onclick = () => closeModal();
 openBtn.onclick = () => {
 const tradeUrl = buildDeltaTradeUrl(signal.symbol);
 if (tradeUrl) window.open(tradeUrl, '_blank', 'noopener,noreferrer');
 };
 previewBtn.onclick = async () => {
 try {
 await globalThis.ensurePopupFeatureModulesForTab?.('positions');
 if (typeof globalThis.openV16LiveTradeOrderPreview !== 'function') {
 throw new Error('Live order preview is not ready yet.');
 }
 closeModal();
 await globalThis.openV16LiveTradeOrderPreview(signal);
 } catch (error) {
 reportUiError('Preview unavailable', error);
 }
 };
 checklistBtn.onclick = async () => {
 try {
 await globalThis.ensurePopupFeatureModulesForTab?.('positions');
 closeModal();
 showPreTradeChecklist(signal);
 } catch (error) {
 reportUiError('Checklist unavailable', error);
 }
 };

 document.getElementById('moToggleWatch')?.addEventListener('click', async () => {
 await toggleWatchlist(signal.symbol);
 const nextPinned = Array.isArray(currentWatchlist) && currentWatchlist.includes(signal.symbol);
 const btn = document.getElementById('moToggleWatch');
 if (btn) {
 btn.textContent = nextPinned ? 'Remove Watch' : 'Add Watch';
 btn.classList.toggle('primary', !nextPinned);
 btn.classList.toggle('warn', nextPinned);
 }
 await renderAlerts();
 });
 document.getElementById('moToRisk')?.addEventListener('click', () => {
 seedRiskCalculatorFromSignal(signal);
 closeModal();
 setActiveWorkspaceTab('riskcalc', true, true);
 });
 document.getElementById('moRefreshSignal')?.addEventListener('click', () => {
 refreshCurrentModalSignal();
 });

 const entryPrice = Number(signal.entry || signal.price || 0);
 const slEl = document.getElementById('rrSlSL');
 const tpEl = document.getElementById('rrSlTP');
 if (slEl && tpEl && entryPrice > 0) {
 const updateRR = () => {
 const sl = parseFloat(slEl.value);
 const tp = parseFloat(tpEl.value);
 const slVal = document.getElementById('rrSlVal');
 const tpVal = document.getElementById('rrTpVal');
 if (slVal) slVal.textContent = '$' + fmtPrice(sl);
 if (tpVal) tpVal.textContent = '$' + fmtPrice(tp);
 const slDist = Math.abs(entryPrice - sl);
 const tpDist = Math.abs(tp - entryPrice);
 if (slDist <= 0) return;
 const rr = +(tpDist / slDist).toFixed(2);
 const rrEl = document.getElementById('rrLive');
 const adviceEl = document.getElementById('rrAdvice');
 if (rrEl) {
 rrEl.textContent = rr.toFixed(2);
 rrEl.style.color = rr >= 2 ? '#00e5a0' : rr >= 1.5 ? '#ffc840' : '#ff4560';
 }
 if (adviceEl) {
 if (rr >= 3) {
 adviceEl.textContent = 'Excellent R:R';
 adviceEl.style.color = '#00e5a0';
 } else if (rr >= 2) {
 adviceEl.textContent = 'Good R:R - minimum pro standard';
 adviceEl.style.color = '#00e5a0';
 } else if (rr >= 1.5) {
 adviceEl.textContent = 'Acceptable - aim for 1:2+';
 adviceEl.style.color = '#ffc840';
 } else {
 adviceEl.textContent = 'Poor - widen TP or tighten SL';
 adviceEl.style.color = '#ff4560';
 }
 }
 };
 slEl.addEventListener('input', updateRR);
 tpEl.addEventListener('input', updateRR);
 updateRR();
 }
}

globalThis.openModal = openModal;
globalThis.closeModal = closeModal;


