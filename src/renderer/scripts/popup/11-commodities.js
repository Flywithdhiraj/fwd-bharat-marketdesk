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
 };
 let livePollTimer = null;

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

 async function marketData(action, payload = {}) {
  const bridge = global.fwdDesktopNative;
  if (!bridge?.sendNativeMessage) return { ok: false, error: 'Desktop market-data bridge is not available.' };
  return bridge.sendNativeMessage({ type: 'dhan_data', action, ...payload });
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
 }

 async function pollLive() {
  if (!document.getElementById('pane-commodities')?.classList.contains('active')) return;
  const response = await marketData('live_feed_status', { limit: 100 }).catch(() => null);
  if (!response?.ok) return;
  state.socket = response;
  mergeLiveTicks(response);
  render();
 }

 function beginLivePoll() {
  if (livePollTimer) return;
  livePollTimer = global.setInterval(() => pollLive().catch(() => {}), 2500);
 }

 async function subscribeLive() {
  const instruments = state.rows.slice(0, 30).flatMap(row => [row.nearFuture, row.nextFuture].filter(Boolean));
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
     <button type="button" class="bsm" data-commodity-chart="${esc(row.nearFuture?.tradingSymbol || '')}" data-commodity-timeframe="1d">Trend 1D</button>
     <button type="button" class="bsm" data-commodity-chart="${esc(row.nearFuture?.tradingSymbol || '')}" data-commodity-timeframe="15m">Trade 15m</button>
    </div>
   </header>
   <div class="commodity-leg-grid">
    <div><span>Near expiry</span><b>${number(row.nearPrice)}</b><small>${expiry(row.nearFuture?.expiry)} | OI ${integer(row.oi)}</small></div>
    <div><span>Next expiry</span><b>${row.nextFuture ? number(row.nextPrice) : '--'}</b><small>${row.nextFuture ? `${expiry(row.nextFuture.expiry)} | ${number(row.termDays, 1)} days apart` : 'No next contract loaded'}</small></div>
    <div><span>Indicative calendar spread</span><b class="${Number(row.indicativeSpread || 0) >= 0 ? 'up' : 'down'}">${row.nextFuture ? signed(row.indicativeSpread) : '--'}</b><small>${row.nextFuture ? signed(row.annualizedSpreadPct, 2, '% annualised observation') : 'Needs two expiries'}</small></div>
   </div>
   <div class="commodity-execution">
    <div><span>Depth status</span><strong>${row.depthConfirmed ? 'Observed' : 'Indicative only'}</strong></div>
    <div><span>Executable direction</span><strong>${esc(row.executableDirection || '--')}</strong></div>
    <div><span>Executable spread</span><strong>${row.executableSpread == null ? '--' : signed(row.executableSpread)}</strong></div>
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
    <div><span>Entry timing</span><strong>${esc(raw.timingLabel || '--')}</strong><small>${integer(raw.intradayCandles)} active-contract 15m candles</small></div>
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
    <button type="button" class="bsm" data-commodity-chart="${esc(row.symbol)}" data-commodity-timeframe="15m">Open Entry Chart</button>
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
  state.spreadEntryDate = new Date().toLocaleDateString('en-CA');
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
    <td><button type="button" class="bsm" data-commodity-chart="${esc(row.nearFuture?.tradingSymbol || '')}">Chart</button></td>
   </tr>`).join('')}</tbody>
  </table></div>`;
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
    <button type="button" data-commodity-view="lab" class="${state.workspaceView === 'lab' ? 'active' : ''}">Commodity Lab</button>
    ${state.workspaceView === 'lab' ? `<button type="button" class="bsm commodity-primary" id="commodityRunLab" ${state.labStatus === 'loading' ? 'disabled' : ''}>${state.labStatus === 'loading' ? 'Analyzing...' : 'Run Lab'}</button>` : ''}
   </div>
   ${state.workspaceView === 'lab' ? labResultsHtml() : `
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

 function resetPreview() {
  state.marginStatus = 'idle';
  state.marginError = '';
  state.marginPreview = null;
 }

 async function loadSpreadHistory(row = currentRow()) {
  const setup = ensureSpreadInputs(row);
  if (!setup) return;
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

 function openChart(contract = '', timeframe = '1d') {
  const symbol = String(contract || '').trim().toUpperCase();
  if (!symbol) return;
  const safeTimeframe = timeframe === '15m' ? '15m' : '1d';
  const visibleCandleCount = safeTimeframe === '1d' ? 1095 : 8640;
  global.openSignalInChartWorkspace?.({ symbol, timeframe: safeTimeframe, setupFamilyLabel: safeTimeframe === '1d' ? 'MCX Rolling Trend' : 'MCX Active Future' }, { overlay: false, timeframe: safeTimeframe, visibleCandleCount });
 }

 function bind() {
  document.querySelectorAll('[data-commodity-symbol]').forEach(item => item.addEventListener('click', event => {
   if (event.target.closest('[data-commodity-chart]')) return;
   state.selectedSymbol = String(item.dataset.commoditySymbol || '');
   resetPreview();
   render();
  }));
  document.querySelectorAll('[data-commodity-chart]').forEach(button => button.addEventListener('click', event => {
   event.stopPropagation();
   openChart(button.dataset.commodityChart, button.dataset.commodityTimeframe || '1d');
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
  document.getElementById('commoditySpreadDate')?.addEventListener('change', event => { state.spreadEntryDate = String(event.target.value || ''); });
  document.getElementById('commoditySpreadBuy')?.addEventListener('change', event => { state.spreadEntryBuyPrice = String(event.target.value || ''); });
  document.getElementById('commoditySpreadSell')?.addEventListener('change', event => { state.spreadEntrySellPrice = String(event.target.value || ''); });
  document.getElementById('commoditySpreadBuyLots')?.addEventListener('change', event => { state.spreadBuyLots = Math.max(1, Math.round(Number(event.target.value || 1))); });
  document.getElementById('commoditySpreadSellLots')?.addEventListener('change', event => { state.spreadSellLots = Math.max(1, Math.round(Number(event.target.value || 1))); });
  document.getElementById('commoditySpreadCosts')?.addEventListener('change', event => { state.spreadCosts = Math.max(0, Number(event.target.value || 0)); });
  document.getElementById('commodityLoadSpread')?.addEventListener('click', () => loadSpreadHistory());
  document.getElementById('commodityProductType')?.addEventListener('change', event => {
   state.productType = String(event.target.value || 'MARGIN');
   resetPreview();
   render();
  });
  document.getElementById('commodityQuantity')?.addEventListener('change', event => {
   state.quantity = Math.max(1, Math.round(Number(event.target.value || 1)));
   resetPreview();
   render();
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
   render();
  }));
  document.getElementById('commodityRunLab')?.addEventListener('click', runLab);
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
