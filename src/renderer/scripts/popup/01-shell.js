// -- Poll rate by active tab (ms) ---------------------------------
const POLL_INTERVALS = {
 home: 2000, // command center - live enough for operating state
 scanner: 1500, // live signals - keep fast
 chart: 3000, // decision chart - medium
 strategies: 10000, // strategy lab - slow
 strategy: 10000, // settings - slow
};
let _pollLastAt = 0;
let _pollLastTab = '';
let _apiUsageLastAt = 0;
let _apiUsageInFlight = false;
let _liveIndexInFlight = false;
function getActivePollInterval() {
 return POLL_INTERVALS[activeWorkspaceTab] ?? 3000;
}

const POLL_BASE_KEYS = [
 'scanStatus', 'scanProgress', 'lastScan', 'alerts',
 'soundAlert', 'marketIndex', 'sectorSummary',
 'totalStocks', 'scannedStocks', 'watchlist', 'manualWatchlist', 'strategy', 'externalBackup',
 'scanActive', 'scanHeartbeat', 'alertHistory', 'scanResults',
];
const POLL_TAB_EXTRA_KEYS = {
 scanner: ['autoWatchlist', 'decisionShortlist', 'sectorBreadth', 'lastScanTs', 'scannerUniverseMeta', 'candleFetchStats'],
};
const _dirtyTabs = new Set(['home', 'scanner', 'strategies']);
const _workspaceRenderFrames = new Map();
const _workspaceRenderPayloads = new Map();
let _workspaceInsightsRenderKey = '';
let _scannerPollRenderKey = '';

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
 if (!s.maxStocks || s.maxStocks > 10) { s.maxStocks = 10; changed = true; }
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
 updateHeaderStats(d.scanResults, d.alerts, d.scannedStocks, d.totalStocks, d.scannerUniverseMeta || null);
 renderPriceChangeDistribution(d.scanResults, d.marketIndex);
 refreshLiveMarketIndex(d.marketIndex);
 updateSectorBar(d.sectorSummary);
 maybeRenderWorkspaceInsights(d);
 if (activeWorkspaceTab === 'scanner') {
  const scannerRenderKey = buildPollRenderKey({
   active: !!d.scanActive,
   status: d.scanStatus || '',
   progress: Number(d.scanProgress || 0),
   lastScan: d.lastScan || '',
   count: Array.isArray(d.scanResults) ? d.scanResults.length : 0,
   scanned: Number(d.scannerUniverseMeta?.scanned || d.scannedStocks || 0),
  });
  if (scannerRenderKey !== _scannerPollRenderKey) {
   _scannerPollRenderKey = scannerRenderKey;
   scheduleWorkspaceTabRender('scanner', { preloaded: d });
  }
 }
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
 document.getElementById('pane-strategies')?.classList.contains('active')
 ) {
 scheduleWorkspaceTabRender('strategies', { preloaded: { scanResults: d.scanResults, lastScan: d.lastScan, alerts: d.alerts } });
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
 const metrics = response?.metrics?.api || response?.performance?.api || {};
 const ok = !!response?.ok && !!quota;
 const severity = ok ? String(quota.severity || 'normal').toLowerCase() : 'error';
 el.className = `api-usage-meter ${severity}`;
 if (!ok) {
 el.textContent = 'API Error';
 el.title = response?.error || 'Runtime health did not respond.';
 return;
 }
 const totalRequests = Number(quota.totalRequests || metrics.total || 0);
 const total429 = Number(quota.total429 || 0);
 const failed = Number(metrics.failed || 0);
 const avgMs = Number(metrics.avgMs || 0);
 const lastMs = Number(metrics.lastMs || 0);
 const cooldownMs = Number(quota.backoffRemainingMs || Math.max(0, Number(quota.backoffUntil || 0) - Date.now()) || 0);
 if (severity === 'critical' && cooldownMs > 0) {
 el.textContent = `Data Cooling ${Math.ceil(cooldownMs / 1000)}s`;
 } else if (severity === 'warn') {
 el.textContent = 'Data Warning';
 } else {
 el.textContent = 'Data Ready';
 }
 el.title = [
 `API status: ${severity}`,
 `Data requests: ${totalRequests}`,
 `Failed requests: ${failed}`,
 `Rate-limit hits: ${total429}`,
 avgMs > 0 ? `Average latency: ${avgMs}ms` : '',
 lastMs > 0 ? `Last latency: ${lastMs}ms` : '',
 `Last OK: ${formatApiUsageAge(quota.lastOkAt)} ago`,
 cooldownMs > 0 ? `Cooling down: ${Math.ceil(cooldownMs / 1000)}s` : '',
 quota.lastStatus ? `Last status: ${quota.lastStatus}` : '',
 quota.lastError ? `Last error: ${quota.lastError}` : '',
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
 const basketCount = Array.isArray(marketIndex?.topStocks) ? marketIndex.topStocks.length : Number(marketIndex?.topCount || 0);
 const rows = [
 ['Current Nifty 50', formatFwd100AuditNumber(current), 'Live composite saved by latest scan'],
 [`${label.toUpperCase()} baseline`, baseline > 0 ? formatFwd100AuditNumber(baseline) : '-', formatFwd100AuditTime(baselineTs)],
 [`${label.toUpperCase()} points`, formatFwd100Points(points), `${pct >= 0 ? '+' : ''}${formatFwd100AuditNumber(pct)}%`],
 ['Last scan move', formatFwd100Points(scanPoints), `${scanPct >= 0 ? '+' : ''}${formatFwd100AuditNumber(scanPct)}% since previous scan`],
 ['Basket', `${basketCount || '-'} stocks`, `Rebalance: ${marketIndex?.rebalanceReason || 'carry'}`],
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

function resolvePriceChangePct(row = {}) {
 const candidates = [
  row?.change24h,
  row?.change,
  row?.priceChange24h,
  row?.priceChangePct,
  row?.changePct,
  row?.changePercent,
  row?.ticker?.change24h,
  row?.ticker?.change,
  row?.ticker?.priceChange24h,
  row?.ticker?.priceChangePct,
  row?.ticker?.changePct,
  row?.ticker?.changePercent,
 ];
 for (const candidate of candidates) {
  const numeric = Number(candidate);
  if (Number.isFinite(numeric) && numeric !== 0) return numeric;
 }
 return 0;
}

function renderPriceChangeDistribution(results = [], marketIndex = null) {
 const root = document.getElementById('priceChangeDistribution');
 if (!root) return;
 const rows = (Array.isArray(results) ? results : [])
 .map(resolvePriceChangePct)
 .filter(value => Number.isFinite(value));
 const nonZeroRows = rows.filter(value => Math.abs(value) > 0.0001);
 if (!rows.length && !marketIndex) {
  root.hidden = true;
  return;
 }
 const breadthAdvancers = Number(marketIndex?.sentiment?.advancing ?? marketIndex?.advancing ?? marketIndex?.breadth?.advancing ?? 0);
 const breadthDecliners = Number(marketIndex?.sentiment?.declining ?? marketIndex?.declining ?? marketIndex?.breadth?.declining ?? 0);
 const hasBreadthFallback = !nonZeroRows.length && (breadthAdvancers > 0 || breadthDecliners > 0);
 if (!nonZeroRows.length && !hasBreadthFallback) {
  root.hidden = true;
  return;
 }
 const advancers = hasBreadthFallback ? breadthAdvancers : rows.filter(value => value > 0.05).length;
 const decliners = hasBreadthFallback ? breadthDecliners : rows.filter(value => value < -0.05).length;
 const distributionTotal = hasBreadthFallback
 ? Number(marketIndex?.sentiment?.total || marketIndex?.topCount || advancers + decliners || 0)
 : rows.length;
 const flat = Math.max(0, distributionTotal - advancers - decliners);
 const total = Math.max(1, distributionTotal);
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
 root.title = `Price Change Distribution\nDecliners: ${decliners}\nFlat: ${flat}\nAdvancers: ${advancers}${hasBreadthFallback ? '\nSource: market breadth fallback because scan rows have no price-change values yet.' : ''}`;
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
function formatScanStripStatus(statusText) {
 const text = String(statusText || '').trim();
 let match = text.match(/^Loading (?:Dhan )?quotes for (.+?) \(breadth (\d+), deep (\d+)\)\.\.\.$/i);
 if (match) return `Preparing ${match[1]} scan (${match[2]} symbols)`;
 match = text.match(/^Loading (?:Dhan )?quotes for (.+?) \(requested (\d+)\)\.\.\.$/i);
 if (match) return `Preparing ${match[1]} scan (${match[2]} symbols)`;
 match = text.match(/^Loaded (\d+) quotes for (.+?); loading products\.\.\.$/i);
 if (match) return `Loaded ${match[2]} quotes (${match[1]}), preparing scan`;
 match = text.match(/^Scanning (.+?):\s*([A-Z0-9&.\-]+)\s*\((\d+\/\d+),.*?\)$/i);
 if (match) return `Scanning ${match[2]} (${match[3]}) | ${match[1]}`;
 if (/^Loading NIFTY reference/i.test(text)) return 'Loading Nifty 50 benchmark reference';
 return text;
}

function formatScannerIndiaTime(timestamp = 0, fallback = '') {
 const formatter = globalThis.FWDTradeDeskShared?.formatIndiaTime;
 const formatted = typeof formatter === 'function' ? formatter(timestamp) : '';
 return formatted || String(fallback || '');
}

function updateStatusBar(status, pct, lastScan, scanActive = false, scanHeartbeat = 0, preloaded = null) {
 const dot = document.getElementById('sdot');
 const stxt = document.getElementById('stxt');
 const slst = document.getElementById('slst');
 const progw = document.getElementById('progwrap');
 const pfill = document.getElementById('pfill');
 const pstock = document.getElementById('psymbol') || document.getElementById('pstock');
 const ppct = document.getElementById('ppct');
 const btnS = document.getElementById('btnScan');
 const universeMeta = preloaded?.scannerUniverseMeta || {};
 const strategyUniverse = preloaded?.strategy?.scanUniverse || '';
 const universeLabel = universeMeta.label || getScannerUniverseLabel(strategyUniverse || 'fno_stocks');
 const scannedCount = Number(universeMeta.scanned || preloaded?.scannedStocks || 0);
 const totalCount = Number(universeMeta.deepTotal || universeMeta.deepScanLimit || universeMeta.total || universeMeta.count || preloaded?.totalStocks || 0);
 const progress = Number.isFinite(+pct) ? Math.max(0, Math.min(100, +pct)) : 0;
 const statusText = String(status || '').trim();
 const pendingCount = Number(universeMeta.pending || 0);
 const scanTimeLabel = formatScannerIndiaTime(preloaded?.lastScanTs, lastScan);
 const completedScanWithPartialWarning = !!lastScan && !scanActive && (/using partial results/i.test(statusText) || universeMeta.partial || (pendingCount > 0 && !universeMeta.completed));
 const failedStatus = /stopped|failed|rate limit|too many|unavailable|error/i.test(statusText);
 const completedStatus = !completedScanWithPartialWarning && (universeMeta.completed || /^ok done|^ready\b|complete/i.test(statusText) || progress >= 100);
 const scanRunning = !!scanActive && !failedStatus && !completedStatus && progress < 100;

 if (scanRunning) {
 if (dot) dot.className = 'sdot pulse';
 const stripStatusText = formatScanStripStatus(statusText);
 if (stxt) {
  stxt.textContent = stripStatusText;
  stxt.title = statusText;
 }
 if (progw) progw.style.display = 'block';
 if (pfill) pfill.style.width = progress + '%';
 if (pstock) pstock.textContent = stripStatusText;
 if (ppct) ppct.textContent = progress + '%';
 if (btnS) {
  btnS.disabled = false;
  btnS.textContent = 'Stop Scan';
  btnS.classList.add('danger');
  btnS.title = 'Stop the running scan';
 }
 scanning = true;
 } else {
 if (dot) dot.className = failedStatus ? 'sdot red' : (progress === 100 ? 'sdot green' : 'sdot');
 const readyText = scanTimeLabel
 ? `Ready - last scan ${scanTimeLabel}${universeLabel ? ` | ${universeLabel}` : ''}${scannedCount || totalCount ? ` | ${scannedCount || '--'}/${totalCount || '--'} scanned` : ''}`
 : 'Ready - click Scan Now';
 if (stxt) stxt.textContent = completedScanWithPartialWarning
 ? statusText
 : (completedStatus ? readyText : (statusText && !/^starting/i.test(statusText) ? statusText : readyText));
 if (progw) progw.style.display = 'none';
 if (btnS) {
  btnS.disabled = false;
  btnS.textContent = 'Scan Now';
  btnS.classList.remove('danger');
  btnS.title = 'Run scanner now';
 }
if (scanning) {
 scanning = false;
 markWorkspaceTabsDirty(['scanner', 'strategies', 'chart', 'strategy']);
 if (isWorkspaceTabDirty(activeWorkspaceTab)) {
 scheduleWorkspaceTabRender(activeWorkspaceTab, { preloaded });
 }
 }
 }
 if (scanTimeLabel && slst) slst.textContent = `Last: ${scanTimeLabel}${universeLabel ? ` | ${universeLabel}` : ''}${scannedCount || totalCount ? ` | ${scannedCount || '--'}/${totalCount || '--'}` : ''}`;
}


// ==================================================================
// HEADER STATS
// ==================================================================
function updateHeaderStats(results, alerts, scanned, total, universeMeta = null) {
 const signalsEl = document.getElementById('cSignals');
 const alertsEl = document.getElementById('cAlerts');
 const symbolsEl = document.getElementById('cStocks') || document.getElementById('csymbols');
 const meta = universeMeta || {};
 const universeLabel = meta.label || getScannerUniverseLabel(meta.id || meta.universe || '');
 const requested = Number(meta.deepTotal || meta.deepScanLimit || meta.requested || meta.limit || total || 0);
 const actualScanned = Number(meta.scanned || scanned || 0);
 const available = Number(meta.count || meta.total || total || 0);
 if (signalsEl) signalsEl.textContent = (results || []).length;
 if (alertsEl) alertsEl.textContent = (alerts || []).length;
 if (scanned !== undefined && total !== undefined) {
 if (symbolsEl) {
  symbolsEl.textContent = `${actualScanned || 0}/${requested || available || total || 0}`;
  symbolsEl.title = [
   universeLabel ? `Scanner universe: ${universeLabel}` : '',
   `Scanned this run: ${actualScanned || 0}`,
   requested ? `Deep scan target: ${requested}` : '',
   meta.returned ? `Quote rows loaded: ${meta.returned}` : '',
   Number(meta.sourceCount || 0) ? `Source rows before eligibility filters: ${Number(meta.sourceCount)}` : (available ? `Available symbols in selected universe: ${available}` : ''),
  ].filter(Boolean).join('\n');
 }
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
 'scanResults','alerts','scanStatus','scanProgress','lastScan','lastScanTs',
 'scannedStocks','totalStocks','marketIndex','sectorSummary','watchlist','manualWatchlist',
 'analyticsPositions',
 'scanActive','scanHeartbeat','scannerUniverseMeta','strategy'
 ]);
 const liveAlerts = getLiveAlertSnapshot(d.alerts, d.scanResults);
 const universeMeta = d.scannerUniverseMeta || {};
 updateHeaderStats(d.scanResults, liveAlerts, universeMeta.scanned || d.scannedStocks, universeMeta.requested || universeMeta.count || universeMeta.total || d.totalStocks, universeMeta);
 updateApiUsageMeter(true);
 updateStatusBar(d.scanStatus, d.scanProgress, d.lastScan, d.scanActive, d.scanHeartbeat, d);
 renderPriceChangeDistribution(d.scanResults, d.marketIndex);
 refreshLiveMarketIndex(d.marketIndex);
 updateSectorBar(d.sectorSummary);
 updateWorkspaceInsights(d);
 currentWatchlist = d.manualWatchlist || d.watchlist || [];
 currentAlertsCache = d.alerts || currentAlertsCache;
 currentAnalyticsPositions = Array.isArray(d.analyticsPositions) ? d.analyticsPositions : currentAnalyticsPositions;
}

function failManualScan(message, detail = '') {
 const scanBtn = document.getElementById('btnScan');
 const dotEl = document.getElementById('sdot');
 const statusEl = document.getElementById('stxt');
 const progressEl = document.getElementById('progwrap');
 if (scanBtn) {
  scanBtn.disabled = false;
  scanBtn.textContent = 'Scan Now';
  scanBtn.classList.remove('danger');
  scanBtn.title = 'Run scanner now';
 }
 if (dotEl) dotEl.className = 'sdot';
 if (progressEl) progressEl.style.display = 'none';
 if (statusEl) statusEl.textContent = message;
 scanning = false;
 showSystemToast?.('Scan failed', detail || message, 'error', 5000);
}

function startManualScan() {
 if (scanning) {
  const scanBtn = document.getElementById('btnScan');
  const statusEl = document.getElementById('stxt');
  if (scanBtn) scanBtn.disabled = true;
  if (statusEl) statusEl.textContent = 'Stopping scan...';
  globalThis.chrome?.runtime?.sendMessage?.({ action: 'stopScan' }, response => {
   if (scanBtn) {
    scanBtn.disabled = false;
    scanBtn.textContent = 'Scan Now';
    scanBtn.classList.remove('danger');
   }
   scanning = false;
   if (statusEl) statusEl.textContent = response?.ok ? 'Scan stopped by user' : `Stop failed: ${response?.error || 'unknown'}`;
   void refreshStats().catch(() => {});
  });
  return;
 }
 scanning = true;
 const scanBtn = document.getElementById('btnScan');
 const dotEl = document.getElementById('sdot');
 const statusEl = document.getElementById('stxt');
 const progressEl = document.getElementById('progwrap');
 if (scanBtn) {
  scanBtn.disabled = false;
  scanBtn.textContent = 'Stop Scan';
  scanBtn.classList.add('danger');
  scanBtn.title = 'Stop the running scan';
 }
 if (dotEl) dotEl.className = 'sdot pulse';
 const currentUniverse = sanitizeScannerUniverseId(getScannerSettingValue('sScanUniverse', 'fno_stocks'));
 const currentUniverseLabel = getScannerUniverseLabel(currentUniverse);
 if (statusEl) statusEl.textContent = `Starting ${currentUniverseLabel} scan...`;
 if (progressEl) progressEl.style.display = 'block';
 chrome.storage?.local?.set?.({
 scanActive: true,
 scanHeartbeat: Date.now(),
 scanStatus: `Starting ${currentUniverseLabel} scan...`,
 scanProgress: 1,
 });

 if (typeof globalThis.chrome?.runtime?.sendMessage !== 'function') {
 failManualScan('Scan error: background not ready', 'Runtime messaging is not available.');
 return;
 }

 globalThis.chrome.runtime.sendMessage({ action: 'startScan' }, response => {
 const runtimeError = globalThis.chrome?.runtime?.lastError;
 if (runtimeError) {
 failManualScan('Scan error: background not ready', runtimeError.message || 'Background not ready.');
 return;
 }
  if (!response?.ok) {
  failManualScan(`Scan error: ${response?.error || 'unknown'}`, response?.error || 'Unknown scan error.');
  return;
  }
  if (statusEl) statusEl.textContent = response?.alreadyRunning
  ? `Scan already running - ${currentUniverseLabel}`
  : `Scan started - ${currentUniverseLabel}`;
  setTimeout(() => refreshStats().catch(() => {}), 750);
 });
}

function updateAutoScanButton(enabled = false, interval = null) {
 const btn = document.getElementById('btnAutoScan');
 if (!btn) return;
 const safeInterval = sanitizeAutoScanInterval(interval);
 btn.textContent = enabled ? `Auto ${safeInterval}m On` : 'Auto Off';
 btn.classList.toggle('active', !!enabled);
 btn.title = enabled ? `Auto-scan every ${safeInterval} minutes` : 'Toggle auto-scan';
}

async function loadAutoScanState() {
 try {
 const d = await storeGet(['autoScan', 'autoScanInterval', 'strategy']);
 const enabled = d.autoScan ?? d.strategy?.autoScan ?? false;
 const interval = sanitizeAutoScanInterval(d.autoScanInterval ?? d.strategy?.autoScanInterval);
 updateAutoScanButton(enabled, interval);
 } catch (error) {
 console.warn('Auto-scan state load failed:', error);
 updateAutoScanButton(false);
 }
}

async function toggleAutoScanFromHeader() {
 const d = await storeGet(['autoScan', 'autoScanInterval', 'strategy']);
 const current = d.autoScan ?? d.strategy?.autoScan ?? false;
 const nextEnabled = !current;
 const interval = sanitizeAutoScanInterval(d.autoScanInterval ?? d.strategy?.autoScanInterval);
 updateAutoScanButton(nextEnabled, interval);

 if (typeof globalThis.chrome?.runtime?.sendMessage !== 'function') {
 updateAutoScanButton(current, interval);
 showSystemToast?.('Auto scan failed', 'Runtime messaging is not available.', 'error', 5000);
 return;
 }

 globalThis.chrome.runtime.sendMessage({ action: 'toggleAutoScan', enable: nextEnabled, interval }, response => {
 const runtimeError = globalThis.chrome?.runtime?.lastError;
 if (runtimeError || !response?.ok) {
 updateAutoScanButton(current, interval);
 showSystemToast?.('Auto scan failed', runtimeError?.message || response?.error || 'Could not update schedule.', 'error', 5000);
 return;
 }
 updateAutoScanButton(response.enabled ?? nextEnabled, response.interval ?? interval);
 showSystemToast?.(
 nextEnabled ? 'Auto scan enabled' : 'Auto scan disabled',
 nextEnabled ? `Scanner will run every ${sanitizeAutoScanInterval(response.interval ?? interval)} minutes.` : 'Scheduled scanner has been stopped.',
 'success',
 2600
 );
 });
}

function getScannerSettingInput(id) {
 return document.getElementById(id);
}

function getScannerSettingValue(id, fallback = '') {
 const input = getScannerSettingInput(id);
 return input ? input.value : fallback;
}

function setScannerSettingValue(id, value) {
 const input = getScannerSettingInput(id);
 if (input) input.value = String(value ?? '');
}

function getScannerSettingChecked(id, fallback = false) {
 const input = getScannerSettingInput(id);
 return input ? !!input.checked : !!fallback;
}

function setScannerSettingChecked(id, value) {
 const input = getScannerSettingInput(id);
 if (input) input.checked = !!value;
}

function getScannerSettingNumber(id, fallback, min = -Infinity, max = Infinity) {
 const raw = Number(getScannerSettingValue(id, fallback));
 const numeric = Number.isFinite(raw) ? raw : Number(fallback);
 return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : 0));
}

function setMaxScanSymbolsValue(value) {
 setScannerSettingValue('sMaxsymbols', value);
 setScannerSettingValue('sMaxCoins', value);
}

function getMaxScanSymbolsValue(fallback = 500) {
 const activeInput = getScannerSettingInput('sMaxsymbols') || getScannerSettingInput('sMaxCoins');
 const raw = activeInput ? Number(activeInput.value) : Number(fallback);
 return Math.max(5, Math.min(3500, Number.isFinite(raw) ? raw : Number(fallback) || 500));
}

function sanitizeScannerUniverseId(value = '') {
 if (typeof globalThis.normalizeDhanScannerUniverse === 'function') return globalThis.normalizeDhanScannerUniverse(value);
 const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
 if (['nifty500', 'nifty_500'].includes(raw)) return 'nifty500';
 if (['midcap150', 'midcap_150', 'midcap'].includes(raw)) return 'midcap150';
 if (['smallcap250', 'smallcap_250', 'smallcap'].includes(raw)) return 'smallcap250';
 if (['all_nse', 'all', 'nse'].includes(raw)) return 'all_nse';
 if (['nse_rest', 'nse_remaining', 'nse_uncovered', 'nse_ex_overlap', 'nse_ex_core'].includes(raw)) return 'nse_rest';
 if (['all_bse', 'bse'].includes(raw)) return 'all_bse';
 if (['bse_only', 'bse_unique', 'bse_ex_nse', 'bse_not_nse'].includes(raw)) return 'bse_only';
 if (['nse_a_f', 'nse_af', 'nse_1', 'nse_chunk_1'].includes(raw)) return 'nse_af';
 if (['nse_g_l', 'nse_gl', 'nse_2', 'nse_chunk_2'].includes(raw)) return 'nse_gl';
 if (['nse_m_r', 'nse_mr', 'nse_3', 'nse_chunk_3'].includes(raw)) return 'nse_mr';
 if (['nse_s_z', 'nse_sz', 'nse_4', 'nse_chunk_4'].includes(raw)) return 'nse_sz';
 if (['bse_a_f', 'bse_af', 'bse_1', 'bse_chunk_1'].includes(raw)) return 'bse_af';
 if (['bse_g_l', 'bse_gl', 'bse_2', 'bse_chunk_2'].includes(raw)) return 'bse_gl';
 if (['bse_m_r', 'bse_mr', 'bse_3', 'bse_chunk_3'].includes(raw)) return 'bse_mr';
 if (['bse_s_z', 'bse_sz', 'bse_4', 'bse_chunk_4'].includes(raw)) return 'bse_sz';
 return 'fno_stocks';
}

function sanitizeScannerTimeframe(value = '', fallback = '4h') {
 const raw = String(value || '').trim().toLowerCase();
 if (['4h', '1d'].includes(raw)) return raw;
 if (['1h', '60m', '60', '240'].includes(raw)) return '4h';
 if (['1wk', 'w', 'weekly', 'week'].includes(raw)) return '1d';
 if (['d', 'day', 'daily'].includes(raw)) return '1d';
 if (['1m', '3m', '5m', '15'].includes(raw)) return '4h';
 return ['4h', '1d'].includes(fallback) ? fallback : '4h';
}

function getScannerUniverseLabel(value = '') {
 const id = sanitizeScannerUniverseId(value);
 return {
  fno_stocks: 'F&O Stocks',
  nifty500: 'Nifty 500',
  midcap150: 'Midcap 150',
  smallcap250: 'Smallcap 250',
  all_nse: 'All NSE Equity',
  nse_rest: 'NSE Rest',
  nse_af: 'NSE A-F',
  nse_gl: 'NSE G-L',
  nse_mr: 'NSE M-R',
  nse_sz: 'NSE S-Z',
  all_bse: 'All BSE Equity',
  bse_only: 'BSE Only',
  bse_af: 'BSE A-F',
  bse_gl: 'BSE G-L',
  bse_mr: 'BSE M-R',
  bse_sz: 'BSE S-Z',
 }[id] || 'F&O Stocks';
}

function getScannerUniverseDefaultLimit(value = '') {
 const id = sanitizeScannerUniverseId(value);
 return {
  fno_stocks: 250,
  nifty500: 500,
  midcap150: 150,
  smallcap250: 250,
  all_nse: 900,
  nse_rest: 650,
  nse_af: 650,
  nse_gl: 650,
  nse_mr: 650,
  nse_sz: 650,
  all_bse: 900,
  bse_only: 650,
  bse_af: 650,
  bse_gl: 650,
  bse_mr: 650,
  bse_sz: 650,
 }[id] || 250;
}

const SCAN_UNIVERSE_SNAPSHOTS_KEY = 'scanUniverseSnapshotsV1';

function sanitizeScannerMode(value = '') {
 const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
 return ['standard', 'penny_awakening'].includes(raw) ? raw : 'standard';
}

function updateScannerUniverseButtons(universe = 'fno_stocks') {
 const activeUniverse = sanitizeScannerUniverseId(universe);
 document.querySelectorAll('[data-scan-universe]').forEach(button => {
 const isActive = sanitizeScannerUniverseId(button.dataset.scanUniverse || '') === activeUniverse;
 button.classList.toggle('active', isActive);
 button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
 });
 const select = getScannerSettingInput('sScanUniverse');
 if (select) select.value = activeUniverse;
}

function sanitizeScannerKeyLevels(raw = {}) {
 return globalThis.FWDTradeDeskShared?.sanitizeKeyLevelSettings
 ? globalThis.FWDTradeDeskShared.sanitizeKeyLevelSettings(raw)
 : (raw || {});
}

function sanitizeScannerChartDefaults(raw = {}) {
 return globalThis.FWDTradeDeskShared?.sanitizeChartDefaults
 ? globalThis.FWDTradeDeskShared.sanitizeChartDefaults(raw)
 : (raw || {});
}

function sanitizeScannerChartCacheEnabled(value) {
 return globalThis.FWDTradeDeskShared?.sanitizeChartCacheEnabled
 ? globalThis.FWDTradeDeskShared.sanitizeChartCacheEnabled(value)
 : value !== false;
}

function sanitizeScannerMarketDataMode(value) {
 return globalThis.FWDTradeDeskShared?.sanitizeMarketDataMode
 ? globalThis.FWDTradeDeskShared.sanitizeMarketDataMode(value)
 : (String(value || '').trim().toLowerCase() || 'auto');
}

function sanitizeScannerMarketIndexSettings(raw = {}) {
 return globalThis.FWDTradeDeskShared?.sanitizeMarketIndexSettings
 ? globalThis.FWDTradeDeskShared.sanitizeMarketIndexSettings(raw)
 : (raw || {});
}

function setScannerSettingsStatus(message = '', tone = '') {
 const saveOk = document.getElementById('saveOK');
 if (saveOk) {
 saveOk.textContent = message;
 saveOk.style.color = tone || '';
 }
 const label = document.getElementById('settingsSaveStateLabel');
 if (label && message) label.textContent = message;
}

async function loadScannerSettings() {
 if (!getScannerSettingInput('sE1')) return;
 const d = await storeGet(['strategy', 'autoScan', 'autoScanInterval']);
 const s = d.strategy || {};
 const keyLevels = sanitizeScannerKeyLevels(s.keyLevelSettings || {});
 const chartDefaults = sanitizeScannerChartDefaults(s.chartDefaults || {});
 const marketIndex = sanitizeScannerMarketIndexSettings(s.marketIndexSettings || {});
 const autoScanInterval = sanitizeAutoScanInterval(d.autoScanInterval ?? s.autoScanInterval);
 const autoScan = d.autoScan ?? s.autoScan ?? false;

 setScannerSettingValue('sE1', s.ema1 ?? 9);
 setScannerSettingValue('sE2', s.ema2 ?? 30);
 setScannerSettingValue('sE3', s.ema3 ?? 100);
 setScannerSettingValue('sOBV', s.obvPeriod ?? 50);
  const scanUniverse = sanitizeScannerUniverseId(s.scanUniverse || 'fno_stocks');
  const scanMode = sanitizeScannerMode(s.scanMode || 'standard');
  setScannerSettingValue('sTF1', sanitizeScannerTimeframe(s.tf1, '1d'));
  setScannerSettingValue('sTF2', sanitizeScannerTimeframe(s.tf2, '4h'));
  setScannerSettingValue('sScanUniverse', scanUniverse);
  setScannerSettingValue('sScanMode', scanMode);
  updateScannerUniverseButtons(scanUniverse);
 setScannerSettingValue('sMinScore', s.minScore ?? 15);
 setScannerSettingValue('sAlertScore', s.alertScore ?? 65);
 setMaxScanSymbolsValue(s.maxCoins ?? 500);
 setScannerSettingValue('sMinVol', s.minVolume ?? 0);
 setScannerSettingValue('sFundingMinVol', s.fundingMinVolume ?? 100000);
 setScannerSettingValue('sMarketIndexMaxConstituents', marketIndex.maxConstituents ?? 250);
 setScannerSettingValue('sMarketIndexRebalanceDays', marketIndex.rebalanceDays ?? 1);
 setScannerSettingValue('sMarketIndexExcludedSymbols', Array.isArray(marketIndex.excludedSymbols) ? marketIndex.excludedSymbols.join(', ') : '');
 setScannerSettingValue('sAutoInterval', autoScanInterval);
 setScannerSettingChecked('sAutoScan', autoScan);
 setScannerSettingChecked('sLiveAccountSync', s.liveAccountSync !== false);
 setScannerSettingChecked('sLiveOrderPreviewChart', s.liveOrderPreviewChart !== false);
 setScannerSettingValue('sMarketDataMode', sanitizeScannerMarketDataMode(s.marketDataMode));
 setScannerSettingValue('sKeyPivotLength', keyLevels.pivotLength ?? 6);
 setScannerSettingValue('sKeyPivotMemory', keyLevels.pivotMemory ?? 50);
 setScannerSettingValue('sKeyLevelCount', keyLevels.numberOfLevels ?? 4);
 setScannerSettingValue('sKeyStrengthDisplay', keyLevels.displayStrengthAs ?? 'score');
 setScannerSettingValue('sKeyThickness', keyLevels.thickness ?? 3);
 setScannerSettingChecked('sKeyShowPivotCircles', keyLevels.showPivotCircles !== false);
 setScannerSettingChecked('sKeyShowLevelGlow', keyLevels.showLevelGlow !== false);
 setScannerSettingValue('sChartDefaultPreset', chartDefaults.defaultPreset ?? 'clean');
 setScannerSettingChecked('sChartShowOrders', !!chartDefaults.showOrders);
 setScannerSettingChecked('sChartShowVwap', !!chartDefaults.showVwap);
 setScannerSettingChecked('sChartCacheEnabled', sanitizeScannerChartCacheEnabled(s.chartCacheEnabled));
 globalThis.deltaMarketDataMode = sanitizeScannerMarketDataMode(s.marketDataMode);
 updateAutoScanButton(autoScan, autoScanInterval);
 setScannerSettingsStatus('No visible changes');
}

async function saveScannerSettings() {
 if (!getScannerSettingInput('sE1')) return;
 const fundingMinVolume = getScannerSettingNumber('sFundingMinVol', 100000, 0);
 const current = await storeGet(['strategy']);
 const previous = current.strategy || {};
 const autoScanInterval = sanitizeAutoScanInterval(getScannerSettingValue('sAutoInterval', previous.autoScanInterval));
 const autoScan = getScannerSettingChecked('sAutoScan', previous.autoScan);
 const marketDataMode = sanitizeScannerMarketDataMode(getScannerSettingValue('sMarketDataMode', previous.marketDataMode));
  const scanUniverse = sanitizeScannerUniverseId(getScannerSettingValue('sScanUniverse', previous.scanUniverse || 'fno_stocks'));
  const scanMode = sanitizeScannerMode(getScannerSettingValue('sScanMode', previous.scanMode || 'standard'));
 const keyLevelSettings = sanitizeScannerKeyLevels({
 pivotLength: getScannerSettingValue('sKeyPivotLength', previous.keyLevelSettings?.pivotLength ?? 6),
 pivotMemory: getScannerSettingValue('sKeyPivotMemory', previous.keyLevelSettings?.pivotMemory ?? 50),
 numberOfLevels: getScannerSettingValue('sKeyLevelCount', previous.keyLevelSettings?.numberOfLevels ?? 4),
 displayStrengthAs: getScannerSettingValue('sKeyStrengthDisplay', previous.keyLevelSettings?.displayStrengthAs ?? 'score'),
 thickness: getScannerSettingValue('sKeyThickness', previous.keyLevelSettings?.thickness ?? 3),
 showPivotCircles: getScannerSettingChecked('sKeyShowPivotCircles', previous.keyLevelSettings?.showPivotCircles !== false),
 showLevelGlow: getScannerSettingChecked('sKeyShowLevelGlow', previous.keyLevelSettings?.showLevelGlow !== false),
 });
 const chartDefaults = sanitizeScannerChartDefaults({
 defaultPreset: getScannerSettingValue('sChartDefaultPreset', previous.chartDefaults?.defaultPreset ?? 'clean'),
 showOrders: getScannerSettingChecked('sChartShowOrders', previous.chartDefaults?.showOrders),
 showVwap: getScannerSettingChecked('sChartShowVwap', previous.chartDefaults?.showVwap),
 });
 const existingMarketIndex = sanitizeScannerMarketIndexSettings(previous.marketIndexSettings || {});
 const marketIndexSettings = sanitizeScannerMarketIndexSettings({
 maxConstituents: getScannerSettingValue('sMarketIndexMaxConstituents', existingMarketIndex.maxConstituents ?? 250),
 rebalanceDays: getScannerSettingValue('sMarketIndexRebalanceDays', existingMarketIndex.rebalanceDays ?? 1),
 rebuildNonce: existingMarketIndex.rebuildNonce,
 excludedSymbols: getScannerSettingValue('sMarketIndexExcludedSymbols', Array.isArray(existingMarketIndex.excludedSymbols) ? existingMarketIndex.excludedSymbols.join(', ') : ''),
 });
 const strategy = {
 ...previous,
 ema1: getScannerSettingNumber('sE1', 9, 1, 200),
 ema2: getScannerSettingNumber('sE2', 30, 1, 200),
 ema3: getScannerSettingNumber('sE3', 100, 1, 200),
 obvPeriod: getScannerSettingNumber('sOBV', 50, 1, 500),
 tf1: sanitizeScannerTimeframe(getScannerSettingValue('sTF1', '1d'), '1d'),
 tf2: sanitizeScannerTimeframe(getScannerSettingValue('sTF2', '4h'), '4h'),
 minScore: getScannerSettingNumber('sMinScore', 15, 0, 100),
 alertScore: getScannerSettingNumber('sAlertScore', 65, 0, 100),
  maxCoins: getMaxScanSymbolsValue(previous.maxCoins ?? 500),
  scanUniverse,
  scanMode,
 minVolume: getScannerSettingNumber('sMinVol', 0, 0),
 fundingMinVolume: Math.round(fundingMinVolume),
 autoScan,
 autoScanInterval,
 liveAccountSync: getScannerSettingChecked('sLiveAccountSync', previous.liveAccountSync !== false),
 liveOrderPreviewChart: getScannerSettingChecked('sLiveOrderPreviewChart', previous.liveOrderPreviewChart !== false),
 marketDataMode,
 marketIndexSettings,
 keyLevelSettings,
 chartDefaults,
 chartCacheEnabled: sanitizeScannerChartCacheEnabled(getScannerSettingChecked('sChartCacheEnabled', previous.chartCacheEnabled !== false)),
 notify: previous.notify ?? true,
 soundAlert: previous.soundAlert ?? true,
 alertTone: sanitizeAlertTone(previous.alertTone),
 };
 const ok = await storeSet({ strategy, autoScan, autoScanInterval });
 if (!ok) {
 showSystemToast?.('Settings failed', 'Could not save scanner settings.', 'error', 5000);
 return;
 }
 globalThis.deltaMarketDataMode = marketDataMode;
 updateScannerUniverseButtons(scanUniverse);
 updateAutoScanButton(autoScan, autoScanInterval);
 if (typeof globalThis.chrome?.runtime?.sendMessage === 'function') {
 globalThis.chrome.runtime.sendMessage({ action: 'toggleAutoScan', enable: autoScan, interval: autoScanInterval }, () => {
 void globalThis.chrome?.runtime?.lastError;
 });
 }
 setScannerSettingsStatus('Settings saved', '#22e0a4');
 showSystemToast?.('Settings saved', `${getScannerUniverseLabel(scanUniverse)} scanner, strategy, chart, and API defaults were saved.`, 'success', 3000);
}

function applyScannerProfilePreset(presetId = '') {
 const presets = {
 manual_clean: { minScore: 15, alertScore: 65, maxCoins: 500, tf1: '1d', tf2: '4h', chart: 'key', universe: 'nifty500' },
 breakout_validation: { minScore: 24, alertScore: 78, maxCoins: 350, tf1: '1d', tf2: '4h', chart: 'analysis', universe: 'nifty500' },
 trend_follow: { minScore: 20, alertScore: 72, maxCoins: 450, tf1: '1d', tf2: '4h', chart: 'ema', universe: 'nifty500' },
 mean_reversion: { minScore: 24, alertScore: 76, maxCoins: 250, tf1: '1d', tf2: '4h', chart: 'key', universe: 'fno_stocks' },
 };
 const preset = presets[String(presetId || '').trim()];
 if (!preset) return;
 setScannerSettingValue('sMinScore', preset.minScore);
 setScannerSettingValue('sAlertScore', preset.alertScore);
 setMaxScanSymbolsValue(preset.maxCoins);
 setScannerSettingValue('sTF1', preset.tf1);
 setScannerSettingValue('sTF2', preset.tf2);
 setScannerSettingValue('sScanUniverse', preset.universe);
 updateScannerUniverseButtons(preset.universe);
 setScannerSettingValue('sChartDefaultPreset', preset.chart);
 setScannerSettingsStatus('Preset applied. Review and save.');
 const note = document.getElementById('strategyProfilePresetStatus');
 if (note) note.textContent = 'Preset applied. Review the visible scanner and chart settings, then Save Strategy.';
}

async function rebuildMarketIndexOnNextScan() {
 const data = await storeGet(['strategy']);
 const strategy = data.strategy || {};
 const marketIndexSettings = sanitizeScannerMarketIndexSettings({
 ...(strategy.marketIndexSettings || {}),
 rebuildNonce: Date.now(),
 });
 const ok = await storeSet({ strategy: { ...strategy, marketIndexSettings } });
 if (ok) {
 setScannerSettingsStatus('Benchmark refresh queued', '#22e0a4');
 showSystemToast?.('Benchmark queued', 'Nifty/F&O breadth context will refresh on the next scan.', 'success', 3000);
 }
}

async function selectScannerUniverse(universe = 'fno_stocks', { runNow = false } = {}) {
 const scanUniverse = sanitizeScannerUniverseId(universe);
 const data = await storeGet(['strategy', SCAN_UNIVERSE_SNAPSHOTS_KEY]);
  const strategy = {
  ...(data.strategy || {}),
  scanUniverse,
  scanMode: ['all_nse', 'all_bse'].includes(scanUniverse) ? sanitizeScannerMode(data.strategy?.scanMode === 'penny_awakening' ? 'standard' : (data.strategy?.scanMode || 'standard')) : sanitizeScannerMode(data.strategy?.scanMode || 'standard'),
  tf1: sanitizeScannerTimeframe(data.strategy?.tf1, '1d'),
  tf2: sanitizeScannerTimeframe(data.strategy?.tf2, '4h'),
  };
  strategy.maxCoins = getScannerUniverseDefaultLimit(scanUniverse);
 const savedSnapshot = data?.[SCAN_UNIVERSE_SNAPSHOTS_KEY]?.[scanUniverse] || null;
 const savedScanTimeLabel = formatScannerIndiaTime(savedSnapshot?.lastScanTs, savedSnapshot?.lastScan);
 const restorePayload = savedSnapshot && typeof savedSnapshot === 'object'
 ? {
  scanResults: Array.isArray(savedSnapshot.scanResults) ? savedSnapshot.scanResults : [],
  alerts: Array.isArray(savedSnapshot.alerts) ? savedSnapshot.alerts : [],
  decisionShortlist: Array.isArray(savedSnapshot.decisionShortlist) ? savedSnapshot.decisionShortlist : [],
  autoWatchlist: Array.isArray(savedSnapshot.autoWatchlist) ? savedSnapshot.autoWatchlist : [],
  manualWatchlist: Array.isArray(savedSnapshot.manualWatchlist) ? savedSnapshot.manualWatchlist : [],
  watchlist: Array.isArray(savedSnapshot.watchlist) ? savedSnapshot.watchlist : [],
  sectorSummary: savedSnapshot.sectorSummary || {},
  sectorBreadth: savedSnapshot.sectorBreadth || null,
  candleFetchStats: savedSnapshot.candleFetchStats || null,
  marketIndex: savedSnapshot.marketIndex || null,
  lastScan: savedScanTimeLabel,
  lastScanTs: Number(savedSnapshot.lastScanTs || 0),
  scannedStocks: Number(savedSnapshot.scannedStocks || savedSnapshot.scannerUniverseMeta?.scanned || 0),
  totalStocks: Number(savedSnapshot.totalStocks || savedSnapshot.scannerUniverseMeta?.count || 0),
  scannerUniverseMeta: savedSnapshot.scannerUniverseMeta || { universe: scanUniverse, label: getScannerUniverseLabel(scanUniverse) },
  scanStatus: savedScanTimeLabel ? `Ready - restored ${getScannerUniverseLabel(scanUniverse)} scan ${savedScanTimeLabel}` : `Ready - ${getScannerUniverseLabel(scanUniverse)} selected`,
  scanProgress: savedScanTimeLabel ? 100 : 0,
  scanActive: false,
  scanHeartbeat: Date.now(),
 }
 : {
  scanResults: [],
  alerts: [],
  decisionShortlist: [],
  autoWatchlist: [],
  scanStatus: `Ready - ${getScannerUniverseLabel(scanUniverse)} selected`,
  scanProgress: 0,
  scanActive: false,
  scanHeartbeat: Date.now(),
  scannerUniverseMeta: { universe: scanUniverse, label: getScannerUniverseLabel(scanUniverse), requested: strategy.maxCoins, count: strategy.maxCoins, scanned: 0, pending: 0 },
  scannedStocks: 0,
  totalStocks: strategy.maxCoins,
 };
  await storeSet({ strategy, ...restorePayload });
  setScannerSettingValue('sScanUniverse', scanUniverse);
  setScannerSettingValue('sScanMode', strategy.scanMode);
  setMaxScanSymbolsValue(strategy.maxCoins);
 updateScannerUniverseButtons(scanUniverse);
 showSystemToast?.(
 `${getScannerUniverseLabel(scanUniverse)} selected`,
 savedScanTimeLabel ? `Restored saved scan from ${savedScanTimeLabel}. Use Scan Now to refresh.` : 'Use Scan Now to run this universe.',
 'success',
 2400
 );
 scheduleWorkspaceTabRender?.('scanner', { preloaded: { strategy, ...restorePayload } });
}

globalThis.startManualScan = startManualScan;
globalThis.loadAutoScanState = loadAutoScanState;
globalThis.loadScannerSettings = loadScannerSettings;
globalThis.saveScannerSettings = saveScannerSettings;
globalThis.getScannerUniverseLabel = getScannerUniverseLabel;


// ==================================================================
// FWD index tape plus F&O breadth
// ==================================================================
async function refreshLiveMarketIndex(mi) {
 if (!mi || _liveIndexInFlight || !window.fwdDesktopNative?.sendNativeMessage) {
  updateMarketIndex(mi);
  return;
 }
 _liveIndexInFlight = true;
 try {
  const response = await window.fwdDesktopNative.sendNativeMessage({ type: 'dhan_data', action: 'live_feed_status', limit: 24 });
  const ticks = Array.isArray(response?.ticks) ? response.ticks : [];
  if (!response?.connected || !ticks.length || !Array.isArray(mi.indexTape)) {
   updateMarketIndex(mi);
   return;
  }
  const bySymbol = new Map(ticks.map(tick => [String(tick.symbol || tick.tradingSymbol || '').trim().toUpperCase(), tick]));
  const indexTape = mi.indexTape.map(item => {
   const tick = bySymbol.get(String(item.symbol || '').trim().toUpperCase());
   const price = Number(tick?.lastPrice || 0);
   if (!tick || !(price > 0)) return item;
   const storedPrice = Number(item.price || 0);
   const storedPoints = Number(item.pointChange || 0);
   const baseline = storedPrice > 0 && Number.isFinite(storedPoints) ? storedPrice - storedPoints : Number(tick.close || 0);
   const pointChange = baseline > 0 ? price - baseline : storedPoints;
   const changePct = baseline > 0 ? (pointChange / baseline) * 100 : Number(item.changePct || 0);
   return { ...item, price, pointChange, changePct };
  });
  const nifty = indexTape.find(item => item.symbol === 'NIFTY');
  updateMarketIndex({
   ...mi,
   indexTape,
   composite: Number(nifty?.price || mi.composite || 0),
   indexValue: Number(nifty?.price || mi.indexValue || 0),
   indexChangePct: Number(nifty?.changePct ?? mi.indexChangePct ?? 0),
  });
 } catch (_) {
  updateMarketIndex(mi);
 } finally {
  _liveIndexInFlight = false;
 }
}

function updateMarketIndex(mi) {
 const bar = document.getElementById('d10bar');
 if (!mi) { bar.style.display = 'none'; return; }
 bar.style.display = 'flex';

 const v = Number(mi.sentiment?.value ?? mi.value ?? 0);
 const breadthPct = Number(mi.sentiment?.breadthPct ?? 0);
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
  subEl.textContent = 'LIVE';
 subEl.style.display = '';
 }
 updateMarketBenchmarks(mi, cond);

 const stocksEl = document.getElementById('d10stocks');
 if (stocksEl) stocksEl.innerHTML = '';
}

