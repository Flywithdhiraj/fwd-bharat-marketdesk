'use strict';

(function initOptionsHub(global) {
 const OPTION_UNDERLYINGS = Object.freeze(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYIT']);
 const DEFAULT_STATE = { underlying: 'NIFTY', expiry: '', rows: [], summary: null, expiries: [], status: 'idle', error: '', updatedAt: 0, autoLoaded: false, cooldownUntil: 0 };
 let state = { ...DEFAULT_STATE };
 let refreshTimer = null;

 function esc(value) {
  return String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
 }

 function num(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
 }

 function int(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return Math.round(n).toLocaleString('en-IN');
 }

 function pct(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return `${n.toFixed(decimals)}%`;
 }

 async function dhan(action, payload = {}) {
  const bridge = global.fwdDesktopNative;
  if (!bridge?.sendNativeMessage) return { ok: false, error: 'Desktop market-data bridge is not available.' };
  return bridge.sendNativeMessage({ ...payload, type: 'dhan_data', action });
 }

 function visibleRows() {
  const rows = Array.isArray(state.rows) ? state.rows : [];
  const spot = Number(state.summary?.underlyingPrice || 0);
  if (!(spot > 0)) return rows.slice(0, 80);
  return rows
  .map(row => ({ row, distance: Math.abs(Number(row.strike || 0) - spot) }))
  .sort((a, b) => a.distance - b.distance)
  .slice(0, 42)
  .sort((a, b) => Number(a.row.strike || 0) - Number(b.row.strike || 0))
  .map(item => item.row);
 }

 function tonePcr(value) {
  const n = Number(value || 0);
  if (n >= 1.2) return 'good';
  if (n <= 0.75) return 'bad';
  return 'warn';
 }

 function summaryCards() {
  const s = state.summary || {};
  const cards = [
   ['Spot', num(s.underlyingPrice, 2), `${esc(state.underlying)} live chain snapshot`, 'info'],
   ['PCR OI', num(s.pcrOi, 2), `Put OI ${int(s.totalPutOi)} / Call OI ${int(s.totalCallOi)}`, tonePcr(s.pcrOi)],
   ['Max Pain', num(s.maxPainStrike, 0), 'Minimum total option writer payout strike', 'warn'],
   ['ATM', num(s.atmStrike, 0), `ATM IV skew ${num(s.atmIvSkew, 2)}`, 'info'],
   ['Call Wall', num(s.callWall, 0), 'Highest call open interest', 'bad'],
   ['Put Wall', num(s.putWall, 0), 'Highest put open interest', 'good'],
   ['IV Skew', num(s.ivSkew, 2), `Avg PE IV ${num(s.averagePutIv, 2)} vs CE IV ${num(s.averageCallIv, 2)}`, Number(s.ivSkew || 0) >= 0 ? 'warn' : 'info'],
   ['Volume PCR', num(s.pcrVolume, 2), `PE volume ${int(s.totalPutVolume)} / CE volume ${int(s.totalCallVolume)}`, tonePcr(s.pcrVolume)],
  ];
  return cards.map(([label, value, copy, tone]) => `
   <div class="options-metric ${esc(tone)}">
    <span>${esc(label)}</span>
    <strong>${esc(value)}</strong>
    <small>${esc(copy)}</small>
   </div>
  `).join('');
 }

 function rowHtml(row) {
  const s = state.summary || {};
  const strike = Number(row.strike || 0);
  const atm = Number(s.atmStrike || 0) === strike;
  const ce = row.ce || {};
  const pe = row.pe || {};
  return `<tr class="${atm ? 'is-atm' : ''}">
   <td class="ce">${int(ce.oi)}</td>
   <td class="ce">${int(ce.oiChange)}</td>
   <td class="ce">${int(ce.volume)}</td>
   <td class="ce">${num(ce.iv, 2)}</td>
   <td class="ce greek">${num(ce.delta, 3)}</td>
   <td class="price">${num(ce.lastPrice, 2)}</td>
   <td class="strike">${num(strike, 0)}${atm ? '<em>ATM</em>' : ''}</td>
   <td class="price">${num(pe.lastPrice, 2)}</td>
   <td class="pe greek">${num(pe.delta, 3)}</td>
   <td class="pe">${num(pe.iv, 2)}</td>
   <td class="pe">${int(pe.volume)}</td>
   <td class="pe">${int(pe.oiChange)}</td>
   <td class="pe">${int(pe.oi)}</td>
   <td>${num(row.pcrStrike, 2)}</td>
  </tr>`;
 }

 function render() {
  const root = document.getElementById('pane-options');
  if (!root) return;
  const rows = visibleRows();
 const expiries = Array.isArray(state.expiries) ? state.expiries : [];
  const coolingDown = Number(state.cooldownUntil || 0) > Date.now();
  root.innerHTML = `
  <div class="options-hub">
   <div class="options-head">
    <div>
     <div class="command-eyebrow">Options Hub</div>
     <h2>Strike-wise Option Chain</h2>
     <p>Read-only option-chain analytics with OI, PCR, max pain, IV skew and Greeks. All order action stays manual.</p>
    </div>
    <div class="options-live-card">
     <span>Live Feed</span>
     <strong id="optionsLiveStatus">${esc(state.liveStatus || 'Not connected')}</strong>
     <small id="optionsLiveCopy">${esc(state.liveCopy || 'Subscribe to websocket ticks for the selected underlying.')}</small>
    </div>
   </div>
   <div class="options-controls">
    <label><span>Underlying</span><select id="optionsUnderlying">${OPTION_UNDERLYINGS.map(symbol => `<option value="${esc(symbol)}" ${symbol === state.underlying ? 'selected' : ''}>${esc(symbol)}</option>`).join('')}</select></label>
    <label><span>Expiry</span><select id="optionsExpiry"><option value="">Nearest expiry</option>${expiries.map(expiry => `<option value="${esc(expiry)}" ${expiry === state.expiry ? 'selected' : ''}>${esc(expiry)}</option>`).join('')}</select></label>
    <button type="button" class="bsm" id="optionsRefresh" ${state.status === 'loading' || coolingDown ? 'disabled' : ''}>Refresh Chain</button>
    <button type="button" class="bsm secondary" id="optionsLiveSubscribe">Start WebSocket</button>
    <button type="button" class="bsm secondary" id="optionsLiveStop">Stop WebSocket</button>
    <span class="options-status ${state.error ? 'bad' : state.status === 'loading' ? 'warn' : 'good'}">${esc(state.error || (state.status === 'loading' ? 'Loading...' : state.updatedAt ? `Updated ${new Date(state.updatedAt).toLocaleTimeString()}` : 'Ready'))}</span>
   </div>
   <div class="options-metrics">${summaryCards()}</div>
   <div class="options-table-wrap">
    <table class="options-chain-table">
     <thead>
      <tr><th colspan="6" class="ce">CALLS</th><th>STRIKE</th><th colspan="6" class="pe">PUTS</th><th>PCR</th></tr>
      <tr>
       <th>OI</th><th>OI Chg</th><th>Vol</th><th>IV</th><th>Delta</th><th>LTP</th>
       <th>Strike</th>
       <th>LTP</th><th>Delta</th><th>IV</th><th>Vol</th><th>OI Chg</th><th>OI</th><th>PCR</th>
      </tr>
     </thead>
     <tbody>${rows.length ? rows.map(rowHtml).join('') : '<tr><td colspan="14" class="empty">Refresh the chain after saving market-data credentials.</td></tr>'}</tbody>
    </table>
   </div>
  </div>`;
  bind();
 }

 async function loadExpiries() {
  const response = await dhan('option_expiries', { underlying: state.underlying });
  if (response?.ok) {
   state.expiries = Array.isArray(response.expiries) ? response.expiries : [];
   if (!state.expiry && state.expiries.length) state.expiry = state.expiries[0];
  }
  return response;
 }

 async function refreshChain({ force = false } = {}) {
  state = { ...state, autoLoaded: true, status: 'loading', error: '' };
  render();
  try {
   if (!state.expiries.length) await loadExpiries();
   const response = await dhan('option_chain', { underlying: state.underlying, expiry: state.expiry, force });
   if (!response?.ok) throw new Error(response?.error || 'Option chain request failed.');
   state = {
    ...state,
    rows: Array.isArray(response.rows) ? response.rows : [],
    summary: response.summary || null,
    expiry: response.summary?.expiry || state.expiry,
    status: 'ready',
    error: '',
    cooldownUntil: 0,
    updatedAt: Date.now(),
   };
  } catch (error) {
   const message = error?.message || String(error || 'Option chain failed');
   const coolingDown = /cooling down|rate-limit|retry in/i.test(message);
   state = {
    ...state,
    status: 'error',
    error: message,
    cooldownUntil: coolingDown ? Date.now() + 60000 : 0,
   };
   if (coolingDown) setTimeout(() => render(), 60050);
  }
  render();
 }

 async function refreshLiveStatus() {
  const response = await dhan('live_feed_status', { limit: 12 });
  const ticks = Array.isArray(response?.ticks) ? response.ticks : [];
  state.liveStatus = response?.connected ? 'Connected' : response?.status || 'Stopped';
  state.liveCopy = response?.connected
  ? `${response.instrumentCount || 0} subscribed | ${ticks.length} recent tick(s)`
  : response?.message || 'WebSocket stopped';
  const status = document.getElementById('optionsLiveStatus');
  const copy = document.getElementById('optionsLiveCopy');
  if (status) status.textContent = state.liveStatus;
  if (copy) copy.textContent = state.liveCopy;
 }

 async function startLiveFeed() {
  const symbols = [state.underlying];
  const response = await dhan('live_feed_subscribe', { symbols, mode: 'quote', owner: 'options' });
  state.liveStatus = response?.connected ? 'Connected' : response?.status || 'Connecting';
  state.liveCopy = response?.message || `Subscribed ${state.underlying}`;
  render();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshLiveStatus, 2500);
  await refreshLiveStatus();
 }

 async function stopLiveFeed() {
  await dhan('live_feed_unsubscribe', { owner: 'options' });
  clearInterval(refreshTimer);
  refreshTimer = null;
  state.liveStatus = 'Stopped';
  state.liveCopy = 'WebSocket subscription stopped.';
  render();
 }

 function bind() {
  document.getElementById('optionsUnderlying')?.addEventListener('change', event => {
   state.underlying = String(event.target.value || 'NIFTY');
   state.expiry = '';
   state.expiries = [];
   state.autoLoaded = false;
   refreshChain({ force: true });
  });
  document.getElementById('optionsExpiry')?.addEventListener('change', event => {
   state.expiry = String(event.target.value || '');
   refreshChain({ force: true });
  });
  document.getElementById('optionsRefresh')?.addEventListener('click', () => refreshChain({ force: true }));
  document.getElementById('optionsLiveSubscribe')?.addEventListener('click', startLiveFeed);
  document.getElementById('optionsLiveStop')?.addEventListener('click', stopLiveFeed);
 }

 async function renderOptionsHub() {
  const root = document.getElementById('pane-options');
  if (root) root.dataset.lazyReady = 'true';
  render();
  if (!state.autoLoaded && state.status !== 'loading') await refreshChain();
  else await refreshLiveStatus();
 }

 global.renderOptionsHub = renderOptionsHub;
})(window);
