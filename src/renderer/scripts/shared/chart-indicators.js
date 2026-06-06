'use strict';

(() => {
 function finiteNumber(value, fallback = null) {
 const numeric = Number(value);
 return Number.isFinite(numeric) ? numeric : fallback;
 }

 function normalizeCandles(candles = []) {
 return (Array.isArray(candles) ? candles : [])
 .map(candle => ({
 time: finiteNumber(candle?.time || candle?.t, 0),
 open: finiteNumber(candle?.open, 0),
 high: finiteNumber(candle?.high, 0),
 low: finiteNumber(candle?.low, 0),
 close: finiteNumber(candle?.close, 0),
 volume: finiteNumber(candle?.volume, 0),
 }))
 .filter(candle => candle.time > 0 && candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0)
 .sort((a, b) => a.time - b.time);
 }

 function sma(values = [], period = 20) {
 const out = new Array(values.length).fill(null);
 let sum = 0;
 for (let index = 0; index < values.length; index += 1) {
 const value = finiteNumber(values[index], 0);
 sum += value;
 if (index >= period) sum -= finiteNumber(values[index - period], 0);
 if (index >= period - 1) out[index] = sum / period;
 }
 return out;
 }

 function ema(values = [], period = 20) {
 const out = new Array(values.length).fill(null);
 if (!values.length || period <= 0) return out;
 const multiplier = 2 / (period + 1);
 let seed = 0;
 for (let index = 0; index < values.length; index += 1) {
 const value = finiteNumber(values[index], null);
 if (value == null) continue;
 if (index < period) {
 seed += value;
 if (index === period - 1) out[index] = seed / period;
 continue;
 }
 const previous = out[index - 1] == null ? value : out[index - 1];
 out[index] = ((value - previous) * multiplier) + previous;
 }
 return out;
 }

 function standardDeviation(values = [], period = 20, averages = []) {
 const out = new Array(values.length).fill(null);
 for (let index = period - 1; index < values.length; index += 1) {
 const avg = finiteNumber(averages[index], null);
 if (avg == null) continue;
 let variance = 0;
 for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
 const diff = finiteNumber(values[cursor], 0) - avg;
 variance += diff * diff;
 }
 out[index] = Math.sqrt(variance / period);
 }
 return out;
 }

 function bollinger(values = [], period = 20, deviations = 2) {
 const middle = sma(values, period);
 const sd = standardDeviation(values, period, middle);
 return {
 upper: middle.map((value, index) => value == null || sd[index] == null ? null : value + (sd[index] * deviations)),
 middle,
 lower: middle.map((value, index) => value == null || sd[index] == null ? null : value - (sd[index] * deviations)),
 };
 }

 function rsi(values = [], period = 14) {
 const out = new Array(values.length).fill(null);
 if (values.length <= period) return out;
 let gains = 0;
 let losses = 0;
 for (let index = 1; index <= period; index += 1) {
 const change = finiteNumber(values[index], 0) - finiteNumber(values[index - 1], 0);
 if (change >= 0) gains += change;
 else losses += Math.abs(change);
 }
 let avgGain = gains / period;
 let avgLoss = losses / period;
 out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
 for (let index = period + 1; index < values.length; index += 1) {
 const change = finiteNumber(values[index], 0) - finiteNumber(values[index - 1], 0);
 const gain = change > 0 ? change : 0;
 const loss = change < 0 ? Math.abs(change) : 0;
 avgGain = ((avgGain * (period - 1)) + gain) / period;
 avgLoss = ((avgLoss * (period - 1)) + loss) / period;
 out[index] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
 }
 return out;
 }

 function trueRange(candle, previous = null) {
 const high = finiteNumber(candle?.high, 0);
 const low = finiteNumber(candle?.low, 0);
 const previousClose = finiteNumber(previous?.close, null);
 if (previousClose == null) return Math.max(0, high - low);
 return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
 }

 function atr(candles = [], period = 14) {
 const out = new Array(candles.length).fill(null);
 const ranges = candles.map((candle, index) => trueRange(candle, candles[index - 1] || null));
 let sum = 0;
 for (let index = 0; index < ranges.length; index += 1) {
 sum += finiteNumber(ranges[index], 0);
 if (index < period - 1) continue;
 if (index === period - 1) {
 out[index] = sum / period;
 continue;
 }
 out[index] = ((out[index - 1] * (period - 1)) + ranges[index]) / period;
 }
 return out;
 }

 function macd(values = [], fast = 12, slow = 26, signal = 9) {
 const fastEma = ema(values, fast);
 const slowEma = ema(values, slow);
 const line = values.map((_, index) => {
 if (fastEma[index] == null || slowEma[index] == null) return null;
 return fastEma[index] - slowEma[index];
 });
 const compact = line.filter(value => value != null);
 const compactSignal = ema(compact, signal);
 const signalLine = new Array(values.length).fill(null);
 let cursor = 0;
 line.forEach((value, index) => {
 if (value == null) return;
 signalLine[index] = compactSignal[cursor] == null ? null : compactSignal[cursor];
 cursor += 1;
 });
 return {
 line,
 signal: signalLine,
 histogram: line.map((value, index) => value == null || signalLine[index] == null ? null : value - signalLine[index]),
 };
 }

 function vwap(candles = []) {
 const out = new Array(candles.length).fill(null);
 let cumulativePriceVolume = 0;
 let cumulativeVolume = 0;
 candles.forEach((candle, index) => {
 const typical = (candle.high + candle.low + candle.close) / 3;
 const volume = Math.max(0, finiteNumber(candle.volume, 0));
 cumulativePriceVolume += typical * volume;
 cumulativeVolume += volume;
 out[index] = cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : null;
 });
 return out;
 }

 function obv(candles = []) {
 const out = new Array(candles.length).fill(null);
 let current = 0;
 candles.forEach((candle, index) => {
 if (index === 0) {
 out[index] = 0;
 return;
 }
 const previous = candles[index - 1];
 if (candle.close > previous.close) current += Math.max(0, candle.volume);
 else if (candle.close < previous.close) current -= Math.max(0, candle.volume);
 out[index] = current;
 });
 return out;
 }

 function supertrend(candles = [], period = 10, multiplier = 3) {
 const atrValues = atr(candles, period);
 const line = new Array(candles.length).fill(null);
 const direction = new Array(candles.length).fill(null);
 let finalUpper = null;
 let finalLower = null;
 let trend = 1;
 candles.forEach((candle, index) => {
 const atrValue = atrValues[index];
 if (atrValue == null) return;
 const hl2 = (candle.high + candle.low) / 2;
 const basicUpper = hl2 + (multiplier * atrValue);
 const basicLower = hl2 - (multiplier * atrValue);
 const previous = candles[index - 1] || candle;
 finalUpper = finalUpper == null || basicUpper < finalUpper || previous.close > finalUpper ? basicUpper : finalUpper;
 finalLower = finalLower == null || basicLower > finalLower || previous.close < finalLower ? basicLower : finalLower;
 if (trend < 0 && candle.close > finalUpper) trend = 1;
 else if (trend > 0 && candle.close < finalLower) trend = -1;
 line[index] = trend > 0 ? finalLower : finalUpper;
 direction[index] = trend;
 });
 return { line, direction };
 }

 function seriesFromValues(candles = [], values = []) {
 return candles.map((candle, index) => ({
 time: candle.time,
 value: finiteNumber(values[index], null),
 })).filter(point => point.value != null);
 }

 function latestFinite(values = []) {
 for (let index = values.length - 1; index >= 0; index -= 1) {
 const value = finiteNumber(values[index], null);
 if (value != null) return value;
 }
 return null;
 }

 function pctDistance(price = 0, reference = 0) {
 const safePrice = finiteNumber(price, 0);
 const safeReference = finiteNumber(reference, 0);
 if (!(safePrice > 0) || !(safeReference > 0)) return null;
 return ((safePrice - safeReference) / safeReference) * 100;
 }

 function classifyTone(score = 0) {
 const value = finiteNumber(score, 0);
 if (value >= 75) return 'good';
 if (value >= 60) return 'watch';
 if (value > 0) return 'weak';
 return 'neutral';
 }

 function normalizeText(value, fallback = '') {
 const text = String(value == null ? '' : value).trim();
 return text || fallback;
 }

 function compactReason(value = '') {
 return normalizeText(value)
 .replace(/\s+/g, ' ')
 .slice(0, 86);
 }

 function buildZoneRows(model = {}, referencePrice = 0) {
 return (Array.isArray(model.keyZones) ? model.keyZones : [])
 .map(zone => {
 const price = finiteNumber(zone.price, 0);
 if (!(price > 0)) return null;
 const distance = pctDistance(price, referencePrice);
 const y = model.chartTop != null && model.chartHeight
 ? model.chartTop + ((finiteNumber(model.chartMax, price) - price) / Math.max(1e-8, finiteNumber(model.chartMax, price) - finiteNumber(model.chartMin, price))) * model.chartHeight
 : null;
 return {
 key: normalizeText(zone.key, `${zone.tf || 'TF'}_${zone.kind || 'level'}_${price}`),
 label: `${normalizeText(zone.tf, 'TF')} ${zone.kind === 'resistance' ? 'Resistance' : 'Support'}`,
 shortLabel: `${normalizeText(zone.tf, 'TF')} ${zone.kind === 'resistance' ? 'R' : 'S'}`,
 kind: normalizeText(zone.kind, 'level'),
 price,
 zoneLow: finiteNumber(zone.zoneLow, price),
 zoneHigh: finiteNumber(zone.zoneHigh, price),
 touches: Math.max(0, Math.round(finiteNumber(zone.touches, 0))),
 strengthPct: Math.max(0, Math.round(finiteNumber(zone.strengthPct, 0))),
 topPct: y == null ? 50 : Math.max(0, Math.min(100, ((y - model.chartTop) / Math.max(1, model.chartHeight)) * 100)),
 distanceAbs: distance == null ? Number.POSITIVE_INFINITY : Math.abs(distance),
 distancePct: distance == null ? '' : `${distance >= 0 ? '+' : ''}${distance.toFixed(2)}%`,
 tone: zone.kind === 'resistance' ? 'danger' : 'good',
 };
 })
 .filter(Boolean)
 .sort((a, b) => finiteNumber(a.distanceAbs, Number.POSITIVE_INFINITY) - finiteNumber(b.distanceAbs, Number.POSITIVE_INFINITY))
 .slice(0, 6);
 }

 function buildSetupMarkers(candles = [], indicators = {}, context = {}) {
 const visible = Array.isArray(context.model?.candles) ? context.model.candles : [];
 const sourceCandles = visible.length ? visible : candles.slice(-120);
 if (!sourceCandles.length) return [];
 const last = sourceCandles[sourceCandles.length - 1];
 const referenceVolume = sourceCandles.slice(-30).reduce((sum, candle) => sum + Math.max(0, finiteNumber(candle.volume, 0)), 0) / Math.max(1, Math.min(30, sourceCandles.length));
 const markers = [];
 const signal = context.signal || {};
 const direction = normalizeText(signal.direction || signal.side || context.orderContext?.side).toLowerCase();
 const latestEma9 = latestFinite(indicators.ema9);
 const latestEma30 = latestFinite(indicators.ema30);
 const latestVwap = latestFinite(indicators.vwap);
 const latestRsi = latestFinite(indicators.rsi14);
 const lastClose = finiteNumber(last.close, 0);
 const lastHigh = finiteNumber(last.high, lastClose);
 const lastLow = finiteNumber(last.low, lastClose);
 if (lastClose > 0 && latestEma9 != null && latestEma30 != null) {
 const alignedLong = lastClose >= latestEma9 && latestEma9 >= latestEma30;
 const alignedShort = lastClose <= latestEma9 && latestEma9 <= latestEma30;
 if (alignedLong || alignedShort) {
 markers.push({
 key: 'ema_alignment',
 time: finiteNumber(last.time, 0),
 price: alignedLong ? lastLow : lastHigh,
 tone: alignedLong ? 'good' : 'danger',
 label: alignedLong ? 'EMA Bull Stack' : 'EMA Bear Stack',
 position: alignedLong ? 'belowBar' : 'aboveBar',
 shape: alignedLong ? 'arrowUp' : 'arrowDown',
 });
 }
 }
 if (lastClose > 0 && latestVwap != null) {
 const vwapGap = pctDistance(lastClose, latestVwap);
 if (vwapGap != null && Math.abs(vwapGap) <= 0.45) {
 markers.push({
 key: 'vwap_retest',
 time: finiteNumber(last.time, 0),
 price: lastClose,
 tone: 'watch',
 label: 'VWAP Retest',
 position: direction === 'short' ? 'aboveBar' : 'belowBar',
 shape: 'circle',
 });
 }
 }
 if (referenceVolume > 0 && finiteNumber(last.volume, 0) >= referenceVolume * 1.75) {
 markers.push({
 key: 'volume_expansion',
 time: finiteNumber(last.time, 0),
 price: lastClose,
 tone: last.close >= last.open ? 'good' : 'danger',
 label: 'Volume Expansion',
 position: last.close >= last.open ? 'belowBar' : 'aboveBar',
 shape: 'circle',
 });
 }
 if (latestRsi != null && (latestRsi >= 68 || latestRsi <= 32)) {
 markers.push({
 key: 'rsi_extreme',
 time: finiteNumber(last.time, 0),
 price: latestRsi >= 68 ? lastHigh : lastLow,
 tone: latestRsi >= 68 ? 'danger' : 'good',
 label: latestRsi >= 68 ? 'RSI Extended' : 'RSI Reversal Area',
 position: latestRsi >= 68 ? 'aboveBar' : 'belowBar',
 shape: latestRsi >= 68 ? 'arrowDown' : 'arrowUp',
 });
 }
 return markers.slice(0, 4);
 }

 function buildExecutionPulse(candles = [], indicators = {}, referencePrice = 0) {
 const last = candles[candles.length - 1] || {};
 const previous = candles[candles.length - 2] || last;
 const latestEma9 = latestFinite(indicators.ema9);
 const latestEma30 = latestFinite(indicators.ema30);
 const latestVwap = latestFinite(indicators.vwap);
 const latestRsi = latestFinite(indicators.rsi14);
 const latestAtr = latestFinite(indicators.atr14);
 const recent = candles.slice(-30);
 const avgVolume = recent.reduce((sum, candle) => sum + Math.max(0, finiteNumber(candle.volume, 0)), 0) / Math.max(1, recent.length);
 const lastVolume = Math.max(0, finiteNumber(last.volume, 0));
 const volumeRatio = avgVolume > 0 ? lastVolume / avgVolume : 0;
 const lastClose = finiteNumber(last.close, referencePrice);
 const previousClose = finiteNumber(previous.close, lastClose);
 const changePct = previousClose > 0 ? ((lastClose - previousClose) / previousClose) * 100 : 0;
 const trend = latestEma9 != null && latestEma30 != null
 ? latestEma9 >= latestEma30 ? 'EMA bullish' : 'EMA bearish'
 : 'EMA pending';
 const vwapGap = latestVwap != null && lastClose > 0 ? pctDistance(lastClose, latestVwap) : null;
 return [
 { key: 'change', label: 'Last candle', value: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`, tone: changePct >= 0 ? 'good' : 'danger' },
 { key: 'trend', label: 'Trend', value: trend, tone: trend.includes('bullish') ? 'good' : trend.includes('bearish') ? 'danger' : 'neutral' },
 { key: 'vwap', label: 'VWAP gap', value: vwapGap == null ? '-' : `${vwapGap >= 0 ? '+' : ''}${vwapGap.toFixed(2)}%`, tone: vwapGap == null ? 'neutral' : Math.abs(vwapGap) <= 0.45 ? 'watch' : vwapGap > 0 ? 'good' : 'danger' },
 { key: 'rsi', label: 'RSI', value: latestRsi == null ? '-' : latestRsi.toFixed(1), tone: latestRsi == null ? 'neutral' : latestRsi >= 68 ? 'danger' : latestRsi <= 32 ? 'watch' : 'neutral' },
 { key: 'atr', label: 'ATR%', value: latestAtr != null && lastClose > 0 ? `${((latestAtr / lastClose) * 100).toFixed(2)}%` : '-', tone: 'neutral' },
 { key: 'volume', label: 'Volume', value: volumeRatio > 0 ? `${volumeRatio.toFixed(1)}x` : '-', tone: volumeRatio >= 1.75 ? 'watch' : 'neutral' },
 ];
 }

 function buildMtfRows(signal = {}, marketIndex = {}) {
 const candidates = [
 { key: '1d', label: '1D', source: signal.daily || signal.day || signal.mtf?.['1d'] || signal.mtf?.['1D'] },
 { key: '4h', label: '4H', source: signal.h4 || signal.fourHour || signal.mtf?.['4h'] || signal.mtf?.['4H'] },
 { key: '4h', label: '4H', source: signal.m4h || signal.fourHour || signal.mtf?.['4h'] || signal.mtf?.['4H'] },
 ];
 return candidates.map(item => {
 const source = item.source && typeof item.source === 'object' ? item.source : {};
 const trend = normalizeText(source.trend || source.structure || source.bias || source.regime || marketIndex.regime, 'Mixed');
 const vwap = normalizeText(source.vwapState || source.vwap || source.vwapBias, '');
 const level = normalizeText(source.keyLevelBias || source.levelBias || source.nearLevel, '');
 return {
 key: item.key,
 label: item.label,
 trend,
 meta: [vwap, level].filter(Boolean).slice(0, 2).join(' | '),
 tone: /bull|long|up|support/i.test(trend) ? 'good' : /bear|short|down|resistance/i.test(trend) ? 'danger' : 'neutral',
 };
 });
 }

 function normalizeSide(value = '') {
 const side = normalizeText(value).toLowerCase();
 if (['short', 'sell', 'bear', 'down'].includes(side)) return 'short';
 if (['long', 'buy', 'bull', 'up'].includes(side)) return 'long';
 return '';
 }

 function findContextLine(context = {}, tone = '') {
 const wanted = normalizeText(tone).toLowerCase();
 const lines = [
 ...(Array.isArray(context.orderContext?.lines) ? context.orderContext.lines : []),
 ...(Array.isArray(context.model?.orderTags) ? context.model.orderTags : []),
 ];
 return lines.find(line => normalizeText(line?.tone || line?.key || line?.kind).toLowerCase() === wanted) || null;
 }

 function buildDecisionMarkers(candles = [], decision = {}, referencePrice = 0) {
 const last = candles[candles.length - 1] || {};
 const time = finiteNumber(last.time, 0);
 if (!time) return [];
 const price = referencePrice > 0 ? referencePrice : finiteNumber(last.close, 0);
 const status = normalizeText(decision.status, 'Review');
 const tone = status === 'Ready' ? 'good' : status === 'Invalid' ? 'danger' : status === 'Wait' ? 'watch' : 'neutral';
 return [{
 key: 'decision_status',
 time,
 price,
 tone,
 label: `Decision: ${status}`,
 position: tone === 'danger' ? 'aboveBar' : 'belowBar',
 shape: tone === 'danger' ? 'arrowDown' : tone === 'good' ? 'arrowUp' : 'circle',
 }];
 }

 function buildDecisionWorkflow(candles = [], indicators = {}, context = {}, derived = {}) {
 const latest = candles[candles.length - 1] || {};
 const previous = candles[candles.length - 2] || latest;
 const signal = context.signal || {};
 const model = context.model || {};
 const referencePrice = finiteNumber(derived.referencePrice, finiteNumber(latest.close, 0));
 const tradeQuality = finiteNumber(derived.tradeQuality, 0);
 const score = finiteNumber(derived.score, 0);
 const sideFromSignal = normalizeSide(signal.direction || signal.side || signal.positionSide);
 const entryLine = findContextLine(context, 'entry');
 const stopLine = findContextLine(context, 'stop');
 const targetLine = findContextLine(context, 'target') || findContextLine(context, 'exit');
 const entry = finiteNumber(entryLine?.price, finiteNumber(signal.entry, 0));
 const stop = finiteNumber(stopLine?.price, finiteNumber(signal.sl || signal.stop || signal.stopLoss, 0));
 const target = finiteNumber(targetLine?.price, finiteNumber(signal.tp1 || signal.tp || signal.target, 0));
 const inferredSide = sideFromSignal || (entry > 0 && stop > 0 ? (stop < entry ? 'long' : 'short') : '');
 const latestEma9 = latestFinite(indicators.ema9);
 const latestEma30 = latestFinite(indicators.ema30);
 const latestVwap = latestFinite(indicators.vwap);
 const latestRsi = latestFinite(indicators.rsi14);
 const latestAtr = latestFinite(indicators.atr14);
 const recent = candles.slice(-30);
 const avgVolume = recent.reduce((sum, candle) => sum + Math.max(0, finiteNumber(candle.volume, 0)), 0) / Math.max(1, recent.length);
 const volumeRatio = avgVolume > 0 ? Math.max(0, finiteNumber(latest.volume, 0)) / avgVolume : 0;
 const rrRatio = entry > 0 && stop > 0 && target > 0 && Math.abs(entry - stop) > 0
 ? Math.abs(target - entry) / Math.abs(entry - stop)
 : finiteNumber(model.rrInfo?.ratio, 0);
 const nearestResistance = (derived.zoneRows || []).find(zone => zone.kind === 'resistance') || null;
 const nearestSupport = (derived.zoneRows || []).find(zone => zone.kind === 'support') || null;
 const resistanceDistance = nearestResistance ? pctDistance(nearestResistance.price, referencePrice) : null;
 const supportDistance = nearestSupport ? pctDistance(referencePrice, nearestSupport.price) : null;
 const confirmations = [];
 const warnings = [];
 const invalidations = [];
 const nextWatch = [];
 const add = (list, label, tone = 'neutral') => list.push({ label: compactReason(label), tone });
 const emaBull = latestEma9 != null && latestEma30 != null && latestEma9 >= latestEma30;
 const emaBear = latestEma9 != null && latestEma30 != null && latestEma9 <= latestEma30;
 if (tradeQuality >= 75) add(confirmations, `Trade quality ${Math.round(tradeQuality)} is qualified`, 'good');
 else if (tradeQuality >= 60) add(warnings, `Trade quality ${Math.round(tradeQuality)} needs confirmation`, 'watch');
 else add(warnings, 'Trade quality is below decision threshold', 'danger');
 if (score >= 70) add(confirmations, `Signal score ${Math.round(score)} supports setup`, 'good');
 if (inferredSide === 'long') {
 if (emaBull) add(confirmations, 'EMA trend supports long side', 'good');
 else if (emaBear) add(warnings, 'EMA trend is against long side', 'danger');
 if (latestVwap != null && referencePrice >= latestVwap) add(confirmations, 'Price is above VWAP', 'good');
 else if (latestVwap != null) add(warnings, 'Price is below VWAP for long setup', 'danger');
 if (stop > 0 && referencePrice <= stop) add(invalidations, 'Price has breached stop/invalidation', 'danger');
 if (resistanceDistance != null && resistanceDistance >= 0 && resistanceDistance <= 0.75) add(warnings, 'Resistance is close above entry', 'watch');
 if (nearestResistance) nextWatch.push(`Break and hold above ${nearestResistance.shortLabel || 'resistance'} ${nearestResistance.distancePct || ''}`.trim());
 if (latestVwap != null) nextWatch.push('Hold above VWAP on pullback');
 } else if (inferredSide === 'short') {
 if (emaBear) add(confirmations, 'EMA trend supports short side', 'good');
 else if (emaBull) add(warnings, 'EMA trend is against short side', 'danger');
 if (latestVwap != null && referencePrice <= latestVwap) add(confirmations, 'Price is below VWAP', 'good');
 else if (latestVwap != null) add(warnings, 'Price is above VWAP for short setup', 'danger');
 if (stop > 0 && referencePrice >= stop) add(invalidations, 'Price has breached stop/invalidation', 'danger');
 if (supportDistance != null && supportDistance >= 0 && supportDistance <= 0.75) add(warnings, 'Support is close below entry', 'watch');
 if (nearestSupport) nextWatch.push(`Break and hold below ${nearestSupport.shortLabel || 'support'} ${nearestSupport.distancePct || ''}`.trim());
 if (latestVwap != null) nextWatch.push('Hold below VWAP on pullback');
 } else {
 add(warnings, 'Direction is not available for decision workflow', 'watch');
 nextWatch.push('Wait for a clear long or short setup');
 }
 if (rrRatio >= 2) add(confirmations, `R:R 1:${rrRatio.toFixed(2)} is strong`, 'good');
 else if (rrRatio >= 1.2) add(confirmations, `R:R 1:${rrRatio.toFixed(2)} is acceptable`, 'watch');
 else if (rrRatio > 0) add(warnings, `R:R 1:${rrRatio.toFixed(2)} is weak`, 'danger');
 else add(warnings, 'Entry, stop, or target is missing', 'watch');
 if (volumeRatio >= 1.5) add(confirmations, `Volume expansion ${volumeRatio.toFixed(1)}x`, 'good');
 else if (volumeRatio > 0 && volumeRatio < 0.8) add(warnings, `Volume is quiet at ${volumeRatio.toFixed(1)}x`, 'watch');
 if (latestRsi != null) {
 if (inferredSide === 'long' && latestRsi >= 72) add(warnings, 'RSI is extended for long entry', 'watch');
 else if (inferredSide === 'short' && latestRsi <= 28) add(warnings, 'RSI is extended for short entry', 'watch');
 else if (latestRsi > 40 && latestRsi < 65) add(confirmations, 'RSI is in workable range', 'neutral');
 }
 if (latestAtr != null && referencePrice > 0 && (latestAtr / referencePrice) * 100 > 6) add(warnings, 'ATR is high; reduce size or wait', 'watch');
 if (inferredSide && !nextWatch.length) nextWatch.push('Wait for retest confirmation with volume');
 const lastChange = finiteNumber(previous.close, 0) > 0 ? ((referencePrice - finiteNumber(previous.close, referencePrice)) / finiteNumber(previous.close, referencePrice)) * 100 : 0;
 if (Math.abs(lastChange) > 1.2) nextWatch.push('Avoid chasing; wait for controlled pullback');
 let status = 'Review';
 if (invalidations.length) status = 'Invalid';
 else if (confirmations.length >= 5 && warnings.length <= 1 && tradeQuality >= 75 && rrRatio >= 1.2) status = 'Ready';
 else if (confirmations.length >= 3 && warnings.length <= 3) status = 'Wait';
 const confidence = status === 'Invalid'
 ? Math.max(5, Math.min(55, Math.round((tradeQuality + score) / 3)))
 : Math.max(10, Math.min(96, Math.round((tradeQuality * 0.52) + (score * 0.28) + (confirmations.length * 5) - (warnings.length * 6))));
 const action = status === 'Ready'
 ? 'Trade can be prepared'
 : status === 'Wait'
 ? 'Wait for confirmation'
 : status === 'Invalid'
 ? 'Avoid trade'
 : 'Review context';
 const reason = invalidations[0]?.label || warnings[0]?.label || confirmations[0]?.label || 'Decision context is limited';
 const riskNote = invalidations.length
 ? 'Invalidation has already triggered.'
 : warnings.length
 ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'} before entry.`
 : 'Risk context is aligned.';
 const lines = [];
 if (stop > 0) lines.push({ key: 'decision_stop', price: stop, label: 'Invalidation', tone: 'danger' });
 if (latestVwap != null && inferredSide) lines.push({ key: 'decision_vwap', price: latestVwap, label: 'VWAP decision', tone: 'watch' });
 return {
 status,
 action,
 confidence,
 reason,
 riskNote,
 side: inferredSide || 'unknown',
 confirmations: confirmations.slice(0, 6),
 warnings: warnings.slice(0, 6),
 invalidations: invalidations.slice(0, 4),
 nextWatch: Array.from(new Set(nextWatch.map(compactReason).filter(Boolean))).slice(0, 4),
 markers: buildDecisionMarkers(candles, { status }, referencePrice),
 lines,
 };
 }

 function buildAdvancedChartIntelligence(candleInput = [], indicatorsInput = {}, context = {}) {
 const candles = normalizeCandles(candleInput);
 const indicators = indicatorsInput && typeof indicatorsInput === 'object' ? indicatorsInput : calculate(candles, context.dataset?.studies || {});
 const model = context.model || {};
 const signal = context.signal || {};
 const marketIndex = context.marketIndex || {};
 const latest = candles[candles.length - 1] || {};
 const referencePrice = finiteNumber(model.lastPrice?.price, finiteNumber(latest.close, 0));
 const tradeQuality = finiteNumber(signal?.tradeQuality?.score, finiteNumber(signal?.tradeQuality, 0));
 const score = finiteNumber(signal?.score, 0);
 const setup = normalizeText(signal.setupFamilyLabel || signal.setupFamily, 'Mixed setup');
 const direction = normalizeText(signal.direction || signal.side, '');
 const rsi = latestFinite(indicators.rsi14);
 const atr = latestFinite(indicators.atr14);
 const vwapValue = latestFinite(indicators.vwap);
 const ema9Value = latestFinite(indicators.ema9);
 const ema30Value = latestFinite(indicators.ema30);
 const zoneRows = buildZoneRows(model, referencePrice);
 const nearestResistance = zoneRows.filter(zone => zone.kind === 'resistance').sort((a, b) => Math.abs(a.price - referencePrice) - Math.abs(b.price - referencePrice))[0] || null;
 const nearestSupport = zoneRows.filter(zone => zone.kind === 'support').sort((a, b) => Math.abs(a.price - referencePrice) - Math.abs(b.price - referencePrice))[0] || null;
 const reasons = [
 ...(Array.isArray(signal.reasons) ? signal.reasons : []),
 ...(Array.isArray(signal.reasonCodes) ? signal.reasonCodes : []),
 ...(Array.isArray(signal.tradeQuality?.reasons) ? signal.tradeQuality.reasons : []),
 ].map(compactReason).filter(Boolean);
 const badges = [
 { key: 'regime', label: normalizeText(signal.marketRegime || marketIndex.regime, 'Regime unknown'), tone: 'neutral' },
 { key: 'setup', label: setup, tone: classifyTone(score || tradeQuality) },
 { key: 'tq', label: `TQ ${Math.round(tradeQuality || 0)}`, tone: classifyTone(tradeQuality) },
 { key: 'rs', label: normalizeText(signal.rsLabel || signal.rsState, 'RS mixed'), tone: signal.rsState === 'strong' ? 'good' : signal.rsState === 'weak' ? 'danger' : 'neutral' },
 { key: 'persistence', label: normalizeText(signal.signalPersistence?.label, 'Fresh'), tone: 'neutral' },
 ];
 if (direction) badges.unshift({ key: 'direction', label: direction.toUpperCase(), tone: direction === 'short' || direction === 'sell' ? 'danger' : 'good' });
 const panel = {
 title: direction ? `${direction.toUpperCase()} Trade Read` : 'Trade Read',
 headline: tradeQuality >= 75 ? 'Qualified setup context' : tradeQuality >= 60 ? 'Watch setup context' : 'Context needs confirmation',
 tone: classifyTone(tradeQuality),
 metrics: [
 { key: 'price', label: 'Last', value: referencePrice > 0 ? referencePrice : null, format: 'price' },
 { key: 'tq', label: 'Trade Quality', value: Math.round(tradeQuality || 0) || '-' },
 { key: 'score', label: 'Signal Score', value: Math.round(score || 0) || '-' },
 { key: 'rsi', label: 'RSI 14', value: rsi == null ? '-' : rsi.toFixed(1) },
 { key: 'atr', label: 'ATR 14', value: atr == null ? '-' : atr.toFixed(6) },
 { key: 'vwap', label: 'VWAP Gap', value: vwapValue == null ? '-' : `${(pctDistance(referencePrice, vwapValue) || 0).toFixed(2)}%` },
 ],
 levels: [
 nearestResistance ? { label: 'Nearest Resistance', value: nearestResistance.price, meta: nearestResistance.distancePct, tone: 'danger' } : null,
 nearestSupport ? { label: 'Nearest Support', value: nearestSupport.price, meta: nearestSupport.distancePct, tone: 'good' } : null,
 ].filter(Boolean),
 checklist: [
 { label: 'EMA Trend', value: ema9Value != null && ema30Value != null ? (ema9Value >= ema30Value ? 'Bullish' : 'Bearish') : 'Pending' },
 { label: 'VWAP Context', value: vwapValue != null && referencePrice > 0 ? (referencePrice >= vwapValue ? 'Above VWAP' : 'Below VWAP') : 'Pending' },
 { label: 'Key Levels', value: zoneRows.length ? `${zoneRows.length} nearby` : 'No nearby level' },
 ],
 reasons: reasons.slice(0, 5),
 };
 const decision = buildDecisionWorkflow(candles, indicators, context, {
 referencePrice,
 tradeQuality,
 score,
 zoneRows,
 });
 return {
 badges,
 decision,
 panel,
 pulse: buildExecutionPulse(candles, indicators, referencePrice),
 mtf: buildMtfRows(signal, marketIndex),
 zones: zoneRows,
 markers: buildSetupMarkers(candles, indicators, context),
 priceBands: zoneRows.map(zone => ({
 key: zone.key,
 label: zone.shortLabel,
 kind: zone.kind,
 price: zone.price,
 zoneLow: zone.zoneLow,
 zoneHigh: zone.zoneHigh,
 tone: zone.tone,
 })),
 };
 }

 function calculate(candleInput = [], providedStudies = {}, options = {}) {
 const candles = normalizeCandles(candleInput);
 const closes = candles.map(candle => candle.close);
 const only = Array.isArray(options.only) && options.only.length
 ? new Set(options.only.map(key => String(key || '').trim().toLowerCase()).filter(Boolean))
 : null;
 const needs = key => !only || only.has(key);
 const provided = key => Array.isArray(providedStudies?.[key]) && providedStudies[key].length === candles.length
 ? providedStudies[key].map(value => finiteNumber(value, null))
 : null;
 const obvValues = needs('obv') ? obv(candles) : [];
 const obvSmaLength = Math.max(1, Math.min(500, Math.round(Number(options.obvSmaLength || 100) || 100)));
 const bb = needs('bollinger') ? bollinger(closes, 20, 2) : {};
 const macdValues = needs('macd') ? macd(closes, 12, 26, 9) : {};
 const supertrendValues = needs('supertrend') ? supertrend(candles, 10, 3) : {};
 return {
 candles,
 ema9: needs('ema') ? (provided('ema9') || ema(closes, 9)) : [],
 ema30: needs('ema') ? (provided('ema30') || ema(closes, 30)) : [],
 ema100: needs('ema') ? (provided('ema100') || ema(closes, 100)) : [],
 sma20: needs('sma') ? sma(closes, 20) : [],
 sma50: needs('sma') ? sma(closes, 50) : [],
 sma200: needs('sma') ? sma(closes, 200) : [],
 vwap: needs('vwap') ? (provided('vwap') || vwap(candles)) : [],
 bbUpper: bb.upper || [],
 bbMiddle: bb.middle || [],
 bbLower: bb.lower || [],
 rsi14: needs('rsi') ? rsi(closes, 14) : [],
 macdLine: macdValues.line || [],
 macdSignal: macdValues.signal || [],
 macdHistogram: macdValues.histogram || [],
 atr14: needs('atr') ? atr(candles, 14) : [],
 supertrend: supertrendValues.line || [],
 supertrendDirection: supertrendValues.direction || [],
 obv: obvValues,
 obvSma100: needs('obv') ? sma(obvValues, obvSmaLength) : [],
 };
 }

 globalThis.FWDTradeDeskIndicators = Object.freeze({
 calculate,
 buildAdvancedChartIntelligence,
 normalizeCandles,
 seriesFromValues,
 });
})();
