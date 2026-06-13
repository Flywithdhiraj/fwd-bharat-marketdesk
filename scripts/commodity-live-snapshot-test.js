const { app, safeStorage } = require('electron');
const path = require('path');
const { createCredentialStore } = require('../src/main/credential-store');
const { createDhanDataService } = require('../src/main/dhan-data-service');

const PRODUCT_NAME = 'FWD Bharat MarketDesk';
const DEFAULT_WINDOWS_HOME = 'D:\\Office Work Backup\\Automation\\Dhan Trading data and App';

function sleep(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
 app.setName(PRODUCT_NAME);
 app.setPath('userData', process.platform === 'win32'
  ? path.join(String(process.env.FWD_BHARAT_MARKETDESK_HOME || '').trim() || DEFAULT_WINDOWS_HOME, 'Data')
  : path.join(app.getPath('appData'), PRODUCT_NAME));
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
 const spreadScan = await service.handle({ action: 'commodity_spread_scanner', type: 'all', limit: 6, historyDays: 365 });
 const spreadRows = Array.isArray(spreadScan.rows) ? spreadScan.rows : [];
 console.log(JSON.stringify({
  spreadScanOk: spreadScan.ok,
  spreadRows: spreadRows.length,
  widening: spreadScan.widening || 0,
  narrowing: spreadScan.narrowing || 0,
  sample: spreadRows.slice(0, 3).map(row => ({
   label: row.label,
   spread: row.spread,
   direction: row.analysis?.direction || '',
   score: row.analysis?.score || 0,
   tradeAllowed: row.analysis?.tradeAllowed === true,
   blockers: row.analysis?.blockers || [],
  })),
  error: spreadScan.error || '',
 }, null, 2));
 if (!spreadScan.ok || !spreadRows.length) throw new Error(spreadScan.error || 'Commodity spread scanner returned no rows.');
 const spreadQuotes = await service.handle({ action: 'commodity_spread_quotes', pairs: spreadRows.slice(0, 3) });
 console.log(JSON.stringify({
  spreadQuotesOk: spreadQuotes.ok,
  rows: (spreadQuotes.rows || []).length,
  executableUpdatedAt: spreadQuotes.rows?.[0]?.executableUpdatedAt || 0,
  fixedBrokerageAndGst: spreadQuotes.rows?.[0]?.costs?.fixedBrokerageAndGst || 0,
  error: spreadQuotes.error || '',
 }, null, 2));
 if (!spreadQuotes.ok || !(spreadQuotes.rows || []).length) throw new Error(spreadQuotes.error || 'Commodity executable spread refresh returned no rows.');
 const spreadChart = await service.handle({ ...spreadRows[0], resolution: '1d', start: Date.now() - (365 * 24 * 60 * 60 * 1000), end: Date.now(), action: 'commodity_spread_chart' });
 console.log(JSON.stringify({
  spreadChartOk: spreadChart.ok,
  displayName: spreadChart.displayName || '',
  candles: Array.isArray(spreadChart.candles) ? spreadChart.candles.length : 0,
  direction: spreadChart.analysis?.direction || '',
  error: spreadChart.error || '',
 }, null, 2));
 if (!spreadChart.ok || !(spreadChart.candles || []).length) throw new Error(spreadChart.error || 'Synthetic commodity spread chart returned no candles.');
 const silvermic = rows.find(row => row.symbol === 'SILVERMIC' && row.nearFuture && row.nextFuture);
 if (!silvermic) throw new Error('SILVERMIC active near/next futures were not found in the MCX snapshot.');
 const silvermicDaily = await service.handle({
  action: 'commodity_spread_continuous_chart',
  underlying: 'SILVERMIC',
  resolution: '1d',
  view: 'continuous',
  force: true,
 });
 const validActions = new Set(['BUY_SPREAD', 'SELL_SPREAD', 'WAIT']);
 console.log(JSON.stringify({
  silvermicDailyOk: silvermicDaily.ok,
  dailyPoints: Array.isArray(silvermicDaily.points) ? silvermicDaily.points.length : 0,
  action: silvermicDaily.action || '',
  regime: silvermicDaily.regime || '',
  confidence: silvermicDaily.confidence || '',
  sourceQuality: silvermicDaily.sourceQuality || {},
  rollEvents: Array.isArray(silvermicDaily.rollEvents) ? silvermicDaily.rollEvents.length : 0,
  blockers: silvermicDaily.blockers || [],
  error: silvermicDaily.error || '',
 }, null, 2));
 if (
  !silvermicDaily.ok
  || !(silvermicDaily.points || []).length
  || silvermicDaily.chartType !== 'line'
  || !validActions.has(silvermicDaily.action)
  || !silvermicDaily.coverage
  || !silvermicDaily.sourceQuality
  || (silvermicDaily.action === 'WAIT' && !(silvermicDaily.blockers || []).length)
 ) {
  throw new Error(silvermicDaily.error || 'SILVERMIC continuous daily spread decision chart was incomplete.');
 }
 const goldmSnapshot = spreadRows.find(row => row.family === 'GOLDM');
 if (!goldmSnapshot) throw new Error('GOLDM spread snapshot was not returned.');
 await service.handle({
  ...goldmSnapshot,
  action: 'commodity_spread_continuous_chart',
  underlying: 'GOLDM',
  resolution: '1d',
  view: 'continuous',
  force: true,
 });
 const goldmStartedAt = Date.now();
 const goldmDaily = await service.handle({
  ...goldmSnapshot,
  action: 'commodity_spread_continuous_chart',
  underlying: 'GOLDM',
  resolution: '1d',
  view: 'continuous',
 });
 console.log(JSON.stringify({
  goldmDailyOk: goldmDaily.ok,
  durationMs: Date.now() - goldmStartedAt,
  candles: Array.isArray(goldmDaily.candles) ? goldmDaily.candles.length : 0,
  priorClose: goldmDaily.candles?.at?.(-2)?.close ?? null,
  liveClose: goldmDaily.candles?.at?.(-1)?.close ?? null,
  snapshotSpread: goldmDaily.snapshot?.spread ?? null,
  livePoint: goldmDaily.candles?.at?.(-1)?.live === true,
  rollEvents: Array.isArray(goldmDaily.rollEvents) ? goldmDaily.rollEvents.length : 0,
  error: goldmDaily.error || '',
 }, null, 2));
 if (
  !goldmDaily.ok
  || !(goldmDaily.candles || []).length
  || goldmDaily.candles.at(-1)?.live !== true
  || Number(goldmDaily.candles.at(-1)?.close) !== Number(goldmDaily.snapshot?.spread)
  || (goldmDaily.rollEvents || []).length > 8
  || Date.now() - goldmStartedAt > 2000
 ) {
  throw new Error(goldmDaily.error || 'GOLDM daily spread chart did not open quickly with the current live spread.');
 }
 const silvermicHourly = await service.handle({
  action: 'commodity_spread_continuous_chart',
  underlying: 'SILVERMIC',
  resolution: '1h',
  view: 'continuous',
 });
 console.log(JSON.stringify({
  silvermicHourlyOk: silvermicHourly.ok,
  hourlyCandles: Array.isArray(silvermicHourly.candles) ? silvermicHourly.candles.length : 0,
  chartType: silvermicHourly.chartType || '',
  action: silvermicHourly.action || '',
  error: silvermicHourly.error || '',
 }, null, 2));
 if (
  !silvermicHourly.ok
  || !(silvermicHourly.candles || []).length
  || silvermicHourly.chartType !== 'candles'
  || !validActions.has(silvermicHourly.action)
 ) {
  throw new Error(silvermicHourly.error || 'SILVERMIC synchronized hourly spread chart was incomplete.');
 }
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
 const stock4h = await service.handle({
  action: 'candles',
  symbol: 'AUBANK',
  resolution: '4h',
  start: Date.now() - (90 * 24 * 60 * 60 * 1000),
  end: Date.now(),
  timeoutMs: 45000,
 });
 const stockRows = Array.isArray(stock4h.rows) ? stock4h.rows : [];
 console.log(JSON.stringify({
  stock4hOk: stock4h.ok,
  symbol: stock4h.instrument?.tradingSymbol || stock4h.instrument?.symbol || 'AUBANK',
  exchangeSegment: stock4h.instrument?.exchangeSegment || '',
  fourHourRows: stockRows.length,
  chunks: stock4h.chunks || [],
  error: stock4h.error || '',
 }, null, 2));
 if (!stock4h.ok || stockRows.length < 20 || stock4h.instrument?.exchangeSegment !== 'NSE_EQ') {
  throw new Error(stock4h.error || 'Stock 4H history did not return an NSE equity review series.');
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
