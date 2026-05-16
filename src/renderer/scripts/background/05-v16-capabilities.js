'use strict';

const {
 createDefaultAccountState,
 classifySymbolMaturity: v16ClassifySymbolMaturity,
 hasCompleteBracketProtection,
 normalizeOrderSide,
 normalizePositionSide,
  sanitizeAutoTradeSettings,
 sanitizeDcaBotSettings,
 sanitizeBlockedSymbolList,
  resolveBracketProtectionLevels,
 resolveDecisionAction,
 resolveEntryTrigger,
 resolveRiskQualityGate,
 normalizeShadowTrade,
 updateShadowTradeWithCandles,
 buildSetupPerformance,
 sanitizeAccountMetadata,
 sanitizeAccountSecrets,
 sanitizeKillSwitchState,
 sanitizeKeyLevelSettings: v16BgSanitizeKeyLevelSettings,
} = globalThis.FWDTradeDeskShared;

const V16_ACCOUNT_METADATA_KEY = 'dsAccountMetadataV16';
const V16_ACCOUNT_SECRETS_KEY = 'dsAccountSecretsV16';
const V16_PRIVATE_HISTORY_WINDOW_DAYS = 30;
const V16_PRIVATE_HISTORY_PAGE_SIZE = 50;
const V16_PRIVATE_HISTORY_MAX_PAGES = 12;
const V16_PRIVATE_SNAPSHOT_CACHE_TTL_MS = 60000;
const V16_PRIVATE_REQUEST_TIMEOUT_MS = 12000;
const V16_PRIVATE_RATE_LIMIT_DEFAULT_MS = 90000;
const V16_PRIVATE_RATE_LIMIT_STORAGE_KEY = 'v16PrivateRateLimitStateV16';
const V16_AUTO_TRADE_PROTECTION_BLOCKS_KEY = 'v16AutoTradeProtectionBlocksV16';
const V16_AUTO_TRADE_DECISION_AUDIT_KEY = 'autoTradeDecisionAuditV16';
const SINGLE_ACCOUNT_PROFILE_ID = 'primary';
const SINGLE_CREDENTIAL_ALIAS = 'FWD TradeDesk Pro/primary';
const V16_AUTO_TRADE_MANUAL_CONTROLS_KEY = 'v16AutoTradeManualControlsV17';
const V16_NOTIFICATION_FEED_KEY = 'v16NotificationFeedV17';
const V16_PUBLIC_CANDLE_RESOLUTIONS = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);
const V16_AUTO_TRADE_MIN_LIQUIDITY_USD_DEFAULT = 750000;
const V16_AUTO_TRADE_KEY_LEVEL_ATR_BUFFER = 0.6;
const V16_AUTO_TRADE_PROBATION_ALLOWED_FAMILIES = new Set(['continuation', 'pullback', 'breakout_retest', 'tight_continuation', 'compression_breakout']);
const V16_SHADOW_TRADE_LEDGER_KEY = 'v16ShadowTradeLedgerV1';
const V16_SETUP_PERFORMANCE_KEY = 'v16SetupPerformanceV1';
const V16_SHADOW_MAX_OPEN = 80;
const V16_SHADOW_MAX_CLOSED = 1000;
let v16AccountStateQueue = Promise.resolve();
const v16PrivateSnapshotCache = new Map();
const v16PrivateSnapshotInFlight = new Map();
const v16PrivateRateLimitState = new Map();
const v16PrivateRateLimitNotifiedUntil = new Map();
const v16EntryOrderInFlight = new Map();
const V17_NATIVE_HOST_NAME = 'com.fwd_tradedesk.pro.native';
const V17_NATIVE_HOST_PING_TTL_MS = 30000;
let v17NativeHostPingState = { ok: false, checkedAt: 0, error: 'Not checked yet' };

function v16HasOwn(store, key) {
 return !!store && Object.prototype.hasOwnProperty.call(store, key);
}

function v16NormalizeProtectionState(value = '', fallback = '') {
 const raw = String(value || '').trim().toLowerCase();
 if (!raw) return fallback;
 if (['armed', 'manual_native', 'triggered', 'unprotected', 'closed', 'missing'].includes(raw)) return raw;
 if (['armed_trailing'].includes(raw)) return 'armed';
 if (['stopped', 'stop_hit', 'target_hit'].includes(raw)) return 'triggered';
 if (['stop_pending', 'stop_missing', 'entry_expired', 'pending'].includes(raw)) return 'missing';
 if (['protection_failed'].includes(raw)) return 'unprotected';
 return fallback || raw;
}

function v16NormalizeProtectionSource(value = '', fallback = '') {
 const raw = String(value || '').trim().toLowerCase();
 if (!raw) return fallback;
 if (raw === 'manual') return 'manual_native';
 if (raw === 'app' || raw === 'native') return 'app_native';
 if (raw === 'app_native' || raw === 'manual_native') return raw;
 return fallback || raw;
}

function v16ResolveTrackedProtectionSource(order = null, entry = {}, kind = 'stop') {
 if (!order) return '';
 const orderId = String(order?.orderId || order?.id || '').trim();
 const clientOrderId = String(order?.clientOrderId || '').trim();
 const trackedIds = new Set([
 kind === 'stop' ? entry?.stopOrderId : entry?.targetOrderId,
 ].map(value => String(value || '').trim()).filter(Boolean));
 if ((orderId && trackedIds.has(orderId)) || (clientOrderId && trackedIds.has(clientOrderId))) return 'app_native';
 if (v16IsFWDTradeDeskManagedOrder(order)) return 'app_native';
 return 'manual_native';
}

function v16IsFWDTradeDeskManagedOrder(order = {}) {
 return String(order?.clientOrderId || '').trim().toLowerCase().startsWith('ds_v16_');
}

function v16StartOfNextDay(now = Date.now()) {
 const next = new Date(Number(now || Date.now()));
 next.setUTCHours(24, 0, 0, 0);
 return next.getTime();
}

function v16FormatManualControlDuration(ms = 0) {
 const safe = Math.max(0, Number(ms || 0));
 if (safe >= 24 * 60 * 60 * 1000) return `${Math.round(safe / (24 * 60 * 60 * 1000))}d`;
 if (safe >= 60 * 60 * 1000) return `${Math.round(safe / (60 * 60 * 1000))}h`;
 return `${Math.max(1, Math.round(safe / 60000))}m`;
}

function v16NormalizeManualControlEntry(symbol = '', entry = {}, now = Date.now()) {
 const normalizedSymbol = v16NormalizeSymbol(symbol);
 if (!normalizedSymbol) return null;
 const safeEntry = entry && typeof entry === 'object' ? entry : {};
 const next = {
 symbol: normalizedSymbol,
 pausedUntil: Math.max(0, Number(safeEntry.pausedUntil || 0)),
 reentryBlockedUntil: Math.max(0, Number(safeEntry.reentryBlockedUntil || 0)),
 ignoreFundingUntil: Math.max(0, Number(safeEntry.ignoreFundingUntil || 0)),
 reservedSlotUntil: Math.max(0, Number(safeEntry.reservedSlotUntil || 0)),
 blockedTodayUntil: Math.max(0, Number(safeEntry.blockedTodayUntil || 0)),
 note: String(safeEntry.note || '').trim().slice(0, 200),
 updatedAt: Math.max(0, Number(safeEntry.updatedAt || now)),
 };
 const active = next.pausedUntil > now
 || next.reentryBlockedUntil > now
 || next.ignoreFundingUntil > now
 || next.reservedSlotUntil > now
 || next.blockedTodayUntil > now;
 return active ? next : null;
}

function v16SanitizeManualControlState(state = {}, now = Date.now()) {
 const safeState = state && typeof state === 'object' ? state : {};
 const rawSymbols = safeState.symbols && typeof safeState.symbols === 'object' ? safeState.symbols : {};
 const symbols = Object.entries(rawSymbols).reduce((acc, [symbol, entry]) => {
 const normalized = v16NormalizeManualControlEntry(symbol, entry, now);
 if (normalized) acc[normalized.symbol] = normalized;
 return acc;
 }, {});
 return {
 symbols,
 updatedAt: Math.max(0, Number(safeState.updatedAt || now)),
 };
}

async function v16LoadManualControlState(now = Date.now()) {
 const stored = await storeLocalGet([V16_AUTO_TRADE_MANUAL_CONTROLS_KEY]);
 const sanitized = v16SanitizeManualControlState(stored?.[V16_AUTO_TRADE_MANUAL_CONTROLS_KEY] || {}, now);
 const existing = JSON.stringify(stored?.[V16_AUTO_TRADE_MANUAL_CONTROLS_KEY] || {});
 const next = JSON.stringify(sanitized);
 if (existing !== next) {
 await storeLocalSet({ [V16_AUTO_TRADE_MANUAL_CONTROLS_KEY]: sanitized });
 }
 return sanitized;
}

function v16ResolveSymbolManualControls(state = {}, symbol = '', now = Date.now()) {
 const normalizedSymbol = v16NormalizeSymbol(symbol);
 const record = normalizedSymbol ? (state?.symbols?.[normalizedSymbol] || null) : null;
 return {
 symbol: normalizedSymbol,
 record,
 paused: Number(record?.pausedUntil || 0) > now,
 reentryBlocked: Number(record?.reentryBlockedUntil || 0) > now,
 ignoreFunding: Number(record?.ignoreFundingUntil || 0) > now,
 reservedSlot: Number(record?.reservedSlotUntil || 0) > now,
 blockedToday: Number(record?.blockedTodayUntil || 0) > now,
 };
}

function v16CountReservedSlots(state = {}, activeSymbolMap = new Map(), now = Date.now()) {
 return Object.values(state?.symbols || {}).reduce((count, entry) => {
 const normalizedSymbol = v16NormalizeSymbol(entry?.symbol || '');
 if (!normalizedSymbol) return count;
 if (!(Number(entry?.reservedSlotUntil || 0) > now)) return count;
 if (activeSymbolMap?.has?.(normalizedSymbol)) return count;
 return count + 1;
 }, 0);
}

