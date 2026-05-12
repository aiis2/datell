const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  getPackagedExecutableCandidates,
  buildSmokeLaunchCommand,
} = require('./startup-smoke-helpers.cjs');

function findExistingExecutable(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        child.kill();
      } catch {
        // ignore kill failure during timeout cleanup
      }
      resolve({ exitCode: null, signal: 'SIGTERM', timedOut: true });
    }, timeoutMs);

    child.once('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.once('exit', (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, signal, timedOut: false });
    });
  });
}

function readSmokeStatus(markerFile) {
  if (!fs.existsSync(markerFile)) {
    return null;
  }

  const content = fs.readFileSync(markerFile, 'utf8');
  return JSON.parse(content);
}

async function main() {
  const repoRoot = process.cwd();
  const releaseDir = path.resolve(repoRoot, process.env.DATELL_SMOKE_RELEASE_DIR || 'release');
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const productName = packageJson.build?.productName || 'Datell';
  const markerFile = path.join(os.tmpdir(), `datell-startup-smoke-${Date.now()}-${process.pid}.json`);

  const executableCandidates = getPackagedExecutableCandidates({
    platform: process.platform,
    arch: process.arch,
    releaseDir,
    productName,
  });

  const executablePath = findExistingExecutable(executableCandidates);
  if (!executablePath) {
    throw new Error(`No packaged executable found. Checked:\n- ${executableCandidates.join('\n- ')}`);
  }

  const { command, args } = buildSmokeLaunchCommand({
    platform: process.platform,
    executablePath,
  });

  console.log(`Packaged startup smoke launching: ${command} ${args.join(' ')}`);

  const child = spawn(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATELL_STARTUP_SMOKE: '1',
      DATELL_STARTUP_SMOKE_FILE: markerFile,
      ELECTRON_ENABLE_LOGGING: '1',
      ELECTRON_ENABLE_STACK_DUMPING: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  if (child.stdout) {
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  }
  if (child.stderr) {
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  }

  const result = await waitForExit(child, 30000);
  const smokeStatus = readSmokeStatus(markerFile);

  try {
    fs.rmSync(markerFile, { force: true });
  } catch {
    // ignore cleanup failure
  }

  if (result.timedOut) {
    throw new Error('packaged app did not finish startup smoke within 30 seconds');
  }

  if (!smokeStatus) {
    throw new Error(`startup smoke marker file was not written (exit=${result.exitCode}, signal=${result.signal ?? 'none'})`);
  }

  if (smokeStatus.status !== 'ready') {
    throw new Error(`startup smoke reported failure: ${smokeStatus.detail}`);
  }

  if (result.exitCode !== 0) {
    throw new Error(`packaged app exited with code ${result.exitCode} after reporting ${smokeStatus.status}`);
  }

  console.log(`Packaged startup smoke passed: ${smokeStatus.detail}`);
}

main().catch((error) => {
  console.error(`Packaged startup smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});