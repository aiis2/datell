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

withUserDB('supports ordered composite primary-key locators', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE composite(a TEXT, b INTEGER, value TEXT, PRIMARY KEY (a, b))');
  userdb.batchInsert(id, 'composite', ['a', 'b', 'value'], [['x', 1, 'first'], ['x', 2, 'second']]);

  const data = userdb.getUserDBTableData(id, 'composite');
  assert.equal(data.editable, true);
  assert.deepEqual(data.rowLocators[1], {
    kind: 'primary-key',
    values: { a: 'x', b: 2 },
  });

  userdb.updateRow(id, 'composite', data.rowLocators[1], { value: 'changed' });
  assert.deepEqual(userdb.getUserDBTableData(id, 'composite').rows, [
    ['x', 1, 'first'],
    ['x', 2, 'changed'],
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
});

withUserDB('marks views without stable identity read-only', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE source(value TEXT)');
  userdb.batchInsert(id, 'source', ['value'], [['one'], ['two']]);
  userdb.executeUserDBSQL(id, 'CREATE VIEW source_view AS SELECT value FROM source');

  const data = userdb.getUserDBTableData(id, 'source_view');
  assert.equal(data.editable, false);
  assert.deepEqual(data.rowLocators, [null, null]);
});

