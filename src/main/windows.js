const path = require('path');
const { BrowserWindow, dialog, shell } = require('electron');

function createWindowManager({ app, auth, errorJournal } = {}) {
 const isDev = !app.isPackaged;
 const auxiliaryWindows = new Map();

 function baseWebPreferences() {
  return {
   contextIsolation: true,
   nodeIntegration: false,
   sandbox: true,
   preload: path.join(__dirname, 'preload.js'),
   devTools: isDev,
  };
 }

 function bindCommonWindowEvents(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
   if (/^https?:\/\//i.test(url)) shell.openExternal(url);
   return { action: 'deny' };
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
   errorJournal?.append?.('renderer:load-failed', new Error(`${errorCode} ${errorDescription}`), { validatedURL });
  });
  win.webContents.on('render-process-gone', (_event, details) => {
   errorJournal?.append?.('renderer:gone', new Error(details.reason || 'renderer gone'), details);
  });
  win.webContents.on('destroyed', () => auth.forgetWebContents(win.webContents.id));
 }

 function createMainWindow() {
  let closeConfirmed = false;
  const win = new BrowserWindow({
   title: 'FWD TradeDesk Pro',
   width: 1366,
   height: 768,
   minWidth: 1180,
   minHeight: 680,
   backgroundColor: '#070d15',
   icon: path.join(__dirname, '../renderer/icons/fwd-tradedesk-pro.ico'),
   show: false,
   webPreferences: baseWebPreferences(),
  });
  bindCommonWindowEvents(win);
  win.on('close', event => {
   if (closeConfirmed) return;
   const choice = dialog.showMessageBoxSync(win, {
    type: 'question',
    buttons: ['Keep App Open', 'Close App'],
    defaultId: 0,
    cancelId: 0,
    title: 'Close FWD TradeDesk Pro?',
    message: 'Close FWD TradeDesk Pro?',
    detail: 'Scanner, Strategy Lab, chart monitoring, and auto scan visibility will stop until you reopen the app.',
   });
   if (choice !== 1) {
    event.preventDefault();
    return;
   }
   closeConfirmed = true;
  });
  win.once('ready-to-show', () => {
   win.__fwdReadyToShowAt = Date.now();
   win.maximize();
   win.show();
  });
  win.webContents.on('did-finish-load', () => {
   setTimeout(() => {
    win.webContents.executeJavaScript(`
 Promise.race([
 chrome.runtime.sendMessage({ action: 'ping' }),
 new Promise(resolve => setTimeout(() => resolve({ ok: false, error: 'Desktop runtime ping timed out' }), 6000))
 ])
 `).catch(error => {
     errorJournal?.append?.('renderer:healthcheck-failed', error);
    });
   }, 1500);
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'), {
   query: { w: '1', desktop: '1', app: 'windows' },
  });
  return win;
 }

 function createAuxiliaryWindow(options = {}) {
  const url = String(options.url || '').trim();
  const parsed = new URL(url, 'file://renderer/');
  const query = Object.fromEntries(parsed.searchParams.entries());
  const chartMode = query.chart === '1';
  const key = chartMode ? 'chart' : `window:${Date.now()}`;
  const existing = auxiliaryWindows.get(key);
  if (existing && !existing.isDestroyed()) {
   existing.maximize();
   existing.focus();
   return { ok: true, windowId: existing.webContents.id, reused: true };
  }
  const win = new BrowserWindow({
   title: chartMode ? 'FWD TradeDesk Pro - Chart' : 'FWD TradeDesk Pro',
   width: chartMode ? 1280 : 1180,
   height: chartMode ? 820 : 760,
   minWidth: 960,
   minHeight: 640,
   backgroundColor: '#070d15',
   icon: path.join(__dirname, '../renderer/icons/fwd-tradedesk-pro.ico'),
   show: false,
   webPreferences: baseWebPreferences(),
  });
  auxiliaryWindows.set(key, win);
  bindCommonWindowEvents(win);
  win.once('ready-to-show', () => {
   win.maximize();
   win.show();
   win.focus();
  });
  win.on('closed', () => auxiliaryWindows.delete(key));
  win.loadFile(path.join(__dirname, '../renderer/index.html'), { query });
  return { ok: true, windowId: win.webContents.id, reused: false };
 }

 return { createMainWindow, createAuxiliaryWindow };
}

module.exports = { createWindowManager };
