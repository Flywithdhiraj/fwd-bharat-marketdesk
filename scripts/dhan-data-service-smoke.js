const assert = require('assert');
const { createDhanDataService, DHAN_ORDER_DISABLED_ERROR, __private } = require('../src/main/dhan-data-service');

const {
 normalizeExchangeSegment,
 normalizeInstrument,
 normalizeResolution,
 buildFnoStockUniverse,
 buildFnoCarryContracts,
 buildCommodityFuturePairs,
 buildCommoditySpreadHistory,
 commodityPriceMultiplier,
 parseDerivativeExpiryMs,
 buildUniverseCatalog,
 normalizeUniverseId,
 isNseEquityInstrument,
 buildIntradayChunks,
 mergeCandleRows,
 aggregateCandleRows,
 normalizeDhanCandles,
groupQuoteBatch,
flattenInstrumentGroups,
mergeDhanFeedResponses,
parseDhanFeedPacket,
 normalizeDhanOptionChainResponse,
 getNseBseMarketSession,
 feedRequestCodeForMode,
 limits,
} = __private;

assert.strictEqual(limits.quoteMinIntervalMs >= 1000, true);
assert.strictEqual(limits.optionChainMinIntervalMs >= 3000, true);
assert.strictEqual(limits.quoteBatchSize, 1000);
assert.strictEqual(limits.liveFeedSubscribeChunk, 100);
assert.strictEqual(feedRequestCodeForMode('ticker'), 15);
assert.strictEqual(feedRequestCodeForMode('quote'), 17);
assert.strictEqual(feedRequestCodeForMode('full'), 21);

assert.strictEqual(normalizeExchangeSegment('', 'NSE', 'E', 'EQUITY'), 'NSE_EQ');
assert.strictEqual(normalizeExchangeSegment('NFO', '', '', 'FUTIDX'), 'NSE_FNO');
assert.strictEqual(normalizeExchangeSegment('', 'BSE', 'D', 'OPTSTK'), 'BSE_FNO');
assert.strictEqual(normalizeExchangeSegment('', 'NSE', 'I', 'INDEX'), 'IDX_I');
assert.strictEqual(normalizeExchangeSegment('', 'MCX', 'M', 'FUTCOM'), 'MCX_COMM');

const nifty = normalizeInstrument({
 sem_exm_exch_id: 'NSE',
 sem_segment: 'I',
 sem_instrument_name: 'INDEX',
 sem_trading_symbol: 'NIFTY',
 sem_smst_security_id: '13',
});
assert.strictEqual(nifty.exchangeSegment, 'IDX_I');
assert.strictEqual(nifty.instrument, 'INDEX');

const equity = normalizeInstrument({
 EXCH_ID: 'NSE',
 SEGMENT: 'E',
 SECURITY_ID: '1333',
 INSTRUMENT: 'EQUITY',
 SYMBOL_NAME: 'HDFCBANK',
 DISPLAY_NAME: 'HDFC Bank',
 SERIES: 'EQ',
});
const fnoUniverse = buildFnoStockUniverse([equity], [{
 EXCH_ID: 'NSE',
 SEGMENT: 'D',
 INSTRUMENT: 'OPTSTK',
 UNDERLYING_SECURITY_ID: '1333',
 UNDERLYING_SYMBOL: 'HDFCBANK',
}]);
assert.strictEqual(fnoUniverse.fnoStocks.length, 1);
assert.strictEqual(fnoUniverse.fnoStocks[0].symbol, 'HDFCBANK');
assert.strictEqual(fnoUniverse.fnoStocks[0].exchangeSegment, 'NSE_EQ');
assert.strictEqual(fnoUniverse.fnoStocks[0].fnoStock, true);

