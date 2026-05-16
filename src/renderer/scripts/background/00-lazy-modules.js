(function initBackgroundLazyModules(global) {
 const MODULES = Object.freeze({
  wizard: Object.freeze({
   src: 'scripts/background/08-wizard-scanner.js',
   globalName: 'FWDTradeDeskWizardScanner',
   actions: Object.freeze(['wizard:startScan', 'wizard:getResults', 'wizard:clearResults']),
  }),
  stage: Object.freeze({
   src: 'scripts/background/09-stage-scanner.js',
   globalName: 'FWDTradeDeskStageScanner',
   actions: Object.freeze(['stage:startScan', 'stage:getResults', 'stage:clearResults']),
  }),
  radar: Object.freeze({
   src: 'scripts/background/10-radar-scanner.js',
   globalName: 'FWDTradeDeskRadarScanner',
   actions: Object.freeze(['radar:startScan', 'radar:getResults', 'radar:clearResults']),
  }),
  reversal: Object.freeze({
   src: 'scripts/background/11-reversal-scanner.js',
   globalName: 'FWDTradeDeskReversalScanner',
   actions: Object.freeze(['reversal:startScan', 'reversal:getResults', 'reversal:clearResults']),
  }),
  darvas: Object.freeze({
   src: 'scripts/background/12-darvas-scanner.js',
   globalName: 'FWDTradeDeskDarvasScanner',
   actions: Object.freeze(['darvas:startScan', 'darvas:getResults', 'darvas:clearResults']),
  }),
  pullback: Object.freeze({
   src: 'scripts/background/14-pullback-scanner.js',
   globalName: 'FWDTradeDeskPullbackScanner',
   actions: Object.freeze(['pullback:startScan', 'pullback:getResults', 'pullback:clearResults']),
  }),
  native_straddle: Object.freeze({
   src: 'scripts/background/13-native-straddle-scanner.js',
   globalName: 'FWDTradeDeskNativeStraddleScanner',
   actions: Object.freeze(['native-straddle:startScan', 'native-straddle:getResults', 'native-straddle:clearResults']),
  }),
 });

 const actionToModule = new Map();
 const loadPromises = new Map();

 Object.entries(MODULES).forEach(([id, module]) => {
  module.actions.forEach(action => actionToModule.set(action, id));
 });

 function isModuleReady(id) {
  const module = MODULES[id];
  return !!(module && global[module.globalName]);
 }

 function loadScriptOnce(src) {
  const safeSrc = String(src || '').trim();
  if (!safeSrc) return Promise.resolve();
  const existing = Array.from(document.scripts).find(script => script.getAttribute('src') === safeSrc);
  if (existing?.dataset.lazyModuleLoaded === 'true') return Promise.resolve();
  return new Promise((resolve, reject) => {
   let settled = false;
   const script = existing || document.createElement('script');
   const finish = () => {
    if (settled) return;
    settled = true;
    script.dataset.lazyModuleLoaded = 'true';
    resolve();
   };
   const fail = () => {
    if (settled) return;
    settled = true;
    reject(new Error(`Failed to load ${safeSrc}`));
   };
   script.addEventListener('load', finish, { once: true });
   script.addEventListener('error', fail, { once: true });
   if (!existing) {
    script.src = safeSrc;
    script.async = false;
    script.dataset.backgroundLazyModule = 'true';
    document.body.appendChild(script);
   }
   if (existing && (existing.readyState === 'complete' || existing.readyState === 'loaded')) queueMicrotask(finish);
   setTimeout(() => {
    if (settled) return;
    if (isModuleReady(Object.keys(MODULES).find(id => MODULES[id].src === safeSrc))) finish();
    else fail();
   }, 15000);
  });
 }

 function loadModule(id) {
  const module = MODULES[id];
  if (!module) return Promise.reject(new Error(`Unknown lazy module: ${id}`));
  if (isModuleReady(id)) return Promise.resolve({ ok: true, id, loaded: false });
  if (loadPromises.has(id)) return loadPromises.get(id);
  const promise = loadScriptOnce(module.src).then(() => {
   if (!isModuleReady(id)) throw new Error(`Lazy module did not initialize: ${id}`);
   return { ok: true, id, loaded: true };
  }).catch(error => {
   loadPromises.delete(id);
   throw error;
  });
  loadPromises.set(id, promise);
  return promise;
 }

 async function ensureStrategyLabScannersLoaded(options = {}) {
  const ids = ['wizard', 'stage', 'radar', 'reversal', 'darvas', 'pullback'];
  if (options.includeNative !== false) ids.push('native_straddle');
  const results = await Promise.all(ids.map(loadModule));
  return { ok: true, results };
 }

 function replayMessage(msg, sendResponse) {
  const replay = { ...(msg || {}), __fwdLazyReplay: true };
  chrome.runtime.sendMessage(replay, response => {
   if (chrome.runtime.lastError) {
    sendResponse({ ok: false, error: chrome.runtime.lastError.message || 'Lazy module replay failed' });
    return;
   }
   sendResponse(response);
  });
 }

 chrome.runtime?.onMessage?.addListener((msg, sender, sendResponse) => {
  if (msg?.__fwdLazyReplay) return false;
  const action = String(msg?.action || '').trim();
  const id = actionToModule.get(action);
  if (!id || isModuleReady(id)) return false;
  if (typeof isTrustedRuntimeSender === 'function' && !isTrustedRuntimeSender(sender)) {
   sendResponse({ ok: false, error: 'Unauthorized sender' });
   return false;
  }
  loadModule(id)
  .then(() => replayMessage(msg, sendResponse))
  .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
 });

 global.FWDTradeDeskBackgroundLazyModules = Object.freeze({
  MODULES,
  loadModule,
  ensureStrategyLabScannersLoaded,
  isModuleReady,
 });
})(globalThis);
