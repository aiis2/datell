const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const userdbPath = path.join(__dirname, '..', 'src', 'main', 'userdb.ts');
const dataDirPath = path.join(__dirname, '..', 'src', 'main', 'dataDir.ts');
const sqlGuardPath = path.join(__dirname, '..', 'src', 'main', 'sqlReadOnlyGuard.ts');

function loadUserDB(tempRoot) {
  const originalTsLoader = require.extensions['.ts'];
  const originalLoad = Module._load;

  require.extensions['.ts'] = (mod, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    mod._compile(output, filename);
  };

  Module._load = function loadWithMocks(request, parent, isMain) {
    if (parent?.filename === userdbPath && request === './dataDir') {
      return { getDataDir: () => tempRoot };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  for (const modulePath of [userdbPath, dataDirPath, sqlGuardPath]) {
    delete require.cache[modulePath];
  }
  const userdb = require(userdbPath);

  return {
    userdb,
    restore() {
      for (const modulePath of [userdbPath, dataDirPath, sqlGuardPath]) {
        delete require.cache[modulePath];
      }
      Module._load = originalLoad;
      if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
      else delete require.extensions['.ts'];
    },
  };
}

function withUserDB(name, fn) {
  return test(name, async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-row-'));
    const harness = loadUserDB(tempRoot);
    let id;
    try {
      const config = harness.userdb.createUserDB(name);
      id = config.id;
      await fn(harness.userdb, id);
    } finally {
      if (id) harness.userdb.deleteUserDB(id);
      harness.restore();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
}

withUserDB('updates exactly one row when visible values are duplicated', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE entries(region TEXT, amount INTEGER)');
  userdb.batchInsert(id, 'entries', ['region', 'amount'], [['east', 10], ['east', 20]]);

  const before = userdb.getUserDBTableData(id, 'entries');
  assert.deepEqual(before.columns, ['region', 'amount']);
  assert.deepEqual(before.rows, [['east', 10], ['east', 20]]);
  assert.equal(before.editable, true);
  assert.deepEqual(before.rowLocators.map((locator) => locator.kind), ['rowid', 'rowid']);

  const update = userdb.updateRow(id, 'entries', before.rowLocators[0], { amount: 99 });
  assert.deepEqual(update, { changes: 1 });

  const after = userdb.getUserDBTableData(id, 'entries');
  assert.deepEqual(after.rows, [['east', 99], ['east', 20]]);
});

withUserDB('keeps row identity hidden when a user column shadows rowid', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE shadowed(rowid TEXT, amount INTEGER)');
  userdb.batchInsert(id, 'shadowed', ['rowid', 'amount'], [['same', 1], ['same', 2]]);

  const data = userdb.getUserDBTableData(id, 'shadowed');
  assert.deepEqual(data.columns, ['rowid', 'amount']);
  assert.deepEqual(data.rows, [['same', 1], ['same', 2]]);
  assert.ok(data.rowLocators.every((locator) => locator.kind === 'rowid'));

  userdb.updateRow(id, 'shadowed', data.rowLocators[1], { amount: 7 });
  assert.deepEqual(userdb.getUserDBTableData(id, 'shadowed').rows, [['same', 1], ['same', 7]]);
});

withUserDB('keeps hidden identity separate from a colliding user column', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE alias_collision(__datell_internal_rowid__ TEXT, value TEXT)');
  userdb.batchInsert(id, 'alias_collision', ['__datell_internal_rowid__', 'value'], [['user value', 'one']]);

  const data = userdb.getUserDBTableData(id, 'alias_collision');
  assert.deepEqual(data.columns, ['__datell_internal_rowid__', 'value']);
  assert.deepEqual(data.rows, [['user value', 'one']]);
  assert.deepEqual(data.rowLocators, [{ kind: 'rowid', value: '1' }]);
});

withUserDB('preserves signed 64-bit rowids without numeric rounding', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE wide_identity(value TEXT)');
  userdb.executeUserDBSQL(id, "INSERT INTO wide_identity(rowid, value) VALUES (9223372036854775807, 'max')");

  const data = userdb.getUserDBTableData(id, 'wide_identity');
  assert.deepEqual(data.rowLocators, [{ kind: 'rowid', value: '9223372036854775807' }]);
  userdb.updateRow(id, 'wide_identity', data.rowLocators[0], { value: 'changed' });
  assert.deepEqual(userdb.getUserDBTableData(id, 'wide_identity').rows, [['changed']]);
});

withUserDB('reports an empty table with stable identity as editable', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE empty_table(value TEXT)');

  const data = userdb.getUserDBTableData(id, 'empty_table');
  assert.equal(data.editable, true);
  assert.deepEqual(data.rows, []);
  assert.deepEqual(data.rowLocators, []);
});

