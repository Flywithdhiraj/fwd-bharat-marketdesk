// -- Poll rate by active tab (ms) ---------------------------------
const POLL_INTERVALS = {
 home: 2000, // command center - live enough for operating state
 scanner: 1500, // live signals - keep fast
 alerts: 2000, // alert list - medium
 watchlist: 3000, // watchlist - medium
 chart: 3000, // decision chart - medium
 liveanalytics: 2000, // live analytics - medium
 tradecheck: 10000, // manual trade check - avoid rerender while typing
 positions: 2000, // live P&L - medium
 riskcalc: 5000, // user is typing - slow
 var: 3000, // VAR dashboard - medium
 funding: 8000, // rates change every 8h - slow
 corr: 10000, // correlation - slow
 strategy: 10000, // settings - slow
 webhooks: 10000, // settings - slow
 debug: 5000, // diagnostics - slow
};
let _pollLastAt = 0;
let _pollLastTab = '';
let _apiUsageLastAt = 0;
let _apiUsageInFlight = false;
function getActivePollInterval() {
 return POLL_INTERVALS[activeWorkspaceTab] ?? 3000;
}

const POLL_BASE_KEYS = [
 'scanStatus', 'scanProgress', 'lastScan', 'alerts',
 'soundAlert', 'marketIndex', 'sectorSummary',
 'totalCoins', 'scannedCoins', 'watchlist', 'manualWatchlist', 'strategy', 'externalBackup',
 'analyticsPositions', 'scanActive', 'scanHeartbeat', 'alertHistory', 'scanResults',
 'v16LiveAccountSnapshot', 'autoTradeSettings', 'autoTradeDailyLoss',
 'autoTradeDecisionAuditV16',
];
const POLL_TAB_EXTRA_KEYS = {
 scanner: ['autoWatchlist', 'decisionShortlist', 'sectorBreadth', 'lastScanTs'],
 watchlist: ['autoWatchlist', 'decisionShortlist'],
};
const _dirtyTabs = new Set(['home', 'scanner']);
const _workspaceRenderFrames = new Map();
const _workspaceRenderPayloads = new Map();
let _workspaceInsightsRenderKey = '';

function markWorkspaceTabsDirty(tabs = []) {
 (Array.isArray(tabs) ? tabs : [tabs]).forEach(tab => {
 const key = String(tab || '').trim();
 if (key) _dirtyTabs.add(key);
 });
}

function clearWorkspaceTabDirty(tab = '') {
 _dirtyTabs.delete(String(tab || '').trim());
}

function isWorkspaceTabDirty(tab = '') {
 return _dirtyTabs.has(String(tab || '').trim());
}

function isWorkspaceTabActive(tab = '') {
 return String(tab || '').trim() === String(activeWorkspaceTab || '').trim();
}

function scheduleWorkspaceTabRender(tab = activeWorkspaceTab, options = {}) {
 const safeTab = String(tab || activeWorkspaceTab || 'home').trim();
 if (!safeTab) return Promise.resolve(false);
 if (!isWorkspaceTabActive(safeTab) && options.force !== true) {
  markWorkspaceTabsDirty(safeTab);
  return Promise.resolve(false);
 }
 if (options.preloaded) _workspaceRenderPayloads.set(safeTab, options.preloaded);
 if (_workspaceRenderFrames.has(safeTab)) return _workspaceRenderFrames.get(safeTab).promise;
 let resolveFrame;
 const promise = new Promise(resolve => { resolveFrame = resolve; });
 const raf = requestAnimationFrame(() => {
  _workspaceRenderFrames.delete(safeTab);
  const preloaded = _workspaceRenderPayloads.get(safeTab) || null;
  _workspaceRenderPayloads.delete(safeTab);
  try {
   renderActiveWorkspaceTab(safeTab, preloaded);
   resolveFrame(true);
  } catch (error) {
   reportUiError?.('Workspace render failed', error, { timeoutMs: 7000 });
   resolveFrame(false);
  }
 });
 _workspaceRenderFrames.set(safeTab, { raf, promise });
 return promise;
}

globalThis.markWorkspaceTabsDirty = markWorkspaceTabsDirty;
globalThis.clearWorkspaceTabDirty = clearWorkspaceTabDirty;
globalThis.isWorkspaceTabDirty = isWorkspaceTabDirty;
globalThis.scheduleWorkspaceTabRender = scheduleWorkspaceTabRender;

function buildPollRenderKey(parts = {}) {
 try {
 return JSON.stringify(parts);
 } catch (_) {
 return String(Date.now());
 }
}

async function getPollingSnapshot() {
 const extraKeys = new Set(POLL_TAB_EXTRA_KEYS[activeWorkspaceTab] || []);
 const base = await storeGet(POLL_BASE_KEYS);
 if (!extraKeys.size) return base;
 const extra = await storeGet(Array.from(extraKeys));
 return { ...base, ...extra };
}

function maybeRenderWorkspaceInsights(snapshot = {}) {
 const key = buildPollRenderKey({
 scanStatus: snapshot?.scanStatus || '',
 lastScan: snapshot?.lastScan || '',
 signalCount: Array.isArray(snapshot?.scanResults) ? snapshot.scanResults.length : 0,
 alertCount: Array.isArray(snapshot?.alerts) ? snapshot.alerts.length : 0,
 watchCount: Array.isArray(snapshot?.watchlist) ? snapshot.watchlist.length : 0,
 manualWatchCount: Array.isArray(snapshot?.manualWatchlist) ? snapshot.manualWatchlist.length : 0,
 positionCount: Array.isArray(snapshot?.analyticsPositions) ? snapshot.analyticsPositions.length : 0,
 livePositionCount: Array.isArray(snapshot?.v16LiveAccountSnapshot?.marginedPositions) ? snapshot.v16LiveAccountSnapshot.marginedPositions.length : 0,
 liveOrderCount: Array.isArray(snapshot?.v16LiveAccountSnapshot?.openOrders) ? snapshot.v16LiveAccountSnapshot.openOrders.length : 0,
 dailyLoss: Number(snapshot?.autoTradeDailyLoss || 0),
 regime: snapshot?.marketIndex?.regime || '',
 regimeValue: Number(snapshot?.marketIndex?.value || 0),
 leadership: snapshot?.marketIndex?.leadership?.label || '',
 });
 if (key === _workspaceInsightsRenderKey) return;
 _workspaceInsightsRenderKey = key;
 updateWorkspaceInsights(snapshot);
}

