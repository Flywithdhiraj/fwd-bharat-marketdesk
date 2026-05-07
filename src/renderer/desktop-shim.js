(() => {
 if (globalThis.chrome?.runtime && globalThis.chrome?.storage) return;

 const EXTENSION_ID = 'fwd-tradedesk-pro-windows';
 const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;
 const contextId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
 const isBackgroundContext = /desktop-background\.html(?:$|[?#])/i.test(location.href);
 const messageListeners = new Set();
 const storageListeners = new Set();
 const alarmListeners = new Set();
 const alarmTimers = new Map();
 const pendingRuntimeMessages = new Map();
 const DESKTOP_RUNTIME_STANDARD_TIMEOUT_MS = 30000;
 const DESKTOP_RUNTIME_LONG_TIMEOUT_MS = 120000;
 const sessionStorageArea = new Map();
 let backgroundRuntimeAllowed = isBackgroundContext;
 const runtimeChannelNonce = isBackgroundContext
 ? String(new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get('runtimeNonce') || '')
 : createRuntimeNonce();
 const channel = typeof BroadcastChannel === 'function'
 ? new BroadcastChannel('fwd-tradedesk-pro-runtime')
 : null;

 function createRuntimeNonce() {
 try {
 const bytes = new Uint8Array(24);
 globalThis.crypto?.getRandomValues?.(bytes);
 return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
 } catch (_) {
 return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
 }
 }

 function runtimeTimeoutForMessage(message = {}) {
 const action = String(message?.action || message?.type || '').trim();
 return new Set([
 'startScan',
 'wizard:startScan',
 'stage:startScan',
 'runBacktest',
 'buildCorrelationMatrix',
 'exportCSV',
 'v16:getPrivateAccountSnapshot',
 'v16:placeTradeOrder',
 'v16:placePositionAction',
 'v16:placeProtectionOrder',
 'v16:updateOrder',
 'v16:cancelAllOrdersForSymbol',
 ]).has(action) ? DESKTOP_RUNTIME_LONG_TIMEOUT_MS : DESKTOP_RUNTIME_STANDARD_TIMEOUT_MS;
 }

 function ensureBackgroundFrame() {
 if (isBackgroundContext || typeof document === 'undefined') return null;
 if (!backgroundRuntimeAllowed) return null;
 let frame = document.getElementById('desktopBackgroundFrame');
 if (frame?.contentWindow) return frame;
 frame = document.createElement('iframe');
 frame.id = 'desktopBackgroundFrame';
 frame.title = 'Desktop runtime';
 frame.hidden = true;
 frame.src = `desktop-background.html#runtimeNonce=${encodeURIComponent(runtimeChannelNonce)}`;
 const mount = () => {
 if (!document.getElementById('desktopBackgroundFrame')) {
 (document.body || document.documentElement).appendChild(frame);
 }
 };
 if (document.body) mount();
 else document.addEventListener('DOMContentLoaded', mount, { once: true });
 return frame;
 }

 function startBackgroundRuntime() {
 if (isBackgroundContext) return true;
 backgroundRuntimeAllowed = true;
 return !!ensureBackgroundFrame();
 }

 function stopBackgroundRuntime() {
 if (isBackgroundContext) return;
 backgroundRuntimeAllowed = false;
 const frame = document.getElementById('desktopBackgroundFrame');
 if (frame) frame.remove();
 }

 function sendViaBackgroundFrame(message, timeoutMs = runtimeTimeoutForMessage(message)) {
 if (isBackgroundContext) return Promise.resolve(undefined);
 if (!backgroundRuntimeAllowed) return Promise.resolve(undefined);
 const frame = ensureBackgroundFrame();
 const frameWindow = frame?.contentWindow;
 if (!frameWindow?.chrome?.runtime?.sendMessage) return Promise.resolve(undefined);
 return new Promise(resolve => {
 let done = false;
 const finish = response => {
 if (done) return;
 done = true;
 resolve(response);
 };
 try {
 frameWindow.chrome.runtime.sendMessage(message, response => finish(response));
 } catch {
 finish(undefined);
 }
 setTimeout(() => finish(undefined), timeoutMs);
 });
 }

 function nativeBridge() {
 if (globalThis.fwdDesktopNative?.sendNativeMessage) return globalThis.fwdDesktopNative;
 try {
 if (globalThis.parent && globalThis.parent !== globalThis && globalThis.parent.fwdDesktopNative?.sendNativeMessage) {
 return globalThis.parent.fwdDesktopNative;
 }
 } catch (_) {}
 try {
 if (globalThis.top && globalThis.top !== globalThis && globalThis.top.fwdDesktopNative?.sendNativeMessage) {
 return globalThis.top.fwdDesktopNative;
 }
 } catch (_) {}
 return null;
 }

 function setLastError(message = '') {
 globalThis.chrome.runtime.lastError = message ? { message } : null;
 }

 function asChromeAsync(fn, callback) {
 const promise = Promise.resolve().then(fn);
 if (typeof callback === 'function') {
 promise.then(result => {
 setLastError('');
 callback(result);
 }).catch(error => {
 setLastError(error?.message || String(error || 'Chrome API shim error'));
 callback(undefined);
 queueMicrotask(() => setLastError(''));
 });
 }
 return promise;
 }

 function normalizeKeys(keys) {
 if (keys == null) return null;
 if (Array.isArray(keys)) return keys;
 if (typeof keys === 'string') return [keys];
 if (typeof keys === 'object') return Object.keys(keys);
 return [];
 }

 function storagePrefix(areaName) {
 return `fwd:${areaName}:`;
 }

 function readArea(areaName) {
 if (areaName === 'session') {
 return Object.fromEntries(sessionStorageArea.entries());
 }
 const prefix = storagePrefix(areaName);
 const out = {};
 for (let i = 0; i < localStorage.length; i += 1) {
 const rawKey = localStorage.key(i);
 if (!rawKey || !rawKey.startsWith(prefix)) continue;
 const key = rawKey.slice(prefix.length);
 try {
 out[key] = JSON.parse(localStorage.getItem(rawKey));
 } catch {
 out[key] = localStorage.getItem(rawKey);
 }
 }
 return out;
 }

 function readStorage(areaName, keys) {
 const all = readArea(areaName);
 if (keys == null) return all;
 if (typeof keys === 'object' && !Array.isArray(keys) && typeof keys !== 'string') {
 return Object.fromEntries(Object.keys(keys).map(key => [key, all[key] ?? keys[key]]));
 }
 return Object.fromEntries(normalizeKeys(keys).map(key => [key, all[key]]));
 }

 function notifyStorageChanges(changes, areaName = 'local', remote = false) {
 storageListeners.forEach(listener => {
 try {
 listener(changes, areaName);
 } catch (error) {
 console.warn('[FWD desktop shim] storage listener failed', error);
 }
 });
 if (!remote) {
 channel?.postMessage({ kind: 'storage-change', source: contextId, nonce: runtimeChannelNonce, areaName, changes });
 }
 }

 function createStorageArea(areaName) {
 return {
 get(keys, callback) {
 return asChromeAsync(() => readStorage(areaName, keys), callback);
 },
 set(items, callback) {
 return asChromeAsync(() => {
 const changes = {};
 Object.entries(items || {}).forEach(([key, newValue]) => {
 const oldValue = readStorage(areaName, key)[key];
 if (areaName === 'session') {
 sessionStorageArea.set(key, newValue);
 } else {
 localStorage.setItem(`${storagePrefix(areaName)}${key}`, JSON.stringify(newValue));
 }
 changes[key] = { oldValue, newValue };
 });
 notifyStorageChanges(changes, areaName);
 }, callback);
 },
 remove(keys, callback) {
 return asChromeAsync(() => {
 const changes = {};
 normalizeKeys(keys).forEach(key => {
 const oldValue = readStorage(areaName, key)[key];
 if (areaName === 'session') sessionStorageArea.delete(key);
 else localStorage.removeItem(`${storagePrefix(areaName)}${key}`);
 changes[key] = { oldValue, newValue: undefined };
 });
 notifyStorageChanges(changes, areaName);
 }, callback);
 },
 clear(callback) {
 return asChromeAsync(() => {
 const changes = {};
 Object.keys(readArea(areaName)).forEach(key => {
 const oldValue = readStorage(areaName, key)[key];
 if (areaName === 'session') sessionStorageArea.delete(key);
 else localStorage.removeItem(`${storagePrefix(areaName)}${key}`);
 changes[key] = { oldValue, newValue: undefined };
 });
 notifyStorageChanges(changes, areaName);
 }, callback);
 }
 };
 }

 function buildSender() {
 return {
 id: EXTENSION_ID,
 origin: EXTENSION_ORIGIN,
 url: `${EXTENSION_ORIGIN}/index.html`,
 desktopTrusted: true,
 };
 }

 function dispatchLocalRuntimeMessage(message, sender = buildSender(), requestId = '') {
 let handled = false;
 const waits = [];

 messageListeners.forEach(listener => {
 let responded = false;
 const wait = new Promise(resolve => {
 const sendResponse = response => {
 if (responded) return;
 responded = true;
 handled = true;
 resolve(response);
 };
 try {
 const keepAlive = listener(message, sender, sendResponse);
 if (keepAlive !== true && !responded) resolve(undefined);
 } catch (error) {
 if (!responded) {
 responded = true;
 handled = true;
 resolve({ ok: false, error: error?.message || String(error) });
 }
 }
 });
 waits.push(wait.then(response => ({ responded: response !== undefined, response })));
 });

 if (!waits.length) return Promise.resolve({ handled: false, response: undefined });

 return new Promise(resolve => {
 let pending = waits.length;
 waits.forEach(wait => {
 wait.then(result => {
 if (result.responded) {
 resolve({ handled: true, response: result.response });
 pending = -1;
 return;
 }
 pending -= 1;
 if (pending === 0) resolve({ handled, response: undefined });
 });
 });

 setTimeout(() => {
 if (pending > 0) resolve({ handled, response: undefined });
 }, requestId ? runtimeTimeoutForMessage(message) : 500);
 });
 }

 function sendRuntimeMessage(message, callback) {
 const requestId = `${contextId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
 const timeoutMs = runtimeTimeoutForMessage(message);
 if (backgroundRuntimeAllowed) ensureBackgroundFrame();

 const promise = new Promise(resolve => {
 let settled = false;
 const finish = (response, error = '') => {
 if (settled) return;
 settled = true;
 pendingRuntimeMessages.delete(requestId);
 setLastError(error);
 if (typeof callback === 'function') callback(response);
 queueMicrotask(() => setLastError(''));
 resolve(response);
 };

 pendingRuntimeMessages.set(requestId, finish);

 dispatchLocalRuntimeMessage(message, buildSender(), requestId).then(result => {
 if (result.handled && result.response !== undefined) finish(result.response);
 });

 if (backgroundRuntimeAllowed || isBackgroundContext) {
 channel?.postMessage({
 kind: 'runtime-request',
 source: contextId,
 nonce: runtimeChannelNonce,
 requestId,
 message,
 sender: buildSender()
 });
 }

 setTimeout(() => {
 if (settled) return;
 if (!backgroundRuntimeAllowed) {
 finish({ ok: false, error: 'Desktop runtime is locked until app login.' }, 'Desktop runtime is locked until app login.');
 return;
 }
 sendViaBackgroundFrame(message, timeoutMs).then(response => {
 if (response !== undefined) finish(response);
 });
 }, 750);

 setTimeout(() => {
 finish(undefined, 'No desktop runtime response was returned.');
 }, timeoutMs);
 });

 return promise;
 }

 function scheduleAlarm(name, info = {}) {
 const delayMs = Math.max(0, Number(info.delayInMinutes || 0) * 60 * 1000);
 const periodMs = Number(info.periodInMinutes || 0) > 0
 ? Number(info.periodInMinutes) * 60 * 1000
 : 0;
 const whenMs = Number(info.when || 0) > Date.now()
 ? Number(info.when) - Date.now()
 : delayMs;
 const firstDelay = Math.max(100, whenMs || periodMs || 100);

 clearAlarm(name);
 const fire = () => {
 const alarm = { name, scheduledTime: Date.now() + (periodMs || 0), periodInMinutes: periodMs ? periodMs / 60000 : undefined };
 alarmListeners.forEach(listener => {
 try { listener(alarm); } catch (error) { console.warn('[FWD desktop shim] alarm listener failed', error); }
 });
 if (!periodMs) alarmTimers.delete(name);
 };
 const timer = periodMs
 ? setTimeout(() => {
 fire();
 const interval = setInterval(fire, periodMs);
 alarmTimers.set(name, { interval, info: { name, periodInMinutes: periodMs / 60000 } });
 }, firstDelay)
 : setTimeout(fire, firstDelay);
 alarmTimers.set(name, { timer, info: { name, periodInMinutes: periodMs ? periodMs / 60000 : undefined } });
 }

 function clearAlarm(name) {
 const record = alarmTimers.get(name);
 if (!record) return false;
 if (record.timer) clearTimeout(record.timer);
 if (record.interval) clearInterval(record.interval);
 alarmTimers.delete(name);
 return true;
 }

 const runtime = {
 id: EXTENSION_ID,
 lastError: null,
 getURL(path = '') {
 const clean = String(path || '').replace(/^\/+/, '');
 if (!clean || clean === 'popup.html') return 'index.html';
 return clean.replace(/^popup\.html/i, 'index.html');
 },
 getManifest() {
 return { manifest_version: 3, name: 'FWD TradeDesk Pro', version: '0.1.0' };
 },
 sendMessage(message, callback) {
 return sendRuntimeMessage(message, callback);
 },
 sendNativeMessage(_hostName, _payload, callback) {
 const request = { ...(_payload || {}) };
 const bridge = nativeBridge();
 const promise = bridge?.sendNativeMessage
 ? bridge.sendNativeMessage(request)
 : Promise.resolve({ ok: false, available: false, error: 'Desktop native bridge is not available.' });
 promise.then(response => {
 setLastError(response?.ok === false ? (response?.error || '') : '');
 if (typeof callback === 'function') callback(response);
 queueMicrotask(() => setLastError(''));
 }).catch(error => {
 setLastError(error?.message || 'Desktop native bridge failed.');
 if (typeof callback === 'function') callback({ ok: false, error: chrome.runtime.lastError?.message || 'Desktop native bridge failed.' });
 queueMicrotask(() => setLastError(''));
 });
 return promise;
 },
 onMessage: {
 addListener(listener) { messageListeners.add(listener); },
 removeListener(listener) { messageListeners.delete(listener); },
 hasListener(listener) { return messageListeners.has(listener); }
 },
 onSuspend: {
 addListener() {},
 removeListener() {}
 },
 onInstalled: {
 addListener() {},
 removeListener() {}
 },
 onStartup: {
 addListener() {},
 removeListener() {}
 }
 };

 globalThis.chrome = {
 runtime,
 storage: {
 local: createStorageArea('local'),
 session: createStorageArea('session'),
 onChanged: {
 addListener(listener) { storageListeners.add(listener); },
 removeListener(listener) { storageListeners.delete(listener); },
 hasListener(listener) { return storageListeners.has(listener); }
 }
 },
 alarms: {
 create(name, info = {}) {
 scheduleAlarm(name, info);
 },
 get(name, callback) {
 const alarm = alarmTimers.get(name)?.info;
 if (typeof callback === 'function') callback(alarm);
 return Promise.resolve(alarm);
 },
 getAll(callback) {
 const alarms = Array.from(alarmTimers.values()).map(record => record.info);
 if (typeof callback === 'function') callback(alarms);
 return Promise.resolve(alarms);
 },
 clear(name, callback) {
 const cleared = clearAlarm(name);
 if (typeof callback === 'function') callback(cleared);
 return Promise.resolve(cleared);
 },
 onAlarm: {
 addListener(listener) { alarmListeners.add(listener); },
 removeListener(listener) { alarmListeners.delete(listener); },
 hasListener(listener) { return alarmListeners.has(listener); }
 }
 },
 notifications: {
 create(id, options, callback) {
 const notificationId = id || String(Date.now());
 console.info('[FWD desktop notification]', options?.title || 'Notice', options?.message || '');
 const bridge = nativeBridge();
 if (bridge?.sendNativeMessage) {
 bridge.sendNativeMessage({
 type: 'desktop_notification',
 title: options?.title || 'FWD TradeDesk Pro',
 message: options?.message || '',
 priority: options?.priority || 0,
 urgency: Number(options?.priority || 0) >= 2 ? 'high' : 'normal',
 }).catch(error => console.warn('[FWD desktop shim] native notification failed', error?.message || error));
 }
 if (typeof Notification === 'function' && Notification.permission === 'granted') {
 try { new Notification(options?.title || 'FWD TradeDesk Pro', { body: options?.message || '' }); } catch (_) {}
 }
 if (typeof callback === 'function') callback(notificationId);
 return Promise.resolve(notificationId);
 }
 },
 windows: {
 create(options, callback) {
 const bridge = nativeBridge();
 const request = {
 type: 'open_desktop_window',
 url: String(options?.url || ''),
 state: options?.state || 'normal',
 };
 const promise = bridge?.sendNativeMessage
 ? bridge.sendNativeMessage(request).then(response => {
 if (response?.ok === false) throw new Error(response.error || 'Desktop window open failed');
 return { id: Number(response?.windowId || Date.now()), focused: true, state: options?.state || 'normal', reused: !!response?.reused };
 })
 : Promise.resolve({ id: Date.now(), focused: true, state: options?.state || 'normal' });
 promise.then(result => {
 setLastError('');
 if (typeof callback === 'function') callback(result);
 }).catch(error => {
 setLastError(error?.message || 'Desktop window open failed');
 if (typeof callback === 'function') callback(undefined);
 queueMicrotask(() => setLastError(''));
 });
 return promise;
 },
 get(id, _getInfo, callback) {
 const result = { id, focused: true, state: 'maximized' };
 if (typeof callback === 'function') callback(result);
 return Promise.resolve(result);
 },
 update(id, updateInfo, callback) {
 const result = { id, ...updateInfo };
 if (typeof callback === 'function') callback(result);
 return Promise.resolve(result);
 }
 }
 };

 if (channel) {
 channel.onmessage = event => {
 const payload = event.data || {};
 if (payload.source === contextId) return;
 if (payload.nonce !== runtimeChannelNonce) return;

 if (payload.kind === 'runtime-request') {
 dispatchLocalRuntimeMessage(payload.message, buildSender(), payload.requestId).then(result => {
 if (!result.handled || result.response === undefined) return;
 channel.postMessage({
 kind: 'runtime-response',
 source: contextId,
 nonce: runtimeChannelNonce,
 requestId: payload.requestId,
 response: result.response
 });
 });
 }

 if (payload.kind === 'runtime-response') {
 const finish = pendingRuntimeMessages.get(payload.requestId);
 if (finish) finish(payload.response);
 }

 if (payload.kind === 'storage-change') {
 notifyStorageChanges(payload.changes || {}, payload.areaName || 'local', true);
 }
 };
 }

 globalThis.__FWD_DESKTOP_SHELL__ = true;
 globalThis.__FWD_DESKTOP_BACKGROUND__ = isBackgroundContext;
 globalThis.FWDDesktopRuntime = Object.freeze({
 start: startBackgroundRuntime,
 stop: stopBackgroundRuntime,
 isStarted: () => isBackgroundContext || !!document.getElementById('desktopBackgroundFrame'),
 });

 if (!isBackgroundContext) {
 const markerKey = 'fwd:desktop-ui-baseline-v1';
 if (location.search.includes('app=windows') && localStorage.getItem(markerKey) !== 'done') {
 localStorage.setItem(`${storagePrefix('local')}workspaceFocusMode`, JSON.stringify(false));
 localStorage.setItem(markerKey, 'done');
 }
 }
})();
