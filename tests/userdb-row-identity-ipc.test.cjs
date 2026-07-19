const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('carries typed userdb row locators through IPC', () => {
  const main = read('src/main/main.ts');
  const preload = read('src/main/preload.ts');
  const rendererTypes = read('src/renderer/types/index.ts');

  assert.match(main, /userdb:updateRow[\s\S]{0,300}locator:\s*UserDBRowLocator/);
  assert.match(main, /userDBUpdateRow\(id,\s*tableName,\s*locator,\s*updates\)/);
  assert.doesNotMatch(main, /userdb:updateRow[\s\S]{0,250}whereCol/);

  assert.match(preload, /userdbUpdateRow:[\s\S]{0,300}locator:\s*import\(['"]\.\.\/main\/userdb['"]\)\.UserDBRowLocator/);
  assert.match(preload, /ipcRenderer\.invoke\(['"]userdb:updateRow['"],\s*id,\s*tableName,\s*locator,\s*updates\)/);
  assert.doesNotMatch(preload, /userdbUpdateRow:[\s\S]{0,300}whereCol/);

  assert.match(rendererTypes, /userdbGetTableData:[\s\S]{0,250}UserDBTableDataResult/);
  assert.match(rendererTypes, /userdbUpdateRow:[\s\S]{0,300}UserDBRowLocator/);
});

