'use strict';

(function initStrategyLab(global) {
 let activeStrategyLabId = 'early';
 let selectedStrategySymbol = '';
 let strategyLabSnapshot = null;
 let strategyLabPollTimer = null;
 let strategyLabRadarTimer = null;
 let strategyLabStorageRefreshTimer = null;
 let strategyLabStorageListenerBound = false;
 let strategyLabViewMode = 'focus';
 let strategyLabAlerts = [];
 let strategyLabAlertMessage = '';
 let strategyLabRadarNotificationsEnabled = false;
 let strategyLabResearchWatchlist = [];
 let strategyLabMinScore = 0;
 let strategyLabHideAvoid = false;

 function labEsc(value) {
 return String(value == null ? '' : value)
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#39;');
 }

 function labHelpText(key = '', strategyId = activeStrategyLabId) {
 const strategy = String(strategyId || activeStrategyLabId || '').toLowerCase();
 if (strategy === 'current') return '';
 const raw = String(key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
 const common = {
  buy: 'Good buy setup. Check price and stop first. Risk: price may reverse.',
  buy_now: 'Good buy setup. Check price and stop first. Risk: price may reverse.',
  best_candidates: 'Best rows from this scan. Check details first. Risk: ranking can miss news.',
  watchlist: 'Not ready yet. Watch for more proof. Risk: entering early can fail.',
  wait: 'Not ready yet. Watch for more proof. Risk: entering early can fail.',
  developing: 'Still forming. Wait for clearer proof. Risk: acting too soon.',
  sell: 'Possible short setup. Check support break first. Risk: price may bounce.',
  sell_watch: 'Possible short setup. Check support break first. Risk: price may bounce.',
  ignore: 'Weak or risky setup. Better to skip. Risk: poor timing or unclear data.',
  ignored: 'Weak or risky setup. Better to skip. Risk: poor timing or unclear data.',
  avoid: 'Weak or risky setup. Better to skip. Risk: poor timing or unclear data.',
  review: 'Needs manual checking. Data is not clear enough. Risk: signal may be wrong.',
  focus: 'Shows the most useful rows first. Check full list if needed. Risk: hidden rows may matter.',
  all: 'Shows every row from this scan. Check quality before acting. Risk: many rows are weak.',
  early: 'Finds coins where early evidence is appearing before the move is too late. Risk: early setups can fail.',
 };
 const byStrategy = {
  early: {
   fresh: 'New or short-history coin with early activity. Check volume and structure first.',
   breakout_near: 'Price is near an important level. Check follow-through before trusting it.',
   base: 'Coin is building a base. Wait for a clean trigger or stronger volume.',
   reclaim: 'Price is trying to regain a lost level. Check it can hold.',
   compression: 'Volatility is tightening before a possible move. Check breakout volume.',
   avoid_late: 'The move may already be late or risky. Better to avoid chasing.',
   cross_lab: 'More than one lab is seeing this coin. Check the chart carefully.',
  },
  wizard: {
   breakout: 'Price is trying to move above a key level. Check volume. Risk: it may fall back.',
   volume: 'More trading activity than usual. Check price direction. Risk: volume can be noise.',
   best_candidates: common.best_candidates,
   buy: common.buy,
   buy_now: common.buy,
   watchlist: common.watchlist,
   sell: common.sell,
   ignored: common.ignored,
  },
  stage: {
   best_order: 'Shows stages in useful order. Check the row details. Risk: stage can change.',
   stage_i: 'Price is building a base. Wait for proof. Risk: base can break down.',
   wait_base: 'Price is building a base. Wait for proof. Risk: base can break down.',
   stage_ii: 'Price is in an upward phase. Check it is not too late. Risk: pullback.',
   buy_hold: 'Upward phase. Check stop and distance from entry. Risk: buying late.',
   stage_iii: 'Trend may be weakening. Protect profit or reduce risk. Risk: fast drop.',
   protect: 'Trend may be weakening. Protect profit or reduce risk. Risk: fast drop.',
   stage_iv: 'Price is in a down phase. Avoid new buys. Risk: more downside.',
   avoid_long: 'Price is in a down phase. Avoid new buys. Risk: more downside.',
   review: common.review,
  },
  radar: {
   breakouts: 'Price moved above an important level. Check follow-through. Risk: false move.',
   breakout_long: 'Price moved above an important level. Check follow-through. Risk: false move.',
   breaking_resistance: 'Price moved above an important level. Check follow-through. Risk: false move.',
   ema_obv: 'Trend and buying activity are improving. Check price holds. Risk: weak follow-through.',
   pressure: 'Price is moving fast with pressure. Wait for clear direction. Risk: sharp reversal.',
   pressure_move: 'Price is moving fast with pressure. Wait for clear direction. Risk: sharp reversal.',
   new: 'New or short-history coin. Use smaller risk. Risk: price can move wildly.',
   new_coin: 'New or short-history coin. Use smaller risk. Risk: price can move wildly.',
   new_coins: 'New or short-history coins. Use smaller risk. Risk: price can move wildly.',
   vwap: 'Price is near its average area. Check hold or rejection. Risk: choppy movement.',
   avoid: common.avoid,
   avoid_trap: 'Looks risky or stretched. Better to wait. Risk: trapped entry.',
  },
  reversal: {
   liquidation: 'Price moved very fast and may bounce. Wait for it to stop. Risk: it can keep falling.',
   liq_reversal: 'Price moved very fast and may bounce. Wait for it to stop. Risk: it can keep falling.',
   liquidation_reversal: 'Price moved very fast and may bounce. Wait for it to stop. Risk: it can keep falling.',
   fade: 'Price moved too far too fast. Wait for slowing. Risk: strong move can continue.',
   fade_extreme: 'Price moved too far too fast. Wait for slowing. Risk: strong move can continue.',
   mean: 'Price may move back toward normal. Wait for turn. Risk: normal can shift.',
   mean_revert: 'Price may move back toward normal. Wait for turn. Risk: normal can shift.',
   mean_reversion: 'Price may move back toward normal. Wait for turn. Risk: normal can shift.',
   reclaim: 'Price returned above a lost level. Check it holds. Risk: it may lose it again.',
   avoid: common.avoid,
   avoid_chase: 'Move is too late or risky. Better to skip. Risk: bad entry after big move.',
  },
 };
 return byStrategy[strategy]?.[raw] || common[raw] || '';
 }

 function labHelpAttrs(key = '', strategyId = activeStrategyLabId, focusable = false) {
 const copy = labHelpText(key, strategyId);
 if (!copy) return '';
 return ` data-strategy-help="${labEsc(copy)}" aria-label="${labEsc(copy)}" title="${labEsc(copy)}"${focusable ? ' tabindex="0"' : ''}`;
 }

 function labRowHelpText(row = {}) {
 if (!isScannerOnly(row.strategyId || activeStrategyLabId)) return '';
 const key = activeStrategyLabId === 'early'
 ? (row.raw?.earlyType || row.eventType || row.raw?.eventType || rowSignalLabel(row))
 : activeStrategyLabId === 'stage'
 ? shortStageLabel(row)
 : (row.eventType || row.raw?.eventType || rowSignalLabel(row));
 return labHelpText(key, row.strategyId || activeStrategyLabId);
 }

 function labPlainWhy(row = {}) {
 if (!isScannerOnly(row.strategyId || activeStrategyLabId)) return '';
 const strategy = String(row.strategyId || activeStrategyLabId || '').toLowerCase();
 const raw = row.raw || {};
 const checks = row.checks || {};
 const eventType = String(row.eventType || raw.eventType || '').toLowerCase();
 if (strategy === 'early') {
  if (raw.earlyType === 'fresh') return 'It appeared because fresh activity, short history, or new-coin behavior is visible.';
  if (raw.earlyType === 'breakout_near') return 'It appeared because price is close to a breakout or reclaim level before a full move.';
  if (raw.earlyType === 'base') return 'It appeared because Stage/Wizard data suggests a base or compression is forming.';
  if (raw.earlyType === 'reclaim') return 'It appeared because price is trying to regain a level after weakness.';
  if (raw.sourceCount > 1) return 'It appeared because more than one scanner is seeing the same symbol.';
  return 'It appeared because early evidence is present, but it still needs chart confirmation.';
 }
 if (strategy === 'stage') {
  if (row.stage === 'STAGE_II') return 'It appeared because price is above its main weekly average and the trend looks stronger.';
  if (row.stage === 'STAGE_I') return 'It appeared because price is moving in a base and may be preparing for a move.';
  if (row.stage === 'STAGE_III') return 'It appeared because the earlier up move may be weakening and needs protection.';
  if (row.stage === 'STAGE_IV') return 'It appeared because price is in a down phase and new buys are risky.';
  return 'It appeared because the scanner needs more review before giving a clear stage.';
 }
 if (strategy === 'radar') {
  if (eventType === 'breakout') return 'It appeared because price moved above an important level with stronger activity.';
  if (eventType === 'ema_obv') return 'It appeared because trend and buying activity improved together.';
  if (eventType === 'pressure') return 'It appeared because price is moving fast and pressure is building.';
  if (eventType === 'new_coin') return 'It appeared because this coin has short history or is newly active.';
  if (eventType === 'vwap') return 'It appeared because price is making a decision near its average area.';
  if (eventType === 'avoid_trap') return 'It appeared because the setup looks stretched, thin, or risky.';
  return 'It appeared because live market data changed enough to need review.';
 }
 if (strategy === 'reversal') {
  if (eventType === 'liquidation_reversal') return 'It appeared because price moved very fast with signs it may stop or bounce.';
  if (eventType === 'fade_extreme') return 'It appeared because price moved too far away from normal levels.';
  if (eventType === 'mean_reversion') return 'It appeared because price may move back closer to normal.';
  if (eventType === 'reclaim') return 'It appeared because price moved back above a level it had lost.';
  if (eventType === 'avoid_chase') return 'It appeared because the move looks late or risky to chase.';
  return 'It appeared because stretch or reversal data needs review.';
 }
 if (row.signal === 'BUY') return 'It appeared because trend, strength, and risk checks are better than most rows.';
 if (row.signal === 'SELL') return 'It appeared because weakness is stronger than buying strength.';
 if (row.signal === 'WATCHLIST') return 'It appeared because some signs are good, but it is not ready yet.';
 if (checks.breakoutReady || raw.breakoutVolumeRatio) return 'It appeared because price is near a possible breakout area.';
 return 'It appeared because the scanner found enough data to keep it on the review list.';
 }

 function buildPlainHelpPanel(row = {}) {
 if (!isScannerOnly(row.strategyId || activeStrategyLabId)) return '';
 const help = labRowHelpText(row);
 const why = labPlainWhy(row);
 if (!help && !why) return '';
 return `<div class="strategy-plain-help">
 ${help ? `<p><strong>Meaning:</strong> ${labEsc(help)}</p>` : ''}
 ${why ? `<p><strong>Why shown:</strong> ${labEsc(why)}</p>` : ''}
 </div>`;
 }

 function labFmt(value, decimals = 2) {
 const n = Number(value);
 if (!Number.isFinite(n)) return '--';
 return n.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
 }

 function labPrice(value, decimals = 4) {
 const n = Number(value);
 if (!Number.isFinite(n) || n <= 0) return '--';
 if (Math.abs(n) >= 1000) return labFmt(n, 2);
 if (Math.abs(n) >= 1) return labFmt(n, decimals);
 return labFmt(n, 6);
 }

 function labAge(ts) {
 if (global.formatUiAge) return global.formatUiAge(ts);
 const n = Number(ts || 0);
 if (!n) return 'Not yet';
 const mins = Math.max(0, Math.round((Date.now() - n) / 60000));
 return mins <= 1 ? 'Just now' : `${mins}m ago`;
 }

 function labPct(value, decimals = 1) {
 const n = Number(value);
 if (!Number.isFinite(n)) return '--';
 return `${labFmt(n, decimals)}%`;
 }

 function labStrategyId(row = {}) {
 return String(row.strategyId || activeStrategyLabId || '').toLowerCase();
 }

 function labPriorityLabel(row = {}) {
 if (row.priorityLabel) return row.priorityLabel;
 if (row.raw?.priorityLabel) return row.raw.priorityLabel;
  if (activeStrategyLabId === 'stage') {
 if (row.stage === 'STAGE_II') return row.signal === 'BUY' ? 'Best now' : 'Near entry';
 if (row.stage === 'STAGE_I') return 'Base watch';
 if (row.stage === 'STAGE_III') return 'Protect now';
 if (row.stage === 'STAGE_IV') return 'Avoid long';
 return 'Review data';
 }
 if (activeStrategyLabId === 'reversal') {
  const eventType = String(row.eventType || row.raw?.eventType || '');
  if (eventType === 'liquidation_reversal') return 'Climax reversal';
  if (eventType === 'fade_extreme') return 'Fade candidate';
  if (eventType === 'reclaim') return 'Reclaim watch';
  if (eventType === 'mean_reversion') return 'Balance watch';
  if (eventType === 'avoid_chase') return 'Avoid chase';
 }
 if (row.signal === 'BUY') return 'Best now';
 if (row.signal === 'SELL') return 'Short watch';
 if (row.signal === 'WATCHLIST') return Number(row.score || 0) >= 75 ? 'Near entry' : 'Developing';
 return Number(row.score || 0) >= 45 ? 'Monitor only' : 'Avoid';
 }

 function labDecisionPack(row = {}) {
 const decision = row.raw?.decision || {};
 const reasons = Array.isArray(row.reasons) ? row.reasons : [];
 return {
 whySelected: Array.isArray(decision.whySelected) && decision.whySelected.length ? decision.whySelected : reasons.slice(0, 3),
 whyNotNow: Array.isArray(decision.whyNotNow) && decision.whyNotNow.length ? decision.whyNotNow : reasons.filter(reason => /missing|below|incomplete|wait|risk|not/i.test(reason)).slice(0, 3),
 nextAction: decision.nextAction || row.actionLabel || labPriorityLabel(row),
 };
 }

 function labRowPrice(row = {}) {
 return Number(row.raw?.latestPrice || row.raw?.stageMetrics?.close || row.raw?.close || row.entry || 0);
 }

 function labAlertTarget(row = {}, type = '') {
  const raw = row.raw || {};
  const metrics = raw.stageMetrics || {};
  if (row.strategyId === 'early' || activeStrategyLabId === 'early') {
   const levels = raw.chartLevels || {};
   if (type === 'breakout') return Number(levels.trigger || row.triggerPrice || row.entry || 0);
   if (type === 'vwap') return Number(levels.vwap || row.targets?.vwap || 0);
   if (type === 'reclaim') return Number(levels.trigger || row.triggerPrice || row.entry || 0);
   if (type === 'volume') return 1.5;
  }
  if (row.strategyId === 'radar' || activeStrategyLabId === 'radar') {
   if (type === 'breakout') return Number(raw.resistance || row.targets?.resistance || row.entry || 0);
   if (type === 'ema_obv') return Number(row.entry || raw.latestPrice || 0);
   if (type === 'vwap') return Number(raw.vwap || row.targets?.vwap || 0);
   if (type === 'pressure') return Number(raw.support || row.targets?.support || row.entry || 0);
   if (type === 'new_coin') return Number(row.entry || raw.latestPrice || 0);
  }
  if (row.strategyId === 'reversal' || activeStrategyLabId === 'reversal') {
   if (type === 'fade') return Number(row.entry || raw.latestPrice || 0);
   if (type === 'vwap') return Number(raw.vwap || row.targets?.vwap || row.targets?.target1 || 0);
   if (type === 'reclaim') return Number(row.entry || raw.latestPrice || 0);
   if (type === 'climax') return Number(raw.volumeRatio || 0);
  }
  if (type === 'breakout') return Number(row.triggerPrice || raw.pivotPrice || metrics.rangeHigh || row.entry || 0);
  if (type === 'ma30') return Number(metrics.ma30 || 0);
  if (type === 'volume') return Number(activeStrategyLabId === 'stage' ? 1.5 : 1.5);
 return 0;
 }

 function labAlertLabel(type = '') {
  if (type === 'breakout') return 'Breakout';
  if (type === 'ema_obv') return 'EMA + OBV';
  if (type === 'vwap') return 'VWAP retest';
  if (type === 'pressure') return 'Pressure';
  if (type === 'new_coin') return 'New coin';
  if (type === 'fade') return 'Fade trigger';
  if (type === 'reclaim') return 'Reclaim';
  if (type === 'climax') return 'Climax volume';
  if (type === 'ma30') return '30WMA cross';
  if (type === 'volume') return 'Volume confirm';
  return 'Scanner alert';
 }

 function labAlertTypesForRow(row = {}) {
  if (!row?.symbol || !isScannerOnly(row.strategyId || activeStrategyLabId)) return [];
  if (activeStrategyLabId === 'early' || row.strategyId === 'early') return ['breakout', 'vwap', 'reclaim', 'volume'];
  if (activeStrategyLabId === 'radar' || row.strategyId === 'radar') return ['breakout', 'ema_obv', 'vwap', 'pressure', 'new_coin'];
  if (activeStrategyLabId === 'reversal' || row.strategyId === 'reversal') return ['fade', 'vwap', 'reclaim', 'climax'];
  if (activeStrategyLabId === 'stage' || row.strategyId === 'stage') return ['breakout', 'ma30', 'volume'];
  return ['breakout', 'volume'];
 }

 function labIsAlertActive(row = {}, type = '') {
 const strategyId = labStrategyId(row);
 const symbol = String(row.symbol || '').toUpperCase();
 return strategyLabAlerts.some(alert => alert.strategyId === strategyId && alert.symbol === symbol && alert.type === type && alert.active !== false);
 }

 function labEvaluateAlert(alert = {}, rows = []) {
 const row = rows.find(item => String(item.symbol || '').toUpperCase() === String(alert.symbol || '').toUpperCase() && labStrategyId(item) === String(alert.strategyId || '').toLowerCase());
 if (!row) return { state: 'Waiting', detail: 'Symbol not in latest filtered results' };
 const price = labRowPrice(row);
 const target = Number(alert.target || 0);
  if (alert.type === 'breakout') return price > 0 && target > 0 && price >= target ? { state: 'Triggered', detail: `Price ${labPrice(price)} >= ${labPrice(target)}` } : { state: 'Watching', detail: `Needs ${labPrice(target)}` };
  if (alert.type === 'reclaim') return price > 0 && target > 0 && price >= target ? { state: 'Triggered', detail: `Reclaim ${labPrice(target)} active` } : { state: 'Watching', detail: `Waiting reclaim ${labPrice(target)}` };
  if (alert.type === 'ema_obv') return row.checks?.emaBull && row.checks?.obvUp ? { state: 'Triggered', detail: 'EMA and OBV confirmed' } : { state: 'Watching', detail: 'Waiting for EMA + OBV' };
  if (alert.type === 'vwap') return row.checks?.vwapReclaim || row.checks?.vwapLoss ? { state: 'Triggered', detail: row.checks?.vwapReclaim ? 'VWAP reclaim active' : 'VWAP loss active' } : { state: 'Watching', detail: 'Waiting for VWAP decision' };
  if (alert.type === 'pressure') return row.eventType === 'pressure' || row.raw?.eventType === 'pressure' ? { state: 'Triggered', detail: 'Pressure event active' } : { state: 'Watching', detail: 'Waiting for pressure' };
  if (alert.type === 'new_coin') return row.raw?.isFirstSeenNew || row.raw?.isShortHistory ? { state: 'Triggered', detail: 'New coin condition active' } : { state: 'Watching', detail: 'Waiting for new coin condition' };
  if (alert.type === 'ma30') return price > 0 && target > 0 && price >= target ? { state: 'Triggered', detail: `Above 30WMA ${labPrice(target)}` } : { state: 'Watching', detail: `Below 30WMA ${labPrice(target)}` };
 if (alert.type === 'volume') {
 const ratio = Number(row.raw?.stageMetrics?.volumeRatio10w || row.raw?.breakoutVolumeRatio || 0);
 return ratio >= target ? { state: 'Triggered', detail: `Volume ${labFmt(ratio, 2)}x` } : { state: 'Watching', detail: `Needs ${labFmt(target, 2)}x` };
 }
 return { state: 'Watching', detail: 'Waiting for scanner refresh' };
 }

 function scannerRegistryList() {
 const list = global.FWDTradeDeskStrategies?.listStrategies?.() || [
 { id: 'wizard', displayName: 'Wizard Scanner', shortName: 'Wizard', mode: 'scanner_only', scannerAction: 'wizard:startScan' },
 { id: 'stage', displayName: 'Stage Scanner', shortName: 'Stage', mode: 'scanner_only', scannerAction: 'stage:startScan' },
 ];
 return list.filter(strategy => String(strategy.id || '').toLowerCase() !== 'current');
 }

 function registryList() {
 return [
 { id: 'early', displayName: 'Early Opportunity', shortName: 'Early', mode: 'scanner_only', scannerAction: '' },
 ...scannerRegistryList(),
 ];
 }

 function getStrategyMeta(id = activeStrategyLabId) {
 const local = registryList().find(item => item.id === id);
 if (local) return local;
 return global.FWDTradeDeskStrategies?.getStrategy?.(id) || registryList()[0];
 }

 function isStageActive() {
  return activeStrategyLabId === 'stage';
 }

 function isRadarActive() {
  return activeStrategyLabId === 'radar';
 }

 function isScannerOnly(id = activeStrategyLabId) {
  return String(getStrategyMeta(id)?.mode || '').toLowerCase() === 'scanner_only';
 }

 function labNormalizeCurrentResult(item = {}) {
 const direction = String(item.direction || '').toUpperCase();
 const score = Math.round(Number(item.score || 0));
 return {
 symbol: String(item.symbol || '').toUpperCase(),
 strategyId: 'current',
 signal: direction.includes('LONG') || direction === 'LONG' ? 'BUY' : direction || 'WATCH',
 setupLabel: item.setupType || item.emergingMove?.label || item.alertTier || 'Current Setup',
 score,
 confidence: score,
 entry: Number(item.entry || item.price || 0),
 stop: Number(item.sl || 0),
 riskPercent: Number(item.riskPct || 0),
 targets: { target2R: item.tp2 || item.tp1 || 0, target3R: item.tp2 || 0 },
 reasons: Array.isArray(item.reasons) ? item.reasons : [],
 checks: {
 currentScanner: true,
 mtfConfirmed: !!item.mtfConfirmed,
 tradeQuality: Number(item.tradeQuality?.score || 0),
 },
 raw: item,
 mode: 'scanner_only',
 canLiveTrade: false,
 canPaperTrade: false,
 ts: Number(item.ts || item.updatedAt || Date.now()),
 };
 }

 function labCurrentRows(snapshot = {}) {
 const rows = Array.isArray(snapshot.current?.results) ? snapshot.current.results : [];
 return rows.map(labNormalizeCurrentResult)
 .sort((a, b) => Number(b.raw?.tradeQuality?.score || 0) - Number(a.raw?.tradeQuality?.score || 0) || Number(b.score || 0) - Number(a.score || 0));
 }

 function labStrategyRows(snapshot = strategyLabSnapshot, id = activeStrategyLabId) {
 if (id === 'early') return labEarlyOpportunityRows(snapshot || {});
 if (id === 'current') return labCurrentRows(snapshot || {});
 return Array.isArray(snapshot?.[id]?.results) ? snapshot[id].results : [];
 }

 function labAllScannerRows(snapshot = strategyLabSnapshot) {
 return scannerRegistryList()
 .filter(strategy => String(strategy.mode || '').toLowerCase() === 'scanner_only')
 .flatMap(strategy => labStrategyRows(snapshot || {}, strategy.id).map(row => ({ ...row, strategyId: row.strategyId || strategy.id })));
 }

 function labSourceLabel(id = '') {
 if (id === 'wizard') return 'Wizard';
 if (id === 'stage') return 'Stage';
 if (id === 'radar') return 'Radar';
 if (id === 'reversal') return 'Reversal';
 return String(id || 'Scanner');
 }

 function labRowLevel(row = {}) {
 return Number(row.entry || row.triggerPrice || row.raw?.latestPrice || row.raw?.stageMetrics?.close || row.raw?.resistance || row.raw?.vwap || 0);
 }

 function labEarlyOpportunityRows(snapshot = strategyLabSnapshot) {
 const scannerRows = scannerRegistryList()
 .flatMap(strategy => (Array.isArray(snapshot?.[strategy.id]?.results) ? snapshot[strategy.id].results : [])
 .map(row => ({ ...row, strategyId: row.strategyId || strategy.id, strategyName: strategy.shortName || strategy.displayName || strategy.id })));
 const grouped = scannerRows.reduce((map, row) => {
 const symbol = String(row.symbol || '').trim().toUpperCase();
 if (!symbol) return map;
 if (!map[symbol]) map[symbol] = [];
 map[symbol].push(row);
 return map;
 }, {});
 return Object.entries(grouped).map(([symbol, sourceRows]) => {
 const radar = sourceRows.find(row => row.strategyId === 'radar') || {};
 const wizard = sourceRows.find(row => row.strategyId === 'wizard') || {};
 const stage = sourceRows.find(row => row.strategyId === 'stage') || {};
 const reversal = sourceRows.find(row => row.strategyId === 'reversal') || {};
 const events = sourceRows.map(row => String(row.eventType || row.raw?.eventType || row.stage || row.signal || '').toLowerCase()).filter(Boolean);
 const scoreParts = [];
 const reasons = [];
 const confirmations = [];
 const rejections = [];
 let score = 18;
 const addScore = (label, value, reason = '') => {
  const safeValue = Number(value || 0);
  if (!safeValue) return;
  score += safeValue;
  scoreParts.push({ label, value: safeValue });
  if (reason) reasons.push(reason);
 };
 const radarRaw = radar.raw || {};
 const wizardRaw = wizard.raw || {};
 const stageRaw = stage.raw || {};
 const reversalRaw = reversal.raw || {};
 const isFresh = !!(radarRaw.isFirstSeenNew || radarRaw.isShortHistory || events.includes('new_coin'));
 const volumeRatio = Math.max(Number(radarRaw.volumeRatio || 0), Number(wizardRaw.breakoutVolumeRatio || 0), Number(reversalRaw.volumeRatio || 0), Number(stageRaw.stageMetrics?.volumeRatio10w || 0));
 const emaObv = events.includes('ema_obv') || !!(radar.checks?.emaBull && radar.checks?.obvUp);
 const vwapReclaim = events.includes('vwap') || !!radar.checks?.vwapReclaim;
 const breakoutNear = events.includes('breakout') || !!wizard.checks?.breakoutReady || Number(wizardRaw.pivotPrice || 0) > 0;
 const baseForming = stage.stage === 'STAGE_I' || wizard.signal === 'WATCHLIST' || !!wizardRaw.vcp?.detected || Array.isArray(wizardRaw.contractions);
 const earlyStage2 = stage.stage === 'STAGE_II' && Number(stage.confidence || stage.score || 0) < 82;
 const reclaim = events.includes('reclaim') || events.includes('mean_reversion') || !!reversal.checks?.closeBackInsideHigh || !!reversal.checks?.closeBackInsideLow;
 const sourceCount = sourceRows.length;
 addScore('Fresh activity', isFresh ? 15 : 0, 'Fresh or short-history activity is visible');
 addScore('Volume expansion', volumeRatio >= 1.5 ? Math.min(15, Math.round(volumeRatio * 4)) : 0, `Volume expansion ${labFmt(volumeRatio, 2)}x`);
 addScore('EMA/OBV or VWAP', emaObv || vwapReclaim ? 18 : 0, emaObv ? 'EMA and OBV improve together' : 'VWAP reclaim or decision area is active');
 addScore('Base or early trend', baseForming || earlyStage2 ? 15 : 0, baseForming ? 'Base or compression is forming' : 'Early Stage II trend is visible');
 addScore('Near breakout', breakoutNear ? 12 : 0, 'Price is near a trigger or resistance level');
 addScore('Reclaim setup', reclaim ? 10 : 0, 'Reclaim or mean-reversion evidence is present');
 addScore('Cross-lab agreement', sourceCount > 1 ? Math.min(15, (sourceCount - 1) * 6) : 0, `${sourceCount} scanners mention this coin`);
 const riskFlags = [];
 const extended = !!(radarRaw.avoidTrap?.active || radarRaw.extended || events.includes('avoid_trap') || events.includes('avoid_chase'));
 const lowLiquidity = !!(radar.checks?.lowLiquidity || reversal.checks?.lowLiquidity || (Array.isArray(radar.riskFlags) && radar.riskFlags.some(flag => /thin|liquidity/i.test(String(flag)))));
 const fundingCrowded = !!(reversal.checks?.fundingCrowdedLong || reversal.checks?.fundingCrowdedShort || radarRaw.highFundingAbs);
 if (extended) riskFlags.push('Move may already be late or stretched');
 if (lowLiquidity) riskFlags.push('Thin liquidity can create bad fills');
 if (fundingCrowded) riskFlags.push('Funding crowding can reverse quickly');
 if (extended) score -= 14;
 if (lowLiquidity) score -= 10;
 if (fundingCrowded) score -= 6;
 if (!volumeRatio || volumeRatio < 1.15) rejections.push('Volume has not expanded yet');
 if (!breakoutNear && !vwapReclaim && !reclaim) rejections.push('No clear trigger level yet');
 if (riskFlags.length) rejections.push(...riskFlags.slice(0, 3));
 if (volumeRatio >= 1.5) confirmations.push('Volume expansion holds');
 if (breakoutNear) confirmations.push('Break or close above trigger level');
 if (baseForming) confirmations.push('Base stays tight without losing support');
 if (reclaim || vwapReclaim) confirmations.push('Reclaim level holds on retest');
 const earlyType = isFresh
 ? 'fresh'
 : baseForming || earlyStage2
 ? 'base'
 : reclaim || vwapReclaim
 ? 'reclaim'
 : breakoutNear
 ? 'breakout_near'
 : sourceCount > 1
 ? 'cross_lab'
 : extended
 ? 'avoid_late'
 : 'compression';
 const bestSource = sourceRows.slice().sort((a, b) => Number(b.score || b.confidence || 0) - Number(a.score || a.confidence || 0))[0] || {};
 const entry = labRowLevel(bestSource) || labRowLevel(radar) || labRowLevel(wizard) || labRowLevel(stage) || labRowLevel(reversal);
 const stop = Number(bestSource.stop || bestSource.protectLevel || radar.stop || wizard.stop || stage.protectLevel || reversal.stop || 0);
 const trigger = Number(wizard.triggerPrice || wizardRaw.pivotPrice || radarRaw.resistance || radarRaw.vwap || stage.triggerPrice || reversal.entry || entry || 0);
 const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
 const signal = boundedScore >= 72 && !extended ? 'BUY' : boundedScore >= 45 ? 'WATCHLIST' : 'IGNORE';
 return {
  symbol,
  strategyId: 'early',
  signal,
  setupLabel: earlyType.replace(/_/g, ' '),
  direction: bestSource.direction || radar.direction || wizard.direction || reversal.direction || '',
  stage: stage.stage || '',
  stageLabel: stage.stageLabel || '',
  actionLabel: boundedScore >= 72 ? 'Review early trigger' : boundedScore >= 50 ? 'Build watch' : 'Avoid chase',
  priorityLabel: boundedScore >= 78 ? 'Early leader' : boundedScore >= 62 ? 'Early watch' : boundedScore >= 45 ? 'Needs proof' : 'Avoid late',
  eventType: earlyType,
  confidence: boundedScore,
  score: boundedScore,
  entry,
  stop,
  triggerPrice: trigger,
  protectLevel: stop,
  targets: {
   trigger,
   vwap: Number(radarRaw.vwap || reversalRaw.vwap || 0),
   resistance: Number(radarRaw.resistance || wizardRaw.pivotPrice || 0),
   support: Number(radarRaw.support || stageRaw.stageMetrics?.rangeLow || 0),
  },
  reasons: reasons.slice(0, 10),
  checks: {
   fresh: isFresh,
   volumeExpansion: volumeRatio >= 1.5,
   emaObv,
   vwapReclaim,
   breakoutNear,
   baseForming,
   reclaim,
   crossLab: sourceCount > 1,
   notExtended: !extended,
  },
  riskFlags,
  canLiveTrade: false,
  canPaperTrade: false,
  ts: Math.max(...sourceRows.map(row => Number(row.ts || row.raw?.ts || 0)), 0) || Date.now(),
  raw: {
   earlyType,
   sourceCount,
   sources: sourceRows.map(row => labSourceLabel(row.strategyId)),
   sourceRows: sourceRows.map(row => ({
    strategyId: row.strategyId,
    symbol: row.symbol,
    signal: row.signal,
    eventType: row.eventType,
    stage: row.stage,
    score: row.score || row.confidence || 0,
    actionLabel: row.actionLabel || '',
   })),
   scoreParts,
   confirmations,
   rejections,
   chartLevels: {
    trigger,
    entry,
    stop,
    vwap: Number(radarRaw.vwap || reversalRaw.vwap || 0),
    resistance: Number(radarRaw.resistance || wizardRaw.pivotPrice || 0),
    support: Number(radarRaw.support || stageRaw.stageMetrics?.rangeLow || 0),
   },
   volumeRatio,
  },
 };
 }).sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.raw?.sourceCount || 0) - Number(a.raw?.sourceCount || 0) || String(a.symbol || '').localeCompare(String(b.symbol || '')));
 }

 function labIsAvoidRow(row = {}) {
 const eventType = String(row.eventType || row.raw?.eventType || '').toLowerCase();
 return row.signal === 'IGNORE' || eventType.includes('avoid') || (Array.isArray(row.riskFlags) && row.riskFlags.length > 0 && Number(row.score || 0) < 55);
 }

 function applyStrategyQualityFilters(rows = []) {
 return (Array.isArray(rows) ? rows : []).filter(row => {
 if (Number(row.score || row.confidence || 0) < Number(strategyLabMinScore || 0)) return false;
 if (strategyLabHideAvoid && labIsAvoidRow(row)) return false;
 return true;
 });
 }

 function labRowsForActive(snapshot = strategyLabSnapshot) {
  const rows = labStrategyRows(snapshot || {}, activeStrategyLabId);
  if (activeStrategyLabId === 'current' || strategyLabViewMode === 'all') return applyStrategyQualityFilters(rows);
  if (activeStrategyLabId === 'early') {
   if (strategyLabViewMode === 'fresh') return applyStrategyQualityFilters(rows.filter(row => row.raw?.earlyType === 'fresh'));
   if (strategyLabViewMode === 'breakout') return applyStrategyQualityFilters(rows.filter(row => row.raw?.earlyType === 'breakout_near' || row.checks?.breakoutNear));
   if (strategyLabViewMode === 'base') return applyStrategyQualityFilters(rows.filter(row => row.raw?.earlyType === 'base' || row.checks?.baseForming));
   if (strategyLabViewMode === 'reclaim') return applyStrategyQualityFilters(rows.filter(row => row.raw?.earlyType === 'reclaim' || row.checks?.reclaim || row.checks?.vwapReclaim));
   if (strategyLabViewMode === 'cross') return applyStrategyQualityFilters(rows.filter(row => Number(row.raw?.sourceCount || 0) > 1));
   if (strategyLabViewMode === 'avoid') return applyStrategyQualityFilters(rows.filter(row => row.raw?.earlyType === 'avoid_late' || labIsAvoidRow(row)));
   return applyStrategyQualityFilters(rows.filter(row => row.signal !== 'IGNORE' && row.raw?.earlyType !== 'avoid_late')).slice(0, 14);
  }
  if (activeStrategyLabId === 'radar') {
   if (strategyLabViewMode === 'breakouts') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'breakout' || row.raw?.eventType === 'breakout'));
   if (strategyLabViewMode === 'emaobv') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'ema_obv' || row.raw?.eventType === 'ema_obv'));
   if (strategyLabViewMode === 'pressure') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'pressure' || row.raw?.eventType === 'pressure'));
   if (strategyLabViewMode === 'new') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'new_coin' || row.raw?.eventType === 'new_coin' || row.raw?.isFirstSeenNew || row.raw?.isShortHistory));
   if (strategyLabViewMode === 'avoid') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'avoid_trap' || row.raw?.eventType === 'avoid_trap' || row.signal === 'IGNORE' || (Array.isArray(row.riskFlags) && row.riskFlags.length)));
   return applyStrategyQualityFilters(rows.filter(row => row.eventType !== 'review' && row.eventType !== 'avoid_trap' && row.signal !== 'IGNORE')).slice(0, 10);
  }
  if (activeStrategyLabId === 'reversal') {
   if (strategyLabViewMode === 'fade') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'fade_extreme' || row.raw?.eventType === 'fade_extreme'));
   if (strategyLabViewMode === 'liquidation') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'liquidation_reversal' || row.raw?.eventType === 'liquidation_reversal'));
   if (strategyLabViewMode === 'mean') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'mean_reversion' || row.raw?.eventType === 'mean_reversion'));
   if (strategyLabViewMode === 'reclaim') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'reclaim' || row.raw?.eventType === 'reclaim'));
   if (strategyLabViewMode === 'avoid') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'avoid_chase' || row.raw?.eventType === 'avoid_chase' || row.signal === 'IGNORE' || (Array.isArray(row.riskFlags) && row.riskFlags.length)));
   return applyStrategyQualityFilters(rows.filter(row => !['review', 'avoid_chase'].includes(String(row.eventType || row.raw?.eventType || '')) && row.signal !== 'IGNORE')).slice(0, 10);
  }
  if (activeStrategyLabId === 'stage') {
 if (strategyLabViewMode === 'stage2') return applyStrategyQualityFilters(rows.filter(row => row.stage === 'STAGE_II'));
 if (strategyLabViewMode === 'stage1') return applyStrategyQualityFilters(rows.filter(row => row.stage === 'STAGE_I'));
 if (strategyLabViewMode === 'stage3') return applyStrategyQualityFilters(rows.filter(row => row.stage === 'STAGE_III'));
 if (strategyLabViewMode === 'stage4') return applyStrategyQualityFilters(rows.filter(row => row.stage === 'STAGE_IV'));
 if (strategyLabViewMode === 'review') return applyStrategyQualityFilters(rows.filter(row => row.stage === 'REVIEW'));
 return applyStrategyQualityFilters(rows);
 }
 if (strategyLabViewMode === 'buy') return applyStrategyQualityFilters(rows.filter(row => row.signal === 'BUY'));
 if (strategyLabViewMode === 'watchlist') return applyStrategyQualityFilters(rows.filter(row => row.signal === 'WATCHLIST'));
 if (strategyLabViewMode === 'sell') return applyStrategyQualityFilters(rows.filter(row => row.signal === 'SELL'));
 if (strategyLabViewMode === 'ignored') return applyStrategyQualityFilters(rows.filter(row => row.signal === 'IGNORE'));
 const actionable = rows.filter(row => row.signal === 'BUY' || row.signal === 'WATCHLIST' || row.signal === 'SELL' || Number(row.score || 0) >= 55);
 return applyStrategyQualityFilters(actionable.length ? actionable : rows).slice(0, 25);
 }

 function labStatusForActive(snapshot = strategyLabSnapshot) {
 if (activeStrategyLabId !== 'current') return snapshot?.[activeStrategyLabId]?.status || {};
 return {
 status: snapshot?.current?.status || 'Current scanner ready',
 active: false,
 lastScanTs: snapshot?.current?.lastScanTs || 0,
 progress: 100,
 };
 }

 function buildStrategyPills() {
 return registryList().map(strategy => {
 const active = strategy.id === activeStrategyLabId ? 'active' : '';
 const mode = String(strategy.mode || '').replace(/_/g, ' ');
 return `<button type="button" class="strategy-lab-segment ${active}" data-strategy-lab-select="${labEsc(strategy.id)}">
 <span>${labEsc(strategy.shortName || strategy.displayName || strategy.id)}</span>
 <small>${labEsc(mode)}</small>
 </button>`;
 }).join('');
 }

 function buildViewModePills() {
  if (!isScannerOnly()) return '';
  const modes = activeStrategyLabId === 'early'
  ? [
  ['focus', 'Best Early'],
  ['fresh', 'Fresh'],
  ['breakout', 'Near Breakout'],
  ['base', 'Base'],
  ['reclaim', 'Reclaim'],
  ['cross', 'Cross Lab'],
  ['avoid', 'Avoid Late'],
  ['all', 'All'],
  ]
  : activeStrategyLabId === 'radar'
  ? [
  ['focus', 'Focus'],
  ['breakouts', 'Breakouts'],
  ['emaobv', 'EMA + OBV'],
  ['pressure', 'Pressure'],
  ['new', 'New Coins'],
  ['avoid', 'Avoid'],
  ['all', 'All'],
  ]
  : activeStrategyLabId === 'reversal'
  ? [
  ['focus', 'Focus'],
  ['liquidation', 'Liq Reversal'],
  ['fade', 'Fade Extreme'],
  ['mean', 'Mean Revert'],
  ['reclaim', 'Reclaim'],
  ['avoid', 'Avoid Chase'],
  ['all', 'All'],
  ]
  : activeStrategyLabId === 'stage'
  ? [
 ['focus', 'Best Order'],
 ['stage2', 'Stage II'],
 ['stage1', 'Stage I'],
 ['stage3', 'Stage III'],
 ['stage4', 'Stage IV'],
 ['review', 'Review'],
 ['all', 'All'],
 ]
 : [
 ['focus', 'Best Candidates'],
 ['buy', 'Buy'],
 ['watchlist', 'Watchlist'],
 ['sell', 'Sell'],
 ['ignored', 'Ignored'],
 ['all', 'All'],
 ];
 return `<div class="strategy-lab-viewmodes">${modes.map(([id, label]) => `<button type="button" class="${strategyLabViewMode === id ? 'active' : ''}" data-strategy-view-mode="${labEsc(id)}"${labHelpAttrs(id, activeStrategyLabId)}>${labEsc(label)}</button>`).join('')}</div>`;
 }

 function buildMetric(label, value, tone = '') {
 return `<div class="strategy-lab-metric ${labEsc(tone)}"${labHelpAttrs(label, activeStrategyLabId, isScannerOnly())}><span>${labEsc(label)}</span><strong>${labEsc(value)}</strong></div>`;
 }

 function buildActions() {
 if (activeStrategyLabId === 'current') {
 return '<button type="button" class="bsm primary" id="btnOpenCurrentScan">Open Current Scan</button><button type="button" class="bsm secondary" id="btnRefreshStrategyLab">Refresh</button>';
 }
 const strategy = getStrategyMeta();
 if (activeStrategyLabId === 'early') {
 return '<button type="button" class="bsm primary" id="btnRunAllStrategyScans">Run All Scanners</button><button type="button" class="bsm secondary" id="btnRefreshStrategyLab">Refresh</button>';
 }
 const notificationToggle = activeStrategyLabId === 'radar'
 ? `<button type="button" class="bsm ${strategyLabRadarNotificationsEnabled ? 'primary' : 'secondary'} radar-notify-toggle" id="btnRadarNotificationToggle" aria-pressed="${strategyLabRadarNotificationsEnabled ? 'true' : 'false'}"><span>${strategyLabRadarNotificationsEnabled ? 'Notifications On' : 'Notifications Off'}</span></button>`
 : '';
 return `${notificationToggle}<button type="button" class="bsm primary" id="btnRunStrategyScan" data-run-strategy="${labEsc(strategy.id)}">Run ${labEsc(strategy.shortName || strategy.displayName || strategy.id)} Scan</button>
 <button type="button" class="bsm secondary" id="btnRefreshStrategyLab">Refresh</button>`;
 }

 function countStage(rows = [], stage = '') {
 return rows.filter(row => String(row?.stage || '') === stage).length;
 }

 function buildStrategyDiagnostics(status = {}) {
  if (!isScannerOnly()) return '';
  if (activeStrategyLabId === 'radar') {
   const skipped = status.skipped || {};
   const diagnostics = status.diagnostics || {};
   const notes = [
   diagnostics.freshRows ? `${diagnostics.freshRows} fresh/short-history coins in universe` : '',
   skipped.insufficientIntraday ? `${skipped.insufficientIntraday} with insufficient 15m history` : '',
   skipped.reviewOnly ? `${skipped.reviewOnly} review-only rows` : '',
   skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
   ].filter(Boolean);
   return notes.length ? `<div class="strategy-lab-diagnostics">${notes.map(labEsc).join(' | ')}</div>` : '';
  }
  if (activeStrategyLabId === 'reversal') {
   const skipped = status.skipped || {};
   const diagnostics = status.diagnostics || {};
   const notes = [
   diagnostics.universeRows ? `${diagnostics.universeRows} liquid symbols checked for stretch` : '',
   skipped.insufficientHistory ? `${skipped.insufficientHistory} with short 15m history` : '',
   skipped.reviewOnly ? `${skipped.reviewOnly} review-only rows` : '',
   skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
   ].filter(Boolean);
   return notes.length ? `<div class="strategy-lab-diagnostics">${notes.map(labEsc).join(' | ')}</div>` : '';
  }
  if (activeStrategyLabId === 'stage') {
 const skipped = status.skipped || {};
 const diagnostics = status.diagnostics || {};
 const notes = [
 diagnostics.lowLatestLiquidity ? `${diagnostics.lowLatestLiquidity} below latest-liquidity filter` : '',
 skipped.insufficientHistory ? `${skipped.insufficientHistory} with short history` : '',
 skipped.lowAverageLiquidity ? `${skipped.lowAverageLiquidity} below average-liquidity threshold` : '',
 skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
 ].filter(Boolean);
 return notes.length ? `<div class="strategy-lab-diagnostics">${notes.map(labEsc).join(' | ')}</div>` : '';
 }
 const counts = status.signalCounts || {};
 const notes = [
 `Buy ${Number(counts.BUY || 0)}`,
 `Watch ${Number(counts.WATCHLIST || 0)}`,
 `Sell ${Number(counts.SELL || 0)}`,
 `Ignore ${Number(counts.IGNORE || 0)}`,
 ];
 return `<div class="strategy-lab-diagnostics">${notes.map(labEsc).join(' | ')}</div>`;
 }

 function buildStrategyResearchDashboard(rows = [], status = {}) {
 const allRows = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId);
 const scannerRows = labAllScannerRows(strategyLabSnapshot || {});
 const newSymbols = scannerRows
 .filter(row => row.raw?.isFirstSeenNew || row.raw?.isShortHistory)
 .map(row => row.symbol);
 const repeated = scannerRows.reduce((map, row) => {
 const symbol = String(row.symbol || '').toUpperCase();
 if (!symbol) return map;
 map[symbol] = (map[symbol] || 0) + 1;
 return map;
 }, {});
 const repeatedSymbols = Object.entries(repeated).filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 6);
 const avoidRows = allRows.filter(labIsAvoidRow).length;
 const bestRows = allRows.filter(row => Number(row.score || row.confidence || 0) >= 70).length;
 const reviewed = strategyLabResearchWatchlist.filter(symbol => allRows.some(row => row.symbol === symbol)).length;
 return `<section class="strategy-research-dashboard">
 <div class="strategy-research-lead">
 <span>Daily research board</span>
 <strong>${labEsc(getStrategyMeta()?.shortName || getStrategyMeta()?.displayName || 'Scanner')}</strong>
 <p>${labEsc(allRows.length ? `${bestRows} high-quality rows, ${avoidRows} avoid/risk rows, ${reviewed} saved to review list.` : 'Run a scan to build today research context.')}</p>
 </div>
 <div class="strategy-research-stats">
 <div><span>Active view</span><strong>${labEsc(strategyLabViewMode.replace(/_/g, ' '))}</strong></div>
 <div><span>Filtered rows</span><strong>${rows.length}/${allRows.length}</strong></div>
 <div><span>New/short history</span><strong>${newSymbols.length}</strong></div>
 <div><span>Repeated symbols</span><strong>${repeatedSymbols.length}</strong></div>
 </div>
 ${repeatedSymbols.length ? `<div class="strategy-research-symbols"><span>Seen across labs</span>${repeatedSymbols.map(([symbol, count]) => `<button type="button" data-strategy-symbol="${labEsc(symbol)}">${labEsc(symbol)}<small>${count} labs</small></button>`).join('')}</div>` : ''}
 </section>`;
 }

 function buildStrategyScorecard(rows = [], status = {}) {
 const allRows = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId);
 const high = allRows.filter(row => Number(row.score || row.confidence || 0) >= 70);
 const medium = allRows.filter(row => Number(row.score || row.confidence || 0) >= 50 && Number(row.score || row.confidence || 0) < 70);
 const avoid = allRows.filter(labIsAvoidRow);
 const best = high[0] || allRows[0] || null;
 const weak = avoid[0] || allRows.slice().reverse().find(row => Number(row.score || row.confidence || 0) < 50);
 const freshness = labAge(status.lastScanTs || status.ts);
 return `<section class="strategy-scorecard">
 <div class="strategy-scorecard-main">
 <span>Strategy scorecard</span>
 <strong>${best ? `${labEsc(best.symbol)} ${labFmt(best.score || best.confidence, 0)}/100` : 'Waiting for scan'}</strong>
 <p>${best ? labEsc(labDecisionPack(best).nextAction || labPriorityLabel(best)) : 'No top setup available yet.'}</p>
 </div>
 <div class="strategy-scorecard-grid">
 <div><span>High quality</span><strong>${high.length}</strong><small>Score 70+</small></div>
 <div><span>Review zone</span><strong>${medium.length}</strong><small>Score 50-69</small></div>
 <div><span>Avoid/risk</span><strong>${avoid.length}</strong><small>${weak ? weak.symbol : 'No row'}</small></div>
 <div><span>Freshness</span><strong>${labEsc(freshness)}</strong><small>Latest scan</small></div>
 </div>
 </section>`;
 }

 function buildStrategyQualityBar() {
 const options = [0, 50, 60, 70];
 return `<section class="strategy-quality-bar">
 <div>
 <span>Quality filters</span>
 <strong>${strategyLabMinScore ? `Score ${strategyLabMinScore}+` : 'All scores'}${strategyLabHideAvoid ? ' | avoid hidden' : ''}</strong>
 </div>
 <div class="strategy-quality-actions">
 ${options.map(score => `<button type="button" class="${Number(strategyLabMinScore || 0) === score ? 'active' : ''}" data-strategy-min-score="${score}">${score ? `${score}+` : 'All'}</button>`).join('')}
 <button type="button" class="${strategyLabHideAvoid ? 'active' : ''}" data-strategy-hide-avoid="${strategyLabHideAvoid ? '0' : '1'}">Hide avoid</button>
 </div>
 </section>`;
 }

 function labCompareRowsForSymbol(symbol = '') {
 const safeSymbol = String(symbol || '').trim().toUpperCase();
 if (!safeSymbol) return [];
 return registryList()
 .filter(strategy => String(strategy.mode || '').toLowerCase() === 'scanner_only')
 .map(strategy => {
 const row = labStrategyRows(strategyLabSnapshot || {}, strategy.id).find(item => String(item.symbol || '').toUpperCase() === safeSymbol);
 return row ? { ...row, strategyId: row.strategyId || strategy.id, strategyName: strategy.shortName || strategy.displayName || strategy.id } : null;
 })
 .filter(Boolean);
 }

 function buildStrategyComparePanel(selected = null) {
 const symbol = selected?.symbol || selectedStrategySymbol || '';
 const compareRows = labCompareRowsForSymbol(symbol);
 if (!symbol || !compareRows.length) return '';
 return `<section class="strategy-compare-panel">
 <div class="strategy-panel-head">
 <span>Compare mode</span>
 <strong>${labEsc(symbol)}</strong>
 <button type="button" data-strategy-chart-review="${labEsc(symbol)}">Review chart</button>
 </div>
 <div class="strategy-compare-grid">
 ${compareRows.map(row => `<button type="button" class="${rowTone(row)}" data-strategy-lab-select="${labEsc(row.strategyId)}" data-strategy-symbol="${labEsc(row.symbol)}">
 <span>${labEsc(row.strategyName)}</span>
 <strong>${labEsc(rowSignalLabel(row))}</strong>
 <small>${labFmt(row.score || row.confidence, 0)}/100 | ${labEsc(labPriorityLabel(row))}</small>
 </button>`).join('')}
 </div>
 </section>`;
 }

 function buildStrategyWatchlistPanel() {
 const activeRows = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId);
 const saved = strategyLabResearchWatchlist
 .map(symbol => activeRows.find(row => row.symbol === symbol) || labAllScannerRows(strategyLabSnapshot || {}).find(row => row.symbol === symbol) || { symbol })
 .slice(0, 12);
 return `<section class="strategy-watchlist-panel">
 <div class="strategy-panel-head">
 <span>Review watchlist</span>
 <strong>${saved.length} saved</strong>
 ${selectedStrategySymbol ? `<button type="button" data-strategy-watchlist-toggle="${labEsc(selectedStrategySymbol)}">${strategyLabResearchWatchlist.includes(selectedStrategySymbol) ? 'Remove selected' : 'Save selected'}</button>` : ''}
 </div>
 <div class="strategy-watchlist-row">
 ${saved.length ? saved.map(row => `<button type="button" data-strategy-symbol="${labEsc(row.symbol)}">${labEsc(row.symbol)}<small>${labEsc(row.setupLabel || row.eventType || row.stageLabel || 'Review')}</small></button>`).join('') : '<span>No saved coins yet. Select a row and save it for chart review.</span>'}
 </div>
 </section>`;
 }

 function buildGenericChartDraft(row = {}) {
 const isShort = String(row.direction || '').includes('short') || row.signal === 'SELL';
 return {
 symbol: String(row.symbol || '').trim().toUpperCase(),
 side: isShort ? 'sell' : 'buy',
 entry: Number(row.entry || row.triggerPrice || row.raw?.latestPrice || row.raw?.stageMetrics?.close || 0),
 stopLoss: Number(row.stop || row.protectLevel || row.raw?.stageMetrics?.rangeLow || 0),
 takeProfit: Number(row.targets?.target2R || row.targets?.target1 || row.exitPrice || 0),
 size: 1,
 sizeMode: 'contracts',
 orderType: 'market_order',
 entryMode: 'market',
 source: `strategy-lab-${activeStrategyLabId}`,
 note: `${getStrategyMeta()?.displayName || 'Strategy Lab'} chart review only. No live or paper order is created.`,
 updatedAt: Date.now(),
 };
 }

 function buildDecisionDashboard(rows = [], status = {}) {
  if (!isScannerOnly()) return '';
  const allRows = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId);
  const lanes = activeStrategyLabId === 'early'
  ? [
  { key: 'fresh', label: 'Fresh Activity', tone: 'buy', rows: allRows.filter(row => row.raw?.earlyType === 'fresh') },
  { key: 'breakout', label: 'Near Breakout', tone: 'watch', rows: allRows.filter(row => row.raw?.earlyType === 'breakout_near' || row.checks?.breakoutNear) },
  { key: 'base', label: 'Base Forming', tone: 'info', rows: allRows.filter(row => row.raw?.earlyType === 'base' || row.checks?.baseForming) },
  { key: 'reclaim', label: 'Reclaim Watch', tone: 'developing', rows: allRows.filter(row => row.raw?.earlyType === 'reclaim' || row.checks?.reclaim || row.checks?.vwapReclaim) },
  { key: 'cross', label: 'Cross Lab', tone: 'buy', rows: allRows.filter(row => Number(row.raw?.sourceCount || 0) > 1) },
  { key: 'avoid', label: 'Avoid Late', tone: 'ignore', rows: allRows.filter(row => row.raw?.earlyType === 'avoid_late' || labIsAvoidRow(row)) },
  ]
  : activeStrategyLabId === 'radar'
  ? [
  { key: 'breakouts', label: 'Breakout Long', tone: 'buy', rows: allRows.filter(row => row.eventType === 'breakout' || row.raw?.eventType === 'breakout') },
  { key: 'emaobv', label: 'EMA + OBV', tone: 'watch', rows: allRows.filter(row => row.eventType === 'ema_obv' || row.raw?.eventType === 'ema_obv') },
  { key: 'pressure', label: 'Pressure', tone: 'developing', rows: allRows.filter(row => row.eventType === 'pressure' || row.raw?.eventType === 'pressure') },
  { key: 'new', label: 'New Coin', tone: 'info', rows: allRows.filter(row => row.eventType === 'new_coin' || row.raw?.eventType === 'new_coin' || row.raw?.isFirstSeenNew || row.raw?.isShortHistory) },
  { key: 'avoid', label: 'Avoid / Trap', tone: 'ignore', rows: allRows.filter(row => row.eventType === 'avoid_trap' || row.raw?.eventType === 'avoid_trap' || row.signal === 'IGNORE') },
  ]
  : activeStrategyLabId === 'reversal'
  ? [
  { key: 'liquidation', label: 'Liq Reversal', tone: 'buy', rows: allRows.filter(row => row.eventType === 'liquidation_reversal' || row.raw?.eventType === 'liquidation_reversal') },
  { key: 'fade', label: 'Fade Extreme', tone: 'developing', rows: allRows.filter(row => row.eventType === 'fade_extreme' || row.raw?.eventType === 'fade_extreme') },
  { key: 'mean', label: 'Mean Revert', tone: 'watch', rows: allRows.filter(row => row.eventType === 'mean_reversion' || row.raw?.eventType === 'mean_reversion') },
  { key: 'reclaim', label: 'Reclaim', tone: 'info', rows: allRows.filter(row => row.eventType === 'reclaim' || row.raw?.eventType === 'reclaim') },
  { key: 'avoid', label: 'Avoid Chase', tone: 'ignore', rows: allRows.filter(row => row.eventType === 'avoid_chase' || row.raw?.eventType === 'avoid_chase' || row.signal === 'IGNORE') },
  ]
  : activeStrategyLabId === 'stage'
  ? [
 { key: 'stage2', label: 'Buy / Hold', tone: 'buy', rows: allRows.filter(row => row.stage === 'STAGE_II') },
 { key: 'stage1', label: 'Wait Base', tone: 'watch', rows: allRows.filter(row => row.stage === 'STAGE_I') },
 { key: 'stage3', label: 'Protect', tone: 'developing', rows: allRows.filter(row => row.stage === 'STAGE_III') },
 { key: 'stage4', label: 'Avoid Long', tone: 'ignore', rows: allRows.filter(row => row.stage === 'STAGE_IV') },
 { key: 'review', label: 'Review', tone: 'info', rows: allRows.filter(row => row.stage === 'REVIEW') },
 ]
 : [
 { key: 'buy', label: 'Buy Now', tone: 'buy', rows: allRows.filter(row => row.signal === 'BUY') },
 { key: 'watchlist', label: 'Wait', tone: 'watch', rows: allRows.filter(row => row.signal === 'WATCHLIST') },
 { key: 'sell', label: 'Sell Watch', tone: 'developing', rows: allRows.filter(row => row.signal === 'SELL') },
 { key: 'ignored', label: 'Avoid', tone: 'ignore', rows: allRows.filter(row => row.signal === 'IGNORE') },
 ];
  const marketText = activeStrategyLabId === 'early'
  ? `Early engine: ${allRows.length} combined rows, ${allRows.filter(row => Number(row.raw?.sourceCount || 0) > 1).length} cross-lab confirmations`
  : activeStrategyLabId === 'radar'
  ? `Advisory only: ${allRows.length} live market rows, no auto-trade writes`
  : activeStrategyLabId === 'reversal'
  ? `Counter-trend scanner-only: ${allRows.length} stretched rows, chart confirmation required`
  : activeStrategyLabId === 'wizard'
  ? (status.marketHealth?.pass ? 'BTC regime allows long scans' : 'BTC regime cautious: prefer waitlist over new long entries')
  : `${countStage(allRows, 'STAGE_II')} Stage II and ${countStage(allRows, 'STAGE_IV')} Stage IV rows in latest lifecycle scan`;
  const marketTone = activeStrategyLabId === 'early' || activeStrategyLabId === 'radar' ? 'ok' : activeStrategyLabId === 'reversal' ? 'warn' : activeStrategyLabId === 'wizard' && status.marketHealth?.pass ? 'ok' : 'warn';
 return `<section class="strategy-decision-band">
 <div class="strategy-regime ${marketTone}">
 <span>Market Regime</span>
 <strong>${labEsc(marketText)}</strong>
 </div>
 <div class="strategy-decision-lanes">
 ${lanes.map(lane => {
 const topSymbols = lane.rows.slice(0, 3).map(row => `<button type="button" data-strategy-symbol="${labEsc(row.symbol)}">${labEsc(row.symbol)}<small>${labEsc(labPriorityLabel(row))}</small></button>`).join('');
 return `<div class="strategy-decision-lane ${labEsc(lane.tone)}"${labHelpAttrs(lane.label, activeStrategyLabId, true)}>
 <span>${labEsc(lane.label)}</span>
 <strong>${lane.rows.length}</strong>
 <div>${topSymbols || '<em>No rows</em>'}</div>
 </div>`;
 }).join('')}
 </div>
 </section>`;
 }

 function labGuidanceBucket(row = {}) {
 const tone = rowTone(row);
 const strategy = labStrategyId(row);
 const eventType = String(row.eventType || row.raw?.eventType || row.raw?.earlyType || '').toLowerCase();
 if (tone === 'ignore' || row.signal === 'IGNORE' || /avoid|trap|late/.test(eventType)) return 'avoid';
 if (strategy === 'stage') {
 if (row.stage === 'STAGE_II') return 'review';
 if (row.stage === 'STAGE_I') return 'wait';
 if (row.stage === 'STAGE_III') return 'protect';
 if (row.stage === 'STAGE_IV') return 'avoid';
 }
 if (strategy === 'reversal') {
 if (eventType === 'liquidation_reversal' && Number(row.score || 0) >= 70) return 'paper';
 if (eventType === 'fade_extreme' || eventType === 'mean_reversion' || eventType === 'reclaim') return 'wait';
 }
 if (strategy === 'radar') {
 if (eventType === 'breakout' || Number(row.score || 0) >= 78) return 'review';
 if (eventType === 'pressure' || eventType === 'new_coin' || eventType === 'ema_obv') return 'wait';
 }
 if (strategy === 'early') {
 if (Number(row.raw?.sourceCount || 0) > 1 || Number(row.score || 0) >= 76) return 'review';
 return 'wait';
 }
 if (row.signal === 'BUY' || Number(row.score || 0) >= 78) return 'review';
 if (row.signal === 'SELL') return 'protect';
 return 'wait';
 }

 function labGuidedAction(row = {}) {
 const bucket = labGuidanceBucket(row);
 if (bucket === 'review') return 'Review chart now';
 if (bucket === 'paper') return 'Paper test first';
 if (bucket === 'protect') return 'Protect or reduce risk';
 if (bucket === 'avoid') return 'Avoid this setup';
 return 'Wait for trigger';
 }

 function labNextTrigger(row = {}) {
 const raw = row.raw || {};
 const pack = labDecisionPack(row);
 if (Array.isArray(raw.confirmations) && raw.confirmations.length) return raw.confirmations[0];
 if (row.stage === 'STAGE_I') return `Break and hold above ${labPrice(row.triggerPrice || raw.stageMetrics?.rangeHigh)}`;
 if (row.stage === 'STAGE_II') return `Hold above stop ${labPrice(row.stop || row.protectLevel)}`;
 if (row.stage === 'STAGE_III') return `Weakness below ${labPrice(row.exitPrice || row.protectLevel)}`;
 if (row.stage === 'STAGE_IV') return 'Wait for a base before any long review';
 if (raw.resistance || row.targets?.resistance) return `Break above ${labPrice(raw.resistance || row.targets?.resistance)}`;
 if (raw.vwap || row.targets?.vwap) return `Hold or reject VWAP ${labPrice(raw.vwap || row.targets?.vwap)}`;
 if (row.triggerPrice || row.entry) return `Price near ${labPrice(row.triggerPrice || row.entry)}`;
 return pack.nextAction || 'Open chart and confirm price behavior';
 }

 function buildGuidedBestRead(rows = [], status = {}) {
 if (!isScannerOnly()) return '';
 const allRows = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId);
 const queueRows = rows.length ? rows : allRows;
 const best = queueRows.find(row => labGuidanceBucket(row) === 'review') || queueRows.find(row => labGuidanceBucket(row) === 'paper') || queueRows[0] || null;
 const counts = {
 review: allRows.filter(row => labGuidanceBucket(row) === 'review').length,
 wait: allRows.filter(row => labGuidanceBucket(row) === 'wait').length,
 paper: allRows.filter(row => labGuidanceBucket(row) === 'paper').length,
 avoid: allRows.filter(row => labGuidanceBucket(row) === 'avoid').length,
 };
 const title = best ? `${best.symbol} - ${labGuidedAction(best)}` : 'Run scan to build guidance';
 const why = best ? labPlainWhy(best) : 'This panel will show the one row worth checking first after the scan completes.';
 const trigger = best ? labNextTrigger(best) : 'No trigger yet';
 const selectedAttr = best ? ` data-strategy-symbol="${labEsc(best.symbol)}"` : '';
 return `<section class="strategy-guided-read ${best ? rowTone(best) : 'empty'}">
 <button type="button" class="strategy-guided-best"${selectedAttr}>
 <span>Best current read</span>
 <strong>${labEsc(title)}</strong>
 <small>${labEsc(why)}</small>
 </button>
 <div class="strategy-guided-next">
 <span>Next condition</span>
 <strong>${labEsc(trigger)}</strong>
 <small>${labEsc(status.status || `Last scan ${labAge(status.lastScanTs || status.ts)}`)}</small>
 </div>
 <div class="strategy-guided-counts">
 <div class="review"><span>Review</span><strong>${counts.review}</strong></div>
 <div class="wait"><span>Wait</span><strong>${counts.wait}</strong></div>
 <div class="paper"><span>Paper first</span><strong>${counts.paper}</strong></div>
 <div class="avoid"><span>Avoid</span><strong>${counts.avoid}</strong></div>
 </div>
 </section>`;
 }

 function buildGuidedQueue(rows = []) {
 if (!isScannerOnly()) return buildStrategyTable(rows);
 if (!rows.length) return buildStrategyTable(rows);
 const ordered = rows
 .slice()
 .sort((a, b) => {
 const weight = { review: 0, paper: 1, wait: 2, protect: 3, avoid: 4 };
 return (weight[labGuidanceBucket(a)] ?? 5) - (weight[labGuidanceBucket(b)] ?? 5) || Number(b.score || 0) - Number(a.score || 0);
 });
 return `<section class="strategy-guided-queue">
 <div class="strategy-guided-queue-head">
 <div>
 <span>Research queue</span>
 <strong>Simple action list</strong>
 </div>
 ${buildViewModePills()}
 </div>
 <div class="strategy-guided-rows">
 ${ordered.map((row, index) => {
 const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
 const tone = rowTone(row);
 const bucket = labGuidanceBucket(row);
 const action = labGuidedAction(row);
 const why = labPlainWhy(row);
 const trigger = labNextTrigger(row);
 return `<button type="button" class="strategy-guided-row ${tone} ${bucket} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
 <span class="strategy-guided-rank">${index + 1}</span>
 <span class="strategy-guided-symbol"><strong>${labEsc(row.symbol)}</strong><small>${labEsc(rowSignalLabel(row))}</small></span>
 <span class="strategy-guided-action">${labEsc(action)}<small>${labEsc(labPriorityLabel(row))}</small></span>
 <span class="strategy-guided-why">${labEsc(why || row.setupLabel || 'Scanner found this row for review.')}</span>
 <span class="strategy-guided-trigger">${labEsc(trigger)}<small>Score ${labFmt(row.score || row.confidence, 0)}</small></span>
 </button>`;
 }).join('')}
 </div>
 </section>`;
 }

 function buildAdvancedStrategyDetails(rows = [], status = {}) {
 if (!isScannerOnly()) return '';
 return `<details class="strategy-advanced-details">
 <summary><span>Advanced details</span><strong>Open full scanner data, alerts, scorecards, and raw table</strong></summary>
 <div class="strategy-advanced-body">
 ${buildStrategyResearchDashboard(rows, status)}
 ${buildStrategyScorecard(rows, status)}
 ${buildStrategyQualityBar()}
 ${buildDecisionDashboard(rows, status)}
 ${buildRadarAlertCenter(rows)}
 ${buildAlertSummary(rows)}
 ${buildStrategyComparePanel(rows[0] || null)}
 ${buildStrategyWatchlistPanel()}
 ${buildStrategyTable(rows)}
 </div>
 </details>`;
 }

 function buildAlertSummary(rows = []) {
 if (!isScannerOnly()) return '';
 const activeRows = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId);
 const relevant = strategyLabAlerts
 .filter(alert => alert.strategyId === activeStrategyLabId && alert.active !== false)
 .slice(-8);
 if (!relevant.length) {
 return `<section class="strategy-alert-strip"><strong>Scanner Alerts</strong><span>No scanner-only alerts saved yet.</span></section>`;
 }
 return `<section class="strategy-alert-strip"><strong>Scanner Alerts</strong><div>${relevant.map(alert => {
 const state = labEvaluateAlert(alert, activeRows);
 const tone = state.state === 'Triggered' ? 'buy' : 'watch';
 return `<button type="button" class="${tone}" data-strategy-symbol="${labEsc(alert.symbol)}">${labEsc(alert.symbol)} ${labEsc(labAlertLabel(alert.type))}<small>${labEsc(state.state)} | ${labEsc(state.detail)}</small></button>`;
 }).join('')}</div></section>`;
 }

 function buildRadarAlertCenter(rows = []) {
  if (activeStrategyLabId !== 'radar') return '';
  const queue = (Array.isArray(rows) ? rows : [])
  .filter(row => ['breakout', 'pressure', 'new_coin', 'ema_obv', 'avoid_trap'].includes(String(row.eventType || row.raw?.eventType || '')))
  .slice(0, 8);
  if (!queue.length) {
   return `<section class="strategy-radar-queue"><strong>Radar Queue</strong><span>No active radar events in this view.</span></section>`;
  }
  return `<section class="strategy-radar-queue"><strong>Radar Queue</strong><div>${queue.map(row => {
   const tone = rowTone(row);
   const label = row.raw?.eventLabel || row.setupLabel || row.eventType || 'Radar';
   return `<button type="button" class="${tone}" data-strategy-symbol="${labEsc(row.symbol)}">${labEsc(row.symbol)} ${labEsc(label)}<small>${labEsc(row.actionLabel || labPriorityLabel(row))} | ${labFmt(row.score, 0)}/100</small></button>`;
  }).join('')}</div></section>`;
 }

 function buildStrategyLabTop(rows = [], status = {}) {
 const strategy = getStrategyMeta();
 const allRows = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId);
 const buy = allRows.filter(row => row.signal === 'BUY').length;
 const watch = allRows.filter(row => row.signal === 'WATCHLIST' || String(row.signal || '').includes('WATCH')).length;
 const sell = allRows.filter(row => row.signal === 'SELL').length;
 const ignore = allRows.filter(row => row.signal === 'IGNORE').length;
 const developing = allRows.filter(row => row.signal === 'IGNORE' && Number(row.score || 0) >= 45).length;
  const best = allRows[0] || rows[0];
 const mode = 'Research only';
  const marketLabel = activeStrategyLabId === 'stage'
  ? `${countStage(allRows, 'STAGE_II')} Stage II | ${countStage(allRows, 'STAGE_III')} Stage III`
  : activeStrategyLabId === 'radar'
  ? 'Live opportunity radar'
  : activeStrategyLabId === 'wizard'
  ? (status.marketHealth?.pass ? 'Market healthy' : 'Market cautious')
  : 'Current scanner';
  const radarCounts = status.eventCounts || {};
  const reversalCounts = status.eventCounts || {};
  const replaySummary = status.replaySummary || {};
  const metricRows = activeStrategyLabId === 'early'
 ? [
 buildMetric('Active Strategy', 'Early Opportunity', 'info'),
 buildMetric('Mode', 'Research only', 'warn'),
 buildMetric('Fresh', String(allRows.filter(row => row.raw?.earlyType === 'fresh').length), allRows.some(row => row.raw?.earlyType === 'fresh') ? 'ok' : 'info'),
 buildMetric('Near Breakout', String(allRows.filter(row => row.raw?.earlyType === 'breakout_near' || row.checks?.breakoutNear).length), 'info'),
 buildMetric('Base', String(allRows.filter(row => row.raw?.earlyType === 'base' || row.checks?.baseForming).length), 'warn'),
 buildMetric('Reclaim', String(allRows.filter(row => row.raw?.earlyType === 'reclaim' || row.checks?.reclaim || row.checks?.vwapReclaim).length), 'warn'),
 buildMetric('Cross Lab', String(allRows.filter(row => Number(row.raw?.sourceCount || 0) > 1).length), allRows.some(row => Number(row.raw?.sourceCount || 0) > 1) ? 'ok' : 'info'),
 buildMetric('Best Early', best ? `${best.symbol} ${best.score}/100` : 'Waiting', best?.score >= 72 ? 'ok' : 'warn'),
 ].join('')
 : activeStrategyLabId === 'stage'
  ? [
 buildMetric('Active Strategy', strategy.displayName || 'Stage Scanner', 'info'),
 buildMetric('Mode', mode, 'warn'),
 buildMetric('Stage II', String(countStage(allRows, 'STAGE_II')), countStage(allRows, 'STAGE_II') ? 'ok' : 'info'),
 buildMetric('Stage I', String(countStage(allRows, 'STAGE_I')), countStage(allRows, 'STAGE_I') ? 'warn' : 'info'),
 buildMetric('Protect', String(countStage(allRows, 'STAGE_III')), countStage(allRows, 'STAGE_III') ? 'warn' : 'info'),
 buildMetric('Avoid', String(countStage(allRows, 'STAGE_IV')), countStage(allRows, 'STAGE_IV') ? 'info' : 'ok'),
 buildMetric('Review', String(countStage(allRows, 'REVIEW')), countStage(allRows, 'REVIEW') ? 'warn' : 'info'),
 buildMetric('Last Scan', labAge(status.lastScanTs || status.ts), 'info'),
 ].join('')
 : activeStrategyLabId === 'radar'
 ? [
 buildMetric('Active Strategy', strategy.displayName || 'Live Radar', 'info'),
 buildMetric('Mode', 'Advisory only', 'warn'),
 buildMetric('Breakouts', String(radarCounts.breakout || 0), radarCounts.breakout ? 'ok' : 'info'),
 buildMetric('EMA + OBV', String(radarCounts.ema_obv || 0), radarCounts.ema_obv ? 'ok' : 'info'),
 buildMetric('Pressure', String(radarCounts.pressure || 0), radarCounts.pressure ? 'warn' : 'info'),
 buildMetric('New Coins', String(radarCounts.new_coin || 0), radarCounts.new_coin ? 'warn' : 'info'),
 buildMetric('Best Setup', best ? `${best.symbol} ${best.score}/100` : 'Waiting', best?.score >= 75 ? 'ok' : 'warn'),
 buildMetric('Replay Win', replaySummary.completed ? `${labPct(replaySummary.winRate, 1)} / ${replaySummary.completed}` : 'Collecting', replaySummary.winRate >= 50 ? 'ok' : 'info'),
 buildMetric('Last Scan', labAge(status.lastScanTs || status.ts), 'info'),
 ].join('')
 : activeStrategyLabId === 'reversal'
 ? [
 buildMetric('Active Strategy', strategy.displayName || 'Reversal Lab', 'info'),
 buildMetric('Mode', 'Scanner only', 'warn'),
 buildMetric('Liq Reversal', String(reversalCounts.liquidation_reversal || 0), reversalCounts.liquidation_reversal ? 'ok' : 'info'),
 buildMetric('Fade Extreme', String(reversalCounts.fade_extreme || 0), reversalCounts.fade_extreme ? 'warn' : 'info'),
 buildMetric('Mean Revert', String(reversalCounts.mean_reversion || 0), reversalCounts.mean_reversion ? 'warn' : 'info'),
 buildMetric('Reclaim', String(reversalCounts.reclaim || 0), reversalCounts.reclaim ? 'ok' : 'info'),
 buildMetric('Avoid Chase', String(reversalCounts.avoid_chase || 0), reversalCounts.avoid_chase ? 'warn' : 'info'),
 buildMetric('Best Setup', best ? `${best.symbol} ${best.score}/100` : 'Waiting', best?.score >= 75 ? 'ok' : 'warn'),
 buildMetric('Last Scan', labAge(status.lastScanTs || status.ts), 'info'),
 ].join('')
 : [
 buildMetric('Active Strategy', strategy.displayName || strategy.id || 'Current Strategy', 'info'),
 buildMetric('Mode', mode, isScannerOnly() ? 'warn' : 'ok'),
 buildMetric('Market', marketLabel, status.marketHealth?.pass ? 'ok' : 'warn'),
 buildMetric('Best Setup', best ? `${best.symbol} ${best.score}/100` : 'Waiting', best?.score >= 75 ? 'ok' : 'warn'),
 buildMetric('Buy / Watch', `${buy} / ${watch}`, buy ? 'ok' : 'info'),
 buildMetric('Sell / Ignore', `${sell} / ${ignore}`, sell ? 'warn' : 'info'),
 buildMetric('Developing', `${developing}`, developing ? 'warn' : 'info'),
 buildMetric('Last Scan', labAge(status.lastScanTs || status.ts), 'info'),
 ].join('');
 const summaryRows = [
 { label: 'Review now', value: String(allRows.filter(row => labGuidanceBucket(row) === 'review').length), tone: 'ok' },
 { label: 'Wait for trigger', value: String(allRows.filter(row => labGuidanceBucket(row) === 'wait').length), tone: 'warn' },
 { label: 'Avoid', value: String(allRows.filter(row => labGuidanceBucket(row) === 'avoid').length), tone: 'info' },
 { label: 'Last scan', value: labAge(status.lastScanTs || status.ts), tone: 'info' },
 ];
 return `<div class="strategy-lab-top strategy-lab-top-guided">
 <div class="strategy-lab-title-block">
 <div class="command-eyebrow">Guided scanner lab</div>
 <h2>${labEsc(strategy.displayName || 'Strategy Lab')}</h2>
 <p>Use this as a decision guide: review the best row first, wait for missing proof, and skip weak setups. No auto-trade and no paper-trade actions belong in this workspace.</p>
 </div>
 <div class="strategy-lab-actions">${buildActions()}</div>
 </div>
 <div class="strategy-lab-segments strategy-lab-segments-guided">${buildStrategyPills()}</div>
 <div class="strategy-lab-metrics strategy-lab-metrics-guided">${summaryRows.map(item => buildMetric(item.label, item.value, item.tone)).join('')}</div>
 <div class="strategy-lab-status">
 <span>${labEsc(status.status || 'Ready')}</span>
 <div class="strategy-lab-progress"><i style="width:${Math.max(0, Math.min(100, Number(status.progress || 0)))}%"></i></div>
 </div>
 <div class="strategy-lab-guardrail">
 <strong>Research only</strong>
 <span>Scan -> compare -> explain -> chart review -> alert. Strategy Lab does not place live orders or paper trades.</span>
 </div>
 ${buildStrategyDiagnostics(status)}`;
 }

 function rowTone(row = {}) {
  if (activeStrategyLabId === 'early' || row.strategyId === 'early') {
   if (row.raw?.earlyType === 'avoid_late' || row.signal === 'IGNORE') return 'ignore';
   if (Number(row.score || 0) >= 72) return 'buy';
   if (Number(row.raw?.sourceCount || 0) > 1) return 'good';
   if (row.raw?.earlyType === 'reclaim') return 'developing';
   return 'watch';
  }
  if (activeStrategyLabId === 'radar') {
   if (row.eventType === 'breakout' || row.signal === 'BUY') return 'buy';
   if (row.eventType === 'pressure' || row.signal === 'SELL') return 'developing';
   if (row.eventType === 'avoid_trap' || row.signal === 'IGNORE') return 'ignore';
   if (row.eventType === 'new_coin') return 'watch';
   if (Number(row.score || 0) >= 75) return 'good';
   return 'watch';
  }
  if (activeStrategyLabId === 'reversal') {
   const eventType = String(row.eventType || row.raw?.eventType || '');
   if (eventType === 'liquidation_reversal') return 'buy';
   if (eventType === 'fade_extreme' || row.signal === 'SELL') return 'developing';
   if (eventType === 'mean_reversion' || eventType === 'reclaim') return 'watch';
   if (eventType === 'avoid_chase' || row.signal === 'IGNORE') return 'ignore';
   if (Number(row.score || 0) >= 75) return 'good';
   return 'watch';
  }
  if (activeStrategyLabId === 'stage') {
 if (row.stage === 'STAGE_II') return row.signal === 'BUY' ? 'buy' : 'good';
 if (row.stage === 'STAGE_I') return 'watch';
 if (row.stage === 'STAGE_III') return 'developing';
 return 'ignore';
 }
 if (row.signal === 'BUY') return 'buy';
 if (row.signal === 'SELL') return 'developing';
 if (Number(row.score || 0) >= 75) return 'good';
 if (Number(row.score || 0) >= 65) return 'watch';
 if (Number(row.score || 0) >= 45) return 'developing';
 return 'ignore';
 }

