const crypto = require('crypto');
const path = require('path');
const QRCode = require('qrcode');
const { BrowserWindow } = require('electron');
const { readJsonFile, writeJsonFile } = require('./json-store');

let argon2 = null;
try {
 argon2 = require('argon2');
} catch {
 argon2 = null;
}

const PBKDF2_ITERATIONS = 600000;
const PBKDF2_LEGACY_ITERATIONS = 210000;
const AUTH_MAX_FAILED_ATTEMPTS = 5;
const AUTH_LOCKOUT_BASE_MS = 30000;

function createAuth({ app, safeStorage, credentialStore } = {}) {
 const authStorePath = () => path.join(app.getPath('userData'), 'app-auth.json');
 const unlockedWebContents = new Map();
 let unlockedAt = 0;
 const loginState = { failedAttempts: 0, lockoutUntil: 0 };

 async function readAuthStore() {
  return readJsonFile(authStorePath(), {});
 }

 async function writeAuthStore(store) {
  await writeJsonFile(authStorePath(), store || {});
 }

 async function isConfigured() {
  const store = await readAuthStore();
  if (!store?.passwordHash) return false;
  if (store.passwordAlgorithm === 'argon2id') return true;
  return !!store.salt;
 }

 function hashPassword(password, salt = crypto.randomBytes(16).toString('base64'), iterations = PBKDF2_ITERATIONS) {
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, iterations, 32, 'sha256').toString('base64');
  return { salt, hash, iterations };
 }

 async function hashPasswordRecord(password) {
  if (argon2) {
   const hash = await argon2.hash(String(password || ''), {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
   });
   return { algorithm: 'argon2id', salt: '', hash, iterations: 0 };
  }
  const record = hashPassword(password);
  return { algorithm: 'pbkdf2-sha256', ...record };
 }

 function timingSafeTextEqual(left = '', right = '') {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
 }

 async function verifyPasswordRecord(password, store = {}) {
  try {
   if (store.passwordAlgorithm === 'argon2id') {
    if (!argon2) return false;
    return argon2.verify(String(store.passwordHash || ''), String(password || ''));
   }
  } catch {
   return false;
  }
  const storedIterations = Number(store.pbkdf2Iterations || PBKDF2_LEGACY_ITERATIONS);
  const { hash } = hashPassword(String(password || ''), String(store.salt || ''), storedIterations);
  return timingSafeTextEqual(hash, store.passwordHash);
 }

 function hashRecoveryCode(code, salt = crypto.randomBytes(16).toString('base64'), iterations = PBKDF2_ITERATIONS) {
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hash = crypto.pbkdf2Sync(normalized, salt, iterations, 32, 'sha256').toString('base64');
  return { salt, hash, iterations };
 }

 function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
   value = (value << 8) | byte;
   bits += 8;
   while (bits >= 5) {
    output += alphabet[(value >>> (bits - 5)) & 31];
    bits -= 5;
   }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
 }

 function base32Decode(value = '') {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let current = 0;
  const bytes = [];
  for (const char of clean) {
   const index = alphabet.indexOf(char);
   if (index < 0) continue;
   current = (current << 5) | index;
   bits += 5;
   if (bits >= 8) {
    bytes.push((current >>> (bits - 8)) & 255);
    bits -= 8;
   }
  }
  return Buffer.from(bytes);
 }

 function generateTotp(secret, step = 30, digits = 6, timestamp = Date.now()) {
  const counter = Math.floor(Math.floor(timestamp / 1000) / step);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
  | ((hmac[offset + 1] & 0xff) << 16)
  | ((hmac[offset + 2] & 0xff) << 8)
  | (hmac[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
 }

 function verifyTotp(secret, code = '') {
  const clean = String(code || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const now = Date.now();
  return [-1, 0, 1].some(offset => generateTotp(secret, 30, 6, now + (offset * 30000)) === clean);
 }

 function senderId(eventOrId = null) {
  if (typeof eventOrId === 'number') return eventOrId;
  return Number(eventOrId?.sender?.id || 0);
 }

 async function isUnlocked(eventOrId = null) {
  if (!await isConfigured()) return true;
  const id = senderId(eventOrId);
  return unlockedAt > 0 || (id > 0 && unlockedWebContents.has(id));
 }

 function unlock(eventOrId = null) {
  unlockedAt = Date.now();
  const id = senderId(eventOrId);
  if (id > 0) unlockedWebContents.set(id, Date.now());
  BrowserWindow.getAllWindows().forEach(win => {
   if (!win.isDestroyed()) unlockedWebContents.set(win.webContents.id, unlockedAt);
  });
 }

 function lock() {
  unlockedAt = 0;
  unlockedWebContents.clear();
 }

 function forgetWebContents(id) {
  unlockedWebContents.delete(id);
 }

 async function status(eventOrId = null) {
  const store = await readAuthStore();
  return {
   ok: true,
   configured: await isConfigured(),
   unlocked: await isUnlocked(eventOrId),
   totpEnabled: !!store?.totpEnabled,
   recoveryEnabled: !!(store?.recoveryHash && store?.recoverySalt),
   secureStorage: safeStorage.isEncryptionAvailable(),
  };
 }

 function getThrottle(store = {}) {
  const stored = store?.authThrottle || {};
  return {
   failedAttempts: Math.max(Number(stored.failedAttempts || 0), Number(loginState.failedAttempts || 0)),
   lockoutUntil: Math.max(Number(stored.lockoutUntil || 0), Number(loginState.lockoutUntil || 0)),
  };
 }

 async function writeThrottle(store = {}, throttle = {}) {
  const nextThrottle = {
   failedAttempts: Math.max(0, Number(throttle.failedAttempts || 0)),
   lockoutUntil: Math.max(0, Number(throttle.lockoutUntil || 0)),
   updatedAt: Date.now(),
  };
  loginState.failedAttempts = nextThrottle.failedAttempts;
  loginState.lockoutUntil = nextThrottle.lockoutUntil;
  await writeAuthStore({ ...store, authThrottle: nextThrottle, updatedAt: Date.now() });
 }

 function lockoutResponse(store = {}) {
  const throttle = getThrottle(store);
  const now = Date.now();
  if (throttle.lockoutUntil <= now) return null;
  const remainingMs = throttle.lockoutUntil - now;
  return {
   ok: false,
   error: `Too many failed attempts. Try again in ${Math.ceil(remainingMs / 1000)} seconds.`,
   locked: true,
   retryAfterMs: remainingMs,
  };
 }

 async function recordFailure(store = {}, fallbackError = 'Credential check failed.') {
  const now = Date.now();
  const throttle = getThrottle(store);
  const failedAttempts = throttle.failedAttempts + 1;
  let lockoutUntil = throttle.lockoutUntil > now ? throttle.lockoutUntil : 0;
  if (failedAttempts >= AUTH_MAX_FAILED_ATTEMPTS) {
   const lockoutMs = AUTH_LOCKOUT_BASE_MS * Math.pow(2, Math.min(failedAttempts - AUTH_MAX_FAILED_ATTEMPTS, 5));
   lockoutUntil = now + lockoutMs;
  }
  await writeThrottle(store, { failedAttempts, lockoutUntil });
  return lockoutResponse({ ...store, authThrottle: { failedAttempts, lockoutUntil } }) || { ok: false, error: fallbackError };
 }

 async function clearThrottle(store = {}) {
  loginState.failedAttempts = 0;
  loginState.lockoutUntil = 0;
  await writeAuthStore({
   ...store,
   authThrottle: { failedAttempts: 0, lockoutUntil: 0, updatedAt: Date.now() },
   updatedAt: Date.now(),
  });
 }

 function createRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let output = '';
  const bytes = crypto.randomBytes(20);
  for (let i = 0; i < 20; i += 1) {
   if (i > 0 && i % 5 === 0) output += '-';
   output += alphabet[bytes[i] % alphabet.length];
  }
  return output;
 }

 async function createOtpQrDataUrl(otpauthUrl = '') {
  if (!otpauthUrl) return '';
  return QRCode.toDataURL(otpauthUrl, {
   errorCorrectionLevel: 'M',
   margin: 4,
   scale: 8,
   color: { dark: '#000000', light: '#ffffff' },
  });
 }

 async function ensureUnlocked(type = '', eventOrId = null) {
  const lockScreenMessages = new Set([
   'ping',
   'auth_status',
   'auth_setup',
   'auth_login',
   'auth_reset_password',
   'auth_logout',
  ]);
  if (lockScreenMessages.has(type)) return null;
  if (await isUnlocked(eventOrId)) return null;
  return { ok: false, status: 423, error: 'FWD Bharat MarketDesk is locked. Login is required.' };
 }

 async function setup(message = {}, eventOrId = null) {
  if (await isConfigured()) return { ok: false, error: 'App lock is already configured.' };
  const password = String(message.password || '');
  if (password.length < 8) return { ok: false, error: 'Use at least 8 characters for the app password.' };
  const passwordRecord = await hashPasswordRecord(password);
  const totpEnabled = !!message.totpEnabled;
  const totpSecret = totpEnabled ? base32Encode(crypto.randomBytes(20)) : '';
  const recoveryCode = createRecoveryCode();
  const recovery = hashRecoveryCode(recoveryCode);
  const accountLabel = encodeURIComponent('FWD Bharat MarketDesk');
  const issuer = encodeURIComponent('FWD');
  await writeAuthStore({
   version: 2,
   passwordAlgorithm: passwordRecord.algorithm,
   passwordHash: passwordRecord.hash,
   salt: passwordRecord.salt,
   pbkdf2Iterations: passwordRecord.iterations,
   recoveryHash: recovery.hash,
   recoverySalt: recovery.salt,
   recoveryPbkdf2Iterations: recovery.iterations,
   totpEnabled,
   totpSecret: totpEnabled ? await credentialStore.protectSecret({ secret: totpSecret }) : null,
   createdAt: Date.now(),
   updatedAt: Date.now(),
  });
  unlock(eventOrId);
  return {
   ok: true,
   configured: true,
   unlocked: true,
   totpEnabled,
   recoveryCode,
   manualKey: totpSecret,
   qrDataUrl: totpEnabled
   ? await createOtpQrDataUrl(`otpauth://totp/${accountLabel}?secret=${encodeURIComponent(totpSecret)}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`)
   : '',
  };
 }

 async function login(message = {}, eventOrId = null) {
  const store = await readAuthStore();
  const lockout = lockoutResponse(store);
  if (lockout) return lockout;
  if (!await isConfigured()) {
   unlock(eventOrId);
   return status(eventOrId);
  }
  if (!await verifyPasswordRecord(message.password, store)) {
   return recordFailure(store, 'Password is incorrect.');
  }
  if (store.totpEnabled) {
   const secretRecord = await credentialStore.unprotectSecret(store.totpSecret);
   if (!verifyTotp(secretRecord?.secret || '', message.totpCode)) {
    return recordFailure(store, 'Authenticator code is incorrect or expired.');
   }
  }
  await clearThrottle(store);
  unlock(eventOrId);
  return status(eventOrId);
 }

 async function resetPassword(message = {}, eventOrId = null) {
  const store = await readAuthStore();
  const lockout = lockoutResponse(store);
  if (lockout) return lockout;
  if (!await isConfigured() || !store.recoveryHash || !store.recoverySalt) {
   return { ok: false, error: 'Recovery is not configured for this app lock.' };
  }
  const recoveryIterations = Number(store.recoveryPbkdf2Iterations || PBKDF2_LEGACY_ITERATIONS);
  const recovery = hashRecoveryCode(message.recoveryCode, String(store.recoverySalt || ''), recoveryIterations);
  if (!timingSafeTextEqual(recovery.hash, store.recoveryHash)) {
   return recordFailure(store, 'Recovery code is incorrect.');
  }
  const nextPassword = String(message.newPassword || '');
  if (nextPassword.length < 8) return { ok: false, error: 'Use at least 8 characters for the new password.' };
  const next = await hashPasswordRecord(nextPassword);
  const nextRecoveryCode = createRecoveryCode();
  const nextRecovery = hashRecoveryCode(nextRecoveryCode);
  await writeAuthStore({
   ...store,
   passwordHash: next.hash,
   passwordAlgorithm: next.algorithm,
   salt: next.salt,
   pbkdf2Iterations: next.iterations,
   recoveryHash: nextRecovery.hash,
   recoverySalt: nextRecovery.salt,
   recoveryPbkdf2Iterations: nextRecovery.iterations,
   authThrottle: { failedAttempts: 0, lockoutUntil: 0, updatedAt: Date.now() },
   updatedAt: Date.now(),
  });
  loginState.failedAttempts = 0;
  loginState.lockoutUntil = 0;
  unlock(eventOrId);
  return { ...await status(eventOrId), recoveryCode: nextRecoveryCode };
 }

 async function updateSecurity(message = {}, eventOrId = null) {
  if (!await isUnlocked(eventOrId)) return { ok: false, status: 423, error: 'Login is required before changing security settings.' };
  const store = await readAuthStore();
  const lockout = lockoutResponse(store);
  if (lockout) return lockout;
  if (!await verifyPasswordRecord(message.currentPassword, store)) {
   return recordFailure(store, 'Current password is incorrect.');
  }
  let nextStore = { ...store, updatedAt: Date.now() };
  let recoveryCode = '';
  let manualKey = '';
  let qrDataUrl = '';
  const nextPassword = String(message.newPassword || '');
  if (nextPassword) {
   if (nextPassword.length < 8) return { ok: false, error: 'Use at least 8 characters for the new password.' };
   if (nextPassword !== String(message.confirmPassword || '')) return { ok: false, error: 'New password and confirm password do not match.' };
   const next = await hashPasswordRecord(nextPassword);
   const nextRecoveryCode = createRecoveryCode();
   const nextRecovery = hashRecoveryCode(nextRecoveryCode);
   nextStore = {
    ...nextStore,
    passwordHash: next.hash,
    passwordAlgorithm: next.algorithm,
    salt: next.salt,
    pbkdf2Iterations: next.iterations,
    recoveryHash: nextRecovery.hash,
    recoverySalt: nextRecovery.salt,
    recoveryPbkdf2Iterations: nextRecovery.iterations,
   };
   recoveryCode = nextRecoveryCode;
  }
  if (message.totpAction === 'enable') {
   const secret = base32Encode(crypto.randomBytes(20));
   const accountLabel = encodeURIComponent('FWD Bharat MarketDesk');
   const issuer = encodeURIComponent('FWD');
   nextStore = { ...nextStore, totpEnabled: true, totpSecret: await credentialStore.protectSecret({ secret }), updatedAt: Date.now() };
   manualKey = secret;
   qrDataUrl = await createOtpQrDataUrl(`otpauth://totp/${accountLabel}?secret=${encodeURIComponent(secret)}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`);
  } else if (message.totpAction === 'disable') {
   nextStore = { ...nextStore, totpEnabled: false, totpSecret: null, updatedAt: Date.now() };
  }
  nextStore = { ...nextStore, authThrottle: { failedAttempts: 0, lockoutUntil: 0, updatedAt: Date.now() } };
  await writeAuthStore(nextStore);
  loginState.failedAttempts = 0;
  loginState.lockoutUntil = 0;
  return { ...await status(eventOrId), recoveryCode, manualKey, qrDataUrl };
 }

 async function disable(message = {}, eventOrId = null) {
  const store = await readAuthStore();
  const lockout = lockoutResponse(store);
  if (lockout) return lockout;
  if (!await isConfigured() || !await verifyPasswordRecord(message.password, store)) {
   return recordFailure(store, 'Password is incorrect.');
  }
  await writeAuthStore({});
  lock();
  unlock(eventOrId);
  return status(eventOrId);
 }

 return {
  readAuthStore,
  writeAuthStore,
  isConfigured,
  isUnlocked,
  unlock,
  lock,
  forgetWebContents,
  status,
  setup,
  login,
  resetPassword,
  updateSecurity,
  disable,
  ensureUnlocked,
 };
}

module.exports = { createAuth };
