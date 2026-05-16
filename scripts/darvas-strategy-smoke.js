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

function makeDarvasDaily(type = 'breakout', count = 90) {
 const candles = [];
 let close = 1;
 for (let i = 0; i < count; i += 1) {
  if (i < 50) close *= 1.006;
  else close = 1.42 + Math.sin(i / 2) * 0.025;
  let final = close;
  let high = final * 1.012;
  let low = final * 0.988;
  let volume = 1800;
  if (i >= count - 26 && i < count - 1) {
   final = 1.42 + Math.sin(i) * 0.02;
   high = 1.48 + (i % 4) * 0.002;
   low = 1.32 - (i % 3) * 0.002;
   volume = 2100;
  }
  if (i === count - 1) {
   if (type === 'breakout') {
    final = 1.54;
    high = 1.56;
    low = 1.47;
    volume = 6400;
   } else if (type === 'near') {
    final = 1.465;
    high = 1.475;
    low = 1.43;
    volume = 3300;
   } else if (type === 'failed') {
    final = 1.43;
    high = 1.56;
    low = 1.39;
    volume = 6200;
   }
  }
  candles.push({
   time: 1700000000 + i * 86400,
   open: final * 0.992,
   high,
   low,
   close: final,
   volume,
   quoteVolume: final * volume,
  });
 }
 return candles;
}

function makeIntraday(count = 80) {
 const rows = [];
 let close = 1.5;
 for (let i = 0; i < count; i += 1) {
  close *= 1 + Math.sin(i / 7) * 0.001;
  rows.push({
   time: 1700000000 + i * 900,
   open: close * 0.998,
   high: close * 1.004,
   low: close * 0.996,
   close,
   volume: 1000,
   quoteVolume: close * 1000,
  });
 }
 return rows;
}

runScript('src/renderer/scripts/shared/strategy-registry.js');
runScript('src/renderer/scripts/background/12-darvas-scanner.js');

const darvas = sandbox.FWDTradeDeskDarvasScanner;
const strategies = sandbox.FWDTradeDeskStrategies;
const intraday = makeIntraday();
const breakout = darvas.darvasAnalyzeSymbol('BOXUSD', makeDarvasDaily('breakout'), intraday, {
 price: 1.54,
 change24h: 4.5,
 usdVol24h: 1800000,
});
const near = darvas.darvasAnalyzeSymbol('NEARUSD', makeDarvasDaily('near'), intraday, {
 price: 1.465,
 change24h: 1.2,
 usdVol24h: 1400000,
});
const failed = darvas.darvasAnalyzeSymbol('FAILUSD', makeDarvasDaily('failed'), intraday, {
 price: 1.43,
 change24h: -1.5,
 usdVol24h: 1500000,
});
const counts = darvas.darvasSignalCounts([breakout, near, failed]);
const sorted = darvas.darvasSortRows([
 { symbol: 'R', eventType: 'review', score: 95 },
 { symbol: 'B', eventType: 'breakout', score: 62 },
 { symbol: 'N', eventType: 'near_breakout', score: 88 },
]).map(row => row.symbol).join(',');
const registryText = fs.readFileSync(path.join(root, 'src/renderer/scripts/shared/strategy-registry.js'), 'utf8');
const darvasText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/12-darvas-scanner.js'), 'utf8');
const wizardText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/08-wizard-scanner.js'), 'utf8');
const popupText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/09-strategy-lab.js'), 'utf8');
const chartWorkspaceText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/07-chart-workspace.js'), 'utf8');
const chartEngineText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/chart-engine.js'), 'utf8');
const chartCssText = fs.readFileSync(path.join(root, 'src/renderer/styles/05-chart-workspace.css'), 'utf8');
const backgroundText = fs.readFileSync(path.join(root, 'src/renderer/desktop-background.html'), 'utf8');
const lazyLoaderText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/00-lazy-modules.js'), 'utf8');
const packageText = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

