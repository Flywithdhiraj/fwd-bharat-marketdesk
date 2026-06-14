'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { flattenRows } = require('./lib/commodity-spread-research');

const ROOT = path.join(__dirname, '..', 'research-data', 'mcx-bhavcopy');
const DAY_MS = 86400000;
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.setPath('userData', path.join(__dirname, '..', 'research-data', 'electron-session'));

function cliDate(name, fallback) {
 const index = process.argv.indexOf(`--${name}`);
 const value = index >= 0 ? process.argv[index + 1] : '';
 const parsed = Date.parse(value || fallback);
 if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name} date: ${value}`);
 return new Date(parsed);
}

function iso(date) {
 return date.toISOString().slice(0, 10);
}

function mcxDate(date) {
 return new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
 }).format(date);
}

function isWeekday(date) {
 return ![0, 6].includes(date.getUTCDay());
}

async function fetchDay(window, date) {
 const requested = mcxDate(date);
 return window.webContents.executeJavaScript(`
  (async () => {
   const response = await fetch('/market-data/bhavcopy/GetDateWiseBhavCopy?InstrumentName=FUTCOM&fromDate=${encodeURIComponent(requested)}', {
    credentials: 'include',
    headers: { Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }
   });
   return { ok: response.ok, status: response.status, text: await response.text() };
  })()
 `, true);
}

async function main() {
 const yesterday = new Date(Date.now() - DAY_MS);
 const defaultStart = new Date(yesterday.getTime() - (3 * 365 + 45) * DAY_MS);
 const start = cliDate('from', iso(defaultStart));
 const end = cliDate('to', iso(yesterday));
 const force = process.argv.includes('--force');
 await fs.mkdir(ROOT, { recursive: true });
 const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
 await window.loadURL('https://www.mcxindia.com/market-data/bhavcopy');
 let downloaded = 0;
 let skipped = 0;
 let empty = 0;
 for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
  if (!isWeekday(cursor)) continue;
  const file = path.join(ROOT, `${iso(cursor)}.json`);
  if (!force) {
   try {
    await fs.access(file);
    skipped += 1;
    continue;
   } catch (_) {}
  }
  let result;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
   try {
    result = await fetchDay(window, cursor);
    if (result.ok) break;
   } catch (error) {
    result = { ok: false, status: 0, text: error.message };
   }
   await new Promise(resolve => setTimeout(resolve, attempt * 1200));
  }
  if (!result?.ok) {
   console.error(`WARN ${iso(cursor)} HTTP ${result?.status || 0}: ${String(result?.text || '').slice(0, 160)}`);
   continue;
  }
  let payload;
  try {
   payload = JSON.parse(result.text);
  } catch (_) {
   console.error(`WARN ${iso(cursor)} returned non-JSON data`);
   continue;
  }
  if (!flattenRows(payload).length) {
   empty += 1;
   continue;
  }
  await fs.writeFile(file, JSON.stringify({ source: 'MCX', requestedDate: iso(cursor), downloadedAt: new Date().toISOString(), payload }));
  downloaded += 1;
  if (downloaded % 20 === 0) console.log(`MCX ${downloaded} dates downloaded through ${iso(cursor)}`);
  await new Promise(resolve => setTimeout(resolve, 120));
 }
 console.log(JSON.stringify({ ok: true, root: ROOT, downloaded, skipped, empty, from: iso(start), to: iso(end) }, null, 2));
 window.destroy();
}

app.whenReady().then(main).then(() => app.quit()).catch(error => {
 console.error(error);
 app.exit(1);
});
