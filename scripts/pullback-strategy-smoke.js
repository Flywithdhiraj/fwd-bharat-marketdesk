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
  if (index === count - 2) final = Number(ema9[index] || value) * 0.992;
  if (index === count - 1) final = Number(ema9[index] || value) * 1.006;
  const ema = Number(ema9[index] || final);
  const isPullback = index >= count - 2;
  return {
   time: 1700000000 + index * 86400,
   open: isPullback ? final * 0.998 : final * 0.992,
   high: isPullback ? final * 1.006 : final * 1.025,
   low: isPullback ? ema * 0.997 : final * 0.986,
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
  if (index === count - 2) final = Number(ema9[index] || value) * 1.008;
  if (index === count - 1) final = Number(ema9[index] || value) * 0.994;
  const ema = Number(ema9[index] || final);
  const isPullback = index >= count - 2;
  return {
   time: 1700000000 + index * 86400,
   open: isPullback ? final * 1.002 : final * 1.008,
   high: isPullback ? ema * 1.003 : final * 1.014,
   low: isPullback ? final * 0.994 : final * 0.976,
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

function makeIntradayLongReady(price, count = 60) {
 const rows = [];
 let close = price * 0.94;
 for (let i = 0; i < count; i += 1) {
  close *= i > count - 8 ? 1.0018 : 1.0009;
  rows.push({
   time: 1700000000 + i * 900,
   open: close * 0.998,
   high: close * 1.004,
   low: close * 0.996,
   close,
   volume: 3000,
   quoteVolume: close * 3000,
  });
 }
 const last = rows[rows.length - 1];
 rows[rows.length - 1] = {
  ...last,
  open: price * 0.996,
  high: price * 1.006,
  low: price * 0.994,
  close: price * 1.004,
 };
 return rows;
}

function makeIntradayShortReady(price, count = 60) {
 const rows = [];
 let close = price * 1.06;
 for (let i = 0; i < count; i += 1) {
  close *= i > count - 8 ? 0.9982 : 0.9991;
  rows.push({
   time: 1700000000 + i * 900,
   open: close * 1.002,
   high: close * 1.004,
   low: close * 0.996,
   close,
   volume: 3200,
   quoteVolume: close * 3200,
  });
 }
 const last = rows[rows.length - 1];
 rows[rows.length - 1] = {
  ...last,
  open: price * 1.004,
  high: price * 1.006,
  low: price * 0.994,
  close: price * 0.996,
 };
 return rows;
}

function makeIntradayWait(price, count = 60) {
 const rows = makeIntradayLongReady(price, count);
 const last = rows[rows.length - 1];
 rows[rows.length - 1] = {
  ...last,
  open: price * 1.001,
  high: price * 1.004,
  low: price * 0.997,
  close: price * 1.002,
 };
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
const bullMarket = {
 condition: 'bull',
 indexChangePct: 1.1,
 sentiment: { label: 'Constructive', score: 24, breadthPct: 62 },
 leadership: { state: 'broad_risk_on' },
};
const bearMarket = {
 condition: 'bear',
 indexChangePct: -1.2,
 sentiment: { label: 'Defensive', score: -24, breadthPct: 38 },
 leadership: { state: 'broad_risk_off' },
};

const reclaim = pullback.pullbackAnalyzeSymbol('HYPEUSD', reclaimRows, reclaimRows.slice(-80), {
 price: reclaimRows[reclaimRows.length - 1].close,
 usdVol24h: 3000000,
 change24h: 4.8,
}, { marketIndex: bullMarket });
const reclaimReady = pullback.pullbackAnalyzeSymbol('HYPEREADYUSD', reclaimRows, makeIntradayLongReady(reclaimRows[reclaimRows.length - 1].close), {
 price: reclaimRows[reclaimRows.length - 1].close,
 usdVol24h: 3000000,
 change24h: 4.8,
}, { marketIndex: bullMarket });
const reclaimWait = pullback.pullbackAnalyzeSymbol('HYPEWAITUSD', reclaimRows, makeIntradayWait(reclaimRows[reclaimRows.length - 1].close), {
 price: reclaimRows[reclaimRows.length - 1].close,
 usdVol24h: 3000000,
 change24h: 4.8,
}, { marketIndex: bullMarket });
const marketAgainst = pullback.pullbackAnalyzeSymbol('HYPEBEARUSD', reclaimRows, makeIntradayLongReady(reclaimRows[reclaimRows.length - 1].close), {
 price: reclaimRows[reclaimRows.length - 1].close,
 usdVol24h: 3000000,
 change24h: 4.8,
}, { marketIndex: bearMarket });
const extended = pullback.pullbackAnalyzeSymbol('LATEUSD', extendedRows, extendedRows.slice(-80), {
 price: extendedRows[extendedRows.length - 1].close,
 usdVol24h: 2500000,
 change24h: 17.2,
});
const shortReject = pullback.pullbackAnalyzeSymbol('SLIDEUSD', shortRows, shortRows.slice(-80), {
 price: shortRows[shortRows.length - 1].close,
 usdVol24h: 2800000,
 change24h: -6.4,
}, { marketIndex: bearMarket });
const shortReady = pullback.pullbackAnalyzeSymbol('SLIDEREADYUSD', shortRows, makeIntradayShortReady(shortRows[shortRows.length - 1].close), {
 price: shortRows[shortRows.length - 1].close,
 usdVol24h: 2800000,
 change24h: -6.4,
}, { marketIndex: bearMarket });
const weak = pullback.pullbackAnalyzeSymbol('WEAKUSD', weakRows, weakRows.slice(-60), {
 price: weakRows[weakRows.length - 1].close,
 usdVol24h: 1200000,
 change24h: 0.6,
});
const counts = pullback.pullbackSignalCounts([reclaimReady, reclaimWait, marketAgainst, extended, shortReady, weak]);
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
assert('trend reclaim separates daily setup from 4H entry trigger', reclaimReady.strategyId === 'pullback' && reclaimReady.signal === 'BUY' && reclaimReady.raw.workflowStage === 'entry_ready' && reclaimReady.checks.intradayReady === true);
assert('daily pullback setup waits when 4H trigger is not ready', reclaimWait.strategyId === 'pullback' && reclaimWait.signal === 'WATCHLIST' && reclaimWait.raw.workflowStage === 'daily_setup_wait_trigger' && reclaimWait.checks.intradayReady === false);
assert('market regime can block a long pullback entry', marketAgainst.strategyId === 'pullback' && marketAgainst.signal !== 'BUY' && marketAgainst.checks.marketFit === false && marketAgainst.riskFlags.includes('Market regime against setup'));
assert('short rejection creates an entry-ready short row', shortReady.strategyId === 'pullback' && shortReady.direction === 'short' && shortReady.signal === 'SELL' && shortReady.raw.workflowStage === 'entry_ready' && ['ema_reject_short', 'round_resistance_short'].includes(shortReady.eventType));
assert('late extension is rejected as avoid chase', extended.strategyId === 'pullback' && extended.eventType === 'avoid_chase' && extended.signal === 'IGNORE');
assert('weak trend is not promoted to buy', weak.strategyId === 'pullback' && weak.signal !== 'BUY');
assert('pullback rows include EMA, 4H timing, market, and reward metrics', Number(reclaimReady.raw.ema9) > 0 && Number(reclaimReady.raw.rrToTarget1) >= 0 && reclaimReady.raw.timing.ready === true && reclaimReady.raw.marketRegime.state === 'aligned' && Array.isArray(reclaimReady.raw.scoreParts.rows));
assert('pullback counts include long and short buckets', counts.long >= 1 && counts.short >= 1 && counts.ema_reclaim + counts.ema_pullback + counts.round_support + counts.ema_reject_short + counts.ema_pullback_short + counts.round_resistance_short + counts.avoid_chase >= 2);
assert('pullback sort prioritizes reclaim/reject over pullback and review', sorted === 'S,E,P,R' || sorted === 'E,S,P,R');
assert('pullback storage is namespaced', pullbackText.includes("'strategyResults.pullback'") && pullbackText.includes("'strategyStatus.pullback'") && registryText.includes("resultKey: 'strategyResults.pullback'"));
assert('pullback scanner does not write current scanResults key', !/chrome\.storage\.local\.set\(\s*\{[^}]*scanResults\s*:/m.test(pullbackText));
assert('strategy snapshot includes pullback rows', wizardText.includes("'strategyResults.pullback'") && wizardText.includes('pullback:'));
assert('strategy lab UI includes pullback filters and detail drawer', popupText.includes("activeStrategyLabId === 'pullback'") && popupText.includes("['reclaim', '9 EMA Reclaim']") && popupText.includes('buildPullbackDetail') && popupText.includes('4H Timing') && popupText.includes('Trade Plan'));
assert('strategy lab UI separates long and short pullback rows', popupText.includes("['short', 'Short']") && popupText.includes('strategy-direction-badge') && popupText.includes('ema_reject_short'));
assert('strategy lab UI includes pullback chart draft handoff', popupText.includes('buildPullbackChartDraft') && popupText.includes('data-pullback-chart-draft'));
assert('desktop background lazy-loads pullback scanner', backgroundText.includes('scripts/background/00-lazy-modules.js') && lazyLoaderText.includes('scripts/background/14-pullback-scanner.js') && lazyLoaderText.includes("'pullback:startScan'"));
assert('package exposes pullback smoke check', packageText.includes('check:pullback') && packageText.includes('pullback-strategy-smoke.js'));
