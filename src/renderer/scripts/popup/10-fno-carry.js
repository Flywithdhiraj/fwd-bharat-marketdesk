'use strict';

(function initFnoCarry(global) {
 const SETTINGS_KEY = 'fwdCarryModel.v1';
 const HISTORY_KEY = 'fwdCarryBasisHistory.v2';
 const METRIC_HISTORY_KEY = 'fnoCarryMetricHistoryV1';
 const DEFAULT_STATE = {
  view: 'heatmap',
  filter: 'candidates',
  query: '',
  sort: 'netEdge',
  rows: [],
  status: 'idle',
  error: '',
  updatedAt: 0,
  summary: null,
  autoLoaded: false,
  selectedSymbol: '',
  capitalMode: 'ownCash',
  opportunityAnnualPct: 7,
  additionalSettlementCost: 0,
  minNetEdgePerLot: 250,
  history: {},
 };

 const COST_RATES = {
  equityDelivery: {
   transactionPct: 0.0030699,
   sttBuyPct: 0.1,
   sebiPct: 0.0001,
   ipftPct: 0.0000001,
   stampBuyPct: 0.015,
  },
  futuresSell: {
   brokerage: 20,
   transactionPct: 0.00183,
   sttSellPct: 0.05,
   sebiPct: 0.0001,
   ipftPct: 0.0001,
  },
  physicalDelivery: {
   brokeragePct: 0.1,
  },
  gstPct: 18,
 };

 function readLocal(key, fallback) {
  try {
   return JSON.parse(global.localStorage?.getItem(key) || '') || fallback;
  } catch (_) {
   return fallback;
  }
 }

 function writeLocal(key, value) {
  try {
   global.localStorage?.setItem(key, JSON.stringify(value));
  } catch (_) {}
 }

 function storageGet(key) {
  return new Promise(resolve => {
   const storage = global.chrome?.storage?.local;
   if (!storage?.get) {
    resolve({});
    return;
   }
   try {
    storage.get([key], result => resolve(result || {}));
   } catch (_) {
    resolve({});
   }
  });
 }

 function storageSet(payload = {}) {
  return new Promise(resolve => {
   const storage = global.chrome?.storage?.local;
   if (!storage?.set) {
    resolve();
    return;
   }
   try {
    storage.set(payload, () => resolve());
   } catch (_) {
    resolve();
   }
  });
 }

 const settings = readLocal(SETTINGS_KEY, {});
 let state = { ...DEFAULT_STATE, ...settings, history: readLocal(HISTORY_KEY, {}) };

 function esc(value) {
  return String(value == null ? '' : value)
   .replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&#39;');
 }

 function friendlyMarketError(value = '') {
  const text = String(value || '');
  if (/authentication failed|client id|token invalid|401|808/i.test(text)) {
   return 'Dhan connection needs attention. Open Settings & API, save valid credentials, then run the connection check.';
  }
  return text || 'Market data is unavailable. Check the connection and try again.';
 }

 function number(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
 }

 function integer(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '--';
 }

 function signed(value, decimals = 2, suffix = '') {
  if (value == null || value === '') return '--';
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return `${n >= 0 ? '+' : ''}${number(n, decimals)}${suffix}`;
 }

 function percentOf(value, rate) {
  return Number(value || 0) * (Number(rate || 0) / 100);
 }

 function costBreakdown(spotValue, futureValue) {
  const equityTransaction = percentOf(spotValue, COST_RATES.equityDelivery.transactionPct);
  const equitySebi = percentOf(spotValue, COST_RATES.equityDelivery.sebiPct);
  const equityIpft = percentOf(spotValue, COST_RATES.equityDelivery.ipftPct);
  const equityStt = Math.round(percentOf(spotValue, COST_RATES.equityDelivery.sttBuyPct));
  const equityStamp = Math.round(percentOf(spotValue, COST_RATES.equityDelivery.stampBuyPct));
  const equityGst = percentOf(equityTransaction + equitySebi + equityIpft, COST_RATES.gstPct);
  const equityEntry = equityTransaction + equitySebi + equityIpft + equityStt + equityStamp + equityGst;

  const futureBrokerage = COST_RATES.futuresSell.brokerage;
  const futureTransaction = percentOf(futureValue, COST_RATES.futuresSell.transactionPct);
  const futureSebi = percentOf(futureValue, COST_RATES.futuresSell.sebiPct);
  const futureIpft = percentOf(futureValue, COST_RATES.futuresSell.ipftPct);
  const futureStt = Math.round(percentOf(futureValue, COST_RATES.futuresSell.sttSellPct));
  const futureGst = percentOf(futureBrokerage + futureTransaction + futureSebi + futureIpft, COST_RATES.gstPct);
  const futureEntry = futureBrokerage + futureTransaction + futureSebi + futureIpft + futureStt + futureGst;

  const physicalDeliveryBrokerage = percentOf(futureValue, COST_RATES.physicalDelivery.brokeragePct);
  const physicalDeliveryGst = percentOf(physicalDeliveryBrokerage, COST_RATES.gstPct);
  const physicalDelivery = physicalDeliveryBrokerage + physicalDeliveryGst;
  const additional = Math.max(0, Number(state.additionalSettlementCost || 0));
  return {
   equityEntry,
   futureEntry,
   physicalDelivery,
   additional,
   total: equityEntry + futureEntry + physicalDelivery + additional,
   equityStt,
   equityStamp,
   futureStt,
   physicalDeliveryBrokerage,
  };
 }

 function expiryLabel(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '--';
  const parsed = new Date(raw.replace(' ', 'T'));
  if (!Number.isFinite(parsed.getTime())) return raw.split(' ')[0];
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
 }

 async function marketData(action, payload = {}) {
  const bridge = global.fwdDesktopNative;
  if (!bridge?.sendNativeMessage) return { ok: false, error: 'Desktop market-data bridge is not available.' };
 return bridge.sendNativeMessage({ ...payload, type: 'dhan_data', action });
 }

 function estimateRow(row = {}) {
  const depthConfirmed = !!row.depthConfirmed;
  const spotExecution = depthConfirmed ? Number(row.spotAsk || 0) : null;
  const futureExecution = depthConfirmed ? Number(row.futureBid || 0) : null;
  const lotSize = Number(row.lotSize || 0);
  const days = Number(row.daysToExpiry || 0);
  const capital = depthConfirmed ? spotExecution * lotSize : null;
  const grossPerLot = depthConfirmed ? Number(row.executableGrossPerLot || 0) : null;
  const financing = depthConfirmed && state.capitalMode === 'opportunity' ? capital * (Number(state.opportunityAnnualPct || 0) / 100) * (days / 365) : 0;
  const costs = depthConfirmed ? costBreakdown(capital, futureExecution * lotSize) : null;
  const charges = costs?.total ?? null;
  const netEdgePerLot = depthConfirmed ? grossPerLot - financing - charges : null;
  const netAnnualPct = depthConfirmed && row.carryComparable && capital > 0 ? (netEdgePerLot / capital) * (365 / days) * 100 : null;
  let executionStatus = 'Watch only';
  let statusTone = 'watch';
  if (!row.carryComparable || days < 2) {
   executionStatus = 'Expiry risk';
   statusTone = 'risk';
  } else if (!depthConfirmed) {
   executionStatus = 'No depth';
  } else if (Number(row.executableBasis || 0) <= 0) {
   executionStatus = 'No buy-carry edge';
  } else if (netEdgePerLot >= Number(state.minNetEdgePerLot || 0)) {
   executionStatus = 'Cost qualified';
   statusTone = 'qualified';
  } else {
   executionStatus = 'Cost blocked';
   statusTone = 'blocked';
  }
  return {
   ...row,
   spotExecution,
   futureExecution,
   grossPerLot,
   capital,
   financing,
   charges,
   costs,
   netEdgePerLot,
   netAnnualPct,
   executionStatus,
   statusTone,
  };
 }

 function sortedRows() {
  let rows = Array.isArray(state.rows) ? state.rows.map(estimateRow) : [];
  const query = String(state.query || '').trim().toUpperCase();
  if (query) rows = rows.filter(row => String(row.symbol || '').toUpperCase().includes(query));
  if (state.sort === 'premium') rows.sort((a, b) => Number(b.executableAnnualCarryPct ?? b.annualizedCarryPct ?? 0) - Number(a.executableAnnualCarryPct ?? a.annualizedCarryPct ?? 0));
  else if (state.sort === 'discount') rows.sort((a, b) => Number(a.executableAnnualCarryPct ?? a.annualizedCarryPct ?? 0) - Number(b.executableAnnualCarryPct ?? b.annualizedCarryPct ?? 0));
  else if (state.sort === 'oi') rows.sort((a, b) => Number(b.oi || 0) - Number(a.oi || 0));
  else rows.sort((a, b) => Number(b.netEdgePerLot ?? -Infinity) - Number(a.netEdgePerLot ?? -Infinity));
  return rows;
 }

 function isCandidate(row = {}) {
  return row.depthConfirmed && row.carryComparable && Number(row.executableBasis || 0) > 0;
 }

 function bestCandidate(rows = []) {
  return rows.filter(isCandidate).slice().sort((a, b) => Number(b.netEdgePerLot ?? -Infinity) - Number(a.netEdgePerLot ?? -Infinity))[0] || null;
 }

 function visibleRows(rows = []) {
  if (state.filter === 'candidates') return rows.filter(isCandidate);
  if (state.filter === 'noDepth') return rows.filter(row => !row.depthConfirmed);
  if (state.filter === 'reverse') return rows.filter(row => row.depthConfirmed && Number(row.executableBasis || 0) <= 0);
  return rows.slice().sort((a, b) => {
   const rank = row => row.executionStatus === 'Cost qualified' ? 0 : row.executionStatus === 'Cost blocked' ? 1 : row.executionStatus === 'No depth' ? 2 : 3;
   return rank(a) - rank(b) || Number(b.netEdgePerLot ?? -Infinity) - Number(a.netEdgePerLot ?? -Infinity);
  });
 }

 function activeRow(rows = []) {
  const selected = rows.find(row => row.symbol === state.selectedSymbol);
  if (selected) return selected;
  const first = rows[0] || null;
  if (first) state.selectedSymbol = first.symbol;
  return first;
 }

 function rowTone(row = {}) {
  return row.statusTone || 'watch';
 }

 function snapshotHistory(rows = []) {
  const now = Number(state.updatedAt || Date.now());
  rows.forEach(row => {
   if (!row.depthConfirmed) return;
   const value = Number(row.executableBasis);
   if (!Number.isFinite(value)) return;
   const points = Array.isArray(state.history[row.symbol]) ? state.history[row.symbol] : [];
   const prior = points[points.length - 1];
   if (!prior || prior.ts !== now) points.push({ ts: now, basis: value, net: row.depthConfirmed ? Number(row.netEdgePerLot || 0) : null });
   state.history[row.symbol] = points.slice(-64);
  });
  writeLocal(HISTORY_KEY, state.history);
 }

 function median(values = []) {
  const sorted = values.filter(value => Number.isFinite(Number(value))).map(Number).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
 }

 async function snapshotCarryMetricHistory(rows = []) {
  const comparable = rows.filter(row => row.carryComparable && Number.isFinite(Number(row.annualizedCarryPct)));
  const executable = comparable.filter(row => row.depthConfirmed && Number.isFinite(Number(row.executableAnnualCarryPct)));
  const values = (executable.length ? executable : comparable)
   .map(row => Number(executable.length ? row.executableAnnualCarryPct : row.annualizedCarryPct));
  const carryAnnualPct = median(values);
  if (carryAnnualPct == null) return;
  const timestamp = Number(state.updatedAt || Date.now());
  const stored = await storageGet(METRIC_HISTORY_KEY);
  const history = Array.isArray(stored[METRIC_HISTORY_KEY]) ? stored[METRIC_HISTORY_KEY].slice() : [];
  const snapshot = {
   ts: timestamp,
   carryAnnualPct: +carryAnnualPct.toFixed(4),
   carryUsableRows: comparable.length,
   carryExecutableRows: executable.length,
   carrySource: executable.length ? 'executable_depth' : 'indicative_quote',
  };
  const prior = history[history.length - 1];
  if (!prior || Number(prior.ts || 0) !== timestamp) history.push(snapshot);
  else history[history.length - 1] = snapshot;
  await storageSet({ [METRIC_HISTORY_KEY]: history.slice(-730) });
 }

 function persistSettings() {
  writeLocal(SETTINGS_KEY, {
   capitalMode: state.capitalMode,
   opportunityAnnualPct: state.opportunityAnnualPct,
   additionalSettlementCost: state.additionalSettlementCost,
   minNetEdgePerLot: state.minNetEdgePerLot,
  });
 }

 function summaryHtml(rows = []) {
  const qualified = rows.filter(row => row.executionStatus === 'Cost qualified').length;
  const depth = rows.filter(row => row.depthConfirmed).length;
  const best = bestCandidate(rows);
  const cards = [
   ['Mapped contracts', integer(state.summary?.quotedContracts ?? rows.length), `${integer(state.summary?.totalContracts ?? rows.length)} active stock futures`, 'neutral'],
   ['One-lot depth', integer(depth), 'Cash buy and future sell fillable', 'neutral'],
   ['Cost qualified', integer(qualified), best ? `Best ${esc(best.symbol)} ${signed(best.netEdgePerLot, 0, ' Rs/lot')}` : 'No executable positive basis', qualified ? 'discount' : 'premium'],
   ['Expiry day', integer(state.summary?.expiryDayRows || 0), 'Execution score hidden inside 24 hours', 'neutral'],
  ];
  return cards.map(([label, value, copy, tone]) => `<div class="carry-metric ${tone}">
   <span>${esc(label)}</span>
   <strong>${esc(value)}</strong>
   <small>${copy}</small>
  </div>`).join('');
 }

 function filterHtml(rows = []) {
  const counts = {
   candidates: rows.filter(isCandidate).length,
   all: rows.length,
   noDepth: rows.filter(row => !row.depthConfirmed).length,
   reverse: rows.filter(row => row.depthConfirmed && Number(row.executableBasis || 0) <= 0).length,
  };
  return `<div class="carry-filters" role="tablist" aria-label="Carry opportunity filter">
   <button type="button" data-carry-filter="candidates" class="${state.filter === 'candidates' ? 'active' : ''}">Buy carry <b>${integer(counts.candidates)}</b></button>
   <button type="button" data-carry-filter="all" class="${state.filter === 'all' ? 'active' : ''}">All <b>${integer(counts.all)}</b></button>
   <button type="button" data-carry-filter="noDepth" class="${state.filter === 'noDepth' ? 'active' : ''}">No depth <b>${integer(counts.noDepth)}</b></button>
   <button type="button" data-carry-filter="reverse" class="${state.filter === 'reverse' ? 'active' : ''}">Reverse watch <b>${integer(counts.reverse)}</b></button>
  </div>`;
 }

 function answerHtml(rows = []) {
  const best = bestCandidate(rows);
  if (!best) return '<div class="carry-answer warn"><strong>No executable buy-carry premium available.</strong><span>Use No depth for quotes that could not fill one lot, or Reverse watch for negative basis rows.</span></div>';
  if (best.executionStatus === 'Cost qualified') return `<div class="carry-answer good"><strong>${esc(best.symbol)} clears the model at ${signed(best.netEdgePerLot, 0)} Rs/lot.</strong><span>Confirm current depth and contract adjustments before action.</span></div>`;
  return `<div class="carry-answer warn"><strong>No buy-carry candidate clears your cost model.</strong><span>Closest row is ${esc(best.symbol)} at ${signed(best.netEdgePerLot, 0)} Rs/lot after estimated financing and charges.</span></div>`;
 }

 function heatmapHtml(rows = []) {
  if (!rows.length) return '<div class="carry-empty">No active stock-future basis rows match the current filter.</div>';
  return `<div class="carry-heatmap">${rows.map(row => `<button type="button" class="carry-tile ${rowTone(row)} ${row.symbol === state.selectedSymbol ? 'selected' : ''}" data-carry-symbol="${esc(row.symbol)}">
   <div class="carry-tile-head"><strong>${esc(row.symbol)}</strong><span>${esc(row.executionStatus)}</span></div>
   <b>${row.depthConfirmed ? signed(row.netAnnualPct, 2, '% net annual') : 'Watch only'}</b>
   <div class="carry-tile-data">
    <small>Basis ${signed(row.depthConfirmed ? row.executableBasis : row.basis, 2)}</small>
    <small>Net ${row.depthConfirmed ? signed(row.netEdgePerLot, 0) : '--'}</small>
    <small>${number(row.daysToExpiry, 1)}d</small>
   </div>
  </button>`).join('')}</div>`;
 }

 function arbitrageHtml(rows = []) {
  if (!rows.length) return '<div class="carry-empty">No active stock-future basis rows match the current filter.</div>';
  return `<div class="carry-table-wrap">
   <table class="carry-table">
    <thead><tr>
     <th>Symbol</th><th>Cash buy VWAP</th><th>Future sell VWAP</th><th>Expiry</th><th>Exec basis</th>
     <th>Gross/lot</th><th>Model cost</th><th>Net/lot</th><th>Net annual</th><th>OI</th><th>Status</th>
    </tr></thead>
    <tbody>${rows.map(row => `<tr data-carry-symbol="${esc(row.symbol)}" class="${row.symbol === state.selectedSymbol ? 'selected' : ''}">
     <td><strong>${esc(row.symbol)}</strong><small>${esc(row.nearFuture?.tradingSymbol || '')}</small></td>
     <td>${row.depthConfirmed ? number(row.spotAsk) : '--'}</td>
     <td>${row.depthConfirmed ? number(row.futureBid) : '--'}</td>
     <td>${expiryLabel(row.nearFuture?.expiry)}<small>${number(row.daysToExpiry, 1)}d left</small></td>
     <td class="${Number(row.executableBasis || 0) >= 0 ? 'up' : 'down'}">${row.depthConfirmed ? signed(row.executableBasis) : '--'}</td>
     <td>${row.depthConfirmed ? signed(row.grossPerLot, 0) : '--'}</td>
     <td>${row.depthConfirmed ? number(row.financing + row.charges, 0) : '--'}</td>
     <td class="${row.netEdgePerLot >= 0 ? 'up' : 'down'}">${row.depthConfirmed ? signed(row.netEdgePerLot, 0) : '--'}</td>
     <td>${row.depthConfirmed ? signed(row.netAnnualPct, 2, '%') : '--'}</td>
     <td>${integer(row.oi)}</td>
     <td><span class="carry-read ${rowTone(row)}">${esc(row.executionStatus)}</span></td>
    </tr>`).join('')}</tbody>
   </table>
  </div>`;
 }

 function historySvg(symbol = '') {
  const points = Array.isArray(state.history[symbol]) ? state.history[symbol] : [];
  if (points.length < 2) return '<div class="carry-history-empty">History starts after each refresh on this device.</div>';
  const values = points.map(point => Number(point.basis)).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.01);
  const path = values.map((value, index) => {
   const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
   const y = 38 - ((value - min) / span) * 34;
   return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  return `<svg class="carry-history-chart" viewBox="0 0 100 42" preserveAspectRatio="none" aria-label="Stored executable basis history">
   <path d="${path}"></path>
  </svg><small>${points.length} local snapshots | Basis range ${signed(min)} to ${signed(max)}</small>`;
 }

 function detailHtml(row) {
  if (!row) return '';
  return `<section class="carry-detail" aria-label="Selected carry setup">
   <header>
    <div><span>Selected execution check</span><strong>${esc(row.symbol)}</strong><small>${esc(row.nearFuture?.tradingSymbol || '')}</small></div>
    <span class="carry-read ${rowTone(row)}">${esc(row.executionStatus)}</span>
   </header>
   <div class="carry-leg-grid">
    <div><span>Buy cash one-lot VWAP</span><b>${row.depthConfirmed ? number(row.spotAsk) : '--'}</b><small>Capital/lot Rs ${row.depthConfirmed ? integer(row.capital) : '--'}</small></div>
    <div><span>Sell future one-lot VWAP</span><b>${row.depthConfirmed ? number(row.futureBid) : '--'}</b><small>Lot ${integer(row.lotSize)} | OI ${integer(row.oi)}</small></div>
    <div class="net ${row.netEdgePerLot >= 0 ? 'up' : 'down'}"><span>Estimated net/lot</span><b>${row.depthConfirmed ? signed(row.netEdgePerLot, 0) : '--'}</b><small>${row.depthConfirmed ? signed(row.netAnnualPct, 2, '% annual') : 'Needs one-lot depth'}</small></div>
   </div>
   <div class="carry-cost-grid">
    <div><span>Gross basis/lot</span><strong>${row.depthConfirmed ? signed(row.grossPerLot, 0) : '--'}</strong></div>
    <div><span>${state.capitalMode === 'ownCash' ? 'Financing - own cash' : 'Opportunity cost'}</span><strong>${row.depthConfirmed ? number(row.financing, 0) : '--'}</strong></div>
    <div><span>Contract cost estimate</span><strong>${row.depthConfirmed ? number(row.charges, 0) : '--'}</strong></div>
    <div><span>Days to expiry</span><strong>${number(row.daysToExpiry, 1)}</strong></div>
   </div>
   ${row.depthConfirmed ? `<div class="carry-cost-breakdown" aria-label="Estimated charge breakdown">
    <div><span>Cash buy taxes and fees</span><strong>${number(row.costs.equityEntry, 0)}</strong><small>Delivery STT ${number(row.costs.equityStt, 0)} | Stamp ${number(row.costs.equityStamp, 0)}</small></div>
    <div><span>Future sell order</span><strong>${number(row.costs.futureEntry, 0)}</strong><small>Futures STT ${number(row.costs.futureStt, 0)} at 0.05%</small></div>
    <div><span>Expiry delivery brokerage</span><strong>${number(row.costs.physicalDelivery, 0)}</strong><small>0.10% brokerage plus GST</small></div>
    <div><span>Additional settlement</span><strong>${number(row.costs.additional, 0)}</strong><small>Editable allowance</small></div>
   </div>` : ''}
   <div class="carry-history"><span>Executable basis history - local snapshots</span>${historySvg(row.symbol)}</div>
   <div class="carry-caution">Individual stock futures held to expiry require physical settlement. A short future requires share delivery; confirm broker instructions, sufficient holdings, expiry-day margin, and corporate actions before trading.</div>
  </section>`;
 }

 function render() {
  const root = document.getElementById('pane-carry');
  if (!root) return;
  const allRows = sortedRows();
  const rows = visibleRows(allRows);
  const selected = activeRow(rows);
  root.innerHTML = `<section class="carry-workspace">
   <header class="carry-head">
    <div>
     <div class="command-eyebrow">F&O Carry</div>
     <h2>Cash and futures execution edge</h2>
     <p>One-lot depth VWAP for buying cash and selling its stock future. Own Cash shows the spread after estimated contract costs; Opportunity Cost also applies a selected annual capital rate.</p>
    </div>
    <div class="carry-refresh-state ${state.error ? 'bad' : state.status === 'loading' ? 'warn' : 'good'}">
     <span>Snapshot</span>
     <strong>${esc(state.status === 'loading' ? 'Refreshing...' : state.error ? 'Unavailable' : state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString('en-IN') : 'Ready')}</strong>
     <small>${esc(state.error ? friendlyMarketError(state.error) : 'Read-only market data')}</small>
    </div>
   </header>
   <div class="carry-controls">
    <div class="carry-view-toggle" role="tablist" aria-label="Carry display mode">
     <button type="button" data-carry-view="heatmap" class="${state.view === 'heatmap' ? 'active' : ''}">Heatmap</button>
     <button type="button" data-carry-view="arbitrage" class="${state.view === 'arbitrage' ? 'active' : ''}">Execution Table</button>
    </div>
    <input type="search" id="carrySearch" value="${esc(state.query)}" placeholder="Search F&O stock" aria-label="Search F&O stock">
    <select id="carrySort" aria-label="Sort carry rows">
     <option value="netEdge" ${state.sort === 'netEdge' ? 'selected' : ''}>Highest net edge</option>
     <option value="premium" ${state.sort === 'premium' ? 'selected' : ''}>Highest executable carry</option>
     <option value="discount" ${state.sort === 'discount' ? 'selected' : ''}>Deepest discount</option>
     <option value="oi" ${state.sort === 'oi' ? 'selected' : ''}>Highest OI</option>
    </select>
    <button type="button" class="bsm" id="carryRefresh" ${state.status === 'loading' ? 'disabled' : ''}>Refresh</button>
   </div>
   <div class="carry-model" aria-label="Carry cost assumptions">
    <div class="carry-capital-toggle" role="radiogroup" aria-label="Capital cost mode">
     <button type="button" data-capital-mode="ownCash" class="${state.capitalMode === 'ownCash' ? 'active' : ''}">Own Cash</button>
     <button type="button" data-capital-mode="opportunity" class="${state.capitalMode === 'opportunity' ? 'active' : ''}">Opportunity Cost</button>
    </div>
    <label>Opportunity annual %<input type="number" id="carryOpportunity" min="0" max="50" step="0.1" value="${esc(state.opportunityAnnualPct)}" ${state.capitalMode === 'ownCash' ? 'disabled' : ''}></label>
    <label>Additional settlement Rs<input type="number" id="carryAdditionalCost" min="0" step="1" value="${esc(state.additionalSettlementCost)}"></label>
    <label>Minimum net Rs/lot<input type="number" id="carryMinNet" min="0" step="50" value="${esc(state.minNetEdgePerLot)}"></label>
    <small>Published tariff estimate; verify the final contract note.</small>
   </div>
   <div class="carry-metrics">${summaryHtml(allRows)}</div>
   <div class="carry-guide">Only rows with depth for one complete lot qualify. Cost estimate includes cash-buy taxes and fees, future-sell order costs, and expiry physical-delivery brokerage; any contract-note difference can be added above.</div>
   ${filterHtml(allRows)}
   ${answerHtml(allRows)}
   ${detailHtml(selected)}
   ${state.view === 'heatmap' ? heatmapHtml(rows) : arbitrageHtml(rows)}
  </section>`;
  bind();
 }

 async function refresh() {
  state = { ...state, autoLoaded: true, status: 'loading', error: '' };
  render();
  try {
   const response = await marketData('fno_carry', { limit: 250 });
   if (!response?.ok) throw new Error(response?.error || 'Carry snapshot request failed.');
   state = {
    ...state,
    rows: Array.isArray(response.rows) ? response.rows : [],
    summary: response,
    status: 'ready',
    updatedAt: Number(response.updatedAt || Date.now()),
    error: '',
   };
    const estimatedRows = state.rows.map(estimateRow);
    snapshotHistory(estimatedRows);
    await snapshotCarryMetricHistory(estimatedRows);
  } catch (error) {
   state = { ...state, status: 'error', error: error?.message || 'Carry snapshot request failed.' };
  }
  render();
 }

 function bind() {
  document.querySelectorAll('[data-carry-view]').forEach(button => button.addEventListener('click', () => {
   state.view = String(button.dataset.carryView || 'heatmap');
   render();
  }));
  document.querySelectorAll('[data-carry-symbol]').forEach(element => element.addEventListener('click', () => {
   state.selectedSymbol = String(element.dataset.carrySymbol || '');
   render();
  }));
  document.querySelectorAll('[data-carry-filter]').forEach(button => button.addEventListener('click', () => {
   state.filter = String(button.dataset.carryFilter || 'candidates');
   state.selectedSymbol = '';
   render();
  }));
  document.querySelectorAll('[data-capital-mode]').forEach(button => button.addEventListener('click', () => {
   state.capitalMode = String(button.dataset.capitalMode || 'ownCash');
   persistSettings();
   render();
  }));
  document.getElementById('carrySearch')?.addEventListener('input', event => {
   state.query = String(event.target.value || '');
   render();
  });
  document.getElementById('carrySort')?.addEventListener('change', event => {
   state.sort = String(event.target.value || 'netEdge');
   render();
  });
  [
   ['carryOpportunity', 'opportunityAnnualPct'],
   ['carryAdditionalCost', 'additionalSettlementCost'],
   ['carryMinNet', 'minNetEdgePerLot'],
  ].forEach(([id, field]) => document.getElementById(id)?.addEventListener('change', event => {
   const value = Number(event.target.value);
   if (Number.isFinite(value) && value >= 0) state[field] = value;
   persistSettings();
   render();
  }));
  document.getElementById('carryRefresh')?.addEventListener('click', refresh);
 }

 async function renderFnoCarry() {
  const root = document.getElementById('pane-carry');
  if (root) root.dataset.lazyReady = 'true';
  render();
  if (!state.autoLoaded && state.status !== 'loading') await refresh();
 }

 global.renderFnoCarry = renderFnoCarry;
})(window);
