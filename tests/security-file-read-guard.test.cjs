require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createTextFileReadGuard } = require('../src/main/fileReadGuard.ts');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-read-guard-'));
const dataDir = path.join(root, 'data');
const pickedDir = path.join(root, 'picked');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(pickedDir, { recursive: true });

const pickedFile = path.join(pickedDir, 'chosen.md');
const siblingFile = path.join(pickedDir, 'sibling.md');
const dataFile = path.join(dataDir, 'config.json');
const outsideDir = path.join(root, 'outside');
const outsideFile = path.join(outsideDir, 'outside-secret.txt');
fs.writeFileSync(pickedFile, 'chosen', 'utf8');
fs.writeFileSync(siblingFile, 'sibling', 'utf8');
fs.writeFileSync(dataFile, '{}', 'utf8');
fs.mkdirSync(outsideDir, { recursive: true });
fs.writeFileSync(outsideFile, 'outside-secret', 'utf8');

const guard = createTextFileReadGuard(dataDir);

assert.equal(guard.canReadTextFile(pickedFile), false, 'renderer should not read arbitrary files before explicit selection');
guard.rememberSelectedFile(pickedFile);
assert.equal(guard.canReadTextFile(pickedFile), true, 'explicitly selected files should be readable');
assert.equal(fs.readFileSync(pickedFile, 'utf8'), 'chosen', 'approved file contents should round-trip exactly');
assert.equal(guard.canReadTextFile(siblingFile), false, 'selecting one file should not authorize its siblings');
assert.equal(fs.readFileSync(siblingFile, 'utf8'), 'sibling', 'rejected sibling access must not mutate its contents');
assert.equal(guard.canReadTextFile(dataFile), true, 'app data directory files should remain readable');
assert.equal(guard.canReadTextFile(path.join(root, 'missing.md')), false, 'missing files should not be authorized');

const linkedOutsideDir = path.join(dataDir, 'linked-outside');
try {
  fs.symlinkSync(outsideDir, linkedOutsideDir, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(
    guard.canReadTextFile(path.join(linkedOutsideDir, path.basename(outsideFile))),
    false,
    'links inside the data directory must not authorize files outside its canonical tree',
  );
} catch (error) {
  if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) throw error;
  console.warn(`security file read guard link test skipped: ${error.code}`);
}

fs.rmSync(root, { recursive: true, force: true });

console.log('security file read guard ok');
