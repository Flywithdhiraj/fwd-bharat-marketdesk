let heatmapSectorFilter = '';
let fundingQuickFilter = 'all';
let selectedFundingSymbol = '';
let fundingSearchQuery = '';
let fundingAnnualized = false;
let corrQuickFilter = 'all';
let selectedCorrSymbol = '';
let lastFundingEntries = [];
let lastCorrelationModel = null;

function reportsToneClass(tone = '') {
 const safeTone = String(tone || '').trim().toLowerCase();
 return ['good', 'warn', 'bad', 'info', 'waiting'].includes(safeTone) ? safeTone : 'info';
}

function reportsAgeLabel(ageMs = 0) {
 const safeAge = Math.max(0, Number(ageMs || 0));
 if (!safeAge) return 'No timestamp yet';
 if (safeAge < 60000) return `${Math.max(1, Math.round(safeAge / 1000))}s ago`;
 if (safeAge < 3600000) return `${Math.round(safeAge / 60000)}m ago`;
 return `${Math.round(safeAge / 3600000)}h ago`;
}

function renderReportsHealthStrip(context = {}) {
 const strip = document.getElementById('reportsHealthStrip');
 if (!strip) return;
 const range = Number(context.rangeDays || document.getElementById('liveAnalyticsRangeDaysInput')?.value || 7);
 const closed = Number(context.closedTrades ?? context.tradeCount ?? 0);
 const mode = String(context.mode || (context.autoTrade ? 'Live ready' : context.paperTracking ? 'Paper first' : 'Manual')).trim();
 const stale = Number(context.updatedAt || context.lastScanTs || 0) > 0 ? Date.now() - Number(context.updatedAt || context.lastScanTs || 0) : 0;
 const dataFresh = stale > 0 && stale < 20 * 60 * 1000;
 const rows = [
 { label: 'Data', value: dataFresh ? 'Fresh' : (stale ? 'Stale' : 'Waiting'), detail: stale ? `${reportsAgeLabel(stale)} source` : 'No timestamp yet', tone: dataFresh ? 'good' : 'warn' },
 { label: 'Mode', value: mode, detail: context.profile || 'Report workspace', tone: context.autoTrade ? 'warn' : 'info' },
 { label: 'Range', value: `${range}D`, detail: 'Selected analytics window', tone: 'info' },
 { label: 'Closed', value: String(closed), detail: closed ? 'Ready for review/export' : 'No closed trades in range', tone: closed ? 'good' : 'warn' },
 { label: 'Export', value: closed ? 'Ready' : 'Limited', detail: closed ? 'CSV and report export available' : 'Run more trades first', tone: closed ? 'good' : 'warn' },
 ];
 strip.innerHTML = rows.map(row => `<div class="reports-health-item is-${reportsToneClass(row.tone)}"><span>${esc(row.label)}</span><strong>${esc(row.value)}</strong><small>${esc(row.detail)}</small></div>`).join('');
}

globalThis.renderReportsHealthStrip = renderReportsHealthStrip;



// View toggle

// Use event delegation so it works even if .fv-btn elements are injected later (lazy pane loading)
function waitForBacktestPaneControls(remainingFrames = 18) {
 return new Promise(resolve => {
 const probe = () => {
 const symbolEl = document.getElementById('btSymbol');
 const runBtn = document.getElementById('btnRunBT');
 const resultEl = document.getElementById('btResult');
 if (symbolEl && runBtn && resultEl) {
 resolve({ symbolEl, runBtn, resultEl });
 return;
 }
 if (remainingFrames <= 0) {
 resolve(null);
 return;
 }
 remainingFrames -= 1;
 requestAnimationFrame(probe);
 };
 probe();
 });
}

async function prepareBacktestPane(symbol = '', minScore = null) {
 const safeSymbol = String(symbol || '').trim().toUpperCase();
 void minScore;
 if (typeof setActiveWorkspaceTab === 'function') {
 setActiveWorkspaceTab('backtest', true, true);
 }
 const controls = await waitForBacktestPaneControls();
 if (!controls) {
 if (typeof reportUiError === 'function') {
 reportUiError('Backtest pane failed to load', new Error('Backtest controls are not mounted yet.'));
 }
 return null;
 }
 if (safeSymbol) controls.symbolEl.value = safeSymbol;
 return controls;
}

globalThis.prepareBacktestPane = prepareBacktestPane;

document.addEventListener('click', (e) => {
 const btn = e.target.closest('.fv-btn');
 if (!btn) return;
 applyFundingViewMode(btn.dataset.view);
 if (fundingView === 'heatmap') renderFundingHeatmap();
 else renderFundingArbitrage();
});

function applyFundingViewMode(view = 'heatmap') {
 fundingView = view === 'arbitrage' ? 'arbitrage' : 'heatmap';
 const pane = document.getElementById('pane-funding');
 const heatmapEl = document.getElementById('fundingHeatmapView');
 const arbEl = document.getElementById('fundingArbView');
 if (pane) pane.dataset.fundingView = fundingView;
 document.querySelectorAll('.fv-btn').forEach(b => {
 const active = b.dataset.view === fundingView;
 b.classList.toggle('active', active);
 b.setAttribute('aria-pressed', active ? 'true' : 'false');
 });
 if (heatmapEl) {
 heatmapEl.hidden = fundingView !== 'heatmap';
 heatmapEl.style.display = '';
 }
 if (arbEl) {
 arbEl.hidden = fundingView !== 'arbitrage';
 arbEl.style.display = '';
 }
}

document.addEventListener('click', (e) => {
 const fundingFilter = e.target.closest('[data-funding-filter]');
 if (fundingFilter) {
 fundingQuickFilter = fundingFilter.dataset.fundingFilter || 'all';
 renderFundingHeatmap();
 return;
 }

 const fundingCell = e.target.closest('.fh-cell[data-symbol], .funding-opportunity[data-symbol]');
 if (fundingCell) {
 selectedFundingSymbol = fundingCell.dataset.symbol || '';
 renderFundingHeatmap();
 return;
 }

 const corrFilter = e.target.closest('[data-corr-filter]');
 if (corrFilter) {
 corrQuickFilter = corrFilter.dataset.corrFilter || 'all';
 renderCorrelationMatrix();
 return;
 }

 const corrTarget = e.target.closest('[data-corr-symbol]');
 if (corrTarget) {
 selectedCorrSymbol = corrTarget.dataset.corrSymbol || '';
 renderCorrelationMatrix();
 return;
 }

 const corrFunding = e.target.closest('[data-corr-open-funding]');
 if (corrFunding) {
 selectedFundingSymbol = String(corrFunding.dataset.sym || selectedCorrSymbol || '').trim().toUpperCase();
 if (typeof setActiveWorkspaceTab === 'function') setActiveWorkspaceTab('funding', true, true);
 requestAnimationFrame(() => {
 if (fundingView === 'arbitrage') renderFundingArbitrage();
 else renderFundingHeatmap();
 });
 return;
 }

 const fundingAction = e.target.closest('[data-funding-action]');
 if (fundingAction) {
 const sym = String(fundingAction.dataset.sym || selectedFundingSymbol || '').trim().toUpperCase();
 if (!sym) return;
 const action = fundingAction.dataset.fundingAction;
 if (action === 'matrix') {
 selectedCorrSymbol = sym;
 if (typeof setActiveWorkspaceTab === 'function') setActiveWorkspaceTab('corr', true, true);
 requestAnimationFrame(() => {
 const search = document.getElementById('corrSearch');
 if (search) search.value = sym.replace(/USDT?$|USD$/, '');
 renderCorrelationMatrix();
 });
 return;
 }
 if (action === 'risk') {
 if (typeof setActiveWorkspaceTab === 'function') setActiveWorkspaceTab('riskcalc', true, true);
 const selected = lastFundingEntries.find(item => item.sym === sym);
 showSystemToast?.('Funding sent to Risk', `${sym} ${selected ? fundingDisplayRate(selected.fr) : ''} is ready for manual sizing.`, 'info', 3200);
 }
 }
});

function fundingFilterLabel(filter) {
 return {
 all: 'All markets',
 longs: 'Long crowding',
 shorts: 'Short crowding',
 extreme: 'Extreme only',
 liquid: 'Liquid only'
 }[filter] || 'All markets';
}

function fundingCrowdLabel(fr) {
 if (fr > 0.1) return 'Extreme long crowding';
 if (fr > 0.05) return 'High long crowding';
 if (fr > 0.01) return 'Moderate long crowding';
 if (fr < -0.1) return 'Extreme short crowding';
 if (fr < -0.05) return 'High short crowding';
 if (fr < -0.01) return 'Moderate short crowding';
 return 'Balanced funding';
}

function fundingDisplayRate(fr, digits = 4) {
 const rate = Number(fr || 0);
 return fundingAnnualized
 ? `${fundingSignedPercent(fundingAnnualStressRate(rate), digits)} ann. stress`
 : `${fundingSignedPercent(rate, digits)} / 8h`;
}

function fundingAnnualStressRate(fr) {
 return Number(fr || 0) * 3 * 365;
}

function fundingSignedPercent(value, digits = 4) {
 const rate = Number(value || 0);
 return `${rate > 0 ? '+' : ''}${rate.toFixed(digits)}%`;
}

function fundingCarryContext(fr) {
 const rate = Number(fr || 0);
 return `24h run-rate ${fundingSignedPercent(rate * 3, 4)} | Annualized stress ${fundingSignedPercent(fundingAnnualStressRate(rate), 2)}. Funding resets every settlement; this is not a guaranteed one-year interest rate.`;
}

function fundingFilterEntries(entries) {
 const query = String(fundingSearchQuery || '').trim().toUpperCase();
 let filtered = entries;
 if (query) {
 filtered = filtered.filter(e => {
 const symbol = String(e.sym || '').toUpperCase();
 const base = symbol.replace(/USDT?$|USD$/, '');
 const sector = String(e.sector || '').toUpperCase();
 return symbol.includes(query) || base.includes(query) || sector.includes(query);
 });
 }
 if (fundingQuickFilter === 'longs') return filtered.filter(e => e.fr > 0.05);
 if (fundingQuickFilter === 'shorts') return filtered.filter(e => e.fr < -0.05);
 if (fundingQuickFilter === 'extreme') return filtered.filter(e => Math.abs(e.fr) > 0.1);
 if (fundingQuickFilter === 'liquid') return filtered.filter(e => Number(e.vol || e.oi || 0) >= 100000);
 return filtered;
}

