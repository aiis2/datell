const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
};
const mainSource = read('src/main/main.ts');
const storeSource = read('src/main/exportDocumentStore.ts');

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(/scheme:\s*['"]export['"]/.test(mainSource), 'main must register a dedicated export scheme');
check(/protocol\.handle\(['"]export['"]/.test(mainSource) || /\.protocol\.handle\(['"]export['"]/.test(mainSource), 'main must install an export protocol handler');
check(/createExportDocumentJob/.test(mainSource), 'all export handlers must use the in-memory export document job');
check(/session\.fromPartition/.test(mainSource), 'each export must use a non-persistent session');
check(/sandbox:\s*true/.test(mainSource), 'export windows must explicitly enable Chromium sandboxing');
check(/webSecurity:\s*true/.test(mainSource), 'export windows must explicitly enable web security');
check(/nodeIntegration:\s*false/.test(mainSource), 'export windows must disable Node integration');
check(/setWindowOpenHandler/.test(mainSource), 'export windows must deny child windows');
check(/will-navigate/.test(mainSource), 'export windows must restrict top-level navigation');
check(/will-frame-navigate/.test(mainSource), 'export windows must restrict frame navigation');
check(/setPermission(Check|Request)Handler/.test(mainSource), 'export sessions must deny permission requests');
check(/onBeforeRequest/.test(mainSource), 'export sessions must enforce a request allowlist');
check(/connect-src\s+'none'/.test(storeSource), 'export documents must deny arbitrary network connections');
check(/file:\/\//.test(storeSource), 'export policy must explicitly account for file URLs');
check(!/fs\.writeFileSync\(tmpPath[\s\S]{0,180}loadFile\(tmpPath/.test(mainSource), 'transient export HTML must not be written then loaded with file://');
check(!/await hiddenWin\.loadFile\(tmpPath\)/.test(mainSource), 'PDF/PNG/Excel hidden windows must use loadURL on export origin');

assert.equal(
  failures.length,
  0,
  `export origin isolation requirements not met:\n- ${failures.join('\n- ')}`,
);

console.log('security export origin isolation structure ok');
