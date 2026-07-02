const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  buildSystemPrompt,
} = require('../src/renderer/prompts/systemPrompt.ts');

const prompt = buildSystemPrompt({
  currentTime: '2026-07-02 17:30:00',
  language: 'zh-CN',
});

assert(
  prompt.includes('save_report_template'),
  'system prompt should tell the Agent to use save_report_template for screenshot template tasks',
);

assert(
  prompt.includes('根据截图生成模板'),
  'system prompt should explicitly cover generating templates from screenshots',
);

assert(
  prompt.includes('insert_into_selected'),
  'system prompt should document the insert-into-current-template mode',
);

console.log('system prompt template generation rule ok');