function renderFundingDetail(selected, filtered, stats) {
 const panel = document.getElementById('fundingSelectedPanel');
 const rail = document.getElementById('fundingOpportunityRail');
 const chips = document.getElementById('fundingQuickFilters');

 if (chips) {
 chips.querySelectorAll('[data-funding-filter]').forEach(btn => {
 btn.classList.toggle('active', (btn.dataset.fundingFilter || 'all') === fundingQuickFilter);
 });
 }

 if (panel) {
 if (!selected) {
 panel.innerHTML = `<div class="research-detail-empty">Select a tile to inspect funding risk, sector, and scanner action.</div>`;
 } else {
 const label = selected.sym.replace(/USDT?$|USD$/, '');
 const frLabel = fundingDisplayRate(selected.fr);
 const action = selected.fr > 0.05 ? 'Contrarian short watch' : selected.fr < -0.05 ? 'Contrarian long watch' : 'Use as context';
 const tone = selected.fr > 0 ? 'red' : selected.fr < 0 ? 'green' : '';
 panel.innerHTML = `
 <div class="research-detail-kicker">Selected Funding</div>
 <div class="research-detail-title">${esc(label)}</div>
 <div class="research-detail-rate ${tone}">${frLabel}</div>
 <div class="research-detail-line">${esc(fundingCrowdLabel(selected.fr))}</div>
 <div class="research-detail-line">${esc(fundingCarryContext(selected.fr))}</div>
 <div class="research-detail-grid">
 <span>Sector</span><strong>${esc(selected.sector || 'Other')}</strong>
 <span>24h vol</span><strong>${formatReportMoney(Number(selected.vol || 0), 0, { compact: true })}</strong>
 <span>Action</span><strong>${action}</strong>
 </div>
 <div class="funding-action-row">
 <button class="arb-action-btn primary" data-arb-action="scanner" data-sym="${esc(selected.sym)}">View in Scanner</button>
 <button class="arb-action-btn" data-funding-action="matrix" data-sym="${esc(selected.sym)}">Send to Matrix</button>
 <button class="arb-action-btn" data-funding-action="risk" data-sym="${esc(selected.sym)}">Send to Risk</button>
 </div>
 `;
 }
 }

 if (rail) {
 const strongest = filtered.slice(0, 5);
 rail.innerHTML = `
 <div class="research-detail-kicker">Market Read</div>
 <div class="research-detail-line">${esc(stats.dominance)}. Filter: ${esc(fundingFilterLabel(fundingQuickFilter))}.</div>
 <div class="funding-opportunity-list">
 ${strongest.map(e => {
 const label = e.sym.replace(/USDT?$|USD$/, '');
 const frLabel = fundingDisplayRate(e.fr);
 return `<button class="funding-opportunity ${selectedFundingSymbol === e.sym ? 'active' : ''}" data-symbol="${esc(e.sym)}">
 <span>${esc(label)}</span><strong>${frLabel}</strong><small>${esc(fundingCrowdLabel(e.fr))}</small>
 </button>`;
 }).join('') || '<div class="research-detail-empty">No symbols match this filter.</div>'}
 </div>
 `;
 }
}
function focusFundingSymbolInScanner(symbol) {

 const sym = String(symbol || '').toUpperCase().trim();

 if (!sym) return;

 if (typeof setActiveWorkspaceTab === 'function') {

 setActiveWorkspaceTab('scanner', true, true);

 }

 const searchEl = document.getElementById('fSearch');

 if (searchEl) {

 searchEl.value = sym;

 searchEl.dispatchEvent(new Event('input', { bubbles: true }));

 }

 const sectorEl = document.getElementById('fSector');

 if (sectorEl && sectorEl.value) {

 sectorEl.value = '';

 sectorEl.dispatchEvent(new Event('change', { bubbles: true }));

 }

 if (typeof renderScanner === 'function') {

 renderScanner();

 }

}


async function addFundingSymbolToWatchlist(symbol) {

 const sym = String(symbol || '').toUpperCase().trim();

 if (!sym || typeof toggleWatchlist !== 'function') return;

 await toggleWatchlist(sym, { addOnly: true, renderWatchlist: false });

}


async function renderFundingHeatmap() {
 applyFundingViewMode('heatmap');
 const d = await storeGet(['fundingHeatmap', 'fundingRates', 'strategy']);
 setReportDisplayCurrency(d.strategy?.reportDisplayCurrency || 'USD');
 setReportDisplayUsdInrRate(d.strategy?.reportDisplayUsdInrRate || DEFAULT_REPORT_DISPLAY_USD_INR_RATE);

 const heatmap = d.fundingHeatmap || [];

 const rates = d.fundingRates || {};

 const cont = document.getElementById('fundingGrid');

 const noData = document.getElementById('fundingNoData');

 const filterEl = document.getElementById('frSectorFilter');
 const searchEl = document.getElementById('fundingSearchInput');
 const annualBtn = document.getElementById('fundingAnnualToggle');

 if (searchEl && searchEl.value !== fundingSearchQuery) searchEl.value = fundingSearchQuery;
 if (annualBtn) {
 annualBtn.classList.toggle('active', fundingAnnualized);
 annualBtn.setAttribute('aria-pressed', fundingAnnualized ? 'true' : 'false');
 annualBtn.textContent = fundingAnnualized ? 'Ann. Stress' : '8h Rate';
 }



 let entries;

 if (heatmap.length) {

 entries = heatmap

 .filter(h => !isNaN(h.fundingRate) && h.fundingRate != null)

 .map(h => ({ sym: h.symbol, fr: h.fundingRate, sector: normalizeSectorLabel(h.sector || getSector(h.symbol)), oi: h.oi, vol: h.volume }));

 } else {

 entries = Object.entries(rates)

 .filter(([, v]) => !isNaN(v) && v != null)

 .map(([sym, fr]) => ({ sym, fr, sector: normalizeSectorLabel(getSector(sym)), oi: 0, vol: 0 }));

 }



 if (!entries.length) {

 noData.style.display = 'flex';

 cont.style.display = 'none';

 filterEl.style.display = 'none';

 document.getElementById('frDominance').textContent = 'Warning: no data - run a scan first';

 return;

 }



 noData.style.display = 'none';

 cont.style.display = 'grid';

 filterEl.style.display = 'flex';



 // Build sector filter buttons

 const sectors = [...new Set(entries.map(e => e.sector))].sort();

 filterEl.innerHTML = `<button class="fr-sec-btn ${heatmapSectorFilter === '' ? 'active' : ''}" data-sector="">ALL</button>` +

 sectors.map(s => `<button class="fr-sec-btn ${heatmapSectorFilter === s ? 'active' : ''}" data-sector="${s}">${s}</button>`).join('');

 filterEl.querySelectorAll('.fr-sec-btn').forEach(btn => {

 btn.addEventListener('click', () => {

 heatmapSectorFilter = btn.dataset.sector;

 renderFundingHeatmap();

 });

 });



 let filtered = heatmapSectorFilter ? entries.filter(e => e.sector === heatmapSectorFilter) : entries;
 filtered = fundingFilterEntries(filtered);

 filtered.sort((a, b) => Math.abs(b.fr) - Math.abs(a.fr));
 lastFundingEntries = filtered;



 // Stats

 const extremePos = filtered.filter(e => e.fr > 0.1).length;

 const extremeNeg = filtered.filter(e => e.fr < -0.1).length;

 const highCount = filtered.filter(e => Math.abs(e.fr) > 0.05 && Math.abs(e.fr) <= 0.1).length;

 const avgFR = filtered.length ? +(filtered.reduce((s, e) => s + e.fr, 0) / filtered.length).toFixed(4) : 0;

 const posCount = filtered.filter(e => e.fr > 0).length;

 const dominance = posCount > filtered.length * 0.6 ? 'Longs dominant - watch for reversal'
 : posCount < filtered.length * 0.4 ? 'Shorts dominant - watch for squeeze' : 'Balanced market';
 const bestShort = [...filtered].filter(e => e.fr > 0).sort((a, b) => b.fr - a.fr)[0] || null;
 const bestLong = [...filtered].filter(e => e.fr < 0).sort((a, b) => a.fr - b.fr)[0] || null;
 const commandStrip = document.getElementById('fundingCommandStrip');
 if (commandStrip) {
 const card = (label, value, detail, tone) => `<div class="funding-command-card is-${reportsToneClass(tone)}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`;
 commandStrip.innerHTML = [
 card('Extreme Longs', String(extremePos), 'Longs crowded, short watchlist', extremePos ? 'bad' : 'good'),
 card('Extreme Shorts', String(extremeNeg), 'Shorts crowded, long watchlist', extremeNeg ? 'good' : 'info'),
 card('Market Bias', dominance.replace(' - ', ': '), `${filtered.length} symbols in current filter`, dominance.includes('Balanced') ? 'good' : 'warn'),
 card('Best Short Watch', bestShort ? bestShort.sym.replace(/USDT?$|USD$/, '') : '-', bestShort ? `Funding ${fundingDisplayRate(bestShort.fr)}` : 'No positive funding leader', bestShort ? 'bad' : 'info'),
 card('Best Long Watch', bestLong ? bestLong.sym.replace(/USDT?$|USD$/, '') : '-', bestLong ? `Funding ${fundingDisplayRate(bestLong.fr)}` : 'No negative funding leader', bestLong ? 'good' : 'info'),
 ].join('');
 }



 document.getElementById('frExPos').textContent = extremePos;

 document.getElementById('frExNeg').textContent = extremeNeg;

 document.getElementById('frHigh').textContent = highCount;

 document.getElementById('frTotal').textContent = filtered.length + ' coins';

 const avgEl = document.getElementById('frAvg');

 avgEl.textContent = fundingDisplayRate(avgFR);

 avgEl.style.color = avgFR > 0 ? '#ff4560' : avgFR < 0 ? '#00e5a0' : '#7a8ab0';

 const domEl = document.getElementById('frDominance');
 domEl.textContent = dominance;
 domEl.style.color = dominance.includes('Longs') ? '#ff1a40' : dominance.includes('Shorts') ? '#00e5a0' : '#7a8ab0';

 if (!filtered.some(e => e.sym === selectedFundingSymbol)) {
 selectedFundingSymbol = filtered[0]?.sym || '';
 }
 const selected = filtered.find(e => e.sym === selectedFundingSymbol);
 renderFundingDetail(selected, filtered, { dominance });



 // Grid

 cont.innerHTML = filtered.map(e => {

 const abs = Math.abs(e.fr);

 let cls;

 if (abs > 0.1) cls = e.fr > 0 ? 'fh-extreme-pos' : 'fh-extreme-neg';

 else if (abs > 0.05) cls = e.fr > 0 ? 'fh-high-pos' : 'fh-high-neg';

 else if (abs > 0.01) cls = e.fr > 0 ? 'fh-med-pos' : 'fh-med-neg';

 else if (abs > 0) cls = 'fh-low';

 else cls = 'fh-zero';



 const label = e.sym.replace(/USDT?$|USD$/, '');

 const frLabel = e.fr !== 0 ? fundingDisplayRate(e.fr) : (fundingAnnualized ? '0.0000% ann. stress' : '0.0000% / 8h');

 const tooltip = `${e.sym} | ${e.sector}\n${frLabel} funding` +
 (e.fr > 0 ? '\nLongs pay - overcrowded' : e.fr < 0 ? '\nShorts pay - overcrowded' : '\nBalanced');



 return `<div class="fh-cell ${cls} ${selectedFundingSymbol === e.sym ? 'selected' : ''}" data-symbol="${esc(e.sym)}" title="${tooltip}">

 <div class="fhc-sym">${label}</div>

 <div class="fhc-rate">${frLabel}</div>

 </div>`;

 }).join('');

}

