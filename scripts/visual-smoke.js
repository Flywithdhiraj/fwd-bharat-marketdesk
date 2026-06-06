'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = relativePath => fs.existsSync(path.join(root, relativePath));

function assert(condition, message) {
 if (!condition) {
  throw new Error(message);
 }
}

function refsFromHtml(html, attr) {
 const pattern = new RegExp(`${attr}="([^"]+)"`, 'g');
 return Array.from(html.matchAll(pattern)).map(match => match[1]).filter(value => !value.startsWith('http'));
}

function assertReferencedAssetsExist() {
 const html = read('src/renderer/index.html');
 const scripts = refsFromHtml(html, 'src').filter(value => value.endsWith('.js'));
 const links = refsFromHtml(html, 'href').filter(value => value.endsWith('.css') || value.endsWith('.ico') || value.endsWith('.png'));
 scripts.forEach(script => assert(exists(`src/renderer/${script}`), `Missing script referenced by index.html: ${script}`));
 links.forEach(link => assert(exists(`src/renderer/${link}`), `Missing asset referenced by index.html: ${link}`));
}

function assertUniqueShellIds() {
 const html = read('src/renderer/index.html');
 const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g)).map(match => match[1]);
 const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
 assert(!duplicates.length, `Duplicate shell id(s): ${Array.from(new Set(duplicates)).join(', ')}`);
}

