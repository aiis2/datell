const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
};
const mainSource = read('src/main/main.ts');
const runtimeSource = read('src/main/exportRuntime.ts');
const exportStoreSource = read('src/main/exportDocumentStore.ts');

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(/inlineBuiltInRuntimes/.test(mainSource), 'main export injector must delegate to the pure runtime transformer');
check(/readVendorJs\(['"]vtable\.min\.js['"]\)/.test(mainSource), 'main export injector must read packaged VTable');
check(/needsVTableRuntime/.test(mainSource + runtimeSource), 'VTable must be injected only when referenced');
check(/ipcMain\.handle\(['"]fs:exportExcel['"][\s\S]{0,500}createExportRenderer\(injectVendorLibs\(html\)/.test(mainSource), 'Excel must stage HTML after trusted runtime injection');
check(/CDN script replaced by packaged runtime/.test(runtimeSource), 'known CDN tags must be replaced with a deterministic marker');
check(/connect-src\s+'none'/.test(exportStoreSource), 'runtime compatibility must not relax export network policy');
check(!/https:\/\/cdn\.jsdelivr\.net/.test(exportStoreSource), 'runtime compatibility must not add a CDN request allowlist');

assert.equal(
  failures.length,
  0,
  `export runtime compatibility requirements not met:\n- ${failures.join('\n- ')}`,
);

console.log('export runtime compatibility structure ok');
