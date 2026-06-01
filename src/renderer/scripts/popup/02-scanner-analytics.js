// -- Render cache: skip re-render when data is unchanged ----------------------------------------------------------------
const _rc = new Map();
function _fp(key, val) {
 const s = typeof val === 'string' ? val : JSON.stringify(val);
 if (_rc.get(key) === s) return false;
 _rc.set(key, s);
 return true;
}
function _setHtml(el, html) {
 if (el && el.innerHTML !== html) el.innerHTML = html;
}

// rAF scheduler: coalesces rapid calls so only the latest data writes to DOM
const _rafIds = new Map();
function _raf(key, fn) {
 if (_rafIds.has(key)) cancelAnimationFrame(_rafIds.get(key));
 _rafIds.set(key, requestAnimationFrame(() => { _rafIds.delete(key); fn(); }));
}

function isScannerUiActive(data = {}) {
 const statusText = String(data.scanStatus || '').trim();
 const progress = Number.isFinite(+data.scanProgress) ? Math.max(0, Math.min(100, +data.scanProgress)) : 0;
 const failedStatus = /stopped|failed|rate limit|too many|unavailable|error/i.test(statusText);
 const completedStatus = /^ok done|^ready\b|complete/i.test(statusText) || progress >= 100;
 const heartbeatFresh = Number.isFinite(+data.scanHeartbeat) && (Date.now() - Number(data.scanHeartbeat)) < 20000;
 return !!data.scanActive && heartbeatFresh && /loading|scanning/i.test(statusText) && !failedStatus && !completedStatus;
}

async function renderScanner(preloaded = null) {
  const d = preloaded ?? await storeGet(['scanResults', 'watchlist', 'manualWatchlist', 'autoWatchlist', 'decisionShortlist', 'alerts', 'analyticsPositions', 'scanStatus', 'scanActive', 'scanProgress', 'scanHeartbeat', 'lastScan', 'lastScanTs', 'strategy', 'marketIndex', 'sectorBreadth', 'scannerUniverseMeta', 'candleFetchStats']);
 const list = d.scanResults || [];
 const liveAlerts = getLiveAlertSnapshot(d.alerts, list);
 currentWatchlist = d.manualWatchlist || d.watchlist || [];
 currentAlertsCache = d.alerts || currentAlertsCache;
 currentAnalyticsPositions = Array.isArray(d.analyticsPositions) ? d.analyticsPositions : currentAnalyticsPositions;
 const cont = document.getElementById('cardList');
 const strip = document.getElementById('strip');
 renderScannerFeedStatus(d);
 renderSectorBar(list, d.sectorBreadth || null);
 renderScannerInsightsRail(list);
 renderScannerSpotlightV2(list, liveAlerts, currentWatchlist, d.decisionShortlist || []);
 renderTradeTape(liveAlerts, list);


 if (!list.length) {
 if (isScannerUiActive(d)) {
 cont.innerHTML = buildSkeletonMarkup(6, 'cards');
 strip.style.display = 'none';
 return;
 }

 cont.innerHTML = `<div class="empty"><div class="ei">SCAN</div><div class="eh">No signals yet</div>

 <div class="es">Click <b>SCAN NOW</b> to scan liquid NSE/BSE symbols<br/>EMA+OBV+RSI+MACD+VWAP+VP &middot; MTF &middot; Sparklines</div></div>`;

 strip.style.display = 'none';

 return;

 }



 document.getElementById('ssLong').textContent = list.filter(r => r.direction === 'long').length;

 document.getElementById('ssShort').textContent = list.filter(r => r.direction === 'short').length;

 document.getElementById('ssMTF').textContent = list.filter(r => r.mtfConfirmed).length;

 document.getElementById('ssWatch').textContent = list.filter(r => r.direction?.startsWith('watch')).length;

 document.getElementById('ssFire').textContent = list.filter(r => r.score >= 80).length;

 document.getElementById('ssSpike').textContent = list.filter(r => r.spike).length;

 strip.style.display = 'flex';

 document.getElementById('cSignals').textContent = list.length;

 renderCards(list, cont, currentWatchlist);

}

function buildNativeStraddleScannerCard(row = {}) {
 const raw = row.raw || {};
 const tone = row.signal === 'BUY' ? 'long' : row.signal === 'SELL' ? 'short' : 'watch';
 const premium = raw.premiumPerContract ? `Rs ${Number(raw.premiumPerContract || 0).toFixed(2)}` : `Rs ${Number(row.entry || 0).toFixed(2)}`;
 const expiry = Number(raw.daysToExpiry || 0) < 1
 ? `${Math.max(0, Number(raw.daysToExpiry || 0) * 24).toFixed(1)}h`
 : `${Number(raw.daysToExpiry || 0).toFixed(1)}d`;
 return `<button type="button" class="native-straddle-mini-card ${tone}" data-native-straddle-chart="${esc(row.symbol || '')}">
 <span>${esc(raw.underlying || row.symbol || '')}</span>
 <strong>${esc(row.actionLabel || row.setupLabel || 'Native Straddle')}</strong>
 <small>${esc(row.symbol || '')}</small>
 <b>Score ${Number(row.score || 0).toFixed(0)} | ${premium} | ${expiry}</b>
 </button>`;
}

function renderNativeStraddleScannerRail(rows = [], status = {}) {
 const wrap = document.getElementById('nativeStraddleScannerRail');
 if (!wrap) return;
 const list = Array.isArray(rows) ? rows.slice(0, 4) : [];
 const active = !!status?.active;
 const statusText = status?.status || 'Run strategy scan for market symbols.';
 wrap.innerHTML = `<section class="native-straddle-strip">
 <div class="native-straddle-strip-head">
 <div><span>Native Straddle Scanner</span><strong>${active ? 'Scanning...' : list.length ? `${list.length} idea${list.length === 1 ? '' : 's'}` : 'Ready'}</strong><small>${esc(statusText)}</small></div>
 <div class="native-straddle-strip-actions">
 <button type="button" class="bsm secondary" id="btnNativeStraddleScan">${active ? 'Scanning...' : 'Scan Native'}</button>
 <button type="button" class="bsm" id="btnNativeStraddleLab">Strategy Lab</button>
 </div>
 </div>
 <div class="native-straddle-strip-list">${list.length ? list.map(buildNativeStraddleScannerCard).join('') : '<div class="native-straddle-empty">No Native Straddle result yet. Scan fetches fresh MV quotes and opens charts in 15m.</div>'}</div>
 </section>`;
 wrap.querySelector('#btnNativeStraddleScan')?.addEventListener('click', () => {
 chrome.runtime.sendMessage({ action: 'native-straddle:startScan', force: true }, () => {
   setTimeout(() => (globalThis.scheduleWorkspaceTabRender?.('scanner') || renderScanner()), 500);
  });
 });
 wrap.querySelector('#btnNativeStraddleLab')?.addEventListener('click', () => {
  if (typeof setActiveWorkspaceTab === 'function') setActiveWorkspaceTab('strategies', true, true);
 });
 wrap.querySelectorAll('[data-native-straddle-chart]').forEach(button => {
  button.addEventListener('click', async () => {
   const symbol = button.dataset.nativeStraddleChart || '';
   const row = list.find(item => item.symbol === symbol) || { symbol, raw: { timeframe: '15m' } };
   await globalThis.openSignalInChartWorkspace?.({
    ...row,
    chartTradingDraft: row.raw?.chartTradingDraft || null,
   }, { reviewTab: true, returnTab: 'scanner', returnSymbol: symbol, timeframe: '15m' });
  });
 });
}

function renderScannerFeedStatus(data = {}) {
 const wrap = document.getElementById('scannerFeedStatus');
 if (!wrap) return;
 const mode = (globalThis.getMarketDataModeLabel || (value => value))(data?.strategy?.marketDataMode || globalThis.dhanMarketDataMode || 'auto');
  const universeMeta = data?.scannerUniverseMeta || {};
  const universeLabel = universeMeta.label || (globalThis.getScannerUniverseLabel ? globalThis.getScannerUniverseLabel(data?.strategy?.scanUniverse) : data?.strategy?.scanUniverse) || 'F&O Stocks';
  const scanMode = String(universeMeta.scanMode || data?.strategy?.scanMode || 'standard');
  const quoteReturned = Number(universeMeta.returned || universeMeta.count || 0);
  const quoteTotal = Number(universeMeta.count || universeMeta.total || universeMeta.requested || quoteReturned || 0);
  const requested = Number(universeMeta.requested || data?.strategy?.maxCoins || quoteTotal || 0);
  const deepLimit = Number(universeMeta.deepScanLimit || requested || 0);
  const scanned = Number(universeMeta.scanned || 0);
  const signals = Number(Array.isArray(data?.scanResults) ? data.scanResults.length : universeMeta.signals || 0);
  const skippedNoHistory = Number(universeMeta.skippedNoHistory || data?.scanProgress?.noHistory || 0);
  const scanActive = isScannerUiActive(data);
 const updated = (globalThis.formatUiAge || (() => 'Not yet'))(data?.lastScanTs || 0);
 const marketIndex = data?.marketIndex || {};
 // Cache for regime-aware card dimming in renderCards
 if (marketIndex?.regime) window._lastMarketIndex = marketIndex;
 const leadership = marketIndex?.leadership || {};
 const thresholds = marketIndex?.thresholdSummary
 || (globalThis.FWDTradeDeskShared?.formatThresholdSummary
 ? globalThis.FWDTradeDeskShared.formatThresholdSummary(marketIndex?.thresholds || {})
 : 'Execute >= 65 | Setup >= 60 | Watch >= 45');
 const autoWatchlist = Array.isArray(data?.autoWatchlist) ? data.autoWatchlist : [];
  wrap.innerHTML = (globalThis.buildMarketDataStatusPills || (() => ''))([
  { label: 'Universe', value: universeLabel, tone: String(data?.strategy?.scanUniverse || '').toLowerCase() === 'all_nse' ? 'warn' : 'ok' },
  { label: 'Quotes', value: quoteReturned || quoteTotal ? `${quoteReturned || 0}/${quoteTotal || '?'}` : 'Waiting', tone: quoteReturned ? 'ok' : 'warn' },
  { label: 'Type', value: scanMode === 'penny_awakening' ? 'Penny Awakening' : 'Standard', tone: scanMode === 'penny_awakening' ? 'warn' : 'ok' },
  { label: 'Deep Scan', value: scanned || deepLimit ? `${scanned || 0}/${deepLimit || '?'}` : 'Default', tone: scanActive ? 'warn' : scanned ? 'ok' : 'warn' },
  { label: 'Skipped', value: skippedNoHistory ? `${skippedNoHistory} no history` : '0 no history', tone: skippedNoHistory ? 'warn' : 'ok' },
  { label: 'Signals', value: `${signals} found`, tone: signals ? 'ok' : (scanActive ? 'warn' : 'fail') },
  { label: 'Mode', value: mode, tone: String(data?.strategy?.marketDataMode || globalThis.dhanMarketDataMode || 'auto').toLowerCase() === 'polling' ? 'warn' : 'ok' },
 { label: 'Regime', value: String(marketIndex?.regime || 'UNKNOWN').replace(/_/g, ' '), tone: String(marketIndex?.regime || '').toLowerCase().includes('high') ? 'fail' : String(marketIndex?.regime || '').toLowerCase().includes('trend') ? 'ok' : 'warn' },
 { label: 'Direction', value: String(marketIndex?.condition || (scanActive ? 'Scanning' : 'Idle')).toUpperCase(), tone: String(marketIndex?.condition || '').toLowerCase() === 'neutral' ? 'warn' : 'ok' },
 { label: 'Leadership', value: leadership?.label || 'Mixed Leadership', tone: leadership?.tone === 'bad' ? 'fail' : leadership?.tone === 'good' ? 'ok' : 'warn' },
 { label: 'Top 5', value: autoWatchlist.length ? `${autoWatchlist.length} auto-tracked` : 'Waiting for scan', tone: autoWatchlist.length ? 'ok' : 'warn' },
 { label: 'Thresholds', value: thresholds, tone: scanActive ? 'warn' : 'ok' },
 { label: 'Last Scan', value: updated, tone: data?.lastScan ? 'ok' : 'fail' },
 ]);
}

function renderSectorBar(list = [], sectorBreadth = null) {
 const wrap = document.getElementById('sectorBar');
 const pills = document.getElementById('sectorBarPills');
 const sectorSelect = document.getElementById('fSector');
 if (!wrap || !pills || !sectorSelect) return;
 const activeSector = String(sectorSelect.value || '');
 const breadthMap = sectorBreadth?.bySector || {};
 const counts = {};
 (Array.isArray(list) ? list : []).forEach(signal => {
 const sector = normalizeSectorLabel(signal?.sector || getSector(signal?.symbol));
 counts[sector] = (counts[sector] || 0) + 1;
 });
 const sectors = Object.keys(counts)
 .map(sector => ({
 sector,
 count: counts[sector] || 0,
 breadthState: breadthMap?.[sector]?.breadthState || 'balanced',
 leader: breadthMap?.[sector]?.topSymbol || '',
 avgScore: Number(breadthMap?.[sector]?.avgScore || 0),
 breadthScore: Number(breadthMap?.[sector]?.breadthScore || 0),
 }))
 .sort((a, b) => b.count - a.count || b.avgScore - a.avgScore || a.sector.localeCompare(b.sector));

 if (!sectors.length) {
 wrap.style.display = 'none';
 pills.innerHTML = '';
 return;
 }

 const allCount = sectors.reduce((sum, item) => sum + item.count, 0);
 const allTone = !activeSector ? 'active' : '';
 const markup = [
 `<button type="button" class="preset-btn ${allTone}" data-sector-filter="">All Flow <span>${allCount}</span></button>`,
 ...sectors.map(item => {
 const tone = item.breadthState === 'confirmed' ? 'ok' : item.breadthState === 'weak' ? 'fail' : 'warn';
 const active = activeSector === item.sector ? 'active' : '';
 const assetClass = item.sector === 'RWA' ? 'rwa-sector' : '';
 const title = `${item.sector} | ${item.count} signals | ${item.breadthState === 'confirmed' ? 'Breadth confirms' : item.breadthState === 'weak' ? 'Breadth weak' : 'Breadth mixed'}${item.leader ? ` | Leader ${item.leader}` : ''}`;
 const label = item.breadthState === 'confirmed' ? 'Lead' : item.breadthState === 'weak' ? 'Weak' : 'Mix';
 return `<button type="button" class="preset-btn ${active} ${tone} ${assetClass}" data-sector-filter="${esc(item.sector)}" title="${esc(title)}">${esc(item.sector)} <span>${item.count}</span> <em>${esc(item.sector === 'RWA' ? 'Asset' : label)}</em></button>`;
 }),
 ];

 wrap.style.display = 'flex';
 pills.innerHTML = markup.join('');
 pills.querySelectorAll('[data-sector-filter]').forEach(button => {
 button.addEventListener('click', async () => {
 const nextSector = button.dataset.sectorFilter || '';
 sectorSelect.value = nextSector;
 const data = await storeGet(['scanResults', 'manualWatchlist', 'watchlist']);
 renderCards(data.scanResults || [], document.getElementById('cardList'), data.manualWatchlist || data.watchlist || []);
 renderSectorBar(data.scanResults || [], sectorBreadth);
 });
 });
}



function buildSpotlightCard(label, value, copy, badge, tone, signal) {

 const sym = signal?.symbol ? ` data-sym="${esc(signal.symbol)}"` : '';
 const safeTone = String(tone || 'neutral').replace(/[^a-z0-9 _-]+/gi, '').trim() || 'neutral';

 return `<div class="scanner-spot-card"${sym}>

 <div class="scanner-spot-top">

 <div>

 <div class="scanner-spot-label">${esc(label)}</div>

 <div class="scanner-spot-value">${esc(value)}</div>

 </div>

 <div class="scanner-spot-badge ${safeTone}">${esc(badge)}</div>

 </div>

 <div class="scanner-spot-copy">${copy}</div>

 </div>`;

}

function scannerInsightStrengthRank(signal) {

 const strength = String(signal?.emergingMove?.strength || '').toLowerCase();

 if (strength === 'prime') return 4;

 if (strength === 'strong') return 3;

 if (strength === 'early') return 2;

 if (signal?.mtfConfirmed) return 1;

 return 0;

}

function scannerInsightFunding(signal) {

 return Number(signal?.fundingRate || 0);

}

function scannerInsightAbsFunding(signal) {

 return Math.abs(scannerInsightFunding(signal));

}

function scannerInsightVolumeClimax(signal) {

 return !!signal?.daily?.volumeClimax?.isClimax;

}

function scannerInsightLiquidation(signal) {

 return !!signal?.liquidationRisk;

}

function formatScannerInsightDirection(signal, options = {}) {

 const direction = String(signal?.direction || '').toUpperCase();

 if (!direction) return options.fallback || 'SETUP';

 const side = direction.includes('SHORT')
 ? 'SHORT'
 : direction.includes('LONG')
 ? 'LONG'
 : direction.replace(/_/g, ' ');

 if (options.reversal) return `REV ${side}`;

 return side;

}

function buildScannerInsightCard(config = {}) {

 const primary = config.primary || null;
 const isWaiting = !primary;

 const leadSymbol = primary?.symbol || config.symbol || '';

 const symAttr = leadSymbol ? ` data-sym="${esc(leadSymbol)}"` : '';

 const tone = String(config.tone || 'neutral').replace(/[^a-z0-9 _-]+/gi, '').trim() || 'neutral';

 // WAIT state: render as compact 1-line strip instead of full card
 if (isWaiting) {
 return `<article class="scanner-insight-card ${tone} insight-wait-compact"${symAttr}>
 <div class="scanner-insight-head">
 <div class="scanner-insight-kicker">${esc(config.label || 'Scanner Insight')}</div>
 <span class="scanner-insight-badge neutral">WAIT</span>
 <span class="scanner-insight-wait-note">${config.meta || 'No clean setup right now'}</span>
 </div>
 </article>`;
 }

 const symbols = Array.from(new Set((config.symbols || []).filter(Boolean)));

 const visibleSymbols = symbols.slice(0, 4);

 const hiddenSymbolCount = Math.max(0, symbols.length - visibleSymbols.length);

 const symbolsMarkup = visibleSymbols.length

 ? `${visibleSymbols.map(symbol => `<button type="button" class="scanner-insight-pill" data-sym="${esc(symbol)}">${esc(symbol)}</button>`).join('')}${hiddenSymbolCount ? `<span class="scanner-insight-pill more">+${hiddenSymbolCount}</span>` : ''}`

 : '<div class="scanner-insight-empty">No clean setup in the current snapshot.</div>';

 return `<article class="scanner-insight-card ${tone}"${symAttr}>

 <div class="scanner-insight-head">

 <div>

 <div class="scanner-insight-kicker">${esc(config.label || 'Scanner Insight')}</div>

 <div class="scanner-insight-symbol">${esc(leadSymbol || 'WAIT')}</div>

 </div>

 <div class="scanner-insight-badge ${tone}">${esc(config.badge || 'LIVE')}</div>

 </div>

 <div class="scanner-insight-meta">${config.meta || 'Watching for a cleaner setup.'}</div>

 <div class="scanner-insight-copy">${config.copy || 'No active setup is strong enough yet.'}</div>

 <div class="scanner-insight-stocks-label">Symbols</div>

 <div class="scanner-insight-symbols">${symbolsMarkup}</div>

 </article>`;

}

