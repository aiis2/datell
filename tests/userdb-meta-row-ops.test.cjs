const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const Database = require('better-sqlite3');

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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-meta-row-'));
    const harness = loadUserDB(tempRoot);
    let id;
    try {
      id = harness.userdb.createUserDB(name).id;
      await fn(harness.userdb, id, tempRoot);
    } finally {
      if (id) harness.userdb.deleteUserDB(id);
      harness.restore();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
}

function openRaw(tempRoot, id) {
  return new Database(path.join(tempRoot, 'userdb', `${id}.db`));
}

function listComments(db) {
  return db.prepare(
    'SELECT table_name, col_name, comment FROM __col_comments ORDER BY table_name, col_name'
  ).all();
}

function metaColumns(db) {
  return db.pragma('table_info(__col_comments)').map((c) => c.name);
}

function seedComments(userdb, id) {
  userdb.createTable(id, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
  userdb.alterColumn(id, 'users', 'name', undefined, 'display-name');
}

const REFUSE_RE = /unknown table|reserved|__col_comments/i;

withUserDB('getUserDBTableData refuses __col_comments', (userdb, id, tempRoot) => {
  seedComments(userdb, id);
  assert.throws(() => userdb.getUserDBTableData(id, '__col_comments'), REFUSE_RE);

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('batchInsert refuses __col_comments and leaves rows intact', (userdb, id, tempRoot) => {
  seedComments(userdb, id);
  assert.throws(
    () => userdb.batchInsert(id, '__col_comments', ['table_name', 'col_name', 'comment'], [['x', 'y', 'z']]),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('updateRow refuses __col_comments', (userdb, id, tempRoot) => {
  seedComments(userdb, id);
  assert.throws(
    () => userdb.updateRow(id, '__col_comments', { kind: 'rowid', value: '1' }, { comment: 'hijacked' }),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('renameColumn refuses __col_comments and keeps comment column', (userdb, id, tempRoot) => {
  seedComments(userdb, id);
  assert.throws(
    () => userdb.renameColumn(id, '__col_comments', 'comment', 'comment2'),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(metaColumns(db), ['table_name', 'col_name', 'comment']);
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('normal user table preview update insert rename still work', (userdb, id, tempRoot) => {
  seedComments(userdb, id);
  userdb.batchInsert(id, 'users', ['id', 'name'], [[1, 'alice']]);

  const preview = userdb.getUserDBTableData(id, 'users');
  assert.equal(preview.rows.length, 1);
  assert.ok(preview.rowLocators?.[0]);

  userdb.updateRow(id, 'users', preview.rowLocators[0], { name: 'bob' });
  userdb.renameColumn(id, 'users', 'name', 'full_name');

  const after = userdb.getUserDBTableData(id, 'users');
  assert.deepEqual(after.columns, ['id', 'full_name']);
  assert.equal(after.rows[0][1], 'bob');

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'full_name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});
