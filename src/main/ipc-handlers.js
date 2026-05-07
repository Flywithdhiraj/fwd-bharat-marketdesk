const crypto = require('crypto');
const { BrowserWindow } = require('electron');
const { sanitizeDbKey } = require('./json-store');

const DELTA_PRIVATE_API_BASES = new Map([
 ['api.india.delta.exchange', 'https://api.india.delta.exchange/v2'],
 ['api.delta.exchange', 'https://api.delta.exchange/v2'],
]);

function encodeQuery(query = {}) {
 const params = new URLSearchParams();
 Object.entries(query || {}).forEach(([key, value]) => {
  if (value == null || value === '') return;
  if (Array.isArray(value)) {
   value.forEach(item => {
    if (item != null && item !== '') params.append(key, String(item));
   });
   return;
  }
  params.set(key, String(value));
 });
 return Array.from(params.entries())
 .sort(([a], [b]) => a.localeCompare(b))
 .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
 .join('&');
}

function resolveDeltaPrivateApiBase(rawBaseUrl = '') {
 const fallback = 'https://api.india.delta.exchange/v2';
 let parsed = null;
 try {
  parsed = new URL(String(rawBaseUrl || fallback).trim() || fallback);
 } catch {
  return null;
 }
 const allowedBase = DELTA_PRIVATE_API_BASES.get(parsed.hostname.toLowerCase());
 if (!allowedBase || parsed.protocol !== 'https:') return null;
 if (parsed.port && parsed.port !== '443') return null;
 const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
 if (cleanPath !== '/v2') return null;
 return {
  baseUrl: allowedBase,
  rootUrl: parsed.origin,
 };
}

