const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const html = read('src/renderer/index.html');
const popup = read('src/renderer/popup.js');
const core = read('src/renderer/scripts/popup/00-core.js');
const commodity = read('src/renderer/scripts/popup/11-commodities.js');
const css = read('src/renderer/styles/15-commodities.css');
const styles = read('src/renderer/styles.css');
const service = read('src/main/dhan-data-service.js');

assert(html.includes('data-tab="commodities"') && html.includes('id="pane-commodities"'));
assert(popup.includes("commodities: 'scripts/popup/11-commodities.js'"));
assert(popup.includes("safeTab === 'commodities'") && popup.includes('ensureCommoditiesLoaded'));
assert(core.includes("'commodities'") && core.includes('globalThis.renderCommodities?.(preloaded)'));
assert(styles.includes("styles/15-commodities.css"));
assert(commodity.includes("marketData('commodity_snapshot'") && commodity.includes("marketData('live_feed_subscribe'"));
assert(commodity.includes("marketData('commodity_margin_preview'") && commodity.includes('Estimate Margin'));
assert(commodity.includes('Save Paper Plan') && commodity.includes('Open Broker Terminal'));
assert(commodity.includes('fwdCommodityPlans.v1') && commodity.includes('writePlans'));
assert(commodity.includes('Calendar spread view compares two MCX futures expiries.'));
assert(commodity.includes("marketData('commodity_spread_history'") && commodity.includes('Spread P&amp;L Chart'));
assert(commodity.includes('GOLD / GOLDM matched') && commodity.includes('1 GOLD lot versus 10 GOLDM lots'));
assert(commodity.includes('Close / roll before') && commodity.includes('A narrower calendar spread may profit'));
assert(commodity.includes("marketData('commodity_analysis'") && commodity.includes('Commodity Lab'));
assert(commodity.includes('Trend 1D') && commodity.includes('Trade 15m'));
assert(commodity.includes('openSignalInChartWorkspace') && commodity.includes("timeframe === '15m' ? '15m' : '1d'"));
assert(!commodity.includes('physical commodity cash-and-carry profit'));
assert(css.includes('.commodity-watch') && css.includes('.commodity-detail') && css.includes('.commodity-table'));
assert(css.includes('.commodity-planner') && css.includes('.commodity-margin-result') && css.includes('.commodity-saved'));
assert(css.includes('.commodity-spread-research') && css.includes('.commodity-spread-svg') && css.includes('.commodity-spread-stats'));
assert(css.includes('.commodity-view-toggle') && css.includes('.commodity-lab-layout') && css.includes('.commodity-lab-detail'));
assert(service.includes('buildCommodityFuturePairs') && service.includes("action === 'commodity_snapshot'"));
assert(service.includes("action === 'commodity_margin_preview'") && service.includes("'/margincalculator'"));
assert(service.includes("action === 'commodity_spread_history'") && service.includes('buildCommoditySpreadHistory'));
assert(service.includes('MCX_PRICE_MULTIPLIERS') && service.includes('expiryCode = Math.max'));
assert(service.includes("action === 'commodity_analysis'") && service.includes("continuousMode: 'front_month_expiry_code_0'"));
assert(service.includes('COMMODITY_ANALYSIS_CACHE_TTL_MS'));
assert(service.includes('timingSymbols') && commodity.includes("limit: 6, dailyDays: 1095, intradayDays: 90"));
assert(commodity.includes("safeTimeframe === '1d' ? 1095 : 8640"));
assert(service.includes("'/margincalculator/multi'") && service.includes('scripList: legs.map') && service.includes('includeOrder: true'));
assert(service.includes("exchangeSegment !== 'MCX_COMM'") && service.includes("instrument !== 'FUTCOM'"));
assert(service.includes('Calendar spread observation compares near and next MCX futures.'));

console.log('Commodities Phase 3 smoke checks passed.');