function v16BuildNotificationFeedEntry(entry = {}) {
 const sourceScannerId = String(entry.sourceScannerId || entry.scannerId || entry.strategyId || entry.sourceType || '').trim().toLowerCase();
 const sourceScannerName = String(entry.sourceScannerName || entry.scannerName || entry.sourceLabel || '').trim();
 return {
 id: String(entry.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
 ts: Number(entry.ts || Date.now()),
 tone: String(entry.tone || 'info').trim().toLowerCase(),
 title: String(entry.title || '').trim().slice(0, 80),
 symbol: v16NormalizeSymbol(entry.symbol || ''),
 sourceScannerId,
 sourceScannerName: sourceScannerName.slice(0, 60),
 sourceType: String(entry.sourceType || (sourceScannerId ? 'scanner' : '')).trim().toLowerCase().slice(0, 40),
 what: String(entry.what || '').trim().slice(0, 180),
 why: String(entry.why || '').trim().slice(0, 220),
 next: String(entry.next || '').trim().slice(0, 220),
 action: String(entry.action || '').trim().slice(0, 160),
 };
}

async function v16PushNotificationFeed(entry = {}) {
 const nextEntry = v16BuildNotificationFeedEntry(entry);
 if (!nextEntry.title && !nextEntry.what) return null;
 const stored = await storeLocalGet([V16_NOTIFICATION_FEED_KEY]);
 const feed = Array.isArray(stored?.[V16_NOTIFICATION_FEED_KEY]) ? stored[V16_NOTIFICATION_FEED_KEY] : [];
 const nextFeed = [nextEntry, ...feed].slice(0, 120);
 await storeLocalSet({ [V16_NOTIFICATION_FEED_KEY]: nextFeed });
 return nextEntry;
}

async function v16UpdateManualControlState(payload = {}) {
 const now = Date.now();
 const symbol = v16NormalizeSymbol(payload?.symbol || '');
 if (!symbol) throw new Error('Symbol is required');
 const kind = String(payload?.kind || '').trim().toLowerCase();
 const durationMs = Math.max(0, Number(payload?.durationMs || 0));
 const until = Math.max(now + durationMs, kind === 'block_today' ? v16StartOfNextDay(now) : 0);
 const state = await v16LoadManualControlState(now);
 const current = {
 ...(state.symbols?.[symbol] || { symbol }),
 symbol,
 updatedAt: now,
 };
 if (kind === 'clear_all') {
 delete state.symbols[symbol];
 } else if (kind === 'pause') {
 current.pausedUntil = until;
 state.symbols[symbol] = current;
 } else if (kind === 'reentry') {
 current.reentryBlockedUntil = until;
 state.symbols[symbol] = current;
 } else if (kind === 'ignore_funding') {
 current.ignoreFundingUntil = until;
 state.symbols[symbol] = current;
 } else if (kind === 'reserve_slot') {
 current.reservedSlotUntil = until;
 state.symbols[symbol] = current;
 } else if (kind === 'block_today') {
 current.blockedTodayUntil = until;
 state.symbols[symbol] = current;
 } else {
 throw new Error('Unsupported manual control');
 }
 const sanitized = v16SanitizeManualControlState({ ...state, updatedAt: now }, now);
 await storeLocalSet({ [V16_AUTO_TRADE_MANUAL_CONTROLS_KEY]: sanitized });
 return {
 state: sanitized,
 record: sanitized.symbols?.[symbol] || null,
 };
}

function v16BuildAutoTradeProtectionBlockReason(entry = {}) {
 const symbol = v16NormalizeSymbol(entry?.symbol || '') || 'unknown symbol';
 return `Protection missing on ${symbol}; add a native stop on Delta or close the live position.`;
}

function v16BuildAutoTradeProtectionBlocks(tradeLog = []) {
 const activeStatuses = new Set(['placed', 'pending', 'live']);
 return (Array.isArray(tradeLog) ? tradeLog : []).reduce((blocks, entry) => {
 const profileId = String(entry?.profileId || '').trim();
 if (!profileId || !activeStatuses.has(String(entry?.status || '').toLowerCase())) return blocks;
 if (v16NormalizeProtectionState(entry?.protectionState || '', '') !== 'unprotected') return blocks;
 if (blocks[profileId]) return blocks;
 blocks[profileId] = {
 profileId,
 blockedAt: Number(entry?.updatedAt || entry?.ts || Date.now()),
 entryId: String(entry?.id || ''),
 symbol: v16NormalizeSymbol(entry?.symbol || ''),
 reason: String(entry?.protectionBlockReason || v16BuildAutoTradeProtectionBlockReason(entry)).trim(),
 };
 return blocks;
 }, {});
}

function v17SanitizeCredentialAlias(value = '', profileId = '') {
 return SINGLE_CREDENTIAL_ALIAS;
}

function v17UsesNativeCredential(profile = {}) {
 return String(profile?.credentialSource || '').trim().toLowerCase() === 'native_host';
}

function v17BuildPrivateRequestShape({ method = 'GET', path = '', query = null, body = null, baseUrl = '' } = {}) {
 const upperMethod = String(method || 'GET').toUpperCase();
 const rawPath = String(path || '').trim() || '/';
 const apiPath = rawPath.startsWith('/v2') ? (rawPath.slice(3) || '/') : rawPath;
 const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
 const requestPath = `/v2${normalizedPath}`;
 const resolvedBaseUrl = String(baseUrl || BASE || '').trim() || API_INDIA;
 const queryString = v16EncodeQuery(query || {});
 const fullPath = `${normalizedPath}${queryString ? `?${queryString}` : ''}`;
 const payload = body ? JSON.stringify(body) : '';
 return {
 upperMethod,
 normalizedPath,
 requestPath,
 resolvedBaseUrl,
 queryString,
 fullPath,
 payload,
 };
}

function v17CreateNativePrivateError(response = {}, resolvedBaseUrl = '', fullPath = '') {
 const apiError = response?.error || response?.message || response?.text || 'Request failed';
 const status = Number(response?.status || 0);
 const error = new Error(`${status || 'ERR'} ${String(apiError)}`.trim());
 error.status = status;
 error.baseUrl = resolvedBaseUrl;
 error.path = fullPath;
 if (status === 429 || /rate limit|too many/i.test(String(apiError))) {
 error.isRateLimit = true;
 error.retryAfterMs = Math.max(1000, Number(response?.retryAfterMs || 0) || V16_PRIVATE_RATE_LIMIT_DEFAULT_MS);
 }
 return error;
}

function v17SendNativeMessage(type, payload = {}) {
 return new Promise((resolve, reject) => {
 try {
 chrome.runtime.sendNativeMessage(V17_NATIVE_HOST_NAME, { type, ...payload }, response => {
 if (chrome.runtime.lastError) {
 reject(new Error(chrome.runtime.lastError.message || 'Native host unavailable'));
 return;
 }
 resolve(response || {});
 });
 } catch (error) {
 reject(error);
 }
 });
}

async function v17CheckNativeHost(force = false) {
 if (!force && (Date.now() - Number(v17NativeHostPingState.checkedAt || 0)) < V17_NATIVE_HOST_PING_TTL_MS) {
 return v17NativeHostPingState;
 }
 try {
 const response = await v17SendNativeMessage('ping', {});
 v17NativeHostPingState = {
 ok: !!response?.ok,
 checkedAt: Date.now(),
 error: response?.ok ? '' : String(response?.error || 'Native host rejected ping'),
 };
 } catch (error) {
 v17NativeHostPingState = {
 ok: false,
 checkedAt: Date.now(),
 error: error?.message || 'Native host unavailable',
 };
 }
 return v17NativeHostPingState;
}

async function v17StoreNativeCredential(profile = {}, secret = {}) {
 const alias = SINGLE_CREDENTIAL_ALIAS;
 const response = await v17SendNativeMessage('store_credential', {
 profileId: SINGLE_ACCOUNT_PROFILE_ID,
 credentialAlias: alias,
 label: String(secret?.label || profile?.credentialLabel || '').trim(),
 tradingKey: String(secret?.tradingKey || '').trim(),
 tradingSecret: String(secret?.tradingSecret || '').trim(),
 });
 if (!response?.ok) {
 throw new Error(response?.error || 'Failed to store credential in encrypted Windows app storage');
 }
 return {
 alias: String(response?.credentialAlias || alias).trim() || alias,
 label: String(response?.label || secret?.label || profile?.credentialLabel || '').trim(),
 };
}

async function v17DeleteNativeCredential(profile = {}) {
 const alias = SINGLE_CREDENTIAL_ALIAS;
 try {
 await v17SendNativeMessage('delete_credential', {
 profileId: SINGLE_ACCOUNT_PROFILE_ID,
 credentialAlias: alias,
 });
 } catch (_) { }
}

async function v17RunNativePrivateFetch({ profileId = '', credentialAlias = '', method = 'GET', path = '', query = null, body = null, baseUrl = '' } = {}) {
 await detectAPI();
 const request = v17BuildPrivateRequestShape({ method, path, query, body, baseUrl });
 const ping = await v17CheckNativeHost();
 if (!ping.ok) {
 throw new Error(`Encrypted Windows app storage unavailable: ${ping.error || 'integration not available'}`);
 }
 const response = await v17SendNativeMessage('delta_private_request', {
 profileId: SINGLE_ACCOUNT_PROFILE_ID,
 credentialAlias: SINGLE_CREDENTIAL_ALIAS,
 method: request.upperMethod,
 path: request.normalizedPath,
 query: query || {},
 body: body || null,
 baseUrl: request.resolvedBaseUrl,
 });
 if (!response?.ok) {
 const error = v17CreateNativePrivateError(response, request.resolvedBaseUrl, request.fullPath);
 const statusCode = Number(error.status || response?.status || 0);
 error.isServerError = statusCode >= 500;
 error.isTimeout = /timed?\s*out|abort/i.test(String(error.message || ''));
 if (typeof dlog === 'function') dlog(`v17 native private request failed ${request.resolvedBaseUrl}${request.fullPath} -> ${error.status || 'ERR'} ${String(error.message).slice(0, 180)}`);
 throw error;
 }
 return {
 data: response?.data ?? null,
 raw: response?.raw ?? response?.data ?? null,
 meta: response?.meta ?? (response?.data && typeof response.data === 'object' ? response.data.meta || null : null),
 resolvedBaseUrl: request.resolvedBaseUrl,
 fullPath: request.fullPath,
 };
}

function v16RemoveLegacyLocalSecrets() {
 return new Promise(resolve => {
 try {
 chrome.storage.local.remove(V16_ACCOUNT_SECRETS_KEY, () => resolve());
 } catch (_) {
 resolve();
 }
 });
}

function queueV16AccountState(task) {
 const run = v16AccountStateQueue.then(task, task);
 v16AccountStateQueue = run.catch(() => { });
 return run;
}

async function readStoredV16AccountState() {
 const [localData, sessionData] = await Promise.all([
 storeLocalGet([V16_ACCOUNT_METADATA_KEY, V16_ACCOUNT_SECRETS_KEY]),
 storeSessionGet(V16_ACCOUNT_SECRETS_KEY),
 ]);
 const storedSecrets = v16HasOwn(sessionData, V16_ACCOUNT_SECRETS_KEY)
 ? (sessionData?.[V16_ACCOUNT_SECRETS_KEY] || {})
 : (localData?.[V16_ACCOUNT_SECRETS_KEY] || {});
 return {
 localData,
 sessionData,
 hasLegacyLocalSecrets: v16HasOwn(localData, V16_ACCOUNT_SECRETS_KEY),
 state: createDefaultAccountState({
 metadata: localData?.[V16_ACCOUNT_METADATA_KEY] || {},
 secrets: storedSecrets,
 }),
 };
}

async function ensureV16AccountState() {
 return queueV16AccountState(async () => {
 const { localData, sessionData, state, hasLegacyLocalSecrets } = await readStoredV16AccountState();
 const currentState = createDefaultAccountState({
 metadata: localData?.[V16_ACCOUNT_METADATA_KEY] || {},
 secrets: state.secrets,
 });
 const needsLocalWrite = JSON.stringify(localData?.[V16_ACCOUNT_METADATA_KEY] || null) !== JSON.stringify(currentState.metadata);
 const needsSessionWrite = JSON.stringify(sessionData?.[V16_ACCOUNT_SECRETS_KEY] || null) !== JSON.stringify(currentState.secrets);
 if (needsLocalWrite) await storeLocalSet({ [V16_ACCOUNT_METADATA_KEY]: currentState.metadata });
 if (needsSessionWrite) await storeSessionSet({ [V16_ACCOUNT_SECRETS_KEY]: currentState.secrets });
 if (hasLegacyLocalSecrets) await v16RemoveLegacyLocalSecrets();
 return currentState;
 });
}

async function getV16AccountState() {
 return queueV16AccountState(async () => {
 const { state } = await readStoredV16AccountState();
 return state;
 });
}

async function saveV16AccountState(metadata, secrets) {
 return queueV16AccountState(async () => {
 const { state } = await readStoredV16AccountState();
 const previousProfiles = Array.isArray(state?.metadata?.profiles) ? state.metadata.profiles : [];
 const previousProfileMap = new Map(previousProfiles.map(profile => [String(profile?.id || ''), profile]));
 const previousSecretMap = state?.secrets || {};
 const requestedMetadata = sanitizeAccountMetadata(metadata || state.metadata || {});
 const requestedSecrets = sanitizeAccountSecrets(secrets || state.secrets || {}, requestedMetadata.profiles);
 const nativeHostState = await v17CheckNativeHost(true);
 const nextProfiles = [];
 const nextSecretsDraft = { ...requestedSecrets };
 const nextProfileIds = new Set();

 for (const requestedProfile of (requestedMetadata.profiles || [])) {
 const profileId = String(requestedProfile?.id || '').trim();
 if (!profileId) continue;
 nextProfileIds.add(profileId);
 const previousProfile = previousProfileMap.get(profileId) || {};
 const previousSecret = previousSecretMap?.[profileId] || {};
 const draftSecret = nextSecretsDraft?.[profileId] || {};
 const tradingKey = String(draftSecret?.tradingKey || '').trim();
 const tradingSecret = String(draftSecret?.tradingSecret || '').trim();
 const hasFreshCredential = !!(tradingKey && tradingSecret);
 const keepExistingNativeCredential = !hasFreshCredential && (v17UsesNativeCredential(requestedProfile) || v17UsesNativeCredential(previousProfile));
 let nextProfile = {
 ...requestedProfile,
 credentialSource: v17UsesNativeCredential(requestedProfile) ? 'native_host' : 'extension',
 credentialAlias: v17SanitizeCredentialAlias(requestedProfile?.credentialAlias || previousProfile?.credentialAlias, profileId),
 credentialLabel: String(draftSecret?.label || requestedProfile?.credentialLabel || previousProfile?.credentialLabel || '').trim(),
 };

 if (hasFreshCredential && nativeHostState.ok) {
 const stored = await v17StoreNativeCredential({ ...previousProfile, ...nextProfile }, draftSecret);
 nextProfile = {
 ...nextProfile,
 credentialSource: 'native_host',
 credentialAlias: stored.alias,
 credentialLabel: stored.label || nextProfile.credentialLabel,
 };
 nextSecretsDraft[profileId] = {
 tradingKey: '',
 tradingSecret: '',
 label: stored.label || nextProfile.credentialLabel,
 updatedAt: Number(draftSecret?.updatedAt || Date.now()) || Date.now(),
 };
 } else if (keepExistingNativeCredential) {
 nextProfile = {
 ...nextProfile,
 credentialSource: 'native_host',
 credentialAlias: v17SanitizeCredentialAlias(nextProfile.credentialAlias || previousProfile?.credentialAlias, profileId),
 credentialLabel: String(draftSecret?.label || nextProfile.credentialLabel || previousSecret?.label || '').trim(),
 };
 nextSecretsDraft[profileId] = {
 tradingKey: '',
 tradingSecret: '',
 label: nextProfile.credentialLabel,
 updatedAt: Number(draftSecret?.updatedAt || previousSecret?.updatedAt || Date.now()) || Date.now(),
 };
 } else {
 nextProfile = {
 ...nextProfile,
 credentialSource: 'extension',
 credentialLabel: String(draftSecret?.label || nextProfile.credentialLabel || '').trim(),
 };
 }

 nextProfiles.push(nextProfile);
 }

 for (const previousProfile of previousProfiles) {
 const profileId = String(previousProfile?.id || '').trim();
 if (!profileId || nextProfileIds.has(profileId)) continue;
 if (v17UsesNativeCredential(previousProfile)) {
 await v17DeleteNativeCredential(previousProfile);
 }
 }

 const nextMetadata = sanitizeAccountMetadata({
 ...requestedMetadata,
 profiles: nextProfiles,
 updatedAt: Number(requestedMetadata?.updatedAt || Date.now()) || Date.now(),
 });
 const nextSecrets = sanitizeAccountSecrets(nextSecretsDraft, nextMetadata.profiles);
 await Promise.all([
 storeLocalSet({ [V16_ACCOUNT_METADATA_KEY]: nextMetadata }),
 storeSessionSet({ [V16_ACCOUNT_SECRETS_KEY]: nextSecrets }),
 ]);
 await v16RemoveLegacyLocalSecrets();
 return { metadata: nextMetadata, secrets: nextSecrets };
 });
}

async function v16ArmAutoTradeDailyLossKillSwitch(dailyLoss = 0, limitUSD = 0, now = Date.now()) {
 const absoluteLoss = Math.abs(Number(dailyLoss || 0));
 const absoluteLimit = Math.abs(Number(limitUSD || 0));
 const killReason = `Daily loss limit hit: $${absoluteLoss.toFixed(2)} >= $${absoluteLimit.toFixed(2)}`;

 await new Promise(resolve => chrome.storage.local.set({
 autoTrade: false,
 autoTradeLastSkipReason: killReason,
 }, resolve));

 try {
 const accountState = await getV16AccountState();
 const nextMetadata = { ...(accountState?.metadata || {}) };
 nextMetadata.killSwitch = {
 enabled: true,
 reason: killReason.slice(0, 140),
 scope: 'global',
 triggeredBy: 'auto-trade-daily-loss',
 updatedAt: now,
 };
 await saveV16AccountState(nextMetadata, null);
 dlog(`[AUTO-TRADE] Disabled + kill switch armed: daily loss $${absoluteLoss.toFixed(2)} >= limit $${absoluteLimit.toFixed(2)}`);
 return { ok: true, reason: killReason, armed: true };
 } catch (error) {
 dlog(`[AUTO-TRADE] Disabled but kill switch failed: ${String(error?.message || error).slice(0, 100)}`);
 return { ok: false, reason: killReason, armed: false, error };
 }
}

async function v16MaybeClearRecoveredDailyLossKillSwitch(dailyLoss = 0, limitUSD = 0, now = Date.now()) {
 const absoluteLoss = Math.abs(Number(dailyLoss || 0));
 const absoluteLimit = Math.abs(Number(limitUSD || 0));
 if (!(absoluteLimit > 0) || absoluteLoss >= absoluteLimit) return { cleared: false };
 try {
 const accountState = await getV16AccountState();
 const nextMetadata = { ...(accountState?.metadata || {}) };
 const killSwitch = sanitizeKillSwitchState(nextMetadata.killSwitch || {});
 if (!killSwitch.enabled || String(killSwitch.triggeredBy || '') !== 'auto-trade-daily-loss') {
 return { cleared: false };
 }
 nextMetadata.killSwitch = {
 enabled: false,
 reason: '',
 scope: killSwitch.scope || 'global',
 triggeredBy: '',
 updatedAt: now,
 };
 await saveV16AccountState(nextMetadata, null);
 await storeLocalSet({ autoTradeLastSkipReason: '' });
 dlog(`[AUTO-TRADE] Cleared stale daily-loss kill switch: current loss $${absoluteLoss.toFixed(2)} is below limit $${absoluteLimit.toFixed(2)}`);
 return { cleared: true };
 } catch (error) {
 dlog(`[AUTO-TRADE] Failed to clear recovered daily-loss kill switch: ${String(error?.message || error).slice(0, 100)}`);
 return { cleared: false, error };
 }
}

function v16BgStartOfLocalDay(ts = 0) {
 const date = new Date(Number(ts || 0) || Date.now());
 date.setHours(0, 0, 0, 0);
 return date.getTime();
}

function v16BgResolveOrderRealizedPnl(order = {}) {
 const realized = Number(order?.realizedPnl || 0);
 if (Number.isFinite(realized) && Math.abs(realized) > 0) return realized;
 if (String(order?.productType || '').toLowerCase() === 'options') return 0;
 const cashflow = Number(order?.cashflow || 0);
 if (Number.isFinite(cashflow) && Math.abs(cashflow) > 0) return cashflow;
 return 0;
}

function v16BgIsClosedRealizedOrder(order = {}) {
 const effectiveRealized = v16BgResolveOrderRealizedPnl(order);
 const text = `${order.explanation || ''} ${order.reason || ''} ${order.state || ''} ${order.role || ''}`.toLowerCase();
 const state = String(order.state || '').toLowerCase();
 const role = String(order.role || '').toLowerCase();
 const isFilled = ['closed', 'filled', 'fully_filled'].includes(state);
 if (String(order?.productType || '').toLowerCase() === 'options') {
 const explicitOptionClose = (
 text.includes('position_closed')
 || text.includes('position closed')
 || text.includes('expire')
 || text.includes('assign')
 || text.includes('exercise')
 || text.includes('settlement')
 );
 if (explicitOptionClose) return true;
 if (order.reduceOnly && isFilled) return true;
 if (role === 'exit' && isFilled) return true;
 return false;
 }
 if (Math.abs(effectiveRealized) > 0) return true;
 if (text.includes('position_closed') || text.includes('position closed')) return true;
 if (role === 'exit' && isFilled) return true;
 return false;
}

function v16BgWalletTransactionRole(tx = {}) {
 const text = `${tx.type || ''} ${tx.meta || ''} ${tx.remark || ''}`.toLowerCase();
 if (text.includes('funding')) return 'funding';
 if (text.includes('deposit')) return 'deposit';
 if (text.includes('withdraw')) return 'withdrawal';
 if (text.includes('liquid')) return 'liquidation_fee';
 if (text.includes('rebate')) return 'rebate';
 if (text.includes('fee') || text.includes('commission')) return 'fee';
 return 'other';
}

function v16BgWalletAdjustmentValue(tx = {}) {
 return Number(tx.amount || tx.commission || 0);
}

function v16BgOrderLiquidationFee(order = {}) {
 const text = `${order.explanation || ''} ${order.reason || ''} ${order.role || ''}`.toLowerCase();
 if (!text.includes('liquid')) return 0;
 return Math.max(0, Math.abs(Number(order.commission || 0)));
}

function v16ComputeSnapshotDailyLoss(snapshot = {}) {
 const rangeStart = v16BgStartOfLocalDay(Date.now());
 const orderHistory = (Array.isArray(snapshot?.orderHistory) ? snapshot.orderHistory : []).filter(order => Number(order.createdAt || 0) >= rangeStart);
 const closedOrders = orderHistory.filter(v16BgIsClosedRealizedOrder);
 const fills = (Array.isArray(snapshot?.fills) ? snapshot.fills : []).filter(fill => Number(fill.createdAt || 0) >= rangeStart);
 const walletTransactions = (Array.isArray(snapshot?.walletTransactions) ? snapshot.walletTransactions : []).filter(item => Number(item.createdAt || 0) >= rangeStart);
 const realized = closedOrders.reduce((sum, order) => sum + Number(v16BgResolveOrderRealizedPnl(order) || 0), 0);
 let fees = 0;
 let rebates = 0;
 fills.forEach(fill => {
 const commission = Number(fill.commission || 0);
 if (commission >= 0) fees += Math.abs(commission);
 else rebates += Math.abs(commission);
 });
 let funding = 0;
 let liquidationFees = 0;
 walletTransactions.forEach(tx => {
 const role = v16BgWalletTransactionRole(tx);
 const amount = v16BgWalletAdjustmentValue(tx);
 if (role === 'funding') funding += amount;
 if (role === 'liquidation_fee') liquidationFees += Math.abs(amount);
 if (role === 'fee' && !fills.length) fees += Math.abs(amount);
 if (role === 'rebate' && !fills.length) rebates += Math.abs(amount);
 });
 orderHistory.forEach(order => {
 liquidationFees += v16BgOrderLiquidationFee(order);
 });
 const netTrading = realized - fees + rebates + funding - liquidationFees;
 return {
 startTs: rangeStart,
 realized: +realized.toFixed(6),
 fees: +fees.toFixed(6),
 rebates: +rebates.toFixed(6),
 funding: +funding.toFixed(6),
 liquidationFees: +liquidationFees.toFixed(6),
 netTrading: +netTrading.toFixed(6),
 used: +Math.max(0, -netTrading).toFixed(6),
 tradeCount: closedOrders.length,
 };
}

async function runV16MarketDataCheck() {
 await detectAPI();
 const tickerMap = await fetchAllTickers();
 const products = await fetchProducts();
 let btcCandleCount = 0;
 for (const symbol of ['BTCUSD', 'BTCUSDT', 'XBTUSD']) {
 try {
 const candles = await fetchCandles(symbol, '1d', 30);
 if (Array.isArray(candles) && candles.length) {
 btcCandleCount = candles.length;
 break;
 }
 } catch (_) { }
 }
 const localData = await storeLocalGet(['lastScan', 'scanResults']);
 return {
 baseUrl: BASE,
 region: detectedRegion,
 tickerCount: Object.keys(tickerMap || {}).length,
 productCount: Array.isArray(products) ? products.length : 0,
 btcCandleCount,
 lastScan: localData?.lastScan || '',
 signalCount: Array.isArray(localData?.scanResults) ? localData.scanResults.length : 0,
 checkedAt: Date.now(),
 };
}

function v16EncodeQuery(query = {}) {
 const params = new URLSearchParams();
 Object.entries(query || {}).forEach(([key, value]) => {
 if (value == null || value === '') return;
 if (Array.isArray(value)) {
 if (!value.length) return;
 params.set(key, value.join(','));
 return;
 }
 params.set(key, String(value));
 });
 const entries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
 return new URLSearchParams(entries).toString();
}

async function v16SignHex(secret, payload) {
 const encoder = new TextEncoder();
 const cryptoKey = await crypto.subtle.importKey(
 'raw',
 encoder.encode(String(secret || '')),
 { name: 'HMAC', hash: 'SHA-256' },
 false,
 ['sign']
 );
 const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(String(payload || '')));
 return Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function v16ExtractResult(payload) {
 if (payload == null) return null;
 if (Array.isArray(payload)) return payload;
 if (typeof payload !== 'object') return payload;
 if (payload.success === false) {
 const code = payload?.error?.code || payload?.error || 'Request failed';
 throw new Error(String(code));
 }
 if (Object.prototype.hasOwnProperty.call(payload, 'result')) return payload.result;
 return payload;
}

function v16TextField(source = {}, keys = [], fallback = '') {
 for (const key of keys) {
 const value = String(source?.[key] || '').trim();
 if (value) return value;
 }
 return fallback;
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
 return Math.round(raw * 1000);
}

function v16RecordTsMs(item = {}) {
 return v16ToEpochMs(
 v16TextField(item, ['created_at', 'updated_at', 'timestamp', 'createdAt', 't'], '') ||
 item?.created_at ||
 item?.updated_at ||
 item?.timestamp ||
 item?.t ||
 0
 );
}

function v16FilterRecordsSince(items = [], cutoffMs = 0) {
 const threshold = Math.max(0, Number(cutoffMs || 0));
 return (items || []).filter(item => v16RecordTsMs(item) >= threshold);
}

function v16UniqueById(items = [], keys = ['id']) {
 const seen = new Set();
 return (items || []).filter(item => {
 const id = keys.map(key => item?.[key]).find(value => value != null && String(value).trim() !== '');
 const stable = String(id ?? JSON.stringify(item || {}));
 if (seen.has(stable)) return false;
 seen.add(stable);
 return true;
 });
}

function v16NormalizeSymbol(value = '') {
 return String(value || '').toUpperCase().trim();
}

function v16FormatDurationShort(ms = 0) {
 const totalSeconds = Math.max(1, Math.ceil(Number(ms || 0) / 1000));
 if (totalSeconds < 60) return `${totalSeconds}s`;
 const minutes = Math.ceil(totalSeconds / 60);
 if (minutes < 60) return `${minutes}m`;
 const hours = Math.ceil(minutes / 60);
 return `${hours}h`;
}

function v16ExtractRetryAfterMs(response) {
 const raw = String(response?.headers?.get?.('retry-after') || '').trim();
 if (!raw) return V16_PRIVATE_RATE_LIMIT_DEFAULT_MS;
 const seconds = Number(raw);
 if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
 const parsedDate = Date.parse(raw);
 if (Number.isFinite(parsedDate) && parsedDate > Date.now()) return parsedDate - Date.now();
 return V16_PRIVATE_RATE_LIMIT_DEFAULT_MS;
}

function v16CreatePrivateFetchError(response, data, text, resolvedBaseUrl, fullPath) {
 const apiError = data?.error?.code || data?.error?.context?.message || data?.error || data?.message || response.statusText || text?.slice?.(0, 180) || 'Request failed';
 const error = new Error(`${response.status || 'ERR'} ${String(apiError)}`);
 error.status = Number(response.status || 0);
 error.baseUrl = resolvedBaseUrl;
 error.path = fullPath;
 if (error.status === 429 || /rate limit|too many/i.test(String(apiError))) {
 error.isRateLimit = true;
 error.retryAfterMs = v16ExtractRetryAfterMs(response);
 }
 return error;
}

function v16WrapPrivateFetchError(label = '', error = null) {
 const wrapped = new Error(`${label}: ${error?.message || 'Request failed'}`);
 wrapped.status = Number(error?.status || 0);
 wrapped.baseUrl = String(error?.baseUrl || '').trim();
 wrapped.path = String(error?.path || '').trim();
 wrapped.isRateLimit = !!error?.isRateLimit;
 wrapped.retryAfterMs = Number(error?.retryAfterMs || 0) || 0;
 return wrapped;
}

async function v16PersistPrivateRateLimitState(meta = null) {
 try {
 await storeLocalSet({ [V16_PRIVATE_RATE_LIMIT_STORAGE_KEY]: meta });
 } catch (_) { }
}

async function v16RestorePrivateRateLimitState() {
 try {
 const stored = (await storeLocalGet(V16_PRIVATE_RATE_LIMIT_STORAGE_KEY))?.[V16_PRIVATE_RATE_LIMIT_STORAGE_KEY];
 const profileId = String(stored?.profileId || '').trim();
 const until = Number(stored?.until || 0);
 if (profileId && until > Date.now()) {
 v16PrivateRateLimitState.set(profileId, {
 ...stored,
 active: true,
 waitMs: Math.max(1000, until - Date.now()),
 });
 v16PrivateRateLimitNotifiedUntil.set(profileId, until);
 return;
 }
 if (stored) await v16PersistPrivateRateLimitState(null);
 } catch (_) { }
}

function v16GetActivePrivateRateLimit(cacheKey = '') {
 const current = v16PrivateRateLimitState.get(String(cacheKey || ''));
 if (!current) return null;
 if (Number(current.until || 0) <= Date.now()) {
 v16PrivateRateLimitState.delete(String(cacheKey || ''));
 return null;
 }
 return {
 ...current,
 active: true,
 waitMs: Math.max(1000, Number(current.until || 0) - Date.now()),
 };
}

function v16BuildCachedSnapshotResponse(cacheEntry = null, rateLimit = null) {
 if (!cacheEntry?.snapshot) return null;
 return {
 ...cacheEntry.snapshot,
 cached: true,
 cacheAgeMs: Math.max(0, Date.now() - Number(cacheEntry.fetchedAt || 0)),
 rateLimit: rateLimit || null,
 };
}

async function v16ApplyPrivateRateLimit(profile = {}, cacheKey = '', error = null) {
 const previous = v16PrivateRateLimitState.get(String(cacheKey || '')) || {};
 const waitMs = Math.max(5000, Number(error?.retryAfterMs || 0) || V16_PRIVATE_RATE_LIMIT_DEFAULT_MS);
 const until = Math.max(Date.now() + waitMs, Number(previous.until || 0));
 const meta = {
 active: true,
 profileId: String(cacheKey || profile?.id || ''),
 profileName: String(profile?.name || profile?.desk || 'Active profile'),
 baseUrl: String(error?.baseUrl || previous.baseUrl || '').trim(),
 until,
 waitMs: Math.max(1000, until - Date.now()),
 updatedAt: Date.now(),
 message: error?.message || previous.message || '429 Too Many Requests',
 };
 v16PrivateRateLimitState.set(String(cacheKey || ''), meta);
 await v16PersistPrivateRateLimitState(meta);
 const notifiedUntil = Number(v16PrivateRateLimitNotifiedUntil.get(String(cacheKey || '')) || 0);
 if (until > notifiedUntil + 1000) {
 v16PrivateRateLimitNotifiedUntil.set(String(cacheKey || ''), until);
 try {
 chrome.notifications.create(`v16_private_rate_limit_${cacheKey}_${meta.updatedAt}`, {
 type: 'basic',
 iconUrl: 'icons/icon48.png',
 title: 'Delta private API cooling down',
 message: `${meta.profileName}: pausing refresh for ${v16FormatDurationShort(meta.waitMs)} and using cached data when available.`,
 priority: 1,
 });
 } catch (_) { }
 }
 return meta;
}

function v16BuildPrivateAccessArgs(access = {}) {
 if (access?.useNativeHost) {
 return {
 profileId: String(access?.profileId || access?.profile?.id || '').trim(),
 credentialAlias: v17SanitizeCredentialAlias(access?.credentialAlias, access?.profileId || access?.profile?.id),
 };
 }
 return {
 key: String(access?.tradingKey || '').trim(),
 secret: String(access?.tradingSecret || '').trim(),
 };
}

async function v16SignedFetch({ key, secret, profileId = '', credentialAlias = '', method = 'GET', path = '', query = null, body = null, baseUrl = '' }) {
 const tradingKey = String(key || '').trim();
 const tradingSecret = String(secret || '').trim();
 const alias = String(credentialAlias || '').trim();
 if ((!tradingKey || !tradingSecret) && alias) {
 const response = await v17RunNativePrivateFetch({
 profileId,
 credentialAlias: alias,
 method,
 path,
 query,
 body,
 baseUrl,
 });
 return v16ExtractResult(response?.raw ?? response?.data ?? null);
 }

 await detectAPI();
 const upperMethod = String(method || 'GET').toUpperCase();
 const rawPath = String(path || '').trim() || '/';
 const apiPath = rawPath.startsWith('/v2') ? (rawPath.slice(3) || '/') : rawPath;
 const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
 const requestPath = `/v2${normalizedPath}`;
 const resolvedBaseUrl = String(baseUrl || BASE || '').trim() || API_INDIA;
 const queryString = v16EncodeQuery(query || {});
 const fullPath = `${normalizedPath}${queryString ? `?${queryString}` : ''}`;
 const payload = body ? JSON.stringify(body) : '';
 const timestamp = String(Math.floor(Date.now() / 1000));
 const signature = await v16SignHex(tradingSecret, `${upperMethod}${timestamp}${requestPath}${queryString ? `?${queryString}` : ''}${payload}`);
 const response = await fetch(`${resolvedBaseUrl}${fullPath}`, {
 method: upperMethod,
 headers: {
 Accept: 'application/json',
 'Content-Type': 'application/json',
 'User-Agent': 'FWD-TradeDesk-Pro-v17',
 'api-key': tradingKey,
 timestamp,
 signature,
 },
 body: payload || undefined,
 });
 const text = await response.text();
 let data = null;
 try {
 data = text ? JSON.parse(text) : null;
 } catch (_) {
 data = text;
 }
 if (!response.ok) {
 const error = v16CreatePrivateFetchError(response, data, text, resolvedBaseUrl, fullPath);
 if (typeof dlog === 'function') dlog(`v16 private request failed ${resolvedBaseUrl}${fullPath} -> ${error.status || response.status} ${String(error.message).slice(0, 180)}`);
 throw error;
 }
 return v16ExtractResult(data);
}

async function v16SignedFetchWithMeta({ key, secret, profileId = '', credentialAlias = '', method = 'GET', path = '', query = null, body = null, baseUrl = '' }) {
 const tradingKey = String(key || '').trim();
 const tradingSecret = String(secret || '').trim();
 const alias = String(credentialAlias || '').trim();
 if ((!tradingKey || !tradingSecret) && alias) {
 const response = await v17RunNativePrivateFetch({
 profileId,
 credentialAlias: alias,
 method,
 path,
 query,
 body,
 baseUrl,
 });
 const raw = response?.raw ?? response?.data ?? null;
 return {
 result: v16ExtractResult(raw),
 meta: response?.meta ?? (raw && typeof raw === 'object' ? (raw.meta || null) : null),
 raw,
 };
 }

 await detectAPI();
 const upperMethod = String(method || 'GET').toUpperCase();
 const rawPath = String(path || '').trim() || '/';
 const apiPath = rawPath.startsWith('/v2') ? (rawPath.slice(3) || '/') : rawPath;
 const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
 const requestPath = `/v2${normalizedPath}`;
 const resolvedBaseUrl = String(baseUrl || BASE || '').trim() || API_INDIA;
 const queryString = v16EncodeQuery(query || {});
 const fullPath = `${normalizedPath}${queryString ? `?${queryString}` : ''}`;
 const payload = body ? JSON.stringify(body) : '';
 const timestamp = String(Math.floor(Date.now() / 1000));
 const signature = await v16SignHex(tradingSecret, `${upperMethod}${timestamp}${requestPath}${queryString ? `?${queryString}` : ''}${payload}`);
 const abortController = new AbortController();
 const fetchTimer = setTimeout(() => abortController.abort(), V16_PRIVATE_REQUEST_TIMEOUT_MS);
 let response;
 try {
 response = await fetch(`${resolvedBaseUrl}${fullPath}`, {
 method: upperMethod,
 headers: {
 Accept: 'application/json',
 'Content-Type': 'application/json',
 'User-Agent': 'FWD-TradeDesk-Pro-v17',
 'api-key': tradingKey,
 timestamp,
 signature,
 },
 body: payload || undefined,
 signal: abortController.signal,
 });
 } catch (fetchErr) {
 clearTimeout(fetchTimer);
 const msg = fetchErr?.name === 'AbortError' ? 'The read operation timed out' : (fetchErr?.message || 'Network error');
 if (typeof dlog === 'function') dlog(`v17 native private request failed ${resolvedBaseUrl}${fullPath} -> ERR ${msg}`);
 const err = new Error(msg);
 err.status = 0;
 err.isTimeout = true;
 throw err;
 }
 clearTimeout(fetchTimer);
 const text = await response.text();
 let data = null;
 try {
 data = text ? JSON.parse(text) : null;
 } catch (_) {
 data = text;
 }
 if (!response.ok) {
 const error = v16CreatePrivateFetchError(response, data, text, resolvedBaseUrl, fullPath);
 error.isServerError = response.status >= 500;
 if (typeof dlog === 'function') dlog(`v16 private request failed ${resolvedBaseUrl}${fullPath} -> ${error.status || response.status} ${String(error.message).slice(0, 180)}`);
 throw error;
 }
 return {
 result: v16ExtractResult(data),
 meta: data && typeof data === 'object' ? (data.meta || null) : null,
 raw: data,
 };
}

function v16ResolveNextCursor(meta = {}, currentCursor = null) {
 const currentKey = String(currentCursor?.key || '').trim();
 const currentValue = String(currentCursor?.value || '').trim();
 const candidates = [
 { key: 'after', value: meta?.after },
 { key: 'after', value: meta?.next },
 { key: 'after', value: meta?.next_cursor },
 { key: 'after', value: meta?.cursor },
 { key: 'after', value: meta?.pagination?.after },
 { key: 'after', value: meta?.page?.after },
 { key: 'before', value: meta?.before },
 { key: 'before', value: meta?.prev },
 { key: 'before', value: meta?.previous_cursor },
 { key: 'before', value: meta?.pagination?.before },
 { key: 'before', value: meta?.page?.before },
 ];
 const next = candidates
 .map(entry => ({ key: entry.key, value: String(entry.value || '').trim() }))
 .find(entry => entry.value && !(entry.key === currentKey && entry.value === currentValue));
 return next || null;
}

async function v16FetchPaginatedPrivateList({
 key,
 secret,
 profileId = '',
 credentialAlias = '',
 path = '',
 query = {},
 baseUrl = '',
 dedupeKeys = ['id'],
 maxPages = V16_PRIVATE_HISTORY_MAX_PAGES,
}) {
 const pageSize = Math.max(1, Math.min(50, Number(query?.page_size || V16_PRIVATE_HISTORY_PAGE_SIZE) || V16_PRIVATE_HISTORY_PAGE_SIZE));
 const baseQuery = { ...(query || {}), page_size: pageSize };
 let cursor = null;
 let pages = 0;
 let items = [];

 while (pages < maxPages) {
 const pageQuery = { ...baseQuery };
 if (cursor?.key && cursor?.value) pageQuery[cursor.key] = cursor.value;
 let envelope;
 try {
 envelope = await v16SignedFetchWithMeta({
 key,
 secret,
 profileId,
 credentialAlias,
 method: 'GET',
 path,
 query: pageQuery,
 baseUrl,
 });
 } catch (pageErr) {
 // On 500 or timeout mid-pagination, return what we have so far instead of failing entirely
 if ((pageErr?.isServerError || pageErr?.isTimeout) && items.length) break;
 throw pageErr;
 }
 const pageItems = Array.isArray(envelope?.result)
 ? envelope.result
 : (envelope?.result ? [envelope.result] : []);
 items = items.concat(pageItems);
 pages += 1;
 const nextCursor = v16ResolveNextCursor(envelope?.meta || {}, cursor);
 if (!pageItems.length || !nextCursor) break;
 cursor = nextCursor;
 }

 return {
 items: v16UniqueById(items, dedupeKeys),
 pages,
 pageSize,
 };
}

function v16SelectBestHistoryAttempt(attempts = []) {
 return (attempts || [])
 .filter(attempt => !attempt.error)
 .sort((a, b) => {
 const filteredDelta = Number(b.filteredCount || 0) - Number(a.filteredCount || 0);
 if (filteredDelta) return filteredDelta;
 const rawDelta = Number(b.rawCount || 0) - Number(a.rawCount || 0);
 if (rawDelta) return rawDelta;
 return Number(b.pages || 0) - Number(a.pages || 0);
 })[0] || null;
}

async function v16FetchPrivateHistoryWindow({
 key,
 secret,
 profileId = '',
 credentialAlias = '',
 path = '',
 cutoffMs = 0,
 baseUrl = '',
 dedupeKeys = ['id'],
 maxPages = V16_PRIVATE_HISTORY_MAX_PAGES,
}) {
 const baseQuery = { page_size: V16_PRIVATE_HISTORY_PAGE_SIZE };
 const attempts = [];
 const strategies = [
 { label: 'start_time_us', query: { ...baseQuery, start_time: Math.max(0, Number(cutoffMs || 0)) * 1000 }, filterClientSide: false },
 { label: 'start_time_ms', query: { ...baseQuery, start_time: Math.max(0, Number(cutoffMs || 0)) }, filterClientSide: false },
 { label: 'recent_window', query: { ...baseQuery }, filterClientSide: true },
 ];

 for (const strategy of strategies) {
 try {
 const result = await v16FetchPaginatedPrivateList({
 key,
 secret,
 profileId,
 credentialAlias,
 path,
 query: strategy.query,
 baseUrl,
 dedupeKeys,
 maxPages,
 });
 const rawItems = Array.isArray(result?.items) ? result.items : [];
 const filteredItems = strategy.filterClientSide
 ? v16FilterRecordsSince(rawItems, cutoffMs)
 : rawItems;
 const attempt = {
 label: strategy.label,
 items: filteredItems,
 rawItems,
 filteredCount: filteredItems.length,
 rawCount: rawItems.length,
 pages: Number(result?.pages || 0),
 };
 attempts.push(attempt);
 if (filteredItems.length) break;
 } catch (error) {
 attempts.push({
 label: strategy.label,
 items: [],
 rawItems: [],
 filteredCount: 0,
 rawCount: 0,
 pages: 0,
 error: error?.message || 'Request failed',
 });
 if (error?.isRateLimit) throw error;
 // Fast-fail: don't retry other strategies if server is down or request timed out
 if (error?.isServerError || error?.isTimeout) break;
 }
 }

 const best = v16SelectBestHistoryAttempt(attempts);
 return {
 items: best?.items || [],
 rawItems: best?.rawItems || [],
 pages: Number(best?.pages || 0),
 strategy: best?.label || '',
 attempts: attempts.map(attempt => ({
 label: attempt.label,
 filteredCount: Number(attempt.filteredCount || 0),
 rawCount: Number(attempt.rawCount || 0),
 pages: Number(attempt.pages || 0),
 error: attempt.error || '',
 })),
 };
}

function v16ResolveProfileAndSecret(state, profileId = '') {
 const metadata = state?.metadata || {};
 const profiles = Array.isArray(metadata.profiles) ? metadata.profiles : [];
 const profile = profiles[0] || null;
 const secret = profile ? (state?.secrets?.[SINGLE_ACCOUNT_PROFILE_ID] || state?.secrets?.[profile.id] || {}) : {};
 return { profile, secret };
}

async function v16FetchPublicTicker(symbol) {
 await detectAPI();
 if (typeof deltaResolvePublicTicker === 'function') {
 const socketTicker = await deltaResolvePublicTicker(symbol, { baseUrl: BASE });
 if (socketTicker?.symbol) return socketTicker;
 }
 const response = await fetch(`${BASE}/tickers/${encodeURIComponent(symbol)}`);
 const payload = await response.json();
 if (!response.ok) {
 throw new Error(payload?.error?.code || payload?.error || payload?.message || 'Ticker request failed');
 }
 return v16ExtractResult(payload);
}

async function runV16PublicTicker(payload = {}) {
 const symbol = v16NormalizeSymbol(payload.symbol || '');
 if (!symbol) throw new Error('Symbol is required');
 const ticker = await v16FetchPublicTicker(symbol);
 const rawTicker = ticker?.raw || ticker;
 return {
 ok: true,
 ticker: {
 symbol,
 markPrice: Number(ticker?.markPrice || rawTicker?.mark_price || rawTicker?.markPrice || rawTicker?.price || rawTicker?.close || rawTicker?.spot_price || 0),
 price: Number(ticker?.price || rawTicker?.price || rawTicker?.close || rawTicker?.mark_price || rawTicker?.markPrice || rawTicker?.spot_price || 0),
 source: ticker?.source || 'rest',
 raw: rawTicker,
 },
 };
}

async function runV16PublicCandles(payload = {}) {
 const symbol = v16NormalizeSymbol(payload.symbol || '');
 if (!symbol) throw new Error('Symbol is required');
 const requestedResolution = String(payload.resolution || '5m').trim();
 const resolution = V16_PUBLIC_CANDLE_RESOLUTIONS.has(requestedResolution) ? requestedResolution : '5m';
 const limit = Math.max(60, Math.min(20000, Number(payload.limit || 180) || 180));
 const keyLevelSettings = v16BgSanitizeKeyLevelSettings(payload.keyLevelSettings || {});
 const startMs = v16ToEpochMs(payload.startTime || payload.startTs || 0);
 const endMs = v16ToEpochMs(payload.endTime || payload.endTs || 0);
 const startSec = startMs > 0 ? Math.floor(startMs / 1000) : 0;
 const endSec = endMs > 0 ? Math.floor(endMs / 1000) : 0;
 const aggregateWeeklyCandles = rows => {
  const weeks = new Map();
  (Array.isArray(rows) ? rows : []).forEach(candle => {
   const ts = Number(candle?.time || 0);
   if (!(ts > 0)) return;
   const date = new Date(ts * 1000);
   const day = date.getUTCDay();
   const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((day + 6) % 7)) / 1000;
   const current = weeks.get(monday) || { time: monday, open: 0, high: 0, low: 0, close: 0, volume: 0 };
   if (!current.open) current.open = Number(candle.open || candle.close || 0);
   current.high = Math.max(Number(current.high || 0), Number(candle.high || candle.close || 0));
   current.low = current.low ? Math.min(Number(current.low || 0), Number(candle.low || candle.close || 0)) : Number(candle.low || candle.close || 0);
   current.close = Number(candle.close || current.close || 0);
   current.volume += Number(candle.volume || 0);
   weeks.set(monday, current);
  });
  return Array.from(weeks.values()).filter(candle => candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0).sort((a, b) => a.time - b.time);
 };
 const candles = resolution === '1w'
 ? aggregateWeeklyCandles(startSec > 0 && endSec > startSec && typeof fetchCandlesRange === 'function'
 ? await fetchCandlesRange(symbol, '1d', startSec, endSec)
 : await fetchCandles(symbol, '1d', Math.min(20000, (limit * 7) + 20), { closedOnly: true })).slice(-limit)
 : startSec > 0 && endSec > startSec && typeof fetchCandlesRange === 'function'
 ? await fetchCandlesRange(symbol, resolution, startSec, endSec)
 : await fetchCandles(symbol, resolution, limit);
 if (!Array.isArray(candles) || !candles.length) {
 throw new Error(`No public candles available for ${symbol} (${resolution})`);
 }
 const normalizedCandles = startSec > 0 && endSec > startSec
 ? candles.slice()
 : candles.slice(-limit);
 const closes = normalizedCandles.map(candle => Number(candle?.close || 0));
 const alignSeries = (series = [], period = 1) => {
 const aligned = new Array(normalizedCandles.length).fill(null);
 const startIndex = Math.max(0, period - 1);
 series.forEach((value, index) => {
 aligned[startIndex + index] = Number.isFinite(Number(value)) ? Number(value) : null;
 });
 return aligned;
 };
 const studies = {
 ema9: alignSeries(emaSeries(closes, 9), 9),
 ema30: alignSeries(emaSeries(closes, 30), 30),
 ema100: alignSeries(emaSeries(closes, 100), 100),
 vwap: Array.isArray(vwap(normalizedCandles)?.series) ? vwap(normalizedCandles).series.map(value => (Number.isFinite(Number(value)) ? Number(value) : null)) : [],
 };
 let keyLevels = null;
 try {
 const currentPrice = Number(normalizedCandles[normalizedCandles.length - 1]?.close || 0);
 const [dayCandles, tf15Candles] = await Promise.all([
 resolution === '1d' && normalizedCandles.length >= 80
 ? Promise.resolve(normalizedCandles.slice(-Math.max(80, Math.min(normalizedCandles.length, 240))))
 : (startSec > 0 && endSec > startSec && typeof fetchCandlesRange === 'function'
 ? fetchCandlesRange(symbol, '1d', Math.max(0, startSec - (200 * 24 * 60 * 60)), endSec)
 : fetchCandles(symbol, '1d', 180)),
 resolution === '15m' && normalizedCandles.length >= 120
 ? Promise.resolve(normalizedCandles.slice(-Math.max(120, Math.min(normalizedCandles.length, 320))))
 : (startSec > 0 && endSec > startSec && typeof fetchCandlesRange === 'function'
 ? fetchCandlesRange(symbol, '15m', Math.max(0, startSec - (360 * 15 * 60)), endSec)
 : fetchCandles(symbol, '15m', 260)),
 ]);
 keyLevels = typeof detectKeyLevels === 'function'
 ? detectKeyLevels(dayCandles || [], tf15Candles || [], currentPrice, keyLevelSettings)
 : null;
 } catch (_) {
 keyLevels = null;
 }
 return {
 ok: true,
 symbol,
 resolution,
 candles: normalizedCandles.map(candle => ({
 time: Number(candle?.time || 0),
 open: Number(candle?.open || 0),
 high: Number(candle?.high || 0),
 low: Number(candle?.low || 0),
 close: Number(candle?.close || 0),
 volume: Number(candle?.volume || 0),
 })),
 studies,
 keyLevels,
 };
}

async function v16ResolveProductBySymbol(symbol) {
 await detectAPI();
 const target = v16NormalizeSymbol(symbol);
 const response = await fetch(`${BASE}/products/${encodeURIComponent(target)}`);
 const payload = await response.json();
 if (!response.ok) {
 throw new Error(payload?.error?.code || payload?.error || payload?.message || `No Delta product found for ${target}`);
 }
 return v16ExtractResult(payload);
}

