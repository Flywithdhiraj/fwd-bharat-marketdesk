const { app, dialog, ipcMain, safeStorage } = require('electron');
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

app.setName('FWD TradeDesk Pro');
if (process.platform === 'win32') app.setAppUserModelId('com.fwd.tradedeskpro');

const RUNTIME_CACHE_DIR = path.join(app.getPath('userData'), 'runtime-cache');
app.commandLine.appendSwitch('disk-cache-dir', RUNTIME_CACHE_DIR);

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
