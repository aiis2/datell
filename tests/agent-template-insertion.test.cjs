require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    jsx: 'react-jsx',
  },
});

const assert = require('node:assert/strict');

const {
  insertTemplateFragment,
} = require('../src/renderer/tools/saveReportTemplate.ts');

const baseHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Existing Template</title></head>
<body>
  <div class="report-container">
    <header class="report-header"><h1 class="report-title">Existing Template</h1></header>
    <main class="report-content">
      <section class="card" data-card-id="existing_card">Existing content</section>
    </main>
  </div>
</body>
</html>`;

const fragment = `<div class="visual-copy"><h2>Screenshot style block</h2></div>`;

const merged = insertTemplateFragment(baseHtml, fragment, {
  sourceWidth: 1440,
  sourceHeight: 900,
});

assert.match(
  merged,
  /data-card-id="existing_card"/,
  'inserting a screenshot-derived block should preserve existing template content',
);
assert.match(
  merged,
  /<section class="agent-generated-template-block"/,
  'inserted fragment should be wrapped in a stable agent template block',
);
assert.match(
  merged,
  /aspect-ratio:\s*1440\s*\/\s*900/,
  'inserted block should preserve the screenshot aspect ratio when dimensions are provided',
);
assert.ok(
  merged.indexOf('Existing content') < merged.indexOf('Screenshot style block'),
  'inserted block should be appended after existing report content',
);
assert.match(
  merged,
  /<\/section>\s*<\/main>/,
  'inserted block should be placed inside the current template main content',
);

console.log('agent template insertion ok');
