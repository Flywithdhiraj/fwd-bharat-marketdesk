'use strict';

(function initFwdTradeDeskUiEvents(global) {
 const registry = new WeakMap();

 function bindOnce(target, type, key, handler, options) {
  if (!target || !type || !key || typeof handler !== 'function') return false;
  let targetRegistry = registry.get(target);
  if (!targetRegistry) {
   targetRegistry = new Set();
   registry.set(target, targetRegistry);
  }
  const eventKey = `${type}:${key}`;
  if (targetRegistry.has(eventKey)) return false;
  target.addEventListener(type, handler, options);
  targetRegistry.add(eventKey);
  return true;
 }

 function bindDelegated(root, type, selector, key, handler, options) {
  return bindOnce(root, type, key, event => {
   const source = event.target?.closest?.(selector);
   if (!source || !root.contains(source)) return;
   handler(event, source);
  }, options);
 }

 global.FWDTradeDeskUiEvents = Object.freeze({
  bindOnce,
  bindDelegated,
 });
})(globalThis);
