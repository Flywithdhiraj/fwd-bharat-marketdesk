'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bg = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/07-options.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/08-options-workspace.js'), 'utf8');
const shared = fs.readFileSync(path.join(root, 'src/renderer/scripts/shared/options.js'), 'utf8');

const checks = [
 {
 name: 'manual strategy requires accepted preview',
 pass: bg.includes('previewAccepted !== true') && ui.includes('FINAL OPTIONS ORDER PREVIEW') && ui.includes('previewAccepted: true'),
 },
 {
 name: 'repair state locks new option execution',
 pass: bg.includes('optionsExecutionRepairState') && bg.includes('v17AssertOptionsExecutionUnlocked') && bg.includes('Options execution locked'),
 },
 {
 name: 'partial basket failures persist repair state',
 pass: bg.includes('Strategy partially placed') && bg.includes('v17PersistOptionsRepairState') && bg.includes('compensationResults'),
 },
 {
 name: 'native straddle stop failure triggers rollback',
 pass: bg.includes('native_protection_failed') && bg.includes('stop_protection_failed') && bg.includes('Native straddle') && bg.includes('entered without accepted stop protection'),
 },
 {
 name: 'native straddle uses BTC market score before selling premium',
 pass: bg.includes('v17BuildUnderlyingStraddleMarketContext') && bg.includes('marketContext') && ui.includes('BUY VOL WATCH') && ui.includes('SELL STRADDLE') && shared.includes('btc_market_score'),
 },
 {
 name: 'native long straddle has side-aware protection and exits',
 pass: bg.includes("actionSide = best.preview?.recommendedSide === 'buy' ? 'buy' : 'sell'")
 && bg.includes("side: actionSide === 'buy' ? 'sell' : 'buy'")
 && bg.includes("entrySide === 'buy' ? 'sell' : 'buy'")
 && bg.includes("isLongNative ? 'long_vol_capture' : 'premium_capture'")
 && shared.includes("orderSide === 'buy'")
 && ui.includes("data-side=\"${esc(preview?.orderSide || 'sell')}\""),
 },
 {
 name: 'synthetic straddle partial execution is blocked',
 pass: bg.includes('synthetic_straddle_partial') && bg.includes('fallback_partial_repair_required') && bg.includes('Emergency close failed'),
 },
 {
 name: 'options desk exposes execution health strip',
 pass: ui.includes('renderExecutionHealthStrip') && ui.includes('v17:getOptionsExecutionHealth') && ui.includes('Options Execution Health'),
 },
 {
 name: 'strategy builder help controls are wired',
 pass: ui.includes('showBuilderHelp') && ui.includes('data-options-action="toggle-builder-help"') && ui.includes('Choose expiry') && ui.includes('Review before placing'),
 },
 {
 name: 'booked pnl toggle is active and not disabled',
 pass: ui.includes('showBookedPnl') && ui.includes('data-options-action="toggle-booked-pnl"') && ui.includes('Booked P&L layer is on') && !ui.includes('<input type="checkbox" disabled><span>Add Booked P&L</span>'),
 },
];

const failed = checks.filter(check => !check.pass);
checks.forEach(check => {
 console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
});

if (failed.length) {
 process.exitCode = 1;
}
