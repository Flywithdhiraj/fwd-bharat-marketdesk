'use strict';

const fs = require('fs/promises');
const path = require('path');
const { flattenRows, buildResearch } = require('./lib/commodity-spread-research');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'research-data', 'mcx-bhavcopy');
const OUTPUT = path.join(ROOT, 'src', 'renderer', 'data', 'commodity-spread-evidence.json');

async function main() {
 const files = (await fs.readdir(DATA_DIR)).filter(file => file.endsWith('.json')).sort();
 const rows = [];
 for (const file of files) {
  const stored = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
  rows.push(...flattenRows(stored.payload || stored));
 }
 const report = buildResearch(rows, { lookback: 60, entryZ: 1.75, exitZ: 0.35, stopZ: 3, roundTripCost: 2 });
 await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
 await fs.writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
 console.log(JSON.stringify({ output: OUTPUT, files: files.length, coverage: report.coverage, results: report.results.length }, null, 2));
}

main().catch(error => {
 console.error(error);
 process.exitCode = 1;
});
