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
const engineReferenceFile = path.join(skillDir, 'references', 'datell-chart-engine-playbook.md');

assert.equal(fs.existsSync(engineReferenceFile), true, 'a dedicated chart engine playbook should exist');

const skillMarkdown = readText(skillFile);
const evals = JSON.parse(readText(evalsFile));
const engineReference = readText(engineReferenceFile);

assert.match(skillMarkdown, /ECharts/i, 'skill should explicitly cover the ECharts path');
assert.match(skillMarkdown, /ApexCharts|Apex/i, 'skill should explicitly cover the ApexCharts path');
assert.match(skillMarkdown, /choose layout|select layout|layout family/i, 'skill should describe the first step of choosing a layout family');
assert.match(skillMarkdown, /choose cards|card combination|card library/i, 'skill should describe the card selection step');
assert.match(skillMarkdown, /choose chart engine|chart engine|engine decision/i, 'skill should describe the engine selection step');
assert.match(skillMarkdown, /same Datell shell|same card system|same shell and card/i, 'skill should explain that ECharts and ApexCharts share the same Datell shell and card integration');
assert.match(skillMarkdown, /references\/datell-chart-engine-playbook\.md/, 'skill should point to the chart engine playbook');

assert.match(engineReference, /ECharts/i, 'engine playbook should document ECharts integration');
assert.match(engineReference, /ApexCharts|Apex/i, 'engine playbook should document ApexCharts integration');
assert.match(engineReference, /chart-card|chart-container/i, 'engine playbook should preserve shared card shell classes');
assert.match(engineReference, /echarts\.init|new ApexCharts/i, 'engine playbook should show engine-specific initialization patterns');
assert.match(engineReference, /CDN|preloaded|pre-load/i, 'engine playbook should explain host-preloaded versus CDN loading assumptions');

const apexEval = evals.evals.find((item) => /ApexCharts|Apex/i.test(item.prompt));
assert.ok(apexEval, 'evals should include an ApexCharts-specific scenario');
assert.ok((apexEval.files || []).includes('references/datell-chart-engine-playbook.md'), 'ApexCharts eval should consume the chart engine playbook');

console.log('agentskills chart engine flow ok');