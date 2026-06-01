const { app, safeStorage } = require('electron');
const path = require('path');
const { createCredentialStore } = require('../src/main/credential-store');
const { createDhanDataService } = require('../src/main/dhan-data-service');

const PRODUCT_NAME = 'FWD Bharat MarketDesk';

function sleep(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
 app.setName(PRODUCT_NAME);
 app.setPath('userData', path.join(app.getPath('appData'), PRODUCT_NAME));
 await app.whenReady();
 const errorJournal = { append(scope, error) { console.error(`[${scope}] ${error?.message || error}`); } };
 const credentialStore = createCredentialStore({ app, safeStorage, errorJournal });
 const service = createDhanDataService({ app, credentialStore, errorJournal });
 const credentials = await service.handle({ action: 'credentials_get' });
 if (!credentials.configured) throw new Error('Market-data API credentials are not configured.');

 const snapshot = await service.handle({ action: 'commodity_snapshot', limit: 40 });
 const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
 console.log(JSON.stringify({
  ok: snapshot.ok,
  totalUnderlyings: snapshot.totalUnderlyings || 0,
  pairedUnderlyings: snapshot.pairedUnderlyings || 0,
  depthConfirmedRows: snapshot.depthConfirmedRows || 0,
  apiCalls: snapshot.apiCalls || 0,
  sample: rows.slice(0, 6).map(row => ({
   symbol: row.symbol,
   near: row.nearFuture?.tradingSymbol || '',
   next: row.nextFuture?.tradingSymbol || '',
   nearPrice: row.nearPrice,
   nextPrice: row.nextPrice,
   spread: row.indicativeSpread,
   depthConfirmed: row.depthConfirmed,
  })),
  error: snapshot.error || '',
 }, null, 2));
 if (!snapshot.ok || !rows.length) throw new Error(snapshot.error || 'No MCX commodity quote rows returned.');
 const previewRow = rows.find(row => row.nextFuture && row.nearPrice > 0 && row.nextPrice > 0) || rows[0];
 const margin = await service.handle({
  action: 'commodity_margin_preview',
  productType: 'MARGIN',
  legs: [
   { ...previewRow.nearFuture, transactionType: 'BUY', quantity: 1, price: previewRow.nearPrice },
   ...(previewRow.nextFuture ? [{ ...previewRow.nextFuture, transactionType: 'SELL', quantity: 1, price: previewRow.nextPrice }] : []),
  ],
 });
 console.log(JSON.stringify({
  marginOk: margin.ok,
  symbol: previewRow.symbol,
  calculationMode: margin.calculationMode || '',
  legs: Array.isArray(margin.legs) ? margin.legs.length : 0,
  totalMargin: margin.total?.totalMargin || 0,
  brokerage: margin.total?.brokerage || 0,
  orderPlacementDisabled: margin.orderPlacementDisabled === true,
  error: margin.error || '',
 }, null, 2));
 if (!margin.ok || !(Number(margin.total?.totalMargin || 0) > 0) || margin.orderPlacementDisabled !== true) {
  throw new Error(margin.error || 'MCX broker margin preview did not return a safe capital estimate.');
 }
 const history = await service.handle({
  action: 'candles',
  instrument: previewRow.nearFuture,
  symbol: previewRow.nearFuture?.tradingSymbol || '',
  resolution: '1d',
  start: Date.now() - (3 * 365 * 24 * 60 * 60 * 1000),
  end: Date.now(),
  timeoutMs: 45000,
 });
 const dailyRows = Array.isArray(history.rows) ? history.rows : [];
 console.log(JSON.stringify({
  historyOk: history.ok,
  symbol: previewRow.nearFuture?.tradingSymbol || '',
  dailyRows: dailyRows.length,
  firstDaily: dailyRows[0]?.time || 0,
  lastDaily: dailyRows[dailyRows.length - 1]?.time || 0,
  error: history.error || '',
 }, null, 2));
 if (!history.ok || dailyRows.length < 100) throw new Error(history.error || 'MCX daily rolling history did not return sufficient candles.');
 const lab = await service.handle({ action: 'commodity_analysis', limit: 6, dailyDays: 1095, intradayDays: 90 });
 console.log(JSON.stringify({
  labOk: lab.ok,
  labRows: Array.isArray(lab.results) ? lab.results.length : 0,
  timedCandidates: Number(lab.status?.diagnostics?.timedCandidates || 0),
  sample: (lab.results || []).slice(0, 3).map(row => ({
   symbol: row.underlying,
   signal: row.signal,
   trend: row.raw?.trendLabel || '',
   dailyCandles: row.raw?.dailyCandles || 0,
   historyDays: row.raw?.historyDays || 0,
  })),
  error: lab.error || '',
 }, null, 2));
 if (!lab.ok || !(lab.results || []).length || Number(lab.results[0]?.raw?.dailyCandles || 0) < 100) {
  throw new Error(lab.error || 'Commodity Lab did not return a historical trend row.');
 }
 const stock15m = await service.handle({
  action: 'candles',
  symbol: 'AUBANK',
  resolution: '15m',
  start: Date.now() - (90 * 24 * 60 * 60 * 1000),
  end: Date.now(),
  timeoutMs: 45000,
 });
 const stockRows = Array.isArray(stock15m.rows) ? stock15m.rows : [];
 console.log(JSON.stringify({
  stock15mOk: stock15m.ok,
  symbol: stock15m.instrument?.tradingSymbol || stock15m.instrument?.symbol || 'AUBANK',
  exchangeSegment: stock15m.instrument?.exchangeSegment || '',
  fifteenMinuteRows: stockRows.length,
  chunks: stock15m.chunks || [],
  error: stock15m.error || '',
 }, null, 2));
 if (!stock15m.ok || stockRows.length < 20 || stock15m.instrument?.exchangeSegment !== 'NSE_EQ') {
  throw new Error(stock15m.error || 'Stock 15-minute history did not return an NSE equity review series.');
 }
 const subscribed = await service.handle({ action: 'live_feed_subscribe', symbols: [rows[0].nearFuture], mode: 'quote' });
 let feed = subscribed;
 for (let attempt = 0; attempt < 6; attempt += 1) {
  await sleep(1500);
  feed = await service.handle({ action: 'live_feed_status', limit: 5 });
  if (feed.connected && Number(feed.tickCount || 0) > 0) break;
 }
 await service.handle({ action: 'live_feed_unsubscribe', all: true });
 console.log(JSON.stringify({
  socketConnected: !!feed.connected,
  socketTicks: Number(feed.tickCount || 0),
  subscribedSymbol: rows[0].nearFuture?.tradingSymbol || '',
  socketError: feed.lastError || '',
 }, null, 2));
 if (!feed.connected || Number(feed.tickCount || 0) < 1) throw new Error(feed.lastError || 'MCX live socket returned no tick.');
 app.exit(0);
}

main().catch(error => {
 console.error(error?.stack || error);
 app.exit(1);
});