function rowSignalLabel(row = {}) {
  if (activeStrategyLabId === 'early' || row.strategyId === 'early') {
   if (row.raw?.earlyType === 'fresh') return 'Fresh';
   if (row.raw?.earlyType === 'breakout_near') return 'Near breakout';
   if (row.raw?.earlyType === 'base') return 'Base forming';
   if (row.raw?.earlyType === 'reclaim') return 'Reclaim';
   if (row.raw?.earlyType === 'cross_lab') return 'Cross lab';
   if (row.raw?.earlyType === 'avoid_late') return 'Avoid late';
   return 'Early';
  }
  if (activeStrategyLabId === 'radar') return row.raw?.eventLabel || row.setupLabel || row.eventType || '--';
  if (activeStrategyLabId === 'reversal') return row.raw?.eventLabel || row.setupLabel || row.eventType || '--';
  if (activeStrategyLabId === 'stage') return row.actionLabel || row.stageLabel || row.stage || '--';
 if (row.signal !== 'IGNORE') return row.signal || '--';
 if (isScannerOnly() && Number(row.score || 0) >= 45) return 'DEVELOPING';
 return 'IGNORE';
 }

 function shortStageLabel(row = {}) {
 const raw = String(row.stage || '').replace('STAGE_', 'Stage ');
 if (raw === 'Stage I') return 'Stage I';
 if (raw === 'Stage II') return 'Stage II';
 if (raw === 'Stage III') return 'Stage III';
 if (raw === 'Stage IV') return 'Stage IV';
 return raw || '--';
 }

 function buildStageRow(row = {}) {
 const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
 const tone = rowTone(row);
 const metrics = row.raw?.stageMetrics || {};
 const range = metrics.rangeLow && metrics.rangeHigh ? `${labPrice(metrics.rangeLow)} - ${labPrice(metrics.rangeHigh)}` : '--';
 const protect = row.stage === 'STAGE_I'
 ? `Trigger ${labPrice(row.triggerPrice || metrics.rangeHigh)}`
 : row.stage === 'STAGE_II'
 ? `Stop ${labPrice(row.stop || row.protectLevel)}`
 : row.stage === 'STAGE_III'
 ? `Exit ${labPrice(row.exitPrice || row.protectLevel)}`
 : `Support ${labPrice(row.exitPrice || metrics.rangeLow)}`;
 return `<tr class="strategy-lab-row ${tone} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
 <td><strong>${labEsc(row.symbol)}</strong><small>${labEsc(row.stageLabel || '')}</small></td>
 <td><span class="strategy-signal ${tone}"${labHelpAttrs(shortStageLabel(row), 'stage', true)}>${labEsc(shortStageLabel(row))}</span></td>
 <td>${labEsc(row.actionLabel || '--')}</td>
 <td>${labEsc(labPriorityLabel(row))}</td>
 <td>${labFmt(row.confidence || row.score, 0)}%</td>
 <td>${labFmt(metrics.ma30Slope5wPct, 2)}%</td>
 <td>${labEsc(range)}</td>
 <td>${metrics.volumeRatio10w ? `${labFmt(metrics.volumeRatio10w, 2)}x` : '--'}</td>
 <td>${labEsc(protect)}</td>
 </tr>`;
 }

