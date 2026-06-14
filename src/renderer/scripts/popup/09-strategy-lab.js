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
 let strategyLabScannerNotificationsEnabled = false;
 let strategyLabRadarNotificationsEnabled = false;
 let strategyLabNativeStraddleNotificationsEnabled = false;
 let strategyLabResearchWatchlist = [];
 let strategyLabMinScore = 0;
 let strategyLabHideAvoid = false;
 let strategyLabAdvancedOpen = false;
 let strategyLabMasterSearchOpen = false;
 let strategyLabMasterSearchQuery = '';
 const STRATEGY_LAB_ROW_STALE_MS = 30 * 60 * 1000;
 const STRATEGY_LAB_OUTCOME_KEY = 'strategyLabOutcomeTrackerV1';
 const STRATEGY_LAB_REVIEW_TIMEFRAME = '1d';
 const STRATEGY_LAB_REVIEW_VISIBLE_CANDLES = 120;
 const STRATEGY_LAB_ENTRY_TIMEFRAME = '4h';
 const STRATEGY_LAB_ENTRY_VISIBLE_CANDLES = 120;
 let strategyLabOutcomeTracker = {};
 let strategyLabOutcomePersistTimer = null;

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
  new_coin_scalper: {
   long_reclaim: 'New coin reclaimed a 4H level or VWAP. Confirm it holds before entry.',
   short_fade: 'New coin failed a 4H high or VWAP area. Confirm rejection before entry.',
   obv_confirmed: 'OBV agrees with the scalp direction. Still use small risk on fresh listings.',
   key_level_scalp: 'Price is near a 4H key level. Wait for a clean reaction.',
   trap_watch: 'Fresh coin is stretched without complete reversal proof. Wait for confirmation.',
   watch: 'New coin is visible but needs cleaner 4H proof.',
   new: 'New or short-history coin. Use smaller risk. Risk: price can move wildly.',
  },
  darvas: {
   breakout: 'Price moved above the Darvas box top. Check close and volume. Risk: false breakout.',
   near: 'Price is close to the box top. Wait for breakout proof. Risk: early entry can fail.',
   near_top: 'Price is close to the box top. Wait for breakout proof. Risk: early entry can fail.',
   near_breakout: 'Price is close to the box top. Wait for breakout proof. Risk: early entry can fail.',
   base: 'Price is holding inside a box. Wait for a clean break. Risk: box can break down.',
   failed: 'Price broke the box and fell back inside. Better to skip. Risk: trapped breakout.',
   failed_breakout: 'Price broke the box and fell back inside. Better to skip. Risk: trapped breakout.',
   avoid: common.avoid,
   avoid_box: 'The box is too weak, wide, or thin. Better to skip. Risk: poor structure.',
   volume: 'Volume must expand on breakout. Risk: low volume breakouts often fail.',
  },
 pullback: {
   ema_reclaim: 'Price touched or undercut the 9 EMA and reclaimed it. Entry still needs 4H timing plus market fit. Risk: reclaim can fail.',
   ema_pullback: 'Price is near the 9 EMA in an uptrend. Wait for a clean reclaim candle. Risk: early entry can slide lower.',
   round_support: 'Pullback also respected a round/support area. Check 4H trigger and reward before entry. Risk: support can break.',
   trend_watch: 'Trend is up but price has not pulled back enough. Wait for the next 9 EMA touch. Risk: chasing gives poor reward.',
   ema_reject_short: 'Price rallied into the 9 EMA in a downtrend and rejected it. Entry still needs 4H timing plus market fit. Risk: short squeeze.',
   ema_pullback_short: 'Price is rallying toward the 9 EMA while trend remains down. Wait for a clean rejection candle. Risk: early short can squeeze.',
   round_resistance_short: 'The short rally also rejected a round/resistance area. Check 4H trigger and reward before entry. Risk: resistance can break.',
   trend_watch_short: 'Trend is down but price has not rallied enough. Wait for the next 9 EMA short pullback. Risk: chasing gives poor reward.',
   avoid_chase: 'Price is too far above the 9 EMA. Better to wait. Risk: late entries often pull back.',
   reclaim: 'Price moved back above the 9 EMA after weakness. Check it holds.',
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
 if (labRowIsStale(row) || checks.staleSource || Number(raw.freshness?.staleCount || 0) > 0) return 'It appeared from old scanner data. Rerun scanners before using it.';
 if (checks.mixedConflict || raw.consensus?.mixedConflict) return 'It appeared in more than one scanner, but the scanners disagree on long versus short direction.';
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
 if (strategy === 'new_coin_scalper') {
  if (eventType === 'obv_confirmed') return 'It appeared because the 4H trigger and OBV are pointing in the same swing direction.';
  if (eventType === 'long_reclaim') return 'It appeared because a fresh coin is trying to reclaim a 4H level, VWAP, or recent low.';
  if (eventType === 'short_fade') return 'It appeared because a fresh coin failed a high, VWAP, or upper key level.';
  if (eventType === 'key_level_scalp') return 'It appeared because price is close to a 4H level that can matter for scalping.';
  if (eventType === 'trap_watch') return 'It appeared because the coin is stretched but still needs clean reversal proof.';
  return 'It appeared because this is a new or short-history coin that needs 4H chart review.';
 }
 if (strategy === 'darvas') {
  if (eventType === 'breakout') return 'It appeared because price moved above the Darvas box top with volume confirmation.';
  if (eventType === 'near_breakout') return 'It appeared because price is close to the box top but still needs breakout proof.';
  if (eventType === 'base') return 'It appeared because price is respecting a defined Darvas box.';
  if (eventType === 'failed_breakout') return 'It appeared because price broke the box top and closed back inside.';
  if (eventType === 'avoid_box') return 'It appeared because the box is too wide, thin, or weak for action.';
  return 'It appeared because Darvas box data needs review.';
 }
if (strategy === 'pullback') {
  const isShort = labDirection(row) === 'short';
  if (eventType === 'ema_reject_short') return 'It appeared because price rallied into the 9 EMA in a downtrend and then rejected it.';
  if (eventType === 'ema_pullback_short') return 'It appeared because price is pulling back upward toward the 9 EMA while the trend remains down.';
  if (eventType === 'round_resistance_short') return 'It appeared because the 9 EMA short pullback also rejected a round or resistance area.';
  if (eventType === 'trend_watch_short') return 'It appeared because trend is down, but the better short is still the next rally into the 9 EMA.';
  if (eventType === 'ema_reclaim') return 'It appeared because price touched or undercut the 9 EMA and then reclaimed it in an uptrend.';
  if (eventType === 'ema_pullback') return 'It appeared because price is pulling back toward the 9 EMA while the trend remains up.';
  if (eventType === 'round_support') return 'It appeared because the 9 EMA pullback also respected a round or support area.';
  if (eventType === 'trend_watch') return 'It appeared because trend is up, but the better buy is still the next pullback.';
  if (eventType === 'avoid_chase') return 'It appeared because price is extended above the 9 EMA and the reward is weaker from here.';
  return isShort ? 'It appeared because short-side trend-pullback data needs review.' : 'It appeared because trend-pullback data needs review.';
}
 if (strategy === 'native_straddle') {
  const market = raw.marketContext || {};
  const premium = raw.premiumRead || {};
  if (eventType === 'sell_straddle') return `Sell premium only: ${market.underlying || 'BTC'} is calm enough and MV premium is not expanding.`;
  if (eventType === 'buy_straddle') return `Buy-vol watch only: ${market.underlying || 'BTC'} or the MV premium chart is expanding. Confirm the 4H chart before action.`;
  if (premium.trendState) return `No trade because MV premium is ${premium.trendState}.`;
  return 'No trade until market regime, premium trend, spread, and liquidity all line up.';
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

 function labRowTimestamp(row = {}) {
 return Number(row.ts || row.updatedAt || row.lastScanTs || row.raw?.ts || row.raw?.updatedAt || row.raw?.lastScanTs || row.raw?.scanTs || row.raw?.createdTs || 0) || 0;
 }

 function labRowFreshness(row = {}) {
 const ts = labRowTimestamp(row);
 const ageMs = ts ? Math.max(0, Date.now() - ts) : 0;
 const rowScanId = String(row.scanId || row.raw?.scanId || '').trim();
 const snapshotScanId = String(strategyLabSnapshot?.current?.scanContextMeta?.scanId || strategyLabSnapshot?.current?.unifiedStatus?.scanId || '').trim();
 const scanIdMismatch = !!(rowScanId && snapshotScanId && rowScanId !== snapshotScanId);
 const stale = row.stale === true || row.raw?.stale === true || scanIdMismatch || (!!ts && ageMs > STRATEGY_LAB_ROW_STALE_MS);
 return { ts, ageMs, ageLabel: labAge(ts), stale, scanIdMismatch };
 }

 function labRowIsStale(row = {}) {
 return labRowFreshness(row).stale === true;
 }

 function labPct(value, decimals = 1) {
 const n = Number(value);
 if (!Number.isFinite(n)) return '--';
 return `${labFmt(n, decimals)}%`;
 }

 function labStrategyId(row = {}) {
 return String(row.strategyId || activeStrategyLabId || '').toLowerCase();
 }

 function labConsensusFromRows(rows = []) {
 const directions = (Array.isArray(rows) ? rows : [])
 .map(row => ({ row, direction: labDirection(row) }))
 .filter(item => item.direction === 'long' || item.direction === 'short');
 const longRows = directions.filter(item => item.direction === 'long');
 const shortRows = directions.filter(item => item.direction === 'short');
 const mixedConflict = longRows.length > 0 && shortRows.length > 0;
 const direction = mixedConflict ? '' : longRows.length ? 'long' : shortRows.length ? 'short' : '';
 return {
  direction,
  mixedConflict,
  longCount: longRows.length,
  shortCount: shortRows.length,
  longSources: longRows.map(item => labSourceLabel(item.row.strategyId)),
  shortSources: shortRows.map(item => labSourceLabel(item.row.strategyId)),
 };
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
  if (row.strategyId === 'new_coin_scalper' || activeStrategyLabId === 'new_coin_scalper') {
   if (type === 'level') return Number(row.triggerPrice || raw.keyLevels?.trigger || row.entry || 0);
   if (type === 'obv') return Number(row.entry || raw.latestPrice || 0);
   if (type === 'vwap') return Number(raw.vwap || row.targets?.vwap || 0);
   if (type === 'reclaim') return Number(row.triggerPrice || row.entry || 0);
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
  if (type === 'level') return 'Key level';
  if (type === 'obv') return 'OBV confirm';
  if (type === 'ma30') return '30WMA cross';
  if (type === 'volume') return 'Volume confirm';
  return 'Scanner alert';
 }

 function labAlertTypesForRow(row = {}) {
  if (!row?.symbol || !isScannerOnly(row.strategyId || activeStrategyLabId)) return [];
  if (activeStrategyLabId === 'early' || row.strategyId === 'early') return ['breakout', 'vwap', 'reclaim', 'volume'];
  if (activeStrategyLabId === 'radar' || row.strategyId === 'radar') return ['breakout', 'ema_obv', 'vwap', 'pressure', 'new_coin'];
  if (activeStrategyLabId === 'reversal' || row.strategyId === 'reversal') return ['fade', 'vwap', 'reclaim', 'climax'];
  if (activeStrategyLabId === 'new_coin_scalper' || row.strategyId === 'new_coin_scalper') return ['reclaim', 'obv', 'level', 'vwap'];
 if (activeStrategyLabId === 'darvas' || row.strategyId === 'darvas') return ['breakout', 'volume'];
  if (activeStrategyLabId === 'pullback' || row.strategyId === 'pullback') return ['ema9', 'reclaim', 'obv', 'reward'];
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
  if (alert.type === 'new_coin') return row.raw?.isDeltaNewCoin || row.raw?.isNewDailyHistory || row.raw?.isFirstSeenNew || row.raw?.isShortHistory ? { state: 'Triggered', detail: 'New coin condition active' } : { state: 'Watching', detail: 'Waiting for new coin condition' };
  if (alert.type === 'level') return price > 0 && target > 0 && Math.abs(price - target) / price <= 0.012 ? { state: 'Triggered', detail: `Near key level ${labPrice(target)}` } : { state: 'Watching', detail: `Waiting near ${labPrice(target)}` };
  if (alert.type === 'obv') return row.checks?.obvConfirmed || row.checks?.obvUp || row.checks?.obvDown ? { state: 'Triggered', detail: 'OBV condition active' } : { state: 'Watching', detail: 'Waiting for OBV proof' };
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
 if (id === 'new_coin_scalper') return 'New Coin';
 if (id === 'darvas') return 'Darvas';
 if (id === 'pullback') return 'Pullback';
 if (id === 'native_straddle') return 'Native Straddle';
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
 const newCoinScalper = sourceRows.find(row => row.strategyId === 'new_coin_scalper') || {};
 const darvas = sourceRows.find(row => row.strategyId === 'darvas') || {};
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
 const newCoinScalperRaw = newCoinScalper.raw || {};
 const darvasRaw = darvas.raw || {};
 const isFresh = !!(radarRaw.isFirstSeenNew || radarRaw.isShortHistory || newCoinScalperRaw.isDeltaNewCoin || newCoinScalperRaw.isNewDailyHistory || events.includes('new_coin'));
 const volumeRatio = Math.max(Number(radarRaw.volumeRatio || 0), Number(wizardRaw.breakoutVolumeRatio || 0), Number(reversalRaw.volumeRatio || 0), Number(newCoinScalperRaw.volumeRatio || 0), Number(darvasRaw.volumeRatio || 0), Number(stageRaw.stageMetrics?.volumeRatio10w || 0));
 const emaObv = events.includes('ema_obv') || events.includes('obv_confirmed') || !!(radar.checks?.emaBull && radar.checks?.obvUp) || !!newCoinScalper.checks?.obvConfirmed;
 const vwapReclaim = events.includes('vwap') || !!radar.checks?.vwapReclaim || !!newCoinScalper.checks?.vwapReclaim;
 const breakoutNear = events.includes('breakout') || events.includes('near_breakout') || !!wizard.checks?.breakoutReady || !!darvas.checks?.breakout || !!darvas.checks?.nearBreakout || Number(wizardRaw.pivotPrice || darvasRaw.boxTop || 0) > 0;
 const baseForming = stage.stage === 'STAGE_I' || wizard.signal === 'WATCHLIST' || darvas.eventType === 'base' || !!wizardRaw.vcp?.detected || Array.isArray(wizardRaw.contractions);
 const earlyStage2 = stage.stage === 'STAGE_II' && Number(stage.confidence || stage.score || 0) < 82;
 const reclaim = events.includes('reclaim') || events.includes('mean_reversion') || events.includes('long_reclaim') || !!reversal.checks?.closeBackInsideHigh || !!reversal.checks?.closeBackInsideLow || !!newCoinScalper.checks?.longTrigger;
 const sourceCount = sourceRows.length;
 const consensus = labConsensusFromRows(sourceRows);
 const sourceFreshness = sourceRows.map(row => ({ ...labRowFreshness(row), strategyId: row.strategyId, symbol: row.symbol }));
 const staleSourceCount = sourceFreshness.filter(item => item.stale).length;
 addScore('Fresh activity', isFresh ? 15 : 0, 'Fresh or short-history activity is visible');
 addScore('Volume expansion', volumeRatio >= 1.5 ? Math.min(15, Math.round(volumeRatio * 4)) : 0, `Volume expansion ${labFmt(volumeRatio, 2)}x`);
 addScore('EMA/OBV or VWAP', emaObv || vwapReclaim ? 18 : 0, emaObv ? 'EMA and OBV improve together' : 'VWAP reclaim or decision area is active');
 addScore('Base or early trend', baseForming || earlyStage2 ? 15 : 0, baseForming ? 'Base or compression is forming' : 'Early Stage II trend is visible');
 addScore('Near breakout', breakoutNear ? 12 : 0, 'Price is near a trigger or resistance level');
 addScore('Reclaim setup', reclaim ? 10 : 0, 'Reclaim or mean-reversion evidence is present');
 addScore('Cross-lab agreement', sourceCount > 1 && !consensus.mixedConflict ? Math.min(15, (sourceCount - 1) * 6) : 0, `${sourceCount} scanners mention this symbol`);
 const riskFlags = [];
 const extended = !!(radarRaw.avoidTrap?.active || radarRaw.extended || events.includes('avoid_trap') || events.includes('avoid_chase'));
 const lowLiquidity = !!(radar.checks?.lowLiquidity || reversal.checks?.lowLiquidity || (Array.isArray(radar.riskFlags) && radar.riskFlags.some(flag => /thin|liquidity/i.test(String(flag)))));
 if (consensus.mixedConflict) riskFlags.push(`Mixed long/short scanner conflict: long ${consensus.longCount}, short ${consensus.shortCount}`);
 if (staleSourceCount) riskFlags.push(`${staleSourceCount} source rows are stale; rerun scanners before trusting this read`);
 if (extended) riskFlags.push('Move may already be late or stretched');
 if (lowLiquidity) riskFlags.push('Thin liquidity can create bad fills');
 if (consensus.mixedConflict) score -= 24;
 if (staleSourceCount) score -= Math.min(24, staleSourceCount * 10);
 if (extended) score -= 14;
 if (lowLiquidity) score -= 10;
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
 const entry = labRowLevel(bestSource) || labRowLevel(newCoinScalper) || labRowLevel(radar) || labRowLevel(wizard) || labRowLevel(stage) || labRowLevel(reversal) || labRowLevel(darvas);
 const stop = Number(bestSource.stop || bestSource.protectLevel || newCoinScalper.stop || radar.stop || wizard.stop || stage.protectLevel || reversal.stop || darvas.stop || 0);
 const trigger = Number(newCoinScalper.triggerPrice || newCoinScalperRaw.keyLevels?.trigger || wizard.triggerPrice || wizardRaw.pivotPrice || darvas.triggerPrice || darvasRaw.boxTop || radarRaw.resistance || radarRaw.vwap || stage.triggerPrice || reversal.entry || entry || 0);
 const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
 const blockedBySafety = extended || consensus.mixedConflict || staleSourceCount > 0;
 const signal = boundedScore >= 72 && !blockedBySafety ? 'BUY' : boundedScore >= 45 && !consensus.mixedConflict ? 'WATCHLIST' : 'IGNORE';
 return {
  symbol,
  strategyId: 'early',
  signal,
  setupLabel: earlyType.replace(/_/g, ' '),
  direction: consensus.direction || bestSource.direction || radar.direction || wizard.direction || reversal.direction || '',
  stage: stage.stage || '',
  stageLabel: stage.stageLabel || '',
  actionLabel: consensus.mixedConflict ? 'Conflict - verify manually' : staleSourceCount ? 'Stale - rerun scan' : boundedScore >= 72 ? 'Review early trigger' : boundedScore >= 50 ? 'Build watch' : 'Avoid chase',
  priorityLabel: consensus.mixedConflict ? 'Mixed signal' : staleSourceCount ? 'Stale data' : boundedScore >= 78 ? 'Early leader' : boundedScore >= 62 ? 'Early watch' : boundedScore >= 45 ? 'Needs proof' : 'Avoid late',
  eventType: earlyType,
  confidence: boundedScore,
  score: boundedScore,
  entry,
  stop,
  triggerPrice: trigger,
  protectLevel: stop,
  targets: {
   trigger,
   vwap: Number(newCoinScalperRaw.vwap || radarRaw.vwap || reversalRaw.vwap || 0),
   resistance: Number(newCoinScalperRaw.keyLevels?.resistance4h || radarRaw.resistance || wizardRaw.pivotPrice || 0),
   support: Number(newCoinScalperRaw.keyLevels?.support4h || radarRaw.support || stageRaw.stageMetrics?.rangeLow || 0),
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
   mixedConflict: consensus.mixedConflict,
   staleSource: staleSourceCount > 0,
   consensusDirection: consensus.direction,
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
   direction: labDirection(row),
   score: row.score || row.confidence || 0,
   actionLabel: row.actionLabel || '',
   ts: labRowTimestamp(row),
   stale: labRowIsStale(row),
  })),
   consensus,
   freshness: {
    staleCount: staleSourceCount,
    sourceRows: sourceFreshness,
   },
   scoreParts,
   confirmations,
   rejections,
   chartLevels: {
    trigger,
    entry,
    stop,
    vwap: Number(newCoinScalperRaw.vwap || radarRaw.vwap || reversalRaw.vwap || 0),
    resistance: Number(newCoinScalperRaw.keyLevels?.resistance4h || radarRaw.resistance || wizardRaw.pivotPrice || 0),
    support: Number(newCoinScalperRaw.keyLevels?.support4h || radarRaw.support || stageRaw.stageMetrics?.rangeLow || 0),
   },
   volumeRatio,
  },
 };
 }).sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.raw?.sourceCount || 0) - Number(a.raw?.sourceCount || 0) || String(a.symbol || '').localeCompare(String(b.symbol || '')));
 }

 function labEarlyOpportunityStatus(snapshot = strategyLabSnapshot) {
 const rows = labEarlyOpportunityRows(snapshot || {});
 const scannerIds = scannerRegistryList().map(strategy => strategy.id).filter(id => id && id !== 'early' && id !== 'current');
 const sourceStatuses = scannerIds.map(id => snapshot?.[id]?.status || {}).filter(status => Object.keys(status).length);
 const sourceTimes = sourceStatuses.map(status => Number(status.lastScanTs || status.ts || status.finishedAt || 0)).filter(Boolean);
 const rowTimes = rows.map(row => Number(row.ts || row.raw?.ts || 0)).filter(Boolean);
 const metaTimes = [
  Number(snapshot?.current?.lastScanTs || 0),
  Number(snapshot?.current?.scanContextMeta?.finishedAt || 0),
  Number(snapshot?.current?.unifiedStatus?.finishedAt || 0),
  Number(snapshot?.current?.unifiedStatus?.startedAt || 0),
 ].filter(Boolean);
 const lastScanTs = Math.max(...sourceTimes, ...rowTimes, ...metaTimes, 0);
 const active = sourceStatuses.some(status => status.active === true);
 return {
  status: rows.length ? `Derived - ${rows.length} Early Opportunity rows` : 'Run all scanners to build Early Opportunity',
  active,
  scanned: rows.length,
  total: rows.length,
  progress: active ? Math.min(98, Number(snapshot?.current?.unifiedStatus?.progress || 50)) : 100,
  lastScanTs,
  ts: lastScanTs,
  derived: true,
 };
 }

 function labIsAvoidRow(row = {}) {
 const eventType = String(row.eventType || row.raw?.eventType || '').toLowerCase();
 if (labRowIsStale(row) || row.checks?.staleSource || Number(row.raw?.freshness?.staleCount || 0) > 0) return true;
 if (row.checks?.mixedConflict || row.raw?.consensus?.mixedConflict) return true;
 return row.signal === 'IGNORE' || eventType.includes('avoid') || (Array.isArray(row.riskFlags) && row.riskFlags.length > 0 && Number(row.score || 0) < 55);
 }

 function labIsNewCoinRow(row = {}) {
 const eventType = String(row.eventType || row.raw?.eventType || '').toLowerCase();
 const raw = row.raw || {};
 const c4h = Number(raw.candleCount4h || raw.candles4h || raw.intradayCandles || 0);
 const c1d = Number(raw.candleCount1d || raw.dailyCandles || 0);
 return eventType === 'new_coin'
 || raw.isDeltaNewCoin === true
 || raw.isNewDailyHistory === true
 || raw.isFirstSeenNew === true
 || raw.isShortHistory === true
 || (c4h > 0 && c4h < 36)
 || (c1d > 0 && c1d <= 15);
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
  if (strategyLabViewMode === 'new') return applyStrategyQualityFilters(rows.filter(labIsNewCoinRow));
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
  if (activeStrategyLabId === 'new_coin_scalper') {
   if (strategyLabViewMode === 'long') return applyStrategyQualityFilters(rows.filter(row => labDirection(row) !== 'short'));
   if (strategyLabViewMode === 'short') return applyStrategyQualityFilters(rows.filter(row => labDirection(row) === 'short'));
   if (strategyLabViewMode === 'obv') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'obv_confirmed' || row.raw?.eventType === 'obv_confirmed' || row.checks?.obvConfirmed));
   if (strategyLabViewMode === 'level') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'key_level_scalp' || row.raw?.eventType === 'key_level_scalp' || row.checks?.near4hHigh || row.checks?.near4hLow));
   if (strategyLabViewMode === 'trap') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'trap_watch' || row.raw?.eventType === 'trap_watch'));
   return applyStrategyQualityFilters(rows.filter(row => !['watch'].includes(String(row.eventType || row.raw?.eventType || '')) || Number(row.score || 0) >= 55)).slice(0, 12);
  }
  if (activeStrategyLabId === 'darvas') {
   if (strategyLabViewMode === 'breakout') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'breakout' || row.raw?.eventType === 'breakout'));
   if (strategyLabViewMode === 'near') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'near_breakout' || row.raw?.eventType === 'near_breakout'));
   if (strategyLabViewMode === 'base') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'base' || row.raw?.eventType === 'base'));
   if (strategyLabViewMode === 'failed') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'failed_breakout' || row.raw?.eventType === 'failed_breakout'));
   if (strategyLabViewMode === 'avoid') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'avoid_box' || row.raw?.eventType === 'avoid_box' || row.signal === 'IGNORE' || (Array.isArray(row.riskFlags) && row.riskFlags.length)));
   return applyStrategyQualityFilters(rows.filter(row => !['review', 'avoid_box', 'failed_breakout'].includes(String(row.eventType || row.raw?.eventType || '')) && row.signal !== 'IGNORE')).slice(0, 10);
  }
 if (activeStrategyLabId === 'pullback') {
   if (strategyLabViewMode === 'long') return applyStrategyQualityFilters(rows.filter(row => labDirection(row) !== 'short'));
   if (strategyLabViewMode === 'short') return applyStrategyQualityFilters(rows.filter(row => labDirection(row) === 'short'));
  if (strategyLabViewMode === 'reclaim') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'ema_reclaim' || row.raw?.eventType === 'ema_reclaim'));
   if (strategyLabViewMode === 'reject') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'ema_reject_short' || row.raw?.eventType === 'ema_reject_short'));
   if (strategyLabViewMode === 'pullback') return applyStrategyQualityFilters(rows.filter(row => ['ema_pullback', 'ema_pullback_short'].includes(row.eventType) || ['ema_pullback', 'ema_pullback_short'].includes(row.raw?.eventType)));
   if (strategyLabViewMode === 'support') return applyStrategyQualityFilters(rows.filter(row => ['round_support', 'round_resistance_short'].includes(row.eventType) || ['round_support', 'round_resistance_short'].includes(row.raw?.eventType)));
   if (strategyLabViewMode === 'watch') return applyStrategyQualityFilters(rows.filter(row => ['trend_watch', 'trend_watch_short'].includes(row.eventType) || ['trend_watch', 'trend_watch_short'].includes(row.raw?.eventType)));
   if (strategyLabViewMode === 'avoid') return applyStrategyQualityFilters(rows.filter(row => row.eventType === 'avoid_chase' || row.raw?.eventType === 'avoid_chase' || row.signal === 'IGNORE' || (Array.isArray(row.riskFlags) && row.riskFlags.length)));
   return applyStrategyQualityFilters(rows.filter(row => !['review', 'avoid_chase'].includes(String(row.eventType || row.raw?.eventType || '')) && row.signal !== 'IGNORE')).slice(0, 12);
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
 if (activeStrategyLabId === 'early') return labEarlyOpportunityStatus(snapshot || {});
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
  const addNewCoinMode = modes => {
  if (modes.some(([id]) => id === 'new')) return modes;
  const allIndex = modes.findIndex(([id]) => id === 'all');
  const insertAt = allIndex >= 0 ? allIndex : modes.length;
  return [...modes.slice(0, insertAt), ['new', 'New Symbols'], ...modes.slice(insertAt)];
  };
  const modes = addNewCoinMode(activeStrategyLabId === 'early'
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
  ['new', 'New Symbols'],
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
  : activeStrategyLabId === 'new_coin_scalper'
  ? [
  ['focus', 'Focus'],
  ['long', 'Long Reclaim'],
  ['short', 'Short Fade'],
  ['obv', 'OBV Confirmed'],
  ['level', 'Key Levels'],
  ['trap', 'Trap Watch'],
  ['all', 'All'],
  ]
  : activeStrategyLabId === 'darvas'
  ? [
  ['focus', 'Focus'],
  ['breakout', 'Breakout'],
  ['near', 'Near Top'],
  ['base', 'Base'],
  ['failed', 'Failed'],
  ['avoid', 'Avoid'],
  ['all', 'All'],
  ]
  : activeStrategyLabId === 'pullback'
  ? [
  ['focus', 'Focus'],
  ['long', 'Long'],
  ['short', 'Short'],
  ['reclaim', '9 EMA Reclaim'],
  ['reject', '9 EMA Reject'],
  ['pullback', '9 EMA Touch'],
  ['support', 'Round Level'],
  ['watch', 'Trend Watch'],
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
 ]);
 return `<div class="strategy-lab-viewmodes">${modes.map(([id, label]) => `<button type="button" class="${strategyLabViewMode === id ? 'active' : ''}" data-strategy-view-mode="${labEsc(id)}"${labHelpAttrs(id, activeStrategyLabId)}>${labEsc(label)}</button>`).join('')}</div>`;
 }

 function buildMetric(label, value, tone = '') {
 return `<div class="strategy-lab-metric ${labEsc(tone)}"${labHelpAttrs(label, activeStrategyLabId, isScannerOnly())}><span>${labEsc(label)}</span><strong>${labEsc(value)}</strong></div>`;
 }

 function buildActions() {
 const masterSearchButton = '<button type="button" class="bsm secondary strategy-master-stock-button" id="btnStrategyMasterStock" aria-expanded="' + (strategyLabMasterSearchOpen ? 'true' : 'false') + '">Master Stock</button>';
 if (activeStrategyLabId === 'current') {
 return `${masterSearchButton}<button type="button" class="bsm primary" id="btnOpenCurrentScan">Open Current Scan</button><button type="button" class="bsm secondary" id="btnRefreshStrategyLab">Refresh</button>`;
 }
 const strategy = getStrategyMeta();
 const notificationToggle = isScannerOnly()
 ? `<button type="button" class="bsm ${strategyLabScannerNotificationsEnabled ? 'primary active' : 'secondary'} radar-notify-toggle" id="btnStrategyLabNotificationToggle" aria-pressed="${strategyLabScannerNotificationsEnabled ? 'true' : 'false'}" title="Turn Scanner Lab desktop notifications on or off"><span>${strategyLabScannerNotificationsEnabled ? 'Notifications On' : 'Notifications Off'}</span></button>`
 : '';
 if (activeStrategyLabId === 'early') {
 return `${masterSearchButton}${notificationToggle}<button type="button" class="bsm primary" id="btnRunAllStrategyScans">Run All Scanners</button><button type="button" class="bsm secondary" id="btnRefreshStrategyLab">Refresh</button>`;
 }
 return `${masterSearchButton}${notificationToggle}<button type="button" class="bsm primary" id="btnRunStrategyScan" data-run-strategy="${labEsc(strategy.id)}">Run ${labEsc(strategy.shortName || strategy.displayName || strategy.id)} Scan</button>
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
   skipped.insufficientIntraday ? `${skipped.insufficientIntraday} with insufficient 4H history` : '',
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
   skipped.insufficientHistory ? `${skipped.insufficientHistory} with short 4H history` : '',
   skipped.reviewOnly ? `${skipped.reviewOnly} review-only rows` : '',
   skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
   ].filter(Boolean);
   return notes.length ? `<div class="strategy-lab-diagnostics">${notes.map(labEsc).join(' | ')}</div>` : '';
  }
  if (activeStrategyLabId === 'new_coin_scalper') {
   const skipped = status.skipped || {};
   const diagnostics = status.diagnostics || {};
   const notes = [
   diagnostics.maxLaunchAgeDays ? `Delta new tag or launch <= ${diagnostics.maxLaunchAgeDays}d only` : '',
   diagnostics.universeRows ? `${diagnostics.universeRows} symbols checked for Delta-new signals` : '',
   skipped.notNew ? `${skipped.notNew} not Delta-new by tag/launch time` : '',
   skipped.dailyFetchErrors ? `${skipped.dailyFetchErrors} kept/reviewed without daily verification` : '',
   skipped.notTradable ? `${skipped.notTradable} manual-review trading status` : '',
   skipped.partialData ? `${skipped.partialData} kept with partial 4H data` : '',
   skipped.reviewOnly ? `${skipped.reviewOnly} watch-only rows` : '',
   skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
   ].filter(Boolean);
   return notes.length ? `<div class="strategy-lab-diagnostics">${notes.map(labEsc).join(' | ')}</div>` : '';
  }
  if (activeStrategyLabId === 'native_straddle') {
   const skipped = status.skipped || {};
   const diagnostics = status.diagnostics || {};
   const notes = [
   diagnostics.underlyings ? `${diagnostics.underlyings} underlyings checked` : '',
   diagnostics.contractsSeen ? `${diagnostics.contractsSeen} MV contracts found` : '',
   diagnostics.contractsRanked ? `${diagnostics.contractsRanked} contracts ranked` : '',
   diagnostics.cachedChains ? `${diagnostics.cachedChains} served from short chain cache` : '',
   Array.isArray(diagnostics.missingUnderlyings) && diagnostics.missingUnderlyings.length ? diagnostics.missingUnderlyings.slice(0, 2).join(' | ') : '',
   skipped.noChain ? `${skipped.noChain} without native chain` : '',
   skipped.noContract ? `${skipped.noContract} without tradable MV contract` : '',
   skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
   ].filter(Boolean);
   return notes.length ? `<div class="strategy-lab-diagnostics">${notes.map(labEsc).join(' | ')}</div>` : '';
  }
  if (activeStrategyLabId === 'pullback') {
   const skipped = status.skipped || {};
   const diagnostics = status.diagnostics || {};
   const notes = [
   diagnostics.universeRows ? `${diagnostics.universeRows} liquid symbols checked for 9 EMA pullbacks` : '',
   skipped.insufficientHistory ? `${skipped.insufficientHistory} with short 1D history` : '',
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
 .filter(labIsNewCoinRow)
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
 <button type="button" data-strategy-chart-review="${labEsc(symbol)}">Trend 1D</button>
 <button type="button" data-strategy-entry-chart="${labEsc(symbol)}">Entry 4H</button>
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
 ${saved.length ? saved.map(row => `<button type="button" data-strategy-symbol="${labEsc(row.symbol)}">${labEsc(row.symbol)}<small>${labEsc(row.setupLabel || row.eventType || row.stageLabel || 'Review')}</small></button>`).join('') : '<span>No saved symbols yet. Select a row and save it for chart review.</span>'}
 </div>
 </section>`;
 }

 function normalizeStrategyOutcomeTracker(raw = {}) {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
 return Object.entries(raw).reduce((map, [key, item]) => {
  if (!item || typeof item !== 'object' || !item.symbol) return map;
  map[key] = {
   ...item,
   key,
   symbol: String(item.symbol || '').trim().toUpperCase(),
   strategyId: String(item.strategyId || '').trim().toLowerCase(),
   entry: Number(item.entry || 0),
   stop: Number(item.stop || 0),
   target: Number(item.target || 0),
   updatedAt: Number(item.updatedAt || item.openedAt || Date.now()),
  };
  return map;
 }, {});
 }

 function labOutcomePrice(row = {}) {
 return Number(row.raw?.latestPrice || row.raw?.markPrice || row.entry || row.triggerPrice || row.raw?.stageMetrics?.close || row.raw?.close || 0) || 0;
 }

 function labOutcomeKey(row = {}) {
 const symbol = String(row.symbol || '').trim().toUpperCase();
 if (!symbol) return '';
 const strategyId = labStrategyId(row) || activeStrategyLabId;
 const eventType = String(row.eventType || row.raw?.eventType || row.raw?.earlyType || row.setupLabel || 'review').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
 const entry = Math.round(Number(row.entry || row.triggerPrice || labOutcomePrice(row) || 0) * 100000000);
 return `${strategyId}:${symbol}:${eventType}:${entry}`;
 }

 function updateStrategyOutcomeItem(item = {}, row = {}) {
 const entry = Number(item.entry || row.entry || row.triggerPrice || 0);
 const price = labOutcomePrice(row);
 if (!entry || !price) return { ...item, updatedAt: Date.now() };
 const side = item.side || (labDirection(row) === 'short' ? 'short' : 'long');
 const movePct = side === 'short' ? ((entry - price) / entry) * 100 : ((price - entry) / entry) * 100;
 const adversePct = Math.max(0, -movePct);
 const favorablePct = Math.max(0, movePct);
 const stop = Number(item.stop || row.stop || row.protectLevel || 0);
 const target = Number(item.target || row.targets?.target2R || row.targets?.target1 || row.exitPrice || 0);
 const hitStop = stop > 0 && (side === 'short' ? price >= stop : price <= stop);
 const hitTarget = target > 0 && (side === 'short' ? price <= target : price >= target);
 return {
  ...item,
  side,
  lastPrice: price,
  maxFavorablePct: Math.max(Number(item.maxFavorablePct || 0), favorablePct),
  maxAdversePct: Math.max(Number(item.maxAdversePct || 0), adversePct),
  status: hitTarget ? 'hit_target' : hitStop ? 'hit_stop' : item.status || 'tracking',
  updatedAt: Date.now(),
 };
 }

 function persistStrategyOutcomeTracker() {
 const timerHost = global.window || global;
 if (strategyLabOutcomePersistTimer && timerHost.clearTimeout) timerHost.clearTimeout(strategyLabOutcomePersistTimer);
 strategyLabOutcomePersistTimer = timerHost.setTimeout(() => {
  if (!global.chrome?.storage?.local?.set) return;
  global.chrome.storage.local.set({ [STRATEGY_LAB_OUTCOME_KEY]: strategyLabOutcomeTracker });
 }, 250);
 }

 function refreshStrategyOutcomeTracker(snapshot = strategyLabSnapshot, loadedTracker = strategyLabOutcomeTracker) {
 strategyLabOutcomeTracker = normalizeStrategyOutcomeTracker(loadedTracker);
 const rows = labAllScannerRows(snapshot || {});
 let changed = false;
 rows.forEach(row => {
  const symbol = String(row.symbol || '').trim().toUpperCase();
  const strategyId = labStrategyId(row);
  Object.entries(strategyLabOutcomeTracker).forEach(([key, item]) => {
   if (item.symbol !== symbol || item.strategyId !== strategyId || item.status === 'hit_target' || item.status === 'hit_stop') return;
   strategyLabOutcomeTracker[key] = updateStrategyOutcomeItem(item, row);
   changed = true;
  });
 });
 if (changed) persistStrategyOutcomeTracker();
 }

 function recordStrategyOutcomeReview(row = {}) {
 const key = labOutcomeKey(row);
 if (!key) return;
 const entry = Number(row.entry || row.triggerPrice || labOutcomePrice(row) || 0);
 strategyLabOutcomeTracker[key] = updateStrategyOutcomeItem({
  key,
  strategyId: labStrategyId(row) || activeStrategyLabId,
  symbol: String(row.symbol || '').trim().toUpperCase(),
  eventType: String(row.eventType || row.raw?.eventType || row.raw?.earlyType || 'review'),
  side: labDirection(row) === 'short' ? 'short' : 'long',
  entry,
  stop: Number(row.stop || row.protectLevel || 0),
  target: Number(row.targets?.target2R || row.targets?.target1 || row.exitPrice || 0),
  score: Number(row.score || row.confidence || 0),
  openedAt: Date.now(),
  updatedAt: Date.now(),
  status: 'tracking',
 }, row);
 persistStrategyOutcomeTracker();
 }

 function buildStrategyOutcomePanel(rows = []) {
 if (!isScannerOnly()) return '';
 const activeStrategy = String(activeStrategyLabId || '').toLowerCase();
 const items = Object.values(strategyLabOutcomeTracker || {}).filter(item => item.strategyId === activeStrategy).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
 const open = items.filter(item => item.status === 'tracking').length;
 const target = items.filter(item => item.status === 'hit_target').length;
 const stop = items.filter(item => item.status === 'hit_stop').length;
 const latest = items.slice(0, 6);
 const seedHint = rows.length ? `${rows.length} rows available for chart-review tracking` : 'Run a scan, then open chart review to start tracking outcomes';
 return `<section class="strategy-alert-strip strategy-outcome-panel">
 <strong>Outcome Tracker</strong>
 <span>${open} tracking | ${target} target | ${stop} stop | ${labEsc(seedHint)}</span>
 <div>${latest.length ? latest.map(item => `<button type="button" data-strategy-symbol="${labEsc(item.symbol)}">${labEsc(item.symbol)} ${labEsc(item.eventType || 'review')}<small>${labEsc(item.status || 'tracking')} | MFE ${labPct(item.maxFavorablePct || 0, 1)} | MAE ${labPct(item.maxAdversePct || 0, 1)}</small></button>`).join('') : '<em>No reviewed rows tracked yet.</em>'}</div>
 </section>`;
 }

 function markStrategyResearchDraft(draft = {}, row = {}) {
 const strategyId = String(row.strategyId || activeStrategyLabId || '').trim().toLowerCase();
 const baseNote = String(draft.note || 'Strategy Lab chart review only. No live or paper order is created.').trim();
 return {
  ...draft,
  strategyId: draft.strategyId || strategyId,
  researchDraftOnly: true,
  sourceWorkspace: 'strategy_lab',
  advisoryOnly: true,
  canPlaceOrder: false,
  note: /research draft only/i.test(baseNote) ? baseNote : `${baseNote} Research draft only; rebuild any live order from Live Orders panel.`,
  updatedAt: Date.now(),
 };
 }

 function buildGenericChartDraft(row = {}) {
 if (isDarvasChartReviewRow(row)) {
  return buildDarvasChartDraft(row);
 }
 if (row.raw?.chartTradingDraft && typeof row.raw.chartTradingDraft === 'object') {
  return markStrategyResearchDraft({ ...row.raw.chartTradingDraft, updatedAt: Date.now() }, row);
 }
 const isShort = String(row.direction || '').includes('short') || row.signal === 'SELL';
 return markStrategyResearchDraft({
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
 }, row);
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
  { key: 'new', label: 'New Coin', tone: 'info', rows: allRows.filter(labIsNewCoinRow) },
  { key: 'avoid', label: 'Avoid / Trap', tone: 'ignore', rows: allRows.filter(row => row.eventType === 'avoid_trap' || row.raw?.eventType === 'avoid_trap' || row.signal === 'IGNORE') },
  ]
  : activeStrategyLabId === 'native_straddle'
  ? [
  { key: 'sell', label: 'Sell Premium', tone: 'developing', rows: allRows.filter(row => row.eventType === 'sell_straddle' || row.raw?.eventType === 'sell_straddle' || row.signal === 'SELL') },
  { key: 'buy', label: 'Buy Volatility', tone: 'buy', rows: allRows.filter(row => row.eventType === 'buy_straddle' || row.raw?.eventType === 'buy_straddle' || row.signal === 'BUY') },
  { key: 'wait', label: 'Wait Trigger', tone: 'watch', rows: allRows.filter(row => row.eventType === 'wait_straddle' || row.raw?.eventType === 'wait_straddle' || row.signal === 'WATCHLIST') },
  { key: 'avoid', label: 'Avoid', tone: 'ignore', rows: allRows.filter(row => row.eventType === 'avoid_straddle' || row.raw?.eventType === 'avoid_straddle' || row.signal === 'IGNORE') },
  { key: 'btc', label: 'BTC / ETH', tone: 'info', rows: allRows.filter(row => ['BTC', 'ETH'].includes(String(row.raw?.underlying || '').toUpperCase())) },
  { key: 'chart', label: '1D Chart', tone: 'watch', rows: allRows.filter(row => String(row.raw?.timeframe || '').toLowerCase() === '1d') },
  ]
  : activeStrategyLabId === 'reversal'
  ? [
  { key: 'liquidation', label: 'Liq Reversal', tone: 'buy', rows: allRows.filter(row => row.eventType === 'liquidation_reversal' || row.raw?.eventType === 'liquidation_reversal') },
  { key: 'fade', label: 'Fade Extreme', tone: 'developing', rows: allRows.filter(row => row.eventType === 'fade_extreme' || row.raw?.eventType === 'fade_extreme') },
  { key: 'mean', label: 'Mean Revert', tone: 'watch', rows: allRows.filter(row => row.eventType === 'mean_reversion' || row.raw?.eventType === 'mean_reversion') },
  { key: 'reclaim', label: 'Reclaim', tone: 'info', rows: allRows.filter(row => row.eventType === 'reclaim' || row.raw?.eventType === 'reclaim') },
  { key: 'avoid', label: 'Avoid Chase', tone: 'ignore', rows: allRows.filter(row => row.eventType === 'avoid_chase' || row.raw?.eventType === 'avoid_chase' || row.signal === 'IGNORE') },
  ]
  : activeStrategyLabId === 'new_coin_scalper'
  ? [
  { key: 'long', label: 'Long Reclaim', tone: 'buy', rows: allRows.filter(row => row.eventType === 'long_reclaim' || row.raw?.eventType === 'long_reclaim' || (row.eventType === 'obv_confirmed' && labDirection(row) !== 'short')) },
  { key: 'short', label: 'Short Fade', tone: 'developing', rows: allRows.filter(row => row.eventType === 'short_fade' || row.raw?.eventType === 'short_fade' || (row.eventType === 'obv_confirmed' && labDirection(row) === 'short')) },
  { key: 'obv', label: 'OBV Confirmed', tone: 'watch', rows: allRows.filter(row => row.eventType === 'obv_confirmed' || row.raw?.eventType === 'obv_confirmed' || row.checks?.obvConfirmed) },
  { key: 'level', label: 'Key Levels', tone: 'info', rows: allRows.filter(row => row.eventType === 'key_level_scalp' || row.raw?.eventType === 'key_level_scalp') },
  { key: 'trap', label: 'Trap Watch', tone: 'ignore', rows: allRows.filter(row => row.eventType === 'trap_watch' || row.raw?.eventType === 'trap_watch') },
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
  : activeStrategyLabId === 'new_coin_scalper'
  ? `New coin scanner-only: ${allRows.length} fresh-listing rows, 4H trigger and daily context required`
  : activeStrategyLabId === 'native_straddle'
  ? `Native straddle scanner-only: ${allRows.length} MV rows, open 1D review first and confirm 4H premium separately`
  : activeStrategyLabId === 'wizard'
  ? (status.marketHealth?.pass ? 'Market regime allows long scans' : 'Market regime cautious: prefer waitlist over new long entries')
  : `${countStage(allRows, 'STAGE_II')} Stage II and ${countStage(allRows, 'STAGE_IV')} Stage IV rows in latest lifecycle scan`;
  const marketTone = activeStrategyLabId === 'early' || activeStrategyLabId === 'radar' || activeStrategyLabId === 'new_coin_scalper' ? 'ok' : activeStrategyLabId === 'reversal' ? 'warn' : activeStrategyLabId === 'wizard' && status.marketHealth?.pass ? 'ok' : 'warn';
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

 function labCanLeadBestRead(row = {}) {
 if (!row?.symbol) return false;
 if (labRowIsStale(row) || row.checks?.staleSource || Number(row.raw?.freshness?.staleCount || 0) > 0) return false;
 if (row.checks?.mixedConflict || row.raw?.consensus?.mixedConflict) return false;
 return labGuidanceBucket(row) !== 'avoid';
 }

 function labGuidanceBucket(row = {}) {
 const tone = rowTone(row);
 const strategy = labStrategyId(row);
 const eventType = String(row.eventType || row.raw?.eventType || row.raw?.earlyType || '').toLowerCase();
 if (row.checks?.mixedConflict || row.raw?.consensus?.mixedConflict) return 'avoid';
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
 if (strategy === 'new_coin_scalper') {
  if (eventType === 'obv_confirmed' || row.signal === 'BUY' || row.signal === 'SELL') return 'review';
  if (eventType === 'long_reclaim' || eventType === 'short_fade' || eventType === 'key_level_scalp') return 'wait';
  if (eventType === 'trap_watch') return 'avoid';
 }
 if (strategy === 'radar') {
 if (eventType === 'breakout' || Number(row.score || 0) >= 78) return 'review';
   if (eventType === 'pressure' || eventType === 'new_coin' || eventType === 'ema_obv') return 'wait';
  }
 if (strategy === 'native_straddle') {
  if (eventType === 'sell_straddle' || eventType === 'buy_straddle') return Number(row.score || 0) >= 68 ? 'review' : 'wait';
  if (eventType === 'wait_straddle' || row.signal === 'WATCHLIST') return 'wait';
  return 'avoid';
 }
 if (strategy === 'pullback') {
  if (['ema_reclaim', 'round_support', 'ema_reject_short', 'round_resistance_short'].includes(eventType) || row.signal === 'BUY' || row.signal === 'SELL') return 'review';
  if (['ema_pullback', 'trend_watch', 'ema_pullback_short', 'trend_watch_short'].includes(eventType)) return 'wait';
  if (eventType === 'avoid_chase') return 'avoid';
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
 if (row.strategyId === 'new_coin_scalper' || activeStrategyLabId === 'new_coin_scalper') return `Confirm 4H trigger near ${labPrice(row.triggerPrice || raw.keyLevels?.trigger || row.entry)} with daily context`;
 if (row.strategyId === 'native_straddle' || activeStrategyLabId === 'native_straddle') return `Open the 1D review chart for ${row.symbol}, then confirm premium behavior separately`;
 if (row.triggerPrice || row.entry) return `Price near ${labPrice(row.triggerPrice || row.entry)}`;
 return pack.nextAction || 'Open chart and confirm price behavior';
 }

 function buildGuidedBestRead(rows = [], status = {}) {
 if (!isScannerOnly()) return '';
 const allRows = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId);
 const queueRows = rows.length ? rows : allRows;
 const bestableRows = queueRows.filter(labCanLeadBestRead);
 const best = bestableRows.find(row => labGuidanceBucket(row) === 'review') || bestableRows.find(row => labGuidanceBucket(row) === 'paper') || bestableRows[0] || null;
 const counts = {
 review: allRows.filter(row => labGuidanceBucket(row) === 'review').length,
 wait: allRows.filter(row => labGuidanceBucket(row) === 'wait').length,
 paper: allRows.filter(row => labGuidanceBucket(row) === 'paper').length,
 avoid: allRows.filter(row => labGuidanceBucket(row) === 'avoid').length,
 };
 const title = best ? `${best.symbol} - ${labGuidedAction(best)}` : 'Run scan to build guidance';
 const why = best ? labPlainWhy(best) : queueRows.length ? 'All visible rows are stale, conflicted, or avoid-grade. Rerun scanners before trusting the read.' : 'This panel will show the one row worth checking first after the scan completes.';
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
 const direction = labDirection(row);
 const action = labGuidedAction(row);
 const why = labPlainWhy(row);
 const trigger = labNextTrigger(row);
 return `<button type="button" class="strategy-guided-row ${tone} ${bucket} ${direction ? `dir-${direction}` : ''} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
 <span class="strategy-guided-rank">${index + 1}</span>
 <span class="strategy-guided-symbol"><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(rowSignalLabel(row))}</small></span>
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
 return `<details class="strategy-advanced-details"${strategyLabAdvancedOpen ? ' open' : ''}>
 <summary><span>Research data</span><strong>Optional: scorecards, alerts, comparisons, and raw table</strong></summary>
 <div class="strategy-advanced-body">
 ${buildStrategyResearchDashboard(rows, status)}
 ${buildStrategyScorecard(rows, status)}
 ${buildStrategyQualityBar()}
 ${buildDecisionDashboard(rows, status)}
 ${buildRadarAlertCenter(rows)}
 ${buildStrategyOutcomePanel(rows)}
 ${buildAlertSummary(rows)}
 ${buildStrategyComparePanel(rows[0] || null)}
 ${buildStrategyWatchlistPanel()}
 ${buildStrategyTable(rows)}
 </div>
 </details>`;
 }

 function labMasterStockMatches(query = '') {
 const normalized = String(query || '').trim().toUpperCase();
 if (!normalized) return [];
 const strategies = [
  { id: 'early', shortName: 'Early Opportunity', displayName: 'Early Opportunity' },
  { id: 'current', shortName: 'Current Scan', displayName: 'Current Scan' },
  ...scannerRegistryList().filter(strategy => strategy?.id && strategy.id !== 'current' && strategy.id !== 'early'),
 ];
 const seen = new Set();
 return strategies
 .flatMap(strategy => labStrategyRows(strategyLabSnapshot || {}, strategy.id)
  .filter(row => String(row.symbol || '').toUpperCase().includes(normalized))
  .map(row => ({ ...row, strategyId: strategy.id, strategyLabel: strategy.shortName || strategy.displayName || strategy.id })))
 .filter(row => {
  const key = `${row.strategyId}:${String(row.symbol || '').toUpperCase()}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
 })
 .sort((a, b) => {
  const aExact = String(a.symbol || '').toUpperCase() === normalized ? 0 : 1;
  const bExact = String(b.symbol || '').toUpperCase() === normalized ? 0 : 1;
  return aExact - bExact || Number(b.score || b.confidence || 0) - Number(a.score || a.confidence || 0);
 })
 .slice(0, 30);
 }

 function buildMasterStockSearch() {
 if (!strategyLabMasterSearchOpen) return '';
 const matches = labMasterStockMatches(strategyLabMasterSearchQuery);
 const resultHtml = strategyLabMasterSearchQuery
 ? matches.length
 ? matches.map(row => `<button type="button" class="strategy-master-stock-result ${rowTone(row)}" data-master-stock-strategy="${labEsc(row.strategyId)}" data-master-stock-symbol="${labEsc(row.symbol)}">
 <strong>${labEsc(row.symbol)}</strong><span>${labEsc(row.strategyLabel)}</span><small>${labEsc(labGuidedAction(row))} | Score ${labFmt(row.score || row.confidence, 0)}${labRowIsStale(row) ? ` | Stale ${labEsc(labRowFreshness(row).ageLabel)}` : ''}</small>
 </button>`).join('')
 : '<div class="strategy-master-stock-empty">No stored strategy result matches this stock. Run the relevant scanner to add it to the local database.</div>'
 : '<div class="strategy-master-stock-empty">Search a stock symbol to see every strategy result stored locally.</div>';
 return `<section class="strategy-master-stock-search">
 <div class="strategy-master-stock-heading">
 <strong>Search all stored strategies</strong>
 <small>Type a stock symbol. Keyboard shortcuts are paused while this field is active.</small>
 </div>
 <div class="strategy-master-stock-form" id="strategyMasterStockForm">
 <label for="strategyMasterStockInput">Stock symbol</label>
 <input id="strategyMasterStockInput" type="search" value="${labEsc(strategyLabMasterSearchQuery)}" placeholder="Search SBIN, RELIANCE, TCS..." autocomplete="off">
 <button type="button" class="bsm primary" id="btnStrategyMasterStockSearch">Search</button>
 </div>
 <div class="strategy-master-stock-results">${resultHtml}</div>
 </section>`;
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
 const contextMeta = strategyLabSnapshot?.current?.scanContextMeta || strategyLabSnapshot?.lastMainScanContextMeta || {};
 const unifiedStatus = strategyLabSnapshot?.current?.unifiedStatus || strategyLabSnapshot?.strategyLabUnifiedScanStatus || {};
 const isPartialContext = contextMeta.partial === true || unifiedStatus.partial === true;
 const scannedRows = Number(contextMeta.scannedRows || unifiedStatus.scannedRows || 0);
 const candidateRows = Number(contextMeta.candidateRows || unifiedStatus.candidateRows || 0);
 const contextProgress = candidateRows > 0 ? `${Math.min(scannedRows, candidateRows)}/${candidateRows}` : 'Waiting';
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
  const newCoinScalperCounts = status.eventCounts || {};
  const darvasCounts = status.eventCounts || {};
  const pullbackCounts = status.eventCounts || {};
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
 buildMetric('New Symbols', String(radarCounts.new_coin || 0), radarCounts.new_coin ? 'warn' : 'info'),
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
 : activeStrategyLabId === 'new_coin_scalper'
 ? [
 buildMetric('Active Strategy', strategy.displayName || 'New Coin Scalper', 'info'),
 buildMetric('Mode', 'Scanner only', 'warn'),
 buildMetric('OBV Confirmed', String(newCoinScalperCounts.obv_confirmed || 0), newCoinScalperCounts.obv_confirmed ? 'ok' : 'info'),
 buildMetric('Long Reclaim', String(newCoinScalperCounts.long_reclaim || 0), newCoinScalperCounts.long_reclaim ? 'ok' : 'info'),
 buildMetric('Short Fade', String(newCoinScalperCounts.short_fade || 0), newCoinScalperCounts.short_fade ? 'warn' : 'info'),
 buildMetric('Key Levels', String(newCoinScalperCounts.key_level_scalp || 0), newCoinScalperCounts.key_level_scalp ? 'warn' : 'info'),
 buildMetric('Trap Watch', String(newCoinScalperCounts.trap_watch || 0), newCoinScalperCounts.trap_watch ? 'warn' : 'info'),
 buildMetric('Best New Coin', best ? `${best.symbol} ${best.score}/100` : 'Waiting', best?.score >= 75 ? 'ok' : 'warn'),
 buildMetric('Last Scan', labAge(status.lastScanTs || status.ts), 'info'),
 ].join('')
 : activeStrategyLabId === 'darvas'
 ? [
 buildMetric('Active Strategy', strategy.displayName || 'Darvas Box Lab', 'info'),
 buildMetric('Mode', 'Scanner only', 'warn'),
 buildMetric('Breakout', String(darvasCounts.breakout || 0), darvasCounts.breakout ? 'ok' : 'info'),
 buildMetric('Near Top', String(darvasCounts.near_breakout || 0), darvasCounts.near_breakout ? 'warn' : 'info'),
 buildMetric('Base', String(darvasCounts.base || 0), darvasCounts.base ? 'warn' : 'info'),
 buildMetric('Failed', String(darvasCounts.failed_breakout || 0), darvasCounts.failed_breakout ? 'warn' : 'info'),
 buildMetric('Avoid', String(darvasCounts.avoid_box || 0), darvasCounts.avoid_box ? 'info' : 'ok'),
 buildMetric('Best Box', best ? `${best.symbol} ${best.score}/100` : 'Waiting', best?.score >= 75 ? 'ok' : 'warn'),
 buildMetric('Last Scan', labAge(status.lastScanTs || status.ts), 'info'),
 ].join('')
 : activeStrategyLabId === 'pullback'
 ? [
 buildMetric('Active Strategy', strategy.displayName || 'EMA Pullback Lab', 'info'),
 buildMetric('Mode', 'Scanner only', 'warn'),
 buildMetric('9 EMA Reclaim', String(pullbackCounts.ema_reclaim || 0), pullbackCounts.ema_reclaim ? 'ok' : 'info'),
 buildMetric('9 EMA Touch', String(pullbackCounts.ema_pullback || 0), pullbackCounts.ema_pullback ? 'warn' : 'info'),
 buildMetric('Round Support', String(pullbackCounts.round_support || 0), pullbackCounts.round_support ? 'ok' : 'info'),
 buildMetric('Trend Watch', String(pullbackCounts.trend_watch || 0), pullbackCounts.trend_watch ? 'warn' : 'info'),
 buildMetric('Avoid Chase', String(pullbackCounts.avoid_chase || 0), pullbackCounts.avoid_chase ? 'warn' : 'info'),
 buildMetric('Best Pullback', best ? `${best.symbol} ${best.score}/100` : 'Waiting', best?.score >= 75 ? 'ok' : 'warn'),
 buildMetric('Last Scan', labAge(status.lastScanTs || status.ts), 'info'),
 ].join('')
 : activeStrategyLabId === 'native_straddle'
 ? [
 buildMetric('Active Strategy', strategy.displayName || 'Native Straddle Scanner', 'info'),
 buildMetric('Mode', 'Notify only', 'warn'),
 buildMetric('Sell Premium', String(status.eventCounts?.sell_straddle || 0), status.eventCounts?.sell_straddle ? 'warn' : 'info'),
 buildMetric('Buy Vol', String(status.eventCounts?.buy_straddle || 0), status.eventCounts?.buy_straddle ? 'ok' : 'info'),
 buildMetric('Avoid', String(status.eventCounts?.avoid_straddle || 0), status.eventCounts?.avoid_straddle ? 'info' : 'ok'),
 buildMetric('Best MV', best ? `${best.raw?.underlying || best.symbol} ${best.score}/100` : 'Waiting', best?.score >= 68 ? 'ok' : 'warn'),
 buildMetric('Cache', '24h only', 'info'),
 buildMetric('Chart', '1D recent', 'info'),
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
 { label: 'Data state', value: isPartialContext ? `Partial ${contextProgress}` : (contextMeta.finishedAt ? 'Fresh full scan' : 'Waiting'), tone: isPartialContext ? 'warn' : (contextMeta.finishedAt ? 'ok' : 'info') },
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

 function labDirection(row = {}) {
  const raw = String(row.direction || row.raw?.direction || row.side || row.raw?.side || '').trim().toLowerCase();
  const signal = String(row.signal || '').trim().toUpperCase();
  const eventType = String(row.eventType || row.raw?.eventType || '').trim().toLowerCase();
  const action = String(row.actionLabel || row.raw?.actionLabel || row.setupLabel || '').trim().toLowerCase();
  const sourceRows = Array.isArray(row.raw?.sourceRows) ? row.raw.sourceRows : [];
  if (
   raw.includes('short') ||
   raw.includes('sell') ||
   signal === 'SELL' ||
   eventType.startsWith('sell_') ||
   eventType.includes('_short') ||
   eventType === 'pressure' ||
   action.includes('short')
  ) return 'short';
  if (
   raw.includes('long') ||
   raw.includes('buy') ||
   signal === 'BUY' ||
   eventType.startsWith('buy_') ||
   action.includes('buy') ||
   action.includes('long') ||
   (row.stage === 'STAGE_II' && signal !== 'IGNORE')
  ) return 'long';
  if (sourceRows.some(item => labDirection(item) === 'short')) return 'short';
  if (sourceRows.some(item => labDirection(item) === 'long')) return 'long';
  if (
   signal === 'WATCHLIST' &&
   ['breakout', 'ema_obv', 'new_coin', 'vwap', 'mean_reversion', 'reclaim', 'near_breakout', 'base', 'ema_reclaim', 'ema_pullback', 'round_support', 'trend_watch'].includes(eventType)
  ) return 'long';
  return '';
 }

 function labDirectionBadge(row = {}) {
  const direction = labDirection(row);
  if (!direction) return '';
  return `<b class="strategy-direction-badge ${labEsc(direction)}">${direction === 'short' ? 'SHORT' : 'LONG'}</b>`;
 }

 function labDirectionClass(row = {}) {
  const direction = labDirection(row);
  return direction ? `dir-${direction}` : '';
 }

 function labSymbolWithDirection(row = {}, fallbackSymbol = '') {
  const symbol = fallbackSymbol || row.symbol || row.raw?.underlying || '--';
  return `${labEsc(symbol)}${labDirectionBadge(row)}`;
 }

 function rowTone(row = {}) {
  if (labRowIsStale(row) || row.checks?.staleSource || Number(row.raw?.freshness?.staleCount || 0) > 0) return 'ignore';
  if (row.checks?.mixedConflict || row.raw?.consensus?.mixedConflict) return 'ignore';
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
  if (activeStrategyLabId === 'new_coin_scalper') {
   const eventType = String(row.eventType || row.raw?.eventType || '');
   if (eventType === 'obv_confirmed' || row.signal === 'BUY') return 'buy';
   if (eventType === 'short_fade' || row.signal === 'SELL') return 'developing';
   if (eventType === 'long_reclaim' || eventType === 'key_level_scalp') return 'watch';
   if (eventType === 'trap_watch' || row.signal === 'IGNORE') return 'ignore';
   if (Number(row.score || 0) >= 75) return 'good';
   return 'watch';
  }
  if (activeStrategyLabId === 'darvas') {
   const eventType = String(row.eventType || row.raw?.eventType || '');
   if (eventType === 'breakout' || row.signal === 'BUY') return 'buy';
   if (eventType === 'near_breakout') return 'good';
   if (eventType === 'base') return 'watch';
   if (eventType === 'failed_breakout' || eventType === 'avoid_box' || row.signal === 'IGNORE') return 'ignore';
   if (Number(row.score || 0) >= 75) return 'good';
   return 'watch';
  }
  if (activeStrategyLabId === 'pullback') {
   const eventType = String(row.eventType || row.raw?.eventType || '');
   if (labDirection(row) === 'short') {
    if (eventType === 'ema_reject_short' || eventType === 'round_resistance_short' || row.signal === 'SELL') return 'short';
    if (eventType === 'ema_pullback_short') return 'short-watch';
    if (eventType === 'trend_watch_short') return 'watch';
   }
   if (eventType === 'ema_reclaim' || eventType === 'round_support' || row.signal === 'BUY') return 'buy';
   if (eventType === 'ema_pullback') return 'good';
   if (eventType === 'trend_watch') return 'watch';
   if (eventType === 'avoid_chase' || row.signal === 'IGNORE') return 'ignore';
   if (Number(row.score || 0) >= 75) return 'good';
   return 'watch';
  }
  if (activeStrategyLabId === 'native_straddle') {
   const eventType = String(row.eventType || row.raw?.eventType || '');
   if (eventType === 'buy_straddle' || row.signal === 'BUY') return 'buy';
   if (eventType === 'sell_straddle' || row.signal === 'SELL') return 'developing';
   if (eventType === 'avoid_straddle' || row.signal === 'IGNORE') return 'ignore';
   return Number(row.score || 0) >= 68 ? 'good' : 'watch';
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
  if (labRowIsStale(row) || row.checks?.staleSource || Number(row.raw?.freshness?.staleCount || 0) > 0) return 'Stale';
  if (row.checks?.mixedConflict || row.raw?.consensus?.mixedConflict) return 'Conflict';
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
  if (activeStrategyLabId === 'new_coin_scalper') return row.raw?.eventLabel || row.setupLabel || row.eventType || '--';
  if (activeStrategyLabId === 'darvas') return row.raw?.eventLabel || row.setupLabel || row.eventType || '--';
  if (activeStrategyLabId === 'pullback') {
   const direction = labDirection(row);
   const dir = direction === 'short' ? 'Short' : direction === 'long' ? 'Long' : '';
   return `${dir ? `${dir} ` : ''}${row.raw?.eventLabel || row.setupLabel || row.eventType || '--'}`;
  }
  if (activeStrategyLabId === 'native_straddle') return row.actionLabel || row.raw?.eventLabel || row.setupLabel || row.eventType || '--';
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
 return `<tr class="strategy-lab-row ${tone} ${labDirectionClass(row)} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
 <td><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(row.stageLabel || '')}</small></td>
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
  return `<tr class="strategy-lab-row radar ${tone} ${labDirectionClass(row)} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
 <td><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(row.raw?.isFirstSeenNew || row.raw?.isShortHistory ? 'New / short history' : row.setupLabel || '')}</small></td>
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
 : 'Wait';
 return `<tr class="strategy-lab-row reversal ${tone} ${labDirectionClass(row)} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
<td><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(row.setupLabel || '')}</small></td>
<td>${labEsc(move)}</td>
<td><span class="strategy-signal ${tone}"${labHelpAttrs(row.eventType || row.raw?.eventType || rowSignalLabel(row), 'reversal', true)}>${labEsc(rowSignalLabel(row))}</span></td>
<td>${labEsc(stretch)}</td>
<td>${labEsc(balance)}</td>
<td>${labEsc(trigger)}<small>${labEsc(raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x volume` : 'volume --')}</small></td>
<td>${labEsc(row.actionLabel || '--')}<small>${labEsc(labPriorityLabel(row))}</small></td>
<td>${labFmt(row.score, 0)}</td>
</tr>`;
}

function buildNewCoinScalperRow(row = {}) {
 const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
 const tone = rowTone(row);
 const raw = row.raw || {};
 const move = labPct(raw.move4hChart ?? raw.move4h, 1);
 const obv = row.checks?.obvConfirmed ? 'OBV confirmed' : row.checks?.obvUp ? 'OBV up' : row.checks?.obvDown ? 'OBV down' : 'OBV flat';
 const levels = raw.keyLevels || {};
 const level = labDirection(row) === 'short'
 ? `R ${labPrice(levels.resistance4h || row.targets?.resistance4h)}`
 : `S ${labPrice(levels.support4h || row.targets?.support4h)}`;
 const context = [
 raw.newCoinSource || 'Delta new',
 raw.eligibilityLabel || '',
 row.checks?.fourHourBull ? '4H bull' : row.checks?.fourHourBear ? '4H bear' : '4H mixed',
  raw.candleCount4h ? `${raw.candleCount4h}x4H` : '4H --',
 ].filter(Boolean).join(' | ');
 return `<tr class="strategy-lab-row new-coin-scalper ${tone} ${labDirectionClass(row)} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
<td><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(raw.newCoinSource || (raw.isNewDailyHistory ? `Daily ${raw.candleCount1d || 0}/${raw.maxDailyCandlesForNewCoin || 15}` : row.setupLabel || ''))}</small></td>
<td>${labEsc(move)}</td>
<td><span class="strategy-signal ${tone}"${labHelpAttrs(row.eventType || row.raw?.eventType || rowSignalLabel(row), 'new_coin_scalper', true)}>${labEsc(rowSignalLabel(row))}</span></td>
<td>${labEsc(obv)}<small>${labEsc(raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x volume` : 'volume --')}</small></td>
<td>${labEsc(level)}<small>VWAP ${labPrice(raw.vwap || row.targets?.vwap)}</small></td>
<td>${labEsc(context)}</td>
<td>${labEsc(row.actionLabel || '--')}<small>${labEsc(labPriorityLabel(row))}</small></td>
<td>${labFmt(row.score, 0)}</td>
</tr>`;
}

function buildDarvasRow(row = {}) {
 const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
 const tone = rowTone(row);
 const raw = row.raw || {};
 const box = raw.boxTop && raw.boxBottom ? `${labPrice(raw.boxBottom)} - ${labPrice(raw.boxTop)}` : '--';
 const proximity = Number.isFinite(Number(raw.nearTopPct)) ? `${labFmt(raw.nearTopPct, 2)}%` : '--';
 const volume = raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x` : '--';
 return `<tr class="strategy-lab-row darvas ${tone} ${labDirectionClass(row)} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
<td><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(row.setupLabel || '')}</small></td>
<td><span class="strategy-signal ${tone}"${labHelpAttrs(row.eventType || row.raw?.eventType || rowSignalLabel(row), 'darvas', true)}>${labEsc(rowSignalLabel(row))}</span></td>
<td>${labEsc(row.actionLabel || '--')}<small>${labEsc(labPriorityLabel(row))}</small></td>
<td>${labEsc(box)}<small>${labEsc(raw.boxHeightPct ? `${labFmt(raw.boxHeightPct, 2)}% box` : 'box --')}</small></td>
<td>${labPrice(raw.boxTop || row.triggerPrice)}</td>
<td>${labEsc(proximity)}</td>
<td>${labEsc(volume)}<small>${labEsc(raw.latestQuoteVolume ? `$${labFmt(raw.latestQuoteVolume, 0)}` : '--')}</small></td>
<td>${labPrice(row.stop || raw.boxBottom)}</td>
<td>${labFmt(row.score, 0)}</td>
</tr>`;
}

function buildPullbackRow(row = {}) {
 const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
 const tone = rowTone(row);
 const raw = row.raw || {};
 const timing = raw.timing || {};
 const market = raw.marketRegime || {};
 const plan = raw.tradePlan || {};
 const emaRead = [
 raw.ema9 ? `9 ${labPrice(raw.ema9)}` : '9 --',
 raw.ema21 ? `21 ${labPrice(raw.ema21)}` : '21 --',
 ].join(' | ');
 const entryRead = `${labPrice(raw.bestEntry || row.entry)} / ${labPrice(row.stop || raw.stop)}`;
 const extension = Number.isFinite(Number(raw.extensionPct)) ? `${labPct(raw.extensionPct, 2)} / ${labFmt(raw.extensionAtr || 0, 2)} ATR` : '--';
 const reward = raw.rrToTarget1 ? `${labFmt(raw.rrToTarget1, 2)}R` : '--';
 const touch = raw.touchAge == null ? 'No touch' : raw.touchAge === 0 ? 'Today' : `${labFmt(raw.touchAge, 0)}d ago`;
 const triggerRead = timing.label || raw.workflowLabel || '--';
 const triggerSmall = timing.ready
 ? (timing.confirmations?.[0] || '4H confirmed')
 : (timing.blockers?.[0] || market.label || 'wait');
 return `<tr class="strategy-lab-row pullback ${tone} ${labDirectionClass(row)} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
<td><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(row.setupLabel || '')}</small></td>
<td><span class="strategy-signal ${tone}"${labHelpAttrs(row.eventType || row.raw?.eventType || rowSignalLabel(row), 'pullback', true)}>${labEsc(rowSignalLabel(row))}</span></td>
<td>${labEsc(plan.entryCommand || row.actionLabel || '--')}<small>${labEsc(raw.workflowLabel || labPriorityLabel(row))}</small></td>
<td>${labEsc(emaRead)}<small>${labEsc(`${touch} | ${market.state === 'against' ? 'market against' : market.state === 'aligned' ? 'market aligned' : 'market neutral'}`)}</small></td>
<td>${labEsc(entryRead)}<small>Entry / Stop</small></td>
<td>${labEsc(extension)}<small>${labEsc(raw.roundSupport ? `Support ${labPrice(raw.roundSupport)}` : 'Support --')}</small></td>
<td>${labEsc(reward)}<small>${labEsc(raw.previousHigh ? `Prev high ${labPrice(raw.previousHigh)}` : 'Target --')}</small></td>
<td>${labEsc(triggerRead)}<small>${labEsc(triggerSmall)}</small></td>
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
 return `<tr class="strategy-lab-row early ${tone} ${labDirectionClass(row)} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
<td><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(sourceText)}</small></td>
<td><span class="strategy-signal ${tone}"${labHelpAttrs(raw.earlyType || 'early', 'early', true)}>${labEsc(rowSignalLabel(row))}</span></td>
<td>${labFmt(row.score, 0)}<small>${labEsc(row.priorityLabel || '')}</small></td>
<td>${labEsc(confirmText)}</td>
<td>${labEsc(rejectText)}</td>
<td>${labPrice(levels.trigger || row.triggerPrice || row.entry)}</td>
<td>${labPrice(levels.stop || row.stop)}</td>
<td><button type="button" class="strategy-row-chart-btn" data-strategy-chart-review="${labEsc(row.symbol)}">Chart</button></td>
</tr>`;
}

