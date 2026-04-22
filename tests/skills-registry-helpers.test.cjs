require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');

const {
  createEmptyRegistrySkillManifest,
  createRegistrySkillFromDynamicTool,
  createRegistrySkillFromExternalSkill,
  makeUniqueSkillId,
  parseRegistrySkillTools,
  serializeRegistrySkillTools,
  slugifySkillId,
  validateRegistrySkillManifest,
} = require('../src/renderer/skills/registryHelpers.ts');

assert.equal(slugifySkillId('Revenue Audit Skill'), 'revenue-audit-skill');
assert.equal(makeUniqueSkillId('Revenue Audit Skill', ['revenue-audit-skill']), 'revenue-audit-skill-2');

const externalManifest = createRegistrySkillFromExternalSkill(
  {
    id: 'ext-demo',
    name: 'Legacy Revenue Skill',
    description: 'legacy import',
    version: '2.0.0',
    source: 'legacy-revenue.json',
    tools: [
      {
        name: 'legacy_revenue_tool',
        description: 'legacy revenue tool',
        parameters: { type: 'object', properties: {} },
        code: 'return "legacy";',
      },
    ],
  },
  ['legacy-revenue-skill'],
);

assert.equal(externalManifest.id, 'legacy-revenue-skill-2');
assert.equal(externalManifest.tools.length, 1);
assert.equal(externalManifest.tools[0].name, 'legacy_revenue_tool');

const dynamicManifest = createRegistrySkillFromDynamicTool(
  {
    id: 'dynamic-1',
    name: 'dynamic_margin_tool',
    description: 'dynamic margin tool',
    parameters: [{ name: 'margin', type: 'number', description: 'margin', required: true }],
    code: 'return String(args.margin);',
    createdAt: Date.now(),
  },
  [],
);

assert.equal(dynamicManifest.name, 'dynamic_margin_tool');
assert.equal(dynamicManifest.tools[0].name, 'dynamic_margin_tool');
assert.equal(dynamicManifest.tools[0].parameters.length, 1);

const emptyManifest = createEmptyRegistrySkillManifest();
assert.equal(validateRegistrySkillManifest(emptyManifest), '技能 ID 不能为空');

const toolsJson = serializeRegistrySkillTools(dynamicManifest.tools);
const parsedTools = parseRegistrySkillTools(toolsJson);

assert.deepEqual(parsedTools, dynamicManifest.tools);
assert.equal(
  validateRegistrySkillManifest({
    ...dynamicManifest,
    id: 'dynamic-margin-tool',
  }),
  null,
  'a normalized migrated manifest should pass validation',
);

assert.throws(
  () => parseRegistrySkillTools('{"invalid":true}'),
  /tools 必须是数组/,
  'tool parser should reject non-array payloads',
);

console.log('skills registry helpers ok');