function createIpcHandlers({
 ipcMain,
 auth,
 credentialStore,
 journal,
 candleCache,
 candleHistory,
 backup,
 errorJournal,
 desktopNotifications,
 createAuxiliaryWindow,
 ensureRuntimeCacheDirs,
 startedAt,
} = {}) {
 async function runPrivateRequest(payload = {}) {
  const resolvedBase = resolveDeltaPrivateApiBase(payload.baseUrl);
  if (!resolvedBase) {
   return { ok: false, status: 400, error: 'Unsupported Delta private API host.' };
  }
  const credential = await credentialStore.getPrimaryCredential();
  if (!credential?.tradingKey || !credential?.tradingSecret) {
   return { ok: false, status: 401, error: 'Stored credential not found for this profile.' };
  }
  const upperMethod = String(payload.method || 'GET').toUpperCase();
  const rawPath = String(payload.path || '/').trim() || '/';
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const requestPath = `/v2${normalizedPath.startsWith('/v2') ? normalizedPath.slice(3) : normalizedPath}`;
  const queryString = encodeQuery(payload.query || {});
  const requestBody = payload.body ? JSON.stringify(payload.body) : '';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signPayload = `${upperMethod}${timestamp}${requestPath}${queryString ? `?${queryString}` : ''}${requestBody}`;
  const signature = crypto.createHmac('sha256', String(credential.tradingSecret)).update(signPayload).digest('hex');
  const url = `${resolvedBase.rootUrl}${requestPath}${queryString ? `?${queryString}` : ''}`;
  const response = await fetch(url, {
   method: upperMethod,
   headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'FWD-TradeDesk-Pro',
    'api-key': String(credential.tradingKey),
    timestamp,
    signature,
   },
   body: requestBody || undefined,
  });
  const text = await response.text();
  let data = null;
  try {
   data = text ? JSON.parse(text) : null;
  } catch {
   data = text;
  }
  if (!response.ok) {
   return {
    ok: false,
    status: response.status,
    error: data?.error?.code || data?.error || data?.message || text || `HTTP ${response.status}`,
    text,
    raw: data,
   };
  }
  return { ok: true, status: response.status, data, raw: data, meta: data?.meta || null };
 }

 ipcMain.handle('fwd:native-message', async (event, message = {}) => {
  const type = String(message.type || '').trim();
  try {
   if (type === 'ping') return { ok: true, secure: true };
   if (type === 'auth_status') return auth.status(event);
   if (type === 'auth_setup') return auth.setup(message, event);
   if (type === 'auth_login') return auth.login(message, event);
   if (type === 'auth_reset_password') return auth.resetPassword(message, event);
   if (type === 'auth_update_auto_lock') return auth.updateAutoLock(message, event);
   if (type === 'auth_update_security') return auth.updateSecurity(message, event);
   if (type === 'auth_logout') {
    auth.lock();
    return auth.status(event);
   }
   if (type === 'auth_disable') return auth.disable(message, event);

   const authBlock = await auth.ensureUnlocked(type, event);
   if (authBlock) return authBlock;

   if (type === 'open_desktop_window') return createAuxiliaryWindow({ url: message.url, state: message.state });
   if (type === 'desktop_notification') return desktopNotifications.notify(message);
   if (type === 'error_journal_get') return { ok: true, entries: await errorJournal.list(message.limit) };
   if (type === 'error_journal_clear') return errorJournal.clear();
   if (type === 'app_backup_export') return backup.exportBackup(message);
   if (type === 'app_backup_import') return backup.importBackup(message);
   if (type === 'candle_history_status') return candleHistory.status();
   if (type === 'candle_history_start') return candleHistory.start(message);
   if (type === 'candle_history_pause') return candleHistory.pause();
   if (type === 'candle_history_refresh_universe') return candleHistory.refreshUniverse(message);
   if (type === 'store_credential') return credentialStore.storeCredential(message);
   if (type === 'delete_credential') return credentialStore.deleteCredential();
   if (type === 'delta_private_request') return runPrivateRequest(message);
   if (type === 'secure_secret_get') return credentialStore.getSecureSecret(message.name);
   if (type === 'secure_secret_set') return credentialStore.setSecureSecret(message.name, message.value);
   if (type === 'secure_secret_delete') return credentialStore.deleteSecureSecret(message.name);
   if (type === 'journal_get') {
    const key = sanitizeDbKey(message.key);
    if (!key) return { ok: false, error: 'Journal key is required.' };
    const record = await journal.readValue(key);
    return { ok: true, key, value: record.value, updatedAt: Number(record.updatedAt || 0) };
   }
   if (type === 'journal_set') {
    const key = sanitizeDbKey(message.key);
    if (!key) return { ok: false, error: 'Journal key is required.' };
    return journal.writeValue(key, message.value ?? null);
   }
   if (type === 'journal_page') return journal.readPage(message.key, message);
   if (type === 'journal_delete') {
    const key = sanitizeDbKey(message.key);
    if (!key) return { ok: false, error: 'Journal key is required.' };
    await journal.deleteRuntimeRecord(key);
    return { ok: true, key };
   }
   if (type === 'journal_archive') {
    const key = sanitizeDbKey(message.key);
    if (!key) return { ok: false, error: 'Journal key is required.' };
    const value = (await journal.readValue(key)).value;
    return { ok: true, key, ...await journal.archiveSeries(key, value, message.keep) };
   }
   if (type === 'performance_native_stats') {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    return {
     ok: true,
     startedAt,
     uptimeMs: Date.now() - startedAt,
     readyToShowAt: Number(senderWindow?.__fwdReadyToShowAt || 0),
     readyToShowMs: senderWindow?.__fwdReadyToShowAt ? Number(senderWindow.__fwdReadyToShowAt) - startedAt : 0,
     memory: process.memoryUsage(),
     cpu: process.cpuUsage(),
     cache: await ensureRuntimeCacheDirs(),
    };
   }
   if (type === 'candle_get') return candleCache.get(message.symbol, message.resolution);
   if (type === 'candle_put') return candleCache.put(message);
   if (type === 'candle_clear') return candleCache.clear(message.symbol, message.resolution);
   if (type === 'candle_stats') return candleCache.stats();
   return { ok: false, error: `Unsupported native message type: ${type || 'unknown'}` };
  } catch (error) {
   errorJournal?.append?.('ipc:native-message', error, { type });
   return { ok: false, error: error?.message || String(error || 'Native bridge failed') };
  }
 });
}

module.exports = { createIpcHandlers };
