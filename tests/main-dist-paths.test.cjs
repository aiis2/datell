require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  findRendererDistRoot,
  getDistRootCandidates,
} = require('../src/main/distAssetPaths.ts');

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-dist-root-'));
const appRoot = path.join(fixtureRoot, 'app.asar');
const distRoot = path.join(appRoot, 'dist');
const flatMainDir = path.join(appRoot, 'dist-electron');
const nestedMainDir = path.join(appRoot, 'dist-electron', 'main');
const wrongNestedDistRoot = path.join(appRoot, 'dist-electron', 'dist');

fs.mkdirSync(distRoot, { recursive: true });
fs.mkdirSync(flatMainDir, { recursive: true });
fs.mkdirSync(nestedMainDir, { recursive: true });
fs.mkdirSync(wrongNestedDistRoot, { recursive: true });
fs.writeFileSync(path.join(distRoot, 'index.html'), '<!doctype html>', 'utf8');

assert.deepEqual(
  getDistRootCandidates(appRoot, flatMainDir),
  [
    distRoot,
    path.join(flatMainDir, '../dist'),
    path.join(flatMainDir, '../../dist'),
  ],
  'flat Electron entry should still prefer the app root dist directory first',
);

assert.equal(
  findRendererDistRoot(appRoot, flatMainDir),
  distRoot,
  'flat Electron entry should resolve renderer assets from the app root dist directory',
);

assert.deepEqual(
  getDistRootCandidates(appRoot, nestedMainDir),
  [
    distRoot,
    wrongNestedDistRoot,
    distRoot,
  ],
  'nested Electron entry should include the app root dist directory before the broken dist-electron/dist fallback',
);

assert.equal(
  findRendererDistRoot(appRoot, nestedMainDir),
  distRoot,
  'nested Electron entry should resolve renderer assets from the real app root dist directory instead of dist-electron/dist',
);

fs.rmSync(fixtureRoot, { recursive: true, force: true });

console.log('main dist path resolution ok');