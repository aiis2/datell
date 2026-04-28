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

const marketplace = JSON.parse(await readFile(path.join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
assert.equal(Array.isArray(marketplace.plugins), true, 'marketplace.json should define plugins');
assert.equal(marketplace.plugins.length, 1, 'marketplace.json should keep a single installable skill');
assert.equal(marketplace.plugins[0].name, 'datell-visual-report-preview', 'installable skill name should stay scoped');
assert.deepEqual(marketplace.plugins[0].skills, ['./skills/datell-visual-report-preview']);

const skillMarkdown = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
assert.match(skillMarkdown, /datell_generate_chart/, 'SKILL.md should still document the MCP-first runtime');
assert.match(skillMarkdown, /fallback|fall back/i, 'SKILL.md should still document the standalone fallback');

console.log('layout validation ok');