const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  /report:\/\/localhost\/report-shell\.html/.test(bridgeSource),
  'report shell URL must not share the privileged renderer origin',
);
check(
  /e\.source\s*!==\s*shellRef\.current\?\.contentWindow|event\.source\s*!==\s*expectedSource/.test(previewSource),
  'renderer must reject messages not sent by the active shell window',
);
check(
  /e\.origin\s*!==\s*REPORT_SHELL_ORIGIN|event\.origin\s*!==\s*expectedOrigin/.test(previewSource),
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

console.log('security report preview isolation ok');
