const assert = require('assert');
const { __private } = require('../src/main/dhan-data-service');

const {
 buildCommoditySpreadClosePoints,
 buildCommoditySynchronizedSpreadCandles,
 buildCommoditySpreadRollEvents,
 buildCommoditySpreadDecision,
 mergeCommodityLiveSpread,
 repairCommoditySpreadGlitches,
 sanitizeCommoditySpreadRows,
 isDegenerateCommoditySpread,
 commoditySpreadSnapshotValidity,
} = __private;

function rowsFromCloses(closes = [], start = 1700000000, step = 86400) {
 return closes.map((close, index) => ({
  time: start + index * step,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1000 + index,
  oi: 5000 + index,
 }));
}

function snapshot(overrides = {}) {
 return {
  spread: 120,
  wideningEntrySpread: 121,
  narrowingEntrySpread: 119,
  wideningDepth: true,
  narrowingDepth: true,
  depthConfirmed: true,
  firstBid: 100,
  firstAsk: 101,
  secondBid: 219,
  secondAsk: 220,
  firstQuoteTime: Date.now(),
  secondQuoteTime: Date.now(),
  validity: { valid: true, reasons: [], freshness: 'live' },
  safeguards: { tradeAllowed: true, warnings: [] },
  costs: {
   valuePerSpreadPoint: 1,
   fixedBrokerageAndGst: 94.4,
   brokerageBreakevenPoints: 0.5,
   wideningSlippagePoints: 0.2,
   narrowingSlippagePoints: 0.2,
  },
  ...overrides,
 };
}

const pair = {
 firstRole: 'near',
 secondRole: 'far',
 firstInstrument: { expiry: '2026-12-31', securityId: '1', tradingSymbol: 'GOLD-DEC', lotSize: 1 },
 secondInstrument: { expiry: '2027-02-28', securityId: '2', tradingSymbol: 'GOLD-FEB', lotSize: 1 },
};

{
 const repaired = repairCommoditySpreadGlitches([
  { time: 1, open: 1900, high: 1900, low: 1900, close: 1900 },
  { time: 2, open: 0, high: 0, low: 0, close: 0 },
  { time: 3, open: 2100, high: 2100, low: 2100, close: 2100 },
 ]);
 assert.strictEqual(repaired[1].close, 2000);
 assert.strictEqual(repaired[1].repaired, true);
 console.log('PASS isolated zero spread glitches are repaired from adjacent sessions');
}

{
 const normal = rowsFromCloses(Array.from({ length: 35 }, (_, index) => 100 + index * 0.5));
 normal.splice(18, 0, { ...normal[18], time: normal[18].time - 43200, open: 900, high: 900, low: 900, close: 900 });
 const cleaned = sanitizeCommoditySpreadRows(normal);
 assert(cleaned.badTicks >= 1);
 assert(!cleaned.rows.some(row => row.close === 900));
 console.log('PASS isolated bad ticks are excluded from spread statistics');
}

{
 const before = rowsFromCloses(Array.from({ length: 25 }, (_, index) => 100 + index * 0.2));
 const after = rowsFromCloses(Array.from({ length: 30 }, (_, index) => 420 + index * 0.2), before[before.length - 1].time + 86400, 86400);
 const cleaned = sanitizeCommoditySpreadRows([...before, ...after]);
 assert.strictEqual(cleaned.rollDiscontinuities, 1);
 assert.strictEqual(cleaned.rows.length, before.length + after.length);
 assert(cleaned.decisionRows.every(row => row.close >= 400));
 console.log('PASS contract-roll discontinuity preserves chart history and isolates decision statistics');
}

{
 const now = Date.now();
 const stale = commoditySpreadSnapshotValidity({
  firstPrice: 100,
  secondPrice: 220,
  firstBid: 99,
  firstAsk: 101,
  secondBid: 219,
  secondAsk: 221,
  firstQuoteTime: now - 20 * 60 * 1000,
  secondQuoteTime: now - 20 * 60 * 1000,
 }, now);
 assert.strictEqual(stale.valid, false);
 assert(stale.reasons.some(reason => /stale/i.test(reason)));
 console.log('PASS stale exchange timestamps invalidate executable spread data');
}

{
 const liveSession = Date.parse('2026-06-15T10:00:00+05:30');
 const requestFresh = commoditySpreadSnapshotValidity({
  firstPrice: 100,
  secondPrice: 220,
  firstBid: 99,
  firstAsk: 101,
  secondBid: 219,
  secondAsk: 221,
 }, liveSession);
 assert.strictEqual(requestFresh.valid, true);
 assert.strictEqual(requestFresh.freshness, 'live_request');
 const weekend = commoditySpreadSnapshotValidity({
  firstPrice: 100,
  secondPrice: 220,
  firstBid: 99,
  firstAsk: 101,
  secondBid: 219,
  secondAsk: 221,
 }, Date.parse('2026-06-13T10:00:00+05:30'));
 assert.strictEqual(weekend.valid, false);
 assert(weekend.reasons.some(reason => /market is closed/i.test(reason)));
 console.log('PASS fresh depth requests are usable only during the MCX session');
}