function buildNativeStraddleRow(row = {}) {
 const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
 const tone = rowTone(row);
 const raw = row.raw || {};
 const market = raw.marketContext || {};
 const premiumRead = raw.premiumRead || {};
 const quote = raw.bid && raw.ask ? `${labFmt(raw.bid, 2)} / ${labFmt(raw.ask, 2)}` : '--';
 const premium = raw.premiumPerContract ? `$${labFmt(raw.premiumPerContract, 2)}` : labPrice(row.entry);
 const expiry = raw.daysToExpiry < 1 ? `${labFmt(Math.max(0, Number(raw.daysToExpiry || 0)) * 24, 1)}h` : `${labFmt(raw.daysToExpiry, 1)}d`;
 return `<tr class="strategy-lab-row native-straddle ${tone} ${labDirectionClass(row)} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
<td><strong>${labSymbolWithDirection(row, raw.underlying || row.symbol)}</strong><small>${labEsc(row.symbol)}</small></td>
<td><span class="strategy-signal ${tone}"${labHelpAttrs(row.eventType || row.raw?.eventType || rowSignalLabel(row), 'native_straddle', true)}>${labEsc(rowSignalLabel(row))}</span></td>
<td>${labEsc(row.actionLabel || '--')}<small>${labEsc(labPriorityLabel(row))}</small></td>
<td>${labPrice(raw.strike)}<small>Spot ${labPrice(raw.underlyingPrice || row.targets?.underlyingPrice)}</small></td>
<td>${labEsc(premium)}<small>${labEsc(quote)}</small></td>
<td>${labEsc(expiry)}<small>${labEsc(raw.expiryLabel || raw.expiryKey || '--')}</small></td>
<td>${labFmt(raw.spreadPct, 2)}%<small>OI ${labFmt(raw.openInterest, 0)} | Vol ${labFmt(raw.volume, 0)}</small></td>
<td>${labFmt(market.sellPremiumScore, 0)}<small>${labEsc(market.label || 'Market')}</small></td>
<td>${labEsc(premiumRead.trendState || '--')}<small>${labFmt(premiumRead.move2h, 1)}% 2h</small></td>
<td><button type="button" class="strategy-row-chart-btn" data-strategy-chart-review="${labEsc(row.symbol)}">1D Chart</button></td>
</tr>`;
}

