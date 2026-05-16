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
    get(keys, callback) {
     const out = {};
     const list = Array.isArray(keys) ? keys : [keys];
     list.filter(Boolean).forEach(key => { out[key] = undefined; });
     if (typeof callback === 'function') callback(out);
    },
    set(_value, callback) {
     if (typeof callback === 'function') callback();
    },
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

function ema(values, period) {
 const out = new Array(values.length).fill(null);
 if (values.length < period) return out;
 let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
 out[period - 1] = value;
 const k = 2 / (period + 1);
 for (let i = period; i < values.length; i += 1) {
  value = values[i] * k + value * (1 - k);
  out[i] = value;
 }
 return out;
}

function makeTrendReclaim(count = 90) {
 const closes = [];
 let close = 24;
 for (let i = 0; i < count; i += 1) {
  close *= 1.012;
  closes.push(close);
 }
 const ema9 = ema(closes, 9);
 return closes.map((value, index) => {
  let final = value;
  if (index === count - 2) final = Number(ema9[index] || value) * 0.985;
  if (index === count - 1) final = Number(ema9[index] || value) * 1.018;
  return {
   time: 1700000000 + index * 86400,
   open: final * 0.992,
   high: final * 1.025,
   low: index >= count - 2 ? Number(ema9[index] || final) * 0.982 : final * 0.986,
   close: final,
   volume: index === count - 1 ? 8000 : 4200,
   quoteVolume: final * (index === count - 1 ? 8000 : 4200),
  };
 });
}

function makeExtendedTrend(count = 90) {
 const rows = makeTrendReclaim(count);
 const last = rows[rows.length - 1];
 rows[rows.length - 1] = {
  ...last,
  open: last.open * 1.08,
  high: last.high * 1.18,
  low: last.low * 1.08,
  close: last.close * 1.18,
 };
 return rows;
}

function makeShortReject(count = 90) {
 const closes = [];
 let close = 180;
 for (let i = 0; i < count; i += 1) {
  close *= 0.988;
  closes.push(close);
 }
 const ema9 = ema(closes, 9);
 return closes.map((value, index) => {
  let final = value;
  if (index === count - 2) final = Number(ema9[index] || value) * 1.014;
  if (index === count - 1) final = Number(ema9[index] || value) * 0.982;
  return {
   time: 1700000000 + index * 86400,
   open: final * 1.008,
   high: index >= count - 2 ? Number(ema9[index] || final) * 1.018 : final * 1.014,
   low: final * 0.976,
   close: final,
   volume: index === count - 1 ? 8600 : 4400,
   quoteVolume: final * (index === count - 1 ? 8600 : 4400),
  };
 });
}

function makeWeakTrend(count = 80) {
 const rows = [];
 let close = 100;
 for (let i = 0; i < count; i += 1) {
  close *= i % 2 ? 0.998 : 1.001;
  rows.push({
   time: 1700000000 + i * 86400,
   open: close * 1.002,
   high: close * 1.008,
   low: close * 0.992,
   close,
   volume: 2500,
   quoteVolume: close * 2500,
  });
 }
 return rows;
}

runScript('src/renderer/scripts/shared/strategy-registry.js');
runScript('src/renderer/scripts/background/14-pullback-scanner.js');

const pullback = sandbox.FWDTradeDeskPullbackScanner;
const strategies = sandbox.FWDTradeDeskStrategies;
const reclaimRows = makeTrendReclaim();
const extendedRows = makeExtendedTrend();
const shortRows = makeShortReject();
const weakRows = makeWeakTrend();