withUserDB('uses rowid metadata instead of matching WITHOUT ROWID text in a column name', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE literal_without_rowid("WITHOUT ROWID" TEXT, value TEXT)');
  userdb.batchInsert(id, 'literal_without_rowid', ['WITHOUT ROWID', 'value'], [['literal', 'one']]);

  const data = userdb.getUserDBTableData(id, 'literal_without_rowid');
  assert.equal(data.editable, true);
  assert.deepEqual(data.rowLocators, [{ kind: 'rowid', value: '1' }]);
  userdb.updateRow(id, 'literal_without_rowid', data.rowLocators[0], { value: 'changed' });
  assert.deepEqual(userdb.getUserDBTableData(id, 'literal_without_rowid').rows, [['literal', 'changed']]);
});

withUserDB('recognizes commented WITHOUT ROWID declarations', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE commented_without_rowid(id TEXT PRIMARY KEY, value TEXT) WITHOUT /* keep */ ROWID');
  userdb.batchInsert(id, 'commented_without_rowid', ['id', 'value'], [['a', 'one']]);

  const data = userdb.getUserDBTableData(id, 'commented_without_rowid');
  assert.deepEqual(data.rowLocators, [{ kind: 'primary-key', values: { id: 'a' } }]);
  userdb.updateRow(id, 'commented_without_rowid', data.rowLocators[0], { value: 'changed' });
  assert.deepEqual(userdb.getUserDBTableData(id, 'commented_without_rowid').rows, [['a', 'changed']]);
});

withUserDB('keeps adjacent unsafe integer primary keys distinct', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE wide_primary(rowid TEXT, _rowid_ TEXT, oid TEXT, id INTEGER PRIMARY KEY, value TEXT)');
  userdb.executeUserDBSQL(id, "INSERT INTO wide_primary(rowid, _rowid_, oid, id, value) VALUES ('r', 'u', 'o', 9007199254740992, 'first')");
  userdb.executeUserDBSQL(id, "INSERT INTO wide_primary(rowid, _rowid_, oid, id, value) VALUES ('r', 'u', 'o', 9007199254740993, 'second')");

  const data = userdb.getUserDBTableData(id, 'wide_primary');
  assert.equal(typeof data.rowLocators[0].values.id, 'bigint');
  assert.deepEqual(data.rowLocators.map((locator) => String(locator.values.id)), [
    '9007199254740992',
    '9007199254740993',
  ]);

  userdb.updateRow(id, 'wide_primary', data.rowLocators[1], { value: 'changed' });
  const after = userdb.getUserDBTableData(id, 'wide_primary');
  assert.deepEqual(after.rows.map((row) => [String(row[3]), row[4]]), [
    ['9007199254740992', 'first'],
    ['9007199254740993', 'changed'],
  ]);
});

withUserDB('keeps generated columns aligned with their visible values', (userdb, id) => {
  userdb.createTable(
    id,
    'CREATE TABLE generated_values(base TEXT, upper_base TEXT GENERATED ALWAYS AS (upper(base)) STORED)',
  );
  userdb.batchInsert(id, 'generated_values', ['base'], [['one']]);

  const data = userdb.getUserDBTableData(id, 'generated_values');
  assert.deepEqual(data.columns, ['base', 'upper_base']);
  assert.deepEqual(data.rows, [['one', 'ONE']]);
  assert.throws(
    () => userdb.updateRow(id, 'generated_values', data.rowLocators[0], { upper_base: 'forged' }),
    /generated|read.only|column/i,
  );
});

withUserDB('falls back to an explicit primary key when every rowid alias is shadowed', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE explicit_key(rowid TEXT, _rowid_ TEXT, oid TEXT, id TEXT PRIMARY KEY, value TEXT)');
  userdb.batchInsert(id, 'explicit_key', ['rowid', '_rowid_', 'oid', 'id', 'value'], [
    ['r', 'u', 'o', 'first', 'one'],
    ['r', 'u', 'o', 'second', 'two'],
  ]);

  const data = userdb.getUserDBTableData(id, 'explicit_key');
  assert.deepEqual(data.rowLocators, [
    { kind: 'primary-key', values: { id: 'first' } },
    { kind: 'primary-key', values: { id: 'second' } },
  ]);

  userdb.updateRow(id, 'explicit_key', data.rowLocators[1], { value: 'changed' });
  assert.deepEqual(userdb.getUserDBTableData(id, 'explicit_key').rows, [
    ['r', 'u', 'o', 'first', 'one'],
    ['r', 'u', 'o', 'second', 'changed'],
  ]);
});

