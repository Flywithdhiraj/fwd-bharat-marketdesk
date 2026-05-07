const path = require('path');
const { readJsonFile, writeJsonFile } = require('./json-store');

const MIGRATION_KEY = 'main-migrations.json';

function createMigrationRunner({ app, errorJournal } = {}) {
 const migrationPath = () => path.join(app.getPath('userData'), MIGRATION_KEY);
 const migrations = [
  {
   id: '2026-05-02-main-schema-v2',
   async up() {
    const store = await readJsonFile(migrationPath(), {});
    await writeJsonFile(migrationPath(), { ...store, schemaVersion: 2, updatedAt: Date.now() });
   },
  },
 ];

 async function run() {
  const state = await readJsonFile(migrationPath(), { applied: [] });
  const applied = new Set(Array.isArray(state.applied) ? state.applied : []);
  const nextApplied = Array.from(applied);
  for (const migration of migrations) {
   if (applied.has(migration.id)) continue;
   try {
    await migration.up();
    nextApplied.push(migration.id);
    await writeJsonFile(migrationPath(), { ...state, applied: nextApplied, updatedAt: Date.now() });
   } catch (error) {
    errorJournal?.append?.('migration:failed', error, { id: migration.id });
    throw error;
   }
  }
  return { ok: true, applied: nextApplied };
 }

 return { run, migrations };
}

module.exports = { createMigrationRunner };
