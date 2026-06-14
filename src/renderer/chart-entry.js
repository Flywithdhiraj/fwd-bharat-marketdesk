'use strict';

const chartDocumentReady = document.readyState === 'loading'
 ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
 : Promise.resolve();

globalThis.FWDDetachedChartStartup = chartDocumentReady
 .then(() => globalThis.FWDChartAuthReady)
 .then(() => globalThis.ensureChartWorkspaceLoaded())
 .then(() => {
  const initDetached = globalThis.FWDTradeDeskChartWorkspace?.initDetachedChartWorkspace;
  if (typeof initDetached !== 'function') throw new Error('Chart workspace API is unavailable.');
  return initDetached();
 });