const carryFutureExpired = normalizeInstrument({
 EXCH_ID: 'NSE',
 SEGMENT: 'D',
 SECURITY_ID: '6001',
 INSTRUMENT: 'FUTSTK',
 TRADING_SYMBOL: 'HDFCBANK-MAY2026-FUT',
 EXPIRY_DATE: '2026-05-26 14:30:00',
 UNDERLYING_SECURITY_ID: '1333',
 UNDERLYING_SYMBOL: 'HDFCBANK',
 LOT_SIZE: '550',
});
const carryFutureNear = normalizeInstrument({
 EXCH_ID: 'NSE',
 SEGMENT: 'D',
 SECURITY_ID: '6002',
 INSTRUMENT: 'FUTSTK',
 TRADING_SYMBOL: 'HDFCBANK-JUN2026-FUT',
 EXPIRY_DATE: '2026-06-30 14:30:00',
 UNDERLYING_SECURITY_ID: '1333',
 UNDERLYING_SYMBOL: 'HDFCBANK',
 LOT_SIZE: '550',
});
const carryFutureNext = normalizeInstrument({
 EXCH_ID: 'NSE',
 SEGMENT: 'D',
 SECURITY_ID: '6003',
 INSTRUMENT: 'FUTSTK',
 TRADING_SYMBOL: 'HDFCBANK-JUL2026-FUT',
 EXPIRY_DATE: '2026-07-28 14:30:00',
 UNDERLYING_SECURITY_ID: '1333',
 UNDERLYING_SYMBOL: 'HDFCBANK',
 LOT_SIZE: '650',
});
const carryTestFuture = normalizeInstrument({
 EXCH_ID: 'NSE',
 SEGMENT: 'D',
 SECURITY_ID: '6004',
 INSTRUMENT: 'FUTSTK',
 TRADING_SYMBOL: '011NSETEST-JUN2026-FUT',
 EXPIRY_DATE: '2026-06-30 14:30:00',
 UNDERLYING_SECURITY_ID: '1333',
 UNDERLYING_SYMBOL: 'NSETEST',
});
assert.strictEqual(carryFutureNear.underlyingSecurityId, '1333');
assert(parseDerivativeExpiryMs(carryFutureNear.expiry) > 0);
const carryContracts = buildFnoCarryContracts(
 [equity, carryFutureExpired, carryFutureNear, carryFutureNext, carryTestFuture],
 [equity],
 parseDerivativeExpiryMs(carryFutureExpired.expiry) + 1000
);
assert.strictEqual(carryContracts.length, 1);
assert.strictEqual(carryContracts[0].nearFuture.securityId, '6002');
assert.strictEqual(carryContracts[0].nextFuture.securityId, '6003');
const legacyCarryContracts = buildFnoCarryContracts(
 [equity, { ...carryFutureNear, underlyingSecurityId: '', underlyingSymbol: '' }],
 [equity],
 parseDerivativeExpiryMs(carryFutureExpired.expiry) + 1000
);
assert.strictEqual(legacyCarryContracts[0].nearFuture.securityId, '6002');

const commodityNear = normalizeInstrument({
 EXCH_ID: 'MCX',
 SEGMENT: 'M',
 SECURITY_ID: '9001',
 INSTRUMENT: 'FUTCOM',
 TRADING_SYMBOL: 'GOLD-05JUN2026-FUT',
 EXPIRY_DATE: '2026-06-05 23:30:00',
 UNDERLYING_SECURITY_ID: '114',
 UNDERLYING_SYMBOL: 'GOLD',
 LOT_SIZE: '1',
});
const commodityNext = normalizeInstrument({
 EXCH_ID: 'MCX',
 SEGMENT: 'M',
 SECURITY_ID: '9002',
 INSTRUMENT: 'FUTCOM',
 TRADING_SYMBOL: 'GOLD-05AUG2026-FUT',
 EXPIRY_DATE: '2026-08-05 23:30:00',
 UNDERLYING_SECURITY_ID: '114',
 UNDERLYING_SYMBOL: 'GOLD',
 LOT_SIZE: '1',
});
const commodityPairs = buildCommodityFuturePairs([commodityNext, commodityNear], Date.UTC(2026, 4, 26));
assert.strictEqual(commodityPairs.length, 1);
assert.strictEqual(commodityPairs[0].symbol, 'GOLD');
assert.strictEqual(commodityPairs[0].nearFuture.securityId, '9001');
assert.strictEqual(commodityPairs[0].nextFuture.securityId, '9002');
assert.deepStrictEqual(commodityPriceMultiplier({ underlyingSymbol: 'GOLDM' }), { symbol: 'GOLDM', multiplier: 10, known: true });

const calendarHistory = buildCommoditySpreadHistory({
 buyInstrument: { underlyingSymbol: 'GOLDM' },
 sellInstrument: { underlyingSymbol: 'GOLDM' },
 entryBuyPrice: 155170,
 entrySellPrice: 157340,
 buyLots: 1,
 sellLots: 1,
 costs: 0,
 buyRows: [{ time: 1, close: 155170 }, { time: 2, close: 155170 }],
 sellRows: [{ time: 1, close: 157340 }, { time: 2, close: 157329 }],
});
assert.strictEqual(calendarHistory.entrySpread, 2170);
assert.strictEqual(calendarHistory.latest.spread, 2159);
assert.strictEqual(calendarHistory.latest.grossPnl, 110);
assert.strictEqual(calendarHistory.matchedExposure, true);

