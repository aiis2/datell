require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');

const {
  BUILT_IN_SKILL_MANIFESTS,
  localizeBuiltInSkillManifest,
} = require('../src/renderer/skills/manifests/index.ts');

const expectedToolNames = [
  'generate_chart',
  'generate_chart_apex',
  'generate_table_vtable',
  'generate_excel',
  'generate_pdf',
  'generate_slide',
  'generate_document',
  'query_database',
  'get_database_schema',
  'check_data_quality',
  'data_analysis',
  'run_js_sandbox',
  'web_fetch',
  'search_assets',
  'suggest_card_combinations',
  'validate_report',
  'ask_user',
  'show_mini_chart',
  'show_widget',
  'plan_tasks',
  'complete_task',
  'run_subagent',
  'run_subagents_parallel',
  'run_subagents_serial',
  'run_node_subagent',
  'skill_creator',
];

assert.equal(BUILT_IN_SKILL_MANIFESTS.length, 26, 'built-in manifest registry should cover all 26 built-in tools');
assert.deepEqual(
  BUILT_IN_SKILL_MANIFESTS.map((manifest) => manifest.toolName).sort(),
  expectedToolNames.slice().sort(),
  'built-in manifest tool names should match the current runtime built-in tool set',
);
assert.equal(
  new Set(BUILT_IN_SKILL_MANIFESTS.map((manifest) => manifest.id)).size,
  BUILT_IN_SKILL_MANIFESTS.length,
  'built-in manifest ids should be unique',
);

for (const manifest of BUILT_IN_SKILL_MANIFESTS) {
  const zh = localizeBuiltInSkillManifest(manifest, 'zh-CN');
  const en = localizeBuiltInSkillManifest(manifest, 'en-US');

  assert.ok(zh.label.length > 0, `zh label should exist for ${manifest.toolName}`);
  assert.ok(zh.description.length > 0, `zh description should exist for ${manifest.toolName}`);
  assert.ok(en.label.length > 0, `en label should exist for ${manifest.toolName}`);
  assert.ok(en.description.length > 0, `en description should exist for ${manifest.toolName}`);
  assert.ok(manifest.modulePath.endsWith('.ts'), `module path should point to a TypeScript module for ${manifest.toolName}`);
}

console.log('built in skill manifests ok');