function buildRadarRow(row = {}) {
  const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
  const tone = rowTone(row);
  const raw = row.raw || {};
  const move = `${labPct(raw.change24h, 1)} / ${labPct(raw.move4h, 1)}`;
  const volume = raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x` : '--';
  const emaObv = [
  row.checks?.emaBull ? 'Bull EMA' : row.checks?.emaBear ? 'Bear EMA' : 'EMA mixed',
  row.checks?.obvUp ? 'OBV up' : row.checks?.obvDown ? 'OBV down' : 'OBV flat',
  ].join(' | ');
  const level = row.eventType === 'pressure'
  ? `S ${labPrice(raw.support || row.targets?.support)}`
  : row.eventType === 'vwap'
  ? `VWAP ${labPrice(raw.vwap || row.targets?.vwap)}`
  : `R ${labPrice(raw.resistance || row.targets?.resistance)}`;
  return `<tr class="strategy-lab-row radar ${tone} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
 <td><strong>${labEsc(row.symbol)}</strong><small>${labEsc(row.raw?.isFirstSeenNew || row.raw?.isShortHistory ? 'New / short history' : row.setupLabel || '')}</small></td>
 <td>${labEsc(move)}</td>
 <td><span class="strategy-signal ${tone}"${labHelpAttrs(row.eventType || row.raw?.eventType || rowSignalLabel(row), 'radar', true)}>${labEsc(rowSignalLabel(row))}</span></td>
 <td>${labEsc(volume)}<small>${labEsc(raw.latestQuoteVolume ? `$${labFmt(raw.latestQuoteVolume, 0)}` : '--')}</small></td>
 <td>${labEsc(emaObv)}</td>
 <td>${labEsc(level)}</td>
 <td>${labEsc(row.actionLabel || '--')}<small>${labEsc(labPriorityLabel(row))}</small></td>
 <td>${labFmt(row.score, 0)}</td>
 </tr>`;
}

function buildReversalRow(row = {}) {
 const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
 const tone = rowTone(row);
 const raw = row.raw || {};
 const move = `${labPct(raw.change24h, 1)} / ${labPct(raw.move4h, 1)}`;
 const stretch = [
 raw.rsi14 ? `RSI ${labFmt(raw.rsi14, 1)}` : 'RSI --',
 raw.zScore ? `Z ${labFmt(raw.zScore, 2)}` : 'Z --',
 ].join(' | ');
 const balance = raw.vwapDistancePct ? `${labPct(raw.vwapDistancePct, 2)} from VWAP` : 'VWAP --';
 const trigger = row.checks?.closeBackInsideHigh || row.checks?.closeBackInsideLow
 ? 'Range reclaim'
 : row.checks?.volumeClimax
 ? 'Climax'
 : row.checks?.fundingCrowdedLong || row.checks?.fundingCrowdedShort
 ? 'Funding crowd'
 : 'Wait';
 return `<tr class="strategy-lab-row reversal ${tone} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
<td><strong>${labEsc(row.symbol)}</strong><small>${labEsc(row.setupLabel || '')}</small></td>
<td>${labEsc(move)}</td>
<td><span class="strategy-signal ${tone}"${labHelpAttrs(row.eventType || row.raw?.eventType || rowSignalLabel(row), 'reversal', true)}>${labEsc(rowSignalLabel(row))}</span></td>
<td>${labEsc(stretch)}</td>
<td>${labEsc(balance)}</td>
<td>${labEsc(trigger)}<small>${labEsc(raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x volume` : 'volume --')}</small></td>
<td>${labEsc(row.actionLabel || '--')}<small>${labEsc(labPriorityLabel(row))}</small></td>
<td>${labFmt(row.score, 0)}</td>
</tr>`;
}

function buildEarlyRow(row = {}) {
 const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
 const tone = rowTone(row);
 const raw = row.raw || {};
 const levels = raw.chartLevels || {};
 const sourceText = Array.isArray(raw.sources) ? raw.sources.join(' + ') : '--';
 const confirmText = Array.isArray(raw.confirmations) && raw.confirmations.length ? raw.confirmations[0] : 'Wait for confirmation';
 const rejectText = Array.isArray(raw.rejections) && raw.rejections.length ? raw.rejections[0] : 'No major rejection';
 return `<tr class="strategy-lab-row early ${tone} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
<td><strong>${labEsc(row.symbol)}</strong><small>${labEsc(sourceText)}</small></td>
<td><span class="strategy-signal ${tone}"${labHelpAttrs(raw.earlyType || 'early', 'early', true)}>${labEsc(rowSignalLabel(row))}</span></td>
<td>${labFmt(row.score, 0)}<small>${labEsc(row.priorityLabel || '')}</small></td>
<td>${labEsc(confirmText)}</td>
<td>${labEsc(rejectText)}</td>
<td>${labPrice(levels.trigger || row.triggerPrice || row.entry)}</td>
<td>${labPrice(levels.stop || row.stop)}</td>
<td><button type="button" class="strategy-row-chart-btn" data-strategy-chart-review="${labEsc(row.symbol)}">Chart</button></td>
</tr>`;
}

function buildStrategyRow(row = {}) {
  if (activeStrategyLabId === 'early') return buildEarlyRow(row);
  if (activeStrategyLabId === 'stage') return buildStageRow(row);
  if (activeStrategyLabId === 'radar') return buildRadarRow(row);
  if (activeStrategyLabId === 'reversal') return buildReversalRow(row);
  const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
 const tone = rowTone(row);
 const rs = row.raw?.rsScore ?? row.rsScore ?? '--';
 const pivot = row.raw?.pivotPrice ? labFmt(row.raw.pivotPrice, 4) : '--';
 const risk = row.riskPercent ? `${labFmt(row.riskPercent, 2)}%` : '--';
 const action = row.actionLabel || (row.signal === 'BUY' ? 'Buy now' : row.signal === 'WATCHLIST' ? 'Wait' : row.signal === 'SELL' ? 'Short watch' : 'Ignore');
 return `<tr class="strategy-lab-row ${tone} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
 <td><strong>${labEsc(row.symbol)}</strong><small>${labEsc(row.setupLabel || '')}</small></td>
 <td><span class="strategy-signal ${tone}"${labHelpAttrs(rowSignalLabel(row), activeStrategyLabId, isScannerOnly())}>${labEsc(rowSignalLabel(row))}</span></td>
 <td>${labEsc(action)}</td>
 <td>${labEsc(labPriorityLabel(row))}</td>
 <td>${labFmt(row.score, 0)}</td>
 <td>${labEsc(rs)}</td>
 <td>${pivot}</td>
 <td>${row.entry ? labFmt(row.entry, 4) : '--'}</td>
 <td>${row.stop ? labFmt(row.stop, 4) : '--'}</td>
 <td>${risk}</td>
 </tr>`;
 }

 function buildStrategyTable(rows = []) {
 if (!rows.length) {
 const strategy = getStrategyMeta();
 const skipped = labStatusForActive(strategyLabSnapshot)?.skipped || {};
 const diagnostics = labStatusForActive(strategyLabSnapshot)?.diagnostics || {};
 const radarEmptyNote = activeStrategyLabId === 'radar' && (skipped.insufficientIntraday || skipped.fetchErrors || skipped.reviewOnly)
 ? `No rows in this view. Diagnostics: ${[
 skipped.insufficientIntraday ? `${skipped.insufficientIntraday} short 15m history` : '',
 skipped.reviewOnly ? `${skipped.reviewOnly} review-only rows` : '',
 skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
 ].filter(Boolean).join(', ')}.`
 : '';
const stageEmptyNote = activeStrategyLabId === 'stage' && (diagnostics.lowLatestLiquidity || skipped.insufficientHistory || skipped.review || skipped.fetchErrors)
? `No rows in this view. Diagnostics: ${[
diagnostics.lowLatestLiquidity ? `${diagnostics.lowLatestLiquidity} low latest liquidity` : '',
skipped.insufficientHistory ? `${skipped.insufficientHistory} short history` : '',
skipped.review ? `${skipped.review} review` : '',
skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
].filter(Boolean).join(', ')}.`
: '';
const reversalEmptyNote = activeStrategyLabId === 'reversal' && (skipped.insufficientHistory || skipped.fetchErrors || skipped.reviewOnly)
? `No rows in this view. Diagnostics: ${[
skipped.insufficientHistory ? `${skipped.insufficientHistory} short 15m history` : '',
skipped.reviewOnly ? `${skipped.reviewOnly} review-only rows` : '',
skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
].filter(Boolean).join(', ')}.`
: '';
const copy = radarEmptyNote || stageEmptyNote || reversalEmptyNote || (activeStrategyLabId === 'current'
? 'Run the current scanner to populate this strategy view.'
: `Run ${strategy.shortName || strategy.displayName || 'Strategy'} Scan to build scanner-only results.`);
 return `<div class="empty strategy-lab-empty"><div class="ei">--</div><div class="eh">No strategy results yet</div><div class="es">${labEsc(copy)}</div></div>`;
 }
 const allCount = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId).length;
 const scopeNote = isScannerOnly() && activeStrategyLabId !== 'stage' && strategyLabViewMode === 'focus' && allCount > rows.length
 ? `<div class="strategy-lab-scope-note">Showing best candidates from ${allCount} qualified coins. Use All Results to inspect every rejected setup.</div>`
 : '';
const heading = activeStrategyLabId === 'radar'
? '<thead><tr><th>Coin</th><th>Move</th><th>Event</th><th>Volume</th><th>EMA/OBV</th><th>Level</th><th>Action</th><th>Score</th></tr></thead>'
 : activeStrategyLabId === 'early'
 ? '<thead><tr><th>Coin</th><th>Early Type</th><th>Score</th><th>Confirms When</th><th>Rejects If</th><th>Trigger</th><th>Invalid</th><th>Chart</th></tr></thead>'
 : activeStrategyLabId === 'reversal'
 ? '<thead><tr><th>Coin</th><th>Move</th><th>Event</th><th>Stretch</th><th>Balance</th><th>Trigger</th><th>Action</th><th>Score</th></tr></thead>'
 : activeStrategyLabId === 'stage'
 ? '<thead><tr><th>Symbol</th><th>Stage</th><th>Action</th><th>Priority</th><th>Confidence</th><th>30W Slope</th><th>Range</th><th>Volume</th><th>Protect/Trigger</th></tr></thead>'
 : '<thead><tr><th>Symbol</th><th>Signal</th><th>Action</th><th>Priority</th><th>Score</th><th>RS</th><th>Pivot</th><th>Entry</th><th>Stop</th><th>Risk</th></tr></thead>';
 return `<div class="strategy-lab-table-wrap">
 <table class="strategy-lab-table">
 ${heading}
 <tbody>${rows.map(buildStrategyRow).join('')}</tbody>
 </table>
 </div>${scopeNote}`;
 }

 function buildCheck(label, pass, passLabel = 'PASS', failLabel = 'WAIT') {
 return `<div class="strategy-check ${pass ? 'pass' : 'fail'}"><span>${pass ? passLabel : failLabel}</span>${labEsc(label)}</div>`;
 }

 function buildDecisionNotes(row = {}) {
 const pack = labDecisionPack(row);
 const selected = pack.whySelected.slice(0, 3).map(item => `<li>${labEsc(item)}</li>`).join('');
 const wait = pack.whyNotNow.slice(0, 3).map(item => `<li>${labEsc(item)}</li>`).join('');
 return `<div class="strategy-report-block">
 <div class="strategy-report-title">Decision Report</div>
 <div class="strategy-report-columns">
 <div><span>Why selected</span><ul>${selected || '<li>No positive driver recorded.</li>'}</ul></div>
 <div><span>Why not now</span><ul>${wait || '<li>No blocker recorded.</li>'}</ul></div>
 </div>
 <p>${labEsc(pack.nextAction)}</p>
 </div>`;
 }

 function buildRuleBacktest(row = {}) {
 const test = row.raw?.ruleBacktest || {};
 return `<div class="strategy-report-block">
 <div class="strategy-report-title">Rule Backtest</div>
 <div class="strategy-mini-grid">
 <div><span>Sample</span><strong>${labEsc(test.label || 'No sample')}</strong></div>
 <div><span>Trades</span><strong>${labEsc(test.samples ?? 0)}</strong></div>
 <div><span>Win rate</span><strong>${labPct(test.winRate, 1)}</strong></div>
 <div><span>${activeStrategyLabId === 'stage' ? 'Avg 8W' : 'Avg 20D'}</span><strong>${labPct(activeStrategyLabId === 'stage' ? test.avg8wReturn : test.avg20dReturn, 2)}</strong></div>
 </div>
 </div>`;
 }

 function buildAgingAndTransition(row = {}) {
 const aging = row.raw?.watchAging || {};
 const transition = row.raw?.stageTransition || null;
 const agingCopy = aging.firstSeen ? `${Number(aging.scans || 0)} scans, ${labAge(aging.firstSeen)} first seen, ${labEsc(aging.scoreTrend || 'steady')}` : 'Not tracked yet';
 const transitionCopy = transition ? `${transition.fromStage || '--'} to ${transition.toStage || '--'} on latest scan` : 'No stage change on latest scan';
 return `<div class="strategy-report-block">
 <div class="strategy-report-title">Lifecycle</div>
 <div class="strategy-mini-grid">
 <div><span>Watch aging</span><strong>${agingCopy}</strong></div>
 <div><span>Stage transition</span><strong>${labEsc(activeStrategyLabId === 'stage' ? transitionCopy : 'Wizard scanner uses signal aging')}</strong></div>
 </div>
 </div>`;
 }

 function buildAlertControls(row = {}) {
 if (!row?.symbol || !isScannerOnly()) return '';
 const types = labAlertTypesForRow(row);
 return `<div class="strategy-report-block">
 <div class="strategy-report-title">Scanner Alerts</div>
 <div class="strategy-alert-actions">
 ${types.map(type => {
 const active = labIsAlertActive(row, type);
 const target = labAlertTarget(row, type);
 return `<button type="button" class="${active ? 'active' : ''}" data-strategy-alert="${labEsc(type)}" data-strategy-symbol="${labEsc(row.symbol)}">${active ? 'Alert saved' : `Alert ${labAlertLabel(type)}`}<small>${type === 'volume' || type === 'climax' ? `${labFmt(target, 2)}x` : labPrice(target)}</small></button>`;
 }).join('')}
 </div>
 ${strategyLabAlertMessage ? `<p class="strategy-alert-message">${labEsc(strategyLabAlertMessage)}</p>` : ''}
 </div>`;
 }

 function buildStageDetail(row = null) {
 if (!row) {
 return '<aside class="strategy-lab-detail"><div class="strategy-detail-empty">Select a symbol to inspect 30WMA, range, volume, volatility, and stage action.</div></aside>';
 }
 const metrics = row.raw?.stageMetrics || {};
 const checks = row.checks || {};
 const scores = row.raw?.scores || {};
 const reasons = (row.reasons || []).slice(0, 9).map(reason => `<li>${labEsc(reason)}</li>`).join('');
 const trendText = checks.maRising ? '30WMA turning up' : checks.maDeclining ? '30WMA declining' : checks.maFlat ? '30WMA flat' : '30WMA mixed';
 const priceText = checks.priceAboveMa ? 'Price above 30WMA' : checks.priceBelowMa ? 'Price below 30WMA' : 'Price near 30WMA';
 return `<aside class="strategy-lab-detail">
 <div class="strategy-detail-head">
 <div><span>Stage Scanner</span><strong>${labEsc(row.symbol)}</strong></div>
 <em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
 </div>
 <div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Review chart</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
 ${buildPlainHelpPanel(row)}
 <div class="strategy-detail-grid">
 <div><span>${row.stage === 'STAGE_I' ? 'Trigger' : row.stage === 'STAGE_III' || row.stage === 'STAGE_IV' ? 'Exit' : 'Entry'}</span><strong>${labPrice(row.entry || row.exitPrice || row.triggerPrice)}</strong></div>
 <div><span>Protect</span><strong>${labPrice(row.protectLevel || row.stop || metrics.rangeLow)}</strong></div>
 <div><span>30W MA</span><strong>${labPrice(metrics.ma30)}</strong></div>
 <div><span>Range</span><strong>${labPrice(metrics.rangeLow)} - ${labPrice(metrics.rangeHigh)}</strong></div>
 </div>
 <div class="strategy-checks">
 ${buildCheck(`30WMA state: ${trendText}`, checks.maRising || checks.maDeclining || checks.maFlat)}
 ${buildCheck(`Price state: ${priceText}`, checks.priceAboveMa || checks.priceBelowMa)}
 ${buildCheck(`Support/resistance range: ${metrics.supportTouches || 0} support / ${metrics.resistanceTouches || 0} resistance touches`, checks.sideways || checks.rangeTouched)}
 ${buildCheck(`Volume behavior: ${metrics.volumeRatio10w ? `${labFmt(metrics.volumeRatio10w, 2)}x latest week` : 'neutral'}`, checks.highVolume || checks.volumeDrying)}
 ${buildCheck(`Volatility/chop: ${metrics.atrRatio ? `${labFmt(metrics.atrRatio, 2)}% ATR` : 'unknown'}`, checks.choppy || metrics.atrRatio > 0)}
 ${buildCheck(`Prior trend: ${labFmt(metrics.priorTrendPct, 2)}%`, checks.priorUptrend)}
 ${buildCheck(`Final action: ${row.actionLabel || '--'}`, row.stage !== 'REVIEW')}
 </div>
 <div class="strategy-detail-notes">
 <div class="strategy-detail-label">Stage Checklist</div>
 <ul>${reasons || '<li>No notes available yet.</li>'}</ul>
 </div>
 <details class="strategy-formula-detail">
 <summary>Stage score data</summary>
 <div class="strategy-detail-grid">
 <div><span>Stage I</span><strong>${labFmt(scores.STAGE_I, 0)}</strong></div>
 <div><span>Stage II</span><strong>${labFmt(scores.STAGE_II, 0)}</strong></div>
 <div><span>Stage III</span><strong>${labFmt(scores.STAGE_III, 0)}</strong></div>
 <div><span>Stage IV</span><strong>${labFmt(scores.STAGE_IV, 0)}</strong></div>
 </div>
 </details>
 ${buildDecisionNotes(row)}
 ${buildRuleBacktest(row)}
 ${buildAgingAndTransition(row)}
 ${buildAlertControls(row)}
 </aside>`;
 }

 function buildGenericDetail(row = null) {
 if (!row) {
 return '<aside class="strategy-lab-detail"><div class="strategy-detail-empty">Select a setup to inspect trend, RS, VCP, breakout, and risk.</div></aside>';
 }
 const raw = row.raw || {};
 const checks = row.checks || {};
 const reasons = (row.reasons || []).slice(0, 8).map(reason => `<li>${labEsc(reason)}</li>`).join('');
 const contractions = Array.isArray(raw.contractions) && raw.contractions.length ? raw.contractions.map(v => `${labFmt(v, 1)}%`).join(' / ') : '--';
 return `<aside class="strategy-lab-detail">
 <div class="strategy-detail-head">
 <div><span>${labEsc(getStrategyMeta(row.strategyId || activeStrategyLabId)?.displayName || 'Current Strategy')}</span><strong>${labEsc(row.symbol)}</strong></div>
 <em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
 </div>
 <div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Review chart</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
 ${buildPlainHelpPanel(row)}
 <div class="strategy-detail-grid">
 <div><span>Entry</span><strong>${row.entry ? labFmt(row.entry, 4) : '--'}</strong></div>
 <div><span>Stop</span><strong>${row.stop ? labFmt(row.stop, 4) : '--'}</strong></div>
 <div><span>2R</span><strong>${row.targets?.target2R ? labFmt(row.targets.target2R, 4) : '--'}</strong></div>
 <div><span>3R</span><strong>${row.targets?.target3R ? labFmt(row.targets.target3R, 4) : '--'}</strong></div>
 </div>
 <div class="strategy-checks">
 ${buildCheck('Market Health', checks.marketHealth ?? checks.currentScanner)}
 ${buildCheck('Trend Passed', checks.trendPassed ?? checks.mtfConfirmed)}
 ${buildCheck('RS Strong', checks.rsStrong ?? Number(checks.tradeQuality || 0) >= 75)}
 ${buildCheck('VCP Forming', checks.vcpDetected ?? true)}
 ${buildCheck('Breakout Ready', checks.breakoutReady ?? String(row.signal || '').includes('LONG'))}
 ${buildCheck('Risk Accepted', checks.riskAccepted ?? true)}
 </div>
 <div class="strategy-detail-notes">
 <div class="strategy-detail-label">Setup Notes</div>
 <ul>${reasons || '<li>No notes available yet.</li>'}</ul>
 </div>
 <details class="strategy-formula-detail">
 <summary>More data</summary>
 <div class="strategy-detail-grid">
 <div><span>RS</span><strong>${labEsc(raw.rsScore ?? '--')}</strong></div>
 <div><span>VCP</span><strong>${labEsc(contractions)}</strong></div>
 <div><span>Volume</span><strong>${labEsc(raw.breakoutVolumeRatio ? `${labFmt(raw.breakoutVolumeRatio, 2)}x` : '--')}</strong></div>
 <div><span>ATR14</span><strong>${raw.atr14 ? labFmt(raw.atr14, 4) : '--'}</strong></div>
 </div>
 </details>
 ${buildDecisionNotes(row)}
 ${buildRuleBacktest(row)}
 ${buildAgingAndTransition(row)}
 ${buildAlertControls(row)}
 </aside>`;
 }

function buildRadarDetail(row = null) {
  if (!row) {
   return '<aside class="strategy-lab-detail"><div class="strategy-detail-empty">Select a radar row to inspect live pressure, EMA/OBV, volume, VWAP, levels, and advisory action.</div></aside>';
  }
  const raw = row.raw || {};
  const checks = row.checks || {};
  const riskFlags = Array.isArray(row.riskFlags) && row.riskFlags.length ? row.riskFlags : Array.isArray(raw.riskFlags) ? raw.riskFlags : [];
  const reasons = (row.reasons || []).slice(0, 9).map(reason => `<li>${labEsc(reason)}</li>`).join('');
  const scoreParts = raw.scoreParts || {};
  const scoreRows = Array.isArray(scoreParts.rows) ? scoreParts.rows : [];
  const timeline = raw.newCoinTimeline || null;
  const avoidTrap = raw.avoidTrap || {};
  const replay = raw.replay || null;
  const replayRows = Array.isArray(replay?.horizons) ? replay.horizons : [];
  return `<aside class="strategy-lab-detail radar-detail">
 <div class="strategy-detail-head">
 <div><span>Live Radar</span><strong>${labEsc(row.symbol)}</strong></div>
 <em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
 </div>
 <div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Review chart</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
 ${buildPlainHelpPanel(row)}
 <div class="strategy-detail-grid">
 <div><span>Entry</span><strong>${labPrice(row.entry || raw.latestPrice)}</strong></div>
 <div><span>Stop</span><strong>${labPrice(row.stop)}</strong></div>
 <div><span>Target 1</span><strong>${labPrice(row.targets?.target2R || row.targets?.target1)}</strong></div>
 <div><span>Target 2</span><strong>${labPrice(row.targets?.target3R)}</strong></div>
 <div><span>24H / 4H</span><strong>${labPct(raw.change24h, 1)} / ${labPct(raw.move4h, 1)}</strong></div>
 <div><span>Volume</span><strong>${raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x` : '--'}</strong></div>
 <div><span>VWAP</span><strong>${labPrice(raw.vwap)}</strong></div>
 <div><span>Funding</span><strong>${labPct(raw.fundingRate, 4)}</strong></div>
 </div>
 <div class="strategy-checks">
 ${buildCheck('Resistance break', checks.breakout)}
 ${buildCheck('Support break / pressure', checks.breakdown || checks.pressureDown)}
 ${buildCheck('EMA 9/30/100 bull alignment', checks.emaBull)}
 ${buildCheck('EMA 9/30/100 bear alignment', checks.emaBear)}
 ${buildCheck('OBV confirms direction', checks.obvUp || checks.obvDown)}
 ${buildCheck('Volume expansion', checks.volumeExpansion)}
 ${buildCheck('VWAP decision active', checks.vwapReclaim || checks.vwapLoss)}
 ${buildCheck('New coin condition', checks.isNewCoin)}
 </div>
 <div class="strategy-detail-notes">
 <div class="strategy-detail-label">Radar Notes</div>
 <ul>${reasons || '<li>No notes available yet.</li>'}</ul>
 </div>
 <div class="strategy-report-block">
 <div class="strategy-report-title">Score Explanation</div>
 <div class="strategy-score-stack">
 ${scoreRows.length ? scoreRows.map(item => `<div><span>${labEsc(item.label)}</span><strong class="${Number(item.value || 0) < 0 ? 'loss' : 'good'}">${Number(item.value || 0) > 0 ? '+' : ''}${labFmt(item.value, 0)}</strong></div>`).join('') : '<p>No score breakdown available yet.</p>'}
 </div>
 </div>
 ${timeline ? `<div class="strategy-report-block">
 <div class="strategy-report-title">New Coin Timeline</div>
 <div class="strategy-mini-grid">
 <div><span>First seen</span><strong>${labEsc(labAge(timeline.firstSeenTs))}</strong></div>
 <div><span>First price</span><strong>${labPrice(timeline.firstPrice)}</strong></div>
 <div><span>Max pump</span><strong>${labPct(timeline.maxPumpPct, 2)}</strong></div>
 <div><span>Pullback</span><strong>${labPct(timeline.pullbackFromHighPct, 2)}</strong></div>
 </div>
 </div>` : ''}
 <details class="strategy-formula-detail">
 <summary>Live radar data</summary>
 <div class="strategy-detail-grid">
 <div><span>EMA 9</span><strong>${labPrice(raw.ema9)}</strong></div>
 <div><span>EMA 30</span><strong>${labPrice(raw.ema30)}</strong></div>
 <div><span>EMA 100</span><strong>${labPrice(raw.ema100)}</strong></div>
 <div><span>OBV slope</span><strong>${labFmt(raw.obvSlope, 0)}</strong></div>
 <div><span>Resistance</span><strong>${labPrice(raw.resistance)}</strong></div>
 <div><span>Support</span><strong>${labPrice(raw.support)}</strong></div>
 <div><span>15m candles</span><strong>${labEsc(raw.candleCount15m || 0)}</strong></div>
 <div><span>1D candles</span><strong>${labEsc(raw.candleCount1d || 0)}</strong></div>
 </div>
 </details>
 <div class="strategy-report-block">
 <div class="strategy-report-title">Avoid / Trap Check</div>
 <p>${labEsc(avoidTrap.active ? (avoidTrap.reasons || riskFlags).join(' | ') : 'No major trap condition recorded. Advisory only.')}</p>
 </div>
 <div class="strategy-report-block">
 <div class="strategy-report-title">Replay Tracking</div>
 ${replayRows.length ? `<div class="strategy-mini-grid">${replayRows.map(item => `<div><span>${labEsc(item.label)}</span><strong class="${item.done ? (item.hit ? 'good' : 'loss') : 'warn'}">${item.done ? labPct(item.returnPct, 2) : 'Pending'}</strong></div>`).join('')}</div>` : '<p>Replay will start after the next radar scan stores this event.</p>'}
 </div>
 ${buildDecisionNotes(row)}
 <div class="strategy-report-block">
 <div class="strategy-report-title">Chart Draft</div>
 <button type="button" class="strategy-chart-draft-btn" data-radar-chart-draft="${labEsc(row.symbol)}">Open Chart With Draft</button>
 <p>Loads entry, stop, and target as editable chart lines. It does not place an order.</p>
 </div>
 ${buildAlertControls(row)}
 </aside>`;
}

function buildReversalDetail(row = null) {
 if (!row) {
  return '<aside class="strategy-lab-detail reversal-detail"><div class="strategy-detail-empty">Select a reversal row to inspect stretch, VWAP distance, RSI, failed break, funding, and scanner-only fade action.</div></aside>';
 }
 const raw = row.raw || {};
 const checks = row.checks || {};
 const reasons = (row.reasons || []).slice(0, 9).map(reason => `<li>${labEsc(reason)}</li>`).join('');
 const riskFlags = Array.isArray(row.riskFlags) && row.riskFlags.length ? row.riskFlags : Array.isArray(raw.riskFlags) ? raw.riskFlags : [];
 const scoreParts = raw.scoreParts || {};
 const scoreRows = Array.isArray(scoreParts.rows) ? scoreParts.rows : [];
 const side = String(row.direction || '').includes('short') || row.signal === 'SELL' ? 'Short fade' : String(row.direction || '').includes('long') || row.signal === 'BUY' ? 'Long bounce' : 'Watch only';
 return `<aside class="strategy-lab-detail reversal-detail">
<div class="strategy-detail-head">
<div><span>Reversal Lab</span><strong>${labEsc(row.symbol)}</strong></div>
<em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
</div>
<div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Review chart</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
${buildPlainHelpPanel(row)}
<div class="strategy-detail-grid">
<div><span>Entry</span><strong>${labPrice(row.entry || raw.latestPrice)}</strong></div>
<div><span>Stop</span><strong>${labPrice(row.stop)}</strong></div>
<div><span>VWAP Target</span><strong>${labPrice(row.targets?.vwap || row.targets?.target1)}</strong></div>
<div><span>Range Mid</span><strong>${labPrice(row.targets?.rangeMid || raw.rangeMid)}</strong></div>
<div><span>RSI / Z</span><strong>${labFmt(raw.rsi14, 1)} / ${labFmt(raw.zScore, 2)}</strong></div>
<div><span>VWAP Gap</span><strong>${labPct(raw.vwapDistancePct, 2)}</strong></div>
<div><span>24H / 4H</span><strong>${labPct(raw.change24h, 1)} / ${labPct(raw.move4h, 1)}</strong></div>
<div><span>Funding</span><strong>${labPct(raw.fundingRate, 4)}</strong></div>
</div>
<div class="strategy-checks">
${buildCheck('Upside stretch present', checks.stretchedUp)}
${buildCheck('Downside stretch present', checks.stretchedDown)}
${buildCheck('Failed high / back inside range', checks.closeBackInsideHigh)}
${buildCheck('Failed low / reclaim inside range', checks.closeBackInsideLow)}
${buildCheck('Volume climax', checks.volumeClimax)}
${buildCheck('Funding crowding', checks.fundingCrowdedLong || checks.fundingCrowdedShort)}
${buildCheck('Liquidity acceptable', !checks.lowLiquidity)}
${buildCheck(`Setup side: ${side}`, row.signal === 'BUY' || row.signal === 'SELL' || row.signal === 'WATCHLIST')}
</div>
<div class="strategy-detail-notes">
<div class="strategy-detail-label">Reversal Notes</div>
<ul>${reasons || '<li>No reversal notes available yet.</li>'}</ul>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Score Explanation</div>
<div class="strategy-score-stack">
${scoreRows.length ? scoreRows.map(item => `<div><span>${labEsc(item.label)}</span><strong class="${Number(item.value || 0) < 0 ? 'loss' : 'good'}">${Number(item.value || 0) > 0 ? '+' : ''}${labFmt(item.value, 0)}</strong></div>`).join('') : '<p>No score breakdown available yet.</p>'}
</div>
</div>
<details class="strategy-formula-detail">
<summary>Reversal data</summary>
<div class="strategy-detail-grid">
<div><span>EMA 20</span><strong>${labPrice(raw.ema20)}</strong></div>
<div><span>EMA 50</span><strong>${labPrice(raw.ema50)}</strong></div>
<div><span>EMA 100</span><strong>${labPrice(raw.ema100)}</strong></div>
<div><span>ATR14</span><strong>${labPrice(raw.atr14)}</strong></div>
<div><span>Range High</span><strong>${labPrice(raw.rangeHigh)}</strong></div>
<div><span>Range Low</span><strong>${labPrice(raw.rangeLow)}</strong></div>
<div><span>Volume</span><strong>${raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x` : '--'}</strong></div>
<div><span>15m / 1D</span><strong>${labEsc(raw.candleCount15m || 0)} / ${labEsc(raw.candleCount1d || 0)}</strong></div>
</div>
</details>
<div class="strategy-report-block">
<div class="strategy-report-title">Risk Flags</div>
<p>${labEsc(riskFlags.length ? riskFlags.join(' | ') : 'No major risk flag recorded. Scanner-only, still confirm chart before action.')}</p>
</div>
${buildDecisionNotes(row)}
<div class="strategy-report-block">
<div class="strategy-report-title">Chart Draft</div>
<button type="button" class="strategy-chart-draft-btn" data-reversal-chart-draft="${labEsc(row.symbol)}">Open Chart With Reversal Draft</button>
<p>Loads entry, stop, VWAP target, and range midpoint as editable chart context. It does not place an order.</p>
</div>
${buildAlertControls(row)}
</aside>`;
}

function buildEarlyDetail(row = null) {
 if (!row) {
  return '<aside class="strategy-lab-detail early-detail"><div class="strategy-detail-empty">Select an early opportunity row to inspect why it is early, what confirms it, what rejects it, and which chart level matters.</div></aside>';
 }
 const raw = row.raw || {};
 const levels = raw.chartLevels || {};
 const scoreRows = Array.isArray(raw.scoreParts) ? raw.scoreParts : [];
 const confirmations = Array.isArray(raw.confirmations) ? raw.confirmations : [];
 const rejections = Array.isArray(raw.rejections) ? raw.rejections : [];
 const sources = Array.isArray(raw.sourceRows) ? raw.sourceRows : [];
 return `<aside class="strategy-lab-detail early-detail">
<div class="strategy-detail-head">
<div><span>Early Opportunity</span><strong>${labEsc(row.symbol)}</strong></div>
<em class="${rowTone(row)}">${labEsc(row.priorityLabel || labPriorityLabel(row))}</em>
</div>
<div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Review chart</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
${buildPlainHelpPanel(row)}
<div class="strategy-detail-grid">
<div><span>Early score</span><strong>${labFmt(row.score, 0)}/100</strong></div>
<div><span>Source count</span><strong>${labEsc(raw.sourceCount || sources.length || 0)}</strong></div>
<div><span>Trigger</span><strong>${labPrice(levels.trigger || row.triggerPrice || row.entry)}</strong></div>
<div><span>Invalidation</span><strong>${labPrice(levels.stop || row.stop)}</strong></div>
<div><span>VWAP</span><strong>${labPrice(levels.vwap)}</strong></div>
<div><span>Resistance</span><strong>${labPrice(levels.resistance)}</strong></div>
<div><span>Support</span><strong>${labPrice(levels.support)}</strong></div>
<div><span>Volume</span><strong>${raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x` : '--'}</strong></div>
</div>
<div class="strategy-checks">
${buildCheck('Fresh or short-history activity', row.checks?.fresh)}
${buildCheck('Volume expansion confirmed', row.checks?.volumeExpansion)}
${buildCheck('EMA/OBV improving', row.checks?.emaObv)}
${buildCheck('VWAP reclaim or decision area', row.checks?.vwapReclaim)}
${buildCheck('Near breakout level', row.checks?.breakoutNear)}
${buildCheck('Base or compression forming', row.checks?.baseForming)}
${buildCheck('Cross-lab agreement', row.checks?.crossLab)}
${buildCheck('Not extended', row.checks?.notExtended)}
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Why Early</div>
<div class="strategy-score-stack">
${scoreRows.length ? scoreRows.map(item => `<div><span>${labEsc(item.label)}</span><strong class="${Number(item.value || 0) < 0 ? 'loss' : 'good'}">${Number(item.value || 0) > 0 ? '+' : ''}${labFmt(item.value, 0)}</strong></div>`).join('') : '<p>No early score parts recorded yet.</p>'}
</div>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Confirm / Reject</div>
<div class="strategy-report-columns">
<div><span>Confirms when</span><ul>${confirmations.length ? confirmations.slice(0, 5).map(item => `<li>${labEsc(item)}</li>`).join('') : '<li>Wait for a clean chart trigger.</li>'}</ul></div>
<div><span>Rejects if</span><ul>${rejections.length ? rejections.slice(0, 5).map(item => `<li>${labEsc(item)}</li>`).join('') : '<li>No rejection condition recorded.</li>'}</ul></div>
</div>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Scanner Sources</div>
<div class="strategy-mini-grid">
${sources.length ? sources.map(item => `<div><span>${labEsc(labSourceLabel(item.strategyId))}</span><strong>${labEsc(item.eventType || item.stage || item.signal || 'Review')}</strong><small>${labFmt(item.score, 0)}/100 ${item.actionLabel ? `| ${labEsc(item.actionLabel)}` : ''}</small></div>`).join('') : '<div><span>Sources</span><strong>No source rows</strong></div>'}
</div>
</div>
${buildDecisionNotes(row)}
${buildAlertControls(row)}
</aside>`;
}

function buildDetail(row = null) {
  if (activeStrategyLabId === 'early') return buildEarlyDetail(row);
  if (activeStrategyLabId === 'radar') return buildRadarDetail(row);
  if (activeStrategyLabId === 'reversal') return buildReversalDetail(row);
  return activeStrategyLabId === 'stage' ? buildStageDetail(row) : buildGenericDetail(row);
}

 function stopStrategyLabPolling() {
  if (!strategyLabPollTimer) return;
  clearInterval(strategyLabPollTimer);
  strategyLabPollTimer = null;
 }

 function stopStrategyLabRadarRefresh() {
  if (!strategyLabRadarTimer) return;
  clearInterval(strategyLabRadarTimer);
  strategyLabRadarTimer = null;
 }

 function isStrategyLabPaneVisible() {
  const root = document.getElementById('strategyLabRoot');
  const pane = document.getElementById('pane-strategies');
  return !!root && !!pane && pane.classList.contains('active') && !document.hidden;
 }

 function scheduleStrategyLabStorageRefresh() {
  if (!isStrategyLabPaneVisible()) return;
  if (strategyLabStorageRefreshTimer) clearTimeout(strategyLabStorageRefreshTimer);
  strategyLabStorageRefreshTimer = setTimeout(() => {
   strategyLabStorageRefreshTimer = null;
   loadStrategyLab();
  }, 500);
 }

 function bindStrategyLabStorageListener() {
  if (strategyLabStorageListenerBound || !chrome?.storage?.onChanged?.addListener) return;
  strategyLabStorageListenerBound = true;
  const watched = new Set([
   'strategyResults.wizard',
   'strategyResults.stage',
   'strategyResults.radar',
   'strategyResults.reversal',
   'strategyStatus.wizard',
   'strategyStatus.stage',
   'strategyStatus.radar',
   'strategyStatus.reversal',
   'strategyLabAutoScan',
   'scanResults',
   'scanStatus',
   'scanActive',
   'lastScanTs',
  ]);
  chrome.storage.onChanged.addListener((changes, area) => {
   if (area !== 'local') return;
   if (!Object.keys(changes || {}).some(key => watched.has(key))) return;
   scheduleStrategyLabStorageRefresh();
  });
 }

 function maybeRunRadarAutoRefresh() {
  if (activeStrategyLabId !== 'radar') return;
  if (!isStrategyLabPaneVisible()) {
   stopStrategyLabRadarRefresh();
   return;
  }
  const status = labStatusForActive(strategyLabSnapshot);
  if (status.active) return;
  const last = Number(status.lastScanTs || status.ts || 0);
  if (last && Date.now() - last < 55000) return;
  chrome.runtime.sendMessage({ action: 'radar:startScan' }, resp => {
   if (chrome.runtime.lastError || !resp?.ok) return;
   loadStrategyLab();
  });
 }

 function syncStrategyLabRadarRefresh() {
  if (activeStrategyLabId !== 'radar' || !isStrategyLabPaneVisible()) {
   stopStrategyLabRadarRefresh();
   return;
  }
  if (strategyLabRadarTimer) return;
  strategyLabRadarTimer = setInterval(() => {
   const root = document.getElementById('strategyLabRoot');
   if (!root || activeStrategyLabId !== 'radar' || !isStrategyLabPaneVisible()) {
    stopStrategyLabRadarRefresh();
    return;
   }
   maybeRunRadarAutoRefresh();
  }, 60000);
 }

 function snapshotHasActiveScan(snapshot = strategyLabSnapshot) {
 return registryList()
 .filter(strategy => String(strategy.mode || '').toLowerCase() === 'scanner_only')
 .some(strategy => !!snapshot?.[strategy.id]?.status?.active);
 }

 function loadStrategySnapshot(callback) {
 chrome.runtime.sendMessage({ action: 'wizard:getResults' }, resp => {
 if (chrome.runtime.lastError || !resp?.ok) {
 global.reportUiError?.('Strategy Lab failed', chrome.runtime.lastError || new Error(resp?.error || 'Unknown error'), { timeoutMs: 7000 });
 return;
 }
 chrome.storage.local.get(['strategyLabScannerAlerts', 'strategyLabRadarNotificationsEnabled', 'strategyLabResearchWatchlist', 'strategyLabQualityFilters'], data => {
 strategyLabAlerts = Array.isArray(data.strategyLabScannerAlerts) ? data.strategyLabScannerAlerts : [];
 strategyLabRadarNotificationsEnabled = data.strategyLabRadarNotificationsEnabled === true;
 strategyLabResearchWatchlist = Array.isArray(data.strategyLabResearchWatchlist) ? data.strategyLabResearchWatchlist.map(value => String(value || '').toUpperCase()).filter(Boolean).slice(0, 80) : [];
 const filters = data.strategyLabQualityFilters && typeof data.strategyLabQualityFilters === 'object' ? data.strategyLabQualityFilters : {};
 strategyLabMinScore = Math.max(0, Math.min(100, Number(filters.minScore || strategyLabMinScore || 0)));
 strategyLabHideAvoid = filters.hideAvoid === true || strategyLabHideAvoid === true;
 callback({ ...resp, strategyLabScannerAlerts: strategyLabAlerts });
 });
 });
 }

 function saveStrategyLabQualityFilters() {
 chrome.storage.local.set({
 strategyLabQualityFilters: {
 minScore: Number(strategyLabMinScore || 0),
 hideAvoid: strategyLabHideAvoid === true,
 },
 }, () => renderStrategyLab(strategyLabSnapshot));
 }

 function toggleStrategyWatchlist(symbol = '') {
 const safeSymbol = String(symbol || '').trim().toUpperCase();
 if (!safeSymbol) return;
 const exists = strategyLabResearchWatchlist.includes(safeSymbol);
 strategyLabResearchWatchlist = exists
 ? strategyLabResearchWatchlist.filter(item => item !== safeSymbol)
 : [safeSymbol, ...strategyLabResearchWatchlist.filter(item => item !== safeSymbol)].slice(0, 80);
 chrome.storage.local.set({ strategyLabResearchWatchlist }, () => renderStrategyLab(strategyLabSnapshot));
 }

 function saveStrategyAlert(row = {}, type = '') {
 if (!row?.symbol || !type) return;
 const strategyId = labStrategyId(row);
 const symbol = String(row.symbol || '').toUpperCase();
 const target = labAlertTarget(row, type);
 const existingIndex = strategyLabAlerts.findIndex(alert => alert.strategyId === strategyId && alert.symbol === symbol && alert.type === type);
 if (existingIndex >= 0) {
 strategyLabAlerts = strategyLabAlerts.map((alert, index) => index === existingIndex ? { ...alert, active: false, removedTs: Date.now() } : alert).filter(alert => alert.active !== false);
 strategyLabAlertMessage = `${symbol} ${labAlertLabel(type)} alert removed`;
 } else {
 strategyLabAlerts = [
 ...strategyLabAlerts,
 {
 id: `${strategyId}:${symbol}:${type}:${Date.now()}`,
 strategyId,
 symbol,
 type,
 target,
 active: true,
 createdTs: Date.now(),
 source: 'strategy_lab_scanner_only',
 },
 ].slice(-80);
 strategyLabAlertMessage = `${symbol} ${labAlertLabel(type)} alert saved`;
 }
 chrome.storage.local.set({ strategyLabScannerAlerts: strategyLabAlerts }, () => renderStrategyLab(strategyLabSnapshot));
 }

function buildRadarChartDraft(row = {}) {
const isShort = String(row.direction || '').includes('short') || row.signal === 'SELL';
return {
 symbol: String(row.symbol || '').trim().toUpperCase(),
 side: isShort ? 'sell' : 'buy',
 entry: Number(row.entry || row.raw?.latestPrice || 0),
 stopLoss: Number(row.stop || 0),
 takeProfit: Number(row.targets?.target2R || row.targets?.target1 || 0),
 size: 1,
 sizeMode: 'contracts',
 orderType: 'market_order',
 entryMode: 'market',
 source: 'strategy-lab-radar',
 note: `${row.raw?.eventLabel || row.setupLabel || 'Live Radar'} draft. Advisory only; confirm manually before any order.`,
 updatedAt: Date.now(),
};
}

function buildReversalChartDraft(row = {}) {
const isShort = String(row.direction || '').includes('short') || row.signal === 'SELL';
return {
symbol: String(row.symbol || '').trim().toUpperCase(),
side: isShort ? 'sell' : 'buy',
entry: Number(row.entry || row.raw?.latestPrice || 0),
stopLoss: Number(row.stop || 0),
takeProfit: Number(row.targets?.target1 || row.targets?.vwap || row.targets?.target2R || 0),
size: 1,
sizeMode: 'contracts',
orderType: 'market_order',
entryMode: 'market',
source: 'strategy-lab-reversal',
note: `${row.raw?.eventLabel || row.setupLabel || 'Reversal Lab'} draft. Scanner-only counter-trend setup; confirm reclaim/fade manually before any order.`,
updatedAt: Date.now(),
};
}

function alignStrategyHelpTooltips(root) {
 if (!root?.querySelectorAll) return;
 root.querySelectorAll('[data-strategy-help]').forEach(node => {
  node.classList.remove('strategy-help-left', 'strategy-help-right');
  const rect = node.getBoundingClientRect?.();
  if (!rect) return;
  if (rect.left < 150) node.classList.add('strategy-help-left');
  else if ((window.innerWidth - rect.right) < 150) node.classList.add('strategy-help-right');
 });
}

function bindStrategyLab(root, rows) {
 alignStrategyHelpTooltips(root);
 root.querySelectorAll('[data-strategy-lab-select]').forEach(button => {
 button.addEventListener('click', () => {
 activeStrategyLabId = button.dataset.strategyLabSelect || 'current';
 selectedStrategySymbol = button.dataset.strategySymbol || '';
 strategyLabViewMode = 'focus';
  renderStrategyLab(strategyLabSnapshot);
  syncStrategyLabRadarRefresh();
 });
 });
 root.querySelectorAll('[data-strategy-view-mode]').forEach(button => {
 button.addEventListener('click', () => {
 strategyLabViewMode = button.dataset.strategyViewMode || 'focus';
 selectedStrategySymbol = '';
 renderStrategyLab(strategyLabSnapshot);
 });
 });
 root.querySelector('#btnRefreshStrategyLab')?.addEventListener('click', () => loadStrategyLab());
 root.querySelector('#btnRadarNotificationToggle')?.addEventListener('click', () => {
 strategyLabRadarNotificationsEnabled = !strategyLabRadarNotificationsEnabled;
 chrome.storage.local.set({ strategyLabRadarNotificationsEnabled: strategyLabRadarNotificationsEnabled }, () => renderStrategyLab(strategyLabSnapshot));
 });
 root.querySelector('#btnOpenCurrentScan')?.addEventListener('click', () => global.setActiveWorkspaceTab?.('scanner', true, true));
 root.querySelector('#btnRunAllStrategyScans')?.addEventListener('click', () => {
 const btn = root.querySelector('#btnRunAllStrategyScans');
 if (btn) {
 btn.disabled = true;
 btn.textContent = 'Scanning...';
 }
 startStrategyLabPolling();
 scannerRegistryList()
 .filter(strategy => strategy.scannerAction)
 .forEach((strategy, index) => {
  window.setTimeout(() => {
   chrome.runtime.sendMessage({ action: strategy.scannerAction }, resp => {
    if (chrome.runtime.lastError || !resp?.ok) {
     global.reportUiError?.(`${strategy.displayName || strategy.id} failed`, chrome.runtime.lastError || new Error(resp?.error || 'Unknown error'), { timeoutMs: 7000 });
    }
    loadStrategyLab();
   });
  }, index * 450);
 });
 });
 root.querySelector('#btnRunStrategyScan')?.addEventListener('click', () => {
 const strategy = getStrategyMeta(root.querySelector('#btnRunStrategyScan')?.dataset?.runStrategy || activeStrategyLabId);
 if (!strategy?.scannerAction) return;
 const btn = root.querySelector('#btnRunStrategyScan');
 if (btn) {
 btn.disabled = true;
 btn.textContent = 'Scanning...';
 }
 startStrategyLabPolling();
 setTimeout(() => loadStrategyLab(), 500);
 chrome.runtime.sendMessage({ action: strategy.scannerAction }, resp => {
 if (chrome.runtime.lastError || !resp?.ok) {
 global.reportUiError?.(`${strategy.displayName || strategy.id} failed`, chrome.runtime.lastError || new Error(resp?.error || 'Unknown error'), { timeoutMs: 7000 });
 }
 loadStrategyLab();
 });
 });
 root.querySelectorAll('[data-strategy-symbol]').forEach(row => {
 row.addEventListener('click', () => {
 selectedStrategySymbol = row.dataset.strategySymbol || '';
 renderStrategyLab(strategyLabSnapshot);
 });
 });
 root.querySelectorAll('[data-strategy-symbol]').forEach(row => {
 row.addEventListener('dblclick', () => {
 const symbol = row.dataset.strategySymbol || '';
 if (!symbol) return;
 selectedStrategySymbol = symbol;
 renderStrategyLab(strategyLabSnapshot);
 const selected = labRowsForActive(strategyLabSnapshot).find(item => item.symbol === symbol) || { symbol };
 global.openSignalInChartWorkspace?.(selected, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol });
 });
 });
 root.querySelectorAll('[data-strategy-alert]').forEach(button => {
 button.addEventListener('click', () => {
 const symbol = button.dataset.strategySymbol || selectedStrategySymbol || '';
 const type = button.dataset.strategyAlert || '';
 const selected = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId).find(item => item.symbol === symbol) || null;
 if (selected) saveStrategyAlert(selected, type);
 });
 });
 root.querySelectorAll('[data-strategy-min-score]').forEach(button => {
 button.addEventListener('click', () => {
 strategyLabMinScore = Math.max(0, Math.min(100, Number(button.dataset.strategyMinScore || 0)));
 selectedStrategySymbol = '';
 saveStrategyLabQualityFilters();
 });
 });
 root.querySelectorAll('[data-strategy-hide-avoid]').forEach(button => {
 button.addEventListener('click', () => {
 strategyLabHideAvoid = button.dataset.strategyHideAvoid === '1';
 selectedStrategySymbol = '';
 saveStrategyLabQualityFilters();
 });
 });
 root.querySelectorAll('[data-strategy-watchlist-toggle]').forEach(button => {
 button.addEventListener('click', () => {
 toggleStrategyWatchlist(button.dataset.strategyWatchlistToggle || selectedStrategySymbol || '');
 });
 });
 root.querySelectorAll('[data-strategy-chart-review]').forEach(button => {
 button.addEventListener('click', async () => {
 const symbol = button.dataset.strategyChartReview || selectedStrategySymbol || '';
 const selected = labAllScannerRows(strategyLabSnapshot || {}).find(item => item.symbol === symbol)
 || labRowsForActive(strategyLabSnapshot).find(item => item.symbol === symbol)
 || { symbol };
 await global.openSignalInChartWorkspace?.({
 ...selected,
 chartTradingDraft: buildGenericChartDraft(selected),
 }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol });
 });
 });
root.querySelectorAll('[data-radar-chart-draft]').forEach(button => {
 button.addEventListener('click', async () => {
 const symbol = button.dataset.radarChartDraft || selectedStrategySymbol || '';
 const selected = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId).find(item => item.symbol === symbol) || null;
 if (!selected) return;
 await global.openSignalInChartWorkspace?.({
 ...selected,
 chartTradingDraft: buildRadarChartDraft(selected),
 }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol });
});
});
root.querySelectorAll('[data-reversal-chart-draft]').forEach(button => {
button.addEventListener('click', async () => {
const symbol = button.dataset.reversalChartDraft || selectedStrategySymbol || '';
const selected = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId).find(item => item.symbol === symbol) || null;
if (!selected) return;
 await global.openSignalInChartWorkspace?.({
...selected,
chartTradingDraft: buildReversalChartDraft(selected),
 }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol });
});
});
if (!selectedStrategySymbol && rows[0]?.symbol) selectedStrategySymbol = rows[0].symbol;
}

 function focusStrategyLabSymbol(symbol = '', options = {}) {
 const safeSymbol = String(symbol || '').trim().toUpperCase();
 if (safeSymbol) selectedStrategySymbol = safeSymbol;
 renderStrategyLab(strategyLabSnapshot);
 if (!safeSymbol || options.scroll === false) return;
 window.requestAnimationFrame(() => {
 const root = document.getElementById('pane-strategy') || document;
 const row = Array.from(root.querySelectorAll('[data-strategy-symbol]')).find(node => String(node.dataset.strategySymbol || '').trim().toUpperCase() === safeSymbol);
 row?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
 row?.classList.add('strategy-lab-return-focus');
 window.setTimeout(() => row?.classList.remove('strategy-lab-return-focus'), 1200);
 });
 }

 global.focusStrategyLabSymbol = focusStrategyLabSymbol;

 function startStrategyLabPolling() {
 if (strategyLabPollTimer) return;
 strategyLabPollTimer = setInterval(() => {
 loadStrategySnapshot(resp => {
 strategyLabSnapshot = resp;
  renderStrategyLab(resp);
  if (!snapshotHasActiveScan(resp)) stopStrategyLabPolling();
  syncStrategyLabRadarRefresh();
 });
 }, 2500);
 }

 function renderStrategyLab(snapshot = strategyLabSnapshot) {
 const root = document.getElementById('strategyLabRoot');
 if (!root) return;
 strategyLabSnapshot = snapshot || {};
 const rows = labRowsForActive(strategyLabSnapshot);
 const status = labStatusForActive(strategyLabSnapshot);
 const selected = rows.find(row => row.symbol === selectedStrategySymbol) || rows[0] || null;
 root.innerHTML = `<div class="strategy-lab-shell strategy-lab-shell-guided">
 ${buildStrategyLabTop(rows, status)}
 ${buildGuidedBestRead(rows, status)}
 <div class="strategy-lab-layout strategy-lab-layout-guided">
 <section class="strategy-lab-main">
 ${buildGuidedQueue(rows)}
 ${buildAdvancedStrategyDetails(rows, status)}
 </section>
 ${buildDetail(selected)}
 </div>
 </div>`;
 bindStrategyLab(root, rows);
 syncStrategyLabRadarRefresh();
 }

 function loadStrategyLab() {
 bindStrategyLabStorageListener();
 const root = document.getElementById('strategyLabRoot');
 if (root && !strategyLabSnapshot) {
 root.innerHTML = '<div class="chart-pane-loading"><div class="chart-pane-loading-title">Strategy Lab</div><div class="chart-pane-loading-copy">Loading strategy results...</div></div>';
 }
 loadStrategySnapshot(resp => {
 strategyLabSnapshot = resp;
  renderStrategyLab(resp);
  if (snapshotHasActiveScan(resp)) startStrategyLabPolling();
  else stopStrategyLabPolling();
  syncStrategyLabRadarRefresh();
 });
 }

 global.renderStrategyLab = loadStrategyLab;
})(globalThis);