document.addEventListener('input', (e) => {
 if (e.target?.id !== 'fundingSearchInput') return;
 fundingSearchQuery = String(e.target.value || '').trim();
 if (fundingView === 'arbitrage') renderFundingArbitrage();
 else renderFundingHeatmap();
});

document.addEventListener('click', (e) => {
 if (e.target?.id !== 'fundingAnnualToggle' && !e.target?.closest('#fundingAnnualToggle')) return;
 fundingAnnualized = !fundingAnnualized;
 if (fundingView === 'arbitrage') renderFundingArbitrage();
 else renderFundingHeatmap();
});



// -- Funding Arbitrage View (v14) ----------------------------------------------------------------

async function renderFundingArbitrage() {
 applyFundingViewMode('arbitrage');

 const d = await storeGet(['fundingArbitrage', 'watchlist', 'strategy']);
 setReportDisplayCurrency(d.strategy?.reportDisplayCurrency || 'USD');
 setReportDisplayUsdInrRate(d.strategy?.reportDisplayUsdInrRate || DEFAULT_REPORT_DISPLAY_USD_INR_RATE);

 const arb = d.fundingArbitrage;
 const watchlist = Array.isArray(d.watchlist) ? d.watchlist : [];

 const longsEl = document.getElementById('arbLongsPaying');

 const shortsEl = document.getElementById('arbShortsPaying');
 const searchEl = document.getElementById('fundingSearchInput');
 const annualBtn = document.getElementById('fundingAnnualToggle');

 if (searchEl && searchEl.value !== fundingSearchQuery) searchEl.value = fundingSearchQuery;
 if (annualBtn) {
 annualBtn.classList.toggle('active', fundingAnnualized);
 annualBtn.setAttribute('aria-pressed', fundingAnnualized ? 'true' : 'false');
 annualBtn.textContent = fundingAnnualized ? 'Ann. Stress' : '8h Rate';
 }



 if (!arb) {

 longsEl.innerHTML = '<div style="padding:10px;color:#3a4a6a;font-size:9px">No data - run a scan first</div>';

 shortsEl.innerHTML = '<div style="padding:10px;color:#3a4a6a;font-size:9px">No data - run a scan first</div>';

 return;

 }



 const buildRows = (list, isPos) => {

 const query = String(fundingSearchQuery || '').trim().toUpperCase();
 const visible = (Array.isArray(list) ? list : []).filter(e => {
 if (!query) return true;
 const symbol = String(e.sym || '').toUpperCase();
 const base = symbol.replace(/USDT?$|USD$/, '');
 const sector = String(e.sector || '').toUpperCase();
 return symbol.includes(query) || base.includes(query) || sector.includes(query);
 });

 if (!visible.length) return '<div style="padding:8px;color:#3a4a6a;font-size:9px">None found</div>';

 const head = `<div class="arb-table-head">

 <span class="arb-rank">#</span>

 <span class="arb-sym">Symbol</span>

 <span class="arb-rate ${isPos ? 'pos' : 'neg'}">Funding</span>

 <span class="arb-vol">24h Vol</span>

 <span class="arb-sector">Sector</span>

 <span class="arb-sector">Actions</span>

 </div>`;

 const rows = visible.map((e, idx) => {

 const label = e.sym.replace(/USDT?$|USD$/, '');

 const frStr = fundingDisplayRate(e.fr);
 const isWatching = watchlist.includes(e.sym);
 const reason = Number(e.vol || 0) >= 1000000
 ? 'High funding + liquid'
 : Number(e.vol || 0) >= 100000
 ? 'High funding, check liquidity'
 : 'Avoid size: low volume';

 return `<div class="arb-row">

 <span class="arb-rank">${idx + 1}</span>

 <span class="arb-sym">${label}</span>

 <span class="arb-rate ${isPos ? 'pos' : 'neg'}">${frStr}</span>

 <span class="arb-vol">${formatReportMoney(Number(e.vol || 0), 0, { compact: true })}</span>

 <span class="arb-sector">${e.sector}</span>

 <span class="arb-actions">
 <button class="arb-action-btn primary" data-arb-action="scanner" data-sym="${e.sym}">View in Scanner</button>
 <button class="arb-action-btn" data-arb-action="watch" data-sym="${e.sym}">${isWatching ? 'Watching' : 'Add Watchlist'}</button>
 </span>
 <span class="arb-reason">${esc(reason)}</span>

 </div>`;

 }).join('');

 return head + rows;

 };



 longsEl.innerHTML = buildRows(arb.extremePositive, true);

 shortsEl.innerHTML = buildRows(arb.extremeNegative, false);



 const guide = document.querySelector('#fundingArbView .arb-guide');

 if (guide) {

 const vol = Number.isFinite(+arb.minUsdVolume) ? `$${fmtLarge(+arb.minUsdVolume)}` : '$100K';

 guide.innerHTML = `<b>Guide:</b> +FR = crowded longs, -FR = crowded shorts, filtered to coins with USD vol >= ${vol}.`;

 }

 document.querySelectorAll('[data-arb-action="scanner"]').forEach(btn => {

 btn.addEventListener('click', () => {

 focusFundingSymbolInScanner(btn.dataset.sym);

 });

 });

 document.querySelectorAll('[data-arb-action="watch"]').forEach(btn => {

 btn.addEventListener('click', async () => {

 await addFundingSymbolToWatchlist(btn.dataset.sym);

 await renderFundingArbitrage();

 });

 });

}





// ----------------------------------------------------------------

// CSV EXPORT (v14)

// ----------------------------------------------------------------

