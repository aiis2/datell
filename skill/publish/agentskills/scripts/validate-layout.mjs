import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const skillDir = path.join(repoRoot, 'skills', 'datell-visual-report-preview');
const requiredPaths = [
  path.join(repoRoot, 'README.md'),
  path.join(repoRoot, 'CHANGELOG.md'),
  path.join(repoRoot, 'CONTRIBUTING.md'),
  path.join(repoRoot, 'SECURITY.md'),
  path.join(repoRoot, 'LICENSE'),
  path.join(repoRoot, '.gitignore'),
  path.join(repoRoot, '.claude-plugin', 'marketplace.json'),
  path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'SKILL.md'),
  path.join(repoRoot, 'skills', 'frontend-design-report', 'SKILL.md'),
  path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'evals', 'evals.json'),
  path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'references', 'datell-knowledge-index.md'),
  path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'references', 'datell-layout-catalog.md'),
  path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'references', 'datell-palette-catalog.md'),
  path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'references', 'datell-card-catalog.md'),
  path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'references', 'visual-report-pattern.md'),
  path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'references', 'datell-design-system-playbook.md'),
  path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'references', 'datell-chart-engine-playbook.md'),
  path.join(repoRoot, 'mcp', 'package.json'),
  path.join(repoRoot, 'mcp', 'README.md'),
  path.join(repoRoot, 'mcp', 'tsconfig.json'),
  path.join(repoRoot, 'mcp', 'src', 'index.ts')
];

for (const requiredPath of requiredPaths) {
  assert.equal(fs.existsSync(requiredPath), true, `missing required path: ${path.relative(repoRoot, requiredPath)}`);
}

const readme = await readFile(path.join(repoRoot, 'README.md'), 'utf8');
assert.match(readme, /Support Policy/i, 'README.md should include a support policy section');
assert.match(readme, /npm run validate/i, 'README.md should document local validation');
assert.match(readme, /frontend-design-report/i, 'README.md should surface the repository-name alias');

const marketplace = JSON.parse(await readFile(path.join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
assert.equal(Array.isArray(marketplace.plugins), true, 'marketplace.json should define plugins');
assert.equal(marketplace.plugins.length, 2, 'marketplace.json should define the primary skill plus the repository-name alias');
assert.deepEqual(
  marketplace.plugins.map((plugin) => plugin.name).sort(),
  ['datell-visual-report-preview', 'frontend-design-report'],
  'marketplace.json should expose the primary skill and the alias skill names'
);
assert.deepEqual(
  marketplace.plugins.map((plugin) => plugin.skills[0]).sort(),
  ['./skills/datell-visual-report-preview', './skills/frontend-design-report'],
  'marketplace.json should point each plugin to its matching skill directory'
);

const skillMarkdown = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
assert.match(skillMarkdown, /datell_generate_chart/, 'SKILL.md should still document the MCP-first runtime');
assert.match(skillMarkdown, /fallback|fall back/i, 'SKILL.md should still document the standalone fallback');
assert.match(skillMarkdown, /frontend-design-report/i, 'primary SKILL.md should mention the repository-name alias');

const aliasSkillMarkdown = await readFile(path.join(repoRoot, 'skills', 'frontend-design-report', 'SKILL.md'), 'utf8');
assert.match(aliasSkillMarkdown, /^name:\s*frontend-design-report$/m, 'alias SKILL.md should declare the repository-name alias');
assert.match(aliasSkillMarkdown, /datell_generate_chart/, 'alias SKILL.md should keep the MCP-first runtime contract');
assert.match(aliasSkillMarkdown, /fallback|fall back|standalone/i, 'alias SKILL.md should document the standalone fallback');

console.log('layout validation ok');