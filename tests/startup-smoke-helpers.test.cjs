const assert = require('node:assert/strict');
const path = require('node:path');

const {
  getPackagedExecutableCandidates,
  buildSmokeLaunchCommand,
} = require('../scripts/startup-smoke-helpers.cjs');

const releaseDir = path.join('C:', 'smoke-fixture', 'release');

assert.deepEqual(
  getPackagedExecutableCandidates({
    platform: 'win32',
    arch: 'x64',
    releaseDir,
    productName: 'Datell',
  }),
  [path.join(releaseDir, 'win-unpacked', 'Datell.exe')],
  'Windows smoke should target the unpacked EXE from the packaged release directory',
);

assert.deepEqual(
  getPackagedExecutableCandidates({
    platform: 'darwin',
    arch: 'arm64',
    releaseDir,
    productName: 'Datell',
  }),
  [
    path.join(releaseDir, 'mac-arm64', 'Datell.app', 'Contents', 'MacOS', 'Datell'),
    path.join(releaseDir, 'mac', 'Datell.app', 'Contents', 'MacOS', 'Datell'),
  ],
  'macOS smoke should prefer the app bundle matching the runner architecture',
);

assert.deepEqual(
  getPackagedExecutableCandidates({
    platform: 'linux',
    arch: 'x64',
    releaseDir,
    productName: 'Datell',
  }),
  [
    path.join(releaseDir, 'linux-unpacked', 'Datell'),
    path.join(releaseDir, 'linux-unpacked', 'datell'),
  ],
  'Linux smoke should target the unpacked executable names emitted by electron-builder',
);

assert.deepEqual(
  buildSmokeLaunchCommand({
    platform: 'linux',
    executablePath: '/tmp/release/linux-unpacked/datell',
  }),
  {
    command: 'xvfb-run',
    args: ['-a', '/tmp/release/linux-unpacked/datell', '--startup-smoke-test'],
  },
  'Linux smoke should launch the packaged app under xvfb-run',
);

assert.deepEqual(
  buildSmokeLaunchCommand({
    platform: 'win32',
    executablePath: 'C:/tmp/release/win-unpacked/Datell.exe',
  }),
  {
    command: 'C:/tmp/release/win-unpacked/Datell.exe',
    args: ['--startup-smoke-test'],
  },
  'Windows smoke should launch the unpacked EXE directly',
);

console.log('startup smoke helpers ok');