const sizedGoldPair = buildCommoditySpreadHistory({
 buyInstrument: { underlyingSymbol: 'GOLD' },
 sellInstrument: { underlyingSymbol: 'GOLDM' },
 entryBuyPrice: 155000,
 entrySellPrice: 155000,
 buyLots: 1,
 sellLots: 10,
 buyRows: [{ time: 1, close: 155010 }],
 sellRows: [{ time: 1, close: 155005 }],
});
assert.strictEqual(sizedGoldPair.buyExposure, 100);
assert.strictEqual(sizedGoldPair.sellExposure, 100);
assert.strictEqual(sizedGoldPair.matchedExposure, true);
assert.strictEqual(sizedGoldPair.latest.grossPnl, 500);

assert.strictEqual(normalizeUniverseId('Nifty 500'), 'nifty500');
assert.strictEqual(normalizeUniverseId('all'), 'all_nse');
assert.strictEqual(normalizeUniverseId('indices'), 'indices');
assert.strictEqual(isNseEquityInstrument(equity), true);

const rel = normalizeInstrument({
 EXCH_ID: 'NSE',
 SEGMENT: 'E',
 SECURITY_ID: '2885',
 INSTRUMENT: 'EQUITY',
 SYMBOL_NAME: 'RELIANCE',
 DISPLAY_NAME: 'Reliance',
 SERIES: 'EQ',
});
const universeCatalog = buildUniverseCatalog({
 instruments: [nifty, equity, rel],
 fnoStockUniverse: [equity],
 indexSources: {
  nifty500: { ok: true, symbols: new Set(['HDFCBANK', 'RELIANCE']) },
  midcap150: { ok: true, symbols: new Set(['RELIANCE']) },
  smallcap250: { ok: true, symbols: new Set(['HDFCBANK']) },
 },
 nseAllSource: { ok: true, symbols: new Set(['HDFCBANK', 'RELIANCE']) },
});
assert.strictEqual(universeCatalog.counts.all_nse, 2);
assert.strictEqual(universeCatalog.counts.fno_stocks, 1);
assert.strictEqual(universeCatalog.counts.indices, 1);
assert.strictEqual(universeCatalog.counts.nifty500, 2);
assert.strictEqual(universeCatalog.counts.midcap150, 1);
assert.strictEqual(universeCatalog.counts.smallcap250, 1);

const longRange = buildIntradayChunks(Date.UTC(2026, 0, 1), Date.UTC(2026, 6, 1), 90);
assert.strictEqual(longRange.length, 3);
assert(longRange.every(range => range.endMs - range.startMs <= 90 * 24 * 60 * 60 * 1000));

assert.deepStrictEqual(normalizeResolution('5m'), { kind: 'intraday', interval: '5', seconds: 300, aggregateSeconds: 0 });
assert.deepStrictEqual(normalizeResolution('25m'), { kind: 'intraday', interval: '25', seconds: 1500, aggregateSeconds: 0 });
assert.deepStrictEqual(normalizeResolution('4h'), { kind: 'intraday', interval: '60', seconds: 14400, aggregateSeconds: 14400 });
assert.deepStrictEqual(normalizeResolution('1w'), { kind: 'historical', interval: '1D', seconds: 604800, aggregateSeconds: 604800 });

const groups = groupQuoteBatch([
 { exchangeSegment: 'NSE_EQ', securityId: 1 },
 { exchangeSegment: 'NSE_EQ', securityId: 2 },
 { exchangeSegment: 'BSE_EQ', securityId: 3 },
]);
assert.deepStrictEqual(groups, { NSE_EQ: [1, 2], BSE_EQ: [3] });
assert.strictEqual(flattenInstrumentGroups(groups).length, 3);

const mergedFeed = mergeDhanFeedResponses([
 { ok: true, status: 200, data: { data: { NSE_EQ: { 1: { last_price: 100 } } } } },
 { ok: true, status: 200, data: { data: { NSE_EQ: { 2: { last_price: 200 } }, IDX_I: { 13: { last_price: 23000 } } } } },
], { NSE_EQ: [1, 2], IDX_I: [13] });
assert.strictEqual(Object.keys(mergedFeed.data.data.NSE_EQ).length, 2);
assert.strictEqual(Object.keys(mergedFeed.data.data.IDX_I).length, 1);
assert.strictEqual(mergedFeed.apiCalls, 2);

const regularSession = getNseBseMarketSession(Date.UTC(2026, 0, 27, 4, 0, 0));
assert.strictEqual(regularSession.date, '2026-01-27');
assert.strictEqual(regularSession.isOpen, true);
assert.strictEqual(regularSession.phase, 'normal_open');

const republicDaySession = getNseBseMarketSession(Date.UTC(2026, 0, 26, 4, 0, 0));
assert.strictEqual(republicDaySession.isHoliday, true);
assert.strictEqual(republicDaySession.isOpen, false);
assert.strictEqual(republicDaySession.phase, 'holiday_closed');

const muhuratSession = getNseBseMarketSession(Date.UTC(2026, 10, 8, 13, 0, 0));
assert.strictEqual(muhuratSession.phase, 'special_session_pending');
assert.strictEqual(muhuratSession.isOpen, false);