function renderScannerInsightsRail(list) {

 const wrap = document.getElementById('scannerInsightsRail');

 if (!wrap) return;

 if (!_fp('renderInsightsRail', list.map(r => r.symbol + ':' + (r.score || 0)).join('|'))) return;

 if (!Array.isArray(list) || !list.length) {

 wrap.innerHTML = '';

 return;

 }

 const continuationCandidates = list
 .filter(signal => ['continuation', 'pullback', 'breakout_retest', 'tight_continuation', 'compression_breakout'].includes(String(signal?.setupFamily || '')))
 .sort((a, b) => Number(b?.tradeQuality?.score || 0) - Number(a?.tradeQuality?.score || 0) || Number(b?.score || 0) - Number(a?.score || 0));

 const reversalCandidates = list
 .filter(signal => ['liquidation_reversal', 'reclaim', 'crowding_unwind', 'fade_extreme', 'mean_reversion'].includes(String(signal?.setupFamily || '')))
 .sort((a, b) => Number(b?.tradeQuality?.score || 0) - Number(a?.tradeQuality?.score || 0) || Number(scannerInsightLiquidation(b)) - Number(scannerInsightLiquidation(a)) || Number(b?.score || 0) - Number(a?.score || 0));

 const rsLeaders = list
 .filter(signal => Number(signal?.rsComposite || 0) > 0)
 .sort((a, b) => Number(b?.rsComposite || 0) - Number(a?.rsComposite || 0) || Number(b?.tradeQuality?.score || 0) - Number(a?.tradeQuality?.score || 0));

 const breadthRiskCandidates = list
 .filter(signal => String(signal?.sectorBreadthState || '') === 'weak' || String(signal?.leadershipState || '') === 'btc_only' || String(signal?.leadershipState || '') === 'broad_risk_off')
 .sort((a, b) => Number(a?.tradeQuality?.score || 0) - Number(b?.tradeQuality?.score || 0) || Number(a?.score || 0) - Number(b?.score || 0));

 const bestContinuation = continuationCandidates[0] || null;
 const bestReversal = reversalCandidates[0] || null;
 const leadershipLeader = rsLeaders[0] || null;
 const breadthRisk = breadthRiskCandidates[0] || null;

 const cards = [

 buildScannerInsightCard({

 label: 'Best Continuation',
 primary: bestContinuation,
 tone: bestContinuation ? (String(bestContinuation.direction || '').toLowerCase() === 'short' ? 'short' : 'long') : 'neutral',
 badge: bestContinuation ? (bestContinuation.setupFamilyLabel || 'TREND') : 'WAIT',
 meta: bestContinuation
 ? `<strong>${bestContinuation.score || 0}/100</strong> / TQ ${bestContinuation.tradeQuality?.score || 0} / ${bestContinuation.mtfConfirmed ? 'Trend OK' : 'Developing'}`
 : 'No continuation setup is clean enough right now.',
 copy: bestContinuation
 ? esc(bestContinuation.tradeQuality?.summary || bestContinuation.reasons?.[0] || 'Strongest aligned continuation setup in the current scan.')
 : 'Continuation setups will show here when trend, regime, and execution quality align.',
 symbols: continuationCandidates.map(signal => signal.symbol),

 }),

 buildScannerInsightCard({

 label: 'Best Reversal',
 primary: bestReversal,
 tone: bestReversal ? (String(bestReversal.direction || '').toLowerCase() === 'short' ? 'short contra' : 'long contra') : 'neutral',
 badge: bestReversal ? (bestReversal.setupFamilyLabel || 'REVERSAL') : 'WAIT',
 meta: bestReversal
 ? `FR ${scannerInsightFunding(bestReversal) > 0 ? '+' : ''}${scannerInsightFunding(bestReversal).toFixed(4)}% / <strong>${bestReversal.score || 0}/100</strong> / TQ ${bestReversal.tradeQuality?.score || 0}`
 : 'No reversal / fade setup is strong enough right now.',
 copy: bestReversal
 ? esc(bestReversal.tradeQuality?.summary || bestReversal.reasons?.[0] || 'Best reversal setup from the current scan snapshot.')
 : 'Reversal setups will show here when crowding or failed structure becomes compelling.',
 symbols: reversalCandidates.map(signal => signal.symbol),

 }),

 buildScannerInsightCard({

 label: 'Leadership',
 primary: leadershipLeader,
 tone: leadershipLeader ? 'long' : 'neutral',
 badge: leadershipLeader ? leadershipLeader.rsLabel || 'RS' : 'WAIT',
 meta: leadershipLeader
 ? `RS ${Number(leadershipLeader.rsComposite || 0) >= 0 ? '+' : ''}${Number(leadershipLeader.rsComposite || 0).toFixed(1)} / TQ ${leadershipLeader.tradeQuality?.score || 0} / ${leadershipLeader.marketLeadership?.label || 'Mixed'}`
 : 'No relative-strength leader stands out yet.',
 copy: leadershipLeader
 ? esc(leadershipLeader.marketLeadership?.copy || leadershipLeader.tradeQuality?.summary || 'Relative-strength leader with market participation support.')
 : 'Leadership will show here when RS and market participation align.',
 symbols: rsLeaders.map(signal => signal.symbol),

 }),

 buildScannerInsightCard({
 label: 'Breadth Risk',
 primary: breadthRisk,
 tone: breadthRisk ? 'crowding' : 'neutral',
 badge: breadthRisk ? (breadthRisk.sectorBreadthState === 'weak' ? 'Breadth Weak' : 'Leadership Risk') : 'CALM',
 meta: breadthRisk
 ? `${breadthRisk.sector || 'Other'} / <strong>${breadthRisk.score || 0}/100</strong> / TQ ${breadthRisk.tradeQuality?.score || 0}`
 : 'Sector breadth is not creating a major warning right now.',
 copy: breadthRisk
 ? esc(breadthRisk.tradeQuality?.summary || 'Breadth or leadership is working against this setup.')
 : 'Breadth risk will light up when sectors stop confirming or index leadership turns hostile.',
 symbols: breadthRiskCandidates.map(signal => signal.symbol),
 }),

 ];

 wrap.innerHTML = `<div class="scanner-insights-scroll">${cards.join('')}</div>`;

 wrap.querySelectorAll('.scanner-insight-card[data-sym]').forEach(card => {

 card.addEventListener('click', () => {

 const match = list.find(signal => signal.symbol === card.dataset.sym);

 if (match) openModal(match);

 });

 });

 wrap.querySelectorAll('.scanner-insight-pill[data-sym]').forEach(button => {

 button.addEventListener('click', (event) => {

 event.stopPropagation();

 const match = list.find(signal => signal.symbol === button.dataset.sym);

 if (match) openModal(match);

 });

 });

}



function getTrackedStatusForSymbol(symbol) {

 const sym = sanitizeAnalyticsSymbol(symbol);

 const watched = currentWatchlist.includes(sym);

 const analytics = currentAnalyticsPositions.some(p => sanitizeAnalyticsSymbol(p.symbol) === sym);

 return { watched, analytics };

}



function getTrackedPnlState(signal) {

 const sym = sanitizeAnalyticsSymbol(signal?.symbol || '');

 const price = Number(signal?.price || signal?.entry || 0);

 if (!sym || !price) return { hasAny: false, totalPnl: 0, tone: '', label: '' };



 let totalPnl = 0;

 let hasAny = false;

 currentAnalyticsPositions.forEach(pos => {

 if (sanitizeAnalyticsSymbol(pos.symbol) !== sym) return;

 const entry = toPosNum(pos.entry);

 if (!entry) return;

 const qtyRaw = toPosNum(pos.qty);

 const tradeValue = toPosNum(pos.tradeValue);

 const qty = qtyRaw > 0 ? qtyRaw : (tradeValue > 0 && entry > 0 ? tradeValue / entry : 0);

 if (!qty) return;

 const dir = String(pos.side || 'long') === 'short' ? -1 : 1;

 totalPnl += (price - entry) * qty * dir;

 hasAny = true;

 });

 if (!hasAny) return { hasAny: false, totalPnl: 0, tone: '', label: '' };

 return {

 hasAny: true,

 totalPnl,

 tone: totalPnl < 0 ? 'caution' : 'tailwind',

 label: totalPnl < 0 ? `P&L -$${Math.abs(totalPnl).toFixed(2)}` : `P&L +$${Math.abs(totalPnl).toFixed(2)}`,

 };

}



function matchesScannerPreset(signal) {

 if (!scannerPreset) return true;

 const tracked = getTrackedStatusForSymbol(signal.symbol);

 const absFr = Math.abs(Number(signal.fundingRate || 0));

 const isTrend = !!signal.mtfConfirmed && Number(signal.score || 0) >= 70 && Number(signal.rr || 0) >= 2;

 const isReversal = absFr >= 0.05 || !!signal.daily?.volumeClimax?.isClimax || !!signal.liquidationRisk;

 const isCrowding = absFr >= 0.05 || !!signal.liquidationRisk;

 if (scannerPreset === 'trend') return isTrend;

 if (scannerPreset === 'reversal') return isReversal;

 if (scannerPreset === 'crowding') return isCrowding;

 if (scannerPreset === 'tracked') return tracked.watched || tracked.analytics;

 return true;

}



function alertPriorityWeight(alert) {

 const tracked = getTrackedStatusForSymbol(alert.symbol);

 const tier = String(alert.alertTier || '').toLowerCase();

 const tierWeight = tier === 'execute' ? 300 : tier === 'setup' ? 200 : 100;

 const trackedWeight = (tracked.analytics ? 55 : 0) + (tracked.watched ? 35 : 0);

 const freshnessWeight = Math.max(0, 20 - Math.floor((Date.now() - Number(alert.ts || 0)) / 60000));

 return tierWeight + trackedWeight + Number(alert.score || 0) + freshnessWeight;

}



function renderTradeTape(alerts, scanList) {
 const wrap = document.getElementById('tradeTape');
 if (!wrap) return;

 if (!_fp('renderTradeTape', (alerts || []).map(a => a.symbol + ':' + (a.ts || 0)).join('|'))) return;
 const execute = (alerts || [])
 .filter(a => String(a?.alertTier || '').toLowerCase() === 'execute')
 .sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0))
 .slice(0, 10);
 if (!execute.length) {

 wrap.innerHTML = '<div class="trade-tape-empty">Newest execute alerts will appear here after the next scan.</div>';

 return;

 }

 wrap.innerHTML = execute.map(alert => {

 const dirTone = String(alert.direction || '').includes('short') ? 'short' : String(alert.direction || '').includes('long') ? 'long' : 'neutral';

 return `<button class="trade-tape-chip ${dirTone}" data-sym="${esc(alert.symbol)}">

 <span>${dirTone === 'short' ? '&darr;' : dirTone === 'long' ? '&uarr;' : '&bull;'}</span>

 <b>${esc(alert.symbol)}</b>

 <span>${Number(alert.score || 0)}/100</span>

 <span>${timeAgo(alert.ts || Date.now())}</span>

 </button>`;

 }).join('');

 wrap.querySelectorAll('.trade-tape-chip').forEach(btn => {

 btn.addEventListener('click', () => {

 const sym = btn.dataset.sym;

 const match = (scanList || []).find(r => r.symbol === sym) || (alerts || []).find(a => a.symbol === sym);

 if (match) openModal(match);

 });
 });

}



function renderAlertQueue(alerts) {

 const wrap = document.getElementById('alertQueue');

 if (!wrap) return;

 const actionable = (alerts || [])

 .filter(a => ['execute', 'setup'].includes(String(a?.alertTier || '').toLowerCase()))

 .slice(0, 5);

 if (!actionable.length) {

 wrap.innerHTML = '<div class="alert-queue-empty">Top actionable alerts will appear here when execute or setup signals fire.</div>';

 return;

 }

 wrap.innerHTML = actionable.map(alert => {

 const tracked = getTrackedStatusForSymbol(alert.symbol);

 const tier = String(alert.alertTier || 'watch').toLowerCase();

 const context = [

 `${Number(alert.score || 0)}/100`,

 tracked.analytics ? 'analytics' : '',

 tracked.watched ? 'watchlist' : '',

 timeAgo(alert.ts || Date.now()),

 ].filter(Boolean).join(' &middot; ');

 const copy = alert.reasons?.[0] ? esc(alert.reasons[0]) : `${alert.direction?.toUpperCase()} opportunity`;

 return `<div class="alert-queue-card" data-sym="${esc(alert.symbol)}">

 <div class="alert-queue-top">

 <span class="alert-queue-sym">${esc(alert.symbol)}</span>

 <span class="alert-queue-badge ${tier}">${tier.toUpperCase()}</span>

 </div>

 <div class="alert-queue-copy">${copy}</div>

 <div class="alert-queue-copy" style="margin-top:5px;color:#667a9e">${context}</div>

 </div>`;
 }).join('');

 wrap.querySelectorAll('.alert-queue-card').forEach(card => {

 card.addEventListener('click', () => {

 const sym = card.dataset.sym;

 const match = (alerts || []).find(a => a.symbol === sym);

 if (match) openModal(match);

 });

 });

}



function getScannerViewMode() {
 const stored = localStorage.getItem('scannerViewMode');
 const btnMode = document.getElementById('btnScannerView')?.dataset?.view;
 const mode = stored || btnMode || 'cards';
 return ['cards', 'table', 'compact'].includes(mode) ? mode : 'cards';
}

function setScannerViewMode(mode) {
 const next = ['cards', 'table', 'compact'].includes(mode) ? mode : 'cards';
 localStorage.setItem('scannerViewMode', next);
 const btn = document.getElementById('btnScannerView');
 if (btn) {
 btn.dataset.view = next;
 btn.textContent = next === 'compact' ? 'Compact' : next === 'table' ? 'Table' : 'Cards';
 btn.title = `Scanner view: ${btn.textContent}`;
 btn.classList.toggle('active', next !== 'cards');
 }
 return next;
}

function scannerDirectionLabel(direction, compact = false) {
 const value = String(direction || '');
 const labels = compact
 ? { long: 'LONG', short: 'SHORT', watch_long: 'WATCH L', watch_short: 'SHORT W' }
 : { long: 'LONG', short: 'SHORT', watch_long: 'WATCH SETUP', watch_short: 'SHORT WATCH' };
 return labels[value] || value.toUpperCase() || 'REVIEW';
}

function scannerActionTier(r, isChoppyRegime = false) {
 const score = Number(r?.score || 0);
 const direction = String(r?.direction || '');
 const watchTier = direction.includes('watch') || score < 62;
 if (isChoppyRegime && watchTier) return 'dimmed';
 if (score >= 75 && !direction.includes('watch')) return 'execute';
 if (score >= 62) return 'setup';
 if (score >= 45 || direction.includes('watch')) return 'watch';
 return 'avoid';
}

function scannerWhyLine(r, isChoppyRegime = false) {
 const tier = scannerActionTier(r, isChoppyRegime);
 const score = Number(r?.score || 0);
 const tq = Number(r?.tradeQuality?.score || 0);
 const setup = String(r?.setupFamilyLabel || 'Mixed').trim() || 'Mixed';
 const reason = String((r?.reasons || [])[0] || '').replace(/setup-regime mismatch/ig, 'setup does not fit current regime');
 if (tier === 'dimmed') return `Dimmed because: choppy regime prefers execute-quality signals; ${setup} is wait/review.`;
 if (score >= 75) return `Shown because: score ${score}, TQ ${tq || '--'}, ${setup}${reason ? `, ${reason}` : ''}.`;
 if (tier === 'setup') return `Setup quality: score ${score}, TQ ${tq || '--'}, needs cleaner confirmation.`;
 return `Watch only: score ${score}, ${setup}${reason ? `, ${reason}` : ', waiting for stronger evidence'}.`;
}

function buildScannerResultToolbar(filtered, visibleRows, viewMode, isChoppy, watchCount) {
 const shown = visibleRows.length;
 const total = filtered.length;
 const activeCount = filtered.filter(r => scannerActionTier(r, isChoppy) !== 'dimmed').length;
 const notices = [];
 if (isChoppy && watchCount > 0) {
 notices.push(`<div class="scanner-notice warning"><strong>Choppy regime</strong><span>${watchCount} watch/setup signal${watchCount > 1 ? 's' : ''} dimmed; execute-quality names stay first.</span></div>`);
 }
 if (total > shown) {
 notices.push(`<div class="scanner-notice info"><strong>Result cap</strong><span>Showing ${shown} of ${total}. Use search, setup, sector, direction, or sort to narrow.</span></div>`);
 }
 const viewButton = (mode, label) => `<button class="scanner-view-btn ${viewMode === mode ? 'active' : ''}" type="button" data-scanner-view="${mode}" aria-pressed="${viewMode === mode}">${label}</button>`;
 return `<div class="scanner-result-head">
 <div class="scanner-result-copy">
 <strong>${shown} shown</strong>
 <span>${total} matched | ${activeCount} actionable view | ${watchCount} watch/setup</span>
 </div>
 <div class="scanner-view-switch" role="group" aria-label="Scanner result view">
 ${viewButton('cards', 'Cards')}
 ${viewButton('table', 'Table')}
 ${viewButton('compact', 'Compact')}
 </div>
 </div>${notices.length ? `<div class="scanner-notice-rail">${notices.join('')}</div>` : ''}`;
}

