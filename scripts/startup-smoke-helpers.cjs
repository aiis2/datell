const fs = require('node:fs');
const path = require('node:path');

function getWindowsPortableCandidates(releaseDir, productName) {
  if (!fs.existsSync(releaseDir)) {
    return [];
  }

  const portableSuffix = '-portable.exe';
  const portablePrefix = `${productName.toLowerCase()}-`;

  return fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase().startsWith(portablePrefix) && name.toLowerCase().endsWith(portableSuffix))
    .map((name) => {
      const candidatePath = path.join(releaseDir, name);
      return {
        path: candidatePath,
        mtimeMs: fs.statSync(candidatePath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .map((entry) => entry.path);
}

function getPackagedExecutableCandidates({ platform, arch, releaseDir, productName }) {
  if (platform === 'win32') {
    return [
      ...getWindowsPortableCandidates(releaseDir, productName),
      path.join(releaseDir, 'win-unpacked', `${productName}.exe`),
    ];
  }

  if (platform === 'darwin') {
    const preferredDir = arch === 'arm64' ? 'mac-arm64' : 'mac';
    const fallbackDir = preferredDir === 'mac' ? 'mac-arm64' : 'mac';

    return [
      path.join(releaseDir, preferredDir, `${productName}.app`, 'Contents', 'MacOS', productName),
      path.join(releaseDir, fallbackDir, `${productName}.app`, 'Contents', 'MacOS', productName),
    ].filter((candidate, index, bucket) => bucket.indexOf(candidate) === index);
  }

  if (platform === 'linux') {
    return [
      path.join(releaseDir, 'linux-unpacked', productName),
      path.join(releaseDir, 'linux-unpacked', productName.toLowerCase()),
    ];
  }

  throw new Error(`Unsupported platform for startup smoke: ${platform}`);
}

function buildSmokeLaunchCommand({ platform, executablePath }) {
  if (platform === 'linux') {
    return {
      command: 'xvfb-run',
      args: ['-a', executablePath, '--startup-smoke-test', '--no-sandbox'],
    };
  }

  return {
    command: executablePath,
    args: ['--startup-smoke-test'],
  };
}

module.exports = {
  getPackagedExecutableCandidates,
  buildSmokeLaunchCommand,
};