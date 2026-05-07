'use strict';

const {
 sanitizeMarketDataMode: deltaSanitizeMarketDataMode,
} = globalThis.FWDTradeDeskShared;

const DELTA_PUBLIC_SOCKET_URLS = Object.freeze({
 india: 'wss://socket.india.delta.exchange',
 global: 'wss://socket.delta.exchange',
});
const DELTA_PUBLIC_TICKER_WAIT_MS = 1400;
const DELTA_PUBLIC_TICKER_STALE_MS = 15000;

const deltaPublicTickerFeed = {
 url: '',
 ws: null,
 connectPromise: null,
 connected: false,
 subscriptions: new Set(),
 cache: new Map(),
 waiters: new Map(),
};

function deltaResolveMarketDataMode(raw) {
 return typeof deltaSanitizeMarketDataMode === 'function'
 ? deltaSanitizeMarketDataMode(raw)
 : (String(raw || '').trim().toLowerCase() || 'auto');
}

async function deltaReadMarketDataMode() {
 try {
 const data = await storeLocalGet(['strategy']);
 return deltaResolveMarketDataMode(data?.strategy?.marketDataMode);
 } catch (_) {
 return 'auto';
 }
}

function deltaPublicSocketUrlForBase(baseUrl = '') {
 const value = String(baseUrl || BASE || '').toLowerCase();
 if (value.includes('api.delta.exchange') && !value.includes('india')) return DELTA_PUBLIC_SOCKET_URLS.global;
 return DELTA_PUBLIC_SOCKET_URLS.india;
}

function deltaNormalizeTickerEnvelope(raw = {}, fallbackSymbol = '') {
 const payload = raw?.symbol ? raw : (raw?.payload && typeof raw.payload === 'object' ? raw.payload : raw);
 const symbol = String(payload?.symbol || fallbackSymbol || '').trim().toUpperCase();
 if (!symbol) return null;
 const markPrice = Number(
 payload?.mark_price
 ?? payload?.markPrice
 ?? payload?.price
 ?? payload?.close
 ?? payload?.spot_price
 ?? 0
 );
 const price = Number(
 payload?.price
 ?? payload?.close
 ?? payload?.last_price
 ?? payload?.mark_price
 ?? payload?.markPrice
 ?? payload?.spot_price
 ?? 0
 );
 return {
 symbol,
 markPrice: Number.isFinite(markPrice) ? markPrice : 0,
 price: Number.isFinite(price) ? price : 0,
 raw: payload,
 source: 'websocket',
 receivedAt: Date.now(),
 };
}

function deltaGetCachedPublicTicker(symbol = '') {
 const key = String(symbol || '').trim().toUpperCase();
 if (!key) return null;
 const cached = deltaPublicTickerFeed.cache.get(key);
 if (!cached) return null;
 if ((Date.now() - Number(cached.receivedAt || 0)) > DELTA_PUBLIC_TICKER_STALE_MS) return null;
 return cached;
}

function deltaResolvePublicTickerWaiters(symbol, value) {
 const key = String(symbol || '').trim().toUpperCase();
 if (!key) return;
 const waiters = deltaPublicTickerFeed.waiters.get(key);
 if (!waiters?.length) return;
 deltaPublicTickerFeed.waiters.delete(key);
 waiters.forEach(resolve => {
 try { resolve(value); } catch (_) {}
 });
}

function deltaRejectPublicTickerWaiters(error = null) {
 for (const [symbol, waiters] of deltaPublicTickerFeed.waiters.entries()) {
 deltaPublicTickerFeed.waiters.delete(symbol);
 waiters.forEach(resolve => {
 try { resolve(null); } catch (_) {}
 });
 }
 if (error && typeof dlog === 'function') {
 dlog(`Delta public socket reset: ${error}`);
 }
}

function deltaSendPublicTickerSubscriptions(symbols = []) {
 const ws = deltaPublicTickerFeed.ws;
 if (!ws || ws.readyState !== WebSocket.OPEN || !symbols.length) return;
 ws.send(JSON.stringify({
 type: 'subscribe',
 payload: {
 channels: [
 { name: 'v2/ticker', symbols: symbols.map(symbol => String(symbol || '').trim().toUpperCase()).filter(Boolean) },
 ],
 },
 }));
}

function deltaResetPublicTickerSocket() {
 const ws = deltaPublicTickerFeed.ws;
 deltaPublicTickerFeed.ws = null;
 deltaPublicTickerFeed.connected = false;
 deltaPublicTickerFeed.connectPromise = null;
 if (ws) {
 try { ws.close(); } catch (_) {}
 }
}

function deltaHandlePublicTickerMessage(message = {}) {
 const type = String(message?.type || '').toLowerCase();
 const payload = message?.payload;
 const items = [];

 if (type === 'v2/ticker' || type === 'ticker') {
 if (Array.isArray(payload)) items.push(...payload);
 else if (Array.isArray(message?.tickers)) items.push(...message.tickers);
 else if (payload && typeof payload === 'object') items.push(payload);
 else items.push(message);
 }

 items.forEach(entry => {
 const normalized = deltaNormalizeTickerEnvelope(entry);
 if (!normalized) return;
 deltaPublicTickerFeed.cache.set(normalized.symbol, normalized);
 deltaResolvePublicTickerWaiters(normalized.symbol, normalized);
 });
}