async function renderCards(list, cont, watchlist) {

 const wl = watchlist || currentWatchlist || [];

 const search = document.getElementById('fSearch')?.value?.toLowerCase() || '';

 const dir = document.getElementById('fDir')?.value || '';

 const mtf = document.getElementById('fMTF')?.value || '';

 const sort = document.getElementById('fSort')?.value || 'score';

 const sector = document.getElementById('fSector')?.value || '';

 const setupFilter = document.getElementById('fSetup')?.value || '';

 const viewMode = setScannerViewMode(getScannerViewMode());

 // - Render guard: skip full rebuild when list, filters, watchlist unchanged
 const _cards_fp = list.map(r => r.symbol + ':' + (r.score || 0) + ':' + (r.direction || '')).join('|')
 + '||' + wl.join(',') + '|' + search + '|' + dir + '|' + mtf + '|' + sort + '|' + sector + '|' + setupFilter + '|' + viewMode;
 if (!_fp('renderCards', _cards_fp)) return;
 const desktopMarketsScanner = typeof isDesktopMode !== 'undefined' && isDesktopMode
 && typeof workspaceGroup !== 'undefined' && workspaceGroup === 'markets';
 const usePresetFilter = !desktopMarketsScanner && !!scannerPreset;
 const watchSet = new Set(wl);



 let filtered = list.filter(r => {
 if (search && !r.symbol.toLowerCase().includes(search)) return false;
 if (dir && r.direction !== dir) return false;
 if (mtf === 'confirmed' && !r.mtfConfirmed) return false;
 if (mtf === 'partial' && r.mtfConfirmed) return false;
 if (sector && normalizeSectorLabel(r.sector || getSector(r.symbol)) !== sector) return false;
 if (usePresetFilter && !matchesScannerPreset(r)) return false;
 if (setupFilter) {
 const sfLabel = String(r.setupFamilyLabel || '').trim();
 if (!sfLabel.toLowerCase().includes(setupFilter.toLowerCase())) return false;
 }
 return true;
 });


 filtered.sort((a, b) => {
 const aPin = watchSet.has(a.symbol) ? 1 : 0;
 const bPin = watchSet.has(b.symbol) ? 1 : 0;
 if (bPin !== aPin) return bPin - aPin;
 if (sort === 'tq') return Number(b.tradeQuality?.score || 0) - Number(a.tradeQuality?.score || 0);
 if (sort === 'change') return Math.abs(b.change24h) - Math.abs(a.change24h);
 if (sort === 'volume') return (b.volume24h || 0) - (a.volume24h || 0);
 if (sort === 'fr') return Math.abs(b.fundingRate || 0) - Math.abs(a.fundingRate || 0);
 if (sort === 'alpha') return a.symbol.localeCompare(b.symbol);
 return Number(b.score || 0) - Number(a.score || 0)
 || Number(b.tradeQuality?.score || 0) - Number(a.tradeQuality?.score || 0);
 });

 renderScannerInsightsRail(filtered);

 // Regime-aware banner: warn when choppy
 const regime = String(window._lastMarketIndex?.regime || '').toLowerCase();
 const isChoppy = regime.includes('chop') || regime.includes('neutral');
 const watchCount = filtered.filter(r => String(r.direction || '').includes('watch')).length;

 if (!filtered.length) {
 cont.innerHTML = `<div class="empty"><div class="ei">SEARCH</div><div class="eh">No matches</div>
 <div class="es">Try different filters</div></div>`;
 return;
 }

 const renderLimit = viewMode === 'compact' || viewMode === 'table' ? 300 : 120;
 const visibleRows = filtered.slice(0, renderLimit);
 const resultToolbar = buildScannerResultToolbar(filtered, visibleRows, viewMode, isChoppy, watchCount);
 const resultHtml = viewMode === 'compact'
 ? `<div class="scanner-table-wrap compact"><table class="scanner-compact-table"><thead><tr><th>Symbol</th><th>Action</th><th>Score</th><th title="Trade Quality">TQ</th><th>Setup</th><th>24H</th><th title="Funding Rate">FR</th><th>Vol</th></tr></thead><tbody>${visibleRows.map(r => buildCompactRow(r, watchSet.has(r.symbol), isChoppy)).join('')}</tbody></table></div>`
 : viewMode === 'table'
 ? buildScannerTable(visibleRows, watchSet, isChoppy)
 : `<div class="scanner-card-grid">${visibleRows.map(r => buildCard(r, watchSet.has(r.symbol), isChoppy)).join('')}</div>`;
 const _cardsHtml = resultToolbar + resultHtml;
 _raf('renderCards', () => {
 _setHtml(cont, _cardsHtml);


 // Attach click handlers

 cont.querySelectorAll('[data-sym]').forEach(el => {

 const sym = el.dataset.sym;

 const match = filtered.find(r => r.symbol === sym);

 el.addEventListener('click', e => {
 if (e.target.closest('.star-btn') || e.target.closest('[data-v16-card-action]') || e.target.closest('[data-scanner-view]')) return;
 if (match) openModal(match);

 });

 });

 cont.querySelectorAll('[data-v16-card-action]').forEach(btn => {

 btn.addEventListener('click', async e => {

 e.stopPropagation();

 const card = btn.closest('[data-sym]');

 const sym = card?.dataset?.sym;

 const match = filtered.find(r => r.symbol === sym);


 if (!match) return;

 if (btn.dataset.v16CardAction === 'chart') {

 await globalThis.openSignalInChartWorkspace?.(match);

 return;

 }

 if (btn.dataset.v16CardAction === 'review') {

 openModal(match);

 return;

 }

 if (btn.dataset.v16CardAction === 'risk') {

 openChartForSymbolCommand(match?.symbol || '', match);

 return;

 }

 if (btn.dataset.v16CardAction === 'track') {

 const result = await ensureSignalPosition(match);

 setActiveWorkspaceTab('chart', true, true);

 if (result?.ok) await renderAnalytics();

 }

 });

 });

 cont.querySelectorAll('.star-btn').forEach(btn => {
 btn.addEventListener('click', async e => {

 e.stopPropagation();

 await toggleWatchlist(btn.dataset.sym);

 });

 });

 cont.querySelectorAll('[data-scanner-view]').forEach(btn => {
 btn.addEventListener('click', async e => {
 e.stopPropagation();
 setScannerViewMode(btn.dataset.scannerView || 'cards');
 const d = await storeGet(['scanResults', 'manualWatchlist', 'watchlist', 'sectorBreadth']);
 renderCards(d.scanResults || [], document.getElementById('cardList'), d.manualWatchlist || d.watchlist || []);
 renderSectorBar(d.scanResults || [], d.sectorBreadth || null);
 });
 });

 });

}






// -- Compact Row Builder (table view) ----------------------------------------------------------------

function buildCompactRow(r, isPinned, isChoppyRegime = false) {
 const sc = r.score || 0;
 const scColor = sc >= 75 ? '#00e5a0' : sc >= 60 ? '#ffc840' : '#ff4560';
 const tq = Number(r.tradeQuality?.score || 0);
 const tqColor = tq >= 75 ? '#00e5a0' : tq >= 60 ? '#ffc840' : '#ff4560';
 const ch = r.change24h || 0;
 const fr = r.fundingRate || 0;
 const frClass = fr > 0 ? 'funding-pos' : fr < 0 ? 'funding-neg' : '';
 const dirClass = r.direction?.includes('short') ? 'short' : r.direction?.includes('watch') ? 'watch' : 'long';
 const dirLabel = scannerDirectionLabel(r.direction, true);
 const isWatchTier = String(r.direction || '').includes('watch') || sc < 62;
 const dimClass = (isChoppyRegime && isWatchTier) ? ' regime-dimmed' : '';
 const livePositions = Array.isArray(window._livePositionsCache) ? window._livePositionsCache : (Array.isArray(currentAnalyticsPositions) ? currentAnalyticsPositions : []);
 const openPos = livePositions.find(p => String(p.symbol || p.product_symbol || '').toUpperCase() === String(r.symbol || '').toUpperCase());
 const posMarker = openPos ? '<span class="card-in-pos compact">*</span>' : '';
 const age = r.ts ? timeAgo(r.ts) : '';
 const assetInfo = resolveScannerAssetInfo(r);
 const isRwa = isRwaScannerAsset(assetInfo);
 return `<tr class="scanner-compact-row${dimClass} ${isRwa ? 'scanner-rwa-row' : ''}" data-sym="${esc(r.symbol)}" title="${esc(scannerWhyLine(r, isChoppyRegime))}">
 <td class="compact-sym">${posMarker}<strong>${esc(r.symbol)}</strong>${isRwa ? '<span class="scanner-rwa-mini">RWA</span>' : ''}${isPinned ? ' PIN' : ''}${age ? `<span class="card-signal-age"> ${age}</span>` : ''}</td>
 <td><span class="card-dir ${dirClass}" style="font-size:9px;padding:2px 5px">${dirLabel}</span></td>
 <td style="color:${scColor};font-weight:700">${sc}</td>
 <td title="Trade Quality" style="color:${tqColor};font-weight:700">${tq || '--'}</td>
 <td class="compact-setup">${esc(String(r.setupFamilyLabel || 'Mixed'))}</td>
 <td class="${ch >= 0 ? 'up' : 'dn'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</td>
 <td title="Funding Rate" class="${frClass}">${fr !== 0 ? (fr > 0 ? '+' : '') + fr.toFixed(4) + '%' : '-'}</td>
 <td>${fmtLarge(r.volume24h)}</td>
 </tr>`;
}

function buildScannerTable(rows, watchSet, isChoppyRegime = false) {
 return `<div class="scanner-table-wrap"><table class="scanner-front-table">
 <thead><tr>
 <th>Symbol</th><th>Action</th><th>Score</th><th title="Trade Quality">TQ</th><th>Setup</th><th>24H</th><th title="Funding Rate">FR</th><th>Volume</th><th>Why shown</th>
 </tr></thead>
 <tbody>${rows.map(r => {
 const assetInfo = resolveScannerAssetInfo(r);
 const isRwa = isRwaScannerAsset(assetInfo);
 const score = Number(r.score || 0);
 const tq = Number(r.tradeQuality?.score || 0);
 const ch = Number(r.change24h || 0);
 const fr = Number(r.fundingRate || 0);
 const tier = scannerActionTier(r, isChoppyRegime);
 const dirClass = r.direction?.includes('short') ? 'short' : r.direction?.includes('watch') ? 'watch' : 'long';
 const frClass = fr > 0 ? 'funding-pos' : fr < 0 ? 'funding-neg' : '';
 const age = r.ts ? timeAgo(r.ts) : '';
 return `<tr class="scanner-front-row ${tier === 'dimmed' ? 'regime-dimmed' : ''} ${isRwa ? 'scanner-rwa-row' : ''}" data-sym="${esc(r.symbol)}">
 <td><strong>${esc(r.symbol || '')}</strong>${isRwa ? `<span class="scanner-rwa-mini">RWA</span>` : ''}${watchSet.has(r.symbol) ? '<span class="table-pin">PIN</span>' : ''}${age ? `<small>${age}</small>` : ''}</td>
 <td><span class="card-dir ${dirClass}">${esc(scannerDirectionLabel(r.direction))}</span></td>
 <td><span class="table-score">${score}/100</span></td>
 <td>${tq || '--'}</td>
 <td>${esc(String(r.setupFamilyLabel || 'Mixed'))}</td>
 <td class="${ch >= 0 ? 'up' : 'dn'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</td>
 <td class="${frClass}">${fr !== 0 ? `${fr > 0 ? '+' : ''}${fr.toFixed(4)}%` : '--'}</td>
 <td>${fmtLarge(r.volume24h)}</td>
 <td class="scanner-why-cell">${esc(scannerWhyLine(r, isChoppyRegime))}</td>
 </tr>`;
 }).join('')}</tbody>
 </table></div>`;
}

// -- Signal Card Builder - v14: sparkline, market structure, vol climax --

function resolveScannerAssetInfo(r = {}) {
 if (r.assetClass) {
 return {
 assetClass: r.assetClass,
 assetLabel: r.assetLabel || (String(r.assetClass).startsWith('tokenized_') ? 'Tokenized RWA' : 'NSE/BSE'),
 assetBadge: r.assetBadge || '',
 sector: r.sector || '',
 info: r.assetInfo || '',
 displayName: r.assetDisplayName || r.name || '',
 underlyingSymbol: r.underlyingSymbol || '',
 underlyingName: r.underlyingName || '',
 };
 }
 return typeof classifyDeltaInstrument === 'function' ? classifyDeltaInstrument(r.symbol || '') : {};
}

function isRwaScannerAsset(assetInfo = {}) {
 const cls = String(assetInfo?.assetClass || '').toLowerCase();
 const badge = String(assetInfo?.assetBadge || '').toLowerCase();
 return cls.startsWith('tokenized_') || badge.includes('rwa');
}

function scannerInr(value, digits = null) {
 const text = digits == null ? fmtPrice(value) : Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
 return `Rs ${text}`;
}

