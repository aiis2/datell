const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('import dialog uses atomic importTable instead of IF NOT EXISTS + batchInsert', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'components', 'database', 'DatabaseManagementTab.tsx'),
    'utf8',
  );
  // Narrow to ImportDataDialog / handleImport region by markers around import flow.
  assert.match(source, /userdbImportTable|importTable/);
  assert.doesNotMatch(
    source,
    /CREATE TABLE IF NOT EXISTS[\s\S]{0,200}userdbBatchInsert/,
  );
  assert.doesNotMatch(source, /CREATE TABLE IF NOT EXISTS "\$\{tableName/);
});

test('preload and main expose userdb importTable IPC', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.ts'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.ts'), 'utf8');
  assert.match(preload, /userdbImportTable/);
  assert.match(preload, /userdb:importTable/);
  assert.match(main, /userdb:importTable/);
  assert.match(main, /importTable as userDBImportTable|userDBImportTable|importTable/);
});
