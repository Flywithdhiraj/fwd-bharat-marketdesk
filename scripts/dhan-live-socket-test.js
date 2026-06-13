const { app, safeStorage } = require('electron');
const path = require('path');
const { createCredentialStore } = require('../src/main/credential-store');
const { createDhanDataService } = require('../src/main/dhan-data-service');

const PRODUCT_NAME = 'FWD Bharat MarketDesk';
const DEFAULT_WINDOWS_HOME = 'D:\\Office Work Backup\\Automation\\Dhan Trading data and App';

function sleep(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
}

function print(label, payload) {
 console.log(`${label}: ${JSON.stringify(payload, null, 2)}`);
}

async function main() {
 app.setName(PRODUCT_NAME);
 app.setPath('userData', process.platform === 'win32'
  ? path.join(String(process.env.FWD_BHARAT_MARKETDESK_HOME || '').trim() || DEFAULT_WINDOWS_HOME, 'Data')
  : path.join(app.getPath('appData'), PRODUCT_NAME));
 await app.whenReady();

 const errorJournal = {
  append(scope, error, extra) {
   console.error(`[${scope}] ${error?.message || error}`, extra || '');
  },
 };
 const credentialStore = createCredentialStore({ app, safeStorage, errorJournal });
 const dhanData = createDhanDataService({ app, credentialStore, errorJournal });

 const credentials = await dhanData.handle({ action: 'credentials_get' });
 print('credentials', {
  ok: credentials.ok,
  configured: credentials.configured,
  clientId: credentials.clientId ? `${String(credentials.clientId).slice(0, 4)}...` : '',
  dataMode: credentials.dataMode,
  updatedAt: credentials.updatedAt,
 });

 if (!credentials.configured) {
  console.error('LIVE_SOCKET_RESULT: missing_credentials');
  app.exit(2);
  return;
 }

 const session = await dhanData.handle({ action: 'market_session' });
 print('market_session', session);

 const rest = await dhanData.handle({ action: 'test' });
 print('rest_test', {
  ok: rest.ok,
  status: rest.status || rest.ltpStatus || 0,
  mode: rest.mode,
  dataOnly: rest.dataOnly,
  manualTradingOnly: rest.manualTradingOnly,
  instrumentCount: rest.instrumentCount,
  sample: rest.sample,
  error: rest.error || '',
 });

 if (!rest.ok) {
  console.error('LIVE_SOCKET_RESULT: rest_failed');
  app.exit(3);
  return;
 }

 const indexQuotes = await dhanData.handle({
  action: 'quotes',
  symbols: ['NIFTY', 'BANKNIFTY', 'NIFTYIT', 'FINNIFTY'],
 });
 const indexRows = indexQuotes?.data?.data?.IDX_I || indexQuotes?.data?.IDX_I || {};
 print('index_quotes', {
  ok: indexQuotes.ok,
  status: indexQuotes.status || 0,
  symbols: Object.entries(indexRows).map(([securityId, quote]) => ({
   securityId,
   lastPrice: Number(quote?.last_price || 0),
   previousClose: Number(quote?.ohlc?.close || quote?.close || 0),
   netChange: Number(quote?.net_change || 0),
  })),
  error: indexQuotes.error || '',
 });
 if (!indexQuotes.ok || !Object.keys(indexRows).length) {
  console.error('LIVE_SOCKET_RESULT: index_quote_failed');
  app.exit(5);
  return;
 }

 const carry = await dhanData.handle({ action: 'fno_carry', limit: 250 });
 print('fno_carry_snapshot', {
  ok: carry.ok,
  totalContracts: carry.totalContracts || 0,
  quotedContracts: carry.quotedContracts || 0,
  premiums: carry.premiums || 0,
  discounts: carry.discounts || 0,
  depthConfirmedRows: carry.depthConfirmedRows || 0,
  sample: Array.isArray(carry.rows) ? carry.rows.slice(0, 3).map(row => ({
   symbol: row.symbol,
   basis: row.basis,
   annualizedCarryPct: row.annualizedCarryPct,
   depthConfirmed: row.depthConfirmed,
   executableBasis: row.executableBasis,
   executableAnnualCarryPct: row.executableAnnualCarryPct,
   spotAskAvailableQuantity: row.spotAskAvailableQuantity,
   futureBidAvailableQuantity: row.futureBidAvailableQuantity,
   lotSize: row.lotSize,
   expiry: row.nearFuture?.expiry || '',
  })) : [],
  error: carry.error || '',
 });
 if (!carry.ok || !Array.isArray(carry.rows) || !carry.rows.length) {
  console.error('LIVE_SOCKET_RESULT: carry_snapshot_failed');
  app.exit(6);
  return;
 }

 const subscribe = await dhanData.handle({
  action: 'live_feed_subscribe',
  symbols: ['NIFTY', 'BANKNIFTY'],
  mode: 'quote',
 });
 print('socket_subscribe', {
  ok: subscribe.ok,
  status: subscribe.status,
  connected: subscribe.connected,
  instrumentCount: subscribe.instrumentCount,
  message: subscribe.message,
  error: subscribe.error || subscribe.lastError || '',
 });

 let finalStatus = subscribe;
 for (let index = 0; index < 8; index += 1) {
  await sleep(2500);
  finalStatus = await dhanData.handle({ action: 'live_feed_status', limit: 8 });
  print(`socket_status_${index + 1}`, {
   ok: finalStatus.ok,
   status: finalStatus.status,
   connected: finalStatus.connected,
   instrumentCount: finalStatus.instrumentCount,
   tickCount: finalStatus.tickCount,
   lastError: finalStatus.lastError || '',
   message: finalStatus.message || '',
  });
  if (finalStatus.connected && Number(finalStatus.tickCount || 0) > 0) break;
 }

 await dhanData.handle({ action: 'live_feed_unsubscribe', all: true });
 const success = !!finalStatus.connected;
 console.log(`LIVE_SOCKET_RESULT: ${success ? 'connected' : 'not_connected'}`);
 app.exit(success ? 0 : 4);
}

main().catch(error => {
 console.error('LIVE_SOCKET_RESULT: failed');
 console.error(error?.stack || error?.message || String(error));
 app.exit(1);
});
