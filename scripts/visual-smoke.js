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
 const options = read('src/renderer/scripts/popup/08-options-workspace.js');
 const panes = read('src/renderer/scripts/popup/06-pane-templates.js');
 const chartWorkspace = read('src/renderer/scripts/popup/07-chart-workspace.js');
 const commandCore = read('src/renderer/scripts/popup/00-core.js');
 const shell = read('src/renderer/scripts/popup/01-shell.js');
 const styles = read('src/renderer/styles.css');
 const appLock = read('src/renderer/styles/07-app-lock.css');
 const appLockJs = read('src/renderer/app-lock.js');
 const hardening = read('src/renderer/styles/09-design-system-hardening.css');
 const finalTheme = read('src/renderer/styles/10-vivid-trader-theme.css');

 [
  'pane-options',
  'pane-chart',
  'pane-strategies',
  'pane-debug',
  'commandPaletteOverlay',
  'appLockOverlay',
 ].forEach(id => assert(html.includes(`id="${id}"`), `Missing critical shell id: ${id}`));

 assert(html.includes('scripts/shared/ui-events.js'), 'Shared UI event helper is not loaded before feature modules.');
 assert(options.includes('renderStraddleModeV3'), 'Native Straddle workspace render function is missing.');
 assert(options.includes('od-native-only'), 'Native Straddle-only options markup is missing.');
 assert(options.includes('data-options-action="run-native-straddle-scan"'), 'Native Straddle scan action is missing.');
 assert(panes.includes('btnExportReleaseDiagnostics'), 'Debug pane diagnostics export action is missing.');
 assert(styles.includes("styles/09-design-system-hardening.css"), 'Design-system hardening stylesheet is not imported.');
 assert(styles.includes("styles/06-options-workspace.css"), 'Options workspace stylesheet is not imported.');
 assert(hardening.includes('.diagnostics-export-card'), 'Diagnostics export CSS is missing.');
 assert(html.includes('FWD TradeDesk Pro') && html.includes('Unlock Futures'), 'Premium futures unlock copy is missing.');
 assert(html.includes('appLockProductRail') && html.includes('appLockMarketIntelligence') && html.includes('appLockRiskControls') && html.includes('appLockReports'), 'Homepage nav sections must map to distinct content.');
 assert(!html.includes('appLockFastPassword'), 'Login screen should ask for the password in one place only.');
 assert(html.includes('Wizard Scanner') && html.includes('Live Orders Gate') && html.includes('Trade Journal'), 'Dhan-style product homepage sections are missing.');
 assert(appLockJs.includes("login: ['Unlock Futures'"), 'Runtime app-lock copy should not restore the old login screen.');
 assert(!appLockJs.includes('autoLockMinutes') && !appLockJs.includes('scheduleAutoLock') && !appLockJs.includes('auth_update_auto_lock'), 'Inactivity auto-lock code must stay removed.');
 assert(!html.includes('appLockSetupAutoLock') && !html.includes('appLockAutoLockMinutes') && !html.includes('appLockSaveAutoLock'), 'Inactivity auto-lock controls must stay removed.');
 assert(appLock.includes('.app-lock-product-rail'), 'Homepage product rail CSS is missing.');
 assert(appLock.includes('@keyframes appLockFloat') && appLock.includes('@keyframes appLockBars'), 'Homepage animation CSS is missing.');
 assert(chartWorkspace.includes('data-ds-chart-trading-close') && chartWorkspace.includes('chartTradingToolsOpen'), 'Trading Mode must have an explicit restore/hide path.');
 assert(chartWorkspace.includes("const isCompareLayout = state.deskLayoutMode !== 'single'") && chartWorkspace.includes('void setNativeChartFullscreen(nextFullscreen)'), '1D + 15m fullscreen must keep comparison layout and avoid blocking on native fullscreen.');
 assert(chartWorkspace.includes("presets: ['clean', 'decision', 'ema_obv']") && chartWorkspace.includes("label: 'EMA + OBV'"), 'Chart preset menu must include Clean and use the short EMA + OBV label.');
 assert(!chartWorkspace.includes("['recent', defaultVisibleCount(tf), 'Recent']") && chartWorkspace.includes('data-ds-chart-range="${escapeHtml(key)}"') && chartWorkspace.includes('Chart Range'), 'Chart range controls must move out of the main toolbar into Settings without a Recent button.');
 assert(!chartWorkspace.includes('DETACHED TRADING DESK') && !chartWorkspace.includes('Primary chart, execution chart, and tabbed context.') && !chartWorkspace.includes('event candle hidden'), 'Detached chart header must stay compact for chart space.');
 assert(commandCore.includes('command-next-card') && commandCore.includes('Decision-first cockpit'), 'Command Center must lead with the decision-first next-action card.');
 assert(commandCore.includes('Getting started state') && commandCore.includes('data-scan-now="1"'), 'Command Center must include a composed first-scan empty state.');
 assert(shell.includes('scheduleWorkspaceTabRender') && shell.includes('requestAnimationFrame') && commandCore.includes('renderActiveWorkspaceTab(tab, preloaded = null)'), 'Workspace renders must be coalesced through the rAF scheduler.');
 assert(options.includes('Options decision desk') && options.includes('renderNativeFlowGuide') && options.includes('od-native-desk-grid'), 'Options workspace must keep the professional Native Straddle desk flow.');
 assert(options.includes('od-finished-state loading') && options.includes('Connection failed'), 'Options workspace must include explicit loading and error states.');
 assert(finalTheme.includes('Final command-desk polish') && finalTheme.includes("--font-ui: 'Aptos'") && finalTheme.includes('.command-next-card'), 'Final theme polish must define calm tokens, typography, and decision-card styling.');
}

function assertRendererPartsExist() {
 const partGroups = [
  'src/renderer/scripts/popup/parts/v16-capabilities',
  'src/renderer/scripts/popup/parts/chart-workspace',
  'src/renderer/scripts/popup/parts/options-workspace',
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