function buildCard(r, isPinned, isChoppyRegime = false) {

 const sc = r.score || 0;

 // Fixed: green >=75, yellow 60-74, red <60
 const scColor = sc >= 75 ? '#00e5a0' : sc >= 60 ? '#ffc840' : '#ff4560';

 // Dim Watch/Setup cards in choppy regime
 const isWatchTier = String(r.direction || '').includes('watch') || sc < 62;
 const regimeDim = isChoppyRegime && isWatchTier;

 const dirClass = r.direction?.includes('short') ? 'short' : r.direction?.includes('watch') ? 'watch' : 'long';

 const dirLabel = scannerDirectionLabel(r.direction);

 const ch = r.change24h || 0;

 const vol = fmtLarge(r.volume24h);

 const fr = r.fundingRate || 0;

 const frStr = fr !== 0 ? `${fr > 0 ? '+' : ''}${fr.toFixed(4)}%` : '--';

 const frClass = fr > 0 ? 'funding-pos' : fr < 0 ? 'funding-neg' : '';

 const assetInfo = resolveScannerAssetInfo(r);
 const isRwa = isRwaScannerAsset(assetInfo);
 const assetLabel = String(assetInfo.assetLabel || (isRwa ? 'RWA' : 'NSE/BSE')).trim();
 const assetBadge = String(assetInfo.assetBadge || (isRwa ? 'RWA' : 'NSE/BSE')).trim();
 const assetSubline = isRwa && (assetInfo.underlyingSymbol || assetInfo.underlyingName)
 ? `${assetInfo.underlyingSymbol || 'RWA'}${assetInfo.underlyingName && assetInfo.underlyingName !== assetInfo.underlyingSymbol ? ` | ${assetInfo.underlyingName}` : ''}`
 : '';
 const sec = normalizeSectorLabel(r.sector || assetInfo.sector || getSector(r.symbol));
 const productDescription = String(
 r.instrumentDescription
 || r.description
 || r.name
 || (typeof describeDeltaInstrument === 'function' ? describeDeltaInstrument(r.symbol || '') : '')
 || ''
 ).trim();
 const safeSymbol = esc(r.symbol || '');
 const safeDirLabel = esc(dirLabel || '');
 const safeSessionLabel = esc(String(r.session || '').toUpperCase());

 const d = r.daily, l = r.lower;

 const dScore = d?.score || 0, lScore = l?.score || 0;

 const dColor = dScore >= 70 ? '#00e5a0' : dScore >= 45 ? '#ffc840' : '#ff4560';

 const lColor = lScore >= 70 ? '#00e5a0' : lScore >= 45 ? '#ffc840' : '#ff4560';

 const tracked = getTrackedStatusForSymbol(r.symbol);

 const trackedPnl = getTrackedPnlState(r);

 const emerging = r.emergingMove || null;
 const actionState = typeof getV16SignalActionState === 'function' ? getV16SignalActionState(r) : null;
 const tradeQuality = Number(r.tradeQuality?.score || 0);
 const setupFamilyLabel = String(r.setupFamilyLabel || '').trim() || 'Mixed';

 // In Position badge - check live positions from account sync
 const livePositions = Array.isArray(window._livePositionsCache) ? window._livePositionsCache : (Array.isArray(currentAnalyticsPositions) ? currentAnalyticsPositions : []);
 const openPos = livePositions.find(p => String(p.symbol || p.product_symbol || '').toUpperCase() === String(r.symbol || '').toUpperCase());
 const inPositionBadge = openPos
 ? `<span class="card-in-pos ${Number(openPos.size || openPos.contracts || 0) > 0 ? 'long' : 'short'}">* OPEN</span>`
 : '';

 // Time-since-signal
 const signalAge = r.ts ? timeAgo(r.ts) : '';
 const signalAgeHtml = signalAge ? `<span class="card-signal-age">${signalAge}</span>` : '';


 const rsiTone = !d?.rsi ? 'warn'

 : (d.rsiBullishShift || d.rsiPositiveReversal || d.rsiZone === 'bull_support' || d.rsiZone === 'bull_range') ? 'ok'

 : (d.rsiBearishShift || d.rsiNegativeReversal || d.rsiZone === 'bear_resistance' || d.rsiZone === 'bear_range') ? 'fail'

 : 'warn';

 const rsiLabel = d?.rsiZone === 'bull_support' ? 'BULL SUP'

 : d?.rsiZone === 'bear_resistance' ? 'BEAR RES'

 : d?.rsiBullishShift ? 'BULL SHIFT'

 : d?.rsiBearishShift ? 'BEAR SHIFT'

 : d?.rsiRegime === 'bull_range' ? 'BULL RNG'

 : d?.rsiRegime === 'bear_range' ? 'BEAR RNG'

 : 'RSI';



 // Session badge (v14)

 const sessionHTML = '';



 // Sparkline SVG (v14)

 const sparkHTML = buildSparklineSVG(r.sparkline, r.direction);



 // MTF bars

 const mtfBarHTML = (d || l) ? `<div class="mtf-bars">

 ${d ? `<div class="mtf-bar-item"><span class="mtf-bar-label">1D</span>

 <div class="mtf-bar-track"><div class="mtf-bar-fill" style="width:${dScore}%;background:${dColor}"></div></div>

 <span class="mtf-bar-num" style="color:${dColor}">${dScore}</span></div>` : ''}

 ${l ? `<div class="mtf-bar-item"><span class="mtf-bar-label">${l.label || '15m'}</span>

 <div class="mtf-bar-track"><div class="mtf-bar-fill" style="width:${lScore}%;background:${lColor}"></div></div>

 <span class="mtf-bar-num" style="color:${lColor}">${lScore}</span></div>` : ''}

 </div>` : '';



 // Sentiment badge

 const sent = r.sentiment;

 const sentHTML = sent ? `<div class="chip ${sent.label === 'bullish' ? 'ok' : sent.label === 'bearish' ? 'fail' : 'warn'}">SENT ${sent.label.toUpperCase()}</div>` : '';



 // VWAP chip

 const vwapChip = l?.vwap != null ? `<div class="chip ${l.vwapAbove ? 'ok' : 'fail'}">${l.label || '15m'} VWAP ${l.vwapAbove ? '&uarr;' : '&darr;'}</div>` : '';



 // Volume Profile chip

 const vpChip = d?.volumeProfile ? `<div class="chip warn">VP: ${d.volumeProfile.priceVsVA}</div>` : '';



 // Market Structure chip (v14)

 const ms = d?.marketStructure;

 const msChip = ms ? `<div class="chip structure">${msIcon(ms.structure)} ${ms.structure.toUpperCase()}</div>` : '';



 // Volume Climax chip (v14)

 const vc = d?.volumeClimax;

 const vcChip = vc?.isClimax ? `<div class="chip climax">VOL ${vc.exhaustion ? 'EXHAUST' : vc.isBuyingClimax ? 'BUY CLX' : 'SELL CLX'}</div>` : '';

 const emergingChip = emerging

 ? `<div class="chip emerging ${emerging.side === 'short' ? 'short' : 'long'}">${emerging.mode === 'reversal' ? 'REVERSAL' : 'IGNITION'} ${emerging.strength.toUpperCase()}</div>`

 : '';

 const kl1D = getTFKeyLevels(r.keyLevels, '1D');

 const kl15m = getTFKeyLevels(r.keyLevels, '15m');

 const chipList = [

 isRwa ? `<div class="chip rwa-chip">${esc(assetBadge)}</div>` : '',

 r.mtfConfirmed ? '<div class="chip ok">MTF</div>' : '<div class="chip warn">PARTIAL</div>',

 emergingChip, sentHTML, vwapChip, vpChip, msChip, vcChip,

 d?.emaCross ? `<div class="chip ok">${d.emaCross.toUpperCase()} CROSS</div>` : '',

 d?.rsiBullishShift ? '<div class="chip ok">RSI BULL SHIFT</div>' : '',

 d?.rsiBearishShift ? '<div class="chip fail">RSI BEAR SHIFT</div>' : '',

 d?.rsiPositiveReversal ? '<div class="chip ok">UP RSI POS REV</div>' : '',

 d?.rsiNegativeReversal ? '<div class="chip fail">DOWN RSI NEG REV</div>' : '',

 d?.rsiDivergence ? `<div class="chip warn">RSI ${d.rsiDivergence.toUpperCase()} ${d.rsiDivergenceRole === 'bounce' ? 'BOUNCE' : 'CORR'}</div>` : '',

 d?.obvDivergence ? `<div class="chip ok">OBV DIV</div>` : '',

 d?.macdSignal?.includes('cross') ? `<div class="chip ok">MACD</div>` : '',

 d?.rsi ? `<div class="chip ${rsiTone}">${rsiLabel} ${d.rsi}</div>` : '',

 r.spike ? '<div class="chip spike">SPIKE</div>' : '',

 sc >= 80 ? '<div class="chip ok">HIGH</div>' : '',

 r.oiConfirmed ? '<div class="chip oi-confirm">OI+</div>' : '',

 r.shortsCovering ? '<div class="chip oi-cover">SC</div>' : '',

 r.liquidationRisk ? `<div class="chip fail">${r.liquidationRisk.risk === 'long_liquidation' ? 'LONG LIQ' : 'SQUEEZE'}</div>` : '',

 r.btcCorr != null ? (r.btcCorr > 0.85 ? '<div class="chip btc-corr">BTC</div>' : '<div class="chip btc-ind">IND</div>') : '',

 tracked.watched ? '<div class="chip tracked">WATCH</div>' : '',

 tracked.analytics ? '<div class="chip tracked">POS</div>' : '',

 trackedPnl.hasAny ? `<div class="chip ${trackedPnl.tone}">${trackedPnl.label}</div>` : '',

 ].filter(Boolean);

 const hiddenChipCount = Math.max(0, chipList.length - 6);

 const chips = chipList.slice(0, 6);

 if (hiddenChipCount) chips.push(`<div class="chip more">+${hiddenChipCount} MORE</div>`);

 const thesis = r.reasons?.length

 ? esc(r.reasons.slice(0, 2).join(' | '))

 : (r.mtfConfirmed ? 'MTF confirmed setup with scan-derived entry and risk.' : 'Single timeframe setup waiting for stronger confirmation.');

 const productLine = productDescription && productDescription.toUpperCase() !== String(r.symbol || '').toUpperCase()
 ? `<div class="card-product-name">${esc(productDescription)}</div>`
 : '';
 const assetRibbon = isRwa
 ? `<div class="scanner-asset-ribbon" title="${esc(assetInfo.info || 'RWA instrument separated from nse_bse flow.')}"><span>RWA</span><strong>${esc(assetLabel)}</strong>${assetSubline ? `<em>${esc(assetSubline)}</em>` : ''}</div>`
 : `<div class="scanner-asset-ribbon nse_bse"><span>F&amp;O</span><strong>NSE equity</strong></div>`;
 const trustNote = `Bias ${dirLabel.replace(/^[^\s]+\s/, '')} | ${sec} sector | ${r.mtfConfirmed ? 'confirmed' : 'developing'}${trackedPnl.hasAny ? ` | ${trackedPnl.totalPnl < 0 ? 'tracked drawdown' : 'tracked in profit'}` : ''}`;
 const actionTier = scannerActionTier(r, isChoppyRegime);
 const whyLine = scannerWhyLine(r, isChoppyRegime);

 const emergingHTML = emerging ? `

 <div class="card-emerging ${emerging.side === 'short' ? 'short' : 'long'}">

 <div class="card-emerging-head">

 <div class="card-emerging-kicker">${emerging.mode === 'reversal' ? 'Emerging Reversal' : 'Trend Ignition'}</div>

 <div class="card-emerging-strength">${emerging.strength.toUpperCase()}</div>

 </div>

 <div class="card-emerging-note">${esc(emerging.note)}</div>

 <div class="card-emerging-factors">${emerging.factors.map(esc).join(' | ')}</div>

 </div>` : '';

 const actionMarkup = typeof buildV16SignalActionMarkup === 'function' ? buildV16SignalActionMarkup(r) : '';


 return `

 <div class="card v16-signal-card scanner-tier-${actionTier} ${r.direction?.includes('short') ? 'short-card' : 'long-card'} ${sc >= 80 ? 'fire' : ''} ${isPinned ? 'pinned' : ''} ${regimeDim ? 'regime-dimmed' : ''} ${isRwa ? 'rwa-signal-card' : 'nse_bse-signal-card'}" data-sym="${safeSymbol}" data-asset-class="${esc(assetInfo.assetClass || 'nse_bse_derivative')}">
 <button class="star-btn ${isPinned ? 'starred' : ''}" data-sym="${r.symbol}" title="${isPinned ? 'Unpin' : 'Pin'}">${isPinned ? '&#9733;' : '&#9734;'}</button>

 <div class="card-top">

 <div>

 <div class="card-sym">${r.symbol}${r.spike ? ' [SPIKE]' : ''}${isPinned ? ' [PIN]' : ''}</div>
 ${productLine}

 ${assetRibbon}
 <div class="card-meta">${vol} vol &middot; <span title="Funding Rate">FR</span>: <span class="${frClass}">${frStr}</span> &middot; <span class="card-sector ${isRwa ? 'rwa' : ''}">${esc(sec)}</span>${sessionHTML}${signalAgeHtml}${inPositionBadge}</div>

 </div>

 <div class="card-dir ${dirClass}">${safeDirLabel}</div>

 </div>

 <div class="card-row">

 <div class="card-stat"><div class="cl">Price</div><div class="cv">${scannerInr(r.price)}</div></div>

 <div class="card-stat"><div class="cl">24h</div><div class="cv ${ch >= 0 ? 'up' : 'dn'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</div></div>

 <div class="card-stat"><div class="cl">Setup</div><div class="cv ${r.setupFamilyAllowedInRegime ? 'up' : 'wn'}">${esc(setupFamilyLabel)}</div></div>

 <div class="card-stat" title="Trade Quality"><div class="cl">TQ</div><div class="cv ${tradeQuality >= 75 ? 'up' : tradeQuality >= 60 ? 'wn' : 'dn'}">${tradeQuality || '--'}</div></div>

 </div>

 <div class="card-score-wrap">
 <div class="card-score-bar">
 <div class="card-score-fill" style="width:${sc}%;background:${scColor}"></div>
 <div class="card-score-tick" style="left:45%" title="Watch threshold (45)"></div>
 <div class="card-score-tick" style="left:62%" title="Setup threshold (62)"></div>
 <div class="card-score-tick card-score-tick-exec" style="left:75%" title="Execute threshold (75)"></div>
 </div>
 <div class="card-score-val" style="color:${scColor}">${sc}/100${sc >= 80 ? ' HOT' : ''}</div>
 </div>
 <div class="card-score-thresholds"><span>Watch 45</span><span>Setup 62</span><span>Execute 75</span></div>
 <div class="scanner-why-line">${esc(whyLine)}</div>

 ${emergingHTML}

 ${sparkHTML}

 ${mtfBarHTML}

 <div class="card-chips">${chips.join('')}</div>

 <div class="card-thesis">Why now: ${thesis}</div>

 <div class="card-reasons" style="display:block">${trustNote}${actionState ? ` | ${actionState.previewLabel}` : ''}</div>
 ${actionMarkup}
 </div>`;
}





// -- Sparkline SVG Builder (v14) ----------------------------------------------------------------

function buildSparklineSVG(data, direction) {

 if (!data || data.length < 3) return '';

 const W = 200, H = 28, pad = 1;

 const mn = Math.min(...data);

 const mx = Math.max(...data);

 const range = mx - mn || 1;

 const pts = data.map((v, i) => {

 const x = pad + (i / (data.length - 1)) * (W - 2 * pad);

 const y = pad + (1 - (v - mn) / range) * (H - 2 * pad);

 return `${x.toFixed(1)},${y.toFixed(1)}`;

 }).join(' ');

 const last = data[data.length - 1];

 const first = data[0];

 const color = last >= first ? '#00e5a0' : '#ff4560';

 return `<div class="card-sparkline"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">

 <defs><linearGradient id="spkg_${direction}" x1="0" y1="0" x2="0" y2="1">

 <stop offset="0%" stop-color="${color}" stop-opacity=".2"/>

 <stop offset="100%" stop-color="${color}" stop-opacity="0"/>

 </linearGradient></defs>

 <polygon points="${pad},${H - pad} ${pts} ${W - pad},${H - pad}" fill="url(#spkg_${direction})"/>

 <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.2"/>

 </svg></div>`;

}



// -- Market Structure Icon (v14) ----------------------------------------------------------------

function msIcon(structure) {

 const map = { uptrend: '&uarr;', downtrend: '&darr;', expanding: '&harr;', contracting: '&loz;', ranging: '&harr;' };

 return map[structure] || '&harr;';

}





// -- Filter controls ----------------------------------------------------------------

// Use event delegation so these fire even when the pane is lazily injected
let scannerFilterRefreshTimer = null;

async function refreshScannerFilters() {
 const d = await storeGet(['scanResults', 'manualWatchlist', 'watchlist', 'sectorBreadth']);
 renderCards(d.scanResults || [], document.getElementById('cardList'), d.manualWatchlist || d.watchlist || []);
 renderSectorBar(d.scanResults || [], d.sectorBreadth || null);
}

function scheduleScannerFilterRefresh(delay = 150) {
 if (scannerFilterRefreshTimer) clearTimeout(scannerFilterRefreshTimer);
 scannerFilterRefreshTimer = setTimeout(() => {
 scannerFilterRefreshTimer = null;
 refreshScannerFilters().catch(() => {});
 }, delay);
}

document.addEventListener('input', async (e) => {
 if (!['fSearch', 'fDir', 'fMTF', 'fSort', 'fSector'].includes(e.target?.id)) return;
 scheduleScannerFilterRefresh();
});
document.addEventListener('change', async (e) => {
 if (!['fDir', 'fMTF', 'fSort', 'fSector'].includes(e.target?.id)) return;
 scheduleScannerFilterRefresh();
});



document.querySelectorAll('#scannerPresets .preset-btn').forEach(btn => {
 btn.addEventListener('click', async () => {

 scannerPreset = btn.dataset.preset || '';

 document.querySelectorAll('#scannerPresets .preset-btn').forEach(b => b.classList.toggle('active', b === btn));

 chrome.storage.local.set({ scannerPreset });

 const d = await storeGet(['scanResults', 'manualWatchlist', 'watchlist', 'sectorBreadth']);

 renderCards(d.scanResults || [], document.getElementById('cardList'), d.manualWatchlist || d.watchlist || []);
 renderSectorBar(d.scanResults || [], d.sectorBreadth || null);

 });

});


// Scanner view cycle
document.addEventListener('click', async (e) => {
 const btn = e.target?.closest('#btnScannerView');
 if (!btn) return;
 const current = getScannerViewMode();
 const next = current === 'cards' ? 'table' : current === 'table' ? 'compact' : 'cards';
 setScannerViewMode(next);
 const d = await storeGet(['scanResults', 'manualWatchlist', 'watchlist', 'sectorBreadth']);
 renderCards(d.scanResults || [], document.getElementById('cardList'), d.manualWatchlist || d.watchlist || []);
 renderSectorBar(d.scanResults || [], d.sectorBreadth || null);
});

// Setup type filter delegation
document.addEventListener('change', async (e) => {
 if (e.target?.id !== 'fSetup') return;
 scheduleScannerFilterRefresh();
});





// ----------------------------------------------------------------

// WATCHLIST

// ----------------------------------------------------------------

async function toggleWatchlist(sym, opts = {}) {

 const d = await storeGet(['watchlist', 'scanResults', 'scanStatus', 'scanActive', 'scanProgress', 'scanHeartbeat']);

 const wl = d.watchlist || [];

 const idx = wl.indexOf(sym);

 if (opts.addOnly) {
 if (idx < 0) wl.push(sym);
 } else if (opts.removeOnly) {
 if (idx >= 0) wl.splice(idx, 1);
 } else {
 if (idx >= 0) wl.splice(idx, 1); else wl.push(sym);
 }
 await chrome.storage.local.set({ watchlist: wl });

 currentWatchlist = wl;

 await renderCards(d.scanResults || [], document.getElementById('cardList'), wl);

 if (opts.renderWatchlist || document.getElementById('pane-watchlist')?.classList.contains('active')) {

 await renderWatchlist();

 }

 return wl;

}



async function renderWatchlist() {

 const d = await storeGet(['watchlist', 'scanResults', 'scanStatus', 'scanActive']);

 const wl = d.watchlist || [];

 currentWatchlist = wl;

 const results = d.scanResults || [];

 const cont = document.getElementById('watchlistCards');



 if (!wl.length) {
 if (isScannerUiActive(d)) {
 cont.innerHTML = buildSkeletonMarkup(3, 'cards');
 return;
 }

 cont.innerHTML = `<div class="empty"><div class="ei">&#9733;</div><div class="eh">No symbols pinned yet</div>

 <div class="es">Go to Scanner &rarr; click &#9734; on any card to add it here</div></div>`;

 return;

 }



 const pinned = wl.map(sym => results.find(r => r.symbol === sym)).filter(Boolean);

 const missing = wl.filter(sym => !results.find(r => r.symbol === sym));



 let html = pinned.map(r => buildCard(r, true)).join('');

 if (missing.length) {

 html += `<div class="wl-missing">Warning: ${missing.join(', ')} -- run a scan to get current signals</div>`;

 }

 cont.innerHTML = html;



 cont.querySelectorAll('.card').forEach((el, i) => {

 if (!pinned[i]) return;

 bindWatchlistCard(el, pinned[i]);

 });

}



function bindWatchlistCard(el, signal) {

 if (!el || !signal) return;

 el.addEventListener('click', async e => {

 if (e.target.closest('.star-btn') || e.target.closest('[data-v16-card-action]')) return;
 lastWatchlistClickedSymbol = signal.symbol;

 await renderWatchlist();
 await refreshWatchlistStock(signal.symbol);

 });

 const star = el.querySelector('.star-btn');
 if (star) {
 star.addEventListener('click', async e => {

 e.stopPropagation();

 await toggleWatchlist(star.dataset.sym, { renderWatchlist: true });

 });

 }

 bindV16WatchlistCardActions(el, signal);
}



function bindV16WatchlistCardActions(el, signal) {

 if (!el || !signal) return;

 el.querySelectorAll('[data-v16-card-action]').forEach(btn => {

 btn.addEventListener('click', async e => {

 e.stopPropagation();

 lastWatchlistClickedSymbol = signal.symbol;

 const latest = await refreshWatchlistStock(signal.symbol) || signal;

 if (btn.dataset.v16CardAction === 'chart') {

 await globalThis.openSignalInChartWorkspace?.(latest);

 return;

 }

 if (btn.dataset.v16CardAction === 'review') {

 openModal(latest);

 return;

 }

 if (btn.dataset.v16CardAction === 'risk') {

 openChartForSymbolCommand(latest?.symbol || '', latest);

 return;

 }

 if (btn.dataset.v16CardAction === 'track') {

 const result = await ensureSignalPosition(latest);

 setActiveWorkspaceTab('chart', true, true);

 if (result?.ok) await renderAnalytics();

 }

 });

 });

}