function buildStrategyRow(row = {}) {
  if (activeStrategyLabId === 'early') return buildEarlyRow(row);
  if (activeStrategyLabId === 'stage') return buildStageRow(row);
  if (activeStrategyLabId === 'radar') return buildRadarRow(row);
  if (activeStrategyLabId === 'reversal') return buildReversalRow(row);
  if (activeStrategyLabId === 'new_coin_scalper') return buildNewCoinScalperRow(row);
  if (activeStrategyLabId === 'darvas') return buildDarvasRow(row);
  if (activeStrategyLabId === 'pullback') return buildPullbackRow(row);
  if (activeStrategyLabId === 'native_straddle') return buildNativeStraddleRow(row);
  const selected = selectedStrategySymbol === row.symbol ? 'selected' : '';
 const tone = rowTone(row);
 const rs = row.raw?.rsScore ?? row.rsScore ?? '--';
 const pivot = row.raw?.pivotPrice ? labFmt(row.raw.pivotPrice, 4) : '--';
 const risk = row.riskPercent ? `${labFmt(row.riskPercent, 2)}%` : '--';
 const action = row.actionLabel || (row.signal === 'BUY' ? 'Buy now' : row.signal === 'WATCHLIST' ? 'Wait' : row.signal === 'SELL' ? 'Short watch' : 'Ignore');
 return `<tr class="strategy-lab-row ${tone} ${labDirectionClass(row)} ${selected}" data-strategy-symbol="${labEsc(row.symbol)}">
 <td><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(row.setupLabel || '')}</small></td>
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
 skipped.insufficientIntraday ? `${skipped.insufficientIntraday} short 4H history` : '',
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
skipped.insufficientHistory ? `${skipped.insufficientHistory} short 4H history` : '',
skipped.reviewOnly ? `${skipped.reviewOnly} review-only rows` : '',
skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
].filter(Boolean).join(', ')}.`
: '';
const darvasEmptyNote = activeStrategyLabId === 'darvas' && (skipped.insufficientHistory || skipped.fetchErrors || skipped.reviewOnly)
? `No rows in this view. Diagnostics: ${[
skipped.insufficientHistory ? `${skipped.insufficientHistory} short 1D history` : '',
skipped.reviewOnly ? `${skipped.reviewOnly} review-only boxes` : '',
skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
].filter(Boolean).join(', ')}.`
: '';
const pullbackEmptyNote = activeStrategyLabId === 'pullback' && (skipped.insufficientHistory || skipped.fetchErrors || skipped.reviewOnly)
? `No rows in this view. Diagnostics: ${[
skipped.insufficientHistory ? `${skipped.insufficientHistory} short 1D history` : '',
skipped.reviewOnly ? `${skipped.reviewOnly} review-only pullbacks` : '',
skipped.fetchErrors ? `${skipped.fetchErrors} data errors` : '',
].filter(Boolean).join(', ')}.`
: '';
const copy = radarEmptyNote || stageEmptyNote || reversalEmptyNote || darvasEmptyNote || pullbackEmptyNote || (activeStrategyLabId === 'current'
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
 : activeStrategyLabId === 'darvas'
 ? '<thead><tr><th>Coin</th><th>Event</th><th>Action</th><th>Box</th><th>Top</th><th>To Top</th><th>Volume</th><th>Invalid</th><th>Score</th></tr></thead>'
 : activeStrategyLabId === 'pullback'
 ? '<thead><tr><th>Coin</th><th>Event</th><th>Action</th><th>EMA Read</th><th>Entry / Stop</th><th>Distance</th><th>Reward</th><th>4H Trigger</th><th>Score</th></tr></thead>'
 : activeStrategyLabId === 'native_straddle'
 ? '<thead><tr><th>Underlying</th><th>Signal</th><th>Action</th><th>Strike</th><th>Premium</th><th>Expiry</th><th>Spread</th><th>Market</th><th>MV 4H</th><th>Chart</th></tr></thead>'
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

 function buildRuleEvidence(row = {}) {
 const test = row.raw?.ruleEvidence || {};
 return `<div class="strategy-report-block">
 <div class="strategy-report-title">Rule Evidence</div>
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
 return `<aside class="strategy-lab-detail ${labDirectionClass(row)}">
 <div class="strategy-detail-head">
 <div><span>Stage Scanner</span><strong>${labSymbolWithDirection(row)}</strong></div>
 <em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
 </div>
 <div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Trend 1D</button><button type="button" data-strategy-entry-chart="${labEsc(row.symbol)}">Entry 4H</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
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
 ${buildRuleEvidence(row)}
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
 return `<aside class="strategy-lab-detail ${labDirectionClass(row)}">
 <div class="strategy-detail-head">
 <div><span>${labEsc(getStrategyMeta(row.strategyId || activeStrategyLabId)?.displayName || 'Current Strategy')}</span><strong>${labSymbolWithDirection(row)}</strong></div>
 <em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
 </div>
 <div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Trend 1D</button><button type="button" data-strategy-entry-chart="${labEsc(row.symbol)}">Entry 4H</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
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
 ${buildRuleEvidence(row)}
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
  return `<aside class="strategy-lab-detail radar-detail ${labDirectionClass(row)}">
 <div class="strategy-detail-head">
 <div><span>Live Radar</span><strong>${labSymbolWithDirection(row)}</strong></div>
 <em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
 </div>
 <div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Trend 1D</button><button type="button" data-strategy-entry-chart="${labEsc(row.symbol)}">Entry 4H</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
 ${buildPlainHelpPanel(row)}
 <div class="strategy-detail-grid">
 <div><span>Entry</span><strong>${labPrice(row.entry || raw.latestPrice)}</strong></div>
 <div><span>Stop</span><strong>${labPrice(row.stop)}</strong></div>
 <div><span>Target 1</span><strong>${labPrice(row.targets?.target2R || row.targets?.target1)}</strong></div>
 <div><span>Target 2</span><strong>${labPrice(row.targets?.target3R)}</strong></div>
 <div><span>24H / 4H</span><strong>${labPct(raw.change24h, 1)} / ${labPct(raw.move4h, 1)}</strong></div>
 <div><span>Volume</span><strong>${raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x` : '--'}</strong></div>
 <div><span>VWAP</span><strong>${labPrice(raw.vwap)}</strong></div>
 <div><span>ATR</span><strong>${labPrice(raw.atr14)}</strong></div>
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
<div><span>4H candles</span><strong>${labEsc(raw.candleCount4h || 0)}</strong></div>
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
  return '<aside class="strategy-lab-detail reversal-detail"><div class="strategy-detail-empty">Select a reversal row to inspect stretch, VWAP distance, RSI, failed break, volume climax, and scanner-only fade action.</div></aside>';
 }
 const raw = row.raw || {};
 const checks = row.checks || {};
 const reasons = (row.reasons || []).slice(0, 9).map(reason => `<li>${labEsc(reason)}</li>`).join('');
 const riskFlags = Array.isArray(row.riskFlags) && row.riskFlags.length ? row.riskFlags : Array.isArray(raw.riskFlags) ? raw.riskFlags : [];
 const scoreParts = raw.scoreParts || {};
 const scoreRows = Array.isArray(scoreParts.rows) ? scoreParts.rows : [];
 const side = String(row.direction || '').includes('short') || row.signal === 'SELL' ? 'Short fade' : String(row.direction || '').includes('long') || row.signal === 'BUY' ? 'Long bounce' : 'Watch only';
 return `<aside class="strategy-lab-detail reversal-detail ${labDirectionClass(row)}">
<div class="strategy-detail-head">
<div><span>Reversal Lab</span><strong>${labSymbolWithDirection(row)}</strong></div>
<em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
</div>
<div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Trend 1D</button><button type="button" data-strategy-entry-chart="${labEsc(row.symbol)}">Entry 4H</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
${buildPlainHelpPanel(row)}
<div class="strategy-detail-grid">
<div><span>Entry</span><strong>${labPrice(row.entry || raw.latestPrice)}</strong></div>
<div><span>Stop</span><strong>${labPrice(row.stop)}</strong></div>
<div><span>VWAP Target</span><strong>${labPrice(row.targets?.vwap || row.targets?.target1)}</strong></div>
<div><span>Range Mid</span><strong>${labPrice(row.targets?.rangeMid || raw.rangeMid)}</strong></div>
<div><span>RSI / Z</span><strong>${labFmt(raw.rsi14, 1)} / ${labFmt(raw.zScore, 2)}</strong></div>
<div><span>VWAP Gap</span><strong>${labPct(raw.vwapDistancePct, 2)}</strong></div>
<div><span>24H / 4H</span><strong>${labPct(raw.change24h, 1)} / ${labPct(raw.move4h, 1)}</strong></div>
<div><span>Volume Ratio</span><strong>${raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x` : '--'}</strong></div>
</div>
<div class="strategy-checks">
${buildCheck('Upside stretch present', checks.stretchedUp)}
${buildCheck('Downside stretch present', checks.stretchedDown)}
${buildCheck('Failed high / back inside range', checks.closeBackInsideHigh)}
${buildCheck('Failed low / reclaim inside range', checks.closeBackInsideLow)}
${buildCheck('Volume climax', checks.volumeClimax)}
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
<div><span>4H / 1D</span><strong>${labEsc(raw.candleCount4h || 0)} / ${labEsc(raw.candleCount1d || 0)}</strong></div>
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

function buildNewCoinScalperDetail(row = null) {
 if (!row) {
  return '<aside class="strategy-lab-detail new-coin-scalper-detail"><div class="strategy-detail-empty">Select a New Coin Scalper row to inspect 4H trigger, daily context, OBV, VWAP, and key levels.</div></aside>';
 }
 const raw = row.raw || {};
 const checks = row.checks || {};
 const levels = raw.keyLevels || {};
 const reasons = (row.reasons || []).slice(0, 9).map(reason => `<li>${labEsc(reason)}</li>`).join('');
 const riskFlags = Array.isArray(row.riskFlags) && row.riskFlags.length ? row.riskFlags : Array.isArray(raw.riskFlags) ? raw.riskFlags : [];
 const scoreRows = Array.isArray(raw.scoreParts?.rows) ? raw.scoreParts.rows : [];
 return `<aside class="strategy-lab-detail new-coin-scalper-detail ${labDirectionClass(row)}">
<div class="strategy-detail-head">
<div><span>New Coin Scalper</span><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(row.setupLabel || row.eventType || '')}</small></div>
<em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
</div>
<div class="strategy-detail-actions"><button type="button" data-new-coin-scalper-chart-draft="${labEsc(row.symbol)}">Open 4H chart</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
${buildPlainHelpPanel(row)}
<div class="strategy-detail-grid">
<div><span>Entry</span><strong>${labPrice(row.entry || raw.latestPrice)}</strong></div>
<div><span>Trigger</span><strong>${labPrice(row.triggerPrice || levels.trigger)}</strong></div>
<div><span>Stop</span><strong>${labPrice(row.stop || levels.stop)}</strong></div>
<div><span>Target 1</span><strong>${labPrice(row.targets?.target1 || levels.target1)}</strong></div>
<div><span>VWAP</span><strong>${labPrice(raw.vwap || levels.vwap)}</strong></div>
<div><span>VWAP Gap</span><strong>${labPct(raw.vwapDistancePct, 2)}</strong></div>
<div><span>4H Move</span><strong>${labPct(raw.move4hChart ?? raw.move4h, 1)}</strong></div>
<div><span>4H Candles</span><strong>${labEsc(raw.candleCount4h || 0)}</strong></div>
<div><span>New Source</span><strong>${labEsc(raw.newCoinSource || 'Manual')}</strong></div>
<div><span>Eligibility</span><strong>${labEsc(raw.eligibilityLabel || 'Manual review')}</strong></div>
</div>
<div class="strategy-checks">
${buildCheck('Market-data new symbol signal', raw.isDeltaNewCoin)}
${buildCheck('Trading status confirmed', raw.eligibleForTrading)}
${buildCheck('Daily history <= 15 candles', raw.isNewDailyHistory)}
${buildCheck('4H long trigger', checks.longTrigger)}
${buildCheck('4H short trigger', checks.shortTrigger)}
${buildCheck('OBV confirmed', checks.obvConfirmed)}
${buildCheck('VWAP reclaim/reject', checks.vwapReclaim || checks.vwapReject)}
${buildCheck('Near 4H key level', checks.near4hHigh || checks.near4hLow)}
${buildCheck('4H context aligned', labDirection(row) === 'short' ? checks.fourHourBear : checks.fourHourBull)}
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Scalp Key Levels</div>
<div class="strategy-mini-grid">
<div><span>4H Support</span><strong>${labPrice(levels.support4h || row.targets?.support4h)}</strong></div>
<div><span>4H Resistance</span><strong>${labPrice(levels.resistance4h || row.targets?.resistance4h)}</strong></div>
<div><span>4H Mid</span><strong>${labPrice(levels.mid4h)}</strong></div>
</div>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">OBV And Reversal Read</div>
<div class="strategy-mini-grid">
<div><span>OBV Slope</span><strong>${labFmt(raw.obvSlope, 0)}</strong><small>${checks.obvUp ? 'Up' : checks.obvDown ? 'Down' : 'Flat'}</small></div>
<div><span>RSI / Z</span><strong>${labFmt(raw.rsi14, 1)} / ${labFmt(raw.zScore, 2)}</strong></div>
<div><span>Volume</span><strong>${raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x` : '--'}</strong></div>
<div><span>4H EMA</span><strong>${labPrice(raw.ema4h9)} / ${labPrice(raw.ema4h21)}</strong></div>
</div>
</div>
<div class="strategy-detail-notes">
<div class="strategy-detail-label">Scanner Notes</div>
<ul>${reasons || '<li>No scanner notes available yet.</li>'}</ul>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Score Explanation</div>
<div class="strategy-score-stack">
${scoreRows.length ? scoreRows.map(item => `<div><span>${labEsc(item.label)}</span><strong class="${Number(item.value || 0) < 0 ? 'loss' : 'good'}">${Number(item.value || 0) > 0 ? '+' : ''}${labFmt(item.value, 0)}</strong></div>`).join('') : '<p>No score breakdown available yet.</p>'}
</div>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Risk Notes</div>
<p>${labEsc(riskFlags.length ? riskFlags.join(' | ') : 'No major risk note recorded. Scanner-only, verify the 4H and Daily chart manually.')}</p>
</div>
${buildDecisionNotes(row)}
<div class="strategy-report-block">
<div class="strategy-report-title">Chart Draft</div>
<button type="button" class="strategy-chart-draft-btn" data-new-coin-scalper-chart-draft="${labEsc(row.symbol)}">Open Chart With Scalper Draft</button>
<p>Loads entry, stop, VWAP, and 4H key levels as review context. It does not place an order.</p>
</div>
${buildAlertControls(row)}
</aside>`;
}

function buildDarvasDetail(row = null) {
 if (!row) {
  return '<aside class="strategy-lab-detail darvas-detail"><div class="strategy-detail-empty">Select a Darvas row to inspect box top, box bottom, volume confirmation, failed-breakout risk, and scanner-only action.</div></aside>';
 }
 const raw = row.raw || {};
 const checks = row.checks || {};
 const reasons = (row.reasons || []).slice(0, 9).map(reason => `<li>${labEsc(reason)}</li>`).join('');
 const riskFlags = Array.isArray(row.riskFlags) && row.riskFlags.length ? row.riskFlags : Array.isArray(raw.riskFlags) ? raw.riskFlags : [];
 const scoreParts = raw.scoreParts || {};
 const scoreRows = Array.isArray(scoreParts.rows) ? scoreParts.rows : [];
 return `<aside class="strategy-lab-detail darvas-detail ${labDirectionClass(row)}">
<div class="strategy-detail-head">
<div><span>Darvas Box Lab</span><strong>${labSymbolWithDirection(row)}</strong></div>
<em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
</div>
<div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Trend 1D</button><button type="button" data-strategy-entry-chart="${labEsc(row.symbol)}">Entry 4H</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
${buildPlainHelpPanel(row)}
<div class="strategy-detail-grid">
<div><span>Entry</span><strong>${labPrice(row.entry || raw.latestPrice)}</strong></div>
<div><span>Box Top</span><strong>${labPrice(raw.boxTop || row.triggerPrice)}</strong></div>
<div><span>Box Bottom</span><strong>${labPrice(raw.boxBottom || row.stop)}</strong></div>
<div><span>Stop</span><strong>${labPrice(row.stop || raw.boxBottom)}</strong></div>
<div><span>Target 1</span><strong>${labPrice(row.targets?.target1 || row.targets?.target2R)}</strong></div>
<div><span>Target 2</span><strong>${labPrice(row.targets?.target3R)}</strong></div>
<div><span>Box Height</span><strong>${labPct(raw.boxHeightPct, 2)}</strong></div>
<div><span>Volume</span><strong>${raw.volumeRatio ? `${labFmt(raw.volumeRatio, 2)}x` : '--'}</strong></div>
</div>
<div class="strategy-checks">
${buildCheck('Trend stack supports momentum', checks.trendUp)}
${buildCheck('Box is tight enough', checks.tightEnough)}
${buildCheck('Price near box top', checks.nearBreakout || checks.breakout)}
${buildCheck('Breakout confirmed', checks.breakout)}
${buildCheck('Volume confirmed', checks.volumeConfirmed)}
${buildCheck('Base respected', checks.base)}
${buildCheck('No failed breakout', !checks.failedBreakout)}
${buildCheck('Liquidity acceptable', !checks.lowLiquidity)}
</div>
<div class="strategy-detail-notes">
<div class="strategy-detail-label">Darvas Notes</div>
<ul>${reasons || '<li>No Darvas box notes available yet.</li>'}</ul>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Score Explanation</div>
<div class="strategy-score-stack">
${scoreRows.length ? scoreRows.map(item => `<div><span>${labEsc(item.label)}</span><strong class="${Number(item.value || 0) < 0 ? 'loss' : 'good'}">${Number(item.value || 0) > 0 ? '+' : ''}${labFmt(item.value, 0)}</strong></div>`).join('') : '<p>No score breakdown available yet.</p>'}
</div>
</div>
<details class="strategy-formula-detail">
<summary>Darvas data</summary>
<div class="strategy-detail-grid">
<div><span>EMA 20</span><strong>${labPrice(raw.ema20)}</strong></div>
<div><span>EMA 50</span><strong>${labPrice(raw.ema50)}</strong></div>
<div><span>EMA 100</span><strong>${labPrice(raw.ema100)}</strong></div>
<div><span>ATR14</span><strong>${labPrice(raw.atr14)}</strong></div>
<div><span>To Box Top</span><strong>${labPct(raw.nearTopPct, 2)}</strong></div>
<div><span>Inside Box</span><strong>${labPct(raw.closesInsidePct, 1)}</strong></div>
<div><span>24H / 4H</span><strong>${labPct(raw.change24h, 1)} / ${labPct(raw.move4h, 1)}</strong></div>
<div><span>4H / 1D</span><strong>${labEsc(raw.candleCount4h || 0)} / ${labEsc(raw.candleCount1d || 0)}</strong></div>
</div>
</details>
<div class="strategy-report-block">
<div class="strategy-report-title">Risk Flags</div>
<p>${labEsc(riskFlags.length ? riskFlags.join(' | ') : 'No major risk flag recorded. Scanner-only, confirm breakout manually before action.')}</p>
</div>
${buildDecisionNotes(row)}
<div class="strategy-report-block">
<div class="strategy-report-title">Chart Draft</div>
<button type="button" class="strategy-chart-draft-btn" data-darvas-chart-draft="${labEsc(row.symbol)}">Open Chart With Darvas Box</button>
<p>Loads box top, box bottom, entry, and targets as chart context. It does not place an order.</p>
</div>
${buildAlertControls(row)}
</aside>`;
}

function buildPullbackDetail(row = null) {
 if (!row) {
  return '<aside class="strategy-lab-detail pullback-detail"><div class="strategy-detail-empty">Select a pullback row to inspect 9 EMA touch, reclaim proof, round support, extension, stop, and reward.</div></aside>';
 }
 const raw = row.raw || {};
 const timing = raw.timing || {};
 const market = raw.marketRegime || {};
 const plan = raw.tradePlan || {};
 const dailyProof = raw.dailyProof || {};
 const reasons = (Array.isArray(row.reasons) ? row.reasons : []).slice(0, 8).map(item => `<li>${labEsc(item)}</li>`).join('');
 const scoreRows = Array.isArray(raw.scoreParts?.rows) ? raw.scoreParts.rows : [];
 const levels = raw.chartLevels || {};
 const direction = labDirection(row);
 const isShort = direction === 'short';
 return `<aside class="strategy-lab-detail pullback-detail ${labDirectionClass(row)}">
<div class="strategy-detail-head">
<div><span>EMA Pullback Lab</span><strong>${labSymbolWithDirection(row)}</strong><small>${labEsc(row.setupLabel || row.eventType || '')}</small></div>
<span class="strategy-score">${labFmt(row.score, 0)}</span>
</div>
${buildPlainHelpPanel(row)}
<div class="strategy-report-block">
<div class="strategy-report-title">Trade Plan</div>
<div class="strategy-mini-grid">
<div><span>State</span><strong>${labEsc(raw.workflowLabel || plan.label || '--')}</strong><small>${labEsc(row.priorityLabel || '')}</small></div>
<div><span>Trigger</span><strong>${labPrice(plan.trigger || levels.trigger || row.triggerPrice)}</strong><small>${labEsc(timing.label || '--')}</small></div>
<div><span>Action</span><strong>${labEsc(plan.entryCommand || row.actionLabel || '--')}</strong></div>
<div><span>Invalid</span><strong>${labEsc(plan.invalidation || (isShort ? 'Above stop' : 'Below stop'))}</strong></div>
<div><span>Target 1</span><strong>${labPrice(plan.target || levels.target1 || row.targets?.target1)}</strong></div>
<div><span>Fresh Entry</span><strong>${plan.entryFresh ? 'Yes' : 'No'}</strong><small>${plan.lateEntry ? 'Late chase risk' : 'Distance acceptable'}</small></div>
</div>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Best Entry Read</div>
<div class="strategy-mini-grid">
<div><span>Ideal 9 EMA</span><strong>${labPrice(raw.idealPullback || raw.ema9)}</strong><small>${labEsc(raw.touchAge == null ? 'No recent touch' : raw.touchAge === 0 ? 'Touched today' : `Touched ${labFmt(raw.touchAge, 0)}d ago`)}</small></div>
<div><span>Entry</span><strong>${labPrice(raw.bestEntry || row.entry)}</strong><small>${labEsc(row.actionLabel || '--')}</small></div>
<div><span>Stop</span><strong>${labPrice(row.stop || raw.stop)}</strong><small>${isShort ? 'Above pullback high' : 'Below pullback low'}</small></div>
<div><span>Extension</span><strong>${labPct(raw.extensionPct, 2)}</strong><small>${isShort ? 'Below 9 EMA' : 'Above 9 EMA'}</small></div>
<div><span>Reward</span><strong>${raw.rrToTarget1 ? `${labFmt(raw.rrToTarget1, 2)}R` : '--'}</strong><small>${isShort ? 'To previous low / 2R' : 'To previous high / 2R'}</small></div>
<div><span>${isShort ? 'Round Resistance' : 'Round Support'}</span><strong>${labPrice(raw.roundSupport)}</strong><small>${raw.roundSupportDistancePct ? `${labFmt(raw.roundSupportDistancePct, 2)}% away` : '--'}</small></div>
</div>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">4H Timing</div>
<div class="strategy-check-grid">
${buildCheck('4H trigger ready', timing.ready, 'READY', 'WAIT')}
${buildCheck(isShort ? '4H below 9 EMA' : '4H above 9 EMA', isShort ? Number(timing.ema9 || 0) > 0 && Number(raw.latestPrice || row.entry || 0) < Number(timing.ema9 || 0) : Number(timing.ema9 || 0) > 0 && Number(raw.latestPrice || row.entry || 0) > Number(timing.ema9 || 0), 'EMA', 'WAIT')}
${buildCheck(isShort ? 'Lower-high/reject structure' : 'Higher-low/reclaim structure', timing.structureOk, 'STRUCTURE', 'WAIT')}
${buildCheck('Clean trigger candle', Number(timing.closePosition || 0) >= 62 && Number(timing.bodyRatio || 0) >= 38, 'CANDLE', 'WAIT')}
</div>
<div class="strategy-mini-grid">
<div><span>4H 9 EMA</span><strong>${labPrice(timing.ema9)}</strong></div>
<div><span>4H VWAP</span><strong>${labPrice(timing.vwap)}</strong></div>
<div><span>4H ATR</span><strong>${labPrice(timing.atr15)}</strong></div>
<div><span>Trigger Quality</span><strong>${labEsc(timing.ready ? 'Ready' : timing.blockers?.[0] || 'Waiting')}</strong></div>
</div>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Market And Candle Proof</div>
<div class="strategy-check-grid">
${buildCheck('Market supports direction', market.fit !== false, 'FIT', 'AGAINST')}
${buildCheck('Daily candle proof', dailyProof.clean, 'CLEAN', 'WAIT')}
${buildCheck('Entry not extended', !row.checks?.lateChase, 'OK', 'LATE')}
${buildCheck('Reward acceptable', Number(raw.rrToTarget1 || 0) >= 1.2, 'RR', 'WEAK')}
</div>
<div class="strategy-mini-grid">
<div><span>Market</span><strong>${labEsc(market.label || 'Unknown')}</strong><small>${labEsc(market.condition || market.state || '--')}</small></div>
<div><span>FWD Index</span><strong>${labPct(market.changePct, 2)}</strong><small>current scan</small></div>
<div><span>Daily Proof</span><strong>${labEsc(dailyProof.label || '--')}</strong><small>${labEsc(`${dailyProof.closePosition || 0}% close | ${dailyProof.bodyRatio || 0}% body`)}</small></div>
<div><span>Distance</span><strong>${labPct(raw.extensionPct, 2)}</strong><small>${labFmt(raw.extensionAtr || 0, 2)} ATR from 9 EMA</small></div>
</div>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Trend Checks</div>
<div class="strategy-check-grid">
${buildCheck(isShort ? 'Trend stack down' : 'Trend stack up', isShort ? row.checks?.trendDown : row.checks?.trendUp, isShort ? 'DOWN' : 'UP', 'WAIT')}
${buildCheck('9 EMA touched', row.checks?.touchedRecently, 'TOUCH', 'WAIT')}
${buildCheck(isShort ? 'Rejected 9 EMA' : 'Reclaimed 9 EMA', isShort ? row.checks?.reject : row.checks?.reclaim, isShort ? 'REJECT' : 'RECLAIM', 'WAIT')}
${buildCheck(isShort ? 'OBV confirms selling' : 'OBV supports trend', row.checks?.obvUp, 'OBV', 'WEAK')}
${buildCheck('Not late chase', !row.checks?.lateChase, 'OK', 'LATE')}
</div>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Chart Levels</div>
<div class="strategy-mini-grid">
<div><span>Trigger</span><strong>${labPrice(levels.trigger || row.triggerPrice)}</strong></div>
<div><span>Target 1</span><strong>${labPrice(levels.target1 || row.targets?.target1)}</strong></div>
<div><span>Target 2</span><strong>${labPrice(levels.target2 || row.targets?.target2R)}</strong></div>
<div><span>Target 3</span><strong>${labPrice(levels.target3 || row.targets?.target3R)}</strong></div>
</div>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">Score Parts</div>
<div class="strategy-mini-grid">
${scoreRows.length ? scoreRows.map(item => `<div><span>${labEsc(item.label)}</span><strong class="${Number(item.value || 0) < 0 ? 'loss' : 'good'}">${Number(item.value || 0) > 0 ? '+' : ''}${labFmt(item.value, 0)}</strong></div>`).join('') : '<p>No pullback score parts recorded yet.</p>'}
</div>
</div>
<ul>${reasons || '<li>No pullback notes available yet.</li>'}</ul>
${buildDecisionNotes(row)}
<div class="strategy-detail-actions"><button type="button" class="strategy-chart-draft-btn" data-pullback-chart-draft="${labEsc(row.symbol)}">Trend 1D With Plan</button><button type="button" data-strategy-entry-chart="${labEsc(row.symbol)}">Entry 4H</button></div>
</aside>`;
}

function buildNativeStraddleDetail(row = null) {
 if (!row) {
  return '<aside class="strategy-lab-detail native-straddle-detail"><div class="strategy-detail-empty">Select a Native Straddle row to inspect premium, spread, liquidity, market score, and the 1D review handoff.</div></aside>';
 }
 const raw = row.raw || {};
 const market = raw.marketContext || {};
 const premiumRead = raw.premiumRead || {};
 const reasons = (row.reasons || []).slice(0, 9).map(reason => `<li>${labEsc(reason)}</li>`).join('');
 const expiry = raw.daysToExpiry < 1 ? `${labFmt(Math.max(0, Number(raw.daysToExpiry || 0)) * 24, 1)}h` : `${labFmt(raw.daysToExpiry, 1)}d`;
 return `<aside class="strategy-lab-detail native-straddle-detail ${labDirectionClass(row)}">
<div class="strategy-detail-head">
<div><span>Native Straddle Scanner</span><strong>${labSymbolWithDirection(row, raw.underlying || row.symbol)}</strong></div>
<em class="${rowTone(row)}">${labEsc(row.actionLabel || labPriorityLabel(row))}</em>
</div>
<div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Open 1D chart</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
${buildPlainHelpPanel(row)}
<div class="strategy-detail-grid">
<div><span>MV Symbol</span><strong>${labEsc(row.symbol)}</strong></div>
<div><span>Action</span><strong>${labEsc(row.actionLabel || '--')}</strong></div>
<div><span>Score</span><strong>${labFmt(row.score, 0)}/100</strong></div>
<div><span>Strike</span><strong>${labPrice(raw.strike || row.targets?.strike)}</strong></div>
<div><span>Spot</span><strong>${labPrice(raw.underlyingPrice || row.targets?.underlyingPrice)}</strong></div>
<div><span>Premium</span><strong>${raw.premiumPerContract ? `$${labFmt(raw.premiumPerContract, 2)}` : labPrice(row.entry)}</strong></div>
<div><span>Spread</span><strong>${labFmt(raw.spreadPct, 2)}%</strong></div>
<div><span>Expiry</span><strong>${labEsc(expiry)}</strong></div>
<div><span>Market score</span><strong>${labFmt(market.sellPremiumScore, 0)}/100</strong></div>
<div><span>Market read</span><strong>${labEsc(market.label || '--')}</strong></div>
<div><span>MV premium</span><strong>${labEsc(premiumRead.trendState || '--')}</strong></div>
<div><span>MV 2h / 4h</span><strong>${labFmt(premiumRead.move2h, 1)}% / ${labFmt(premiumRead.move4h, 1)}%</strong></div>
</div>
<div class="strategy-checks">
${buildCheck('Native MV contract', row.checks?.nativeMvContract)}
${buildCheck('Premium available', row.checks?.hasPremium)}
${buildCheck('Spread acceptable', row.checks?.spreadOk)}
${buildCheck('BTC/ETH calm for sell', row.checks?.marketCalmForSell)}
${buildCheck('MV premium not expanding', row.checks?.premiumNotExpanding)}
${buildCheck('Advisory only', row.checks?.advisoryOnly)}
${buildCheck('No auto trade', row.checks?.noAutoTrade)}
</div>
<div class="strategy-detail-notes">
<div class="strategy-detail-label">Scanner Notes</div>
<ul>${reasons || '<li>No native straddle notes available yet.</li>'}</ul>
</div>
<div class="strategy-report-block">
<div class="strategy-report-title">1D Chart Handoff</div>
<button type="button" class="strategy-chart-draft-btn" data-strategy-chart-review="${labEsc(row.symbol)}">Open Native Straddle Chart</button>
<p>Loads the MV native straddle symbol on the chart with 1D recent context. This does not place an order.</p>
</div>
${buildDecisionNotes(row)}
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
 return `<aside class="strategy-lab-detail early-detail ${labDirectionClass(row)}">
<div class="strategy-detail-head">
<div><span>Early Opportunity</span><strong>${labSymbolWithDirection(row)}</strong></div>
<em class="${rowTone(row)}">${labEsc(row.priorityLabel || labPriorityLabel(row))}</em>
</div>
<div class="strategy-detail-actions"><button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Trend 1D</button><button type="button" data-strategy-entry-chart="${labEsc(row.symbol)}">Entry 4H</button><button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button></div>
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

function buildFullDetail(row = null) {
  if (activeStrategyLabId === 'early') return buildEarlyDetail(row);
  if (activeStrategyLabId === 'radar') return buildRadarDetail(row);
  if (activeStrategyLabId === 'reversal') return buildReversalDetail(row);
  if (activeStrategyLabId === 'new_coin_scalper') return buildNewCoinScalperDetail(row);
  if (activeStrategyLabId === 'darvas') return buildDarvasDetail(row);
  if (activeStrategyLabId === 'pullback') return buildPullbackDetail(row);
  if (activeStrategyLabId === 'native_straddle') return buildNativeStraddleDetail(row);
  return activeStrategyLabId === 'stage' ? buildStageDetail(row) : buildGenericDetail(row);
}

function buildDetail(row = null) {
 if (!row) {
  return '<aside class="strategy-lab-detail strategy-decision-inspector"><div class="strategy-detail-empty">Select a setup to review its action, reason, levels, freshness, and charts.</div></aside>';
 }
 const raw = row.raw || {};
 const levels = raw.chartLevels || {};
 const plan = raw.tradePlan || {};
 const pack = labDecisionPack(row);
 const freshness = labRowFreshness(row);
 const entry = row.entry || row.triggerPrice || plan.trigger || levels.trigger || raw.latestPrice;
 const stop = row.stop || row.protectLevel || plan.stop || levels.stop || levels.invalidation || raw.stop;
 const target = row.targets?.target1 || row.targets?.target2R || plan.target || levels.target1 || raw.target;
 const reason = pack.whyNotNow[0] || pack.whySelected[0] || labPlainWhy(row) || row.setupLabel || 'Review the chart before taking action.';
 return `<aside class="strategy-lab-detail strategy-decision-inspector ${labDirectionClass(row)}">
  <div class="strategy-detail-head">
   <div><span>${labEsc(getStrategyMeta(row.strategyId || activeStrategyLabId)?.displayName || 'Strategy')}</span><strong>${labSymbolWithDirection(row)}</strong></div>
   <em class="${rowTone(row)}">${labEsc(labPriorityLabel(row))}</em>
  </div>
  <div class="strategy-decision-action">
   <span>Action</span>
   <strong>${labEsc(pack.nextAction)}</strong>
   <p>${labEsc(reason)}</p>
  </div>
  <div class="strategy-detail-grid strategy-decision-levels">
   <div><span>Entry</span><strong>${labPrice(entry)}</strong></div>
   <div><span>Stop</span><strong>${labPrice(stop)}</strong></div>
   <div><span>Target</span><strong>${labPrice(target)}</strong></div>
   <div><span>Freshness</span><strong class="${freshness.stale ? 'loss' : 'good'}">${labEsc(freshness.stale ? `Stale · ${freshness.ageLabel}` : freshness.ageLabel)}</strong></div>
  </div>
  <div class="strategy-detail-actions">
   <button type="button" data-strategy-chart-review="${labEsc(row.symbol)}">Trend 1D</button>
   <button type="button" data-strategy-entry-chart="${labEsc(row.symbol)}">Entry 4H</button>
   <button type="button" data-strategy-watchlist-toggle="${labEsc(row.symbol)}">${strategyLabResearchWatchlist.includes(row.symbol) ? 'Saved' : 'Save to review'}</button>
  </div>
  <details class="strategy-inspector-evidence">
   <summary>Full evidence</summary>
   <div class="strategy-inspector-evidence-body">${buildFullDetail(row)}</div>
  </details>
 </aside>`;
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
   'strategyResults.darvas',
   'strategyResults.pullback',
   'strategyResults.new_coin_scalper',
   'strategyResults.native_straddle',
   'strategyStatus.wizard',
   'strategyStatus.stage',
   'strategyStatus.radar',
   'strategyStatus.reversal',
   'strategyStatus.darvas',
   'strategyStatus.pullback',
   'strategyStatus.new_coin_scalper',
   'strategyStatus.native_straddle',
   'strategyLabAutoScan',
   'strategyLabUnifiedScanStatus',
   'lastMainScanContextMeta',
   'scanResults',
   'scanStatus',
   'scanActive',
   'scanHeartbeat',
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
  if (!labHasFreshSharedScanContext(strategyLabSnapshot)) return;
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
 if (snapshot?.current?.unifiedStatus?.active || snapshot?.strategyLabUnifiedScanStatus?.active || snapshot?.strategyLabAutoScan?.active || snapshot?.current?.scanActive || snapshot?.scanActive) return true;
 return registryList()
 .filter(strategy => String(strategy.mode || '').toLowerCase() === 'scanner_only')
 .some(strategy => !!snapshot?.[strategy.id]?.status?.active);
 }

 function labHasFreshSharedScanContext(snapshot = strategyLabSnapshot) {
 const meta = snapshot?.current?.scanContextMeta || snapshot?.lastMainScanContextMeta || {};
 const expiresAt = Number(meta.expiresAt || 0);
 const finishedAt = Number(meta.finishedAt || snapshot?.current?.lastScanTs || snapshot?.lastScanTs || 0);
 if (expiresAt && expiresAt > Date.now()) return true;
 return !!(finishedAt && Date.now() - finishedAt < STRATEGY_LAB_ROW_STALE_MS);
 }

 function loadStrategySnapshot(callback) {
 chrome.runtime.sendMessage({ action: 'wizard:getResults' }, resp => {
 if (chrome.runtime.lastError || !resp?.ok) {
 global.reportUiError?.('Strategy Lab failed', chrome.runtime.lastError || new Error(resp?.error || 'Unknown error'), { timeoutMs: 7000 });
 return;
 }
 chrome.storage.local.get(['strategyLabScannerAlerts', 'strategyLabScannerNotificationsEnabled', 'strategyLabRadarNotificationsEnabled', 'strategyLabNativeStraddleNotificationsEnabled', 'strategyLabResearchWatchlist', 'strategyLabQualityFilters', STRATEGY_LAB_OUTCOME_KEY, 'strategyLabAutoScan', 'strategyLabUnifiedScanStatus', 'lastMainScanContextMeta', 'scanActive', 'scanStatus', 'scanHeartbeat', 'lastScanTs'], data => {
 strategyLabAlerts = Array.isArray(data.strategyLabScannerAlerts) ? data.strategyLabScannerAlerts : [];
 strategyLabScannerNotificationsEnabled = data.strategyLabScannerNotificationsEnabled === true;
 strategyLabRadarNotificationsEnabled = data.strategyLabRadarNotificationsEnabled === true;
 strategyLabNativeStraddleNotificationsEnabled = data.strategyLabNativeStraddleNotificationsEnabled === true;
 strategyLabResearchWatchlist = Array.isArray(data.strategyLabResearchWatchlist) ? data.strategyLabResearchWatchlist.map(value => String(value || '').toUpperCase()).filter(Boolean).slice(0, 80) : [];
 const filters = data.strategyLabQualityFilters && typeof data.strategyLabQualityFilters === 'object' ? data.strategyLabQualityFilters : {};
 strategyLabMinScore = Math.max(0, Math.min(100, Number(filters.minScore || strategyLabMinScore || 0)));
 strategyLabHideAvoid = filters.hideAvoid === true || strategyLabHideAvoid === true;
 const mergedSnapshot = {
  ...resp,
  strategyLabScannerAlerts: strategyLabAlerts,
  strategyLabAutoScan: data.strategyLabAutoScan || resp.strategyLabAutoScan || {},
  strategyLabUnifiedScanStatus: data.strategyLabUnifiedScanStatus || resp.strategyLabUnifiedScanStatus || {},
  lastMainScanContextMeta: data.lastMainScanContextMeta || resp.lastMainScanContextMeta || {},
  scanActive: data.scanActive === true || resp.scanActive === true,
  scanStatus: data.scanStatus || resp.scanStatus || '',
  scanHeartbeat: Number(data.scanHeartbeat || resp.scanHeartbeat || 0),
  lastScanTs: Number(data.lastScanTs || resp.lastScanTs || 0),
  current: {
   ...(resp.current || {}),
   unifiedStatus: data.strategyLabUnifiedScanStatus || resp.current?.unifiedStatus || {},
   scanContextMeta: data.lastMainScanContextMeta || resp.current?.scanContextMeta || {},
   scanActive: data.scanActive === true || resp.current?.scanActive === true,
   scanHeartbeat: Number(data.scanHeartbeat || resp.current?.scanHeartbeat || 0),
  },
 };
 refreshStrategyOutcomeTracker(mergedSnapshot, data[STRATEGY_LAB_OUTCOME_KEY]);
 callback(mergedSnapshot);
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
return markStrategyResearchDraft({
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
}, row);
}

function buildReversalChartDraft(row = {}) {
const isShort = String(row.direction || '').includes('short') || row.signal === 'SELL';
return markStrategyResearchDraft({
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
}, row);
}

function buildNewCoinScalperChartDraft(row = {}) {
const isShort = labDirection(row) === 'short' || row.signal === 'SELL';
const levels = row.raw?.keyLevels || {};
return markStrategyResearchDraft({
symbol: String(row.symbol || '').trim().toUpperCase(),
side: isShort ? 'sell' : 'buy',
entry: Number(row.entry || row.raw?.latestPrice || 0),
stopLoss: Number(row.stop || levels.stop || 0),
takeProfit: Number(row.targets?.target1 || levels.target1 || row.targets?.target2R || 0),
size: 1,
sizeMode: 'contracts',
orderType: 'market_order',
entryMode: 'market',
source: 'strategy-lab-new-coin-scalper',
note: `${row.raw?.eventLabel || row.setupLabel || 'New Coin Scalper'} draft. Confirm 4H trigger, daily context, OBV, VWAP, and key levels manually before any order.`,
newCoinScalperLevels: {
trigger: Number(row.triggerPrice || levels.trigger || 0) || 0,
vwap: Number(row.targets?.vwap || levels.vwap || 0) || 0,
support4h: Number(row.targets?.support4h || levels.support4h || 0) || 0,
resistance4h: Number(row.targets?.resistance4h || levels.resistance4h || 0) || 0,
},
updatedAt: Date.now(),
}, row);
}

function buildDarvasChartDraft(row = {}) {
const boxTop = Number(row.raw?.boxTop || row.targets?.boxTop || row.triggerPrice || row.entry || 0);
const boxBottom = Number(row.raw?.boxBottom || row.targets?.boxBottom || row.stop || 0);
const rawBox = row.raw?.darvasBox && typeof row.raw.darvasBox === 'object' ? row.raw.darvasBox : {};
return markStrategyResearchDraft({
symbol: String(row.symbol || '').trim().toUpperCase(),
side: 'buy',
entry: Number(row.entry || row.raw?.latestPrice || 0),
stopLoss: Number(row.stop || row.raw?.boxBottom || 0),
takeProfit: Number(row.targets?.target1 || row.targets?.target2R || 0),
size: 1,
sizeMode: 'contracts',
orderType: 'market_order',
entryMode: row.eventType === 'breakout' ? 'market' : 'limit',
source: 'strategy-lab-darvas',
note: `${row.raw?.eventLabel || row.setupLabel || 'Darvas Box Lab'} draft. Scanner-only box setup; confirm close above box top and volume manually before any order.`,
darvasBox: boxTop > 0 && boxBottom > 0 && boxTop > boxBottom ? {
 top: boxTop,
 bottom: boxBottom,
 age: Number(rawBox.age || row.raw?.boxAge || 24) || 24,
 startTime: Number(rawBox.startTime || row.raw?.boxStartTime || 0),
 endTime: Number(rawBox.endTime || row.raw?.boxEndTime || 0),
 eventType: String(row.eventType || row.raw?.eventType || '').trim().toLowerCase(),
 label: row.raw?.eventLabel || row.setupLabel || 'Darvas Box',
 status: row.eventType === 'breakout' ? 'Breakout Confirmed' : row.eventType === 'failed_breakout' ? 'Failed' : row.eventType === 'near_breakout' || row.eventType === 'base' ? 'Active' : '',
 score: Number(row.score || row.confidence || 0) || 0,
 quality: Number(row.score || 0) >= 80 ? 'High Quality' : Number(row.score || 0) >= 60 ? 'Medium Quality' : 'Low Quality',
 heightPercent: Number(row.raw?.boxHeightPct || 0) || 0,
 volumeConfirmed: row.checks?.volumeConfirmed === true,
 volumeRatio: Number(row.raw?.volumeRatio || 0) || 0,
 riskPercent: Number(row.riskPercent || 0) || 0,
 stopLoss: Number(row.stop || row.raw?.chartLevels?.stop || row.raw?.boxBottom || 0) || 0,
 target1: Number(row.targets?.target1 || row.raw?.chartLevels?.target1 || 0) || 0,
 target2: Number(row.targets?.target3R || row.raw?.chartLevels?.target2 || 0) || 0,
 reason: Array.isArray(row.reasons) && row.reasons.length ? row.reasons[0] : '',
} : null,
updatedAt: Date.now(),
}, row);
}

function buildPullbackChartDraft(row = {}) {
const direction = labDirection(row);
const isShort = direction === 'short';
const plan = row.raw?.tradePlan || {};
const entryReady = row.raw?.workflowStage === 'entry_ready';
return markStrategyResearchDraft({
symbol: String(row.symbol || '').trim().toUpperCase(),
side: isShort ? 'sell' : 'buy',
entry: Number(plan.trigger || row.entry || row.raw?.bestEntry || row.raw?.latestPrice || 0),
stopLoss: Number(row.stop || row.raw?.stop || 0),
takeProfit: Number(row.targets?.target2R || row.targets?.target1 || row.raw?.chartLevels?.target2 || 0),
size: 1,
sizeMode: 'contracts',
orderType: entryReady ? 'market_order' : 'limit_order',
entryMode: entryReady ? 'market' : 'limit',
source: 'strategy-lab-pullback',
note: `${row.raw?.eventLabel || row.setupLabel || 'EMA Pullback Lab'} draft. ${plan.entryCommand || 'Confirm daily setup and 4H trigger first'}. Scanner-only ${isShort ? 'short-side ' : ''}trend pullback setup; no order is placed automatically.`,
pullbackLevels: {
idealEntry: Number(row.raw?.idealPullback || row.targets?.ema9 || 0) || 0,
 ema9: Number(row.raw?.ema9 || row.targets?.ema9 || 0) || 0,
 ema21: Number(row.raw?.ema21 || row.targets?.ema21 || 0) || 0,
touchLow: Number(row.raw?.touchLow || 0) || 0,
touchHigh: Number(row.raw?.touchHigh || 0) || 0,
 previousHigh: Number(row.raw?.previousHigh || row.targets?.previousHigh || 0) || 0,
 roundSupport: Number(row.raw?.roundSupport || row.targets?.roundSupport || 0) || 0,
 extensionPct: Number(row.raw?.extensionPct || 0) || 0,
 workflowStage: String(row.raw?.workflowStage || ''),
 timingTrigger: Number(row.raw?.timing?.triggerPrice || 0) || 0,
},
updatedAt: Date.now(),
}, row);
}

function isDarvasChartReviewRow(row = {}) {
 const strategyId = String(row.strategyId || activeStrategyLabId || '').trim().toLowerCase();
 return strategyId === 'darvas'
 || Number(row.raw?.boxTop || row.targets?.boxTop || 0) > 0
 || Number(row.raw?.boxBottom || row.targets?.boxBottom || 0) > 0;
}

function buildStrategyChartReviewDraft(row = {}) {
 const strategyId = String(row.strategyId || activeStrategyLabId || '').trim().toLowerCase();
 if (strategyId === 'new_coin_scalper') return buildNewCoinScalperChartDraft(row);
 if (strategyId === 'pullback') return buildPullbackChartDraft(row);
 return isDarvasChartReviewRow(row) ? buildDarvasChartDraft(row) : buildGenericChartDraft(row);
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
 if (!root?.querySelectorAll) return;
 alignStrategyHelpTooltips(root);
 root.querySelector('.strategy-advanced-details')?.addEventListener('toggle', event => {
  strategyLabAdvancedOpen = event.currentTarget.open === true;
 });
 root.querySelector('#btnStrategyMasterStock')?.addEventListener('click', () => {
  strategyLabMasterSearchOpen = !strategyLabMasterSearchOpen;
  renderStrategyLab(strategyLabSnapshot);
  if (strategyLabMasterSearchOpen) window.setTimeout(() => document.getElementById('strategyMasterStockInput')?.focus(), 0);
 });
 const runMasterStockSearch = () => {
  strategyLabMasterSearchQuery = String(root.querySelector('#strategyMasterStockInput')?.value || '').trim().toUpperCase();
  renderStrategyLab(strategyLabSnapshot);
 };
 root.querySelector('#btnStrategyMasterStockSearch')?.addEventListener('click', runMasterStockSearch);
 const masterStockInput = root.querySelector('#strategyMasterStockInput');
 masterStockInput?.addEventListener('input', event => {
  strategyLabMasterSearchQuery = String(event.currentTarget?.value || '').toUpperCase();
 });
 masterStockInput?.addEventListener('keydown', event => {
  event.stopPropagation();
  if (event.key !== 'Enter') return;
  event.preventDefault();
  runMasterStockSearch();
 });
 masterStockInput?.addEventListener('keyup', event => event.stopPropagation());
 masterStockInput?.addEventListener('keypress', event => event.stopPropagation());
 root.querySelectorAll('[data-master-stock-symbol]').forEach(button => {
  button.addEventListener('click', () => {
   activeStrategyLabId = button.dataset.masterStockStrategy || activeStrategyLabId;
   selectedStrategySymbol = button.dataset.masterStockSymbol || '';
   strategyLabViewMode = 'all';
   strategyLabMasterSearchOpen = false;
   renderStrategyLab(strategyLabSnapshot);
  });
 });
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
 root.querySelector('#btnStrategyLabNotificationToggle')?.addEventListener('click', () => {
 strategyLabScannerNotificationsEnabled = !strategyLabScannerNotificationsEnabled;
 strategyLabRadarNotificationsEnabled = strategyLabScannerNotificationsEnabled;
 strategyLabNativeStraddleNotificationsEnabled = strategyLabScannerNotificationsEnabled;
 chrome.storage.local.set({
  strategyLabScannerNotificationsEnabled,
  strategyLabRadarNotificationsEnabled,
  strategyLabNativeStraddleNotificationsEnabled,
 }, () => renderStrategyLab(strategyLabSnapshot));
 });
 root.querySelector('#btnOpenCurrentScan')?.addEventListener('click', () => global.setActiveWorkspaceTab?.('scanner', true, true));
 root.querySelector('#btnRunAllStrategyScans')?.addEventListener('click', () => {
 const btn = root.querySelector('#btnRunAllStrategyScans');
 if (btn) {
 btn.disabled = true;
 btn.textContent = 'Main scan...';
 }
 startStrategyLabPolling();
 chrome.runtime.sendMessage({ action: 'strategy-lab:runUnifiedScan' }, resp => {
  if (chrome.runtime.lastError || !resp?.ok) {
   global.reportUiError?.('Unified scanner run failed', chrome.runtime.lastError || new Error(resp?.error || 'Unknown error'), { timeoutMs: 7000 });
  }
  loadStrategyLab();
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
 global.openSignalInChartWorkspace?.({ ...selected, timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol, timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME, visibleCandleCount: STRATEGY_LAB_REVIEW_VISIBLE_CANDLES });
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
 const activeMatch = labRowsForActive(strategyLabSnapshot).find(item => item.symbol === symbol);
const selected = activeMatch
 || labAllScannerRows(strategyLabSnapshot || {}).find(item => item.symbol === symbol)
 || { symbol };
const strategyId = String(selected.strategyId || activeStrategyLabId || '').trim().toLowerCase();
const isDarvas = isDarvasChartReviewRow(selected);
const isPullback = strategyId === 'pullback';
recordStrategyOutcomeReview(selected);
await global.openSignalInChartWorkspace?.({
 ...selected,
 strategyId: isDarvas ? 'darvas' : isPullback ? 'pullback' : (selected.strategyId || activeStrategyLabId || ''),
 chartTradingDraft: buildStrategyChartReviewDraft(selected),
 timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME,
 }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol, strategyId: isDarvas ? 'darvas' : isPullback ? 'pullback' : (selected.strategyId || activeStrategyLabId || ''), timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME, visibleCandleCount: STRATEGY_LAB_REVIEW_VISIBLE_CANDLES });
 });
 });
 root.querySelectorAll('[data-strategy-entry-chart]').forEach(button => {
 button.addEventListener('click', async () => {
 const symbol = button.dataset.strategyEntryChart || selectedStrategySymbol || '';
 const selected = labAllScannerRows(strategyLabSnapshot || {}).find(item => item.symbol === symbol) || { symbol };
 recordStrategyOutcomeReview(selected);
 await global.openSignalInChartWorkspace?.({
  ...selected,
  chartTradingDraft: buildStrategyChartReviewDraft(selected),
  timeframe: STRATEGY_LAB_ENTRY_TIMEFRAME,
 }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol, strategyId: selected.strategyId || activeStrategyLabId || '', timeframe: STRATEGY_LAB_ENTRY_TIMEFRAME, visibleCandleCount: STRATEGY_LAB_ENTRY_VISIBLE_CANDLES });
 });
 });
root.querySelectorAll('[data-radar-chart-draft]').forEach(button => {
 button.addEventListener('click', async () => {
 const symbol = button.dataset.radarChartDraft || selectedStrategySymbol || '';
 const selected = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId).find(item => item.symbol === symbol) || null;
 if (!selected) return;
 recordStrategyOutcomeReview(selected);
 await global.openSignalInChartWorkspace?.({
 ...selected,
 chartTradingDraft: buildRadarChartDraft(selected),
 timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME,
 }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol, timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME, visibleCandleCount: STRATEGY_LAB_REVIEW_VISIBLE_CANDLES });
});
});
root.querySelectorAll('[data-reversal-chart-draft]').forEach(button => {
button.addEventListener('click', async () => {
const symbol = button.dataset.reversalChartDraft || selectedStrategySymbol || '';
const selected = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId).find(item => item.symbol === symbol) || null;
if (!selected) return;
recordStrategyOutcomeReview(selected);
 await global.openSignalInChartWorkspace?.({
...selected,
chartTradingDraft: buildReversalChartDraft(selected),
timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME,
 }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol, timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME, visibleCandleCount: STRATEGY_LAB_REVIEW_VISIBLE_CANDLES });
});
});
root.querySelectorAll('[data-new-coin-scalper-chart-draft]').forEach(button => {
button.addEventListener('click', async () => {
const symbol = button.dataset.newCoinScalperChartDraft || selectedStrategySymbol || '';
const selected = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId).find(item => item.symbol === symbol) || null;
if (!selected) return;
recordStrategyOutcomeReview(selected);
 await global.openSignalInChartWorkspace?.({
...selected,
strategyId: 'new_coin_scalper',
chartTradingDraft: buildNewCoinScalperChartDraft(selected),
timeframe: '4h',
 }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol, strategyId: 'new_coin_scalper', timeframe: '4h', visibleCandleCount: 120 });
});
});
root.querySelectorAll('[data-pullback-chart-draft]').forEach(button => {
button.addEventListener('click', async () => {
const symbol = button.dataset.pullbackChartDraft || selectedStrategySymbol || '';
const selected = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId).find(item => item.symbol === symbol) || null;
if (!selected) return;
recordStrategyOutcomeReview(selected);
 await global.openSignalInChartWorkspace?.({
...selected,
strategyId: 'pullback',
chartTradingDraft: buildPullbackChartDraft(selected),
timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME,
 }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol, strategyId: 'pullback', timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME, visibleCandleCount: STRATEGY_LAB_REVIEW_VISIBLE_CANDLES });
});
});
root.querySelectorAll('[data-darvas-chart-draft]').forEach(button => {
button.addEventListener('click', async () => {
const symbol = button.dataset.darvasChartDraft || selectedStrategySymbol || '';
const selected = labStrategyRows(strategyLabSnapshot || {}, activeStrategyLabId).find(item => item.symbol === symbol) || null;
if (!selected) return;
recordStrategyOutcomeReview(selected);
 await global.openSignalInChartWorkspace?.({
...selected,
strategyId: 'darvas',
chartTradingDraft: buildDarvasChartDraft(selected),
 timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME,
 }, { reviewTab: true, returnTab: 'strategy', returnSymbol: symbol, strategyId: 'darvas', timeframe: STRATEGY_LAB_REVIEW_TIMEFRAME, visibleCandleCount: STRATEGY_LAB_REVIEW_VISIBLE_CANDLES });
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
 const activeElement = document.activeElement;
 const masterInputFocused = activeElement?.id === 'strategyMasterStockInput';
 if (masterInputFocused) strategyLabMasterSearchQuery = String(activeElement.value || '').toUpperCase();
 strategyLabSnapshot = snapshot || {};
 const rows = labRowsForActive(strategyLabSnapshot);
 const status = labStatusForActive(strategyLabSnapshot);
 const selected = rows.find(row => row.symbol === selectedStrategySymbol) || rows[0] || null;
 root.innerHTML = `<div class="strategy-lab-shell strategy-lab-shell-guided">
 ${buildStrategyLabTop(rows, status)}
 ${buildMasterStockSearch()}
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
 if (masterInputFocused && strategyLabMasterSearchOpen) {
  const restoredInput = document.getElementById('strategyMasterStockInput');
  if (restoredInput) {
   restoredInput.focus({ preventScroll: true });
   const end = restoredInput.value.length;
   restoredInput.setSelectionRange?.(end, end);
  }
 }
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
