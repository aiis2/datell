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
const mcpRoot = path.join(publishRoot, 'mcp');
const packageFile = path.join(mcpRoot, 'package.json');
const tsconfigFile = path.join(mcpRoot, 'tsconfig.json');
const entryFile = path.join(mcpRoot, 'src', 'index.ts');
const readmeFile = path.join(mcpRoot, 'README.md');

assert.equal(fs.existsSync(packageFile), true, 'mcp workspace should define a package.json');
assert.equal(fs.existsSync(tsconfigFile), true, 'mcp workspace should define a tsconfig');
assert.equal(fs.existsSync(entryFile), true, 'mcp workspace should define a TypeScript entry');
assert.equal(fs.existsSync(readmeFile), true, 'mcp workspace should define a README');

const pkg = readJson(packageFile);
assert.equal(pkg.name, '@datell/mcp', 'mcp workspace should publish under the reserved package name');
assert.notEqual(pkg.private, true, 'mcp workspace should no longer be marked private once it becomes runnable');
assert.equal(typeof pkg.bin, 'object', 'mcp workspace should expose a bin entry');
assert.equal(typeof pkg.scripts, 'object', 'mcp workspace should define build and smoke scripts');
assert.equal(typeof pkg.scripts.build, 'string', 'mcp workspace should expose a build script');
assert.equal(typeof pkg.scripts.start, 'string', 'mcp workspace should expose a start script');
assert.equal(typeof pkg.scripts.smoke, 'string', 'mcp workspace should expose a smoke script');

const source = readText(entryFile);
assert.match(source, /McpServer/, 'mcp workspace entry should create an MCP server');
assert.match(source, /StdioServerTransport/, 'mcp workspace entry should use stdio transport');
assert.match(source, /registerTool\(/, 'mcp workspace entry should register at least one tool');
assert.match(source, /datell_generate_chart/, 'mcp workspace entry should implement the datell_generate_chart tool');
assert.match(source, /writeFile|mkdir/, 'mcp workspace entry should be able to persist a generated HTML artifact');

const readme = readText(readmeFile);
assert.match(readme, /stdio/i, 'mcp README should document stdio transport');
assert.match(readme, /npm run smoke/i, 'mcp README should document a smoke command');

console.log('agentskills mcp runtime package ok');