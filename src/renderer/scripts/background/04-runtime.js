const STALE_SCAN_HEARTBEAT_MS = 10 * 60 * 1000;
const SCAN_HARD_DEADLINE_MS = 45 * 60 * 1000; // full Delta universe scans can be slow under weighted throttling
let strategyLabAutoScanPromise = null;

function hasFreshPartialScanContext() {
 const context = globalThis.FWDTradeDeskScanContext?.getFresh?.();
 return !!context?.partial;
}

async function markScanStoppedWithPartialFallback(defaultStatus = 'Scan stopped - restart scan') {
 const hasPartial = hasFreshPartialScanContext();
 await markScanStopped(hasPartial ? 'Scan stopped - using partial results; restart to finish' : defaultStatus, 0);
 if (hasPartial) {
  await runStrategyLabAutoScans().catch(error => dlog(`Partial Strategy Lab derive err: ${error?.message || error}`));
 }
}

function runScanWithDeadline() {
 let settled = false;
 return new Promise((resolve, reject) => {
 const timer = setTimeout(() => {
 if (settled) return;
 settled = true;
 markScanStoppedWithPartialFallback('Scan timed out - restarting next cycle')
 .catch(() => {})
 .finally(() => reject(new Error('Scan exceeded hard deadline')));
 }, SCAN_HARD_DEADLINE_MS);
 runScan()
 .then(r => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } })
 .catch(e => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
});
}

async function runStrategyLabAutoScans() {
 if (strategyLabAutoScanPromise) return strategyLabAutoScanPromise;
 strategyLabAutoScanPromise = (async () => {
 try {
 await chrome.storage.local.set({
 strategyLabAutoScan: {
 active: true,
 status: 'Deriving Strategy Lab results from main scan',
 startedAt: Date.now(),
 },
 });
 const result = await globalThis.FWDTradeDeskScanContext?.deriveAll?.({ includeNative: true });
 const summary = result?.derived || {};
 await chrome.storage.local.set({
 strategyLabAutoScan: {
 active: false,
 status: result?.ok ? 'Strategy Lab results derived from main scan' : (result?.error || 'Strategy Lab derive failed'),
 summary,
 finishedAt: Date.now(),
 },
 });
 return result;
 } catch (error) {
 const message = error?.message || String(error);
 await chrome.storage.local.set({
 strategyLabAutoScan: {
 active: false,
 status: `Strategy Lab derive failed: ${message}`,
 summary: {},
 finishedAt: Date.now(),
 },
 });
 dlog(`Strategy Lab auto derive err: ${message}`);
 return { ok: false, error: message, derived: {} };
 }
 })().finally(() => {
 strategyLabAutoScanPromise = null;
 });
 return strategyLabAutoScanPromise;
}

async function runUnifiedStrategyLabScan() {
 if (!scanRunPromise) {
 scanRunPromise = runScanWithDeadline().finally(() => {
 scanRunPromise = null;
 });
 }
 const mainRows = await scanRunPromise;
 const derived = await runStrategyLabAutoScans();
 return {
 ok: !!derived?.ok,
 scanId: derived?.scanId || globalThis.FWDTradeDeskScanContext?.getLatest?.()?.scanId || '',
 mainCount: Array.isArray(mainRows) ? mainRows.length : 0,
 derived: derived?.derived || {},
 error: derived?.error || '',
 };
}

function kickStrategyLabDeriveAfterManualScan() {
 runStrategyLabAutoScans()
 .catch(error => {
 dlog(`Manual scan Strategy Lab derive err: ${error?.message || error}`);
 });
}

chrome.storage.local.get(['scanActive', 'scanHeartbeat'], async data => {
 if (chrome.runtime.lastError) return;
 const scanActive = !!data?.scanActive;
 const heartbeat = Number(data?.scanHeartbeat || 0);
 if (!scanActive || !heartbeat) return;
 if ((Date.now() - heartbeat) < STALE_SCAN_HEARTBEAT_MS) return;
 await markScanStopped('Scan stopped - restart scan', 0);
 dlog('Recovered stale scan state after service worker restart');
});

