const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
};

const runtime = read('src/renderer/scripts/background/04-runtime.js');
const v16 = read('src/renderer/scripts/background/05-v16-capabilities.js');
const settings = read('src/renderer/scripts/popup/05-settings-webhooks-helpers.js');
const templates = read('src/renderer/scripts/popup/06-pane-templates.js');
const risk = read('src/renderer/scripts/popup/04-research-risk.js');
const core = read('src/renderer/scripts/popup/00-core.js');
const shell = read('src/renderer/scripts/popup/01-shell.js');
const html = read('src/renderer/index.html');
const scan = read('src/renderer/scripts/background/02-scan.js');
const infra = read('src/renderer/scripts/background/00-infra.js');
const mainDhan = read('src/main/dhan-data-service.js');

assert(v16.includes('DHAN_MANUAL_ONLY_ORDER_DISABLED'), 'Manual-only order disabled constant is missing.');
assert(v16.includes('v16AssertDhanManualOnlySafeRequest(method, path)'), 'Signed fetch must guard mutating order requests before API/native-host calls.');
assert(v16.includes("autoTrade: false") && v16.includes("status: 'manual_only'"), 'Auto-trade engine must force manual-only state before processing scan results.');
assert(v16.includes('throw new Error(DHAN_MANUAL_ONLY_ORDER_DISABLED);') && v16.includes('async function runV16PlaceTradeOrder'), 'Order placement helper must be hard-blocked.');
assert(!v16.includes('API_INDIA') && !v16.includes('API_GLOBAL'), 'Undefined Delta API base constants must not remain in Dhan build.');
assert(!v16.includes('function dcaStartOfDayTs') && !v16.includes('DCA order placed') && !v16.includes('v16ProcessShadowTrades'), 'Legacy DCA/shadow automation implementation must be removed from the lightweight Dhan build.');
assert(!v16.includes('v16BuildAutoTradeSignalAuditEntries') && !v16.includes('Funding exit: closed') && !v16.includes('Target Auto-shift'), 'Legacy live auto-trade engine internals must be removed from the lightweight Dhan build.');
assert(v16.includes('async function runDcaBotMonitor()') && v16.includes('removed: true'), 'Removed automation should leave only compatibility stubs for stale messages/alarms.');

assert(runtime.includes("msg.action === 'toggleAutoTrade'") && runtime.includes('enabled: false') && runtime.includes('manualOnly: true'), 'Runtime auto-trade toggle must always return disabled/manual-only.');
assert(runtime.includes("msg.action === 'syncDcaBotAlarm'") && runtime.includes('Manual-only build disables scheduled order automation'), 'DCA alarm sync must force scheduled order automation off.');

assert(settings.includes('const finalAutoTradeState = false') && settings.includes('dcaBotSettings.enabled = false'), 'Settings save must persist manual-only automation state.');
assert(!settings.includes('AUTO TRADE will place REAL orders') && !settings.includes('DCA BOT will place REAL Delta futures orders'), 'Dhan settings must not present enable confirmations for disabled live-order features.');
assert(!templates.includes('sAutoTradeEnabled') && !templates.includes('sDcaBotEnabled') && !templates.includes('sOptionsAutoTradeEnabled') && !templates.includes('sStraddleEnabled'), 'Live-order automation settings controls must be removed from the Dhan UI.');
assert(!templates.includes('places real orders') && !templates.includes('Live Orders'), 'Live-order marketing/copy must be removed from settings templates.');

assert(risk.includes("autoTrade: false") && risk.includes('Manual trading only'), 'Header Manual Only control must not toggle automation on.');
assert(!html.includes('btnAutoTrade') && !html.includes('Dhan mode'), 'Unused Dhan Mode header control must stay removed.');
assert(!html.includes('btnAutoTradeReverse'), 'Reverse live-order control must be removed from the header.');
assert(!scan.includes('runAutoTradeEngine(enrichedResults)'), 'Scanner must not invoke the legacy auto-trade engine after scans.');
assert(shell.includes("selectScannerUniverse(universeButton.dataset.scanUniverse || 'fno_stocks', { runNow: false })"), 'Scanner universe cards must select only and wait for Scan Now.');
assert(shell.includes("selectScannerUniverse(event.target.value || 'fno_stocks', { runNow: false })"), 'Scanner universe dropdown must select only and wait for Scan Now.');
assert(core.includes('function playAlert') && core.includes('window.playAlert = playAlert'), 'Core must provide alert sound before scanner polling starts.');
assert(shell.includes('playAlert(d.strategy?.alertTone)'), 'Scanner sound alert must use the always-loaded core helper.');
assert(scan.includes('Scan complete') && scan.includes('skipped no-history'), 'Scan completion notification and no-history summary must be present.');
assert(infra.includes('requestUnits') && mainDhan.includes('apiCalls: responses.length') && mainDhan.includes('apiCalls: chunks.length'), 'Dhan API meter must count quote batches and candle chunks, not only bridge calls.');
assert(shell.includes('Data Ready') && shell.includes('Deep scan target') && shell.includes('Quote rows loaded') && shell.includes('Available symbols in selected universe'), 'API/scanner display must expose readiness and count semantics.');
assert(html.includes('scanned/requested'), 'Header label must explain scanner count semantics.');

if (process.exitCode) process.exit(process.exitCode);
console.log('Dhan manual/API/scanner safety smoke passed.');
