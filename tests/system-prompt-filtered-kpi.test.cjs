const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  buildSystemPrompt,
} = require('../src/renderer/prompts/systemPrompt.ts');

const prompt = buildSystemPrompt({
  currentTime: '2026-04-21 10:00:00',
  language: 'zh-CN',
});

assert(
  prompt.includes('受影响的 KPI/图表/表格都必须有更新路径'),
  'expected system prompt to require filtered KPI summaries to refresh with filters',
);

assert(
  prompt.includes('data-kpi-static="true"'),
  'expected system prompt to document the explicit static KPI marker',
);

console.log('system prompt filtered kpi rule ok');