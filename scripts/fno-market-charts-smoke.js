'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
 return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const stateText = read('src/renderer/scripts/popup/parts/chart-workspace/01-state-and-fetch.jsfrag');
const modelText = read('src/renderer/scripts/popup/parts/chart-workspace/02-model-and-order-context.jsfrag');
const shellText = read('src/renderer/scripts/popup/01-shell.js');
const scanText = read('src/renderer/scripts/background/02-scan.js');
const carryText = read('src/renderer/scripts/popup/10-fno-carry.js');
const engineText = read('src/renderer/scripts/popup/chart-engine.js');

assert(stateText.includes("const FWD_INDEX_FUNDING_SYMBOL = 'FNO-CARRY';"), 'carry chart symbol should use F&O terminology');
assert(stateText.includes("const FWD_INDEX_BREADTH_SYMBOL = 'FNO-BREADTH';"), 'breadth chart symbol should use F&O terminology');
assert(stateText.includes("const FWD_INDEX_AD_SYMBOL = 'FNO-AD';"), 'advance/decline chart symbol should use F&O terminology');
assert(stateText.includes('F&O Carry - Implied Basis'), 'carry symbol picker should explain the metric');
assert(stateText.includes('F&O Stock Breadth %'), 'breadth symbol picker should state the source universe');

assert(carryText.includes("const METRIC_HISTORY_KEY = 'fnoCarryMetricHistoryV1';"), 'carry workspace should keep aggregate chart history');
assert(carryText.includes('snapshotCarryMetricHistory'), 'carry refresh should snapshot aggregate basis data');
assert(carryText.includes("carrySource: executable.length ? 'executable_depth' : 'indicative_quote'"), 'carry history should preserve provenance');

assert(modelText.includes("key: 'carryAnnualPct'"), 'carry metric should not depend on crypto funding data');
assert(modelText.includes('allowNegative: true'), 'carry metric should render futures discounts below zero');
assert(modelText.includes('data.fnoCarryMetricHistoryV1 || []'), 'carry chart should read stored carry snapshots');
assert(modelText.includes('This is not a funding rate.'), 'carry guide should explicitly reject funding-rate terminology');
assert(modelText.includes('marketIndex.fnoConstituents'), 'breadth metric should use the Dhan-native F&O constituent field');
assert(modelText.includes('scanned F&O stock constituents'), 'breadth guide should name the real universe');
assert(engineText.includes("const isCarryMetric = payload.dataset?.syntheticMetric === 'carryAnnualPct';"), 'chart engine should recognize implied carry metrics');
assert(engineText.includes("type: 'custom', formatter: value => `${Number(value || 0).toFixed(2)}%`"), 'carry metric axis should format values as percentages');

assert(scanText.includes('fnoConstituents: breadthConstituents'), 'scanner should publish the F&O constituent contract');
assert(shellText.includes('data-d10-synthetic-chart="FNO-CARRY"'), 'detail panel should open the carry chart');
assert(shellText.includes('data-d10-synthetic-chart="FNO-BREADTH"'), 'detail panel should open the breadth chart');
assert(shellText.includes('data-d10-synthetic-chart="FNO-AD"'), 'detail panel should open the advance/decline chart');
assert(!shellText.includes('Funding crowding:'), 'visible Dhan UI should not claim a crypto funding metric');

console.log('F&O market chart smoke checks passed.');
