const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const service = read('src/main/dhan-data-service.js');
const cache = read('src/main/candle-cache.js');
const settings = read('src/renderer/scripts/popup/05-settings-webhooks-helpers.js');
const template = read('src/renderer/scripts/popup/06-pane-templates.js');

assert(service.includes('async function runEquityHistoryBackfill'));
assert(service.includes("resolution: '1d'"));
assert(service.includes('DHAN_HISTORICAL_MAX_HISTORY_DAYS'));
assert(service.includes('aggregateDailyCandlesToWeekly'));
assert(service.includes("resolution: '1w'"));
assert(service.includes('completedFullHistoricalRequest'));
assert(service.includes("cacheResolution === '1d'"));
assert(service.includes("resolution: '1w'"));
assert(service.includes("action === 'equity_history_backfill_start'"));
assert(service.includes("action === 'equity_history_backfill_status'"));
assert(service.includes("action === 'equity_history_backfill_cancel'"));
assert(service.includes('backfilledAt'));
assert(cache.includes('coverageStart'));
assert(cache.includes('MAX_CANDLE_FILES = 12000'));
assert(settings.includes('renderHistoryBackfillStatus'));
assert(settings.includes('yearly batch'));
assert(template.includes('Daily + Weekly Historical Backfill'));
assert(template.includes('All NSE Stocks'));

console.log('Equity history backfill smoke checks passed.');