const reclaim = pullback.pullbackAnalyzeSymbol('HYPEUSD', reclaimRows, reclaimRows.slice(-80), {
 price: reclaimRows[reclaimRows.length - 1].close,
 usdVol24h: 3000000,
 change24h: 4.8,
});
const extended = pullback.pullbackAnalyzeSymbol('LATEUSD', extendedRows, extendedRows.slice(-80), {
 price: extendedRows[extendedRows.length - 1].close,
 usdVol24h: 2500000,
 change24h: 17.2,
});
const shortReject = pullback.pullbackAnalyzeSymbol('SLIDEUSD', shortRows, shortRows.slice(-80), {
 price: shortRows[shortRows.length - 1].close,
 usdVol24h: 2800000,
 change24h: -6.4,
});
const weak = pullback.pullbackAnalyzeSymbol('WEAKUSD', weakRows, weakRows.slice(-60), {
 price: weakRows[weakRows.length - 1].close,
 usdVol24h: 1200000,
 change24h: 0.6,
});
const counts = pullback.pullbackSignalCounts([reclaim, extended, shortReject, weak]);
const sorted = pullback.pullbackSortRows([
 { symbol: 'R', eventType: 'review', score: 90 },
 { symbol: 'E', eventType: 'ema_reclaim', score: 72 },
 { symbol: 'S', eventType: 'ema_reject_short', score: 74 },
 { symbol: 'P', eventType: 'ema_pullback', score: 88 },
]).map(row => row.symbol).join(',');
const registryText = fs.readFileSync(path.join(root, 'src/renderer/scripts/shared/strategy-registry.js'), 'utf8');
const pullbackText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/14-pullback-scanner.js'), 'utf8');
const wizardText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/08-wizard-scanner.js'), 'utf8');
const popupText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/09-strategy-lab.js'), 'utf8');
const backgroundText = fs.readFileSync(path.join(root, 'src/renderer/desktop-background.html'), 'utf8');
const lazyLoaderText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/00-lazy-modules.js'), 'utf8');
const packageText = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

assert('registry exposes pullback lab', strategies.getStrategy('pullback').id === 'pullback');
assert('pullback strategy is scanner only advisory', strategies.getStrategy('pullback').mode === 'scanner_only' && strategies.getStrategy('pullback').canLiveTrade === false);
assert('trend reclaim creates a pullback buy/watch row', reclaim.strategyId === 'pullback' && ['BUY', 'WATCHLIST'].includes(reclaim.signal) && ['ema_reclaim', 'round_support', 'ema_pullback'].includes(reclaim.eventType));
assert('short rejection creates a pullback sell/watch row', shortReject.strategyId === 'pullback' && shortReject.direction === 'short' && ['SELL', 'WATCHLIST'].includes(shortReject.signal) && ['ema_reject_short', 'round_resistance_short', 'ema_pullback_short'].includes(shortReject.eventType));
assert('late extension is rejected as avoid chase', extended.strategyId === 'pullback' && extended.eventType === 'avoid_chase' && extended.signal === 'IGNORE');
assert('weak trend is not promoted to buy', weak.strategyId === 'pullback' && weak.signal !== 'BUY');
assert('pullback rows include EMA and reward metrics', Number(reclaim.raw.ema9) > 0 && Number(reclaim.raw.rrToTarget1) >= 0 && Array.isArray(reclaim.raw.scoreParts.rows));
assert('pullback counts include long and short buckets', counts.long >= 1 && counts.short >= 1 && counts.ema_reclaim + counts.ema_pullback + counts.round_support + counts.ema_reject_short + counts.ema_pullback_short + counts.round_resistance_short + counts.avoid_chase >= 2);
assert('pullback sort prioritizes reclaim/reject over pullback and review', sorted === 'S,E,P,R' || sorted === 'E,S,P,R');
assert('pullback storage is namespaced', pullbackText.includes("'strategyResults.pullback'") && pullbackText.includes("'strategyStatus.pullback'") && registryText.includes("resultKey: 'strategyResults.pullback'"));
assert('pullback scanner does not write current scanResults key', !/chrome\.storage\.local\.set\(\s*\{[^}]*scanResults\s*:/m.test(pullbackText));
assert('strategy snapshot includes pullback rows', wizardText.includes("'strategyResults.pullback'") && wizardText.includes('pullback:'));
assert('strategy lab UI includes pullback filters and detail drawer', popupText.includes("activeStrategyLabId === 'pullback'") && popupText.includes("['reclaim', '9 EMA Reclaim']") && popupText.includes('buildPullbackDetail'));
assert('strategy lab UI separates long and short pullback rows', popupText.includes("['short', 'Short']") && popupText.includes('strategy-direction-badge') && popupText.includes('ema_reject_short'));
assert('strategy lab UI includes pullback chart draft handoff', popupText.includes('buildPullbackChartDraft') && popupText.includes('data-pullback-chart-draft'));
assert('desktop background lazy-loads pullback scanner', backgroundText.includes('scripts/background/00-lazy-modules.js') && lazyLoaderText.includes('scripts/background/14-pullback-scanner.js') && lazyLoaderText.includes("'pullback:startScan'"));
assert('package exposes pullback smoke check', packageText.includes('check:pullback') && packageText.includes('pullback-strategy-smoke.js'));