assert('registry exposes Darvas Box Lab', strategies.getStrategy('darvas').id === 'darvas');
assert('darvas strategy is scanner only advisory', strategies.getStrategy('darvas').mode === 'scanner_only' && strategies.getStrategy('darvas').canLiveTrade === false);
assert('breakout row is a Darvas buy candidate', breakout.strategyId === 'darvas' && breakout.signal === 'BUY' && breakout.eventType === 'breakout');
assert('near box top row stays watchlist', near.strategyId === 'darvas' && near.signal === 'WATCHLIST' && ['near_breakout', 'base'].includes(near.eventType));
assert('failed breakout is rejected', failed.strategyId === 'darvas' && failed.signal === 'IGNORE' && failed.eventType === 'failed_breakout');
assert('darvas rows include box levels and score explanation', breakout.raw.boxTop > breakout.raw.boxBottom && Array.isArray(breakout.raw.scoreParts.rows) && breakout.raw.scoreParts.rows.length > 0);
assert('darvas rows carry time bounded chart box', breakout.raw.darvasBox?.top > breakout.raw.darvasBox?.bottom && Number(breakout.raw.darvasBox?.startTime || 0) > 0 && Number(breakout.raw.darvasBox?.endTime || 0) > 0);
assert('darvas stop remains static box bottom context', Number(breakout.stop) === Number(breakout.raw.boxBottom) && !/fixedAccount|fixed account percent|next higher box bottom/i.test(darvasText));
assert('darvas counts include event buckets', counts.breakout >= 1 && counts.failed_breakout >= 1);
assert('darvas sort prioritizes box events over review', sorted === 'B,N,R');
assert('darvas storage is namespaced', darvasText.includes("'strategyResults.darvas'") && darvasText.includes("'strategyStatus.darvas'") && registryText.includes("resultKey: 'strategyResults.darvas'"));
assert('darvas scanner does not write current scanResults key', !/chrome\.storage\.local\.set\(\s*\{[^}]*scanResults\s*:/m.test(darvasText));
assert('strategy snapshot includes darvas rows', wizardText.includes("'strategyResults.darvas'") && wizardText.includes('darvas:'));
assert('strategy lab UI includes darvas filters and detail drawer', popupText.includes("activeStrategyLabId === 'darvas'") && popupText.includes("['breakout', 'Breakout']") && popupText.includes('buildDarvasDetail'));
assert('strategy lab UI includes darvas chart draft handoff', popupText.includes('buildDarvasChartDraft') && popupText.includes('data-darvas-chart-draft'));
assert('generic Darvas review opens with Darvas box context', popupText.includes('buildStrategyChartReviewDraft(selected)') && popupText.includes('isDarvasChartReviewRow'));
assert('generic Darvas review prefers the active strategy row', popupText.includes('const activeMatch = labRowsForActive(strategyLabSnapshot).find'));
assert('darvas chart handoff carries an optional Darvas overlay', popupText.includes('darvasBox') && chartWorkspaceText.includes("{ key: 'darvas', label: 'Darvas Box' }") && chartEngineText.includes('renderDarvasBoxLayer') && chartEngineText.includes('host.appendChild(layer)') && chartCssText.includes('ds-darvas-box'));
assert('darvas chart has scanner independent candle fallback', chartEngineText.includes('detectDarvasBoxFromCandles') && chartEngineText.includes('isDarvasReviewState') && popupText.includes("source: 'strategy-lab-darvas'"));
assert('darvas chart is off by default and enabled from indicators', chartWorkspaceText.includes('darvas: false') && chartWorkspaceText.includes('enabled: false') && chartWorkspaceText.includes('data-ds-chart-indicator'));
assert('darvas chart indicator is not a basic rectangle', chartEngineText.includes('detectDarvasBoxesFromCandles') && chartEngineText.includes('breakoutScore') && chartEngineText.includes('Weak BO') && chartEngineText.includes('Retest'));
assert('darvas chart exposes professional settings', chartWorkspaceText.includes('darvasSettings') && chartWorkspaceText.includes('data-ds-darvas-toggle') && chartWorkspaceText.includes('data-ds-darvas-number') && chartWorkspaceText.includes('Volume x') && chartWorkspaceText.includes('High Quality'));
assert('darvas chart renders minimal chart levels and scanner details', chartEngineText.includes('data-darvas-output') && chartEngineText.includes('renderDarvasScannerPanel') && chartCssText.includes('ds-darvas-status-badge') && chartCssText.includes('ds-darvas-scanner-panel') && chartCssText.includes('ds-darvas-level-line') && chartCssText.includes('ds-darvas-marker.retest'));
assert('darvas chart handoff opens daily box view', popupText.includes("timeframe: isDarvas ? '1d'") && popupText.includes("timeframe: '1d'"));
assert('desktop background lazy-loads darvas scanner', backgroundText.includes('scripts/background/00-lazy-modules.js') && lazyLoaderText.includes('scripts/background/12-darvas-scanner.js') && lazyLoaderText.includes("'darvas:startScan'"));
assert('package exposes darvas smoke check', packageText.includes('check:darvas') && packageText.includes('darvas-strategy-smoke.js'));
