const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.join(__dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'),
);
const workflow = fs.readFileSync(
  path.join(workspaceRoot, '.github', 'workflows', 'build-linux.yml'),
  'utf8',
);

assert.deepEqual(
  packageJson.build?.linux?.target,
  ['AppImage', 'deb'],
  'Linux packaging should build both AppImage and deb artifacts so workflow uploads match actual outputs',
);

assert.match(
  workflow,
  /release\/\*\.deb/,
  'Linux workflow should upload deb artifacts when they are produced',
);

console.log('linux release targets ok');