const fs = require('fs/promises');
const path = require('path');

async function readJsonFile(filePath, fallback = {}) {
 try {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw || 'null') ?? fallback;
 } catch {
  return fallback;
 }
}

async function writeJsonFile(filePath, value) {
 await fs.mkdir(path.dirname(filePath), { recursive: true });
 await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

async function removeFileIfExists(filePath) {
 try {
  await fs.unlink(filePath);
 } catch (error) {
  if (error?.code !== 'ENOENT') throw error;
 }
}

async function listJsonFiles(dir) {
 try {
  const names = await fs.readdir(dir);
  return names.filter(name => name.endsWith('.json'));
 } catch {
  return [];
 }
}

function sanitizeDbKey(key = '') {
 return String(key || '').trim().replace(/[^\w:.-]/g, '_').slice(0, 160);
}

function normalizeSecretName(name = '') {
 return String(name || '').trim().replace(/[^\w:.-]/g, '_').slice(0, 160);
}

module.exports = {
 readJsonFile,
 writeJsonFile,
 removeFileIfExists,
 listJsonFiles,
 sanitizeDbKey,
 normalizeSecretName,
};
