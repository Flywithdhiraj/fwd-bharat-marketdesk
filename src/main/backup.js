const crypto = require('crypto');
const path = require('path');
const { readJsonFile, writeJsonFile } = require('./json-store');

const BACKUP_SCHEMA_VERSION = 2;

function stableStringify(value) {
 if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
 if (value && typeof value === 'object') {
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
 }
 return JSON.stringify(value);
}

function checksumPayload(payload = {}) {
 const clone = { ...payload };
 delete clone.checksum;
 return crypto.createHash('sha256').update(stableStringify(clone)).digest('hex');
}

function validateBackupPayload(payload = {}, candleCache) {
 const errors = [];
 if (!payload || typeof payload !== 'object') errors.push('Backup payload is not an object.');
 if (payload.app !== 'FWD TradeDesk Pro') errors.push('Backup app marker does not match.');
 if (payload.type !== 'full_app_backup') errors.push('Backup type is not full_app_backup.');
 if (![1, 2].includes(Number(payload.version || 0))) errors.push('Backup version is unsupported.');
 if (payload.checksum && payload.checksum !== checksumPayload(payload)) errors.push('Backup checksum does not match.');
 if (payload.rendererStorage && typeof payload.rendererStorage !== 'object') errors.push('Renderer storage must be an object.');
 if (payload.native && typeof payload.native !== 'object') errors.push('Native payload must be an object.');
 const candles = Array.isArray(payload.native?.candles) ? payload.native.candles : [];
 candles.forEach((record, index) => {
  if (!record || typeof record !== 'object') {
   errors.push(`Candle record ${index + 1} is invalid.`);
   return;
  }
  if (!String(record.symbol || '').trim() || !String(record.resolution || '').trim()) errors.push(`Candle record ${index + 1} is missing symbol/resolution.`);
  const rows = Array.isArray(record.rows) ? record.rows : [];
  if (!rows.length) errors.push(`Candle record ${index + 1} has no rows.`);
  const invalidRow = rows.find(row => !candleCache.normalizeRow(row));
  if (invalidRow) errors.push(`Candle record ${index + 1} contains invalid OHLC rows.`);
 });
 if (payload.native?.journal && typeof payload.native.journal !== 'object') errors.push('Journal payload must be an object.');
 return { ok: errors.length === 0, errors };
}

function createBackupService({ app, dialog, journal, candleCache } = {}) {
 async function buildPayload(rendererStorage = {}) {
  const candles = await candleCache.listRecords();
  const journalStore = await journal.readStore();
  const payload = {
   app: 'FWD TradeDesk Pro',
   type: 'full_app_backup',
   version: BACKUP_SCHEMA_VERSION,
   exportedAt: new Date().toISOString(),
   note: 'Contains renderer settings and local candle history. Machine-encrypted API credentials and app-lock secrets are intentionally excluded.',
   rendererStorage: rendererStorage && typeof rendererStorage === 'object' ? rendererStorage : {},
   native: {
    journal: journalStore,
    candles,
   },
   summary: {
    rendererKeys: rendererStorage && typeof rendererStorage === 'object' ? Object.keys(rendererStorage).length : 0,
    candleFiles: candles.length,
    candleRows: candles.reduce((sum, item) => sum + item.rows.length, 0),
   },
  };
  return { ...payload, checksum: checksumPayload(payload) };
 }

 async function exportBackup(message = {}) {
  const defaultName = `fwd_tradedesk_full_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const result = await dialog.showSaveDialog({
   title: 'Save FWD TradeDesk Pro backup',
   defaultPath: path.join(app.getPath('documents'), defaultName),
   filters: [{ name: 'FWD TradeDesk Pro Backup', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true, error: 'Backup save cancelled.' };
  const payload = await buildPayload(message.rendererStorage || {});
  await writeJsonFile(result.filePath, payload);
  return {
   ok: true,
   filePath: result.filePath,
   fileName: path.basename(result.filePath),
   summary: payload.summary,
   checksum: payload.checksum,
  };
 }

 async function importBackup(message = {}) {
  const result = await dialog.showOpenDialog({
   title: 'Restore FWD TradeDesk Pro backup',
   properties: ['openFile'],
   filters: [{ name: 'FWD TradeDesk Pro Backup', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true, error: 'Backup restore cancelled.' };
  const filePath = result.filePaths[0];
  const payload = await readJsonFile(filePath, null);
  const validation = validateBackupPayload(payload, candleCache);
  if (!validation.ok) {
   return { ok: false, error: validation.errors[0] || 'Selected file is not a valid backup.', errors: validation.errors };
  }
  const mode = String(message.mode || 'merge').trim().toLowerCase() === 'replace' ? 'replace' : 'merge';
  const candles = Array.isArray(payload.native?.candles) ? payload.native.candles : [];
  let candleFiles = 0;
  let candleRows = 0;
  if (mode === 'replace') {
   await journal.clearRuntimeStore();
   await candleCache.clear('', '');
  }
  for (const record of candles) {
   const write = await candleCache.put(record, mode);
   if (write.ok) {
    candleFiles += 1;
    candleRows += Number(write.rowCount || 0);
   }
  }
  if (payload.native?.journal && typeof payload.native.journal === 'object') {
   const currentJournal = mode === 'replace' ? {} : await journal.readStore();
   await journal.writeStore({ ...currentJournal, ...payload.native.journal, __updatedAt: Date.now() });
  }
  return {
   ok: true,
   filePath,
   fileName: path.basename(filePath),
   rendererStorage: payload.rendererStorage && typeof payload.rendererStorage === 'object' ? payload.rendererStorage : {},
   summary: {
    rendererKeys: payload.rendererStorage && typeof payload.rendererStorage === 'object' ? Object.keys(payload.rendererStorage).length : 0,
    candleFiles,
    candleRows,
   },
   checksum: payload.checksum || '',
  };
 }

 return {
  buildPayload,
  exportBackup,
  importBackup,
  validateBackupPayload: payload => validateBackupPayload(payload, candleCache),
 };
}

module.exports = {
 createBackupService,
 checksumPayload,
};