{
 const historical = [{ time: 100, open: 2084, high: 2084, low: 2084, close: 2084, volume: 10 }];
 const live = mergeCommodityLiveSpread(historical, {
  spread: 2100,
  firstPrice: 75000,
  secondPrice: 77100,
  firstVolume: 20,
  secondVolume: 30,
 }, '1d', 200 * 1000);
 assert.strictEqual(live[live.length - 1].close, 2100);
 assert.strictEqual(live[live.length - 1].live, true);
 console.log('PASS live quote is merged into the latest spread chart point');
}

{
 const first = rowsFromCloses([100, 102, 99]);
 const second = rowsFromCloses([90, 105, 101]);
 const points = buildCommoditySpreadClosePoints(first, second);
 assert.deepStrictEqual(points.map(row => row.close), [-10, 3, 2]);
 assert(points.every(row => row.open === row.high && row.high === row.low && row.low === row.close));
 console.log('PASS daily spread history is close-only and supports negative/zero-crossing values');
}

{
 const distinctPair = {
  firstInstrument: { securityId: 'near' },
  secondInstrument: { securityId: 'far' },
 };
 assert.strictEqual(isDegenerateCommoditySpread(rowsFromCloses([0, 0, 0]), distinctPair), true);
 assert.strictEqual(isDegenerateCommoditySpread(rowsFromCloses([0, 2, -1]), distinctPair), false);
 assert.strictEqual(isDegenerateCommoditySpread(rowsFromCloses([5]), distinctPair), false);
 console.log('PASS all-zero cached spread history is rejected without blocking valid zero crossings');
}

{
 const first = rowsFromCloses([100, 101, 102, 103], 1700000000, 300);
 const second = rowsFromCloses([110, 114, 111, 118], 1700000000, 300);
 const hourly = buildCommoditySynchronizedSpreadCandles(first, second, 3600);
 assert.strictEqual(hourly.length, 1);
 assert.deepStrictEqual(
  [hourly[0].open, hourly[0].high, hourly[0].low, hourly[0].close],
  [10, 15, 9, 15]
 );
 console.log('PASS synchronized five-minute observations aggregate into honest hourly OHLC');
}

{
 const first = rowsFromCloses([100, 999, 102], 1700000000, 300);
 first[1].time = first[0].time;
 const second = rowsFromCloses([110, 112], 1700000000, 600);
 const hourly = buildCommoditySynchronizedSpreadCandles(first, second, 3600);
 assert.strictEqual(hourly[0].synchronizedObservations, 2);
 assert.deepStrictEqual(
  [hourly[0].open, hourly[0].close],
  [-889, 10]
 );
 console.log('PASS duplicate timestamps are de-duplicated and incomplete legs are skipped');
}

{
 const points = rowsFromCloses([1, 2, 3, 4]).map((row, index) => ({
  ...row,
  firstOi: index < 2 ? 100 : 90,
  secondOi: index < 2 ? 80 : 120,
 }));
 const events = buildCommoditySpreadRollEvents(points, {});
 assert(events.some(event => event.type === 'liquidity_oi'));
 console.log('PASS two-session OI crossover creates a liquidity roll signal');
}

{
 const points = rowsFromCloses([1, 2, 3]).map((row, index) => ({
  ...row,
  firstOi: 0,
  secondOi: 0,
  firstVolume: index === 0 ? 100 : 90,
  secondVolume: index === 0 ? 80 : 120,
 }));
 const events = buildCommoditySpreadRollEvents(points, {});
 assert(events.some(event => event.type === 'liquidity_volume'));
 console.log('PASS volume crossover is used when OI is unavailable');
}

{
 const start = Math.floor(Date.parse('2026-06-20T00:00:00Z') / 1000);
 const points = rowsFromCloses([1, 2, 3, 4, 5, 6, 7], start, 86400);
 const events = buildCommoditySpreadRollEvents(points, {
  firstInstrument: { expiry: '2026-06-28' },
 });
 assert(events.some(event => event.type === 'expiry_fallback' && event.time === start + 3 * 86400));
 console.log('PASS five-calendar-day expiry fallback creates a forced roll marker');
}