async function runV16PrivateAccountSnapshot(profileId = '', options = {}) {
 const state = await getV16AccountState();
 const { profile, secret } = v16ResolveProfileAndSecret(state, profileId);
 if (!profile) throw new Error('No active Delta profile found');
 const tradingKey = String(secret?.tradingKey || '').trim();
 const tradingSecret = String(secret?.tradingSecret || '').trim();
 const useNativeHost = v17UsesNativeCredential(profile);
 const credentialAlias = useNativeHost ? v17SanitizeCredentialAlias(profile?.credentialAlias, profile?.id) : '';
 if (!useNativeHost && (!tradingKey || !tradingSecret)) throw new Error('Trading key and secret are required');
 if (useNativeHost && !credentialAlias) throw new Error('Windows credential alias is missing for this profile');
 const requestAuth = useNativeHost
 ? { profileId: profile.id, credentialAlias }
 : { key: tradingKey, secret: tradingSecret };
 const cacheKey = String(profile.id || profileId || 'default');
 const cachedEntry = v16PrivateSnapshotCache.get(cacheKey);
 const activeRateLimit = v16GetActivePrivateRateLimit(cacheKey);
 if (activeRateLimit) {
 const cachedResponse = v16BuildCachedSnapshotResponse(cachedEntry, activeRateLimit);
 if (cachedResponse) return cachedResponse;
 const error = new Error(`Private Delta API cooling down for ${v16FormatDurationShort(activeRateLimit.waitMs)}.`);
 error.isRateLimit = true;
 error.retryAfterMs = activeRateLimit.waitMs;
 throw error;
 }
 if (!options.force && cachedEntry && (Date.now() - Number(cachedEntry.fetchedAt || 0)) < V16_PRIVATE_SNAPSHOT_CACHE_TTL_MS) {
 return v16BuildCachedSnapshotResponse(cachedEntry, null);
 }
 const inFlight = v16PrivateSnapshotInFlight.get(cacheKey);
 if (inFlight) return inFlight;

 const task = (async () => {
 const labeledFetch = (label, request) =>
 request.catch(error => {
 throw v16WrapPrivateFetchError(label, error);
 });
 const todayStart = new Date(v16BgStartOfLocalDay(Date.now()));
 const historyWindowStart = Date.now() - (V16_PRIVATE_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
 const preferredBase = String(cachedEntry?.snapshot?.baseUrl || '').trim();
 const candidateBases = Array.from(new Set([preferredBase, BASE, API_INDIA, API_GLOBAL].filter(Boolean)));
 const snapshots = [];
 let lastError = null;

 for (const candidateBase of candidateBases) {
 try {
 const accountProfile = await labeledFetch(
 'profile',
 v16SignedFetch({ ...requestAuth, method: 'GET', path: '/profile', baseUrl: candidateBase })
 );

 const [walletBalances, marginedPositions, fillHistory, orderHistory, walletTransactions, openOrders] = await Promise.all([
 labeledFetch('wallet balances', v16SignedFetch({ ...requestAuth, method: 'GET', path: '/wallet/balances', baseUrl: candidateBase })),
 labeledFetch('positions', v16SignedFetch({ ...requestAuth, method: 'GET', path: '/positions/margined', baseUrl: candidateBase })),
 labeledFetch(`fills (${V16_PRIVATE_HISTORY_WINDOW_DAYS}d)`, v16FetchPrivateHistoryWindow({
 ...requestAuth,
 path: '/fills',
 cutoffMs: historyWindowStart,
 baseUrl: candidateBase,
 dedupeKeys: ['fill_id', 'id', 'f'],
 })),
 labeledFetch(`order history (${V16_PRIVATE_HISTORY_WINDOW_DAYS}d)`, v16FetchPrivateHistoryWindow({
 ...requestAuth,
 path: '/orders/history',
 cutoffMs: historyWindowStart,
 baseUrl: candidateBase,
 dedupeKeys: ['order_id', 'id', 'client_order_id'],
 })),
 labeledFetch(`wallet transactions (${V16_PRIVATE_HISTORY_WINDOW_DAYS}d)`, v16FetchPrivateHistoryWindow({
 ...requestAuth,
 path: '/wallet/transactions',
 cutoffMs: historyWindowStart,
 baseUrl: candidateBase,
 dedupeKeys: ['id', 'transaction_id', 'tx_id'],
 })),
 labeledFetch('open orders', v16FetchPaginatedPrivateList({
 ...requestAuth,
 path: '/orders',
 query: { page_size: V16_PRIVATE_HISTORY_PAGE_SIZE },
 baseUrl: candidateBase,
 dedupeKeys: ['order_id', 'id', 'client_order_id'],
 maxPages: 4,
 })),
 ]);

 const mergedFills = v16UniqueById(fillHistory?.items || [], ['fill_id', 'id', 'f']);
 const mergedOrders = v16UniqueById([
 ...(Array.isArray(orderHistory?.items) ? orderHistory.items : []),
 ...(Array.isArray(openOrders?.items) ? openOrders.items : []),
 ], ['order_id', 'id', 'client_order_id']);
 const snapshot = {
 baseUrl: candidateBase,
 region: candidateBase === API_GLOBAL ? 'global' : 'india',
 profileId: profile.id,
 fetchedAt: Date.now(),
 todayStart: todayStart.getTime(),
 historyWindowStart,
 historyWindowDays: V16_PRIVATE_HISTORY_WINDOW_DAYS,
 accountProfile,
 walletBalances: Array.isArray(walletBalances) ? walletBalances : [],
 positions: [],
 marginedPositions: Array.isArray(marginedPositions) ? marginedPositions : (marginedPositions ? [marginedPositions] : []),
 fills: mergedFills,
 fillsToday: v16FilterRecordsSince(mergedFills, todayStart.getTime()),
 orderHistory: mergedOrders,
 orderHistoryToday: v16FilterRecordsSince(mergedOrders, todayStart.getTime()),
 walletTransactions: Array.isArray(walletTransactions?.items) ? walletTransactions.items : [],
 walletTransactionsToday: v16FilterRecordsSince(Array.isArray(walletTransactions?.items) ? walletTransactions.items : [], todayStart.getTime()),
 openOrders: Array.isArray(openOrders?.items) ? openOrders.items : [],
 historyPages: {
 fills: Number(fillHistory?.pages || 0),
 orderHistory: Number(orderHistory?.pages || 0),
 walletTransactions: Number(walletTransactions?.pages || 0),
 openOrders: Number(openOrders?.pages || 0),
 },
 historyStrategies: {
 fills: String(fillHistory?.strategy || ''),
 orderHistory: String(orderHistory?.strategy || ''),
 walletTransactions: String(walletTransactions?.strategy || ''),
 },
 historyDiagnostics: {
 fills: {
 rawCount: Number(fillHistory?.rawItems?.length || 0),
 filteredCount: Number(mergedFills.length || 0),
 strategy: String(fillHistory?.strategy || ''),
 attempts: Array.isArray(fillHistory?.attempts) ? fillHistory.attempts : [],
 },
 orderHistory: {
 rawCount: Number(orderHistory?.rawItems?.length || 0),
 filteredCount: Number((Array.isArray(orderHistory?.items) ? orderHistory.items.length : 0) || 0),
 strategy: String(orderHistory?.strategy || ''),
 attempts: Array.isArray(orderHistory?.attempts) ? orderHistory.attempts : [],
 },
 walletTransactions: {
 rawCount: Number(walletTransactions?.rawItems?.length || 0),
 filteredCount: Number((Array.isArray(walletTransactions?.items) ? walletTransactions.items.length : 0) || 0),
 strategy: String(walletTransactions?.strategy || ''),
 attempts: Array.isArray(walletTransactions?.attempts) ? walletTransactions.attempts : [],
 },
 openOrders: {
 rawCount: Number(openOrders?.items?.length || 0),
 pages: Number(openOrders?.pages || 0),
 },
 },
 };
 snapshots.push(snapshot);
 if (typeof dlog === 'function') {
 dlog(`v16 private snapshot ${candidateBase}: wallet=${snapshot.walletBalances.length} positions=${snapshot.marginedPositions.length} fills=${snapshot.fills.length} orders=${snapshot.orderHistory.length} tx=${snapshot.walletTransactions.length} pages[f=${snapshot.historyPages.fills},o=${snapshot.historyPages.orderHistory},w=${snapshot.historyPages.walletTransactions}] strategy[f=${snapshot.historyStrategies.fills || '-'},o=${snapshot.historyStrategies.orderHistory || '-'},w=${snapshot.historyStrategies.walletTransactions || '-'}]`);
 }
 if (
 snapshot.walletBalances.length
 || snapshot.marginedPositions.length
 || snapshot.openOrders.length
 || snapshot.fills.length
 || snapshot.orderHistory.length
 ) {
 break;
 }
 } catch (error) {
 lastError = error;
 const errorStatus = Number(error?.status || 0);
 // F4: Circuit breaker - track consecutive 401/403 auth failures
 if (errorStatus === 401 || errorStatus === 403) {
 try {
 const cbStored = await storeLocalGet(['apiCircuitBreaker']);
 const cbState = cbStored?.apiCircuitBreaker || { failures: 0, pausedAt: 0, reason: '' };
 cbState.failures = Number(cbState.failures || 0) + 1;
 cbState.lastFailureTs = Date.now();
 cbState.reason = `${errorStatus} ${errorStatus === 401 ? 'Unauthorized' : 'Forbidden'} on ${candidateBase}`;
 // Rate-limit 401 logging to prevent filling 500-line dlog buffer
 if (cbState.failures === 1 || cbState.failures === 3 || cbState.failures === 10 || cbState.failures === 50 || cbState.failures === 100) {
 if (typeof dlog === 'function') dlog(`[API] Auth failure #${cbState.failures}: ${errorStatus} on ${candidateBase}`);
 }
 if (cbState.failures >= 3 && !cbState.pausedAt) {
 cbState.pausedAt = Date.now();
 if (typeof dlog === 'function') dlog(`[API] Circuit breaker TRIPPED after ${cbState.failures} consecutive ${errorStatus} errors - auto-trade paused`);
 }
 await storeLocalSet({ apiCircuitBreaker: cbState });
 } catch (_cbErr) { /* best-effort */ }
 } else {
 // Non-auth failure - reset consecutive auth counter (breaker only counts consecutive auth errors)
 try {
 const cbStored = await storeLocalGet(['apiCircuitBreaker']);
 const cbState = cbStored?.apiCircuitBreaker || null;
 const failures = Number(cbState?.failures || 0);
 const pausedAt = Number(cbState?.pausedAt || 0);
 if (failures > 0 && !pausedAt) {
 await storeLocalSet({ apiCircuitBreaker: { failures: 0, pausedAt: 0, reason: '' } });
 }
 } catch (_cbErr) { /* best-effort */ }
 if (typeof dlog === 'function') dlog(`v16 private snapshot failed on ${candidateBase}: ${error?.message || 'unknown error'}`);
 }
 if (error?.isRateLimit) break;
 }
 }

 if (!snapshots.length) throw lastError || new Error('Failed to load private Delta data');

 const bestSnapshot = snapshots.sort((a, b) => {
 const scoreA = (a.marginedPositions.length * 1000) + (a.fills.length * 10) + a.orderHistory.length + (a.walletBalances.length ? 1 : 0);
 const scoreB = (b.marginedPositions.length * 1000) + (b.fills.length * 10) + b.orderHistory.length + (b.walletBalances.length ? 1 : 0);
 return scoreB - scoreA;
 })[0];
 const mergedFills = v16UniqueById(
 snapshots.flatMap(snapshot => snapshot.fills || []),
 ['fill_id', 'id', 'f']
 );
 const mergedOrderHistory = v16UniqueById(
 snapshots.flatMap(snapshot => snapshot.orderHistory || []),
 ['order_id', 'id', 'client_order_id']
 );
 const mergedOpenOrders = v16UniqueById(
 snapshots.flatMap(snapshot => snapshot.openOrders || []),
 ['order_id', 'id', 'client_order_id']
 );
 const mergedWalletTransactions = v16UniqueById(
 snapshots.flatMap(snapshot => snapshot.walletTransactions || []),
 ['id', 'transaction_id', 'tx_id']
 );
 const result = {
 ...bestSnapshot,
 fills: mergedFills,
 fillsToday: v16FilterRecordsSince(mergedFills, todayStart.getTime()),
 orderHistory: mergedOrderHistory,
 orderHistoryToday: v16FilterRecordsSince(mergedOrderHistory, todayStart.getTime()),
 walletTransactions: mergedWalletTransactions,
 walletTransactionsToday: v16FilterRecordsSince(mergedWalletTransactions, todayStart.getTime()),
 openOrders: mergedOpenOrders,
 candidateSnapshots: snapshots.map(snapshot => ({
 baseUrl: snapshot.baseUrl,
 region: snapshot.region,
 positions: snapshot.marginedPositions.length,
 fills: snapshot.fills.length,
 rawFills: Number(snapshot?.historyDiagnostics?.fills?.rawCount || 0),
 orders: snapshot.orderHistory.length,
 rawOrders: Number(snapshot?.historyDiagnostics?.orderHistory?.rawCount || 0),
 walletTransactions: Array.isArray(snapshot.walletTransactions) ? snapshot.walletTransactions.length : 0,
 openOrders: snapshot.openOrders.length,
 fillStrategy: snapshot?.historyStrategies?.fills || '',
 orderStrategy: snapshot?.historyStrategies?.orderHistory || '',
 walletStrategy: snapshot?.historyStrategies?.walletTransactions || '',
 })),
 historyDiagnostics: bestSnapshot.historyDiagnostics || {},
 cached: false,
 cacheAgeMs: 0,
 rateLimit: null,
 };
 const dailyLossSummary = v16ComputeSnapshotDailyLoss(result);
 const autoTradeState = await storeLocalGet(['autoTradeSettings']);
 const dailyLossLimitUSD = Number(sanitizeAutoTradeSettings(autoTradeState?.autoTradeSettings || {}).dailyLossLimitUSD || 0);
 await storeLocalSet({
 autoTradeDailyLoss: Number(dailyLossSummary.used || 0),
 autoTradeDailyResetTs: Number(dailyLossSummary.startTs || Date.now()),
 });
 await v16MaybeClearRecoveredDailyLossKillSwitch(dailyLossSummary.used, dailyLossLimitUSD, Date.now()).catch(() => null);
 v16PrivateSnapshotCache.set(cacheKey, { snapshot: result, fetchedAt: Date.now() });
 if (v16PrivateRateLimitState.has(cacheKey)) {
 v16PrivateRateLimitState.delete(cacheKey);
 await v16PersistPrivateRateLimitState(null);
 }
 // F4: Circuit breaker reset - API is healthy, clear any failure state
 try {
 const cbCheck = await storeLocalGet(['apiCircuitBreaker']);
 if (cbCheck?.apiCircuitBreaker && Number(cbCheck.apiCircuitBreaker.failures || 0) > 0) {
 await storeLocalSet({ apiCircuitBreaker: { failures: 0, pausedAt: 0, reason: '' } });
 if (typeof dlog === 'function') dlog('[API] Circuit breaker reset - API connection restored');
 }
 } catch (_cbErr) { /* best-effort */ }
 return result;
 })().catch(async error => {
 const isRateLimit = !!error?.isRateLimit || /^429\b/.test(String(error?.message || '')) || /rate limit|too many/i.test(String(error?.message || ''));
 if (!isRateLimit) throw error;
 const rateLimitMeta = await v16ApplyPrivateRateLimit(profile, cacheKey, error);
 const cachedResponse = v16BuildCachedSnapshotResponse(cachedEntry || v16PrivateSnapshotCache.get(cacheKey), rateLimitMeta);
 if (cachedResponse) return cachedResponse;
 const friendly = new Error(`Private Delta API cooling down for ${v16FormatDurationShort(rateLimitMeta.waitMs)}. Please wait before refreshing again.`);
 friendly.isRateLimit = true;
 friendly.retryAfterMs = rateLimitMeta.waitMs;
 friendly.baseUrl = rateLimitMeta.baseUrl || '';
 throw friendly;
 }).finally(() => {
 v16PrivateSnapshotInFlight.delete(cacheKey);
 });

 v16PrivateSnapshotInFlight.set(cacheKey, task);
 return task;
}

async function runV16TradeOrderPreview(payload = {}) {
 const symbol = v16NormalizeSymbol(payload.symbol || '');
 if (!symbol) throw new Error('Symbol is required');
 const side = normalizeOrderSide(payload.side || payload.direction || '', 'buy');
 let size = Math.max(1, Math.round(Number(payload.size || (payload.sizeMode === 'usd' ? 0 : 1))));
 const entryMode = String(payload.entryMode || payload.executionMode || '').toLowerCase();
 const orderType = String(payload.orderType || payload.order_type || 'market_order').toLowerCase() === 'limit_order'
 ? 'limit_order'
 : 'market_order';
 const postOnly = orderType === 'limit_order' && (entryMode === 'maker' || entryMode === 'maker_only' || entryMode === 'maker_preferred' || payload.postOnly === true || String(payload.post_only || '').toLowerCase() === 'true');
 const reduceOnly = !!(payload.reduceOnly ?? (String(payload.reduce_only || '').toLowerCase() === 'true'));
 const manualOverride = payload.manualOverride === true || String(payload.manualOverride || '').toLowerCase() === 'true';
 const protections = resolveBracketProtectionLevels(payload);
 if (!manualOverride && !reduceOnly && !hasCompleteBracketProtection(payload)) {
 throw new Error('Stop loss and take profit are required for new live trades');
 }
 const product = await v16ResolveProductBySymbol(symbol);
 if (!product) throw new Error(`No Delta product found for ${symbol}`);
 const tickerMap = await fetchAllTickers().catch(() => ({}));
 const ticker = tickerMap?.[symbol] || await v16FetchPublicTicker(symbol).catch(() => null);
 const markPrice = Number(ticker?.mark_price || ticker?.markPrice || ticker?.price || ticker?.close || ticker?.spot_price || payload.entry || payload.price || 0);
 const entryReference = Number(payload.entry || payload.price || markPrice || 0);
 const limitPrice = Number(payload.limitPrice || payload.limit_price || (orderType === 'limit_order' ? entryReference : 0) || 0);
 const stopLoss = Number(protections.stopLoss || 0);
 const takeProfit = Number(protections.takeProfit || 0);
 const takeProfitLimitPrice = Number(protections.takeProfitLimitPrice || protections.takeProfit || 0);
 if (orderType === 'limit_order' && limitPrice <= 0) throw new Error('Limit price is required for limit orders');
 const valuationPrice = orderType === 'limit_order' && limitPrice > 0 ? limitPrice : markPrice;
 const contractValue = Number(product?.contract_value || product?.contractValue || 1);
 const contractUnitCurrency = v16NormalizeSymbol(product?.contract_unit_currency || product?.contractUnitCurrency || '');
 const underlyingAssetSymbol = v16NormalizeSymbol(product?.underlying_asset?.symbol || product?.underlyingAsset?.symbol || product?.underlying_asset_symbol || product?.underlyingAssetSymbol || '');
 const contractMultiplier = contractUnitCurrency && underlyingAssetSymbol && contractUnitCurrency === underlyingAssetSymbol && contractValue > 0
 ? contractValue
 : 1;
 if (payload.sizeMode === 'usd' && Number(payload.sizeInput) > 0 && valuationPrice > 0) { size = Math.max(1, Math.round(Number(payload.sizeInput) / (valuationPrice * (contractMultiplier || 1)))); }
 const displaySize = size * contractMultiplier;
 const displayUnit = contractMultiplier > 1 && underlyingAssetSymbol ? underlyingAssetSymbol : 'contracts';
 const estimatedNotional = valuationPrice > 0 ? valuationPrice * size * contractMultiplier : 0;
 const requestedNotional = payload.sizeMode === 'usd' ? Number(payload.sizeInput || 0) : 0;
 const estimatedRisk = stopLoss > 0 && entryReference > 0 ? Math.abs(entryReference - stopLoss) * size * contractMultiplier : 0;
 const estimatedReward = takeProfit > 0 && entryReference > 0 ? Math.abs(takeProfit - entryReference) * size * contractMultiplier : 0;
 const riskRewardRatio = estimatedRisk > 0 && estimatedReward > 0 ? (estimatedReward / estimatedRisk) : 0;
 const clientOrderId = `ds_v16_${Date.now().toString(36)}`;
 return {
 ok: true,
 preview: {
 symbol,
 productId: Number(product.id || product.product_id || 0),
 productSymbol: String(product.symbol || product.product_symbol || symbol),
 side,
 size,
 orderType,
 entryMode: postOnly ? 'maker_only' : (orderType === 'limit_order' ? 'limit' : 'market'),
 postOnly,
 limitPrice,
 markPrice,
 entryReference,
 stopLoss,
 takeProfit,
 takeProfitLimitPrice,
 contractValue,
 contractMultiplier,
 displaySize,
 displayUnit,
 requestedNotional,
  estimatedNotional,
 estimatedRisk,
 estimatedReward,
 riskRewardRatio,
 hasBracket: stopLoss > 0 || takeProfit > 0,
 reduceOnly,
 clientOrderId,
 },
 };
}

function v16ResolvePositionActionPayload(payload = {}) {
 const symbol = v16NormalizeSymbol(payload.symbol || '');
 if (!symbol) throw new Error('Symbol is required');
 const positionSide = normalizePositionSide(payload.positionSide || payload.side || '', 'long');
 const action = String(payload.requestedAction || payload.positionAction || payload.action || 'close').toLowerCase();
 const positionSize = Math.abs(Number(payload.positionSize || payload.size || 0));
 const fractionMap = {
 reduce25: 0.25,
 reduce50: 0.5,
 close: 1,
 };
 const fraction = Math.max(0.01, Math.min(1, Number(payload.fraction || fractionMap[action] || 1)));
 const requestedSize = Math.max(0, Number(payload.reduceSize || payload.orderSize || 0));
 const computedSize = requestedSize > 0
 ? requestedSize
 : (positionSize > 0 ? positionSize * fraction : 0);
 const orderSize = Math.max(1, Math.round(computedSize));
 const orderType = String(payload.orderType || payload.order_type || 'market_order').toLowerCase() === 'limit_order'
 ? 'limit_order'
 : 'market_order';
 const entryMode = String(payload.entryMode || payload.entry_mode || (orderType === 'limit_order' ? 'limit' : 'market')).trim().toLowerCase();
 const postOnly = orderType === 'limit_order' && (entryMode === 'maker' || entryMode === 'maker_only' || payload.postOnly === true || String(payload.post_only || '').toLowerCase() === 'true');
 const limitPrice = Math.max(0, Number(payload.limitPrice || payload.limit_price || payload.exitPrice || 0));
 const markPrice = Math.max(0, Number(payload.markPrice || payload.mark_price || payload.price || payload.entry || 0));
 const linkedOrderIds = Array.isArray(payload.linkedOrderIds)
 ? payload.linkedOrderIds.map(value => String(value || '').trim()).filter(Boolean)
 : [];
 const linkedClientOrderIds = Array.isArray(payload.linkedClientOrderIds)
 ? payload.linkedClientOrderIds.map(value => String(value || '').trim()).filter(Boolean)
 : [];
 return {
 action,
 baseUrl: payload.baseUrl || '',
 positionSide,
 positionSize,
 fraction,
 linkedOrderIds,
 linkedClientOrderIds,
 previewPayload: {
 symbol,
 side: positionSide === 'long' ? 'short' : 'long',
 size: orderSize,
 orderType,
 entryMode: postOnly ? 'maker_only' : (orderType === 'limit_order' ? 'limit' : 'market'),
 postOnly,
 entry: orderType === 'limit_order' ? limitPrice : markPrice,
 price: orderType === 'limit_order' ? limitPrice : markPrice,
 limitPrice: orderType === 'limit_order' ? limitPrice : 0,
 stopLoss: 0,
 takeProfit: 0,
 reduceOnly: true,
 baseUrl: payload.baseUrl || '',
 },
 };
}

async function runV16PositionActionPreview(payload = {}) {
 const resolved = v16ResolvePositionActionPayload(payload);
 const preview = await runV16TradeOrderPreview(resolved.previewPayload);
 return {
 ok: true,
 action: resolved.action,
 positionSide: resolved.positionSide,
 positionSize: resolved.positionSize,
 fraction: resolved.fraction,
 preview: {
 ...preview.preview,
 reduceOnly: true,
 },
 };
}

async function runV16ProtectionOrderPreview(payload = {}) {
 const symbol = v16NormalizeSymbol(payload.symbol || '');
 if (!symbol) throw new Error('Symbol is required');
 const kind = String(payload.kind || payload.role || '').toLowerCase() === 'target' ? 'target' : 'stop';
 const positionSide = normalizePositionSide(payload.positionSide || payload.side || '', 'long');
 const size = Math.max(1, Math.round(Number(payload.size || payload.positionSize || 0)));
 const triggerPrice = Number(payload.triggerPrice || payload.stopPrice || payload.stop_price || 0);
 if (triggerPrice <= 0) throw new Error(`${kind === 'stop' ? 'Stop' : 'Target'} trigger price is required`);
 const product = await v16ResolveProductBySymbol(symbol);
 if (!product) throw new Error(`No Delta product found for ${symbol}`);
 const tickerMap = await fetchAllTickers().catch(() => ({}));
 const ticker = tickerMap?.[symbol] || await v16FetchPublicTicker(symbol).catch(() => null);
 const markPrice = Number(ticker?.mark_price || ticker?.markPrice || ticker?.price || ticker?.close || ticker?.spot_price || payload.markPrice || 0);
 const entryPrice = Number(payload.entryPrice || payload.entry || markPrice || 0);
 const side = positionSide === 'long' ? 'sell' : 'buy';
 const stopOrderType = kind === 'stop' ? 'stop_loss_order' : 'take_profit_order';
 const projectedPnl = entryPrice > 0
 ? +(positionSide === 'short' ? (entryPrice - triggerPrice) * size : (triggerPrice - entryPrice) * size).toFixed(4)
 : 0;
 return {
 ok: true,
 preview: {
 symbol,
 productId: Number(product.id || product.product_id || 0),
 productSymbol: String(product.symbol || product.product_symbol || symbol),
 kind,
 stopOrderType,
 side,
 positionSide,
 size,
 triggerPrice,
 entryPrice,
 markPrice,
 projectedPnl,
 reduceOnly: true,
 orderType: 'market_order',
 clientOrderId: `ds_v16_${Date.now().toString(36)}`,
 },
 };
}

async function v16ResolveAuthorizedProfile(payload = {}, options = {}) {
 const tradeRequired = !!options.tradeRequired;
 const state = await getV16AccountState();
 const { profile, secret } = v16ResolveProfileAndSecret(state, payload.profileId);
 if (!profile) throw new Error('No active Delta profile found');
 if (!['ReadOnly', 'TradeEnabled'].includes(String(profile.capability || ''))) {
 throw new Error('ReadOnly or TradeEnabled profile required');
 }
 const tradingKey = String(secret?.tradingKey || '').trim();
 const tradingSecret = String(secret?.tradingSecret || '').trim();
 const useNativeHost = v17UsesNativeCredential(profile);
 const credentialAlias = useNativeHost ? v17SanitizeCredentialAlias(profile?.credentialAlias, profile?.id) : '';
 if (!useNativeHost && (!tradingKey || !tradingSecret)) throw new Error('Trading key and secret are required');
 if (useNativeHost && !credentialAlias) throw new Error('Windows credential alias is missing for this profile');
 const metadata = sanitizeAccountMetadata(state.metadata || {});
 if (tradeRequired) {
 if (metadata.killSwitch?.enabled) throw new Error('Kill switch is armed');
 if (profile.capability !== 'TradeEnabled') throw new Error('TradeEnabled profile required');
 }
 return {
 state,
 profile,
 secret,
 metadata,
 tradingKey,
 tradingSecret,
 useNativeHost,
 credentialAlias,
 profileId: profile.id,
 baseUrl: String(payload.baseUrl || '').trim(),
 };
}

function v16CompactOrderRequestBody(body = {}) {
 return Object.fromEntries(
 Object.entries(body || {}).filter(([, value]) => value != null && value !== '' && !(typeof value === 'number' && !Number.isFinite(value)))
 );
}

function v16InferSnapshotProductType(symbol = '', rawType = '') {
 const typeText = String(rawType || '').trim().toLowerCase();
 if (typeText.includes('option')) return 'options';
 const normalizedSymbol = v16NormalizeSymbol(symbol);
 if (/-\d{1,2}[A-Z]{3}\d{2,4}-/i.test(normalizedSymbol) || /(?:-C|-P)$/i.test(normalizedSymbol)) return 'options';
 return 'futures';
}

function v16ResolveSnapshotProductType(record = {}) {
 const product = record?.product || record?.contract || {};
 const metaData = record?.meta_data || record?.metaData || {};
 const symbol = v16NormalizeSymbol(
 v16TextField(record, ['product_symbol', 'symbol'], v16TextField(product, ['symbol', 'product_symbol', 'code'], v16TextField(metaData, ['symbol', 'product_symbol'], '')))
 );
 const rawType = v16TextField(
 record,
 ['product_type', 'productType'],
 v16TextField(product, ['product_type', 'productType'], v16TextField(metaData, ['product_type', 'productType'], ''))
 );
 return v16InferSnapshotProductType(symbol, rawType);
}

function v16NormalizeWorkingOrder(order = {}) {
 const product = order?.product || order?.contract || {};
 const metaData = order?.meta_data || order?.metaData || {};
 const productSymbol = v16NormalizeSymbol(v16TextField(order, ['product_symbol', 'symbol'], v16TextField(product, ['symbol', 'product_symbol', 'code'], '')));
 const orderType = v16TextField(order, ['order_type', 'type'], v16TextField(metaData, ['order_type', 'type'], 'market_order'));
 const stopOrderType = v16TextField(order, ['stop_order_type', 'stopOrderType'], v16TextField(metaData, ['stop_order_type', 'stopOrderType'], ''));
 const explanationText = v16TextField(order, ['explanation', 'reason', 'close_reason'], v16TextField(metaData, ['explanation', 'reason', 'close_reason'], ''));
 const state = v16TextField(order, ['state', 'status', 'order_state'], v16TextField(metaData, ['state', 'status', 'order_state'], 'open')) || 'open';
 const rawSize = Math.abs(Number(order?.size || order?.qty || order?.quantity || metaData?.size || 0));
 const unfilled = Math.abs(Number(order?.unfilled_size || order?.remaining_size || order?.unfilled_qty || metaData?.unfilled_size || 0));
 const remainingSize = unfilled > 0 ? unfilled : rawSize;
 const reduceOnly = !!(order?.reduce_only ?? metaData?.reduce_only ?? false);
 const postOnly = !!(order?.post_only ?? metaData?.post_only ?? false);
 const limitPrice = Number(order?.limit_price || order?.price || metaData?.limit_price || metaData?.price || 0);
 const stopPrice = Number(order?.stop_price || order?.trigger_price || metaData?.stop_price || metaData?.trigger_price || 0);
 const reason = v16TextField(order, ['reason', 'close_reason'], v16TextField(metaData, ['reason', 'close_reason'], ''));
 let role = 'entry';
 const stopText = `${stopOrderType} ${reason} ${explanationText}`.toLowerCase();
 if (stopText.includes('loss')) role = 'stop_loss';
 else if (stopText.includes('profit') || stopText.includes('target')) role = 'take_profit';
 else if (reduceOnly) role = stopPrice > 0 ? 'stop_loss' : 'exit';
 else if (stopPrice > 0) role = 'unknown';
 const productType = v16InferSnapshotProductType(
 productSymbol,
 v16TextField(order, ['product_type', 'productType'], v16TextField(product, ['product_type', 'productType'], v16TextField(metaData, ['product_type', 'productType'], '')))
 );
 return {
 id: String(order?.id || order?.order_id || order?.client_order_id || ''),
 orderId: String(order?.order_id || order?.id || ''),
 clientOrderId: String(order?.client_order_id || ''),
 productId: Number(order?.product_id || product?.id || product?.product_id || 0),
 productSymbol,
 productType,
 side: String(v16TextField(order, ['side'], 'buy')).toLowerCase() === 'sell' ? 'sell' : 'buy',
 size: rawSize,
 remainingSize,
 partiallyFilled: rawSize > 0 && remainingSize > 0 && remainingSize < rawSize,
 state: String(state || 'open').toLowerCase(),
 orderType: String(orderType || 'market_order').toLowerCase(),
 stopOrderType: String(stopOrderType || '').toLowerCase(),
 limitPrice,
 stopPrice,
 postOnly,
 reduceOnly,
 reason,
 role,
 createdAt: v16RecordTsMs(order),
 updatedAt: v16ToEpochMs(order?.updated_at || order?.updatedAt || order?.timestamp || 0),
 raw: order,
 };
}

function v16IsExecutedWorkingOrderState(state = '') {
 return ['closed', 'filled', 'fully_filled', 'complete', 'completed', 'executed'].includes(String(state || '').toLowerCase());
}

function v16MatchWorkingOrder(order = {}, payload = {}) {
 const orderId = String(payload.orderId || payload.id || '').trim();
 const clientOrderId = String(payload.clientOrderId || '').trim();
 const productSymbol = v16NormalizeSymbol(payload.productSymbol || payload.symbol || '');
 return (
 (orderId && [order.id, order.orderId].includes(orderId))
 || (clientOrderId && String(order.clientOrderId || '') === clientOrderId)
 || (productSymbol && order.productSymbol === productSymbol && String(order.orderId || '') === orderId)
 );
}

async function v16FetchOpenOrdersForPayload(payload = {}, options = {}) {
 const access = await v16ResolveAuthorizedProfile(payload, { tradeRequired: !!options.tradeRequired });
 const openOrders = await v16FetchPaginatedPrivateList({
 ...v16BuildPrivateAccessArgs(access),
 path: '/orders',
 query: { page_size: V16_PRIVATE_HISTORY_PAGE_SIZE },
 baseUrl: access.baseUrl,
 dedupeKeys: ['order_id', 'id', 'client_order_id'],
 maxPages: 8,
 });
 const items = Array.isArray(openOrders?.items) ? openOrders.items : [];
 return {
 ...access,
 openOrders: items,
 pages: Number(openOrders?.pages || 0),
 };
}

function v16BuildEntryOrderLockKey(access = {}, preview = {}) {
 const profileId = String(access.profileId || access.profile?.id || SINGLE_ACCOUNT_PROFILE_ID).trim() || SINGLE_ACCOUNT_PROFILE_ID;
 const symbol = v16NormalizeSymbol(preview.symbol || preview.productSymbol || '');
 return symbol ? `${profileId}:${symbol}` : '';
}

function v16FormatDuplicateEntryReason(symbol = '', source = 'existing exposure') {
 return `${v16NormalizeSymbol(symbol)} already has ${source}. New entry order blocked to avoid duplicate position.`;
}

async function v16AssertNoExistingEntryExposure(access = {}, preview = {}) {
 if (!preview || preview.reduceOnly) return;
 const symbol = v16NormalizeSymbol(preview.symbol || preview.productSymbol || '');
 if (!symbol) return;
 const requestAuth = v16BuildPrivateAccessArgs(access);
 const [positionsRaw, openOrdersRaw] = await Promise.all([
 v16SignedFetch({
 ...requestAuth,
 method: 'GET',
 path: '/positions/margined',
 baseUrl: access.baseUrl,
 }).catch(error => {
 error.source = 'positions';
 throw error;
 }),
 v16FetchPaginatedPrivateList({
 ...requestAuth,
 path: '/orders',
 query: { page_size: V16_PRIVATE_HISTORY_PAGE_SIZE },
 baseUrl: access.baseUrl,
 dedupeKeys: ['order_id', 'id', 'client_order_id'],
 maxPages: 4,
 }).catch(error => {
 error.source = 'orders';
 throw error;
 }),
 ]);
 const positions = (Array.isArray(positionsRaw) ? positionsRaw : (positionsRaw ? [positionsRaw] : []))
 .map(position => v16NormalizeAutoTradePosition(position))
 .filter(position => position.symbol === symbol && Number(position.size || 0) > 0);
 if (positions.length) {
 throw new Error(v16FormatDuplicateEntryReason(symbol, 'an open exchange position'));
 }
 const openOrders = (Array.isArray(openOrdersRaw?.items) ? openOrdersRaw.items : [])
 .map(order => v16NormalizeWorkingOrder(order))
 .filter(order => order.productSymbol === symbol
 && order.productType === 'futures'
 && !order.reduceOnly
 && ['open', 'pending'].includes(String(order.state || '').toLowerCase()));
 if (openOrders.length) {
 throw new Error(v16FormatDuplicateEntryReason(symbol, 'a pending/open entry order'));
 }
}

function v16BuildOrderEditDraft(order = {}, payload = {}) {
 const requestedSize = Number(payload.size || payload.remainingSize || 0);
 const requestedLimitPrice = Number(payload.limitPrice || payload.limit_price || 0);
 const requestedStopPrice = Number(payload.stopPrice || payload.triggerPrice || payload.stop_price || payload.trigger_price || 0);
 return {
 size: requestedSize > 0 ? Math.max(1, Math.round(requestedSize)) : Math.max(1, Math.round(Number(order.remainingSize || order.size || 1))),
 limitPrice: requestedLimitPrice > 0 ? requestedLimitPrice : Number(order.limitPrice || 0),
 stopPrice: requestedStopPrice > 0 ? requestedStopPrice : Number(order.stopPrice || 0),
 postOnly: Object.prototype.hasOwnProperty.call(payload, 'postOnly') ? !!payload.postOnly : !!order.postOnly,
 reduceOnly: Object.prototype.hasOwnProperty.call(payload, 'reduceOnly') ? !!payload.reduceOnly : !!order.reduceOnly,
 };
}

function v16BuildOrderEditPreview(order = {}, payload = {}) {
 const normalized = v16NormalizeWorkingOrder(order);
 if (!['open', 'pending'].includes(normalized.state)) {
 throw new Error('Only open or pending orders can be edited');
 }
 const draft = v16BuildOrderEditDraft(normalized, payload);
 const changes = [];
 if (draft.size !== Math.round(Number(normalized.remainingSize || normalized.size || 0))) changes.push('size');
 if (Math.abs(Number(draft.limitPrice || 0) - Number(normalized.limitPrice || 0)) > 1e-10) changes.push('limit_price');
 if (Math.abs(Number(draft.stopPrice || 0) - Number(normalized.stopPrice || 0)) > 1e-10) changes.push('stop_price');
 if (!!draft.postOnly !== !!normalized.postOnly) changes.push('post_only');
 if (!!draft.reduceOnly !== !!normalized.reduceOnly) changes.push('reduce_only');
 const mode = normalized.partiallyFilled ? 'cancel_replace' : 'update';
 const updateBody = v16CompactOrderRequestBody({
 id: normalized.orderId || normalized.id,
 order_id: normalized.orderId || normalized.id,
 product_id: normalized.productId || undefined,
 client_order_id: normalized.clientOrderId || undefined,
 size: draft.size,
 limit_price: normalized.orderType === 'limit_order' || draft.limitPrice > 0 ? Number(draft.limitPrice || 0) : undefined,
 stop_price: normalized.stopPrice > 0 || draft.stopPrice > 0 || normalized.stopOrderType ? Number(draft.stopPrice || 0) : undefined,
 post_only: normalized.orderType === 'limit_order' ? !!draft.postOnly : undefined,
 reduce_only: !!draft.reduceOnly,
 });
 const replacementBody = v16CompactOrderRequestBody({
 product_id: normalized.productId,
 size: draft.size,
 side: normalized.side,
 order_type: normalized.orderType,
 stop_order_type: normalized.stopOrderType || undefined,
 reduce_only: !!draft.reduceOnly,
 post_only: normalized.orderType === 'limit_order' ? !!draft.postOnly : undefined,
 limit_price: normalized.orderType === 'limit_order' || draft.limitPrice > 0 ? Number(draft.limitPrice || 0) : undefined,
 stop_price: normalized.stopPrice > 0 || draft.stopPrice > 0 || normalized.stopOrderType ? Number(draft.stopPrice || 0) : undefined,
 time_in_force: 'gtc',
 client_order_id: `ds_v16_${Date.now().toString(36)}`,
 });
 return {
 ok: true,
 order: normalized,
 draft,
 changes,
 mode,
 canEditInPlace: mode === 'update',
 updateBody,
 replacementBody,
 warning: !changes.length
 ? 'No changes detected.'
 : (mode === 'cancel_replace' ? 'Order will be cancelled and replaced because Delta may reject an in-place edit for partially filled orders.' : ''),
 };
}

async function runV16GetOpenOrderBook(payload = {}) {
 const snapshot = await v16FetchOpenOrdersForPayload(payload, { tradeRequired: false });
 return {
 ok: true,
 fetchedAt: Date.now(),
 baseUrl: snapshot.baseUrl,
 openOrders: snapshot.openOrders,
 pages: snapshot.pages,
 };
}

async function runV16GetOrderEditPreview(payload = {}) {
 const snapshot = await v16FetchOpenOrdersForPayload(payload, { tradeRequired: false });
 const target = snapshot.openOrders.find(order => v16MatchWorkingOrder(v16NormalizeWorkingOrder(order), payload));
 if (!target) throw new Error('Open order not found');
 return v16BuildOrderEditPreview(target, payload);
}

async function v16DeleteOrderOnDelta(access, order = {}) {
 return v16SignedFetch({
 ...v16BuildPrivateAccessArgs(access),
 method: 'DELETE',
 path: '/orders',
 body: v16CompactOrderRequestBody({
 id: order.orderId || order.id,
 order_id: order.orderId || order.id,
 product_id: order.productId || undefined,
 client_order_id: order.clientOrderId || undefined,
 }),
 baseUrl: access.baseUrl,
 });
}

async function v16PostReplacementOrder(access, preview = {}) {
 return v16SignedFetch({
 ...v16BuildPrivateAccessArgs(access),
 method: 'POST',
 path: '/orders',
 body: v16CompactOrderRequestBody(preview.replacementBody || {}),
 baseUrl: access.baseUrl,
 });
}

async function runV16UpdateOrder(payload = {}) {
 const access = await v16ResolveAuthorizedProfile(payload, { tradeRequired: true });
 const previewEnvelope = await runV16GetOrderEditPreview(payload);
 if (!previewEnvelope.changes.length) {
 const currentOpenOrders = await runV16GetOpenOrderBook(payload);
 return {
 mode: previewEnvelope.mode,
 orderId: previewEnvelope.order.orderId || previewEnvelope.order.id,
 warning: previewEnvelope.warning || 'No changes detected.',
 result: null,
 openOrders: currentOpenOrders.openOrders,
 };
 }
 let mode = previewEnvelope.mode;
 let result = null;
 let replacementOrderId = '';
 let warning = previewEnvelope.warning || '';
 if (mode === 'update') {
 try {
 result = await v16SignedFetch({
 ...v16BuildPrivateAccessArgs(access),
 method: 'PUT',
 path: '/orders',
 body: previewEnvelope.updateBody,
 baseUrl: access.baseUrl,
 });
 } catch (error) {
 mode = 'cancel_replace';
 warning = `Delta rejected in-place edit: ${error?.message || 'request failed'}. Falling back to cancel and replace.`;
 }
 }
 if (mode === 'cancel_replace') {
 await v16DeleteOrderOnDelta(access, previewEnvelope.order);
 result = await v16PostReplacementOrder(access, previewEnvelope);
 replacementOrderId = String(result?.id || result?.order_id || result?.client_order_id || '');
 }
 const refreshed = await runV16GetOpenOrderBook(payload);
 return {
 mode,
 orderId: previewEnvelope.order.orderId || previewEnvelope.order.id,
 replacementOrderId,
 warning,
 result,
 openOrders: refreshed.openOrders,
 };
}

async function runV16CancelOrder(payload = {}) {
 const access = await v16ResolveAuthorizedProfile(payload, { tradeRequired: true });
 const previewEnvelope = await runV16GetOrderEditPreview(payload);
 const result = await v16DeleteOrderOnDelta(access, previewEnvelope.order);
 const refreshed = await runV16GetOpenOrderBook(payload);
 return {
 orderId: previewEnvelope.order.orderId || previewEnvelope.order.id,
 result,
 openOrders: refreshed.openOrders,
 };
}

async function runV16CancelLinkedOrders(payload = {}) {
 const orderIds = Array.isArray(payload.linkedOrderIds)
 ? payload.linkedOrderIds.map(value => String(value || '').trim()).filter(Boolean)
 : [];
 const clientOrderIds = Array.isArray(payload.linkedClientOrderIds)
 ? payload.linkedClientOrderIds.map(value => String(value || '').trim()).filter(Boolean)
 : [];
 const targets = Array.from(new Set([
 ...orderIds.map(value => ({ orderId: value })),
 ...clientOrderIds.map(value => ({ clientOrderId: value })),
 ].map(item => JSON.stringify(item)))).map(item => JSON.parse(item));
 if (!targets.length) return { canceledCount: 0, results: [] };
 const results = [];
 for (const target of targets) {
 try {
 const result = await runV16CancelOrder({
 ...payload,
 ...target,
 });
 results.push({ ok: true, ...target, result });
 } catch (error) {
 results.push({ ok: false, ...target, error: error?.message || 'Cancel failed' });
 }
 }
 return {
 canceledCount: results.filter(item => item.ok).length,
 results,
 };
}

async function runV16CancelAllOrdersForSymbol(payload = {}) {
 const access = await v16ResolveAuthorizedProfile(payload, { tradeRequired: true });
 let productId = Number(payload.productId || 0);
 let productSymbol = v16NormalizeSymbol(payload.productSymbol || payload.symbol || '');
 if (!productId && productSymbol) {
 const product = await v16ResolveProductBySymbol(productSymbol);
 productId = Number(product?.id || product?.product_id || 0);
 productSymbol = v16NormalizeSymbol(product?.symbol || product?.product_symbol || productSymbol);
 }
 if (!productId && !productSymbol) throw new Error('Symbol or product id is required');
 const beforeSnapshot = await runV16GetOpenOrderBook({
 profileId: access.profileId,
 baseUrl: access.baseUrl,
 });
 const matchingBefore = (Array.isArray(beforeSnapshot?.openOrders) ? beforeSnapshot.openOrders : [])
 .map(order => v16NormalizeWorkingOrder(order))
 .filter(order => (
 (productId > 0 && Number(order.productId || 0) === productId)
 || (productSymbol && order.productSymbol === productSymbol)
 ));
 const result = await v16SignedFetch({
 ...v16BuildPrivateAccessArgs(access),
 method: 'DELETE',
 path: '/orders/all',
 body: v16CompactOrderRequestBody({
 product_id: productId || undefined,
 product_symbol: productSymbol || undefined,
 }),
 baseUrl: access.baseUrl,
 });
 const refreshed = await runV16GetOpenOrderBook(payload);
 return {
 productId,
 productSymbol,
 canceledCount: matchingBefore.length,
 result,
 openOrders: refreshed.openOrders,
 };
}

async function runV16PlaceTradeOrder(payload = {}) {
 const access = await v16ResolveAuthorizedProfile(payload, { tradeRequired: true });

 const previewData = await runV16TradeOrderPreview(payload);
 const preview = previewData.preview;
 const lockKey = v16BuildEntryOrderLockKey(access, preview);
 if (lockKey && !preview.reduceOnly) {
 const activeLock = v16EntryOrderInFlight.get(lockKey);
  if (activeLock && (Date.now() - Number(activeLock.startedAt || 0)) < V16_PRIVATE_REQUEST_TIMEOUT_MS) {
   const acceptedAt = Number(activeLock.acceptedAt || 0);
   const statusText = acceptedAt > 0 ? 'was just accepted by Delta' : 'is already being submitted';
   throw new Error(`${preview.symbol} order ${statusText}. Wait for the position/order list to refresh before pressing Place Order again.`);
  }
  v16EntryOrderInFlight.set(lockKey, { startedAt: Date.now() });
 }
 let orderAccepted = false;
 try {
 const manualOverride = payload.manualOverride === true || String(payload.manualOverride || '').toLowerCase() === 'true';
 const blockedSymbols = new Set(sanitizeBlockedSymbolList(access.profile?.blockedSymbols || []));
 if (!manualOverride && !preview.reduceOnly && blockedSymbols.has(String(preview.symbol || '').trim().toUpperCase())) {
 throw new Error(`${preview.symbol} is blocked for live trading in the active profile`);
 }
 if (!preview.reduceOnly) {
  await v16AssertNoExistingEntryExposure(access, preview);
 }
 const profileCapUSD = Number(access.profile?.maxOrderSizeUSD || 60);
 const requestedCapUSD = Number(payload.maxNotionalUSD || (payload.sizeMode === 'usd' ? payload.sizeInput : 0) || 0);
 const maxOrderUSD = requestedCapUSD > 0 ? Math.min(profileCapUSD, requestedCapUSD) : profileCapUSD;
 const effectiveNotionalUSD = Number(preview.estimatedNotional || 0);
 if (!preview.reduceOnly && effectiveNotionalUSD > maxOrderUSD * 1.05) {
 throw new Error(`Actual order notional $${effectiveNotionalUSD.toFixed(2)} exceeds allowed cap $${maxOrderUSD.toFixed(2)}. Exchange minimum contract size rounded this order above your limit.`);
 }
 const requestBody = {
 product_id: preview.productId,
 size: preview.size,
 side: preview.side,
 order_type: preview.orderType,
 reduce_only: !!preview.reduceOnly,
 post_only: !!preview.postOnly,
 client_order_id: String(payload.clientOrderId || preview.clientOrderId || '').slice(0, 32),
 time_in_force: 'gtc',
 };
 if (preview.orderType === 'limit_order') {
 requestBody.limit_price = Number(preview.limitPrice || 0);
 }
 if (!preview.reduceOnly && Number(preview.stopLoss || 0) > 0) {
 requestBody.bracket_stop_loss_price = Number(preview.stopLoss);
 }
 if (!preview.reduceOnly && Number(preview.takeProfit || 0) > 0) {
 requestBody.bracket_take_profit_price = Number(preview.takeProfit);
 }
 const result = await v16SignedFetch({
 ...v16BuildPrivateAccessArgs(access),
 method: 'POST',
 path: '/orders',
 body: requestBody,
 baseUrl: access.baseUrl,
 });
 orderAccepted = true;
 if (lockKey) v16EntryOrderInFlight.set(lockKey, { startedAt: Date.now(), acceptedAt: Date.now() });

 return {
 placedAt: Date.now(),
 request: requestBody,
 preview,
 profileId: access.profileId,
 baseUrl: access.baseUrl,
 result,
 };
 } finally {
  if (lockKey && !orderAccepted) v16EntryOrderInFlight.delete(lockKey);
 }
}

function v16FormatAutoTradePrice(value = 0) {
 const price = Number(value || 0);
 if (!Number.isFinite(price) || price <= 0) return 'n/a';
 if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
 if (price >= 1) return price.toFixed(4);
 if (price >= 0.01) return price.toFixed(6);
 return price.toFixed(8);
}

function v16FormatAutoTradeTsIST(value = 0) {
 const ts = Number(value || 0);
 if (!(ts > 0)) return 'n/a';
 try {
 return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
 } catch (_) {
 return 'n/a';
 }
}

function v16BuildAutoTradeTargetLadder(entry = {}) {
 return [
 { key: 'tp1', stage: 'tp1', label: 'T1', price: Number(entry?.tp1 || 0) },
 { key: 'tp2', stage: 'tp2', label: 'T2', price: Number(entry?.tp2 || 0) },
 { key: 'tp3', stage: 'tp3', label: 'T3', price: Number(entry?.tp3 || 0) },
 { key: 'tp4', stage: 'tp4', label: 'T4', price: Number(entry?.tp4 || 0) },
 ].filter(level => Number(level.price || 0) > 0).slice(0, 4);
}

function v16ResolveAutoTradeTargetStage(entry = {}) {
 const ladder = v16BuildAutoTradeTargetLadder(entry);
 if (!ladder.length) return { ladder, currentIndex: -1 };
 const explicitStage = String(entry?.targetAutoShiftStage || '').trim().toLowerCase();
 let currentIndex = ladder.findIndex(level => level.stage === explicitStage);
 if (currentIndex >= 0) return { ladder, currentIndex };
 const liveTarget = Number(entry?.tp || entry?.takeProfitLimitPrice || 0);
 if (liveTarget > 0) {
 currentIndex = ladder.findIndex(level => Math.abs(Number(level.price || 0) - liveTarget) < 1e-8);
 if (currentIndex >= 0) return { ladder, currentIndex };
 }
 return { ladder, currentIndex: 0 };
}

function v16ResolveAutoTradeShiftStopPrice(entry = {}, currentIndex = 0, ladder = []) {
 if (currentIndex <= 0) return Number(entry?.entry || 0);
 const priorLevel = ladder[currentIndex - 1] || null;
 return Number(priorLevel?.price || entry?.entry || 0);
}

function v16ApplyExecutionDistance(entryPrice = 0, distance = 0, positionSide = 'long', kind = 'target') {
 const safeEntry = Number(entryPrice || 0);
 const safeDistance = Math.abs(Number(distance || 0));
 if (!(safeEntry > 0) || !(safeDistance > 0)) return 0;
 if (kind === 'stop') {
 return positionSide === 'short'
 ? safeEntry + safeDistance
 : Math.max(0.00000001, safeEntry - safeDistance);
 }
 return positionSide === 'short'
 ? Math.max(0.00000001, safeEntry - safeDistance)
 : safeEntry + safeDistance;
}

function v16BuildExecutionSignal(signal = {}, cfg = {}) {
 const safeCfg = sanitizeAutoTradeSettings(cfg || {});
 const baseDirection = normalizePositionSide(signal?.direction || signal?.side || '', 'long');
 const executionDirection = safeCfg.reverseSignals
 ? (baseDirection === 'short' ? 'long' : 'short')
 : baseDirection;
 const entryPrice = Number(signal?.entry || signal?.price || 0);
 const nextSignal = {
 ...signal,
 direction: executionDirection,
 side: executionDirection === 'short' ? 'sell' : 'buy',
 autoTradeOriginalDirection: baseDirection,
 autoTradeExecutionDirection: executionDirection,
 autoTradeReverseApplied: safeCfg.reverseSignals === true,
 };
 if (!(entryPrice > 0) || !safeCfg.reverseSignals) return nextSignal;

 const stopDistance = Math.abs(entryPrice - Number(signal?.sl || 0));
 const tp1Distance = Math.abs(Number(signal?.tp1 || signal?.tp || 0) - entryPrice);
 const tp2Distance = Math.abs(Number(signal?.tp2 || 0) - entryPrice);
 const tp3Distance = Math.abs(Number(signal?.tp3 || 0) - entryPrice);
 const tp4Distance = Math.abs(Number(signal?.tp4 || 0) - entryPrice);

 if (stopDistance > 0) nextSignal.sl = v16ApplyExecutionDistance(entryPrice, stopDistance, executionDirection, 'stop');
 if (tp1Distance > 0) {
 nextSignal.tp1 = v16ApplyExecutionDistance(entryPrice, tp1Distance, executionDirection, 'target');
 nextSignal.tp = nextSignal.tp1;
 }
 if (tp2Distance > 0) nextSignal.tp2 = v16ApplyExecutionDistance(entryPrice, tp2Distance, executionDirection, 'target');
 if (tp3Distance > 0) nextSignal.tp3 = v16ApplyExecutionDistance(entryPrice, tp3Distance, executionDirection, 'target');
 if (tp4Distance > 0) nextSignal.tp4 = v16ApplyExecutionDistance(entryPrice, tp4Distance, executionDirection, 'target');
 return nextSignal;
}

function v16NormalizeAutoTradePosition(position = {}, priceLookup = new Map()) {
 const productId = v16TextField(position, ['product_id', 'id'], '');
 const symbol = v16NormalizeSymbol(v16TextField(position, ['product_symbol', 'symbol'], productId ? `PRODUCT-${productId}` : ''));
 const sizeValue = Number(position?.size || position?.net_size || position?.balance || 0);
 const size = Math.abs(sizeValue);
 const side = sizeValue < 0 ? 'short' : 'long';
 const entry = Number(position?.entry_price || position?.avg_entry_price || position?.average_entry_price || 0);
 const markPrice = Number(position?.mark_price || position?.current_price || position?.spot_price || position?.close || priceLookup.get(symbol) || 0);
 const createdAt = v16ToEpochMs(v16TextField(position, ['created_at', 'createdAt', 'timestamp']) || position?.created_at || position?.createdAt || position?.timestamp || 0);
 const updatedAt = v16ToEpochMs(v16TextField(position, ['updated_at', 'updatedAt', 'timestamp']) || position?.updated_at || position?.updatedAt || position?.timestamp || 0);
 return {
 id: v16TextField(position, ['id', 'product_id'], symbol),
 symbol,
 side,
 size,
 entry,
 markPrice,
 createdAt,
 updatedAt,
 raw: position,
 };
}

function v16ResolveAutoTradePositionSide(entry = {}) {
 return normalizeOrderSide(entry.side || entry.positionSide || '', 'buy') === 'sell' ? 'short' : 'long';
}

function v16SelectLatestAutoTradeItem(items = []) {
 return (Array.isArray(items) ? items : [])
 .slice()
 .sort((a, b) => {
 const tsA = Number(a?.updatedAt || a?.createdAt || a?.ts || 0);
 const tsB = Number(b?.updatedAt || b?.createdAt || b?.ts || 0);
 return tsB - tsA;
 })[0] || null;
}

function v16IsAutoTradeStopProtectionOrder(order = {}) {
 const role = String(order?.role || '').trim().toLowerCase();
 const stopOrderType = String(order?.stopOrderType || '').trim().toLowerCase();
 if (role === 'stop_loss') return true;
 if (role === 'take_profit') return false;
 if (stopOrderType.includes('take_profit') || stopOrderType.includes('profit') || stopOrderType.includes('target')) return false;
 if (stopOrderType.includes('stop_loss') || stopOrderType.includes('loss')) return true;
 return !!order?.reduceOnly && Number(order?.stopPrice || 0) > 0;
}

function v16IsAutoTradeTargetProtectionOrder(order = {}) {
 const role = String(order?.role || '').trim().toLowerCase();
 const stopOrderType = String(order?.stopOrderType || '').trim().toLowerCase();
 if (role === 'take_profit') return true;
 if (role === 'stop_loss') return false;
 if (stopOrderType.includes('take_profit') || stopOrderType.includes('profit') || stopOrderType.includes('target')) return true;
 if (stopOrderType.includes('stop_loss') || stopOrderType.includes('loss')) return false;
 return !!order?.reduceOnly && Number(order?.limitPrice || 0) > 0 && Number(order?.stopPrice || 0) <= 0;
}

function v16BuildAutoTradeTargetUpdatePayload(profileId = '', targetOrder = {}, newTargetPrice = 0) {
 const payload = {
 profileId,
 orderId: targetOrder.id || targetOrder.orderId,
 };
 const stopOrderType = String(targetOrder?.stopOrderType || '').trim().toLowerCase();
 if (Number(targetOrder?.stopPrice || 0) > 0 || stopOrderType.includes('take_profit') || stopOrderType.includes('profit') || stopOrderType.includes('target')) {
 payload.stopPrice = newTargetPrice;
 } else {
 payload.limitPrice = newTargetPrice;
 }
 return payload;
}

function v16WorkingOrderIdentity(order = {}) {
 return String(order?.orderId || order?.id || order?.clientOrderId || '').trim();
}

function v16ResolveAutoTradeContext(snapshot = {}, entry = {}) {
 const symbol = v16NormalizeSymbol(entry.symbol || '');
 const positionSide = v16ResolveAutoTradePositionSide(entry);
 const exitSide = positionSide === 'long' ? 'sell' : 'buy';
 const priceLookup = new Map();
 const positions = (Array.isArray(snapshot?.marginedPositions) ? snapshot.marginedPositions : [])
 .map(position => v16NormalizeAutoTradePosition(position, priceLookup))
 .filter(position => position.symbol === symbol);
 const matchingPositions = positions.filter(position => position.side === positionSide);
 const normalizedOpenOrders = (Array.isArray(snapshot?.openOrders) ? snapshot.openOrders : [])
 .map(order => v16NormalizeWorkingOrder(order))
 .filter(order => order.productSymbol === symbol);
 const normalizedOrderHistory = (Array.isArray(snapshot?.orderHistory) ? snapshot.orderHistory : [])
 .map(order => v16NormalizeWorkingOrder(order))
 .filter(order => order.productSymbol === symbol);
 const openExitOrders = normalizedOpenOrders.filter(order => order.reduceOnly && order.side === exitSide);
 const stopOrder = v16SelectLatestAutoTradeItem(
 openExitOrders.filter(v16IsAutoTradeStopProtectionOrder)
 );
 const targetOrder = v16SelectLatestAutoTradeItem(
 openExitOrders.filter(v16IsAutoTradeTargetProtectionOrder)
 );
 const entryOrder = v16SelectLatestAutoTradeItem(
 normalizedOpenOrders.filter(order => !order.reduceOnly && (
 (entry.clientOrderId && order.clientOrderId === entry.clientOrderId)
 || order.side === normalizeOrderSide(entry.side || '', 'buy')
 ))
 );
 const recentCloseOrder = v16SelectLatestAutoTradeItem(
 normalizedOrderHistory.filter(order => order.reduceOnly && v16IsExecutedWorkingOrderState(order.state))
 );
 const recentEntryHistory = v16SelectLatestAutoTradeItem(
 normalizedOrderHistory.filter(order => !order.reduceOnly && !['open', 'pending'].includes(String(order.state || '').toLowerCase()))
 );
 return {
 position: v16SelectLatestAutoTradeItem(matchingPositions.length ? matchingPositions : positions),
 entryOrder,
 stopOrder,
 targetOrder,
 recentCloseOrder,
 recentEntryHistory,
 normalizedOpenOrders,
 normalizedOrderHistory,
 };
}

function v16BuildExchangeActiveSymbolMap(snapshot = {}) {
 const activeSymbolMap = new Map();
 (Array.isArray(snapshot?.marginedPositions) ? snapshot.marginedPositions : [])
 .filter(position => Number(position?.size || 0) !== 0)
 .forEach(position => {
 const symbol = v16NormalizeSymbol(position?.symbol || position?.product?.symbol || '');
 if (v16ResolveSnapshotProductType(position) !== 'futures') return;
 if (!symbol || activeSymbolMap.has(symbol)) return;
 activeSymbolMap.set(symbol, {
 source: 'exchange_position',
 side: Number(position?.size || 0) < 0 ? 'short' : 'long',
 status: 'live',
 });
 });
 (Array.isArray(snapshot?.openOrders) ? snapshot.openOrders : [])
 .map(order => v16NormalizeWorkingOrder(order))
 .filter(order => order.productSymbol && order.productType === 'futures' && !order.reduceOnly && ['open', 'pending'].includes(String(order.state || '').toLowerCase()))
 .forEach(order => {
 if (activeSymbolMap.has(order.productSymbol)) return;
 activeSymbolMap.set(order.productSymbol, {
 source: 'exchange_order',
 side: order.side === 'sell' ? 'short' : 'long',
 status: String(order.state || 'pending').toLowerCase(),
 });
 });
 return activeSymbolMap;
}

function v16BuildConcurrentLimitReason(openCount, maxConcurrent) {
 return `Max concurrent reached: ${openCount}/${maxConcurrent} (counts live positions plus pending/open entry orders; reduce-only exits are ignored)`;
}

function v16ResolveSignalBtcCorrelation(signal = {}) {
 const corr = Number(signal?.btcCorr ?? signal?.correlation?.btc ?? signal?.raw?.btcCorr ?? 0);
 return Number.isFinite(corr) ? corr : 0;
}

function v16ResolveExistingCorrelationReference(symbol = '', scanResults = []) {
 const normalized = v16NormalizeSymbol(symbol);
 const match = (Array.isArray(scanResults) ? scanResults : []).find(item => v16NormalizeSymbol(item?.symbol || '') === normalized);
 return match ? v16ResolveSignalBtcCorrelation(match) : 0;
}

function v16BuildCorrelationBlockReason(signal = {}, context = {}) {
 const cfg = sanitizeAutoTradeSettings(context.cfg || {});
 if (cfg.correlationLimitEnabled === false) return '';
 const threshold = Math.max(0.5, Math.min(0.99, Number(cfg.correlationThreshold || 0.9)));
 const maxCorrelatedExposure = Math.max(1, Number(cfg.maxCorrelatedExposure || 1));
 const executionSide = String(context.executionSide || signal.direction || '').toLowerCase().startsWith('short') ? 'short' : 'long';
 const signalCorr = v16ResolveSignalBtcCorrelation(signal);
 if (Math.abs(signalCorr) < threshold) return '';
 const scanResults = Array.isArray(context.scanResults) ? context.scanResults : [];
 const symbols = new Set();
 const collect = item => {
 if (!item) return;
 const symbol = v16NormalizeSymbol(item.symbol || item.product_symbol || '');
 if (!symbol || symbol === v16NormalizeSymbol(signal.symbol || '')) return;
 const side = String(item.side || item.positionSide || item.direction || '').toLowerCase().startsWith('short') ? 'short' : 'long';
 if (side !== executionSide) return;
 const corr = v16ResolveExistingCorrelationReference(symbol, scanResults) || signalCorr;
 if (Math.abs(corr) >= threshold) symbols.add(symbol);
 };
 if (context.openPositionMap instanceof Map) context.openPositionMap.forEach(collect);
 if (context.exchangeActiveSymbolMap instanceof Map) context.exchangeActiveSymbolMap.forEach(collect);
 if (symbols.size >= maxCorrelatedExposure) {
 return `Correlation cap: ${signal.symbol} ${executionSide} is ${Math.round(Math.abs(signalCorr) * 100)}% BTC-correlated with ${Array.from(symbols).slice(0, 3).join(', ')}.`;
 }
 return '';
}

function v16BuildAutoTradeFundingLookup(scanResults = [], fundingHeatmap = []) {
 const lookup = new Map();
 const add = (symbol = '', fundingRate = 0, nextFundingAt = 0, fundingIntervalSeconds = 28800) => {
 const normalized = v16NormalizeSymbol(symbol);
 if (!normalized) return;
 const item = {
 fundingRate: Number(fundingRate || 0),
 nextFundingAt: Number(nextFundingAt || 0),
 fundingIntervalSeconds: Math.max(1, Math.round(Number(fundingIntervalSeconds || 28800))),
 };
 lookup.set(normalized, item);
 const base = normalized.replace(/(USD|USDT)$/, '');
 if (!base) return;
 if (!lookup.has(base)) lookup.set(base, item);
 if (!lookup.has(`${base}USD`)) lookup.set(`${base}USD`, item);
 if (!lookup.has(`${base}USDT`)) lookup.set(`${base}USDT`, item);
 };
 (Array.isArray(scanResults) ? scanResults : []).forEach(item => add(item?.symbol, item?.fundingRate, item?.nextFundingAt, item?.fundingIntervalSeconds));
 (Array.isArray(fundingHeatmap) ? fundingHeatmap : []).forEach(item => add(item?.symbol, item?.fundingRate, item?.nextFundingAt, item?.fundingIntervalSeconds));
 return lookup;
}

function v16ResolveAutoTradeFundingInfo(symbol = '', fundingLookup = new Map()) {
 const normalized = v16NormalizeSymbol(symbol);
 const base = normalized.replace(/(USD|USDT)$/, '');
 return fundingLookup.get(normalized)
 || fundingLookup.get(base)
 || fundingLookup.get(`${base}USD`)
 || fundingLookup.get(`${base}USDT`)
 || { fundingRate: 0, nextFundingAt: 0 };
}

function v16IsFundingAdverseForSide(positionSide = 'long', fundingRate = 0, threshold = 0) {
 const limit = Math.abs(Number(threshold || 0));
 const rate = Number(fundingRate || 0);
 if (!(limit > 0) || !rate) return false;
 return String(positionSide || '').toLowerCase() === 'short'
 ? rate <= -limit
 : rate >= limit;
}

function v16BuildFundingSkipReason(symbol = '', positionSide = 'long', fundingRate = 0, threshold = 0, context = {}) {
 const normalizedSymbol = v16NormalizeSymbol(symbol);
 const rate = Number(fundingRate || 0);
 const limit = Math.abs(Number(threshold || 0));
 const sideLabel = String(positionSide || '').toLowerCase() === 'short' ? 'short' : 'long';
 const reverseApplied = !!context?.reverseApplied;
 const originalSide = String(context?.originalSide || '').toLowerCase() === 'short' ? 'short' : 'long';
 const sideText = reverseApplied && originalSide !== sideLabel
 ? `${originalSide} signal reversed to ${sideLabel}`
 : `${sideLabel} entry`;
 const payerText = rate > 0
 ? 'positive funding favors shorts and charges longs'
 : 'negative funding favors longs and charges shorts';
 return `Funding block: ${normalizedSymbol} ${sideText} skipped because funding ${rate >= 0 ? '+' : ''}${rate.toFixed(4)}% per settlement is adverse for the actual order side (${payerText}) beyond ${limit.toFixed(4)}%`;
}

function v16ResolveAutoTradeNearestKeyLevelDistance(signal = {}, positionSide = 'long') {
 const entryPrice = Number(signal?.entry || signal?.price || 0);
 if (!(entryPrice > 0)) return null;
 const keyLevels = signal?.keyLevels || {};
 const rawLevels = positionSide === 'short' ? keyLevels?.support : keyLevels?.resistance;
 if (!Array.isArray(rawLevels) || !rawLevels.length) return null;
 const candidates = rawLevels
 .map(level => Number(level?.price || 0))
 .filter(price => (
 price > 0
 && (positionSide === 'short' ? price <= entryPrice : price >= entryPrice)
 ));
 if (!candidates.length) return null;
 return candidates.reduce((nearest, price) => {
 if (!(nearest > 0)) return price;
 return Math.abs(price - entryPrice) < Math.abs(nearest - entryPrice) ? price : nearest;
 }, 0);
}

function v16EvaluateAutoTradeSignalGate(signal = {}, cfg = {}) {
 const reasons = [];
 const safeCfg = sanitizeAutoTradeSettings(cfg || {});
 const executionSignal = signal?.autoTradeExecutionDirection
 ? { ...signal, direction: signal.autoTradeExecutionDirection }
 : v16BuildExecutionSignal(signal, safeCfg);
 const history = signal?.historyQuality || {};
 const maturity = history && typeof history === 'object' && Object.keys(history).length
 ? v16ClassifySymbolMaturity(signal, safeCfg)
 : signal?.symbolMaturity && typeof signal.symbolMaturity === 'object'
 ? signal.symbolMaturity
 : v16ClassifySymbolMaturity(signal, safeCfg);
 const candlePolicy = String(signal?.candlePolicy || history?.candlePolicy || '').trim().toLowerCase();
 const liquidity = Number(signal?.volume24h || 0);
 const estimatedSpreadPct = Math.max(0, Number(signal?.executionRisk?.estimatedSpreadPct || signal?.estimatedSpreadPct || 0));
 const configuredMinLiquidityUSD = Number(safeCfg.minLiquidityUSD);
 const minLiquidityUSD = Math.max(
 0,
 Number.isFinite(configuredMinLiquidityUSD)
 ? configuredMinLiquidityUSD
 : V16_AUTO_TRADE_MIN_LIQUIDITY_USD_DEFAULT
 );
 const positionSide = String(executionSignal?.direction || signal?.direction || '').toLowerCase().startsWith('short') ? 'short' : 'long';
 const setupFamily = String(signal?.setupFamily || '').trim().toLowerCase();
 const atrValue = Math.max(0, Number(signal?.daily?.atr || signal?.lower?.atr || 0));
 const keyLevel = v16ResolveAutoTradeNearestKeyLevelDistance(executionSignal, positionSide);
 const keyLevelDistance = keyLevel > 0 ? Math.abs(keyLevel - Number(signal?.entry || signal?.price || 0)) : 0;
 const keyLevelThreshold = atrValue > 0 ? atrValue * V16_AUTO_TRADE_KEY_LEVEL_ATR_BUFFER : 0;
 const quotaState = typeof globalThis.v17GetApiQuotaState === 'function' ? globalThis.v17GetApiQuotaState() : null;

 if (candlePolicy && candlePolicy !== 'closed_only') reasons.push('latest candle is still forming');
 if (liquidity > 0 && liquidity < minLiquidityUSD) reasons.push(`liquidity ${Math.round(liquidity).toLocaleString()} < ${minLiquidityUSD.toLocaleString()}`);
 if (estimatedSpreadPct > 0 && estimatedSpreadPct > Number(safeCfg.validatedMaxSpreadPct || 0.28)) {
 reasons.push(`estimated spread ${estimatedSpreadPct.toFixed(2)}% > ${Number(safeCfg.validatedMaxSpreadPct || 0.28).toFixed(2)}%`);
 }
 if (maturity?.probationary) {
 const probationMinLiquidityUSD = Math.max(minLiquidityUSD, Number(safeCfg.probationMinLiquidityUSD || minLiquidityUSD));
 if (liquidity > 0 && liquidity < probationMinLiquidityUSD) {
 reasons.push(`probation liquidity ${Math.round(liquidity).toLocaleString()} < ${probationMinLiquidityUSD.toLocaleString()}`);
 }
 if (estimatedSpreadPct > 0 && estimatedSpreadPct > Number(safeCfg.probationMaxSpreadPct || 0.18)) {
 reasons.push(`probation spread ${estimatedSpreadPct.toFixed(2)}% > ${Number(safeCfg.probationMaxSpreadPct || 0.18).toFixed(2)}%`);
 }
 if (setupFamily && !V16_AUTO_TRADE_PROBATION_ALLOWED_FAMILIES.has(setupFamily)) {
 reasons.push('probation symbols only auto-trade continuation-style setups');
 }
 }
 if (keyLevel > 0 && keyLevelThreshold > 0 && keyLevelDistance <= keyLevelThreshold) {
 reasons.push(`${positionSide === 'short' ? 'support' : 'resistance'} is too close to entry`);
 }
 if (quotaState?.severity === 'critical' && Number(quotaState?.backoffRemainingMs || 0) > 0) {
 reasons.push(`API cooling down after rate limit (${Math.ceil(Number(quotaState.backoffRemainingMs || 0) / 1000)}s)`);
 }

 return {
 passed: reasons.length === 0,
 reasons,
 maturity,
 };
}

function v16NormalizeShadowLedger(raw = {}) {
 const source = raw && typeof raw === 'object' ? raw : {};
 return {
 open: (Array.isArray(source.open) ? source.open : []).filter(Boolean).slice(0, V16_SHADOW_MAX_OPEN),
 closed: (Array.isArray(source.closed) ? source.closed : []).filter(Boolean).slice(0, V16_SHADOW_MAX_CLOSED),
 updatedAt: Number(source.updatedAt || 0),
 };
}

function v16BuildShadowTradeKey(trade = {}) {
 return [
 v16NormalizeSymbol(trade?.symbol || ''),
 String(trade?.side || '').trim().toLowerCase(),
 String(trade?.setupFamilyKey || trade?.setupFamily || '').trim().toLowerCase(),
 String(trade?.timeframe || '15m').trim().toLowerCase(),
 ].join('|');
}

function v16BuildShadowSignalKey(signal = {}, side = '') {
 return [
 v16NormalizeSymbol(signal?.symbol || ''),
 String(side || signal?.direction || '').trim().toLowerCase().startsWith('short') ? 'short' : 'long',
 String(signal?.setupFamily || signal?.setupFamilyLabel || 'mixed').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'mixed',
 String(signal?.lower?.label || signal?.tf2 || signal?.timeframe || '15m').trim().toLowerCase(),
 ].join('|');
}

async function v16RefreshShadowOpenTrades(ledger = {}) {
 const openTrades = Array.isArray(ledger.open) ? ledger.open : [];
 if (!openTrades.length) return ledger;
 const candleCache = new Map();
 const nextOpen = [];
 const newlyClosed = [];
 for (const trade of openTrades) {
 const symbol = v16NormalizeSymbol(trade?.symbol || '');
 const timeframe = String(trade?.timeframe || '15m').trim().toLowerCase() || '15m';
 if (!symbol) {
 nextOpen.push(trade);
 continue;
 }
 const cacheKey = `${symbol}|${timeframe}`;
 let candles = candleCache.get(cacheKey);
 if (!candles) {
 try {
 candles = await fetchCandles(symbol, V16_PUBLIC_CANDLE_RESOLUTIONS.has(timeframe) ? timeframe : '15m', 160, { closedOnly: true });
 } catch (error) {
 dlog(`[PAPER] Candle refresh failed for ${symbol}: ${String(error?.message || error).slice(0, 80)}`);
 candles = [];
 }
 candleCache.set(cacheKey, candles);
 }
 const updated = updateShadowTradeWithCandles(trade, candles);
 if (String(updated?.status || '').toLowerCase() === 'closed') newlyClosed.push(updated);
 else nextOpen.push(updated);
 }
 const nextLedger = {
 ...ledger,
 open: nextOpen.slice(0, V16_SHADOW_MAX_OPEN),
 closed: [...newlyClosed, ...(Array.isArray(ledger.closed) ? ledger.closed : [])].slice(0, V16_SHADOW_MAX_CLOSED),
 updatedAt: Date.now(),
 };
 if (newlyClosed.length) nextLedger.lastClosedBatch = newlyClosed;
 return nextLedger;
}

async function v16ProcessShadowTrades(scanResults = [], cfg = {}, stored = {}) {
 const safeCfg = sanitizeAutoTradeSettings(cfg || {});
 if (!safeCfg.paperTrackingEnabled) return null;
 const now = Date.now();
 let ledger = v16NormalizeShadowLedger(stored?.[V16_SHADOW_TRADE_LEDGER_KEY] || {});
 ledger = await v16RefreshShadowOpenTrades(ledger);
 const openKeys = new Set(ledger.open.map(v16BuildShadowTradeKey));
 const cooldownMs = Math.max(Number(safeCfg.cooldownSec || 0) * 1000, 15 * 60 * 1000);
 const recentClosedKeys = new Set(
 ledger.closed
 .filter(trade => (now - Number(trade?.closedAt || 0)) <= cooldownMs)
 .map(v16BuildShadowTradeKey)
 );
 const candidates = (Array.isArray(scanResults) ? scanResults : [])
 .filter(signal => signal && signal.symbol)
 .slice()
 .sort((a, b) => Number(b?.tradeQuality?.score || 0) - Number(a?.tradeQuality?.score || 0) || Number(b?.score || 0) - Number(a?.score || 0));
 let opened = 0;
 for (const signal of candidates) {
 if (ledger.open.length >= V16_SHADOW_MAX_OPEN) break;
 const decision = resolveDecisionAction(signal, signal?.activeThresholds || {});
 const shortlistAction = String(signal?.shortlistAction || decision.action || '').toUpperCase();
 const tq = Number(signal?.tradeQuality?.score || 0);
 const dir = String(signal?.direction || '').toLowerCase();
 const hasRisk = !!(signal?.entry && signal?.sl && (signal?.tp1 || signal?.tp));
 if (shortlistAction !== 'TRADE NOW' || tq < Number(safeCfg.minScore || 75) || !/^(long|short)$/.test(dir) || !hasRisk) continue;
 const signalGate = v16EvaluateAutoTradeSignalGate(signal, safeCfg);
 if (!signalGate.passed) continue;
 const entryTrigger = resolveEntryTrigger(signal, safeCfg);
 signal.entryTrigger = entryTrigger;
 if (safeCfg.entryTriggerRequired && !entryTrigger.passed) continue;
 const riskQuality = resolveRiskQualityGate(signal, safeCfg);
 signal.riskQuality = riskQuality;
 if (safeCfg.riskQualityRequired && !riskQuality.passed) continue;
 const shadowKey = v16BuildShadowSignalKey(signal, dir);
 if (openKeys.has(shadowKey) || recentClosedKeys.has(shadowKey)) continue;
 const trade = normalizeShadowTrade(signal, entryTrigger, now);
 const normalizedKey = v16BuildShadowTradeKey(trade);
 if (openKeys.has(normalizedKey) || recentClosedKeys.has(normalizedKey)) continue;
 ledger.open.unshift(trade);
 openKeys.add(normalizedKey);
 opened += 1;
 }
 ledger.open = ledger.open.slice(0, V16_SHADOW_MAX_OPEN);
 ledger.closed = ledger.closed.slice(0, V16_SHADOW_MAX_CLOSED);
 ledger.updatedAt = now;
 const setupPerformance = buildSetupPerformance(ledger.closed, [], {
 minSample: safeCfg.setupPerformanceMinSample,
 });
 const closedBatch = Array.isArray(ledger.lastClosedBatch) ? ledger.lastClosedBatch : [];
 delete ledger.lastClosedBatch;
 await storeLocalSet({
 [V16_SHADOW_TRADE_LEDGER_KEY]: ledger,
 [V16_SETUP_PERFORMANCE_KEY]: setupPerformance,
 });
 if (opened > 0) {
 dlog(`[PAPER] Opened ${opened} shadow trade${opened === 1 ? '' : 's'}; open=${ledger.open.length} closed=${ledger.closed.length}`);
 await v16PushNotificationFeed({
 tone: 'info',
 title: 'Paper trade opened',
 sourceScannerId: 'paper',
 sourceScannerName: 'Paper Ledger',
 sourceType: 'paper',
 what: `${opened} qualified paper trade${opened === 1 ? '' : 's'} opened from the latest scan.`,
 why: 'Signal passed trade quality, setup gate, entry trigger, and risk quality checks.',
 next: 'Open Analytics to review the paper ledger and setup performance.',
 action: 'Paper mode records only simulated trades and never places live orders.',
 }).catch(() => null);
 }
 if (closedBatch.length > 0) {
 await v16PushNotificationFeed({
 tone: closedBatch.some(trade => String(trade?.outcome || '') === 'loss') ? 'warn' : 'good',
 title: 'Paper trade closed',
 sourceScannerId: 'paper',
 sourceScannerName: 'Paper Ledger',
 sourceType: 'paper',
 what: `${closedBatch.length} paper trade${closedBatch.length === 1 ? '' : 's'} closed by stop or target.`,
 why: closedBatch.slice(0, 3).map(trade => `${trade.symbol} ${String(trade.outcome || '').toUpperCase()} ${trade.rMultiple != null ? `${trade.rMultiple}R` : ''}`.trim()).join(' | '),
 next: 'Setup performance has been refreshed from the closed paper ledger.',
 action: 'Review Paper Ledger in Analytics.',
 }).catch(() => null);
 }
 return { ledger, setupPerformance, opened };
}

function v16ResolveAutoTradeRequestedSize(signal = {}, cfg = {}) {
 const history = signal?.historyQuality || {};
 const maturity = history && typeof history === 'object' && Object.keys(history).length
 ? v16ClassifySymbolMaturity(signal, cfg)
 : signal?.symbolMaturity && typeof signal.symbolMaturity === 'object'
 ? signal.symbolMaturity
 : v16ClassifySymbolMaturity(signal, cfg);
 const baseSizeUSD = Math.max(0, Number(cfg?.autoSizeUSD || 0));
 const multiplierPct = Math.max(1, Math.min(100, Number(maturity?.sizeMultiplierPct || 100)));
 const requestedSizeUSD = maturity?.probationary
 ? Math.max(1, Number((baseSizeUSD * multiplierPct / 100).toFixed(2)))
 : baseSizeUSD;
 return {
 maturity,
 baseSizeUSD,
 requestedSizeUSD,
 requestedMaxNotionalUSD: requestedSizeUSD,
 };
}

function v16BuildAutoTradeSignalAuditEntries(scanResults = [], context = {}) {
 const {
 cfg = {},
 minTradeQuality = 75,
 cooldowns = {},
 manualControls = {},
 now = Date.now(),
 openPositionMap = new Map(),
 exchangeActiveSymbolMap = new Map(),
 scanResults: allScanResults = scanResults,
 limit = 5,
 } = context;
 return (Array.isArray(scanResults) ? scanResults : [])
 .filter(signal => signal && signal.symbol)
 .slice()
 .sort((a, b) => Number(b?.tradeQuality?.score || 0) - Number(a?.tradeQuality?.score || 0) || Number(b?.score || 0) - Number(a?.score || 0))
 .slice(0, Math.max(1, Number(limit || 5)))
 .map(signal => {
 const normalizedSymbol = v16NormalizeSymbol(signal?.symbol || '');
 const decision = resolveDecisionAction(signal, signal?.activeThresholds || {});
 const shortlistAction = String(signal?.shortlistAction || decision.action || '').toUpperCase() || 'PASS';
 const tq = Number(signal?.tradeQuality?.score || 0);
 const dir = String(signal?.direction || '').toLowerCase();
 const executionSignal = v16BuildExecutionSignal(signal, cfg);
 const executionSide = String(executionSignal.direction || '').toLowerCase().startsWith('short') ? 'short' : 'long';
 const fundingRate = Number(signal?.fundingRate || 0);
 const hasSlTp = !!(signal?.sl && (signal?.tp1 || signal?.tp));
 const cooldownOk = (now - Number(cooldowns?.[signal.symbol] || 0)) > Number(cfg.cooldownSec || 0) * 1000;
 const manual = v16ResolveSymbolManualControls(manualControls, normalizedSymbol, now);
 const signalGate = v16EvaluateAutoTradeSignalGate(signal, cfg);
 const entryTrigger = resolveEntryTrigger(signal, cfg);
 const correlationReason = v16BuildCorrelationBlockReason(signal, { cfg, executionSide, openPositionMap, exchangeActiveSymbolMap, scanResults: allScanResults });
 const dirOk = /^(long|short)/.test(dir);
 const dailyConfirmed = signal?.dailyConfirmation?.passed !== false;
 const reasons = [];
 if (shortlistAction !== 'TRADE NOW') reasons.push(`action ${shortlistAction.toLowerCase()}`);
 if (tq < minTradeQuality) reasons.push(`TQ ${tq} < ${minTradeQuality}`);
 if (!dirOk) reasons.push('direction invalid');
 if (!dailyConfirmed) reasons.push('1D confirmation missing');
 if (!signal?.entry) reasons.push('entry missing');
 if (!hasSlTp) reasons.push('SL/TP missing');
 if (!cooldownOk) reasons.push('cooldown active');
 if (manual.paused) reasons.push(`paused ${v16FormatManualControlDuration(Number(manual.record?.pausedUntil || 0) - now)}`);
 if (manual.reentryBlocked) reasons.push(`re-entry blocked ${v16FormatManualControlDuration(Number(manual.record?.reentryBlockedUntil || 0) - now)}`);
 if (manual.blockedToday) reasons.push('blocked for today');
 if (!signalGate.passed) reasons.push(...signalGate.reasons);
 if (cfg.entryTriggerRequired !== false && !entryTrigger.passed) reasons.push(`entry trigger: ${(entryTrigger.reasons || []).join(', ') || 'waiting'}`);
 if (correlationReason) reasons.push(correlationReason);
 if (dirOk && !manual.ignoreFunding && v16IsFundingAdverseForSide(executionSide, fundingRate, cfg.maxAdverseFundingRatePct)) {
 reasons.push(`funding ${fundingRate >= 0 ? '+' : ''}${fundingRate.toFixed(4)}% per settlement blocked`);
 } else if (manual.ignoreFunding) {
 reasons.push('funding override active');
 }
 const existing = openPositionMap.get(normalizedSymbol) || exchangeActiveSymbolMap.get(normalizedSymbol);
 if (existing) reasons.push(`slot in use (${existing.side || executionSide} ${existing.status || existing.source || 'live'})`);
 return {
 symbol: String(signal?.symbol || '').trim().toUpperCase(),
 direction: executionSide,
 action: shortlistAction,
 tradeQuality: tq,
 score: Number(signal?.score || 0),
 maturity: signalGate.maturity?.state || 'validated',
 maturityNote: signalGate.maturity?.probationary ? `size ${signalGate.maturity.sizeMultiplierPct}%` : '',
 entryTrigger: {
 passed: !!entryTrigger.passed,
 label: entryTrigger.label || '',
 triggerType: entryTrigger.triggerType || '',
 },
 blocked: reasons.length > 0,
 reasons: reasons.slice(0, 3),
 };
 });
}

function v16ResolveFundingExitPlan(entry = {}, context = {}, fundingInfo = {}, cfg = {}, now = Date.now()) {
 const threshold = Number(cfg.maxAdverseFundingRatePct || 0);
 const exitWindowMinutes = Number(cfg.fundingCloseMinutesBeforeSettlement || 0);
 const minHoldHours = Number(cfg.fundingMinHoldHours || 0);
 const nextFundingAt = Number(fundingInfo?.nextFundingAt || 0);
 if (!(threshold > 0) || !(exitWindowMinutes > 0) || !(nextFundingAt > now)) return null;
 if (entry?.autoTradeReverseApplied === true) return null;
 const msToFunding = nextFundingAt - now;
 if (msToFunding > exitWindowMinutes * 60 * 1000) return null;
 const positionSide = v16ResolveAutoTradePositionSide(entry);
 const fundingRate = Number(fundingInfo?.fundingRate || 0);
 if (!v16IsFundingAdverseForSide(positionSide, fundingRate, threshold)) return null;
 const heldSince = Number(entry.positionSeenAt || entry.ts || 0);
 if (heldSince > 0 && minHoldHours > 0 && (now - heldSince) < minHoldHours * 60 * 60 * 1000) return null;
 const entryPrice = Number(context?.position?.entry || entry.entry || 0);
 const markPrice = Number(context?.position?.markPrice || entry.markPrice || 0);
 const sizeUSD = Number(entry.sizeUSD || entry.requestedSizeUSD || 0);
 const estimatedPnl = entryPrice > 0 && markPrice > 0 && sizeUSD > 0
 ? +((positionSide === 'short'
 ? ((entryPrice - markPrice) / entryPrice) * sizeUSD
 : ((markPrice - entryPrice) / entryPrice) * sizeUSD).toFixed(4))
 : 0;
 if (cfg.fundingCloseOnlyInProfit !== false && !(estimatedPnl > 0)) return null;
 return {
 positionSide,
 fundingRate,
 nextFundingAt,
 msToFunding,
 estimatedPnl,
 };
}

function v16ResolveAutoTradeCloseReason(context = {}) {
 const closeOrder = context?.recentCloseOrder || null;
 if (closeOrder) {
 if (closeOrder.role === 'take_profit') return 'target_hit';
 if (closeOrder.role === 'stop_loss') return 'stop_hit';
 const reasonText = `${closeOrder.reason || ''} ${closeOrder.state || ''}`.toLowerCase();
 if (reasonText.includes('profit') || reasonText.includes('target')) return 'target_hit';
 if (reasonText.includes('loss') || reasonText.includes('stop')) return 'stop_hit';
 return 'closed';
 }
 const entryHistory = context?.recentEntryHistory || null;
 if (entryHistory) {
 const stateText = `${entryHistory.reason || ''} ${entryHistory.state || ''}`.toLowerCase();
 if (stateText.includes('cancel')) return 'entry_cancelled';
 if (stateText.includes('reject')) return 'entry_rejected';
 }
 return '';
}

async function v16SendTelegramTextMessage(telegramCfg = {}, text = '') {
 if (!telegramCfg?.enabled || !telegramCfg.botToken || !telegramCfg.chatId || !String(text || '').trim()) return false;
 const url = `https://api.telegram.org/bot${encodeURIComponent(telegramCfg.botToken)}/sendMessage`;
 const payload = {
 chat_id: telegramCfg.chatId,
 text: String(text || '').trim(),
 disable_web_page_preview: true,
 };
 const maxAttempts = 3;
 for (let attempt = 1; attempt <= maxAttempts; attempt++) {
 try {
 const response = await rateLimitedNotifyFetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 signal: AbortSignal.timeout(10000),
 });
 if (response.ok) return true;
 if (response.status === 429 && attempt < maxAttempts) {
 let retryAfterSec = 1;
 try {
 const body = await response.json();
 retryAfterSec = Math.max(1, Number(body?.parameters?.retry_after || 1));
 } catch (_) { }
 await wait((retryAfterSec + 1) * 1000);
 continue;
 }
 return false;
 } catch (error) {
 if (attempt >= maxAttempts) {
 dlog(`Auto-trade Telegram err: ${error?.message || 'request failed'}`);
 return false;
 }
 await wait(1000 * attempt);
 }
 }
 return false;
}

