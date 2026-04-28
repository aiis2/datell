const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.join(__dirname, '..');
const publishRoot = path.join(workspaceRoot, 'skill', 'publish', 'agentskills');
const readmeFile = path.join(publishRoot, 'README.md');
const internalChecklistFile = path.join(publishRoot, 'STANDALONE-REPO-CHECKLIST.md');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function collectFiles(dirPath, bucket = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, bucket);
      continue;
    }
    if (/\.(md|json|mjs|ts|js|yml|yaml)$/i.test(entry.name)) {
      bucket.push(fullPath);
    }
  }
  return bucket;
}

const readme = readText(readmeFile);

assert.match(
  readme,
  /npx skills add aiis2\/frontend-design-report --skill datell-visual-report-preview/i,
  'public README should show the real community install command for the target repository',
);
assert.doesNotMatch(
  readme,
  /node tests\/skills-install-from-url\.test\.cjs/i,
  'public README should not reference root-only smoke tests that do not exist in the published repository',
);
assert.equal(
  fs.existsSync(internalChecklistFile),
  false,
  'public repository should not ship the internal standalone extraction checklist',
);

for (const filePath of collectFiles(publishRoot)) {
  const source = readText(filePath);
  assert.doesNotMatch(
    source,
    /[\u4e00-\u9fff]/,
    `published skill files should stay English-only: ${path.relative(workspaceRoot, filePath)}`,
  );
}

console.log('agentskills public release readiness ok');