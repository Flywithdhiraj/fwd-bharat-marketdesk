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

runScript('src/renderer/scripts/shared/strategy-registry.js');
runScript('src/renderer/scripts/background/10-radar-scanner.js');

const radar = sandbox.FWDTradeDeskRadarScanner;
const strategies = sandbox.FWDTradeDeskStrategies;

function makeCandles(count, options = {}) {
 const candles = [];
 let close = Number(options.start || 0.1);
 const step = Number(options.step || 0.001);
 const volumeBase = Number(options.volume || 1000);
 for (let i = 0; i < count; i += 1) {
  close = Math.max(0.000001, close + step);
  const spike = i === count - 1 ? Number(options.finalSpike || 1) : 1;
  const highExtra = i === count - 1 ? Number(options.finalHighExtra || 0) : 0;
  const finalClose = i === count - 1 && options.finalClose ? Number(options.finalClose) : close;
  candles.push({
   time: 1700000000 + i * 900,
   open: finalClose * 0.995,
   high: finalClose * (1.006 + highExtra),
   low: finalClose * 0.992,
   close: finalClose,
   volume: volumeBase * spike,
   quoteVolume: finalClose * volumeBase * spike,
  });
 }
 return candles;
}

function makeDownCandles(count) {
 const candles = [];
 let close = 0.4;
 for (let i = 0; i < count; i += 1) {
  close *= i === count - 1 ? 0.93 : 0.997;
  candles.push({
   time: 1700000000 + i * 900,
   open: close * 1.004,
   high: close * 1.01,
   low: close * 0.99,
   close,
   volume: i === count - 1 ? 9000 : 1200,
   quoteVolume: close * (i === count - 1 ? 9000 : 1200),
  });
 }
 return candles;
}

const firstSeen = radar.radarBuildFirstSeenMap(['AAAUSD'], {}, 1700000000000);
const breakoutCandles = makeCandles(130, { start: 0.1, step: 0.001, finalSpike: 5, finalHighExtra: 0.03 });
const breakout = radar.radarAnalyzeSymbol('AAAUSD', breakoutCandles, makeCandles(80, { start: 0.08, step: 0.002 }), {
 price: breakoutCandles[breakoutCandles.length - 1].close * 1.04,
 change24h: 8.2,
 usdVol24h: 1200000,
 fundingRate: 0.01,
 oi: 500000,
}, {
 settings: radar.RADAR_DEFAULT_SETTINGS,
 firstSeenTs: Date.now() - 86400000,
});
const pressureCandles = makeDownCandles(120);
const pressure = radar.radarAnalyzeSymbol('BBBUSD', pressureCandles, makeDownCandles(60), {
 price: pressureCandles[pressureCandles.length - 1].close,
 change24h: -11.4,
 usdVol24h: 900000,
 fundingRate: -0.08,
 oi: 250000,
}, {
 settings: radar.RADAR_DEFAULT_SETTINGS,
 firstSeenTs: Date.now() - 10 * 86400000,
});
const newCoin = radar.radarAnalyzeSymbol('NEWUSD', makeCandles(20, { start: 0.02, step: 0.002, finalSpike: 3 }), makeCandles(8, { start: 0.015, step: 0.002 }), {
 price: 0.065,
 change24h: 18,
 usdVol24h: 110000,
 fundingRate: 0,
 oi: 25000,
}, {
 settings: radar.RADAR_DEFAULT_SETTINGS,
 firstSeenTs: Date.now() - 3600000,
});
const counts = radar.radarSignalCounts([breakout, pressure, newCoin]);
const scoreParts = radar.radarBuildScoreParts({ base: 35, volume: 7, ema: 12, liquidityPenalty: -18 });
const replay = radar.radarUpdateReplayTracker([breakout], {
 [breakout.symbol]: { price: breakout.entry * 1.03 },
}, {}, radar.RADAR_DEFAULT_SETTINGS);
const sorted = radar.radarSortRows([
 { symbol: 'X', eventType: 'review', score: 95 },
 { symbol: 'Y', eventType: 'breakout', score: 70 },
 { symbol: 'Z', eventType: 'pressure', score: 80 },
]).map(row => row.symbol).join(',');
const radarText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/10-radar-scanner.js'), 'utf8');
const registryText = fs.readFileSync(path.join(root, 'src/renderer/scripts/shared/strategy-registry.js'), 'utf8');
const wizardText = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/08-wizard-scanner.js'), 'utf8');
const popupText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/09-strategy-lab.js'), 'utf8');
const popupBootstrapText = fs.readFileSync(path.join(root, 'src/renderer/popup.js'), 'utf8');
const chartWorkspaceText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/07-chart-workspace.js'), 'utf8');

