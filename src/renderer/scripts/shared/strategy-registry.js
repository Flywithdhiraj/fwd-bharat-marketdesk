'use strict';

(function initStrategyRegistry(global) {
 const STRATEGY_MODES = Object.freeze({
 LIVE: 'live',
 SCANNER_ONLY: 'scanner_only',
 PAPER: 'paper',
 });

 const STRATEGY_REGISTRY = Object.freeze({
 current: Object.freeze({
 id: 'current',
 displayName: 'Current Strategy',
 shortName: 'Current',
 description: 'NSE/BSE scanner using the current F&O stock universe and manual-trading workflow.',
 mode: STRATEGY_MODES.SCANNER_ONLY,
 market: 'NSE/BSE market data',
 timeframe: '1D + intraday',
 resultKey: 'scanResults',
 statusKey: 'scanStatus',
 scannerAction: 'startScan',
 canLiveTrade: false,
 canPaperTrade: false,
 summaryFields: Object.freeze(['score', 'direction', 'tradeQuality', 'entry', 'sl', 'tp1']),
 }),
 wizard: Object.freeze({
 id: 'wizard',
 displayName: 'Wizard Scanner',
 shortName: 'Wizard',
 description: 'Minervini-style NSE/BSE momentum scanner using trend template, RS, VCP, breakout, and risk.',
 mode: STRATEGY_MODES.SCANNER_ONLY,
 market: 'NSE/BSE F&O stocks',
 timeframe: '1D closed candles',
 optionalTimeframe: '4H confirmation later',
 resultKey: 'strategyResults.wizard',
 statusKey: 'strategyStatus.wizard',
 settingsKey: 'strategySettings.wizard',
 scannerAction: 'wizard:startScan',
 canLiveTrade: false,
 canPaperTrade: false,
 summaryFields: Object.freeze(['score', 'setupLabel', 'rsScore', 'entry', 'stop', 'riskPercent']),
 }),
  stage: Object.freeze({
   id: 'stage',
   displayName: 'Stage Scanner',
   shortName: 'Stage',
   description: 'Scanner-only Stage I-IV lifecycle classifier using weekly candles, 30WMA, range, volume, and volatility.',
 mode: STRATEGY_MODES.SCANNER_ONLY,
 market: 'NSE/BSE F&O stocks',
 timeframe: 'Weekly from closed 1D candles',
 resultKey: 'strategyResults.stage',
 statusKey: 'strategyStatus.stage',
 settingsKey: 'strategySettings.stage',
 scannerAction: 'stage:startScan',
 canLiveTrade: false,
   canPaperTrade: false,
   summaryFields: Object.freeze(['stage', 'stageLabel', 'actionLabel', 'confidence', 'score', 'entry', 'stop']),
  }),
  radar: Object.freeze({
   id: 'radar',
   displayName: 'Live Radar',
   shortName: 'Radar',
   description: 'Scanner-only live market radar for pressure, breakouts, EMA/OBV validation, high volume, and VWAP retests.',
   mode: STRATEGY_MODES.SCANNER_ONLY,
   market: 'NSE/BSE F&O stocks',
   timeframe: '15m + 1D context',
   resultKey: 'strategyResults.radar',
   statusKey: 'strategyStatus.radar',
   settingsKey: 'strategySettings.radar',
   scannerAction: 'radar:startScan',
   canLiveTrade: false,
   canPaperTrade: false,
   summaryFields: Object.freeze(['eventType', 'actionLabel', 'priorityLabel', 'score', 'entry', 'stop']),
  }),
  reversal: Object.freeze({
   id: 'reversal',
   displayName: 'Reversal Lab',
   shortName: 'Reversal',
   description: 'Scanner-only fade and mean-reversion lab for stretched price, failed breakouts, VWAP distance, RSI extremes, breadth pressure, and volume exhaustion.',
   mode: STRATEGY_MODES.SCANNER_ONLY,
   market: 'NSE/BSE F&O stocks',
   timeframe: '15m stretch + 1D context',
   resultKey: 'strategyResults.reversal',
   statusKey: 'strategyStatus.reversal',
   settingsKey: 'strategySettings.reversal',
   scannerAction: 'reversal:startScan',
   canLiveTrade: false,
   canPaperTrade: false,
   summaryFields: Object.freeze(['eventType', 'actionLabel', 'priorityLabel', 'score', 'entry', 'stop']),
  }),
  darvas: Object.freeze({
   id: 'darvas',
   displayName: 'Darvas Box Lab',
   shortName: 'Darvas',
   description: 'Scanner-only Darvas box momentum lab for tight bases, box-top breakouts, volume confirmation, and failed-breakout rejection.',
   mode: STRATEGY_MODES.SCANNER_ONLY,
   market: 'NSE/BSE F&O stocks',
   timeframe: '1D box + 15m context',
   resultKey: 'strategyResults.darvas',
   statusKey: 'strategyStatus.darvas',
   settingsKey: 'strategySettings.darvas',
   scannerAction: 'darvas:startScan',
   canLiveTrade: false,
   canPaperTrade: false,
   summaryFields: Object.freeze(['eventType', 'actionLabel', 'priorityLabel', 'score', 'boxTop', 'boxBottom', 'entry', 'stop']),
  }),
  pullback: Object.freeze({
   id: 'pullback',
   displayName: 'EMA Pullback Lab',
   shortName: 'Pullback',
   description: 'Scanner-only trend pullback lab for daily 9 EMA setup, 15m entry timing, market-regime fit, candle quality proof, and late-entry rejection.',
   mode: STRATEGY_MODES.SCANNER_ONLY,
   market: 'NSE/BSE F&O stocks',
   timeframe: '1D trend + 15m timing',
   resultKey: 'strategyResults.pullback',
   statusKey: 'strategyStatus.pullback',
   settingsKey: 'strategySettings.pullback',
   scannerAction: 'pullback:startScan',
   canLiveTrade: false,
   canPaperTrade: false,
   summaryFields: Object.freeze(['eventType', 'actionLabel', 'priorityLabel', 'score', 'entry', 'stop', 'riskPercent']),
  }),
 });

 function getStrategy(id) {
 const key = String(id || '').trim().toLowerCase();
 return STRATEGY_REGISTRY[key] || STRATEGY_REGISTRY.current;
 }

 function listStrategies() {
 return Object.values(STRATEGY_REGISTRY);
 }

 function normalizeStrategySignal(value) {
 const raw = String(value || '').trim().toUpperCase();
 if (raw === 'BUY' || raw === 'SELL' || raw === 'WATCHLIST' || raw === 'IGNORE') return raw;
 return 'IGNORE';
 }

 function normalizeStrategyResult(input = {}, strategyId = 'wizard') {
 const strategy = getStrategy(strategyId);
 const entry = Number(input.entry ?? input.entryPrice ?? 0);
 const stop = Number(input.stop ?? input.stopPrice ?? 0);
 const riskPercent = Number(input.riskPercent ?? input.risk_percent ?? 0);
 const score = Math.max(0, Math.min(100, Math.round(Number(input.score || 0))));
 return {
 symbol: String(input.symbol || '').trim().toUpperCase(),
 strategyId: strategy.id,
 signal: normalizeStrategySignal(input.signal),
 setupLabel: String(input.setupLabel || input.setup_label || 'Ignore'),
 direction: String(input.direction || '').trim().toLowerCase(),
 stage: String(input.stage || '').trim(),
 stageLabel: String(input.stageLabel || input.stage_label || '').trim(),
 actionLabel: String(input.actionLabel || input.action_label || '').trim(),
  priorityLabel: String(input.priorityLabel || input.priority_label || '').trim(),
  eventType: String(input.eventType || input.event_type || '').trim(),
  confidence: Math.max(0, Math.min(100, Math.round(Number(input.confidence || 0)))),
  score,
 entry: Number.isFinite(entry) ? entry : 0,
 stop: Number.isFinite(stop) ? stop : 0,
 riskPercent: Number.isFinite(riskPercent) ? riskPercent : 0,
 protectLevel: Number.isFinite(Number(input.protectLevel || 0)) ? Number(input.protectLevel || 0) : 0,
 exitPrice: Number.isFinite(Number(input.exitPrice || 0)) ? Number(input.exitPrice || 0) : 0,
 triggerPrice: Number.isFinite(Number(input.triggerPrice || 0)) ? Number(input.triggerPrice || 0) : 0,
 targets: input.targets && typeof input.targets === 'object' ? input.targets : {},
 reasons: Array.isArray(input.reasons) ? input.reasons.map(String).slice(0, 12) : [],
  checks: input.checks && typeof input.checks === 'object' ? input.checks : {},
  riskFlags: Array.isArray(input.riskFlags) ? input.riskFlags.map(String).slice(0, 10) : [],
  mode: strategy.mode,
 canLiveTrade: !!strategy.canLiveTrade,
 ts: Number(input.ts || Date.now()),
 raw: input.raw || undefined,
 };
 }

 global.FWDTradeDeskStrategies = Object.freeze({
 STRATEGY_MODES,
 STRATEGY_REGISTRY,
 getStrategy,
 listStrategies,
 normalizeStrategyResult,
 });
})(globalThis);