withUserDB('preserves special JavaScript property names in primary-key locators', (userdb, id) => {
  userdb.createTable(
    id,
    'CREATE TABLE special_key(rowid TEXT, _rowid_ TEXT, oid TEXT, "__proto__" TEXT PRIMARY KEY, value TEXT)',
  );
  userdb.batchInsert(
    id,
    'special_key',
    ['rowid', '_rowid_', 'oid', '__proto__', 'value'],
    [['r', 'u', 'o', 'stable', 'one']],
  );

  const data = userdb.getUserDBTableData(id, 'special_key');
  const locator = data.rowLocators[0];
  assert.equal(Object.prototype.hasOwnProperty.call(locator.values, '__proto__'), true);
  assert.equal(locator.values.__proto__, 'stable');

  userdb.updateRow(id, 'special_key', locator, { value: 'changed' });
  assert.deepEqual(userdb.getUserDBTableData(id, 'special_key').rows[0], ['r', 'u', 'o', 'stable', 'changed']);
});

withUserDB('supports ordered composite primary-key locators', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE composite(rowid TEXT, _rowid_ TEXT, oid TEXT, a TEXT, b INTEGER, value TEXT, PRIMARY KEY (a, b))');
  userdb.batchInsert(id, 'composite', ['rowid', '_rowid_', 'oid', 'a', 'b', 'value'], [
    ['r', 'u', 'o', 'x', 1, 'first'],
    ['r', 'u', 'o', 'x', 2, 'second'],
  ]);

  const data = userdb.getUserDBTableData(id, 'composite');
  assert.equal(data.editable, true);
  assert.deepEqual(data.rowLocators[1], {
    kind: 'primary-key',
    values: { a: 'x', b: 2 },
  });

  userdb.updateRow(id, 'composite', data.rowLocators[1], { value: 'changed' });
  assert.deepEqual(userdb.getUserDBTableData(id, 'composite').rows, [
    ['r', 'u', 'o', 'x', 1, 'first'],
    ['r', 'u', 'o', 'x', 2, 'changed'],
  ]);
});

withUserDB('uses composite primary keys for WITHOUT ROWID tables', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE strict_key(a TEXT, b INTEGER, value TEXT, PRIMARY KEY (a, b)) WITHOUT ROWID');
  userdb.batchInsert(id, 'strict_key', ['a', 'b', 'value'], [['x', 1, 'first'], ['x', 2, 'second']]);

  const data = userdb.getUserDBTableData(id, 'strict_key');
  assert.equal(data.editable, true);
  assert.deepEqual(data.rowLocators, [
    { kind: 'primary-key', values: { a: 'x', b: 1 } },
    { kind: 'primary-key', values: { a: 'x', b: 2 } },
  ]);

  userdb.updateRow(id, 'strict_key', data.rowLocators[0], { value: 'changed' });
  assert.deepEqual(userdb.getUserDBTableData(id, 'strict_key').rows, [
    ['x', 1, 'changed'],
    ['x', 2, 'second'],
  ]);
});

withUserDB('rejects stale and malformed locators or update columns', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE guarded(id TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID');
  userdb.batchInsert(id, 'guarded', ['id', 'value'], [['a', 'one']]);
  const data = userdb.getUserDBTableData(id, 'guarded');

  assert.throws(
    () => userdb.updateRow(id, 'guarded', { kind: 'primary-key', values: { id: 'missing' } }, { value: 'x' }),
    /stale|exactly one|0 rows/i,
  );
  assert.throws(
    () => userdb.updateRow(id, 'guarded', { kind: 'primary-key', values: {} }, { value: 'x' }),
    /primary key|locator/i,
  );
  assert.throws(
    () => userdb.updateRow(id, 'guarded', data.rowLocators[0], { unknown_column: 'x' }),
    /column|unknown/i,
  );
  assert.throws(
    () => userdb.updateRow(id, 'guarded', data.rowLocators[0], {}),
    /empty|update/i,
  );

  userdb.createTable(id, 'CREATE TABLE rowid_guard(value TEXT)');
  userdb.batchInsert(id, 'rowid_guard', ['value'], [['one']]);
  assert.throws(
    () => userdb.updateRow(id, 'rowid_guard', { kind: 'rowid', value: 1 }, { value: 'changed' }),
    /rowid|locator|malformed/i,
  );
  assert.throws(
    () => userdb.updateRow(id, 'rowid_guard', { kind: 'rowid', value: '9223372036854775808' }, { value: 'changed' }),
    /rowid|locator|malformed/i,
  );
  assert.throws(
    () => userdb.updateRow(id, 'rowid_guard', null, { value: 'changed' }),
    /locator/i,
  );
});

withUserDB('marks views without stable identity read-only', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE source(value TEXT)');
  userdb.batchInsert(id, 'source', ['value'], [['one'], ['two']]);
  userdb.executeUserDBSQL(id, 'CREATE VIEW source_view AS SELECT value FROM source');

  const data = userdb.getUserDBTableData(id, 'source_view');
  assert.equal(data.editable, false);
  assert.deepEqual(data.rowLocators, [null, null]);
});
