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

async function main() {
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
 const end = Date.now();
 const start = end - (3650 * 24 * 60 * 60 * 1000);

 const first = await service.handle({
  action: 'candles',
  symbol: 'SBIN',
  resolution: '1d',
  start,
  end,
  timeoutMs: 45000,
 });
 const stored = await candleCache.get('SBIN', '1d');
 const second = await service.handle({
  action: 'candles',
  symbol: 'SBIN',
  resolution: '1d',
  start,
  end,
  timeoutMs: 45000,
 });

 console.log(JSON.stringify({
  first: {
   ok: first.ok,
   apiCalls: first.apiCalls,
   rows: first.rows?.length || 0,
   firstDate: candleDate(first.rows?.[0]?.time),
   lastDate: candleDate(first.rows?.[first.rows.length - 1]?.time),
   incremental: first.incremental === true,
   error: first.error || '',
  },
  stored: {
   ok: stored.ok,
   path: candleCache.dir(),
   rows: stored.rows?.length || 0,
   firstDate: candleDate(stored.rows?.[0]?.time),
   lastDate: candleDate(stored.rows?.[stored.rows.length - 1]?.time),
  },
  second: {
   ok: second.ok,
   apiCalls: second.apiCalls,
   rows: second.rows?.length || 0,
   cached: second.cached === true,
   incremental: second.incremental === true,
  },
 }, null, 2));
 app.exit(first.ok && stored.ok && stored.rows?.length ? 0 : 1);
}

main().catch(error => {
 console.error(error?.stack || error?.message || String(error));
 app.exit(1);
});
