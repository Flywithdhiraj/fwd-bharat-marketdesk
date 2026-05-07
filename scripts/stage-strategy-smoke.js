'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {
 console,
 Date,
 Math,
 Number,
 String,
 Array,
 Object,
 Map,
 Set,
 Promise,
 globalThis: null,
 chrome: {
 runtime: {
 onMessage: { addListener() {} },
 },
 storage: {
 local: {
 get() {},
 set() {},
 },
 },
 },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function runScript(relPath) {
 const file = path.join(root, relPath);
 const code = fs.readFileSync(file, 'utf8');
 vm.runInContext(code, sandbox, { filename: relPath });
}

function assert(name, condition) {
 if (!condition) {
 console.error(`FAIL ${name}`);
 process.exitCode = 1;
 return;
 }
 console.log(`PASS ${name}`);
}

runScript('src/renderer/scripts/shared/strategy-registry.js');
runScript('src/renderer/scripts/background/09-stage-scanner.js');

const stage = sandbox.FWDTradeDeskStageScanner;
const strategies = sandbox.FWDTradeDeskStrategies;

function makeWeeklyFromCloses(closes, options = {}) {
 const volume = Number(options.volume || 100000);
 const weekly = [];
 for (let i = 0; i < closes.length; i += 1) {
 const close = Number(closes[i]);
 const prior = Number(closes[Math.max(0, i - 1)] || close);
 const open = Number(options.openAtPrior === false ? close * 0.99 : prior);
 const range = Number(options.range || 0.035);
 const extraHigh = Array.isArray(options.extraHighs) ? Number(options.extraHighs[i] || 0) : 0;
 const extraLow = Array.isArray(options.extraLows) ? Number(options.extraLows[i] || 0) : 0;
 const volMult = Array.isArray(options.volumeMultipliers) ? Number(options.volumeMultipliers[i] || 1) : 1;
 weekly.push({
 time: 1700000000 + i * 604800,
 open,
 high: Math.max(open, close) * (1 + range) + extraHigh,
 low: Math.max(0.01, Math.min(open, close) * (1 - range) - extraLow),
 close,
 volume: volume * volMult,
 quoteVolume: close * volume * volMult,
 dayCount: 5,
 });
 }
 return weekly;
}

function linear(start, end, count) {
 const out = [];
 for (let i = 0; i < count; i += 1) {
 const t = count <= 1 ? 1 : i / (count - 1);
 out.push(start + (end - start) * t);
 }
 return out;
}

function wave(base, count, amp = 2) {
 const out = [];
 for (let i = 0; i < count; i += 1) out.push(base + Math.sin(i * 1.7) * amp);
 return out;
}

const stageICloses = [
 ...linear(130, 82, 28),
 ...wave(84, 36, 2.2),
];
const stageIVolume = stageICloses.map((_, i) => i > 42 ? 0.45 : i > 28 ? 0.7 : 1);
const stageIResult = stage.stageClassify(makeWeeklyFromCloses(stageICloses, { volumeMultipliers: stageIVolume }));

const stageIICloses = [
 ...wave(45, 20, 1.4),
 ...linear(47, 95, 28),
 ...linear(96, 142, 17),
];
const stageIIVolume = stageIICloses.map((_, i) => i === stageIICloses.length - 1 ? 4.2 : 1);
const stageIIResult = stage.stageClassify(makeWeeklyFromCloses(stageIICloses, { volumeMultipliers: stageIIVolume }));

const stageIIICloses = [
 ...linear(35, 118, 34),
 ...wave(116, 32, 7),
];
const stageIIIVolume = stageIIICloses.map((_, i) => i > 48 ? 1.65 : i > 34 ? 1.15 : 0.8);
const stageIIIResult = stage.stageClassify(makeWeeklyFromCloses(stageIIICloses, { range: 0.055, volumeMultipliers: stageIIIVolume }));

const stageIVCloses = [
 ...linear(70, 128, 30),
 ...wave(121, 14, 5),
 ...linear(112, 58, 22),
];
const stageIVResult = stage.stageClassify(makeWeeklyFromCloses(stageIVCloses, { range: 0.045 }));
const reviewResult = stage.stageClassify(makeWeeklyFromCloses(linear(20, 22, 12)));
const sortedStages = stage.stageSortRows([
 { symbol: 'D', stage: 'STAGE_IV', confidence: 90 },
 { symbol: 'R', stage: 'REVIEW', confidence: 0 },
 { symbol: 'B', stage: 'STAGE_II', confidence: 70 },
 { symbol: 'A', stage: 'STAGE_I', confidence: 80 },
 { symbol: 'C', stage: 'STAGE_III', confidence: 85 },
]).map(row => row.stage).join(',');
const counts = stage.stageCounts([stageIResult, stageIIResult, stageIIIResult, stageIVResult, reviewResult]);

const stageText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/09-stage-scanner.js'), 'utf8');
const registryText = fs.readFileSync(path.join(root, 'src/renderer/scripts/shared/strategy-registry.js'), 'utf8');

assert('registry exposes stage scanner', strategies.getStrategy('stage').id === 'stage');
assert('stage scanner is scanner only', strategies.getStrategy('stage').mode === 'scanner_only' && strategies.getStrategy('stage').canLiveTrade === false);
assert('Stage I fixture classifies as base', stageIResult.stage === 'STAGE_I' && stageIResult.actionLabel === 'Watch Base');
assert('Stage II fixture classifies as uptrend', stageIIResult.stage === 'STAGE_II' && ['BUY', 'WATCHLIST'].includes(stageIIResult.signal));
assert('Stage III fixture classifies as protect', stageIIIResult.stage === 'STAGE_III' && stageIIIResult.actionLabel === 'Protect Profit');
assert('Stage IV fixture classifies as downtrend', stageIVResult.stage === 'STAGE_IV' && stageIVResult.signal === 'IGNORE');
assert('Stage review rows stay visible for diagnostics', reviewResult.stage === 'REVIEW' && reviewResult.actionLabel === 'Review Manually');
assert('stage sort keeps trader decision order', sortedStages === 'STAGE_II,STAGE_I,STAGE_III,STAGE_IV,REVIEW');
assert('stage counts include every lifecycle bucket', counts.STAGE_I === 1 && counts.STAGE_II === 1 && counts.STAGE_III === 1 && counts.STAGE_IV === 1 && counts.REVIEW === 1);
assert('stage storage is namespaced', stageText.includes("'strategyResults.stage'") && stageText.includes("'strategyStatus.stage'") && registryText.includes("resultKey: 'strategyResults.stage'"));
assert('stage scanner does not write current scanner results', !/chrome\.storage\.local\.set\(\s*\{[^}]*scanResults\s*:/m.test(stageText));