function assertCriticalSurfaces() {
 const html = read('src/renderer/index.html');
 const panes = read('src/renderer/scripts/popup/06-pane-templates.js');
 const chartWorkspace = read('src/renderer/scripts/popup/07-chart-workspace.js');
 const commandCore = read('src/renderer/scripts/popup/00-core.js');
 const scannerAnalytics = read('src/renderer/scripts/popup/02-scanner-analytics.js');
 const popupBoot = read('src/renderer/popup.js');
 const mainWindows = read('src/main/windows.js');
 const shell = read('src/renderer/scripts/popup/01-shell.js');
 const styles = read('src/renderer/styles.css');
 const appLock = read('src/renderer/styles/07-app-lock.css');
 const appLockJs = read('src/renderer/app-lock.js');
 const hardening = read('src/renderer/styles/09-design-system-hardening.css');
 const finalTheme = read('src/renderer/styles/10-vivid-trader-theme.css');
 const bharatTheme = read('src/renderer/styles/11-bharat-marketdesk-theme.css');

 [
  'pane-chart',
  'pane-strategies',
  'pane-debug',
  'commandPaletteOverlay',
  'appLockOverlay',
 ].forEach(id => assert(html.includes(`id="${id}"`), `Missing critical shell id: ${id}`));

 assert(html.includes('scripts/shared/ui-events.js'), 'Shared UI event helper is not loaded before feature modules.');
 assert(panes.includes('btnExportReleaseDiagnostics'), 'Debug pane diagnostics export action is missing.');
 assert(panes.includes('debugCandleHealth') && panes.includes('debugCandleHits') && panes.includes('debugCandleEntries'), 'Debug pane candle-store diagnostics are missing.');
 assert(styles.includes("styles/09-design-system-hardening.css"), 'Design-system hardening stylesheet is not imported.');
 assert(html.includes('pane-options') && html.includes('data-tab="options"'), 'Dhan Options Hub shell is missing.');
 assert(popupBoot.includes('optionsHub') && popupBoot.includes('ensureOptionsHubLoaded'), 'Options Hub lazy loader is missing.');
 assert(commandCore.includes("if (tab === 'options') globalThis.renderOptionsHub?.(preloaded);"), 'Options Hub render route is missing.');
 assert(html.includes('pane-carry') && html.includes('data-tab="carry"'), 'F&O Carry shell is missing.');
 assert(popupBoot.includes('fnoCarry') && popupBoot.includes('ensureFnoCarryLoaded'), 'F&O Carry lazy loader is missing.');
 assert(commandCore.includes("if (tab === 'carry') globalThis.renderFnoCarry?.(preloaded);"), 'F&O Carry render route is missing.');
 assert(html.includes('pane-commodities') && html.includes('data-tab="commodities"'), 'Commodities shell is missing.');
 assert(popupBoot.includes('commodities') && popupBoot.includes('ensureCommoditiesLoaded'), 'Commodities lazy loader is missing.');
 assert(commandCore.includes("if (tab === 'commodities') globalThis.renderCommodities?.(preloaded);"), 'Commodities render route is missing.');
 assert(hardening.includes('.diagnostics-export-card'), 'Diagnostics export CSS is missing.');
 assert(hardening.includes('.debug-cache-card') && hardening.includes('.debug-cache-grid'), 'Candle-store diagnostics CSS is missing.');
 assert(html.includes('FWD Bharat MarketDesk') && html.includes('Unlock Desk'), 'Bharat MarketDesk unlock copy is missing.');
 assert(html.includes('appLockProductRail') && html.includes('appLockMarketIntelligence') && html.includes('appLockSettings'), 'Homepage sections must map to current Dhan scanner and settings content.');
 assert(!html.includes('appLockFastPassword'), 'Login screen should ask for the password in one place only.');
 assert(html.includes('Wizard Scanner') && html.includes('Scanner Defaults') && html.includes('Data Health'), 'Product homepage sections are missing.');
 assert(appLockJs.includes("login: ['Unlock Desk'"), 'Runtime app-lock copy should not restore the old login screen.');
 assert(!appLockJs.includes('autoLockMinutes') && !appLockJs.includes('scheduleAutoLock') && !appLockJs.includes('auth_update_auto_lock'), 'Inactivity auto-lock code must stay removed.');
 assert(!html.includes('appLockSetupAutoLock') && !html.includes('appLockAutoLockMinutes') && !html.includes('appLockSaveAutoLock'), 'Inactivity auto-lock controls must stay removed.');
 assert(appLock.includes('.app-lock-product-rail'), 'Homepage product rail CSS is missing.');
 assert(appLock.includes('@keyframes appLockFloat') && appLock.includes('@keyframes appLockBars'), 'Homepage animation CSS is missing.');
 assert(chartWorkspace.includes('data-ds-chart-trading-close') && chartWorkspace.includes('chartTradingToolsOpen'), 'Trading Mode must have an explicit restore/hide path.');
 assert(chartWorkspace.includes('const MAX_4H_HISTORY_CANDLES = 3000;'), '4H chart history limit must be defined before chart coverage is calculated.');
 assert(chartWorkspace.includes("const isCompareLayout = state.deskLayoutMode !== 'single'") && chartWorkspace.includes('void setNativeChartFullscreen(nextFullscreen)'), '1D + 4H fullscreen must keep comparison layout and avoid blocking on native fullscreen.');
 assert(chartWorkspace.includes("presets: ['clean', 'decision', 'ema_obv']") && chartWorkspace.includes("label: 'EMA + OBV'"), 'Chart preset menu must include Clean and use the short EMA + OBV label.');
 assert(!chartWorkspace.includes("['recent', defaultVisibleCount(tf), 'Recent']") && chartWorkspace.includes('data-ds-chart-range="${escapeHtml(key)}"') && chartWorkspace.includes('Chart Range'), 'Chart range controls must move out of the main toolbar into Settings without a Recent button.');
 assert(!chartWorkspace.includes('DETACHED TRADING DESK') && !chartWorkspace.includes('Primary chart, execution chart, and tabbed context.') && !chartWorkspace.includes('event candle hidden'), 'Detached chart header must stay compact for chart space.');
 assert(commandCore.includes('command-next-card') && commandCore.includes('Decision-first cockpit'), 'Command Center must lead with the decision-first next-action card.');
 assert(commandCore.includes('Getting started state') && commandCore.includes('data-scan-now="1"'), 'Command Center must include a composed first-scan empty state.');
 assert(shell.includes('scheduleWorkspaceTabRender') && shell.includes('requestAnimationFrame') && commandCore.includes('renderActiveWorkspaceTab(tab, preloaded = null)'), 'Workspace renders must be coalesced through the rAF scheduler.');
 assert(commandCore.includes('return !!data.scanActive && !failedStatus && !completedStatus;'), 'Scanner UI should trust background-owned active state during long data waits.');
 assert(panes.includes('data-preset="breakout"') && panes.includes('data-preset="ema_obv"') && panes.includes('data-preset="sector_leaders"'), 'Scanner saved screen presets must include breakout, EMA + OBV, and sector leaders.');
 assert(panes.includes('data-scan-universe="nse_rest"') && panes.includes('data-scan-universe="bse_only"'), 'Scanner universe cards must expose overlap-safe NSE Rest and BSE Only coverage.');
 assert(scannerAnalytics.includes('Candle Cache') && scannerAnalytics.includes('Incremental') && scannerAnalytics.includes('incrementalRequests'), 'Scanner status strip must expose candle cache and incremental fetch stats.');
 assert(!shell.includes('lastScanRecoveryAt'), 'Popup shell must not overwrite background scan state from a heartbeat heuristic.');
 assert(shell.includes('const breadthPct = Number(mi.sentiment?.breadthPct ?? 0);'), 'Index detail modal must define its breadth value before rendering.');
 assert(finalTheme.includes('Final command-desk polish') && finalTheme.includes("--font-ui: 'Aptos'") && finalTheme.includes('.command-next-card'), 'Final theme polish must define calm tokens, typography, and decision-card styling.');
 assert(styles.includes("styles/11-bharat-marketdesk-theme.css") && bharatTheme.includes('FWD Bharat MarketDesk') && bharatTheme.includes('.india-module-card'), 'Bharat MarketDesk theme and module styling must be loaded.');
 assert(popupBoot.includes('installRendererBootRecovery') && popupBoot.includes('FWDRecoverBlankChartMode') && popupBoot.includes('Chart startup recovered'), 'Renderer must recover from blank chart-mode startup instead of leaving a dark window.');
 assert(popupBoot.includes('isDetachedChartStartup') && popupBoot.includes('reloadToNormalWorkspace') && popupBoot.includes("querySelector('.live-order-chart-card, .ds-lwc-chart, canvas')"), 'Renderer recovery must be scoped to detached chart startup and require real chart content.');
 assert(!popupBoot.includes('setTimeout(() => {\\n   recoverBlankChartMode'), 'Detached chart recovery must not use a fixed startup timer that can interrupt slow chart renders.');
 assert(chartWorkspace.includes('__fwdDetachedChartRenderComplete = true'), 'Detached chart startup must mark successful chart render completion.');
 assert(!popupBoot.includes("document.body?.classList.remove('chart-mode'"), 'Renderer recovery must not tear down a valid chart session for generic errors.');
 assert(mainWindows.includes('scheduleRendererReload') && mainWindows.includes('reloadIgnoringCache') && mainWindows.includes('renderer:reload-scheduled') && mainWindows.includes("win.webContents.on('did-finish-load'") && mainWindows.includes('rendererReloads = 0;'), 'Main process must reload after renderer load/process failure and reset the retry budget inside the owning scope.');
}

function assertRendererPartsExist() {
 const partGroups = [
  'src/renderer/scripts/popup/parts/v16-capabilities',
  'src/renderer/scripts/popup/parts/chart-workspace',
 ];
 partGroups.forEach(group => {
  const absolute = path.join(root, group);
  assert(fs.existsSync(absolute), `Missing renderer part group: ${group}`);
  const parts = fs.readdirSync(absolute).filter(name => name.endsWith('.jsfrag'));
  assert(parts.length >= 5, `Renderer part group has too few parts: ${group}`);
 });
}

function assertNoBrokenImports() {
 const styles = read('src/renderer/styles.css');
 const cssImports = Array.from(styles.matchAll(/@import url\('([^']+)'\);/g)).map(match => match[1]);
 cssImports.forEach(cssPath => assert(exists(`src/renderer/${cssPath}`), `Missing CSS import: ${cssPath}`));
}

function main() {
 assertReferencedAssetsExist();
 assertNoBrokenImports();
 assertUniqueShellIds();
 assertCriticalSurfaces();
 assertRendererPartsExist();
 console.log('Visual smoke checks passed.');
}

main();