function v16BuildAutoTradeEventText(eventName = '', entry = {}, extra = {}) {
 const symbol = v16NormalizeSymbol(entry.symbol || extra.symbol || '');
 const side = String(v16ResolveAutoTradePositionSide(entry)).toUpperCase();
 const entryPrice = Number(entry.entry || extra.entryPrice || 0);
 const stopPrice = Number(extra.stopPrice || entry.sl || 0);
 const targetPrice = Number(extra.targetPrice || entry.tp || entry.takeProfitLimitPrice || 0);
 const requestedSizeUSD = Number(extra.requestedSizeUSD || entry.requestedSizeUSD || entry.sizeUSD || 0);
 const expectedNotionalUSD = Number(extra.expectedNotionalUSD || entry.expectedNotionalUSD || 0);
 const previewContracts = Math.max(0, Number(extra.previewContracts || entry.previewContracts || 0));
 const previewDisplaySize = Math.max(0, Number(extra.previewDisplaySize || entry.previewDisplaySize || 0));
 const previewDisplayUnit = String(extra.previewDisplayUnit || entry.previewDisplayUnit || (previewDisplaySize > 0 ? 'contracts' : '')).trim();
 const closeReason = String(extra.closeReason || entry.closeReason || '').replace(/_/g, ' ').trim() || 'position closed';
 if (eventName === 'placed') {
 const lines = [
 'Auto trade placed',
 `${symbol} ${side}`,
 `Entry: ${v16FormatAutoTradePrice(entryPrice)}`,
 `Stop: ${v16FormatAutoTradePrice(stopPrice)}`,
 `Target: ${v16FormatAutoTradePrice(targetPrice)}`,
 ];
 if (requestedSizeUSD > 0) lines.push(`Requested: ${v16FormatAutoTradePrice(requestedSizeUSD)} USD`);
 if (expectedNotionalUSD > 0) lines.push(`Expected notional: ${v16FormatAutoTradePrice(expectedNotionalUSD)} USD`);
 if (previewContracts > 0) {
 const sizeLabel = previewDisplaySize > 0 && previewDisplayUnit
 ? `${v16FormatAutoTradePrice(previewDisplaySize)} ${previewDisplayUnit}`
 : `${previewContracts} contracts`;
 lines.push(`Size: ${previewContracts} contracts (${sizeLabel})`);
 }
 return lines.join('\n');
 }
 if (eventName === 'stop_armed') {
 return `Auto trade stop armed\n${symbol} ${side}\nStop: ${v16FormatAutoTradePrice(stopPrice)}`;
 }
 if (eventName === 'target_armed') {
 return `Auto trade target armed\n${symbol} ${side}\nTarget: ${v16FormatAutoTradePrice(targetPrice)}`;
 }
 if (eventName === 'unprotected') {
 return `Auto trade unprotected\n${symbol} ${side}\nReason: add a native stop on Delta or close the position`;
 }
 if (eventName === 'stop_moved') {
 return `Auto trade stop updated\n${symbol} ${side}\nStop: ${v16FormatAutoTradePrice(stopPrice)}`;
 }
 if (eventName === 'target_shifted') {
 const oldTarget = Number(extra.oldTargetPrice || extra.fromTargetPrice || 0);
 const newTarget = Number(extra.newTargetPrice || extra.toTargetPrice || targetPrice || 0);
 const oldStop = Number(extra.oldStopPrice || extra.fromStopPrice || 0);
 const newStop = Number(extra.newStopPrice || extra.toStopPrice || stopPrice || 0);
 const fromLabel = String(extra.fromTargetLabel || extra.fromStageLabel || 'T?').trim();
 const toLabel = String(extra.toTargetLabel || extra.toStageLabel || 'T?').trim();
 const shiftedAtLabel = v16FormatAutoTradeTsIST(extra.shiftedAt || 0);
 return [
 'Auto trade target shifted',
 `${symbol} ${side}`,
 `${fromLabel} almost reached -> ${toLabel} live`,
 `Target: ${v16FormatAutoTradePrice(oldTarget)} -> ${v16FormatAutoTradePrice(newTarget)}`,
 `Stop: ${v16FormatAutoTradePrice(oldStop)} -> ${v16FormatAutoTradePrice(newStop)}`,
 `Time (IST): ${shiftedAtLabel}`,
 ].join('\n');
 }
 if (eventName === 'signal_flip') {
 const newDirection = String(extra.newDirection || '').toUpperCase() || '?';
 return `Signal flip: closed ${side} ${symbol}\nNew signal: ${newDirection}\nReason: system direction changed`;
 }
 if (eventName === 'cancelled') {
 return `Auto trade cancelled\n${symbol} ${side}\nReason: ${closeReason}`;
 }
 return `Auto trade closed\n${symbol} ${side}\nReason: ${closeReason}`;
}

