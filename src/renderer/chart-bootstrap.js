'use strict';

globalThis.FWDChartAuthReady = (async () => {
 const native = globalThis.fwdDesktopNative;
 if (!native?.sendNativeMessage) {
  globalThis.FWDDesktopRuntime?.start?.();
  return { ok: true, unlocked: true };
 }
 const status = await native.sendNativeMessage({ type: 'auth_status' });
 if (!status?.unlocked) {
  throw new Error('Open the main Bharat MarketDesk window and unlock it before detaching a chart.');
 }
 globalThis.FWDDesktopRuntime?.start?.();
 return status;
})();
