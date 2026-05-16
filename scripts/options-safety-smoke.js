'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bg = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/07-options.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/08-options-workspace.js'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'src/renderer/scripts/shared/strategy-registry.js'), 'utf8');
const nativeScanner = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/13-native-straddle-scanner.js'), 'utf8');
const chart = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/07-chart-workspace.js'), 'utf8');

const checks = [
 {
  name: 'native straddle is registered as scanner-only',
  pass: registry.includes("id: 'native_straddle'")
  && registry.includes("scannerAction: 'native-straddle:startScan'")
  && registry.includes('canLiveTrade: false'),
 },
 {
  name: 'native scanner separates product cache from fresh advice',
  pass: nativeScanner.includes('CACHE_TTL_MS = 24 * 60 * 60 * 1000')
  && nativeScanner.includes('RESULT_CACHE_TTL_MS = 15 * 60 * 1000')
  && nativeScanner.includes('v17GetStraddleChain')
  && nativeScanner.includes('fetchNativePremiumRead')
  && nativeScanner.includes('nativeStraddleScannerCache'),
 },
 {
  name: 'native scanner is notify-only',
  pass: nativeScanner.includes('noAutoTrade: true')
  && nativeScanner.includes('advisoryOnly: true')
  && bg.includes('Native Straddle auto-entry is disabled'),
 },
 {
  name: 'options workspace is native-straddle-only',
  pass: ui.includes('Native Straddle-only')
  && ui.includes('Native Straddle')
  && ui.includes('Scan Native')
  && !ui.includes('renderBuilderMode')
  && !ui.includes('renderAnalyzerMode')
  && !ui.includes('renderSkewMode')
  && !ui.includes('FINAL OPTIONS ORDER PREVIEW')
  && !ui.includes('place-straddle-order'),
 },
 {
  name: 'generic options routes and skew endpoint are removed',
  pass: !bg.includes("msg?.action === 'v17:getOptionsChain'")
  && !bg.includes("msg?.action === 'v17:getOptionUniverse'")
  && !bg.includes("msg?.action === 'v17:analyzeOptionStrategy'")
  && !bg.includes("msg?.action === 'v17:placeOptionStrategyOrders'")
  && !bg.includes("msg?.action === 'v17:getVolatilitySkew'")
  && !bg.includes('v17GetVolatilitySkew')
  && !bg.includes('runOptionsAutoTradeEngine')
  && !bg.includes('v17FetchOptionTickers'),
 },
 {
  name: 'native straddle chart handoff defaults to 15m and avoids chart cache',
  pass: chart.includes("signal?.raw?.timeframe")
  && chart.includes("symbol.startsWith('MV-')")
  && chart.includes('!isNativeStraddleSymbol'),
 },
];

const failed = checks.filter(check => !check.pass);
checks.forEach(check => {
 console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
});

if (failed.length) {
 process.exitCode = 1;
}