async function refreshWatchlistStock(symbol) {
 const sym = String(symbol || '').toUpperCase().trim();

 if (!sym) return null;

 if (watchRefreshInFlight.has(sym)) return watchRefreshInFlight.get(sym);



 const statusEl = document.querySelector('#pane-watchlist .wl-tip');

 if (statusEl) statusEl.textContent = `Refreshing ${sym}...`;



 const req = new Promise(resolve => {

 chrome.runtime.sendMessage({ action: 'refreshSymbol', symbol: sym }, resolve);

 }).then(resp => {

 if (!resp?.ok || !resp.result) {

 if (statusEl) statusEl.textContent = `Warning: Could not refresh ${sym}.`;

 return null;

 }

 const updated = resp.result;

 const cont = document.getElementById('watchlistCards');

 const oldCard = cont?.querySelector(`.card[data-sym="${sym}"]`);

 if (oldCard) {

 const wrap = document.createElement('div');

 wrap.innerHTML = buildDecisionWatchCard(updated, {
 expanded: true,
 isManual: oldCard.dataset.manual === 'true',
 rankLabel: oldCard.dataset.rankLabel || 'Selected',
 });

 const newCard = wrap.firstElementChild;

 oldCard.replaceWith(newCard);

 bindWatchlistCard(newCard, updated);

 }

 if (statusEl) statusEl.textContent = `${sym} updated`;

 setTimeout(() => {

 if (statusEl) statusEl.textContent = 'Watch Queue ready. First priority card opens by default.';

 }, 1800);

 return updated;

 }).finally(() => {

 watchRefreshInFlight.delete(sym);

 });



 watchRefreshInFlight.set(sym, req);

 return req;

}



// Delegation: Clear Watchlist
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnClearWatchlist' && !e.target?.closest('#btnClearWatchlist')) return;
 if (!confirmDestructiveAction('Clear every symbol from the watchlist?', { title: 'Clear watchlist?' })) return;
 const d = await storeGet(['autoWatchlist']);
 await chrome.storage.local.set({
 manualWatchlist: [],
 watchlist: d.autoWatchlist || [],
 });
 currentWatchlist = [];
 renderWatchlist();
 const latest = await storeGet(['scanResults']);
 renderCards(latest.scanResults || [], document.getElementById('cardList'), []);
 showSystemToast('Watchlist cleared', 'All pinned symbols were removed from the watchlist.', 'success', 3200);
});



// Delegation: Refresh Watchlist
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnRefreshWatchlist' && !e.target?.closest('#btnRefreshWatchlist')) return;
 const d = await storeGet(['manualWatchlist', 'watchlist', 'autoWatchlist']);
 const wl = [...(d.autoWatchlist || []), ...(d.manualWatchlist || d.watchlist || [])];
 const target = lastWatchlistClickedSymbol || wl[0];
 if (!target) return;
 await refreshWatchlistStock(target);
});

function buildDecisionWatchCard(signal, opts = {}) {
 if (!signal) return '';
 const rawSym = String(signal.symbol || '').toUpperCase();
 const sym = esc(rawSym || '--');
 const setup = esc(signal.setupFamilyLabel || 'Mixed');
 const summary = esc(signal.shortlistSummary || signal.tradeQuality?.summary || signal.reasons?.[0] || 'best current candidate');
 const tradeQuality = Number(signal.tradeQuality?.score || 0);
 const score = Number(signal.score || 0);
 const price = Number(signal.price || signal.markPrice || signal.close || 0);
 const change24h = Number(signal.change24h || 0);
 const actionRaw = String(signal.shortlistAction || signal.decision?.action || 'WATCH').toUpperCase();
 const action = esc(actionRaw);
 const signalSide = String(signal.direction || '').includes('short') ? 'short' : 'long';
 const actionTone = actionRaw.includes('TRADE') ? signalSide : actionRaw.includes('CLOSE') ? 'watch' : String(signal.shortlistTone || 'muted') === 'good' ? signalSide : String(signal.shortlistTone || 'muted') === 'warn' ? 'watch' : '';
 const sideClass = signalSide === 'short' ? 'short-card' : 'long-card';
 const expanded = !!opts.expanded;
 const rank = opts.rankLabel ? `<div class="card-kicker">${esc(opts.rankLabel)}</div>` : '';
 const manualBadge = opts.isManual ? '<div class="chip tracked">Manual pin</div>' : '';
 const scoreClass = tradeQuality >= 75 ? 'up' : tradeQuality >= 60 ? 'wn' : 'dn';
 const scoreWidth = Math.max(0, Math.min(100, tradeQuality || score));
 const changeClass = change24h >= 0 ? 'up' : 'dn';
 const priceHtml = price ? `$${price.toFixed(price >= 10 ? 2 : 6)}` : '--';

 if (!expanded) {
 return `<div class="card v16-signal-card watch-queue-card watch-queue-card--compact ${sideClass} ${opts.isManual ? 'pinned' : ''}" data-sym="${sym}" data-rank-label="${esc(opts.rankLabel || '')}" data-manual="${opts.isManual ? 'true' : 'false'}">
 ${opts.isManual ? `<button class="star-btn starred" data-sym="${sym}" title="Unpin">&#9733;</button>` : ''}
 <div class="wq-row">
 <div class="wq-symbol">
 ${rank}
 <strong>${sym}</strong>
 <span>${esc(normalizeSectorLabel(signal.sector || getSector(signal.symbol)))} | ${esc(String(signal.direction || 'watch').toUpperCase())}</span>
 </div>
 <div class="wq-metric"><span>Price</span><strong>${priceHtml}</strong></div>
 <div class="wq-metric"><span>24h</span><strong class="${changeClass}">${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%</strong></div>
 <div class="wq-metric"><span>Setup</span><strong>${setup}</strong></div>
 <div class="wq-metric"><span>TQ</span><strong class="${scoreClass}">${tradeQuality || '--'}</strong></div>
 <div class="card-dir ${actionTone || 'watch'}">${action}</div>
 </div>
 </div>`;
 }

 return `<div class="card v16-signal-card watch-queue-card watch-queue-card--expanded ${sideClass} ${opts.isManual ? 'pinned' : ''}" data-sym="${sym}" data-rank-label="${esc(opts.rankLabel || '')}" data-manual="${opts.isManual ? 'true' : 'false'}">
 ${opts.isManual ? `<button class="star-btn starred" data-sym="${sym}" title="Unpin">&#9733;</button>` : ''}
 <div class="wq-expanded-head">
 <div>
 ${rank}
 <div class="card-sym">${sym}</div>
 <div class="card-meta">${esc(normalizeSectorLabel(signal.sector || getSector(signal.symbol)))} | ${esc(String(signal.direction || 'watch').toUpperCase())}${signal.session ? ` | ${esc(String(signal.session).toUpperCase())}` : ''}</div>
 </div>
 <div class="card-dir ${actionTone || 'watch'}">${action}</div>
 </div>
 <div class="wq-expanded-grid">
 <div class="card-stat"><div class="cl">Price</div><div class="cv">${priceHtml}</div></div>
 <div class="card-stat"><div class="cl">24h</div><div class="cv ${changeClass}">${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%</div></div>
 <div class="card-stat"><div class="cl">Score</div><div class="cv">${score}/100</div></div>
 <div class="card-stat"><div class="cl">TQ</div><div class="cv ${scoreClass}">${tradeQuality || '--'}</div></div>
 <div class="card-stat"><div class="cl">Setup</div><div class="cv">${setup}</div></div>
 <div class="card-stat"><div class="cl">RS</div><div class="cv ${signal.rsState === 'strong' ? 'up' : signal.rsState === 'weak' ? 'dn' : 'wn'}">${esc(signal.rsLabel || 'RS Mixed')}</div></div>
 </div>
 <div class="wq-score-track"><span style="width:${scoreWidth}%"></span><strong>${tradeQuality || score}/100</strong></div>
 <div class="card-thesis">Why now: ${summary}</div>
 <div class="card-chips">
 <div class="chip ${signal.setupFamilyAllowedInRegime ? 'ok' : 'warn'}">${signal.setupFamilyAllowedInRegime ? 'Regime fit' : 'Regime mismatch'}</div>
 <div class="chip ${signal.signalPersistence?.trend === 'improving' ? 'ok' : signal.signalPersistence?.spikeRisk ? 'fail' : 'warn'}">${esc(signal.signalPersistence?.label || 'Fresh')}</div>
 <div class="chip ${signal.sectorBreadthState === 'confirmed' ? 'ok' : signal.sectorBreadthState === 'weak' ? 'fail' : 'warn'}">${signal.sectorBreadthState === 'confirmed' ? 'Breadth confirms' : signal.sectorBreadthState === 'weak' ? 'Breadth weak' : 'Breadth mixed'}</div>
 ${manualBadge}
 </div>
 <div class="v16-signal-actions">
 <button class="v16-signal-btn secondary" data-v16-card-action="chart">Open Chart</button>
 <button class="v16-signal-btn primary" data-v16-card-action="review">Review</button>
 <button class="v16-signal-btn secondary" data-v16-card-action="risk">Risk Bridge</button>
 </div>
 </div>`;
}

async function toggleWatchlist(sym, opts = {}) {
 const d = await storeGet(['manualWatchlist', 'watchlist', 'autoWatchlist', 'scanResults', 'scanStatus', 'scanActive']);
 const manual = Array.isArray(d.manualWatchlist) ? d.manualWatchlist.slice() : Array.isArray(d.watchlist) ? d.watchlist.slice() : [];
 const normalized = String(sym || '').toUpperCase();
 const idx = manual.indexOf(normalized);

 if (opts.addOnly) {
 if (idx < 0) manual.push(normalized);
 } else if (opts.removeOnly) {
 if (idx >= 0) manual.splice(idx, 1);
 } else if (idx >= 0) {
 manual.splice(idx, 1);
 } else {
 manual.push(normalized);
 }

 const autoWatchlist = Array.isArray(d.autoWatchlist) ? d.autoWatchlist : [];
 const merged = globalThis.FWDTradeDeskShared?.mergeWatchlists
 ? globalThis.FWDTradeDeskShared.mergeWatchlists(manual, autoWatchlist)
 : manual;
 await chrome.storage.local.set({
 manualWatchlist: manual,
 watchlist: merged,
 });

 currentWatchlist = manual;
 await renderCards(d.scanResults || [], document.getElementById('cardList'), manual);

 if (opts.renderWatchlist || document.getElementById('pane-watchlist')?.classList.contains('active')) {
 await renderWatchlist();
 }
 return manual;
}

async function renderWatchlist(preloaded = null) {
 const d = preloaded ?? await storeGet(['manualWatchlist', 'watchlist', 'autoWatchlist', 'decisionShortlist', 'scanResults', 'scanStatus', 'scanActive', 'scanProgress', 'scanHeartbeat']);
 const manual = Array.isArray(d.manualWatchlist) ? d.manualWatchlist : Array.isArray(d.watchlist) ? d.watchlist : [];
 const autoWatchlist = Array.isArray(d.autoWatchlist) ? d.autoWatchlist : [];
 const shortlist = Array.isArray(d.decisionShortlist) ? d.decisionShortlist : [];
 currentWatchlist = manual;
 if (!_fp('renderWatchlist', [manual.join(','), autoWatchlist.join(','), shortlist.map(s=>s.symbol||'').join(','), lastWatchlistClickedSymbol, (d.scanStatus||''), (d.scanActive||false)].join('|'))) return;
 const results = d.scanResults || [];
 const cont = document.getElementById('watchlistCards');
 const tip = document.querySelector('#pane-watchlist .wl-tip');
 if (!cont) return;

 if (!manual.length && !autoWatchlist.length) {
 if (isScannerUiActive(d)) {
 cont.innerHTML = buildSkeletonMarkup(3, 'cards');
 return;
 }

 cont.innerHTML = `<div class="empty"><div class="ei">&#9733;</div><div class="eh">No Top 5 list yet</div><div class="es">Run a scan and the extension will auto-track the best 5 names here.</div></div>`;
 if (tip) tip.textContent = 'Auto Top 5 updates after every scan. Manual stars stay pinned until you remove them.';
 return;
 }

 const shortlistBySymbol = new Map(shortlist.map(signal => [String(signal.symbol || '').toUpperCase(), signal]));
 const autoCards = autoWatchlist
 .map(symbol => shortlistBySymbol.get(String(symbol || '').toUpperCase()) || results.find(r => String(r.symbol || '').toUpperCase() === String(symbol || '').toUpperCase()))
 .filter(Boolean);
 const manualCards = manual
 .filter(symbol => !autoWatchlist.includes(symbol))
 .map(symbol => results.find(r => String(r.symbol || '').toUpperCase() === String(symbol || '').toUpperCase()))
 .filter(Boolean);
 const missingManual = manual.filter(symbol => !autoWatchlist.includes(symbol) && !manualCards.find(item => String(item.symbol || '').toUpperCase() === String(symbol || '').toUpperCase()));
 const queueItems = [
 ...autoCards.map((signal, index) => ({ signal, isManual: false, rankLabel: `#${index + 1} ${signal.shortlistAction || 'WATCH'}` })),
 ...manualCards.map(signal => ({ signal, isManual: true, rankLabel: 'Manual pin' })),
 ];
 const queueSymbols = new Set(queueItems.map(item => String(item.signal?.symbol || '').toUpperCase()));
 const priorityItem =
 (lastWatchlistClickedSymbol && queueItems.find(item => String(item.signal?.symbol || '').toUpperCase() === String(lastWatchlistClickedSymbol).toUpperCase())) ||
 queueItems.find(item => String(item.signal?.shortlistAction || '').toUpperCase().includes('TRADE')) ||
 queueItems.find(item => String(item.signal?.shortlistAction || '').toUpperCase().includes('CLOSE')) ||
 queueItems[0] ||
 null;
 const expandedSymbol = String(priorityItem?.signal?.symbol || '').toUpperCase();
 if (!lastWatchlistClickedSymbol && expandedSymbol) lastWatchlistClickedSymbol = expandedSymbol;
 if (lastWatchlistClickedSymbol && !queueSymbols.has(String(lastWatchlistClickedSymbol).toUpperCase()) && expandedSymbol) {
 lastWatchlistClickedSymbol = expandedSymbol;
 }

 const autoMarkup = autoCards.length
 ? `<div class="watchlist-section watch-queue-section"><div class="phdr"><div><span>Watch Queue</span><small class="phdr-sub">Auto-ranked setups. First priority opens by default.</small></div></div>${autoCards.map((signal, index) => {
 const sym = String(signal.symbol || '').toUpperCase();
 return buildDecisionWatchCard(signal, { rankLabel: `#${index + 1} ${signal.shortlistAction || 'WATCH'}`, expanded: sym === lastWatchlistClickedSymbol });
 }).join('')}</div>`
 : '';
 const manualMarkup = manualCards.length
 ? `<div class="watchlist-section watch-queue-section"><div class="phdr"><div><span>Manual Pins</span><small class="phdr-sub">Your extra names outside the auto queue</small></div></div>${manualCards.map(signal => {
 const sym = String(signal.symbol || '').toUpperCase();
 return buildDecisionWatchCard(signal, { isManual: true, rankLabel: 'Manual pin', expanded: sym === lastWatchlistClickedSymbol });
 }).join('')}</div>`
 : '';
 const missingMarkup = missingManual.length ? `<div class="wl-missing">Run a scan to refresh: ${esc(missingManual.join(', '))}</div>` : '';

 const _wlHtml = `${autoMarkup}${manualMarkup}${missingMarkup}`;
 const _wlTip = `Top 5 auto list: ${autoCards.length} names. Manual pins: ${manual.length}.`;
 _raf('renderWatchlist', () => {
 _setHtml(cont, _wlHtml);
 if (tip) tip.textContent = _wlTip;
 cont.querySelectorAll('.card').forEach(el => {
 const sym = String(el.dataset.sym || '').toUpperCase();
 const signal = shortlistBySymbol.get(sym) || results.find(r => String(r.symbol || '').toUpperCase() === sym);
 if (!signal) return;
 bindWatchlistCard(el, signal);
 });
 if (expandedSymbol && !watchRefreshInFlight.has(expandedSymbol)) {
 setTimeout(() => refreshWatchlistStock(expandedSymbol), 0);
 }
 });
}

function renderScannerSpotlightV2(list, alerts, watchlist, shortlist = []) {
 const wrap = document.getElementById('scannerSpotlight');
 if (!wrap) return;
 if (!Array.isArray(list) || !list.length) {
 wrap.innerHTML = '';
 return;
 }
 const watchSet = new Set((watchlist || []).map(s => String(s || '').toUpperCase()));
 const decisionList = Array.isArray(shortlist) && shortlist.length
 ? shortlist
 : (globalThis.FWDTradeDeskShared?.buildDecisionShortlist
 ? globalThis.FWDTradeDeskShared.buildDecisionShortlist(list, { limit: 5 })
 : list.slice(0, 5));
 wrap.innerHTML = decisionList.slice(0, 5).map(signal => buildSpotlightCard(
 signal.shortlistLabel || `#${signal.shortlistRank || 0}`,
 signal.symbol || '--',
 `<strong>${signal.score || 0}/100</strong> | TQ ${signal.tradeQuality?.score || 0} | ${esc(signal.shortlistSummary || signal.tradeQuality?.summary || 'best current candidate')}`,
 watchSet.has(String(signal.symbol || '').toUpperCase())
 ? 'PINNED'
 : signal.shortlistAction || signal.setupFamilyLabel || 'WATCH',
 signal.shortlistTone === 'good' ? 'ok' : signal.shortlistTone === 'warn' ? 'warn' : 'neutral',
 signal
 )).join('');
 wrap.querySelectorAll('.scanner-spot-card[data-sym]').forEach(card => {
 card.addEventListener('click', () => {
 const sym = String(card.dataset.sym || '').toUpperCase();
 const match = list.find(r => String(r.symbol || '').toUpperCase() === sym);
 if (match) openModal(match);
 });
 });
}





// ----------------------------------------------------------------

// ANALYTICS TAB

// ----------------------------------------------------------------

function sanitizeAnalyticsSymbol(v) {

 const raw = String(v || '').toUpperCase().trim();

 if (!raw) return '';

 return raw.replace(/[^A-Z0-9]/g, '');

}



function toPosNum(v) {

 const n = Number(v);

 return Number.isFinite(n) && n > 0 ? n : 0;

}



