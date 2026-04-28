require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { installSkillFromUrl } = require('../src/main/skillsInstallFromUrl.ts');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-install-from-url-'));
const dataDir = path.join(tmpRoot, 'datellData');

const publishRoot = path.join(__dirname, '..', 'skill', 'publish', 'agentskills');
const marketplaceRaw = fs.readFileSync(path.join(publishRoot, '.claude-plugin', 'marketplace.json'), 'utf8');
const skillMdRaw = fs.readFileSync(path.join(publishRoot, 'skills', 'datell-visual-report-preview', 'SKILL.md'), 'utf8');

const responses = new Map([
  ['https://raw.githubusercontent.com/example/datell-skills/main/.claude-plugin/marketplace.json', marketplaceRaw],
  ['https://raw.githubusercontent.com/example/datell-skills/main/skills/datell-visual-report-preview/SKILL.md', skillMdRaw],
]);

async function fakeFetchContent(fetchUrl) {
  return responses.get(fetchUrl) ?? null;
}

(async () => {
  const result = await installSkillFromUrl('https://github.com/example/datell-skills#datell-visual-report-preview', {
    dataDir,
    fetchContent: fakeFetchContent,
  });

  assert.equal(result.ok, true, 'GitHub marketplace install should succeed for the publishable skill');
  assert.equal(result.name, 'datell-visual-report-preview');
  assert.equal(result.toolCount, 1, 'compatibility install should produce a single instructions tool');

  const skillsDir = path.join(dataDir, 'skills');
  const files = fs.readdirSync(skillsDir).filter((entry) => entry.endsWith('.json'));
  assert.equal(files.length, 1, 'install should persist exactly one external skill manifest');

  const installed = JSON.parse(fs.readFileSync(path.join(skillsDir, files[0]), 'utf8'));
  assert.equal(installed.name, 'datell-visual-report-preview');
  assert.equal(installed.tools.length, 1);
  assert.equal(installed.tools[0].name, 'datell_visual_report_preview_instructions');
  assert.match(installed.tools[0].code, /Datell Knowledge Base|datell-knowledge-index/i, 'installed instructions tool should expose the markdown knowledge base');
  assert.match(installed.tools[0].code, /non-interactive standalone HTML report|Do not use filter controls|cross-card linkage/i, 'installed instructions tool should preserve the no-MCP static basic-report contract');

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log('skills install from url ok');
})().catch((error) => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
});