async function renderCorrelationMatrix() {

 const cont = document.getElementById('corrWrap');

 if (!cont) return;

 const d = await storeGet(['correlationMatrix']);

 const c = d.correlationMatrix;

 if (!c || !Array.isArray(c.symbols) || c.symbols.length < 2 || !Array.isArray(c.matrix)) {

 cont.innerHTML = `<div class="empty"><div class="ei">--</div><div class="eh">No matrix yet</div>

 <div class="es">Run a scan or click Rebuild to generate correlations.</div></div>`;

 return;

 }

 const allSyms = c.symbols.slice(0, 20);

 const qRaw = document.getElementById('corrSearch')?.value?.trim() || '';

 const qUpper = qRaw.toUpperCase();

 const qBase = normalizeBaseSymbol(qRaw);



 let selectedIdx = allSyms.map((_, i) => i);

 if (qRaw) {

 selectedIdx = allSyms

 .map((s, i) => ({ s, i }))

 .filter(({ s }) => {

 const raw = String(s || '').toUpperCase();

 const disp = raw.replace(/USDT?$|USD$/, '');

 const base = normalizeBaseSymbol(raw);

 return raw.includes(qUpper) || disp.includes(qUpper) || (qBase && base.includes(qBase));

 })

 .map(x => x.i);



 // If one symbol matched, include strongest peers to keep matrix useful.

 if (selectedIdx.length === 1 && allSyms.length > 1) {

 const root = selectedIdx[0];

 const peers = allSyms

 .map((_, i) => ({ i, corr: Math.abs(Number(c.matrix[root]?.[i] ?? 0)) }))

 .filter(x => x.i !== root)

 .sort((a, b) => b.corr - a.corr)

 .slice(0, 7)

 .map(x => x.i);

 selectedIdx = [root, ...peers];

 }

 selectedIdx = [...new Set(selectedIdx)].slice(0, 20);

 }

 if (!selectedCorrSymbol) {
 selectedCorrSymbol = allSyms[selectedIdx[0]] || allSyms[0] || '';
 }

 if (corrQuickFilter !== 'all' && selectedCorrSymbol && allSyms.includes(selectedCorrSymbol)) {
 const root = allSyms.indexOf(selectedCorrSymbol);
 const candidateIdx = selectedIdx.includes(root) ? selectedIdx : [root, ...selectedIdx];
 const peers = candidateIdx
 .filter(i => i !== root)
 .map(i => ({ i, corr: Number(c.matrix[root]?.[i] ?? 0) }))
 .filter(x => corrQuickFilter === 'cluster' ? x.corr >= 0.65 : x.corr <= -0.45)
 .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))
 .slice(0, 12)
 .map(x => x.i);
 selectedIdx = [...new Set([root, ...peers])].slice(0, 20);
 }



 if (!selectedIdx.length) {

 const safeQuery = esc(qRaw);

 cont.innerHTML = `<div class="empty"><div class="ei">--</div><div class="eh">No symbol match</div>

 <div class="es">No correlation rows found for "${safeQuery}".</div></div>`;

 return;

 }



 const syms = selectedIdx.map(i => allSyms[i]);

 if (!syms.includes(selectedCorrSymbol)) {
 selectedCorrSymbol = syms[0] || '';
 }

 const matrix = selectedIdx.map(i => selectedIdx.map(j => Number(c.matrix[i]?.[j] ?? 0)));
 const selectedDisplayIdx = Math.max(0, syms.indexOf(selectedCorrSymbol));

 const isDesktopCorr = isDesktopMode && activeWorkspaceTab === 'corr';
 const labelWidth = isDesktopCorr ? 68 : 58;
 const minCell = isDesktopCorr ? 36 : 28;
 const maxCell = isDesktopCorr ? 64 : 54;
 const fitWidth = Math.floor((Math.max(320, cont.clientWidth) - labelWidth - (syms.length * 3)) / Math.max(1, syms.length));

 const cellSize = Math.max(minCell, Math.min(maxCell, fitWidth));

 const cols = `${labelWidth}px repeat(${syms.length}, ${cellSize}px)`;

 cont.style.setProperty('--corr-cols', cols);

 cont.style.setProperty('--corr-cell-size', `${cellSize}px`);

 const colorOf = (v) => {

 if (v >= 0) {

 const a = Math.min(0.85, Math.max(0.08, Math.abs(v)));

 return `rgba(0, 229, 160, ${a})`;

 }

 const a = Math.min(0.85, Math.max(0.08, Math.abs(v)));

 return `rgba(255, 69, 96, ${a})`;

 };

 const head = syms.map(s => `<button type="button" class="corr-head-symbol ${selectedCorrSymbol === s ? 'selected' : ''}" data-corr-symbol="${esc(s)}">${s.replace(/USDT?$|USD$/, '')}</button>`).join('');

 const rows = syms.map((s, i) => {

 const cells = syms.map((_, j) => {

 const v = Number(matrix[i]?.[j] ?? 0);

 const isSelectedAxis = selectedCorrSymbol === s || selectedCorrSymbol === syms[j];

 return `<button type="button" class="corr-cell ${isSelectedAxis ? 'selected-axis' : ''}" style="background:${colorOf(v)}" data-corr-symbol="${esc(s)}" title="${s} vs ${syms[j]} = ${v.toFixed(3)}">${v.toFixed(2)}</button>`;

 }).join('');

 return `<div class="corr-row ${selectedCorrSymbol === s ? 'selected-row' : ''}" style="grid-template-columns:var(--corr-cols)"><button type="button" class="corr-sym" data-corr-symbol="${esc(s)}">${s.replace(/USDT?$|USD$/, '')}</button>${cells}</div>`;

 }).join('');

 const filterMeta = qRaw ? ` | Filter: ${esc(qRaw.toUpperCase())} (${syms.length})` : '';
 const selectedPeers = syms
 .map((s, i) => ({ sym: s, corr: Number(matrix[selectedDisplayIdx]?.[i] ?? 0) }))
 .filter(x => x.sym !== selectedCorrSymbol)
 .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))
 .slice(0, 5);
 const highPeers = selectedPeers.filter(x => x.corr >= 0.65).length;
 const inversePeers = selectedPeers.filter(x => x.corr <= -0.45).length;
 const selectedLabel = selectedCorrSymbol ? selectedCorrSymbol.replace(/USDT?$|USD$/, '') : '-';
 const strongestPeer = selectedPeers[0] || null;
 const inversePeer = selectedPeers.find(x => x.corr <= -0.45) || null;
 const fundingForSelected = lastFundingEntries.find(item => item.sym === selectedCorrSymbol);
 const stackWarning = highPeers > 0
 ? `${highPeers} close peer${highPeers === 1 ? '' : 's'} can behave like one trade.`
 : 'No heavy positive cluster in this selection.';

 cont.innerHTML = `
 <div class="corr-risk-drawer" id="corrRiskDrawer">
 <div>
 <div class="research-detail-kicker">Basket Risk Detail</div>
 <div class="research-detail-title">${esc(selectedLabel)}</div>
 <div class="research-detail-line">${esc(stackWarning)}</div>
 </div>
 <div class="corr-drawer-grid">
 <div><span>Strongest peer</span><strong>${strongestPeer ? esc(strongestPeer.sym.replace(/USDT?$|USD$/, '')) : '-'}</strong><small>${strongestPeer ? strongestPeer.corr.toFixed(2) : 'No peer'}</small></div>
 <div><span>Inverse hedge</span><strong>${inversePeer ? esc(inversePeer.sym.replace(/USDT?$|USD$/, '')) : '-'}</strong><small>${inversePeer ? inversePeer.corr.toFixed(2) : 'No inverse candidate'}</small></div>
 <div><span>Funding state</span><strong>${fundingForSelected ? `${fundingForSelected.fr > 0 ? '+' : ''}${fundingForSelected.fr.toFixed(4)}%` : '-'}</strong><small>${fundingForSelected ? esc(fundingCrowdLabel(fundingForSelected.fr)) : 'Run funding scan'}</small></div>
 <div><span>Use</span><strong>${highPeers ? 'Reduce stacking' : 'Normal sizing'}</strong><small>Pair this read with Funding and VAR.</small></div>
 </div>
 </div>

 <div class="corr-meta corr-meta-modern">
 <span>Updated: ${new Date(c.updatedAt || Date.now()).toLocaleTimeString()}</span>
 <span>${c.resolution || '15m'}</span>
 <span>${c.candles || 100} candles${filterMeta}</span>
 <span>Selected: ${esc(selectedLabel)}</span>
 </div>

 <div class="corr-filter-row" id="corrFilterRow">
 <button class="corr-filter-btn ${corrQuickFilter === 'all' ? 'active' : ''}" data-corr-filter="all">All pairs</button>
 <button class="corr-filter-btn ${corrQuickFilter === 'cluster' ? 'active' : ''}" data-corr-filter="cluster">Strong cluster</button>
 <button class="corr-filter-btn ${corrQuickFilter === 'inverse' ? 'active' : ''}" data-corr-filter="inverse">Inverse hedge</button>
 <button class="corr-filter-btn" data-corr-open-funding data-sym="${esc(selectedCorrSymbol)}">Funding link</button>
 <div class="corr-risk-note">${highPeers ? `${highPeers} close peers for ${esc(selectedLabel)}` : 'No heavy cluster on selected symbol'}${inversePeers ? ` | ${inversePeers} inverse hedge candidates` : ''}</div>
 </div>

 <div class="corr-selected-panel">
 <div>
 <div class="research-detail-kicker">Selected Basket Risk</div>
 <div class="research-detail-title">${esc(selectedLabel)}</div>
 </div>
 <div class="corr-peer-list">
 ${selectedPeers.map(p => `<button class="corr-peer ${p.corr < 0 ? 'inverse' : 'direct'}" data-corr-symbol="${esc(p.sym)}">
 <span>${esc(p.sym.replace(/USDT?$|USD$/, ''))}</span><strong>${p.corr.toFixed(2)}</strong>
 </button>`).join('')}
 </div>
 </div>

 <div class="corr-head" style="grid-template-columns:var(--corr-cols)"><span></span>${head}</div>

 <div class="corr-grid">${rows}</div>

 `;

}



document.getElementById('btnRefreshCorr')?.addEventListener('click', () => {

 const btn = document.getElementById('btnRefreshCorr');

 if (btn) { btn.disabled = true; btn.textContent = 'Building...'; }

 chrome.runtime.sendMessage({ action: 'buildCorrelationMatrix' }, async () => {
 void chrome.runtime?.lastError;
 await renderCorrelationMatrix();
 if (btn) { btn.disabled = false; btn.textContent = 'Refresh Rebuild'; }
 });

});



document.getElementById('corrSearch')?.addEventListener('input', () => {

 renderCorrelationMatrix();

});



window.addEventListener('resize', () => {

 if (document.getElementById('pane-corr')?.classList.contains('active')) {

 renderCorrelationMatrix();

 }

});



document.getElementById('btnCSV')?.addEventListener('click', () => {

 chrome.runtime.sendMessage({ action: 'exportCSV', target: 'scan' }, resp => {

 if (!resp?.ok || !resp.csv) {

 console.warn('[DS15] CSV export failed:', resp?.error || 'no data');

 return;

 }

 const blob = new Blob([resp.csv], { type: 'text/csv' });

 const url = URL.createObjectURL(blob);

 const a = document.createElement('a');

 a.href = url;

 a.download = `fwd_tradedesk_pro_backtest_${new Date().toISOString().slice(0, 10)}.csv`;

 a.click();

 URL.revokeObjectURL(url);

 console.log(`[DS15] CSV exported: ${resp.count} signals`);

 });

});





// ----------------------------------------------------------------

// LEGACY POP-OUT -> DESKTOP REDIRECT

// ----------------------------------------------------------------

document.getElementById('btnPopOut')?.addEventListener('click', () => {

 chrome.runtime.sendMessage({ action: 'openDesktopApp' });

});





// ----------------------------------------------------------------

// SCAN & AUTO-SCAN BUTTONS

// ----------------------------------------------------------------

document.getElementById('btnScan')?.addEventListener('click', async () => {

 if (scanning) return;

 scanning = true;

 document.getElementById('btnScan').disabled = true;

 document.getElementById('sdot').className = 'sdot pulse';

 document.getElementById('stxt').textContent = 'Starting scan...';

 document.getElementById('progwrap').style.display = 'block';

 chrome.runtime.sendMessage({ action: 'startScan' }, resp => {
 if (chrome.runtime.lastError) {
 document.getElementById('stxt').textContent = 'Scan error: background not ready';
 document.getElementById('btnScan').disabled = false;
 scanning = false;
 return;
 }
 if (!resp?.ok) {
 document.getElementById('stxt').textContent = 'Scan error: ' + (resp?.error || 'unknown');
 document.getElementById('btnScan').disabled = false;
 scanning = false;
 }
 });

});



function loadAutoScanState() {

 chrome.storage.local.get(['autoScan', 'autoScanInterval', 'strategy'], d => {

 const on = d.autoScan ?? d.strategy?.autoScan ?? false;

 const interval = sanitizeAutoScanInterval(d.autoScanInterval ?? d.strategy?.autoScanInterval);

 const btn = document.getElementById('btnAutoScan');

 btn.textContent = on ? `Auto ${interval}m On` : 'Auto Off';

 btn.classList.toggle('active', on);

 });

}



