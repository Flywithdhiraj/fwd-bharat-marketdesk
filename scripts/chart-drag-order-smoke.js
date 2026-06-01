const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const chartBundle = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/07-chart-workspace.js'), 'utf8');
const v16Bundle = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/06-v16-capabilities.js'), 'utf8');

const requiredChartTokens = [
  'nearestAdjustableChartLine',
  'findChartDragLineFromEvent',
  'requestChartDragConfirmation',
  'confirmChartDragChange',
  'openChartLiveModifyAfterDrag',
  'validateChartDragPrice',
  'data-ds-chart-line-order-id',
  'data-ds-chart-line-price',
  'session.originalDraft',
  'chartTradingDraft: session.originalDraft || null',
  'hitRoot.setPointerCapture',
  'amountLabel',
  'openV16OpenOrderEditor',
  'openV16ProtectionOrderPreview',
  'Limited candle history',
  'The chart can still render, but indicators need more history.',
  'MAX_15M_HISTORY_DAYS = 90',
  "timeframe === '15m' ? MAX_15M_HISTORY_CANDLES : MAX_RENDER_CANDLES",
];

const requiredV16Tokens = [
  'globalThis.openV16OpenOrderEditor = openV16OpenOrderEditor',
  'globalThis.openV16ProtectionOrderPreview = openV16ProtectionOrderPreview',
];

const missingChart = requiredChartTokens.filter(token => !chartBundle.includes(token));
const missingV16 = requiredV16Tokens.filter(token => !v16Bundle.includes(token));
if (missingChart.length || missingV16.length) {
  console.error('Chart drag order smoke failed.');
  if (missingChart.length) console.error('Missing chart bundle tokens:', missingChart.join(', '));
  if (missingV16.length) console.error('Missing v16 bundle tokens:', missingV16.join(', '));
  process.exit(1);
}

console.log('OK chart drag order editing smoke passed');
