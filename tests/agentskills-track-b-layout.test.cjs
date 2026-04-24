const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown);
  assert.ok(match, 'SKILL.md should start with YAML frontmatter');
  return match[1];
}

function extractScalar(frontmatter, key) {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(frontmatter);
  assert.ok(match, `frontmatter should include ${key}`);
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

const publishRoot = path.join(__dirname, '..', 'skill', 'publish', 'agentskills');
const skillDir = path.join(publishRoot, 'skills', 'datell-mcp');
const mcpPackageFile = path.join(publishRoot, 'mcp', 'package.json');
const mcpReadmeFile = path.join(publishRoot, 'mcp', 'README.md');
const mcpEntryFile = path.join(publishRoot, 'mcp', 'src', 'index.ts');
const marketplaceFile = path.join(publishRoot, '.claude-plugin', 'marketplace.json');
const repoReadmeFile = path.join(publishRoot, 'README.md');

assert.equal(fs.existsSync(skillDir), false, 'after the merge there should no longer be a separate Track B installable skill directory');
assert.equal(fs.existsSync(mcpPackageFile), true, 'Track B mcp package skeleton should exist');
assert.equal(fs.existsSync(mcpReadmeFile), true, 'Track B mcp README should exist');
assert.equal(fs.existsSync(mcpEntryFile), true, 'Track B mcp entry skeleton should exist');

const mcpPackage = JSON.parse(readText(mcpPackageFile));
assert.equal(mcpPackage.name, '@datell/mcp', 'Track B mcp package should reserve the @datell/mcp package name');

const mcpReadme = readText(mcpReadmeFile);
assert.match(mcpReadme, /datell_generate_chart/, 'Track B mcp README should document the visual report runtime tool');
assert.doesNotMatch(mcpReadme, /\bdatell_rag\b|knowledge-base|knowledge base|\bmemory\b/i, 'Track B mcp README should remain scoped to visual report runtime only');
assert.match(mcpReadme, /datell-visual-report-preview/, 'Track B mcp README should point agents to the single merged installable skill');

const mcpEntry = readText(mcpEntryFile);
assert.match(mcpEntry, /datell_generate_chart/, 'Track B mcp entry should declare the visual report tool name');
assert.doesNotMatch(mcpEntry, /\bdatell_rag\b|knowledge-base|knowledge base|\bmemory\b/i, 'Track B mcp entry should not declare knowledge or memory tools in this phase');

const marketplace = JSON.parse(readText(marketplaceFile));
const datellMcpPlugin = (marketplace.plugins || []).find((plugin) => plugin.name === 'datell-mcp');
assert.equal(datellMcpPlugin, undefined, 'compatibility marketplace should not publish a second Track B skill after the merge');

const repoReadme = readText(repoReadmeFile);
assert.match(repoReadme, /single installable skill|merged skill|prefer MCP/i, 'publish README should explain that the install surface is now unified');
assert.match(repoReadme, /visual report/i, 'publish README should clarify that the merged runtime remains limited to visual report scope');

console.log('agentskills track b layout ok');