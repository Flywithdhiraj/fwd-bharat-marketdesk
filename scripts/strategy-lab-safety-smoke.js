'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const popupText = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/09-strategy-lab.js'), 'utf8');

function assert(name, condition) {
 if (!condition) {
  console.error(`FAIL ${name}`);
  process.exitCode = 1;
  return;
 }
 console.log(`PASS ${name}`);
}

assert('early opportunity builds consensus from scanner directions', popupText.includes('function labConsensusFromRows') && popupText.includes('mixedConflict') && popupText.includes('longCount') && popupText.includes('shortCount'));
assert('early opportunity blocks mixed long short rows from leading', popupText.includes('labCanLeadBestRead') && popupText.includes('row.raw?.consensus?.mixedConflict') && popupText.includes('Conflict - verify manually'));
assert('strategy lab marks stale scanner rows and blocks stale best reads', popupText.includes('STRATEGY_LAB_ROW_STALE_MS') && popupText.includes('function labRowFreshness') && popupText.includes('staleSource') && popupText.includes('Stale - rerun scan'));
assert('strategy lab polling watches unified and main scan active state', popupText.includes('strategyLabUnifiedScanStatus') && popupText.includes('strategyLabAutoScan') && popupText.includes('scanActive') && popupText.includes('snapshot?.current?.unifiedStatus?.active'));
assert('radar auto refresh requires fresh shared context', popupText.includes('function labHasFreshSharedScanContext') && popupText.includes('scanContextMeta') && popupText.includes('if (!labHasFreshSharedScanContext(strategyLabSnapshot)) return;'));
assert('chart review drafts are explicitly research only', popupText.includes('markStrategyResearchDraft') && popupText.includes('researchDraftOnly: true') && popupText.includes("sourceWorkspace: 'strategy_lab'") && popupText.includes('canPlaceOrder: false'));
assert('generic outcome tracker exists beyond radar replay', popupText.includes('STRATEGY_LAB_OUTCOME_KEY') && popupText.includes('strategyLabOutcomeTrackerV1') && popupText.includes('recordStrategyOutcomeReview') && popupText.includes('buildStrategyOutcomePanel'));
assert('chart review starts outcome tracking for scanner labs', popupText.includes('recordStrategyOutcomeReview(selected);') && popupText.includes('chartTradingDraft: buildStrategyChartReviewDraft(selected)'));
assert('stock strategy lab provides 1D trend and 90 day 15m entry handoffs', popupText.includes('STRATEGY_LAB_ENTRY_TIMEFRAME') && popupText.includes('STRATEGY_LAB_ENTRY_VISIBLE_CANDLES = 90 * 24 * 4') && popupText.includes('data-strategy-entry-chart') && popupText.includes('Entry 15m'));
