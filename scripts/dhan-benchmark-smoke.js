const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
 return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const scanText = read('src/renderer/scripts/background/02-scan.js');
const shellText = read('src/renderer/index.html') + read('src/renderer/scripts/popup/01-shell.js');
const ribbonStyleText = read('src/renderer/styles/16-index-ribbon.css');
const registryText = read('src/renderer/scripts/shared/strategy-registry.js');
const dhanRendererText = read('src/renderer/scripts/background/03-dhan-data.js');
const chartWorkspaceText = read('src/renderer/scripts/popup/07-chart-workspace.js');
const runtimeText = read('src/renderer/scripts/background/04-runtime.js');

assert(scanText.includes('Indices:'), 'scanner should log index tape state');
assert(scanText.includes("benchmarkSymbol: 'NIFTY'"), 'scanner should expose NIFTY as benchmark symbol');
assert(scanText.includes("method: 'FWD Index benchmark'"), 'scanner should identify the FWD Index benchmark method in user-facing data');
assert(scanText.includes('indexTape'), 'scanner should expose the live Dhan index tape');
assert(!scanText.includes('const benchmarks = calcInternalBenchmarkSuite'), 'scanner should not calculate CF/S&P/FWD benchmark stack');

assert(shellText.includes('FWD INDEX TAPE'), 'UI should show FWD index tape bar');
assert(shellText.includes('Nifty IT'), 'UI should show Nifty IT in the Dhan index tape');
assert(shellText.includes('d10-ribbon') && ribbonStyleText.includes('height: 42px'), 'index tape should use a compact terminal-style ribbon');
assert(ribbonStyleText.includes('body.desktop-mode .d10-ribbon .d10-benchmarks') && ribbonStyleText.includes('grid-column: 2;') && ribbonStyleText.includes('body.desktop-mode .d10-ribbon #d10chart'), 'compact ribbon should override the legacy desktop index-card grid placement');
assert(scanText.includes("'INDIA VIX'") && dhanRendererText.includes("'INDIA VIX'") && dhanRendererText.includes("securityId: '21'"), 'Dhan index tape should request India VIX as a native index quote');
assert(!shellText.includes('FWD-100 INDEX'), 'UI should not show FWD-100 index label');
assert(!shellText.includes('CF-style'), 'UI should not show CF-style benchmark');
assert(!shellText.includes('S&P-style'), 'UI should not show S&P-style benchmark');

assert(!registryText.includes('native_straddle'), 'strategy registry should not expose native straddle');
assert(!registryText.includes('new_coin_scalper'), 'strategy registry should not expose new coin scalper');
assert(!registryText.includes('Delta perpetuals'), 'strategy registry should not expose Delta market labels');

assert(dhanRendererText.includes('normalizeDhanScannerUniverse'), 'renderer products should normalize scanner universe IDs');
assert(dhanRendererText.includes("normalizeDhanScannerUniverse(options.universe || 'fno_stocks')"), 'renderer products should default to F&O stock universe');
assert(dhanRendererText.includes('DHAN_INDEX_TAPE_DEFINITIONS'), 'renderer quote map should define Dhan index tape symbols');
assert(dhanRendererText.includes("universe: 'indices'"), 'renderer quote map should fetch index instruments from Dhan');
assert(dhanRendererText.includes("broadUniverse ? 'ohlc' : 'quotes'"), 'renderer ticker map should use lighter OHLC breadth feed for broad scanners');
assert(dhanRendererText.includes('retrying OHLC breadth feed'), 'renderer ticker map should fall back from short quote responses to OHLC breadth');
assert(dhanRendererText.includes('pointChange:'), 'renderer quote map should preserve absolute point change');
assert(dhanRendererText.includes('quote?.net_change'), 'renderer quote map should read Dhan net_change for index points');
assert(dhanRendererText.includes("dhanNative('live_feed_subscribe'"), 'scanner quotes should subscribe index and active stock symbols to the live feed');
assert(chartWorkspaceText.includes("const RESOLUTIONS = Object.freeze(['4h', '1d', '1w']);"), 'chart workspace should expose only 4h/1d/1w chart timeframes');
assert(!chartWorkspaceText.includes('data-ds-chart-tf=\"5m\"'), 'chart UI should not expose 5m timeframe buttons');
assert(!chartWorkspaceText.includes('data-ds-chart-tf=\"1h\"'), 'chart UI should not expose 1h timeframe buttons');
assert(chartWorkspaceText.includes("executionTimeframe: normalizeTimeframe(raw.executionTimeframe || raw.timeframe || base.executionTimeframe || '4h')"), 'chart execution timeframe fallback should be 4h');
assert(!chartWorkspaceText.includes("{ symbol: FWD_INDEX_SYMBOL, name: 'Nifty 50 Equal-Weight Index'"), 'plain NIFTY must not resolve to the legacy equal-weight synthetic chart');