async function refreshAnalyticsSymbolSuggestions(preloaded = null) {

 const listEl = document.getElementById('anSymbols');

 if (!listEl) return;



 const d = preloaded || await storeGet([

 'scanResults', 'fundingHeatmap', 'watchlist', 'correlationMatrix', 'analyticsPositions'

 ]);

 const set = new Set();

 const add = (sym) => {

 const s = sanitizeAnalyticsSymbol(sym);

 if (!s) return;

 set.add(s);

 const base = normalizeBaseSymbol(s);

 if (base) {

 set.add(base);

 set.add(`${base}USD`);

 set.add(`${base}USDT`);

 }

 };



 Object.values(SECTORS).forEach(arr => (arr || []).forEach(add));

 (d.scanResults || []).forEach(r => add(r.symbol));

 (d.fundingHeatmap || []).forEach(r => add(r.symbol));

 (d.watchlist || []).forEach(add);

 (d.correlationMatrix?.symbols || []).forEach(add);

 (d.analyticsPositions || []).forEach(p => add(p.symbol));



 const options = Array.from(set)

 .filter(Boolean)

 .sort((a, b) => a.localeCompare(b))

 .slice(0, 1200);



 listEl.innerHTML = options.map(sym => `<option value="${esc(sym)}"></option>`).join('');

}



function analyticsScanEpoch(results) {

 return (results || []).reduce((mx, r) => Math.max(mx, Number(r?.ts || 0)), 0);

}



function buildAnalyticsPriceLookup(scanResults, fundingHeatmap) {

 const map = new Map();

 const add = (sym, price) => {

 const s = String(sym || '').toUpperCase().trim();

 const p = Number(price);

 if (!s || !Number.isFinite(p) || p <= 0) return;

 map.set(s, p);

 const base = normalizeBaseSymbol(s);

 if (base) {

 if (!map.has(base)) map.set(base, p);

 if (!map.has(`${base}USD`)) map.set(`${base}USD`, p);

 if (!map.has(`${base}USDT`)) map.set(`${base}USDT`, p);

 }

 };

 (scanResults || []).forEach(r => add(r.symbol, r.price || r.entry));

 (fundingHeatmap || []).forEach(r => add(r.symbol, r.price));

 return map;

}



function buildFundingLookup(scanResults, fundingHeatmap) {

 const map = new Map();

 const add = (sym, fundingRate, nextFundingAt) => {

 const s = sanitizeAnalyticsSymbol(sym);

 if (!s) return;

 const fr = Number(fundingRate || 0);

 const nextTs = Number(nextFundingAt || 0);

 const item = {

 fundingRate: Number.isFinite(fr) ? fr : 0,

 nextFundingAt: Number.isFinite(nextTs) ? nextTs : 0,

 };

 map.set(s, item);

 const base = normalizeBaseSymbol(s);

 if (base) {

 if (!map.has(base)) map.set(base, item);

 if (!map.has(`${base}USD`)) map.set(`${base}USD`, item);

 if (!map.has(`${base}USDT`)) map.set(`${base}USDT`, item);

 }

 };

 (scanResults || []).forEach(r => add(r.symbol, r.fundingRate, r.nextFundingAt));

 (fundingHeatmap || []).forEach(r => add(r.symbol, r.fundingRate, r.nextFundingAt));

 return map;

}



function resolveAnalyticsPrice(symbol, lookup) {

 const raw = sanitizeAnalyticsSymbol(symbol);

 if (!raw) return { symbol: '', price: null };

 const base = normalizeBaseSymbol(raw);

 const hasQuote = /(USD|USDT)$/.test(raw);

 const candidates = hasQuote

 ? [raw, base, `${base}USD`, `${base}USDT`].filter(Boolean)

 : [`${base}USD`, `${base}USDT`, raw, base].filter(Boolean);

 for (const c of candidates) {

 const p = lookup.get(c);

 if (Number.isFinite(p) && p > 0) return { symbol: c, price: p };

 }

 return { symbol: raw, price: null };

}



function resolveFundingInfo(symbol, lookup) {

 const raw = sanitizeAnalyticsSymbol(symbol);

 if (!raw) return { symbol: '', fundingRate: 0, nextFundingAt: 0 };

 const base = normalizeBaseSymbol(raw);

 const hasQuote = /(USD|USDT)$/.test(raw);

 const candidates = hasQuote

 ? [raw, base, `${base}USD`, `${base}USDT`].filter(Boolean)

 : [`${base}USD`, `${base}USDT`, raw, base].filter(Boolean);

 for (const c of candidates) {

 const item = lookup.get(c);

 if (item) {

 return {

 symbol: c,

 fundingRate: Number(item.fundingRate || 0),

 nextFundingAt: Number(item.nextFundingAt || 0),

 };

 }

 }

 return { symbol: raw, fundingRate: 0, nextFundingAt: 0 };

}