function loadAutoTradeState() {
 chrome.storage.local.get(['autoTrade', 'autoTradeLastSkipReason', 'autoTradeDailyCount', 'autoTradeDailyCountResetTs', 'autoTradeSettings', 'autoTradeLog', 'autoTradeDecisionAuditV16'], d => {
 const on = d.autoTrade ?? false;
 const btn = document.getElementById('btnAutoTrade');
 if (!btn) return;
 btn.textContent = on ? 'Auto Trade On' : 'Auto Trade Off';
 btn.classList.toggle('active', on);
 btn.style.borderColor = on ? '#ff6b6b' : '';
 const reverseBtn = document.getElementById('btnAutoTradeReverse');
 const reverseOn = !!d.autoTradeSettings?.reverseSignals;
 if (reverseBtn) {
 reverseBtn.textContent = reverseOn ? 'Reverse On' : 'Reverse Off';
 reverseBtn.classList.toggle('active', reverseOn);
 reverseBtn.title = reverseOn
 ? 'Futures auto-trade will place the opposite side of each scanner signal.'
 : 'Futures auto-trade will follow the scanner signal side.';
 }
 // Show skip reason if auto-trade is on but blocked
 let reasonEl = document.getElementById('autoTradeSkipReason');
 if (!reasonEl) {
 reasonEl = document.createElement('div');
 reasonEl.id = 'autoTradeSkipReason';
 reasonEl.className = 'auto-trade-safety-reason';
 btn.parentElement?.appendChild(reasonEl);
 }
 let reason = String(d.autoTradeLastSkipReason || '').trim();
 if (/^max (?:per day|daily attempts|trades per day) reached:/i.test(reason)) {
 const todayMidnight = new Date().setHours(0, 0, 0, 0);
 const maxPerDay = Number(d.autoTradeSettings?.maxPerDay || 0);
 const resetTs = Number(d.autoTradeDailyCountResetTs || 0);
 const storedDailyCount = resetTs < todayMidnight ? 0 : Number(d.autoTradeDailyCount || 0);
 const successfulTradesToday = (Array.isArray(d.autoTradeLog) ? d.autoTradeLog : []).filter(entry => {
 const ts = Number(entry?.ts || 0);
 if (ts < todayMidnight) return false;
 if (String(entry?.status || '').toLowerCase() === 'failed') return false;
 return !!(
 String(entry?.orderId || '').trim()
 || String(entry?.clientOrderId || '').trim()
 || Number(entry?.positionSeenAt || 0) > 0
 );
 }).length;
 const effectiveDailyCount = Math.min(storedDailyCount, successfulTradesToday || storedDailyCount);
 if (!(maxPerDay > 0 && effectiveDailyCount >= maxPerDay)) {
 reason = '';
 } else {
 reason = `Max trades per day reached: ${effectiveDailyCount}/${maxPerDay}`;
 }
 }
 const audit = d.autoTradeDecisionAuditV16 || {};
 const auditStatus = String(audit.status || '').trim().toLowerCase();
 if (!reason && on) {
 if (auditStatus && !['placed', 'no_place'].includes(auditStatus) && String(audit.reason || '').trim()) {
 reason = String(audit.reason || '').trim();
 }
 }
 if (!reason && on && auditStatus === 'last_engine_block') {
 const updatedAt = Number(audit.updatedAt || 0);
 if (updatedAt > 0 && (Date.now() - updatedAt) <= (5 * 60 * 1000)) {
 reason = `Last engine block: ${String(audit.lastBlockedReason || audit.reason || 'slot block cleared').trim()}`;
 }
 }
 if (/^max concurrent reached:/i.test(reason)) {
 const auditOpenCount = Number(audit.openCount || 0);
 const auditMaxConcurrent = Number(audit.maxConcurrent || d.autoTradeSettings?.maxConcurrent || 0);
 if (auditMaxConcurrent > 0 && (auditStatus !== 'blocked_concurrent' || auditOpenCount < auditMaxConcurrent)) {
 reason = '';
 } else {
 reason = reason.replace(
 /^Max concurrent reached:\s*/i,
 'Max concurrent reached: '
 );
 if (!/reduce-only exits/i.test(reason)) {
 reason += ' Current open exposure counts live positions plus pending/open entry orders; reduce-only exits do not count.';
 }
 }
 }
 const tone = auditStatus === 'last_engine_block' ? '#ffc840' : '#ff6b6b';
 reasonEl.textContent = on && reason ? '\u26a0 ' + reason : '';
 reasonEl.title = on && reason ? reason : '';
 reasonEl.classList.toggle('warn', tone === '#ffc840');
 reasonEl.style.display = on && reason ? 'block' : 'none';
 });
}

document.getElementById('btnAutoTrade')?.addEventListener('click', async () => {
 const d = await storeGet(['autoTrade']);
 const newState = !(d.autoTrade ?? false);
 if (newState && !confirm('\u26a0\ufe0f AUTO TRADE will place REAL orders on Delta Exchange automatically when signals qualify.\n\nMake sure your API keys are set and risk limits are configured in Settings.\n\nEnable auto-trade?')) return;
 chrome.storage.local.set({ autoTrade: newState }, () => {
 chrome.runtime.sendMessage({ action: 'toggleAutoTrade', enable: newState }, () => {
 void chrome.runtime?.lastError;
 loadAutoTradeState();
 });
 });
});

document.getElementById('btnAutoTradeReverse')?.addEventListener('click', async () => {
 const sanitizeAutoTradeSettingsFn = typeof globalThis.FWDTradeDeskShared?.sanitizeAutoTradeSettings === 'function'
 ? globalThis.FWDTradeDeskShared.sanitizeAutoTradeSettings
 : (value => value || {});
 const d = await storeGet(['autoTradeSettings']);
 const current = sanitizeAutoTradeSettingsFn(d.autoTradeSettings || {});
 const nextSettings = sanitizeAutoTradeSettingsFn({
 ...current,
 reverseSignals: !current.reverseSignals,
 });
 chrome.storage.local.set({ autoTradeSettings: nextSettings }, () => {
 void chrome.runtime?.lastError;
 const settingsToggle = document.getElementById('sAutoTradeReverseSignals');
 if (settingsToggle) settingsToggle.checked = !!nextSettings.reverseSignals;
 if (typeof showSystemToast === 'function') {
 showSystemToast(
 'Auto-trade reverse mode',
 nextSettings.reverseSignals
 ? 'Live futures auto-trade will place the opposite side of scanner signals.'
 : 'Live futures auto-trade will follow scanner signal direction.',
 'success',
 2600
 );
 }
 loadAutoTradeState();
 });
});

document.getElementById('btnAutoScan')?.addEventListener('click', async () => {

 const d = await storeGet(['autoScan', 'autoScanInterval', 'strategy']);

 const current = d.autoScan ?? d.strategy?.autoScan ?? false;

 const newState = !current;

 const interval = sanitizeAutoScanInterval(d.autoScanInterval ?? d.strategy?.autoScanInterval);

 chrome.runtime.sendMessage({ action: 'toggleAutoScan', enable: newState, interval }, resp => {

 const safeInterval = sanitizeAutoScanInterval(resp?.interval ?? interval);

 const btn = document.getElementById('btnAutoScan');

 btn.textContent = newState ? `Auto ${safeInterval}m On` : 'Auto Off';

 btn.classList.toggle('active', newState);

 });

});





// ----------------------------------------------------------------

// BACKTEST TAB

// ----------------------------------------------------------------

// Use event delegation so btnRunBT works even when injected after script load (lazy pane loading)
document.addEventListener('click', (e) => {
 if (e.target?.id === 'btnRunBT' || e.target?.closest('#btnRunBT')) {
 const sym = document.getElementById('btSymbol')?.value?.trim().toUpperCase();
 if (sym) runBT(sym);
 return;
 }
 const btqBtn = e.target?.closest('.btq');
 if (btqBtn) {
 const symInput = document.getElementById('btSymbol');
 if (symInput) symInput.value = btqBtn.dataset.sym;
 runBT(btqBtn.dataset.sym);
 return;
 }
 const presetBtn = e.target?.closest('[data-bt-preset]');
 if (presetBtn) {
 applyBacktestPreset(presetBtn.dataset.btPreset || 'scanner');
 }
});

function applyBacktestPreset(preset = 'scanner') {
 const safePreset = ['scanner', 'funding', 'breakout', 'mean_reversion'].includes(String(preset || '')) ? String(preset) : 'scanner';
 const strategy = document.getElementById('btStrategyPreset');
 const direction = document.getElementById('btDirection');
 const minScore = document.getElementById('btMinScore');
 const lookback = document.getElementById('btLookbackDays');
 if (strategy) strategy.value = safePreset;
 if (safePreset === 'funding') {
 if (direction) direction.value = 'both';
 if (minScore) minScore.value = '70';
 if (lookback) lookback.value = '300';
 } else if (safePreset === 'breakout') {
 if (direction) direction.value = 'long';
 if (minScore) minScore.value = '78';
 if (lookback) lookback.value = '500';
 } else if (safePreset === 'mean_reversion') {
 if (direction) direction.value = 'both';
 if (minScore) minScore.value = '76';
 if (lookback) lookback.value = '360';
 } else {
 if (direction) direction.value = 'both';
 if (minScore) minScore.value = '';
 if (lookback) lookback.value = '500';
 }
 document.querySelectorAll('[data-bt-preset]').forEach(button => button.classList.toggle('active', button.dataset.btPreset === safePreset));
}



