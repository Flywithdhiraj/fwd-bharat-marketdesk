'use strict';

function installRendererBootRecovery() {
 if (window.__fwdRendererBootRecoveryInstalled) return;
 window.__fwdRendererBootRecoveryInstalled = true;

 const benignRuntimeMessage = message => /ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)/i.test(String(message || ''));
 const isDetachedChartStartup = () => new URLSearchParams(location.search).get('chart') === '1';
 const escapeRecoveryHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
 const errorText = error => {
  if (!error) return 'The renderer did not finish starting.';
  if (typeof error === 'string') return error;
  return String(error.message || error.reason || error.type || 'The renderer did not finish starting.');
 };

 function showRecoveryNotice(title, detail) {
  if (typeof globalThis.reportUiError === 'function') {
   globalThis.reportUiError(title, detail, { timeoutMs: 12000 });
  }
  let panel = document.getElementById('rendererBootRecovery');
  if (!panel) {
   panel = document.createElement('div');
   panel.id = 'rendererBootRecovery';
   panel.setAttribute('role', 'alert');
   panel.style.cssText = [
    'position:fixed',
    'right:18px',
    'bottom:18px',
    'z-index:99999',
    'max-width:420px',
    'padding:14px 16px',
    'border:1px solid rgba(255,88,124,.5)',
    'border-radius:10px',
    'background:rgba(12,18,30,.96)',
    'box-shadow:0 18px 48px rgba(0,0,0,.42)',
    'color:#eaf3ff',
    'font:12px/1.45 system-ui,-apple-system,Segoe UI,sans-serif'
   ].join(';');
   document.body?.appendChild(panel);
  }
  panel.innerHTML = `<strong style="display:block;color:#ff87a5;font-size:13px;margin-bottom:4px;">${escapeRecoveryHtml(String(title || 'Startup recovered'))}</strong><span>${escapeRecoveryHtml(String(detail || 'The app recovered the normal workspace.'))}</span>`;
 }

 function reloadToNormalWorkspace(reason) {
  showRecoveryNotice('Chart startup recovered', reason || 'Chart mode did not finish loading. Opening the normal workspace now.');
  const nextUrl = `${location.pathname}?w=1&desktop=1&app=windows&chartRecovery=1`;
  setTimeout(() => {
   try {
    location.replace(nextUrl);
   } catch (_) {
    location.href = nextUrl;
   }
  }, 900);
 }

 function recoverBlankChartMode(reason) {
  const body = document.body;
  if (!body?.classList.contains('chart-mode')) return false;
  const chartRoot = document.getElementById('chartWorkspaceRoot');
  const chartHasContent = !!(chartRoot && !chartRoot.hidden && chartRoot.querySelector('.live-order-chart-card, .ds-lwc-chart, canvas'));
  if (chartHasContent) return false;
  reloadToNormalWorkspace(reason || 'Chart mode opened without a mounted chart. Opening the normal workspace now.');
  return true;
 }

 window.addEventListener('error', event => {
  if (benignRuntimeMessage(event?.message)) return;
  const detail = errorText(event?.error || event?.message);
  if (isDetachedChartStartup()) showRecoveryNotice('Chart runtime issue', detail);
  else if (typeof globalThis.reportUiError === 'function') globalThis.reportUiError('Unexpected error', detail, { timeoutMs: 7000 });
 });

 window.addEventListener('unhandledrejection', event => {
  const message = errorText(event?.reason);
  if (benignRuntimeMessage(message)) return;
  if (isDetachedChartStartup()) showRecoveryNotice('Chart request issue', message);
  else if (typeof globalThis.reportUiError === 'function') globalThis.reportUiError('Request failed', message, { timeoutMs: 7000 });
 });

 globalThis.FWDRecoverBlankChartMode = recoverBlankChartMode;
}