assert('registry exposes live radar strategy', strategies.getStrategy('radar').id === 'radar');
assert('radar strategy is scanner only advisory', strategies.getStrategy('radar').mode === 'scanner_only' && strategies.getStrategy('radar').canLiveTrade === false);
assert('first seen map stores new symbols', firstSeen.AAAUSD === 1700000000000);
assert('breakout fixture creates an actionable radar row', breakout.strategyId === 'radar' && ['breakout', 'ema_obv', 'new_coin'].includes(breakout.eventType) && breakout.canLiveTrade === false);
assert('pressure fixture detects downside pressure', pressure.eventType === 'pressure' && String(pressure.direction).includes('short'));
assert('new coin fixture keeps short-history opportunity visible', newCoin.raw.isShortHistory === true && ['new_coin', 'avoid_trap'].includes(newCoin.eventType));
assert('radar rows include score explanation data', Array.isArray(breakout.raw.scoreParts.rows) && breakout.raw.scoreParts.rows.length > 0);
assert('radar scanner excludes unavailable crypto funding input', !radarText.includes('Funding pressure') && !radarText.includes('highFundingAbs') && !radarText.includes('fundingRate'));
assert('radar rows include new coin timeline when short history', newCoin.raw.newCoinTimeline && newCoin.raw.newCoinTimeline.firstPrice > 0);
assert('radar avoid trap data is explicit', pressure.raw.avoidTrap && Array.isArray(pressure.raw.avoidTrap.reasons));
assert('radar counts include event buckets', counts.pressure >= 1 && counts.new_coin >= 0 && counts.buy >= 0);
assert('score parts preserve positive and negative contributions', scoreParts.rows.some(row => row.value > 0) && scoreParts.rows.some(row => row.value < 0));
assert('replay tracker stores advisory rows without live trading', replay.summary.tracked >= 1 && replay.tracker[Object.keys(replay.tracker)[0]].symbol === breakout.symbol);
assert('radar sort prioritizes live events over review', sorted === 'Y,Z,X');
assert('radar storage is namespaced', radarText.includes("'strategyResults.radar'") && radarText.includes("'strategyStatus.radar'") && registryText.includes("resultKey: 'strategyResults.radar'"));
assert('radar scanner does not write current scanResults key', !/chrome\.storage\.local\.set\(\s*\{[^}]*scanResults\s*:/m.test(radarText));
assert('strategy snapshot includes radar rows', wizardText.includes("'strategyResults.radar'") && wizardText.includes('radar:'));
assert('strategy lab UI includes radar filters and alerts', popupText.includes("activeStrategyLabId === 'radar'") && popupText.includes("['new', 'New Symbols']") && popupText.includes("'ema_obv'"));
assert('strategy lab exposes new coin filter for all scanner labs', popupText.includes('function labIsNewCoinRow') && popupText.includes('const addNewCoinMode = modes =>') && popupText.includes("if (strategyLabViewMode === 'new') return applyStrategyQualityFilters(rows.filter(labIsNewCoinRow));"));
assert('strategy lab UI includes scanner-wide simple notification toggle', popupText.includes('buildRadarAlertCenter') && popupText.includes('btnStrategyLabNotificationToggle') && popupText.includes('strategyLabScannerNotificationsEnabled') && popupText.includes('Notifications On') && popupText.includes('Notifications Off'));
assert('radar notifications only interrupt for armed material upgrades', radarText.includes('radarShouldInterruptForSetup') && radarText.includes('strategyLabScannerNotificationsEnabled') && radarText.includes('strategyLabRadarNotificationsEnabled') && radarText.includes('strategyLabRadarLastNotificationState') && radarText.includes('next.score >= Number(prior.score || 0) + 8') && radarText.includes('Number(row.score || 0) >= 78'));
assert('strategy lab UI includes chart draft handoff', popupText.includes('buildRadarChartDraft') && popupText.includes('data-radar-chart-draft'));
assert('strategy lab keeps plain help visible for scanner-only rows', popupText.includes('data-strategy-help') && popupText.includes('buildPlainHelpPanel') && popupText.includes('Why shown:'));
assert('strategy lab is research only by default', popupText.includes("let activeStrategyLabId = 'early'") && popupText.includes('No auto-trade and no paper-trade actions belong in this workspace.') && popupText.includes("String(strategy.id || '').toLowerCase() !== 'current'"));
assert('strategy lab includes research dashboard and scorecard', popupText.includes('buildStrategyResearchDashboard') && popupText.includes('buildStrategyScorecard') && popupText.includes('Daily research board') && popupText.includes('Strategy scorecard'));
assert('strategy lab includes compare mode and watchlist builder', popupText.includes('buildStrategyComparePanel') && popupText.includes('Compare mode') && popupText.includes('strategyLabResearchWatchlist') && popupText.includes('Save to review'));
assert('strategy lab includes quality filters and 1D chart review actions', popupText.includes('buildStrategyQualityBar') && popupText.includes('data-strategy-min-score') && popupText.includes('data-strategy-chart-review') && popupText.includes('buildGenericChartDraft') && popupText.includes('STRATEGY_LAB_REVIEW_TIMEFRAME') && popupText.includes('STRATEGY_LAB_REVIEW_VISIBLE_CANDLES'));
assert('strategy lab shares long short direction badges across scanner rows', popupText.includes('function labDirectionBadge') && popupText.includes('function labDirectionClass') && popupText.includes('labSymbolWithDirection(row)') && popupText.includes('strategy-direction-badge'));
assert('strategy lab includes local-only early opportunity mode', popupText.includes("let activeStrategyLabId = 'early'") && popupText.includes('labEarlyOpportunityRows') && popupText.includes('Early Opportunity') && popupText.includes('Run From Saved Data') && popupText.includes("action: 'strategy-lab:deriveFromLatestScan'"));
assert('early opportunity mode explains confirm and reject levels', popupText.includes('Confirm / Reject') && popupText.includes('Confirms when') && popupText.includes('Rejects if') && popupText.includes('chartLevels'));
assert('chart workspace preserves provided chart trading draft', chartWorkspaceText.includes('providedDraft') && chartWorkspaceText.includes("chartTradingMode: providedDraft ? 'adjust' : 'select'"));
assert('chart review can open without leaving scanner or strategy', chartWorkspaceText.includes('SURFACE_REVIEW') && chartWorkspaceText.includes('mountChartReviewOverlay') && popupBootstrapText.includes('options.overlay !== false'));
assert('chart review wrapper respects requested daily recent window', popupBootstrapText.includes('options.timeframe || signal?.timeframe') && popupBootstrapText.includes('requestedVisibleCount > 0 ? requestedVisibleCount : (openAsOverlay ? 120 : undefined)') && !popupBootstrapText.includes('visibleCandleCount: openAsOverlay ? 20000 : undefined'));
assert('quick chart review keeps compact recent-candle controls', chartWorkspaceText.includes('QUICK VIEW |') && chartWorkspaceText.includes('buildQuickReviewControls') && !chartWorkspaceText.includes('data-ds-chart-all-candles="1"') && chartWorkspaceText.includes("tfButton('4h', '4H')") && chartWorkspaceText.includes("navButton('zoom-out'") && chartWorkspaceText.includes('const reviewClose = state.chartReviewOverlayOpen') && chartWorkspaceText.includes('buildChartIndicatorMenu(state)') && chartWorkspaceText.includes('!isReview && !isJournalMode && isAdvancedSurface && state.symbol'));
