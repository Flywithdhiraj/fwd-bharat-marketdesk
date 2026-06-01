const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const index = read('src/renderer/index.html');
const popup = read('src/renderer/popup.js');
const core = read('src/renderer/scripts/popup/00-core.js');
const carry = read('src/renderer/scripts/popup/10-fno-carry.js');
const css = read('src/renderer/styles/14-fno-carry.css');
const styles = read('src/renderer/styles.css');
const service = read('src/main/dhan-data-service.js');

assert(index.includes('data-tab="carry"') && index.includes('id="pane-carry"'));
assert(popup.includes("fnoCarry: 'scripts/popup/10-fno-carry.js'"));
assert(popup.includes("safeTab === 'carry'") && popup.includes('ensureFnoCarryLoaded'));
assert(core.includes("tabs: ['scanner', 'options', 'carry', 'commodities', 'strategies', 'chart']"));
assert(core.includes("if (tab === 'carry') globalThis.renderFnoCarry?.(preloaded);"));
assert(carry.includes("marketData('fno_carry'"));
assert(carry.includes('Cash and futures execution edge') && carry.includes('Execution Table') && carry.includes('one complete lot'));
assert(carry.includes('Cost qualified') && carry.includes('No depth') && carry.includes('Contract cost estimate'));
assert(carry.includes("filter: 'candidates'") && carry.includes('Buy carry') && carry.includes('Reverse watch'));
assert(carry.includes('No buy-carry candidate clears your cost model.') && carry.includes('netEdgePerLot = depthConfirmed'));
assert(carry.includes("capitalMode: 'ownCash'") && carry.includes('opportunityAnnualPct: 7') && carry.includes('Opportunity Cost'));
assert(carry.includes('costBreakdown') && carry.includes('physicalDeliveryBrokerage') && carry.includes('sttSellPct: 0.05'));
assert(carry.includes('Executable basis history - local snapshots') && carry.includes('Individual stock futures held to expiry require physical settlement.'));
assert(!carry.includes('/8h') && !carry.includes('Longs Paying') && !carry.includes('Shorts Paying'));
assert(styles.includes("styles/14-fno-carry.css"));
assert(css.includes('.carry-heatmap') && css.includes('.carry-table') && css.includes('.carry-detail') && css.includes('.carry-model') && css.includes('.carry-filters') && css.includes('.carry-answer') && css.includes('.carry-cost-breakdown'));
assert(service.includes("action === 'fno_carry'"));
assert(service.includes('buildFnoCarryContracts') && service.includes('annualizedCarryPct'));
assert(service.includes('carryComparable = daysToExpiry >= 1'));
assert(service.includes("depthFillForQuantity(spotQuote, 'sell', lotSize)") && service.includes("depthFillForQuantity(futureQuote, 'buy', lotSize)"));
assert(service.includes('spotAskAvailableQuantity') && service.includes('futureBidAvailableQuantity'));
assert(service.includes('executableAnnualCarryPct') && service.includes('depthConfirmedRows'));

console.log('F&O Carry smoke checks passed.');
