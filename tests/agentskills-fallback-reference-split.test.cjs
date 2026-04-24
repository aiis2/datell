const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const publishRoot = path.join(__dirname, '..', 'skill', 'publish', 'agentskills');
const skillDir = path.join(publishRoot, 'skills', 'datell-visual-report-preview');
const skillFile = path.join(skillDir, 'SKILL.md');
const evalsFile = path.join(skillDir, 'evals', 'evals.json');
const splitReferenceFile = path.join(skillDir, 'references', 'datell-design-system-playbook.md');

assert.equal(fs.existsSync(splitReferenceFile), true, 'a dedicated Datell design-system reference should exist for reuse');

const skillMarkdown = readText(skillFile);
const evals = JSON.parse(readText(evalsFile));
const splitReference = readText(splitReferenceFile);

assert.match(skillMarkdown, /references\/datell-design-system-playbook\.md/, 'SKILL.md should point to the split reusable design-system reference');

assert.match(splitReference, /Card Families|KPI|Table|Narrative/i, 'split reference should organize Datell card families');
assert.match(splitReference, /Layout Families|dashboard-2col|bento-grid|compact-dashboard/i, 'split reference should organize Datell layout families');
assert.match(splitReference, /Palette Presets|palette-classic|palette-slate-dark|palette-editorial/i, 'split reference should document reusable palette presets');

assert.ok(Array.isArray(evals.evals) && evals.evals.length >= 4, 'evals should include an additional domain-specific case');
const industryEval = evals.evals.find((item) => /finance|ecommerce|gmv|pnl|cashflow/i.test(item.prompt));
assert.ok(industryEval, 'evals should include a finance or ecommerce specific prompt');
assert.ok((industryEval.files || []).includes('references/datell-design-system-playbook.md'), 'the domain-specific eval should consume the split design-system reference');

console.log('agentskills fallback reference split ok');