installRendererBootRecovery();
const V16_MOJIBAKE_TEST_RE = /[\u00c2\u00c3\u00e2\u00f0\u0153\u0178\u017e\u0161\u20ac\u2122\u2019\ufffd]/;
const V16_MOJIBAKE_ATTRS = ['title', 'placeholder', 'aria-label', 'value'];
const V16_CP1252_REVERSE = new Map([
 ['\u20ac', 0x80],
 ['\u201a', 0x82],
 ['\u0192', 0x83],
 ['\u201e', 0x84],
 ['\u2026', 0x85],
 ['\u2020', 0x86],
 ['\u2021', 0x87],
 ['\u02c6', 0x88],
 ['\u2030', 0x89],
 ['\u0160', 0x8a],
 ['\u2039', 0x8b],
 ['\u0152', 0x8c],
 ['\u017d', 0x8e],
 ['\u2018', 0x91],
 ['\u2019', 0x92],
 ['\u201c', 0x93],
 ['\u201d', 0x94],
 ['\u2022', 0x95],
 ['\u2013', 0x96],
 ['\u2014', 0x97],
 ['\u02dc', 0x98],
 ['\u2122', 0x99],
 ['\u0161', 0x9a],
 ['\u203a', 0x9b],
 ['\u0153', 0x9c],
 ['\u017e', 0x9e],
 ['\u0178', 0x9f],
]);

function v16MojibakeScore(text = '') {
 const matches = String(text || '').match(/[\u00c2\u00c3\u00e2\u00f0\u0153\u0178\u017e\u0161\u20ac\u2122\u2019\ufffd]/g);
 return matches ? matches.length : 0;
}

function v16Windows1252ByteForChar(ch = '') {
 const code = String(ch || '').charCodeAt(0);
 if (!Number.isFinite(code)) return null;
 if (code <= 0xff) return code;
 return V16_CP1252_REVERSE.get(ch) ?? null;
}

function v16DecodeUtf8FromWindows1252(text = '') {
 const bytes = [];
 for (const ch of Array.from(String(text || ''))) {
 const byte = v16Windows1252ByteForChar(ch);
 if (byte == null) return String(text || '');
 bytes.push(byte);
 }
 return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes));
}

function v16DecodeLikelyUtf8Mojibake(text = '') {
 let value = String(text || '');
 if (!value || !V16_MOJIBAKE_TEST_RE.test(value) || typeof TextDecoder !== 'function') return value;
 try {
 for (let i = 0; i < 3; i += 1) {
 const decoded = v16DecodeUtf8FromWindows1252(value);
 if (!decoded || decoded === value) break;
 if (v16MojibakeScore(decoded) < v16MojibakeScore(value)) {
 value = decoded;
 continue;
 }
 break;
 }
 return value;
 } catch (_) {
 return value;
 }
}

function v16NormalizeUiString(text = '') {
 let value = String(text || '');
 let next = v16DecodeLikelyUtf8Mojibake(value);
 if (next !== value) value = next;
 next = value
 .replace(/\u00a0/g, ' ')
 .replace(/\s*\u00b7\s*/g, ' | ')
 .replace(/\s*\u2014\s*/g, ' - ')
 .replace(/\s{2,}/g, ' ')
 .replace(/ \./g, '.')
 .replace(/ ,/g, ',');
 return next;
}

function v16NormalizeUiNode(node) {
 if (!node) return;
 if (node.nodeType === Node.TEXT_NODE) {
 const parentTag = node.parentElement?.tagName;
 if (parentTag === 'SCRIPT' || parentTag === 'STYLE') return;
 const current = node.nodeValue || '';
 const normalized = v16NormalizeUiString(current);
 if (normalized && normalized !== current) node.nodeValue = normalized;
 return;
 }
 if (node.nodeType !== Node.ELEMENT_NODE) return;
 const element = /** @type {HTMLElement} */ (node);
 if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return;
 V16_MOJIBAKE_ATTRS.forEach(attr => {
 if (!element.hasAttribute(attr)) return;
 const current = element.getAttribute(attr) || '';
 const normalized = v16NormalizeUiString(current);
 if (normalized && normalized !== current) element.setAttribute(attr, normalized);
 });
 Array.from(element.childNodes || []).forEach(child => v16NormalizeUiNode(child));
}

