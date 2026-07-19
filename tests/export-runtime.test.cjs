require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const {
  inlineBuiltInRuntimes,
  needsVTableRuntime,
} = require('../src/main/exportRuntime.ts');

const sources = {
  echarts: 'window.__ECHARTS_RUNTIME__ = true;',
  apexcharts: 'window.__APEX_RUNTIME__ = true;',
  vtable: 'window.__VTABLE_RUNTIME__ = "</script>";',
};

const chartHtml = '<!doctype html><head><script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script></head><body><script>window.userScript = true;</script></body>';
const chartOutput = inlineBuiltInRuntimes(chartHtml, sources);
assert.doesNotMatch(chartOutput, /<script[^>]+src=["']https:\/\/cdn\.jsdelivr\.net/i);
assert.match(chartOutput, /CDN script replaced by packaged runtime/);
assert.match(chartOutput, /__ECHARTS_RUNTIME__/);
assert.match(chartOutput, /__APEX_RUNTIME__/);
assert.doesNotMatch(chartOutput, /__VTABLE_RUNTIME__/);
assert.ok(chartOutput.indexOf('__ECHARTS_RUNTIME__') < chartOutput.indexOf('window.userScript'));

const tableHtml = '<html><head></head><body><script>const table = new VTable.ListTable(container, options);</script></body></html>';
const tableOutput = inlineBuiltInRuntimes(tableHtml, sources);
assert.equal(needsVTableRuntime(tableHtml), true);
assert.match(tableOutput, /__VTABLE_RUNTIME__/);
assert.match(tableOutput, /<\\\/script>/, 'embedded runtime source must escape literal closing script tags');

assert.equal(needsVTableRuntime('<script src="https://cdn.jsdelivr.net/npm/@visactor/vtable/dist/vtable.min.js"></script>'), true);
assert.equal(needsVTableRuntime('<p>ordinary table</p>'), false);

const bodyFallback = inlineBuiltInRuntimes('<body>content</body>', { echarts: 'window.e = 1;' });
assert.ok(bodyFallback.indexOf('window.e = 1;') < bodyFallback.indexOf('<body>'));
const prependFallback = inlineBuiltInRuntimes('<p>fragment</p>', { echarts: 'window.e = 1;' });
assert.ok(prependFallback.startsWith('<script>window.e = 1;</script>'));

const arbitrary = '<head><script src="https://evil.example/runtime.js"></script></head>';
assert.match(inlineBuiltInRuntimes(arbitrary, {}), /https:\/\/evil\.example\/runtime\.js/);

console.log('export runtime injection ok');
