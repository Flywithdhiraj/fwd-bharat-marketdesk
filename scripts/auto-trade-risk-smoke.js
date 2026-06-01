'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bg = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/05-v16-capabilities.js'), 'utf8');
const riskPane = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/parts/v16-capabilities/08-panes-bindings-init-and-var.jsfrag'), 'utf8');

const checks = [
 {
  name: 'risk pane treats stored daily loss as positive usage',
  pass: riskPane.includes('const dailyLossUsed = Math.max(0, Number(store?.autoTradeDailyLoss || 0));')
  && !riskPane.includes('Math.abs(Math.min(Number(store?.autoTradeDailyLoss || 0), 0))'),
 },
 {
  name: 'daily loss kill switch remains armed until next local day',
  pass: bg.includes("reason: 'daily-loss-lock-active-until-next-day'")
  && bg.includes('const todayStart = v16BgStartOfLocalDay(now);')
  && bg.includes('triggeredAt >= todayStart'),
 },
 {
  name: 'paper ledger validates the reversed execution signal',
  pass: bg.includes('const executionSignal = v16BuildExecutionSignal(signal, safeCfg);')
  && bg.includes('const signalGate = v16EvaluateAutoTradeSignalGate(executionSignal, safeCfg);')
  && bg.includes('const entryTrigger = resolveEntryTrigger(executionSignal, safeCfg);')
  && bg.includes('const riskQuality = resolveRiskQualityGate(executionSignal, safeCfg);')
  && bg.includes('const trade = normalizeShadowTrade(executionSignal, entryTrigger, now);'),
 },
 {
  name: 'live auto-trade gates validate the same signal that will be ordered',
  pass: bg.includes('const signalGate = v16EvaluateAutoTradeSignalGate(executionSignal, cfg);')
  && bg.includes('const entryTrigger = resolveEntryTrigger(executionSignal, cfg);')
  && bg.includes('const riskQuality = resolveRiskQualityGate(executionSignal, cfg);')
  && bg.includes('s.autoTradePreparedExecutionSignal = executionSignal;')
  && bg.includes('signal?.autoTradePreparedExecutionSignal || v16BuildExecutionSignal(signal, cfg)'),
 },
];

const failed = checks.filter(check => !check.pass);
checks.forEach(check => {
 console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
});

if (failed.length) {
 process.exitCode = 1;
}
