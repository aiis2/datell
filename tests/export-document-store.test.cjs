require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const {
  EXPORT_CSP,
  createExportDocumentJob,
} = require('../src/main/exportDocumentStore.ts');

const html = '<!doctype html><script>window.inlineRan = true;</script><table></table>';
const job = createExportDocumentJob(html, [
  'https://cdn.undraw.co/illustration/bar_chart.svg?color=123456',
]);

assert.match(job.url, /^export:\/\/export-[0-9a-f-]+\.localhost\/document\.html$/);
assert.equal(job.isDisposed(), false);
assert.deepEqual(job.allowedImageUrls, [
  'https://cdn.undraw.co/illustration/bar_chart.svg?color=123456',
]);

const response = job.handle(job.url);
assert.ok(response, 'the active document URL should return a response');
assert.equal(response.status, 200);
assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
assert.equal(response.headers.get('content-security-policy'), EXPORT_CSP);

return response.text().then((body) => {
  assert.equal(body, html);
  assert.equal(job.handle('export://other-job.localhost/document.html'), null);
  assert.equal(job.handle('export://export-other.localhost/document.html'), null);
  assert.equal(job.handle('export://export-other.localhost/secret.txt'), null);
  assert.equal(job.handle('file:///C:/secret.txt'), null);

  job.dispose();
  job.dispose();
  assert.equal(job.isDisposed(), true);
  assert.equal(job.handle(job.url), null);
  console.log('export document store ok');
});
