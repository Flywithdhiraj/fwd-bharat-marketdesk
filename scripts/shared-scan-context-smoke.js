'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const background = read('src/renderer/desktop-background.html');
const context = read('src/renderer/scripts/background/02-scan-context.js');
const scan = read('src/renderer/scripts/background/02-scan.js');
const runtime = read('src/renderer/scripts/background/04-runtime.js');
const lab = read('src/renderer/scripts/popup/09-strategy-lab.js');
const wizard = read('src/renderer/scripts/background/08-wizard-scanner.js');
const stage = read('src/renderer/scripts/background/09-stage-scanner.js');
const radar = read('src/renderer/scripts/background/10-radar-scanner.js');
const reversal = read('src/renderer/scripts/background/11-reversal-scanner.js');
const darvas = read('src/renderer/scripts/background/12-darvas-scanner.js');
const pullback = read('src/renderer/scripts/background/14-pullback-scanner.js');

const checks = [
 {
  name: 'background loads shared scan context before main scan',
  pass: background.indexOf('scripts/background/02-scan-context.js') > -1
   && background.indexOf('scripts/background/02-scan-context.js') < background.indexOf('scripts/background/02-scan.js'),
 },
 {
  name: 'main scan records candle snapshots and finalizes context',
  pass: scan.includes('FWDTradeDeskScanContext?.create')
   && scan.includes('recordCandles?.(scanContext')
   && scan.includes('FWDTradeDeskScanContext?.finalize'),
 },
 {
  name: 'context service stores only latest memory context plus metadata',
  pass: context.includes('let latestContext = null')
   && context.includes('lastMainScanContextMeta')
   && !context.includes('chrome.storage.local.set({ candles'),
 },
 {
  name: 'auto-scan derives lab scanners from shared context',
  pass: runtime.includes('FWDTradeDeskScanContext?.deriveAll')
   && !runtime.includes('FWDTradeDeskWizardScanner?.runWizardScan?.()')
   && runtime.includes("msg.action === 'strategy-lab:runUnifiedScan'")
   && runtime.includes("msg.action === 'strategy-lab:deriveFromLatestScan'"),
 },
 {
  name: 'manual main scan also kicks shared Strategy Lab derivation',
  pass: runtime.includes('kickStrategyLabDeriveAfterManualScan')
   && runtime.includes('strategyLabDeriving: true'),
 },
 {
  name: 'scan creates partial checkpoints for Strategy Lab during long runs',
  pass: scan.includes('savePartialScanCheckpoint')
   && scan.includes('SCAN_PARTIAL_CHECKPOINT_EVERY')
   && context.includes('partial: !!context.partial')
   && runtime.includes('markScanStoppedWithPartialFallback'),
 },
 {
  name: 'scan deadline allows large Delta universes to finish',
  pass: runtime.includes('45 * 60 * 1000')
   && runtime.includes('runScanWithDeadline()')
   && !runtime.includes('runScan().finally'),
 },
 {
  name: 'strategy lab Run All uses unified main scan action',
  pass: lab.includes("action: 'strategy-lab:runUnifiedScan'")
   && !lab.includes('index * 450'),
 },
 {
  name: 'early opportunity derives freshness from shared scanner status',
  pass: lab.includes('function labEarlyOpportunityStatus')
   && lab.includes("activeStrategyLabId === 'early'")
   && lab.includes('scanContextMeta?.finishedAt'),
 },
 {
  name: 'scanner modules expose context derivation runners',
  pass: wizard.includes('runWizardScanFromContext')
   && stage.includes('runStageScanFromContext')
   && radar.includes('runRadarScanFromContext')
   && reversal.includes('runReversalScanFromContext')
   && darvas.includes('runDarvasScanFromContext')
   && pullback.includes('runPullbackScanFromContext')
   && context.includes('runPullbackScanFromContext'),
},
 {
  name: 'individual scanner actions require shared context unless explicitly independent',
  pass: wizard.includes('forceIndependent === true')
   && stage.includes('forceIndependent === true')
   && radar.includes('forceIndependent === true')
   && reversal.includes('forceIndependent === true')
   && darvas.includes('forceIndependent === true')
   && pullback.includes('forceIndependent === true'),
},
];

const failed = checks.filter(check => !check.pass);
checks.forEach(check => console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`));
if (failed.length) process.exitCode = 1;