function v16BuildAutoTradeFeedPayload(eventName = '', entry = {}, extra = {}) {
 const symbol = v16NormalizeSymbol(entry.symbol || extra.symbol || '');
 const side = String(v16ResolveAutoTradePositionSide(entry)).toUpperCase() || 'LONG';
 const sourceMeta = {
 sourceScannerId: 'auto_trade',
 sourceScannerName: 'Auto-Trade',
 sourceType: 'auto_trade',
 };
 if (eventName === 'placed') {
 return {
 ...sourceMeta,
 tone: 'success',
 title: `Auto-trade placed ${symbol}`,
 symbol,
 what: `${symbol} ${side} entry submitted with native protection.`,
 why: `Signal qualified with score ${Number(entry.score || 0)} and TQ ${Number(entry.tradeQuality || 0)}.`,
 next: 'Lifecycle monitor will confirm entry, stop, and target from the live exchange snapshot.',
 action: 'Review the Orders or Positions desk if you want to inspect the live placement.',
 };
 }
 if (eventName === 'signal_flip') {
 return {
 ...sourceMeta,
 tone: 'warn',
 title: `Signal flip closed ${symbol}`,
 symbol,
 what: `${symbol} ${side} was closed because the active signal reversed.`,
 why: `New signal direction is ${String(extra.newDirection || '').toUpperCase() || 'unknown'}.`,
 next: 'The system will wait for the next eligible scan before considering a fresh entry.',
 action: 'Check the signal popup if you want to review the new direction before re-entry.',
 };
 }
 if (eventName === 'unprotected') {
 return {
 ...sourceMeta,
 tone: 'error',
 title: `Protection missing on ${symbol}`,
 symbol,
 what: `${symbol} live exposure lost its native stop coverage.`,
 why: String(entry.protectionBlockReason || extra.reason || 'No active stop order was found on the exchange.'),
 next: 'Auto-trade will block new placements for the profile until protection is restored.',
 action: 'Add a native stop on Delta or close the position.',
 };
 }
 if (eventName === 'stop_armed' || eventName === 'target_armed') {
 const priceLabel = eventName === 'stop_armed'
 ? v16FormatAutoTradePrice(extra.stopPrice || entry.sl || 0)
 : v16FormatAutoTradePrice(extra.targetPrice || entry.tp || 0);
 return {
 ...sourceMeta,
 tone: 'info',
 title: `${eventName === 'stop_armed' ? 'Stop' : 'Target'} armed ${symbol}`,
 symbol,
 what: `${eventName === 'stop_armed' ? 'Stop' : 'Target'} is active for ${symbol} ${side}.`,
 why: `${eventName === 'stop_armed' ? 'Protection' : 'Target'} order is live at ${priceLabel}.`,
 next: 'Lifecycle monitor will keep syncing live order state.',
 action: 'No action needed unless you want to edit the live protection order.',
 };
 }
 if (eventName === 'target_shifted') {
 const oldTarget = Number(extra.oldTargetPrice || extra.fromTargetPrice || 0);
 const newTarget = Number(extra.newTargetPrice || extra.toTargetPrice || entry.tp || 0);
 const oldStop = Number(extra.oldStopPrice || extra.fromStopPrice || 0);
 const newStop = Number(extra.newStopPrice || extra.toStopPrice || entry.sl || 0);
 const fromLabel = String(extra.fromTargetLabel || extra.fromStageLabel || 'T?').trim();
 const toLabel = String(extra.toTargetLabel || extra.toStageLabel || 'T?').trim();
 const shiftedAt = Number(extra.shiftedAt || Date.now());
 return {
 ...sourceMeta,
 tone: 'info',
 title: `Target shifted ${symbol}`,
 symbol,
 ts: shiftedAt,
 what: `${fromLabel} almost reached, so ${symbol} moved target ${v16FormatAutoTradePrice(oldTarget)} -> ${v16FormatAutoTradePrice(newTarget)}.`,
 why: `Stop also moved ${v16FormatAutoTradePrice(oldStop)} -> ${v16FormatAutoTradePrice(newStop)} while advancing ${fromLabel} -> ${toLabel}.`,
 next: 'The lifecycle monitor will now guard the next target stage only once.',
 action: `Check the journal or notification center for the full ${v16FormatAutoTradeTsIST(shiftedAt)} IST shift record.`,
 };
 }
 if (eventName === 'cancelled' || eventName === 'closed') {
 return {
 ...sourceMeta,
 tone: eventName === 'closed' ? 'info' : 'warn',
 title: `${eventName === 'closed' ? 'Position closed' : 'Order cancelled'} ${symbol}`,
 symbol,
 what: `${symbol} ${side} is no longer consuming an active auto-trade slot.`,
 why: String(extra.closeReason || entry.closeReason || 'Position lifecycle completed.').replace(/_/g, ' '),
 next: 'If capacity is available, the system can consider fresh signals again.',
 action: 'Review the trade journal if you want to inspect the realized outcome.',
 };
 }
 return {
 ...sourceMeta,
 tone: 'info',
 title: `Auto-trade update ${symbol}`,
 symbol,
 what: `${symbol} ${side} lifecycle updated.`,
 why: String(extra.closeReason || entry.closeReason || eventName || 'status changed').replace(/_/g, ' '),
 next: 'The system will continue monitoring the trade state.',
 action: 'Open the Orders desk for the latest live status.',
 };
}

