'use strict';

(() => {
 const instances = new WeakMap();
 const darvasDetectionCache = new Map();

 const COLORS = Object.freeze({
 grid: 'rgba(128, 150, 180, 0.10)',
 text: 'rgba(210, 220, 232, 0.78)',
 up: '#1de9b6',
 down: '#ff5d7a',
 ema9: '#57f3ca',
 ema30: '#ffd277',
 ema100: '#4fd1ff',
 sma20: '#c8a8ff',
 sma50: '#86a8ff',
 sma200: '#f2a65a',
 vwap: '#ff9c33',
 bollinger: '#9bb6ff',
 rsi: '#79ddff',
 macd: '#57f3ca',
 signal: '#ffd277',
 atr: '#f2a65a',
 obv: '#c8a8ff',
 obvSma: '#ff4757',
 indexCompare: '#ffb84d',
 supertrendUp: '#1de9b6',
 supertrendDown: '#ff5d7a',
 supportDaily: '#ffd84e',
 supportIntraday: '#00c3ff',
 resistanceDaily: '#ff4757',
 resistanceIntraday: '#ff9c33',
 });

 function formatPrice(value = 0) {
 const numeric = Number(value || 0);
 if (!Number.isFinite(numeric)) return '-';
 if (numeric === 0) return '0';
 if (Math.abs(numeric) >= 1000) return numeric.toFixed(2).replace(/\.00$/, '');
 if (Math.abs(numeric) >= 1) return numeric.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
 return numeric.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
 }

 function escapeHtml(value) {
 return String(value == null ? '' : value)
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#39;');
 }

 function toTime(value = 0) {
 const numeric = Number(value || 0);
 if (!Number.isFinite(numeric) || numeric <= 0) return 0;
 return Math.floor(numeric > 1e12 ? numeric / 1000 : numeric);
 }

 function lineData(candles = [], values = [], visibleTimes = null, options = {}) {
 const minValue = Number(options.minValue ?? Number.NEGATIVE_INFINITY);
 const positiveOnly = options.positiveOnly === true;
 const skipLeadingZero = options.skipLeadingZero === true;
 const preserveWhitespace = options.preserveWhitespace !== false;
 let started = false;
 return candles.map((candle, index) => {
 const time = toTime(candle.time);
 const value = Number(values[index]);
 if (!time) return null;
 if (visibleTimes && !visibleTimes.has(time)) return null;
 const valid = Number.isFinite(value)
 && (!positiveOnly || value > 0)
 && (value > minValue)
 && (!skipLeadingZero || started || value !== 0);
 if (!valid) return preserveWhitespace ? { time } : null;
 started = true;
 return { time, value };
 }).filter(Boolean);
 }

 function histogramData(candles = [], values = [], visibleTimes = null, colors = null) {
 return candles.map((candle, index) => {
 const time = toTime(candle.time);
 const value = Number(values[index]);
 if (!time || !Number.isFinite(value)) return null;
 if (visibleTimes && !visibleTimes.has(time)) return null;
 const color = typeof colors === 'function' ? colors(value, index, candle) : undefined;
 return color ? { time, value, color } : { time, value };
 }).filter(Boolean);
 }

 function dayKey(value = 0) {
 const time = toTime(value);
 if (!time) return '';
 return new Date(time * 1000).toISOString().slice(0, 10);
 }

 function indexComparisonData(priceCandles = [], indexCandles = [], visibleTimes = null) {
 const indexByDay = new Map((Array.isArray(indexCandles) ? indexCandles : [])
 .map(candle => ({
 day: dayKey(candle.time),
 close: Number(candle.close || 0),
 }))
 .filter(item => item.day && item.close > 0)
 .map(item => [item.day, item.close]));
 let basePrice = 0;
 let baseIndex = 0;
 return (Array.isArray(priceCandles) ? priceCandles : []).map(candle => {
 const time = toTime(candle.time);
 if (!time || (visibleTimes && !visibleTimes.has(time))) return null;
 const indexClose = indexByDay.get(dayKey(time));
 const priceClose = Number(candle.close || 0);
 if (!(indexClose > 0) || !(priceClose > 0)) return null;
 if (!(basePrice > 0) || !(baseIndex > 0)) {
 basePrice = priceClose;
 baseIndex = indexClose;
 }
 return {
 time,
 value: basePrice * (indexClose / baseIndex),
 };
 }).filter(Boolean);
 }

 function series(chart, definition, options = {}, paneIndex = 0) {
 const { seriesType = '', ...seriesOptions } = options;
 if (chart?.addSeries && definition) return chart.addSeries(definition, seriesOptions, paneIndex);
 const kind = definition?.type || seriesType || '';
 if (kind === 'Candlestick' && chart?.addCandlestickSeries) return chart.addCandlestickSeries(seriesOptions);
 if (kind === 'Bar' && chart?.addBarSeries) return chart.addBarSeries(seriesOptions);
 if (kind === 'Histogram' && chart?.addHistogramSeries) return chart.addHistogramSeries(seriesOptions);
 if (chart?.addLineSeries) return chart.addLineSeries(seriesOptions);
 throw new Error('Chart series API unavailable');
 }

 function normalizeChartType(raw = '') {
 const value = String(raw || '').trim().toLowerCase();
 if (value === 'candle' || value === 'candles' || value === 'candlestick') return 'candles';
 if (value === 'line' || value === 'lines') return 'line';
 return 'bars';
 }

 function normalizeIndicatorStyle(raw = '') {
 const value = String(raw || '').trim().toLowerCase();
 return value === 'clean' ? 'clean' : 'tradingview';
 }

 function createBaseOptions(container) {
 return {
 width: Math.max(320, container.clientWidth || 720),
 height: Math.max(420, container.clientHeight || 460),
 autoSize: true,
 layout: {
 background: { color: '#0f141b' },
 textColor: COLORS.text,
 fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
 },
 grid: {
 vertLines: { color: 'rgba(0, 0, 0, 0)', visible: false },
 horzLines: { color: 'rgba(0, 0, 0, 0)', visible: false },
 },
 rightPriceScale: {
 borderColor: 'rgba(255, 255, 255, 0.10)',
 scaleMargins: { top: 0.05, bottom: 0.12 },
 },
 timeScale: {
 borderColor: 'rgba(255, 255, 255, 0.10)',
 timeVisible: true,
 secondsVisible: false,
 rightOffset: 0,
 fixRightEdge: true,
 rightBarStaysOnScroll: true,
 },
 crosshair: {
 mode: globalThis.LightweightCharts?.CrosshairMode?.Normal ?? 0,
 vertLine: { color: 'rgba(235, 244, 255, 0.34)', width: 1, style: 3 },
 horzLine: { color: 'rgba(235, 244, 255, 0.30)', width: 1, style: 3 },
 },
 handleScroll: true,
 handleScale: true,
 };
 }

 function activeIndicators(state = {}, preset = {}) {
 const raw = state.indicators && typeof state.indicators === 'object' ? state.indicators : {};
 const presetId = String(preset.id || state.preset || '').trim().toLowerCase();
 const cleanKeyPreset = presetId === 'key' || presetId === 'clean';
 return {
 volume: raw.volume !== false,
 ema: cleanKeyPreset ? false : (raw.emaRemoved === true ? false : (raw.ema === true || !!preset.showEma)),
 ema9: raw.ema9 !== false,
 ema30: raw.ema30 !== false,
 ema100: raw.ema100 !== false,
 sma: cleanKeyPreset ? false : (raw.smaRemoved === true ? false : (raw.sma === true || !!preset.showSma)),
 vwap: raw.vwapRemoved === true ? false : (!!state.showVwap || raw.vwap === true || !!preset.showVwap),
 bollinger: cleanKeyPreset ? false : (raw.bollingerRemoved === true ? false : (raw.bollinger === true || !!preset.showBollinger)),
 rsi: cleanKeyPreset ? false : (raw.rsiRemoved === true ? false : (raw.rsi === true || !!preset.showRsi)),
 macd: cleanKeyPreset ? false : (raw.macdRemoved === true ? false : (raw.macd === true || !!preset.showMacd)),
 atr: cleanKeyPreset ? false : (raw.atrRemoved === true ? false : (raw.atr === true || !!preset.showAtr)),
 supertrend: cleanKeyPreset ? false : (raw.supertrendRemoved === true ? false : (raw.supertrend === true || !!preset.showSupertrend)),
 obv: cleanKeyPreset ? false : (raw.obvRemoved === true ? false : (raw.obv === true || !!preset.showObv)),
 obvLine: raw.obvLine !== false,
 obvSma: !cleanKeyPreset && raw.obvSma !== false && raw.obvRemoved !== true && (raw.obv === true || !!preset.showObv || !!preset.showObvSma),
 };
 }

 function needsIndicatorData(active = {}) {
 return !!(active.ema || active.sma || active.vwap || active.bollinger || active.rsi || active.macd || active.atr || active.supertrend || active.obv);
 }

 function requestedIndicatorKeys(active = {}) {
 return Object.keys(active).filter(key => key !== 'volume' && active[key]);
 }

 function addLine(chart, name, data, color, paneIndex = 0, options = {}) {
 if (!data.length || !data.some(point => Number.isFinite(Number(point?.value)))) return null;
 const { showTitle = false, ...seriesOptions } = options;
 const line = series(chart, globalThis.LightweightCharts.LineSeries, {
 color,
 lineWidth: options.lineWidth || 2,
 priceLineVisible: false,
 lastValueVisible: !!options.lastValueVisible,
 title: options.title == null ? (showTitle ? name : '') : options.title,
 crosshairMarkerVisible: false,
 ...seriesOptions,
 }, paneIndex);
 line.setData(data);
 return line;
 }

 function addPriceLine(priceSeries, line = {}, color = COLORS.text) {
 const price = Number(line.price || line.zoneLow || line.zoneHigh || 0);
 if (!priceSeries || !Number.isFinite(price) || (!line.allowSigned && !(price > 0))) return;
 priceSeries.createPriceLine({
 price,
 color,
 lineWidth: Math.max(1, Math.min(4, Number(line.thickness || 1))),
 lineStyle: globalThis.LightweightCharts.LineStyle?.Dashed ?? 2,
 axisLabelVisible: true,
 title: String(line.label || '').slice(0, 28),
 });
 }

 function formatCandleDate(value = 0) {
 const time = toTime(value);
 if (!time) return '-';
 return new Date(time * 1000).toLocaleString([], {
 year: 'numeric',
 month: 'short',
 day: '2-digit',
 hour: '2-digit',
 minute: '2-digit',
 });
 }

 function candleTooltipHtml(candle = {}) {
 return `<strong>${escapeHtml(formatCandleDate(candle.time))}</strong>
 <span>O ${escapeHtml(formatPrice(candle.open))}</span>
 <span>H ${escapeHtml(formatPrice(candle.high))}</span>
 <span>L ${escapeHtml(formatPrice(candle.low))}</span>
 <span>C ${escapeHtml(formatPrice(candle.close))}</span>`;
 }

 function showPinnedCandleReadout(container, chart, priceSeries, candles = [], event = null) {
 if (!container || !chart?.timeScale || !priceSeries || !event || !Array.isArray(candles) || !candles.length) return;
 const rect = container.getBoundingClientRect();
 const x = Number(event.clientX || 0) - rect.left;
 const y = Number(event.clientY || 0) - rect.top;
 const clickedTime = typeof chart.timeScale?.().coordinateToTime === 'function'
 ? chart.timeScale().coordinateToTime(x)
 : null;
 let index = clickedTime ? nearestIndexByTime(candles, clickedTime) : -1;
 if (index < 0) {
  const range = chart.timeScale().getVisibleLogicalRange?.();
  if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
   const approx = Math.round(range.from + (x / Math.max(1, rect.width)) * (range.to - range.from));
   index = Math.max(0, Math.min(candles.length - 1, approx));
  }
 }
 const candle = candles[index];
 if (!candle) return;
 let tooltip = container.querySelector('.ds-candle-click-readout');
 if (!tooltip) {
  tooltip = document.createElement('div');
  tooltip.className = 'ds-candle-click-readout';
  tooltip.style.position = 'absolute';
  tooltip.style.zIndex = '24';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.padding = '7px 9px';
  tooltip.style.border = '1px solid rgba(79, 209, 255, 0.32)';
  tooltip.style.borderRadius = '6px';
  tooltip.style.background = 'rgba(8, 14, 22, 0.94)';
  tooltip.style.color = '#dbeafe';
  tooltip.style.font = '11px/1.45 Segoe UI, Arial, sans-serif';
  tooltip.style.boxShadow = '0 10px 26px rgba(0,0,0,.36)';
  tooltip.style.display = 'grid';
  tooltip.style.gridTemplateColumns = 'auto auto auto auto auto';
  tooltip.style.gap = '5px 8px';
  container.appendChild(tooltip);
 }
 tooltip.innerHTML = candleTooltipHtml(candle);
 const left = Math.max(8, Math.min(rect.width - 260, x + 12));
 const top = Math.max(8, Math.min(rect.height - 72, y - 42));
 tooltip.style.left = `${left}px`;
 tooltip.style.top = `${top}px`;
 }

 function keyZoneColor(zone = {}, alpha = 0.9) {
 const role = String(zone.colorRole || '').trim().toLowerCase();
 if (role === 'resistance-major') return `rgba(255, 71, 87, ${alpha})`;
 if (role === 'resistance-minor') return `rgba(255, 156, 51, ${alpha})`;
 if (role === 'support-deep') return `rgba(255, 216, 78, ${alpha})`;
 if (role === 'support-near') return `rgba(0, 195, 255, ${alpha})`;
 const tf = String(zone.tf || '').trim().toUpperCase();
 const isDaily = tf === '1D' || tf === '1D,4H' || tf === 'COMBINED';
 if (zone.kind === 'resistance') {
 return isDaily ? `rgba(255, 71, 87, ${alpha})` : `rgba(255, 156, 51, ${alpha})`;
 }
 return isDaily ? `rgba(255, 216, 78, ${alpha})` : `rgba(0, 195, 255, ${alpha})`;
 }

 function addKeyZone(priceSeries, zone = {}) {
 // Key levels are rendered by the custom DOM layer so they can start from the
 // pivot cluster instead of spanning the full chart as Lightweight price lines.
 }

 function formatStrength(zone = {}) {
 const clusters = Math.max(0, Math.round(Number(zone.reactionClusterCount || zone.touch_count || zone.touches || 0)));
 return String(clusters);
 }

 function keyZoneClass(zone = {}) {
 const role = String(zone.colorRole || '').trim().toLowerCase();
 if (['resistance-major', 'resistance-minor', 'support-near', 'support-deep'].includes(role)) return role;
 const rawTf = String(zone.tf || '').trim().toUpperCase();
 const tfClass = rawTf === '1D' ? 'day' : rawTf === 'COMBINED' ? 'combined' : 'm15';
 const kind = zone.kind === 'resistance' ? 'resistance' : 'support';
 return `${tfClass}-${kind}`;
 }

 function renderKeyLevelLayer(container, chart, priceSeries, keyZones = []) {
 const shell = container?.closest?.('.ds-chart-shell');
 if (!shell || !chart?.timeScale || !priceSeries?.priceToCoordinate) return;
 let layer = shell.querySelector('.ds-key-level-layer');
 if (!layer) {
 layer = document.createElement('div');
 layer.className = 'ds-key-level-layer';
 layer.setAttribute('aria-hidden', 'true');
 shell.appendChild(layer);
 }
 const fallbackLayerWidth = Math.max(120, Number(container.clientWidth || shell.clientWidth || 0) - 104);
 const layerWidth = Math.max(120, Number(layer.clientWidth || 0) || fallbackLayerWidth);
 const layerHeight = Math.max(80, Number(container.clientHeight || 0) || Number(layer.clientHeight || 0) || Number(shell.clientHeight || 0));
 const zoneViews = (Array.isArray(keyZones) ? keyZones : [])
 .map(zone => {
 const price = Number(zone.price || 0);
 const zoneLow = Number(zone.zoneLow || price || 0);
 const zoneHigh = Number(zone.zoneHigh || price || 0);
 const centerY = priceSeries.priceToCoordinate(price);
 const lowY = priceSeries.priceToCoordinate(Math.min(zoneLow, zoneHigh));
 const highY = priceSeries.priceToCoordinate(Math.max(zoneLow, zoneHigh));
 if (![centerY, lowY, highY].every(Number.isFinite)) return null;
 const rawHeight = Math.abs(highY - lowY);
 const height = Math.max(10, Math.min(24, rawHeight));
 const top = Math.max(0, Math.min(layerHeight - height, centerY - (height / 2)));
 const className = keyZoneClass(zone);
 const badgeTop = centerY - top;
 const rightPad = 2;
 const anchorX = 0;
 const width = Math.max(120, layerWidth - rightPad);
 return { zone, price, top, height, centerY, badgeTop, className, anchorX, width };
 })
 .filter(Boolean);
 const badgeMinGap = 28;
 zoneViews.sort((a, b) => (a.top + a.badgeTop) - (b.top + b.badgeTop));
 let previousAbsBadgeTop = Number.NEGATIVE_INFINITY;
 zoneViews.forEach(view => {
 const absoluteTop = view.top + view.badgeTop;
 const adjustedAbsTop = Math.max(absoluteTop, previousAbsBadgeTop + badgeMinGap);
 const maxAbsTop = Math.max(12, layerHeight - 18);
 const finalAbsTop = Math.min(maxAbsTop, adjustedAbsTop);
 view.badgeTop = finalAbsTop - view.top;
 previousAbsBadgeTop = finalAbsTop;
 });
 const visibleZones = zoneViews.slice(0, 4).map(view => {
 const { zone, price, top, height, centerY, badgeTop, className, anchorX, width } = view;
 const reactions = (Array.isArray(zone.reactionMarkers) ? zone.reactionMarkers : []).slice(-18).map(marker => {
 const x = chart.timeScale().timeToCoordinate(toTime(marker.time || marker.ts));
 const y = priceSeries.priceToCoordinate(Number(marker.price || price || 0));
 if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > layerWidth || y < 0 || y > layerHeight) return '';
 const type = String(marker.type || 'touch').trim().toLowerCase();
 return `<span class="ds-key-reaction-marker ${className} ${escapeHtml(type)}" title="${escapeHtml(type)}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"></span>`;
 }).join('');
 const strength = formatStrength(zone);
 const glowClass = zone.showLevelGlow === false ? '' : ' is-glow';
 const lineHeight = Math.max(1, Math.min(8, Math.round(Number(zone.thickness || 3) || 3)));
 const farClass = '';
 const stateClass = zone.state ? ` state-${escapeHtml(zone.state)}` : '';
 const detail = zone.detailLabel || `${zone.label || zone.tf || 'Key level'} ${formatPrice(price)} | ${strength} reactions`;
 return `<div class="ds-key-zone-band ${className}${glowClass}${farClass}${stateClass}" title="${escapeHtml(detail)}" style="left:${anchorX.toFixed(1)}px;right:auto;width:${width.toFixed(1)}px;top:${top.toFixed(1)}px;height:${height.toFixed(1)}px">
 <span class="ds-key-zone-center" style="top:${Math.max(0, Math.min(100, ((centerY - top) / Math.max(1, height)) * 100)).toFixed(2)}%;height:${lineHeight}px"></span>
 <span class="ds-key-zone-tooltip" style="top:${badgeTop.toFixed(1)}px">${escapeHtml(detail)}</span>
 </div>${reactions}`;
 });
 layer.innerHTML = visibleZones.join('');
 }

 function isDarvasReviewState(state = {}) {
 const draft = state?.chartTradingDraft || {};
 const tabs = Array.isArray(state?.chartReviewTabs) ? state.chartReviewTabs : [];
 const activeId = String(state?.activeChartReviewTabId || '').trim();
 const activeTab = tabs.find(tab => String(tab?.id || '') === activeId) || tabs[0] || null;
 const values = [
  draft.source,
  draft.label,
  draft.symbol,
  activeTab?.strategyId,
  activeTab?.subtitle,
  activeTab?.signal?.strategyId,
  activeTab?.signal?.reason,
  activeTab?.signal?.event,
  activeTab?.signal?.raw?.scanner,
 ].map(value => String(value || '').toLowerCase());
 return values.some(value => value.includes('darvas'));
 }

 function darvasClamp(value, fallback, min, max, digits = 0) {
 const numeric = Number(value);
 if (!Number.isFinite(numeric)) return fallback;
 const bounded = Math.max(min, Math.min(max, numeric));
 return Number(bounded.toFixed(digits));
 }

 function normalizeDarvasTimeframe(value = '') {
 const tf = String(value || '').trim().toLowerCase();
 if (tf === 'w' || tf === '1wk' || tf === 'week' || tf === 'weekly') return '1w';
 if (tf === '1d' || tf === 'day' || tf === 'daily') return '1d';
 if (tf === '1h' || tf === '60m' || tf === '60' || tf === '240') return '4h';
 if (tf === '1m' || tf === '3m' || tf === '5m' || tf === '15') return '4h';
 return ['4h', '1d', '1w'].includes(tf) ? tf : '4h';
 }

 function isDailyDarvasTimeframe(value = '') {
 const tf = normalizeDarvasTimeframe(value);
 return tf === '1d' || tf === '1w';
 }

 function normalizeDarvasSettings(state = {}) {
 const raw = state?.darvasSettings && typeof state.darvasSettings === 'object' ? state.darvasSettings : {};
 const rawIndicators = state?.indicators && typeof state.indicators === 'object' ? state.indicators : {};
 const indicatorEnabled = rawIndicators.darvas === true && rawIndicators.darvasRemoved !== true;
 const daily = isDailyDarvasTimeframe(state.timeframe || '');
 const autoLookback = daily ? 50 : 20;
 const rawLookback = Number(raw.lookback || 0);
 return {
 enabled: indicatorEnabled && (Object.prototype.hasOwnProperty.call(raw, 'enabled') ? raw.enabled !== false : false),
 lookback: rawLookback > 0 ? darvasClamp(rawLookback, autoLookback, 5, 160, 0) : autoLookback,
 confirmationCandles: darvasClamp(raw.confirmationCandles, 3, 2, 8, 0),
 volumeMultiplier: darvasClamp(raw.volumeMultiplier, 1.5, 0.5, 5, 2),
 atrBreakoutBuffer: darvasClamp(raw.atrBreakoutBuffer, 0.10, 0, 2, 2),
 retestAtrTolerance: darvasClamp(raw.retestAtrTolerance, 0.25, 0.05, 2, 2),
 stopLossAtrBuffer: darvasClamp(raw.stopLossAtrBuffer, 0.25, 0, 2, 2),
 maxHeightPct: daily ? darvasClamp(raw.maxDailyHeightPct, 10, 2, 40, 1) : darvasClamp(raw.maxIntradayHeightPct, 5, 1, 25, 1),
 atrHeightMultiple: daily ? 4 : 2.5,
 showHistoricalBoxes: Object.prototype.hasOwnProperty.call(raw, 'showHistoricalBoxes') ? raw.showHistoricalBoxes !== false : true,
 maxBoxesVisible: darvasClamp(raw.maxBoxesVisible, 10, 1, 50, 0),
 showScannerDetails: Object.prototype.hasOwnProperty.call(raw, 'showScannerDetails') ? raw.showScannerDetails !== false : true,
 chartLabels: String(raw.chartLabels || 'minimal').trim().toLowerCase() === 'detailed' ? 'detailed' : 'minimal',
 showEntryLine: Object.prototype.hasOwnProperty.call(raw, 'showEntryLine') ? raw.showEntryLine !== false : true,
 showTargetLines: Object.prototype.hasOwnProperty.call(raw, 'showTargetLines') ? raw.showTargetLines !== false : true,
 showTargets: Object.prototype.hasOwnProperty.call(raw, 'showTargets') ? raw.showTargets !== false : true,
 showStopLoss: Object.prototype.hasOwnProperty.call(raw, 'showStopLoss') ? raw.showStopLoss !== false : true,
 showTooltip: Object.prototype.hasOwnProperty.call(raw, 'showTooltip') ? raw.showTooltip !== false : true,
 showFailedBoxes: Object.prototype.hasOwnProperty.call(raw, 'showFailedBoxes') ? raw.showFailedBoxes !== false : true,
 showWeakBreakoutBoxes: Object.prototype.hasOwnProperty.call(raw, 'showWeakBreakoutBoxes') ? raw.showWeakBreakoutBoxes !== false : true,
 showOnlyHighQuality: raw.showOnlyHighQuality === true,
 };
 }

 function darvasSmaAt(values = [], period = 20, endIndex = values.length - 1) {
 if (!Array.isArray(values) || period <= 0 || endIndex < period - 1) return null;
 let sum = 0;
 for (let index = endIndex - period + 1; index <= endIndex; index += 1) {
  const value = Number(values[index]);
  if (!Number.isFinite(value)) return null;
  sum += value;
 }
 return sum / period;
 }

 function darvasEmaSeries(values = [], period = 20) {
 const out = new Array(values.length).fill(null);
 if (!Array.isArray(values) || values.length < period || period <= 0) return out;
 const multiplier = 2 / (period + 1);
 let seed = 0;
 for (let index = 0; index < values.length; index += 1) {
  const value = Number(values[index]);
  if (!Number.isFinite(value)) continue;
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

 function darvasAtrSeries(candles = [], period = 14) {
 const out = new Array(candles.length).fill(null);
 const ranges = candles.map((candle, index) => {
  const high = Number(candle.high || 0);
  const low = Number(candle.low || 0);
  const previousClose = Number(candles[index - 1]?.close || 0);
  if (!(high > 0) || !(low > 0)) return 0;
  if (!(previousClose > 0)) return Math.max(0, high - low);
  return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
 });
 let sum = 0;
 for (let index = 0; index < ranges.length; index += 1) {
  sum += Number(ranges[index] || 0);
  if (index < period - 1) continue;
  if (index === period - 1) {
  out[index] = sum / period;
  continue;
  }
  out[index] = ((Number(out[index - 1] || 0) * (period - 1)) + Number(ranges[index] || 0)) / period;
 }
 return out;
 }

 function buildDarvasStudies(candles = []) {
 const closes = candles.map(candle => Number(candle.close || 0));
 const volumes = candles.map(candle => Math.max(0, Number(candle.volume || candle.quoteVolume || candle.quote_volume || 0)));
 return {
  closes,
  volumes,
  ema20: darvasEmaSeries(closes, 20),
  ema50: darvasEmaSeries(closes, 50),
  atr14: darvasAtrSeries(candles, 14),
 };
 }

 function classifyDarvasQuality(score = 0) {
 const value = Math.round(Number(score || 0));
 if (value >= 80) return 'High Quality';
 if (value >= 60) return 'Medium Quality';
 return 'Low Quality';
 }

 function darvasStatusFromEvent(eventType = '', fallback = 'Active') {
 const value = String(eventType || '').trim().toLowerCase();
 if (value === 'breakout') return 'Breakout Confirmed';
 if (value === 'near_breakout') return 'Active';
 if (value === 'failed_breakout' || value === 'failed') return 'Failed';
 if (value === 'base') return 'Active';
 if (value === 'forming') return 'Forming';
 if (value === 'weak_breakout') return 'Weak Breakout';
 if (value === 'retest_confirmed') return 'Retest Confirmed';
 return fallback;
 }

 function darvasToneClass(box = {}) {
 const status = String(box.status || '').toLowerCase();
 if (status.includes('forming')) return 'forming';
 if (status.includes('retest')) return 'retest';
 if (status.includes('breakout confirmed')) return 'breakout';
 if (status.includes('weak')) return 'weak';
 if (status.includes('failed')) return 'failed';
 if (status.includes('low quality')) return 'low-quality';
 return 'active';
 }

 function findDarvasIndexByTime(candles = [], time = 0) {
 const target = toTime(time);
 if (!target) return -1;
 let bestIndex = -1;
 let bestDelta = Number.POSITIVE_INFINITY;
 candles.forEach((candle, index) => {
  const delta = Math.abs(toTime(candle.time) - target);
  if (delta < bestDelta) {
  bestDelta = delta;
  bestIndex = index;
  }
 });
 return bestIndex;
 }

 function darvasInsideRatio(candles = [], top = 0, bottom = 0) {
 if (!candles.length || !(top > bottom)) return 0;
 const inside = candles.filter(candle => Number(candle.close || 0) <= top && Number(candle.close || 0) >= bottom).length;
 return inside / candles.length;
 }

 function hasDarvasIndex(value) {
 const numeric = Number(value);
 return value !== null && value !== undefined && value !== '' && Number.isFinite(numeric) && numeric >= 0;
 }

 function completeDarvasBox(raw = {}, candles = [], studies = {}, settings = normalizeDarvasSettings()) {
 const top = Number(raw.top || raw.boxTop || 0);
 const bottom = Number(raw.bottom || raw.boxBottom || 0);
 if (!(top > 0) || !(bottom > 0) || top <= bottom || !candles.length) return null;
 const lastIndex = candles.length - 1;
 const startIndex = Math.max(0, Math.min(lastIndex, hasDarvasIndex(raw.startIndex) ? Math.round(Number(raw.startIndex)) : Math.max(0, lastIndex - Math.max(2, Math.round(Number(raw.age || 24) || 24)))));
 const endIndex = Math.max(startIndex, Math.min(lastIndex, hasDarvasIndex(raw.endIndex) ? Math.round(Number(raw.endIndex)) : lastIndex));
 const evalIndex = Math.max(startIndex, Math.min(lastIndex, hasDarvasIndex(raw.retestIndex) ? Number(raw.retestIndex) : hasDarvasIndex(raw.breakoutIndex) ? Number(raw.breakoutIndex) : endIndex));
 const evalCandle = candles[evalIndex] || candles[lastIndex] || {};
 const atr = Number(studies.atr14?.[evalIndex] || studies.atr14?.[endIndex] || 0);
 const boxHeight = top - bottom;
 const heightPercent = bottom > 0 ? (boxHeight / bottom) * 100 : 0;
 const stopLoss = Number(raw.stopLoss || 0) > 0 ? Number(raw.stopLoss) : Math.max(0, bottom - (atr * settings.stopLossAtrBuffer));
 const entry = Number(raw.entry || 0) > 0 ? Number(raw.entry) : top + (atr * settings.atrBreakoutBuffer);
 const target1 = Number(raw.target1 || 0) > 0 ? Number(raw.target1) : top + boxHeight;
 const target2 = Number(raw.target2 || 0) > 0 ? Number(raw.target2) : top + (2 * boxHeight);
 const volumeSma20 = darvasSmaAt(studies.volumes || [], 20, evalIndex - 1);
 const volume = Math.max(0, Number(evalCandle.volume || evalCandle.quoteVolume || evalCandle.quote_volume || 0));
 const volumeRatio = Number(raw.volumeRatio || 0) > 0 ? Number(raw.volumeRatio) : volumeSma20 > 0 ? volume / volumeSma20 : 0;
 const range = Math.max(0, Number(evalCandle.high || 0) - Number(evalCandle.low || 0));
 const body = Math.abs(Number(evalCandle.close || 0) - Number(evalCandle.open || 0));
 const bodyRatio = range > 0 ? body / range : 0;
 const ema20 = Number(studies.ema20?.[evalIndex] || 0);
 const ema50 = Number(studies.ema50?.[evalIndex] || 0);
 const close = Number(evalCandle.close || 0);
 const cleanClose = close > top + (atr * settings.atrBreakoutBuffer);
 const emaAligned = close > ema20 && close > ema50 && ema20 > ema50;
 const insideRows = candles.slice(startIndex, Math.min(lastIndex, Math.max(endIndex, Number(raw.confirmedIndex || endIndex))) + 1);
 const insideRatio = Number(raw.insideRatio || 0) > 0 ? Number(raw.insideRatio) : darvasInsideRatio(insideRows, top, bottom);
 const compressionBase = Math.max(0, Math.min(1, 1 - (heightPercent / Math.max(0.01, settings.maxHeightPct))));
 const volumeScore = Math.round(Math.max(0, Math.min(30, (volumeRatio / Math.max(0.1, settings.volumeMultiplier)) * 30)));
 const cleanCloseScore = cleanClose ? 20 : close > top ? 12 : close >= top - Math.max(atr * 0.25, top * 0.0015) ? 6 : 0;
 const bodyScore = Math.round(Math.max(0, Math.min(20, (bodyRatio / 0.5) * 20)));
 const emaScore = emaAligned ? 15 : close > ema20 && close > ema50 ? 9 : ema20 > ema50 ? 5 : 0;
 const compressionScore = Math.round(Math.max(0, Math.min(15, (insideRatio * 9) + (compressionBase * 6))));
 const calculatedScore = volumeScore + cleanCloseScore + bodyScore + emaScore + compressionScore;
 const score = Number(raw.score || 0) > 0 ? Math.max(0, Math.min(100, Math.round(Number(raw.score)))) : Math.max(0, Math.min(100, calculatedScore));
 const quality = String(raw.quality || '').trim() || classifyDarvasQuality(score);
 const lowQuality = raw.lowQuality === true || quality === 'Low Quality' || heightPercent > settings.maxHeightPct || (atr > 0 && boxHeight > atr * settings.atrHeightMultiple);
 const rawStatus = String(raw.status || '').trim();
 const status = rawStatus || (lowQuality && !raw.breakoutIndex && !raw.failedIndex ? 'Low Quality Box' : darvasStatusFromEvent(raw.eventType, 'Active'));
 const risk = entry > 0 && stopLoss > 0 ? Math.max(0, entry - stopLoss) : 0;
 const riskPercent = entry > 0 && risk > 0 ? (risk / entry) * 100 : 0;
 const reward1 = target1 > entry ? target1 - entry : 0;
 const reward2 = target2 > entry ? target2 - entry : 0;
 const reason = String(raw.reason || '').trim() || 'Price created a new high, then paused without making a higher high for the confirmation candles. A consolidation box was formed between the confirmed high and the reaction low.';
 return {
  top,
  bottom,
  heightPercent,
  status,
  formedAt: toTime(raw.formedAt || raw.confirmedAt || candles[Math.min(lastIndex, hasDarvasIndex(raw.confirmedIndex) ? Number(raw.confirmedIndex) : endIndex)]?.time),
  breakoutAt: toTime(raw.breakoutAt || (hasDarvasIndex(raw.breakoutIndex) ? candles[raw.breakoutIndex]?.time : 0)),
  retestAt: toTime(raw.retestAt || (hasDarvasIndex(raw.retestIndex) ? candles[raw.retestIndex]?.time : 0)),
  failedAt: toTime(raw.failedAt || (hasDarvasIndex(raw.failedIndex) ? candles[raw.failedIndex]?.time : 0)),
  volumeConfirmed: raw.volumeConfirmed === true || volumeRatio >= settings.volumeMultiplier,
  trendConfirmed: raw.trendConfirmed === true || emaAligned,
  volumeRatio,
  breakoutScore: score,
  score,
  quality,
  stopLoss,
  entry,
  target1,
  target2,
  riskReward1: risk > 0 && reward1 > 0 ? reward1 / risk : 0,
  riskReward2: risk > 0 && reward2 > 0 ? reward2 / risk : 0,
  reason,
  riskPercent,
  startIndex,
  endIndex,
  confirmedIndex: hasDarvasIndex(raw.confirmedIndex) ? Math.round(Number(raw.confirmedIndex)) : endIndex,
  breakoutIndex: hasDarvasIndex(raw.breakoutIndex) ? Math.round(Number(raw.breakoutIndex)) : null,
  retestIndex: hasDarvasIndex(raw.retestIndex) ? Math.round(Number(raw.retestIndex)) : null,
  failedIndex: hasDarvasIndex(raw.failedIndex) ? Math.round(Number(raw.failedIndex)) : null,
  startTime: toTime(raw.startTime || candles[startIndex]?.time),
  endTime: toTime(raw.endTime || candles[endIndex]?.time),
  label: String(raw.label || 'Darvas Box').trim() || 'Darvas Box',
  eventType: String(raw.eventType || '').trim().toLowerCase(),
  insideRatio,
  parts: { volumeScore, cleanCloseScore, bodyScore, emaScore, compressionScore },
 };
 }

 function normalizeDarvasBox(state = {}, candles = [], studies = {}, settings = normalizeDarvasSettings(state)) {
 const box = state?.chartTradingDraft?.darvasBox || state?.darvasBox;
 if (!box || typeof box !== 'object') return null;
 const top = Number(box.top || box.boxTop || 0);
 const bottom = Number(box.bottom || box.boxBottom || 0);
 if (!(top > 0) || !(bottom > 0) || top <= bottom) return null;
 const startTime = toTime(box.startTime || box.fromTime || 0);
 const endTime = toTime(box.endTime || box.toTime || 0);
 const startIndex = findDarvasIndexByTime(candles, startTime);
 const endIndex = findDarvasIndexByTime(candles, endTime);
 return completeDarvasBox({
  top,
  bottom,
  age: Math.max(2, Math.min(200, Math.round(Number(box.age || box.boxAge || 24) || 24))),
  startIndex,
  endIndex,
  startTime,
  endTime,
  eventType: String(box.eventType || '').trim().toLowerCase(),
  label: String(box.label || 'Darvas Box').trim(),
  status: box.status || '',
  score: Number(box.score || box.breakoutScore || 0) || 0,
  quality: box.quality || '',
  heightPercent: Number(box.heightPercent || 0) || 0,
  volumeConfirmed: box.volumeConfirmed === true,
  volumeRatio: Number(box.volumeRatio || 0) || 0,
  riskPercent: Number(box.riskPercent || 0) || 0,
  entry: Number(box.entry || 0) || 0,
  stopLoss: Number(box.stopLoss || 0) || 0,
  target1: Number(box.target1 || 0) || 0,
  target2: Number(box.target2 || 0) || 0,
  reason: String(box.reason || '').trim(),
  formedAt: box.formedAt,
  breakoutAt: box.breakoutAt,
  retestAt: box.retestAt,
  failedAt: box.failedAt,
 }, candles, studies, settings);
 }

 function detectDarvasBoxesFromCandles(visibleCandles = [], state = {}, providedSettings = null, providedStudies = null) {
 const settings = providedSettings || normalizeDarvasSettings(state);
 if (!settings.enabled) return [];
 const candles = (Array.isArray(visibleCandles) ? visibleCandles : [])
 .map(candle => ({
  time: toTime(candle.time),
  open: Number(candle.open || 0),
  high: Number(candle.high || 0),
  low: Number(candle.low || 0),
  close: Number(candle.close || 0),
  volume: Math.max(0, Number(candle.volume || candle.quoteVolume || candle.quote_volume || 0)),
 }))
 .filter(candle => candle.time && candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0 && candle.high >= candle.low);
 if (candles.length < Math.max(12, settings.confirmationCandles + 6)) return [];
 const studies = providedStudies || buildDarvasStudies(candles);
 const boxes = [];
 const lookback = Math.min(settings.lookback, Math.max(5, candles.length - settings.confirmationCandles - 1));
 const startCursor = Math.max(lookback - 1, 4);
 for (let seedIndex = startCursor; seedIndex < candles.length; seedIndex += 1) {
  const seed = candles[seedIndex];
  const seedWindow = candles.slice(Math.max(0, seedIndex - lookback + 1), seedIndex + 1);
  const seedHigh = Math.max(...seedWindow.map(candle => Number(candle.high || 0)));
  if (!(seed.high >= seedHigh)) continue;
  const availableAfterSeed = candles.length - seedIndex - 1;
  if (availableAfterSeed < settings.confirmationCandles) {
  const formingRows = candles.slice(seedIndex + 1);
  if (formingRows.length && formingRows.every(candle => Number(candle.high || 0) <= seed.high)) {
   const bottom = Math.min(...formingRows.map(candle => Number(candle.low || seed.low || 0)).concat(seed.low));
   const box = completeDarvasBox({
   top: seed.high,
   bottom,
   startIndex: seedIndex,
   endIndex: candles.length - 1,
   confirmedIndex: candles.length - 1,
   status: 'Forming',
   eventType: 'forming',
   insideRatio: darvasInsideRatio(candles.slice(seedIndex), seed.high, bottom),
   label: 'Darvas Box',
   }, candles, studies, settings);
   if (box) boxes.push(box);
  }
  continue;
  }
  const confirmRows = candles.slice(seedIndex + 1, seedIndex + 1 + settings.confirmationCandles);
  if (confirmRows.some(candle => Number(candle.high || 0) > seed.high)) continue;
  const confirmedIndex = seedIndex + settings.confirmationCandles;
  const bottom = Math.min(...confirmRows.map(candle => Number(candle.low || 0)).filter(value => value > 0));
  if (!(bottom > 0) || seed.high <= bottom) continue;
  const height = seed.high - bottom;
  const heightPercent = (height / bottom) * 100;
  const atrAtConfirm = Number(studies.atr14?.[confirmedIndex] || 0);
  const insideRows = candles.slice(seedIndex, confirmedIndex + 1);
  const insideRatio = darvasInsideRatio(insideRows, seed.high, bottom);
  const badReasons = [];
  if (heightPercent > settings.maxHeightPct) badReasons.push('Box is wider than the configured height limit');
  if (atrAtConfirm > 0 && height > atrAtConfirm * settings.atrHeightMultiple) badReasons.push('Box height is too large versus ATR');
  if (insideRows.length < settings.confirmationCandles + 1) badReasons.push('Not enough candles inside the range');
  if (insideRatio < 0.68) badReasons.push('Price action is messy inside the box');
  const severe = heightPercent > settings.maxHeightPct * 1.7
  || (atrAtConfirm > 0 && height > atrAtConfirm * settings.atrHeightMultiple * 1.5)
  || insideRatio < 0.45;
  if (severe) continue;
  let status = badReasons.length ? 'Low Quality Box' : 'Active';
  let eventType = badReasons.length ? 'low_quality' : 'base';
  let endIndex = candles.length - 1;
  let breakoutIndex = null;
  let retestIndex = null;
  let failedIndex = null;
  for (let cursor = confirmedIndex + 1; cursor < candles.length; cursor += 1) {
  const candle = candles[cursor];
  const atr = Number(studies.atr14?.[cursor] || atrAtConfirm || 0);
  const volumeSma20 = darvasSmaAt(studies.volumes || [], 20, cursor - 1);
  const volumeRatio = volumeSma20 > 0 ? Number(candle.volume || 0) / volumeSma20 : 0;
  const range = Math.max(0, Number(candle.high || 0) - Number(candle.low || 0));
  const bodyRatio = range > 0 ? Math.abs(Number(candle.close || 0) - Number(candle.open || 0)) / range : 0;
  const ema20 = Number(studies.ema20?.[cursor] || 0);
  const ema50 = Number(studies.ema50?.[cursor] || 0);
  const trendOk = Number(candle.close || 0) > ema20 && Number(candle.close || 0) > ema50 && ema20 > ema50;
  const cleanClose = Number(candle.close || 0) > seed.high + (atr * settings.atrBreakoutBuffer);
  const strongBreakout = cleanClose && volumeRatio >= settings.volumeMultiplier && bodyRatio >= 0.5 && trendOk;
  if (Number(candle.close || 0) < bottom) {
   status = 'Failed';
   eventType = 'failed_breakout';
   failedIndex = cursor;
   endIndex = cursor;
   break;
  }
  if (Number(candle.close || 0) > seed.high && breakoutIndex == null) {
   breakoutIndex = cursor;
   endIndex = cursor;
   if (strongBreakout) {
   status = 'Breakout Confirmed';
   eventType = 'breakout';
   } else {
   status = 'Weak Breakout';
   eventType = 'weak_breakout';
   }
   continue;
  }
  if (breakoutIndex != null && cursor > breakoutIndex) {
   const tolerance = Math.max(Number(candle.close || 0) * 0.0015, atr * settings.retestAtrTolerance);
   const nearTop = Number(candle.low || 0) <= seed.high + tolerance && Number(candle.low || 0) >= seed.high - tolerance;
   const bounced = Number(candle.close || 0) > seed.high && Number(candle.close || 0) >= Number(candle.open || 0);
   if (nearTop && bounced) {
   status = 'Retest Confirmed';
   eventType = 'retest_confirmed';
   retestIndex = cursor;
   endIndex = cursor;
   break;
   }
  }
  }
  const box = completeDarvasBox({
  top: seed.high,
  bottom,
  startIndex: seedIndex,
  endIndex,
  confirmedIndex,
  breakoutIndex,
  retestIndex,
  failedIndex,
  status,
  eventType,
  lowQuality: badReasons.length > 0,
  insideRatio,
  reason: badReasons.length
   ? `Low-quality Darvas Box: ${badReasons.join('; ')}.`
   : 'Price created a new high, then paused without making a higher high for the confirmation candles. A consolidation box was formed between the confirmed high and the reaction low.',
  label: 'Darvas Box',
  }, candles, studies, settings);
  if (box) boxes.push(box);
 }
 return boxes;
 }

 function detectDarvasBoxFromCandles(visibleCandles = [], state = {}) {
 const boxes = detectDarvasBoxesFromCandles(visibleCandles, state);
 return boxes[boxes.length - 1] || null;
 }

 function darvasBoxesOverlap(a = {}, b = {}) {
 const topDelta = Math.abs(Number(a.top || 0) - Number(b.top || 0)) / Math.max(1e-8, Number(a.top || b.top || 0));
 const bottomDelta = Math.abs(Number(a.bottom || 0) - Number(b.bottom || 0)) / Math.max(1e-8, Number(a.bottom || b.bottom || 0));
 return topDelta <= 0.003 && bottomDelta <= 0.004 && Number(a.startIndex || 0) <= Number(b.endIndex || 0) && Number(b.startIndex || 0) <= Number(a.endIndex || 0);
 }

 function selectVisibleDarvasBoxes(boxes = [], settings = normalizeDarvasSettings(), options = {}) {
 const sorted = (Array.isArray(boxes) ? boxes : [])
 .filter(box => !settings.showOnlyHighQuality || box.quality === 'High Quality')
 .filter(box => settings.showFailedBoxes !== false || box.status !== 'Failed')
 .filter(box => settings.showWeakBreakoutBoxes !== false || box.status !== 'Weak Breakout')
 .sort((a, b) => Number(a.startIndex || 0) - Number(b.startIndex || 0));
 const deduped = [];
 sorted.forEach(box => {
  const last = deduped[deduped.length - 1];
  if (last && darvasBoxesOverlap(last, box)) {
  const rank = status => ({ 'Retest Confirmed': 6, 'Breakout Confirmed': 5, 'Weak Breakout': 4, Active: 3, Forming: 2, Failed: 1, 'Low Quality Box': 0 }[status] ?? 0);
  if (rank(box.status) >= rank(last.status) || Number(box.endIndex || 0) >= Number(last.endIndex || 0)) deduped[deduped.length - 1] = box;
  return;
  }
  deduped.push(box);
 });
 const activeStatuses = new Set(['Forming', 'Active', 'Weak Breakout', 'Low Quality Box']);
 const preferred = options.preferredBox || null;
 if (preferred) {
 const earlierCompleted = deduped
 .filter(box => box !== preferred && !activeStatuses.has(box.status) && Number(box.endIndex || 0) <= Number(preferred.startIndex || Number.MAX_SAFE_INTEGER))
 .slice(-Math.max(0, Number(settings.maxBoxesVisible || 10) - 1));
 return [...earlierCompleted, preferred].filter(Boolean).slice(-Math.max(1, Number(settings.maxBoxesVisible || 10)));
 }
 const active = deduped.slice().reverse().find(box => activeStatuses.has(box.status)) || null;
 if (settings.showHistoricalBoxes === false) return [active].filter(Boolean);
 const limit = Math.max(1, Number(settings.maxBoxesVisible || 10));
 const completed = deduped.filter(box => box !== active && !activeStatuses.has(box.status)).slice(-(active ? limit - 1 : limit));
 return [...completed, active].filter(Boolean).slice(-limit);
 }

 function collectDarvasBoxes(visibleCandles = [], state = {}) {
 const settings = normalizeDarvasSettings(state);
 if (!settings.enabled) return { boxes: [], allBoxes: [], settings };
 const candles = (Array.isArray(visibleCandles) ? visibleCandles : [])
 .map(candle => ({
  time: toTime(candle.time),
  open: Number(candle.open || 0),
  high: Number(candle.high || 0),
  low: Number(candle.low || 0),
  close: Number(candle.close || 0),
  volume: Math.max(0, Number(candle.volume || candle.quoteVolume || candle.quote_volume || 0)),
 }))
 .filter(candle => candle.time && candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0);
 const studies = buildDarvasStudies(candles);
 const last = candles[candles.length - 1] || {};
 const cacheKey = [
 String(state.symbol || '').trim().toUpperCase(),
 normalizeDarvasTimeframe(state.timeframe || ''),
 candles.length,
 last.time || 0,
 settings.lookback,
 settings.confirmationCandles,
 settings.volumeMultiplier,
 settings.atrBreakoutBuffer,
 settings.retestAtrTolerance,
 settings.stopLossAtrBuffer,
 settings.maxHeightPct,
 settings.atrHeightMultiple,
 ].join('|');
 const detected = darvasDetectionCache.get(cacheKey) || detectDarvasBoxesFromCandles(candles, state, settings, studies);
 if (!darvasDetectionCache.has(cacheKey)) {
 if (darvasDetectionCache.size > 24) darvasDetectionCache.clear();
 darvasDetectionCache.set(cacheKey, detected);
 }
 const draft = normalizeDarvasBox(state, candles, studies, settings);
 const hasDraft = !!draft;
 const boxes = hasDraft ? [...detected.filter(box => !darvasBoxesOverlap(box, draft)), draft] : detected;
 return { boxes: selectVisibleDarvasBoxes(boxes, settings, { preferredBox: draft }), allBoxes: boxes, settings };
 }

 function darvasOutputObject(box = {}) {
 return {
  top: Number(box.top || 0),
  bottom: Number(box.bottom || 0),
  heightPercent: Number(Number(box.heightPercent || 0).toFixed(2)),
  status: box.status || 'Active',
  formedAt: box.formedAt ? new Date(toTime(box.formedAt) * 1000).toISOString().slice(0, 10) : null,
  breakoutAt: box.breakoutAt ? new Date(toTime(box.breakoutAt) * 1000).toISOString().slice(0, 10) : null,
  volumeConfirmed: box.volumeConfirmed === true,
  trendConfirmed: box.trendConfirmed === true,
  breakoutScore: Math.round(Number(box.score || box.breakoutScore || 0)),
  quality: box.quality || classifyDarvasQuality(box.score),
  entry: Number(box.entry || 0),
  stopLoss: Number(box.stopLoss || 0),
  target1: Number(box.target1 || 0),
  target2: Number(box.target2 || 0),
  riskPercent: Number(Number(box.riskPercent || 0).toFixed(2)),
  riskReward1: Number(Number(box.riskReward1 || 0).toFixed(2)),
  riskReward2: Number(Number(box.riskReward2 || 0).toFixed(2)),
  reason: box.reason || '',
 };
 }

 function darvasTooltipHtml(box = {}) {
 return `<strong>Darvas Box</strong>
<span>Status: ${escapeHtml(box.status || 'Active')}</span>
<span>Top: ${escapeHtml(formatPrice(box.top))}</span>
<span>Bottom: ${escapeHtml(formatPrice(box.bottom))}</span>
<span>Entry: ${escapeHtml(formatPrice(box.entry))}</span>
<span>SL: ${escapeHtml(formatPrice(box.stopLoss))}</span>
<span>T1: ${escapeHtml(formatPrice(box.target1))}</span>
<span>T2: ${escapeHtml(formatPrice(box.target2))}</span>`;
 }

 function renderDarvasLevelLine(kind = '', y = null, left = 0, width = 0, label = '', maxY = Number.POSITIVE_INFINITY) {
 if (!Number.isFinite(y) || y < 0 || y > maxY || width <= 18) return '';
 return `<span class="ds-darvas-level-line ${escapeHtml(kind)}" style="left:${left.toFixed(1)}px;top:${y.toFixed(1)}px;width:${width.toFixed(1)}px"><em>${escapeHtml(label)}</em></span>`;
 }

 function renderDarvasMarker(kind = '', x = null, y = null, label = '') {
 if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
 return `<span class="ds-darvas-marker ${escapeHtml(kind)}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"><em>${escapeHtml(label)}</em></span>`;
 }

 function renderDarvasBoxView(box = {}, chart, priceSeries, candles = [], settings = normalizeDarvasSettings(), layerWidth = 0, layerHeight = 0) {
 const topY = priceSeries.priceToCoordinate(box.top);
 const bottomY = priceSeries.priceToCoordinate(box.bottom);
 if (![topY, bottomY].every(Number.isFinite)) return '';
 const startTime = box.startTime || candles[box.startIndex]?.time;
 const endTime = ['Active', 'Forming', 'Weak Breakout', 'Low Quality Box'].includes(box.status)
 ? candles[candles.length - 1]?.time
 : (box.endTime || candles[box.endIndex]?.time);
 const startXRaw = chart.timeScale().timeToCoordinate(toTime(startTime));
 const endXRaw = chart.timeScale().timeToCoordinate(toTime(endTime));
 if (!Number.isFinite(startXRaw) && !Number.isFinite(endXRaw)) return '';
 const startX = Number.isFinite(startXRaw) ? Math.max(0, startXRaw) : 0;
 const endX = Number.isFinite(endXRaw) ? Math.min(layerWidth - 8, endXRaw) : layerWidth - 72;
 const left = Math.max(0, Math.min(startX, endX));
 const width = Math.max(80, Math.min(layerWidth - left - 4, Math.abs(endX - startX) || 120));
 const top = Math.max(0, Math.min(topY, bottomY));
 const height = Math.max(12, Math.min(layerHeight - top, Math.abs(bottomY - topY)));
 const tone = darvasToneClass(box);
 const score = Math.round(Number(box.score || box.breakoutScore || 0));
 const title = `${box.label || 'Darvas Box'} | Top ${formatPrice(box.top)} | Bottom ${formatPrice(box.bottom)} | Status ${box.status} | Score ${score}`;
 const compactStatus = box.status === 'Breakout Confirmed' ? `DB ${score || 'BO'}` : box.status === 'Weak Breakout' ? 'Weak BO' : box.status === 'Retest Confirmed' ? 'Retest' : box.status === 'Failed' ? 'Failed' : 'DB Active';
 const badgeLeft = Math.max(4, Math.min(layerWidth - 88, left + Math.min(width - 68, Math.max(4, width - 76))));
 const badgeTop = Math.max(4, Math.min(layerHeight - 24, top - 18));
 const badge = `<span class="ds-darvas-status-badge ${escapeHtml(tone)}" style="left:${badgeLeft.toFixed(1)}px;top:${badgeTop.toFixed(1)}px">${escapeHtml(compactStatus)}</span>`;
 const tooltip = settings.showTooltip ? `<span class="ds-darvas-tooltip">${darvasTooltipHtml(box)}</span>` : '';
const boxHtml = `<div class="ds-darvas-box ${escapeHtml(tone)} ${escapeHtml(String(box.quality || '').toLowerCase().replace(/\s+/g, '-'))}" title="${escapeHtml(title)}" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${width.toFixed(1)}px;height:${height.toFixed(1)}px">
<span class="ds-darvas-fill"></span>
<span class="ds-darvas-line top"></span>
<span class="ds-darvas-line bottom"></span>
${tooltip}
</div>`;
 const lineLeft = Math.max(0, left);
 const lineWidth = Math.max(0, layerWidth - lineLeft - 12);
 const entryY = priceSeries.priceToCoordinate(box.entry);
 const target1Y = priceSeries.priceToCoordinate(box.target1);
 const target2Y = priceSeries.priceToCoordinate(box.target2);
 const stopY = priceSeries.priceToCoordinate(box.stopLoss);
 const canShowTargets = settings.showTargetLines !== false && settings.showTargets !== false && box.status !== 'Failed';
 const levelHtml = [
 settings.showEntryLine !== false && box.status !== 'Failed' ? renderDarvasLevelLine('entry', entryY, lineLeft, lineWidth, 'Entry', layerHeight) : '',
 settings.showStopLoss ? renderDarvasLevelLine('sl', stopY, lineLeft, lineWidth, 'SL', layerHeight) : '',
 canShowTargets ? renderDarvasLevelLine('target', target1Y, lineLeft, lineWidth, 'T1', layerHeight) : '',
 canShowTargets ? renderDarvasLevelLine('target t2', target2Y, lineLeft, lineWidth, 'T2', layerHeight) : '',
 ].join('');
 const breakoutCandle = hasDarvasIndex(box.breakoutIndex) ? candles[box.breakoutIndex] : null;
 const retestCandle = hasDarvasIndex(box.retestIndex) ? candles[box.retestIndex] : null;
 const failedCandle = hasDarvasIndex(box.failedIndex) ? candles[box.failedIndex] : null;
 const breakoutY = breakoutCandle ? priceSeries.priceToCoordinate(Number(breakoutCandle.high || box.top)) : null;
 const failedY = failedCandle ? priceSeries.priceToCoordinate(Number(failedCandle.low || box.bottom)) : null;
 const breakoutMarker = breakoutCandle
 ? renderDarvasMarker(box.status === 'Weak Breakout' ? 'weak' : 'breakout', chart.timeScale().timeToCoordinate(toTime(breakoutCandle.time)), Number.isFinite(breakoutY) ? breakoutY - 24 : null, box.status === 'Weak Breakout' ? 'Weak BO' : 'Breakout')
 : '';
 const retestMarker = retestCandle
 ? renderDarvasMarker('retest', chart.timeScale().timeToCoordinate(toTime(retestCandle.time)), priceSeries.priceToCoordinate(Number(retestCandle.low || box.top)), 'Retest')
 : '';
 const failureMarker = failedCandle
 ? renderDarvasMarker('failed', chart.timeScale().timeToCoordinate(toTime(failedCandle.time)), Number.isFinite(failedY) ? failedY + 18 : null, 'Failed')
 : '';
 return `${levelHtml}${boxHtml}${badge}${breakoutMarker}${retestMarker}${failureMarker}`;
 }

 function darvasDateLabel(time = 0) {
 const seconds = toTime(time);
 if (!seconds) return '-';
 try {
 return new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 16);
 } catch (_) {
 return '-';
 }
 }

 function renderDarvasScannerPanel(host, chart, candles = [], boxes = [], state = {}, settings = normalizeDarvasSettings(state)) {
 const shell = host?.closest?.('.ds-chart-shell') || host?.parentElement || host;
 if (!shell) return;
 let panel = shell.querySelector('.ds-darvas-scanner-panel');
 if (!settings.enabled || settings.showScannerDetails === false) {
 if (panel) panel.remove();
 return;
 }
 if (!panel) {
 panel = document.createElement('div');
 panel.className = 'ds-darvas-scanner-panel';
 shell.appendChild(panel);
 }
 const filter = String(panel.dataset.filter || 'all').trim().toLowerCase();
 const sort = String(panel.dataset.sort || 'time').trim().toLowerCase();
 const filterBox = box => {
 if (filter === 'active') return box.status === 'Active' || box.status === 'Forming';
 if (filter === 'breakout') return box.status === 'Breakout Confirmed';
 if (filter === 'retest') return box.status === 'Retest Confirmed';
 if (filter === 'failed') return box.status === 'Failed';
 if (filter === 'high') return box.quality === 'High Quality';
 return true;
 };
 const sortBox = (a, b) => {
 if (sort === 'score') return Number(b.score || 0) - Number(a.score || 0);
 if (sort === 'rr') return Number(b.riskReward1 || 0) - Number(a.riskReward1 || 0);
 if (sort === 'volume') return Number(b.volumeRatio || 0) - Number(a.volumeRatio || 0);
 return Number(b.formedAt || 0) - Number(a.formedAt || 0);
 };
 const filtered = (Array.isArray(boxes) ? boxes : [])
 .filter(box => settings.showFailedBoxes !== false || box.status !== 'Failed')
 .filter(box => settings.showWeakBreakoutBoxes !== false || box.status !== 'Weak Breakout')
 .filter(box => !settings.showOnlyHighQuality || box.quality === 'High Quality')
 .filter(filterBox)
 .sort(sortBox);
 const rows = filtered.map((box, index) => {
 const output = darvasOutputObject(box);
 return `<tr data-darvas-focus-index="${escapeHtml(index)}">
 <td>${escapeHtml(String(state.symbol || '-').toUpperCase())}</td>
 <td>${escapeHtml(String(state.timeframe || '-').toUpperCase())}</td>
 <td><span class="ds-darvas-scan-status ${escapeHtml(darvasToneClass(box))}">${escapeHtml(output.status)}</span></td>
 <td>${escapeHtml(darvasDateLabel(box.formedAt || box.startTime))}</td>
 <td>${escapeHtml(formatPrice(output.top))}</td>
 <td>${escapeHtml(formatPrice(output.bottom))}</td>
 <td>${escapeHtml(output.heightPercent.toFixed(1))}%</td>
 <td>${escapeHtml(formatPrice(output.entry))}</td>
 <td>${escapeHtml(formatPrice(output.stopLoss))}</td>
 <td>${escapeHtml(formatPrice(output.target1))}</td>
 <td>${escapeHtml(formatPrice(output.target2))}</td>
 <td>${escapeHtml(output.breakoutScore)}</td>
 <td>${escapeHtml(output.quality)}</td>
 <td>${escapeHtml(output.volumeConfirmed ? 'Confirmed' : 'Weak')}</td>
 <td>${escapeHtml(output.trendConfirmed ? 'Confirmed' : 'Weak')}</td>
 <td>${escapeHtml(output.riskPercent.toFixed(2))}%</td>
 <td>${escapeHtml(output.riskReward1 > 0 ? `1:${output.riskReward1.toFixed(2)}` : '-')}</td>
 <td>${escapeHtml(output.riskReward2 > 0 ? `1:${output.riskReward2.toFixed(2)}` : '-')}</td>
 <td title="${escapeHtml(output.reason)}">${escapeHtml(output.reason)}</td>
 </tr>`;
 }).join('');
 panel.innerHTML = `<div class="ds-darvas-scanner-head">
 <div><strong>Darvas Scanner</strong><span>${escapeHtml(filtered.length)} boxes from loaded ${escapeHtml(String(state.timeframe || '').toUpperCase())} history</span></div>
 <div class="ds-darvas-scanner-filters">
 ${['all', 'active', 'breakout', 'retest', 'failed', 'high'].map(key => `<button type="button" class="${filter === key ? 'active' : ''}" data-darvas-scan-filter="${escapeHtml(key)}">${escapeHtml(key === 'all' ? 'All' : key === 'high' ? 'High Quality' : key.charAt(0).toUpperCase() + key.slice(1))}</button>`).join('')}
 <select data-darvas-scan-sort title="Sort Darvas scanner">
 ${[
 ['time', 'Formation Time'],
 ['score', 'Score'],
 ['rr', 'Risk Reward'],
 ['volume', 'Volume Confirmation'],
 ].map(([value, label]) => `<option value="${value}" ${sort === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
 </select>
 </div>
 </div>
 <div class="ds-darvas-scanner-table-wrap">
 <table class="ds-darvas-scanner-table">
 <thead><tr>
 <th>Symbol</th><th>TF</th><th>Status</th><th>Formation</th><th>Top</th><th>Bottom</th><th>Height</th><th>Entry</th><th>SL</th><th>T1</th><th>T2</th><th>Score</th><th>Quality</th><th>Volume</th><th>Trend</th><th>Risk</th><th>RR T1</th><th>RR T2</th><th>Reason</th>
 </tr></thead>
 <tbody>${rows || '<tr><td colspan="19">No Darvas Box found with current filters.</td></tr>'}</tbody>
 </table>
 </div>`;
 panel.querySelectorAll('[data-darvas-focus-index]').forEach(row => {
 row.addEventListener('click', () => {
 const box = filtered[Number(row.dataset.darvasFocusIndex || -1)];
 if (!box || !chart?.timeScale) return;
 const fromIndex = Math.max(0, Number(box.startIndex || 0) - 8);
 const toIndex = Math.min(candles.length - 1, Number(box.endIndex || box.confirmedIndex || fromIndex) + 14);
 const from = toTime(candles[fromIndex]?.time || box.startTime);
 const to = toTime(candles[toIndex]?.time || box.endTime);
 if (from && to && to > from) {
 try { chart.timeScale().setVisibleRange({ from, to }); } catch (_) {}
 }
 });
 });
 panel.querySelectorAll('[data-darvas-scan-filter]').forEach(button => {
 button.addEventListener('click', () => {
 panel.dataset.filter = String(button.dataset.darvasScanFilter || 'all').trim().toLowerCase() || 'all';
 renderDarvasScannerPanel(host, chart, candles, boxes, state, settings);
 });
 });
 const sortSelect = panel.querySelector('[data-darvas-scan-sort]');
 if (sortSelect) {
 sortSelect.addEventListener('change', () => {
 panel.dataset.sort = String(sortSelect.value || 'time').trim().toLowerCase() || 'time';
 renderDarvasScannerPanel(host, chart, candles, boxes, state, settings);
 });
 }
 }

 function renderDarvasBoxLayer(container, chart, priceSeries, visibleCandles = [], state = {}) {
 const host = container;
 if (!host || !chart?.timeScale || !priceSeries?.priceToCoordinate) return;
 if (typeof globalThis.getComputedStyle === 'function' && globalThis.getComputedStyle(host).position === 'static') {
 host.style.position = 'relative';
 }
 let layer = host.querySelector('.ds-darvas-box-layer');
 const { boxes, allBoxes, settings } = collectDarvasBoxes(visibleCandles, state);
 renderDarvasScannerPanel(host, chart, visibleCandles, allBoxes || [], state, settings);
 if (!boxes.length || !Array.isArray(visibleCandles) || visibleCandles.length < 2) {
  if (layer) {
  layer.innerHTML = '';
  layer.removeAttribute('data-darvas-output');
  if (!settings.enabled) layer.remove();
  }
  return;
 }
 if (!layer) {
  layer = document.createElement('div');
  layer.className = 'ds-darvas-box-layer';
  host.appendChild(layer);
 }
 const layerWidth = Math.max(120, Number(layer.clientWidth || container.clientWidth || 0));
 const layerHeight = Math.max(80, Number(container.clientHeight || layer.clientHeight || 0));
 layer.dataset.darvasOutput = JSON.stringify((allBoxes || boxes).map(darvasOutputObject));
 layer.innerHTML = boxes.map(box => renderDarvasBoxView(box, chart, priceSeries, visibleCandles, settings, layerWidth, layerHeight)).join('');
 }

 function visibleLogicalRange(chart) {
 try {
 return chart?.timeScale?.().getVisibleLogicalRange?.() || null;
 } catch (_) {
 return null;
 }
 }

 function setVisibleLogicalRange(chart, range = null) {
 if (!chart || !range) return false;
 try {
 chart.timeScale().setVisibleLogicalRange(range);
 return true;
 } catch (_) {
 return false;
 }
 }

 function navigate(container, action = '') {
 const instance = instances.get(container);
 const chart = instance?.chart;
 if (!chart?.timeScale) return false;
 const timeScale = chart.timeScale();
 const command = String(action || '').trim().toLowerCase();
 if (command === 'fit' || command === 'reset') {
 try {
 timeScale.fitContent();
 instance.renderKeyLevels?.();
 return true;
 } catch (_) {
 return false;
 }
 }
 const range = visibleLogicalRange(chart);
 if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
 const width = Math.max(4, range.to - range.from);
 if (command === 'zoom-in' || command === 'in') {
 const shrink = width * 0.14;
 const ok = setVisibleLogicalRange(chart, { from: range.from + shrink, to: range.to - shrink });
 instance.renderKeyLevels?.();
 return ok;
 }
 if (command === 'zoom-out' || command === 'out') {
 const expand = width * 0.18;
 const ok = setVisibleLogicalRange(chart, { from: range.from - expand, to: range.to + expand });
 instance.renderKeyLevels?.();
 return ok;
 }
 if (command === 'left' || command === 'scroll-left') {
 const step = Math.max(4, Math.round(width * 0.22));
 timeScale.applyOptions?.({ fixRightEdge: false, rightBarStaysOnScroll: false });
 const ok = setVisibleLogicalRange(chart, { from: range.from - step, to: range.to - step });
 instance.renderKeyLevels?.();
 return ok;
 }
 if (command === 'right' || command === 'scroll-right') {
 const step = Math.max(4, Math.round(width * 0.22));
 timeScale.applyOptions?.({ fixRightEdge: false, rightBarStaysOnScroll: false });
 const ok = setVisibleLogicalRange(chart, { from: range.from + step, to: range.to + step });
 instance.renderKeyLevels?.();
 return ok;
 }
 }
 try {
 if (command === 'left' || command === 'scroll-left') {
 timeScale.applyOptions?.({ fixRightEdge: false, rightBarStaysOnScroll: false });
 timeScale.scrollToPosition((timeScale.scrollPosition?.() || 0) + 12, false);
 } else if (command === 'right' || command === 'scroll-right') {
 timeScale.applyOptions?.({ fixRightEdge: false, rightBarStaysOnScroll: false });
 timeScale.scrollToPosition((timeScale.scrollPosition?.() || 0) - 12, false);
 }
 else return false;
 instance.renderKeyLevels?.();
 return true;
 } catch (_) {
 return false;
 }
 }

 function markerColor(tone = '') {
 if (tone === 'stop') return COLORS.down;
 if (tone === 'target' || tone === 'exit') return COLORS.up;
 if (tone === 'entry') return COLORS.vwap;
 return COLORS.ema30;
 }

 function formatVolume(value = 0) {
 const numeric = Number(value || 0);
 if (!Number.isFinite(numeric) || numeric <= 0) return '0';
 if (numeric >= 1e9) return `${(numeric / 1e9).toFixed(2)}B`;
 if (numeric >= 1e6) return `${(numeric / 1e6).toFixed(2)}M`;
 if (numeric >= 1e3) return `${(numeric / 1e3).toFixed(1)}K`;
 return String(Math.round(numeric));
 }

 function nearestIndexByTime(candles = [], time = 0) {
 const target = toTime(time);
 if (!target || !candles.length) return -1;
 let bestIndex = -1;
 let bestGap = Number.POSITIVE_INFINITY;
 candles.forEach((candle, index) => {
 const gap = Math.abs(toTime(candle.time) - target);
 if (gap < bestGap) {
 bestGap = gap;
 bestIndex = index;
 }
 });
 return bestIndex;
 }

 function valueAt(values = [], index = -1) {
 const value = Number(values[index]);
 return Number.isFinite(value) ? value : null;
 }

 function createReadout(container, candles = [], indicators = {}) {
 const readout = document.createElement('div');
 readout.className = 'ds-lwc-readout';
 container.appendChild(readout);
 const renderRow = (label, value, tone = '') => `<span class="${tone}"><em>${label}</em><strong>${value}</strong></span>`;
 const update = (index = candles.length - 1) => {
 const candle = candles[Math.max(0, Math.min(index, candles.length - 1))];
 if (!candle) return;
 const direction = candle.close >= candle.open ? 'up' : 'down';
 const change = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0;
 const timeLabel = new Date(toTime(candle.time) * 1000).toLocaleString([], {
 month: 'short',
 day: 'numeric',
 hour: 'numeric',
 minute: '2-digit',
 });
 readout.innerHTML = [
 renderRow('Time', timeLabel),
 renderRow('O', formatPrice(candle.open)),
 renderRow('H', formatPrice(candle.high)),
 renderRow('L', formatPrice(candle.low)),
 renderRow('C', formatPrice(candle.close), direction),
 renderRow('Move', `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`, direction),
 renderRow('Vol', formatVolume(candle.volume)),
 renderRow('EMA9', formatPrice(valueAt(indicators.ema9, index))),
 renderRow('VWAP', formatPrice(valueAt(indicators.vwap, index))),
 renderRow('RSI', valueAt(indicators.rsi14, index) == null ? '-' : valueAt(indicators.rsi14, index).toFixed(1)),
 ].join('');
 };
 update(candles.length - 1);
 return { element: readout, update };
 }

 function render(container, payload = {}) {
 if (!container || !globalThis.LightweightCharts?.createChart) return;
 const signature = JSON.stringify({
 surface: payload.surface || '',
 symbol: payload.dataset?.symbol || payload.state?.symbol || '',
 timeframe: payload.dataset?.timeframe || payload.state?.timeframe || '',
 preset: payload.state?.preset || '',
 chartType: payload.state?.chartType || '',
 indicatorStyle: payload.state?.indicatorStyle || '',
 showReadout: payload.state?.showReadout === true,
 showIndicatorLegend: payload.state?.showIndicatorLegend !== false,
 showGrid: payload.state?.showGrid === true,
 showOrders: payload.state?.showOrders === true,
 showVwap: payload.state?.showVwap === true,
 indicators: payload.state?.indicators || {},
 compareWithIndex: payload.state?.compareWithIndex !== false,
 indexCompareCount: payload.indexComparison?.candles?.length || 0,
 indexCompareNewest: payload.indexComparison?.candles?.[payload.indexComparison?.candles?.length - 1]?.time || 0,
 candleCount: payload.dataset?.candles?.length || 0,
 newest: payload.dataset?.candles?.[payload.dataset?.candles?.length - 1]?.time || 0,
 modelCount: payload.model?.candles?.length || 0,
 keyZones: payload.model?.keyZones?.length || 0,
 keyZoneSettings: (payload.model?.keyZones || []).map(zone => [
 zone.kind,
 zone.price,
 zone.touches,
 zone.strengthPct,
 zone.displayStrengthAs,
 zone.showPivotCircles,
 zone.showLevelGlow,
 zone.thickness,
 zone.colorRole,
 ].join(':')).join('|'),
 orderTags: payload.model?.orderTags?.length || 0,
 orderTagSig: (payload.model?.orderTags || []).map(tag => `${tag.key}:${tag.price}:${tag.label}:${tag.source}:${tag.tone}`).join('|'),
 replayCursor: payload.model?.replayCursor?.time || 0,
 chartTradingMode: payload.state?.chartTradingMode || '',
 chartTradingDraft: payload.state?.chartTradingDraft || null,
 darvasBox: payload.state?.chartTradingDraft?.darvasBox || null,
 darvasSettings: payload.state?.darvasSettings || {},
 replayMode: payload.state?.replayMode || null,
 });
 const old = instances.get(container);
 if (old?.signature === signature && old?.chart) return;
 if (old?.resizeObserver) old.resizeObserver.disconnect();
 if (old?.chart) old.chart.remove();
 container.innerHTML = '';

 const chart = globalThis.LightweightCharts.createChart(container, createBaseOptions(container));
 const indicatorApi = globalThis.FWDTradeDeskIndicators;
 const allowSigned = payload.dataset?.signedPriceSeries === true;
 const candles = indicatorApi?.normalizeCandles(payload.dataset?.candles || [], { allowSigned }) || [];
 const visibleTimes = new Set((payload.model?.candles || []).map(candle => toTime(candle.time)).filter(Boolean));
 const visibleCandles = candles
 .map(candle => ({
 time: toTime(candle.time),
 open: candle.open,
 high: candle.high,
 low: candle.low,
 close: candle.close,
 volume: Math.max(0, Number(candle.volume || 0)),
 }))
 .filter(candle => candle.time && (!visibleTimes.size || visibleTimes.has(candle.time)));
 if (!visibleCandles.length) return;

 const state = payload.state || {};
 const showGrid = state.showGrid === true;
 chart.applyOptions({
 grid: {
 vertLines: { color: showGrid ? COLORS.grid : 'rgba(0, 0, 0, 0)', visible: showGrid },
 horzLines: { color: showGrid ? COLORS.grid : 'rgba(0, 0, 0, 0)', visible: showGrid },
 },
 });
 const preset = payload.presetMeta || {};
 const active = activeIndicators(state, preset);
 const indicators = payload.indicators || (needsIndicatorData(active) ? indicatorApi?.calculate(candles, payload.dataset?.studies || {}, { only: requestedIndicatorKeys(active), obvSmaLength: Number(state.indicators?.obvSmaLength || 100) || 100, allowSigned }) : {}) || {};
 const readout = state.showReadout === true
 ? createReadout(container, candles, indicators)
 : { update() {} };
 const chartType = normalizeChartType(state.chartType);
 const indicatorLabelOptions = state.showIndicatorLegend !== false && normalizeIndicatorStyle(state.indicatorStyle) === 'tradingview'
 ? { showTitle: true, lastValueVisible: true }
 : { showTitle: false, lastValueVisible: false };
 const isSyntheticIndex = payload.dataset?.syntheticIndex === true;
 const isCarryMetric = payload.dataset?.syntheticMetric === 'carryAnnualPct';
 const latestClose = Number(visibleCandles[visibleCandles.length - 1]?.close || candles[candles.length - 1]?.close || 0);
 const pricePrecision = isSyntheticIndex ? 2 : latestClose >= 1000 ? 2 : latestClose >= 1 ? 4 : 6;
 const priceFormat = isCarryMetric
 ? { type: 'custom', formatter: value => `${Number(value || 0).toFixed(2)}%`, minMove: 0.01 }
 : { type: 'price', precision: pricePrecision, minMove: pricePrecision >= 6 ? 0.000001 : pricePrecision >= 4 ? 0.0001 : 0.01 };
 const priceSeries = chartType === 'line'
 ? series(chart, globalThis.LightweightCharts.LineSeries, {
 color: COLORS.up,
 lineWidth: 3,
 priceLineVisible: true,
 lastValueVisible: true,
 priceFormat,
 }, 0)
 : chartType === 'bars'
 ? series(chart, globalThis.LightweightCharts.BarSeries, {
 seriesType: 'Bar',
 upColor: COLORS.up,
 downColor: COLORS.down,
 thinBars: true,
 openVisible: true,
 priceFormat,
 }, 0)
 : series(chart, globalThis.LightweightCharts.CandlestickSeries, {
 upColor: COLORS.up,
 downColor: COLORS.down,
 borderUpColor: COLORS.up,
 borderDownColor: COLORS.down,
 wickUpColor: COLORS.up,
 wickDownColor: COLORS.down,
 priceFormat,
 }, 0);
 priceSeries.setData(chartType === 'line'
 ? visibleCandles.map(candle => ({ time: candle.time, value: candle.close }))
 : visibleCandles);

 const spreadBands = payload.dataset?.spreadBands || null;
 if (allowSigned && spreadBands && Array.isArray(spreadBands.mean) && spreadBands.mean.length === candles.length) {
  addLine(chart, 'Spread Mean', lineData(candles, spreadBands.mean, visibleTimes), '#ffd277', 0, { lineWidth: 2, showTitle: true });
  addLine(chart, '+1 SD', lineData(candles, spreadBands.upper1, visibleTimes), 'rgba(121, 221, 255, 0.72)', 0, { lineWidth: 1 });
  addLine(chart, '-1 SD', lineData(candles, spreadBands.lower1, visibleTimes), 'rgba(121, 221, 255, 0.72)', 0, { lineWidth: 1 });
  addLine(chart, '+2 SD', lineData(candles, spreadBands.upper2, visibleTimes), 'rgba(255, 93, 122, 0.62)', 0, { lineWidth: 1 });
  addLine(chart, '-2 SD', lineData(candles, spreadBands.lower2, visibleTimes), 'rgba(29, 233, 182, 0.62)', 0, { lineWidth: 1 });
  addPriceLine(priceSeries, { price: 0, label: 'Zero spread', allowSigned: true }, 'rgba(255, 210, 119, 0.72)');
 }

 const compareData = state.compareWithIndex !== false
 ? indexComparisonData(candles, payload.indexComparison?.candles || [], visibleTimes)
 : [];
 if (compareData.length >= 2) {
 addLine(chart, payload.indexComparison?.label || 'FWD Index', compareData, COLORS.indexCompare, 0, {
 lineWidth: 3,
 lastValueVisible: true,
 title: payload.indexComparison?.label || 'FWD Index',
 crosshairMarkerVisible: true,
 });
 }

 if (active.volume) {
 const volumeData = candles
 .map(candle => {
 const time = toTime(candle.time);
 if (!time || (visibleTimes.size && !visibleTimes.has(time))) return null;
 return {
 time,
 value: Math.max(0, Number(candle.volume || 0)),
 color: candle.close >= candle.open ? 'rgba(29, 233, 182, 0.36)' : 'rgba(255, 93, 122, 0.36)',
 };
 })
 .filter(Boolean);
 const vol = series(chart, globalThis.LightweightCharts.HistogramSeries, {
 priceFormat: { type: 'volume' },
 priceScaleId: 'volume',
 lastValueVisible: false,
 priceLineVisible: false,
 }, 0);
 chart.priceScale('volume').applyOptions({
 scaleMargins: { top: 0.86, bottom: 0 },
 borderVisible: false,
 visible: false,
 });
 vol.setData(volumeData);
 }

 if (active.ema) {
 if (active.ema9) addLine(chart, 'EMA 9', lineData(candles, indicators.ema9, visibleTimes, { positiveOnly: !allowSigned }), COLORS.ema9, 0, { ...indicatorLabelOptions, lineWidth: 2 });
 if (active.ema30) addLine(chart, 'EMA 30', lineData(candles, indicators.ema30, visibleTimes, { positiveOnly: !allowSigned }), COLORS.ema30, 0, { ...indicatorLabelOptions, lineWidth: 3 });
 if (active.ema100) addLine(chart, 'EMA 100', lineData(candles, indicators.ema100, visibleTimes, { positiveOnly: !allowSigned }), COLORS.ema100, 0, { ...indicatorLabelOptions, lineWidth: 4 });
 }
 if (active.sma) {
 addLine(chart, 'SMA 20', lineData(candles, indicators.sma20, visibleTimes, { positiveOnly: true }), COLORS.sma20, 0, { ...indicatorLabelOptions, lineWidth: 1 });
 addLine(chart, 'SMA 50', lineData(candles, indicators.sma50, visibleTimes, { positiveOnly: true }), COLORS.sma50, 0, { ...indicatorLabelOptions, lineWidth: 1 });
 addLine(chart, 'SMA 200', lineData(candles, indicators.sma200, visibleTimes, { positiveOnly: true }), COLORS.sma200, 0, { ...indicatorLabelOptions, lineWidth: 2 });
 }
 if (active.vwap) addLine(chart, 'VWAP', lineData(candles, indicators.vwap, visibleTimes, { positiveOnly: true }), COLORS.vwap, 0, { ...indicatorLabelOptions, lineWidth: 3 });
 if (active.bollinger) {
 addLine(chart, 'BB Upper', lineData(candles, indicators.bbUpper, visibleTimes, { positiveOnly: true }), COLORS.bollinger, 0, { lineWidth: 1, lastValueVisible: false });
 addLine(chart, 'BB Basis', lineData(candles, indicators.bbMiddle, visibleTimes, { positiveOnly: true }), 'rgba(155, 182, 255, 0.56)', 0, { lineWidth: 1, lastValueVisible: false });
 addLine(chart, 'BB Lower', lineData(candles, indicators.bbLower, visibleTimes, { positiveOnly: true }), COLORS.bollinger, 0, { lineWidth: 1, lastValueVisible: false });
 }
 if (active.supertrend) {
 const stData = lineData(candles, indicators.supertrend, visibleTimes, { positiveOnly: true });
 addLine(chart, 'Supertrend', stData, COLORS.supertrendUp, 0, { lineWidth: 2 });
 }

 let paneIndex = 1;
 if (active.rsi) {
 addLine(chart, 'RSI 14', lineData(candles, indicators.rsi14, visibleTimes), COLORS.rsi, paneIndex, { lineWidth: 2 });
 addLine(chart, 'RSI 70', visibleCandles.map(candle => ({ time: candle.time, value: 70 })), 'rgba(255, 210, 119, 0.45)', paneIndex, { lineWidth: 1, lastValueVisible: false });
 addLine(chart, 'RSI 30', visibleCandles.map(candle => ({ time: candle.time, value: 30 })), 'rgba(255, 93, 122, 0.45)', paneIndex, { lineWidth: 1, lastValueVisible: false });
 paneIndex += 1;
 }
 if (active.macd) {
 const hist = series(chart, globalThis.LightweightCharts.HistogramSeries, {
 priceLineVisible: false,
 lastValueVisible: false,
 title: '',
 }, paneIndex);
 hist.setData(histogramData(candles, indicators.macdHistogram, visibleTimes, value => value >= 0 ? 'rgba(29, 233, 182, 0.52)' : 'rgba(255, 93, 122, 0.52)'));
 addLine(chart, 'MACD', lineData(candles, indicators.macdLine, visibleTimes), COLORS.macd, paneIndex, { lineWidth: 2 });
 addLine(chart, 'Signal', lineData(candles, indicators.macdSignal, visibleTimes), COLORS.signal, paneIndex, { lineWidth: 2 });
 paneIndex += 1;
 }
 if (active.obv) {
 if (active.obvLine) addLine(chart, 'OBV', lineData(candles, indicators.obv, visibleTimes, { skipLeadingZero: true }), COLORS.obv, paneIndex, { ...indicatorLabelOptions, lineWidth: 2, priceFormat: { type: 'volume' } });
 if (active.obvSma) addLine(chart, `OBV SMA ${Number(state.indicators?.obvSmaLength || 100) || 100}`, lineData(candles, indicators.obvSma100, visibleTimes, { skipLeadingZero: true }), COLORS.obvSma, paneIndex, { ...indicatorLabelOptions, lineWidth: 2, priceFormat: { type: 'volume' } });
 paneIndex += 1;
 }
 if (active.atr) {
 addLine(chart, 'ATR 14', lineData(candles, indicators.atr14, visibleTimes), COLORS.atr, paneIndex, { lineWidth: 2 });
 }

 (payload.model?.orderTags || []).forEach(tag => {
 const color = tag.tone === 'stop' ? COLORS.down : tag.tone === 'target' ? COLORS.up : COLORS.vwap;
 addPriceLine(priceSeries, tag, color);
 });
 (payload.model?.keyZones || []).forEach(zone => addKeyZone(priceSeries, zone));
 const keyZoneKeys = new Set((payload.model?.keyZones || []).map(zone => String(zone.key || `${zone.tf || ''}:${zone.kind || ''}:${zone.price || ''}`)));
 (payload.intelligence?.priceBands || []).filter(zone => !keyZoneKeys.has(String(zone.key || ''))).forEach(zone => {
 const color = zone.kind === 'resistance' ? 'rgba(255, 93, 122, 0.52)' : 'rgba(29, 233, 182, 0.52)';
 if (Number(zone.zoneHigh || 0) > 0 && Number(zone.zoneLow || 0) > 0 && Math.abs(Number(zone.zoneHigh) - Number(zone.zoneLow)) > 0) {
 addPriceLine(priceSeries, { price: zone.zoneHigh, label: `${zone.label} high`, thickness: 1 }, color);
 addPriceLine(priceSeries, { price: zone.zoneLow, label: `${zone.label} low`, thickness: 1 }, color);
 }
 });
 (payload.intelligence?.decision?.lines || []).forEach(line => {
 const color = line.tone === 'danger' ? COLORS.down : line.tone === 'watch' ? COLORS.vwap : COLORS.text;
 addPriceLine(priceSeries, {
 price: line.price,
 label: line.label || 'Decision',
 thickness: line.tone === 'danger' ? 2 : 1,
 }, color);
 });

 const replayMarkers = (payload.model?.replayMarkers || []).map(marker => ({
 time: toTime(marker.ts || marker.time),
 position: marker.tone === 'entry' ? 'belowBar' : 'aboveBar',
 color: markerColor(marker.tone),
 shape: marker.tone === 'entry' ? 'arrowUp' : 'arrowDown',
 text: String(marker.label || marker.key || '').slice(0, 16),
 })).filter(marker => marker.time);
 const intelligenceMarkerSource = [
 ...(payload.intelligence?.markers || []),
 ...(payload.intelligence?.decision?.markers || []),
 ];
 const intelligenceMarkers = intelligenceMarkerSource.map(marker => ({
 time: toTime(marker.time),
 position: marker.position || 'belowBar',
 color: marker.tone === 'danger' ? COLORS.down : marker.tone === 'good' ? COLORS.up : COLORS.vwap,
 shape: marker.shape || 'circle',
 text: String(marker.label || '').slice(0, 18),
 })).filter(marker => marker.time);
 const spreadRollMarkers = (payload.dataset?.spreadRollEvents || []).slice(-4).map(marker => ({
  time: toTime(marker.time),
  position: 'aboveBar',
  color: COLORS.signal,
  shape: 'square',
  text: marker.type === 'expiry_fallback' ? 'Expiry roll' : 'Liquidity roll',
 })).filter(marker => marker.time);
 const allMarkers = [...replayMarkers, ...intelligenceMarkers, ...spreadRollMarkers];
 if (allMarkers.length && globalThis.LightweightCharts.createSeriesMarkers) {
 globalThis.LightweightCharts.createSeriesMarkers(priceSeries, allMarkers);
 }

 if (chart.subscribeCrosshairMove) {
 chart.subscribeCrosshairMove(param => {
 const pointTime = param?.time;
 if (!pointTime) {
 readout.update(candles.length - 1);
 return;
 }
 const index = nearestIndexByTime(candles, pointTime);
 if (index >= 0) readout.update(index);
 });
 }

 const clickHandler = event => showPinnedCandleReadout(container, chart, priceSeries, candles, event);
 container.addEventListener('click', clickHandler);

 chart.timeScale().fitContent();
 chart.timeScale().applyOptions?.({
 rightOffset: 0,
 fixRightEdge: true,
 rightBarStaysOnScroll: true,
 });
 const renderOverlays = () => {
 renderKeyLevelLayer(container, chart, priceSeries, payload.model?.keyZones || []);
 renderDarvasBoxLayer(container, chart, priceSeries, candles, state);
 };
 renderOverlays();
 if (typeof requestAnimationFrame === 'function') requestAnimationFrame(renderOverlays);
 let resizeFrame = 0;
 const resizeObserver = new ResizeObserver(() => {
 if (resizeFrame) cancelAnimationFrame(resizeFrame);
 resizeFrame = requestAnimationFrame(() => {
 resizeFrame = 0;
 chart.applyOptions({
 width: Math.max(320, container.clientWidth || 720),
 height: Math.max(420, container.clientHeight || 460),
 });
 renderOverlays();
 });
 });
 resizeObserver.observe(container);
 chart.timeScale().subscribeVisibleLogicalRangeChange?.(renderOverlays);
 instances.set(container, { chart, priceSeries, resizeObserver, signature, renderKeyLevels: renderOverlays, resizeFrame, visibleCandles, model: payload.model || null, clickHandler });
 }

 function readPoint(container, event = null) {
 const instance = instances.get(container);
 if (!instance?.chart || !instance?.priceSeries || !event) return null;
 const rect = container.getBoundingClientRect();
 const x = Number(event.clientX || 0) - rect.left;
 const y = Number(event.clientY || 0) - rect.top;
 const price = typeof instance.priceSeries.coordinateToPrice === 'function'
 ? Number(instance.priceSeries.coordinateToPrice(y))
 : 0;
 const time = typeof instance.chart.timeScale?.().coordinateToTime === 'function'
 ? instance.chart.timeScale().coordinateToTime(x)
 : null;
 return {
 x,
 y,
 price: Number.isFinite(price) && price > 0 ? price : 0,
 time,
 visibleRange: instance.chart.timeScale?.().getVisibleLogicalRange?.() || null,
 };
 }

 function priceToCoordinate(container, price = 0) {
 const instance = instances.get(container);
 if (!instance?.priceSeries || !(Number(price) > 0) || typeof instance.priceSeries.priceToCoordinate !== 'function') return null;
 return instance.priceSeries.priceToCoordinate(Number(price));
 }

 function getVisibleRange(container) {
 const instance = instances.get(container);
 return instance?.chart?.timeScale?.().getVisibleLogicalRange?.() || null;
 }

 function dispose(container) {
 const old = instances.get(container);
 if (old?.resizeFrame) cancelAnimationFrame(old.resizeFrame);
 if (old?.resizeObserver) old.resizeObserver.disconnect();
 if (old?.clickHandler) container.removeEventListener('click', old.clickHandler);
 if (old?.chart) old.chart.remove();
 instances.delete(container);
 }

 globalThis.FWDTradeDeskChartEngine = Object.freeze({
 render,
 dispose,
 navigate,
 readPoint,
 priceToCoordinate,
 getVisibleRange,
 });
})();
