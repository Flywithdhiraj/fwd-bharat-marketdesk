'use strict';

(function initCommodities(global) {
 const PLANS_KEY = 'fwdCommodityPlans.v1';
 const FEATURED = new Set(['GOLD', 'GOLDM', 'SILVER', 'SILVERM', 'SILVERMIC', 'CRUDEOIL', 'CRUDEOILM', 'NATURALGAS', 'NATGASMINI', 'COPPER', 'ZINC', 'ALUMINIUM', 'LEAD']);
 function readPlans() {
  try {
   const plans = JSON.parse(global.localStorage?.getItem(PLANS_KEY) || '[]');
   return Array.isArray(plans) ? plans : [];
  } catch (_) {
   return [];
  }
 }

 function writePlans(plans = []) {
  try {
   global.localStorage?.setItem(PLANS_KEY, JSON.stringify(plans.slice(0, 30)));
  } catch (_) {}
 }

 const state = {
  rows: [],
  selectedSymbol: '',
  query: '',
  filter: 'featured',
  status: 'idle',
  error: '',
  updatedAt: 0,
  summary: null,
  autoLoaded: false,
  socket: null,
  planScope: 'calendar',
  planDirection: 'buyNear',
  productType: 'MARGIN',
  quantity: 1,
  marginStatus: 'idle',
  marginError: '',
  marginPreview: null,
  plans: readPlans(),
  workspaceView: 'watch',
  labStatus: 'idle',
  labError: '',
  labResults: [],
  labSummary: null,
  selectedLabSymbol: '',
  spreadMode: 'calendar',
  spreadKey: '',
  spreadEntryDate: '',
  spreadEntryBuyPrice: '',
  spreadEntrySellPrice: '',
  spreadBuyLots: 1,
  spreadSellLots: 1,
  spreadCosts: 0,
  spreadStatus: 'idle',
  spreadError: '',
  spreadAnalysis: null,
  spreadDeskStatus: 'idle',
  spreadDeskError: '',
  spreadRows: [],
  spreadSummary: null,
  spreadDeskType: 'all',
  selectedSpreadKey: '',
  spreadDeskProgress: null,
  spreadDeskRunId: 0,
  spreadDeskStopRequested: false,
  spreadBackfillStatus: null,
  spreadChartView: 'continuous',
  spreadExpiryCatalog: {},
  spreadExpiryCatalogStatus: 'idle',
 };
 let livePollTimer = null;
 let spreadQuoteTimer = null;
 let spreadBackfillTimer = null;

 function esc(value) {
  return String(value == null ? '' : value)
   .replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&#39;');
 }

 function number(value, decimals = 2) {
  const n = Number(value);
  return Number.isFinite(n)
   ? n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
   : '--';
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

 function expiry(value = '') {
  const date = new Date(String(value || '').replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return '--';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
 }

 function fullDate(value = '') {
  const date = new Date(String(value || '').replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return '--';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
 }

 function dateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
 }

 function lastCompletedMarketDate(now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() - 1);
  return dateInputValue(date);
 }

 async function marketData(action, payload = {}) {
  const bridge = global.fwdDesktopNative;
  if (!bridge?.sendNativeMessage) return { ok: false, error: 'Desktop market-data bridge is not available.' };
  return bridge.sendNativeMessage({ ...payload, type: 'dhan_data', action });
 }

 async function notifySpread(title = '', body = '') {
  const bridge = global.fwdDesktopNative;
  if (!bridge?.sendNativeMessage) return;
  await bridge.sendNativeMessage({ type: 'desktop_notification', title, body, urgency: 'high' }).catch(() => {});
 }

 function matchingRows() {
  const q = state.query.trim().toUpperCase();
  return state.rows.filter(row => {
   if (state.filter === 'featured' && !FEATURED.has(row.symbol)) return false;
   if (state.filter === 'paired' && !row.nextFuture) return false;
   if (state.filter === 'depth' && !row.depthConfirmed) return false;
   return !q || row.symbol.includes(q) || String(row.nearFuture?.tradingSymbol || '').includes(q);
  });
 }

 function currentRow(rows = matchingRows()) {
  const selected = rows.find(row => row.symbol === state.selectedSymbol);
  if (selected) return selected;
  state.selectedSymbol = rows[0]?.symbol || '';
  return rows[0] || null;
 }

 function mergeLiveTicks(response = {}) {
  const ticks = new Map((Array.isArray(response.ticks) ? response.ticks : []).map(tick => [String(tick.securityId || ''), tick]));
  if (!ticks.size) return;
  state.rows = state.rows.map(row => {
   const near = ticks.get(String(row.nearFuture?.securityId || ''));
   const next = ticks.get(String(row.nextFuture?.securityId || ''));
   const nearPrice = Number(near?.lastPrice || row.nearPrice || 0);
   const nextPrice = Number(next?.lastPrice || row.nextPrice || 0);
   const indicativeSpread = nearPrice > 0 && nextPrice > 0 ? nextPrice - nearPrice : row.indicativeSpread;
   const annualizedSpreadPct = indicativeSpread != null && nearPrice > 0 && Number(row.termDays || 0) > 0
    ? (indicativeSpread / nearPrice) * (365 / row.termDays) * 100
    : row.annualizedSpreadPct;
   return {
    ...row,
    nearPrice,
    nextPrice,
    indicativeSpread,
    annualizedSpreadPct,
    liveAt: Math.max(Number(near?.updatedAt || 0), Number(next?.updatedAt || 0)),
   };
  });
  state.spreadRows = state.spreadRows.map(row => {
   const first = ticks.get(String(row.firstInstrument?.securityId || ''));
   const second = ticks.get(String(row.secondInstrument?.securityId || ''));
   const firstPrice = Number(first?.lastPrice || row.firstPrice || 0);
   const secondPrice = Number(second?.lastPrice || row.secondPrice || 0);
   return {
    ...row,
    firstPrice,
    secondPrice,
    spread: firstPrice > 0 && secondPrice > 0 ? secondPrice - firstPrice : row.spread,
   };
  });
  checkSpreadAlerts();
 }

 function mergeSpreadQuotes(response = {}) {
  const updates = new Map((Array.isArray(response.rows) ? response.rows : []).map(row => [String(row.key || ''), row]));
  if (!updates.size) return;
  state.spreadRows = state.spreadRows.map(row => {
   const update = updates.get(String(row.key || ''));
   if (!update) return row;
   const analysis = row.analysis || {};
   const action = String(analysis.action || 'WAIT');
   const targetMove = analysis.direction === 'widening'
    ? Number(analysis.target || analysis.targetSpread || 0) - Number(update.spread || 0)
    : analysis.direction === 'narrowing'
     ? Number(update.spread || 0) - Number(analysis.target || analysis.targetSpread || 0)
     : 0;
   const slippagePoints = analysis.direction === 'widening'
    ? Number(update.costs?.wideningSlippagePoints || 0)
    : analysis.direction === 'narrowing'
     ? Number(update.costs?.narrowingSlippagePoints || 0)
     : 0;
   const costRequiredMove = (Number(update.costs?.brokerageBreakevenPoints || 0) + slippagePoints) * 1.1;
   const costEdgeAvailable = targetMove > costRequiredMove;
   const blockers = Array.from(new Set([
    ...(analysis.blockers || []),
    ...(update.safeguards?.warnings || []),
    ...(!costEdgeAvailable && action !== 'WAIT' ? ['Expected target does not clear brokerage, GST, visible slippage, and the safety buffer.'] : []),
   ]));
   return {
    ...row,
    ...update,
    analysis: {
     ...analysis,
     blockers,
     targetMove,
     costRequiredMove,
     costEdgeAvailable,
     tradeAllowed: action !== 'WAIT' && blockers.length === 0 && update.safeguards?.tradeAllowed === true && costEdgeAvailable,
    },
   };
  });
  checkSpreadAlerts();
 }

 function checkSpreadAlerts() {
  let changed = false;
  state.plans = state.plans.map(plan => {
   if (plan.scope !== 'spread') return plan;
   const row = state.spreadRows.find(item => item.key === plan.spreadKey);
   if (!row) return plan;
   const current = Number(row.spread);
   if (!Number.isFinite(current)) return plan;
   const next = { ...plan };
   const targetHit = plan.direction === 'widening'
    ? current >= Number(plan.targetSpread)
    : plan.direction === 'narrowing' && current <= Number(plan.targetSpread);
   const stopHit = plan.direction === 'widening'
    ? current <= Number(plan.stopSpread)
    : plan.direction === 'narrowing' && current >= Number(plan.stopSpread);
   const directionChanged = row.analysis?.direction && row.analysis.direction !== 'range' && row.analysis.direction !== plan.direction;
   const entryHit = plan.direction === 'widening'
    ? current >= Number(plan.entryTrigger)
    : plan.direction === 'narrowing' && current <= Number(plan.entryTrigger);
   if (entryHit && !plan.entryAlertedAt) {
    next.entryAlertedAt = Date.now();
    notifySpread(`${plan.symbol} entry trigger reached`, `Spread ${signed(current)} crossed trigger ${signed(plan.entryTrigger)}.`);
    changed = true;
   }
   if (targetHit && !plan.targetAlertedAt) {
    next.targetAlertedAt = Date.now();
    notifySpread(`${plan.symbol} target reached`, `Spread ${signed(current)} crossed target ${signed(plan.targetSpread)}.`);
    changed = true;
   }
   if (stopHit && !plan.stopAlertedAt) {
    next.stopAlertedAt = Date.now();
    notifySpread(`${plan.symbol} stop reached`, `Spread ${signed(current)} crossed stop ${signed(plan.stopSpread)}.`);
    changed = true;
   }
   if (directionChanged && !plan.directionAlertedAt) {
    next.directionAlertedAt = Date.now();
    notifySpread(`${plan.symbol} direction changed`, `Saved ${plan.direction} watch is now ${row.analysis.direction}.`);
    changed = true;
   }
   return next;
  });
  if (changed) writePlans(state.plans);
 }

 async function pollLive() {
  if (!document.getElementById('pane-commodities')?.classList.contains('active')) return;
  const response = await marketData('live_feed_status', { limit: 100 }).catch(() => null);
  if (!response?.ok) return;
  state.socket = response;
  mergeLiveTicks(response);
  render();
 }

 async function refreshSpreadQuotes() {
  if (state.workspaceView !== 'spread' || !state.spreadRows.length) return;
  const response = await marketData('commodity_spread_quotes', { pairs: state.spreadRows }).catch(() => null);
  if (!response?.ok) return;
  mergeSpreadQuotes(response);
  render();
 }

 function beginLivePoll() {
  if (livePollTimer) return;
  livePollTimer = global.setInterval(() => pollLive().catch(() => {}), 2500);
  if (!spreadQuoteTimer) spreadQuoteTimer = global.setInterval(() => refreshSpreadQuotes().catch(() => {}), 5000);
 }

 async function subscribeLive() {
  const instruments = [
   ...state.rows.slice(0, 30).flatMap(row => [row.nearFuture, row.nextFuture].filter(Boolean)),
   ...state.spreadRows.slice(0, 30).flatMap(row => [row.firstInstrument, row.secondInstrument].filter(Boolean)),
  ];
  if (!instruments.length) return;
  state.socket = await marketData('live_feed_subscribe', { symbols: instruments, mode: 'quote', owner: 'commodities' }).catch(() => null);
  beginLivePoll();
 }

 async function stopLive() {
  state.socket = await marketData('live_feed_unsubscribe', { owner: 'commodities' }).catch(() => ({ ok: false, status: 'stopped' }));
  if (livePollTimer) {
   global.clearInterval(livePollTimer);
   livePollTimer = null;
  }
  if (spreadQuoteTimer) {
   global.clearInterval(spreadQuoteTimer);
   spreadQuoteTimer = null;
  }
  render();
 }

 function statusTone(row = {}) {
  if (!row.nextFuture) return 'watch';
  if (row.depthConfirmed) return 'ready';
  return 'observe';
 }

 function metricsHtml(rows = []) {
  const paired = state.rows.filter(row => row.nextFuture).length;
  const depth = state.rows.filter(row => row.depthConfirmed).length;
  const live = state.socket?.connected ? 'Connected' : state.socket?.status === 'connecting' ? 'Connecting' : 'Snapshot';
  return `<div class="commodity-metrics">
   <div><span>Active underlyings</span><strong>${integer(state.summary?.totalUnderlyings ?? state.rows.length)}</strong><small>MCX commodity futures</small></div>
   <div><span>Calendar pairs</span><strong>${integer(paired)}</strong><small>Near and next expiries</small></div>
   <div><span>Depth observed</span><strong>${integer(depth)}</strong><small>Both spread legs quoted</small></div>
   <div class="${state.socket?.connected ? 'live' : ''}"><span>Price feed</span><strong>${esc(live)}</strong><small>${state.socket?.connected ? `${integer(state.socket.tickCount)} ticks received` : 'REST snapshot available'}</small></div>
  </div>`;
 }

 function watchHtml(rows = []) {
  if (!rows.length) return '<div class="commodity-empty">No commodity futures match the current filter.</div>';
  return `<div class="commodity-watch">${rows.map(row => `<button type="button" class="commodity-card ${statusTone(row)} ${row.symbol === state.selectedSymbol ? 'selected' : ''}" data-commodity-symbol="${esc(row.symbol)}">
   <header><strong>${esc(row.symbol)}</strong><span>${expiry(row.nearFuture?.expiry)}</span></header>
   <b>${number(row.nearPrice)}</b>
   <div><small>Front future</small><small>${row.nextFuture ? `Next ${number(row.nextPrice)}` : 'Single expiry'}</small></div>
   <footer><span>Spread</span><strong>${row.nextFuture ? signed(row.indicativeSpread) : '--'}</strong></footer>
  </button>`).join('')}</div>`;
 }

 function detailHtml(row) {
  if (!row) return '';
  ensureSpreadInputs(row);
  return `<section class="commodity-detail" aria-label="Selected commodity future">
   <header>
    <div><span>Selected contract</span><strong>${esc(row.symbol)}</strong><small>${esc(row.nearFuture?.tradingSymbol || '')}</small></div>
    <div class="commodity-chart-actions">
     ${row.nextFuture ? `<button type="button" class="bsm commodity-primary" data-commodity-calendar-chart="${esc(row.symbol)}">Calendar Spread 1D</button>` : ''}
     <button type="button" class="bsm" data-commodity-chart="${esc(row.nearFuture?.tradingSymbol || '')}" data-commodity-timeframe="1d">Trend 1D</button>
     <button type="button" class="bsm" data-commodity-chart="${esc(row.nearFuture?.tradingSymbol || '')}" data-commodity-timeframe="4h">Trade 4H</button>
    </div>
   </header>
   <div class="commodity-leg-grid">
    <div><span>Near expiry</span><b>${number(row.nearPrice)}</b><small>${expiry(row.nearFuture?.expiry)} | OI ${integer(row.oi)}</small></div>
    <div><span>Next expiry</span><b>${row.nextFuture ? number(row.nextPrice) : '--'}</b><small>${row.nextFuture ? `${expiry(row.nextFuture.expiry)} | ${number(row.termDays, 1)} days apart` : 'No next contract loaded'}</small></div>
    <div><span>Indicative calendar spread</span><b class="${Number(row.indicativeSpread || 0) >= 0 ? 'up' : 'down'}">${row.nextFuture ? signed(row.indicativeSpread) : '--'}</b><small>${row.nextFuture ? signed(row.annualizedSpreadPct, 2, '% annualised observation') : 'Needs two expiries'}</small></div>
   </div>
   <div class="commodity-execution">
    <div><span>Depth status</span><strong>${row.depthConfirmed ? 'Observed' : 'Indicative only'}</strong></div>
    <div><span>Best quoted structure</span><strong>${esc(row.executableDirection || '--')}</strong></div>
    <div><span>Quoted spread</span><strong>${row.executableSpread == null ? '--' : signed(row.executableSpread)}</strong></div>
   <div><span>Quote quantity</span><strong>${integer(row.quoteQuantity)}</strong></div>
   </div>
   ${spreadResearchHtml(row)}
   ${plannerHtml(row)}
   <div class="commodity-caution">Calendar spread view compares two MCX futures expiries. Close-to-close history is research only, not guaranteed profit or an executable quote. No order is placed from this workspace.</div>
  </section>`;
 }

 function labRowTone(row = {}) {
  if (row.raw?.rollRisk) return 'roll';
  if (row.signal === 'BUY') return 'long';
  if (row.signal === 'SELL') return 'short';
  return 'watch';
 }

 function labSelectedRow(rows = state.labResults) {
  const selected = rows.find(row => row.symbol === state.selectedLabSymbol);
  if (selected) return selected;
  state.selectedLabSymbol = rows[0]?.symbol || '';
  return rows[0] || null;
 }

 function labResultsHtml() {
  if (state.labStatus === 'loading') return '<div class="commodity-empty">Building rolling daily trend and active-contract timing...</div>';
  if (state.labError) return `<div class="commodity-empty">${esc(state.labError)}</div>`;
  if (!state.labResults.length) return '<div class="commodity-empty">Run Commodity Lab to analyze MCX trend, pullback timing and calendar spread context.</div>';
  const selected = labSelectedRow();
  return `<div class="commodity-lab-metrics">
    <div><span>Analyzed</span><strong>${integer(state.labResults.length)}</strong><small>Core MCX contracts</small></div>
    <div><span>Entry review</span><strong>${integer(state.labResults.filter(row => row.signal === 'BUY' || row.signal === 'SELL').length)}</strong><small>Manual setup review only</small></div>
    <div><span>Roll risk</span><strong>${integer(state.labResults.filter(row => row.raw?.rollRisk).length)}</strong><small>Less than 5 days</small></div>
    <div><span>History request</span><strong>3Y</strong><small>Rolling front-month daily</small></div>
   </div>
   <div class="commodity-lab-layout">
    <div class="commodity-lab-list">${state.labResults.map(row => `<button type="button" class="commodity-lab-row ${labRowTone(row)} ${row.symbol === state.selectedLabSymbol ? 'selected' : ''}" data-commodity-lab-symbol="${esc(row.symbol)}">
     <div><strong>${esc(row.underlying)}</strong><small>${esc(row.raw?.trendLabel || '')}</small></div>
     <span>${esc(row.actionLabel)}</span>
     <b>${integer(row.score)}</b>
    </button>`).join('')}</div>
    ${labDetailHtml(selected)}
   </div>`;
 }

 function labDetailHtml(row) {
  if (!row) return '';
  const raw = row.raw || {};
  return `<section class="commodity-lab-detail">
   <header><div><span>Commodity Lab</span><strong>${esc(row.underlying)}</strong><small>${esc(row.symbol)}</small></div><span class="commodity-lab-badge ${labRowTone(row)}">${esc(row.priorityLabel)}</span></header>
   <div class="commodity-lab-grid">
    <div><span>Continuous trend</span><strong>${esc(raw.trendLabel || '--')}</strong><small>${integer(raw.dailyCandles)} daily candles | ${integer(raw.historyDays)} days</small></div>
    <div><span>Entry timing</span><strong>${esc(raw.timingLabel || '--')}</strong><small>${integer(raw.intradayCandles)} active-contract 4H candles</small></div>
    <div><span>Calendar spread</span><strong>${signed(raw.indicativeSpread)}</strong><small>${signed(raw.annualizedSpreadPct, 2, '% annualised')}</small></div>
    <div><span>Expiry handling</span><strong>${raw.rollRisk ? 'Roll required first' : `${number(raw.daysToExpiry, 1)} days left`}</strong><small>Exact contract before manual trade</small></div>
   </div>
   <div class="commodity-lab-read">
    <div><span>EMA 20</span><strong>${number(raw.ema20)}</strong></div>
    <div><span>EMA 50</span><strong>${number(raw.ema50)}</strong></div>
    <div><span>EMA 200</span><strong>${number(raw.ema200)}</strong></div>
    <div><span>ATR 14</span><strong>${number(raw.atr14)}</strong></div>
   </div>
   <div class="commodity-chart-actions">
    <button type="button" class="bsm commodity-primary" data-commodity-chart="${esc(row.symbol)}" data-commodity-timeframe="1d">Open Trend Chart</button>
    <button type="button" class="bsm" data-commodity-chart="${esc(row.symbol)}" data-commodity-timeframe="4h">Open Entry Chart</button>
   </div>
   <p>Trend is based on rolling front-month daily history. Entry timing and margin must use the displayed active future. Research only; no order is placed.</p>
  </section>`;
 }

 function planningLegs(row = {}) {
  const buyNear = state.planDirection === 'buyNear';
  const quantity = Math.max(1, Math.round(Number(state.quantity || row.quoteQuantity || 1)));
  const legs = [{
   ...row.nearFuture,
   transactionType: buyNear ? 'BUY' : 'SELL',
   quantity,
   price: Number(row.nearPrice || 0),
  }];
  if (state.planScope === 'calendar' && row.nextFuture) {
   legs.push({
    ...row.nextFuture,
    transactionType: buyNear ? 'SELL' : 'BUY',
    quantity,
    price: Number(row.nextPrice || 0),
   });
  }
  return legs;
 }

 function spreadSetup(row = {}) {
  if (state.spreadMode === 'sizeMatched') {
   const gold = state.rows.find(item => item.symbol === 'GOLD');
   const goldm = state.rows.find(item => item.symbol === 'GOLDM');
   if (!gold?.nearFuture || !goldm?.nearFuture) return null;
   return {
    key: `sizeMatched:${gold.nearFuture.securityId}:${goldm.nearFuture.securityId}`,
    buyInstrument: gold.nearFuture,
    sellInstrument: goldm.nearFuture,
    buyPrice: gold.nearPrice,
    sellPrice: goldm.nearPrice,
    buyLots: 1,
    sellLots: 10,
    buyExpiryCode: 0,
    sellExpiryCode: 0,
    title: 'GOLD / GOLDM size-matched pair',
    note: '1 GOLD lot versus 10 GOLDM lots; compare the same or clearly matched expiry before acting.',
   };
  }
  if (!row.nextFuture) return null;
  return {
   key: `calendar:${row.nearFuture.securityId}:${row.nextFuture.securityId}`,
   buyInstrument: row.nearFuture,
   sellInstrument: row.nextFuture,
   buyPrice: row.nearPrice,
   sellPrice: row.nextPrice,
   buyLots: 1,
   sellLots: 1,
   buyExpiryCode: 0,
   sellExpiryCode: 1,
   title: `${row.symbol} calendar spread`,
   note: 'Buy near / sell far profits only when the spread narrows enough to cover costs.',
  };
 }

 function ensureSpreadInputs(row = {}) {
  const setup = spreadSetup(row);
  if (!setup || setup.key === state.spreadKey) return setup;
  state.spreadKey = setup.key;
  state.spreadEntryDate = lastCompletedMarketDate();
  state.spreadEntryBuyPrice = String(Number(setup.buyPrice || 0));
  state.spreadEntrySellPrice = String(Number(setup.sellPrice || 0));
  state.spreadBuyLots = setup.buyLots;
  state.spreadSellLots = setup.sellLots;
  state.spreadCosts = 0;
  state.spreadStatus = 'idle';
  state.spreadError = '';
  state.spreadAnalysis = null;
  return setup;
 }

 function spreadPolyline(points = []) {
  if (!points.length) return '';
  const values = points.map(point => Number(point.netPnl || 0));
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const range = Math.max(1, high - low);
  const coords = values.map((value, index) => {
   const x = 14 + (index * 532 / Math.max(1, values.length - 1));
   const y = 126 - ((value - low) / range * 100);
   return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const zeroY = 126 - ((0 - low) / range * 100);
  return `<svg class="commodity-spread-svg" viewBox="0 0 560 150" role="img" aria-label="Historical exit profit and loss line">
   <line x1="14" y1="${zeroY.toFixed(1)}" x2="546" y2="${zeroY.toFixed(1)}" class="zero"></line>
   <polyline points="${coords}" class="${Number(values[values.length - 1] || 0) >= 0 ? 'profit' : 'loss'}"></polyline>
   <circle cx="${coords.split(' ').pop().split(',')[0]}" cy="${coords.split(' ').pop().split(',')[1]}" r="4"></circle>
  </svg>`;
 }

 function spreadResultHtml(setup) {
  if (state.spreadStatus === 'loading') return '<div class="commodity-spread-state">Loading both futures legs from Dhan historical data...</div>';
  if (state.spreadError) return `<div class="commodity-spread-state bad">${esc(state.spreadError)}</div>`;
  const result = state.spreadAnalysis;
  if (!result?.points?.length) return '<div class="commodity-spread-state">Enter your actual prices, then load history to test closing P&amp;L before the front expiry.</div>';
  const latest = result.latest || {};
  const moneyLabel = result.multiplierKnown ? 'Rs' : 'price units';
  const pnlTone = Number(latest.netPnl || 0) >= 0 ? 'up' : 'down';
  return `<div class="commodity-spread-results">
   <div class="commodity-spread-plot">
    <header><strong>Exit P&amp;L before front expiry</strong><small>${integer(result.points.length)} matched daily closes | Net includes entered costs</small></header>
    ${spreadPolyline(result.points)}
    <footer><span>${fullDate(result.points[0]?.time * 1000)}</span><span>${fullDate(latest.time * 1000)}</span></footer>
   </div>
   <div class="commodity-spread-stats">
    <div><span>Latest net P&amp;L</span><strong class="${pnlTone}">${signed(latest.netPnl)} ${moneyLabel}</strong><small>Indicative daily close</small></div>
    <div><span>Entry spread</span><strong>${signed(result.entrySpread)}</strong><small>Sell entry - buy entry</small></div>
    <div><span>Latest spread</span><strong>${signed(latest.spread)}</strong><small>${result.matchedExposure ? 'Matched exposure' : 'Exposure mismatch'}</small></div>
    <div class="expiry"><span>Close / roll before</span><strong>${fullDate(setup.buyInstrument.expiry)}</strong><small>Front-leg expiry handling</small></div>
   </div>
  </div>`;
 }

 function spreadResearchHtml(row = {}) {
  const setup = ensureSpreadInputs(row);
  if (!setup) return '';
  return `<section class="commodity-spread-research" aria-label="Spread profit and loss research">
   <header>
    <div><span>Research</span><strong>Spread P&amp;L Chart</strong><small>${esc(setup.title)} | Daily close-to-close</small></div>
    <div class="commodity-plan-toggle" role="group" aria-label="Spread study type">
     <button type="button" data-spread-mode="calendar" class="${state.spreadMode === 'calendar' ? 'active' : ''}">Calendar expiries</button>
     <button type="button" data-spread-mode="sizeMatched" class="${state.spreadMode === 'sizeMatched' ? 'active' : ''}">GOLD / GOLDM matched</button>
    </div>
   </header>
   <p class="commodity-spread-note">${esc(setup.note)}</p>
   <div class="commodity-spread-legs">
    <span class="buy">BUY ${esc(setup.buyInstrument.tradingSymbol)}</span>
    <span class="sell">SELL ${esc(setup.sellInstrument.tradingSymbol)}</span>
   </div>
   <div class="commodity-spread-controls">
    <label><span>Entry date</span><input id="commoditySpreadDate" type="date" value="${esc(state.spreadEntryDate)}"></label>
    <label><span>Buy entry</span><input id="commoditySpreadBuy" type="number" step="0.01" value="${esc(state.spreadEntryBuyPrice)}"></label>
    <label><span>Sell entry</span><input id="commoditySpreadSell" type="number" step="0.01" value="${esc(state.spreadEntrySellPrice)}"></label>
    <label><span>Buy lots</span><input id="commoditySpreadBuyLots" type="number" min="1" step="1" value="${integer(state.spreadBuyLots).replace(/,/g, '')}"></label>
    <label><span>Sell lots</span><input id="commoditySpreadSellLots" type="number" min="1" step="1" value="${integer(state.spreadSellLots).replace(/,/g, '')}"></label>
    <label><span>Costs Rs</span><input id="commoditySpreadCosts" type="number" min="0" step="0.01" value="${esc(state.spreadCosts)}"></label>
    <button type="button" class="bsm commodity-primary" id="commodityLoadSpread" ${state.spreadStatus === 'loading' ? 'disabled' : ''}>Load History</button>
   </div>
   ${spreadResultHtml(setup)}
   <p class="commodity-spread-formula">For BUY near / SELL far: P&amp;L = buy-leg change + sell-leg change - costs. A narrower calendar spread may profit; a wider spread may lose.</p>
  </section>`;
 }

 function previewHtml() {
  if (state.marginStatus === 'loading') return '<div class="commodity-margin-state">Calculating broker margin...</div>';
  if (state.marginError) return `<div class="commodity-margin-state bad">${esc(state.marginError)}</div>`;
  const preview = state.marginPreview;
  if (!preview?.total) return '<div class="commodity-margin-state">Run margin preview before saving a paper plan.</div>';
  const total = preview.total;
  const method = preview.calculationMode === 'combined_margin' ? 'Combined-leg requirement' : 'Separate-leg total';
  return `<div class="commodity-margin-result">
   <div><span>${esc(method)}</span><strong>Rs ${integer(total.totalMargin)}</strong><small>${preview.productType === 'INTRADAY' ? 'Intraday' : 'Overnight / Margin'}</small></div>
   <div><span>Span margin</span><strong>Rs ${integer(total.spanMargin)}</strong><small>Exposure Rs ${integer(total.exposureMargin)}</small></div>
   <div><span>Brokerage estimate</span><strong>Rs ${number(total.brokerage)}</strong><small>${preview.legs.length} leg${preview.legs.length === 1 ? '' : 's'}</small></div>
   <div><span>Balance gap</span><strong class="${Number(total.insufficientBalance || 0) > 0 ? 'down' : 'up'}">Rs ${integer(total.insufficientBalance || 0)}</strong><small>Current session estimate</small></div>
  </div>`;
 }

 function plannerHtml(row = {}) {
  const canPair = !!row.nextFuture;
  return `<section class="commodity-planner" aria-label="Commodity paper trade planner">
   <header>
    <div><span>Phase 2</span><strong>Margin and Paper Plan</strong><small>Broker margin preview only; trading remains manual.</small></div>
    <a class="bsm commodity-broker-link" href="https://web.dhan.co/" target="_blank" rel="noopener noreferrer">Open Broker Terminal</a>
   </header>
   <div class="commodity-plan-controls">
    <div class="commodity-plan-toggle" role="group" aria-label="Trade structure">
     <button type="button" data-commodity-scope="single" class="${state.planScope === 'single' ? 'active' : ''}">Single future</button>
     <button type="button" data-commodity-scope="calendar" class="${state.planScope === 'calendar' ? 'active' : ''}" ${canPair ? '' : 'disabled'}>Calendar spread</button>
    </div>
    <div class="commodity-plan-toggle" role="group" aria-label="Trade direction">
     <button type="button" data-commodity-direction="buyNear" class="${state.planDirection === 'buyNear' ? 'active' : ''}">Buy near</button>
     <button type="button" data-commodity-direction="sellNear" class="${state.planDirection === 'sellNear' ? 'active' : ''}">Sell near</button>
    </div>
    <label><span>Product</span><select id="commodityProductType"><option value="MARGIN" ${state.productType === 'MARGIN' ? 'selected' : ''}>Overnight / Margin</option><option value="INTRADAY" ${state.productType === 'INTRADAY' ? 'selected' : ''}>Intraday</option></select></label>
    <label><span>Quantity</span><input id="commodityQuantity" type="number" min="1" step="1" value="${integer(state.quantity).replace(/,/g, '')}"></label>
    <button type="button" class="bsm commodity-primary" id="commodityMarginPreview" ${state.marginStatus === 'loading' ? 'disabled' : ''}>Estimate Margin</button>
    <button type="button" class="bsm" id="commoditySavePlan" ${state.marginPreview ? '' : 'disabled'}>Save Paper Plan</button>
   </div>
   <div class="commodity-selected-legs">${planningLegs(row).map(leg => `<span class="${leg.transactionType === 'BUY' ? 'buy' : 'sell'}">${esc(leg.transactionType)} ${esc(leg.tradingSymbol)} @ ${number(leg.price)}</span>`).join('')}</div>
   ${previewHtml()}
  </section>`;
 }

 function savedPlansHtml() {
  if (!state.plans.length) return '';
  return `<section class="commodity-saved" aria-label="Saved commodity paper plans">
   <header><strong>Saved Paper Plans</strong><small>${integer(state.plans.length)} stored on this device</small></header>
   <div>${state.plans.map(plan => `<article>
    <strong>${esc(plan.symbol)}</strong><span>${esc(plan.scope === 'calendar' ? 'Calendar spread' : 'Single future')}</span><b>Rs ${integer(plan.totalMargin)}</b>
    <button type="button" class="bsm" data-commodity-plan-remove="${esc(plan.id)}" title="Remove saved paper plan">Remove</button>
   </article>`).join('')}</div>
  </section>`;
 }

 function tableHtml(rows = []) {
  if (!rows.length) return '';
  return `<div class="commodity-table-wrap"><table class="commodity-table">
   <thead><tr><th>Underlying</th><th>Front contract</th><th>Front LTP</th><th>Next contract</th><th>Next LTP</th><th>Spread</th><th>Annualised</th><th>Depth</th><th></th></tr></thead>
   <tbody>${rows.map(row => `<tr class="${row.symbol === state.selectedSymbol ? 'selected' : ''}" data-commodity-symbol="${esc(row.symbol)}">
    <td><strong>${esc(row.symbol)}</strong></td>
    <td>${expiry(row.nearFuture?.expiry)}</td><td>${number(row.nearPrice)}</td>
    <td>${row.nextFuture ? expiry(row.nextFuture.expiry) : '--'}</td><td>${row.nextFuture ? number(row.nextPrice) : '--'}</td>
    <td class="${Number(row.indicativeSpread || 0) >= 0 ? 'up' : 'down'}">${row.nextFuture ? signed(row.indicativeSpread) : '--'}</td>
    <td>${row.nextFuture ? signed(row.annualizedSpreadPct, 2, '%') : '--'}</td>
    <td>${row.depthConfirmed ? 'Observed' : 'Indicative'}</td>
    <td>${row.nextFuture
     ? `<button type="button" class="bsm" data-commodity-calendar-chart="${esc(row.symbol)}">Spread Chart</button>`
     : `<button type="button" class="bsm" data-commodity-chart="${esc(row.nearFuture?.tradingSymbol || '')}">Leg Chart</button>`}</td>
   </tr>`).join('')}</tbody>
  </table></div>`;
 }

 function commoditySnapshotSpreadRow(row = {}) {
  if (!row.nearFuture || !row.nextFuture) return null;
  return {
   key: `calendar:${row.nearFuture.securityId}:${row.nextFuture.securityId}`,
   type: 'calendar',
   family: row.symbol,
   symbol: row.symbol,
   label: `${row.symbol} near / next`,
   canonicalLabel: 'Far - Near',
   firstInstrument: row.nearFuture,
   secondInstrument: row.nextFuture,
   firstRole: 'near',
   secondRole: 'far',
   firstLots: 1,
   secondLots: 1,
   firstPrice: Number(row.nearPrice || 0),
   secondPrice: Number(row.nextPrice || 0),
   spread: Number(row.indicativeSpread || 0),
   indicativeSpread: Number(row.indicativeSpread || 0),
   annualizedSpreadPct: Number(row.annualizedSpreadPct || 0),
   depthConfirmed: row.depthConfirmed === true,
  };
 }

 function selectedSpreadRow() {
  const selected = state.spreadRows.find(row => row.key === state.selectedSpreadKey);
  if (selected) return selected;
  state.selectedSpreadKey = state.spreadRows[0]?.key || '';
  return state.spreadRows[0] || null;
 }

 function spreadDirectionLabel(row = {}) {
  const action = row.analysis?.action;
  if (action === 'BUY_SPREAD') return `BUY ${row.secondRole} / SELL ${row.firstRole}`;
  if (action === 'SELL_SPREAD') return `SELL ${row.secondRole} / BUY ${row.firstRole}`;
  return 'WAIT';
 }

function spreadPlanningLegs(row = {}) {
  const widening = row.analysis?.direction === 'widening';
  const firstLots = Math.max(1, Number(row.firstLots || 1));
  const secondLots = Math.max(1, Number(row.secondLots || 1));
  return [{
   ...row.firstInstrument,
   transactionType: widening ? 'SELL' : 'BUY',
   quantity: Math.max(1, Number(row.firstInstrument?.lotSize || 1) * firstLots),
   price: Number(row.firstPrice || 0),
  }, {
   ...row.secondInstrument,
   transactionType: widening ? 'BUY' : 'SELL',
   quantity: Math.max(1, Number(row.secondInstrument?.lotSize || 1) * secondLots),
   price: Number(row.secondPrice || 0),
 }];
}

 function spreadExpiryCatalogHtml(row = {}) {
  if (state.spreadChartView !== 'historical') return '';
  const family = String(row.family || '').toUpperCase();
  const catalog = state.spreadExpiryCatalog[family];
  if (state.spreadExpiryCatalogStatus === 'loading') {
   return '<div class="commodity-spread-expiry-catalog loading">Loading archived contract identities...</div>';
  }
  if (!catalog) {
   return '<div class="commodity-spread-expiry-catalog empty">Select Historical Expiries again to load the local contract archive.</div>';
  }
  const contracts = Array.isArray(catalog.contracts) ? catalog.contracts : [];
  const snapshots = Array.isArray(catalog.pairSnapshots) ? catalog.pairSnapshots : [];
  if (!contracts.length) {
   return '<div class="commodity-spread-expiry-catalog empty">No exact expired contracts are archived yet. The continuous line remains labelled as Dhan rolling history.</div>';
  }
  return `<section class="commodity-spread-expiry-catalog">
   <header><div><span>Archived contract identities</span><strong>${integer(contracts.length)} contracts / ${integer(snapshots.length)} observed pair changes</strong></div><small>Prospective archive only; unavailable expired data is never fabricated.</small></header>
   <div>${contracts.slice(-8).reverse().map(contract => `<article>
    <strong>${esc(contract.tradingSymbol || contract.symbol || contract.securityId)}</strong>
    <span>Security ID ${esc(contract.securityId)} | Expiry ${esc(expiry(contract.expiry))}</span>
    <small>Seen ${esc(new Date(Number(contract.firstSeenAt || 0)).toLocaleDateString('en-IN'))} to ${esc(new Date(Number(contract.lastSeenAt || 0)).toLocaleDateString('en-IN'))}</small>
   </article>`).join('')}</div>
  </section>`;
 }

 function spreadDeskDetailHtml(row) {
  if (!row) return '<div class="commodity-empty">Run Spread Scan to discover calendar and size-matched MCX pairs.</div>';
  const analysis = row.analysis || {};
  const direction = analysis.direction || 'range';
  const actionable = analysis.tradeAllowed === true;
  const costs = row.costs || {};
  const safeguards = row.safeguards || {};
  const lots = `${integer(row.firstLots)} ${esc(row.firstRole)} : ${integer(row.secondLots)} ${esc(row.secondRole)}`;
  const widening = direction === 'widening';
  const narrowing = direction === 'narrowing';
  const action = String(analysis.action || 'WAIT');
  const actionTone = action === 'BUY_SPREAD' ? 'widening' : action === 'SELL_SPREAD' ? 'narrowing' : 'blocked';
  const coverage = row.continuousCoverage || {};
  const sourceQuality = row.sourceQuality || {};
  return `<section class="commodity-spread-desk-detail">
   <header><div><span>Selected spread</span><strong>${esc(row.label)}</strong><small>${esc(row.canonicalLabel)} | ${esc(row.firstInstrument?.tradingSymbol)} / ${esc(row.secondInstrument?.tradingSymbol)}</small></div><b class="${actionable ? direction : 'blocked'}">${actionable ? esc(direction.toUpperCase()) : 'BLOCKED'}</b></header>
   <div class="commodity-spread-action-card ${esc(actionTone)}">
    <div><span>Decision</span><strong>${esc(action.replace('_', ' '))}</strong><small>${esc(analysis.reason || 'Waiting for decision-grade confirmation.')}</small></div>
    <div><span>Exact legs</span><strong>${esc(spreadDirectionLabel(row))}</strong><small>${action === 'WAIT' ? 'No trade while blockers remain' : `${esc(row.secondInstrument?.tradingSymbol)} / ${esc(row.firstInstrument?.tradingSymbol)}`}</small></div>
    <div><span>Regime / confidence</span><strong>${esc(String(analysis.regime || 'range').toUpperCase())} / ${esc(String(analysis.confidence || 'low').toUpperCase())}</strong><small>${integer(analysis.confidenceScore || analysis.score || 0)} / 100</small></div>
   </div>
   <div class="commodity-spread-desk-grid">
    <div><span>Current spread</span><strong>${signed(row.spread)}</strong><small>${esc(row.canonicalLabel)}</small></div>
    <div><span>Z-score / percentile</span><strong>${signed(analysis.zScore)} / ${number(analysis.percentile, 1)}%</strong><small>60-session distribution</small></div>
    <div><span>Matched lot ratio</span><strong>${lots}</strong><small>${row.type === 'matched' ? 'Contract-size matched, same expiry' : 'Same underlying calendar pair'}</small></div>
    <div><span>Depth snapshot</span><strong>${row.depthConfirmed ? 'Observed' : 'Indicative LTP'}</strong><small>${row.executableUpdatedAt ? `Updated ${new Date(row.executableUpdatedAt).toLocaleTimeString('en-IN')}` : 'Waiting for depth refresh'}</small></div>
   </div>
   <div class="commodity-spread-desk-grid">
    <div><span>Three EMA</span><strong>${number(analysis.ema9)} / ${number(analysis.ema30)} / ${number(analysis.ema100)}</strong><small>EMA 9 / 30 / 100</small></div>
    <div><span>Continuous history</span><strong>${integer(coverage.dailyCandles || analysis.dailyCandles || 0)}D / ${integer(coverage.intradayCandles || analysis.intradayCandles || 0)}H</strong><small>${esc(sourceQuality.daily || 'current-pair fallback')}</small></div>
    <div><span>Entry / stop / target</span><strong>${signed(analysis.entry)} / ${signed(analysis.stop)} / ${signed(analysis.target)}</strong><small>Executable spread levels</small></div>
    <div><span>Dhan fixed brokerage</span><strong>Rs ${number(costs.fixedBrokerageAndGst)}</strong><small>${integer(costs.executedOrders)} executed orders | Rs ${number(costs.brokeragePerOrder)} each + GST</small></div>
   </div>
   <div class="commodity-spread-trade-read">
    <div class="${widening ? 'active' : ''}"><span>Widening trade</span><strong>BUY ${esc(row.secondRole)} / SELL ${esc(row.firstRole)}</strong><small>Entry spread ${row.wideningEntrySpread == null ? '--' : signed(row.wideningEntrySpread)}</small></div>
    <div class="${narrowing ? 'active' : ''}"><span>Narrowing trade</span><strong>SELL ${esc(row.secondRole)} / BUY ${esc(row.firstRole)}</strong><small>Entry spread ${row.narrowingEntrySpread == null ? '--' : signed(row.narrowingEntrySpread)}</small></div>
   </div>
   <div class="commodity-spread-reasons"><span>${esc(analysis.reason || '')}</span></div>
   ${(analysis.blockers || safeguards.warnings || []).length ? `<div class="commodity-spread-blockers">${(analysis.blockers || safeguards.warnings || []).map(reason => `<span>${esc(reason)}</span>`).join('')}</div>` : ''}
   <div class="commodity-spread-cost-note">Target move ${signed(analysis.targetMove)} points versus required ${signed(analysis.costRequiredMove)} points. Expected net P&amp;L: Rs ${number(analysis.expectedNetPnl)}. Exchange charges, CTT, stamp duty and other statutory charges are not included.</div>
   <div class="commodity-plan-toggle commodity-spread-view-toggle" role="group" aria-label="Spread chart history view">
    <button type="button" data-spread-chart-view="continuous" class="${state.spreadChartView === 'continuous' ? 'active' : ''}">Continuous</button>
    <button type="button" data-spread-chart-view="current" class="${state.spreadChartView === 'current' ? 'active' : ''}">Current Pair</button>
    <button type="button" data-spread-chart-view="historical" class="${state.spreadChartView === 'historical' ? 'active' : ''}">Historical Expiries</button>
   </div>
   ${spreadExpiryCatalogHtml(row)}
   <div class="commodity-chart-actions">
    <button type="button" class="bsm commodity-primary" data-commodity-spread-chart="${esc(row.key)}" data-commodity-timeframe="1d" data-commodity-spread-view="${esc(state.spreadChartView)}">Open Daily Decision Chart</button>
    <button type="button" class="bsm" data-commodity-spread-chart="${esc(row.key)}" data-commodity-timeframe="1h" data-commodity-spread-view="current">Open Synchronized 1H</button>
    <button type="button" class="bsm" id="commoditySpreadMarginPreview" ${!actionable || state.marginStatus === 'loading' ? 'disabled' : ''}>Estimate Spread Margin</button>
    <button type="button" class="bsm" id="commoditySaveSpreadWatch" ${!actionable ? 'disabled' : ''}>Save Spread Watch</button>
   </div>
   ${previewHtml()}
   <p>Recommendation: <strong>${esc(spreadDirectionLabel(row))}</strong>. Daily history is close-only; hourly candles use synchronized five-minute leg observations. No order is placed.</p>
  </section>`;
 }

 function spreadMonitorHtml() {
  const spreadPlans = state.plans.filter(plan => plan.scope === 'spread');
  if (!spreadPlans.length) return '';
  return `<section class="commodity-spread-monitor"><header><strong>Saved Spread Monitoring</strong><small>Live LTP movement versus saved spread</small></header><div>${spreadPlans.map(plan => {
   const row = state.spreadRows.find(item => item.key === plan.spreadKey);
   const current = Number(row?.spread);
   const change = Number.isFinite(current) ? current - Number(plan.entrySpread || 0) : null;
   const favorable = plan.direction === 'widening' ? Number(change || 0) >= 0 : Number(change || 0) <= 0;
   return `<article><strong>${esc(plan.symbol)}</strong><span>${esc(plan.direction)}</span><b class="${favorable ? 'up' : 'down'}">${change == null ? '--' : signed(change)}</b><small>Entry ${signed(plan.entrySpread)} | Stop ${signed(plan.stopSpread)} | Target ${signed(plan.targetSpread)}</small><button type="button" class="bsm" data-commodity-plan-remove="${esc(plan.id)}">Remove</button></article>`;
  }).join('')}</div></section>`;
 }

 function spreadBackfillHtml() {
  const status = state.spreadBackfillStatus;
  if (!status) return `<section class="commodity-spread-backfill"><div><span>Continuous history</span><strong>Three-year backfill not started</strong><small>Builds daily rolling history and synchronized 60-minute active-pair candles.</small></div><button type="button" class="bsm commodity-primary" id="commodityStartSpreadBackfill">Build History</button></section>`;
  const errors = Array.isArray(status.errors) ? status.errors : [];
  return `<section class="commodity-spread-backfill ${status.running ? 'loading' : errors.length ? 'warn' : 'ready'}">
   <div><span>Continuous history</span><strong>${status.running ? `Building ${esc(status.currentUnderlying || 'featured MCX families')}` : status.cancelRequested ? 'Backfill cancelled' : 'History backfill complete'}</strong><small>${integer(status.completed || 0)} of ${integer(status.total || 0)} families complete${errors.length ? ` | ${integer(errors.length)} warning${errors.length === 1 ? '' : 's'}` : ''}</small></div>
   <div class="commodity-chart-actions">
    ${status.running ? '<button type="button" class="bsm danger" id="commodityCancelSpreadBackfill">Cancel</button>' : '<button type="button" class="bsm" id="commodityRefreshSpreadBackfill">Refresh History</button>'}
   </div>
  </section>`;
 }

 function spreadDeskHtml() {
  if (state.spreadDeskStatus === 'loading') return `<section class="commodity-spread-state-panel loading" aria-live="polite">
   <div class="commodity-spread-state-copy"><span>Spread engine</span><strong>${esc(state.spreadDeskProgress?.title || 'Building synthetic MCX histories')}</strong><p>${esc(state.spreadDeskProgress?.detail || 'Matching contract candles, refreshing depth, and checking Three EMA plus OBV confirmation.')}</p></div>
   <div class="commodity-spread-skeleton" aria-hidden="true">${Array.from({ length: 5 }, (_, index) => `<i style="--spread-index:${index}"></i>`).join('')}</div>
   <button type="button" class="bsm danger" id="commodityStopSpreadScan">Stop Scan</button>
  </section>`;
  if (state.spreadDeskError) return `<section class="commodity-spread-state-panel error" role="alert">
   <div class="commodity-spread-state-copy"><span>Spread scan unavailable</span><strong>We could not complete this scan</strong><p>${esc(state.spreadDeskError)}</p></div>
   <button type="button" class="bsm commodity-primary" id="commodityRetrySpreadScan">Retry Spread Scan</button>
  </section>`;
  if (!state.spreadRows.length) return `<section class="commodity-spread-state-panel empty">
   <div class="commodity-spread-state-copy"><span>Spread Desk</span><strong>Find the direction before choosing the legs</strong><p>Scan active MCX calendar and size-matched pairs, then review widening, narrowing, execution depth, costs, and risk levels.</p></div>
   <div class="commodity-spread-state-steps"><span>1. Match contracts</span><span>2. Read Three EMA + OBV</span><span>3. Check executable depth</span></div>
   <button type="button" class="bsm commodity-primary" id="commodityEmptySpreadScan">Run Spread Scan</button>
  </section>`;
  const selected = selectedSpreadRow();
  return `${spreadBackfillHtml()}<section class="commodity-spread-brief">
    <div><span>Decision model</span><strong>Far minus near</strong><small>Rising spread means widening. Falling spread means narrowing.</small></div>
    <div><span>Signal proof</span><strong>Trend + mean reversion</strong><small>Daily regime plus synchronized 60-minute confirmation.</small></div>
    <div><span>Execution proof</span><strong>Depth + cost edge</strong><small>Blocked when liquidity, expiry, or visible costs fail.</small></div>
   </section>
   <div class="commodity-spread-desk-metrics">
    <div><span>Pairs analyzed</span><strong>${integer(state.spreadRows.length)}</strong><small>Calendar and size-matched</small></div>
    <div><span>Widening</span><strong>${integer(state.spreadRows.filter(row => row.analysis?.direction === 'widening').length)}</strong><small>Far-minus-near rising</small></div>
    <div><span>Narrowing</span><strong>${integer(state.spreadRows.filter(row => row.analysis?.direction === 'narrowing').length)}</strong><small>Far-minus-near falling</small></div>
    <div><span>Ranging</span><strong>${integer(state.spreadRows.filter(row => row.analysis?.direction === 'range').length)}</strong><small>Wait for confirmation</small></div>
   </div>
   <div class="commodity-spread-desk-layout">
    <aside class="commodity-spread-desk-list" aria-label="Commodity spread scan results">${state.spreadRows.map((row, index) => `<button type="button" style="--spread-index:${index}" class="${row.key === state.selectedSpreadKey ? 'selected' : ''} ${esc(row.analysis?.direction || 'range')}" data-commodity-spread-key="${esc(row.key)}"><div><strong>${esc(row.label)}</strong><small>${esc(row.canonicalLabel)}</small></div><span>${signed(row.spread)}</span><b>${row.analysis?.tradeAllowed ? integer(row.analysis?.score || 0) : 'BLOCK'}</b></button>`).join('')}</aside>
    ${spreadDeskDetailHtml(selected)}
   </div>
   ${spreadMonitorHtml()}`;
 }

 function render() {
  const root = document.getElementById('pane-commodities');
  if (!root) return;
  const rows = matchingRows();
  const selected = currentRow(rows);
  root.innerHTML = `<section class="commodity-workspace">
   <header class="commodity-head">
    <div><div class="command-eyebrow">MCX</div><h2>Commodity Futures</h2><p>Front-contract execution watch and rolling-history research for active commodity futures.</p></div>
    <div class="commodity-refresh-state ${state.error ? 'bad' : state.status === 'loading' ? 'warn' : 'good'}"><span>Snapshot</span><strong>${esc(state.status === 'loading' ? 'Refreshing...' : state.error ? 'Unavailable' : state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString('en-IN') : 'Ready')}</strong><small>${esc(state.error || 'Read-only analysis')}</small></div>
   </header>
   <div class="commodity-view-toggle" role="tablist" aria-label="Commodity workspace mode">
    <button type="button" data-commodity-view="watch" class="${state.workspaceView === 'watch' ? 'active' : ''}">Market Watch</button>
    <button type="button" data-commodity-view="spread" class="${state.workspaceView === 'spread' ? 'active' : ''}">Spread Desk</button>
    <button type="button" data-commodity-view="lab" class="${state.workspaceView === 'lab' ? 'active' : ''}">Commodity Lab</button>
    ${state.workspaceView === 'lab' ? `<button type="button" class="bsm commodity-primary" id="commodityRunLab" ${state.labStatus === 'loading' ? 'disabled' : ''}>${state.labStatus === 'loading' ? 'Analyzing...' : 'Run Lab'}</button>` : ''}
    ${state.workspaceView === 'spread' ? `<div class="commodity-spread-desk-actions"><div class="commodity-spread-segmented" role="group" aria-label="Spread pair type"><button type="button" data-spread-desk-type="all" class="${state.spreadDeskType === 'all' ? 'active' : ''}">All pairs</button><button type="button" data-spread-desk-type="calendar" class="${state.spreadDeskType === 'calendar' ? 'active' : ''}">Calendar</button><button type="button" data-spread-desk-type="matched" class="${state.spreadDeskType === 'matched' ? 'active' : ''}">Size matched</button></div><button type="button" class="bsm commodity-primary commodity-spread-run" id="commodityRunSpreadScan" ${state.spreadDeskStatus === 'loading' ? 'disabled' : ''}>${state.spreadDeskStatus === 'loading' ? 'Scanning spreads...' : 'Run Spread Scan'}</button><button type="button" class="bsm" id="commodityCachedSpreadScan" ${state.spreadDeskStatus === 'loading' ? 'disabled' : ''}>Refresh Cached</button><button type="button" class="bsm" id="commodityForceSpreadScan" ${state.spreadDeskStatus === 'loading' ? 'disabled' : ''}>Force Full</button>${state.spreadDeskStatus === 'loading' ? '<button type="button" class="bsm danger" id="commodityStopSpreadScanTop">Stop</button>' : ''}</div>` : ''}
   </div>
   ${state.workspaceView === 'lab' ? labResultsHtml() : state.workspaceView === 'spread' ? spreadDeskHtml() : `
   <div class="commodity-controls">
    <div class="commodity-filters" role="tablist" aria-label="Commodity filter">
     <button type="button" data-commodity-filter="featured" class="${state.filter === 'featured' ? 'active' : ''}">Core contracts</button>
     <button type="button" data-commodity-filter="paired" class="${state.filter === 'paired' ? 'active' : ''}">Calendar pairs</button>
     <button type="button" data-commodity-filter="depth" class="${state.filter === 'depth' ? 'active' : ''}">Depth observed</button>
     <button type="button" data-commodity-filter="all" class="${state.filter === 'all' ? 'active' : ''}">All</button>
    </div>
    <input type="search" id="commoditySearch" value="${esc(state.query)}" placeholder="Search MCX contract" aria-label="Search MCX contract">
    <button type="button" class="bsm" id="commodityRefresh" ${state.status === 'loading' ? 'disabled' : ''}>Refresh</button>
    <button type="button" class="bsm" id="commodityLiveStop">Stop Live</button>
   </div>
   ${metricsHtml(rows)}
   ${watchHtml(rows.slice(0, 16))}
   ${detailHtml(selected)}
   ${savedPlansHtml()}
   ${tableHtml(rows)}
   `}
  </section>`;
  bind();
 }

 async function estimateMargin(row = currentRow()) {
  if (!row) return;
  state.marginStatus = 'loading';
  state.marginError = '';
  state.marginPreview = null;
  render();
  try {
   const response = await marketData('commodity_margin_preview', {
    legs: planningLegs(row),
    productType: state.productType,
   });
   if (!response?.ok) throw new Error(response?.error || 'Margin preview request failed.');
   state.marginPreview = response;
   state.marginStatus = 'ready';
  } catch (error) {
   state.marginStatus = 'error';
   state.marginError = error?.message || 'Margin preview request failed.';
  }
  render();
 }

 async function estimateSpreadMargin(row = selectedSpreadRow()) {
  if (!row || row.analysis?.tradeAllowed !== true) return;
  state.marginStatus = 'loading';
  state.marginError = '';
  state.marginPreview = null;
  render();
  try {
   const response = await marketData('commodity_margin_preview', {
    legs: spreadPlanningLegs(row),
    productType: state.productType,
   });
   if (!response?.ok) throw new Error(response?.error || 'Spread margin preview request failed.');
   state.marginPreview = response;
   state.marginStatus = 'ready';
  } catch (error) {
   state.marginStatus = 'error';
   state.marginError = error?.message || 'Spread margin preview request failed.';
  }
  render();
 }

 function resetPreview() {
  state.marginStatus = 'idle';
  state.marginError = '';
  state.marginPreview = null;
 }

 async function loadSpreadHistory(row = currentRow()) {
  const setup = ensureSpreadInputs(row);
  if (!setup) return;
  const today = dateInputValue();
  if (String(state.spreadEntryDate || '') >= today) {
   state.spreadStatus = 'error';
   state.spreadError = 'Dhan daily close data for today is usually available only after the session closes. Select the previous trading day for Load History, or try again after EOD.';
   state.spreadAnalysis = null;
   render();
   return;
  }
  state.spreadStatus = 'loading';
  state.spreadError = '';
  state.spreadAnalysis = null;
  render();
  try {
   const response = await marketData('commodity_spread_history', {
    mode: state.spreadMode,
    buyInstrument: setup.buyInstrument,
    sellInstrument: setup.sellInstrument,
    buyExpiryCode: setup.buyExpiryCode,
    sellExpiryCode: setup.sellExpiryCode,
    entryBuyPrice: Number(state.spreadEntryBuyPrice || 0),
    entrySellPrice: Number(state.spreadEntrySellPrice || 0),
    buyLots: state.spreadBuyLots,
    sellLots: state.spreadSellLots,
    costs: Number(state.spreadCosts || 0),
    start: new Date(`${state.spreadEntryDate}T00:00:00`).getTime(),
    end: Date.now() + (24 * 60 * 60 * 1000),
   });
   if (!response?.ok) throw new Error(response?.error || 'Spread history request failed.');
   state.spreadAnalysis = response;
   state.spreadStatus = 'ready';
  } catch (error) {
   state.spreadStatus = 'error';
   state.spreadError = error?.message || 'Spread history request failed.';
  }
  render();
 }

 function savePlan(row = currentRow()) {
  if (!row || !state.marginPreview?.total) return;
  const plan = {
   id: `${Date.now()}-${row.symbol}`,
   symbol: row.symbol,
   scope: state.planScope,
   direction: state.planDirection,
   productType: state.productType,
   quantity: Math.max(1, Math.round(Number(state.quantity || 1))),
   totalMargin: Number(state.marginPreview.total.totalMargin || 0),
   legs: planningLegs(row),
   savedAt: Date.now(),
  };
  state.plans = [plan, ...state.plans.filter(existing => !(existing.symbol === plan.symbol && existing.scope === plan.scope))].slice(0, 30);
  writePlans(state.plans);
  render();
 }

 async function refresh() {
  state.status = 'loading';
  state.error = '';
  render();
  try {
   const response = await marketData('commodity_snapshot', { limit: 80 });
   if (!response?.ok) throw new Error(response?.error || 'Commodity snapshot request failed.');
   state.rows = Array.isArray(response.rows) ? response.rows : [];
   state.summary = response;
   state.updatedAt = Number(response.updatedAt || Date.now());
   state.status = 'ready';
   await subscribeLive();
  } catch (error) {
   state.status = 'error';
   state.error = error?.message || 'Commodity snapshot request failed.';
  }
  render();
 }

 async function runLab() {
  state.labStatus = 'loading';
  state.labError = '';
  render();
  try {
   const response = await marketData('commodity_analysis', { limit: 6, dailyDays: 1095, intradayDays: 90 });
   if (!response?.ok) throw new Error(response?.error || 'Commodity Lab request failed.');
   state.labResults = Array.isArray(response.results) ? response.results : [];
   state.labSummary = response.status || null;
   state.labStatus = 'ready';
  } catch (error) {
   state.labStatus = 'error';
   state.labError = error?.message || 'Commodity Lab request failed.';
  }
  render();
 }

 function stopSpreadScan() {
  if (state.spreadDeskStatus !== 'loading') return;
  state.spreadDeskStopRequested = true;
  state.spreadDeskStatus = state.spreadRows.length ? 'ready' : 'idle';
  state.spreadDeskProgress = { title: 'Spread scan stopped', detail: 'Late API results from the stopped request will be ignored.' };
  render();
 }

 function stopBackfillPolling() {
  if (spreadBackfillTimer) clearInterval(spreadBackfillTimer);
  spreadBackfillTimer = null;
 }

 async function refreshSpreadBackfillStatus(options = {}) {
  const response = await marketData('commodity_spread_history_backfill_status').catch(() => null);
  if (!response?.ok) return;
  state.spreadBackfillStatus = response.status || null;
  if (!response.status?.running) {
   stopBackfillPolling();
   if (options.rescan !== false && Number(response.status?.completed || 0) > 0) {
    await runSpreadScan();
    return;
   }
  }
  render();
 }

 async function startSpreadBackfill(options = {}) {
  const response = await marketData('commodity_spread_history_backfill_start', { force: options.force === true }).catch(error => ({ ok: false, error: error?.message || String(error) }));
  if (!response?.ok) {
   state.spreadBackfillStatus = { running: false, errors: [{ error: response?.error || 'Continuous history backfill failed to start.' }] };
   render();
   return;
  }
  state.spreadBackfillStatus = response.status || { running: true, completed: 0, total: 9 };
  stopBackfillPolling();
  spreadBackfillTimer = setInterval(() => refreshSpreadBackfillStatus(), 1800);
  render();
 }

 async function cancelSpreadBackfill() {
  const response = await marketData('commodity_spread_history_backfill_cancel').catch(() => null);
  if (response?.ok) state.spreadBackfillStatus = response.status || state.spreadBackfillStatus;
  render();
 }

 async function loadSpreadExpiryCatalog(row = selectedSpreadRow()) {
  const family = String(row?.family || '').trim().toUpperCase();
  if (!family) return;
  state.spreadExpiryCatalogStatus = 'loading';
  render();
  const response = await marketData('commodity_spread_expiry_catalog', { underlying: family }).catch(error => ({ ok: false, error: error?.message || String(error) }));
  state.spreadExpiryCatalogStatus = response?.ok ? 'ready' : 'error';
  state.spreadExpiryCatalog[family] = response?.ok
   ? response
   : { contracts: [], pairSnapshots: [], error: response?.error || 'Expiry catalog is unavailable.' };
  render();
 }

 async function runSpreadScan(options = {}) {
  const runId = Date.now();
  state.spreadDeskRunId = runId;
  state.spreadDeskStopRequested = false;
  state.spreadDeskStatus = 'loading';
  state.spreadDeskError = '';
  state.spreadDeskProgress = {
   title: options.force ? 'Force refreshing spread histories' : 'Refreshing spread desk from cache first',
   detail: options.force ? 'Requesting fresh Dhan candles for MCX pairs. Use Stop if you need to cancel this UI operation.' : 'Reusing cached histories when valid, then filling any missing candle windows.',
  };
  render();
  try {
   const response = await marketData('commodity_spread_scanner', { spreadType: state.spreadDeskType, limit: 30, historyDays: 365, force: options.force === true });
   if (state.spreadDeskStopRequested || state.spreadDeskRunId !== runId) return;
   if (!response?.ok) throw new Error(response?.error || 'Commodity spread scan failed.');
   state.spreadRows = Array.isArray(response.rows) ? response.rows : [];
   state.spreadSummary = response;
   state.selectedSpreadKey = state.spreadRows[0]?.key || '';
   state.spreadDeskStatus = 'ready';
   await subscribeLive();
   await refreshSpreadQuotes();
   checkSpreadAlerts();
   if (!state.spreadBackfillStatus) {
    const historyStatus = await marketData('commodity_spread_history_backfill_status').catch(() => null);
    if (historyStatus?.ok) state.spreadBackfillStatus = historyStatus.status || null;
   }
   if (state.spreadRows.some(row => !row.continuousCoverage)
    && !state.spreadBackfillStatus?.running
    && !state.spreadBackfillStatus?.startedAt
    && !state.spreadBackfillStatus?.completedAt) {
    startSpreadBackfill().catch(() => {});
   }
  } catch (error) {
   if (state.spreadDeskStopRequested || state.spreadDeskRunId !== runId) return;
   state.spreadDeskStatus = 'error';
   state.spreadDeskError = error?.message || 'Commodity spread scan failed.';
  }
  render();
 }

 function openChart(contract = '', timeframe = '1d') {
  const symbol = String(contract || '').trim().toUpperCase();
  if (!symbol) return;
  const safeTimeframe = timeframe === '4h' ? '4h' : timeframe === '1w' ? '1w' : '1d';
  const visibleCandleCount = safeTimeframe === '1d' ? 1095 : 520;
  global.openSignalInChartWorkspace?.({ symbol, timeframe: safeTimeframe, setupFamilyLabel: safeTimeframe === '1d' ? 'MCX Rolling Trend' : 'MCX Active Future' }, { overlay: false, timeframe: safeTimeframe, visibleCandleCount });
 }

 function openSpreadChart(row = selectedSpreadRow(), timeframe = '1d', view = state.spreadChartView) {
  if (!row) return;
  const safeTimeframe = timeframe === '1h' ? '1h' : '1d';
  const safeView = ['continuous', 'current', 'historical'].includes(String(view || '')) ? String(view) : 'continuous';
  const symbol = `MCX-SPREAD:${row.key}`.toUpperCase();
  global.openSignalInChartWorkspace?.({
   symbol,
   timeframe: safeTimeframe,
   setupFamilyLabel: `${row.label} decision-grade spread`,
   commoditySpread: { ...row, underlying: row.family, view: safeView },
  }, { overlay: false, timeframe: safeTimeframe, preset: 'ema_obv', visibleCandleCount: safeTimeframe === '1d' ? 1095 : 720 });
 }

 function openCommodityCalendarChart(symbol = '') {
  const row = state.rows.find(item => item.symbol === String(symbol || '').trim().toUpperCase());
  const spreadRow = commoditySnapshotSpreadRow(row);
  if (!spreadRow) {
   openChart(row?.nearFuture?.tradingSymbol || '', '1d');
   return;
  }
  openSpreadChart(spreadRow, '1d', 'continuous');
 }

 function saveSpreadWatch(row = selectedSpreadRow()) {
  if (!row || row.analysis?.tradeAllowed !== true) return;
  const direction = row.analysis?.direction === 'narrowing' ? 'narrowing' : row.analysis?.direction === 'widening' ? 'widening' : 'range';
  const plan = {
   id: `${Date.now()}-${row.key}`,
   symbol: row.label,
   scope: 'spread',
   spreadKey: row.key,
   direction,
   entrySpread: Number(row.spread || 0),
   entryTrigger: Number(row.analysis?.entryTrigger || row.spread || 0),
   stopSpread: Number(row.analysis?.stopSpread || 0),
   targetSpread: Number(row.analysis?.targetSpread || 0),
   brokerageBreakevenPoints: Number(row.costs?.brokerageBreakevenPoints || 0),
   firstLots: row.firstLots,
   secondLots: row.secondLots,
   savedAt: Date.now(),
  };
  state.plans = [plan, ...state.plans.filter(existing => existing.spreadKey !== plan.spreadKey)].slice(0, 30);
  writePlans(state.plans);
  render();
 }

 function bind() {
  document.querySelectorAll('[data-commodity-symbol]').forEach(item => item.addEventListener('click', event => {
   if (event.target.closest('[data-commodity-chart], [data-commodity-calendar-chart]')) return;
   state.selectedSymbol = String(item.dataset.commoditySymbol || '');
   resetPreview();
   render();
  }));
  document.querySelectorAll('[data-commodity-chart]').forEach(button => button.addEventListener('click', event => {
   event.stopPropagation();
   openChart(button.dataset.commodityChart, button.dataset.commodityTimeframe || '1d');
  }));
  document.querySelectorAll('[data-commodity-calendar-chart]').forEach(button => button.addEventListener('click', event => {
   event.stopPropagation();
   openCommodityCalendarChart(button.dataset.commodityCalendarChart);
  }));
  document.querySelectorAll('[data-commodity-spread-chart]').forEach(button => button.addEventListener('click', () => {
   const row = state.spreadRows.find(item => item.key === button.dataset.commoditySpreadChart);
   openSpreadChart(row, button.dataset.commodityTimeframe || '1d', button.dataset.commoditySpreadView || state.spreadChartView);
  }));
  document.querySelectorAll('[data-spread-chart-view]').forEach(button => button.addEventListener('click', () => {
   state.spreadChartView = String(button.dataset.spreadChartView || 'continuous');
   render();
   if (state.spreadChartView === 'historical') loadSpreadExpiryCatalog().catch(() => {});
  }));
  document.querySelectorAll('[data-commodity-spread-key]').forEach(button => button.addEventListener('click', () => {
   state.selectedSpreadKey = String(button.dataset.commoditySpreadKey || '');
   resetPreview();
   render();
   if (state.spreadChartView === 'historical') loadSpreadExpiryCatalog().catch(() => {});
  }));
  document.querySelectorAll('[data-commodity-filter]').forEach(button => button.addEventListener('click', () => {
   state.filter = String(button.dataset.commodityFilter || 'featured');
   state.selectedSymbol = '';
   render();
  }));
  document.getElementById('commoditySearch')?.addEventListener('input', event => {
   state.query = String(event.target.value || '');
   state.selectedSymbol = '';
   render();
  });
  document.getElementById('commodityRefresh')?.addEventListener('click', refresh);
  document.getElementById('commodityLiveStop')?.addEventListener('click', stopLive);
  document.querySelectorAll('[data-commodity-scope]').forEach(button => button.addEventListener('click', () => {
   state.planScope = String(button.dataset.commodityScope || 'single');
   resetPreview();
   render();
  }));
  document.querySelectorAll('[data-commodity-direction]').forEach(button => button.addEventListener('click', () => {
   state.planDirection = String(button.dataset.commodityDirection || 'buyNear');
   resetPreview();
   render();
  }));
  document.querySelectorAll('[data-spread-mode]').forEach(button => button.addEventListener('click', () => {
   state.spreadMode = String(button.dataset.spreadMode || 'calendar') === 'sizeMatched' ? 'sizeMatched' : 'calendar';
   state.spreadKey = '';
   ensureSpreadInputs(currentRow());
   render();
  }));
  document.getElementById('commoditySpreadDate')?.addEventListener('input', event => { state.spreadEntryDate = String(event.target.value || ''); });
  document.getElementById('commoditySpreadBuy')?.addEventListener('input', event => { state.spreadEntryBuyPrice = String(event.target.value || ''); });
  document.getElementById('commoditySpreadSell')?.addEventListener('input', event => { state.spreadEntrySellPrice = String(event.target.value || ''); });
  document.getElementById('commoditySpreadBuyLots')?.addEventListener('input', event => { state.spreadBuyLots = Math.max(1, Math.round(Number(event.target.value || 1))); });
  document.getElementById('commoditySpreadSellLots')?.addEventListener('input', event => { state.spreadSellLots = Math.max(1, Math.round(Number(event.target.value || 1))); });
  document.getElementById('commoditySpreadCosts')?.addEventListener('input', event => { state.spreadCosts = Math.max(0, Number(event.target.value || 0)); });
  document.getElementById('commodityLoadSpread')?.addEventListener('click', () => loadSpreadHistory());
  document.getElementById('commodityProductType')?.addEventListener('change', event => {
   state.productType = String(event.target.value || 'MARGIN');
   resetPreview();
   render();
  });
  document.getElementById('commodityQuantity')?.addEventListener('input', event => {
   state.quantity = Math.max(1, Math.round(Number(event.target.value || 1)));
   resetPreview();
  });
  document.getElementById('commodityMarginPreview')?.addEventListener('click', () => estimateMargin());
  document.getElementById('commoditySavePlan')?.addEventListener('click', () => savePlan());
  document.querySelectorAll('[data-commodity-plan-remove]').forEach(button => button.addEventListener('click', () => {
   state.plans = state.plans.filter(plan => String(plan.id) !== String(button.dataset.commodityPlanRemove || ''));
   writePlans(state.plans);
   render();
  }));
  document.querySelectorAll('[data-commodity-view]').forEach(button => button.addEventListener('click', () => {
   state.workspaceView = String(button.dataset.commodityView || 'watch');
   resetPreview();
   render();
  }));
  document.getElementById('commodityRunLab')?.addEventListener('click', runLab);
  document.getElementById('commodityRunSpreadScan')?.addEventListener('click', () => runSpreadScan());
  document.getElementById('commodityCachedSpreadScan')?.addEventListener('click', () => runSpreadScan());
  document.getElementById('commodityForceSpreadScan')?.addEventListener('click', () => runSpreadScan({ force: true }));
  document.getElementById('commodityStopSpreadScan')?.addEventListener('click', stopSpreadScan);
  document.getElementById('commodityStopSpreadScanTop')?.addEventListener('click', stopSpreadScan);
  document.getElementById('commodityRetrySpreadScan')?.addEventListener('click', () => runSpreadScan());
  document.getElementById('commodityEmptySpreadScan')?.addEventListener('click', () => runSpreadScan());
  document.getElementById('commoditySaveSpreadWatch')?.addEventListener('click', () => saveSpreadWatch());
  document.getElementById('commoditySpreadMarginPreview')?.addEventListener('click', () => estimateSpreadMargin());
  document.getElementById('commodityStartSpreadBackfill')?.addEventListener('click', () => startSpreadBackfill());
  document.getElementById('commodityRefreshSpreadBackfill')?.addEventListener('click', () => startSpreadBackfill({ force: true }));
  document.getElementById('commodityCancelSpreadBackfill')?.addEventListener('click', cancelSpreadBackfill);
  document.querySelectorAll('[data-spread-desk-type]').forEach(button => button.addEventListener('click', () => {
   state.spreadDeskType = String(button.dataset.spreadDeskType || 'all');
   runSpreadScan();
  }));
  document.querySelectorAll('[data-commodity-lab-symbol]').forEach(button => button.addEventListener('click', () => {
   state.selectedLabSymbol = String(button.dataset.commodityLabSymbol || '');
   render();
  }));
 }

 async function renderCommodities() {
  const root = document.getElementById('pane-commodities');
  if (root) root.dataset.lazyReady = 'true';
  render();
  if (!state.autoLoaded) {
   state.autoLoaded = true;
   await refresh();
  }
 }

 global.renderCommodities = renderCommodities;
})(window);