function migrateStrategy() {
 chrome.storage.local.get('strategy', d => {
 const s = d.strategy;
 if (!s) return;
 let changed = false;
 if (!s.maxCoins || s.maxCoins < 200) { s.maxCoins = 500; changed = true; }
 if (s.minVolume > 1000) { s.minVolume = 0; changed = true; }
 if (s.minScore > 25) { s.minScore = 15; changed = true; }
 if (!s.alertScore || s.alertScore > 70) { s.alertScore = 65; changed = true; }
 if (!s.obvPeriod || s.obvPeriod > 80) { s.obvPeriod = 50; changed = true; }
 const safeAutoInterval = sanitizeAutoScanInterval(s.autoScanInterval);
 if (s.autoScanInterval !== safeAutoInterval) { s.autoScanInterval = safeAutoInterval; changed = true; }
 if (!Number.isFinite(+s.fundingMinVolume) || +s.fundingMinVolume < 0) { s.fundingMinVolume = 100000; changed = true; }
 const safeTone = sanitizeAlertTone(s.alertTone);
 if (s.alertTone !== safeTone) { s.alertTone = safeTone; changed = true; }

 const safeKeyLevelSettings = globalThis.FWDTradeDeskShared?.sanitizeKeyLevelSettings
 ? globalThis.FWDTradeDeskShared.sanitizeKeyLevelSettings(s.keyLevelSettings || {})
 : (s.keyLevelSettings || {});

 if (JSON.stringify(s.keyLevelSettings || {}) !== JSON.stringify(safeKeyLevelSettings)) {
 s.keyLevelSettings = safeKeyLevelSettings;
 changed = true;
 }

 const safeChartDefaults = globalThis.FWDTradeDeskShared?.sanitizeChartDefaults
 ? globalThis.FWDTradeDeskShared.sanitizeChartDefaults(s.chartDefaults || {})
 : (s.chartDefaults || {});

 if (JSON.stringify(s.chartDefaults || {}) !== JSON.stringify(safeChartDefaults)) {
 s.chartDefaults = safeChartDefaults;
 changed = true;
 }

 const safeRiskTemplates = globalThis.FWDTradeDeskShared?.sanitizeRiskTemplates
 ? globalThis.FWDTradeDeskShared.sanitizeRiskTemplates(s.riskTemplates || {})
 : (s.riskTemplates || {});

 if (JSON.stringify(s.riskTemplates || {}) !== JSON.stringify(safeRiskTemplates)) {
 s.riskTemplates = safeRiskTemplates;
 changed = true;
 }

 const safeChartCacheEnabled = globalThis.FWDTradeDeskShared?.sanitizeChartCacheEnabled
 ? globalThis.FWDTradeDeskShared.sanitizeChartCacheEnabled(s.chartCacheEnabled)
 : (s.chartCacheEnabled !== false);

 if (s.chartCacheEnabled !== safeChartCacheEnabled) {
 s.chartCacheEnabled = safeChartCacheEnabled;
 changed = true;
 }

 const safeMarketDataMode = globalThis.FWDTradeDeskShared?.sanitizeMarketDataMode
 ? globalThis.FWDTradeDeskShared.sanitizeMarketDataMode(s.marketDataMode)
 : (String(s.marketDataMode || '').trim().toLowerCase() || 'auto');

 if (s.marketDataMode !== safeMarketDataMode) {
 s.marketDataMode = safeMarketDataMode;
 changed = true;
 }
 const safeMarketIndexSettings = globalThis.FWDTradeDeskShared?.sanitizeMarketIndexSettings
 ? globalThis.FWDTradeDeskShared.sanitizeMarketIndexSettings(s.marketIndexSettings || {})
 : (s.marketIndexSettings || {});

 if (JSON.stringify(s.marketIndexSettings || {}) !== JSON.stringify(safeMarketIndexSettings)) {
 s.marketIndexSettings = safeMarketIndexSettings;
 changed = true;
 }
 if (changed) {
 chrome.storage.local.set({ strategy: s });
 console.log('[DS15] Strategy migrated', s);
 }
 });
}


// ==================================================================
// POLLING - auto-refresh UI every 1.5s
// ==================================================================
function startPolling() {
 clearInterval(pollTimer);
 pollTimer = setInterval(async () => {
 if (document.visibilityState === 'hidden') return;
 const _now = Date.now();
 if (activeWorkspaceTab !== _pollLastTab) _pollLastAt = 0;
 if (_now - _pollLastAt < getActivePollInterval()) return;
 _pollLastAt = _now;
 _pollLastTab = activeWorkspaceTab;
 const d = await getPollingSnapshot();
 globalThis.updateSecureStorageWarningBanner?.();
 updateApiUsageMeter();
 updateStatusBar(d.scanStatus, d.scanProgress, d.lastScan, d.scanActive, d.scanHeartbeat, d);
 updateHeaderStats(d.scanResults, d.alerts, d.scannedCoins, d.totalCoins);
 updateMarketIndex(d.marketIndex);
 updateSectorBar(d.sectorSummary);
 updateSessionBadge();
 maybeRenderWorkspaceInsights(d);
 currentWatchlist = d.manualWatchlist || d.watchlist || [];
 currentAlertsCache = d.alerts || [];
 currentAnalyticsPositions = Array.isArray(d.analyticsPositions) ? d.analyticsPositions : currentAnalyticsPositions;
 if (d.soundAlert && d.strategy?.soundAlert !== false) {
 playAlert(d.strategy?.alertTone);
 await chrome.storage.local.set({ soundAlert: false });
 const latestAlerts = d.alerts || [];
 if (latestAlerts.length > 0) showToast(latestAlerts[0]);
 } else if (d.soundAlert && d.strategy?.soundAlert === false) {
 await chrome.storage.local.set({ soundAlert: false, soundTier: null });
 }

 if (!lastAutoBackupScan && d.lastScan) {
 lastAutoBackupScan = d.lastScan;
 }
 const ext = d.externalBackup || {};
 if (ext.enabled && ext.autoBackup && d.scanProgress >= 100 && d.lastScan && d.lastScan !== lastAutoBackupScan) {
 lastAutoBackupScan = d.lastScan;
 writeLocalBackup('scan_complete').catch(() => {});
 }
 const extCfg = sanitizeExternalBackupConfig(ext);
 if (
 extCfg.enabled &&
 extCfg.autoArchive &&
 Array.isArray(d.alertHistory) &&
 d.alertHistory.length > extCfg.keepAlerts &&
 (Date.now() - lastArchiveCheckAt > 30000)
 ) {
 lastArchiveCheckAt = Date.now();
 archiveOldAlertsToLocal('auto_threshold').catch(() => {});
 }

 if (
 (globalThis.v16IsLiveAccountSyncEnabled?.() ?? true)
 && (globalThis.v16IsLiveAnalyticsAutoRefreshEnabled?.() ?? false)
 && document.getElementById('pane-liveanalytics')?.classList.contains('active')
 ) {

 scheduleWorkspaceTabRender('liveanalytics', { preloaded: { scanResults: d.scanResults, lastScan: d.lastScan, alerts: d.alerts } });

 }

 if ((globalThis.v16IsLiveAccountSyncEnabled?.() ?? true) && document.getElementById('pane-positions')?.classList.contains('active')) {

 scheduleWorkspaceTabRender('positions', { preloaded: { scanResults: d.scanResults, lastScan: d.lastScan, alerts: d.alerts } });

 }

 if ((globalThis.v16IsLiveAccountSyncEnabled?.() ?? true) && document.getElementById('pane-orders')?.classList.contains('active')) {

 scheduleWorkspaceTabRender('orders', { preloaded: { scanResults: d.scanResults, lastScan: d.lastScan, alerts: d.alerts } });

 }

 if (document.getElementById('pane-riskcalc')?.classList.contains('active')) {
 globalThis.renderV16VarDashboard?.();
 }

 }, 1500);
}

function formatApiUsageAge(ts = 0) {
 const value = Number(ts || 0);
 if (!(value > 0)) return 'never';
 const ageMs = Math.max(0, Date.now() - value);
 if (ageMs < 60000) return `${Math.max(1, Math.round(ageMs / 1000))}s`;
 if (ageMs < 3600000) return `${Math.round(ageMs / 60000)}m`;
 return `${Math.round(ageMs / 3600000)}h`;
}

function renderApiUsageMeter(response = null) {
 const el = document.getElementById('apiUsageMeter');
 if (!el) return;
 const quota = response?.quota || null;
 const ok = !!response?.ok && !!quota;
 const severity = ok ? String(quota.severity || 'normal').toLowerCase() : 'error';
 el.className = `api-usage-meter ${severity}`;
 if (!ok) {
 el.textContent = 'API status unavailable';
 el.title = response?.error || 'Runtime health did not respond.';
 return;
 }
 const totalRequests = Number(quota.totalRequests || 0);
 const total429 = Number(quota.total429 || 0);
 const cooldownMs = Number(quota.backoffRemainingMs || Math.max(0, Number(quota.backoffUntil || 0) - Date.now()) || 0);
 if (severity === 'critical' && cooldownMs > 0) {
 el.textContent = `API Cooling ${Math.ceil(cooldownMs / 1000)}s`;
 } else if (severity === 'warn') {
 el.textContent = `API Warn | ${totalRequests} calls`;
 } else {
 el.textContent = `API OK | ${totalRequests} calls`;
 }
 el.title = [
 `API status: ${severity}`,
 `Public requests: ${totalRequests}`,
 `Rate-limit hits: ${total429}`,
 `Last OK: ${formatApiUsageAge(quota.lastOkAt)} ago`,
 cooldownMs > 0 ? `Cooling down: ${Math.ceil(cooldownMs / 1000)}s` : '',
 quota.lastStatus ? `Last status: ${quota.lastStatus}` : '',
 ].filter(Boolean).join('\n');
}