async function deltaEnsurePublicTickerSocket(baseUrl = '') {
 await detectAPI();
 const nextUrl = deltaPublicSocketUrlForBase(baseUrl);
 if (
 deltaPublicTickerFeed.ws
 && deltaPublicTickerFeed.connected
 && deltaPublicTickerFeed.url === nextUrl
 && deltaPublicTickerFeed.ws.readyState === WebSocket.OPEN
 ) {
 return deltaPublicTickerFeed.ws;
 }
 if (deltaPublicTickerFeed.connectPromise && deltaPublicTickerFeed.url === nextUrl) {
 return deltaPublicTickerFeed.connectPromise;
 }

 deltaResetPublicTickerSocket();
 deltaPublicTickerFeed.url = nextUrl;
 if (typeof fwdRecordWebSocketMetric === 'function') {
 fwdRecordWebSocketMetric('reconnect', { url: nextUrl });
 }
 deltaPublicTickerFeed.connectPromise = new Promise((resolve, reject) => {
 const ws = new WebSocket(nextUrl);
 let settled = false;
 const finish = (fn, value) => {
 if (settled) return;
 settled = true;
 fn(value);
 };

 ws.addEventListener('open', () => {
 deltaPublicTickerFeed.ws = ws;
 deltaPublicTickerFeed.connected = true;
 if (typeof fwdRecordWebSocketMetric === 'function') {
 fwdRecordWebSocketMetric('open', { url: nextUrl });
 }
 deltaSendPublicTickerSubscriptions(Array.from(deltaPublicTickerFeed.subscriptions));
 finish(resolve, ws);
 });

 ws.addEventListener('message', event => {
 let message = null;
 try {
 message = JSON.parse(String(event?.data || '{}'));
 } catch (_) {
 return;
 }
 if (typeof fwdRecordWebSocketMetric === 'function') {
 fwdRecordWebSocketMetric('message', { url: nextUrl });
 }
 deltaHandlePublicTickerMessage(message);
 });

 ws.addEventListener('close', event => {
 const reason = `public socket closed (${event?.code || 'unknown'})`;
 if (typeof fwdRecordWebSocketMetric === 'function') {
 fwdRecordWebSocketMetric('close', { url: nextUrl, error: reason });
 }
 deltaResetPublicTickerSocket();
 deltaRejectPublicTickerWaiters(reason);
 if (!settled) finish(reject, new Error(reason));
 });

 ws.addEventListener('error', () => {
 const reason = `public socket failed: ${nextUrl}`;
 if (typeof fwdRecordWebSocketMetric === 'function') {
 fwdRecordWebSocketMetric('error', { url: nextUrl, error: reason });
 }
 deltaResetPublicTickerSocket();
 deltaRejectPublicTickerWaiters(reason);
 if (!settled) finish(reject, new Error(reason));
 });
 }).finally(() => {
 if (!deltaPublicTickerFeed.connected) deltaPublicTickerFeed.connectPromise = null;
 });

 return deltaPublicTickerFeed.connectPromise;
}

async function deltaWaitForPublicTicker(symbol, options = {}) {
 const target = String(symbol || '').trim().toUpperCase();
 if (!target) return null;
 const cached = deltaGetCachedPublicTicker(target);
 if (cached) return cached;

 deltaPublicTickerFeed.subscriptions.add(target);
 try {
 await deltaEnsurePublicTickerSocket(options.baseUrl || '');
 deltaSendPublicTickerSubscriptions([target]);
 } catch (_) {
 return null;
 }

 const cachedAfterConnect = deltaGetCachedPublicTicker(target);
 if (cachedAfterConnect) return cachedAfterConnect;

 return new Promise(resolve => {
 const waiters = deltaPublicTickerFeed.waiters.get(target) || [];
 deltaPublicTickerFeed.waiters.set(target, waiters.concat(resolve));
 setTimeout(() => {
 const pending = deltaPublicTickerFeed.waiters.get(target) || [];
 const index = pending.indexOf(resolve);
 if (index >= 0) pending.splice(index, 1);
 if (pending.length) deltaPublicTickerFeed.waiters.set(target, pending);
 else deltaPublicTickerFeed.waiters.delete(target);
 resolve(deltaGetCachedPublicTicker(target));
 }, Math.max(250, Number(options.timeoutMs || DELTA_PUBLIC_TICKER_WAIT_MS)));
 });
}

async function deltaResolvePublicTicker(symbol, options = {}) {
 const mode = deltaResolveMarketDataMode(options.mode || await deltaReadMarketDataMode());
 if (mode === 'polling') return null;
 const ticker = await deltaWaitForPublicTicker(symbol, options);
 if (ticker) return ticker;
 return null;
}

function deltaHandleMarketDataModeChange(mode = '') {
 const nextMode = deltaResolveMarketDataMode(mode);
 if (nextMode === 'polling') {
 deltaPublicTickerFeed.subscriptions.clear();
 deltaResetPublicTickerSocket();
 }
 return nextMode;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
 if (!msg || msg.action !== 'delta:marketDataModeChanged') return false;
 if (typeof isTrustedRuntimeSender === 'function' && !isTrustedRuntimeSender(sender)) {
 sendResponse({ ok: false, error: 'Untrusted sender' });
 return false;
 }
 try {
 const mode = deltaHandleMarketDataModeChange(msg.mode);
 sendResponse({ ok: true, mode });
 } catch (error) {
 sendResponse({ ok: false, error: error?.message || 'Failed to apply market data mode' });
 }
 return false;
});

globalThis.deltaResolveMarketDataMode = deltaResolveMarketDataMode;
globalThis.deltaReadMarketDataMode = deltaReadMarketDataMode;
globalThis.deltaResolvePublicTicker = deltaResolvePublicTicker;
globalThis.deltaGetCachedPublicTicker = deltaGetCachedPublicTicker;