const sandbox = {
 console,
 globalThis: {},
 performance: { now: () => 0 },
 Date,
 Math,
 Number,
 String,
 Object,
 Array,
 Set,
 Map,
 JSON,
 RegExp,
 Promise,
 setTimeout,
 clearTimeout,
 chrome: { storage: { local: { set: async () => {}, get: () => {} } } },
 dlog: () => {},
};
sandbox.globalThis = sandbox;
sandbox.FWDTradeDeskShared = {
 sanitizeMarketIndexSettings: value => value || {},
 getRegimeThresholds: () => ({ regime: 'UNKNOWN', alertScore: 65, setupScore: 45, watchScore: 25, minScore: 15 }),
 detectVolatilityRegime: () => 'UNKNOWN',
};
vm.createContext(sandbox);
vm.runInContext(read('src/renderer/scripts/background/02-scan.js'), sandbox);

const result = sandbox.calcMarketIndex({
 NIFTY: { price: 22500, change24h: 0.75, pointChange: 167.49, usdVol24h: 0 },
 BANKNIFTY: { price: 48500, change24h: 0.2, pointChange: 96.81, usdVol24h: 0 },
 NIFTYIT: { price: 36000, change24h: -0.35, pointChange: -126.44, usdVol24h: 0 },
 'INDIA VIX': { price: 16.13, change24h: -3.41, pointChange: -0.57, usdVol24h: 0 },
 RELIANCE: { price: 2800, change24h: 1.2, usdVol24h: 10000000, oi: 0 },
 HDFCBANK: { price: 1500, change24h: -0.4, usdVol24h: 9000000, oi: 0 },
});

assert(result, 'Nifty benchmark result should be created');
assert.strictEqual(result.benchmarkSymbol, 'NIFTY');
assert.strictEqual(result.benchmarkLabel, 'Nifty 50');
assert.strictEqual(result.composite, 22500);
assert.strictEqual(result.indexChangePct, 0.75);
assert(result.indexTape.some(item => item.symbol === 'BANKNIFTY' && item.label === 'Bank Nifty'), 'index tape should include Bank Nifty');
assert(result.indexTape.some(item => item.symbol === 'NIFTYIT' && item.label === 'Nifty IT'), 'index tape should include Nifty IT');
assert(result.indexTape.some(item => item.symbol === 'INDIA VIX' && item.label === 'India VIX'), 'index tape should include India VIX');
assert(result.indexTape.some(item => item.symbol === 'BANKNIFTY' && item.pointChange === 96.81), 'index tape should preserve Bank Nifty point move');
assert(result.indexTape.some(item => item.symbol === 'NIFTYIT' && item.pointChange === -126.44), 'index tape should preserve Nifty IT point move');
assert.strictEqual(result.topCoins.length, 2);
assert.strictEqual(sandbox.resolveScanLimitForUniverse('all_nse', 150), 900, 'All NSE should use a bounded ranked shortlist by default');
assert.strictEqual(sandbox.resolveScanLimitForUniverse('nse_af', 0), 650, 'NSE chunks should default to a fast rotating scan size');
assert.strictEqual(sandbox.resolveScanLimitForUniverse('nse_rest', 0), 650, 'NSE Rest should use the chunk-style overlap-safe scan size');
assert.strictEqual(sandbox.resolveScanLimitForUniverse('bse_only', 0), 650, 'BSE Only should use the chunk-style scan size');
assert.strictEqual(sandbox.resolveDeepScanLimitForStrategy({ scanUniverse: 'all_nse', scanMode: 'penny_awakening' }, 900), 900, 'Full equity scans should deep scan only the ranked shortlist');
assert.strictEqual(sandbox.resolveDeepScanLimitForStrategy({ scanUniverse: 'nse_af' }, 900), 650, 'Chunk scans should cap deep candle work for speed');
assert(scanText.includes("strat.scanMode = 'standard';"), 'Full equity scans should force standard mode during full scan');
assert(scanText.includes('scannedCoins: completedBefore') && scanText.includes('completed ${completedBefore}/${deepTotal}'), 'Scanner progress should report completed candle work instead of queued candidates');
assert(runtimeText.includes('FULL_EQUITY_SCAN_HARD_DEADLINE_MS') && runtimeText.includes("['all_nse', 'all_bse'].includes(universe)"), 'Full equity scans should have a dedicated hard deadline');
assert(runtimeText.includes('globalThis.scanAbortRequested = true;'), 'A hard deadline should request cancellation of the underlying scan loop');

console.log('OK Dhan/Nifty benchmark smoke passed');