function buildMiniPnlChart(values, idSeed = 'an') {

 if (!Array.isArray(values) || values.length < 2) return '';

 const clean = values.map(v => Number(v)).filter(v => Number.isFinite(v));

 if (clean.length < 2) return '';

 const W = 300, H = 54, P = 4;

 const mn = Math.min(...clean);

 const mx = Math.max(...clean);

 const range = mx - mn || 1;

 const pts = clean.map((v, i) => {

 const x = P + (i / (clean.length - 1)) * (W - P * 2);

 const y = H - P - ((v - mn) / range) * (H - P * 2);

 return `${x.toFixed(1)},${y.toFixed(1)}`;

 }).join(' ');

 const first = clean[0];

 const last = clean[clean.length - 1];

 const color = last >= first ? '#00e5a0' : '#ff4560';

 const gradId = `anp_${idSeed}`.replace(/[^A-Za-z0-9_]/g, '');

 return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">

 <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">

 <stop offset="0%" stop-color="${color}" stop-opacity=".22"/>

 <stop offset="100%" stop-color="${color}" stop-opacity="0"/>

 </linearGradient></defs>

 <polygon points="${P},${H - P} ${pts} ${W - P},${H - P}" fill="url(#${gradId})"/>

 <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/>

 </svg>`;

}

let manageAnalyticsSource = 'live';
let manageAnalyticsRange = '30d';
let analyticsManageSafeCache = {
 key: '',
 metaText: '',
};

async function loadManageAnalyticsPrefs() {
 const prefs = await storeGet(['manageAnalyticsSource', 'manageAnalyticsRange']);
 manageAnalyticsSource = 'live';
 manageAnalyticsRange = ['today', '7d', '30d', '365d'].includes(String(prefs.manageAnalyticsRange || ''))
 ? String(prefs.manageAnalyticsRange || '30d')
 : '30d';
}

function buildManageAnalyticsSummary(model = null) {
 if (!model) {
 return `
 <div class="an-scard manage-highlight"><div class="an-sl">REVIEW TRADES</div><div class="an-sv">0</div></div>
 <div class="an-scard manage-highlight"><div class="an-sl">REALIZED</div><div class="an-sv">$0.00</div></div>
 <div class="an-scard manage-highlight"><div class="an-sl">EXPECTANCY</div><div class="an-sv">$0.00</div></div>
 <div class="an-scard manage-highlight"><div class="an-sl">MAX DD</div><div class="an-sv">$0.00</div></div>`;
 }
 return `
 <div class="an-scard manage-highlight"><div class="an-sl">REVIEW TRADES</div><div class="an-sv">${model.closedTrades.length}</div></div>
 <div class="an-scard manage-highlight"><div class="an-sl">REALIZED</div><div class="an-sv ${model.realized >= 0 ? 'green' : 'red'}">${model.realized >= 0 ? '+' : '-'}$${Math.abs(model.realized).toFixed(2)}</div></div>
 <div class="an-scard manage-highlight"><div class="an-sl">EXPECTANCY</div><div class="an-sv ${model.expectancy >= 0 ? 'green' : 'red'}">${model.expectancy >= 0 ? '+' : '-'}$${Math.abs(model.expectancy).toFixed(2)}</div></div>
 <div class="an-scard manage-highlight"><div class="an-sl">MAX DD</div><div class="an-sv red">-$${Math.abs(model.maxDrawdown || 0).toFixed(2)}</div></div>
 <div class="an-scard manage-highlight"><div class="an-sl">WIN RATE</div><div class="an-sv ${model.winRate >= 50 ? 'green' : 'red'}">${model.winRate.toFixed(1)}%</div></div>
 <div class="an-scard manage-highlight"><div class="an-sl">STREAK</div><div class="an-sv ${model.streakTone === 'win' ? 'green' : model.streakTone === 'loss' ? 'red' : ''}">${model.streak ? `${model.streak} ${model.streakTone}` : 'Flat'}</div></div>`;
}

function renderManageAnalyticsToolbar(model = null) {
 const toolbar = document.getElementById('analyticsToolbar');
 if (!toolbar) return;
 toolbar.innerHTML = `
 <div class="manage-toolbar-group">
 <span class="manage-toolbar-label">Source</span>
 <button class="manage-filter-btn active" data-manage-source="live">LIVE</button>
 </div>
 <div class="manage-toolbar-group">
 <span class="manage-toolbar-label">Range</span>
 ${['today', '7d', '30d', '365d'].map(range => `<button class="manage-filter-btn ${manageAnalyticsRange === range ? 'active' : ''}" data-manage-range="${range}">${range.toUpperCase()}</button>`).join('')}
 </div>
 <div class="manage-toolbar-meta">${model ? `${model.closedTrades.length} reviewed trades | ${model.symbolBreakdown.length} symbols in view` : 'Manage review loads from synced live history'}</div>`;
 toolbar.querySelectorAll('[data-manage-source]').forEach(button => {
 button.addEventListener('click', async () => {
 manageAnalyticsSource = button.dataset.manageSource || 'live';
 await chrome.storage.local.set({ manageAnalyticsSource });
 renderAnalytics();
 });
 });
 toolbar.querySelectorAll('[data-manage-range]').forEach(button => {
 button.addEventListener('click', async () => {
 manageAnalyticsRange = button.dataset.manageRange || '30d';
 await chrome.storage.local.set({ manageAnalyticsRange });
 renderAnalytics();
 });
 });
}

function buildManageAnalyticsChart(model = null) {
 const filterLabel = `${manageAnalyticsSource.toUpperCase()} | ${manageAnalyticsRange.toUpperCase()}`;
 if (!model || model.equityPoints.length < 2) {
 return `
 <div class="an-chart-box manage-chart-box">
 <div>
 <div class="an-chart-kicker">Review Equity</div>
 <div class="an-chart-title">Closed trades will build the performance curve</div>
 <div class="an-chart-copy">Live fills are stored locally. The selected review filter needs at least two closed trades before the equity curve can render.</div>
 </div>
 <div class="an-chart-meta"><span>${filterLabel}</span><span>Need 2 closed trades</span></div>
 </div>`;
 }
 const series = model.equityPoints.map(point => Number(point.equity || 0));
 return `
 <div class="an-chart-box manage-chart-box">
 ${buildMiniPnlChart(series, `manage_${manageAnalyticsSource}_${manageAnalyticsRange}`)}
 <div class="an-chart-meta"><span>Performance equity (${model.equityPoints.length} events)</span><span>${filterLabel}</span></div>
 </div>`;
}

function buildManageAnalyticsRows(model = null) {
 if (!model || (!model.closedTrades.length && !model.symbolBreakdown.length)) {
 return `
 <div class="manage-review-grid">
 <div class="manage-review-panel">
 <div class="manage-review-head"><div class="manage-review-kicker">Performance Lab</div><div class="manage-review-title">No reviewed trades in this filter yet</div></div>
 <div class="manage-review-copy">Closed live trades will appear here automatically as Manage history grows.</div>
 </div>
 <div class="manage-review-panel">
 <div class="manage-review-head"><div class="manage-review-kicker">Symbol Breakdown</div><div class="manage-review-title">Nothing to rank yet</div></div>
 <div class="manage-review-copy">Once trades close, this panel will show which symbols are driving the result for the active filter.</div>
 </div>
 </div>`;
 }
 const breakdown = model.symbolBreakdown.map(item => `<div class="manage-breakdown-row"><strong>${esc(item.symbol)}</strong><span>${item.trades} trades</span><span class="${item.pnl >= 0 ? 'green' : 'red'}">${item.pnl >= 0 ? '+' : '-'}$${Math.abs(item.pnl).toFixed(2)}</span></div>`).join('');
 const recent = model.closedTrades.slice(-8).reverse().map(trade => `<div class="manage-review-row"><div><strong>${esc(trade.symbol)}</strong><small>${esc(String(trade.side || '').toUpperCase())} | ${trade.holdMinutes}m</small></div><div><strong class="${trade.pnl >= 0 ? 'green' : 'red'}">${trade.pnl >= 0 ? '+' : '-'}$${Math.abs(trade.pnl).toFixed(2)}</strong><small>${trade.review?.notes ? esc(trade.review.notes) : 'No notes yet'}</small></div></div>`).join('');
 return `
 <div class="manage-review-grid">
 <div class="manage-review-panel">
 <div class="manage-review-head"><div class="manage-review-kicker">Performance Lab</div><div class="manage-review-title">Recent Closed Trades</div></div>
 ${recent}
 </div>
 <div class="manage-review-panel">
 <div class="manage-review-head"><div class="manage-review-kicker">Symbol Breakdown</div><div class="manage-review-title">Where The P&L Came From</div></div>
 ${breakdown}
 </div>
 </div>`;
}

function renderAnalyticsLiveReview(bundle = {}, model = null) {
 const wrap = document.getElementById('analyticsLiveReview');
 if (!wrap) return;
 const ledger = bundle?.liveLedger || {};
 const diagnostics = ledger?.historyDiagnostics || {};
 const historyWindowDays = Number(ledger.historyWindowDays || 0);
 const windowLabel = historyWindowDays > 0 ? `last ${historyWindowDays} days` : 'loaded window';
 const trades = Array.isArray(model?.closedTrades) ? model.closedTrades.slice().reverse().slice(0, 10) : [];
 const rawFills = Array.isArray(ledger.rawFills) ? ledger.rawFills : [];
 const rawOrders = Array.isArray(ledger.rawOrderHistory) ? ledger.rawOrderHistory : [];
 const fillSource = Array.isArray(ledger.fills) && ledger.fills.length ? ledger.fills : rawFills;
 const orderSource = Array.isArray(ledger.orderHistory) && ledger.orderHistory.length ? ledger.orderHistory : rawOrders;
 const fillAttemptError = (Array.isArray(diagnostics?.fills?.attempts) ? diagnostics.fills.attempts : []).map(attempt => attempt?.error).find(Boolean) || '';
 const orderAttemptError = (Array.isArray(diagnostics?.orderHistory?.attempts) ? diagnostics.orderHistory.attempts : []).map(attempt => attempt?.error).find(Boolean) || '';
 const normalizedFills = typeof v16NormalizeFill === 'function'
 ? (fillSource || []).map(v16NormalizeFill).filter(fill => fill.symbol && fill.createdAt > 0)
 : [];
 const normalizedOrders = typeof v16NormalizeOrderHistoryItem === 'function'
 ? (orderSource || []).map(v16NormalizeOrderHistoryItem).filter(order => order.symbol && order.createdAt > 0)
 : [];
 const feed = normalizedFills.length ? normalizedFills : normalizedOrders;
 const usingOrders = !normalizedFills.length && normalizedOrders.length;
 const journalHtml = trades.length
 ? trades.map(trade => `
 <button class="live-journal-row ${trade.review?.notes ? '' : 'pending'}" data-analytics-journal-id="${esc(trade.id)}">
 <div class="live-journal-top">
 <strong>${esc(trade.symbol)}</strong>
 <span class="${trade.pnl >= 0 ? 'good' : 'bad'}">${trade.pnl >= 0 ? '+' : '-'}$${Math.abs(trade.pnl).toFixed(2)}</span>
 </div>
 <div class="live-journal-meta">${esc(String(trade.side || '').toUpperCase())} | ${trade.holdMinutes}m | ${typeof v16FormatTs === 'function' ? esc(v16FormatTs(trade.closedAt)) : esc(new Date(trade.closedAt).toLocaleString())}</div>
 <div class="live-journal-meta">${trade.review?.notes ? esc(trade.review.notes) : 'Pending post-trade notes'}</div>
 </button>`).join('')
 : `<div class="empty"><div class="ei">JRNL</div><div class="eh">No journal trades yet</div><div class="es">Closed positions detected from market activity in the ${windowLabel} will appear here.</div></div>`;
 const feedHtml = feed.length
 ? feed.slice(0, 20).map(item => `
 <div class="live-fill-row ${usingOrders ? 'is-order-row' : ''}">
 <div>
 <div class="live-fill-symbol">${esc(item.symbol)}</div>
 <div class="live-fill-meta">${esc(String(item.side || '').toUpperCase())} | ${Number(item.size || 0).toFixed(4).replace(/\.?0+$/, '')}${Number(item.price || 0) > 0 ? ` @ $${typeof v16FmtPrice === 'function' ? v16FmtPrice(item.price) : Number(item.price).toFixed(4)}` : ''}${usingOrders ? ` | ${esc(String(item.state || '').toUpperCase())}` : ''}</div>
 </div>
 <div class="live-fill-right">
 <strong>${typeof v16FormatTs === 'function' ? esc(v16FormatTs(item.createdAt)) : esc(new Date(item.createdAt).toLocaleString())}</strong>
 <small>${usingOrders ? 'Order history fallback' : `Fee -$${Math.abs(Number(item.commission || 0)).toFixed(4)}`}</small>
 </div>
 </div>`).join('')
 : `<div class="empty"><div class="ei">History</div><div class="eh">No trade activity loaded</div><div class="es">No fills or order history were returned in the ${windowLabel}.</div></div>`;
 const diagnosticsCopy = (rawFills.length || rawOrders.length || diagnostics?.fills?.strategy || diagnostics?.orderHistory?.strategy || fillAttemptError || orderAttemptError)
 ? `<div class="manage-review-diagnostic">History sync: parsed ${normalizedFills.length} fills / ${normalizedOrders.length} orders | raw ${rawFills.length} fills / ${rawOrders.length} orders${diagnostics?.fills?.strategy ? ` | fills ${esc(diagnostics.fills.strategy)}` : ''}${diagnostics?.orderHistory?.strategy ? ` | orders ${esc(diagnostics.orderHistory.strategy)}` : ''}${fillAttemptError ? ` | fill error ${esc(fillAttemptError)}` : ''}${orderAttemptError ? ` | order error ${esc(orderAttemptError)}` : ''}</div>`
 : '';
 wrap.innerHTML = `
 <article class="live-journal-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">REVIEW LOOP</div>
 <div class="live-card-title">Trade Journal</div>
 </div>
 <div class="live-card-meta">${model?.pendingReviews ? `${model.pendingReviews} trade${model.pendingReviews === 1 ? '' : 's'} still need notes.` : `${trades.length} closed trade${trades.length === 1 ? '' : 's'} in view.`}</div>
 </div>
 <div class="live-journal-rows" id="analyticsJournalRows">${journalHtml}</div>
 </article>
 <article class="live-trade-history-card">
 <div class="live-card-head">
 <div>
 <div class="live-card-kicker">EXCHANGE FEED</div>
 <div class="live-card-title">Trade History</div>
 </div>
 <div class="live-card-meta">${usingOrders ? `${normalizedOrders.length} ${windowLabel} orders loaded.` : `${normalizedFills.length} ${windowLabel} fills loaded.`}</div>
 </div>
 <div class="live-trade-history-rows" id="analyticsTradeHistoryRows">${feedHtml}</div>
 </article>
 ${diagnosticsCopy}`;
 wrap.querySelectorAll('[data-analytics-journal-id]').forEach(button => {
 button.addEventListener('click', () => {
 const trade = (model?.closedTrades || []).find(item => item.id === button.dataset.analyticsJournalId);
 if (trade && typeof openV16JournalDetail === 'function') openV16JournalDetail(trade);
 });
 });
}

function buildManageAnalyticsMeta(model = null, options = {}) {
 const lastScan = options.lastScan || '';
 const livePriced = Number(options.livePriced || 0);
 const totalRows = Number(options.totalRows || 0);
 const missing = Math.max(0, Number(options.missing || 0));
 const filterLabel = `${manageAnalyticsSource.toUpperCase()} / ${manageAnalyticsRange.toUpperCase()}`;
 if (!totalRows) {
 return model?.closedTrades?.length
 ? `Review filter ${filterLabel} loaded. Add manual positions when you want mark-to-market tracking.`
 : 'Run a scan for latest prices, then add manual positions or let synced live history populate the performance lab.';
 }
 return `Last scan: ${lastScan || '--'} | Live priced: ${livePriced}/${totalRows}${missing ? ` | Missing: ${missing}` : ''} | Review filter ${filterLabel} active | Click a manual position row to refresh price`;
}

async function renderAnalytics(preloaded = null) {
 const rowsWrap = document.getElementById('analyticsRows');

 const summaryEl = document.getElementById('analyticsSummary');

 const chartEl = document.getElementById('analyticsChart');

 const metaEl = document.getElementById('analyticsMeta');

 if (!rowsWrap || !summaryEl || !chartEl || !metaEl) return;

 if (analyticsRenderInFlight) return;

 analyticsRenderInFlight = true;

 if (summaryEl.dataset.ready !== 'true') {
 summaryEl.innerHTML = buildSkeletonMarkup(4, 'cards');
 chartEl.innerHTML = buildSkeletonMarkup(1, 'rows');
 rowsWrap.innerHTML = buildSkeletonMarkup(2, 'rows');
 metaEl.textContent = 'Loading analytics...';
 }



 try {
 await loadManageAnalyticsPrefs();
 const d = await storeGet([

 'analyticsPositions', 'analyticsPnlHistory', 'scanResults', 'fundingHeatmap', 'lastScan',

 'watchlist', 'correlationMatrix'

 ]);

 await refreshAnalyticsSymbolSuggestions(d);

 const scanResults = preloaded?.scanResults || d.scanResults || [];

 const fundingHeatmap = d.fundingHeatmap || [];

 const lastScan = preloaded?.lastScan || d.lastScan || '';
 const manageBundle = await v16GetManageHistoryBundle?.();
 const manageModel = manageBundle ? v16BuildManageAnalyticsModel(manageBundle, { source: manageAnalyticsSource, range: manageAnalyticsRange }) : null;
 renderManageAnalyticsToolbar(manageModel);
 const positions = Array.isArray(d.analyticsPositions) ? d.analyticsPositions : [];

 let history = Array.isArray(d.analyticsPnlHistory) ? d.analyticsPnlHistory.slice(-ANALYTICS_HISTORY_LIMIT) : [];

 if (!lastAnalyticsScanMarker && history.length) {

 const lastItem = history[history.length - 1];

 lastAnalyticsScanMarker = String(lastItem?.marker || '');

 lastAnalyticsScanEpoch = Number(lastItem?.scanEpoch || 0);

 }



 if (!positions.length) {

 summaryEl.innerHTML = `

 <div class="an-scard"><div class="an-sl">POSITIONS</div><div class="an-sv">0</div></div>

 <div class="an-scard"><div class="an-sl">LIVE PRICED</div><div class="an-sv">0</div></div>

 <div class="an-scard"><div class="an-sl">TOTAL P&L</div><div class="an-sv">$0.00</div></div>

 <div class="an-scard"><div class="an-sl">P&L %</div><div class="an-sv">0.00%</div></div>

 `;
 summaryEl.innerHTML = `${buildManageAnalyticsSummary(manageModel)}${summaryEl.innerHTML}`;
 chartEl.innerHTML = '<div class="an-chart-box"><div class="an-chart-meta"><span>P&L Trend</span><span>Add positions to start</span></div></div>';
 chartEl.innerHTML = `${buildManageAnalyticsChart(manageModel)}${chartEl.innerHTML}`;
 rowsWrap.innerHTML = `<div class="empty"><div class="ei">POS</div><div class="eh">No positions yet</div>

 <div class="es">Enter symbol, entry price, qty or trade value, then click Add.</div></div>`;
 rowsWrap.innerHTML = `${buildManageAnalyticsRows(manageModel)}${rowsWrap.innerHTML}`;
 metaEl.textContent = manageModel?.closedTrades?.length
 ? `Review filter ${manageAnalyticsSource.toUpperCase()} | ${manageAnalyticsRange.toUpperCase()} loaded. Add manual positions when you want mark-to-market tracking.`
 : 'Run a scan for latest prices, then add manual positions or let synced live history populate the performance lab.';
 updateWorkspaceInsights({

 alerts: currentAlertsCache,

 watchlist: currentWatchlist,

 analyticsPositions: positions,

 marketIndex: (await storeGet(['marketIndex'])).marketIndex,

 scanResults,

 scanStatus: null,

 lastScan,

 });

 return;

 }



 const lookup = buildAnalyticsPriceLookup(scanResults, fundingHeatmap);

 const rows = positions.map(p => {

 const entry = toPosNum(p.entry);

 const qty = toPosNum(p.qty);

 const tradeValueInput = toPosNum(p.tradeValue);

 const derivedQty = qty > 0 ? qty : (entry > 0 && tradeValueInput > 0 ? (tradeValueInput / entry) : 0);

 const exposure = tradeValueInput > 0 ? tradeValueInput : (entry > 0 && derivedQty > 0 ? entry * derivedQty : 0);

 const side = p.side === 'short' ? 'short' : 'long';

 const resolved = resolveAnalyticsPrice(p.symbol, lookup);

 const hasLivePrice = Number.isFinite(resolved.price) && resolved.price > 0;

 const currentPrice = hasLivePrice ? resolved.price : null;

 const resolvedSymbol = sanitizeAnalyticsSymbol(resolved.symbol || p.symbol);

 const dir = side === 'short' ? -1 : 1;

 const pnl = hasLivePrice && entry > 0 && derivedQty > 0 ? (currentPrice - entry) * derivedQty * dir : null;

 const pnlPct = hasLivePrice && exposure > 0 && pnl != null ? (pnl / exposure * 100) : null;

 return {

 id: p.id,

 symbol: sanitizeAnalyticsSymbol(p.symbol),

 resolvedSymbol,

 side,

 entry,

 qty: derivedQty,

 tradeValue: exposure,

 hasLivePrice,

 currentPrice,

 pnl,

 pnlPct,

 };

 });



 const priced = rows.filter(r => r.hasLivePrice);

 const totalPnl = priced.reduce((s, r) => s + (r.pnl || 0), 0);

 const totalExposure = rows.reduce((s, r) => s + (r.tradeValue || 0), 0);

 const totalPnlPct = totalExposure > 0 ? (totalPnl / totalExposure * 100) : 0;

 const wins = priced.filter(r => (r.pnl || 0) >= 0).length;

 const losses = priced.filter(r => (r.pnl || 0) < 0).length;

 const scanEpoch = analyticsScanEpoch(scanResults);

 const marker = scanEpoch > 0 ? `ts:${scanEpoch}` : (lastScan ? `ls:${lastScan}` : '');



 if (marker && marker !== lastAnalyticsScanMarker) {

 const byId = {};

 rows.forEach(r => { if (r.pnl != null) byId[r.id] = +r.pnl.toFixed(4); });

 history.push({

 ts: Date.now(),

 marker,

 scanEpoch,

 totalPnl: +totalPnl.toFixed(4),

 totalExposure: +totalExposure.toFixed(4),

 byId,

 });

 history = history.slice(-ANALYTICS_HISTORY_LIMIT);

 lastAnalyticsScanMarker = marker;

 lastAnalyticsScanEpoch = scanEpoch;

 await chrome.storage.local.set({ analyticsPnlHistory: history });

 }



 summaryEl.innerHTML = `

 <div class="an-scard"><div class="an-sl">POSITIONS</div><div class="an-sv">${rows.length}</div></div>

 <div class="an-scard"><div class="an-sl">LIVE PRICED</div><div class="an-sv">${priced.length}/${rows.length}</div></div>

 <div class="an-scard"><div class="an-sl">TOTAL P&L</div><div class="an-sv ${totalPnl >= 0 ? 'green' : 'red'}">${totalPnl >= 0 ? '+' : '-'}$${Math.abs(totalPnl).toFixed(2)}</div></div>

 <div class="an-scard"><div class="an-sl">P&L %</div><div class="an-sv ${totalPnlPct >= 0 ? 'green' : 'red'}">${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%</div></div>

 `;
 summaryEl.innerHTML = `${buildManageAnalyticsSummary(manageModel)}${summaryEl.innerHTML}`;


 const totalSeries = history.map(h => Number(h.totalPnl || 0)).filter(v => Number.isFinite(v));

 if (totalSeries.length >= 2) {

 chartEl.innerHTML = `

 <div class="an-chart-box">

 ${buildMiniPnlChart(totalSeries, 'total')}

 <div class="an-chart-meta">

 <span>Portfolio P&L trend (${totalSeries.length} scans)</span>

 <span>${wins} win | ${losses} loss</span>

 </div>

 </div>`;
 chartEl.innerHTML = `${buildManageAnalyticsChart(manageModel)}${chartEl.innerHTML}`;
 } else {

 chartEl.innerHTML = `<div class="an-chart-box"><div class="an-chart-meta"><span>P&L Trend</span><span>Need 2 scans</span></div></div>`;
 chartEl.innerHTML = `${buildManageAnalyticsChart(manageModel)}${chartEl.innerHTML}`;
 }



 rowsWrap.innerHTML = rows.map(r => {

 const pnlClass = r.pnl == null ? 'warn' : (r.pnl >= 0 ? 'green' : 'red');

 const pnlText = r.pnl == null ? '--' : `${r.pnl >= 0 ? '+' : '-'}$${Math.abs(r.pnl).toFixed(2)}`;

 const pnlPctText = r.pnlPct == null ? '--' : `${r.pnlPct >= 0 ? '+' : ''}${r.pnlPct.toFixed(2)}%`;

 const priceText = r.hasLivePrice ? `$${fmtPrice(r.currentPrice)}` : 'No live price';

 const series = history.map(h => Number(h.byId?.[r.id])).filter(v => Number.isFinite(v));

 const base = Number.isFinite(r.pnl) ? Number(r.pnl) : 0;

 const chartSeries = series.length >= 2 ? series : [base, base];

 const miniMeta = series.length >= 2 ? `${series.length} points | click for P&L` : 'Waiting next update | click for P&L';

 const mini = `<div class="an-mini" data-id="${esc(r.id)}" data-symbol="${esc(r.symbol)}" data-pnl="${r.pnl == null ? '' : Number(r.pnl).toFixed(6)}" data-pnlpct="${r.pnlPct == null ? '' : Number(r.pnlPct).toFixed(6)}">

 ${buildMiniPnlChart(chartSeries, r.id)}

 <div class="an-mini-meta">${miniMeta}</div>

 </div>`;

 return `

 <div class="an-row" data-id="${esc(r.id)}" data-symbol="${esc(r.symbol)}" data-refresh="${esc(r.resolvedSymbol || r.symbol)}">

 <div class="an-row-top">

 <div>

 <span class="an-sym">${esc(r.symbol)}</span>

 <span class="an-side ${r.side}">${r.side.toUpperCase()}</span>

 </div>

 <button class="bsm red an-del" data-id="${esc(r.id)}">Remove</button>

 </div>

 <div class="an-grid">

 <div class="an-cell"><div class="an-cl">ENTRY</div><div class="an-cv">$${fmtPrice(r.entry)}</div></div>

 <div class="an-cell"><div class="an-cl">QTY</div><div class="an-cv">${r.qty >= 1 ? r.qty.toFixed(4).replace(/\.?0+$/, '') : r.qty.toFixed(6).replace(/\.?0+$/, '')}</div></div>

 <div class="an-cell"><div class="an-cl">TRADE VALUE</div><div class="an-cv">$${r.tradeValue.toFixed(2)}</div></div>

 <div class="an-cell"><div class="an-cl">CURRENT</div><div class="an-cv ${r.hasLivePrice ? '' : 'warn'}">${priceText}</div></div>

 <div class="an-cell"><div class="an-cl">P&L</div><div class="an-cv ${pnlClass}">${pnlText}</div></div>

 <div class="an-cell"><div class="an-cl">P&L %</div><div class="an-cv ${pnlClass}">${pnlPctText}</div></div>

 <div class="an-cell"><div class="an-cl">SIDE</div><div class="an-cv">${r.side.toUpperCase()}</div></div>

 <div class="an-cell"><div class="an-cl">SOURCE</div><div class="an-cv ${r.hasLivePrice ? 'green' : 'warn'}">${r.hasLivePrice ? 'Latest Scan' : 'Missing'}</div></div>

 </div>

 ${mini}

 </div>`;

 }).join('');
 rowsWrap.innerHTML = `${buildManageAnalyticsRows(manageModel)}${rowsWrap.innerHTML}`;


 const missing = rows.length - priced.length;

 metaEl.textContent = `Last scan: ${lastScan || '-'} | Live priced: ${priced.length}/${rows.length}${missing ? ` | Missing: ${missing}` : ''} | Review filter ${manageAnalyticsSource.toUpperCase()} / ${manageAnalyticsRange.toUpperCase()} active | Click a manual position row to refresh price`;
 updateWorkspaceInsights({
 alerts: currentAlertsCache,

 watchlist: d.watchlist || currentWatchlist,

 analyticsPositions: positions,

 marketIndex: (await storeGet(['marketIndex'])).marketIndex,

 scanResults,

 scanStatus: null,

 lastScan,

 });

 } finally {

 analyticsRenderInFlight = false;

 }

}



function buildManageAnalyticsMetaSafe(model = null, options = {}) {
 const lastScan = options.lastScan || '';
 const livePriced = Number(options.livePriced || 0);
 const totalRows = Number(options.totalRows || 0);
 const missing = Math.max(0, Number(options.missing || 0));
 const filterLabel = `${manageAnalyticsSource.toUpperCase()} / ${manageAnalyticsRange.toUpperCase()}`;
 if (!totalRows) {
 return model?.closedTrades?.length
 ? `Review filter ${filterLabel} loaded. Add manual positions when you want mark-to-market tracking.`
 : 'Run a scan for latest prices, then add manual positions or let synced live history populate the performance lab.';
 }
 return `Last scan: ${lastScan || '--'} | Live priced: ${livePriced}/${totalRows}${missing ? ` | Missing: ${missing}` : ''} | Review filter ${filterLabel} active | Click a manual position row to refresh price`;
}

function buildAnalyticsManualChartEmptyState(label, title, copy, metaRight) {
 return `
 <div class="an-chart-box">
 <div>
 <div class="an-chart-kicker">${label}</div>
 <div class="an-chart-title">${title}</div>
 <div class="an-chart-copy">${copy}</div>
 </div>
 <div class="an-chart-meta"><span>Manual book</span><span>${metaRight}</span></div>
 </div>`;
}

function buildAnalyticsManualSection(content, hasRows = false) {
 return `
 <div class="analytics-manual-section">
 <div class="analytics-manual-head">
 <div>
 <div class="analytics-manual-kicker">Manual Book</div>
 <div class="analytics-manual-title">${hasRows ? 'Tracked Positions' : 'Ready For Your First Position'}</div>
 </div>
 <div class="analytics-manual-copy">${hasRows ? 'Manual rows use the latest scan price when available. Click a row to refresh a symbol.' : 'Use the form above to seed a manual position and pair it with the review filters.'}</div>
 </div>
 ${content}
 </div>`;
}

function buildAnalyticsManualEmptyState() {
 return `
 <div class="analytics-empty-grid">
 <div class="analytics-empty-panel analytics-empty-panel-primary">
 <div class="analytics-empty-kicker">Step 1</div>
 <div class="analytics-empty-title">Add a manual position</div>
 <div class="analytics-empty-copy">Enter symbol, side, entry, and either quantity or total trade value. The form at the top of Analytics feeds this panel.</div>
 </div>
 <div class="analytics-empty-panel">
 <div class="analytics-empty-kicker">Step 2</div>
 <div class="analytics-empty-title">Run or refresh a scan</div>
 <div class="analytics-empty-copy">Latest scan data attaches live prices to the manual book so P&amp;L, trend, and risk context can update.</div>
 </div>
 </div>`;
}

async function renderAnalyticsManageSafe(preloaded = null) {
 const rowsWrap = document.getElementById('analyticsRows');
 const summaryEl = document.getElementById('analyticsSummary');
 const chartEl = document.getElementById('analyticsChart');
 const metaEl = document.getElementById('analyticsMeta');
 if (!rowsWrap || !summaryEl || !chartEl || !metaEl) return;
 if (analyticsRenderInFlight) return;

 analyticsRenderInFlight = true;
 try {
 await loadManageAnalyticsPrefs();
 const d = await storeGet([
 'analyticsPositions', 'analyticsPnlHistory', 'scanResults', 'fundingHeatmap', 'lastScan',
 'watchlist', 'correlationMatrix', 'marketIndex',
 ]);
 await refreshAnalyticsSymbolSuggestions(d);

 const scanResults = preloaded?.scanResults || d.scanResults || [];
 const fundingHeatmap = d.fundingHeatmap || [];
 const lastScan = preloaded?.lastScan || d.lastScan || '';
 const positions = Array.isArray(d.analyticsPositions) ? d.analyticsPositions : [];
 const marketIndex = preloaded?.marketIndex || d.marketIndex || null;
 const manageBundle = await v16EnsureLiveManageHistory?.() || await v16GetManageHistoryBundle?.();
 const manageModel = manageBundle
 ? v16BuildManageAnalyticsModel(manageBundle, { source: manageAnalyticsSource, range: manageAnalyticsRange })
 : null;
 const renderKey = JSON.stringify({
 source: manageAnalyticsSource,
 range: manageAnalyticsRange,
 lastScan,
 scanCount: scanResults.length,
 fundingCount: Array.isArray(fundingHeatmap) ? fundingHeatmap.length : 0,
 positionCount: positions.length,
 historyCount: Array.isArray(d.analyticsPnlHistory) ? d.analyticsPnlHistory.length : 0,
 ledgerUpdatedAt: Number(manageBundle?.liveLedger?.updatedAt || 0),
 marketRegime: marketIndex?.regime || '',
 marketValue: Number(marketIndex?.value || 0),
 });

 renderManageAnalyticsToolbar(manageModel);
 renderAnalyticsLiveReview(manageBundle, manageModel);
 if (summaryEl.dataset.ready === 'true' && analyticsManageSafeCache.key === renderKey) {
 if (analyticsManageSafeCache.metaText) metaEl.textContent = analyticsManageSafeCache.metaText;
 return;
 }

 let history = Array.isArray(d.analyticsPnlHistory) ? d.analyticsPnlHistory.slice(-ANALYTICS_HISTORY_LIMIT) : [];
 if (!lastAnalyticsScanMarker && history.length) {
 const lastItem = history[history.length - 1];
 lastAnalyticsScanMarker = String(lastItem?.marker || '');
 lastAnalyticsScanEpoch = Number(lastItem?.scanEpoch || 0);
 }

 if (!positions.length) {
 const manualSummary = `
 <div class="an-scard"><div class="an-sl">POSITIONS</div><div class="an-sv">0</div></div>
 <div class="an-scard"><div class="an-sl">LIVE PRICED</div><div class="an-sv">0</div></div>
 <div class="an-scard"><div class="an-sl">TOTAL P&L</div><div class="an-sv">$0.00</div></div>
 <div class="an-scard"><div class="an-sl">P&L %</div><div class="an-sv">0.00%</div></div>
 `;
 const manualChart = buildAnalyticsManualChartEmptyState(
 'Manual P&L Trend',
 'Add positions to start mark-to-market tracking',
 'Each scan records the manual portfolio snapshot. After two scan updates, the manual trend line will appear here.',
 'Waiting for positions'
 );
 const manualRows = buildAnalyticsManualSection(buildAnalyticsManualEmptyState(), false);
 summaryEl.innerHTML = `${buildManageAnalyticsSummary(manageModel)}${manualSummary}`;
 chartEl.innerHTML = `${buildManageAnalyticsChart(manageModel)}${manualChart}`;
 rowsWrap.innerHTML = `${buildManageAnalyticsRows(manageModel)}${manualRows}`;
 metaEl.textContent = buildManageAnalyticsMetaSafe(manageModel);
 analyticsManageSafeCache = {
 key: renderKey,
 metaText: metaEl.textContent,
 };
 updateWorkspaceInsights({
 alerts: currentAlertsCache,
 watchlist: currentWatchlist,
 analyticsPositions: positions,
 marketIndex,
 scanResults,
 scanStatus: null,
 lastScan,
 });
 summaryEl.dataset.ready = 'true';
 return;
 }

 const lookup = buildAnalyticsPriceLookup(scanResults, fundingHeatmap);
 const rows = positions.map(position => {
 const entry = toPosNum(position.entry);
 const qty = toPosNum(position.qty);
 const tradeValueInput = toPosNum(position.tradeValue);
 const derivedQty = qty > 0 ? qty : (entry > 0 && tradeValueInput > 0 ? (tradeValueInput / entry) : 0);
 const exposure = tradeValueInput > 0 ? tradeValueInput : (entry > 0 && derivedQty > 0 ? entry * derivedQty : 0);
 const side = position.side === 'short' ? 'short' : 'long';
 const resolved = resolveAnalyticsPrice(position.symbol, lookup);
 const hasLivePrice = Number.isFinite(resolved.price) && resolved.price > 0;
 const currentPrice = hasLivePrice ? resolved.price : null;
 const resolvedSymbol = sanitizeAnalyticsSymbol(resolved.symbol || position.symbol);
 const direction = side === 'short' ? -1 : 1;
 const pnl = hasLivePrice && entry > 0 && derivedQty > 0 ? (currentPrice - entry) * derivedQty * direction : null;
 const pnlPct = hasLivePrice && exposure > 0 && pnl != null ? (pnl / exposure * 100) : null;
 return {
 id: position.id,
 symbol: sanitizeAnalyticsSymbol(position.symbol),
 resolvedSymbol,
 side,
 entry,
 qty: derivedQty,
 tradeValue: exposure,
 hasLivePrice,
 currentPrice,
 pnl,
 pnlPct,
 };
 });

 const priced = rows.filter(row => row.hasLivePrice);
 const totalPnl = priced.reduce((sum, row) => sum + (row.pnl || 0), 0);
 const totalExposure = rows.reduce((sum, row) => sum + (row.tradeValue || 0), 0);
 const totalPnlPct = totalExposure > 0 ? (totalPnl / totalExposure * 100) : 0;
 const wins = priced.filter(row => (row.pnl || 0) >= 0).length;
 const losses = priced.filter(row => (row.pnl || 0) < 0).length;
 const scanEpoch = analyticsScanEpoch(scanResults);
 const marker = scanEpoch > 0 ? `ts:${scanEpoch}` : (lastScan ? `ls:${lastScan}` : '');

 if (marker && marker !== lastAnalyticsScanMarker) {
 const byId = {};
 rows.forEach(row => {
 if (row.pnl != null) byId[row.id] = +row.pnl.toFixed(4);
 });
 history.push({
 ts: Date.now(),
 marker,
 scanEpoch,
 totalPnl: +totalPnl.toFixed(4),
 totalExposure: +totalExposure.toFixed(4),
 byId,
 });
 history = history.slice(-ANALYTICS_HISTORY_LIMIT);
 lastAnalyticsScanMarker = marker;
 lastAnalyticsScanEpoch = scanEpoch;
 await chrome.storage.local.set({ analyticsPnlHistory: history });
 }

 const manualSummary = `
 <div class="an-scard"><div class="an-sl">POSITIONS</div><div class="an-sv">${rows.length}</div></div>
 <div class="an-scard"><div class="an-sl">LIVE PRICED</div><div class="an-sv">${priced.length}/${rows.length}</div></div>
 <div class="an-scard"><div class="an-sl">TOTAL P&L</div><div class="an-sv ${totalPnl >= 0 ? 'green' : 'red'}">${totalPnl >= 0 ? '+' : '-'}$${Math.abs(totalPnl).toFixed(2)}</div></div>
 <div class="an-scard"><div class="an-sl">P&L %</div><div class="an-sv ${totalPnlPct >= 0 ? 'green' : 'red'}">${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%</div></div>
 `;
 summaryEl.innerHTML = `${buildManageAnalyticsSummary(manageModel)}${manualSummary}`;

 const totalSeries = history.map(item => Number(item.totalPnl || 0)).filter(value => Number.isFinite(value));
 const manualChart = totalSeries.length >= 2
 ? `
 <div class="an-chart-box">
 ${buildMiniPnlChart(totalSeries, 'total')}
 <div class="an-chart-meta">
 <span>Portfolio P&L trend (${totalSeries.length} scans)</span>
 <span>${wins} win / ${losses} loss</span>
 </div>
 </div>`
 : buildAnalyticsManualChartEmptyState(
 'Manual P&L Trend',
 'Need two scan snapshots to draw the line',
 'The current manual book is loaded. Run Scan Now or refresh a priced symbol once more to build the trend series.',
 'Need 2 scans'
 );
 chartEl.innerHTML = `${buildManageAnalyticsChart(manageModel)}${manualChart}`;

 const manualRows = rows.map(row => {
 const pnlClass = row.pnl == null ? 'warn' : (row.pnl >= 0 ? 'green' : 'red');
 const pnlText = row.pnl == null ? '--' : `${row.pnl >= 0 ? '+' : '-'}$${Math.abs(row.pnl).toFixed(2)}`;
 const pnlPctText = row.pnlPct == null ? '--' : `${row.pnlPct >= 0 ? '+' : ''}${row.pnlPct.toFixed(2)}%`;
 const priceText = row.hasLivePrice ? `$${fmtPrice(row.currentPrice)}` : 'No live price';
 const series = history.map(item => Number(item.byId?.[row.id])).filter(value => Number.isFinite(value));
 const base = Number.isFinite(row.pnl) ? Number(row.pnl) : 0;
 const chartSeries = series.length >= 2 ? series : [base, base];
 const miniMeta = series.length >= 2 ? `${series.length} points - click for P&L` : 'Waiting for next update - click for P&L';
 return `
 <div class="an-row" data-id="${esc(row.id)}" data-symbol="${esc(row.symbol)}" data-refresh="${esc(row.resolvedSymbol || row.symbol)}">
 <div class="an-row-top">
 <div>
 <span class="an-sym">${esc(row.symbol)}</span>
 <span class="an-side ${row.side}">${row.side.toUpperCase()}</span>
 </div>
 <button class="bsm red an-del" data-id="${esc(row.id)}">Remove</button>
 </div>
 <div class="an-grid">
 <div class="an-cell"><div class="an-cl">ENTRY</div><div class="an-cv">$${fmtPrice(row.entry)}</div></div>
 <div class="an-cell"><div class="an-cl">QTY</div><div class="an-cv">${row.qty >= 1 ? row.qty.toFixed(4).replace(/\.?0+$/, '') : row.qty.toFixed(6).replace(/\.?0+$/, '')}</div></div>
 <div class="an-cell"><div class="an-cl">TRADE VALUE</div><div class="an-cv">$${row.tradeValue.toFixed(2)}</div></div>
 <div class="an-cell"><div class="an-cl">CURRENT</div><div class="an-cv ${row.hasLivePrice ? '' : 'warn'}">${priceText}</div></div>
 <div class="an-cell"><div class="an-cl">P&L</div><div class="an-cv ${pnlClass}">${pnlText}</div></div>
 <div class="an-cell"><div class="an-cl">P&L %</div><div class="an-cv ${pnlClass}">${pnlPctText}</div></div>
 <div class="an-cell"><div class="an-cl">SIDE</div><div class="an-cv">${row.side.toUpperCase()}</div></div>
 <div class="an-cell"><div class="an-cl">SOURCE</div><div class="an-cv ${row.hasLivePrice ? 'green' : 'warn'}">${row.hasLivePrice ? 'Latest Scan' : 'Missing'}</div></div>
 </div>
 <div class="an-mini" data-id="${esc(row.id)}" data-symbol="${esc(row.symbol)}" data-pnl="${row.pnl == null ? '' : Number(row.pnl).toFixed(6)}" data-pnlpct="${row.pnlPct == null ? '' : Number(row.pnlPct).toFixed(6)}">
 ${buildMiniPnlChart(chartSeries, row.id)}
 <div class="an-mini-meta">${miniMeta}</div>
 </div>
 </div>`;
 }).join('');
 rowsWrap.innerHTML = `${buildManageAnalyticsRows(manageModel)}${buildAnalyticsManualSection(manualRows, true)}`;

 const missing = rows.length - priced.length;
 metaEl.textContent = buildManageAnalyticsMetaSafe(manageModel, {
 lastScan,
 livePriced: priced.length,
 totalRows: rows.length,
 missing,
 });
 analyticsManageSafeCache = {
 key: renderKey,
 metaText: metaEl.textContent,
 };
 updateWorkspaceInsights({
 alerts: currentAlertsCache,
 watchlist: d.watchlist || currentWatchlist,
 analyticsPositions: positions,
 marketIndex,
 scanResults,
 scanStatus: null,
 lastScan,
 });
 summaryEl.dataset.ready = 'true';
 } finally {
 analyticsRenderInFlight = false;
 }
}

renderAnalytics = renderAnalyticsManageSafe;
globalThis.renderAnalytics = renderAnalyticsManageSafe;

async function addAnalyticsPosition() {
 let symbol = sanitizeAnalyticsSymbol(document.getElementById('anSymbol')?.value || '');

 const side = document.getElementById('anSide')?.value === 'short' ? 'short' : 'long';

 const entry = toPosNum(document.getElementById('anEntry')?.value);

 const qty = toPosNum(document.getElementById('anQty')?.value);

 const tradeValue = toPosNum(document.getElementById('anTradeValue')?.value);

 const metaEl = document.getElementById('analyticsMeta');



 if (!symbol) {

 if (metaEl) metaEl.textContent = 'Enter a valid NSE/BSE symbol (e.g. RELIANCE or NIFTY).';

 return;

 }

 if (!entry) {

 if (metaEl) metaEl.textContent = 'Entry price is required.';

 return;

 }

 if (!qty && !tradeValue) {

 if (metaEl) metaEl.textContent = 'Provide Qty or Total Trade Value.';

 return;

 }



 const d = await storeGet(['analyticsPositions', 'scanResults', 'fundingHeatmap']);

 if (symbol && !/(USD|USDT)$/.test(symbol)) {

 const lookup = buildAnalyticsPriceLookup(d.scanResults || [], d.fundingHeatmap || []);

 const resolved = resolveAnalyticsPrice(symbol, lookup);

 if (resolved?.symbol) symbol = sanitizeAnalyticsSymbol(resolved.symbol);

 }

 const positions = Array.isArray(d.analyticsPositions) ? d.analyticsPositions : [];

 positions.unshift({

 id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,

 symbol,

 side,

 entry,

 qty,

 tradeValue,

 createdAt: Date.now(),

 });

 await chrome.storage.local.set({ analyticsPositions: positions });



 const symEl = document.getElementById('anSymbol');

 const entryEl = document.getElementById('anEntry');

 const qtyEl = document.getElementById('anQty');

 const tvEl = document.getElementById('anTradeValue');

 if (symEl) symEl.value = '';

 if (entryEl) entryEl.value = '';

 if (qtyEl) qtyEl.value = '';

 if (tvEl) tvEl.value = '';

 if (metaEl) metaEl.textContent = `Added ${symbol} (${side.toUpperCase()}).`;

 renderAnalytics();

}



// Delegation: Add Position
document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnAddPosition' && !e.target?.closest('#btnAddPosition')) return;
 addAnalyticsPosition();
});

// Delegation: Analytics input Enter key
document.addEventListener('keydown', (e) => {
 if (!['anSymbol', 'anEntry', 'anQty', 'anTradeValue'].includes(e.target?.id)) return;
 if (e.key === 'Enter') {
 e.preventDefault();
 addAnalyticsPosition();
 }
});

// Delegation: Symbol input uppercase
document.addEventListener('input', (e) => {
 if (e.target?.id !== 'anSymbol') return;
 const el = e.target;
 const up = String(el.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
 if (el.value !== up) el.value = up;
});

// Delegation: Analytics Focus
document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnAnalyticsFocus' && !e.target?.closest('#btnAnalyticsFocus')) return;
 setAnalyticsFocusMode(!analyticsFocusMode);
});
// Delegation: Analytics Refresh
document.addEventListener('click', (e) => {
 if (e.target?.id !== 'btnAnalyticsRefresh' && !e.target?.closest('#btnAnalyticsRefresh')) return;
 renderAnalytics();
});

// Delegation: Analytics Clear
document.addEventListener('click', async (e) => {
 if (e.target?.id !== 'btnAnalyticsClear' && !e.target?.closest('#btnAnalyticsClear')) return;
 if (!confirmDestructiveAction('Clear all manual positions?', { title: 'Clear manual positions?' })) return;
 await chrome.storage.local.set({ analyticsPositions: [], analyticsPnlHistory: [] });
 lastAnalyticsScanMarker = '';
 lastAnalyticsScanEpoch = 0;
 renderAnalytics();
});



// Delegation: Analytics Rows click
document.addEventListener('click', async (e) => {
 if (!e.target?.closest('#analyticsRows')) return;

 const metaEl = document.getElementById('analyticsMeta');



 const btn = e.target?.closest?.('.an-del');

 if (btn) {

 const id = btn.dataset.id;

 if (!id) return;

 const d = await storeGet(['analyticsPositions', 'analyticsPnlHistory']);

 const positions = (d.analyticsPositions || []).filter(p => p.id !== id);

 const history = (d.analyticsPnlHistory || []).map(h => {

 const byId = { ...(h.byId || {}) };

 delete byId[id];

 return { ...h, byId };

 });

 await chrome.storage.local.set({ analyticsPositions: positions, analyticsPnlHistory: history });

 renderAnalytics();

 return;

 }



 const mini = e.target?.closest?.('.an-mini');

 if (mini) {

 const symbol = mini.dataset.symbol || '--';

 const pnlRaw = mini.dataset.pnl;

 const pctRaw = mini.dataset.pnlpct;

 const pnl = Number(pnlRaw);

 const pct = Number(pctRaw);

 if (Number.isFinite(pnl)) {

 const amtText = `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`;

 const pctText = Number.isFinite(pct) ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : '';

 if (metaEl) metaEl.textContent = `${symbol} P&L: ${amtText}${pctText}`;

 } else if (metaEl) {

 metaEl.textContent = `${symbol} P&L: no live price`;

 }

 return;

 }



 const row = e.target?.closest?.('.an-row');

 if (!row) return;

 const refreshSym = sanitizeAnalyticsSymbol(row.dataset.refresh || row.dataset.symbol || '');

 if (!refreshSym) return;

 if (metaEl) metaEl.textContent = `Refreshing ${refreshSym}...`;

 chrome.runtime.sendMessage({ action: 'refreshSymbol', symbol: refreshSym }, async (resp) => {

 if (resp?.ok) {

 if (metaEl) metaEl.textContent = `${refreshSym} refreshed from live ticker`;

 await renderAnalytics();

 } else {

 if (metaEl) metaEl.textContent = `Warning: Could not refresh ${refreshSym}: ${resp?.error || 'unknown error'}`;

 await renderAnalytics();

 }

 });

});





// ----------------------------------------------------------------

// ----------------------------------------------------------------

