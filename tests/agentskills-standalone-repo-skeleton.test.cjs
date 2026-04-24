const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const publishRoot = path.join(__dirname, '..', 'skill', 'publish', 'agentskills');
const packageFile = path.join(publishRoot, 'package.json');
const readmeFile = path.join(publishRoot, 'README.md');
const changelogFile = path.join(publishRoot, 'CHANGELOG.md');
const contributingFile = path.join(publishRoot, 'CONTRIBUTING.md');
const securityFile = path.join(publishRoot, 'SECURITY.md');
const licenseFile = path.join(publishRoot, 'LICENSE');
const gitignoreFile = path.join(publishRoot, '.gitignore');
const validateJsonFile = path.join(publishRoot, 'scripts', 'validate-json.mjs');
const validateLayoutFile = path.join(publishRoot, 'scripts', 'validate-layout.mjs');
const validateEvalsFile = path.join(publishRoot, 'scripts', 'validate-evals.mjs');

assert.equal(fs.existsSync(packageFile), true, 'standalone publish repo should define a root package.json');
assert.equal(fs.existsSync(readmeFile), true, 'standalone publish repo should keep a root README');
assert.equal(fs.existsSync(changelogFile), true, 'standalone publish repo should define a CHANGELOG');
assert.equal(fs.existsSync(contributingFile), true, 'standalone publish repo should define CONTRIBUTING guidelines');
assert.equal(fs.existsSync(securityFile), true, 'standalone publish repo should define a SECURITY policy');
assert.equal(fs.existsSync(licenseFile), true, 'standalone publish repo should define a LICENSE file');
assert.equal(fs.existsSync(gitignoreFile), true, 'standalone publish repo should define a .gitignore');
assert.equal(fs.existsSync(validateJsonFile), true, 'standalone publish repo should ship a JSON validation script');
assert.equal(fs.existsSync(validateLayoutFile), true, 'standalone publish repo should ship a layout validation script');
assert.equal(fs.existsSync(validateEvalsFile), true, 'standalone publish repo should ship an eval validation script');

const pkg = readJson(packageFile);
assert.equal(pkg.name, 'datell-skills', 'standalone publish repo package name should align with marketplace identity');
assert.equal(pkg.private, true, 'standalone publish repo root package should stay private as a repository orchestrator');
assert.ok(Array.isArray(pkg.workspaces), 'standalone publish repo should declare workspaces');
assert.ok(pkg.workspaces.includes('mcp'), 'standalone publish repo should include the mcp workspace');
assert.equal(typeof pkg.scripts, 'object', 'standalone publish repo should define validation scripts');
assert.equal(typeof pkg.scripts.validate, 'string', 'standalone publish repo should expose a top-level validate script');
assert.equal(typeof pkg.scripts['validate:json'], 'string', 'standalone publish repo should expose validate:json');
assert.equal(typeof pkg.scripts['validate:layout'], 'string', 'standalone publish repo should expose validate:layout');
assert.equal(typeof pkg.scripts['validate:evals'], 'string', 'standalone publish repo should expose validate:evals');
assert.equal(typeof pkg.scripts['validate:mcp'], 'string', 'standalone publish repo should expose validate:mcp');

const readme = readText(readmeFile);
assert.match(readme, /support policy/i, 'standalone publish README should document a support policy');
assert.match(readme, /npm run validate/i, 'standalone publish README should document local validation');

console.log('agentskills standalone repo skeleton ok');