function v16EnsureUiTextNormalization() {
 if (window.__v16UiTextObserverInstalled) return;
 window.__v16UiTextObserverInstalled = true;
 const root = document.body || document.documentElement;
 if (!root) return;
 v16NormalizeUiNode(root);
 const observer = new MutationObserver(mutations => {
 mutations.forEach(mutation => {
 if (mutation.type === 'characterData') {
 v16NormalizeUiNode(mutation.target);
 return;
 }
 if (mutation.type === 'attributes') {
 v16NormalizeUiNode(mutation.target);
 return;
 }
 mutation.addedNodes.forEach(node => v16NormalizeUiNode(node));
 });
 });
 observer.observe(root, {
 subtree: true,
 childList: true,
 characterData: true,
 attributes: true,
 attributeFilter: V16_MOJIBAKE_ATTRS,
 });
 window.v16NormalizeUiString = v16NormalizeUiString;
 window.v16NormalizeUiNode = v16NormalizeUiNode;
}

v16EnsureUiTextNormalization();

const POPUP_LAZY_SCRIPT_PATHS = Object.freeze({
 v16Core: 'scripts/popup/06-v16-capabilities-core.js',
 v16: 'scripts/popup/06-v16-capabilities.js',
 chartVendor: 'vendor/lightweight-charts.standalone.production.js',
 chartIndicators: 'scripts/shared/chart-indicators.js',
 chartEngine: 'scripts/popup/chart-engine.js',
 chart: 'scripts/popup/07-chart-workspace.js',
 optionsHub: 'scripts/popup/08-options-hub.js',
 fnoCarry: 'scripts/popup/10-fno-carry.js',
 commodities: 'scripts/popup/11-commodities.js',
 strategyLab: 'scripts/popup/09-strategy-lab.js',
 researchRisk: 'scripts/popup/04-research-risk.js',
 debug: 'scripts/popup/05-settings-webhooks-helpers.js',
});
const POPUP_LAZY_STYLE_PATHS = Object.freeze({
 chart: 'styles/05-chart-workspace.css',
});
const popupLazyScriptPromises = new Map();
const popupLazyStylePromises = new Map();
let popupV16InitPromise = null;
let popupV16Initialized = false;
const POPUP_V16_TABS = new Set(['strategy']);
const POPUP_STRATEGY_LAB_TABS = new Set(['strategies']);

function popupRequestIdleCallback(task, timeout = 1200) {
 if (typeof window.requestIdleCallback === 'function') {
 window.requestIdleCallback(() => task(), { timeout });
 return;
 }
 window.setTimeout(task, Math.min(timeout, 600));
}

function loadPopupScriptOnce(src) {
 const safeSrc = String(src || '').trim();
 if (!safeSrc) return Promise.resolve();
 if (popupLazyScriptPromises.has(safeSrc)) return popupLazyScriptPromises.get(safeSrc);
 const existing = Array.from(document.scripts).find(script => script.getAttribute('src') === safeSrc);
 if (existing && existing.dataset.loaded === 'true') return Promise.resolve();
 const promise = new Promise((resolve, reject) => {
 let settled = false;
 const script = existing || document.createElement('script');
 const finish = () => {
 if (settled) return;
 settled = true;
 script.dataset.loaded = 'true';
 resolve();
 };
 const fail = () => {
 if (settled) return;
 settled = true;
 reject(new Error(`Failed to load ${safeSrc}`));
 };
 if (!existing) {
 script.src = safeSrc;
 script.async = false;
 script.dataset.popupLazy = 'true';
 document.body.appendChild(script);
 }
 script.addEventListener('load', finish, { once: true });
 script.addEventListener('error', fail, { once: true });
 if (existing) {
 queueMicrotask(finish);
 }
 setTimeout(() => {
 if (settled) return;
 if (existing) finish();
 else fail();
 }, 15000);
 }).catch(error => {
 popupLazyScriptPromises.delete(safeSrc);
 throw error;
 });
 popupLazyScriptPromises.set(safeSrc, promise);
 return promise;
}

