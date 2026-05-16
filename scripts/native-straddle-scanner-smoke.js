'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scanner = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/13-native-straddle-scanner.js'), 'utf8');
const optionsBackground = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/07-options.js'), 'utf8');
const optionsShared = fs.readFileSync(path.join(root, 'src/renderer/scripts/shared/options.js'), 'utf8');
const lab = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/09-strategy-lab.js'), 'utf8');
const scannerUi = fs.readFileSync(path.join(root, 'src/renderer/scripts/popup/02-scanner-analytics.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'src/renderer/desktop-background.html'), 'utf8');
const lazyLoader = fs.readFileSync(path.join(root, 'src/renderer/scripts/background/00-lazy-modules.js'), 'utf8');

const checks = [
{
  name: 'background lazy-loads native scanner',
  pass: background.includes('scripts/background/00-lazy-modules.js') && lazyLoader.includes('scripts/background/13-native-straddle-scanner.js') && lazyLoader.includes("'native-straddle:startScan'"),
},
 {
  name: 'native scan action is handled',
  pass: scanner.includes("msg?.action === 'native-straddle:startScan'")
  && scanner.includes('runNativeStraddleScan'),
 },
 {
  name: 'native scan stores strategy results',
  pass: scanner.includes("'strategyResults.native_straddle'")
  && scanner.includes("'strategyStatus.native_straddle'"),
 },
 {
 name: 'native scan creates trader actions',
 pass: scanner.includes('Buy Vol Watch')
 && scanner.includes('Sell Premium')
 && scanner.includes("label: 'No Trade'"),
 },
 {
  name: 'native scan blocks sell premium with MV premium and market gates',
  pass: scanner.includes('fetchNativePremiumRead')
  && scanner.includes('premiumNotExpanding')
  && scanner.includes('marketCalmForSell'),
 },
 {
  name: 'native scan rejects expired MV expiries',
  pass: scanner.includes('isNativeExpiryTradable')
  && scanner.includes('chainHasTradableContracts')
  && scanner.includes('minExpiryFreshMinutes')
  && scanner.includes('expiryModes'),
 },
 {
  name: 'native chain selects active daily weekly monthly expiries',
  pass: optionsBackground.includes('v17IsNativeExpiryTradable')
  && optionsBackground.includes('v17NativeExpiryBucket')
  && optionsBackground.includes('No active ${underlying} native straddle expiry')
  && optionsBackground.includes('expiryBuckets'),
 },
 {
 name: 'native market context uses BTC ETH chart reading',
 pass: optionsBackground.includes('v17BuildUnderlyingChartRead')
  && optionsBackground.includes("fetchCandles(symbol, '15m'")
  && optionsBackground.includes("fetchCandles(symbol, '1d'")
  && optionsShared.includes('chartRead')
  && optionsShared.includes('atrPct15m')
 && optionsShared.includes('breakoutRisk'),
 },
 {
  name: 'native market context requires calm regime for sell premium',
  pass: optionsShared.includes('calmForSell')
  && optionsShared.includes('hardExpansion')
  && optionsShared.includes("recommendedSide = calmForSell"),
 },
 {
  name: 'strategy lab watches native results',
  pass: lab.includes("'strategyResults.native_straddle'")
  && lab.includes("'strategyStatus.native_straddle'")
  && lab.includes('Native Straddle Scanner'),
 },
 {
  name: 'main scanner has native rail',
  pass: scannerUi.includes('renderNativeStraddleScannerRail')
  && scannerUi.includes("action: 'native-straddle:startScan'"),
 },
];

const failed = checks.filter(check => !check.pass);
checks.forEach(check => console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`));
if (failed.length) process.exitCode = 1;