function runBT(sym) {
 const shared = globalThis.FWDTradeDeskShared || {};
 const sanitizeAutoTradeSettingsFn = typeof shared.sanitizeAutoTradeSettings === 'function'
 ? shared.sanitizeAutoTradeSettings
 : (value => value || {});
 const sanitizeBacktestMinScoreFn = typeof shared.sanitizeBacktestMinScore === 'function'
 ? shared.sanitizeBacktestMinScore
 : ((value, fallback = 75) => Number.isFinite(Number(value)) ? Number(value) : fallback);
 const sanitizeBacktestLookbackDaysFn = typeof shared.sanitizeBacktestLookbackDays === 'function'
 ? shared.sanitizeBacktestLookbackDays
 : ((value, fallback = 500) => Number.isFinite(Number(value)) ? Number(value) : fallback);

 const btn = document.getElementById('btnRunBT');
 const resultEl = document.getElementById('btResult');

 if (!btn || !resultEl) {
 if (sym) {
 globalThis.prepareBacktestPane?.(sym);
 }
 return;
 }

 btn.disabled = true;
 btn.textContent = 'Running...';
 const requestConfig = () => new Promise(resolve => {
 try {
 if (typeof storeGet === 'function') {
 storeGet(['autoTradeSettings']).then(resolve).catch(() => resolve({}));
 return;
 }
 chrome.storage.local.get(['autoTradeSettings'], resolve);
 } catch (_) {
 resolve({});
 }
 });

 requestConfig().then(stored => {
 const autoTradeSettings = sanitizeAutoTradeSettingsFn(stored?.autoTradeSettings || {});
 const minScoreInput = document.getElementById('btMinScore');
 const lookbackInput = document.getElementById('btLookbackDays');
 const strategyPreset = String(document.getElementById('btStrategyPreset')?.value || 'scanner');
 const direction = String(document.getElementById('btDirection')?.value || 'both');
 const feesPct = Number(document.getElementById('btFeesPct')?.value || 0.059);
 const slippagePct = Number(document.getElementById('btSlippagePct')?.value || 0.10);
 const minScore = sanitizeBacktestMinScoreFn(
 minScoreInput?.value !== '' ? minScoreInput?.value : autoTradeSettings.backtestSignalMinScore,
 autoTradeSettings.minScore || 75
 );
 const lookbackDays = sanitizeBacktestLookbackDaysFn(lookbackInput?.value || autoTradeSettings.backtestLookbackDays, 500);
 resultEl.innerHTML = `<div class="bt-empty-launch loading"><div><span>Running</span><strong>Backtesting ${sym}</strong><small>Preset ${strategyPreset} | Direction ${direction} | Score >= ${minScore} | Lookback ${lookbackDays} days | Stop sweep enabled</small></div><div class="bt-skeleton-grid"><i></i><i></i><i></i></div></div>`;
 resultEl.scrollTop = 0;
 chrome.runtime.sendMessage({ action: 'runBacktest', symbol: sym, minScore, lookbackDays, includeStopSweep: true, strategyPreset, direction, feePctPerSide: feesPct, slippagePctPerSide: slippagePct }, resp => {
 const runtimeError = chrome.runtime?.lastError;
 const liveBtn = document.getElementById('btnRunBT');
 const liveResult = document.getElementById('btResult');
 if (liveBtn) {
 liveBtn.disabled = false;
 liveBtn.textContent = 'RUN TEST';
 }
 if (runtimeError) {
 lastBacktestResult = null;
 if (liveResult) {
 liveResult.innerHTML = `<div class="empty"><div class="ei">X</div><div class="eh">Backtest failed</div><div class="es">${runtimeError.message || 'Background runtime is unavailable.'}</div></div>`;
 liveResult.scrollTop = 0;
 }
 return;
 }
 if (!resp?.ok) {
 lastBacktestResult = null;
 if (liveResult) {
 liveResult.innerHTML = `<div class="empty"><div class="ei">X</div><div class="eh">Error</div><div class="es">${resp?.error || 'Unknown'}</div></div>`;
 liveResult.scrollTop = 0;
 }
 return;
 }
 lastBacktestResult = resp.result?.error ? null : resp.result;
 renderBTResult(resp.result);
 document.getElementById('btResult')?.scrollTo({ top: 0, behavior: 'smooth' });
 });
 }).catch(error => {
 const liveBtn = document.getElementById('btnRunBT');
 const liveResult = document.getElementById('btResult');
 if (liveBtn) {
 liveBtn.disabled = false;
 liveBtn.textContent = 'RUN TEST';
 }
 lastBacktestResult = null;
 if (liveResult) {
 liveResult.innerHTML = `<div class="empty"><div class="ei">X</div><div class="eh">Backtest failed</div><div class="es">${error?.message || 'Unable to start the background backtest.'}</div></div>`;
 liveResult.scrollTop = 0;
 }
 });
 return;
 /*

 btn.disabled = true; btn.textContent = 'Running...';

 document.getElementById('btResult').innerHTML = `<div class="empty"><div class="ei">...</div><div class="eh">Backtesting ${sym}...</div><div class="es">Min score filter: >= ${minScore}</div></div>`;

 chrome.runtime.sendMessage({ action: 'runBacktest', symbol: sym, minScore }, resp => {

 btn.disabled = false; btn.textContent = 'RUN TEST';

 if (!resp?.ok) {

 lastBacktestResult = null;

 document.getElementById('btResult').innerHTML = `<div class="empty"><div class="ei">X</div><div class="eh">Error</div><div class="es">${resp?.error || 'Unknown'}</div></div>`;

 return;

 }

 lastBacktestResult = resp.result?.error ? null : resp.result;

 renderBTResult(resp.result);
 });
 */
}