function normalizeFwd100DisplayValue(value = 0, sentiment = 0) {
 const numeric = Number(value);
 if (Number.isFinite(numeric) && numeric > 0) return numeric;
 return 10000 * (1 + (Number(sentiment || 0) / 100));
}

function getFwd100PointMove(marketIndex = null, composite = null) {
 const current = Number.isFinite(Number(composite))
 ? Number(composite)
 : normalizeFwd100DisplayValue(marketIndex?.composite, marketIndex?.sentiment?.value ?? marketIndex?.value ?? 0);
 const explicitPoints = Number(marketIndex?.indexChangePoints);
 if (Number.isFinite(explicitPoints)) return explicitPoints;
 const previousComposite = Number(marketIndex?.previousComposite);
 if (Number.isFinite(previousComposite) && previousComposite > 0) return current - previousComposite;
 const pct = Number(marketIndex?.indexChangePct);
 if (!Number.isFinite(pct) || pct === -100) return 0;
 const derivedPrevious = current / (1 + (pct / 100));
 return Number.isFinite(derivedPrevious) && derivedPrevious > 0 ? current - derivedPrevious : 0;
}

function formatFwd100Points(value = 0, digits = 2) {
 const numeric = Number(value);
 const safe = Number.isFinite(numeric) ? numeric : 0;
 return `${safe >= 0 ? '+' : ''}${safe.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function getFwd100MoveLabel(marketIndex = null) {
 const basis = String(marketIndex?.indexChangeBasis || '').trim().toLowerCase();
 if (basis === 'rolling_24h') return '24h';
 if (basis === 'since_available_history') return 'history';
 return 'scan';
}

function describeFwd100MoveWindow(marketIndex = null) {
 const label = getFwd100MoveLabel(marketIndex);
 const baselineTs = Number(marketIndex?.indexChangeBaselineTs || 0);
 const baseline = Number(marketIndex?.indexChangeBaselineComposite || marketIndex?.previousComposite || 0);
 if (label === '24h') {
 return `Rolling 24h move from ${baselineTs ? new Date(baselineTs).toLocaleString() : 'the stored 24h baseline'} (${baseline > 0 ? baseline.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'baseline unavailable'}). This is a rolling 24-hour window, not calendar midnight.`;
 }
 if (label === 'history') {
 return `Move from the closest available stored history point${baselineTs ? ` at ${new Date(baselineTs).toLocaleString()}` : ''}. A precise rolling 24h value will appear after enough stored scans.`;
 }
 return `Move from the previous scan (${baseline > 0 ? baseline.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'baseline unavailable'}). Run scans over 24 hours to show the rolling 24h move.`;
}

function formatFwd100AuditNumber(value = 0, digits = 2) {
 const numeric = Number(value);
 if (!Number.isFinite(numeric)) return '-';
 return numeric.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatFwd100AuditTime(value = 0) {
 const ts = Number(value || 0);
 if (!Number.isFinite(ts) || ts <= 0) return 'Unavailable';
 return new Date(ts).toLocaleString();
}

function buildFwd100AuditHtml(marketIndex = null, currentComposite = 0) {
 const label = getFwd100MoveLabel(marketIndex);
 const isTrue24h = label === '24h';
 const current = Number(currentComposite || marketIndex?.composite || 0);
 const baseline = Number(marketIndex?.indexChangeBaselineComposite || marketIndex?.previousComposite || 0);
 const baselineTs = Number(marketIndex?.indexChangeBaselineTs || 0);
 const points = getFwd100PointMove(marketIndex, current);
 const pct = Number(marketIndex?.indexChangePct || 0);
 const scanPoints = Number(marketIndex?.scanChangePoints ?? marketIndex?.indexChangePoints ?? 0);
 const scanPct = Number(marketIndex?.scanChangePct ?? marketIndex?.indexChangePct ?? 0);
 const basketCount = Array.isArray(marketIndex?.topCoins) ? marketIndex.topCoins.length : Number(marketIndex?.topCount || 0);
 const rows = [
 ['Current FWD-100', formatFwd100AuditNumber(current), 'Live composite saved by latest scan'],
 [`${label.toUpperCase()} baseline`, baseline > 0 ? formatFwd100AuditNumber(baseline) : '-', formatFwd100AuditTime(baselineTs)],
 [`${label.toUpperCase()} points`, formatFwd100Points(points), `${pct >= 0 ? '+' : ''}${formatFwd100AuditNumber(pct)}%`],
 ['Last scan move', formatFwd100Points(scanPoints), `${scanPct >= 0 ? '+' : ''}${formatFwd100AuditNumber(scanPct)}% since previous scan`],
 ['Basket', `${basketCount || '-'} coins`, `Rebalance: ${marketIndex?.rebalanceReason || 'carry'}`],
 ];
 const warning = isTrue24h
 ? ''
 : `<div style="margin-top:8px;padding:8px 10px;border:1px solid rgba(255,200,64,.26);background:rgba(255,200,64,.08);color:#ffd277;border-radius:6px;font-size:9.5px;line-height:1.55">True rolling 24h baseline is not available yet. This audit is showing ${label === 'history' ? 'the closest stored history point' : 'the previous scan'} until the app has enough stored scan history.</div>`;
 return `
 <div class="d10-benchmark-modal-grid">
 ${rows.map(([labelText, valueText, detailText]) => `
 <div class="d10-benchmark-modal-card">
 <span>${escapeHtml(labelText)}</span>
 <strong>${escapeHtml(valueText)}</strong>
 <small>${escapeHtml(detailText)}</small>
 </div>`).join('')}
 </div>
 ${warning}`;
}

function renderPriceChangeDistribution(results = []) {
 const root = document.getElementById('priceChangeDistribution');
 if (!root) return;
 const rows = (Array.isArray(results) ? results : [])
 .map(row => Number(row?.change24h ?? row?.ticker?.change24h ?? row?.priceChange24h ?? 0))
 .filter(value => Number.isFinite(value));
 if (!rows.length) {
 root.hidden = true;
 return;
 }
 const advancers = rows.filter(value => value > 0.05).length;
 const decliners = rows.filter(value => value < -0.05).length;
 const flat = Math.max(0, rows.length - advancers - decliners);
 const total = Math.max(1, rows.length);
 const declinePct = Math.max(4, (decliners / total) * 100);
 const flatPct = flat > 0 ? Math.max(4, (flat / total) * 100) : 0;
 const advancePct = Math.max(4, 100 - declinePct - flatPct);
 const declineBar = document.getElementById('pcdDeclineBar');
 const flatBar = document.getElementById('pcdFlatBar');
 const advanceBar = document.getElementById('pcdAdvanceBar');
 if (declineBar) declineBar.style.width = `${Math.max(0, Math.min(100, declinePct)).toFixed(1)}%`;
 if (flatBar) flatBar.style.width = `${Math.max(0, Math.min(100, flatPct)).toFixed(1)}%`;
 if (advanceBar) advanceBar.style.width = `${Math.max(0, Math.min(100, advancePct)).toFixed(1)}%`;
 const dEl = document.getElementById('pcdDecliners');
 const aEl = document.getElementById('pcdAdvancers');
 if (dEl) dEl.textContent = `D ${decliners}`;
 if (aEl) aEl.textContent = `A ${advancers}`;
 root.title = `Price Change Distribution\nDecliners: ${decliners}\nFlat: ${flat}\nAdvancers: ${advancers}`;
 root.hidden = false;
}

function updateApiUsageMeter(force = false) {
 const el = document.getElementById('apiUsageMeter');
 if (!el) return;
 const now = Date.now();
 if (!force && (now - _apiUsageLastAt) < 10000) return;
 if (_apiUsageInFlight) return;
 _apiUsageLastAt = now;
 _apiUsageInFlight = true;
 chrome.runtime.sendMessage({ action: 'getRuntimeHealth' }, response => {
 _apiUsageInFlight = false;
 if (chrome.runtime.lastError) {
 renderApiUsageMeter({ ok: false, error: chrome.runtime.lastError.message });
 return;
 }
 renderApiUsageMeter(response);
 });
}

document.addEventListener('visibilitychange', () => {
 if (document.visibilityState === 'visible') _pollLastAt = 0;
});


// ==================================================================
// STATUS BAR
// ==================================================================
function updateStatusBar(status, pct, lastScan, scanActive = false, scanHeartbeat = 0, preloaded = null) {
 const dot = document.getElementById('sdot');
 const stxt = document.getElementById('stxt');
 const slst = document.getElementById('slst');
 const progw = document.getElementById('progwrap');
 const pfill = document.getElementById('pfill');
 const pcoin = document.getElementById('pcoin');
 const ppct = document.getElementById('ppct');
 const btnS = document.getElementById('btnScan');
 const progress = Number.isFinite(+pct) ? Math.max(0, Math.min(100, +pct)) : 0;
 const statusText = String(status || '').trim();
 const completedScanWithPartialWarning = !!lastScan && !scanActive && /using partial results/i.test(statusText);
 const scanLikeStatus = !!statusText && /loading|scanning/i.test(statusText);
 const heartbeatFresh = Number.isFinite(+scanHeartbeat) && (Date.now() - Number(scanHeartbeat)) < SCAN_HEARTBEAT_STALE_MS;
 const scanRunning = !!scanActive && heartbeatFresh && scanLikeStatus && progress < 100;
 const staleScanState = scanLikeStatus && progress < 100 && !scanRunning;

 if (scanRunning) {
 dot.className = 'sdot pulse';
 stxt.textContent = statusText;
 progw.style.display = 'block';
 pfill.style.width = progress + '%';
 pcoin.textContent = statusText;
 ppct.textContent = progress + '%';
 btnS.disabled = true;
 scanning = true;
 } else {
 if (completedScanWithPartialWarning && (Date.now() - lastScanRecoveryAt > 10000)) {
 lastScanRecoveryAt = Date.now();
 chrome.storage.local.set({
 scanActive: false,
 scanHeartbeat: Date.now(),
 scanStatus: `Ready - last scan ${lastScan}`,
 scanProgress: 100,
 scanPartialAvailable: false,
 });
 }
 if (staleScanState && (Date.now() - lastScanRecoveryAt > 10000)) {
 lastScanRecoveryAt = Date.now();
 chrome.storage.local.set({
 scanActive: false,
 scanHeartbeat: Date.now(),
 scanStatus: lastScan ? `Ready - last scan ${lastScan}` : 'Ready - click Scan Now',
 scanProgress: 0,
 });
 }
 dot.className = progress === 100 ? 'sdot green' : 'sdot';
 stxt.textContent = staleScanState
 ? 'Scan stopped - ready to restart'
 : (completedScanWithPartialWarning ? `Ready - last scan ${lastScan}` : (statusText || 'Ready - click Scan Now'));
 progw.style.display = 'none';
 btnS.disabled = false;
 if (scanning) {
 scanning = false;
 markWorkspaceTabsDirty(['scanner', 'watchlist', 'chart', 'corr']);
 if (globalThis.v16IsLiveAnalyticsAutoRefreshEnabled?.() ?? false) markWorkspaceTabsDirty('liveanalytics');
 if (isWorkspaceTabDirty(activeWorkspaceTab)) {
 scheduleWorkspaceTabRender(activeWorkspaceTab, { preloaded });
 }
 }
 }
 if (lastScan) slst.textContent = 'Last: ' + lastScan;
}


// ==================================================================
// HEADER STATS
// ==================================================================
function updateHeaderStats(results, alerts, scanned, total) {
 document.getElementById('cSignals').textContent = (results || []).length;
 document.getElementById('cAlerts').textContent = (alerts || []).length;
 if (scanned !== undefined && total !== undefined) {
 document.getElementById('cCoins').textContent = `${scanned}/${total}`;
 }
 const badge = document.getElementById('tbAlert');
 const ac = (alerts || []).length;
 if (badge) {
 badge.textContent = ac > 0 ? ac : '';
 badge.style.display = ac > 0 ? 'block' : 'none';
 }
}

async function refreshStats() {
 const d = await storeGet([
 'scanResults','alerts','scanStatus','scanProgress','lastScan',
 'scannedCoins','totalCoins','marketIndex','sectorSummary','watchlist','manualWatchlist',
 'analyticsPositions',
 'scanActive','scanHeartbeat'
 ]);
 const liveAlerts = getLiveAlertSnapshot(d.alerts, d.scanResults);
 updateHeaderStats(d.scanResults, liveAlerts, d.scannedCoins, d.totalCoins);
 updateApiUsageMeter(true);
 updateStatusBar(d.scanStatus, d.scanProgress, d.lastScan, d.scanActive, d.scanHeartbeat);
 renderPriceChangeDistribution(d.scanResults);
 updateMarketIndex(d.marketIndex);
 updateSectorBar(d.sectorSummary);
 updateWorkspaceInsights(d);
 currentWatchlist = d.manualWatchlist || d.watchlist || [];
 currentAlertsCache = d.alerts || currentAlertsCache;
 currentAnalyticsPositions = Array.isArray(d.analyticsPositions) ? d.analyticsPositions : currentAnalyticsPositions;
}


// ==================================================================
// FWD-100 INDEX - cumulative equal-weight benchmark plus sentiment tape
// ==================================================================
function updateMarketIndex(mi) {
 const bar = document.getElementById('d10bar');
 if (!mi) { bar.style.display = 'none'; return; }
 bar.style.display = 'flex';

 const v = Number(mi.sentiment?.value ?? mi.value ?? 0);
 const indexMove = Number(mi.indexChangePct ?? 0);
 const comp = normalizeFwd100DisplayValue(mi.composite, v);
 const pointMove = getFwd100PointMove(mi, comp);
 const moveLabel = getFwd100MoveLabel(mi);
 const moveTone = pointMove > 0.01 || indexMove > 0.005 ? 'up' : pointMove < -0.01 || indexMove < -0.005 ? 'dn' : 'flat';

 const compEl = document.getElementById('d10composite');
 compEl.textContent = comp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 compEl.style.color = moveTone === 'up' ? '#1de9b6' : moveTone === 'dn' ? '#ff5d7a' : '#ffd277';

 const chgEl = document.getElementById('d10change');
 if (chgEl) {
 chgEl.textContent = `${formatFwd100Points(pointMove)} pts ${moveLabel} (${indexMove >= 0 ? '+' : ''}${indexMove.toFixed(2)}%)`;
 chgEl.className = `d10-change ${moveTone}`;
 chgEl.title = describeFwd100MoveWindow(mi);
 chgEl.style.display = 'inline-flex';
 }

 bar.style.borderBottomColor = v > 2 ? 'rgba(0,229,160,.25)' : v < -2 ? 'rgba(255,69,96,.25)' : 'rgba(255,200,64,.15)';

 const condMap = {
 euphoric: { text: 'EUPHORIC', color: '#00aaff' },
 bull: { text: 'BULLISH', color: '#00e5a0' },
 neutral: { text: 'NEUTRAL', color: '#ffc840' },
 bear: { text: 'BEARISH', color: '#ff4560' },
 crash: { text: 'RISK-OFF', color: '#ff1a40' },
 };
 const cond = condMap[mi.condition] || condMap.neutral;
 const condEl = document.getElementById('d10cond');
 if (condEl) {
 condEl.textContent = '';
 condEl.style.display = 'none';
 }
 const subEl = document.getElementById('d10sub');
 if (subEl) {
 subEl.textContent = '';
 subEl.style.display = 'none';
 }
 updateMarketBenchmarks(mi, cond);

 const coinsEl = document.getElementById('d10coins');
 if (coinsEl) coinsEl.innerHTML = '';
}

// -- FWD-100 Detail Modal --------------------------------------
function updateMarketBenchmarks(mi, cond = {}) {
 const houseCard = document.getElementById('d10houseBenchmark');
 const cfCard = document.getElementById('d10cfBenchmark');
 const spCard = document.getElementById('d10spBenchmark');
 const cf = mi?.benchmarks?.cf || null;
 const sp = mi?.benchmarks?.sp || null;
 if (houseCard) {
 const value = Number(mi?.indexChangePct || 0);
 const points = getFwd100PointMove(mi);
 const moveLabel = getFwd100MoveLabel(mi);
 const sentiment = Number(mi?.sentiment?.value ?? mi?.value ?? 0);
 const tone = sentiment > 2 ? 'good' : sentiment < -2 ? 'bad' : 'warn';
 houseCard.className = `d10-benchmark-card ${tone}`;
 houseCard.querySelector('.d10-benchmark-value').textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
 houseCard.querySelector('.d10-benchmark-copy').textContent = `${formatFwd100Points(points)} pts ${moveLabel} | Sentiment ${sentiment >= 0 ? '+' : ''}${sentiment.toFixed(2)}%`;
 houseCard.title = `FWD-100 is the cumulative equal-weight benchmark. Sentiment tape is separate: ${cond.text || 'NEUTRAL'}. Composite ${normalizeFwd100DisplayValue(mi?.composite, sentiment).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
 }
 if (cfCard) {
 if (cf) {
 const value = Number(cf.value || 0);
 const tone = value > 2 ? 'good' : value < -2 ? 'bad' : 'warn';
 cfCard.className = `d10-benchmark-card ${tone}`;
 cfCard.querySelector('.d10-benchmark-value').textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
 cfCard.querySelector('.d10-benchmark-copy').textContent = `${cf.method || 'Proxy'} | ${Number(cf.coveragePct || 0).toFixed(1)}% cov`;
 cfCard.title = `${cf.label || 'CF-style'} internal benchmark. ${cf.selectionLabel || ''}. ${cf.notes || ''}`;
 } else {
 cfCard.className = 'd10-benchmark-card pending';
 cfCard.querySelector('.d10-benchmark-value').textContent = 'Ready';
 cfCard.querySelector('.d10-benchmark-copy').textContent = 'Calc pending';
 cfCard.title = 'Internal CF-style benchmark will render once live benchmark inputs are available.';
 }
 }
 if (spCard) {
 if (sp) {
 const value = Number(sp.value || 0);
 const tone = value > 2 ? 'good' : value < -2 ? 'bad' : 'warn';
 spCard.className = `d10-benchmark-card ${tone}`;
 spCard.querySelector('.d10-benchmark-value').textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
 spCard.querySelector('.d10-benchmark-copy').textContent = `${sp.method || 'Top set'} | ${Number((sp.constituents || []).length || 0)} names`;
 spCard.title = `${sp.label || 'S&P-style'} internal benchmark. ${sp.selectionLabel || ''}. ${sp.notes || ''}`;
 } else {
 spCard.className = 'd10-benchmark-card pending';
 spCard.querySelector('.d10-benchmark-value').textContent = 'Ready';
 spCard.querySelector('.d10-benchmark-copy').textContent = 'Calc pending';
 spCard.title = 'Internal S&P-style benchmark will render once live benchmark inputs are available.';
 }
 }
}

