'use strict';

const MATCHED_FAMILIES = [
 ['GOLD', 'GOLDM'],
 ['SILVER', 'SILVERM', 'SILVERMIC'],
 ['CRUDEOIL', 'CRUDEOILM'],
 ['NATURALGAS', 'NATGASMINI'],
];

const MULTIPLIERS = {
 GOLD: 100,
 GOLDM: 10,
 SILVER: 30,
 SILVERM: 5,
 SILVERMIC: 1,
 CRUDEOIL: 100,
 CRUDEOILM: 10,
 NATURALGAS: 1250,
 NATGASMINI: 250,
};

function number(value) {
 const parsed = Number(String(value == null ? '' : value).replace(/,/g, ''));
 return Number.isFinite(parsed) ? parsed : 0;
}

function text(row, names) {
 for (const name of names) {
  if (row[name] != null && row[name] !== '') return String(row[name]).trim();
 }
 return '';
}

function parseDate(value) {
 const raw = String(value || '').trim();
 if (!raw) return '';
 const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
 if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
 const match = raw.toUpperCase().replace(/[^0-9A-Z]/g, '').match(/^(\d{1,2})([A-Z]{3})(\d{4})$/);
 if (match) {
  const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(match[2]);
  return month < 0 ? '' : `${match[3]}-${String(month + 1).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
 }
 const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
 if (slashMatch) return `${slashMatch[3]}-${String(slashMatch[2]).padStart(2, '0')}-${String(slashMatch[1]).padStart(2, '0')}`;
 return '';
}

function normalizeMcxRow(row = {}) {
 return {
  instrument: text(row, ['Instrument', 'INSTRUMENT', 'instrument', 'InstrumentName', 'instrumentName']).toUpperCase(),
  symbol: text(row, ['Commodity', 'COMMODITY', 'commodity', 'Symbol', 'SYMBOL', 'symbol']).toUpperCase(),
  tradeDate: parseDate(text(row, ['Date', 'DATE', 'date', 'TradeDate', 'tradeDate'])),
  expiry: parseDate(text(row, ['Expiry Date', 'EXPIRY_DT', 'ExpiryDate', 'expiryDate', 'Expiry', 'expiry'])),
  open: number(text(row, ['Open', 'OPEN', 'open'])),
  high: number(text(row, ['High', 'HIGH', 'high'])),
  low: number(text(row, ['Low', 'LOW', 'low'])),
  close: number(text(row, ['Close', 'CLOSE', 'close', 'SettlePrice', 'SETTLE_PR'])),
  volume: number(text(row, ['Vol (Lots)', 'Volume', 'VOLUME', 'volume', 'NoOfContracts'])),
  oi: number(text(row, ['OI (Lots)', 'OpenInterest', 'OPEN_INT', 'oi', 'OI'])),
 };
}

function flattenRows(payload) {
 if (Array.isArray(payload)) return payload;
 if (!payload || typeof payload !== 'object') return [];
 for (const key of ['data', 'Data', 'rows', 'Rows', 'result', 'Result', 'Table', 'Table1', 'd']) {
  const value = payload[key];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
   try {
    const rows = flattenRows(JSON.parse(value));
    if (rows.length) return rows;
   } catch (_) {}
  } else {
   const rows = flattenRows(value);
   if (rows.length) return rows;
  }
 }
 return [];
}

function gcd(a, b) {
 let first = Math.abs(Math.round(a));
 let second = Math.abs(Math.round(b));
 while (second) [first, second] = [second, first % second];
 return first || 1;
}

function matchedRatio(firstSymbol, secondSymbol) {
 const first = MULTIPLIERS[firstSymbol];
 const second = MULTIPLIERS[secondSymbol];
 if (!(first > 0) || !(second > 0)) return null;
 const divisor = gcd(first, second);
 return { firstLots: second / divisor, secondLots: first / divisor, exposure: first * (second / divisor) };
}

function mean(values) {
 return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values) {
 const average = mean(values);
 return values.length > 1 ? Math.sqrt(mean(values.map(value => (value - average) ** 2))) : 0;
}

function maxDrawdown(values) {
 let peak = 0;
 let worst = 0;
 for (const value of values) {
  peak = Math.max(peak, value);
  worst = Math.min(worst, value - peak);
 }
 return worst;
}

function backtestMeanReversion(points, options = {}) {
 const lookback = Math.max(20, Number(options.lookback || 60));
 const entryZ = Math.max(1, Number(options.entryZ || 1.75));
 const exitZ = Math.max(0, Number(options.exitZ || 0.35));
 const stopZ = Math.max(entryZ + 0.25, Number(options.stopZ || 3));
 const cost = Math.max(0, Number(options.roundTripCost || 0));
 const trades = [];
 const equity = [];
 let position = null;
 let cumulative = 0;
 for (let index = lookback; index < points.length; index += 1) {
  const window = points.slice(index - lookback, index).map(point => point.spread);
  const average = mean(window);
  const deviation = standardDeviation(window);
  if (!(deviation > 0)) continue;
  const point = points[index];
  const z = (point.spread - average) / deviation;
  if (!position && Math.abs(z) >= entryZ) {
   position = { side: z > 0 ? -1 : 1, entry: point.spread, entryDate: point.tradeDate, entryZ: z };
   continue;
  }
  if (!position) continue;
  const normalized = position.side === 1 ? z : -z;
  const stopped = normalized <= -stopZ;
  const reverted = Math.abs(z) <= exitZ;
  if (!stopped && !reverted && index < points.length - 1) continue;
  const gross = position.side * (point.spread - position.entry);
  const net = gross - cost;
  cumulative += net;
  equity.push(cumulative);
  trades.push({ ...position, exit: point.spread, exitDate: point.tradeDate, exitZ: z, gross, net, reason: stopped ? 'stop' : reverted ? 'mean' : 'sample_end' });
  position = null;
 }
 const wins = trades.filter(trade => trade.net > 0);
 const losses = trades.filter(trade => trade.net <= 0);
 const net = trades.reduce((sum, trade) => sum + trade.net, 0);
 const returns = trades.map(trade => trade.net);
 const deviation = standardDeviation(returns);
 const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.net, 0));
 return {
  trades: trades.length,
  wins: wins.length,
  losses: losses.length,
  winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
  net,
  averageTrade: trades.length ? net / trades.length : 0,
  profitFactor: grossLoss > 0 ? wins.reduce((sum, trade) => sum + trade.net, 0) / grossLoss : wins.length ? null : 0,
  sharpe: deviation > 0 ? (mean(returns) / deviation) * Math.sqrt(Math.max(1, trades.length)) : 0,
  maxDrawdown: maxDrawdown(equity),
  details: trades,
 };
}

function buildResearch(rows = [], options = {}) {
 const normalized = rows.map(normalizeMcxRow).filter(row => row.instrument === 'FUTCOM' && row.tradeDate && row.expiry && row.close > 0);
 const byDateSymbol = new Map();
 normalized.forEach(row => {
  const key = `${row.tradeDate}|${row.symbol}`;
  if (!byDateSymbol.has(key)) byDateSymbol.set(key, []);
  byDateSymbol.get(key).push(row);
 });
 byDateSymbol.forEach(list => list.sort((a, b) => a.expiry.localeCompare(b.expiry)));
 const series = new Map();
 function addPoint(key, metadata, point) {
  if (!series.has(key)) series.set(key, { ...metadata, key, points: [] });
  series.get(key).points.push(point);
 }
 byDateSymbol.forEach((contracts, key) => {
  const [tradeDate, symbol] = key.split('|');
  if (contracts.length < 2) return;
  const [near, far] = contracts;
  addPoint(`calendar:${symbol}`, { type: 'calendar', family: symbol, label: `${symbol} near / next`, ratio: '1:1' }, {
   tradeDate, expiry: `${near.expiry}/${far.expiry}`, spread: far.close - near.close, firstClose: near.close, secondClose: far.close,
  });
 });
 for (const family of MATCHED_FAMILIES) {
  for (let firstIndex = 0; firstIndex < family.length; firstIndex += 1) {
   for (let secondIndex = firstIndex + 1; secondIndex < family.length; secondIndex += 1) {
    const firstSymbol = family[firstIndex];
    const secondSymbol = family[secondIndex];
    const ratio = matchedRatio(firstSymbol, secondSymbol);
    const dates = new Set(normalized.filter(row => row.symbol === firstSymbol || row.symbol === secondSymbol).map(row => row.tradeDate));
    dates.forEach(tradeDate => {
     const firstRows = byDateSymbol.get(`${tradeDate}|${firstSymbol}`) || [];
     const secondByExpiry = new Map((byDateSymbol.get(`${tradeDate}|${secondSymbol}`) || []).map(row => [row.expiry, row]));
     const pair = firstRows.map(first => [first, secondByExpiry.get(first.expiry)]).find(([, second]) => second);
     if (!pair || !ratio) return;
     const [first, second] = pair;
     addPoint(`matched:${firstSymbol}:${secondSymbol}`, {
      type: 'matched',
      family: `${firstSymbol} / ${secondSymbol}`,
      label: `${ratio.firstLots} ${firstSymbol} vs ${ratio.secondLots} ${secondSymbol}`,
      ratio: `${ratio.firstLots}:${ratio.secondLots}`,
      exposure: ratio.exposure,
     }, {
      tradeDate,
      expiry: first.expiry,
      spread: second.close * ratio.secondLots - first.close * ratio.firstLots,
      firstClose: first.close,
      secondClose: second.close,
     });
    });
   }
  }
 }
 const results = [...series.values()].map(item => {
  item.points.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const splitIndex = Math.floor(item.points.length * 0.7);
  const inSample = backtestMeanReversion(item.points.slice(0, splitIndex), options);
  const outOfSample = backtestMeanReversion(item.points.slice(Math.max(0, splitIndex - Number(options.lookback || 60))), options);
  const supported = outOfSample.trades >= 8
   && outOfSample.net > 0
   && outOfSample.profitFactor != null
   && outOfSample.profitFactor >= 1.15
   && outOfSample.maxDrawdown > -Math.max(outOfSample.net * 1.5, Math.abs(outOfSample.averageTrade) * 8);
  return {
   key: item.key,
   type: item.type,
   family: item.family,
   label: item.label,
   ratio: item.ratio,
   exposure: item.exposure || null,
   observations: item.points.length,
   firstDate: item.points[0]?.tradeDate || '',
   lastDate: item.points[item.points.length - 1]?.tradeDate || '',
   inSample: { ...inSample, details: undefined },
   outOfSample: { ...outOfSample, details: undefined },
   grade: supported ? 'SUPPORTED' : outOfSample.trades >= 8 ? 'AVOID' : 'UNPROVEN',
   warning: 'Historical spread behavior is not risk-free. Futures basis can widen or narrow because of financing, storage, convenience yield, liquidity, and contract-specific shocks.',
  };
 });
 const dates = normalized.map(row => row.tradeDate).sort();
 return {
  generatedAt: new Date().toISOString(),
  methodology: {
   source: 'Official MCX date-wise bhavcopy',
   strategy: 'Rolling 60-session spread mean reversion; 70/30 chronological holdout',
   costs: Number(options.roundTripCost || 0),
   limitations: 'Close-to-close research. It excludes intraday legging risk, margin calls, taxes, exchange fees, changing contract specifications, and unavailable quotes.',
  },
  coverage: {
   rows: normalized.length,
   tradingDays: new Set(dates).size,
   firstDate: dates[0] || '',
   lastDate: dates[dates.length - 1] || '',
  },
  results: results.sort((a, b) => b.observations - a.observations),
 };
}

module.exports = { MATCHED_FAMILIES, MULTIPLIERS, normalizeMcxRow, flattenRows, matchedRatio, backtestMeanReversion, buildResearch };