function v16ResolveProfileAccessBlock(err = null) {
 const message = String(err?.message || err || 'profile unavailable').trim();
 const lower = message.toLowerCase();
 if (lower.includes('kill switch')) {
 return {
 status: 'blocked_kill_switch',
 title: 'Kill switch armed',
 what: 'Auto-trade is blocked by the account kill switch.',
 why: message,
 next: 'No new live orders will be placed until the kill switch is disabled.',
 action: 'Review Settings > Profiles and turn off the kill switch for the active trading profile.',
 };
 }
 if (lower.includes('tradeenabled profile required')) {
 return {
 status: 'blocked_profile',
 title: 'Trade profile required',
 what: 'Auto-trade could not find a Trade Enabled profile for live placement.',
 why: message,
 next: 'The engine can scan, but it cannot place orders until a trading profile is selected.',
 action: 'Review Settings > Profiles and make sure the active auto-trade profile is Trade Enabled.',
 };
 }
 return {
 status: 'blocked_profile',
 title: 'Trading profile blocked',
 what: 'Auto-trade could not access a trade-enabled profile.',
 why: message,
 next: 'No new live orders will be placed until profile access is restored.',
 action: 'Review Settings > Profiles and test the active trading profile.',
 };
}

async function v16EmitAutoTradeLifecycleEvent(eventName = '', entry = {}, options = {}) {
 const cfg = sanitizeAutoTradeSettings(options.cfg || {});
 const message = v16BuildAutoTradeEventText(eventName, entry, options);
 await v16PushNotificationFeed(v16BuildAutoTradeFeedPayload(eventName, entry, options)).catch(() => null);
 if (cfg.notifyBrowser) {
 try {
 chrome.notifications.create(`auto_trade_${eventName}_${entry.id || entry.clientOrderId || entry.orderId || entry.symbol || 'entry'}_${Date.now()}`, {
 type: 'basic',
 iconUrl: 'icons/icon48.png',
 title: 'FWD TradeDesk Pro Auto-Trade',
 message,
 priority: 2,
 });
 } catch (_) { }
 }
 if (cfg.notifyTelegram) {
 await v16SendTelegramTextMessage(options.telegramCfg || {}, message);
 }
}

function dcaStartOfDayTs(now = Date.now()) {
 const date = new Date(now);
 date.setHours(0, 0, 0, 0);
 return date.getTime();
}

function dcaResolveTickerPrice(ticker = {}) {
 const raw = ticker?.raw || ticker || {};
 return Number(ticker?.markPrice || ticker?.mark_price || raw?.mark_price || ticker?.price || raw?.price || raw?.close || raw?.spot_price || 0);
}

function dcaBuildProtectionPrices(side = 'long', price = 0, cfg = {}) {
 const entry = Number(price || 0);
 const stopPct = Math.max(0.1, Number(cfg.stopLossPct || 0)) / 100;
 const targetPct = Math.max(0.1, Number(cfg.takeProfitPct || 0)) / 100;
 if (!(entry > 0)) return { stopLoss: 0, takeProfit: 0 };
 if (side === 'short') {
 return {
 stopLoss: Number((entry * (1 + stopPct)).toFixed(8)),
 takeProfit: Number((entry * (1 - targetPct)).toFixed(8)),
 };
 }
 return {
 stopLoss: Number((entry * (1 - stopPct)).toFixed(8)),
 takeProfit: Number((entry * (1 + targetPct)).toFixed(8)),
 };
}

function dcaShouldPlaceNextOrder(cfg = {}, state = {}, price = 0, now = Date.now()) {
 const orderCount = Number(state.orderCount || 0);
 if (orderCount <= 0) return { ok: true, reason: 'first_order' };
 if (orderCount >= Number(cfg.maxOrders || 0)) return { ok: false, reason: `Max DCA orders reached: ${orderCount}/${Number(cfg.maxOrders || 0)}` };
 const nextDueAt = Number(state.nextDueAt || 0);
 if (nextDueAt > now) return { ok: false, reason: `Next DCA interval not due until ${v16FormatAutoTradeTsIST(nextDueAt)}` };
 const stepPct = Number(cfg.priceStepPct || 0);
 if (!(stepPct > 0)) return { ok: true, reason: 'time_due' };
 const lastPrice = Number(state.lastOrderPrice || 0);
 if (!(lastPrice > 0) || !(price > 0)) return { ok: false, reason: 'Waiting for valid DCA reference price' };
 const triggerPrice = cfg.side === 'short'
 ? lastPrice * (1 + stepPct / 100)
 : lastPrice * (1 - stepPct / 100);
 const hit = cfg.side === 'short' ? price >= triggerPrice : price <= triggerPrice;
 return hit
 ? { ok: true, reason: `price_step_${stepPct}%`, triggerPrice }
 : { ok: false, reason: `Waiting for ${cfg.side === 'short' ? 'rise' : 'drop'} to ${v16FormatAutoTradePrice(triggerPrice)}` };
}

async function runDcaBotMonitor() {
 const now = Date.now();
 const stored = await storeLocalGet(['dcaBotSettings', 'dcaBotState', 'dcaBotLog', 'autoTradeSettings']);
 const cfg = sanitizeDcaBotSettings(stored?.dcaBotSettings || {});
 let state = stored?.dcaBotState && typeof stored.dcaBotState === 'object' ? { ...stored.dcaBotState } : {};
 if (!cfg.enabled) {
 await new Promise(resolve => syncDcaBotMonitorAlarm(resolve));
 return;
 }
 const symbol = v16NormalizeSymbol(cfg.symbol || '');
 if (!symbol) {
 await storeLocalSet({ dcaBotState: { ...state, status: 'blocked', reason: 'DCA symbol is required', updatedAt: now } });
 return;
 }
 const dayStart = dcaStartOfDayTs(now);
 if (Number(state.dayStartTs || 0) < dayStart || String(state.symbol || '') !== symbol || String(state.side || '') !== cfg.side) {
 state = {
 symbol,
 side: cfg.side,
 dayStartTs: dayStart,
 orderCount: 0,
 dailySpentUSD: 0,
 lastOrderPrice: 0,
 nextDueAt: 0,
 status: 'ready',
 reason: '',
 updatedAt: now,
 };
 }
 if (Number(state.dailySpentUSD || 0) + Number(cfg.orderSizeUSD || 0) > Number(cfg.maxDailyUSD || 0)) {
 await storeLocalSet({ dcaBotState: { ...state, status: 'blocked', reason: `Daily DCA budget reached: $${Number(state.dailySpentUSD || 0).toFixed(2)} / $${Number(cfg.maxDailyUSD || 0).toFixed(2)}`, updatedAt: now } });
 return;
 }

 let tickerPrice = 0;
 try {
 tickerPrice = dcaResolveTickerPrice(await v16FetchPublicTicker(symbol));
 } catch (error) {
 await storeLocalSet({ dcaBotState: { ...state, status: 'blocked', reason: `Ticker unavailable: ${error?.message || 'request failed'}`, updatedAt: now } });
 return;
 }
 const gate = dcaShouldPlaceNextOrder(cfg, state, tickerPrice, now);
 if (!gate.ok) {
 await storeLocalSet({ dcaBotState: { ...state, status: 'waiting', reason: gate.reason, lastPrice: tickerPrice, updatedAt: now } });
 return;
 }

 const autoTradeSettings = sanitizeAutoTradeSettings(stored?.autoTradeSettings || {});
 const profileId = String(cfg.profileId || autoTradeSettings.profileId || '').trim();
 const orderType = cfg.entryMode === 'market' ? 'market_order' : 'limit_order';
 const isMakerPreferred = cfg.entryMode === 'maker_preferred';
 const isPostOnly = cfg.entryMode === 'maker_only' || isMakerPreferred;
 const side = cfg.side === 'short' ? 'sell' : 'buy';
 const protections = dcaBuildProtectionPrices(cfg.side, tickerPrice, cfg);
 const basePayload = {
 profileId,
 symbol,
 side,
 sizeMode: 'usd',
 sizeInput: cfg.orderSizeUSD,
 maxNotionalUSD: cfg.orderSizeUSD,
 price: tickerPrice,
 entry: tickerPrice,
 limitPrice: tickerPrice,
 orderType,
 postOnly: isPostOnly,
 stopLoss: protections.stopLoss,
 takeProfit: protections.takeProfit,
 clientOrderId: (`DCA_${symbol}_${now}`).slice(0, 32),
 isDcaBot: true,
 };

 let result = null;
 let usedFallback = false;
 try {
 try {
 result = await runV16PlaceTradeOrder(basePayload);
 } catch (firstError) {
 const errMsg = String(firstError?.message || '').toLowerCase();
 if (isMakerPreferred && (errMsg.includes('immediate_execution') || errMsg.includes('post_only') || errMsg.includes('postonly'))) {
 usedFallback = true;
 result = await runV16PlaceTradeOrder({
 ...basePayload,
 postOnly: false,
 clientOrderId: (`DCA2_${symbol}_${now}`).slice(0, 32),
 });
 } else {
 throw firstError;
 }
 }
 const placedAt = Number(result?.placedAt || now);
 const log = Array.isArray(stored?.dcaBotLog) ? stored.dcaBotLog.slice() : [];
 const entry = {
 id: String(result?.request?.client_order_id || basePayload.clientOrderId),
 symbol,
 side,
 positionSide: cfg.side,
 status: 'placed',
 ts: placedAt,
 orderId: String(result?.result?.id || result?.result?.order_id || ''),
 clientOrderId: String(result?.request?.client_order_id || basePayload.clientOrderId),
 orderSizeUSD: Number(cfg.orderSizeUSD || 0),
 orderNumber: Number(state.orderCount || 0) + 1,
 price: tickerPrice,
 stopLoss: protections.stopLoss,
 takeProfit: protections.takeProfit,
 reason: gate.reason,
 entryMode: cfg.entryMode,
 makerFallback: usedFallback,
 profileId: result?.profileId || profileId,
 };
 state = {
 ...state,
 symbol,
 side: cfg.side,
 status: 'placed',
 reason: `Placed DCA order ${entry.orderNumber}/${Number(cfg.maxOrders || 0)} at ${v16FormatAutoTradePrice(tickerPrice)}`,
 orderCount: entry.orderNumber,
 dailySpentUSD: Number((Number(state.dailySpentUSD || 0) + Number(cfg.orderSizeUSD || 0)).toFixed(4)),
 lastOrderPrice: tickerPrice,
 lastOrderAt: placedAt,
 nextDueAt: placedAt + Number(cfg.intervalMinutes || 1) * 60 * 1000,
 updatedAt: now,
 };
 log.unshift(entry);
 await storeLocalSet({ dcaBotState: state, dcaBotLog: log.slice(0, 300) });
 if (cfg.notifyBrowser) {
 await v16PushNotificationFeed({
 tone: 'good',
 title: 'DCA order placed',
 symbol,
 what: `${symbol} ${cfg.side.toUpperCase()} DCA order ${entry.orderNumber}/${Number(cfg.maxOrders || 0)} placed near ${v16FormatAutoTradePrice(tickerPrice)}.`,
 why: gate.reason === 'first_order' ? 'This was the first order in the current DCA cycle.' : `DCA trigger matched: ${gate.reason}.`,
 next: `Next check after ${v16FormatAutoTradeTsIST(state.nextDueAt)}.`,
 action: `Order size $${Number(cfg.orderSizeUSD || 0).toFixed(2)} with stop ${v16FormatAutoTradePrice(protections.stopLoss)} and target ${v16FormatAutoTradePrice(protections.takeProfit)}.`,
 }).catch(() => null);
 }
 if (cfg.notifyTelegram) {
 const tg = await getStoredTelegramConfig().catch(() => null);
 if (tg) {
 await v16SendTelegramTextMessage(tg, `DCA order placed\n${symbol} ${cfg.side.toUpperCase()}\nOrder ${entry.orderNumber}/${Number(cfg.maxOrders || 0)}\nPrice: ${v16FormatAutoTradePrice(tickerPrice)}\nSize: $${Number(cfg.orderSizeUSD || 0).toFixed(2)}`).catch(() => null);
 }
 }
 if (typeof fireWebhooks === 'function') {
 fireWebhooks('dca_order_placed', entry);
 }
 } catch (error) {
 const failedState = { ...state, status: 'failed', reason: String(error?.message || 'DCA order failed').slice(0, 180), updatedAt: now };
 const log = Array.isArray(stored?.dcaBotLog) ? stored.dcaBotLog.slice() : [];
 log.unshift({
 symbol,
 side,
 positionSide: cfg.side,
 status: 'failed',
 ts: now,
 orderSizeUSD: Number(cfg.orderSizeUSD || 0),
 price: tickerPrice,
 error: failedState.reason,
 });
 await storeLocalSet({ dcaBotState: failedState, dcaBotLog: log.slice(0, 300) });
 dlog(`[DCA] Order failed ${symbol}: ${failedState.reason}`);
 } finally {
 await new Promise(resolve => syncDcaBotMonitorAlarm(resolve));
 }
}

async function runAutoTradeLifecycleMonitor() {
 const stored = await storeLocalGet([
 'autoTrade',
 'autoTradeLog',
 'autoTradeSettings',
 'scanResults',
 'lastScanTs',
 'autoTradeLastSkipReason',
 V16_AUTO_TRADE_DECISION_AUDIT_KEY,
 ]);
 const tradeLog = Array.isArray(stored?.autoTradeLog) ? stored.autoTradeLog.slice() : [];
 const cfg = sanitizeAutoTradeSettings(stored?.autoTradeSettings || {});
 const activeStatuses = new Set(['placed', 'pending', 'live']);
 const now = Date.now();
 const snapshots = new Map();
 const fundingStored = await storeLocalGet(['scanResults', 'fundingHeatmap']);
 const fundingLookup = v16BuildAutoTradeFundingLookup(fundingStored?.scanResults, fundingStored?.fundingHeatmap);
 const loadSnapshot = async (profileId = '') => {
 const key = String(profileId || '').trim();
 if (!key) return null;
 if (!snapshots.has(key)) {
 snapshots.set(key, runV16PrivateAccountSnapshot(key, { force: true }).catch(error => ({ error })));
 }
 return snapshots.get(key);
 };
 const activeEntries = tradeLog.filter(entry => activeStatuses.has(String(entry?.status || '').toLowerCase()));
 if (!activeEntries.length) {
 const existingAudit = stored?.[V16_AUTO_TRADE_DECISION_AUDIT_KEY] || {};
 if (/^max concurrent reached:/i.test(String(stored?.autoTradeLastSkipReason || '').trim())
 || String(existingAudit?.status || '').trim().toLowerCase() === 'blocked_concurrent') {
 await storeLocalSet({
 autoTradeLastSkipReason: '',
 [V16_AUTO_TRADE_DECISION_AUDIT_KEY]: {
 ...existingAudit,
 status: 'last_engine_block',
 reason: 'Last engine slot block cleared. No live or queued auto-trade exposure remains.',
 lastBlockedReason: String(existingAudit?.reason || stored?.autoTradeLastSkipReason || '').trim(),
 openCount: 0,
 updatedAt: now,
 },
 });
 }
 await new Promise(resolve => syncAutoTradeMonitorAlarm(resolve));
 return { ok: true, active: 0, updated: 0 };
 }

 const telegramCfg = cfg.notifyTelegram ? await getStoredTelegramConfig().catch(() => null) : null;

 let updated = 0;

 for (let index = 0; index < tradeLog.length; index++) {
 const currentEntry = tradeLog[index];
 const status = String(currentEntry?.status || '').toLowerCase();
 if (!activeStatuses.has(status)) continue;

 const profileId = String(currentEntry?.profileId || cfg.profileId || '').trim();
 if (!profileId) continue;

 const snapshot = await loadSnapshot(profileId);
 if (!snapshot || snapshot?.error) {
 if (snapshot?.error) dlog(`Auto-trade snapshot err (${currentEntry?.symbol || 'unknown'}): ${snapshot.error?.message || snapshot.error}`);
 continue;
 }

 const nextEntry = {
 ...currentEntry,
 profileId,
 baseUrl: String(currentEntry?.baseUrl || snapshot.baseUrl || '').trim(),
 notifications: { ...(currentEntry?.notifications || {}) },
 protectionState: v16NormalizeProtectionState(currentEntry?.protectionState || '', ''),
 stopProtectionSource: v16NormalizeProtectionSource(currentEntry?.stopProtectionSource || '', ''),
 targetProtectionSource: v16NormalizeProtectionSource(currentEntry?.targetProtectionSource || '', ''),
 protectionBlockReason: String(currentEntry?.protectionBlockReason || '').trim(),
 updatedAt: now,
 };
 const context = v16ResolveAutoTradeContext(snapshot, nextEntry);
 let entryChanged = false;
 const setEntryField = (key, value) => {
 if (nextEntry[key] !== value) {
 nextEntry[key] = value;
 entryChanged = true;
 }
 };

 if (context.entryOrder?.orderId && String(nextEntry.orderId || '').trim() !== String(context.entryOrder.orderId || '').trim()) {
 nextEntry.orderId = String(context.entryOrder.orderId || context.entryOrder.id || '').trim();
 entryChanged = true;
 }

 if (context.stopOrder) {
 const detectedStop = Number(context.stopOrder.stopPrice || nextEntry.sl || 0);
 const stopSource = v16ResolveTrackedProtectionSource(context.stopOrder, nextEntry, 'stop');
 const stopOrderId = String(context.stopOrder.orderId || context.stopOrder.id || '').trim();
 if (detectedStop > 0 && Math.abs(detectedStop - Number(nextEntry.sl || 0)) > 1e-8) {
 nextEntry.sl = detectedStop;
 entryChanged = true;
 }
 if (stopOrderId && String(nextEntry.stopOrderId || '').trim() !== stopOrderId) {
 nextEntry.stopOrderId = stopOrderId;
 entryChanged = true;
 }
 if (nextEntry.stopProtectionSource !== stopSource) {
 nextEntry.stopProtectionSource = stopSource;
 entryChanged = true;
 }
 if (nextEntry.protectionState !== (stopSource === 'manual_native' ? 'manual_native' : 'armed')) {
 nextEntry.protectionState = stopSource === 'manual_native' ? 'manual_native' : 'armed';
 entryChanged = true;
 }
 if (nextEntry.protectionBlockReason) {
 nextEntry.protectionBlockReason = '';
 entryChanged = true;
 }
 if (!nextEntry.notifications.stopArmedAt) {
 await v16EmitAutoTradeLifecycleEvent('stop_armed', nextEntry, {
 cfg,
 telegramCfg,
 stopPrice: detectedStop || Number(nextEntry.sl || 0),
 }).catch(() => { });
 nextEntry.notifications.stopArmedAt = now;
 entryChanged = true;
 }
 }

 if (context.targetOrder) {
 const detectedTarget = Number(context.targetOrder.limitPrice || context.targetOrder.stopPrice || nextEntry.tp || 0);
 const targetSource = v16ResolveTrackedProtectionSource(context.targetOrder, nextEntry, 'target');
 const targetOrderId = String(context.targetOrder.orderId || context.targetOrder.id || '').trim();
 if (detectedTarget > 0 && Math.abs(detectedTarget - Number(nextEntry.tp || 0)) > 1e-8) {
 nextEntry.tp = detectedTarget;
 nextEntry.takeProfitLimitPrice = detectedTarget;
 entryChanged = true;
 }
 if (targetOrderId && String(nextEntry.targetOrderId || '').trim() !== targetOrderId) {
 nextEntry.targetOrderId = targetOrderId;
 entryChanged = true;
 }
 if (nextEntry.targetProtectionSource !== targetSource) {
 nextEntry.targetProtectionSource = targetSource;
 entryChanged = true;
 }
 if (!nextEntry.notifications.targetArmedAt) {
 await v16EmitAutoTradeLifecycleEvent('target_armed', nextEntry, {
 cfg,
 telegramCfg,
 targetPrice: detectedTarget || Number(nextEntry.tp || 0),
 }).catch(() => { });
 nextEntry.notifications.targetArmedAt = now;
 entryChanged = true;
 }
 }

 if (context.position) {
 if (String(nextEntry.status || '').toLowerCase() !== 'live') {
 nextEntry.status = 'live';
 entryChanged = true;
 }
 if (!Number(nextEntry.positionSeenAt || 0)) {
 nextEntry.positionSeenAt = now;
 entryChanged = true;
 }
 if (Number(context.position.entry || 0) > 0 && Math.abs(Number(nextEntry.entry || 0) - Number(context.position.entry || 0)) > 1e-8) {
 nextEntry.entry = Number(context.position.entry || 0);
 entryChanged = true;
 }
 nextEntry.markPrice = Number(context.position.markPrice || nextEntry.markPrice || 0);
 const fundingInfo = v16ResolveAutoTradeFundingInfo(nextEntry.symbol, fundingLookup);
 if (Math.abs(Number(nextEntry.fundingRate || 0) - Number(fundingInfo.fundingRate || 0)) > 1e-8) {
 nextEntry.fundingRate = Number(fundingInfo.fundingRate || 0);
 entryChanged = true;
 }
 if (Number(nextEntry.nextFundingAt || 0) !== Number(fundingInfo.nextFundingAt || 0)) {
 nextEntry.nextFundingAt = Number(fundingInfo.nextFundingAt || 0);
 entryChanged = true;
 }

 // Target Auto-Shift Logic: official capped ladder T1 -> T2 -> T3 -> T4
 const { ladder: targetLadder, currentIndex: currentTargetIndex } = v16ResolveAutoTradeTargetStage(nextEntry);
 if (targetLadder.length >= 2 && currentTargetIndex >= 0 && currentTargetIndex < (targetLadder.length - 1)) {
 const currentTargetLevel = targetLadder[currentTargetIndex];
 const nextTargetLevel = targetLadder[currentTargetIndex + 1];
 const isLong = v16ResolveAutoTradePositionSide(nextEntry) === 'long';
 const mp = Number(nextEntry.markPrice || 0);
 const targetOrder = context.targetOrder;
 const stopOrder = context.stopOrder;
 const hasDistinctProtectionOrders = !!targetOrder && !!stopOrder && v16WorkingOrderIdentity(targetOrder) !== v16WorkingOrderIdentity(stopOrder);
 const currentTargetPrice = Number(currentTargetLevel?.price || 0);
 const distToCurrentTarget = currentTargetPrice - Number(nextEntry.entry || 0);
 const nearCurrentTargetThreshold = Number(nextEntry.entry || 0) + (0.9 * distToCurrentTarget);
 const shouldAdvance = isLong
 ? (mp >= nearCurrentTargetThreshold)
 : (mp > 0 && mp <= nearCurrentTargetThreshold);
 if (shouldAdvance && hasDistinctProtectionOrders) {
 const shiftedAt = Date.now();
 const oldTargetPrice = currentTargetPrice;
 const newTargetPrice = Number(nextTargetLevel?.price || 0);
 const oldStopPrice = Number(nextEntry.sl || 0);
 const newStopPrice = Number(v16ResolveAutoTradeShiftStopPrice(nextEntry, currentTargetIndex, targetLadder) || 0);
 if (newTargetPrice > 0 && newStopPrice > 0) {
 const results = await Promise.allSettled([
 runV16UpdateOrder(v16BuildAutoTradeTargetUpdatePayload(profileId, targetOrder, newTargetPrice)),
 runV16UpdateOrder({
 profileId,
 orderId: stopOrder.id || stopOrder.orderId,
 stopPrice: newStopPrice,
 }),
 ]);
 if (results.every(result => result.status === 'fulfilled')) {
 const [targetUpdateResult, stopUpdateResult] = results.map(result => result.value || {});
 if (typeof dlog === 'function') dlog(`[AUTO-TRADE] Target Auto-shift ${currentTargetLevel.label} -> ${nextTargetLevel.label} for ${nextEntry.symbol}`);
 nextEntry.tp = newTargetPrice;
 nextEntry.takeProfitLimitPrice = newTargetPrice;
 nextEntry.sl = newStopPrice;
 nextEntry.targetOrderId = String(targetUpdateResult.replacementOrderId || targetUpdateResult.orderId || targetOrder.orderId || targetOrder.id || nextEntry.targetOrderId || '').trim();
 nextEntry.stopOrderId = String(stopUpdateResult.replacementOrderId || stopUpdateResult.orderId || stopOrder.orderId || stopOrder.id || nextEntry.stopOrderId || '').trim();
 nextEntry.targetAutoShiftStage = nextTargetLevel.stage;
 nextEntry.targetShiftEvents = [
 ...(Array.isArray(nextEntry.targetShiftEvents) ? nextEntry.targetShiftEvents : []),
 {
 id: `${String(nextEntry.id || nextEntry.symbol || 'shift').replace(/[^A-Za-z0-9_]/g, '')}_${shiftedAt}`,
 fromStage: currentTargetLevel.stage,
 fromTargetLabel: currentTargetLevel.label,
 toStage: nextTargetLevel.stage,
 toTargetLabel: nextTargetLevel.label,
 oldTargetPrice,
 newTargetPrice,
 oldStopPrice,
 newStopPrice,
 shiftedAt,
 },
 ].slice(-12);
 await v16EmitAutoTradeLifecycleEvent('target_shifted', nextEntry, {
 cfg,
 telegramCfg,
 shiftedAt,
 fromStage: currentTargetLevel.stage,
 fromStageLabel: currentTargetLevel.label,
 fromTargetLabel: currentTargetLevel.label,
 toStage: nextTargetLevel.stage,
 toStageLabel: nextTargetLevel.label,
 toTargetLabel: nextTargetLevel.label,
 oldTargetPrice,
 newTargetPrice,
 oldStopPrice,
 newStopPrice,
 }).catch(() => { });
 entryChanged = true;
 } else if (typeof dlog === 'function') {
 dlog(`[AUTO-TRADE] Target Auto-shift failed ${currentTargetLevel.label} -> ${nextTargetLevel.label} for ${nextEntry.symbol}`);
 }
 }
 }
 }

 if (!context.stopOrder) {
 if (nextEntry.protectionState !== 'unprotected') {
 nextEntry.protectionState = 'unprotected';
 entryChanged = true;
 }
 if (nextEntry.stopProtectionSource) {
 nextEntry.stopProtectionSource = '';
 entryChanged = true;
 }
 const protectionBlockReason = v16BuildAutoTradeProtectionBlockReason(nextEntry);
 if (nextEntry.protectionBlockReason !== protectionBlockReason) {
 nextEntry.protectionBlockReason = protectionBlockReason;
 entryChanged = true;
 }
 if (!nextEntry.notifications.unprotectedAt) {
 await v16EmitAutoTradeLifecycleEvent('unprotected', nextEntry, {
 cfg,
 telegramCfg,
 }).catch(() => { });
 nextEntry.notifications.unprotectedAt = now;
 entryChanged = true;
 }
 }
 const fundingExitPlan = v16ResolveFundingExitPlan(nextEntry, context, fundingInfo, cfg, now);
 if (fundingExitPlan) {
 try {
 const linkedOrderIds = [context.stopOrder?.orderId, context.targetOrder?.orderId].filter(Boolean);
 const linkedClientOrderIds = [nextEntry.clientOrderId, nextEntry.stopOrderId, nextEntry.targetOrderId].filter(Boolean);
 await runV16PlacePositionAction({
 profileId,
 baseUrl: nextEntry.baseUrl,
 symbol: nextEntry.symbol,
 positionSide: fundingExitPlan.positionSide,
 positionSize: context.position.size,
 requestedAction: 'close',
 clientOrderId: (`FUND_${nextEntry.symbol}_${now}`).slice(0, 32),
 linkedOrderIds,
 linkedClientOrderIds,
 });
 nextEntry.status = 'closed';
 nextEntry.closeReason = 'funding_exit';
 nextEntry.closedAt = now;
 nextEntry.closePnl = Number(fundingExitPlan.estimatedPnl || 0);
 nextEntry.protectionState = 'closed';
 nextEntry.stopProtectionSource = '';
 nextEntry.targetProtectionSource = '';
 nextEntry.protectionBlockReason = '';
 nextEntry.notifications.closedAt = now;
 tradeLog[index] = nextEntry;
 updated++;
 await v16EmitAutoTradeLifecycleEvent('closed', nextEntry, {
 cfg,
 telegramCfg,
 closeReason: `funding exit before adverse ${fundingExitPlan.fundingRate >= 0 ? '+' : ''}${Number(fundingExitPlan.fundingRate || 0).toFixed(4)}% settlement`,
 }).catch(() => { });
 dlog(`[AUTO-TRADE] Funding exit: closed ${nextEntry.symbol} ${fundingExitPlan.positionSide} with ${Math.round(fundingExitPlan.msToFunding / 60000)}m to funding @ ${fundingExitPlan.fundingRate >= 0 ? '+' : ''}${Number(fundingExitPlan.fundingRate || 0).toFixed(4)}%`);
 continue;
 } catch (fundingErr) {
 dlog(`[AUTO-TRADE] Funding exit close failed for ${nextEntry.symbol}: ${String(fundingErr?.message || fundingErr).slice(0, 120)}`);
 }
 }
 } else if (context.entryOrder) {
 if (!['placed', 'pending'].includes(String(nextEntry.status || '').toLowerCase())) {
 nextEntry.status = 'pending';
 entryChanged = true;
 }
 } else {
 const closeReason = v16ResolveAutoTradeCloseReason(context) || (Number(nextEntry.positionSeenAt || 0) > 0 ? 'closed' : 'entry_cancelled');
 const finalStatus = (Number(nextEntry.positionSeenAt || 0) > 0 || context.recentCloseOrder) ? 'closed' : 'cancelled';
 if (String(nextEntry.status || '').toLowerCase() !== finalStatus) {
 nextEntry.status = finalStatus;
 nextEntry.closedAt = Number(context?.recentCloseOrder?.updatedAt || context?.recentEntryHistory?.updatedAt || now);
 nextEntry.closeReason = closeReason;
 nextEntry.protectionState = 'closed';
 nextEntry.stopProtectionSource = '';
 nextEntry.targetProtectionSource = '';
 nextEntry.protectionBlockReason = '';
 entryChanged = true;

 // F3: Daily loss accumulation - calculate realized P&L when trade closes
 if (finalStatus === 'closed' && Number(nextEntry.positionSeenAt || 0) > 0) {
 const entryPx = Number(nextEntry.entry || 0);
 const closePx = Number(context?.recentCloseOrder?.limitPrice || context?.recentCloseOrder?.stopPrice || nextEntry.markPrice || 0);
 const sizeUSD = Number(nextEntry.sizeUSD || nextEntry.requestedSizeUSD || 0);
 if (entryPx > 0 && closePx > 0 && sizeUSD > 0) {
 const positionSide = String(nextEntry.positionSide || (nextEntry.side === 'sell' ? 'short' : 'long')).toLowerCase();
 // P&L = (closePrice - entryPrice) / entryPrice * sizeUSD, inverted for shorts
 const pnl = positionSide === 'short'
 ? ((entryPx - closePx) / entryPx) * sizeUSD
 : ((closePx - entryPx) / entryPx) * sizeUSD;
 nextEntry.closePnl = Number(pnl.toFixed(4));
 // Accumulate losses into daily loss tracker (losses are negative, we store absolute)
 if (pnl < 0) {
 try {
 const lossStored = await storeLocalGet(['autoTradeDailyLoss', 'autoTradeDailyResetTs']);
 const todayStart = v16BgStartOfLocalDay(Date.now());
 // Fix: Reset bucket if monitor runs after midnight before the engine does
 let currentLoss = Number(lossStored?.autoTradeDailyLoss || 0);
 if (Number(lossStored?.autoTradeDailyResetTs || 0) < todayStart) {
 currentLoss = 0;
 await storeLocalSet({ autoTradeDailyLoss: 0, autoTradeDailyResetTs: todayStart });
 }
 const updatedLoss = currentLoss + Math.abs(pnl);
 await storeLocalSet({ autoTradeDailyLoss: Number(updatedLoss.toFixed(4)) });
 dlog(`[AUTO-TRADE] Loss recorded: ${nextEntry.symbol} PnL=$${pnl.toFixed(2)} | daily loss now $${updatedLoss.toFixed(2)}`);
 if (updatedLoss >= Number(cfg.dailyLossLimitUSD || 0)) {
 await v16ArmAutoTradeDailyLossKillSwitch(updatedLoss, cfg.dailyLossLimitUSD, Date.now());
 }
 } catch (lossErr) {
 dlog(`[AUTO-TRADE] Failed to persist daily loss: ${String(lossErr?.message || lossErr).slice(0, 100)}`);
 }
 } else {
 dlog(`[AUTO-TRADE] Profit recorded: ${nextEntry.symbol} PnL=$${pnl.toFixed(2)}`);
 }
 }
 }
 }
 const notificationKey = finalStatus === 'closed' ? 'closedAt' : 'cancelledAt';
 if (!nextEntry.notifications[notificationKey]) {
 await v16EmitAutoTradeLifecycleEvent(finalStatus, nextEntry, {
 cfg,
 telegramCfg,
 closeReason,
 }).catch(() => { });
 nextEntry.notifications[notificationKey] = now;
 entryChanged = true;
 }
 }

 if (entryChanged) {
 tradeLog[index] = nextEntry;
 updated++;
 }
 }

 const protectionBlocks = v16BuildAutoTradeProtectionBlocks(tradeLog);
 if (updated > 0) {
 await storeLocalSet({
 autoTradeLog: tradeLog.slice(0, 500),
 [V16_AUTO_TRADE_PROTECTION_BLOCKS_KEY]: protectionBlocks,
 });
 } else {
 await storeLocalSet({ [V16_AUTO_TRADE_PROTECTION_BLOCKS_KEY]: protectionBlocks });
 }
 await new Promise(resolve => syncAutoTradeMonitorAlarm(resolve));
 const activeAfter = tradeLog.filter(entry => activeStatuses.has(String(entry?.status || '').toLowerCase())).length;
 const recentScanAgeMs = Math.max(0, now - Number(stored?.lastScanTs || 0));
 const recentScanResults = Array.isArray(stored?.scanResults) ? stored.scanResults : [];
 const slotFreed = activeAfter < activeEntries.length;
 const maxConcurrent = Math.max(1, Number(cfg?.maxConcurrent || 5));
 const staleConcurrentReason = /^max concurrent reached:/i.test(String(stored?.autoTradeLastSkipReason || '').trim());
 const existingAudit = stored?.[V16_AUTO_TRADE_DECISION_AUDIT_KEY] || {};
 if (activeAfter < maxConcurrent && (staleConcurrentReason || String(existingAudit?.status || '').trim().toLowerCase() === 'blocked_concurrent')) {
 await storeLocalSet({
 autoTradeLastSkipReason: '',
 [V16_AUTO_TRADE_DECISION_AUDIT_KEY]: {
 ...existingAudit,
 status: 'last_engine_block',
 reason: `Last engine slot block cleared. Live exposure now ${activeAfter}/${maxConcurrent}.`,
 lastBlockedReason: String(existingAudit?.reason || stored?.autoTradeLastSkipReason || '').trim(),
 openCount: activeAfter,
 maxConcurrent,
 updatedAt: now,
 },
 });
 await v16PushNotificationFeed({
 tone: 'info',
 title: 'Slots reopened',
 what: `Concurrent usage dropped to ${activeAfter}/${maxConcurrent}.`,
 why: 'The previous slot block was based on an older engine snapshot.',
 next: 'Auto-trade can evaluate fresh candidates again on the next scan or lifecycle replay.',
 action: 'Use the Orders desk audit card to inspect current capacity.',
 }).catch(() => null);
 }
 if (stored?.autoTrade && slotFreed && recentScanResults.length && recentScanAgeMs <= (15 * 60 * 1000)) {
 dlog(`[AUTO-TRADE] Lifecycle replay: slot freed (${activeAfter}/${activeEntries.length} active), replaying latest ${recentScanResults.length} scan results`);
 runAutoTradeEngine(recentScanResults).catch(err => dlog(`[AUTO-TRADE] Lifecycle replay error: ${String(err?.message || err)}`));
 }
 return {
 ok: true,
 active: activeAfter,
 updated,
 };
}