let d10IndexChartHandle = null;

function d10Finite(value, fallback = 0) {
 if (value == null || value === '') return fallback;
 const numeric = Number(value);
 return Number.isFinite(numeric) ? numeric : fallback;
}

function d10SignedPct(value, digits = 2) {
 const numeric = d10Finite(value, 0);
 return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(digits)}%`;
}

function d10SeriesApi(chart, definition, options = {}, paneIndex = 0) {
 if (chart?.addSeries && definition) return chart.addSeries(definition, options, paneIndex);
 const type = definition?.type || '';
 if (type === 'Histogram' && chart?.addHistogramSeries) return chart.addHistogramSeries(options);
 if (type === 'Area' && chart?.addAreaSeries) return chart.addAreaSeries(options);
 if (chart?.addLineSeries) return chart.addLineSeries(options);
 return null;
}

function d10Sma(values = [], length = 7) {
 const out = new Array(values.length).fill(null);
 let sum = 0;
 for (let index = 0; index < values.length; index += 1) {
 sum += d10Finite(values[index], 0);
 if (index >= length) sum -= d10Finite(values[index - length], 0);
 if (index >= length - 1) out[index] = sum / length;
 }
 return out;
}

function d10Ema(values = [], length = 20) {
 const out = new Array(values.length).fill(null);
 if (!values.length) return out;
 const multiplier = 2 / (length + 1);
 let current = null;
 values.forEach((value, index) => {
 const numeric = d10Finite(value, null);
 if (numeric == null) return;
 current = current == null ? numeric : ((numeric - current) * multiplier) + current;
 if (index >= Math.max(1, length - 1)) out[index] = current;
 });
 return out;
}

function d10Rsi(values = [], length = 14) {
 if (values.length <= length) return null;
 let gains = 0;
 let losses = 0;
 for (let index = 1; index <= length; index += 1) {
 const change = d10Finite(values[index], 0) - d10Finite(values[index - 1], 0);
 if (change >= 0) gains += change;
 else losses += Math.abs(change);
 }
 let avgGain = gains / length;
 let avgLoss = losses / length;
 let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
 for (let index = length + 1; index < values.length; index += 1) {
 const change = d10Finite(values[index], 0) - d10Finite(values[index - 1], 0);
 avgGain = ((avgGain * (length - 1)) + Math.max(0, change)) / length;
 avgLoss = ((avgLoss * (length - 1)) + Math.max(0, -change)) / length;
 rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
 }
 return rsi;
}

function buildD10HistoryModel(history = [], marketIndex = null) {
 const seen = new Set();
 const points = (Array.isArray(history) ? history : [])
 .map(item => ({
 ts: d10Finite(item?.ts, 0),
 composite: normalizeFwd100DisplayValue(item?.composite, item?.sentimentValue ?? item?.value ?? 0),
 value: d10Finite(item?.indexChangePct, d10Finite(item?.value, 0)),
 sentimentValue: d10Finite(item?.sentimentValue, d10Finite(item?.value, 0)),
 sentimentScore: d10Finite(item?.sentimentScore, 0),
 sentimentLabel: String(item?.sentimentLabel || ''),
 advancing: d10Finite(item?.advancing, 0),
 declining: d10Finite(item?.declining, 0),
 topCount: d10Finite(item?.topCount, 0),
 totalVolumeUSD: d10Finite(item?.totalVolumeUSD, 0),
 condition: String(item?.condition || ''),
 }))
 .filter(item => item.ts > 0 && item.composite > 0)
 .sort((a, b) => a.ts - b.ts)
 .filter(item => {
 const key = Math.floor(item.ts / 1000);
 if (seen.has(key)) return false;
 seen.add(key);
 return true;
 });
 if (marketIndex?.ts && marketIndex?.composite) {
 const last = points[points.length - 1] || null;
 if (!last || Math.abs(d10Finite(last.ts, 0) - d10Finite(marketIndex.ts, 0)) > 1000) {
 points.push({
 ts: d10Finite(marketIndex.ts, Date.now()),
 composite: normalizeFwd100DisplayValue(marketIndex.composite, marketIndex.sentiment?.value ?? marketIndex.value ?? 0),
 value: d10Finite(marketIndex.indexChangePct, 0),
 sentimentValue: d10Finite(marketIndex.sentiment?.value, d10Finite(marketIndex.value, 0)),
 sentimentScore: d10Finite(marketIndex.sentiment?.score, 0),
 sentimentLabel: String(marketIndex.sentiment?.label || ''),
 advancing: Array.isArray(marketIndex.topCoins) ? marketIndex.topCoins.filter(coin => Number(coin?.change || 0) > 0).length : 0,
 declining: Array.isArray(marketIndex.topCoins) ? marketIndex.topCoins.filter(coin => Number(coin?.change || 0) < 0).length : 0,
 topCount: Array.isArray(marketIndex.topCoins) ? marketIndex.topCoins.length : 0,
 totalVolumeUSD: d10Finite(marketIndex.totalVolumeUSD, 0),
 condition: String(marketIndex.condition || ''),
 });
 }
 }
 const recent = points.slice(-240);
 const composites = recent.map(point => point.composite);
 const changes = recent.map(point => point.value);
 const sma7 = d10Sma(composites, 7);
 const ema20 = d10Ema(composites, 20);
 const last = recent[recent.length - 1] || null;
 const previous = recent[recent.length - 2] || null;
 const fiveBack = recent[Math.max(0, recent.length - 6)] || previous || last;
 const high = composites.length ? Math.max(...composites) : 0;
 const low = composites.length ? Math.min(...composites) : 0;
 const lastComposite = d10Finite(last?.composite, normalizeFwd100DisplayValue(marketIndex?.composite, marketIndex?.sentiment?.value ?? marketIndex?.value ?? 0));
 const lastSma7 = d10Finite(sma7[sma7.length - 1], null);
 const lastEma20 = d10Finite(ema20[ema20.length - 1], null);
 const momentum5 = fiveBack?.composite ? ((lastComposite - fiveBack.composite) / fiveBack.composite) * 100 : 0;
 const drawdown = high > 0 ? ((lastComposite - high) / high) * 100 : 0;
 const rangePct = low > 0 ? ((high - low) / low) * 100 : 0;
 const rsi14 = d10Rsi(composites, 14);
 const aboveTrend = lastSma7 != null && lastEma20 != null && lastComposite >= lastSma7 && lastComposite >= lastEma20;
 const belowTrend = lastSma7 != null && lastEma20 != null && lastComposite < lastSma7 && lastComposite < lastEma20;
 const breadthTotal = d10Finite(last?.topCount, 0) || Math.max(1, d10Finite(last?.advancing, 0) + d10Finite(last?.declining, 0));
 const breadthPct = breadthTotal > 0 ? (d10Finite(last?.advancing, 0) / breadthTotal) * 100 : 0;
 const structure = aboveTrend && momentum5 >= 0
 ? { label: 'Risk On', tone: 'good', copy: 'Index is above short and medium trend. Scanner can trust continuation setups more.' }
 : belowTrend && momentum5 <= 0
 ? { label: 'Risk Off', tone: 'bad', copy: 'Index is below trend. Long signals need stronger confirmation.' }
 : Math.abs(momentum5) < 0.35
 ? { label: 'Choppy', tone: 'warn', copy: 'Index is moving sideways. Use scanner results selectively.' }
 : { label: 'Recovery / Pullback', tone: 'info', copy: 'Daily move and trend are mixed. Confirm with breadth and key levels.' };
 return {
 points: recent,
 line: recent.map(point => ({ time: Math.floor(point.ts / 1000), value: point.composite })),
 changeBars: recent.map(point => ({
 time: Math.floor(point.ts / 1000),
 value: point.value,
 color: point.value >= 0 ? 'rgba(29,233,182,.42)' : 'rgba(255,93,122,.42)',
 })),
 sma7: recent.map((point, index) => sma7[index] == null ? null : ({ time: Math.floor(point.ts / 1000), value: sma7[index] })).filter(Boolean),
 ema20: recent.map((point, index) => ema20[index] == null ? null : ({ time: Math.floor(point.ts / 1000), value: ema20[index] })).filter(Boolean),
 metrics: {
 count: recent.length,
 latest: lastComposite,
 today: d10Finite(last?.value, d10Finite(marketIndex?.value, 0)),
 sentimentValue: d10Finite(last?.sentimentValue, d10Finite(marketIndex?.sentiment?.value, d10Finite(marketIndex?.value, 0))),
 sentimentScore: d10Finite(last?.sentimentScore, d10Finite(marketIndex?.sentiment?.score, 0)),
 momentum5,
 drawdown,
 rangePct,
 rsi14,
 breadthPct,
 aboveTrend,
 belowTrend,
 lastSma7,
 lastEma20,
 previousComposite: d10Finite(previous?.composite, 0),
 },
 structure,
 };
}

function ensureD10LightweightCharts() {
 if (globalThis.LightweightCharts?.createChart) return Promise.resolve();
 return new Promise((resolve, reject) => {
 const src = 'vendor/lightweight-charts.standalone.production.js';
 const existing = Array.from(document.scripts).find(script => script.getAttribute('src') === src);
 if (existing?.dataset?.loaded === 'true') {
 resolve();
 return;
 }
 const script = existing || document.createElement('script');
 const finish = () => {
 script.dataset.loaded = 'true';
 resolve();
 };
 const fail = () => reject(new Error('FWD-100 chart library failed to load'));
 script.addEventListener('load', finish, { once: true });
 script.addEventListener('error', fail, { once: true });
 if (!existing) {
 script.src = src;
 script.async = false;
 document.body.appendChild(script);
 }
 });
}

async function renderD10IndexChart(model = null) {
 const host = document.getElementById('d10IndexChart');
 if (!host || !model) return;
 if (d10IndexChartHandle?.chart) {
 try { d10IndexChartHandle.chart.remove(); } catch (_) {}
 }
 if (d10IndexChartHandle?.resizeObserver) {
 try { d10IndexChartHandle.resizeObserver.disconnect(); } catch (_) {}
 }
 d10IndexChartHandle = null;
 if (!model.line.length || model.line.length < 2) {
 host.innerHTML = '<div class="d10-chart-empty">Run a few scans to build enough FWD-100 history for the chart.</div>';
 return;
 }
 await ensureD10LightweightCharts();
 host.innerHTML = '';
 const chart = globalThis.LightweightCharts.createChart(host, {
 width: Math.max(320, host.clientWidth || 620),
 height: Math.max(280, host.clientHeight || 320),
 autoSize: true,
 layout: {
 background: { color: '#0f141b' },
 textColor: 'rgba(210,220,232,.78)',
 fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
 },
 grid: {
 vertLines: { visible: false, color: 'rgba(0,0,0,0)' },
 horzLines: { visible: false, color: 'rgba(0,0,0,0)' },
 },
 rightPriceScale: { borderColor: 'rgba(255,255,255,.10)', scaleMargins: { top: 0.08, bottom: 0.22 } },
 timeScale: { borderColor: 'rgba(255,255,255,.10)', timeVisible: true, secondsVisible: false },
 crosshair: { mode: globalThis.LightweightCharts.CrosshairMode?.Normal ?? 0 },
 handleScroll: true,
 handleScale: true,
 });
 const area = d10SeriesApi(chart, globalThis.LightweightCharts.AreaSeries, {
 lineColor: '#4fd1ff',
 topColor: 'rgba(79,209,255,.22)',
 bottomColor: 'rgba(79,209,255,0)',
 lineWidth: 2,
 priceLineVisible: false,
 lastValueVisible: true,
 title: 'FWD-100',
 });
 area?.setData(model.line);
 const sma = d10SeriesApi(chart, globalThis.LightweightCharts.LineSeries, {
 color: '#ffd277',
 lineWidth: 1,
 priceLineVisible: false,
 lastValueVisible: false,
 title: 'SMA 7',
 });
 sma?.setData(model.sma7);
 const ema = d10SeriesApi(chart, globalThis.LightweightCharts.LineSeries, {
 color: '#1de9b6',
 lineWidth: 1,
 priceLineVisible: false,
 lastValueVisible: false,
 title: 'EMA 20',
 });
 ema?.setData(model.ema20);
 const histogram = d10SeriesApi(chart, globalThis.LightweightCharts.HistogramSeries, {
 priceFormat: { type: 'volume' },
 priceLineVisible: false,
 lastValueVisible: false,
 title: 'Move %',
 }, 1);
 histogram?.setData(model.changeBars);
 try { chart.timeScale().fitContent(); } catch (_) {}
 const resizeObserver = typeof ResizeObserver === 'function'
 ? new ResizeObserver(() => {
 requestAnimationFrame(() => {
 try { chart.applyOptions({ width: Math.max(320, host.clientWidth || 620) }); } catch (_) {}
 });
 })
 : null;
 resizeObserver?.observe(host);
 d10IndexChartHandle = { chart, resizeObserver };
}

document.getElementById('d10chart')?.addEventListener('click', async () => {
 if (typeof setActiveWorkspaceTab === 'function') setActiveWorkspaceTab('chart', true, true);
 else document.querySelector('[data-tab="chart"]')?.click();
 try {
 if (typeof globalThis.ensurePopupFeatureModulesForTab === 'function') {
 await globalThis.ensurePopupFeatureModulesForTab('chart');
 }
 await globalThis.FWDTradeDeskChartWorkspace?.setChartState?.({
 symbol: 'FWD100',
 chartViewMode: 'tab',
 preset: 'ema_obv',
 chartType: 'candles',
 timeframe: '1d',
 primaryTimeframe: '1d',
 executionTimeframe: '1d',
 visibleCandleCount: 520,
 showOrders: false,
 showVwap: false,
 rightPanelOpen: false,
 intelligenceOverlays: false,
 deskLayoutMode: 'single',
 overlayDensity: 'minimal',
 refreshNonce: Date.now(),
 });
 await globalThis.FWDTradeDeskChartWorkspace?.requestChartTabRender?.(true);
 } catch (error) {
 globalThis.showSystemToast?.('FWD-100 chart unavailable', error?.message || 'Open Chart and search FWD100.', 'warn', 3200);
 }
});

document.getElementById('d10detail')?.addEventListener('click', async () => {
 const d = await storeGet(['marketIndex', 'marketIndexHistoryMigration']);
 const mi = d.marketIndex;
 if (!mi) return;

 const v = Number(mi.sentiment?.value ?? mi.value ?? 0);
 const indexMove = Number(mi.indexChangePct || 0);
 const indexPoints = getFwd100PointMove(mi);
 const indexMoveLabel = getFwd100MoveLabel(mi);
 const indexMoveDetail = describeFwd100MoveWindow(mi);
 const sentimentScore = Number(mi.sentiment?.score || 0);
 const sentimentLabel = String(mi.sentiment?.label || mi.condition || 'Neutral');
 const comp = normalizeFwd100DisplayValue(mi.composite, v);
 const totalVol = mi.totalVolumeUSD ? '$' + fmtLarge(mi.totalVolumeUSD) : '-';
 const coins = mi.topCoins || [];
 const method = String(mi.method || 'Cumulative equal-weight index').trim();
 const selectionLabel = String(mi.selectionLabel || `Top ${coins.length || 10} coins`).trim();
 const excludedSymbols = Array.isArray(mi.excludedSymbols) ? mi.excludedSymbols : [];
 const excludedLabel = excludedSymbols.length ? excludedSymbols.join(', ') : 'None';
 const lastRebalance = mi.lastRebalancedAt ? new Date(mi.lastRebalancedAt).toLocaleString() : 'Pending';
 const nextRebalance = mi.nextRebalanceAt ? new Date(mi.nextRebalanceAt).toLocaleString() : 'Pending';
 const migration = d.marketIndexHistoryMigration || null;
 const migrationNote = migration?.migratedAt
 ? `<div style="font-size:9px;color:#ffc840;line-height:1.7;margin:0 4px 10px">History reset: v2 cumulative FWD-100 history started ${new Date(migration.migratedAt).toLocaleString()} after ${Number(migration.legacyCount || 0)} legacy snapshot points.</div>`
 : '';

 const coinRows = coins.map((c, i) => {
 const barW = Math.max(2, c.weight);
 const barColor = c.change >= 0 ? '#00e5a0' : '#ff4560';
 return `
 <div class="d10-constituent">
 <div class="d10c-rank">#${i + 1}</div>
 <div class="d10c-sym">${c.sym.replace(/USDT?$/, '')}</div>
 <div class="d10c-weight-bar">
 <div class="d10c-weight-fill" style="width:${barW}%;background:${barColor}"></div>
 </div>
 <div class="d10c-weight">${c.weight}%</div>
 <div class="d10c-vol">$${c.vol || '?'}M</div>
 <div class="d10c-change" style="color:${c.change >= 0 ? '#00e5a0' : '#ff4560'}">${c.change >= 0 ? '+' : ''}${c.change}%</div>
 </div>`;
 }).join('');

 const sectorCounts = {};
 coins.forEach(c => {
 const sec = getSector(c.sym);
 sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
 });
 const sectorPills = Object.entries(sectorCounts)
 .sort((a, b) => b[1] - a[1])
 .map(([s, n]) => `<span class="d10-sec-pill">${s} ${n}</span>`)
 .join('');

 const cf = mi?.benchmarks?.cf || null;
 const sp = mi?.benchmarks?.sp || null;
 const benchmarkCardHtml = benchmark => benchmark
 ? `<div class="d10-benchmark-modal-card">
 <span>${benchmark.label || 'Internal'}</span>
 <strong>${Number(benchmark.value || 0) >= 0 ? '+' : ''}${Number(benchmark.value || 0).toFixed(2)}%</strong>
 <small>${benchmark.method || ''} | ${benchmark.selectionLabel || ''}</small>
 </div>`
 : `<div class="d10-benchmark-modal-card">
 <span>Internal</span>
 <strong>Pending</strong>
 <small>Benchmark data will populate after the next live scan.</small>
 </div>`;
 const sentimentDrivers = Array.isArray(mi.sentiment?.drivers) && mi.sentiment.drivers.length
 ? mi.sentiment.drivers
 : [
 `${Number(mi.sentiment?.breadthPct || 0).toFixed(1)}% breadth`,
 `${Number(mi.sentiment?.advancingVolumePct || 0).toFixed(1)}% advancing volume`,
 `BTC ${Number(mi.sentiment?.btcChange || 0).toFixed(2)}% / ETH ${Number(mi.sentiment?.ethChange || 0).toFixed(2)}%`,
 ];
 const sentimentDriverHtml = sentimentDrivers
 .map(driver => `<span class="d10-sec-pill">${escapeHtml(String(driver || ''))}</span>`)
 .join('');
 const auditHtml = buildFwd100AuditHtml(mi, comp);

 document.getElementById('d10body').innerHTML = `
 <div class="d10-modal-hero">
 <div class="d10-modal-logo">FWD-100</div>
 <div class="d10-modal-val">${comp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
 <div class="d10-modal-change" style="color:${indexMove >= 0 ? '#00e5a0' : '#ff4560'}">
 INDEX ${indexMoveLabel.toUpperCase()} ${formatFwd100Points(indexPoints)} pts (${indexMove >= 0 ? '+' : ''}${indexMove.toFixed(2)}%) | SENTIMENT ${v >= 0 ? '+' : ''}${v.toFixed(2)}%
 </div>
 <div class="d10-modal-meta">Total Volume: ${totalVol} | ${coins.length} constituents | ${sentimentLabel}</div>
 </div>
 <div style="font-size:9px;color:#8a9ab8;line-height:1.8;margin:0 4px 10px">
 Basket: <b>${selectionLabel}</b> | Method: <b>${method}</b> | Excluded: <b>${excludedLabel}</b><br/>
 Last rebalance: <b>${lastRebalance}</b> | Next: <b>${nextRebalance}</b> | Reason: <b>${mi.rebalanceReason || 'carry'}</b><br/>
 Move basis: <b>${escapeHtml(indexMoveDetail)}</b>
 </div>
 ${migrationNote}
 <div class="mo-section">CALCULATION AUDIT</div>
 ${auditHtml}
 <div class="mo-section">HOW FWD-100 WORKS</div>
 <div style="font-size:9.5px;color:#8a9ab8;line-height:1.8;margin-bottom:10px;padding:0 4px">
 Like India's <b style="color:#ffc840">NIFTY 50 Equal Weight</b>, FWD-100 is a
 <b>${method.toLowerCase()}</b> built from ${selectionLabel.toLowerCase()} on Delta Exchange.
 Base value: <b style="color:#00e5c0">10,000</b>. Each selected coin is reset to equal weight at rebalance. The displayed index move uses a rolling 24-hour baseline from stored scans when available; it does not reset at midnight. The sentiment tape is separate and uses 24h breadth, BTC/ETH leadership, funding stress, OI expansion, and volume participation.
 </div>
 <div class="mo-section">SENTIMENT TAPE</div>
 <div style="font-size:9.5px;color:#8a9ab8;line-height:1.8;margin-bottom:10px;padding:0 4px">
 Score: <b style="color:${sentimentScore >= 0 ? '#00e5a0' : '#ff4560'}">${sentimentScore >= 0 ? '+' : ''}${sentimentScore}</b> |
 Breadth: <b>${Number(mi.sentiment?.breadthPct || 0).toFixed(1)}%</b> |
 Advancing volume: <b>${Number(mi.sentiment?.advancingVolumePct || 0).toFixed(1)}%</b> |
 Funding stress: <b>${Number(mi.sentiment?.fundingStressPct || 0).toFixed(1)}%</b>
 </div>
 <div class="d10-sec-row">${sentimentDriverHtml}</div>
 <div class="mo-section">CONSTITUENTS (equal-weight basket)</div>
 <div class="d10-sec-row">${sectorPills}</div>
 <div class="d10-constituents-list">${coinRows}</div>
 <div class="mo-section" style="margin-top:12px">BENCHMARK STACK</div>
 <div class="d10-benchmark-modal-grid">
 <div class="d10-benchmark-modal-card active">
 <span>FWD-100 Index</span>
 <strong>${indexMove >= 0 ? '+' : ''}${indexMove.toFixed(2)}%</strong>
 <small>${formatFwd100Points(indexPoints)} pts ${indexMoveLabel} | ${selectionLabel} | cumulative equal weight.</small>
 </div>
 ${benchmarkCardHtml(cf)}
 ${benchmarkCardHtml(sp)}
 </div>
 <div style="font-size:9px;color:#8a9ab8;line-height:1.8;margin:0 4px 10px">
 CF-style and S&amp;P-style here are <b>internal calculations</b> inspired by those methodology families, not fetched publisher values.
 They use Delta's live universe, liquidity, OI, and buffered basket rules so they stay self-contained inside the extension.
 </div>
 <div class="mo-section" style="margin-top:12px">TRADING GUIDE</div>
 <div style="font-size:9px;color:#8a9ab8;line-height:1.8;padding:0 4px">
 Sentiment > +2% - <b style="color:#00e5a0">Favour LONG signals</b>, skip marginal SHORTs<br/>
 Sentiment -2% to +2% - <b style="color:#ffc840">Trade selectively</b>, wait for clarity<br/>
 Sentiment < -2% - <b style="color:#ff4560">Favour SHORT signals</b>, skip marginal LONGs<br/>
 Sentiment < -5% - <b style="color:#ff1a40">Risk-off</b>, avoid new positions entirely
 </div>`;

 document.getElementById('d10overlay').style.display = 'flex';
});

document.getElementById('d10close')?.addEventListener('click', () => {
 document.getElementById('d10overlay').style.display = 'none';
 if (d10IndexChartHandle?.chart) {
 try { d10IndexChartHandle.chart.remove(); } catch (_) {}
 }
 if (d10IndexChartHandle?.resizeObserver) {
 try { d10IndexChartHandle.resizeObserver.disconnect(); } catch (_) {}
 }
 d10IndexChartHandle = null;
});


// ==================================================================
// SECTOR SUMMARY BAR
// ==================================================================
function updateSectorBar(summary) {
 const bar = document.getElementById('sectorBar');
 const pills = document.getElementById('sectorBarPills');
 if (!summary || !Object.keys(summary).length) { bar.style.display = 'none'; return; }
 bar.style.display = 'flex';

 const sorted = Object.entries(summary).sort((a, b) => b[1].count - a[1].count);
 pills.innerHTML = sorted.map(([name, s]) => {
 const color = s.avgScore >= 70 ? '#00e5a0' : s.avgScore >= 50 ? '#ffc840' : '#7a8ab0';
 return `<span class="sb-pill" style="border-color:${color}40;color:${color}" title="${name}: ${s.count} signals, avg ${s.avgScore}, ${s.bullish}L/${s.bearish}S">
 ${name} <b>${s.count}</b></span>`;
 }).join('');
}


// ==================================================================
// TABS
// ==================================================================
document.querySelectorAll('.tab').forEach(btn => {
 btn.addEventListener('click', () => {
 requestDesktopPaneReveal?.();
 setActiveWorkspaceTab(btn.dataset.tab, true, true);
 });
});

document.querySelectorAll('.workspace-group').forEach(btn => {
 btn.addEventListener('click', () => {
 requestDesktopPaneReveal?.();
 setWorkspaceGroup(btn.dataset.group, true, true);
 });
});

document.getElementById('btnSettingsDrawer')?.addEventListener('click', event => {
 event.stopPropagation();
 const drawer = document.getElementById('settingsDrawer');
 const toggle = document.getElementById('btnSettingsDrawer');
 if (!drawer || !toggle) return;
 const open = drawer.hidden;
 drawer.hidden = !open;
 toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

document.querySelectorAll('.settings-drawer-item').forEach(btn => {
 btn.addEventListener('click', () => {
 const drawer = document.getElementById('settingsDrawer');
 const toggle = document.getElementById('btnSettingsDrawer');
 if (drawer) drawer.hidden = true;
 if (toggle) toggle.setAttribute('aria-expanded', 'false');
 requestDesktopPaneReveal?.();
 setActiveWorkspaceTab(btn.dataset.settingsTab, true, true);
 });
});

document.addEventListener('click', event => {
 const jump = event.target?.closest?.('[data-settings-tab]');
 if (!jump || jump.classList.contains('settings-drawer-item')) return;
 const tab = jump.dataset.settingsTab;
 if (!tab) return;
 requestDesktopPaneReveal?.();
 setActiveWorkspaceTab(tab, true, true);
 const targetPanel = jump.dataset.settingsTargetJump;
 if (targetPanel) {
 setTimeout(() => {
 document.querySelector(`[data-settings-target="${targetPanel}"]`)?.click();
 }, 80);
 }
});

document.addEventListener('click', event => {
 const wrap = document.getElementById('settingsDrawerWrap');
 const drawer = document.getElementById('settingsDrawer');
 const toggle = document.getElementById('btnSettingsDrawer');
 if (!wrap || !drawer || drawer.hidden || wrap.contains(event.target)) return;
 drawer.hidden = true;
 toggle?.setAttribute('aria-expanded', 'false');
});

document.getElementById('btnWorkspaceFocus')?.addEventListener('click', () => {
 setWorkspaceFocusMode(!workspaceFocusMode);
});
document.getElementById('btnDesktopZoom')?.addEventListener('click', () => {
 if (!isDesktopMode) return;
 setDesktopZoomMode(!desktopZoomMode);
});

document.querySelectorAll('.settings-jump').forEach(btn => {
 btn.addEventListener('click', () => {
 requestDesktopPaneReveal?.();
 setActiveWorkspaceTab(btn.dataset.tab, true, true);
 });
});

document.querySelectorAll('.pane').forEach(pane => {
 pane.addEventListener('scroll', () => {
 if (!pane.classList.contains('active')) return;
 if (activeWorkspaceTab !== 'scanner') {
 if (workspaceScrollCollapsed) setWorkspaceScrollCollapsed(false);
 lastActivePaneScrollTop = Number(pane.scrollTop || 0);
 return;
 }
 if (Date.now() < workspaceScrollIgnoreUntil) {
 lastActivePaneScrollTop = Number(pane.scrollTop || 0);
 return;
 }
 const top = Number(pane.scrollTop || 0);
 const delta = top - lastActivePaneScrollTop;
 lastActivePaneScrollTop = top;
 if (workspaceFocusMode) return;
 if (top <= 64) {
 setWorkspaceScrollCollapsed(false);
 return;
 }
 if (!workspaceScrollCollapsed && delta > 22 && top > 220) {
 setWorkspaceScrollCollapsed(true);
 } else if (workspaceScrollCollapsed && (top < 96 || delta < -34)) {
 setWorkspaceScrollCollapsed(false);
 }
 }, { passive: true });
});

document.addEventListener('keydown', (e) => {
 if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
 const tag = (e.target?.tagName || '').toLowerCase();
 if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
 const k = String(e.key || '').toLowerCase();
 if (k === 's') {
 document.querySelector('[data-tab="scanner"]')?.click();
 } else if (k === 'w') {
 document.querySelector('[data-tab="watchlist"]')?.click();
 } else if (k === 'c') {
 document.querySelector('[data-tab="chart"]')?.click();
 }
});


// ==================================================================
// SCANNER TAB
// ==================================================================
