const { app, dialog, ipcMain, Menu, safeStorage } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { createAuth } = require('./auth');
const { createBackupService } = require('./backup');
const { createCandleCache } = require('./candle-cache');
const { createCandleHistoryService } = require('./candle-history-service');
const { createCredentialStore } = require('./credential-store');
const { createDesktopNotifications } = require('./desktop-notifications');
const { createErrorJournal } = require('./error-journal');
const { createIpcHandlers } = require('./ipc-handlers');
const { createJournal } = require('./journal');
const { createMigrationRunner } = require('./migrations');
const { createWindowManager } = require('./windows');

const MAIN_PROCESS_STARTED_AT = Date.now();
const MAX_CHROMIUM_CACHE_BYTES = 48 * 1024 * 1024;

app.setName('FWD TradeDesk Pro');
if (process.platform === 'win32') app.setAppUserModelId('com.fwd.tradedeskpro');
Menu.setApplicationMenu(null);

const RUNTIME_CACHE_DIR = path.join(app.getPath('userData'), 'runtime-cache');
app.commandLine.appendSwitch('disk-cache-dir', RUNTIME_CACHE_DIR);
app.commandLine.appendSwitch('disk-cache-size', String(32 * 1024 * 1024));
app.commandLine.appendSwitch('media-cache-size', String(8 * 1024 * 1024));
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

async function directorySize(dir) {
 let total = 0;
 let entries = [];
 try {
  entries = await fs.readdir(dir, { withFileTypes: true });
 } catch (_) {
  return 0;
 }
 for (const entry of entries) {
  const entryPath = path.join(dir, entry.name);
  try {
   if (entry.isDirectory()) total += await directorySize(entryPath);
   else if (entry.isFile()) total += (await fs.stat(entryPath)).size;
  } catch (_) {
   // Cache files can disappear while Chromium owns them; ignore transient misses.
  }
 }
 return total;
}

async function pruneChromiumCaches() {
 const userData = app.getPath('userData');
 const cacheDirs = [
  RUNTIME_CACHE_DIR,
  path.join(userData, 'Cache'),
  path.join(userData, 'Code Cache'),
  path.join(userData, 'GPUCache'),
  path.join(userData, 'DawnWebGPUCache'),
  path.join(userData, 'DawnGraphiteCache'),
 ];
 const totalBytes = (await Promise.all(cacheDirs.map(directorySize))).reduce((sum, bytes) => sum + bytes, 0);
 if (totalBytes <= MAX_CHROMIUM_CACHE_BYTES) return { ok: true, skipped: true, totalBytes };
 const removed = [];
 for (const dir of cacheDirs) {
  try {
   await fs.rm(dir, { recursive: true, force: true });
   removed.push(dir);
  } catch (error) {
   errorJournal?.append?.('main:cache-prune', error, { dir });
  }
 }
 return { ok: true, skipped: false, totalBytes, removed };
}

async function ensureRuntimeCacheDirs() {
 const dirs = [
  RUNTIME_CACHE_DIR,
  path.join(app.getPath('userData'), 'Cache'),
  path.join(app.getPath('userData'), 'Code Cache'),
  path.join(app.getPath('userData'), 'GPUCache'),
 ];
 const results = [];
 for (const dir of dirs) {
  try {
   await fs.mkdir(dir, { recursive: true });
   await fs.access(dir);
   results.push({ dir, ok: true });
  } catch (error) {
   results.push({ dir, ok: false, error: error?.message || String(error || 'cache check failed') });
  }
 }
 return {
  ok: results.every(item => item.ok),
  runtimeCacheDir: RUNTIME_CACHE_DIR,
  results,
  checkedAt: Date.now(),
 };
}

const errorJournal = createErrorJournal({ app });
const credentialStore = createCredentialStore({ app, safeStorage, errorJournal });
const auth = createAuth({ app, safeStorage, credentialStore });
const journal = createJournal({ app, errorJournal });
const candleCache = createCandleCache({ app, errorJournal });
const candleHistory = createCandleHistoryService({ app, candleCache, errorJournal });
const backup = createBackupService({ app, dialog, journal, candleCache });
const desktopNotifications = createDesktopNotifications({ app, errorJournal });
const migrations = createMigrationRunner({ app, errorJournal });
const windows = createWindowManager({ app, auth, errorJournal });

createIpcHandlers({
 ipcMain,
 auth,
 credentialStore,
 journal,
 candleCache,
 candleHistory,
 backup,
 errorJournal,
 desktopNotifications,
 createAuxiliaryWindow: windows.createAuxiliaryWindow,
 ensureRuntimeCacheDirs,
 startedAt: MAIN_PROCESS_STARTED_AT,
});

app.whenReady().then(async () => {
 await pruneChromiumCaches();
 await ensureRuntimeCacheDirs();
 await migrations.run();
 await candleCache.enforceLimits();
 windows.createMainWindow();

 app.on('activate', () => {
  if (require('electron').BrowserWindow.getAllWindows().length === 0) windows.createMainWindow();
 });
}).catch(error => {
 errorJournal.append('main:startup', error);
 throw error;
});

app.on('window-all-closed', () => {
 auth.lock();
 if (process.platform !== 'darwin') app.quit();
});
