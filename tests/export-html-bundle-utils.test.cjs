require('ts-node/register/transpile-only');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildExportPaletteCss,
  buildStandaloneThemeLinks,
  findExistingProbePath,
  injectFilterControlsRuntime,
  needsInteractivityEngineRuntime,
  needsFilterControlsRuntime,
} = require('../src/main/exportHtmlBundleUtils.ts');

const filterHtml = `<!DOCTYPE html>
<html>
<head><title>test</title></head>
<body>
  <div class="zone-filter" data-filter-group="main">
    <select class="filter-zone-select" data-filter-field="门店">
      <option value="全部">全部</option>
      <option value="北京">北京</option>
    </select>
  </div>
  <script>
    function applyFilters() {
      return window.__FILTER_STATE__ || {};
    }
    window.__REPORT_EVENT_BUS__?.register('seller_rank_chart', {});
    document.addEventListener('filterChange', applyFilters);
  </script>
</body>
</html>`;

assert.strictEqual(needsFilterControlsRuntime(filterHtml), true, 'legacy zone-filter export should require filter-controls runtime');
assert.strictEqual(needsInteractivityEngineRuntime(filterHtml), true, 'reports using __REPORT_EVENT_BUS__ should require interactivity-engine runtime');

const injected = injectFilterControlsRuntime(filterHtml, '个人销售排名分析报表');
assert.ok(
  injected.includes('./个人销售排名分析报表-assets/filter-controls.js'),
  'exported HTML should inject a filter-controls asset reference',
);
assert.strictEqual(
  (injected.match(/filter-controls\.js/g) || []).length,
  1,
  'filter-controls runtime should not be injected more than once',
);

const deduped = injectFilterControlsRuntime(injected, '个人销售排名分析报表');
assert.strictEqual(
  (deduped.match(/filter-controls\.js/g) || []).length,
  1,
  're-injecting should not create duplicate filter-controls references',
);

const standaloneThemeLinks = buildStandaloneThemeLinks('个人销售排名分析报表', 'tech', 'universal/dashboard-2col');
assert.ok(
  standaloneThemeLinks.includes('./个人销售排名分析报表-assets/styles/themes/theme-base.css'),
  'standalone export should always include the base theme stylesheet',
);
assert.ok(
  standaloneThemeLinks.includes('./个人销售排名分析报表-assets/styles/themes/theme-tech.css'),
  'standalone export should resolve the requested theme stylesheet',
);
assert.ok(
  standaloneThemeLinks.includes('./个人销售排名分析报表-assets/styles/card-library.css'),
  'standalone export should include card-library.css so filter controls keep their component styles',
);
assert.ok(
  standaloneThemeLinks.includes('./个人销售排名分析报表-assets/styles/layouts/_layout-base.css'),
  'standalone export should always include the base layout stylesheet',
);
assert.ok(
  standaloneThemeLinks.includes('./个人销售排名分析报表-assets/styles/layouts/universal/dashboard-2col.css'),
  'standalone export should include the active layout override when one is selected',
);

const paletteCss = buildExportPaletteCss({
  primary: '#2563eb',
  colors: ['#2563eb', '#14b8a6', '#f59e0b'],
  bodyBg: '#0f172a',
  cardBg: '#111827',
  textColor: '#e5e7eb',
  subTextColor: '#94a3b8',
  isDark: true,
});
assert.ok(
  paletteCss.includes('--bg-body: #0f172a;'),
  'palette CSS should override the body background for standalone exports',
);
assert.ok(
  paletteCss.includes('--bg-card: #111827;'),
  'palette CSS should override the card background for standalone exports',
);
assert.ok(
  paletteCss.includes('--text-sub: #94a3b8;'),
  'palette CSS should carry secondary text color overrides into standalone exports',
);
assert.ok(
  paletteCss.includes('--bg-header: #111827;'),
  'dark palettes should reuse the card/body color for the exported header background',
);

const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'export-html-probe-'));
const missingCandidate = path.join(probeRoot, 'missing-style-root');
const validCandidate = path.join(probeRoot, 'valid-style-root');
fs.mkdirSync(missingCandidate, { recursive: true });
fs.mkdirSync(path.join(validCandidate, 'themes'), { recursive: true });
fs.writeFileSync(path.join(validCandidate, 'themes', 'theme-base.css'), 'body{}', 'utf8');

assert.strictEqual(
  findExistingProbePath([missingCandidate, validCandidate], path.join('themes', 'theme-base.css')),
  validCandidate,
  'style root resolution should use a file probe instead of a bare directory probe',
);

fs.rmSync(probeRoot, { recursive: true, force: true });

console.log('export html bundle utils ok');