function renderBTResult(r) {

 lastBacktestResult = r?.error ? null : r;
 const resultEl = document.getElementById('btResult');
 if (!resultEl) return;

 if (r.error) {

 const auditRejectRows = (r?.audit?.rejectedByReason || []).slice(0, 5).map(item => `
 <div class="bt-trade-row">
 <span class="btr-date">${String(item?.reason || '').replace(/_/g, ' ')}</span>
 <span class="btr-dir short">Reject</span>
 <span class="btr-entry">${Number(item?.count || 0)} bars</span>
 <span class="btr-entry">--</span>
 <span class="btr-pnl loss">--</span>
 <span class="btr-out">Top blocker</span>
 </div>`).join('');
 document.getElementById('btResult').innerHTML = `<div class="empty"><div class="ei">!</div><div class="eh">No Results</div><div class="es">${r.error}</div></div>${auditRejectRows ? `<div class="bt-section-head bt-section-head--trades"><div class="bt-trades-title">TOP REJECTS</div><div class="bt-section-meta">${Number(r?.audit?.attemptedBars || 0)} bars checked</div></div><div class="bt-trade-list">${auditRejectRows}</div>` : ''}`;

 return;

 }

 const s = r.summary;
 const symbol = String(r.symbol || document.getElementById('btSymbol')?.value || 'Symbol').toUpperCase();

 const cfg = r.config || { minScore: 75, stopVariantLabel: 'ATR 1.5', exitModel: 'target_ladder_auto_shift', feePctPerSide: 0.059, slippagePctPerSide: 0.1, cooldownBars: 5 };
 const stopSweep = r.stopSweep && typeof r.stopSweep === 'object' ? r.stopSweep : null;
 const audit = r.audit && typeof r.audit === 'object' ? r.audit : {};

 const wrColor = s.winRate >= 55 ? 'green' : s.winRate >= 45 ? 'blue' : 'red';

 const pfColor = s.profitFactor >= 1.5 ? 'green' : s.profitFactor >= 1 ? 'blue' : 'red';

 const pnlColor = s.totalPnl >= 0 ? 'green' : 'red';

 const eqSVG = buildEquityCurve(r.equity || []);
 const ddSVG = buildDrawdownCurve(r.equity || []);
 const verdict = Number(s.totalTrades || 0) < 6
 ? { label: 'Not enough sample', tone: 'warn', detail: 'Collect at least 6 trades before trusting the result.' }
 : Number(s.profitFactor || 0) >= 1.25 && Number(s.expectancy || 0) > 0 && Number(s.maxDD || 0) <= 12
 ? { label: 'Tradable', tone: 'good', detail: 'Positive expectancy with controlled drawdown.' }
 : Number(s.expectancy || 0) > 0
 ? { label: 'Paper only', tone: 'warn', detail: 'Edge exists, but needs more forward validation.' }
 : { label: 'Avoid', tone: 'bad', detail: 'Backtest does not justify promotion.' };
 const scorecardTone = s.totalPnl >= 0 ? 'profit' : 'loss';
 const stopSweepRows = (stopSweep?.variants || []).map(variant => {
 const summary = variant?.summary || {};
 const dd = Number(summary?.maxDD || 0);
 const expectancy = Number(summary?.expectancy || 0);
 const pf = Number(summary?.profitFactor || 0);
 const isRecommended = stopSweep?.recommended?.key === variant?.variant;
 const status = variant?.error
 ? 'No data'
 : isRecommended
 ? 'Recommended'
 : 'Compared';
 return `
 <div class="bt-trade-row">
 <span class="btr-date">${variant?.label || variant?.variant || '--'}</span>
 <span class="btr-dir ${isRecommended ? 'long' : 'short'}">${status}</span>
 <span class="btr-entry">${Number(summary?.totalTrades || 0)} trades</span>
 <span class="btr-entry">PF ${pf === 999 ? 'INF' : pf.toFixed(2)}</span>
 <span class="btr-pnl ${expectancy >= 0 ? 'win' : 'loss'}">${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)}%</span>
 <span class="btr-out">DD ${dd.toFixed(2)}%</span>
 </div>`;
 }).join('');
 const stopSweepMarkup = stopSweep?.variants?.length
 ? `
 <div class="bt-section-head bt-section-head--trades">
 <div class="bt-trades-title">STOP SWEEP</div>
 <div class="bt-section-meta">${stopSweep?.comparedOn?.join(' | ') || 'expectancy | PF | maxDD | totalPnl'}</div>
 </div>
 <div class="bt-hero-grid">
 <div class="bt-hero-card">
 <div class="bt-hero-label">Recommended Stop</div>
 <div class="bt-hero-value ${stopSweep?.recommended?.summary?.expectancy >= 0 ? 'green' : 'red'}">${stopSweep?.recommended?.label || 'N/A'}</div>
 <div class="bt-hero-sub">${stopSweep?.recommended?.rationale || 'No recommendation available'}</div>
 </div>
 </div>
 <div class="bt-trade-list">
 ${stopSweepRows}
 </div>`
 : '';
 const auditRejectRows = (audit?.rejectedByReason || []).slice(0, 6).map(item => `
 <div class="bt-trade-row">
 <span class="btr-date">${esc(String(item?.reason || '').replace(/_/g, ' '))}</span>
 <span class="btr-dir short">Reject</span>
 <span class="btr-entry">${Number(item?.count || 0)} bars</span>
 <span class="btr-entry">--</span>
 <span class="btr-pnl loss">--</span>
 <span class="btr-out">Filter</span>
 </div>`).join('');
 const auditFamilyRows = Object.values(audit?.bySetupFamily || {})
 .sort((a, b) => Number(b?.summary?.totalTrades || 0) - Number(a?.summary?.totalTrades || 0))
 .slice(0, 6)
 .map(entry => `
 <div class="bt-trade-row">
 <span class="btr-date">${esc(String(entry?.label || entry?.key || 'Unknown'))}</span>
 <span class="btr-dir ${Number(entry?.summary?.expectancy || 0) >= 0 ? 'long' : 'short'}">${Number(entry?.summary?.totalTrades || 0)} trades</span>
 <span class="btr-entry">WR ${Number(entry?.summary?.winRate || 0).toFixed(1)}%</span>
 <span class="btr-entry">Exp ${Number(entry?.summary?.expectancy || 0) >= 0 ? '+' : ''}${Number(entry?.summary?.expectancy || 0).toFixed(2)}%</span>
 <span class="btr-pnl ${Number(entry?.summary?.totalPnl || 0) >= 0 ? 'win' : 'loss'}">${Number(entry?.summary?.totalPnl || 0) >= 0 ? '+' : ''}${Number(entry?.summary?.totalPnl || 0).toFixed(2)}%</span>
 <span class="btr-out">Family</span>
 </div>`).join('');
 const auditRegimeRows = Object.values(audit?.byRegime || {})
 .sort((a, b) => Number(b?.summary?.totalTrades || 0) - Number(a?.summary?.totalTrades || 0))
 .slice(0, 4)
 .map(entry => `
 <div class="bt-trade-row">
 <span class="btr-date">${esc(String(entry?.label || entry?.key || 'UNKNOWN'))}</span>
 <span class="btr-dir ${Number(entry?.summary?.expectancy || 0) >= 0 ? 'long' : 'short'}">${Number(entry?.summary?.totalTrades || 0)} trades</span>
 <span class="btr-entry">WR ${Number(entry?.summary?.winRate || 0).toFixed(1)}%</span>
 <span class="btr-entry">Avg MFE ${Number(entry?.summary?.avgMfe || 0).toFixed(2)}%</span>
 <span class="btr-pnl ${Number(entry?.summary?.totalPnl || 0) >= 0 ? 'win' : 'loss'}">${Number(entry?.summary?.totalPnl || 0) >= 0 ? '+' : ''}${Number(entry?.summary?.totalPnl || 0).toFixed(2)}%</span>
 <span class="btr-out">Regime</span>
 </div>`).join('');
 const auditMarkup = (auditRejectRows || auditFamilyRows || auditRegimeRows)
 ? `
 <div class="bt-section-head bt-section-head--trades">
 <div class="bt-trades-title">AUDIT</div>
 <div class="bt-section-meta">${Number(audit?.attemptedBars || 0)} bars checked | ${Number(audit?.qualifiedSignals || 0)} live-style entries qualified</div>
 </div>
 <div class="bt-hero-grid">
 <div class="bt-hero-card">
 <div class="bt-hero-label">Bars Checked</div>
 <div class="bt-hero-value blue">${Number(audit?.attemptedBars || 0)}</div>
 <div class="bt-hero-sub">${Number(audit?.qualifiedSignals || 0)} entries reached the simulator</div>
 </div>
 <div class="bt-hero-card">
 <div class="bt-hero-label">Avg Spread Penalty</div>
 <div class="bt-hero-value ${Number(s.avgEstimatedSpreadPct || 0) <= 0.12 ? 'green' : Number(s.avgEstimatedSpreadPct || 0) <= 0.22 ? 'blue' : 'red'}">${Number(s.avgEstimatedSpreadPct || 0).toFixed(2)}%</div>
 <div class="bt-hero-sub">Extra slippage ${Number(s.avgExtraSlippagePct || 0).toFixed(2)}% per side on average</div>
 </div>
 </div>
 ${auditRejectRows ? `<div class="bt-section-head bt-section-head--trades"><div class="bt-trades-title">TOP REJECTS</div><div class="bt-section-meta">Why candidate bars did not become simulated trades</div></div><div class="bt-trade-list">${auditRejectRows}</div>` : ''}
 ${auditFamilyRows ? `<div class="bt-section-head bt-section-head--trades"><div class="bt-trades-title">SETUP FAMILIES</div><div class="bt-section-meta">Trade results grouped by setup family</div></div><div class="bt-trade-list">${auditFamilyRows}</div>` : ''}
 ${auditRegimeRows ? `<div class="bt-section-head bt-section-head--trades"><div class="bt-trades-title">REGIME SPLIT</div><div class="bt-section-meta">Trade results grouped by regime</div></div><div class="bt-trade-list">${auditRegimeRows}</div>` : ''}`
 : '';

 const tradeRows = (r.trades || []).slice(0, 40).map(t => {

 const pnlClass = Number(t.pnlPct || 0) >= 0 ? 'win' : 'loss';

 const outcomeLabel = t.outcome === 'take_profit'

 ? 'TP'

 : t.outcome === 'breakeven'

 ? 'BE'

 : t.outcome === 'stop_loss'

 ? 'SL'

 : 'EXP';

 return `

 <div class="bt-trade-row">

 <span class="btr-date">${t.date}</span>

 <span class="btr-dir ${t.dir}">${t.dir.toUpperCase()}</span>

 <span class="btr-entry">$${fmtPrice(t.entry)}</span>

 <span class="btr-entry">$${fmtPrice(t.exit)}</span>

 <span class="btr-pnl ${pnlClass}">${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct}%</span>

 <span class="btr-out">${outcomeLabel} | ${t.barsHeld}d</span>

 </div>`;

 }).join('');



 document.getElementById('btResult').innerHTML = `

 <div class="bt-result-shell">
 <div class="bt-verdict-card is-${verdict.tone}">
 <div>
 <span>Backtest Verdict</span>
 <strong>${verdict.label}</strong>
 <small>${verdict.detail}</small>
 </div>
 <div class="bt-verdict-metrics">
 <span>PF ${s.profitFactor === 999 ? 'INF' : s.profitFactor}</span>
 <span>Exp ${s.expectancy >= 0 ? '+' : ''}${s.expectancy}%</span>
 <span>DD ${s.maxDD}%</span>
 </div>
 </div>
 <div class="bt-run-strip">
 <div class="bt-run-pill">
 <span>Symbol</span>
 <strong>${symbol}</strong>
 </div>
 <div class="bt-run-pill">
 <span>Min score</span>
 <strong>${cfg.minScore}</strong>
 </div>
 <div class="bt-run-pill">
 <span>Lookback</span>
 <strong>${Number(cfg.lookbackDays || 500)} days</strong>
 </div>
 <div class="bt-run-pill">
 <span>Trade management</span>
 <strong>${cfg.stopVariantLabel || 'Live stop model'} | ${cfg.exitModel === 'target_ladder_auto_shift' ? 'auto-shift target ladder' : cfg.exitModel || 'managed exits'}</strong>
 </div>
 <div class="bt-run-pill">
 <span>Execution realism</span>
 <strong>${cfg.feePctPerSide}% fee + ${cfg.slippagePctPerSide}% base slippage | avg spread ${Number(cfg.avgEstimatedSpreadPct || s.avgEstimatedSpreadPct || 0).toFixed(2)}% | ${cfg.cooldownBars} bar cooldown</strong>
 </div>
 </div>

 <div class="bt-hero-grid">
 <div class="bt-hero-card bt-hero-card--${scorecardTone}">
 <div class="bt-hero-label">Net P&amp;L</div>
 <div class="bt-hero-value ${pnlColor}">${s.totalPnl >= 0 ? '+' : ''}${s.totalPnl}%</div>
 <div class="bt-hero-sub">${s.totalTrades} trades | ${s.longTrades} long | ${s.shortTrades} short</div>
 </div>
 <div class="bt-hero-card">
 <div class="bt-hero-label">Win Rate</div>
 <div class="bt-hero-value ${wrColor}">${s.winRate}%</div>
 <div class="bt-hero-sub">${s.wins || 0} wins | ${s.losses || 0} losses | ${s.breakevenPct}% breakeven</div>
 </div>
 <div class="bt-hero-card">
 <div class="bt-hero-label">Expectancy</div>
 <div class="bt-hero-value ${s.expectancy >= 0 ? 'green' : 'red'}">${s.expectancy >= 0 ? '+' : ''}${s.expectancy}%</div>
 <div class="bt-hero-sub">PF ${s.profitFactor === 999 ? 'INF' : s.profitFactor} | Max DD ${s.maxDD}%</div>
 </div>
 <div class="bt-hero-card">
 <div class="bt-hero-label">Cost Drag</div>
 <div class="bt-hero-value ${s.totalFundingPct >= 0 ? 'blue' : 'red'}">${s.totalFundingPct >= 0 ? '+' : ''}${s.totalFundingPct}%</div>
 <div class="bt-hero-sub">Fees -${s.totalFeesPct}% | Avg funding ${s.avgFundingPct >= 0 ? '+' : ''}${s.avgFundingPct}%</div>
 </div>
 </div>

 <div class="bt-summary">

 <div class="bt-stat"><div class="bsl">TOTAL TRADES</div><div class="bsv blue">${s.totalTrades}</div></div>

 <div class="bt-stat"><div class="bsl">WIN RATE</div><div class="bsv ${wrColor}">${s.winRate}%</div></div>

 <div class="bt-stat"><div class="bsl">PROFIT FACTOR</div><div class="bsv ${pfColor}">${s.profitFactor === 999 ? 'INF' : s.profitFactor}</div></div>

 <div class="bt-stat"><div class="bsl">TOTAL PNL %</div><div class="bsv ${pnlColor}">${s.totalPnl >= 0 ? '+' : ''}${s.totalPnl}%</div></div>

 <div class="bt-stat"><div class="bsl">AVG WIN</div><div class="bsv green">+${s.avgWin}%</div></div>

 <div class="bt-stat"><div class="bsl">AVG LOSS</div><div class="bsv red">${s.avgLoss}%</div></div>

 <div class="bt-stat"><div class="bsl">MAX DRAWDOWN</div><div class="bsv red">${s.maxDD}%</div></div>

 <div class="bt-stat"><div class="bsl">LONGS</div><div class="bsv green">${s.longTrades}</div></div>

 <div class="bt-stat"><div class="bsl">SHORTS</div><div class="bsv red">${s.shortTrades}</div></div>

 <div class="bt-stat"><div class="bsl">EXPECTANCY</div><div class="bsv ${s.expectancy >= 0 ? 'green' : 'red'}">${s.expectancy >= 0 ? '+' : ''}${s.expectancy}%</div></div>

 <div class="bt-stat"><div class="bsl">AVG HOLD</div><div class="bsv blue">${s.avgHoldBars}d</div></div>

 <div class="bt-stat"><div class="bsl">AVG MFE</div><div class="bsv green">+${s.avgMfe}%</div></div>

 <div class="bt-stat"><div class="bsl">AVG MAE</div><div class="bsv red">${s.avgMae}%</div></div>

 <div class="bt-stat"><div class="bsl">TOTAL FEES</div><div class="bsv red">-${s.totalFeesPct}%</div></div>

 <div class="bt-stat"><div class="bsl">TOTAL FUNDING</div><div class="bsv ${s.totalFundingPct >= 0 ? 'green' : 'red'}">${s.totalFundingPct >= 0 ? '+' : ''}${s.totalFundingPct}%</div></div>

 <div class="bt-stat"><div class="bsl">AVG FUNDING</div><div class="bsv ${s.avgFundingPct >= 0 ? 'green' : 'red'}">${s.avgFundingPct >= 0 ? '+' : ''}${s.avgFundingPct}%</div></div>

 <div class="bt-stat"><div class="bsl">MAX LOSS RUN</div><div class="bsv red">${s.maxConsecutiveLosses}</div></div>

 <div class="bt-stat"><div class="bsl">BREAKEVEN</div><div class="bsv blue">${s.breakevenPct}%</div></div>

 <div class="bt-stat"><div class="bsl">TARGET EXITS</div><div class="bsv green">${s.targetPct}%</div></div>

 <div class="bt-stat"><div class="bsl">EXPIRED</div><div class="bsv blue">${s.expired || 0}</div></div>

 </div>

 <div class="bt-section-head">
 <div class="bt-equity-title">EQUITY CURVE</div>
 <div class="bt-section-meta">Cumulative % P&amp;L after fees, slippage, and funding.</div>
 </div>

 <div class="bt-chart-pair">
 <div class="bt-equity-chart">${eqSVG}</div>
 <div class="bt-equity-chart bt-drawdown-chart">${ddSVG}</div>
 </div>

 ${stopSweepMarkup}
 ${auditMarkup}

 <div class="bt-section-head bt-section-head--trades">
 <div class="bt-trades-title">TRADE LOG</div>
 <div class="bt-section-meta">${r.trades.length} signals | Showing first ${Math.min(r.trades.length, 40)}</div>
 </div>

 <div class="bt-trade-list">
 ${tradeRows}
 </div>

 ${r.trades.length > 40 ? `<div class="bt-more-note">... ${r.trades.length - 40} more trades not shown in this preview</div>` : ''}
 </div>`;

}



