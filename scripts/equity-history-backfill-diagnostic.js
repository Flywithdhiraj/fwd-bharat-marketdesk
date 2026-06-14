const { app, safeStorage } = require('electron');
const path = require('path');
const { createCandleCache } = require('../src/main/candle-cache');
const { createCredentialStore } = require('../src/main/credential-store');
const { createDhanDataService } = require('../src/main/dhan-data-service');

const PRODUCT_NAME = 'FWD Bharat MarketDesk';
const DEFAULT_WINDOWS_HOME = 'D:\\Office Work Backup\\Automation\\Dhan Trading data and App';

function candleDate(time = 0) {
 return Number(time || 0) > 0 ? new Date(Number(time) * 1000).toISOString().slice(0, 10) : '';
}

async function wait(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
 const symbol = String(process.argv[2] || 'RELIANCE').trim().toUpperCase();
 app.setName(PRODUCT_NAME);
 app.setPath('userData', process.platform === 'win32'
  ? path.join(String(process.env.FWD_BHARAT_MARKETDESK_HOME || '').trim() || DEFAULT_WINDOWS_HOME, 'Data')
  : path.join(app.getPath('appData'), PRODUCT_NAME));
 await app.whenReady();

 const errorJournal = {
  append(scope, error, detail = {}) {
   console.error(`[${scope}] ${error?.message || error}`, detail);
  },
 };
 const credentialStore = createCredentialStore({ app, safeStorage, errorJournal });
 const candleCache = createCandleCache({ app, errorJournal });
 const service = createDhanDataService({ app, credentialStore, errorJournal, candleCache });

 await service.handle({
  action: 'equity_history_backfill_start',
  universe: 'fno_stocks',
  symbols: [symbol],
  force: true,
 });

 let status = null;
 for (;;) {
  const response = await service.handle({ action: 'equity_history_backfill_status' });
  status = response?.status || {};
  console.log(`${status.completed || 0}/${status.total || 0} ${status.currentSymbol || symbol} ${status.currentChunk || 0}/${status.currentChunks || 0}`);
  if (!status.running) break;
  await wait(1000);
 }

 const daily = await candleCache.get(symbol, '1d');
 const weekly = await candleCache.get(symbol, '1w');
 console.log(JSON.stringify({
  status,
  daily: {
   rows: daily.rows?.length || 0,
   firstDate: candleDate(daily.rows?.[0]?.time),
   lastDate: candleDate(daily.rows?.[daily.rows.length - 1]?.time),
   backfilledAt: daily.backfilledAt || 0,
  },
  weekly: {
   rows: weekly.rows?.length || 0,
   firstDate: candleDate(weekly.rows?.[0]?.time),
   lastDate: candleDate(weekly.rows?.[weekly.rows.length - 1]?.time),
   backfilledAt: weekly.backfilledAt || 0,
  },
 }, null, 2));
 app.exit(status.errors?.length || !daily.rows?.length || !weekly.rows?.length ? 1 : 0);
}

main().catch(error => {
 console.error(error?.stack || error?.message || String(error));
 app.exit(1);
});
