const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('path');
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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-exec-'));
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

withUserDB('WITH … INSERT succeeds via executeUserDBSQL and inserts rows', async (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (a INTEGER, b TEXT)');
  const result = userdb.executeUserDBSQL(
    id,
    "WITH x AS (SELECT 1 AS n) INSERT INTO t SELECT n, 'cte' FROM x",
  );
  assert.deepEqual(result.columns, ['changes', 'lastInsertRowid']);
  assert.equal(result.rows[0][0], 1);
  const db = openRaw(tempRoot, id);
  try {
    const rows = db.prepare('SELECT a, b FROM t').all();
    assert.deepEqual(rows, [{ a: 1, b: 'cte' }]);
  } finally {
    db.close();
  }
});

withUserDB('PRAGMA user_version = N succeeds and is readable', async (userdb, id) => {
  const write = userdb.executeUserDBSQL(id, 'PRAGMA user_version = 42');
  assert.deepEqual(write.columns, ['changes', 'lastInsertRowid']);
  const read = userdb.executeUserDBSQL(id, 'PRAGMA user_version');
  assert.equal(read.rows[0][0], 42);
});

withUserDB('WITH … SELECT still returns a row set', async (userdb, id) => {
  const result = userdb.executeUserDBSQL(id, 'WITH x AS (SELECT 7 AS n) SELECT * FROM x');
  assert.deepEqual(result.columns, ['n']);
  assert.deepEqual(result.rows, [[7]]);
});

withUserDB('PRAGMA table_info still returns columns', async (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE t (a INTEGER, b TEXT)');
  const result = userdb.executeUserDBSQL(id, 'PRAGMA table_info(t)');
  assert.ok(result.columns.includes('name'));
  assert.ok(result.rows.length >= 2);
  const names = result.rows.map((row) => row[result.columns.indexOf('name')]);
  assert.ok(names.includes('a'));
  assert.ok(names.includes('b'));
});

withUserDB('plain INSERT still returns changes metadata', async (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (a INTEGER, b TEXT)');
  const result = userdb.executeUserDBSQL(id, "INSERT INTO t VALUES (9, 'plain')");
  assert.deepEqual(result.columns, ['changes', 'lastInsertRowid']);
  assert.equal(result.rows[0][0], 1);
  const db = openRaw(tempRoot, id);
  try {
    assert.equal(db.prepare('SELECT count(*) AS c FROM t').get().c, 1);
  } finally {
    db.close();
  }
});
