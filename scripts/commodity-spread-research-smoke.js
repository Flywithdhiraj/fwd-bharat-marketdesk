'use strict';

const assert = require('assert');
const { normalizeMcxRow, flattenRows, matchedRatio, backtestMeanReversion, buildResearch } = require('./lib/commodity-spread-research');

assert.deepStrictEqual(matchedRatio('GOLD', 'GOLDM'), { firstLots: 1, secondLots: 10, exposure: 100 });
assert.deepStrictEqual(matchedRatio('SILVER', 'SILVERMIC'), { firstLots: 1, secondLots: 30, exposure: 30 });
assert.strictEqual(flattenRows({ d: JSON.stringify({ Table: [{ Commodity: 'GOLD' }] }) }).length, 1);

const normalized = normalizeMcxRow({
 Instrument: 'FUTCOM',
 Commodity: 'GOLDM',
 Date: '14 Jun 2023',
 'Expiry Date': '30JUN2023',
 Close: '59,120.00',
 'Vol (Lots)': '120',
 'OI (Lots)': '300',
});
assert.strictEqual(normalized.tradeDate, '2023-06-14');
assert.strictEqual(normalized.expiry, '2023-06-30');
assert.strictEqual(normalized.close, 59120);

const synthetic = Array.from({ length: 260 }, (_, index) => ({
 tradeDate: new Date(Date.UTC(2023, 0, index + 1)).toISOString().slice(0, 10),
 spread: 100 + Math.sin(index / 8) * 14,
}));
const test = backtestMeanReversion(synthetic, { lookback: 40, entryZ: 1.2, exitZ: 0.25, stopZ: 3, roundTripCost: 0.2 });
assert(test.trades >= 8);
assert(test.net > 0);

const rows = [];
for (let index = 0; index < 260; index += 1) {
 const date = new Date(Date.UTC(2023, 0, index + 1));
 if ([0, 6].includes(date.getUTCDay())) continue;
 const tradeDate = date.toISOString().slice(0, 10);
 const expiry = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 28)).toISOString().slice(0, 10);
 const pulse = Math.sin(index / 8) * 12;
 rows.push({ Instrument: 'FUTCOM', Commodity: 'GOLD', Date: tradeDate, ExpiryDate: expiry, Close: 60000 + index + pulse });
 rows.push({ Instrument: 'FUTCOM', Commodity: 'GOLDM', Date: tradeDate, ExpiryDate: expiry, Close: 6000 + index / 10 - pulse / 10 });
 rows.push({ Instrument: 'FUTCOM', Commodity: 'GOLD', Date: tradeDate, ExpiryDate: new Date(Date.parse(expiry) + 30 * 86400000).toISOString().slice(0, 10), Close: 60100 + index - pulse });
}
const report = buildResearch(rows, { lookback: 40, entryZ: 1.2, exitZ: 0.25, stopZ: 3, roundTripCost: 0.2 });
assert(report.coverage.tradingDays >= 170);
assert(report.results.some(result => result.key === 'calendar:GOLD'));
assert(report.results.some(result => result.key === 'matched:GOLD:GOLDM' && result.ratio === '1:10'));
assert(report.results.every(result => ['SUPPORTED', 'UNPROVEN', 'AVOID'].includes(result.grade)));

console.log('PASS official MCX payload variants normalize into expiry-aware futures rows');
console.log('PASS GOLD/GOLDM and other mini/full ratios use equal commodity exposure');
console.log('PASS walk-forward spread evidence grades never imply risk-free profit');
