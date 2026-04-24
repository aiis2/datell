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
const skillDir = path.join(publishRoot, 'skills', 'datell-visual-report-preview');
const skillFile = path.join(skillDir, 'SKILL.md');
const evalsFile = path.join(skillDir, 'evals', 'evals.json');
const referenceFile = path.join(skillDir, 'references', 'visual-report-pattern.md');
const readmeFile = path.join(publishRoot, 'README.md');
const marketplaceFile = path.join(publishRoot, '.claude-plugin', 'marketplace.json');

assert.equal(fs.existsSync(skillDir), true, 'publishable Agent Skills directory should exist');
assert.equal(fs.existsSync(skillFile), true, 'publishable SKILL.md should exist');
assert.equal(fs.existsSync(evalsFile), true, 'publishable evals should exist');
assert.equal(fs.existsSync(referenceFile), true, 'publishable reference guide should exist');
assert.equal(fs.existsSync(readmeFile), true, 'publishable README should exist');
assert.equal(fs.existsSync(marketplaceFile), true, 'compatibility marketplace manifest should exist');

const skillMarkdown = readText(skillFile);
const frontmatter = extractFrontmatter(skillMarkdown);
const skillName = extractScalar(frontmatter, 'name');
const skillDescription = extractScalar(frontmatter, 'description');

assert.equal(skillName, 'datell-visual-report-preview', 'skill name should match the Agent Skills directory name');
assert.match(skillDescription, /visual report/i, 'description should clearly advertise visual report output');
assert.match(skillMarkdown, /HTML/i, 'skill body should guide the agent to output HTML reports');
assert.match(skillMarkdown, /datell_generate_chart/, 'merged skill should prefer the Track B MCP tool when it is available');
assert.match(skillMarkdown, /fallback|fall back/i, 'merged skill should explicitly describe the Track A fallback path');
assert.match(skillMarkdown, /references\/visual-report-pattern\.md/, 'SKILL.md should point to the bundled reference file');

const evals = JSON.parse(readText(evalsFile));
assert.equal(evals.skill_name, 'datell-visual-report-preview');
assert.ok(Array.isArray(evals.evals) && evals.evals.length > 0, 'publishable evals should contain at least one case');

const readme = readText(readmeFile);
assert.match(readme, /npx skills add/i, 'README should document the skills.sh install command');
assert.match(readme, /datell-visual-report-preview/, 'README should mention the tracked publishable skill');

const marketplace = JSON.parse(readText(marketplaceFile));
assert.equal(Array.isArray(marketplace.plugins), true, 'marketplace manifest should expose a plugins array');
assert.equal(marketplace.plugins.length, 1, 'marketplace manifest should publish a single installable skill after Track A and Track B are merged');
const visualReportPlugin = marketplace.plugins.find((plugin) => plugin.name === 'datell-visual-report-preview');
assert.ok(visualReportPlugin, 'marketplace manifest should keep publishing the scoped visual report skill');
assert.deepEqual(visualReportPlugin.skills, ['./skills/datell-visual-report-preview']);

console.log('agentskills publish layout ok');