function loadPopupStyleOnce(href) {
 const safeHref = String(href || '').trim();
 if (!safeHref) return Promise.resolve();
 if (popupLazyStylePromises.has(safeHref)) return popupLazyStylePromises.get(safeHref);
 const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
 .find(link => link.getAttribute('href') === safeHref);
 if (existing && existing.dataset.loaded === 'true') return Promise.resolve();
 const promise = new Promise((resolve, reject) => {
 let settled = false;
 const link = existing || document.createElement('link');
 const finish = () => {
 if (settled) return;
 settled = true;
 link.dataset.loaded = 'true';
 resolve();
 };
 const fail = () => {
 if (settled) return;
 settled = true;
 reject(new Error(`Failed to load ${safeHref}`));
 };
 link.addEventListener('load', finish, { once: true });
 link.addEventListener('error', fail, { once: true });
 if (!existing) {
 link.rel = 'stylesheet';
 link.href = safeHref;
 link.dataset.popupLazyStyle = 'true';
 document.head.appendChild(link);
 }
 if (existing) {
 queueMicrotask(finish);
 }
 setTimeout(() => {
 if (settled) return;
 if (existing) finish();
 else fail();
 }, 15000);
 }).catch(error => {
 popupLazyStylePromises.delete(safeHref);
 throw error;
 });
 popupLazyStylePromises.set(safeHref, promise);
 return promise;
}

function renderLazyPaneState(tab) {
 if (!['chart', 'options', 'carry', 'commodities'].includes(String(tab || ''))) return;
 const pane = document.getElementById(`pane-${tab}`);
 if (!pane || pane.dataset.lazyReady === 'true') return;
 if (tab === 'options') {
  pane.innerHTML = `<div class="chart-pane-loading"><div class="chart-pane-loading-title">Options Hub</div><div class="chart-pane-loading-copy">Loading option-chain analytics...</div></div>`;
  return;
 }
 if (tab === 'carry') {
  pane.innerHTML = `<div class="chart-pane-loading"><div class="chart-pane-loading-title">F&amp;O Carry</div><div class="chart-pane-loading-copy">Loading stock futures basis...</div></div>`;
  return;
 }
 if (tab === 'commodities') {
  pane.innerHTML = `<div class="chart-pane-loading"><div class="chart-pane-loading-title">Commodities</div><div class="chart-pane-loading-copy">Loading MCX futures watch...</div></div>`;
  return;
 }
 if (tab === 'chart') {
  pane.innerHTML = `<div class="chart-pane-loading"><div class="chart-pane-loading-title">Chart workspace</div><div class="chart-pane-loading-copy">Loading the decision chart...</div></div>`;
  return;
 }
}

async function ensureV16CapabilityUpgradeLoaded() {
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.v16Core);
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.v16);
 if (popupV16Initialized) return;
 if (!popupV16InitPromise) {
  popupV16InitPromise = Promise.resolve(globalThis.initV16CapabilityUpgrade?.())
  .then(() => {
   popupV16Initialized = true;
   document.querySelectorAll('#pane-strategy').forEach(pane => {
    pane.dataset.lazyReady = 'true';
   });
  })
 .catch(error => {
 popupV16InitPromise = null;
 throw error;
 });
 }
 await popupV16InitPromise;
}

async function ensureChartWorkspaceLoaded() {
 await loadPopupStyleOnce(POPUP_LAZY_STYLE_PATHS.chart);
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.chartVendor);
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.chartIndicators);
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.chartEngine);
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.chart);
}

