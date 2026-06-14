const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const chartHtml = read('src/renderer/chart.html');
const mainWindows = read('src/main/windows.js');
const chartSource = read('src/renderer/scripts/popup/parts/chart-workspace/05-public-api.jsfrag');
const chartStateSource = read('src/renderer/scripts/popup/parts/chart-workspace/01-state-and-fetch.jsfrag');
const chartModelSource = read('src/renderer/scripts/popup/parts/chart-workspace/02-model-and-order-context.jsfrag');
const chartEventsSource = read('src/renderer/scripts/popup/parts/chart-workspace/04-surface-events.jsfrag');
const popupBoot = read('src/renderer/popup.js');
const commodityUi = read('src/renderer/scripts/popup/11-commodities.js');
const dhanDataService = read('src/main/dhan-data-service.js');
const appLock = read('src/renderer/app-lock.js');
const indexHtml = read('src/renderer/index.html');
const strategyLab = read('src/renderer/scripts/popup/09-strategy-lab.js');

[
 'scripts/popup/01-shell.js',
 'scripts/popup/02-scanner-analytics.js',
 'scripts/popup/04-research-risk.js',
 'scripts/popup/05-settings-webhooks-helpers.js',
 'scripts/popup/06-pane-templates.js',
 'app-lock.js',
].forEach(token => {
 if (chartHtml.includes(token)) throw new Error(`Detached chart fast entry loads unrelated module: ${token}`);
});

if (!mainWindows.includes("chartMode ? '../renderer/chart.html' : '../renderer/index.html'")) {
 throw new Error('Desktop chart windows do not use the dedicated fast entry point.');
}
if (!mainWindows.includes('if (chartMode)') || !mainWindows.includes('win.show();')) {
 throw new Error('Desktop chart window is not shown immediately.');
}
if (!chartHtml.includes('chartFastLoader') || !chartSource.includes("document.getElementById('chartFastLoader')?.remove()")) {
 throw new Error('Detached chart loading surface lifecycle is incomplete.');
}
if (!chartHtml.includes('chart-bootstrap.js') || !popupBoot.includes('FWDChartAuthReady')) {
 throw new Error('Detached chart does not inherit the authenticated desktop runtime.');
}
if (!chartHtml.includes('chart-entry.js') || !popupBoot.includes('FWDDetachedChartStartup')) {
 throw new Error('Detached chart startup still depends only on DOMContentLoaded timing.');
}
[
 'vendor/lightweight-charts.standalone.production.js',
 'scripts/shared/chart-indicators.js',
 'scripts/popup/chart-engine.js',
 'scripts/popup/07-chart-workspace.js',
].forEach(token => {
 if (!chartHtml.includes(token)) throw new Error(`Detached chart is missing required direct startup module: ${token}`);
});
if ((popupBoot.match(/if \(existing\) \{\n queueMicrotask\(finish\);\n \}/g) || []).length < 2) {
 throw new Error('Existing detached-chart resources can still wait for the lazy-load timeout.');
}
const chartBranchStart = popupBoot.indexOf("if (params.get('chart') === '1')");
const chartBranch = popupBoot.slice(chartBranchStart, popupBoot.indexOf('migrateStrategy();', chartBranchStart));
if (chartBranch.includes('migrateStrategy()')) {
 throw new Error('Detached chart startup still depends on full-workspace migration code.');
}
if (!chartStateSource.includes('chartPersistentCacheLoaded')) {
 throw new Error('Detached chart cache state does not preserve data across windows.');
}
if (!chartModelSource.includes('localGet([DS_V17_CHART_CACHE_KEY])')) {
 throw new Error('Detached chart does not load the shared persistent candle cache.');
}
if (!chartModelSource.includes('localSet({ [DS_V17_CHART_CACHE_KEY]: chartRuntimeCache })')) {
 throw new Error('Chart candle cache is not persisted for fast detach handoff.');
}
if (!chartEventsSource.includes('!dataset?.commoditySpread')) {
 throw new Error('Commodity spread charts still trigger expensive benchmark correlation loading.');
}
if (!dhanDataService.includes("resolution === '4h'") || !dhanDataService.includes('aggregateCandleRows(entry.intraday, 4 * 60 * 60)')) {
 throw new Error('Commodity spread 4H charts are not aggregated from the cached hourly series.');
}
if (!commodityUi.includes('const commoditySpread = {') || commodityUi.includes('commoditySpread: { ...row')) {
 throw new Error('Commodity spread chart handoff still persists the entire scanner row.');
}
if (!chartEventsSource.includes('Chart could not open')) {
 throw new Error('Detached chart render failures are still hidden behind a blank window.');
}
if (!chartEventsSource.includes('surfaceRef.root !== renderRoot')) {
 throw new Error('Async chart renders can still access a surface after its DOM root was replaced.');
}
if (!popupBoot.includes('compareWithIndex: options.compareWithIndex === true')) {
 throw new Error('Quick chart handoffs still inherit expensive index comparison by default.');
}
if (!indexHtml.includes('<body class="app-auth-pending">') || !appLock.includes("classList.remove('app-auth-pending')")) {
 throw new Error('Protected workspace can still flash before authentication status resolves.');
}
if (!strategyLab.includes('if (!root?.querySelectorAll) return;')) {
 throw new Error('Strategy Lab can still bind against a missing lazy-loaded pane.');
}

console.log('Detached chart startup smoke passed.');
