const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const publishRoot = path.join(__dirname, '..', 'skill', 'publish', 'agentskills');
const skillFile = path.join(publishRoot, 'skills', 'datell-visual-report-preview', 'SKILL.md');
const referenceFile = path.join(publishRoot, 'skills', 'datell-visual-report-preview', 'references', 'visual-report-pattern.md');
const evalsFile = path.join(publishRoot, 'skills', 'datell-visual-report-preview', 'evals', 'evals.json');

const skillMarkdown = readText(skillFile);
const referenceMarkdown = readText(referenceFile);
const evals = JSON.parse(readText(evalsFile));

assert.match(skillMarkdown, /grid-kpi|zone-kpi/i, 'fallback skill should describe the Datell KPI row skeleton');
assert.match(skillMarkdown, /grid-charts|zone-content/i, 'fallback skill should describe the Datell chart content skeleton');
assert.match(skillMarkdown, /kpi-bullet-card|kpi-ranked-list|kpi-traffic-light/i, 'fallback skill should mention concrete Datell KPI card variants');
assert.match(skillMarkdown, /insight-callout|text-summary-card|metric-narrative/i, 'fallback skill should mention Datell narrative and insight cards');
assert.match(skillMarkdown, /--bg-body|--bg-card|--color-primary|--text-main/i, 'fallback skill should mention theme CSS variables used by Datell reports');
assert.match(skillMarkdown, /dashboard-2col|dashboard-3col|bento-grid|compact-dashboard/i, 'fallback skill should guide layout selection using Datell layout families');

assert.match(referenceMarkdown, /report-container|report-header|report-content/i, 'reference guide should expose the Datell report shell structure');
assert.match(referenceMarkdown, /kpi-bullet-card|kpi-ranked-list|chart-card|insight-callout/i, 'reference guide should include concrete Datell card classes');
assert.match(referenceMarkdown, /--bg-body|--bg-card|--text-main|--color-primary/i, 'reference guide should document Datell palette variables');
assert.match(referenceMarkdown, /palette-classic|palette-slate-dark|palette-editorial|palette-cyberpunk/i, 'reference guide should mention real palette preset families');

assert.ok(Array.isArray(evals.evals) && evals.evals.length >= 3, 'evals should cover the richer no-MCP fallback behavior');
assert.match(JSON.stringify(evals.evals), /bento|compact|insight|traffic|palette/i, 'evals should exercise cards, layouts, or palette-rich fallback prompts');

console.log('agentskills fallback design system ok');