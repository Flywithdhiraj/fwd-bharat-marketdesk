const { BrowserWindow } = require('electron');
const { sanitizeDbKey } = require('./json-store');

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

function createIpcHandlers({
 ipcMain,
 auth,
 credentialStore,
 dhanData,
 journal,
 candleCache,
 backup,
 errorJournal,
 desktopNotifications,
 createAuxiliaryWindow,
 ensureRuntimeCacheDirs,
 startedAt,
} = {}) {
 ipcMain.handle('fwd:native-message', async (event, message = {}) => {
  const type = String(message.type || '').trim();
  try {
   if (type === 'ping') return { ok: true, secure: true };
   if (type === 'auth_status') return auth.status(event);
   if (type === 'auth_setup') return auth.setup(message, event);
   if (type === 'auth_login') return auth.login(message, event);
   if (type === 'auth_reset_password') return auth.resetPassword(message, event);
   if (type === 'auth_update_security') return auth.updateSecurity(message, event);
   if (type === 'auth_logout') {
    auth.lock();
    return auth.status(event);
   }
   if (type === 'auth_disable') return auth.disable(message, event);

   const authBlock = await auth.ensureUnlocked(type, event);
   if (authBlock) return authBlock;

   if (type === 'open_desktop_window') return createAuxiliaryWindow({ url: message.url, state: message.state });
   if (type === 'set_window_fullscreen') {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false, error: 'Window is not available.' };
    const fullscreen = message.fullscreen === true;
    win.setAutoHideMenuBar(fullscreen);
    win.setMenuBarVisibility(!fullscreen);
    win.setFullScreen(fullscreen);
    return { ok: true, fullscreen };
   }
   if (type === 'desktop_notification') return desktopNotifications.notify(message);
   if (type === 'error_journal_get') return { ok: true, entries: await errorJournal.list(message.limit) };
   if (type === 'error_journal_clear') return errorJournal.clear();
   if (type === 'app_backup_export') return backup.exportBackup(message);
   if (type === 'app_backup_import') return backup.importBackup(message);
   if (type === 'store_credential') return credentialStore.storeCredential(message);
   if (type === 'delete_credential') return credentialStore.deleteCredential();
   if (type === 'dhan_data') return dhanData.handle(message);
   if (type === 'dhan_order_place' || type === 'dhan_order_modify' || type === 'dhan_order_cancel') {
    return { ok: false, status: 403, error: 'Order placement is disabled. Use your broker app or web terminal for manual trading.' };
   }
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
