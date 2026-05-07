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
 skewVetoEnabled: raw.skewVetoEnabled !== false,
 maxBearishSkewRR: clampNumber(raw.maxBearishSkewRR, -6, -50, 50, 2),
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

 function analyzeOptionsStrategy(input = {}) {
 const nowTs = Number(input.nowTs || Date.now());
 const spotPrice = Math.max(0.00000001, Number(input.spotPrice || input.currentPrice || 0));
 const legs = (Array.isArray(input.legs) ? input.legs : [])
 .map(sanitizeOptionsBuilderLeg)
 .filter(leg => leg.symbol && leg.underlying && leg.strike > 0 && leg.expiryTs > 0);
 const riskFreeRate = Number.isFinite(Number(input.riskFreeRate)) ? Number(input.riskFreeRate) : DEFAULT_RISK_FREE_RATE;
 if (!legs.length || spotPrice <= 0) {
 return {
 ok: false,
 summary: {
 netPremium: 0,
 netPremiumLabel: 'No legs',
 maxProfit: 0,
 maxLoss: 0,
 breakevens: [],
 totalTheta: 0,
 totalDelta: 0,
 totalGamma: 0,
 totalVega: 0,
 totalRho: 0,
 bias: 'neutral',
 undefinedRisk: false,
 notes: 'Add one or more valid option legs to analyze the structure.',
 },
 payoffPoints: [],
 pnlTable: [],
 greeksTable: [],
 };
 }
 const nearestExpiryTs = Math.min(...legs.map(leg => leg.expiryTs));
 const targetTs = Number(input.targetTs || (nowTs + Math.max(0, nearestExpiryTs - nowTs) * 0.5));
 const targetPrice = Number(input.targetPrice || spotPrice);
 const priceRange = Array.isArray(input.priceRange) && input.priceRange.length
 ? input.priceRange.map(value => Number(value)).filter(Number.isFinite)
 : buildStrategyPriceRange(legs, spotPrice, OPTION_RANGE_STEPS);
 const netPremium = legs.reduce((sum, leg) => {
 const direction = sanitizeOptionLegSide(leg.side) === 'buy' ? -1 : 1;
 return sum + direction * Number(leg.premium || 0) * getLegQuantity(leg) * getLegContractMultiplier(leg);
 }, 0);
 const greeksTable = legs.map(leg => {
 const greeks = getLegCurrentGreeks(leg, spotPrice, nowTs, riskFreeRate);
 const multiplier = getLegDirectionMultiplier(leg) * getLegQuantity(leg) * getLegContractMultiplier(leg);
 return {
 symbol: leg.symbol,
 side: leg.side,
 optionType: leg.optionType,
 strike: leg.strike,
 expiryKey: leg.expiryKey,
 delta: clampNumber(greeks.delta * multiplier, 0, -1000000, 1000000, 6),
 gamma: clampNumber(greeks.gamma * multiplier, 0, -1000000, 1000000, 6),
 theta: clampNumber(greeks.theta * multiplier, 0, -1000000, 1000000, 6),
 vega: clampNumber(greeks.vega * multiplier, 0, -1000000, 1000000, 6),
 rho: clampNumber(greeks.rho * multiplier, 0, -1000000, 1000000, 6),
 };
 });
 const payoffPoints = priceRange.map(price => {
 const expiryPnl = legs.reduce((sum, leg) => sum + calculateLegPnl(leg, intrinsicValue(leg.optionType, price, leg.strike)), 0);
 const targetPnl = legs.reduce((sum, leg) => sum + calculateLegPnl(leg, estimateOptionMarkAtDate(leg, price, targetTs, riskFreeRate)), 0);
 return {
 price: +Number(price).toFixed(2),
 expiryPnl: +expiryPnl.toFixed(2),
 targetPnl: +targetPnl.toFixed(2),
 };
 });
 const tailProfile = inferTailProfile(legs);
 const finitePnls = payoffPoints.map(point => Number(point.expiryPnl || 0)).filter(Number.isFinite);
 const maxProfit = tailProfile.lowInfiniteProfit || tailProfile.highInfiniteProfit ? Number.POSITIVE_INFINITY : Math.max(...finitePnls);
 const maxLoss = tailProfile.lowInfiniteLoss || tailProfile.highInfiniteLoss ? Number.POSITIVE_INFINITY : Math.abs(Math.min(...finitePnls));
 const breakevens = interpolateBreakevens(payoffPoints);
 const avgIv = legs.reduce((sum, leg) => sum + Number(leg.iv || 0), 0) / Math.max(1, legs.length);
 const yearsToNearestExpiry = toYearFraction(nowTs, nearestExpiryTs);
 const pop = estimateProbabilityOfProfit(payoffPoints, spotPrice, avgIv, yearsToNearestExpiry, riskFreeRate);
 const totals = greeksTable.reduce((accumulator, leg) => {
 accumulator.delta += Number(leg.delta || 0);
 accumulator.gamma += Number(leg.gamma || 0);
 accumulator.theta += Number(leg.theta || 0);
 accumulator.vega += Number(leg.vega || 0);
 accumulator.rho += Number(leg.rho || 0);
 return accumulator;
 }, { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 });
 const currentPnl = legs.reduce((sum, leg) => sum + calculateLegPnl(leg, Number(leg.markPrice || leg.premium || 0)), 0);
 const targetPnlAtSpot = legs.reduce((sum, leg) => sum + calculateLegPnl(leg, estimateOptionMarkAtDate(leg, targetPrice, targetTs, riskFreeRate)), 0);
 const bias = Number(totals.delta || 0) > 0.03 ? 'bullish' : Number(totals.delta || 0) < -0.03 ? 'bearish' : 'neutral';
 const undefinedRisk = tailProfile.lowInfiniteLoss || tailProfile.highInfiniteLoss;
 const summary = {
 spotPrice: +spotPrice.toFixed(2),
 targetPrice: +targetPrice.toFixed(2),
 targetTs,
 nearestExpiryTs,
 nearestExpiryKey: formatOptionsExpiryKey(nearestExpiryTs),
 netPremium: +netPremium.toFixed(2),
 netPremiumLabel: netPremium >= 0 ? 'Net Credit' : 'Net Debit',
 maxProfit: Number.isFinite(maxProfit) ? +maxProfit.toFixed(2) : Number.POSITIVE_INFINITY,
 maxLoss: Number.isFinite(maxLoss) ? +maxLoss.toFixed(2) : Number.POSITIVE_INFINITY,
 breakevens,
 currentPnl: +currentPnl.toFixed(2),
 targetPnlAtSpot: +targetPnlAtSpot.toFixed(2),
 totalDelta: +totals.delta.toFixed(4),
 totalGamma: +totals.gamma.toFixed(4),
 totalTheta: +totals.theta.toFixed(4),
 totalVega: +totals.vega.toFixed(4),
 totalRho: +totals.rho.toFixed(4),
 pop,
 bias,
 rewardRiskRatio: Number.isFinite(maxProfit) && Number.isFinite(maxLoss) && maxLoss > 0 ? +(maxProfit / maxLoss).toFixed(2) : null,
 undefinedRisk,
 };
 summary.notes = buildStrategyNarrative(summary);
 const priceTargets = [spotPrice * 0.9, spotPrice * 0.95, spotPrice, spotPrice * 1.05, spotPrice * 1.1].map(value => +value.toFixed(2));
 const pnlTable = priceTargets.map(price => {
 const rowPoint = payoffPoints.reduce((best, point) => !best || Math.abs(Number(point.price) - price) < Math.abs(Number(best.price) - price) ? point : best, null);
 return {
 price,
 expiryPnl: rowPoint ? rowPoint.expiryPnl : 0,
 targetPnl: rowPoint ? rowPoint.targetPnl : 0,
 };
 });
 return { ok: true, summary, payoffPoints, pnlTable, greeksTable };
 }

 function getOptionSpreadPct(contract = {}) {
 const bid = Number((contract.bid ?? contract.bidPrice) || 0);
 const ask = Number((contract.ask ?? contract.askPrice) || 0);
 const mark = Number((contract.markPrice ?? contract.premium ?? contract.entryPrice) || 0);
 if (bid <= 0 || ask <= 0 || mark <= 0 || ask < bid) return 1;
 return Math.max(0, (ask - bid) / mark);
 }

 function getContractDeltaAbs(contract = {}, optionType = '') {
 const value = Math.abs(Number(contract.delta || 0));
 if (value > 0) return value;
 if (sanitizeOptionType(optionType || contract.optionType) === 'put') return 0.2;
 return 0.2;
 }

 function scoreShortPremiumContract(contract = {}, settings = {}) {
 const safeSettings = sanitizeOptionsAutomationSettings(settings || {});
 const deltaAbs = getContractDeltaAbs(contract, contract.optionType);
 const deltaDistance = Math.abs(deltaAbs - safeSettings.targetDelta);
 const deltaFit = Math.max(0, 1 - (deltaDistance / Math.max(0.01, safeSettings.deltaTolerance * 1.5)));
 const oiScore = Math.min(1, Number(contract.oiContracts || 0) / Math.max(1, safeSettings.minOiContracts * 2));
 const spreadPct = getOptionSpreadPct(contract);
 const spreadScore = Math.max(0, 1 - (spreadPct / Math.max(0.01, safeSettings.maxBidAskSpreadPct * 1.2)));
 const thetaValue = Math.max(0, Number(contract.theta || 0) * -1);
 const thetaScore = Math.min(1, thetaValue / Math.max(1, Number(contract.markPrice || 0) || 1));
 const markPrice = Math.max(0.0001, Number(contract.markPrice || 0));
 const premiumYield = Math.min(1, markPrice / Math.max(1, Number(contract.strike || 0) * 0.03));
 return clampNumber((deltaFit * 0.28 + oiScore * 0.24 + spreadScore * 0.22 + thetaScore * 0.16 + premiumYield * 0.10) * 100, 0, 0, 100, 2);
 }

 function findNearestContract(contracts = [], predicate = () => true, score = () => Number.POSITIVE_INFINITY) {
 return (Array.isArray(contracts) ? contracts : [])
 .filter(predicate)
 .map(contract => ({ contract, score: Number(score(contract)) }))
 .filter(item => Number.isFinite(item.score))
 .sort((a, b) => a.score - b.score)[0]?.contract || null;
 }

 function buildStrategyFromChain(strategyType = '', snapshot = {}, overrides = {}) {
 const presetId = sanitizeText(strategyType, '', 40).toLowerCase();
 const rows = Array.isArray(snapshot.rows) ? snapshot.rows.slice() : [];
 const spotPrice = Math.max(0.00000001, Number(snapshot.spotPrice || 0));
 const safeOverrides = sanitizeOptionsAutomationSettings(overrides || {});
 if (!rows.length || spotPrice <= 0) return [];
 const sortedRows = rows.slice().sort((a, b) => Number(a.strike || 0) - Number(b.strike || 0));
 const atmRow = findNearestContract(sortedRows, row => row.call || row.put, row => Math.abs(Number(row.strike || 0) - spotPrice));
 const allCalls = sortedRows.map(row => row.call).filter(Boolean);
 const allPuts = sortedRows.map(row => row.put).filter(Boolean);
 const preferredCall = findNearestContract(
 allCalls,
 contract => Number(contract.ask || contract.markPrice || 0) > 0,
 contract => Math.abs(getContractDeltaAbs(contract, 'call') - safeOverrides.targetDelta) * 1000 + (100 - Number(contract.shortPremiumScore || scoreShortPremiumContract(contract, safeOverrides) || 0))
 );
 const preferredPut = findNearestContract(
 allPuts,
 contract => Number(contract.ask || contract.markPrice || 0) > 0,
 contract => Math.abs(getContractDeltaAbs(contract, 'put') - safeOverrides.targetDelta) * 1000 + (100 - Number(contract.shortPremiumScore || scoreShortPremiumContract(contract, safeOverrides) || 0))
 );
 const strikeSteps = sortedRows
 .map((row, index) => index > 0 ? Math.abs(Number(row.strike || 0) - Number(sortedRows[index - 1].strike || 0)) : 0)
 .filter(value => value > 0);
 const strikeStep = strikeSteps.length ? Math.max(100, Math.min(...strikeSteps)) : Math.max(100, spotPrice * 0.02);
 const callWing = preferredCall
 ? findNearestContract(
 allCalls,
 contract => Number(contract.strike || 0) > Number(preferredCall.strike || 0),
 contract => Math.abs(Number(contract.strike || 0) - (Number(preferredCall.strike || 0) + strikeStep * 2))
 )
 : null;
 const putWing = preferredPut
 ? findNearestContract(
 allPuts,
 contract => Number(contract.strike || 0) < Number(preferredPut.strike || 0),
 contract => Math.abs(Number(contract.strike || 0) - (Number(preferredPut.strike || 0) - strikeStep * 2))
 )
 : null;
 const atmCall = atmRow?.call || preferredCall;
 const atmPut = atmRow?.put || preferredPut;
 const buildLeg = (contract, side) => contract
 ? sanitizeOptionsBuilderLeg({
 symbol: contract.symbol,
 underlying: contract.underlying,
 optionType: contract.optionType,
 side,
 qty: 1,
 strike: contract.strike,
 expiryTs: contract.expiryTs,
 premium: contract.markPrice,
 markPrice: contract.markPrice,
 bid: contract.bid,
 ask: contract.ask,
 iv: contract.iv,
 contractValue: contract.contractValue,
 delta: contract.delta,
 gamma: contract.gamma,
 theta: contract.theta,
 vega: contract.vega,
 rho: contract.rho,
 oiContracts: contract.oiContracts,
 volumeContracts: contract.volumeContracts,
 entryMode: 'limit',
 })
 : null;

 let legs = [];
 if (presetId === 'short_straddle') {
 legs = [buildLeg(atmCall, 'sell'), buildLeg(atmPut, 'sell')];
 } else if (presetId === 'short_strangle') {
 legs = [buildLeg(preferredCall || atmCall, 'sell'), buildLeg(preferredPut || atmPut, 'sell')];
 } else if (presetId === 'iron_condor') {
 legs = [buildLeg(preferredPut || atmPut, 'sell'), buildLeg(putWing, 'buy'), buildLeg(preferredCall || atmCall, 'sell'), buildLeg(callWing, 'buy')];
 } else if (presetId === 'short_call_spread') {
 legs = [buildLeg(preferredCall || atmCall, 'sell'), buildLeg(callWing, 'buy')];
 } else if (presetId === 'short_put_spread') {
 legs = [buildLeg(preferredPut || atmPut, 'sell'), buildLeg(putWing, 'buy')];
 } else if (presetId === 'iron_fly') {
 legs = [
 buildLeg(atmPut, 'sell'),
 buildLeg(preferredPut && Number(preferredPut.strike || 0) < Number(atmPut?.strike || 0) ? preferredPut : putWing, 'buy'),
 buildLeg(atmCall, 'sell'),
 buildLeg(preferredCall && Number(preferredCall.strike || 0) > Number(atmCall?.strike || 0) ? preferredCall : callWing, 'buy'),
 ];
 } else if (presetId === 'jade_lizard') {
 legs = [buildLeg(preferredPut || atmPut, 'sell'), buildLeg(preferredCall || atmCall, 'sell'), buildLeg(callWing, 'buy')];
 }
 return legs.filter(Boolean);
 }

 function buildScenarioPriceRange(spotPrice = 0, priceRangePct = 0.18, points = 141) {
 const safeSpot = Math.max(0.00000001, Number(spotPrice || 0));
 const safeRangePct = Math.max(0.05, Math.min(0.8, Number(priceRangePct || 0.18)));
 const safePoints = Math.max(41, Math.min(401, Math.round(Number(points || 141))));
 const floor = safeSpot * (1 - safeRangePct);
 const ceiling = safeSpot * (1 + safeRangePct);
 return Array.from({ length: safePoints }, (_, index) => {
 const ratio = safePoints <= 1 ? 0 : index / (safePoints - 1);
 return +(floor + (ceiling - floor) * ratio).toFixed(2);
 });
 }

 function sanitizeOptionLeg(raw = {}) {
 return sanitizeOptionsBuilderLeg(raw || {});
 }

 function summarizeOptionStrategy(legs = [], context = {}) {
 const safeLegs = (Array.isArray(legs) ? legs : []).map(sanitizeOptionLeg).filter(leg => leg.symbol && leg.optionType);
 const nowTs = Date.now();
 const spotPrice = Math.max(0.00000001, Number(context.underlyingPrice || context.spotPrice || 0));
 const targetPrice = Math.max(0.00000001, Number(context.targetPrice || spotPrice));
 const targetDays = Math.max(0, Number(context.targetDays || Math.min(Number(context.daysToExpiry || 0), 3) || 0));
 const priceRange = buildScenarioPriceRange(spotPrice, context.priceRangePct || 0.18, context.points || 141);
 const analysis = analyzeOptionsStrategy({
 nowTs,
 spotPrice,
 targetTs: nowTs + (targetDays * 86400000),
 targetPrice,
 priceRange,
 riskFreeRate: Number.isFinite(Number(context.rate)) ? Number(context.rate) : DEFAULT_RISK_FREE_RATE,
 legs: safeLegs,
 });
 const summary = analysis.summary || {};
 return {
 ...summary,
 legs: safeLegs,
 hasUndefinedRisk: !!summary.undefinedRisk,
 greeks: {
 delta: Number(summary.totalDelta || 0),
 gamma: Number(summary.totalGamma || 0),
 theta: Number(summary.totalTheta || 0),
 vega: Number(summary.totalVega || 0),
 rho: Number(summary.totalRho || 0),
 },
 payoffPoints: Array.isArray(analysis.payoffPoints) ? analysis.payoffPoints : [],
 greeksTable: Array.isArray(analysis.greeksTable) ? analysis.greeksTable : [],
 targetDays,
 underlyingPrice: spotPrice,
 };
 }

 function buildOptionPnlTable(legs = [], context = {}) {
 const safeLegs = (Array.isArray(legs) ? legs : []).map(sanitizeOptionLeg).filter(leg => leg.symbol && leg.optionType);
 const nowTs = Date.now();
 const spotPrice = Math.max(0.00000001, Number(context.underlyingPrice || context.spotPrice || 0));
 const targetPrice = Math.max(0.00000001, Number(context.targetPrice || spotPrice));
 const targetDays = Math.max(0, Number(context.targetDays || Math.min(Number(context.daysToExpiry || 0), 3) || 0));
 const priceRange = buildScenarioPriceRange(spotPrice, context.priceRangePct || 0.18, context.points || 141);
 const analysis = analyzeOptionsStrategy({
 nowTs,
 spotPrice,
 targetTs: nowTs + (targetDays * 86400000),
 targetPrice,
 priceRange,
 riskFreeRate: Number.isFinite(Number(context.rate)) ? Number(context.rate) : DEFAULT_RISK_FREE_RATE,
 legs: safeLegs,
 });
 return (Array.isArray(analysis.payoffPoints) ? analysis.payoffPoints : []).map(point => ({
 price: Number(point.price || 0),
 movePct: spotPrice > 0 ? +((((Number(point.price || 0) / spotPrice) - 1) * 100).toFixed(2)) : 0,
 targetPnl: Number(point.targetPnl || 0),
 expiryPnl: Number(point.expiryPnl || 0),
 }));
 }

 function contractPassesShortPremiumFilters(contract = {}, settings = {}) {
 const safeSettings = sanitizeOptionsAutomationSettings(settings || {});
 const normalized = sanitizeOptionLeg(contract);
 const dte = Number(normalized.daysToExpiry || 0);
 if (dte < safeSettings.minDte || dte > safeSettings.maxDte) return false;
 if (!safeSettings.allowedExpiryBuckets.includes(getOptionsExpiryBucket(dte))) return false;
 if (Number(normalized.oiContracts || 0) < safeSettings.minOiContracts) return false;
 if (getOptionSpreadPct(normalized) > safeSettings.maxBidAskSpreadPct) return false;
 const score = scoreShortPremiumContract(normalized, safeSettings);
 if (score < safeSettings.minPremiumScore) return false;
 return true;
 }

 function selectSpreadWing(contracts = [], shortLeg = null, direction = 'bullish') {
 if (!shortLeg) return null;
 const directionKey = String(direction || '').trim().toLowerCase();
 const shortStrike = Number(shortLeg.strike || 0);
 const ordered = (Array.isArray(contracts) ? contracts : []).slice().sort((a, b) => Number(a.strike || 0) - Number(b.strike || 0));
 if (directionKey === 'bullish') {
 return findNearestContract(
 ordered,
 contract => Number(contract.strike || 0) < shortStrike && Number(contract.askPrice || contract.ask || contract.markPrice || 0) > 0,
 contract => Math.abs(Number(contract.strike || 0) - (shortStrike * 0.97))
 );
 }
 return findNearestContract(
 ordered,
 contract => Number(contract.strike || 0) > shortStrike && Number(contract.askPrice || contract.ask || contract.markPrice || 0) > 0,
 contract => Math.abs(Number(contract.strike || 0) - (shortStrike * 1.03))
 );
 }

 function buildDirectionalCreditSpreadFromChain(contracts = [], direction = '', settings = {}) {
 const safeSettings = sanitizeOptionsAutomationSettings(settings || {});
 const directionKey = String(direction || '').trim().toLowerCase();
 const normalizedContracts = (Array.isArray(contracts) ? contracts : [])
 .map(sanitizeOptionLeg)
 .filter(contract => contract.symbol && contract.underlying && contract.expiryTs > 0);
 if (!normalizedContracts.length) return null;
 const groupedByExpiry = normalizedContracts.reduce((accumulator, contract) => {
 const key = contract.expiryKey || formatOptionsExpiryKey(contract.expiryTs);
 if (!accumulator.has(key)) accumulator.set(key, []);
 accumulator.get(key).push(contract);
 return accumulator;
 }, new Map());
 const expiryGroups = Array.from(groupedByExpiry.values()).sort((a, b) => Number(a[0]?.expiryTs || 0) - Number(b[0]?.expiryTs || 0));
 const templateId = directionKey === 'bullish' ? 'short_put_spread' : directionKey === 'bearish' ? 'short_call_spread' : '';
 if (!templateId) return null;
 for (const group of expiryGroups) {
 const underlyingPrice = Math.max(...group.map(contract => Number(contract.underlyingPrice || 0)), 0);
 const candidates = group
 .filter(contract => contractPassesShortPremiumFilters(contract, safeSettings))
 .filter(contract => directionKey === 'bullish' ? contract.optionType === 'put' : contract.optionType === 'call')
 .filter(contract => directionKey === 'bullish'
 ? Number(contract.strike || 0) <= underlyingPrice
 : Number(contract.strike || 0) >= underlyingPrice)
 .map(contract => ({
 ...contract,
 shortPremiumScore: scoreShortPremiumContract(contract, safeSettings),
 }))
 .sort((a, b) => Number(b.shortPremiumScore || 0) - Number(a.shortPremiumScore || 0));
 for (const shortLeg of candidates) {
 const sameTypeGroup = group.filter(contract => contract.optionType === shortLeg.optionType);
 const hedge = selectSpreadWing(sameTypeGroup, shortLeg, directionKey);
 if (!hedge) continue;
 const legs = [
 sanitizeOptionLeg({ ...shortLeg, side: 'sell', qty: 1 }),
 sanitizeOptionLeg({ ...hedge, side: 'buy', qty: 1 }),
 ];
 const summary = summarizeOptionStrategy(legs, {
 underlyingPrice: underlyingPrice || Number(shortLeg.underlyingPrice || 0),
 daysToExpiry: Number(shortLeg.daysToExpiry || 0),
 targetDays: Math.min(3, Math.max(0, Number(shortLeg.daysToExpiry || 0))),
 rate: DEFAULT_RISK_FREE_RATE,
 });
 const netPremium = Number(summary.netPremium || 0);
 if (!(netPremium > 0)) continue;
 if (!safeSettings.allowUndefinedRisk && summary.hasUndefinedRisk) continue;
 return {
 templateId,
 direction: directionKey,
 score: Number(shortLeg.shortPremiumScore || 0),
 shortLeg,
 hedgeLeg: hedge,
 legs,
 summary,
 };
 }
 }
 return null;
 }

 function buildShortStraddleForAutoTrade(chain = {}, settings = {}) {
 const rows = Array.isArray(chain.rows) ? chain.rows : [];
 const spot = Math.max(0.00000001, Number(chain.underlyingPrice || 0));
 const cfg = sanitizeOptionsAutomationSettings(settings);
 if (!rows.length || spot <= 0) return null;
 const sorted = rows.slice().sort((a, b) => Number(a.strike || 0) - Number(b.strike || 0));
 const atmRow = findNearestContract(sorted, row => row.call && row.put, row => Math.abs(Number(row.strike || 0) - spot));
 if (!atmRow?.call || !atmRow?.put) return null;
 const atmCall = atmRow.call;
 const atmPut = atmRow.put;
 if (!(Number(atmCall.markPrice || 0) > 0) || !(Number(atmPut.markPrice || 0) > 0)) return null;
 const dte = Math.max(Number(atmCall.daysToExpiry || 0), Number(atmPut.daysToExpiry || 0));
 if (dte < cfg.minDte || dte > cfg.maxDte) return null;
 if (cfg.straddleExpiryPreference === 'same_day' && dte > 1) return null;
 const buildLeg = (contract, side) => sanitizeOptionsBuilderLeg({
 symbol: contract.symbol, underlying: contract.underlying, optionType: contract.optionType,
 side, qty: 1, strike: contract.strike, expiryTs: contract.expiryTs,
 premium: contract.markPrice, markPrice: contract.markPrice, bid: contract.bid, ask: contract.ask,
 iv: contract.iv, contractValue: contract.contractValue, delta: contract.delta, gamma: contract.gamma,
 theta: contract.theta, vega: contract.vega, rho: contract.rho,
 contractMultiplier: contract.contractMultiplier, productId: contract.productId,
 impliedVolatility: contract.impliedVolatility || contract.iv,
 openInterest: contract.openInterest, daysToExpiry: contract.daysToExpiry,
 expiryKey: contract.expiryKey, underlyingPrice: spot,
 });
 const callLeg = buildLeg(atmCall, 'sell');
 const putLeg = buildLeg(atmPut, 'sell');
 const legs = [callLeg, putLeg];
 const summary = summarizeOptionStrategy(legs, {
 underlyingPrice: spot, daysToExpiry: dte, targetDays: Math.min(1, dte),
 rate: DEFAULT_RISK_FREE_RATE,
 });
 const netPremium = Number(summary.netPremium || 0);
 if (!(netPremium > 0)) return null;
 return {
 templateId: 'auto_short_straddle',
 underlying: String(chain.underlying || atmCall.underlying || ''),
 legs,
 atmStrike: Number(atmRow.strike || 0),
 expiryTs: Number(atmCall.expiryTs || 0),
 expiryKey: String(atmCall.expiryKey || chain.expiryKey || ''),
 netPremium,
 summary,
 };
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
 const skew = Number(input.riskReversal25d || 0);
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
 if (Number(input.skewVetoTriggered || 0)) {
 return { key: 'avoid', label: 'Avoid', tone: 'loss', summary: 'Downside skew is too aggressive for a fresh short-vol entry.' };
 }
 if (skew <= -4) {
 return { key: 'defensive', label: 'Defensive Neutral', tone: 'warn', summary: 'Premium is rich, but downside protection demand is elevated.' };
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
 const change24h = Number(input.change24h || input.priceChange24hPct || input.changePct24h || 0);
 const move4h = Number(input.move4h || input.change4h || input.priceChange4hPct || 0);
 const fundingRate = Number(input.fundingRate || input.funding_rate || input.funding || 0);
 const trendScore = Math.max(0, Math.min(100, Number(input.trendScore || input.score || 50)));
 const abs24 = Math.abs(change24h);
 const abs4 = Math.abs(move4h);
 const fundingAbs = Math.abs(fundingRate);
 let sellPremiumScore = 72;
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
 sellPremiumScore = Math.max(0, Math.min(100, Math.round(sellPremiumScore)));
 const directionalBias = change24h >= 2.5 || trendScore >= 68 ? 'bullish' : change24h <= -2.5 || trendScore <= 32 ? 'bearish' : 'neutral';
 const recommendedSide = sellPremiumScore >= 65 ? 'sell' : sellPremiumScore >= 45 ? 'wait' : 'buy';
 const label = recommendedSide === 'sell'
 ? 'Sell premium'
 : recommendedSide === 'buy'
 ? 'Buy-vol watch'
 : 'Wait';
 const tone = recommendedSide === 'sell' ? 'profit' : recommendedSide === 'buy' ? 'loss' : 'warn';
 const summary = recommendedSide === 'sell'
 ? `${underlying} is calm enough for short straddle scoring.`
 : recommendedSide === 'buy'
 ? `${underlying} is moving too strongly for fresh short premium; long-vol or no-trade is safer.`
 : `${underlying} is not clean enough for fresh short premium yet.`;
 return {
 underlying,
 price,
 change24h,
 move4h,
 fundingRate,
 trendScore,
 absMoveScore: Math.max(abs24, abs4),
 sellPremiumScore,
 directionalBias,
 recommendedSide,
 label,
 tone,
 summary,
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
 const riskReversal25d = Number(context.riskReversal25d || input.riskReversal25d || 0);
 const butterfly25d = Number(context.butterfly25d || input.butterfly25d || 0);
 const skewVetoTriggered = !!cfg.skewVetoEnabled && riskReversal25d <= Number(cfg.maxBearishSkewRR || -6);
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
 key: 'skew_veto',
 label: 'Skew Veto',
 passed: !skewVetoTriggered,
 detail: cfg.skewVetoEnabled ? `25D RR ${riskReversal25d.toFixed(2)} vs veto ${Number(cfg.maxBearishSkewRR || 0).toFixed(2)}` : 'Disabled',
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
 riskReversal25d,
 iv: analysis.iv,
 atmScore: analysis.components?.atmScore || 0,
 thetaMarginRatioPct,
 moveFitScore: analysis.components?.moveFitScore || 0,
 skewVetoTriggered,
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
 riskReversal25d,
 butterfly25d,
 skewVetoTriggered,
 canPlace,
 reason,
 };
 }

 /* ===================================================================
 Volatility Skew
 =================================================================== */
 function pickClosestDeltaContract(contracts = [], targetAbsDelta = 0.25, optionType = 'call') {
 const type = String(optionType || '').toLowerCase();
 return (Array.isArray(contracts) ? contracts : [])
 .filter(contract => String(contract?.optionType || '').toLowerCase() === type && Number(contract?.iv || contract?.impliedVolatility || 0) > 0)
 .map(contract => ({ contract, distance: Math.abs(Math.abs(Number(contract?.delta || 0)) - Math.abs(Number(targetAbsDelta || 0.25))) }))
 .sort((a, b) => a.distance - b.distance)[0]?.contract || null;
 }

 function contractSpreadPct(contract = {}) {
 const bid = Number(contract?.bidPrice || contract?.bid || 0);
 const ask = Number(contract?.askPrice || contract?.ask || 0);
 const mark = Math.max(Number(contract?.markPrice || contract?.premium || 0), bid > 0 && ask > 0 ? (bid + ask) / 2 : 0.01);
 if (!(bid > 0 && ask > 0 && ask >= bid)) return 100;
 return ((ask - bid) / mark) * 100;
 }

 function classifySkewQuoteQuality(points = [], chainQuality = {}) {
 const usable = (Array.isArray(points) ? points : []).filter(point => Number(point?.iv || 0) > 0);
 const avgSpread = usable.length
 ? usable.reduce((sum, point) => sum + Number(point.spreadPct || 0), 0) / usable.length
 : Number(chainQuality?.avgSpreadPct || 0);
 const hasWings = usable.some(point => point.side === 'put') && usable.some(point => point.side === 'call');
 const staleMs = Math.max(0, Date.now() - Number(chainQuality?.fetchedAt || chainQuality?.timestamp || 0));
 const warnings = [];
 if (usable.length < 12) warnings.push('Low usable strikes');
 if (!hasWings) warnings.push('Missing put/call wing');
 if (avgSpread > 12) warnings.push('Wide option quotes');
 const grade = warnings.length >= 2 ? 'poor' : warnings.length ? 'mixed' : 'good';
 return {
 grade,
 label: grade === 'good' ? 'Clean quotes' : grade === 'mixed' ? 'Review quotes' : 'Weak quotes',
 usableStrikes: usable.length,
 avgSpreadPct: +avgSpread.toFixed(2),
 tightQuotePct: Number(chainQuality?.tightQuotePct || 0),
 liquidPct: Number(chainQuality?.liquidPct || 0),
 staleMs,
 warnings,
 };
 }

 function classifyVolatilitySkew(metrics = {}) {
 const rr = Number(metrics.riskReversal25d || 0);
 const bf = Number(metrics.butterfly25d || 0);
 if (rr <= -6) return { key: 'put_skew', label: 'Put Skew', tone: 'loss', summary: 'Downside protection is being bid aggressively.' };
 if (rr >= 4) return { key: 'call_skew', label: 'Call Skew', tone: 'profit', summary: 'Upside convexity demand is dominating this expiry.' };
 if (bf >= 3) return { key: 'event_wings', label: 'Event Wings', tone: 'warn', summary: 'Both wings are rich versus ATM, suggesting tail or event pricing.' };
 return { key: 'flat', label: 'Flat Skew', tone: 'info', summary: 'The smile is relatively balanced around ATM.' };
 }

 function computeVolatilitySkewMetrics(chain = {}, options = {}) {
 const rows = Array.isArray(chain?.rows) ? chain.rows : (Array.isArray(chain) ? chain : []);
 const spot = Math.max(0.00000001, Number(options.spotPrice || chain?.underlyingPrice || 0));
 if (!rows.length || !(spot > 0)) {
 const emptyRegime = classifyVolatilitySkew({});
 return {
 spotPrice: spot,
 atmStrike: 0,
 points: [],
 callWing: [],
 putWing: [],
 atmIv: 0,
 call25dIv: 0,
 put25dIv: 0,
 riskReversal25d: 0,
 butterfly25d: 0,
 regime: emptyRegime,
 };
 }

 const normalizedRows = rows.map(row => ({
 strike: Number(row?.strike || 0),
 call: row?.call || null,
 put: row?.put || null,
 })).filter(row => row.strike > 0);
 const atmRow = normalizedRows.reduce((best, row) => !best || Math.abs(row.strike - spot) < Math.abs(best.strike - spot) ? row : best, null);
 const atmCallIv = Number(atmRow?.call?.iv || atmRow?.call?.impliedVolatility || 0);
 const atmPutIv = Number(atmRow?.put?.iv || atmRow?.put?.impliedVolatility || 0);
 const atmIv = atmCallIv > 0 && atmPutIv > 0 ? ((atmCallIv + atmPutIv) / 2) * 100 : Math.max(atmCallIv, atmPutIv, 0) * 100;

 const allContracts = normalizedRows.flatMap(row => [row.call, row.put]).filter(Boolean);
 const put25d = pickClosestDeltaContract(allContracts, 0.25, 'put');
 const call25d = pickClosestDeltaContract(allContracts, 0.25, 'call');
 const put25dIv = Number(put25d?.iv || put25d?.impliedVolatility || 0) * 100;
 const call25dIv = Number(call25d?.iv || call25d?.impliedVolatility || 0) * 100;
 const riskReversal25d = call25dIv - put25dIv;
 const butterfly25d = ((call25dIv + put25dIv) / 2) - atmIv;

 const curvePoints = normalizedRows.map(row => {
 const putIv = Number(row.put?.iv || row.put?.impliedVolatility || 0) * 100;
 const callIv = Number(row.call?.iv || row.call?.impliedVolatility || 0) * 100;
 const sourceContract = row.strike < Number(atmRow?.strike || 0) ? (row.put || row.call) : row.strike > Number(atmRow?.strike || 0) ? (row.call || row.put) : (row.call || row.put);
 let plottedIv = 0;
 let side = 'mixed';
 if (row.strike < Number(atmRow?.strike || 0)) {
 plottedIv = putIv || callIv || 0;
 side = 'put';
 } else if (row.strike > Number(atmRow?.strike || 0)) {
 plottedIv = callIv || putIv || 0;
 side = 'call';
 } else {
 plottedIv = atmIv;
 side = 'atm';
 }
 return {
 strike: row.strike,
 putIv,
 callIv,
 iv: plottedIv,
 side,
 delta: Number(sourceContract?.delta || 0),
 openInterest: Number(sourceContract?.openInterest || sourceContract?.oiContracts || 0),
 volume: Number(sourceContract?.volume || 0),
 bid: Number(sourceContract?.bidPrice || sourceContract?.bid || 0),
 ask: Number(sourceContract?.askPrice || sourceContract?.ask || 0),
 spreadPct: contractSpreadPct(sourceContract),
 moneynessPct: spot > 0 ? ((row.strike / spot) - 1) * 100 : 0,
 };
 }).filter(point => point.iv > 0);

 const regime = classifyVolatilitySkew({ riskReversal25d, butterfly25d });
 const quoteQuality = classifySkewQuoteQuality(curvePoints, { ...(chain?.quality || {}), fetchedAt: chain?.fetchedAt });
 return {
 spotPrice: spot,
 atmStrike: Number(atmRow?.strike || 0),
 points: curvePoints,
 putWing: curvePoints.filter(point => point.side === 'put'),
 callWing: curvePoints.filter(point => point.side === 'call'),
 atmIv,
 call25dIv,
 put25dIv,
 riskReversal25d,
 butterfly25d,
 regime,
 quoteQuality,
 call25dStrike: Number(call25d?.strike || 0),
 put25dStrike: Number(put25d?.strike || 0),
 expiryKey: String(options.expiryKey || chain?.expiryKey || ''),
 underlying: String(options.underlying || chain?.underlying || ''),
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
 OPTION_READY_MADE_STRATEGIES,
 OPTION_STRATEGY_TYPES,
 OPTION_UNDERLYINGS,
 analyzeOptionsStrategy,
 buildDirectionalCreditSpreadFromChain,
 classifyVolatilitySkew,
 computeVolatilitySkewMetrics,
 buildOptionPnlTable,
 buildNativeStraddleMarketContext,
 buildShortStraddleForAutoTrade,
 buildScenarioPriceRange,
 buildStrategyFromChain,
 estimateOptionMarkAtDate,
 formatDeltaOptionSymbol,
 formatOptionsExpiryKey,
 getContractDeltaAbs,
 getOptionSpreadPct,
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
 scoreShortPremiumContract,
 selectBestNativeStraddle,
 summarizeOptionStrategy,
 toYearFraction,
 });

 globalThis.FWDTradeDeskOptions = exportedApi;
 globalThis.FWDTradeDeskOptionsShared = exportedApi;
})();