chrome.alarms.onAlarm.addListener(alarm => {
 if (alarm.name === CUSTOM_ALERT_ALARM_NAME) {
 runCustomAlertPollingPass()
 .catch(error => dlog(`Custom alert alarm err: ${error?.message || error}`));
 return;
 }
 if (alarm.name === AUTO_TRADE_MONITOR_ALARM_NAME) {
 runAutoTradeLifecycleMonitor()
 .catch(error => dlog(`Auto-trade monitor err: ${error?.message || error}`));
 return;
 }
 if (alarm.name === DCA_BOT_MONITOR_ALARM_NAME) {
 if (typeof runDcaBotMonitor === 'function') {
 runDcaBotMonitor()
 .catch(error => dlog(`DCA bot monitor err: ${error?.message || error}`));
 }
 return;
 }
 if (alarm.name === OPTIONS_STRADDLE_MONITOR_ALARM) {
 if (typeof runOptionsStraddleMonitor === 'function') {
 runOptionsStraddleMonitor()
 .catch(error => dlog(`Straddle monitor err: ${error?.message || error}`));
 }
 return;
 }
 if (alarm.name === TELEGRAM_SUMMARY_ALARM) {
 sendTelegramHourlySummary()
 .catch(error => dlog(`Telegram summary err: ${error?.message || error}`));
 return;
 }
 if (alarm.name === 'autoScan') {
 dlog('=== AUTO-SCAN ===');
 if (scanRunPromise) {
 // Runtime stale-lock check: if heartbeat is too old, the scan is hung - force-release
 chrome.storage.local.get(['scanHeartbeat'], async data => {
 if (chrome.runtime.lastError) return;
 const age = Date.now() - Number(data?.scanHeartbeat || 0);
 if (age > STALE_SCAN_HEARTBEAT_MS) {
 dlog(`Auto-scan: stale lock detected (${Math.round(age / 1000)}s old) - force-releasing and restarting`);
 scanRunPromise = null;
 await markScanStopped('Ready - stale scan recovered', 0);
 scanRunPromise = runScanWithDeadline()
 .then(() => runStrategyLabAutoScans())
 .catch(async e => {
 await markScanStoppedWithPartialFallback();
 dlog('Auto-scan err (recovered): ' + e.message);
 })
 .finally(() => { scanRunPromise = null; });
 } else {
 dlog(`Auto-scan skipped: scan already running (heartbeat ${Math.round(age / 1000)}s ago)`);
 }
 });
 return;
 }
 scanRunPromise = runScanWithDeadline()
 .then(() => runStrategyLabAutoScans())
 .catch(async e => {
 await markScanStoppedWithPartialFallback();
 dlog('Auto-scan err: ' + e.message);
 })
 .finally(() => {
 scanRunPromise = null;
 });
 }
});

// Restore auto-scan alarm on service worker startup - only if not already registered
chrome.storage.local.get(['autoScan', 'autoScanInterval', 'strategy'], d => {
 const strat = d.strategy || {};
 const enabled = d.autoScan ?? strat.autoScan ?? false;
 const interval = sanitizeAutoScanInterval(d.autoScanInterval ?? strat.autoScanInterval);
 if (!enabled) {
 chrome.alarms.clear('autoScan');
 return;
 }
 // Check if alarm already exists - don't re-create (that resets the timer)
 chrome.alarms.get('autoScan', existing => {
 if (existing) {
 dlog('Auto-scan alarm already registered (' + existing.periodInMinutes + 'm), keeping it');
 return;
 }
 dlog('Auto-scan alarm missing, creating ' + interval + 'm schedule');
 chrome.alarms.create('autoScan', { periodInMinutes: interval });
 });
});
syncCustomAlertPollingAlarm(() => {});
syncAutoTradeMonitorAlarm(() => {});
syncDcaBotMonitorAlarm(() => {});
syncOptionsStraddleMonitorAlarm(() => {});
syncTelegramSummaryAlarm(() => {});

// ================================================================
// MESSAGE HANDLER
// ================================================================
let v17DesktopOpenInFlight = false;
let v17ChartOpenInFlight = false;

function openOrFocusDesktopApp(callback = () => {}) {
 if (v17DesktopOpenInFlight) {
 try { callback({ ok: true, pending: true }); } catch (_) {}
 return;
 }
 v17DesktopOpenInFlight = true;
 const finish = (payload) => {
 v17DesktopOpenInFlight = false;
 try { callback(payload); } catch (_) {}
 };
 const createWindow = () => {
 chrome.windows.create({
 url: chrome.runtime.getURL('popup.html?w=1&desktop=1'),
 type: 'popup',
 focused: true,
 state: 'maximized',
 }, (win) => {
 if (!win?.id || chrome.runtime.lastError) {
 finish({ ok: false, error: chrome.runtime.lastError?.message || 'Failed to open FWD TradeDesk Pro workspace' });
 return;
 }
 chrome.storage.local.set({ desktopWindowId: win.id });
 finish({ ok: true, windowId: win.id, reused: false });
 });
 };

 chrome.storage.local.get('desktopWindowId', ({ desktopWindowId }) => {
 if (!Number.isInteger(desktopWindowId)) {
 createWindow();
 return;
 }
 chrome.windows.get(desktopWindowId, {}, (win) => {
 if (chrome.runtime.lastError || !win?.id) {
 createWindow();
 return;
 }
 chrome.windows.update(desktopWindowId, {
 focused: true,
 drawAttention: true,
 state: 'maximized',
 }, (updated) => {
 if (chrome.runtime.lastError || !updated?.id) {
 createWindow();
 return;
 }
 chrome.storage.local.set({ desktopWindowId: updated.id });
 finish({ ok: true, windowId: updated.id, reused: true });
 });
 });
 });
}

