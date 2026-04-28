const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractMatches(pattern, text) {
  return Array.from(text.matchAll(pattern), (match) => match[1]);
}

const workspaceRoot = path.join(__dirname, '..');
const publishRoot = path.join(workspaceRoot, 'skill', 'publish', 'agentskills');
const skillDir = path.join(publishRoot, 'skills', 'datell-visual-report-preview');
const referencesDir = path.join(skillDir, 'references');

const knowledgeIndexFile = path.join(referencesDir, 'datell-knowledge-index.md');
const layoutCatalogFile = path.join(referencesDir, 'datell-layout-catalog.md');
const paletteCatalogFile = path.join(referencesDir, 'datell-palette-catalog.md');
const cardCatalogFile = path.join(referencesDir, 'datell-card-catalog.md');
const skillFile = path.join(skillDir, 'SKILL.md');
const designSystemFile = path.join(referencesDir, 'datell-design-system-playbook.md');
const patternFile = path.join(referencesDir, 'visual-report-pattern.md');

assert.equal(fs.existsSync(knowledgeIndexFile), true, 'a top-level Datell knowledge index should exist');
assert.equal(fs.existsSync(layoutCatalogFile), true, 'a Datell layout catalog markdown index should exist');
assert.equal(fs.existsSync(paletteCatalogFile), true, 'a Datell palette catalog markdown index should exist');
assert.equal(fs.existsSync(cardCatalogFile), true, 'a Datell card catalog markdown index should exist');

const knowledgeIndex = readText(knowledgeIndexFile);
const layoutCatalog = readText(layoutCatalogFile);
const paletteCatalog = readText(paletteCatalogFile);
const cardCatalog = readText(cardCatalogFile);
const skillMarkdown = readText(skillFile);
const designSystemMarkdown = readText(designSystemFile);
const patternMarkdown = readText(patternFile);

assert.match(knowledgeIndex, /datell-layout-catalog\.md/i, 'knowledge index should point to the layout catalog');
assert.match(knowledgeIndex, /datell-palette-catalog\.md/i, 'knowledge index should point to the palette catalog');
assert.match(knowledgeIndex, /datell-card-catalog\.md/i, 'knowledge index should point to the card catalog');

assert.match(skillMarkdown, /references\/datell-knowledge-index\.md/i, 'SKILL.md should point agents to the Datell knowledge index');
assert.match(designSystemMarkdown, /datell-layout-catalog\.md|datell-palette-catalog\.md|datell-card-catalog\.md/i, 'design-system playbook should link to the detailed markdown indexes');
assert.match(skillMarkdown, /universal\/dashboard-2col|universal\/dashboard-3col|universal\/bento-grid/i, 'SKILL.md should use canonical layout ids from the layout catalog');
assert.match(patternMarkdown, /universal\/dashboard-2col|finance\/kpi-3col|ecommerce\/gmv-overview/i, 'visual report pattern guide should use canonical layout ids from the layout catalog');
assert.match(patternMarkdown, /inline.*variant-specific CSS|do not assume.*stylesheet|matching card-library rules/i, 'visual report pattern guide should explain the standalone CSS responsibility for richer variant classes');

const layoutSource = readText(path.join(workspaceRoot, 'src', 'renderer', 'utils', 'layoutManifest.ts'));
const paletteSource = readText(path.join(workspaceRoot, 'src', 'renderer', 'types', 'index.ts'));
const cardSource = readText(path.join(workspaceRoot, 'src', 'renderer', 'data', 'CardCatalog.tsx'));

const layoutIds = extractMatches(/id: '([^']+)'/g, layoutSource);
const paletteIds = extractMatches(/id: '(palette-[^']+)'/g, paletteSource);
const cardIds = extractMatches(/\{ id:'([^']+)'/g, cardSource);

assert.ok(layoutIds.length >= 40, 'source-of-truth layout manifest should expose the built-in layout catalog');
assert.ok(paletteIds.length >= 30, 'source-of-truth palette preset list should expose the built-in palette catalog');
assert.ok(cardIds.length >= 150, 'source-of-truth card catalog should expose the built-in card catalog');

for (const layoutId of layoutIds) {
  assert.match(layoutCatalog, new RegExp(layoutId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `layout catalog should include ${layoutId}`);
}

for (const paletteId of paletteIds) {
  assert.match(paletteCatalog, new RegExp(paletteId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `palette catalog should include ${paletteId}`);
}

for (const cardId of cardIds) {
  assert.match(cardCatalog, new RegExp(cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `card catalog should include ${cardId}`);
}

console.log('agentskills knowledge index ok');