const fs = require('fs/promises');
const path = require('path');
const { readJsonFile, writeJsonFile, removeFileIfExists, listJsonFiles, sanitizeDbKey } = require('./json-store');

function createJournal({ app, errorJournal } = {}) {
 const journalStorePath = () => path.join(app.getPath('userData'), 'journal-store.json');
 const runtimeStoreDir = () => path.join(app.getPath('userData'), 'runtime-store');
 const runtimeStorePath = key => {
  const safeKey = sanitizeDbKey(key);
  return safeKey ? path.join(runtimeStoreDir(), `${safeKey}.json`) : '';
 };

 async function readRuntimeRecord(key = '') {
  const filePath = runtimeStorePath(key);
  return filePath ? readJsonFile(filePath, null) : null;
 }

 async function writeRuntimeRecord(key = '', value = null) {
  const safeKey = sanitizeDbKey(key);
  const filePath = runtimeStorePath(safeKey);
  if (!safeKey || !filePath) return { ok: false, error: 'Runtime store key is required.' };
  const record = { key: safeKey, value: value ?? null, updatedAt: Date.now() };
  await writeJsonFile(filePath, record);
  return { ok: true, key: safeKey, updatedAt: record.updatedAt };
 }

 async function deleteRuntimeRecord(key = '') {
  const filePath = runtimeStorePath(key);
  if (filePath) await removeFileIfExists(filePath);
 }

 async function clearRuntimeStore() {
  await fs.rm(runtimeStoreDir(), { recursive: true, force: true });
 }

 async function listRuntimeRecords() {
  const names = await listJsonFiles(runtimeStoreDir());
  const acc = {};
  for (const name of names) {
   if (name === 'archive') continue;
   const record = await readJsonFile(path.join(runtimeStoreDir(), name), null);
   const key = sanitizeDbKey(record?.key || name.replace(/\.json$/i, ''));
   if (key && record && Object.prototype.hasOwnProperty.call(record, 'value')) {
    acc[key] = record.value;
    const updatedAt = Number(record.updatedAt || 0);
    if (updatedAt > Number(acc.__updatedAt || 0)) acc.__updatedAt = updatedAt;
   }
  }
  return acc;
 }

 async function readStore() {
  const legacy = await readJsonFile(journalStorePath(), {});
  const runtime = await listRuntimeRecords();
  return {
   ...legacy,
   ...runtime,
   __updatedAt: Math.max(Number(legacy.__updatedAt || 0), Number(runtime.__updatedAt || 0)),
  };
 }

 async function writeStore(store = {}) {
  const next = store && typeof store === 'object' ? store : {};
  for (const [key, value] of Object.entries(next)) {
   if (key === '__updatedAt') continue;
   const safeKey = sanitizeDbKey(key);
   if (safeKey) await writeRuntimeRecord(safeKey, value);
  }
  await writeJsonFile(journalStorePath(), { __updatedAt: Number(next.__updatedAt || Date.now()) });
 }

 async function readValue(key = '') {
  const safeKey = sanitizeDbKey(key);
  if (!safeKey) return { value: null, updatedAt: 0 };
  const runtime = await readRuntimeRecord(safeKey);
  if (runtime && Object.prototype.hasOwnProperty.call(runtime, 'value')) {
   return { value: runtime.value, updatedAt: Number(runtime.updatedAt || 0) };
  }
  const legacy = await readJsonFile(journalStorePath(), {});
  return { value: legacy[safeKey] ?? null, updatedAt: Number(legacy.__updatedAt || 0) };
 }

 async function writeValue(key = '', value = null) {
  const safeKey = sanitizeDbKey(key);
  if (!safeKey) return { ok: false, error: 'Journal key is required.' };
  const write = await writeRuntimeRecord(safeKey, value);
  const legacy = await readJsonFile(journalStorePath(), {});
  if (Object.prototype.hasOwnProperty.call(legacy, safeKey)) delete legacy[safeKey];
  legacy.__updatedAt = write.updatedAt || Date.now();
  await writeJsonFile(journalStorePath(), legacy);
  return write;
 }

 async function readPage(key = '', options = {}) {
  const safeKey = sanitizeDbKey(key);
  if (!safeKey) return { ok: false, error: 'Journal key is required.' };
  const value = (await readValue(safeKey)).value;
  const rows = Array.isArray(value) ? value : [];
  const total = rows.length;
  const limit = Math.max(1, Math.min(1000, Number(options.limit || 100)));
  const offset = Math.max(0, Number(options.offset || 0));
  const source = options.reverse ? rows.slice().reverse() : rows;
  const items = source.slice(offset, offset + limit);
  return { ok: true, key: safeKey, items, total, offset, limit, hasMore: offset + items.length < total };
 }

 async function archiveSeries(key = '', rows = [], keep = 1000) {
  const safeKey = sanitizeDbKey(key);
  const list = Array.isArray(rows) ? rows : [];
  const keepCount = Math.max(50, Math.min(5000, Number(keep || 1000)));
  if (!safeKey || list.length <= keepCount) return { archived: 0, retained: list.length };
  const archiveDir = path.join(runtimeStoreDir(), 'archive');
  const archived = list.slice(0, Math.max(0, list.length - keepCount));
  const retained = list.slice(-keepCount);
  try {
   await fs.mkdir(archiveDir, { recursive: true });
   const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
   await writeJsonFile(path.join(archiveDir, `${safeKey}-${stamp}.json`), {
    key: safeKey,
    archivedAt: Date.now(),
    archivedRows: archived.length,
    rows: archived,
   });
   await writeValue(safeKey, retained);
   return { archived: archived.length, retained: retained.length };
  } catch (error) {
   errorJournal?.append?.('journal:archive', error, { key: safeKey });
   return { archived: 0, retained: list.length, error: error?.message || String(error || 'archive failed') };
  }
 }

 return {
  journalStorePath,
  runtimeStoreDir,
  readStore,
  writeStore,
  readValue,
  writeValue,
  readPage,
  deleteRuntimeRecord,
  clearRuntimeStore,
  archiveSeries,
 };
}

module.exports = { createJournal };