async function ensureStrategyLabLoaded() {
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.strategyLab);
}

async function ensureOptionsHubLoaded() {
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.optionsHub);
}

async function ensureFnoCarryLoaded() {
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.fnoCarry);
}

async function ensureCommoditiesLoaded() {
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.commodities);
}

async function ensurePopupFeatureModulesForTab(tab) {
 const safeTab = String(tab || '').trim().toLowerCase();
 if (safeTab === 'options') {
 renderLazyPaneState(safeTab);
 await ensureOptionsHubLoaded();
 return;
 }
 if (safeTab === 'carry') {
  renderLazyPaneState(safeTab);
  await ensureFnoCarryLoaded();
  return;
 }
 if (safeTab === 'commodities') {
  renderLazyPaneState(safeTab);
  await ensureCommoditiesLoaded();
  return;
 }
 if (POPUP_STRATEGY_LAB_TABS.has(safeTab)) {
 renderLazyPaneState(safeTab);
 await ensureStrategyLabLoaded();
 return;
 }
 if (POPUP_V16_TABS.has(safeTab)) {
 renderLazyPaneState(safeTab);
 await ensureV16CapabilityUpgradeLoaded();
 return;
 }
 if (safeTab === 'chart') {
 renderLazyPaneState(safeTab);
 await ensureChartWorkspaceLoaded();
 return;
 }
 if (safeTab === 'debug') {
 renderLazyPaneState(safeTab);
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.debug);
 }
}

async function renderChartWorkspacePane(options = {}) {
 const pane = document.getElementById('pane-chart');
 if (!pane) return;
 renderLazyPaneState('chart');
 await ensureChartWorkspaceLoaded();
 await globalThis.FWDTradeDeskChartWorkspace?.mountChartTab?.({
 root: pane,
 autoSelectBest: options.autoSelectBest !== false,
 });
 pane.dataset.lazyReady = 'true';
}

async function openSignalInChartWorkspace(signal = {}, options = {}) {
 const isStageSignal = String(signal?.strategyId || '').toLowerCase() === 'stage' || !!signal?.raw?.stageMetrics;
 await ensureChartWorkspaceLoaded();
 const openAsOverlay = options.overlay !== false;
 const requestedTimeframe = options.timeframe || signal?.timeframe || signal?.raw?.timeframe || (isStageSignal ? '1d' : '4h');
 const reviewTimeframe = openAsOverlay ? requestedTimeframe : requestedTimeframe;
 const requestedVisibleCount = Number(options.visibleCandleCount || 0);
 const chartOptions = {
 chartViewMode: openAsOverlay ? 'review' : 'tab',
 preset: options.preset || (openAsOverlay ? 'ema_obv' : 'clean'),
 timeframe: reviewTimeframe,
 visibleCandleCount: requestedVisibleCount > 0 ? requestedVisibleCount : (openAsOverlay ? 120 : undefined),
 chartTradingDraft: options.chartTradingDraft || signal.chartTradingDraft || null,
 showOrders: isStageSignal,
 showVwap: false,
 rightPanelOpen: false,
 intelligenceOverlays: false,
 deskLayoutMode: 'single',
 overlayDensity: 'minimal',
 compareWithIndex: options.compareWithIndex === true,
 primaryTimeframe: options.primaryTimeframe || reviewTimeframe,
 returnTab: options.returnTab || '',
 returnSymbol: options.returnSymbol || signal.symbol || '',
 overlay: openAsOverlay,
 };
 if (openAsOverlay && globalThis.FWDTradeDeskChartWorkspace?.openChartReviewTab) {
 await globalThis.FWDTradeDeskChartWorkspace.openChartReviewTab(signal, chartOptions);
 return;
 }
 if (options.reviewTab && globalThis.FWDTradeDeskChartWorkspace?.openChartReviewTab) {
 await globalThis.FWDTradeDeskChartWorkspace.openChartReviewTab(signal, chartOptions);
 } else {
 await globalThis.FWDTradeDeskChartWorkspace?.setChartSymbolFromSignal?.(signal, chartOptions);
 }
 if (typeof setActiveWorkspaceTab === 'function') {
 setActiveWorkspaceTab('chart', true, true);
 } else {
 document.querySelector('[data-tab="chart"]')?.click();
 }
 await renderChartWorkspacePane({ autoSelectBest: false });
}

