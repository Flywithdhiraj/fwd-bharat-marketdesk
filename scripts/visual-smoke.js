'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = relativePath => fs.existsSync(path.join(root, relativePath));

function assert(condition, message) {
 if (!condition) {
  throw new Error(message);
 }
}

function refsFromHtml(html, attr) {
 const pattern = new RegExp(`${attr}="([^"]+)"`, 'g');
 return Array.from(html.matchAll(pattern)).map(match => match[1]).filter(value => !value.startsWith('http'));
}

function assertReferencedAssetsExist() {
 const html = read('src/renderer/index.html');
 const scripts = refsFromHtml(html, 'src').filter(value => value.endsWith('.js'));
 const links = refsFromHtml(html, 'href').filter(value => value.endsWith('.css') || value.endsWith('.ico') || value.endsWith('.png'));
 scripts.forEach(script => assert(exists(`src/renderer/${script}`), `Missing script referenced by index.html: ${script}`));
 links.forEach(link => assert(exists(`src/renderer/${link}`), `Missing asset referenced by index.html: ${link}`));
}

function assertUniqueShellIds() {
 const html = read('src/renderer/index.html');
 const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g)).map(match => match[1]);
 const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
 assert(!duplicates.length, `Duplicate shell id(s): ${Array.from(new Set(duplicates)).join(', ')}`);
}

function assertCriticalSurfaces() {
 const html = read('src/renderer/index.html');
 const options = read('src/renderer/scripts/popup/08-options-workspace.js');
 const panes = read('src/renderer/scripts/popup/06-pane-templates.js');
 const styles = read('src/renderer/styles.css');
 const hardening = read('src/renderer/styles/09-design-system-hardening.css');

 [
  'pane-options',
  'pane-chart',
  'pane-strategies',
  'pane-debug',
  'commandPaletteOverlay',
  'appLockOverlay',
 ].forEach(id => assert(html.includes(`id="${id}"`), `Missing critical shell id: ${id}`));

 assert(html.includes('scripts/shared/ui-events.js'), 'Shared UI event helper is not loaded before feature modules.');
 assert(options.includes('renderWorkflowStrip'), 'Options workflow strip render function is missing.');
 assert(options.includes('od-workflow-strip'), 'Options workflow strip markup is missing.');
 assert(panes.includes('btnExportReleaseDiagnostics'), 'Debug pane diagnostics export action is missing.');
 assert(styles.includes("styles/09-design-system-hardening.css"), 'Design-system hardening stylesheet is not imported.');
 assert(hardening.includes('.od-workflow-strip'), 'Options workflow CSS is missing.');
 assert(hardening.includes('.diagnostics-export-card'), 'Diagnostics export CSS is missing.');
}

function assertRendererPartsExist() {
 const partGroups = [
  'src/renderer/scripts/popup/parts/v16-capabilities',
  'src/renderer/scripts/popup/parts/chart-workspace',
  'src/renderer/scripts/popup/parts/options-workspace',
 ];
 partGroups.forEach(group => {
  const absolute = path.join(root, group);
  assert(fs.existsSync(absolute), `Missing renderer part group: ${group}`);
  const parts = fs.readdirSync(absolute).filter(name => name.endsWith('.jsfrag'));
  assert(parts.length >= 5, `Renderer part group has too few parts: ${group}`);
 });
}

function assertNoBrokenImports() {
 const styles = read('src/renderer/styles.css');
 const cssImports = Array.from(styles.matchAll(/@import url\('([^']+)'\);/g)).map(match => match[1]);
 cssImports.forEach(cssPath => assert(exists(`src/renderer/${cssPath}`), `Missing CSS import: ${cssPath}`));
}

function main() {
 assertReferencedAssetsExist();
 assertNoBrokenImports();
 assertUniqueShellIds();
 assertCriticalSurfaces();
 assertRendererPartsExist();
 console.log('Visual smoke checks passed.');
}

main();
