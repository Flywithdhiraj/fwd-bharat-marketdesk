'use strict';

(() => {
 const baseShared = globalThis.FWDTradeDeskShared || {};
 const clampNumber = typeof baseShared.clampNumber === 'function'
 ? baseShared.clampNumber
 : (value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, digits = 4) => {
 const n = Number(value);
 if (!Number.isFinite(n)) return fallback;
 const bounded = Math.max(min, Math.min(max, n));
 if (!Number.isFinite(digits) || digits < 0) return bounded;
 return +bounded.toFixed(digits);
 };
 const sanitizeText = typeof baseShared.sanitizeText === 'function'
 ? baseShared.sanitizeText
 : (value, fallback = '', max = 120) => {
 const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
 if (!text) return fallback;
 return text.slice(0, Math.max(0, max));
 };

 const OPTION_UNDERLYINGS = Object.freeze(['BTC', 'ETH']);
 const OPTION_STRATEGY_TYPES = Object.freeze([
 'short_straddle',
 'short_strangle',
 'iron_condor',
 'short_call_spread',
 'short_put_spread',
 'iron_fly',
 'jade_lizard',
 ]);
 const OPTION_ENTRY_MODES = Object.freeze(['maker_only', 'limit', 'market']);
 const OPTION_AUTOMATION_ALLOWED_EXPIRY_BUCKETS = Object.freeze(['weekly', 'biweekly', 'monthly']);
 const DEFAULT_RISK_FREE_RATE = 0.06;
 const OPTION_RANGE_STEPS = 61;

 const OPTION_READY_MADE_STRATEGIES = Object.freeze([
 Object.freeze({
 id: 'short_straddle',
 label: 'Short Straddle',
 bias: 'neutral',
 risk: 'undefined',
 copy: 'Sell the ATM call and put to maximize theta when you expect balance and IV mean reversion.',
 }),
 Object.freeze({
 id: 'short_strangle',
 label: 'Short Strangle',
 bias: 'neutral',
 risk: 'undefined',
 copy: 'Sell OTM call and put to widen breakevens while still collecting decay.',
 }),
 Object.freeze({
 id: 'iron_condor',
 label: 'Iron Condor',
 bias: 'neutral',
 risk: 'defined',
 copy: 'Defined-risk short volatility structure with capped wings on both sides.',
 }),
 Object.freeze({
 id: 'short_call_spread',
 label: 'Short Call Spread',
 bias: 'bearish',
 risk: 'defined',
 copy: 'Collect call premium above spot while capping upside risk with a hedge.',
 }),
 Object.freeze({
 id: 'short_put_spread',
 label: 'Short Put Spread',
 bias: 'bullish',
 risk: 'defined',
 copy: 'Collect put premium below spot while capping downside risk with a hedge.',
 }),
 Object.freeze({
 id: 'iron_fly',
 label: 'Iron Fly',
 bias: 'neutral',
 risk: 'defined',
 copy: 'ATM premium sale with wing hedges for traders who want more credit than a condor.',
 }),
 Object.freeze({
 id: 'jade_lizard',
 label: 'Jade Lizard',
 bias: 'bullish',
 risk: 'defined_upside',
 copy: 'Short put plus a defined-risk short call spread for bullish or mildly neutral premium selling.',
 }),
 ]);

 function toFiniteNumber(value, fallback = 0) {
 const n = Number(value);
 return Number.isFinite(n) ? n : fallback;
 }

 function sanitizeOptionLegSide(value) {
 return String(value || '').trim().toLowerCase() === 'buy' ? 'buy' : 'sell';
 }

 function sanitizeOptionType(value) {
 const raw = String(value || '').trim().toLowerCase();
 if (raw === 'call' || raw === 'c') return 'call';
 if (raw === 'straddle' || raw === 'move' || raw === 'mv') return 'straddle';
 return 'put';
 }

 function sanitizeOptionEntryMode(value) {
 const raw = String(value || '').trim().toLowerCase();
 return OPTION_ENTRY_MODES.includes(raw) ? raw : 'limit';
 }

 function sanitizeOptionsUnderlyingList(value, fallback = OPTION_UNDERLYINGS) {
 const list = Array.isArray(value)
 ? value
 : String(value || '')
 .split(/[\s,;]+/g)
 .filter(Boolean);
 const seen = new Set();
 const output = [];
 list.forEach(item => {
 const normalized = sanitizeText(item, '', 12).toUpperCase();
 if (!normalized || seen.has(normalized)) return;
 seen.add(normalized);
 output.push(normalized);
 });
 return output.length ? output : [...fallback];
 }

 function sanitizeOptionsStrategyTypes(value) {
 const list = Array.isArray(value)
 ? value
 : String(value || '')
 .split(/[\s,;]+/g)
 .filter(Boolean);
 const seen = new Set();
 const output = [];
 list.forEach(item => {
 const normalized = sanitizeText(item, '', 32).toLowerCase();
 if (!OPTION_STRATEGY_TYPES.includes(normalized) || seen.has(normalized)) return;
 seen.add(normalized);
 output.push(normalized);
 });
 return output.length ? output : ['iron_condor', 'short_put_spread', 'short_call_spread'];
 }

 function sanitizeOptionsExpiryBuckets(value) {
 const list = Array.isArray(value)
 ? value
 : String(value || '')
 .split(/[\s,;]+/g)
 .filter(Boolean);
 const seen = new Set();
 const output = [];
 list.forEach(item => {
 const normalized = sanitizeText(item, '', 24).toLowerCase();
 if (!OPTION_AUTOMATION_ALLOWED_EXPIRY_BUCKETS.includes(normalized) || seen.has(normalized)) return;
 seen.add(normalized);
 output.push(normalized);
 });
 return output.length ? output : ['weekly', 'biweekly'];
 }

 function formatOptionsExpiryKey(value) {
 const ts = Number(value || 0);
 if (!Number.isFinite(ts) || ts <= 0) return '';
 const date = new Date(ts);
 const year = date.getUTCFullYear();
 const month = String(date.getUTCMonth() + 1).padStart(2, '0');
 const day = String(date.getUTCDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
 }

 function parseOptionExpiryToken(token = '') {
 const raw = String(token || '').trim();
 if (!/^\d{6}$/.test(raw)) return { expiryTs: 0, expiryKey: '' };
 const day = Number(raw.slice(0, 2));
 const month = Number(raw.slice(2, 4));
 const year = 2000 + Number(raw.slice(4, 6));
 const expiryTs = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
 return {
 expiryTs: Number.isFinite(expiryTs) ? expiryTs : 0,
 expiryKey: formatOptionsExpiryKey(expiryTs),
 };
 }

 function parseDeltaOptionSymbol(symbol = '') {
 const normalized = sanitizeText(symbol, '', 64).toUpperCase();
 const match = normalized.match(/^([CP])-([A-Z0-9]+)-(\d+(?:\.\d+)?)-(\d{6})$/);
 if (!match) return null;
 const optionType = match[1] === 'C' ? 'call' : 'put';
 const underlying = match[2];
 const strike = Number(match[3]);
 const expiryMeta = parseOptionExpiryToken(match[4]);
 return {
 symbol: normalized,
 optionType,
 underlying,
 strike: Number.isFinite(strike) ? strike : 0,
 expiryToken: match[4],
 expiryTs: expiryMeta.expiryTs,
 expiryKey: expiryMeta.expiryKey,
 };
 }

 function formatDeltaOptionSymbol(underlying = '', optionType = 'call', strike = 0, expiryTs = 0) {
 const base = sanitizeText(underlying, '', 16).toUpperCase();
 if (!base || !Number.isFinite(Number(strike)) || Number(strike) <= 0 || !expiryTs) return '';
 const date = new Date(expiryTs);
 const day = String(date.getUTCDate()).padStart(2, '0');
 const month = String(date.getUTCMonth() + 1).padStart(2, '0');
 const year = String(date.getUTCFullYear()).slice(-2);
 const prefix = sanitizeOptionType(optionType) === 'call' ? 'C' : 'P';
 return `${prefix}-${base}-${Math.round(Number(strike))}-${day}${month}${year}`;
 }

 function getOptionsExpiryBucket(daysToExpiry = 0) {
 const days = Number(daysToExpiry || 0);
 if (days <= 7) return 'weekly';
 if (days <= 21) return 'biweekly';
 return 'monthly';
 }

 function sanitizeOptionsBuilderLeg(raw = {}) {
 const parsed = parseDeltaOptionSymbol(raw.symbol || '');
 const expiryTs = clampNumber(raw.expiryTs || raw.expiryTime || parsed?.expiryTs, 0, 0, Number.MAX_SAFE_INTEGER, 0);
 const currentGreeks = raw.greeks && typeof raw.greeks === 'object' ? raw.greeks : {};
 const hasExplicitSide = Object.prototype.hasOwnProperty.call(raw, 'side') && String(raw.side || '').trim() !== '';
 const qty = clampNumber(raw.qty ?? raw.quantity ?? raw.size, 1, 1, 1000, 0);
 const contractValue = clampNumber(raw.contractValue ?? raw.contractMultiplier ?? raw.contract_size ?? raw.contractSize, 1, 0.00000001, 1000000, 8);
 const bid = clampNumber(raw.bid ?? raw.bidPrice ?? raw.bestBid, 0, 0, 1000000000, 8);
 const ask = clampNumber(raw.ask ?? raw.askPrice ?? raw.bestAsk, 0, 0, 1000000000, 8);
 const bidSize = clampNumber(raw.bidSize ?? raw.bidQty ?? raw.bestBidQty ?? raw.bid_quantity, 0, 0, 1000000000, 2);
 const askSize = clampNumber(raw.askSize ?? raw.askQty ?? raw.bestAskQty ?? raw.ask_quantity, 0, 0, 1000000000, 2);
 const markPrice = clampNumber(raw.markPrice ?? raw.mark ?? raw.lastPrice ?? raw.premium ?? raw.entryPrice, 0, 0, 1000000000, 8);
 const premium = clampNumber(raw.premium ?? raw.entryPrice ?? raw.markPrice ?? raw.mark ?? raw.lastPrice, markPrice, 0, 1000000000, 8);
 const iv = clampNumber(raw.iv ?? raw.impliedVolatility ?? raw.markIv ?? raw.mark_iv ?? raw.volatility, 0.45, 0.0001, 5, 6);
 const openInterest = clampNumber(raw.oiContracts ?? raw.openInterest ?? raw.oi, 0, 0, 1000000000, 2);
 const volumeContracts = clampNumber(raw.volumeContracts ?? raw.volume, 0, 0, 1000000000, 2);
 const normalizedSide = hasExplicitSide ? sanitizeOptionLegSide(raw.side) : '';
 const daysToExpiry = Number.isFinite(Number(raw.daysToExpiry))
 ? Math.max(0, Number(raw.daysToExpiry))
 : (expiryTs > 0 ? Math.max(0, (expiryTs - Date.now()) / 86400000) : 0);
 return {
 symbol: sanitizeText(raw.symbol || parsed?.symbol, '', 64),
 underlying: sanitizeText(raw.underlying || parsed?.underlying, parsed?.underlying || '', 16).toUpperCase(),
 optionType: sanitizeOptionType(raw.optionType || parsed?.optionType),
 side: normalizedSide,
 qty,
 quantity: qty,
 strike: clampNumber(raw.strike || parsed?.strike, 0, 0, 1000000000, 4),
 expiryTs,
 expiryKey: formatOptionsExpiryKey(expiryTs),
 daysToExpiry: clampNumber(daysToExpiry, 0, 0, 3650, 4),
 premium,
 entryPrice: premium,
 markPrice,
 bid,
 bidPrice: bid,
 bidSize,
 ask,
 askPrice: ask,
 askSize,
 iv,
 impliedVolatility: iv,
 contractValue,
 contractMultiplier: contractValue,
 delta: clampNumber(raw.delta ?? currentGreeks.delta, 0, -10, 10, 8),
 gamma: clampNumber(raw.gamma ?? currentGreeks.gamma, 0, -10, 10, 8),
 theta: clampNumber(raw.theta ?? currentGreeks.theta, 0, -1000000, 1000000, 8),
 vega: clampNumber(raw.vega ?? currentGreeks.vega, 0, -1000000, 1000000, 8),
 rho: clampNumber(raw.rho ?? currentGreeks.rho, 0, -1000000, 1000000, 8),
 oiContracts: openInterest,
 openInterest,
 volumeContracts,
 underlyingPrice: clampNumber(raw.underlyingPrice ?? raw.spotPrice ?? raw.spot ?? 0, 0, 0, 1000000000, 8),
 shortPremiumScore: clampNumber(raw.shortPremiumScore, 0, 0, 100, 2),
 productId: clampNumber(raw.productId ?? raw.product_id, 0, 0, 1000000000, 0),
 entryMode: sanitizeOptionEntryMode(raw.entryMode),
 notes: sanitizeText(raw.notes, '', 180),
 };
 }

 function sanitizeOptionsAutomationSettings(raw = {}) {
 const entryMode = sanitizeOptionEntryMode(raw.entryMode || raw.orderMode);
 const underlyings = sanitizeOptionsUnderlyingList(raw.underlyings ?? raw.allowedUnderlyings);
 const maxRiskUSD = clampNumber(raw.maxRiskUSD ?? raw.perStrategyBudgetUSD, 120, 1, 1000000, 2);
 return {
 enabled: !!raw.enabled,
 minTradeQuality: clampNumber(raw.minTradeQuality ?? raw.minScore, 72, 0, 100, 0),
 minDte: clampNumber(raw.minDte, 2, 0, 120, 0),
 maxDte: clampNumber(raw.maxDte, 21, 1, 365, 0),
 targetDelta: clampNumber(raw.targetDelta, 0.16, 0.01, 0.49, 3),
 deltaTolerance: clampNumber(raw.deltaTolerance, 0.08, 0.01, 0.3, 3),
 minOiContracts: clampNumber(raw.minOiContracts, 250, 0, 100000000, 0),
 maxBidAskSpreadPct: clampNumber(raw.maxBidAskSpreadPct, 0.18, 0.01, 2, 3),
 minPremiumScore: clampNumber(raw.minPremiumScore ?? raw.minThetaScore, 55, 0, 100, 0),
 maxConcurrentStrategies: clampNumber(raw.maxConcurrentStrategies, 2, 1, 20, 0),
 maxStrategiesPerDay: clampNumber(raw.maxStrategiesPerDay, 4, 1, 50, 0),
 cooldownMinutes: clampNumber(raw.cooldownMinutes, 180, 15, 10080, 0),
 perStrategyBudgetUSD: maxRiskUSD,
 maxRiskUSD,
 takeProfitPct: clampNumber(raw.takeProfitPct, 50, 5, 95, 0),
 stopLossMultiple: clampNumber(raw.stopLossMultiple, 1.5, 0.5, 10, 2),
 closeHoursBeforeExpiry: clampNumber(raw.closeHoursBeforeExpiry, 18, 0, 240, 0),
 entryMode,
 allowUndefinedRisk: !!raw.allowUndefinedRisk,
 allowedUnderlyings: underlyings,
 underlyings,
 allowedExpiryBuckets: sanitizeOptionsExpiryBuckets(raw.allowedExpiryBuckets),
 strategyTypes: sanitizeOptionsStrategyTypes(raw.strategyTypes),
 notifyBrowser: raw.notifyBrowser !== false,
 notifyTelegram: raw.notifyTelegram !== false,
 profileId: sanitizeText(raw.profileId, '', 80),
 // Straddle auto-trade settings
 straddleEnabled: !!raw.straddleEnabled,
 legStopLossPct: clampNumber(raw.legStopLossPct, 30, 5, 100, 0),
 reentryEnabled: raw.reentryEnabled !== false,
 reentryThresholdPct: clampNumber(raw.reentryThresholdPct, 5, 1, 30, 0),
 maxReentries: clampNumber(raw.maxReentries, 2, 0, 10, 0),
 universalProfitTarget: clampNumber(raw.universalProfitTarget, 300, 0, 100000, 0),
 universalLossLimit: clampNumber(raw.universalLossLimit, 300, 0, 100000, 0),
 closeMinutesBeforeExpiry: clampNumber(raw.closeMinutesBeforeExpiry, 30, 5, 1440, 0),
 straddleExpiryPreference: ['nearest', 'same_day'].includes(raw.straddleExpiryPreference) ? raw.straddleExpiryPreference : 'nearest',
 nativeStraddlePreferred: raw.nativeStraddlePreferred !== false,
 minPremiumPerContractUSD: clampNumber(raw.minPremiumPerContractUSD, 0.25, 0, 100000, 2),
 minThetaMarginRatioPct: clampNumber(raw.minThetaMarginRatioPct, 0.35, 0, 100, 2),
 sameDayMinScore: clampNumber(raw.sameDayMinScore, 82, 0, 100, 0),
 sameDayMaxSpreadPct: clampNumber(raw.sameDayMaxSpreadPct, 1.2, 0.01, 100, 2),
 premiumCapturePct: clampNumber(raw.premiumCapturePct, 60, 0, 100, 0),
 entryOrderMaxAgeMinutes: clampNumber(raw.entryOrderMaxAgeMinutes, 5, 1, 240, 0),
 // Auto-trade qty from target
 autoSizeEnabled: raw.autoSizeEnabled !== false,
 targetProfitUSD: clampNumber(raw.targetProfitUSD, 100, 1, 1000000, 0),
 };
 }

 function erf(x) {
 const sign = x < 0 ? -1 : 1;
 const absX = Math.abs(x);
 const a1 = 0.254829592;
 const a2 = -0.284496736;
 const a3 = 1.421413741;
 const a4 = -1.453152027;
 const a5 = 1.061405429;
 const p = 0.3275911;
 const t = 1 / (1 + p * absX);
 const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
 return sign * y;
 }

 function normalCdf(x) {
 return 0.5 * (1 + erf(Number(x || 0) / Math.sqrt(2)));
 }

 function normalPdf(x) {
 const value = Number(x || 0);
 return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
 }

 function toYearFraction(nowTs, futureTs) {
 const start = Number(nowTs || 0);
 const end = Number(futureTs || 0);
 if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
 return (end - start) / (365 * 24 * 60 * 60 * 1000);
 }

 function intrinsicValue(optionType, spotPrice, strike) {
 const spot = Math.max(0, Number(spotPrice || 0));
 const strikePrice = Math.max(0, Number(strike || 0));
 return sanitizeOptionType(optionType) === 'call'
 ? Math.max(0, spot - strikePrice)
 : Math.max(0, strikePrice - spot);
 }

 function buildBsmModel(input = {}) {
 const spot = Math.max(0.00000001, Number(input.spot || 0));
 const strike = Math.max(0.00000001, Number(input.strike || 0));
 const years = Math.max(0, Number(input.timeYears || 0));
 const volatility = Math.max(0.0001, Number(input.volatility || 0.0001));
 const rate = Number.isFinite(Number(input.riskFreeRate)) ? Number(input.riskFreeRate) : DEFAULT_RISK_FREE_RATE;
 if (years <= 0) {
 return {
 price: intrinsicValue(input.optionType, spot, strike),
 delta: sanitizeOptionType(input.optionType) === 'call' ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0),
 gamma: 0,
 theta: 0,
 vega: 0,
 rho: 0,
 d1: 0,
 d2: 0,
 };
 }
 const sigmaSqrtT = volatility * Math.sqrt(years);
 const d1 = (Math.log(spot / strike) + (rate + 0.5 * volatility * volatility) * years) / sigmaSqrtT;
 const d2 = d1 - sigmaSqrtT;
 if (sanitizeOptionType(input.optionType) === 'call') {
 const price = spot * normalCdf(d1) - strike * Math.exp(-rate * years) * normalCdf(d2);
 return {
 price,
 delta: normalCdf(d1),
 gamma: normalPdf(d1) / (spot * sigmaSqrtT),
 theta: (-(spot * normalPdf(d1) * volatility) / (2 * Math.sqrt(years)) - rate * strike * Math.exp(-rate * years) * normalCdf(d2)) / 365,
 vega: (spot * normalPdf(d1) * Math.sqrt(years)) / 100,
 rho: (strike * years * Math.exp(-rate * years) * normalCdf(d2)) / 100,
 d1,
 d2,
 };
 }
 const price = strike * Math.exp(-rate * years) * normalCdf(-d2) - spot * normalCdf(-d1);
 return {
 price,
 delta: normalCdf(d1) - 1,
 gamma: normalPdf(d1) / (spot * sigmaSqrtT),
 theta: (-(spot * normalPdf(d1) * volatility) / (2 * Math.sqrt(years)) + rate * strike * Math.exp(-rate * years) * normalCdf(-d2)) / 365,
 vega: (spot * normalPdf(d1) * Math.sqrt(years)) / 100,
 rho: (-strike * years * Math.exp(-rate * years) * normalCdf(-d2)) / 100,
 d1,
 d2,
 };
 }

 function getLegDirectionMultiplier(leg = {}) {
 return sanitizeOptionLegSide(leg.side) === 'buy' ? 1 : -1;
 }

 function getLegQuantity(leg = {}) {
 return Math.max(1, Number(leg.qty ?? leg.quantity ?? 1));
 }

 function getLegContractMultiplier(leg = {}) {
 return Math.max(0.00000001, Number(leg.contractValue ?? leg.contractMultiplier ?? 1));
 }

 function getLegCurrentGreeks(leg = {}, spotPrice = 0, nowTs = Date.now(), riskFreeRate = DEFAULT_RISK_FREE_RATE) {
 const years = toYearFraction(nowTs, leg.expiryTs);
 const liveValues = [Number(leg.delta), Number(leg.gamma), Number(leg.theta), Number(leg.vega), Number(leg.rho)];
 if (liveValues.every(Number.isFinite) && liveValues.some(value => Math.abs(value) > 0)) {
 return {
 delta: liveValues[0],
 gamma: liveValues[1],
 theta: liveValues[2],
 vega: liveValues[3],
 rho: liveValues[4],
 };
 }
 const model = buildBsmModel({
 optionType: leg.optionType,
 spot: spotPrice,
 strike: leg.strike,
 timeYears: years,
 volatility: leg.iv,
 riskFreeRate,
 });
 return {
 delta: model.delta,
 gamma: model.gamma,
 theta: model.theta,
 vega: model.vega,
 rho: model.rho,
 };
 }

 function estimateOptionMarkAtDate(leg = {}, spotPrice = 0, targetTs = 0, riskFreeRate = DEFAULT_RISK_FREE_RATE) {
 const years = toYearFraction(targetTs, leg.expiryTs);
 if (years <= 0) return intrinsicValue(leg.optionType, spotPrice, leg.strike);
 return buildBsmModel({
 optionType: leg.optionType,
 spot: spotPrice,
 strike: leg.strike,
 timeYears: years,
 volatility: leg.iv,
 riskFreeRate,
 }).price;
 }

 function calculateLegPnl(leg = {}, optionValue = 0) {
 const premium = Number((leg.premium ?? leg.entryPrice ?? leg.markPrice) || 0);
 const direction = getLegDirectionMultiplier(leg);
 return direction * (Number(optionValue || 0) - premium) * getLegQuantity(leg) * getLegContractMultiplier(leg);
 }

 function buildStrategyPriceRange(legs = [], spotPrice = 0, steps = OPTION_RANGE_STEPS) {
 const strikes = legs.map(leg => Number(leg.strike || 0)).filter(value => value > 0);
 const minStrike = strikes.length ? Math.min(...strikes) : Math.max(1, spotPrice * 0.85);
 const maxStrike = strikes.length ? Math.max(...strikes) : Math.max(1, spotPrice * 1.15);
 const spread = Math.max(spotPrice * 0.18, (maxStrike - minStrike) * 1.4, spotPrice * 0.08);
 const floor = Math.max(1, Math.min(minStrike, spotPrice) - spread);
 const ceiling = Math.max(floor + 1, Math.max(maxStrike, spotPrice) + spread);
 const safeSteps = Math.max(11, Number(steps || OPTION_RANGE_STEPS));
 return Array.from({ length: safeSteps }, (_, index) => {
 const ratio = index / (safeSteps - 1);
 return +(floor + (ceiling - floor) * ratio).toFixed(2);
 });
 }

 function interpolateBreakevens(points = []) {
 const output = [];
 for (let index = 1; index < points.length; index += 1) {
 const prev = points[index - 1];
 const next = points[index];
 const prevValue = Number(prev?.expiryPnl || 0);
 const nextValue = Number(next?.expiryPnl || 0);
 if (!Number.isFinite(prevValue) || !Number.isFinite(nextValue)) continue;
 if (prevValue === 0) {
 output.push(Number(prev.price));
 continue;
 }
 if ((prevValue < 0 && nextValue > 0) || (prevValue > 0 && nextValue < 0)) {
 const distance = Math.abs(prevValue) + Math.abs(nextValue);
 const weight = distance > 0 ? Math.abs(prevValue) / distance : 0.5;
 const crossing = Number(prev.price) + (Number(next.price) - Number(prev.price)) * weight;
 output.push(+crossing.toFixed(2));
 }
 }
 return Array.from(new Set(output.map(value => +value.toFixed(2)))).sort((a, b) => a - b);
 }

 function inferTailProfile(legs = []) {
 const tolerance = 0.000001;
 let lowSlope = 0;
 let highSlope = 0;
 legs.forEach(leg => {
 const multiplier = getLegDirectionMultiplier(leg) * getLegQuantity(leg) * getLegContractMultiplier(leg);
 if (sanitizeOptionType(leg.optionType) === 'call') highSlope += multiplier;
 else lowSlope -= multiplier;
 });
 return {
 lowInfiniteProfit: lowSlope > tolerance,
 lowInfiniteLoss: lowSlope < -tolerance,
 highInfiniteProfit: highSlope > tolerance,
 highInfiniteLoss: highSlope < -tolerance,
 };
 }

 function lognormalCdf(price, spot, volatility, years, riskFreeRate = DEFAULT_RISK_FREE_RATE) {
 const safePrice = Number(price || 0);
 const safeSpot = Math.max(0.00000001, Number(spot || 0));
 const safeVol = Math.max(0.0001, Number(volatility || 0.0001));
 const safeYears = Math.max(0, Number(years || 0));
 if (safeYears <= 0) return safePrice >= safeSpot ? 1 : 0;
 if (safePrice <= 0) return 0;
 const mean = Math.log(safeSpot) + (riskFreeRate - 0.5 * safeVol * safeVol) * safeYears;
 const variance = safeVol * Math.sqrt(safeYears);
 return normalCdf((Math.log(safePrice) - mean) / variance);
 }

 function estimateProbabilityOfProfit(expiryPoints = [], spotPrice = 0, avgIv = 0.45, yearsToExpiry = 0, riskFreeRate = DEFAULT_RISK_FREE_RATE) {
 if (!expiryPoints.length) return 0;
 const edges = [0];
 expiryPoints.forEach(point => {
 if (Number.isFinite(Number(point?.price)) && Number(point.price) > 0) edges.push(Number(point.price));
 });
 edges.push(Math.max(spotPrice * 4, edges[edges.length - 1] * 1.5, 1));
 const sortedEdges = Array.from(new Set(edges)).sort((a, b) => a - b);
 let probability = 0;
 for (let index = 1; index < sortedEdges.length; index += 1) {
 const left = sortedEdges[index - 1];
 const right = sortedEdges[index];
 const mid = (left + right) / 2;
 const nearest = expiryPoints.reduce((best, point) => {
 if (!best) return point;
 return Math.abs(Number(point.price) - mid) < Math.abs(Number(best.price) - mid) ? point : best;
 }, null);
 if (!nearest || Number(nearest.expiryPnl || 0) <= 0) continue;
 probability += Math.max(0, lognormalCdf(right, spotPrice, avgIv, yearsToExpiry, riskFreeRate) - lognormalCdf(left, spotPrice, avgIv, yearsToExpiry, riskFreeRate));
 }
 return clampNumber(probability * 100, 0, 0, 100, 2);
 }

 function buildStrategyNarrative(summary = {}) {
 const bias = summary.bias === 'bullish'
 ? 'Bullish premium-selling bias.'
 : summary.bias === 'bearish'
 ? 'Bearish premium-selling bias.'
 : 'Neutral premium-selling bias.';
 const theta = Number(summary.totalTheta || 0) >= 0
 ? 'Theta works in favor of the structure.'
 : 'Theta works against the structure.';
 const vega = Number(summary.totalVega || 0) > 0.01
 ? 'Long volatility exposure.'
 : Number(summary.totalVega || 0) < -0.01
 ? 'Short volatility exposure.'
 : 'Volatility exposure is near flat.';
 const risk = summary.undefinedRisk
 ? 'Loss is undefined on at least one tail, so automation should stay disabled unless explicit override is on.'
 : 'Risk is capped by hedge wings.';
 return `${bias} ${theta} ${vega} ${risk}`;
 }

 function sanitizeOptionLeg(raw = {}) {
 return sanitizeOptionsBuilderLeg(raw || {});
 }

 /* ===================================================================
 Native Straddle (MV-) Scoring & Selection
 =================================================================== */
 const NATIVE_STRADDLE_SOFT_GATE_SCORE = 70;
 const NATIVE_STRADDLE_DEFAULT_FEE_PCT_PER_SIDE = 0.059;

 function classifyNativeStraddleExpiryRisk(daysToExpiry = 0, gammaScore = 0) {
 const hours = Math.max(0, Number(daysToExpiry || 0) * 24);
 if (hours <= 8) return { key: 'expiry_now', label: 'Expiry Crunch', tone: 'loss', summary: 'Same-session gamma is extreme. Only trade with very tight execution and monitoring.' };
 if (hours <= 24 || Number(gammaScore || 0) < 0.4) return { key: 'same_day', label: 'Same-Day Gamma', tone: 'warn', summary: 'Short DTE needs tighter spread, stronger score, and faster exits.' };
 if (hours <= 72) return { key: 'short_dte', label: 'Fast Theta', tone: 'info', summary: 'Theta is attractive, but stop and time-exit discipline matter.' };
 return { key: 'balanced', label: 'Balanced Carry', tone: 'profit', summary: 'Theta carry is steadier and less dominated by same-session gamma.' };
 }

 function resolveNativeStraddleRegime(input = {}) {
 const iv = Number(input.iv || 0) * 100;
 const atmScore = Number(input.atmScore || 0);
 const thetaMarginPct = Number(input.thetaMarginRatioPct || 0);
 const moveFit = Number(input.moveFitScore || 0);
 const marketContext = buildNativeStraddleMarketContext(input.marketContext || input.btcContext || {});
 if (marketContext.recommendedSide === 'buy') {
 return { key: 'buy_vol_watch', label: 'Buy Vol Watch', tone: 'loss', summary: marketContext.summary };
 }
 if (marketContext.recommendedSide === 'wait') {
 return { key: 'wait_btc', label: 'Wait for BTC', tone: 'warn', summary: marketContext.summary };
 }
 if (iv >= 40 && thetaMarginPct >= 0.4 && atmScore >= 0.8 && moveFit >= 0.8) {
 return { key: 'premium_rich', label: 'Neutral Premium Rich', tone: 'profit', summary: 'ATM premium, carry, and range fit all line up for short-vol carry.' };
 }
 if (atmScore >= 0.72 && thetaMarginPct >= 0.25) {
 return { key: 'balanced', label: 'Balanced Neutral', tone: 'info', summary: 'Carry is reasonable, but the edge is more execution-sensitive than regime-driven.' };
 }
 return { key: 'watch', label: 'Watch', tone: 'warn', summary: 'The setup is tradable only if execution and risk constraints stay tight.' };
 }

 function buildNativeStraddleMarketContext(input = {}) {
 const underlying = String(input.underlying || input.symbol || 'BTC').trim().toUpperCase() || 'BTC';
 const price = Number(input.price || input.markPrice || input.spotPrice || input.underlyingPrice || 0);
 const chartRead = input.chartRead && typeof input.chartRead === 'object' ? input.chartRead : {};
 const change24h = Number(input.change24h || input.priceChange24hPct || input.changePct24h || 0);
 const move4h = Number(input.move4h ?? input.change4h ?? input.priceChange4hPct ?? chartRead.move4h ?? 0);
 const chartMove2h = Number(input.chartMove2h ?? chartRead.move2h ?? 0);
 const atrPct15m = Math.max(0, Number(input.atrPct15m ?? chartRead.atrPct15m ?? 0));
 const emaSpreadPct15m = Number(input.emaSpreadPct15m ?? chartRead.emaSpreadPct15m ?? 0);
 const rangeCompression = Math.max(0, Math.min(1, Number(input.rangeCompression ?? chartRead.rangeCompression ?? 0)));
 const trendState = String(input.trendState || chartRead.trendState || '').toLowerCase();
 const breakoutRisk = !!(input.breakoutRisk || chartRead.breakoutRisk);
 const fundingRate = Number(input.fundingRate || input.funding_rate || input.funding || 0);
 const trendScore = Math.max(0, Math.min(100, Number(input.trendScore || input.score || 50)));
 const abs24 = Math.abs(change24h);
 const abs4 = Math.abs(move4h);
 const abs2 = Math.abs(chartMove2h);
 const emaSpreadAbs = Math.abs(emaSpreadPct15m);
 const fundingAbs = Math.abs(fundingRate);
 let sellPremiumScore = 62;
 if (abs24 <= 1.2) sellPremiumScore += 10;
 else if (abs24 <= 2.5) sellPremiumScore += 4;
 else if (abs24 <= 4) sellPremiumScore -= 8;
 else if (abs24 <= 7) sellPremiumScore -= 22;
 else sellPremiumScore -= 38;
 if (abs4 >= 2.5) sellPremiumScore -= 14;
 else if (abs4 >= 1.4) sellPremiumScore -= 7;
 if (fundingAbs >= 0.05) sellPremiumScore -= 12;
 else if (fundingAbs >= 0.025) sellPremiumScore -= 6;
 if (trendScore >= 72 || trendScore <= 28) sellPremiumScore -= 8;
 else if (trendScore >= 44 && trendScore <= 56) sellPremiumScore += 5;
 if (atrPct15m >= 1.15) sellPremiumScore -= 18;
 else if (atrPct15m >= 0.75) sellPremiumScore -= 10;
 else if (atrPct15m > 0 && atrPct15m <= 0.35) sellPremiumScore += 5;
 if (emaSpreadAbs >= 1.1) sellPremiumScore -= 12;
 else if (emaSpreadAbs >= 0.65) sellPremiumScore -= 7;
 if (abs2 >= 1.4) sellPremiumScore -= 8;
 if (breakoutRisk) sellPremiumScore -= 14;
 if (trendState === 'expanding') sellPremiumScore -= 18;
 else if (trendState === 'compressed' && abs4 <= 1.2 && atrPct15m <= 0.55) sellPremiumScore += 10;
 else if (rangeCompression >= 0.6 && abs4 <= 1.2) sellPremiumScore += 6;
 sellPremiumScore = Math.max(0, Math.min(100, Math.round(sellPremiumScore)));
 const directionalBias = chartRead.directionalBias || (move4h >= 1.2 || emaSpreadPct15m >= 0.55 || change24h >= 2.5 || trendScore >= 68 ? 'bullish' : move4h <= -1.2 || emaSpreadPct15m <= -0.55 || change24h <= -2.5 || trendScore <= 32 ? 'bearish' : 'neutral');
 const hardExpansion = trendState === 'expanding' || breakoutRisk || abs4 >= 1.8 || abs2 >= 1.1 || atrPct15m >= 0.75 || emaSpreadAbs >= 0.65;
 const calmForSell = !hardExpansion
 && abs24 <= 3
 && abs4 <= 1.2
 && abs2 <= 0.8
 && atrPct15m <= 0.55
 && emaSpreadAbs <= 0.45
 && trendScore >= 38
 && trendScore <= 62;
 const recommendedSide = calmForSell && sellPremiumScore >= 68 ? 'sell' : (hardExpansion || sellPremiumScore <= 42 ? 'buy' : 'wait');
 const label = recommendedSide === 'sell'
 ? 'Sell premium'
 : recommendedSide === 'buy'
 ? 'Buy-vol watch'
 : 'Wait';
 const tone = recommendedSide === 'sell' ? 'profit' : recommendedSide === 'buy' ? 'loss' : 'warn';
 const chartPhrase = chartRead.symbol
 ? `${chartRead.symbol} 15m ${trendState || 'chart'}: ${move4h.toFixed(2)}% 4h, ATR ${atrPct15m.toFixed(2)}%.`
 : '';
 const summary = recommendedSide === 'sell'
 ? `${underlying} chart is calm enough for short straddle scoring. ${chartPhrase}`.trim()
 : recommendedSide === 'buy'
 ? `${underlying} chart is expanding too strongly for fresh short premium; long-vol or no-trade is safer. ${chartPhrase}`.trim()
 : `${underlying} chart is not clean enough for fresh short premium yet. ${chartPhrase}`.trim();
 return {
 underlying,
 price,
 change24h,
 move4h,
 chartMove2h,
 atrPct15m,
 emaSpreadPct15m,
 rangeCompression,
 trendState,
 breakoutRisk,
 fundingRate,
 trendScore,
 absMoveScore: Math.max(abs24, abs4),
 sellPremiumScore,
 hardExpansion,
 calmForSell,
 directionalBias,
 recommendedSide,
 label,
 tone,
 summary,
 chartRead: {
 ...chartRead,
 move4h,
 move2h: chartMove2h,
 atrPct15m,
 emaSpreadPct15m,
 rangeCompression,
 trendState,
 breakoutRisk,
 },
 };
 }

 function normalizeNativeStraddleBias(direction = 'neutral', settings = {}, context = {}) {
 const raw = String(
 context.rangeBias
 || context.marketBias
 || settings.marketBias
 || direction
 || 'neutral'
 ).toLowerCase();
 if (['bullish', 'long', 'watch_long'].includes(raw)) return 'bullish';
 if (['bearish', 'short', 'watch_short'].includes(raw)) return 'bearish';
 return 'neutral';
 }

 function analyzeNativeStraddleContract(contract = {}, spotPrice = 0, direction = 'neutral', settings = {}, context = {}) {
 const cfg = sanitizeOptionsAutomationSettings(settings);
 const spot = Math.max(0.00000001, Number(spotPrice || contract.spotPrice || contract.underlyingPrice || 0));
 const strike = Number(contract.strike || 0);
 const mark = Number(contract.markPrice || contract.mark || contract.entryPrice || 0);
 const bid = Number(contract.bid || contract.bidPrice || 0);
 const ask = Number(contract.ask || contract.askPrice || 0);
 const volume = Number(contract.volume || 0);
 const oi = Number(contract.oiContracts || contract.openInterest || 0);
 const theta = Number(contract.theta || 0);
 const iv = Number(contract.iv || contract.impliedVolatility || 0);
 const dte = Math.max(0, Number(contract.daysToExpiry || context.daysToExpiry || 0));
 const contractMultiplier = Math.max(0.000001, Number(contract.contractMultiplier || contract.contractValue || 1));
 if (mark <= 0 || strike <= 0) {
 return {
 score: 0,
 spot,
 strike,
 markPrice: mark,
 contractMultiplier,
 breakEvenLow: strike,
 breakEvenHigh: strike,
 expectedMoveWidth: 0,
 premiumPerContract: 0,
 thetaPerContractUSD: 0,
 spreadPct: 100,
 stopLossPct: Math.max(0, Number(context.stopLossPct ?? cfg.legStopLossPct ?? 30)),
 };
 }

 const premiumPerContract = mark * contractMultiplier;
 const thetaPerContractUSD = Math.abs(theta) * contractMultiplier;
 const breakEvenLow = strike - mark;
 const breakEvenHigh = strike + mark;
 const expectedMoveWidth = Math.max(0, breakEvenHigh - breakEvenLow);
 const expectedMovePct = spot > 0 ? (expectedMoveWidth / spot) * 100 : 0;
 const stopLossPct = Math.max(0, Number(context.stopLossPct ?? cfg.legStopLossPct ?? 30));
 const spreadPct = (bid > 0 && ask > 0 && mark > 0) ? ((ask - bid) / mark) * 100 : 100;

 const atmScore = Math.max(0, Math.min(1, 1 - Math.abs(strike - spot) / Math.max(spot * 0.04, 1)));
 const thetaYield = Math.abs(theta) / Math.max(mark, 1);
 const thetaScore = Math.max(0, Math.min(1, thetaYield * 12));
 const volScore = Math.max(0, Math.min(1, volume / 120));
 const oiScore = Math.max(0, Math.min(1, oi / 4000));
 const liquidityScore = volScore * 0.45 + oiScore * 0.55;
 const spreadScore = Math.max(0, Math.min(1, 1 - spreadPct / 8));
 const gammaScore = dte < 0.5 ? 0.12 : dte < 1 ? 0.35 : dte < 2 ? 0.58 : dte <= 7 ? 0.86 : 0.72;
 const moveFitScore = expectedMovePct <= 0 ? 0
 : expectedMovePct < 1 ? 0.35
 : expectedMovePct <= 4 ? 0.82
 : expectedMovePct <= 8 ? 1
 : expectedMovePct <= 12 ? 0.72
 : 0.4;

 const marketContext = buildNativeStraddleMarketContext(context.marketContext || context.btcContext || contract.marketContext || {
 underlying: contract.underlying,
 price: spot,
 });
 const bias = normalizeNativeStraddleBias(direction, cfg, { ...context, marketBias: marketContext.directionalBias });
 let regimeScore = 0.62;
 if (bias === 'neutral') regimeScore = atmScore > 0.75 ? 0.95 : 0.72;
 else if (bias === 'bullish') regimeScore = strike >= spot ? 0.72 : 0.38;
 else if (bias === 'bearish') regimeScore = strike <= spot ? 0.72 : 0.38;
 const marketScore = marketContext.sellPremiumScore / 100;

 const contractScore = (
 atmScore * 24 +
 thetaScore * 18 +
 liquidityScore * 18 +
 spreadScore * 14 +
 gammaScore * 12 +
 moveFitScore * 8 +
 regimeScore * 6
 );
 const rawScore = contractScore * 0.82 + marketScore * 18;

 return {
 score: Math.max(0, Math.min(100, Math.round(rawScore))),
 spot,
 strike,
 markPrice: mark,
 bid,
 ask,
 volume,
 oiContracts: oi,
 theta,
 iv,
 daysToExpiry: dte,
 contractMultiplier,
 premiumPerContract,
 thetaPerContractUSD,
 spreadPct,
 breakEvenLow,
 breakEvenHigh,
 expectedMoveWidth,
 expectedMovePct,
 stopLossPct,
 marketContext,
 components: {
 atmScore,
 thetaScore,
 liquidityScore,
 spreadScore,
 gammaScore,
 moveFitScore,
 regimeScore,
 marketScore,
 },
 };
 }

 function buildNativeStraddleTicketPreview(input = {}, settings = {}, context = {}) {
 const qty = Math.max(1, Math.round(Number(input.qty || input.quantity || 1)));
 const cfg = sanitizeOptionsAutomationSettings(settings);
 const orderSide = String(input.orderSide || input.side || context.orderSide || 'sell').trim().toLowerCase() === 'buy' ? 'buy' : 'sell';
 const analysis = analyzeNativeStraddleContract(input, input.spotPrice, context.direction || 'neutral', cfg, {
 ...context,
 stopLossPct: input.stopLossPct ?? context.stopLossPct ?? cfg.legStopLossPct,
 });
 const premiumUSD = analysis.premiumPerContract * qty;
 const stopLossPct = analysis.stopLossPct;
 const stopPrice = orderSide === 'buy'
 ? analysis.markPrice * Math.max(0, (100 - stopLossPct) / 100)
 : analysis.markPrice * (1 + stopLossPct / 100);
 const stopLossPerContractUSD = orderSide === 'buy'
 ? Math.max(0, (analysis.markPrice - stopPrice) * analysis.contractMultiplier)
 : Math.max(0, (stopPrice - analysis.markPrice) * analysis.contractMultiplier);
 const stopLossUSD = stopLossPerContractUSD * qty;
 const feePctPerSide = Math.max(0, Number(context.feePctPerSide ?? input.feePctPerSide ?? NATIVE_STRADDLE_DEFAULT_FEE_PCT_PER_SIDE));
 const estimatedFeesUSD = premiumUSD * (feePctPerSide / 100);
 const estimatedMarginUSD = Math.max(premiumUSD, stopLossUSD);
 const estimatedMarginPerContractUSD = qty > 0 ? (estimatedMarginUSD / qty) : estimatedMarginUSD;
 const thetaMarginRatioPct = estimatedMarginPerContractUSD > 0
 ? (analysis.thetaPerContractUSD / estimatedMarginPerContractUSD) * 100
 : 0;
 const profileMaxOrderSizeUSD = Math.max(0, Number(context.profileMaxOrderSizeUSD || input.profileMaxOrderSizeUSD || 0));
 const maxContractsByProfileCap = analysis.premiumPerContract > 0 && profileMaxOrderSizeUSD > 0
 ? Math.max(0, Math.floor(profileMaxOrderSizeUSD / analysis.premiumPerContract))
 : 0;
 const strategyBudgetUSD = Math.max(0, Number(context.strategyBudgetUSD || input.strategyBudgetUSD || cfg.maxRiskUSD || 0));
 const softGateThreshold = Math.max(0, Number(context.softGateThreshold || input.softGateThreshold || cfg.minTradeQuality || NATIVE_STRADDLE_SOFT_GATE_SCORE));
 const marketContext = buildNativeStraddleMarketContext(context.marketContext || context.btcContext || input.marketContext || analysis.marketContext || {});
 const sameDayRisk = Number(analysis.daysToExpiry || 0) <= 1;
 const hardChecks = [
 {
 key: 'premium_credit',
 label: 'Premium / Ct',
 passed: analysis.premiumPerContract >= Number(cfg.minPremiumPerContractUSD || 0),
 detail: `${analysis.premiumPerContract.toFixed(2)} vs min ${Number(cfg.minPremiumPerContractUSD || 0).toFixed(2)}`,
 },
 {
 key: 'theta_margin',
 label: 'Theta / Margin',
 passed: thetaMarginRatioPct >= Number(cfg.minThetaMarginRatioPct || 0),
 detail: `${thetaMarginRatioPct.toFixed(2)}% vs min ${Number(cfg.minThetaMarginRatioPct || 0).toFixed(2)}%`,
 },
 {
 key: 'spread',
 label: 'Spread',
 passed: !sameDayRisk || analysis.spreadPct <= Number(cfg.sameDayMaxSpreadPct || 100),
 detail: `${analysis.spreadPct.toFixed(2)}%${sameDayRisk ? ` vs max ${Number(cfg.sameDayMaxSpreadPct || 0).toFixed(2)}%` : ''}`,
 },
 {
 key: 'same_day_score',
 label: 'Same-Day Score',
 passed: !sameDayRisk || analysis.score >= Number(cfg.sameDayMinScore || 0),
 detail: sameDayRisk ? `${analysis.score} vs min ${Number(cfg.sameDayMinScore || 0)}` : 'Not same-day constrained',
 },
 {
 key: 'btc_market_score',
 label: `${marketContext.underlying || 'BTC'} Score`,
 passed: orderSide === 'buy' ? marketContext.recommendedSide === 'buy' : marketContext.recommendedSide === 'sell',
 detail: `${marketContext.sellPremiumScore}/100 - ${marketContext.label} for ${orderSide === 'buy' ? 'buy vol' : 'short premium'}`,
 },
 {
 key: 'profile_cap',
 label: 'Profile Cap',
 passed: !(profileMaxOrderSizeUSD > 0) || premiumUSD <= profileMaxOrderSizeUSD,
 detail: profileMaxOrderSizeUSD > 0 ? `${premiumUSD.toFixed(2)} / ${profileMaxOrderSizeUSD.toFixed(2)}` : 'No cap data',
 },
 ];
 const blockedReasons = hardChecks.filter(check => !check.passed).map(check => check.detail ? `${check.label}: ${check.detail}` : check.label);
 const actionLabel = orderSide === 'buy' ? 'Buy Vol' : 'Sell Premium';
 const expiryRisk = classifyNativeStraddleExpiryRisk(analysis.daysToExpiry, analysis.components?.gammaScore || 0);
 const regime = resolveNativeStraddleRegime({
 iv: analysis.iv,
 atmScore: analysis.components?.atmScore || 0,
 thetaMarginRatioPct,
 moveFitScore: analysis.components?.moveFitScore || 0,
 marketContext,
 });
 const premiumToSpotPct = analysis.spot > 0 ? (analysis.premiumPerContract / analysis.spot) * 100 : 0;
 const profileCapUsagePct = profileMaxOrderSizeUSD > 0 ? (premiumUSD / profileMaxOrderSizeUSD) * 100 : 0;
 const strategyBudgetUsagePct = strategyBudgetUSD > 0 ? (estimatedMarginUSD / strategyBudgetUSD) * 100 : 0;
 const contractThesis = [
 { key: 'atm_distance', label: 'ATM Distance', value: `${Math.abs(analysis.strike - analysis.spot).toFixed(0)} pts` },
 { key: 'premium_spot', label: 'Credit / Spot', value: `${premiumToSpotPct.toFixed(2)}%` },
 { key: 'theta_margin', label: 'Theta / Margin', value: `${thetaMarginRatioPct.toFixed(2)}% / day` },
 { key: 'spread_cost', label: 'Spread Cost', value: `${analysis.spreadPct.toFixed(2)}%` },
 { key: 'move_cover', label: 'Move Width', value: `${analysis.expectedMovePct.toFixed(2)}%` },
 { key: 'btc_score', label: `${marketContext.underlying || 'BTC'} Score`, value: `${marketContext.sellPremiumScore}/100 ${marketContext.label}` },
 ];

 let canPlace = true;
 let reason = '';
 if (!(analysis.markPrice > 0) || !(analysis.premiumPerContract > 0)) {
 canPlace = false;
 reason = 'Missing valid premium';
 } else if (blockedReasons.length) {
 canPlace = false;
 reason = blockedReasons[0];
 } else if (orderSide === 'sell' && marketContext.recommendedSide !== 'sell') {
 canPlace = false;
 reason = `${marketContext.underlying || 'BTC'} score favors ${marketContext.label}; short straddle sell is blocked.`;
 } else if (orderSide === 'buy' && marketContext.recommendedSide !== 'buy') {
 canPlace = false;
 reason = `${marketContext.underlying || 'BTC'} score favors ${marketContext.label}; long straddle buy is blocked.`;
 } else if (profileMaxOrderSizeUSD > 0 && premiumUSD > profileMaxOrderSizeUSD) {
 canPlace = false;
 reason = `Premium credit $${premiumUSD.toFixed(2)} exceeds profile cap $${profileMaxOrderSizeUSD.toFixed(2)}`;
 } else if (profileMaxOrderSizeUSD > 0 && maxContractsByProfileCap <= 0) {
 canPlace = false;
 reason = 'Profile cap too small for one contract';
 }

 return {
 ...analysis,
 qty,
 orderSide,
 actionLabel,
 entryMode: sanitizeOptionEntryMode(input.entryMode || cfg.entryMode || 'limit'),
 premiumUSD,
 estimatedNotionalUSD: premiumUSD,
 estimatedFeesUSD,
 estimatedMarginUSD,
 stopLossPct,
 stopPrice,
 stopLossPerContractUSD,
 stopLossUSD,
 estimatedMarginPerContractUSD,
 thetaMarginRatioPct,
 breakEvenLow: analysis.breakEvenLow,
 breakEvenHigh: analysis.breakEvenHigh,
 expectedMoveWidth: analysis.expectedMoveWidth,
 premiumToSpotPct,
 profileMaxOrderSizeUSD,
 profileCapUsagePct,
 strategyBudgetUSD,
 strategyBudgetUsagePct,
 maxContractsByProfileCap,
 softGateThreshold,
 warningRequired: analysis.score < softGateThreshold,
 recommendedSide: marketContext.recommendedSide,
 marketContext,
 hardChecks,
 blockedReasons,
 regime,
 expiryRisk,
 contractThesis,
 canPlace,
 reason,
 };
 }

 function scoreNativeStraddleContract(contract = {}, spotPrice = 0, direction = 'neutral', settings = {}, context = {}) {
 return analyzeNativeStraddleContract(contract, spotPrice, direction, settings, context).score;
 }

 function selectBestNativeStraddle(contracts = [], spotPrice = 0, direction = 'neutral', settings = {}, context = {}) {
 const cfg = sanitizeOptionsAutomationSettings(settings);
 const spot = Math.max(0.00000001, Number(spotPrice || 0));
 const eligible = (Array.isArray(contracts) ? contracts : []).filter(c => {
 if (!(Number(c.markPrice || 0) > 0)) return false;
 const dte = Number(c.daysToExpiry || 0);
 return dte >= cfg.minDte && dte <= cfg.maxDte;
 });
 if (!eligible.length) return null;
 let best = null;
 for (const contract of eligible) {
 const score = scoreNativeStraddleContract(contract, spot, direction, cfg, context);
 if (!best || score > best.score) best = { contract, score };
 }
 return best;
 }

 const exportedApi = Object.freeze({
 DEFAULT_RISK_FREE_RATE,
 OPTION_AUTOMATION_ALLOWED_EXPIRY_BUCKETS,
 OPTION_ENTRY_MODES,
 OPTION_RANGE_STEPS,
 OPTION_UNDERLYINGS,
 buildNativeStraddleMarketContext,
 estimateOptionMarkAtDate,
 formatDeltaOptionSymbol,
 formatOptionsExpiryKey,
 getOptionsExpiryBucket,
 intrinsicValue,
 normalCdf,
 pickClosestDeltaContract,
 parseDeltaOptionSymbol,
 sanitizeOptionEntryMode,
 sanitizeOptionLeg,
 sanitizeOptionLegSide,
 sanitizeOptionType,
 sanitizeOptionsAutoTradeSettings: sanitizeOptionsAutomationSettings,
 sanitizeOptionsAutomationSettings,
 sanitizeOptionsBuilderLeg,
 sanitizeOptionsExpiryBuckets,
 sanitizeOptionsStrategyTypes,
 sanitizeOptionsUnderlyingList,
 analyzeNativeStraddleContract,
 buildNativeStraddleTicketPreview,
 classifyNativeStraddleExpiryRisk,
 NATIVE_STRADDLE_SOFT_GATE_SCORE,
 resolveNativeStraddleRegime,
 scoreNativeStraddleContract,
 selectBestNativeStraddle,
 toYearFraction,
 });

 globalThis.FWDTradeDeskOptions = exportedApi;
 globalThis.FWDTradeDeskOptionsShared = exportedApi;
})();
