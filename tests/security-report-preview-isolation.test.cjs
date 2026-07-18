const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', jsx: 'react-jsx' },
});

const {
  REPORT_SHELL_ORIGIN,
  isLayoutInspectionPayload,
  isTrustedShellMessage,
  resolveShellUrl,
} = require('../src/renderer/utils/reportShellBridge.ts');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const mainSource = read('src/main/main.ts');
const previewSource = read('src/renderer/components/ReportPreview.tsx');
const bridgeSource = read('src/renderer/utils/reportShellBridge.ts');
const shellSource = read('public/report-shell.html');
const preloadSource = read('src/main/preload.ts');

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(
  /scheme:\s*['"]report['"]/.test(mainSource) && /protocol\.handle\(['"]report['"]/.test(mainSource),
  'main process must register and serve a dedicated report protocol',
);
check(
  /REPORT_SHELL_ORIGIN\s*=\s*['"]report:\/\/localhost['"]/.test(bridgeSource),
  'renderer bridge must define the unprivileged report origin',
);
check(
  /\$\{REPORT_SHELL_ORIGIN\}\/report-shell\.html/.test(bridgeSource),
  'report shell URL must not share the privileged renderer origin',
);
check(
  /e\.source\s*!==\s*shellRef\.current\?\.contentWindow|event\.source\s*===\s*expectedSource/.test(previewSource + bridgeSource),
  'renderer must reject messages not sent by the active shell window',
);
check(
  /e\.origin\s*!==\s*REPORT_SHELL_ORIGIN|event\.origin\s*===\s*REPORT_SHELL_ORIGIN/.test(previewSource + bridgeSource),
  'renderer must reject messages from the wrong origin',
);
check(
  !/shellRef\.current\??\.contentDocument/.test(previewSource),
  'renderer must not inspect the cross-origin shell document directly',
);
check(
  !/shellRef\.current(?:\?|)\.contentWindow\??\.postMessage\([\s\S]{0,220}?,\s*['"]\*['"]\)/.test(previewSource),
  'renderer-to-shell commands must use the exact report target origin',
);
check(
  /e\.source\s*!==\s*window\.parent/.test(shellSource) && /e\.origin\s*!==\s*parentOrigin/.test(shellSource),
  'shell must authenticate parent commands by source and origin',
);
check(
  /e\.source\s*!==\s*frame\.contentWindow/.test(shellSource),
  'shell must accept inner-frame events only from the active report frame',
);
check(
  /type:\s*['"]inspect-layout['"]/.test(bridgeSource) && /type:\s*['"]layout-inspection['"]/.test(bridgeSource),
  'layout editing must use a serialized request/response contract',
);
check(
  /sandbox="allow-scripts allow-same-origin"/.test(shellSource) && /<script[\s>]/i.test(shellSource),
  'interactive report scripts must remain supported inside the unprivileged origin',
);
check(
  /contextBridge\.exposeInMainWorld\(['"]electronAPI['"]/.test(preloadSource),
  'test premise requires a privileged API exposed only in the top renderer',
);

assert.equal(
  failures.length,
  0,
  `report preview isolation requirements not met:\n- ${failures.join('\n- ')}`,
);

assert.equal(REPORT_SHELL_ORIGIN, 'report://localhost');
assert.equal(
  resolveShellUrl('app://localhost'),
  'report://localhost/report-shell.html?parentOrigin=app%3A%2F%2Flocalhost',
  'packaged renderer must target the separate report origin and declare its parent origin',
);
assert.equal(
  resolveShellUrl('http://localhost:5173'),
  'report://localhost/report-shell.html?parentOrigin=http%3A%2F%2Flocalhost%3A5173',
  'development renderer must use the same isolated report protocol',
);

const expectedSource = {};
assert.equal(
  isTrustedShellMessage({ source: expectedSource, origin: REPORT_SHELL_ORIGIN }, expectedSource),
  true,
  'matching shell window and origin should be accepted',
);
assert.equal(
  isTrustedShellMessage({ source: {}, origin: REPORT_SHELL_ORIGIN }, expectedSource),
  false,
  'wrong shell window should be rejected',
);
assert.equal(
  isTrustedShellMessage({ source: expectedSource, origin: 'app://localhost' }, expectedSource),
  false,
  'privileged renderer origin must not be accepted as a shell event origin',
);

const layoutPayload = {
  type: 'layout-inspection',
  requestId: 'request-1',
  cards: [{
    cardId: 'chart-1',
    label: 'Chart',
    type: 'chart',
    colStart: -1,
    colSpan: 1,
    rowSpan: 'auto',
    minHeight: 200,
  }],
  gridColumns: 2,
};
assert.equal(isLayoutInspectionPayload(layoutPayload), true, 'valid layout snapshots should be accepted');
assert.equal(
  isLayoutInspectionPayload({ ...layoutPayload, gridColumns: 100 }),
  false,
  'out-of-range layout snapshots should be rejected',
);

console.log('security report preview isolation ok');
