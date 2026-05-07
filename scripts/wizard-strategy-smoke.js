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
runScript('src/renderer/scripts/background/08-wizard-scanner.js');

const wizard = sandbox.FWDTradeDeskWizardScanner;
const strategies = sandbox.FWDTradeDeskStrategies;

function makeCandles(count, start = 100, dailyStep = 0.9) {
 const candles = [];
 let close = start;
 for (let i = 0; i < count; i += 1) {
 close += dailyStep;
 const pullback = i > count - 70 && i % 17 === 0 ? close * 0.04 : 0;
 const finalClose = close - pullback;
 candles.push({
 time: 1700000000 + i * 86400,
 open: finalClose * 0.985,
 high: finalClose * 1.018,
 low: finalClose * 0.982,
 close: finalClose,
 volume: i > count - 20 ? 65000 : 100000,
 quoteVolume: finalClose * (i > count - 20 ? 65000 : 100000),
 });
 }
 return candles;
}

const uptrend = makeCandles(260);
const indicators = wizard.wizardCalculateIndicators(uptrend);
const rsItems = [
 { symbol: 'LOW', weightedReturn: 1 },
 { symbol: 'MID', weightedReturn: 5 },
 { symbol: 'HIGH', weightedReturn: 10 },
];
const ranks = wizard.wizardPercentileRanks(rsItems);
const trend = wizard.wizardTrendTemplate(indicators, 90);
const liquidity = wizard.wizardLiquidityPass(indicators, { usdVol24h: 10000000 }, wizard.WIZARD_DEFAULT_SETTINGS, uptrend.length);
const risk = wizard.wizardRisk(120, 118, 2, 113, wizard.WIZARD_DEFAULT_SETTINGS);
const score = wizard.wizardScore({
 trend: { pass: true },
 rsScore: 90,
 vcp: { detected: true, volumeDryupScore: 80, contractionCount: 3 },
 breakout: { checks: { volumeBreakout: true } },
 marketHealth: { pass: true },
});
const counts = wizard.wizardSignalCounts([
 { signal: 'BUY' },
 { signal: 'WATCHLIST' },
 { signal: 'SELL' },
 { signal: 'IGNORE' },
 { signal: 'IGNORE' },
]);

const registryText = fs.readFileSync(path.join(root, 'src/renderer/scripts/shared/strategy-registry.js'), 'utf8');
const wizardText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/08-wizard-scanner.js'), 'utf8');

assert('registry exposes current and wizard strategies', strategies.getStrategy('current').id === 'current' && strategies.getStrategy('wizard').id === 'wizard');
assert('wizard strategy is scanner only', strategies.getStrategy('wizard').mode === 'scanner_only' && strategies.getStrategy('wizard').canLiveTrade === false);
assert('RS percentile ranks high symbol at 100', ranks.get('HIGH') === 100 && ranks.get('LOW') === 0);
assert('trend template passes strong uptrend', trend.pass === true);
assert('liquidity filter passes liquid market', liquidity.pass === true);
assert('risk rejects nothing under 8 percent', risk.pass === true && risk.riskPercent <= 8);
assert('wizard score maps strong setup above A threshold', score >= 85 && wizard.wizardLabel(score) === 'A+ Setup');
assert('wizard action labels explain trader decision', wizard.wizardActionLabel('BUY', 90) === 'Buy now' && wizard.wizardActionLabel('SELL', 80) === 'Short watch');
assert('wizard status counts separate buy watch sell ignore', counts.BUY === 1 && counts.WATCHLIST === 1 && counts.SELL === 1 && counts.IGNORE === 2);
assert('wizard storage is namespaced', wizardText.includes("'strategyResults.wizard'") && wizardText.includes("'strategyStatus.wizard'"));
assert('wizard does not write current scanResults key', !/chrome\.storage\.local\.set\(\s*\{[^}]*scanResults\s*:/m.test(wizardText));
assert('registry keeps current scan result key unchanged', registryText.includes("resultKey: 'scanResults'"));