// -- NIFTY 50 Detail Modal --------------------------------------
function updateMarketBenchmarks(mi, cond = {}) {
 const wrap = document.getElementById('d10benchmarks');
 if (!wrap) return;
 const sentiment = Number(mi?.sentiment?.value ?? mi?.value ?? 0);
 const fallbackTape = [{
  label: mi?.benchmarkLabel || 'Nifty 50',
  shortLabel: 'N50',
  price: normalizeFwd100DisplayValue(mi?.composite, sentiment),
  changePct: Number(mi?.indexChangePct || 0),
  pointChange: getFwd100PointMove(mi),
  symbol: mi?.benchmarkSymbol || 'NIFTY',
 }];
 const indexTape = Array.isArray(mi?.indexTape) && mi.indexTape.length ? mi.indexTape : fallbackTape;
 wrap.innerHTML = indexTape.slice(0, 6).map((item, index) => {
  const changePct = Number(item?.changePct ?? (index === 0 ? mi?.indexChangePct : 0) ?? 0);
  const points = Number(item?.pointChange ?? (index === 0 ? getFwd100PointMove(mi) : 0) ?? 0);
  const price = Number(item?.price || 0);
  const tone = changePct > 0.03 ? 'good' : changePct < -0.03 ? 'bad' : 'warn';
  const pointCopy = Number.isFinite(points) && Math.abs(points) > 0.005 ? `${points >= 0 ? '+' : ''}${points.toFixed(2)} pts` : '-- pts';
  const pctCopy = Number.isFinite(changePct) ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '--%';
  const direction = changePct > 0.03 ? '&#8599;' : changePct < -0.03 ? '&#8600;' : '';
  return `<div class="d10-ribbon-quote ${tone}" title="${escapeHtml(`${item?.label || item?.symbol || 'Index'} live quote. F&O breadth remains separate: ${cond.text || 'NEUTRAL'}.`)}">
 <span class="d10-benchmark-label">${escapeHtml(item?.label || item?.symbol || 'Index')}</span>
 <strong class="d10-benchmark-value">${escapeHtml(price > 0 ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--')}</strong>
 <small class="d10-benchmark-copy">${escapeHtml(`${pointCopy} (${pctCopy})`)} <span aria-hidden="true">${direction}</span></small>
 </div>`;
 }).join('');
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
 advancing: Array.isArray(marketIndex.topStocks) ? marketIndex.topStocks.filter(stock => Number(stock?.change || 0) > 0).length : 0,
 declining: Array.isArray(marketIndex.topStocks) ? marketIndex.topStocks.filter(stock => Number(stock?.change || 0) < 0).length : 0,
 topCount: Array.isArray(marketIndex.topStocks) ? marketIndex.topStocks.length : 0,
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
 const fail = () => reject(new Error('Nifty 50 chart library failed to load'));
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
 host.innerHTML = '<div class="d10-chart-empty">Run a few scans to build enough Nifty 50 history for the chart.</div>';
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
 title: 'Nifty 50',
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

async function openD10SyntheticChart(symbol = 'NIFTY', label = 'Nifty 50 chart') {
 const normalizedSymbol = String(symbol || 'NIFTY').trim().toUpperCase() || 'NIFTY';
 const isMetricSymbol = normalizedSymbol === 'FNO-CARRY' || normalizedSymbol === 'FNO-BREADTH' || normalizedSymbol === 'FNO-AD';
 if (typeof setActiveWorkspaceTab === 'function') setActiveWorkspaceTab('chart', true, true);
 else document.querySelector('[data-tab="chart"]')?.click();
 try {
 if (typeof globalThis.ensurePopupFeatureModulesForTab === 'function') {
 await globalThis.ensurePopupFeatureModulesForTab('chart');
 }
 const nextChartState = {
 symbol: normalizedSymbol,
 chartViewMode: 'tab',
 preset: isMetricSymbol ? 'clean' : 'ema_obv',
 chartType: isMetricSymbol ? 'line' : 'candles',
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
 showIndicatorLegend: !isMetricSymbol,
 refreshNonce: Date.now(),
 };
 if (isMetricSymbol) {
 nextChartState.indicators = {
 volume: false,
 ema: false,
 emaRemoved: true,
 ema9: false,
 ema30: false,
 ema100: false,
 vwap: false,
 vwapRemoved: true,
 obv: false,
 obvRemoved: true,
 obvLine: false,
 obvSma: false,
 atr: false,
 atrRemoved: true,
 };
 }
 await globalThis.FWDTradeDeskChartWorkspace?.setChartState?.(nextChartState);
 await globalThis.FWDTradeDeskChartWorkspace?.requestChartTabRender?.(true);
 } catch (error) {
 globalThis.showSystemToast?.(`${label} unavailable`, error?.message || `Open Chart and search ${normalizedSymbol}.`, 'warn', 3200);
 }
}

document.getElementById('d10chart')?.addEventListener('click', () => {
 openD10SyntheticChart('NIFTY', 'Nifty 50 chart');
});

document.getElementById('d10detail')?.addEventListener('click', async () => {
 const d = await storeGet(['marketIndex', 'marketIndexHistoryMigration', 'fnoCarryMetricHistoryV1']);
 const mi = d.marketIndex;
 if (!mi) return;

 const v = Number(mi.sentiment?.value ?? mi.value ?? 0);
 const indexMove = Number(mi.indexChangePct || 0);
 const indexPoints = getFwd100PointMove(mi);
 const indexMoveLabel = getFwd100MoveLabel(mi);
 const indexMoveDetail = describeFwd100MoveWindow(mi);
 const sentimentScore = Number(mi.sentiment?.score || 0);
 const sentimentLabel = String(mi.sentiment?.label || mi.condition || 'Neutral');
 const carryHistory = Array.isArray(d.fnoCarryMetricHistoryV1) ? d.fnoCarryMetricHistoryV1 : [];
 const latestCarry = carryHistory[carryHistory.length - 1] || null;
 const carryAnnualPct = Number(latestCarry?.carryAnnualPct);
 const carryLabel = Number.isFinite(carryAnnualPct)
 ? `${carryAnnualPct >= 0 ? '+' : ''}${carryAnnualPct.toFixed(2)}% annualized (${Number(latestCarry.carryExecutableRows || 0)} executable rows)`
 : 'Refresh F&O Carry to build implied-basis history';
 const comp = normalizeFwd100DisplayValue(mi.composite, v);
 const totalVol = mi.totalVolumeUSD ? 'Rs ' + fmtLarge(mi.totalVolumeUSD) : '-';
 const stocks = mi.fnoConstituents || mi.topStocks || mi.topCoins || [];
 const method = String(mi.method || 'Cumulative equal-weight index').trim();
 const selectionLabel = String(mi.selectionLabel || `Top ${stocks.length || 10} stocks`).trim();
 const excludedSymbols = Array.isArray(mi.excludedSymbols) ? mi.excludedSymbols : [];
 const excludedLabel = excludedSymbols.length ? excludedSymbols.join(', ') : 'None';
 const lastRebalance = mi.lastRebalancedAt ? new Date(mi.lastRebalancedAt).toLocaleString() : 'Pending';
 const nextRebalance = mi.nextRebalanceAt ? new Date(mi.nextRebalanceAt).toLocaleString() : 'Pending';
 const migration = d.marketIndexHistoryMigration || null;
 const migrationNote = migration?.migratedAt
 ? `<div style="font-size:9px;color:#ffc840;line-height:1.7;margin:0 4px 10px">History reset: v2 cumulative Nifty 50 history started ${new Date(migration.migratedAt).toLocaleString()} after ${Number(migration.legacyCount || 0)} legacy snapshot points.</div>`
 : '';

 const stockRows = stocks.map((c, i) => {
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
 <div class="d10c-vol">Rs ${c.vol || '?'}M</div>
 <div class="d10c-change" style="color:${c.change >= 0 ? '#00e5a0' : '#ff4560'}">${c.change >= 0 ? '+' : ''}${c.change}%</div>
 </div>`;
 }).join('');

 const sectorCounts = {};
 stocks.forEach(c => {
 const sec = getSector(c.sym);
 sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
 });
 const sectorPills = Object.entries(sectorCounts)
 .sort((a, b) => b[1] - a[1])
 .map(([s, n]) => `<span class="d10-sec-pill">${s} ${n}</span>`)
 .join('');

 const indexTape = Array.isArray(mi.indexTape) && mi.indexTape.length
 ? mi.indexTape
 : [{ symbol: 'NIFTY', label: 'Nifty 50', price: comp, changePct: indexMove, pointChange: indexPoints }];
 const indexTapeHtml = indexTape.slice(0, 6).map(item => {
 const changePct = Number(item?.changePct || 0);
 const price = Number(item?.price || 0);
 const points = Number(item?.pointChange || 0);
 const pointCopy = Number.isFinite(points) ? `${points >= 0 ? '+' : ''}${points.toFixed(2)} pts` : '-- pts';
 return `<div class="d10-benchmark-modal-card ${String(item?.symbol || '').toUpperCase() === 'NIFTY' ? 'active' : ''}">
 <span>${escapeHtml(item?.label || item?.symbol || 'Index')}</span>
 <strong>${escapeHtml(pointCopy)}</strong>
 <small>${price > 0 ? price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--'} | ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% | FWD</small>
 </div>`;
 }).join('');
 const sentimentDrivers = Array.isArray(mi.sentiment?.drivers) && mi.sentiment.drivers.length
 ? mi.sentiment.drivers
 : [
 `${Number(mi.sentiment?.breadthPct || 0).toFixed(1)}% breadth`,
 `${Number(mi.sentiment?.advancingVolumePct || 0).toFixed(1)}% advancing volume`,
 `Large-cap proxy ${Number(mi.sentiment?.btcChange || 0).toFixed(2)}% / ${Number(mi.sentiment?.ethChange || 0).toFixed(2)}%`,
 ];
 const sentimentDriverHtml = sentimentDrivers
 .map(driver => `<span class="d10-sec-pill">${escapeHtml(String(driver || ''))}</span>`)
 .join('');
 const auditHtml = buildFwd100AuditHtml(mi, comp);
 const breadthPct = Number(mi.sentiment?.breadthPct ?? 0);

 document.getElementById('d10body').innerHTML = `
 <div class="d10-modal-hero">
 <div class="d10-modal-logo">FWD INDICES</div>
 <div class="d10-modal-val">${comp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
 <div class="d10-modal-change" style="color:${indexMove >= 0 ? '#00e5a0' : '#ff4560'}">
 NIFTY ${indexMoveLabel.toUpperCase()} ${formatFwd100Points(indexPoints)} pts (${indexMove >= 0 ? '+' : ''}${indexMove.toFixed(2)}%) | F&O BREADTH ${breadthPct.toFixed(1)}%
 </div>
 <div class="d10-modal-meta">Total Volume: ${totalVol} | ${stocks.length} constituents | ${sentimentLabel}</div>
 </div>
 <div style="font-size:9px;color:#8a9ab8;line-height:1.8;margin:0 4px 10px">
 Basket: <b>${selectionLabel}</b> | Method: <b>${method}</b> | Excluded: <b>${excludedLabel}</b><br/>
 Last rebalance: <b>${lastRebalance}</b> | Next: <b>${nextRebalance}</b> | Reason: <b>${mi.rebalanceReason || 'carry'}</b><br/>
 Move basis: <b>${escapeHtml(indexMoveDetail)}</b>
 </div>
 ${migrationNote}
 <div class="mo-section">CALCULATION AUDIT</div>
 ${auditHtml}
 <div class="mo-section">HOW NIFTY 50 BENCHMARK WORKS</div>
 <div style="font-size:9.5px;color:#8a9ab8;line-height:1.8;margin-bottom:10px;padding:0 4px">
 Nifty 50, Bank Nifty, Fin Nifty, India VIX, Midcap Nifty, and Nifty IT appear as <b style="color:#ffc840">FWD Index</b> quotes. The app uses Nifty 50 as the primary reference and keeps F&O stock breadth separate.
 </div>
 <div class="mo-section">SENTIMENT TAPE</div>
 <div style="font-size:9.5px;color:#8a9ab8;line-height:1.8;margin-bottom:10px;padding:0 4px">
 Score: <b style="color:${sentimentScore >= 0 ? '#00e5a0' : '#ff4560'}">${sentimentScore >= 0 ? '+' : ''}${sentimentScore}</b> |
 Breadth: <b>${Number(mi.sentiment?.breadthPct || 0).toFixed(1)}%</b> |
 Advancing volume: <b>${Number(mi.sentiment?.advancingVolumePct || 0).toFixed(1)}%</b> |
 Implied carry: <b>${escapeHtml(carryLabel)}</b>
 </div>
 <div class="d10-sec-row">
  <button class="d10-detail-btn" type="button" data-d10-synthetic-chart="NIFTY">Nifty Chart</button>
  <button class="d10-detail-btn" type="button" data-d10-synthetic-chart="FNO-CARRY">F&O Carry Chart</button>
  <button class="d10-detail-btn" type="button" data-d10-synthetic-chart="FNO-BREADTH">F&O Breadth Chart</button>
  <button class="d10-detail-btn" type="button" data-d10-synthetic-chart="FNO-AD">F&O A/D Chart</button>
 </div>
 <div class="d10-sec-row">${sentimentDriverHtml}</div>
 <div class="mo-section">F&O STOCK BREADTH</div>
 <div class="d10-sec-row">${sectorPills}</div>
 <div class="d10-constituents-list">${stockRows}</div>
 <div class="mo-section" style="margin-top:12px">FWD INDEX TAPE</div>
 <div class="d10-benchmark-modal-grid">
 ${indexTapeHtml}
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

document.getElementById('d10body')?.addEventListener('click', event => {
 const button = event.target?.closest?.('[data-d10-synthetic-chart]');
 if (!button) return;
 const symbol = String(button.dataset.d10SyntheticChart || '').trim().toUpperCase();
 if (!symbol) return;
 openD10SyntheticChart(symbol, button.textContent?.trim() || symbol);
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

document.getElementById('btnAppRailToggle')?.addEventListener('click', event => {
 const collapsed = document.body.classList.toggle('app-rail-collapsed');
 event.currentTarget.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
 event.currentTarget.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
 try {
  localStorage.setItem('fwd-app-rail-collapsed', collapsed ? '1' : '0');
 } catch (_) {}
});

try {
 if (localStorage.getItem('fwd-app-rail-collapsed') === '1') {
  document.body.classList.add('app-rail-collapsed');
  const railToggle = document.getElementById('btnAppRailToggle');
  railToggle?.setAttribute('aria-expanded', 'false');
  railToggle?.setAttribute('aria-label', 'Expand navigation');
 }
} catch (_) {}

document.getElementById('btnScan')?.addEventListener('click', startManualScan);
document.getElementById('btnAutoScan')?.addEventListener('click', () => {
 toggleAutoScanFromHeader().catch(error => {
 console.warn('Auto-scan toggle failed:', error);
 showSystemToast?.('Auto scan failed', error?.message || 'Could not update schedule.', 'error', 5000);
 void loadAutoScanState();
 });
});
void loadAutoScanState();
document.addEventListener('DOMContentLoaded', () => {
 void loadScannerSettings();
});

document.addEventListener('click', event => {
 const saveButton = event.target?.closest?.('#btnSave');
 if (saveButton) {
 event.preventDefault();
 void saveScannerSettings();
 return;
 }
 const presetButton = event.target?.closest?.('[data-settings-profile-preset]');
 if (presetButton) {
 event.preventDefault();
 applyScannerProfilePreset(presetButton.dataset.settingsProfilePreset || '');
 return;
 }
 const benchmarkButton = event.target?.closest?.('#sMarketIndexRebuildNow');
 if (benchmarkButton) {
 event.preventDefault();
 void rebuildMarketIndexOnNextScan();
 return;
 }
 const universeButton = event.target?.closest?.('[data-scan-universe]');
 if (universeButton) {
 event.preventDefault();
 void selectScannerUniverse(universeButton.dataset.scanUniverse || 'fno_stocks', { runNow: false });
 }
});

document.addEventListener('change', event => {
 if (event.target?.id === 'sScanUniverse') {
 void selectScannerUniverse(event.target.value || 'fno_stocks', { runNow: false });
 }
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
 document.querySelector('[data-tab="strategies"]')?.click();
 } else if (k === 'c') {
 document.querySelector('[data-tab="chart"]')?.click();
 }
});


// ==================================================================
// SCANNER TAB
// ==================================================================
