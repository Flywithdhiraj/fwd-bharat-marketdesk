const fs = require('fs/promises');
const path = require('path');

const ERROR_LIMIT = 500;

function serializeError(error) {
 if (!error) return { message: 'Unknown error' };
 if (error instanceof Error) {
 return {
 name: error.name,
 message: error.message,
 stack: error.stack,
 };
 }
 if (typeof error === 'object') {
 return {
 message: String(error.message || JSON.stringify(error)),
 stack: error.stack ? String(error.stack) : '',
 raw: error,
 };
 }
 return { message: String(error) };
}

function createErrorJournal({ app, consoleRef = console } = {}) {
 const filePath = path.join(app.getPath('userData'), 'error-journal.json');
 let writeQueue = Promise.resolve();

 async function readEntries() {
  try {
   const raw = await fs.readFile(filePath, 'utf8');
   const parsed = JSON.parse(raw || '[]');
   return Array.isArray(parsed) ? parsed : [];
  } catch {
   return [];
  }
 }

 async function writeEntries(entries) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(entries.slice(-ERROR_LIMIT), null, 2));
 }

 function append(scope, error, extra = {}) {
  const entry = {
   ts: Date.now(),
   scope: String(scope || 'main'),
   error: serializeError(error),
   extra: extra && typeof extra === 'object' ? extra : {},
  };
  writeQueue = writeQueue
  .then(async () => {
   const entries = await readEntries();
   entries.push(entry);
   await writeEntries(entries);
  })
  .catch(writeError => {
   consoleRef.error('[error-journal:write-failed]', writeError?.message || writeError);
  });
  return entry;
 }

 process.on('uncaughtException', error => {
  append('main:uncaughtException', error);
  consoleRef.error('[uncaughtException]', error);
 });

 process.on('unhandledRejection', reason => {
  append('main:unhandledRejection', reason);
  consoleRef.error('[unhandledRejection]', reason);
 });

 return {
  filePath,
  append,
  async list(limit = 100) {
   const entries = await readEntries();
   return entries.slice(-Math.max(1, Math.min(ERROR_LIMIT, Number(limit || 100)))).reverse();
  },
  async clear() {
   await writeEntries([]);
   return { ok: true };
  },
 };
}

module.exports = {
 createErrorJournal,
 serializeError,
};