{
 const daily = rowsFromCloses(Array.from({ length: 130 }, (_, index) => 20 + index * 1.5));
 const intraday = rowsFromCloses(Array.from({ length: 30 }, (_, index) => 100 + index), 1700000000, 3600);
 const decision = buildCommoditySpreadDecision({ dailyRows: daily, intradayRows: intraday, pair, snapshot: snapshot({ spread: 214, wideningEntrySpread: 215 }) });
 assert.strictEqual(decision.action, 'BUY_SPREAD');
 assert.strictEqual(decision.regime, 'trend');
 assert(decision.normalLow < decision.mean && decision.normalHigh > decision.mean);
 assert(decision.rewardRisk >= 1.2);
 assert.strictEqual(decision.tradePlan.first.transactionType, 'SELL');
 assert.strictEqual(decision.tradePlan.second.transactionType, 'BUY');
 console.log('PASS widening trend produces BUY_SPREAD with synchronized confirmation');
}

{
 const daily = rowsFromCloses(Array.from({ length: 130 }, (_, index) => 300 - index * 1.5));
 const intraday = rowsFromCloses(Array.from({ length: 30 }, (_, index) => 100 - index), 1700000000, 3600);
 const decision = buildCommoditySpreadDecision({ dailyRows: daily, intradayRows: intraday, pair, snapshot: snapshot({ spread: 106, narrowingEntrySpread: 105 }) });
 assert.strictEqual(decision.action, 'SELL_SPREAD');
 assert.strictEqual(decision.regime, 'trend');
 console.log('PASS narrowing trend produces SELL_SPREAD with synchronized confirmation');
}

{
 const daily = rowsFromCloses(Array.from({ length: 130 }, (_, index) => 20 + index * 1.5));
 const intraday = rowsFromCloses(Array.from({ length: 30 }, (_, index) => 100 + index), 1700000000, 3600);
 const decision = buildCommoditySpreadDecision({
  dailyRows: daily,
  intradayRows: intraday,
  pair,
  snapshot: snapshot({
   validity: { valid: false, freshness: 'delayed', reasons: ['Live quotes are stale by 20 minutes.'] },
  }),
 });
 assert.strictEqual(decision.action, 'WAIT');
 assert.strictEqual(decision.tradePlan, null);
 assert(decision.blockers.some(reason => /stale/i.test(reason)));
 console.log('PASS stale live data can never produce a trade signal or leg plan');
}

{
 const base = Array.from({ length: 119 }, (_, index) => 100 + Math.sin(index / 3) * 4);
 const daily = rowsFromCloses([...base, 82]);
 const intraday = rowsFromCloses(Array.from({ length: 30 }, (_, index) => 80 + index * 0.5), 1700000000, 3600);
 const decision = buildCommoditySpreadDecision({ dailyRows: daily, intradayRows: intraday, pair, snapshot: snapshot({ spread: 82, wideningEntrySpread: 83 }) });
 assert.strictEqual(decision.regime, 'range');
 assert.strictEqual(decision.action, 'BUY_SPREAD');
 console.log('PASS unusually narrow range spread with reversal produces BUY_SPREAD');
}

{
 const daily = rowsFromCloses(Array.from({ length: 130 }, (_, index) => 20 + index));
 const intraday = rowsFromCloses(Array.from({ length: 30 }, (_, index) => 100 + index), 1700000000, 3600);
 const blocked = buildCommoditySpreadDecision({
  dailyRows: daily,
  intradayRows: intraday,
  pair,
  snapshot: snapshot({
   wideningEntrySpread: 150,
   costs: {
    valuePerSpreadPoint: 1,
    fixedBrokerageAndGst: 94.4,
    brokerageBreakevenPoints: 10000,
    wideningSlippagePoints: 5000,
    narrowingSlippagePoints: 5000,
   },
  }),
 });
 assert.strictEqual(blocked.action, 'WAIT');
 assert(blocked.blockers.some(reason => /brokerage/i.test(reason)));
 console.log('PASS cost edge blocks an otherwise directional spread');
}

{
 const short = buildCommoditySpreadDecision({
  dailyRows: rowsFromCloses(Array.from({ length: 40 }, (_, index) => index)),
  intradayRows: [],
  pair,
  snapshot: snapshot(),
 });
 assert.strictEqual(short.action, 'WAIT');
 assert(short.blockers.some(reason => /100 matched daily/i.test(reason)));
 console.log('PASS insufficient history degrades to explainable WAIT');
}

{
 const daily = rowsFromCloses(Array.from({ length: 130 }, (_, index) => 100 + Math.sin(index / 4)));
 const intraday = rowsFromCloses(Array.from({ length: 30 }, (_, index) => 100 + Math.sin(index / 3)), 1700000000, 3600);
 const neutral = buildCommoditySpreadDecision({ dailyRows: daily, intradayRows: intraday, pair, snapshot: snapshot() });
 assert.strictEqual(neutral.action, 'WAIT');
 assert(neutral.blockers.some(reason => /no trend or mean-reversion trigger/i.test(reason)));
 console.log('PASS neutral WAIT includes a plain-language blocker');
}

console.log('Commodity spread decision smoke checks passed.');
