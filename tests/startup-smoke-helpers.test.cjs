const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  getPackagedExecutableCandidates,
  buildSmokeLaunchCommand,
} = require('../scripts/startup-smoke-helpers.cjs');

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-smoke-helpers-'));
const releaseDir = path.join(fixtureRoot, 'release');
const unpackedExe = path.join(releaseDir, 'win-unpacked', 'Datell.exe');
const olderPortableExe = path.join(releaseDir, 'Datell-1.0.5-win-x64-portable.exe');
const newerPortableExe = path.join(releaseDir, 'Datell-1.0.6-win-x64-portable.exe');

fs.mkdirSync(path.dirname(unpackedExe), { recursive: true });
fs.writeFileSync(unpackedExe, '');
fs.writeFileSync(olderPortableExe, '');
fs.writeFileSync(newerPortableExe, '');

const olderTime = new Date('2026-05-12T10:00:00.000Z');
const newerTime = new Date('2026-05-12T10:00:10.000Z');
fs.utimesSync(olderPortableExe, olderTime, olderTime);
fs.utimesSync(newerPortableExe, newerTime, newerTime);

process.on('exit', () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

assert.deepEqual(
  getPackagedExecutableCandidates({
    platform: 'win32',
    arch: 'x64',
    releaseDir,
    productName: 'Datell',
  }),
  [newerPortableExe, olderPortableExe, unpackedExe],
  'Windows smoke should prefer the newest portable EXE before falling back to win-unpacked',
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
    args: ['-a', '/tmp/release/linux-unpacked/datell', '--startup-smoke-test', '--no-sandbox'],
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