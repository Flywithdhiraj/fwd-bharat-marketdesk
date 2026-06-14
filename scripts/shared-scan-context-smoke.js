'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const background = read('src/renderer/desktop-background.html');
const infra = read('src/renderer/scripts/background/00-infra.js');
const context = read('src/renderer/scripts/background/02-scan-context.js');
const scan = read('src/renderer/scripts/background/02-scan.js');
const runtime = read('src/renderer/scripts/background/04-runtime.js');
const lab = read('src/renderer/scripts/popup/09-strategy-lab.js');
const candleCache = read('src/main/candle-cache.js');
const ipcHandlers = read('src/main/ipc-handlers.js');
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
  name: 'context service restores durable metadata and candles from local storage',
  pass: context.includes('let latestContext = null')
   && context.includes('lastMainScanContextMeta')
   && context.includes("const DURABLE_CONTEXT_KEY = 'lastMainScanContextSnapshotV1'")
   && context.includes("const COMPLETED_CONTEXT_KEY = 'lastCompletedMainScanContextSnapshotV1'")
   && context.includes('loadPersistentCandleCacheRecord(symbol, resolution)')
   && context.includes('restoreDurable().catch(() => {})')
   && !context.includes('chrome.storage.local.set({ candles'),
 },
 {
  name: 'local candle cache can enumerate saved symbols for context repair',
  pass: candleCache.includes('async function list(options = {})')
   && ipcHandlers.includes("type === 'candle_list'")
   && infra.includes('async function v17ListPersistentCandleCache')
   && infra.includes('globalThis.v17ListPersistentCandleCache = v17ListPersistentCandleCache'),
 },
 {
  name: 'incomplete contexts rebuild scanner inputs from saved candles',
  pass: context.includes('hydrateContextFromLocalCandles')
   && context.includes("v17ListPersistentCandleCache('1d')")
   && context.includes('bestAvailableContext()')
   && context.includes('context.tickerMap[symbol] =')
   && context.includes('Promise.all(symbols.slice(index, index + batchSize).map(hydrateSymbol))'),
 },
 {
  name: 'completed scanner totals use the eligible candidate count',
  pass: scan.includes('requested: deepTotal')
   && scan.includes('totalStocks: deepTotal, scannedStocks: deepTotal')
   && scan.includes('sourceCount: Number(universeMeta.count || products.length || 0)'),
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
   && scan.includes('completedRows < deepTotal')
   && scan.includes('STRATEGY_LAB_PARTIAL_DERIVE_MIN_MS')
   && scan.includes("source: 'partial_checkpoint'")
   && scan.includes('scanResults,')
   && context.includes('partial: !!context.partial')
   && runtime.includes('markScanStoppedWithPartialFallback'),
 },
 {
 name: 'strategy lab labels partial checkpoint derivations',
 pass: context.includes('Deriving Strategy Lab from partial scanner checkpoint')
  && context.includes('Strategy Lab derived from partial scanner checkpoint')
  && lab.includes("'Data state'")
  && lab.includes('Partial ${contextProgress}'),
 },
 {
  name: 'scan deadline prevents stale long-running scans',
  pass: runtime.includes('50 * 60 * 1000')
   && runtime.includes('runScanWithDeadline()')
   && runtime.includes('scanExecutionPromise')
   && runtime.includes('globalThis.scanAbortRequested = true;'),
 },
 {
  name: 'main scan persists and resumes completed symbols',
  pass: scan.includes("const SCAN_RESUME_CHECKPOINT_KEY = 'mainScanResumeCheckpointV1'")
   && scan.includes('saveScanResumeCheckpoint(candidates, strat')
   && scan.includes('readScanResumeCheckpoint(candidates, strat)')
   && scan.includes('completedSymbols.has(symbol)')
   && scan.includes('SCAN_CANDLE_TIMEOUT_MS = 4 * 60 * 1000'),
 },
 {
  name: 'failed and timed-out scans schedule automatic resume',
  pass: runtime.includes("const SCAN_RESUME_ALARM_NAME = 'scanResume'")
   && runtime.includes('scheduleScanResume(')
   && runtime.includes('alarm.name === SCAN_RESUME_ALARM_NAME')
   && runtime.includes("globalThis.scanAbortReason = 'deadline'"),
 },
 {
  name: 'strategy lab Run All derives only from saved local data',
  pass: lab.includes("action: 'strategy-lab:deriveFromLatestScan'")
   && lab.includes('Run From Saved Data')
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
 name: 'scan completes before final Strategy Lab derivation',
 pass: !scan.includes("deriveAll?.({ includeNative: false, source: 'main_scan_complete' })")
  && runtime.includes('.then(() => runStrategyLabAutoScans())')
  && runtime.includes('kickStrategyLabDeriveAfterManualScan'),
},
{
 name: 'Strategy Lab derivations are serialized and retain same-scan rows',
 pass: context.includes('let deriveQueue = Promise.resolve()')
  && context.includes('cloneContextForDerive')
  && context.includes('runStrategyDerive')
  && context.includes('mergeStrategyRows(previous.rows, result)')
  && context.includes('Superseded by newer scan checkpoint'),
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
{
 name: 'individual scanner actions restore durable local context',
 pass: context.includes('async function getAvailable()')
  && wizard.includes('FWDTradeDeskScanContext?.getAvailable?.()')
  && stage.includes('FWDTradeDeskScanContext?.getAvailable?.()')
  && radar.includes('FWDTradeDeskScanContext?.getAvailable?.()')
  && reversal.includes('FWDTradeDeskScanContext?.getAvailable?.()')
  && darvas.includes('FWDTradeDeskScanContext?.getAvailable?.()')
  && pullback.includes('FWDTradeDeskScanContext?.getAvailable?.()'),
},
];

const failed = checks.filter(check => !check.pass);
checks.forEach(check => console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`));
if (failed.length) process.exitCode = 1;