function backtestToCSV(bt) {

 const headers = [

 'Date', 'Timestamp', 'Signal Score', 'Side', 'Outcome',

 'Raw Entry', 'Entry Fill', 'Initial Stop', 'Final Stop', 'Target',

 'Raw Exit', 'Exit Fill', 'Bars Held', 'Return %', 'PnL Cash',

 'MFE %', 'MAE %', 'Funding PnL', 'Funding Events', 'Entry Fee', 'Exit Fee', 'Stop State'

 ];

 const rows = (bt?.trades || []).map(t => [

 t.date || '',

 Number.isFinite(t.ts) ? t.ts : '',

 Number.isFinite(t.signalScore) ? t.signalScore : 'NA',

 t.dir,

 t.outcome || '',

 t.rawEntry,

 t.entry,

 t.sl,

 t.finalStop,

 t.tp,

 t.rawExit,

 t.exit,

 t.barsHeld,

 t.pnlPct,

 t.pnlCash,

 t.mfePct,

 t.maePct,

 t.fundingPnl,

 t.fundingEvents,

 t.entryFee,

 t.exitFee,

 t.stopState,

 ]);

 return [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

}



document.addEventListener('click', (e) => {
 if (!(e.target?.id === 'btnExportBT' || e.target?.closest('#btnExportBT'))) return;

 if (!lastBacktestResult?.trades?.length) {
 alert('Run a backtest first.');
 return;
 }

 const csv = backtestToCSV(lastBacktestResult);
 const blob = new Blob([csv], { type: 'text/csv' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');

 a.href = url;
 a.download = `backtest_${lastBacktestResult.symbol || 'symbol'}_${new Date().toISOString().slice(0, 10)}.csv`;
 a.click();
 URL.revokeObjectURL(url);
});



function buildEquityCurve(eq) {

 if (!eq || eq.length < 2) return '<svg width="100%" height="80"></svg>';

 const W = 400, H = 78;

 const mn = Math.min(...eq), mx = Math.max(...eq);

 const range = mx - mn || 1;

 const pts = eq.map((v, i) => {

 const x = i / (eq.length - 1) * W;

 const y = H - ((v - mn) / range) * (H - 4) - 2;

 return `${x.toFixed(1)},${y.toFixed(1)}`;

 }).join(' ');

 const lastVal = eq[eq.length - 1];

 const color = lastVal >= 0 ? '#00e5a0' : '#ff4560';

 return `<svg width="100%" height="80" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">

 <defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".25"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>

 <polygon points="0,${H} ${pts} ${W},${H}" fill="url(#eqg)"/>

 <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/>

 </svg>`;

}

function buildDrawdownCurve(eq) {
 if (!eq || eq.length < 2) return '<svg width="100%" height="80"></svg>';
 const W = 400, H = 78;
 let peak = Number(eq[0] || 0);
 const dd = eq.map(value => {
 const current = Number(value || 0);
 peak = Math.max(peak, current);
 return Math.min(0, current - peak);
 });
 const mn = Math.min(...dd), mx = 0;
 const range = mx - mn || 1;
 const pts = dd.map((v, i) => {
 const x = i / (dd.length - 1) * W;
 const y = H - ((v - mn) / range) * (H - 4) - 2;
 return `${x.toFixed(1)},${y.toFixed(1)}`;
 }).join(' ');
 return `<svg width="100%" height="80" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
 <defs><linearGradient id="ddg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff8a5a" stop-opacity=".18"/><stop offset="100%" stop-color="#ff4560" stop-opacity="0"/></linearGradient></defs>
 <text x="8" y="13" fill="#7a8ab0" font-size="9" font-weight="700">Drawdown</text>
 <polygon points="0,${H} ${pts} ${W},${H}" fill="url(#ddg)"/>
 <polyline points="${pts}" fill="none" stroke="#ff8a5a" stroke-width="1.5"/>
 </svg>`;
}





// ----------------------------------------------------------------

// RISK CALCULATOR

// ----------------------------------------------------------------

document.addEventListener('click', event => {
 if (event.target?.closest?.('#btnCalc')) {
 calcRisk();
 return;
 }
 const preset = event.target?.closest?.('.rc-pre');
 if (!preset) return;
 document.querySelectorAll('.rc-pre').forEach(b => b.classList.remove('active'));
 preset.classList.add('active');
 const riskInput = document.getElementById('rcRisk');
 if (riskInput) {
 riskInput.value = preset.dataset.val;
 riskInput.dataset.syncMode = 'manual';
 }
 calcRisk();
});

document.addEventListener('input', event => {
 const target = event.target;
 if (!target || !['rcBalance', 'rcRisk', 'rcEntry', 'rcSL', 'rcLev'].includes(target.id)) return;
 if (target.id === 'rcBalance' || target.id === 'rcRisk') {
 target.dataset.syncMode = 'manual';
 }
 calcRisk();
});



function calcRisk() {

 const balance = parseFloat(document.getElementById('rcBalance').value) || 0;

 const riskPct = parseFloat(document.getElementById('rcRisk').value) || 0;

 const entry = parseFloat(document.getElementById('rcEntry').value) || 0;

 const sl = parseFloat(document.getElementById('rcSL').value) || 0;

 const maxLev = parseFloat(document.getElementById('rcLev').value) || 10;

 const resultEl = document.getElementById('rcResult');

 const emptyEl = document.getElementById('rcEmptyState');

 if (!balance || !riskPct || !entry || !sl || entry === sl) {

 if (resultEl) resultEl.style.display = 'none';

 if (emptyEl) emptyEl.style.display = 'flex';

 return;

 }



 const dollarRisk = balance * riskPct / 100;

 const slDist = Math.abs(entry - sl);

 const slDistPct = slDist / entry * 100;

 if (!slDist || !Number.isFinite(slDistPct)) {

 if (resultEl) resultEl.style.display = 'none';

 if (emptyEl) emptyEl.style.display = 'flex';

 return;

 }

 const posValue = dollarRisk / (slDistPct / 100);

 const contracts = posValue / entry;

 const margin = posValue / maxLev;

 const levNeeded = posValue / balance;

 const isLong = entry > sl;

 const rr2 = entry + (isLong ? slDist * 2 : -slDist * 2);

 const rr3 = entry + (isLong ? slDist * 3 : -slDist * 3);

 const rr5 = entry + (isLong ? slDist * 5 : -slDist * 5);



 document.getElementById('rcContracts').textContent = contracts >= 1 ? contracts.toFixed(2) : contracts.toFixed(4);

 document.getElementById('rcContractsSub').textContent = `contracts ($${posValue.toFixed(0)} position)`;

 document.getElementById('rcDollarRisk').textContent = `$${dollarRisk.toFixed(2)}`;

 document.getElementById('rcPosValue').textContent = `$${posValue.toFixed(0)}`;

 document.getElementById('rcMargin').textContent = `$${margin.toFixed(0)}`;

 document.getElementById('rcSlDist').textContent = `$${slDist.toFixed(4)} (${slDistPct.toFixed(2)}%)`;

 document.getElementById('rcLevNeeded').textContent = `${levNeeded.toFixed(1)}x`;

 document.getElementById('rcTP1').textContent = `$${fmtPrice(rr2)}`;

 document.getElementById('rcTP2').textContent = `$${fmtPrice(rr3)}`;

 document.getElementById('rcTP3').textContent = `$${fmtPrice(rr5)}`;

 document.getElementById('rcLevNeeded').textContent = `${levNeeded.toFixed(1)}x`;



 const levWarnEl = document.getElementById('rcLevWarn');

 if (levNeeded > maxLev) { levWarnEl.textContent = `Need ${levNeeded.toFixed(1)}x but max ${maxLev}x set`; levWarnEl.className = 'rc-cv warn'; }
 else { levWarnEl.textContent = 'Within limit'; levWarnEl.className = 'rc-cv green'; }



 if (levNeeded > maxLev) {

 levWarnEl.textContent = `Need ${levNeeded.toFixed(1)}x but max ${maxLev}x set`;

 levWarnEl.className = 'rc-cv warn';

 } else {

 levWarnEl.textContent = 'Within limit';

 levWarnEl.className = 'rc-cv green';

 }

 let advice = '';

 if (slDistPct < 0.3) advice += '<b>SL very tight</b> - high chance of stop-out.<br/>';
 if (slDistPct > 5) advice += '<b>SL very wide</b> - consider tighter entry.<br/>';
 if (levNeeded > 10) advice += `<b class="warn">High leverage (${levNeeded.toFixed(1)}x)</b> - reduce size.<br/>`;
 if (riskPct > 3) advice += '<b class="warn">Risk > 3%</b> - pros risk 0.5-2% per trade.<br/>';
 if (!advice) advice = `<b>Solid plan.</b> ${riskPct}% risk, ${levNeeded.toFixed(1)}x leverage.`;

 advice = '';

 if (slDistPct < 0.3) advice += '<b>SL very tight</b> - high chance of stop-out.<br/>';

 if (slDistPct > 5) advice += '<b>SL very wide</b> - consider tighter entry.<br/>';

 if (levNeeded > 10) advice += `<b class="warn">High leverage (${levNeeded.toFixed(1)}x)</b> - reduce size.<br/>`;

 if (riskPct > 3) advice += '<b class="warn">Risk above 3%</b> - most traders stay near 0.5% to 2% per trade.<br/>';

 if (!advice) advice = `<b>Solid plan.</b> ${riskPct}% risk with ${levNeeded.toFixed(1)}x leverage.`;

 document.getElementById('rcAdvice').innerHTML = advice;

 if (emptyEl) emptyEl.style.display = 'none';

 if (resultEl) resultEl.style.display = 'block';

}





// ----------------------------------------------------------------

// STRATEGY TAB

// ----------------------------------------------------------------