function warmPopupFeatureModules(params, activeTab) {
 if (params.get('chart') === '1') return;
 popupRequestIdleCallback(() => {
  const tasks = [];
  const safeActiveTab = String(activeTab || '').trim().toLowerCase();
  if (POPUP_V16_TABS.has(safeActiveTab)) tasks.push(ensureV16CapabilityUpgradeLoaded());
  Promise.all(tasks).catch(error => {
   globalThis.reportUiError?.('Warm-up failed', error, { timeoutMs: 5000 });
  });
 }, 1600);
}

globalThis.ensurePopupFeatureModulesForTab = ensurePopupFeatureModulesForTab;
globalThis.ensureV16CapabilityUpgradeLoaded = ensureV16CapabilityUpgradeLoaded;
globalThis.ensureChartWorkspaceLoaded = ensureChartWorkspaceLoaded;
globalThis.ensureStrategyLabLoaded = ensureStrategyLabLoaded;
globalThis.renderChartWorkspacePane = renderChartWorkspacePane;
globalThis.openSignalInChartWorkspace = openSignalInChartWorkspace;

document.addEventListener('DOMContentLoaded', async () => {
 v16EnsureUiTextNormalization();
 console.log('[FWD] FWD Bharat MarketDesk popup loaded');
 const params = new URLSearchParams(location.search);
 loadTheme();
 if (params.get('w') === '1') {
 document.body.style.height = '100vh';
 }
 if (params.get('desktop') === '1') {
 document.body.style.height = '100vh';
 document.body.classList.add('desktop-mode');
 isDesktopMode = true;
 }
 if (params.get('chart') === '1') {
 document.body.classList.add('chart-mode');
 globalThis.__fwdDetachedChartRenderComplete = false;
 const detachedStartup = globalThis.FWDDetachedChartStartup || Promise.resolve(globalThis.FWDChartAuthReady)
  .then(() => ensureChartWorkspaceLoaded())
  .then(() => {
   const initDetached = globalThis.FWDTradeDeskChartWorkspace?.initDetachedChartWorkspace;
   if (typeof initDetached !== 'function') throw new Error('Chart workspace API is unavailable.');
   return initDetached();
  });
 Promise.resolve(detachedStartup)
 .catch(error => {
 globalThis.FWDRecoverBlankChartMode?.('Chart workspace could not load. Scanner controls were restored.');
 globalThis.reportUiError?.('Chart workspace failed', error, { timeoutMs: 7000 });
 })
 .finally(() => {
 v16NormalizeUiNode(document.body);
 });
 return;
 }
 migrateStrategy();
 await loadPopupScriptOnce(POPUP_LAZY_SCRIPT_PATHS.researchRisk);
 loadAutoScanState();
 loadAutoTradeState();
 refreshStats();
 storeGet([
 'analyticsFocusMode', 'workspaceGroup', 'activeWorkspaceTab',
 'scannerPreset', 'alertSortMode', 'workspaceFocusMode', 'desktopZoomMode'
 ]).then(async d => {
 scannerPreset = ['trend', 'reversal', 'crowding', 'tracked', ''].includes(String(d.scannerPreset || ''))
 ? String(d.scannerPreset || '')
 : '';
 alertSortMode = ['portfolio', 'score', 'newest'].includes(String(d.alertSortMode || ''))
 ? String(d.alertSortMode || '')
 : 'portfolio';
 workspaceFocusMode = !!d.workspaceFocusMode;
 desktopZoomMode = !!d.desktopZoomMode;
 applyStoredFilterUi();
 const storedTab = String(d.activeWorkspaceTab || '');
 const restoreLastTab = params.get('restoreLastTab') === '1';
 const desiredTab = restoreLastTab && TAB_TITLES[storedTab]
 ? storedTab
 : 'home';
 const desiredGroup = restoreLastTab && WORKSPACE_GROUP_META[d.workspaceGroup] ? d.workspaceGroup : getWorkspaceGroupForTab(desiredTab);
 workspaceGroup = desiredGroup;
 activeWorkspaceTab = WORKSPACE_GROUP_META[desiredGroup].tabs.includes(desiredTab)
 ? desiredTab
 : WORKSPACE_GROUP_META[desiredGroup].tabs[0];
 syncWorkspaceShell();
 await globalThis.ensurePopupFeatureModulesForTab?.(activeWorkspaceTab);
 renderActiveWorkspaceTab(activeWorkspaceTab);
 setAnalyticsFocusMode(false, false);
 setDesktopZoomMode(!!d.desktopZoomMode, false);
 resetDesktopViewport?.();
 warmPopupFeatureModules(params, activeWorkspaceTab);
 });
 updateWorkspaceInsights();
 startPolling();

 if (params.get('desktop') === '1') {
 resetDesktopViewport?.();
 }
 chrome.runtime.sendMessage({ action: 'ping' }, (resp) => {
 if (chrome.runtime.lastError) return;
 if (resp?.ok && resp.region) {
 desktopApiRegion = String(resp.region).toLowerCase() === 'global' ? 'global' : 'india';
 }
 });
 const desktopBtn = document.getElementById('btnDesktopApp');
 if (desktopBtn) {
 desktopBtn.title = 'Open FWD Bharat MarketDesk workspace';
 }
 const popoutBtn = document.getElementById('btnPopOut');
 if (popoutBtn) {
 popoutBtn.title = 'Open FWD Bharat MarketDesk workspace';
 }

 document.getElementById('systemToastDismiss')?.addEventListener('click', () => {
 globalThis.hideSystemToast?.();
 });
 document.querySelectorAll('.tabs .tab, .workspace-groups .workspace-group').forEach(button => {
 button.addEventListener('keydown', event => {
 if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
 const selector = button.classList.contains('workspace-group') ? '.workspace-groups .workspace-group' : '.tabs .tab:not(.group-hidden)';
 const peers = Array.from(document.querySelectorAll(selector)).filter(el => !el.disabled);
 const currentIndex = peers.indexOf(button);
 if (currentIndex < 0 || !peers.length) return;
 event.preventDefault();
 let nextIndex = currentIndex;
 if (event.key === 'Home') nextIndex = 0;
 else if (event.key === 'End') nextIndex = peers.length - 1;
 else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + peers.length) % peers.length;
 else nextIndex = (currentIndex + 1) % peers.length;
 peers[nextIndex]?.focus();
 peers[nextIndex]?.click();
 });
 });
 const isBenignUiRuntimeMessage = message => /ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)/i.test(String(message || ''));
 window.addEventListener('error', event => {
 if (!event?.message) return;
 if (isBenignUiRuntimeMessage(event.message)) {
 event.preventDefault?.();
 return;
 }
 globalThis.reportUiError?.('Unexpected error', event.message, { timeoutMs: 7000 });
 });
 window.addEventListener('unhandledrejection', event => {
 const reason = event?.reason;
 const message = typeof reason === 'string' ? reason : (reason?.message || '');
 if (!message) return;
 if (isBenignUiRuntimeMessage(message)) {
 event.preventDefault?.();
 return;
 }
 globalThis.reportUiError?.('Request failed', message, { timeoutMs: 7000 });
 });
 v16NormalizeUiNode(document.body);
});