const merged = mergeCandleRows([
 { rows: [{ time: 2, close: 20 }, { time: 1, close: 10 }] },
 { rows: [{ time: 2, close: 22 }, { time: 3, close: 30 }] },
]);
assert.deepStrictEqual(merged.map(row => [row.time, row.close]), [[1, 10], [2, 22], [3, 30]]);

const weekly = aggregateCandleRows([
 { time: 604800, open: 100, high: 105, low: 95, close: 101, volume: 10 },
 { time: 691200, open: 101, high: 108, low: 100, close: 107, volume: 20 },
], 7 * 86400);
assert.deepStrictEqual(weekly, [{ time: 604800, open: 100, high: 108, low: 95, close: 107, volume: 30 }]);

const normalizedCandles = normalizeDhanCandles({
 timestamp: [1716537600, 1716537660000],
 open: [100, 101],
 high: [105, 106],
 low: [99, 100],
 close: [104, 105],
 volume: [1000, 1100],
});
assert.deepStrictEqual(normalizedCandles.map(row => row.time), [1716537600, 1716537660]);

const quotePacket = Buffer.alloc(50);
quotePacket.writeUInt8(4, 0);
quotePacket.writeUInt16LE(50, 1);
quotePacket.writeUInt8(1, 3);
quotePacket.writeInt32LE(1333, 4);
quotePacket.writeFloatLE(1500.25, 8);
quotePacket.writeInt16LE(12, 12);
quotePacket.writeInt32LE(1716537600, 14);
quotePacket.writeFloatLE(1499.5, 18);
quotePacket.writeInt32LE(100000, 22);
quotePacket.writeInt32LE(45000, 26);
quotePacket.writeInt32LE(55000, 30);
quotePacket.writeFloatLE(1490, 34);
quotePacket.writeFloatLE(1480, 38);
quotePacket.writeFloatLE(1510, 42);
quotePacket.writeFloatLE(1475, 46);
const parsedQuote = parseDhanFeedPacket(quotePacket);
assert.strictEqual(parsedQuote.type, 'quote');
assert.strictEqual(parsedQuote.securityId, 1333);
assert.strictEqual(parsedQuote.lastPrice, 1500.25);
assert.strictEqual(parsedQuote.volume, 100000);

const normalizedChain = normalizeDhanOptionChainResponse({
 ok: true,
 data: {
  data: {
   last_price: 19950,
   oc: {
    '19900.000000': {
     ce: { oi: 100, previous_oi: 80, volume: 20, last_price: 90, implied_volatility: 12, greeks: { delta: 0.55, gamma: 0.01, theta: -4, vega: 9 } },
     pe: { oi: 200, previous_oi: 190, volume: 30, last_price: 45, implied_volatility: 14, greeks: { delta: -0.45, gamma: 0.01, theta: -3, vega: 8 } },
    },
    '20000.000000': {
     ce: { oi: 300, previous_oi: 280, volume: 40, last_price: 50, implied_volatility: 11, greeks: { delta: 0.45 } },
     pe: { oi: 150, previous_oi: 130, volume: 25, last_price: 75, implied_volatility: 15, greeks: { delta: -0.55 } },
    },
   },
  },
 },
}, { underlying: 'NIFTY', expiry: '2026-06-25' });
assert.strictEqual(normalizedChain.rows.length, 2);
assert.strictEqual(normalizedChain.summary.pcrOi, 0.875);
assert.strictEqual(normalizedChain.summary.atmStrike, 19900);
assert(normalizedChain.summary.maxPainStrike > 0);

const service = createDhanDataService({
 app: { getPath: () => __dirname },
 credentialStore: {
  getSecureSecret: async () => ({ value: {} }),
  setSecureSecret: async () => ({ ok: true }),
  deleteSecureSecret: async () => ({ ok: true }),
 },
});

(async () => {
 const orderResponse = await service.handle({ action: 'order_place' });
 assert.strictEqual(orderResponse.ok, false);
 assert.strictEqual(orderResponse.status, 403);
 assert.strictEqual(orderResponse.error, DHAN_ORDER_DISABLED_ERROR);

 const liveFeed = await service.handle({ action: 'live_feed_status' });
 assert.strictEqual(liveFeed.ok, true);
 assert.strictEqual(liveFeed.readOnly, true);
 assert.strictEqual(liveFeed.enabled, false);

 const session = await service.handle({ action: 'market_session', at: Date.UTC(2026, 3, 3, 5, 0, 0) });
 assert.strictEqual(session.ok, true);
 assert.strictEqual(session.phase, 'holiday_closed');

 console.log('OK dhan data service smoke passed');
})().catch(error => {
 console.error(error);
 process.exit(1);
});