// -----------------------------------------------------------------------------
// AUTO-TRADE ENGINE
// Called after each scan completes. Places orders automatically when signals
// meet criteria and the master autoTrade toggle is enabled.
// -----------------------------------------------------------------------------
async function runAutoTradeEngine(scanResults = []) {
 let bestSignalSummary = null;
 let persistAudit = async () => {};
 dlog(`[AUTO-TRADE] Engine start - ${scanResults?.length || 0} signals`);
 try {
 // 1. Read all required storage keys
 const stored = await new Promise(resolve =>
 chrome.storage.local.get([
 'autoTrade', 'autoTradeSettings', 'autoTradeLog',
 'strategy',
 'autoTradeDailyLoss', 'autoTradeDailyResetTs', 'autoTradeCooldowns',
 'autoTradeDailyCount', 'autoTradeDailyCountResetTs',
 'autoTradeLastSkipReason',
 V16_AUTO_TRADE_PROTECTION_BLOCKS_KEY,
 V16_AUTO_TRADE_MANUAL_CONTROLS_KEY,
 V16_SHADOW_TRADE_LEDGER_KEY,
 V16_SETUP_PERFORMANCE_KEY,
 'apiCircuitBreaker',
 ], resolve)
 );

 const cfg = sanitizeAutoTradeSettings(stored?.autoTradeSettings || {});
 const now = Date.now();
 await v16ProcessShadowTrades(scanResults, cfg, stored).catch(error => {
 dlog(`[PAPER] Shadow engine error: ${String(error?.message || error).slice(0, 120)}`);
 });

 if (!stored.autoTrade) {
 dlog('[AUTO-TRADE] Master toggle OFF, skipping');
 return;
 }
 const todayStartTs = v16BgStartOfLocalDay(now);
 let dailyLoss = Number(stored.autoTradeDailyLoss || 0);
 let dailyLossResetTs = Number(stored.autoTradeDailyResetTs || 0);
 if (dailyLossResetTs < todayStartTs) {
 dailyLoss = 0;
 dailyLossResetTs = todayStartTs;
 await new Promise(r => chrome.storage.local.set({ autoTradeDailyLoss: 0, autoTradeDailyResetTs: todayStartTs }, r));
 }
 const configuredProfileId = String(cfg.profileId || '').trim();
 if (configuredProfileId) {
 try {
 const freshSnapshot = await runV16PrivateAccountSnapshot(configuredProfileId, { force: false });
 if (freshSnapshot) {
 const dailyLossSummary = v16ComputeSnapshotDailyLoss(freshSnapshot);
 dailyLoss = Number(dailyLossSummary.used || 0);
 dailyLossResetTs = Number(dailyLossSummary.startTs || todayStartTs);
 await new Promise(r => chrome.storage.local.set({
 autoTradeDailyLoss: dailyLoss,
 autoTradeDailyResetTs: dailyLossResetTs,
 }, r));
 await v16MaybeClearRecoveredDailyLossKillSwitch(dailyLoss, Number(cfg.dailyLossLimitUSD || 0), now);
 }
 } catch (_) { /* keep existing bucket on snapshot failure */ }
 }
 const manualControls = v16SanitizeManualControlState(stored?.[V16_AUTO_TRADE_MANUAL_CONTROLS_KEY] || {}, Date.now());
 const minTradeQuality = Number(cfg.minScore || 75);
 const bestSignal = (Array.isArray(scanResults) ? scanResults : [])
 .filter(s => s && s.symbol)
 .sort((a, b) => Number(b?.tradeQuality?.score || 0) - Number(a?.tradeQuality?.score || 0))[0];
 bestSignalSummary = bestSignal
 ? {
 symbol: String(bestSignal.symbol || '').trim().toUpperCase(),
 direction: String(bestSignal.direction || '').toLowerCase(),
 tradeQuality: Number(bestSignal?.tradeQuality?.score || 0),
 score: Number(bestSignal?.score || 0),
 }
 : null;
 persistAudit = async (patch = {}) => {
 await new Promise(resolve => chrome.storage.local.set({
 [V16_AUTO_TRADE_DECISION_AUDIT_KEY]: {
 updatedAt: Date.now(),
 profileId: String(cfg.profileId || '').trim(),
 autoTradeEnabled: true,
 signalsScanned: Array.isArray(scanResults) ? scanResults.length : 0,
 minTradeQuality,
 bestSignal: bestSignalSummary,
 dailyLossUsed: Number(dailyLoss || 0),
 dailyLossLimitUSD: Number(cfg.dailyLossLimitUSD || 0),
 dailyLossResetTs: Number(dailyLossResetTs || now || 0),
 ...patch,
 },
 }, resolve));
 };

 // F4: API circuit breaker - block auto-trade when API is down
 const cb = stored.apiCircuitBreaker;
 if (cb && Number(cb.pausedAt || 0) > 0) {
 // Self-healing probe: attempt a snapshot fetch to see if API has recovered.
 // runV16PrivateAccountSnapshot already resets the breaker on success.
 const probeProfileId = String(sanitizeAutoTradeSettings(stored.autoTradeSettings || {}).profileId || '').trim();
 if (probeProfileId) {
 try {
 await runV16PrivateAccountSnapshot(probeProfileId, { force: true });
 // If we get here, the API is back - breaker was reset by the snapshot success path.
 // Re-read the breaker state to confirm reset before continuing.
 const cbRecheck = await new Promise(r => chrome.storage.local.get(['apiCircuitBreaker'], r));
 if (!cbRecheck?.apiCircuitBreaker || !Number(cbRecheck.apiCircuitBreaker.pausedAt || 0)) {
 dlog('[AUTO-TRADE] API circuit breaker cleared - recovery probe succeeded, resuming');
 // Fall through to continue engine execution
 } else {
 dlog('[AUTO-TRADE] Skipped: API circuit breaker still active after probe');
 chrome.storage.local.set({ autoTradeLastSkipReason: `API circuit breaker: ${cb.reason || 'auth failure'}` });
 await persistAudit({
 status: 'blocked_api',
 reason: `API circuit breaker: ${cb.reason || 'auth failure'}`,
 });
 return;
 }
 } catch (probeErr) {
 dlog(`[AUTO-TRADE] Skipped: API circuit breaker active - recovery probe failed: ${String(probeErr?.message || '').slice(0, 80)}`);
 chrome.storage.local.set({ autoTradeLastSkipReason: `API circuit breaker: ${cb.reason || 'auth failure'}` });
 await persistAudit({
 status: 'blocked_api',
 reason: `API circuit breaker: ${cb.reason || 'auth failure'}`,
 });
 return;
 }
 } else {
 dlog(`[AUTO-TRADE] Skipped: API circuit breaker active, no profileId for recovery probe`);
 chrome.storage.local.set({ autoTradeLastSkipReason: `API circuit breaker: ${cb.reason || 'auth failure'}` });
 await persistAudit({
 status: 'blocked_api',
 reason: `API circuit breaker: ${cb.reason || 'auth failure'}`,
 });
 return;
 }
 }
 dlog(`[AUTO-TRADE] Config: minTQ=${minTradeQuality} maxScan=${cfg.maxPerScan} maxConc=${cfg.maxConcurrent} maxDay=${cfg.maxPerDay} mode=${cfg.entryMode} reverse=${cfg.reverseSignals ? 'on' : 'off'}`);

 // Diagnostic: find best signal to show why it passes/fails
 if (bestSignal) {
 const bestDecision = resolveDecisionAction(bestSignal, bestSignal?.activeThresholds || {});
 dlog(`[AUTO-TRADE] Best: ${bestSignal.symbol} tq=${bestSignal?.tradeQuality?.score} score=${bestSignal.score} dir=${bestSignal.direction} action=${bestDecision.action} threshold=${bestDecision.setupThreshold}`);
 }

 // F1: Standalone daily trade counter - reset at midnight, independent of log entries
 let dailyCount = Number(stored.autoTradeDailyCount || 0);
 if (Number(stored.autoTradeDailyCountResetTs || 0) < todayStartTs) {
 dailyCount = 0;
 await new Promise(r => chrome.storage.local.set({ autoTradeDailyCount: 0, autoTradeDailyCountResetTs: todayStartTs }, r));
 }
 const tradeLog = stored.autoTradeLog || [];
 const maxPerDay = Number(cfg.maxPerDay || 1);
 const staleDailyLimitReason = /^max (?:per day|daily attempts|trades per day) reached:/i.test(String(stored.autoTradeLastSkipReason || '').trim());
 const todaySuccessfulCountFromLog = (Array.isArray(tradeLog) ? tradeLog : []).filter(entry => {
 const ts = Number(entry?.ts || 0);
 if (ts < todayStartTs) return false;
 if (String(entry?.status || '').toLowerCase() === 'failed') return false;
 return !!(
 String(entry?.orderId || '').trim()
 || String(entry?.clientOrderId || '').trim()
 || Number(entry?.positionSeenAt || 0) > 0
 );
 }).length;
 if (dailyCount > todaySuccessfulCountFromLog) {
 dailyCount = todaySuccessfulCountFromLog;
 await new Promise(r => chrome.storage.local.set({ autoTradeDailyCount: dailyCount, autoTradeDailyCountResetTs: now }, r));
 }
 if (dailyCount < maxPerDay && staleDailyLimitReason) {
 chrome.storage.local.set({ autoTradeLastSkipReason: '' });
 }

 // 3. Kill-switch: daily loss limit exceeded -> disable auto-trade + arm kill switch
 if (Math.abs(dailyLoss) >= Number(cfg.dailyLossLimitUSD)) {
 await v16ArmAutoTradeDailyLossKillSwitch(dailyLoss, cfg.dailyLossLimitUSD, now);
 await persistAudit({
 status: 'blocked_daily_loss',
 reason: `Daily loss limit reached: ${Math.abs(Number(dailyLoss || 0)).toFixed(2)}/${Number(cfg.dailyLossLimitUSD || 0).toFixed(2)}`,
 dailyCount,
 maxPerDay,
 });
 return;
 }

 const cooldowns = stored.autoTradeCooldowns || {};
 const activeStatuses = new Set(['placed', 'pending', 'live']);
 const successfulStatuses = new Set(['placed', 'pending', 'live', 'closed', 'cancelled']);

 // F2: Try to get exchange-verified position count from the private snapshot path.
 let exchangePositionCount = -1; // -1 = unavailable
 let exchangeSnapshot = null;
 try {
 const profileId = String(cfg.profileId || '').trim();
 if (profileId) {
 exchangeSnapshot = await runV16PrivateAccountSnapshot(profileId, { force: false });
 const positions = Array.isArray(exchangeSnapshot?.marginedPositions) ? exchangeSnapshot.marginedPositions : [];
 exchangePositionCount = positions.filter(p => Number(p?.size || 0) !== 0 && v16ResolveSnapshotProductType(p) === 'futures').length;
 }
 } catch (_snapErr) { /* best-effort, fall back to log-based counting */ }
 const apiAvailable = exchangePositionCount >= 0;
 const protectionEntries = tradeLog.filter(entry => (
 String(entry?.profileId || '').trim() === String(cfg.profileId || '').trim()
 && activeStatuses.has(String(entry?.status || '').toLowerCase())
 && v16NormalizeProtectionState(entry?.protectionState || '', '') === 'unprotected'
 ));
 if (protectionEntries.length && exchangeSnapshot) {
 let protectionStateChanged = false;
 protectionEntries.forEach(entry => {
 const context = v16ResolveAutoTradeContext(exchangeSnapshot, entry);
 if (!context.position) {
 if (entry.protectionState !== 'closed') {
 entry.protectionState = 'closed';
 entry.protectionBlockReason = '';
 protectionStateChanged = true;
 }
 return;
 }
 if (context.stopOrder) {
 entry.protectionState = v16ResolveTrackedProtectionSource(context.stopOrder, entry, 'stop') === 'manual_native' ? 'manual_native' : 'armed';
 entry.stopProtectionSource = v16ResolveTrackedProtectionSource(context.stopOrder, entry, 'stop');
 entry.protectionBlockReason = '';
 protectionStateChanged = true;
 }
 });
 if (protectionStateChanged) {
 await storeLocalSet({ autoTradeLog: tradeLog.slice(0, 500) });
 }
 }
 const protectionBlocks = v16BuildAutoTradeProtectionBlocks(tradeLog);
 await storeLocalSet({ [V16_AUTO_TRADE_PROTECTION_BLOCKS_KEY]: protectionBlocks });
 const activeProtectionBlock = protectionBlocks[String(cfg.profileId || '').trim()] || stored?.[V16_AUTO_TRADE_PROTECTION_BLOCKS_KEY]?.[String(cfg.profileId || '').trim()] || null;
 if (activeProtectionBlock?.reason) {
 dlog(`[AUTO-TRADE] Protection block active: ${activeProtectionBlock.reason}`);
 chrome.storage.local.set({ autoTradeLastSkipReason: activeProtectionBlock.reason });
 await persistAudit({
 status: 'blocked_protection',
 reason: String(activeProtectionBlock.reason || '').trim(),
 });
 return;
 }

 // 4a. Auto-expire zombie entries: "placed" or "pending" entries older than 30 min that
 // never transitioned to "live" are almost certainly failed orders.
 // F2 FIX: Only expire when API confirms no matching position/order exists.
 // When API is down, DON'T expire - be conservative.
 const ZOMBIE_EXPIRY_MS = 30 * 60 * 1000;
 if (apiAvailable && exchangeSnapshot) {
 const exchangeSymbols = new Set();
 (Array.isArray(exchangeSnapshot.marginedPositions) ? exchangeSnapshot.marginedPositions : [])
 .filter(p => Number(p?.size || 0) !== 0)
 .forEach(p => exchangeSymbols.add(v16NormalizeSymbol(p?.symbol || p?.product?.symbol || '')));
 (Array.isArray(exchangeSnapshot.openOrders) ? exchangeSnapshot.openOrders : [])
 .forEach(o => exchangeSymbols.add(v16NormalizeSymbol(o?.product?.symbol || o?.symbol || '')));
 tradeLog.forEach(t => {
 const st = String(t?.status || '').toLowerCase();
 if ((st === 'placed' || st === 'pending') && !Number(t?.positionSeenAt || 0) && (now - (t.ts || 0)) > ZOMBIE_EXPIRY_MS) {
 const sym = v16NormalizeSymbol(t.symbol || '');
 // Only expire if exchange confirms this symbol has NO position or open order
 if (!exchangeSymbols.has(sym)) {
 t.status = 'cancelled';
 t.closeReason = 'zombie_expired';
 t.closedAt = now;
 dlog(`[AUTO-TRADE] Zombie expired ${t.symbol} (API confirmed no position) age=${Math.round((now - (t.ts || 0)) / 60000)}min`);
 }
 }
 });
 } else {
 dlog('[AUTO-TRADE] API snapshot unavailable - skipping zombie expiry (conservative)');
 }

 // 4b. Count currently open auto-trades
 // Concurrent is a live-exposure cap, not a rolling trade-age cap.
 // When API is available, use current exchange positions plus non-reduce entry orders.
 const logBasedCount = tradeLog.filter(t => activeStatuses.has(String(t?.status || '').toLowerCase())).length;
 const exchangeActiveSymbolMap = apiAvailable && exchangeSnapshot ? v16BuildExchangeActiveSymbolMap(exchangeSnapshot) : new Map();
 const activeEntries = apiAvailable
 ? tradeLog.filter(t => activeStatuses.has(String(t?.status || '').toLowerCase()) && exchangeActiveSymbolMap.has(v16NormalizeSymbol(t?.symbol || '')))
 : tradeLog.filter(t => activeStatuses.has(String(t?.status || '').toLowerCase()));
 const openPositionMap = new Map();
 activeEntries.forEach(t => openPositionMap.set(v16NormalizeSymbol(t.symbol || ''), t));
 let openCount;
 const reservedSlots = v16CountReservedSlots(manualControls, exchangeActiveSymbolMap, now);
 if (apiAvailable) {
 openCount = exchangeActiveSymbolMap.size + reservedSlots;
 dlog(`[AUTO-TRADE] Concurrent: exchange exposure=${exchangeActiveSymbolMap.size} + reserved=${reservedSlots} => ${openCount}, logActive=${logBasedCount}`);
 } else {
 // API down - use all active log entries and do not expire them by age.
 openCount = logBasedCount + reservedSlots;
 dlog(`[AUTO-TRADE] Concurrent (no API): log=${logBasedCount} + reserved=${reservedSlots} => ${openCount} (all active entries, no age expiry)`);
 }
 const remainingDayBudget = Math.max(0, Number(cfg.maxPerDay || 1) - dailyCount);
 const maxNew = Math.min(Number(cfg.maxPerScan) || 2, Number(cfg.maxConcurrent) - openCount, remainingDayBudget);
 const auditSignals = v16BuildAutoTradeSignalAuditEntries(scanResults, {
 cfg,
 minTradeQuality,
 cooldowns,
 manualControls,
 now,
 openPositionMap,
 exchangeActiveSymbolMap,
 limit: 5,
 });
 if (openCount < Number(cfg.maxConcurrent) && /^max concurrent reached:/i.test(String(stored.autoTradeLastSkipReason || '').trim())) {
 chrome.storage.local.set({ autoTradeLastSkipReason: '' });
 }
 if (openCount >= Number(cfg.maxConcurrent)) {
 dlog(`[AUTO-TRADE] Max concurrent reached: ${openCount}/${cfg.maxConcurrent}`);
 chrome.storage.local.set({ autoTradeLastSkipReason: v16BuildConcurrentLimitReason(openCount, cfg.maxConcurrent) });
 await persistAudit({
 status: 'blocked_concurrent',
 reason: v16BuildConcurrentLimitReason(openCount, cfg.maxConcurrent),
 openCount,
 maxConcurrent: Number(cfg.maxConcurrent || 0),
 reservedSlots,
 dailyCount,
 maxPerDay,
 remainingDayBudget,
 maxNew,
 topSignals: auditSignals,
 });
 await v16PushNotificationFeed({
 tone: 'warn',
 title: 'Auto-trade blocked by slot cap',
 what: `Current exposure is ${openCount}/${Number(cfg.maxConcurrent || 0)} including ${reservedSlots} reserved slot${reservedSlots === 1 ? '' : 's'}.`,
 why: 'New entries are paused until live exposure, queued entries, or manual reservations clear.',
 next: 'The lifecycle monitor will retry when capacity opens again.',
 action: 'Check Positions or Orders to see live, queued, and reserved slot usage.',
 }).catch(() => null);
 return;
 }
 // F1: Use standalone atomic counter instead of log-counting (log entries can be purged)
 if (dailyCount >= maxPerDay) {
 dlog(`[AUTO-TRADE] Max trades per day reached: ${dailyCount}/${maxPerDay}`);
 chrome.storage.local.set({ autoTradeLastSkipReason: `Max trades per day reached: ${dailyCount}/${maxPerDay}` });
 await persistAudit({
 status: 'blocked_daily_limit',
 reason: `Max trades per day reached: ${dailyCount}/${maxPerDay}`,
 openCount,
 maxConcurrent: Number(cfg.maxConcurrent || 0),
 reservedSlots,
 dailyCount,
 maxPerDay,
 remainingDayBudget,
 maxNew,
 topSignals: auditSignals,
 });
 await v16PushNotificationFeed({
 tone: 'warn',
 title: 'Daily trade limit reached',
 what: `${dailyCount}/${maxPerDay} successful entries were already recorded today.`,
 why: 'Per-day budget is enforcing a pause on new placements.',
 next: 'The counter resets automatically after midnight.',
 action: 'Use the audit card to confirm the current day budget.',
 }).catch(() => null);
 return;
 }

 // 5. Filter qualifying signals - use alertTier (correct field name) OR score threshold
 // When API is available, only keep log entries that still match live exchange exposure.
 const flipCandidates = [];
 const fundingBlockedReasons = [];
 const baseCandidates = (Array.isArray(scanResults) ? scanResults : [])
 .filter(s => {
 const normalizedSignalSymbol = v16NormalizeSymbol(s?.symbol || '');
 const decision = resolveDecisionAction(s, s?.activeThresholds || {});
 const shortlistAction = String(s?.shortlistAction || decision.action || '').toUpperCase();
 const tq = Number(s?.tradeQuality?.score || 0);
 const dir = String(s.direction || '').toLowerCase();
 const hasSlTp = !!(s.sl && (s.tp1 || s.tp));
 const cooldownOk = (now - (cooldowns[s.symbol] || 0)) > Number(cfg.cooldownSec) * 1000;
 const dirOk = /^(long|short)/.test(dir);
 const qualifies = shortlistAction === 'TRADE NOW'
 && tq >= minTradeQuality
 && dirOk
 && s?.dailyConfirmation?.passed !== false
 && s.symbol && s.entry && hasSlTp
 && cooldownOk;
 if (!qualifies) {
 // Verbose logging for near-qualifying signals (TQ >= 65) to help diagnose
 if (tq >= 65) {
 dlog(`[AUTO-TRADE] Warning NEAR-MISS ${s.symbol} act=${shortlistAction} tq=${tq} dir=${dir} dirOk=${dirOk} entry=${!!s.entry} sl=${!!s.sl} tp=${!!(s.tp1 || s.tp)} cd=${cooldownOk} score=${s.score} thresh=${decision.setupThreshold}`);
 } else {
 dlog(`[AUTO-TRADE] Rejected ${s.symbol || '?'} act=${shortlistAction} tq=${tq} dir=${dir}`);
 }
 return false;
 }
 const executionSignal = v16BuildExecutionSignal(s, cfg);
 const executionSide = String(executionSignal.direction || '').toLowerCase().startsWith('short') ? 'short' : 'long';
 const fundingRate = Number(s?.fundingRate || 0);
 const manual = v16ResolveSymbolManualControls(manualControls, normalizedSignalSymbol, now);
 if (manual.paused) {
 dlog(`[AUTO-TRADE] Manual pause active for ${s.symbol}`);
 return false;
 }
 if (manual.reentryBlocked) {
 dlog(`[AUTO-TRADE] Manual re-entry block active for ${s.symbol}`);
 return false;
 }
 if (manual.blockedToday) {
 dlog(`[AUTO-TRADE] Manual block-today active for ${s.symbol}`);
 return false;
 }
 const signalGate = v16EvaluateAutoTradeSignalGate(s, cfg);
 if (!signalGate.passed) {
 dlog(`[AUTO-TRADE] Skipped ${s.symbol} (${signalGate.reasons.join('; ')})`);
 return false;
 }
 const entryTrigger = resolveEntryTrigger(s, cfg);
 s.entryTrigger = entryTrigger;
 if (cfg.entryTriggerRequired !== false && !entryTrigger.passed) {
 dlog(`[AUTO-TRADE] Skipped ${s.symbol} (entry trigger: ${(entryTrigger.reasons || []).join('; ') || 'waiting'})`);
 return false;
 }
 const riskQuality = resolveRiskQualityGate(s, cfg);
 s.riskQuality = riskQuality;
 if (cfg.riskQualityRequired !== false && !riskQuality.passed) {
 dlog(`[AUTO-TRADE] Skipped ${s.symbol} (risk quality: ${(riskQuality.reasons || []).join('; ') || 'quality gate failed'})`);
 return false;
 }
 const correlationReason = v16BuildCorrelationBlockReason(s, { cfg, executionSide, openPositionMap, exchangeActiveSymbolMap, scanResults });
 if (correlationReason) {
 dlog(`[AUTO-TRADE] Skipped ${s.symbol} (${correlationReason})`);
 return false;
 }
 if (!manual.ignoreFunding && v16IsFundingAdverseForSide(executionSide, fundingRate, cfg.maxAdverseFundingRatePct)) {
 const fundingReason = v16BuildFundingSkipReason(s.symbol, executionSide, fundingRate, cfg.maxAdverseFundingRatePct, {
 reverseApplied: !!executionSignal.autoTradeReverseApplied,
 originalSide: executionSignal.autoTradeOriginalDirection || s.direction,
 });
 fundingBlockedReasons.push(fundingReason);
 dlog(`[AUTO-TRADE] ${fundingReason}`);
 return false;
 }
 const existing = openPositionMap.get(normalizedSignalSymbol);
 if (!existing) {
 const exchangeExisting = exchangeActiveSymbolMap.get(normalizedSignalSymbol);
 if (!exchangeExisting) return true;
 dlog(`[AUTO-TRADE] Skipped ${s.symbol} (already on exchange ${exchangeExisting.side} ${exchangeExisting.status} via ${exchangeExisting.source})`);
 return false;
 }
 const existingSide = v16ResolveAutoTradePositionSide(existing);
 const newSide = executionSide;
 if (existingSide !== newSide) {
 flipCandidates.push({ signal: executionSignal, existingEntry: existing, newSide });
 }
 dlog(`[AUTO-TRADE] Skipped ${s.symbol} (already open ${existingSide} ${existing.status})`);
 return false;
 });
 const candidates = baseCandidates
 .slice(0, Math.max(0, maxNew))
 .map(signal => {
 const executionSignal = v16BuildExecutionSignal(signal, cfg);
 return executionSignal;
 });

 // 5b. Signal-flip auto-close: close conflicting positions (do NOT place opposite trade)
 if (cfg.closeOnFlip && flipCandidates.length > 0) {
 let flipAccess = null;
 try {
 flipAccess = await v16ResolveAuthorizedProfile({ profileId: cfg.profileId || '' }, { tradeRequired: true });
 } catch (_) { }
 if (flipAccess) {
 const telegramCfg = cfg.notifyTelegram ? await getStoredTelegramConfig().catch(() => null) : null;
 for (const flip of flipCandidates) {
 try {
 const snapshot = await runV16PrivateAccountSnapshot(flipAccess.profileId, { force: true });
 const context = v16ResolveAutoTradeContext(snapshot, flip.existingEntry);
 if (!context.position) {
 flip.existingEntry.status = 'closed';
 flip.existingEntry.closeReason = 'signal_flip';
 flip.existingEntry.closedAt = now;
 dlog('[AUTO-TRADE] Signal flip: no live position found for ' + flip.existingEntry.symbol + ', marked closed');
 continue;
 }
 const linkedOrderIds = [context.stopOrder?.orderId, context.targetOrder?.orderId].filter(Boolean);
 const linkedClientOrderIds = [flip.existingEntry.clientOrderId, flip.existingEntry.stopOrderId, flip.existingEntry.targetOrderId].filter(Boolean);
 await runV16PlacePositionAction({
 profileId: flipAccess.profileId,
 baseUrl: flipAccess.baseUrl,
 symbol: flip.existingEntry.symbol,
 positionSide: v16ResolveAutoTradePositionSide(flip.existingEntry),
 positionSize: context.position.size,
 requestedAction: 'close',
 clientOrderId: ('FLIP_' + flip.existingEntry.symbol + '_' + now).slice(0, 32),
 linkedOrderIds,
 linkedClientOrderIds,
 });
 flip.existingEntry.status = 'closed';
 flip.existingEntry.closeReason = 'signal_flip';
 flip.existingEntry.closedAt = now;
 openPositionMap.delete(flip.existingEntry.symbol);
 await v16EmitAutoTradeLifecycleEvent('signal_flip', flip.existingEntry, { cfg, telegramCfg, newDirection: flip.newSide }).catch(() => { });
 dlog('[AUTO-TRADE] Signal flip: closed ' + v16ResolveAutoTradePositionSide(flip.existingEntry) + ' ' + flip.existingEntry.symbol + ' (new signal: ' + flip.newSide + ')');
 if (typeof fireWebhooks === 'function') {
 fireWebhooks('auto_trade_signal_flip', { symbol: flip.existingEntry.symbol, closedSide: v16ResolveAutoTradePositionSide(flip.existingEntry), newDirection: flip.newSide, profileId: flipAccess.profileId });
 }
 } catch (err) {
 dlog('[AUTO-TRADE] Signal flip close failed for ' + flip.existingEntry.symbol + ': ' + String(err?.message || 'unknown'));
 }
 }
 }
 }

 if (!candidates.length) {
 dlog(`[AUTO-TRADE] No qualifying candidates from ${scanResults?.length || 0} signals`);
 const noCandidateReason = fundingBlockedReasons[0] || `No qualifying signals from ${scanResults?.length || 0} scanned`;
 chrome.storage.local.set({
 autoTradeLastSkipReason: noCandidateReason,
 });
 await persistAudit({
 status: 'no_candidates',
 reason: noCandidateReason,
 openCount,
 maxConcurrent: Number(cfg.maxConcurrent || 0),
 reservedSlots,
 dailyCount,
 maxPerDay,
 remainingDayBudget,
 maxNew,
 fundingBlocked: fundingBlockedReasons.length,
 topSignals: auditSignals,
 });
 await v16PushNotificationFeed({
 tone: 'info',
 title: 'No new auto-trade candidate',
 what: noCandidateReason,
 why: fundingBlockedReasons.length
 ? 'The best-looking candidates were blocked by adverse funding.'
 : 'No signal cleared the current decision filters.',
 next: 'The engine will keep scanning and re-evaluating fresh signals.',
 action: 'Open a signal popup to inspect live decision status and manual controls.',
 }).catch(() => null);
 return;
 }

 // 6. Resolve trading profile (needs tradeRequired capability)
 let access = null;
 try {
 access = await v16ResolveAuthorizedProfile({ profileId: cfg.profileId || '' }, { tradeRequired: true });
 } catch (err) {
 const accessBlock = v16ResolveProfileAccessBlock(err);
 dlog(`[AUTO-TRADE] No authorized trading profile: ${err?.message}`);
 await persistAudit({
 status: accessBlock.status,
 reason: `No authorized trading profile: ${String(err?.message || 'profile unavailable')}`,
 openCount,
 maxConcurrent: Number(cfg.maxConcurrent || 0),
 reservedSlots,
 dailyCount,
 maxPerDay,
 remainingDayBudget,
 maxNew,
 topSignals: auditSignals,
 });
 await v16PushNotificationFeed({
 tone: 'error',
 title: accessBlock.title,
 what: accessBlock.what,
 why: accessBlock.why,
 next: accessBlock.next,
 action: accessBlock.action,
 }).catch(() => null);
 return;
 }
 const blockedSymbols = new Set(sanitizeBlockedSymbolList(access.profile?.blockedSymbols || []));

 // Phase 5: VAR integration - check directional slot limits
 let varCaps = null;
 let varLongUsed = 0;
 let varShortUsed = 0;
 try {
 const varContext = {};
 if (exchangeSnapshot && Array.isArray(exchangeSnapshot.marginedPositions)) {
 varLongUsed = exchangeSnapshot.marginedPositions.filter(p => Number(p?.size || 0) > 0 && v16ResolveSnapshotProductType(p) === 'futures').length;
 varShortUsed = exchangeSnapshot.marginedPositions.filter(p => Number(p?.size || 0) < 0 && v16ResolveSnapshotProductType(p) === 'futures').length;
 varContext.longPositions = varLongUsed;
 varContext.shortPositions = varShortUsed;
 }
 varCaps = resolveVarPositionCaps(access.profile || {}, varContext);
 } catch (_varErr) { /* VAR is best-effort, don't block trading if it fails */ }

 let placed = 0;
 const placedSymbols = [];
 for (const signal of candidates) {
 if (placed >= maxNew) break;
 // Re-check daily placement counter inside the loop so newly placed orders stop further entries
 if (dailyCount >= Number(cfg.maxPerDay || 1)) {
 dlog(`[AUTO-TRADE] Daily limit reached mid-loop: ${dailyCount}/${cfg.maxPerDay}`);
 break;
 }
 if (blockedSymbols.has(String(signal.symbol || '').trim().toUpperCase())) {
 dlog(`[AUTO-TRADE] Skipped blocked symbol: ${signal.symbol}`);
 continue;
 }
 const side = normalizeOrderSide(signal.direction || signal.side || '', 'buy');

 // Phase 5: VAR directional slot check (uses local counters that increment with each placement)
 if (varCaps) {
 const positionSide = side === 'sell' ? 'short' : 'long';
 if (positionSide === 'long' && varLongUsed >= Number(varCaps.longSlots || Infinity)) {
 dlog(`[AUTO-TRADE] VAR: long slots full (${varLongUsed}/${varCaps.longSlots}) - skipping ${signal.symbol}`);
 continue;
 }
 if (positionSide === 'short' && varShortUsed >= Number(varCaps.shortSlots || Infinity)) {
 dlog(`[AUTO-TRADE] VAR: short slots full (${varShortUsed}/${varCaps.shortSlots}) - skipping ${signal.symbol}`);
 continue;
 }
 }
 const entryPrice = Number(signal.entry);
 const slPrice = Number(signal.sl);
 const tpPrice = Number(signal.tp1 || signal.tp);
 const sizing = v16ResolveAutoTradeRequestedSize(signal, cfg);
 // F5: maker_preferred tries post_only first, falls back to non-post_only on cancellation
 const isMakerPreferred = cfg.entryMode === 'maker_preferred';
 const isPostOnly = cfg.entryMode === 'maker_only' || isMakerPreferred;
 const orderType = cfg.entryMode === 'market' ? 'market_order' : 'limit_order';

 const payload = {
 profileId: access.profileId || '',
 credentialAlias: access.credentialAlias || '',
 symbol: signal.symbol,
 side,
 sizeMode: 'usd',
 sizeInput: sizing.requestedSizeUSD,
 maxNotionalUSD: sizing.requestedMaxNotionalUSD,
 price: entryPrice,
 entry: entryPrice,
 stopLoss: slPrice,
 takeProfit: tpPrice,
 orderType,
 limitPrice: entryPrice,
 postOnly: isPostOnly,
 clientOrderId: ('AT_' + signal.symbol + '_' + now).slice(0, 32),
 isAutoTrade: true,
 };

 let logEntry;
 try {
 let result;
 let usedFallback = false;
 try {
 result = await runV16PlaceTradeOrder(payload);
 } catch (firstErr) {
 // F5: If maker_preferred and post_only was rejected, retry without post_only
 const errMsg = String(firstErr?.message || '').toLowerCase();
 if (isMakerPreferred && (errMsg.includes('immediate_execution') || errMsg.includes('post_only') || errMsg.includes('postonly'))) {
 dlog(`[AUTO-TRADE] Maker post_only rejected for ${signal.symbol}, retrying as limit (no post_only)`);
 const fallbackPayload = { ...payload, postOnly: false, clientOrderId: ('AT2' + signal.symbol + '_' + now).slice(0, 32) };
 result = await runV16PlaceTradeOrder(fallbackPayload);
 usedFallback = true;
 } else {
 throw firstErr; // Not a post_only rejection - propagate original error
 }
 }
 const orderId = String(
 result?.result?.id || result?.result?.result?.id || result?.result?.client_order_id || ''
 );
 const placedAt = Number(result?.placedAt || now);
 logEntry = {
 id: String(payload.clientOrderId || orderId || `${signal.symbol}_${placedAt}`),
 symbol: signal.symbol, side, sizeUSD: sizing.requestedSizeUSD,
 requestedSizeUSD: sizing.requestedSizeUSD,
 requestedMaxNotionalUSD: sizing.requestedMaxNotionalUSD,
 entry: entryPrice, sl: slPrice, tp: tpPrice,
 tp1: Number(signal.tp1 || 0), tp2: Number(signal.tp2 || 0), tp3: Number(signal.tp3 || 0), tp4: Number(signal.tp4 || 0),
 ts: placedAt, orderId, status: 'placed',
 score: signal.score,
 tradeQuality: Number(signal?.tradeQuality?.score || 0),
 shortlistAction: signal?.shortlistAction || '',
 tier: signal.alertTier || signal.tier,
 setupFamily: String(signal.setupFamily || '').trim(),
 symbolMaturity: sizing.maturity,
 reverseSignals: !!signal?.autoTradeReverseApplied,
 signalDirection: String(signal?.autoTradeExecutionDirection || signal?.direction || '').trim(),
 originalSignalDirection: String(signal?.autoTradeOriginalDirection || signal?.direction || '').trim(),
 source: 'auto',
 profileId: access.profileId || '',
 baseUrl: access.baseUrl || '',
 clientOrderId: usedFallback ? ('AT2' + signal.symbol + '_' + now).slice(0, 32) : payload.clientOrderId,
 positionSide: side === 'sell' ? 'short' : 'long',
 profileMaxOrderSizeUSD: Number(access.profile?.maxOrderSizeUSD || 60),
 effectiveMaxNotionalUSD: Math.min(Number(access.profile?.maxOrderSizeUSD || 60), sizing.requestedMaxNotionalUSD || Number(access.profile?.maxOrderSizeUSD || 60)),
 previewContracts: Number(result?.preview?.size || 0),
 previewDisplaySize: Number(result?.preview?.displaySize || 0),
 previewDisplayUnit: String(result?.preview?.displayUnit || 'contracts'),
 expectedNotionalUSD: Number(result?.preview?.estimatedNotional || 0),
 takeProfitLimitPrice: Number(result?.preview?.takeProfitLimitPrice || tpPrice || 0),
 targetAutoShiftStage: 'tp1',
 targetShiftEvents: [],
 protectionState: 'armed',
 stopProtectionSource: 'app_native',
 targetProtectionSource: 'app_native',
 protectionBlockReason: '',
 makerFallback: usedFallback,
 notifications: {},
 };
 cooldowns[signal.symbol] = now;
 placed++;
 placedSymbols.push(String(signal.symbol || '').trim().toUpperCase());
 // Increment daily trade counter only for successfully placed entries.
 dailyCount++;
 chrome.storage.local.set({ autoTradeDailyCount: dailyCount });
 // Phase 5: Increment local VAR counters so next candidate sees updated slots
 if (varCaps) {
 const placedSide = side === 'sell' ? 'short' : 'long';
 if (placedSide === 'long') varLongUsed++;
 else varShortUsed++;
 }
 await v16EmitAutoTradeLifecycleEvent('placed', logEntry, { cfg, telegramCfg: cfg.notifyTelegram ? await getStoredTelegramConfig().catch(() => null) : null }).catch(() => { });
 logEntry.notifications.placedAt = Date.now();
 dlog(`[AUTO-TRADE] Placed ${logEntry.symbol} ${logEntry.side} maturity=${String(sizing.maturity?.state || 'validated')} size=$${sizing.requestedSizeUSD} entry=${logEntry.entry} sl=${logEntry.sl} tp=${logEntry.tp}${usedFallback ? ' (maker limit fallback)' : ''}`);
 chrome.storage.local.set({ autoTradeLastSkipReason: '' });
 // Fire webhook for auto_trade_placed if fireWebhooks is available
 if (typeof fireWebhooks === 'function') {
 fireWebhooks('auto_trade_placed', { ...logEntry, profileId: access.profileId });
 }
 } catch (err) {
 logEntry = {
 symbol: signal.symbol, side, ts: now, status: 'failed', source: 'auto',
 error: String(err?.message || 'unknown').slice(0, 150),
 };
 dlog(`[AUTO-TRADE] Order FAILED ${signal.symbol}: ${String(err?.message || 'unknown').slice(0, 150)} | side=${side} entry=${entryPrice} sl=${slPrice} tp=${tpPrice} sz=$${sizing.requestedSizeUSD}`);
 }
 tradeLog.unshift(logEntry);
 }

 // 7. Persist log (cap at 100) + cooldowns
 await persistAudit({
 status: placed > 0 ? 'placed' : 'no_place',
 reason: placed > 0
 ? `Placed ${placed} new trade${placed === 1 ? '' : 's'} this scan.`
 : `No orders were placed from ${candidates.length} qualified candidate${candidates.length === 1 ? '' : 's'}.`,
 openCount,
 maxConcurrent: Number(cfg.maxConcurrent || 0),
 dailyCount,
 maxPerDay,
 remainingDayBudget: Math.max(0, Number(cfg.maxPerDay || 1) - dailyCount),
 maxNew,
 placed,
 placedSymbols,
 bestSignal: bestSignalSummary,
 topSignals: auditSignals,
 });
 await new Promise(r => chrome.storage.local.set({
 autoTradeLog: tradeLog.slice(0, 500),
 autoTradeCooldowns: cooldowns,
 }, r));
 await new Promise(resolve => syncAutoTradeMonitorAlarm(resolve));
 dlog(`[AUTO-TRADE] Engine complete - placed: ${placed}`);
 } catch (engineErr) {
 const errMsg = engineErr instanceof Error
 ? `${engineErr.name}: ${engineErr.message}`
 : JSON.stringify(engineErr) || typeof engineErr + ':' + String(engineErr);
 dlog(`[AUTO-TRADE] CRASH: ${errMsg}`);
 chrome.storage.local.set({ autoTradeLastSkipReason: `Engine crash: ${errMsg.slice(0, 150)}` });
 await persistAudit({
 status: 'engine_crash',
 reason: `Engine crash: ${errMsg.slice(0, 150)}`,
 bestSignal: bestSignalSummary,
 });
 throw engineErr;
 }
}

