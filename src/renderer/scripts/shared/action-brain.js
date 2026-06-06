'use strict';

(() => {
 const SHADOW_LEDGER_KEY = 'v16ShadowTradeLedgerV1';
 const SETUP_PERFORMANCE_KEY = 'v16SetupPerformanceV1';
 const DEFAULT_MIN_SAMPLE = 20;

 const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value || 0)));
 const text = (value, fallback = '') => String(value ?? fallback).trim();
 const upper = value => text(value).toUpperCase();
 const lower = value => text(value).toLowerCase();
 const asArray = value => Array.isArray(value) ? value : [];
 const now = () => Date.now();

 function setupFamilyKey(value = '') {
  return lower(value || 'mixed').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'mixed';
 }

 function marketRegimeKey(value = '') {
  const key = upper(value || 'UNKNOWN');
  return key || 'UNKNOWN';
 }

 function signalFamily(signal = {}) {
  return setupFamilyKey(signal.setupFamily || signal.setupFamilyLabel || signal.setup || signal.family || 'mixed');
 }

 function signalTimeframe(signal = {}) {
  return lower(signal.timeframe || signal.tf2 || signal.lower?.label || '4h') || '4h';
 }

 function signalRegime(signal = {}, context = {}) {
  return marketRegimeKey(signal.marketRegime || context.marketIndex?.regime || 'UNKNOWN');
 }

 function scoreSignal(signal = {}) {
  const score = Number(signal.score || 0);
  const tq = Number(signal.tradeQuality?.score || signal.tradeQuality || 0);
  return Math.round((score * 0.46) + (tq * 0.54));
 }

 function alertTier(signal = {}) {
  const explicit = lower(signal.alertTier || signal.tier || '');
  if (explicit) return explicit;
  const score = Number(signal.score || 0);
  if (score >= 75) return 'execute';
  if (score >= 62) return 'setup';
  if (score >= 45) return 'watch';
  return 'none';
 }

 function resolveEdge(signal = {}, setupPerformance = {}, context = {}) {
  const family = signalFamily(signal);
  const timeframe = signalTimeframe(signal);
  const regime = signalRegime(signal, context);
  const rows = setupPerformance?.rows && typeof setupPerformance.rows === 'object' ? setupPerformance.rows : {};
  const list = Array.isArray(setupPerformance?.list) ? setupPerformance.list : Object.values(rows);
  const exactKey = `${family}|${timeframe}|${regime}`;
  const exact = rows[exactKey] || list.find(row =>
   setupFamilyKey(row?.familyKey || row?.family) === family
   && lower(row?.timeframe || '') === timeframe
   && marketRegimeKey(row?.marketRegime || '') === regime
  );
  const familyMatch = exact || list
  .filter(row => setupFamilyKey(row?.familyKey || row?.family) === family)
  .sort((a, b) => Number(b?.trades || 0) - Number(a?.trades || 0) || Number(b?.expectancy || 0) - Number(a?.expectancy || 0))[0];
  if (!familyMatch) {
   return {
    status: 'unproven',
    statusLabel: 'No Paper Edge',
    tone: 'warn',
    confidenceDelta: -12,
    trades: 0,
    minSample: Number(setupPerformance?.minSample || context.autoTradeSettings?.setupPerformanceMinSample || DEFAULT_MIN_SAMPLE),
    summary: 'No closed paper/live sample yet',
    row: null,
   };
  }
  const minSample = Number(setupPerformance?.minSample || context.autoTradeSettings?.setupPerformanceMinSample || DEFAULT_MIN_SAMPLE);
  const trades = Number(familyMatch.trades || 0);
  const expectancy = Number(familyMatch.expectancy || 0);
  const avgR = familyMatch.avgR == null ? null : Number(familyMatch.avgR || 0);
  const winRate = Number(familyMatch.winRate || 0);
  const drawdown = Number(familyMatch.maxDrawdown || 0);
  const edgeValue = avgR == null ? expectancy : avgR;
  const recent = now() - Number(familyMatch.lastClosedAt || 0);
  const stale = Number(familyMatch.lastClosedAt || 0) > 0 && recent > 14 * 24 * 60 * 60 * 1000;
  let status = 'proving';
  let tone = 'warn';
  let confidenceDelta = -6;
  if (trades >= minSample && edgeValue > 0 && drawdown <= Math.max(2.5, Math.abs(edgeValue) * 8)) {
   status = trades >= Math.max(minSample + 10, 30) && edgeValue >= 0.25 ? 'strong_edge' : 'positive_edge';
   tone = 'good';
   confidenceDelta = status === 'strong_edge' ? 12 : 7;
  } else if (trades >= minSample && edgeValue <= 0) {
   status = 'weak_edge';
   tone = 'bad';
   confidenceDelta = -22;
  } else if (trades > 0) {
   confidenceDelta = -8;
  }
  if (stale && status !== 'weak_edge') {
   confidenceDelta -= 5;
   tone = tone === 'good' ? 'warn' : tone;
  }
  const statusLabel = status === 'strong_edge'
   ? 'Strong Paper Edge'
   : status === 'positive_edge'
   ? 'Positive Paper Edge'
   : status === 'weak_edge'
   ? 'Weak Paper Edge'
   : 'Paper Proving';
  return {
   status,
   statusLabel,
   tone,
   confidenceDelta,
   trades,
   minSample,
   expectancy,
   avgR,
   winRate,
   drawdown,
   stale,
   summary: `${trades}/${minSample} sample | Win ${winRate.toFixed(1)}% | Exp ${expectancy >= 0 ? '+' : ''}${expectancy}${avgR == null ? '' : ` | Avg ${avgR >= 0 ? '+' : ''}${avgR}R`}`,
   row: familyMatch,
  };
 }

 function liveSnapshot(snapshot = {}) {
  const positions = Array.isArray(snapshot?.marginedPositions)
   ? snapshot.marginedPositions.filter(p => Number(p?.size || 0) !== 0)
   : [];
  const orders = Array.isArray(snapshot?.openOrders)
   ? snapshot.openOrders.filter(order => ['open', 'pending'].includes(lower(order?.state || '')))
   : [];
  const unprotected = positions.filter(position => {
   const symbol = upper(position?.symbol || position?.product_symbol || position?.productSymbol || '');
   if (!symbol) return false;
   return !orders.some(order => {
    const orderSymbol = upper(order?.symbol || order?.product_symbol || order?.productSymbol || '');
    const reduceOnly = order?.reduce_only === true || order?.reduceOnly === true;
    const stopLike = /stop|trigger|sl/i.test(text(order?.order_type || order?.orderType || order?.type || ''));
    return orderSymbol === symbol && (reduceOnly || stopLike);
   });
  });
  return { positions, orders, unprotected };
 }

 function buildSignalAction(signal = {}, context = {}) {
  const edge = resolveEdge(signal, context.setupPerformance, context);
  const score = scoreSignal(signal);
  const tier = alertTier(signal);
  const direction = lower(signal.direction || signal.side || '');
  const symbol = upper(signal.symbol || '');
  const reasons = asArray(signal.reasons).filter(Boolean).slice(0, 2).join(' | ');
  const riskReady = !!(Number(signal.entry || 0) > 0 && Number(signal.sl || signal.stopLoss || 0) > 0 && Number(signal.tp1 || signal.tp || 0) > 0);
  const openPaper = asArray(context.ledger?.open).some(trade => upper(trade?.symbol || '') === symbol);
  const baseConfidence = clamp(score + edge.confidenceDelta + (riskReady ? 4 : -10), 5, 96);
  let bucket = 'wait_for';
  let tone = 'warn';
  let title = `${symbol || 'Setup'} needs confirmation`;
  let what = 'Wait for a cleaner trigger before action.';
  let when = 'After entry trigger and risk levels are valid.';
  let targetTab = 'chart';
  if (edge.status === 'weak_edge') {
   bucket = 'avoid';
   tone = 'danger';
   title = `Avoid ${symbol}`;
   what = 'Scanner quality is not enough because paper history is weak.';
   when = 'Only reconsider after the setup recovers in paper mode.';
   targetTab = 'analytics';
  } else if (!riskReady) {
   bucket = 'wait_for';
   title = `Wait on ${symbol}`;
   what = 'Entry, stop, or target is missing.';
   when = 'Review chart before this can enter the queue.';
  } else if (edge.trades < edge.minSample) {
   bucket = openPaper ? 'review' : 'paper_first';
   tone = 'warn';
   title = openPaper ? `Track open paper ${symbol}` : `Paper first: ${symbol}`;
   what = openPaper ? 'Paper trade is already open; let result improve the sample.' : 'Good setup, but the app has not proven this setup family yet.';
   when = openPaper ? 'Wait for stop/target close in paper ledger.' : `Collect ${Math.max(0, edge.minSample - edge.trades)} more closed paper sample${Math.max(0, edge.minSample - edge.trades) === 1 ? '' : 's'}.`;
   targetTab = 'analytics';
  } else if (tier === 'execute' && edge.tone === 'good' && baseConfidence >= 70) {
   bucket = 'do_now';
   tone = 'hot';
   title = `Review ${symbol} now`;
   what = 'Scanner quality and paper edge agree.';
   when = direction.includes('short') ? 'Prepare only if short trigger is still valid.' : 'Prepare after final chart and size review.';
  } else if (tier === 'setup' || edge.tone === 'good') {
   bucket = 'wait_for';
   tone = edge.tone === 'good' ? 'info' : 'warn';
   title = `Prepare ${symbol}`;
   what = edge.tone === 'good' ? 'Paper edge is positive, but current signal still needs confirmation.' : 'Setup is still developing.';
   when = reasons || 'Wait for breakout, VWAP reclaim, or volume confirmation.';
  } else {
   bucket = 'review';
   tone = 'info';
   title = `Review ${symbol}`;
   what = 'Setup is visible but not high priority.';
   when = reasons || 'Use chart context before taking any action.';
  }
  return {
   id: `signal:${symbol}:${bucket}:${signalFamily(signal)}`,
   bucket,
   priority: Math.round(baseConfidence + (bucket === 'do_now' ? 25 : bucket === 'protect' ? 30 : bucket === 'avoid' ? 12 : 0)),
   tone,
   symbol,
   title,
   what,
   when,
   why: reasons || edge.summary,
   risk: riskReady ? edge.summary : 'Risk levels incomplete.',
   confidence: Math.round(baseConfidence),
   source: 'Scanner + Paper',
   targetTab,
   evidence: {
    score: Number(signal.score || 0),
    tradeQuality: Number(signal.tradeQuality?.score || signal.tradeQuality || 0),
    alertTier: tier,
    edge: edge.statusLabel,
   },
  };
 }

 function buildProtectActions(context = {}) {
  const actions = [];
  const live = liveSnapshot(context.snapshot);
  const settings = context.autoTradeSettings || {};
  const ledger = context.ledger || {};
  const paperEnabled = settings.paperTrackingEnabled !== false;
  const killSwitch = context.killSwitch || {};
  if (killSwitch.enabled) {
   actions.push({
    id: 'protect:kill-switch',
    bucket: 'protect',
    priority: 120,
    tone: 'danger',
    title: 'Live trading locked',
    what: 'Kill switch is on, so no live entries should be prepared.',
    when: 'Fix safety settings only after confirming why it was enabled.',
    why: text(killSwitch.reason, 'Kill switch blocks new live orders.'),
    risk: 'Live execution is intentionally blocked.',
    confidence: 98,
    source: 'Risk',
    targetTab: 'strategy',
   });
  }
  if (live.unprotected.length) {
   actions.push({
    id: 'protect:unprotected',
    bucket: 'protect',
    priority: 118,
    tone: 'danger',
    title: 'Protect live positions first',
    what: `${live.unprotected.length} live position${live.unprotected.length === 1 ? '' : 's'} may not have detected stop protection.`,
    when: 'Before reviewing any new entry.',
    why: 'Open risk outranks fresh scanner signals.',
    risk: 'A live position without protection can exceed planned loss.',
    confidence: 94,
    source: 'Exchange + Risk',
    targetTab: 'positions',
   });
  }
  if (!paperEnabled) {
   actions.push({
    id: 'protect:paper-off',
    bucket: 'protect',
    priority: 130,
    tone: 'warn',
    title: 'Turn on paper learning',
    what: 'Paper tracking is off, so the app cannot learn which setups work.',
    when: 'Enable Paper Mode before trusting new strategy improvements.',
    why: 'The advisor needs closed paper results to promote or demote setups.',
    risk: 'Without paper results, scanner score remains unproven.',
    confidence: 88,
    source: 'Paper Mode',
    targetTab: 'strategy',
    targetAction: 'paper-mode',
   });
  }
  const openPaper = asArray(ledger.open).length;
  const closedPaper = asArray(ledger.closed).length;
  if (paperEnabled && openPaper === 0 && closedPaper === 0) {
   actions.push({
    id: 'review:paper-empty',
    bucket: 'paper_first',
    priority: 62,
    tone: 'warn',
    title: 'Collect first paper samples',
    what: 'Paper mode is ready but no simulated trades have closed yet.',
    when: 'Keep auto scan and paper tracking running while the PC stays awake.',
    why: 'Closed paper results become setup edge.',
    risk: 'Do not promote setups before sample exists.',
    confidence: 82,
    source: 'Paper Mode',
    targetTab: 'analytics',
   });
  }
  return actions;
 }

 function buildActionBrain(raw = {}) {
  const context = {
   ...raw,
   scanResults: asArray(raw.scanResults),
   alerts: asArray(raw.alerts),
   ledger: raw[SHADOW_LEDGER_KEY] || raw.shadowLedger || { open: [], closed: [] },
   setupPerformance: raw[SETUP_PERFORMANCE_KEY] || raw.setupPerformance || {},
   autoTradeSettings: raw.autoTradeSettings || {},
   snapshot: raw.v16LiveAccountSnapshot || raw.snapshot || null,
   marketIndex: raw.marketIndex || null,
   killSwitch: raw.killSwitch || null,
  };
  const protect = buildProtectActions(context);
  const candidates = context.scanResults
  .filter(signal => signal && signal.symbol)
  .slice()
  .sort((a, b) => scoreSignal(b) - scoreSignal(a))
  .slice(0, 24)
  .map(signal => buildSignalAction(signal, context));
  const merged = [...protect, ...candidates]
  .filter(action => action && action.title)
  .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
  .slice(0, 12);
  const counts = merged.reduce((acc, action) => {
   acc[action.bucket] = (acc[action.bucket] || 0) + 1;
   return acc;
  }, {});
  const top = merged[0] || {
   id: 'empty',
   bucket: 'review',
   priority: 0,
   tone: 'info',
   title: 'Run market scan',
   what: 'No current action queue is available.',
   when: 'Run a scan to refresh scanner, paper, and risk state.',
   why: 'The advisor needs fresh market data.',
   risk: 'No trade advice yet.',
   confidence: 50,
   source: 'Action Brain',
   targetTab: 'scanner',
  };
  return {
   top,
   actions: merged.length ? merged : [top],
   counts,
   learning: {
    paperOpen: asArray(context.ledger?.open).length,
    paperClosed: asArray(context.ledger?.closed).length,
    setupRows: Array.isArray(context.setupPerformance?.list) ? context.setupPerformance.list.length : Object.keys(context.setupPerformance?.rows || {}).length,
    minSample: Number(context.setupPerformance?.minSample || context.autoTradeSettings?.setupPerformanceMinSample || DEFAULT_MIN_SAMPLE),
   },
   generatedAt: now(),
  };
 }

 globalThis.FWDTradeDeskActionBrain = Object.freeze({
  SHADOW_LEDGER_KEY,
  SETUP_PERFORMANCE_KEY,
  buildActionBrain,
  resolveEdge,
 });
})();
