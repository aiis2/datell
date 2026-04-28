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
const referenceFile = path.join(skillDir, 'references', 'visual-report-pattern.md');
const readmeFile = path.join(publishRoot, 'README.md');

const skillMarkdown = readText(skillFile);
const referenceMarkdown = readText(referenceFile);
const readmeMarkdown = readText(readmeFile);
const evals = JSON.parse(readText(evalsFile));

assert.match(skillMarkdown, /no MCP|MCP is unavailable|without MCP/i, 'skill should explicitly describe the no-MCP path');
assert.match(skillMarkdown, /non-interactive|without interactivity|without interactive controls|static report/i, 'skill should require a static basic report when MCP is unavailable');
assert.match(skillMarkdown, /do not use filter controls|do not emit filter controls|no filter controls/i, 'skill should forbid filter controls in the no-MCP basic report path');
assert.match(skillMarkdown, /__REPORT_EVENT_BUS__|event bus|cross-card linkage|linkage/i, 'skill should explicitly forbid event-bus or linkage-based behavior in the no-MCP basic report path');

assert.match(referenceMarkdown, /non-interactive|without interactivity|static report/i, 'visual report pattern guide should document the static no-MCP fallback');
assert.match(referenceMarkdown, /do not use filter controls|no filter controls|avoid filter controls/i, 'visual report pattern guide should ban filter controls in the static no-MCP fallback');
assert.match(referenceMarkdown, /event bus|__REPORT_EVENT_BUS__|cross-card linkage|linkage/i, 'visual report pattern guide should ban linkage behavior in the static no-MCP fallback');

assert.match(readmeMarkdown, /without MCP|no-MCP|standalone HTML/i, 'publish README should describe the standalone no-MCP basic-report path');

const noMcpEvals = evals.evals.filter((item) => /no datell mcp runtime is available|without MCP|no MCP/i.test(item.prompt));
assert.ok(noMcpEvals.length >= 2, 'evals should include multiple no-MCP fallback scenarios');

for (const noMcpEval of noMcpEvals) {
  const evalText = [noMcpEval.prompt, noMcpEval.expected_output, JSON.stringify(noMcpEval.expectations || [])].join('\n');
  assert.match(evalText, /non-interactive|static|no filter controls|event bus|linkage/i, `no-MCP eval should encode the static fallback contract: ${noMcpEval.id}`);
}

const staticEval = noMcpEvals.find((item) => /without interactivity|no filter controls|basic report/i.test(item.prompt));
assert.ok(staticEval, 'evals should include a no-MCP static basic-report scenario');
assert.ok((staticEval.files || []).includes('references/visual-report-pattern.md'), 'no-MCP static eval should consume the visual report pattern guide');
assert.ok((staticEval.files || []).includes('references/datell-knowledge-index.md'), 'no-MCP static eval should consume the Datell knowledge index');

console.log('agentskills no mcp basic report ok');