'use strict';

const {
 createDefaultAccountState,
 classifySymbolMaturity: v16ClassifySymbolMaturity,
 hasCompleteBracketProtection,
 normalizeOrderSide,
 normalizePositionSide,
  sanitizeAutoTradeSettings,
 sanitizeBlockedSymbolList,
  resolveBracketProtectionLevels,
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
const V16_AUTO_TRADE_DECISION_AUDIT_KEY = 'autoTradeDecisionAuditV16';
const SINGLE_ACCOUNT_PROFILE_ID = 'primary';
const SINGLE_CREDENTIAL_ALIAS = 'FWD Bharat MarketDesk/primary';
const V16_AUTO_TRADE_MANUAL_CONTROLS_KEY = 'v16AutoTradeManualControlsV17';
const V16_NOTIFICATION_FEED_KEY = 'v16NotificationFeedV17';
const V16_PUBLIC_CANDLE_RESOLUTIONS = new Set(['4h', '1d', '1w']);
const DHAN_MANUAL_ONLY_ORDER_DISABLED = 'Order placement is disabled in this manual-only build';
const DHAN_MANUAL_ONLY_MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let v16AccountStateQueue = Promise.resolve();
const v16PrivateSnapshotCache = new Map();
const v16PrivateSnapshotInFlight = new Map();
const v16PrivateRateLimitState = new Map();
const v16PrivateRateLimitNotifiedUntil = new Map();
const v16EntryOrderInFlight = new Map();
const V17_NATIVE_HOST_NAME = 'com.fwd_bharat_marketdesk.pro.native';
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

function v17SanitizeCredentialAlias(value = '', profileId = '') {
 return SINGLE_CREDENTIAL_ALIAS;
}

function v17UsesNativeCredential(profile = {}) {
 return String(profile?.credentialSource || '').trim().toLowerCase() === 'native_host';
}

function v17BuildPrivateRequestShape({ method = 'GET', path = '', query = null, body = null, baseUrl = '' } = {}) {
 v16AssertDhanManualOnlySafeRequest(method, path);
 const upperMethod = String(method || 'GET').toUpperCase();
 const rawPath = String(path || '').trim() || '/';
 const apiPath = rawPath.startsWith('/v2') ? (rawPath.slice(3) || '/') : rawPath;
 const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
 const requestPath = `/v2${normalizedPath}`;
 const resolvedBaseUrl = String(baseUrl || BASE || '').trim();
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
 const triggeredAt = Number(killSwitch.updatedAt || 0);
 const todayStart = v16BgStartOfLocalDay(now);
 if (triggeredAt > 0 && triggeredAt >= todayStart) {
 return { cleared: false, reason: 'daily-loss-lock-active-until-next-day' };
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
 const tickerMap = await fetchAllTickers();
 const products = await fetchProducts();
 let btcCandleCount = 0;
 for (const symbol of ['NIFTY', 'SENSEX', 'RELIANCE']) {
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
 baseUrl: 'https://api.dhan.co/v2',
 region: 'nse/bse',
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

function v16AssertDhanManualOnlySafeRequest(method = 'GET', path = '') {
 const upperMethod = String(method || 'GET').toUpperCase();
 const normalizedPath = String(path || '').trim().replace(/^\/v2/i, '') || '/';
 const isOrderMutation = DHAN_MANUAL_ONLY_MUTATING_METHODS.has(upperMethod)
  && /^\/orders(?:\/|$)/i.test(normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`);
 if (isOrderMutation) throw new Error(DHAN_MANUAL_ONLY_ORDER_DISABLED);
}

async function v16SignedFetch({ key, secret, profileId = '', credentialAlias = '', method = 'GET', path = '', query = null, body = null, baseUrl = '' }) {
 v16AssertDhanManualOnlySafeRequest(method, path);
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
 const resolvedBaseUrl = String(baseUrl || BASE || '').trim();
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
 v16AssertDhanManualOnlySafeRequest(method, path);
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
 const resolvedBaseUrl = String(baseUrl || BASE || '').trim();
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
 const requestedResolution = String(payload.resolution || '4h').trim().toLowerCase();
 const migratedResolution = requestedResolution === '1h' || requestedResolution === '60m' || requestedResolution === '60' || requestedResolution === '240'
  ? '4h'
  : (requestedResolution === '1m' || requestedResolution === '3m' || requestedResolution === '5m' || requestedResolution === '15' ? '4h' : requestedResolution);
 const resolution = V16_PUBLIC_CANDLE_RESOLUTIONS.has(migratedResolution) ? migratedResolution : '4h';
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
 const [dayCandles, tf4hCandles] = await Promise.all([
 resolution === '1d' && normalizedCandles.length >= 80
 ? Promise.resolve(normalizedCandles.slice(-Math.max(80, Math.min(normalizedCandles.length, 240))))
 : (startSec > 0 && endSec > startSec && typeof fetchCandlesRange === 'function'
 ? fetchCandlesRange(symbol, '1d', Math.max(0, startSec - (200 * 24 * 60 * 60)), endSec)
 : fetchCandles(symbol, '1d', 180)),
 resolution === '4h' && normalizedCandles.length >= 120
 ? Promise.resolve(normalizedCandles.slice(-Math.max(120, Math.min(normalizedCandles.length, 320))))
 : (startSec > 0 && endSec > startSec && typeof fetchCandlesRange === 'function'
 ? fetchCandlesRange(symbol, '4h', Math.max(0, startSec - (260 * 4 * 60 * 60)), endSec)
 : fetchCandles(symbol, '4h', 260)),
 ]);
 keyLevels = typeof detectKeyLevels === 'function'
 ? detectKeyLevels(dayCandles || [], tf4hCandles || [], currentPrice, keyLevelSettings)
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
 const candidateBases = Array.from(new Set([preferredBase, BASE].filter(Boolean)));
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
 region: 'india',
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
 throw new Error(DHAN_MANUAL_ONLY_ORDER_DISABLED);
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

async function v16AssertNoExistingEntryExposure(access = {}, preview = {}, options = {}) {
 if (!preview || preview.reduceOnly) return;
 const symbol = v16NormalizeSymbol(preview.symbol || preview.productSymbol || '');
 if (!symbol) return;
 const allowDcaSameSidePosition = !!options.allowDcaSameSidePosition;
 const requestedPositionSide = normalizeOrderSide(preview.side || '', 'buy') === 'sell' ? 'short' : 'long';
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
 .filter(position => {
 if (position.symbol !== symbol || !(Number(position.size || 0) > 0)) return false;
 if (allowDcaSameSidePosition && position.side === requestedPositionSide) return false;
 return true;
 });
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
 throw new Error(DHAN_MANUAL_ONLY_ORDER_DISABLED);
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
  await v16AssertNoExistingEntryExposure(access, preview, {
   allowDcaSameSidePosition: payload?.isDcaBot === true,
  });
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

function v16NormalizeAutoTradePosition(position = {}, priceLookup = new Map()) {
 const symbol = v16NormalizeSymbol(position?.product_symbol || position?.symbol || position?.product?.symbol || position?.product?.product_symbol || position?.contract?.symbol || '');
 const size = Math.abs(Number(position?.size || position?.qty || position?.quantity || position?.position_size || 0));
 const sideText = String(position?.side || position?.position_side || position?.direction || '').toLowerCase();
 const rawEntry = Number(position?.entry_price || position?.entryPrice || position?.average_entry_price || position?.avg_entry_price || 0);
 const mark = Number(position?.mark_price || position?.markPrice || position?.price || priceLookup.get(symbol) || rawEntry || 0);
 return {
  symbol,
  side: sideText.includes('short') || sideText === 'sell' ? 'short' : 'long',
  size,
  entry: rawEntry,
  mark,
  raw: position,
 };
}

async function runDcaBotMonitor() {
 await storeLocalSet({
  dcaBotSettings: { enabled: false },
  dcaBotState: {
   status: 'off',
   reason: 'This read-only build removes scheduled order automation.',
   updatedAt: Date.now(),
  },
 });
 return { ok: true, enabled: false, manualOnly: true, removed: true };
}

async function runAutoTradeLifecycleMonitor() {
 await storeLocalSet({ autoTrade: false, autoTradeLastSkipReason: DHAN_MANUAL_ONLY_ORDER_DISABLED });
 await new Promise(resolve => syncAutoTradeMonitorAlarm(resolve));
 return { ok: true, enabled: false, manualOnly: true, removed: true };
}

async function runAutoTradeEngine(scanResults = []) {
 await new Promise(resolve => chrome.storage.local.set({
  autoTrade: false,
  autoTradeLastSkipReason: DHAN_MANUAL_ONLY_ORDER_DISABLED,
  [V16_AUTO_TRADE_DECISION_AUDIT_KEY]: {
   updatedAt: Date.now(),
   autoTradeEnabled: false,
   status: 'manual_only',
   reason: DHAN_MANUAL_ONLY_ORDER_DISABLED,
   signalsScanned: Array.isArray(scanResults) ? scanResults.length : 0,
  },
 }, resolve));
 return { ok: true, enabled: false, manualOnly: true, removed: true };
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
 sendResponse({ ok: false, status: 403, error: 'Order placement is disabled. Use your broker app or web terminal for manual trading.' });
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
 sendResponse({ ok: false, status: 403, error: 'Order placement is disabled. Use your broker app or web terminal for manual trading.' });
 return true;
 }
 if (msg.action === 'v16:cancelOrder') {
 sendResponse({ ok: false, status: 403, error: 'Order placement is disabled. Use your broker app or web terminal for manual trading.' });
 return true;
 }
 if (msg.action === 'v16:cancelAllOrdersForSymbol') {
 sendResponse({ ok: false, status: 403, error: 'Order placement is disabled. Use your broker app or web terminal for manual trading.' });
 return true;
 }
 if (msg.action === 'v16:cancelLinkedOrders') {
 sendResponse({ ok: false, status: 403, error: 'Order placement is disabled. Use your broker app or web terminal for manual trading.' });
 return true;
 }
 if (msg.action === 'v16:placePositionAction') {
 sendResponse({ ok: false, status: 403, error: 'Order placement is disabled. Use your broker app or web terminal for manual trading.' });
 return true;
 }
 if (msg.action === 'v16:placeProtectionOrder') {
 sendResponse({ ok: false, status: 403, error: 'Order placement is disabled. Use your broker app or web terminal for manual trading.' });
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
