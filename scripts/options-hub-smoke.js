const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const index = read('src/renderer/index.html');
const popup = read('src/renderer/popup.js');
const core = read('src/renderer/scripts/popup/00-core.js');
const hub = read('src/renderer/scripts/popup/08-options-hub.js');
const css = read('src/renderer/styles/06-options-workspace.css');
const service = read('src/main/dhan-data-service.js');

assert(index.includes('data-tab="options"') && index.includes('id="pane-options"'));
assert(popup.includes("optionsHub: 'scripts/popup/08-options-hub.js'"));
assert(popup.includes("safeTab === 'options'") && popup.includes('ensureOptionsHubLoaded'));
assert(core.includes("tabs: ['scanner', 'options', 'carry', 'commodities', 'strategies', 'chart']"));
assert(core.includes("if (tab === 'options') globalThis.renderOptionsHub?.(preloaded);"));
assert(hub.includes("dhan('option_chain'") && hub.includes("dhan('option_expiries'"));
assert(hub.includes('PCR OI') && hub.includes('Max Pain') && hub.includes('IV Skew') && hub.includes('Delta'));
assert(hub.includes("dhan('live_feed_subscribe'") && hub.includes("dhan('live_feed_status'"));
assert(hub.includes('autoLoaded') && hub.includes('cooldownUntil'), 'Options Hub should avoid automatic retry loops after Dhan throttling');
assert(css.includes('.options-chain-table') && css.includes('.options-metric'));
assert(service.includes('wss://api-feed.dhan.co') && service.includes('parseDhanFeedPacket') && service.includes('RequestCode'));
assert(service.includes('DHAN_OPTION_CHAIN_CACHE_TTL_MS') && service.includes('optionChainBlockedUntil'), 'Dhan option chain should be cached and cooled down after rate-limit warnings');

console.log('Options Hub smoke checks passed.');
