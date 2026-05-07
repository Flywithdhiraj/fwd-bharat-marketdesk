'use strict';

(() => {
 const instances = new WeakMap();

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
 supertrendUp: '#1de9b6',
 supertrendDown: '#ff5d7a',
 supportDaily: '#ffd84e',
 supportIntraday: '#00c3ff',
 resistanceDaily: '#ff4757',
 resistanceIntraday: '#ff9c33',
 });

 function formatPrice(value = 0) {
 const numeric = Number(value || 0);
 if (!Number.isFinite(numeric) || numeric <= 0) return '-';
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
 if (!priceSeries || !(price > 0)) return;
 priceSeries.createPriceLine({
 price,
 color,
 lineWidth: Math.max(1, Math.min(4, Number(line.thickness || 1))),
 lineStyle: globalThis.LightweightCharts.LineStyle?.Dashed ?? 2,
 axisLabelVisible: true,
 title: String(line.label || '').slice(0, 28),
 });
 }

 function keyZoneColor(zone = {}, alpha = 0.9) {
 const role = String(zone.colorRole || '').trim().toLowerCase();
 if (role === 'resistance-major') return `rgba(255, 71, 87, ${alpha})`;
 if (role === 'resistance-minor') return `rgba(255, 156, 51, ${alpha})`;
 if (role === 'support-deep') return `rgba(255, 216, 78, ${alpha})`;
 if (role === 'support-near') return `rgba(0, 195, 255, ${alpha})`;
 const tf = String(zone.tf || '').trim().toUpperCase();
 const isDaily = tf === '1D' || tf === '1D,15M' || tf === 'COMBINED';
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
 if (String(zone.displayStrengthAs || '').trim().toLowerCase() === 'percent') {
 const strengthPct = Number(zone.strengthPct || 0);
 return strengthPct > 0 ? `${Math.round(strengthPct)}%` : '';
 }
 const touches = Math.max(0, Math.round(Number(zone.touches || 0)));
 if (touches > 0) return String(touches);
 const strengthPct = Number(zone.strengthPct || 0);
 return strengthPct > 0 ? `${Math.round(strengthPct)}%` : '';
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
 const height = Math.max(6, Math.min(16, rawHeight));
 const top = Math.max(0, Math.min(shell.clientHeight - height, centerY - (height / 2)));
 const className = keyZoneClass(zone);
 const badgeTop = centerY - top;
 const anchorPoints = [
 ...(Array.isArray(zone.sourcePivots) ? zone.sourcePivots.map(pivot => pivot.ts || pivot.time) : []),
 ...(Array.isArray(zone.reactionMarkers) ? zone.reactionMarkers.map(marker => marker.time || marker.ts) : []),
 ];
 const anchorXs = anchorPoints
 .map(time => chart.timeScale().timeToCoordinate(toTime(time)))
 .filter(Number.isFinite);
 const rawAnchorX = anchorXs.length ? Math.max(0, Math.min(...anchorXs) - 8) : Math.max(0, shell.clientWidth * 0.42);
 const rightPad = 4;
 const anchorX = Math.max(0, Math.min(rawAnchorX, Math.max(0, shell.clientWidth - 150)));
 const width = Math.max(120, shell.clientWidth - anchorX - rightPad);
 return { zone, price, top, height, centerY, badgeTop, className, anchorX, width };
 })
 .filter(Boolean);
 const badgeMinGap = 28;
 zoneViews.sort((a, b) => (a.top + a.badgeTop) - (b.top + b.badgeTop));
 let previousAbsBadgeTop = Number.NEGATIVE_INFINITY;
 zoneViews.forEach(view => {
 const absoluteTop = view.top + view.badgeTop;
 const adjustedAbsTop = Math.max(absoluteTop, previousAbsBadgeTop + badgeMinGap);
 const maxAbsTop = Math.max(12, shell.clientHeight - 18);
 const finalAbsTop = Math.min(maxAbsTop, adjustedAbsTop);
 view.badgeTop = finalAbsTop - view.top;
 previousAbsBadgeTop = finalAbsTop;
 });
 const visibleZones = zoneViews.map(view => {
 const { zone, price, top, height, centerY, badgeTop, className, anchorX, width } = view;
 const pivots = (Array.isArray(zone.sourcePivots) ? zone.sourcePivots : []).slice(-18).map(pivot => {
 const x = chart.timeScale().timeToCoordinate(toTime(pivot.ts || pivot.time));
 const y = priceSeries.priceToCoordinate(Number(pivot.price || 0));
 if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
 return `<span class="ds-key-pivot-dot ${className}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"></span>`;
 }).join('');
 const reactions = (Array.isArray(zone.reactionMarkers) ? zone.reactionMarkers : []).slice(-8).map(marker => {
 const x = chart.timeScale().timeToCoordinate(toTime(marker.time || marker.ts));
 const y = priceSeries.priceToCoordinate(Number(marker.price || price || 0));
 if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
 const type = String(marker.type || 'touch').trim().toLowerCase();
 return `<span class="ds-key-reaction-marker ${className} ${escapeHtml(type)}" title="${escapeHtml(type)}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"></span>`;
 }).join('');
 const label = zone.kind === 'resistance' ? 'R' : 'S';
 const strength = formatStrength(zone);
 const glowClass = zone.showLevelGlow === false ? '' : ' is-glow';
 const lineHeight = Math.max(1, Math.min(8, Math.round(Number(zone.thickness || 3) || 3)));
 const farClass = zone.isFar === true ? ' is-far' : '';
 const stateClass = zone.state ? ` state-${escapeHtml(zone.state)}` : '';
 const detail = zone.detailLabel || `${zone.tf || 'TF'} ${label} ${formatPrice(price)}`;
 const farBadgeClass = zone.isFar === true ? ' is-muted' : '';
 return `<div class="ds-key-zone-band ${className}${glowClass}${farClass}${stateClass}" title="${escapeHtml(detail)}" style="left:${anchorX.toFixed(1)}px;right:auto;width:${width.toFixed(1)}px;top:${top.toFixed(1)}px;height:${height.toFixed(1)}px">
 <span class="ds-key-zone-center" style="top:${Math.max(0, Math.min(100, ((centerY - top) / Math.max(1, height)) * 100)).toFixed(2)}%;height:${lineHeight}px"></span>
 <span class="ds-key-zone-badge${farBadgeClass}" title="${escapeHtml(detail)}" style="top:${badgeTop.toFixed(1)}px">
 <strong>${label}</strong><em>${strength}</em><small>${formatPrice(price)}</small>
 <span class="ds-key-zone-tooltip">${escapeHtml(detail)}</span>
 </span>
 </div>${pivots}${reactions}`;
 });
 layer.innerHTML = visibleZones.join('');
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
 const ok = setVisibleLogicalRange(chart, { from: range.from - step, to: range.to - step });
 instance.renderKeyLevels?.();
 return ok;
 }
 if (command === 'right' || command === 'scroll-right') {
 const step = Math.max(4, Math.round(width * 0.22));
 const ok = setVisibleLogicalRange(chart, { from: range.from + step, to: range.to + step });
 instance.renderKeyLevels?.();
 return ok;
 }
 }
 try {
 if (command === 'left' || command === 'scroll-left') timeScale.scrollToPosition((timeScale.scrollPosition?.() || 0) + 12, false);
 else if (command === 'right' || command === 'scroll-right') timeScale.scrollToPosition((timeScale.scrollPosition?.() || 0) - 12, false);
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
 replayMode: payload.state?.replayMode || null,
 });
 const old = instances.get(container);
 if (old?.signature === signature && old?.chart) return;
 if (old?.resizeObserver) old.resizeObserver.disconnect();
 if (old?.chart) old.chart.remove();
 container.innerHTML = '';

 const chart = globalThis.LightweightCharts.createChart(container, createBaseOptions(container));
 const indicatorApi = globalThis.FWDTradeDeskIndicators;
 const candles = indicatorApi?.normalizeCandles(payload.dataset?.candles || []) || [];
 const visibleTimes = new Set((payload.model?.candles || []).map(candle => toTime(candle.time)).filter(Boolean));
 const visibleCandles = candles
 .map(candle => ({
 time: toTime(candle.time),
 open: candle.open,
 high: candle.high,
 low: candle.low,
 close: candle.close,
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
 const indicators = payload.indicators || (needsIndicatorData(active) ? indicatorApi?.calculate(candles, payload.dataset?.studies || {}, { only: requestedIndicatorKeys(active), obvSmaLength: Number(state.indicators?.obvSmaLength || 100) || 100 }) : {}) || {};
 const readout = state.showReadout === true
 ? createReadout(container, candles, indicators)
 : { update() {} };
 const chartType = normalizeChartType(state.chartType);
 const indicatorLabelOptions = state.showIndicatorLegend !== false && normalizeIndicatorStyle(state.indicatorStyle) === 'tradingview'
 ? { showTitle: true, lastValueVisible: true }
 : { showTitle: false, lastValueVisible: false };
 const priceFormat = { type: 'price', precision: 6, minMove: 0.000001 };
 const priceSeries = chartType === 'bars'
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
 priceSeries.setData(visibleCandles);

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
 if (active.ema9) addLine(chart, 'EMA 9', lineData(candles, indicators.ema9, visibleTimes, { positiveOnly: true }), COLORS.ema9, 0, { ...indicatorLabelOptions, lineWidth: 2 });
 if (active.ema30) addLine(chart, 'EMA 30', lineData(candles, indicators.ema30, visibleTimes, { positiveOnly: true }), COLORS.ema30, 0, { ...indicatorLabelOptions, lineWidth: 3 });
 if (active.ema100) addLine(chart, 'EMA 100', lineData(candles, indicators.ema100, visibleTimes, { positiveOnly: true }), COLORS.ema100, 0, { ...indicatorLabelOptions, lineWidth: 4 });
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
 const allMarkers = [...replayMarkers, ...intelligenceMarkers];
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

 chart.timeScale().fitContent();
 const renderKeyLevels = () => renderKeyLevelLayer(container, chart, priceSeries, payload.model?.keyZones || []);
 renderKeyLevels();
 if (typeof requestAnimationFrame === 'function') requestAnimationFrame(renderKeyLevels);
 let resizeFrame = 0;
 const resizeObserver = new ResizeObserver(() => {
 if (resizeFrame) cancelAnimationFrame(resizeFrame);
 resizeFrame = requestAnimationFrame(() => {
 resizeFrame = 0;
 chart.applyOptions({
 width: Math.max(320, container.clientWidth || 720),
 height: Math.max(420, container.clientHeight || 460),
 });
 renderKeyLevels();
 });
 });
 resizeObserver.observe(container);
 chart.timeScale().subscribeVisibleLogicalRangeChange?.(renderKeyLevels);
 instances.set(container, { chart, priceSeries, resizeObserver, signature, renderKeyLevels, resizeFrame, visibleCandles, model: payload.model || null });
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
