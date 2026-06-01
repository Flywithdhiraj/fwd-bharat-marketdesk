'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bg = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/05-v16-capabilities.js'), 'utf8');
const infra = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/00-infra.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/05-settings-webhooks-helpers.js'), 'utf8');
const pane = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/06-pane-templates.js'), 'utf8');

const checks = [
 {
  name: 'DCA can average into same-side filled positions only',
  pass: bg.includes('allowDcaSameSidePosition')
  && bg.includes('payload?.isDcaBot === true')
  && bg.includes('position.side === requestedPositionSide')
  && bg.includes("v16FormatDuplicateEntryReason(symbol, 'a pending/open entry order')"),
 },
 {
  name: 'DCA monitor reconciles pending/live/closed lifecycle',
  pass: bg.includes('async function dcaReconcileCycle')
  && bg.includes("nextEntry.status = 'live'")
  && bg.includes("nextEntry.status = 'pending'")
  && bg.includes("const finalStatus = Number(nextEntry.positionSeenAt || 0) > 0 || context.recentCloseOrder ? 'closed' : 'cancelled'"),
 },
 {
  name: 'DCA realized losses feed daily auto-trade loss guard',
  pass: bg.includes('async function dcaRecordDailyLoss')
  && bg.includes('autoTradeDailyLoss: updatedLoss')
  && bg.includes('await v16ArmAutoTradeDailyLossKillSwitch(updatedLoss, cfg.dailyLossLimitUSD, now)')
  && bg.includes('Daily loss guard active:'),
 },
 {
  name: 'DCA daily spend uses actual placed notional',
  pass: bg.includes('const actualNotional = Number(result?.preview?.estimatedNotional')
  && bg.includes('actualNotionalUSD: actualNotional')
  && bg.includes('dailySpentUSD: Number((Number(state.dailySpentUSD || 0) + actualNotional).toFixed(4))'),
 },
 {
  name: 'disabled DCA alarm runs only while active lifecycle exists',
  pass: infra.includes('hasActiveCycle')
  && infra.includes("['placed', 'pending', 'live', 'monitoring_disabled'].includes(status)")
  && !infra.includes('Date.now() - (7 * 24 * 60 * 60 * 1000)'),
 },
 {
  name: 'settings panel renders DCA lifecycle list',
  pass: pane.includes('sDcaBotCycleList')
  && settings.includes('function renderDcaCycleList')
  && settings.includes("settingsEscapeHtml")
  && settings.includes("class=\"dca-cycle-row\""),
 },
];

const failed = checks.filter(check => !check.pass);
checks.forEach(check => {
 console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
});

if (failed.length) {
 process.exitCode = 1;
}
