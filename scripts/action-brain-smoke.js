'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/renderer/scripts/shared/action-brain.js'), 'utf8');

function loadBrain() {
 const sandbox = { console };
 sandbox.globalThis = sandbox;
 vm.createContext(sandbox);
 vm.runInContext(source, sandbox, { filename: 'action-brain.js' });
 return sandbox.FWDTradeDeskActionBrain;
}

function assert(condition, message) {
 if (!condition) throw new Error(message);
}

const brain = loadBrain();
assert(brain && typeof brain.buildActionBrain === 'function', 'Action Brain did not load');

const baseSignal = {
 symbol: 'BTCUSD',
 direction: 'long',
 score: 84,
 tradeQuality: { score: 82 },
 alertTier: 'execute',
 entry: 100,
 sl: 97,
 tp1: 108,
 setupFamily: 'breakout',
 timeframe: '15m',
 marketRegime: 'TRENDING',
 reasons: ['Breakout pressure', 'Volume expansion'],
};

let model = brain.buildActionBrain({
 scanResults: [baseSignal],
 autoTradeSettings: { paperTrackingEnabled: true, setupPerformanceMinSample: 20 },
 v16SetupPerformanceV1: {
  minSample: 20,
  rows: {
   'breakout|15m|TRENDING': {
    familyKey: 'breakout',
    timeframe: '15m',
    marketRegime: 'TRENDING',
    trades: 34,
    winRate: 58,
    expectancy: 0.42,
    avgR: 0.48,
    maxDrawdown: 1.6,
    statusLabel: 'Positive Edge',
   },
  },
 },
 v16ShadowTradeLedgerV1: { open: [], closed: Array.from({ length: 34 }, (_, index) => ({ id: index })) },
});
assert(model.top.bucket === 'do_now', `Expected do_now, got ${model.top.bucket}`);
assert(model.top.confidence >= 70, 'Expected high confidence for proven setup');

model = brain.buildActionBrain({
 scanResults: [baseSignal],
 autoTradeSettings: { paperTrackingEnabled: true, setupPerformanceMinSample: 20 },
 v16SetupPerformanceV1: {
  minSample: 20,
  rows: {
   'breakout|15m|TRENDING': {
    familyKey: 'breakout',
    timeframe: '15m',
    marketRegime: 'TRENDING',
    trades: 24,
    winRate: 33,
    expectancy: -0.18,
    avgR: -0.22,
    maxDrawdown: 5,
    statusLabel: 'Weak Edge',
   },
  },
 },
 v16ShadowTradeLedgerV1: { open: [], closed: [] },
});
assert(model.actions.some(action => action.bucket === 'avoid'), 'Expected weak paper edge to produce avoid action');

model = brain.buildActionBrain({
 scanResults: [baseSignal],
 autoTradeSettings: { paperTrackingEnabled: true, setupPerformanceMinSample: 20 },
 v16SetupPerformanceV1: { minSample: 20, rows: {} },
 v16ShadowTradeLedgerV1: { open: [], closed: [] },
});
assert(model.actions.some(action => action.bucket === 'paper_first'), 'Expected unproven setup to route to paper first');

model = brain.buildActionBrain({
 scanResults: [baseSignal],
 autoTradeSettings: { paperTrackingEnabled: false, setupPerformanceMinSample: 20 },
 v16SetupPerformanceV1: { minSample: 20, rows: {} },
 v16ShadowTradeLedgerV1: { open: [], closed: [] },
});
assert(model.top.id === 'protect:paper-off', 'Expected paper-off protection action to outrank signal');
assert(model.top.targetAction === 'paper-mode', 'Expected paper-off action to deep-link to paper mode settings');

console.log('Action Brain smoke checks passed.');
