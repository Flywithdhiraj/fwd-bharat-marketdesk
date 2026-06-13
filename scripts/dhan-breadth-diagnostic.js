const { app, safeStorage } = require('electron');
const path = require('path');
const { createCredentialStore } = require('../src/main/credential-store');
const { createDhanDataService } = require('../src/main/dhan-data-service');

const PRODUCT_NAME = 'FWD Bharat MarketDesk';
const DEFAULT_WINDOWS_HOME = 'D:\\Office Work Backup\\Automation\\Dhan Trading data and App';

function countFeedRows(response = {}) {
 const root = response?.data?.data || response?.data || {};
 const segments = {};
 let total = 0;
 Object.entries(root || {}).forEach(([segment, rows]) => {
  const count = rows && typeof rows === 'object' ? Object.keys(rows).length : 0;
  segments[segment] = count;
  total += count;
 });
 return { total, segments };
}

async function main() {
 app.setName(PRODUCT_NAME);
 app.setPath('userData', process.platform === 'win32'
  ? path.join(String(process.env.FWD_BHARAT_MARKETDESK_HOME || '').trim() || DEFAULT_WINDOWS_HOME, 'Data')
  : path.join(app.getPath('appData'), PRODUCT_NAME));
 await app.whenReady();

 const errorJournal = {
  append(scope, error) {
   console.error(`[${scope}] ${error?.message || error}`);
  },
 };
 const credentialStore = createCredentialStore({ app, safeStorage, errorJournal });
 const service = createDhanDataService({ app, credentialStore, errorJournal });

 const credentials = await service.handle({ action: 'credentials_get' });
 if (!credentials.configured) throw new Error('Market-data API credentials are not configured.');

 const productsResponse = await service.handle({ action: 'instruments', universe: 'nifty500', limit: 500 });
 const products = Array.isArray(productsResponse.products) ? productsResponse.products : [];
 console.log(JSON.stringify({
  credentialsConfigured: true,
  universe: productsResponse.universe,
  universeLabel: productsResponse.universeLabel,
  universeCount: productsResponse.universeCount,
  products: products.length,
  firstSymbols: products.slice(0, 12).map(item => `${item.exchangeSegment}:${item.securityId}:${item.tradingSymbol}`),
 }, null, 2));
 if (!products.length) throw new Error(productsResponse.error || 'No Nifty 500 products returned.');

 const sample = products.slice(0, 500);
 const cases = [
  { action: 'ltp', batchSize: 500 },
  { action: 'ohlc', batchSize: 500 },
  { action: 'quotes', batchSize: 500 },
  { action: 'ohlc', batchSize: 100 },
  { action: 'ohlc', batchSize: 50 },
  { action: 'ohlc', batchSize: 25 },
  { action: 'ohlc', batchSize: 10 },
  { action: 'ltp', batchSize: 10 },
 ];

 for (const item of cases) {
  const startedAt = Date.now();
  const response = await service.handle({
   action: item.action,
   symbols: sample,
   batchSize: item.batchSize,
   paceMs: 1400,
  });
  const counted = countFeedRows(response);
  console.log(JSON.stringify({
   action: item.action,
   batchSize: item.batchSize,
   ok: !!response.ok,
   status: response.status || 0,
   apiCalls: response.apiCalls || response.batches || 0,
   rows: counted.total,
   segments: counted.segments,
   elapsedMs: Date.now() - startedAt,
   error: response.error || '',
  }, null, 2));
 }

 app.exit(0);
}

main().catch(error => {
 console.error(error?.stack || error?.message || String(error));
 app.exit(1);
});
