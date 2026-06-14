const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const chartModel = read('src/renderer/scripts/popup/parts/chart-workspace/02-model-and-order-context.jsfrag');
const chartEvents = read('src/renderer/scripts/popup/parts/chart-workspace/04-surface-events.jsfrag');
const candlePipeline = read('src/renderer/scripts/background/01-analysis.js');
const dhanBridge = read('src/renderer/scripts/background/03-dhan-data.js');
const publicCandles = read('src/renderer/scripts/background/05-v16-capabilities.js');
const scanner = read('src/renderer/scripts/background/02-scan.js');

assert(chartModel.includes('localOnly: options.forceData !== true'));
assert(chartModel.includes('forceRefresh: options.forceData === true'));
assert(chartEvents.includes('forceData: refreshChanged'));
assert(chartEvents.includes('{ refreshNonce: Date.now() }'));
assert(publicCandles.includes('const localOnly = payload.localOnly === true'));
assert(publicCandles.includes('const forceRefresh = payload.forceRefresh === true'));
assert(publicCandles.includes('return readLocalCandles(targetResolution, targetLimit)'));
assert(publicCandles.includes('Run a scan or click Refresh to download them.'));
assert(publicCandles.includes('sourceUpdatedAt'));
assert(candlePipeline.includes('const forceRefresh = options?.force === true'));
assert(candlePipeline.includes('force: forceRefresh'));
assert(dhanBridge.includes('force: options.force === true'));
assert(chartEvents.includes('const hasRenderedBefore = surfaceRef.refreshNonce !== null'));
assert(chartEvents.includes('hasRenderedBefore && previousRefreshNonce !== Number(state.refreshNonce || 0)'));
assert(scanner.includes('const SCAN_CANDLE_FETCH_OPTIONS = Object.freeze({'));
assert(scanner.includes('force: true'));

console.log('Chart local-first smoke checks passed.');
