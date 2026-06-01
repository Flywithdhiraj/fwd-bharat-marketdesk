const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { readJsonFile, writeJsonFile, normalizeSecretName } = require('./json-store');

const SINGLE_CREDENTIAL_ALIAS = 'FWD Bharat MarketDesk/primary';

function createCredentialStore({ app, safeStorage, errorJournal } = {}) {
 const credentialStorePath = () => path.join(app.getPath('userData'), 'credentials.json');
 const secureSecretStorePath = () => path.join(app.getPath('userData'), 'secure-secrets.json');
 const fallbackSecretKeyPath = () => path.join(app.getPath('userData'), 'fallback-secret.key');

 async function getMachineEncryptionKey() {
  const keyPath = fallbackSecretKeyPath();
  let installSecret = '';
  try {
   try {
    await fs.access(keyPath);
   } catch {
    await fs.mkdir(path.dirname(keyPath), { recursive: true });
    await fs.writeFile(keyPath, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
    await fs.chmod(keyPath, 0o600).catch(() => null);
   }
   installSecret = (await fs.readFile(keyPath, 'utf8')).trim();
  } catch (error) {
   errorJournal?.append?.('credentials:key', error);
  }
  const material = [
   installSecret,
   os.hostname(),
   os.userInfo().username,
   app.getPath('userData'),
   'fwd-tradedesk-pro-machine-key-v2',
  ].join(':');
  return crypto.createHash('sha256').update(material).digest();
 }

 async function protectSecret(value) {
  const text = JSON.stringify(value || {});
  if (safeStorage.isEncryptionAvailable()) {
   return { mode: 'safeStorage', value: safeStorage.encryptString(text).toString('base64') };
  }
  const key = await getMachineEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
   mode: 'aes-256-gcm',
   iv: iv.toString('base64'),
   tag: tag.toString('base64'),
   value: encrypted.toString('base64'),
  };
 }

 async function unprotectSecret(record) {
  if (!record?.value) return null;
  if (record.mode === 'safeStorage' && safeStorage.isEncryptionAvailable()) {
   try {
    const buffer = Buffer.from(String(record.value), 'base64');
    const text = safeStorage.decryptString(buffer);
    return JSON.parse(text || '{}');
   } catch (error) {
    error.code = error.code || 'SAFE_STORAGE_DECRYPT_FAILED';
    throw error;
   }
  }
  if (record.mode === 'aes-256-gcm') {
   const key = await getMachineEncryptionKey();
   const iv = Buffer.from(String(record.iv || ''), 'base64');
   const tag = Buffer.from(String(record.tag || ''), 'base64');
   const encrypted = Buffer.from(String(record.value || ''), 'base64');
   const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
   decipher.setAuthTag(tag);
   const text = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
   return JSON.parse(text || '{}');
  }
  const buffer = Buffer.from(String(record.value), 'base64');
  return JSON.parse(buffer.toString('utf8') || '{}');
 }

 function secretNeedsMigration(record) {
  if (!record?.value) return false;
  if (safeStorage.isEncryptionAvailable()) return record.mode !== 'safeStorage';
  return record.mode !== 'aes-256-gcm';
 }

 async function migrateSecretStoreRecords(store, writer) {
  if (!store || typeof store !== 'object') return {};
  let changed = false;
  const next = { ...store };
  for (const [key, record] of Object.entries(store)) {
   if (!secretNeedsMigration(record)) continue;
   try {
    const value = await unprotectSecret(record);
    if (!value) continue;
    next[key] = await protectSecret(value);
    changed = true;
   } catch (error) {
    errorJournal?.append?.('credentials:migrate-record', error, { key });
   }
  }
  if (changed) await writer(next);
  return next;
 }

 async function migrateCredentialStoreToSingle(store = {}) {
  if (!store || typeof store !== 'object') return {};
  const current = store[SINGLE_CREDENTIAL_ALIAS];
  const entries = Object.entries(store).filter(([, record]) => record?.value);
  if (current || entries.length <= 1) {
   if (current || !entries.length || entries[0][0] === SINGLE_CREDENTIAL_ALIAS) return store;
   const next = { [SINGLE_CREDENTIAL_ALIAS]: entries[0][1] };
   await writeCredentialStore(next);
   return next;
  }
  const next = { [SINGLE_CREDENTIAL_ALIAS]: entries[0][1] };
  await writeCredentialStore(next);
  return next;
 }

 async function readCredentialStore() {
  const store = await readJsonFile(credentialStorePath(), {});
  return migrateCredentialStoreToSingle(await migrateSecretStoreRecords(store, writeCredentialStore));
 }

 async function writeCredentialStore(store = {}) {
  await writeJsonFile(credentialStorePath(), store);
 }

 async function readSecureSecretStore() {
  const store = await readJsonFile(secureSecretStorePath(), {});
  return migrateSecretStoreRecords(store, writeSecureSecretStore);
 }

 async function writeSecureSecretStore(store = {}) {
  await writeJsonFile(secureSecretStorePath(), store);
 }

 async function storeCredential(message = {}) {
  if (!message.tradingKey || !message.tradingSecret) {
   return { ok: false, error: 'Trading key and secret are required.' };
  }
  const alias = SINGLE_CREDENTIAL_ALIAS;
  await writeCredentialStore({
   [alias]: await protectSecret({
    profileId: 'primary',
    credentialAlias: alias,
    label: String(message.label || '').trim(),
    tradingKey: String(message.tradingKey || '').trim(),
    tradingSecret: String(message.tradingSecret || '').trim(),
    updatedAt: Date.now(),
   }),
  });
  return { ok: true, credentialAlias: alias, label: String(message.label || '').trim() };
 }

 async function deleteCredential() {
  await writeCredentialStore({});
  return { ok: true };
 }

 async function getPrimaryCredential() {
  const store = await readCredentialStore();
  return unprotectSecret(store[SINGLE_CREDENTIAL_ALIAS]);
 }

 async function getSecureSecret(name = '') {
  const safeName = normalizeSecretName(name);
  if (!safeName) return { ok: false, error: 'Secret name is required.' };
  const store = await readSecureSecretStore();
  try {
   const value = await unprotectSecret(store[safeName]) || null;
   return { ok: true, name: safeName, value };
  } catch (error) {
   errorJournal?.append?.('credentials:secure-secret-decrypt', error, { name: safeName });
   return {
    ok: false,
    name: safeName,
    recoverable: true,
    error: 'Saved encrypted credentials could not be decrypted. Re-save market-data API credentials in Settings > API Keys.',
   };
  }
 }

 async function setSecureSecret(name = '', value = {}) {
  const safeName = normalizeSecretName(name);
  if (!safeName) return { ok: false, error: 'Secret name is required.' };
  const store = await readSecureSecretStore();
  store[safeName] = await protectSecret({
   value: value && typeof value === 'object' ? value : {},
   updatedAt: Date.now(),
  });
  await writeSecureSecretStore(store);
  return { ok: true, name: safeName, encrypted: safeStorage.isEncryptionAvailable() };
 }

 async function deleteSecureSecret(name = '') {
  const safeName = normalizeSecretName(name);
  if (!safeName) return { ok: false, error: 'Secret name is required.' };
  const store = await readSecureSecretStore();
  delete store[safeName];
  await writeSecureSecretStore(store);
  return { ok: true, name: safeName };
 }

 return {
  SINGLE_CREDENTIAL_ALIAS,
  protectSecret,
  unprotectSecret,
  readCredentialStore,
  writeCredentialStore,
  storeCredential,
  deleteCredential,
  getPrimaryCredential,
  getSecureSecret,
  setSecureSecret,
  deleteSecureSecret,
 };
}

module.exports = {
 createCredentialStore,
 SINGLE_CREDENTIAL_ALIAS,
};
