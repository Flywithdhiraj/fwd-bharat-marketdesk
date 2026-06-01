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

function makeUpExhaustion(count) {
 const candles = [];
 let close = 0.4;
 for (let i = 0; i < count; i += 1) {
  close *= i === count - 1 ? 1.16 : 1.003;
  const final = i === count - 1 ? close * 0.965 : close;
  candles.push({
   time: 1700000000 + i * 900,
   open: final * 0.992,
   high: i === count - 1 ? final * 1.09 : final * 1.006,
   low: final * 0.991,
   close: final,
   volume: i === count - 1 ? 12000 : 1400,
   quoteVolume: final * (i === count - 1 ? 12000 : 1400),
  });
 }
 return candles;
}

function makeDownFlush(count) {
 const candles = [];
 let close = 0.8;
 for (let i = 0; i < count; i += 1) {
  close *= i === count - 1 ? 0.84 : 0.997;
  const final = i === count - 1 ? close * 1.035 : close;
  candles.push({
   time: 1700000000 + i * 900,
   open: final * 1.008,
   high: final * 1.012,
   low: i === count - 1 ? final * 0.9 : final * 0.994,
   close: final,
   volume: i === count - 1 ? 13000 : 1300,
   quoteVolume: final * (i === count - 1 ? 13000 : 1300),
  });
 }
 return candles;
}

function makeMeanStretch(count) {
 const candles = [];
 let close = 1.2;
 for (let i = 0; i < count; i += 1) {
  close += i === count - 1 ? 0.12 : Math.sin(i / 5) * 0.004;
  candles.push({
   time: 1700000000 + i * 900,
   open: close * 0.997,
   high: close * 1.006,
   low: close * 0.994,
   close,
   volume: i === count - 1 ? 1800 : 1100,
   quoteVolume: close * (i === count - 1 ? 1800 : 1100),
  });
 }
 return candles;
}

runScript('src/renderer/scripts/shared/strategy-registry.js');
runScript('src/renderer/scripts/background/11-reversal-scanner.js');

const reversal = sandbox.FWDTradeDeskReversalScanner;
const strategies = sandbox.FWDTradeDeskStrategies;
const upExhaustion = makeUpExhaustion(140);
const downFlush = makeDownFlush(140);
const meanStretch = makeMeanStretch(120);

const fadeShort = reversal.reversalAnalyzeSymbol('FADEUSD', upExhaustion, upExhaustion.slice(-80), {
 price: upExhaustion[upExhaustion.length - 1].close,
 change24h: 13.4,
 usdVol24h: 1800000,
 fundingRate: 0.08,
});
const bounce = reversal.reversalAnalyzeSymbol('BOUNCEUSD', downFlush, downFlush.slice(-80), {
 price: downFlush[downFlush.length - 1].close,
 change24h: -12.8,
 usdVol24h: 1700000,
 fundingRate: -0.07,
});
const mean = reversal.reversalAnalyzeSymbol('MEANUSD', meanStretch, meanStretch.slice(-80), {
 price: meanStretch[meanStretch.length - 1].close,
 change24h: 5.2,
 usdVol24h: 900000,
 fundingRate: 0.01,
});
const counts = reversal.reversalSignalCounts([fadeShort, bounce, mean]);
const sorted = reversal.reversalSortRows([
 { symbol: 'R', eventType: 'review', score: 95 },
 { symbol: 'L', eventType: 'liquidation_reversal', score: 64 },
 { symbol: 'M', eventType: 'mean_reversion', score: 88 },
]).map(row => row.symbol).join(',');
const registryText = fs.readFileSync(path.join(root, 'src/renderer/scripts/shared/strategy-registry.js'), 'utf8');
const reversalText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/11-reversal-scanner.js'), 'utf8');
const wizardText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/08-wizard-scanner.js'), 'utf8');
const popupText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/09-strategy-lab.js'), 'utf8');
const backgroundText = fs.readFileSync(path.join(root, 'src/renderer/desktop-background.html'), 'utf8');
const lazyLoaderText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/00-lazy-modules.js'), 'utf8');
const packageText = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

assert('registry exposes reversal lab', strategies.getStrategy('reversal').id === 'reversal');
assert('reversal strategy is scanner only advisory', strategies.getStrategy('reversal').mode === 'scanner_only' && strategies.getStrategy('reversal').canLiveTrade === false);
assert('upside exhaustion creates a short-side reversal row', fadeShort.strategyId === 'reversal' && ['SELL', 'WATCHLIST'].includes(fadeShort.signal) && String(fadeShort.direction).includes('short'));
assert('downside flush creates a bounce reversal row', bounce.strategyId === 'reversal' && ['BUY', 'WATCHLIST'].includes(bounce.signal) && String(bounce.direction).includes('long'));
assert('mean stretch stays visible for balance watch', mean.strategyId === 'reversal' && ['mean_reversion', 'fade_extreme', 'liquidation_reversal', 'avoid_chase'].includes(mean.eventType));
assert('reversal rows include score explanation data', Array.isArray(fadeShort.raw.scoreParts.rows) && fadeShort.raw.scoreParts.rows.length > 0);
assert('reversal rows include VWAP and stretch metrics', Number.isFinite(Number(fadeShort.raw.vwapDistancePct)) && Number.isFinite(Number(fadeShort.raw.rsi14)) && Number.isFinite(Number(fadeShort.raw.zScore)));
assert('reversal scanner excludes unavailable crypto funding input', !reversalText.includes('Funding crowding') && !reversalText.includes('fundingCrowdedLong') && !reversalText.includes('fundingRate'));
assert('reversal counts include event buckets', counts.liquidation_reversal + counts.fade_extreme + counts.mean_reversion + counts.avoid_chase >= 1);
assert('reversal sort prioritizes reversal events over review', sorted === 'L,M,R');
assert('reversal storage is namespaced', reversalText.includes("'strategyResults.reversal'") && reversalText.includes("'strategyStatus.reversal'") && registryText.includes("resultKey: 'strategyResults.reversal'"));
assert('reversal scanner does not write current scanResults key', !/chrome\.storage\.local\.set\(\s*\{[^}]*scanResults\s*:/m.test(reversalText));
assert('strategy snapshot includes reversal rows', wizardText.includes("'strategyResults.reversal'") && wizardText.includes('reversal:'));
assert('strategy lab UI includes reversal filters and detail drawer', popupText.includes("activeStrategyLabId === 'reversal'") && popupText.includes("['liquidation', 'Liq Reversal']") && popupText.includes('buildReversalDetail'));
assert('strategy lab UI includes reversal chart draft handoff', popupText.includes('buildReversalChartDraft') && popupText.includes('data-reversal-chart-draft'));
assert('desktop background lazy-loads reversal scanner', backgroundText.includes('scripts/background/00-lazy-modules.js') && lazyLoaderText.includes('scripts/background/11-reversal-scanner.js') && lazyLoaderText.includes("'reversal:startScan'"));
assert('package exposes reversal smoke check', packageText.includes('check:reversal') && packageText.includes('reversal-strategy-smoke.js'));
