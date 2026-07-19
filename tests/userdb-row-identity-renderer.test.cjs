const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'components', 'database', 'DatabaseManagementTab.tsx'),
  'utf8',
);

test('table preview edits by the locator returned for the displayed row', () => {
  assert.match(source, /rowLocators/);
  assert.match(source, /data\.rowLocators\[editingCell\.row\]/);
  assert.match(source, /userdbUpdateRow\(sourceId,\s*tableName,\s*locator,\s*\{\s*\[editingCell\.col\]:\s*editValue\s*\}\)/);
  assert.match(source, /await\s+fetchData\(page\)/);
  assert.match(source, /data\.editable/);
  assert.doesNotMatch(source, /const\s+pkCol\s*=\s*data\.columns\[0\]/);
  assert.doesNotMatch(source, /const\s+pkVal\s*=\s*row\[0\]/);
});