function openOrFocusChartWindow(callback = () => {}) {
 if (v17ChartOpenInFlight) {
 try { callback({ ok: true, pending: true }); } catch (_) {}
 return;
 }
 v17ChartOpenInFlight = true;
 const finish = (payload) => {
 v17ChartOpenInFlight = false;
 try { callback(payload); } catch (_) {}
 };
 const createWindow = () => {
 chrome.windows.create({
 url: chrome.runtime.getURL('popup.html?w=1&desktop=1&chart=1'),
 type: 'popup',
 focused: true,
 state: 'maximized',
 }, (win) => {
 if (!win?.id || chrome.runtime.lastError) {
 finish({ ok: false, error: chrome.runtime.lastError?.message || 'Failed to open chart window' });
 return;
 }
 chrome.storage.local.set({ chartWindowId: win.id });
 finish({ ok: true, windowId: win.id, reused: false });
 });
 };

 if (globalThis.__FWD_DESKTOP_SHELL__) {
 createWindow();
 return;
 }

 chrome.storage.local.get('chartWindowId', ({ chartWindowId }) => {
 if (!Number.isInteger(chartWindowId)) {
 createWindow();
 return;
 }
 chrome.windows.get(chartWindowId, {}, (win) => {
 if (chrome.runtime.lastError || !win?.id) {
 createWindow();
 return;
 }
 chrome.windows.update(chartWindowId, {
 focused: true,
 drawAttention: true,
 state: 'maximized',
 }, (updated) => {
 if (chrome.runtime.lastError || !updated?.id) {
 createWindow();
 return;
 }
 chrome.storage.local.set({ chartWindowId: updated.id });
 finish({ ok: true, windowId: updated.id, reused: true });
 });
 });
 });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
 if (!isTrustedRuntimeSender(_sender)) {
 sendResponse({ ok: false, error: 'Unauthorized sender' });
 return false;
 }

 // -- Scan ------------------------------------------------------
 if (msg.action === 'startScan') {
 if (!scanRunPromise) {
 scanRunPromise = runScanWithDeadline().finally(() => {
 scanRunPromise = null;
 });
 }
 scanRunPromise
 .then(r => {
 kickStrategyLabDeriveAfterManualScan();
 sendResponse({ ok: true, count: r.length, strategyLabDeriving: true });
 })
 .catch(async e => {
 await markScanStoppedWithPartialFallback();
 sendResponse({ ok: false, error: e.message });
 });
 return true;
 }

 // -- Auto-scan toggle ------------------------------------------
 if (msg.action === 'toggleAutoScan') {
 const enable = !!msg.enable;
 setAutoScanSchedule(enable, msg.interval, ({ interval }) => {
 sendResponse({ ok: true, enabled: enable, interval });
 });
 return true;
 }

 // -- Auto-trade toggle -----------------------------------------
 if (msg.action === 'toggleAutoTrade') {
 chrome.storage.local.set({ autoTrade: !!msg.enable }, () => {
 syncAutoTradeMonitorAlarm(() => {
 sendResponse({ ok: true, enabled: !!msg.enable });
 });
 });
 return true;
 }

 if (msg.action === 'syncCustomAlertAlarm') {
 syncCustomAlertPollingAlarm(result => {
 sendResponse({ ok: true, ...result });
 });
 return true;
 }

 // -- Auto-trade log retrieval -----------------------------------
 if (msg.action === 'getAutoTradeLog') {
 chrome.storage.local.get(['autoTradeLog'], d => {
 sendResponse({ log: d.autoTradeLog || [] });
 });
 return true;
 }

 // Refresh only one symbol (used by watchlist click refresh).
 if (msg.action === 'refreshSymbol') {
 refreshSingleSymbol(msg.symbol)
 .then(sendResponse)
 .catch(e => sendResponse({ ok: false, error: e.message }));
 return true;
 }

 // Correlation matrix manual rebuild.
 if (msg.action === 'buildCorrelationMatrix') {
 chrome.storage.local.get(['scanResults', 'strategy'], async d => {
 const strat = { ...defaultStrategy(), ...(d.strategy || {}) };
 const corr = await buildAndStoreCorrelationMatrix(d.scanResults || [], strat);
 sendResponse({ ok: !!corr, correlationMatrix: corr });
 });
 return true;
 }

 if (msg.action === 'getOrderbookLite') {
 fetchOrderbookLite(msg.symbol)
 .then(book => sendResponse({ ok: true, book }))
 .catch(e => sendResponse({ ok: false, error: e.message }));
 return true;
 }

 if (msg.action === 'testTelegram') {
 const cfg = sanitizeTelegramConfig(msg.telegram || {});
 if (!cfg.botToken || !cfg.chatId) {
 sendResponse({ ok: false, error: 'Bot token and chat ID are required' });
 return true;
 }
 sendTelegramSignal({ ...cfg, enabled: true }, {
 symbol: 'BTCUSD',
 score: 88,
 entry: 100000,
 direction: 'long',
 ts: Date.now(),
 }, 'Test TEST')
 .then(ok => sendResponse({ ok }))
 .catch(e => sendResponse({ ok: false, error: e.message }));
 return true;
 }

 // -- Strategy Lab ---------------------------------------------
 if (msg.action === 'strategy-lab:runUnifiedScan') {
 runUnifiedStrategyLabScan()
 .then(result => sendResponse(result))
 .catch(async e => {
 await markScanStoppedWithPartialFallback('Unified scan stopped - restart scan');
 sendResponse({ ok: false, error: e.message || String(e) });
 });
 return true;
 }

 if (msg.action === 'strategy-lab:deriveFromLatestScan') {
 globalThis.FWDTradeDeskScanContext?.deriveAll?.({ includeNative: msg.includeNative !== false })
 .then(result => sendResponse(result || { ok: false, error: 'Shared scan context unavailable' }))
 .catch(e => sendResponse({ ok: false, error: e.message || String(e) }));
 return true;
 }

 // -- CSV Export - NEW v14 --------------------------------------
 if (msg.action === 'exportCSV') {
 chrome.storage.local.get(['scanResults', 'alerts', 'fundingHeatmap'], d => {
 const target = msg.dataType === 'alerts' ? (d.alerts || []) :
 msg.dataType === 'funding' ? (d.fundingHeatmap || []) :
 (d.scanResults || []);
 try {
 const csv = resultsToCSV(target);
 sendResponse({ ok: true, csv, count: target.length });
 } catch (e) {
 sendResponse({ ok: false, error: e.message });
 }
 });
 return true;
 }

 // -- Misc ------------------------------------------------------
 if (msg.action === 'getDebug') {
 chrome.storage.local.get('debugLog', d => sendResponse(d.debugLog || []));
 return true;
 }

 if (msg.action === 'syncDcaBotAlarm') {
 syncDcaBotMonitorAlarm(result => {
 sendResponse({ ok: true, ...result });
 });
 return true;
 }

 if (msg.action === 'getRuntimeHealth') {
 (async () => {
 const quota = typeof globalThis.v17GetApiQuotaState === 'function'
 ? globalThis.v17GetApiQuotaState()
 : null;
 const candleCache = typeof globalThis.v17GetPersistentCandleCacheStats === 'function'
 ? await globalThis.v17GetPersistentCandleCacheStats()
 : { supported: false, entries: 0, latestUpdatedAt: 0, oldestUpdatedAt: 0 };
 sendResponse({ ok: true, quota, candleCache });
 })().catch(e => sendResponse({ ok: false, error: e?.message || 'Runtime health failed' }));
 return true;
 }

 if (msg.action === 'clearCandleCache') {
 (async () => {
 const result = typeof globalThis.v17ClearPersistentCandleCache === 'function'
 ? await globalThis.v17ClearPersistentCandleCache()
 : { ok: false, cleared: false };
 sendResponse({ ok: !!result?.ok, ...result });
 })().catch(e => sendResponse({ ok: false, error: e?.message || 'Cache clear failed' }));
 return true;
 }

 // -- Webhook Management - NEW v14 -----------------------------
 if (msg.action === 'getWebhooks') {
 (async () => {
 const hooks = await getStoredWebhooks();
 sendResponse({ ok: true, webhooks: hooks });
 })().catch(e => sendResponse({ ok: false, error: e?.message || 'Failed to load webhooks' }));
 return true;
 }

 if (msg.action === 'saveWebhook') {
 (async () => {
 await migrateSensitiveConfig();
 const target = await ensureWebhookTargetPermission(msg.webhook?.url);
 if (!target.ok) {
 sendResponse({ ok: false, error: target.error });
 return;
 }

 const localData = await storeLocalGet('webhooks');
 const sessionData = await storeSessionGet('webhookSecrets');
 const hooks = localData.webhooks || [];
 const secretMap = { ...(sessionData.webhookSecrets || {}) };
 const incomingHook = sanitizeWebhookRecord(msg.webhook || {});
 const nextHeaders = { ...(incomingHook.headers || {}) };
 const authHeader = String(nextHeaders.Authorization || '').trim();
 delete nextHeaders.Authorization;

 const nextHook = {
 ...incomingHook,
 url: target.url,
 headers: Object.keys(nextHeaders).length ? nextHeaders : null,
 hasAuthHeader: !!authHeader,
 };
 const existing = hooks.findIndex(h => h.id === nextHook.id);
 if (existing >= 0) hooks[existing] = nextHook;
 else hooks.push(nextHook);

 const nativeSecretWrite = authHeader
 ? await writeNativeSecret(webhookSecretName(nextHook.id), { Authorization: authHeader })
 : await deleteNativeSecret(webhookSecretName(nextHook.id));
 if (authHeader && !nativeSecretWrite) secretMap[nextHook.id] = { Authorization: authHeader };
 else delete secretMap[nextHook.id];

 await Promise.all([
 storeLocalSet({ webhooks: hooks }),
 storeSessionSet({ webhookSecrets: secretMap }),
 ]);
 dlog(`Link Webhook saved: ${nextHook.name} -> ${target.host}`);
 sendResponse({ ok: true, webhooks: hooks.map(h => sanitizeWebhookRecord(mergeWebhookSecrets(h, secretMap))) });
 })().catch(e => sendResponse({ ok: false, error: e?.message || 'Webhook save failed' }));
 return true;
 }

 if (msg.action === 'deleteWebhook') {
 (async () => {
 await migrateSensitiveConfig();
 const [localData, sessionData] = await Promise.all([
 storeLocalGet('webhooks'),
 storeSessionGet('webhookSecrets'),
 ]);
 const hooks = (localData.webhooks || []).filter(h => h.id !== msg.id);
 const secretMap = { ...(sessionData.webhookSecrets || {}) };
 delete secretMap[msg.id];
 await deleteNativeSecret(webhookSecretName(msg.id));
 await Promise.all([
 storeLocalSet({ webhooks: hooks }),
 storeSessionSet({ webhookSecrets: secretMap }),
 ]);
 dlog(`Link Webhook deleted: ${msg.id}`);
 sendResponse({ ok: true, webhooks: hooks.map(h => sanitizeWebhookRecord(mergeWebhookSecrets(h, secretMap))) });
 })().catch(e => sendResponse({ ok: false, error: e?.message || 'Webhook delete failed' }));
 return true;
 }

 if (msg.action === 'testWebhook') {
 (async () => {
 const hook = sanitizeWebhookRecord(msg.webhook || {});
 const target = await ensureWebhookTargetPermission(hook?.url);
 if (!target.ok) {
 sendResponse({ ok: false, error: target.error });
 return;
 }
 sendWebhook(hook, 'test', {
 message: 'This is a test from FWD TradeDesk Pro',
 timestamp: new Date().toISOString(),
 symbol: 'BTCUSD', direction: 'long', score: 88,
 notes: 'Test Test webhook - if you see this, your integration is working!',
 });
 sendResponse({ ok: true });
 })().catch(e => sendResponse({ ok: false, error: e?.message || 'Webhook test failed' }));
 return true;
 }

 if (msg.action === 'openWindow') {
 openOrFocusDesktopApp(sendResponse);
 return true;
 }

 // -- Desktop App Mode - NEW v14 -------------------------------
 if (msg.action === 'openDesktopApp') {
 openOrFocusDesktopApp(sendResponse);
 return true;
 }

 if (msg.action === 'openChartWindow') {
 openOrFocusChartWindow(sendResponse);
 return true;
 }

 if (msg.action === 'syncTelegramSummaryAlarm') {
 syncTelegramSummaryAlarm(() => sendResponse({ ok: true }));
 return true;
 }

 if (msg.action === 'ping') {
 sendResponse({ ok: true, v: 17, region: detectedRegion });
 return true;
 }
});

chrome.commands?.onCommand.addListener((command) => {
 if (command === 'open-desktop-app') {
 openOrFocusDesktopApp();
 }
});

dlog('FWD TradeDesk Pro ready - Webhooks, workspace mode, journal tools, research modules, and branded icons are loaded.');

migrateSensitiveConfig().catch(e => {
 dlog(`Sensitive config migration error: ${e?.message || 'unknown error'}`);
});