async function runV16PlacePositionAction(payload = {}) {
 const resolved = v16ResolvePositionActionPayload(payload);
 const result = await runV16PlaceTradeOrder({
 ...resolved.previewPayload,
 profileId: payload.profileId,
 clientOrderId: payload.clientOrderId,
 baseUrl: resolved.baseUrl,
 });
 let warning = '';
 let orderCleanup = null;
 if (resolved.action === 'close') {
 try {
 orderCleanup = await runV16CancelLinkedOrders({
 profileId: payload.profileId,
 linkedOrderIds: resolved.linkedOrderIds,
 linkedClientOrderIds: resolved.linkedClientOrderIds,
 baseUrl: resolved.baseUrl,
 });
 const canceledCount = Number(orderCleanup?.canceledCount || 0);
 if (canceledCount > 0) {
 warning = `Cancelled ${canceledCount} linked FWD-managed order${canceledCount === 1 ? '' : 's'} after the close request.`;
 }
 } catch (error) {
 warning = `Close order was sent, but linked-order cleanup failed: ${error?.message || 'request failed'}.`;
 }
 }
 return {
 ...result,
 action: resolved.action,
 positionSide: resolved.positionSide,
 positionSize: resolved.positionSize,
 fraction: resolved.fraction,
 warning,
 orderCleanup,
 };
}

async function runV16PlaceProtectionOrder(payload = {}) {
 const access = await v16ResolveAuthorizedProfile(payload, { tradeRequired: true });
 const previewData = await runV16ProtectionOrderPreview(payload);
 const preview = previewData.preview;
 const requestBody = v16CompactOrderRequestBody({
 product_id: preview.productId,
 size: preview.size,
 side: preview.side,
 order_type: 'market_order',
 stop_order_type: preview.stopOrderType,
 stop_price: Number(preview.triggerPrice || 0),
 reduce_only: true,
 time_in_force: 'gtc',
 client_order_id: String(payload.clientOrderId || preview.clientOrderId || '').slice(0, 32),
 });
 const result = await v16SignedFetch({
 ...v16BuildPrivateAccessArgs(access),
 method: 'POST',
 path: '/orders',
 body: requestBody,
 baseUrl: access.baseUrl,
 });
 return {
 placedAt: Date.now(),
 request: requestBody,
 result,
 preview,
 };
}

async function runV16GetAutoTradeManualControls() {
 return v16LoadManualControlState(Date.now());
}

async function runV16UpdateAutoTradeManualControl(msg = {}) {
 const result = await v16UpdateManualControlState(msg);
 const symbol = v16NormalizeSymbol(msg?.symbol || '');
 const kind = String(msg?.kind || '').trim().toLowerCase();
 const durationMs = Math.max(0, Number(msg?.durationMs || 0));
 const durationLabel = durationMs > 0 ? v16FormatManualControlDuration(durationMs) : 'today';
 await v16PushNotificationFeed({
 tone: kind === 'clear_all' ? 'info' : 'warn',
 title: kind === 'clear_all' ? `Cleared controls ${symbol}` : `Manual control ${symbol}`,
 symbol,
 what: kind === 'clear_all'
 ? `Manual overrides were cleared for ${symbol}.`
 : `${symbol} now has ${kind.replace(/_/g, ' ')} active for ${durationLabel}.`,
 why: 'This was requested manually from the popup.',
 next: 'The next decision pass will respect the updated symbol override.',
 action: kind === 'reserve_slot'
 ? 'Reserved slots count toward concurrent capacity until they expire or are cleared.'
 : 'Re-open the signal popup to inspect the updated live decision state.',
 }).catch(() => null);
 return { ok: true, ...result };
}

async function runV16CloseAndBlockSymbolToday(msg = {}) {
 const now = Date.now();
 const symbol = v16NormalizeSymbol(msg?.symbol || '');
 if (!symbol) throw new Error('Symbol is required');
 const control = await v16UpdateManualControlState({ symbol, kind: 'block_today' });
 let closed = false;
 let cancelled = false;
 try {
 const settingsDoc = await storeLocalGet(['autoTradeSettings']);
 const cfg = sanitizeAutoTradeSettings(settingsDoc?.autoTradeSettings || {});
 const access = await v16ResolveAuthorizedProfile({ profileId: msg?.profileId || cfg.profileId || '' }, { tradeRequired: true });
 const cancelResult = await runV16CancelAllOrdersForSymbol({
 profileId: access.profileId,
 symbol,
 baseUrl: access.baseUrl,
 }).catch(() => null);
 cancelled = !!cancelResult?.ok;
 const snapshot = await runV16PrivateAccountSnapshot(access.profileId, { force: true });
 const position = (Array.isArray(snapshot?.marginedPositions) ? snapshot.marginedPositions : [])
 .find(item => v16NormalizeSymbol(item?.symbol || item?.product?.symbol || '') === symbol && Number(item?.size || 0) !== 0);
 if (position) {
 const closeResult = await runV16PlacePositionAction({
 profileId: access.profileId,
 baseUrl: access.baseUrl,
 symbol,
 positionSide: Number(position?.size || 0) < 0 ? 'short' : 'long',
 positionSize: Math.abs(Number(position?.size || 0)),
 requestedAction: 'close',
 clientOrderId: (`BLK_${symbol}_${now}`).slice(0, 32),
 }).catch(() => null);
 closed = !!closeResult?.action;
 }
 } finally {
 await v16PushNotificationFeed({
 tone: 'warn',
 title: `Blocked ${symbol} for today`,
 symbol,
 what: `${symbol} will not be auto-traded again today.`,
 why: closed
 ? 'Live exposure was closed and the symbol was blocked for the rest of the day.'
 : 'The symbol was blocked for the rest of the day; any live exposure was already flat or unavailable.',
 next: 'The block clears automatically at the next day boundary.',
 action: 'Use the signal popup controls if you want to clear the block early.',
 }).catch(() => null);
 }
 return {
 ok: true,
 control,
 closed,
 cancelled,
 };
}


globalThis.FWDTradeDeskV16 = Object.freeze({
 V16_ACCOUNT_METADATA_KEY,
 V16_ACCOUNT_SECRETS_KEY,
 ensureV16AccountState,
 getV16AccountState,
 saveV16AccountState,
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
 if (!msg || !String(msg.action || '').startsWith('v16')) return false;
 if (typeof isTrustedRuntimeSender === 'function' && !isTrustedRuntimeSender(sender)) {
 sendResponse({ ok: false, error: 'Unauthorized sender' });
 return false;
 }
 if (msg.action === 'v16:getAccountState') {
 getV16AccountState()
 .then(state => sendResponse({ ok: true, ...state }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load v16 account state' }));
 return true;
 }
 if (msg.action === 'v16:saveAccountState') {
 saveV16AccountState(msg.metadata, msg.secrets)
 .then(state => sendResponse({ ok: true, ...state }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to save v16 account state' }));
 return true;
 }
 if (msg.action === 'v16:checkMarketData') {
 runV16MarketDataCheck()
 .then(result => sendResponse({ ok: true, ...result }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to check public market data' }));
 return true;
 }
 if (msg.action === 'v16:checkNativeCredentialHost') {
 v17CheckNativeHost(!!msg.force)
 .then(result => sendResponse({ ok: !!result?.ok, available: !!result?.ok, error: result?.error || '' }))
 .catch(error => sendResponse({ ok: false, available: false, error: error?.message || 'Native host check failed' }));
 return true;
 }
 if (msg.action === 'v16:getPrivateAccountSnapshot') {
 runV16PrivateAccountSnapshot(msg.profileId, { force: !!msg.force })
 .then(result => sendResponse({ ok: true, ...result }))
 .catch(error => sendResponse({
 ok: false,
 error: error?.message || 'Failed to load private Delta data',
 rateLimit: error?.isRateLimit ? {
 active: true,
 until: Date.now() + Math.max(1000, Number(error?.retryAfterMs || 0)),
 waitMs: Math.max(1000, Number(error?.retryAfterMs || 0)),
 baseUrl: String(error?.baseUrl || '').trim(),
 } : null,
 }));
 return true;
 }
 if (msg.action === 'v16:getPublicTicker') {
 runV16PublicTicker(msg)
 .then(result => sendResponse(result))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load public ticker' }));
 return true;
 }
 if (msg.action === 'v16:getPublicProducts') {
 fetchProducts()
 .then(products => sendResponse({ ok: true, products }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load public products' }));
 return true;
 }
 if (msg.action === 'v16:getPublicCandles') {
 runV16PublicCandles(msg)
 .then(result => sendResponse(result))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load public candles' }));
 return true;
 }
 if (msg.action === 'v16:getTradeOrderPreview') {
 runV16TradeOrderPreview(msg)
 .then(result => sendResponse(result))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to prepare order preview' }));
 return true;
 }
 if (msg.action === 'v16:getPositionActionPreview') {
 runV16PositionActionPreview(msg)
 .then(result => sendResponse(result))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to prepare position action preview' }));
 return true;
 }
 if (msg.action === 'v16:getProtectionOrderPreview') {
 runV16ProtectionOrderPreview(msg)
 .then(result => sendResponse(result))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to prepare protection order preview' }));
 return true;
 }
 if (msg.action === 'v16:placeTradeOrder') {
 runV16PlaceTradeOrder(msg)
 .then(result => sendResponse({ ok: true, ...result }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to place live order' }));
 return true;
 }
 if (msg.action === 'v16:getOpenOrderBook') {
 runV16GetOpenOrderBook(msg)
 .then(result => sendResponse(result))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load open orders' }));
 return true;
 }
 if (msg.action === 'v16:getOrderEditPreview') {
 runV16GetOrderEditPreview(msg)
 .then(result => sendResponse(result))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to prepare order edit preview' }));
 return true;
 }
 if (msg.action === 'v16:updateOrder') {
 runV16UpdateOrder(msg)
 .then(result => sendResponse({ ok: true, ...result }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to update order' }));
 return true;
 }
 if (msg.action === 'v16:cancelOrder') {
 runV16CancelOrder(msg)
 .then(result => sendResponse({ ok: true, ...result }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to cancel order' }));
 return true;
 }
 if (msg.action === 'v16:cancelAllOrdersForSymbol') {
 runV16CancelAllOrdersForSymbol(msg)
 .then(result => sendResponse({ ok: true, ...result }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to cancel symbol orders' }));
 return true;
 }
 if (msg.action === 'v16:cancelLinkedOrders') {
 runV16CancelLinkedOrders(msg)
 .then(result => sendResponse({ ok: true, ...result }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to cancel linked orders' }));
 return true;
 }
 if (msg.action === 'v16:placePositionAction') {
 runV16PlacePositionAction(msg)
 .then(result => sendResponse({ ok: true, ...result }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to execute position action' }));
 return true;
 }
 if (msg.action === 'v16:placeProtectionOrder') {
 runV16PlaceProtectionOrder(msg)
 .then(result => sendResponse({ ok: true, ...result }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to place protection order' }));
 return true;
 }
 if (msg.action === 'v16:getAutoTradeManualControls') {
 runV16GetAutoTradeManualControls()
 .then(result => sendResponse({ ok: true, ...result }))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to load manual controls' }));
 return true;
 }
 if (msg.action === 'v16:updateAutoTradeManualControl') {
 runV16UpdateAutoTradeManualControl(msg)
 .then(result => sendResponse(result))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to update manual control' }));
 return true;
 }
 if (msg.action === 'v16:closeAndBlockSymbolToday') {
 runV16CloseAndBlockSymbolToday(msg)
 .then(result => sendResponse(result))
 .catch(error => sendResponse({ ok: false, error: error?.message || 'Failed to close and block symbol' }));
 return true;
 }
 return false;
});

Promise.all([ensureV16AccountState(), v16RestorePrivateRateLimitState()])
 .then(() => {
 if (typeof dlog === 'function') dlog('v16 capability state ready');
 })
 .catch(error => {
 if (typeof dlog === 'function') dlog(`v16 capability bootstrap error: ${error?.message || 'unknown error'}`);
 });
