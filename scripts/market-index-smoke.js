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
   sendMessage(_message, callback) {
    if (typeof callback === 'function') callback({ ok: true });
   },
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
 dlog() {},
 detectAPI() { return Promise.resolve(); },
 fetchAllTickers() { return Promise.resolve({}); },
 fetchProducts() { return Promise.resolve([]); },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function runScript(relPath) {
 const code = fs.readFileSync(path.join(root, relPath), 'utf8');
 vm.runInContext(code, sandbox, { filename: relPath });
}

function assert(name, condition, details = '') {
 if (!condition) {
  console.error(`FAIL ${name}${details ? `: ${details}` : ''}`);
  process.exitCode = 1;
  return;
 }
 console.log(`PASS ${name}`);
}

function near(actual, expected, tolerance = 0.01) {
 return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

runScript('src/renderer/scripts/shared/common.js');
runScript('src/renderer/scripts/background/01-analysis.js');
runScript('src/renderer/scripts/background/02-scan.js');

const calcMarketIndex = sandbox.calcMarketIndex;
if (typeof calcMarketIndex !== 'function') {
 console.error('FAIL calcMarketIndex is not available');
 process.exit(1);
}
const applyMarketIndexWindowChange = sandbox.applyMarketIndexWindowChange;
if (typeof applyMarketIndexWindowChange !== 'function') {
 console.error('FAIL applyMarketIndexWindowChange is not available');
 process.exit(1);
}

const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD', 'ADAUSD', 'AVAXUSD', 'DOGEUSD', 'LINKUSD', 'DOTUSD'];

function makeTickerMap(priceBySymbol = {}, options = {}) {
 const out = {};
 symbols.forEach((symbol, index) => {
  const price = Number(priceBySymbol[symbol] ?? options.price ?? 100);
  const prior = Number(options.priorPrice ?? 100);
  out[symbol] = {
   price,
   usdVol24h: Number(options.baseVolume || 2000000) - (index * 10000),
   change24h: ((price - prior) / prior) * 100,
   fundingRate: 0.01,
   oi: 1000000 + (index * 1000),
  };
 });
 return out;
}

const initial = calcMarketIndex(makeTickerMap(), null, { maxConstituents: 10 }, {});
assert('initial basket starts at 10000', near(initial.composite, 10000), `composite=${initial.composite}`);
assert('initial basket has 10 equal constituents', initial.topCoins.length === 10 && initial.topCoins.every(coin => near(coin.weight, 10)), JSON.stringify(initial.topCoins));
assert('funding crowding index is available with bias and contributors', Number.isFinite(Number(initial.sentiment.fundingCrowdingIndex)) && initial.sentiment.fundingCrowdingBias === 'longs_crowded' && Array.isArray(initial.sentiment.topFundingCrowding), JSON.stringify(initial.sentiment));

const crowdedFundingMap = makeTickerMap({}, { baseVolume: 25000000 });
crowdedFundingMap.BTCUSD.fundingRate = -0.18;
crowdedFundingMap.ETHUSD.fundingRate = -0.14;
crowdedFundingMap.SOLUSD.fundingRate = -0.09;
crowdedFundingMap.BTCUSD.oi = 1300000;
crowdedFundingMap.ETHUSD.oi = 1250000;
crowdedFundingMap.SOLUSD.oi = 1200000;
const crowdedFunding = calcMarketIndex(crowdedFundingMap, initial, { maxConstituents: 10 }, {
 BTCUSD: 1000000,
 ETHUSD: 1000000,
 SOLUSD: 1000000,
});
assert('funding crowding index captures magnitude direction and OI confirmation', crowdedFunding.sentiment.fundingCrowdingIndex > initial.sentiment.fundingCrowdingIndex && crowdedFunding.sentiment.fundingCrowdingBias === 'shorts_crowded' && crowdedFunding.sentiment.fundingCrowdingShock > 0 && crowdedFunding.sentiment.fundingOiConfirmationPct > 0, JSON.stringify(crowdedFunding.sentiment));

const upOnePrices = Object.fromEntries(symbols.map(symbol => [symbol, 101]));
const upOne = calcMarketIndex(makeTickerMap(upOnePrices), initial, { maxConstituents: 10 }, {});
assert('all constituents up 1 pct moves index to 10100', near(upOne.composite, 10100), `composite=${upOne.composite}`);

const splitPrices = Object.fromEntries(symbols.map((symbol, index) => [symbol, index < 5 ? 101 : 99]));
const split = calcMarketIndex(makeTickerMap(splitPrices), initial, { maxConstituents: 10 }, {});
assert('equal up/down basket stays flat', near(split.composite, 10000), `composite=${split.composite}`);

const secondUpPrices = Object.fromEntries(symbols.map(symbol => [symbol, 102.01]));
const compounded = calcMarketIndex(makeTickerMap(secondUpPrices, { priorPrice: 101 }), upOne, { maxConstituents: 10 }, {});
assert('repeated scans compound instead of reset', near(compounded.composite, 10201), `composite=${compounded.composite}`);

const now = Date.UTC(2026, 4, 16, 12, 0, 0);
const rollingMove = applyMarketIndexWindowChange({
 ...compounded,
 ts: now,
 indexChangePoints: 7,
 indexChangePct: 0.07,
 previousComposite: 10194,
 scanChangePoints: 7,
 scanChangePct: 0.07,
 scanPreviousComposite: 10194,
}, [
 { ts: now - (24 * 60 * 60 * 1000), composite: 10000 },
 { ts: now - (5 * 60 * 1000), composite: 10194 },
], now);
assert('displayed FWD100 move uses rolling 24h baseline, not previous scan delta', near(rollingMove.indexChangePoints, 201) && near(rollingMove.indexChangePct, 2.01) && rollingMove.indexChangeBasis === 'rolling_24h', JSON.stringify(rollingMove));
assert('scan-to-scan FWD100 move is retained separately for diagnostics', near(rollingMove.scanChangePoints, 7) && near(rollingMove.scanChangePct, 0.07), JSON.stringify(rollingMove));

const unevenPrices = Object.fromEntries(symbols.map((symbol, index) => [symbol, 100 + index]));
const beforeRebuild = calcMarketIndex(makeTickerMap(unevenPrices), initial, { maxConstituents: 10 }, {});
const rebuilt = calcMarketIndex(makeTickerMap(unevenPrices), beforeRebuild, { maxConstituents: 10, rebuildNonce: Date.now() }, {});
assert('manual rebalance does not create index jump', near(rebuilt.composite, beforeRebuild.composite), `${rebuilt.composite} vs ${beforeRebuild.composite}`);
assert('manual rebalance restores equal weights', rebuilt.topCoins.every(coin => near(coin.weight, 10)), JSON.stringify(rebuilt.topCoins));

const eligibilityMap = {
 BTCUSDT: { price: 100, usdVol24h: 3000000, change24h: 1 },
 ETHUSDT: { price: 100, usdVol24h: 2750000, change24h: 1 },
 ETHUSD: { price: 100, usdVol24h: 2500000, change24h: 1 },
 USDTUSD: { price: 1, usdVol24h: 9000000, change24h: 0 },
 PAXGUSD: { price: 2000, usdVol24h: 8000000, change24h: 0 },
 BTCDOMUSD: { price: 50, usdVol24h: 7000000, change24h: 0 },
 SOLUSD: { price: 100, usdVol24h: 2000000, change24h: 1 },
 XRPUSD: { price: 100, usdVol24h: 1900000, change24h: 1 },
 ADAUSD: { price: 100, usdVol24h: 1800000, change24h: 1 },
 AVAXUSD: { price: 100, usdVol24h: 1700000, change24h: 1 },
 DOGEUSD: { price: 100, usdVol24h: 1600000, change24h: 1 },
 LINKUSD: { price: 100, usdVol24h: 1500000, change24h: 1 },
 DOTUSD: { price: 100, usdVol24h: 1400000, change24h: 1 },
};
const eligibility = calcMarketIndex(eligibilityMap, null, { maxConstituents: 10, excludedSymbols: ['BTC'] }, {});
const eligibilitySymbols = eligibility.topCoins.map(coin => coin.sym);
assert('valid USDT pairs are supported when not manually excluded', eligibilitySymbols.includes('ETHUSDT'), eligibilitySymbols.join(','));
assert('stablecoin gold and dominance symbols excluded', !eligibilitySymbols.some(symbol => ['USDTUSD', 'PAXGUSD', 'BTCDOMUSD'].includes(symbol)), eligibilitySymbols.join(','));
assert('manual base-symbol exclusions are respected', !eligibilitySymbols.includes('BTCUSDT'), eligibilitySymbols.join(','));

const retainedInitial = calcMarketIndex(makeTickerMap(), null, { maxConstituents: 10 }, {});
const churnMap = makeTickerMap();
churnMap.DOTUSD.usdVol24h = 500000;
churnMap.NEARUSD = { price: 100, usdVol24h: 510000, change24h: 0, fundingRate: 0, oi: 1000000 };
const retained = calcMarketIndex(churnMap, retainedInitial, { maxConstituents: 10 }, {});
assert('retention buffer keeps prior constituent at rank 11', retained.topCoins.some(coin => coin.sym === 'DOTUSD'), retained.topCoins.map(coin => coin.sym).join(','));

const chartShellText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/parts/chart-workspace/03-render-shells.jsfrag'), 'utf8');
const chartEngineText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/chart-engine.js'), 'utf8');
const chartModelText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/parts/chart-workspace/02-model-and-order-context.jsfrag'), 'utf8');
const chartEventsText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/parts/chart-workspace/04-surface-events.jsfrag'), 'utf8');
const shellEntryText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/01-shell.js'), 'utf8');
const chartStateText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/parts/chart-workspace/01-state-and-fetch.jsfrag'), 'utf8');
assert('FWD100 chart workspace uses real Lightweight Charts container', chartShellText.includes('data-ds-lwc-chart="${chartId}"') && !chartShellText.includes('buildFwdIndexChart'));
assert('FWD100 chart engine uses normal OHLC and volume path', chartEngineText.includes('const isSyntheticIndex = payload.dataset?.syntheticIndex === true') && !chartEngineText.includes('LightweightCharts.AreaSeries') && chartEngineText.includes("priceSeries.setData(chartType === 'line'") && chartEngineText.includes('if (active.volume)'));
assert('FWD100 chart button opens daily EMA OBV candle view', shellEntryText.includes("openD10SyntheticChart('FWD100'") && shellEntryText.includes('symbol: normalizedSymbol') && shellEntryText.includes("preset: isMetricSymbol ? 'clean' : 'ema_obv'") && shellEntryText.includes("chartType: isMetricSymbol ? 'line' : 'candles'") && shellEntryText.includes("timeframe: '1d'") && shellEntryText.includes('visibleCandleCount: 520'));
assert('FWD100 metric chart symbols use stored scan history', chartStateText.includes("FWD100-FUNDING") && chartStateText.includes("FWD100-BREADTH") && chartStateText.includes("FWD100-BREATH") && chartStateText.includes("FWD100-AD") && chartModelText.includes('buildFwdIndexMetricCandles') && chartModelText.includes('fundingCrowdingIndex') && chartModelText.includes('fundingStressPct') && chartModelText.includes('breadthPct') && chartModelText.includes('advanceDeclineRatio') && chartModelText.includes('syntheticMetric') && shellEntryText.includes('data-d10-synthetic-chart="FWD100-FUNDING"') && shellEntryText.includes('data-d10-synthetic-chart="FWD100-BREADTH"') && shellEntryText.includes('data-d10-synthetic-chart="FWD100-AD"'));
assert('FWD100 metric charts stay clean and skip invalid legacy history', chartEventsText.includes('chartStateForDataset') && chartEventsText.includes("chartType: 'line'") && chartEventsText.includes('buildCleanIndicatorState({ volume: false })') && chartEventsText.includes("chartType === 'line' ? 'candles' : chartType") && chartModelText.includes('rawValue === undefined || rawValue === null ? null') && chartModelText.includes('!hasConstituentCounts && parsedBreadthPct <= 0') && chartModelText.includes('capValue: 10'));
assert('FWD100 metric charts explain themselves', chartModelText.includes('guide:') && chartModelText.includes('0-20 calm') && chartModelText.includes('75+ extreme') && chartModelText.includes('70+ strong bullish') && chartModelText.includes('Display is capped at 10') && chartShellText.includes('buildFwdIndexMetricGuide') && chartShellText.includes('ds-metric-guide-main') && chartShellText.includes('ds-metric-guide-zones'));
assert('Markets chart includes compact market bias panel', chartShellText.includes('buildMarketDecisionPanel') && chartShellText.includes('Market Bias') && chartShellText.includes('Prefer long scanner setups') && chartShellText.includes('Do not chase longs'));
assert('chart supports weekly timeframe for regular symbols', chartShellText.includes('chartResolutions.map') && chartStateText.includes("'1w'") && chartStateText.includes("'1w': '1W'"));
assert('clicking chart candles shows date and OHLC readout', chartEngineText.includes('showPinnedCandleReadout') && chartEngineText.includes('formatCandleDate') && chartEngineText.includes('ds-candle-click-readout'));
assert('FWD index daily builder ranks historical candles by liquidity and anchors to live index', chartModelText.includes('historical_daily_liquidity_ranked') && chartModelText.includes('dollarVolume') && chartModelText.includes('fwdIndexConfiguredCount') && chartModelText.includes('targetClose / lastClose'));
assert('regular charts show FWD index correlation and compare overlay', chartModelText.includes('buildIndexCorrelation') && chartModelText.includes('buildIndexComparison') && chartShellText.includes('buildIndexCorrelationStrip') && chartShellText.includes('Compare Index') && chartEventsText.includes('indexComparison') && chartEngineText.includes('indexComparisonData'));

if (process.exitCode) process.exit(process.exitCode);
