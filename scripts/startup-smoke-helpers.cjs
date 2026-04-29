const path = require('node:path');

function getPackagedExecutableCandidates({ platform, arch, releaseDir, productName }) {
  if (platform === 'win32') {
    return [path.join(releaseDir, 'win-unpacked', `${productName}.exe`)];
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