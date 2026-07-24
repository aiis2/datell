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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-sqlmeta-'));
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

function metaExists(db) {
  const row = db.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = '__col_comments'"
  ).get();
  return Boolean(row);
}

function seedComments(userdb, id) {
  userdb.createTable(id, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
  userdb.alterColumn(id, 'users', 'name', undefined, 'display-name');
}

const REFUSE_RE = /reserved|cannot drop|cannot rename|cannot mutate|unknown table|__col_comments/i;

withUserDB('executeUserDBSQL refuses DROP TABLE __col_comments and leaves meta rows', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  assert.throws(
    () => userdb.executeUserDBSQL(id, 'DROP TABLE __col_comments'),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), true);
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('executeUserDBSQL refuses DROP TABLE IF EXISTS __col_comments', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  assert.throws(
    () => userdb.executeUserDBSQL(id, 'DROP TABLE IF EXISTS __col_comments'),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), true);
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('executeUserDBSQL refuses ALTER TABLE __col_comments RENAME TO', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  assert.throws(
    () => userdb.executeUserDBSQL(id, 'ALTER TABLE __col_comments RENAME TO renamed_meta'),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), true);
    assert.equal(
      db.prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'renamed_meta'"
      ).get()?.ok,
      undefined,
    );
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('executeUserDBSQL refuses DELETE FROM __col_comments and leaves meta rows', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  assert.throws(
    () => userdb.executeUserDBSQL(id, 'DELETE FROM __col_comments'),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'DELETE FROM "__col_comments"'),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'WITH x AS (SELECT 1) DELETE FROM __col_comments'),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), true);
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('executeUserDBSQL refuses UPDATE/INSERT/REPLACE against __col_comments', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  assert.throws(
    () => userdb.executeUserDBSQL(id, "UPDATE __col_comments SET comment = 'x'"),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(
      id,
      "INSERT INTO __col_comments (table_name, col_name, comment) VALUES ('t','c','z')",
    ),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(
      id,
      "REPLACE INTO __col_comments (table_name, col_name, comment) VALUES ('t','c','z')",
    ),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), true);
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('executeUserDBSQL still allows ordinary user-table DDL and DML', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  userdb.executeUserDBSQL(id, 'CREATE TABLE scratch (x INTEGER)');
  userdb.executeUserDBSQL(id, 'INSERT INTO scratch (x) VALUES (7)');
  const select = userdb.executeUserDBSQL(id, 'SELECT x FROM scratch');
  assert.equal(select.rows[0][0], 7);

  userdb.executeUserDBSQL(id, 'ALTER TABLE scratch RENAME TO scratch2');
  userdb.executeUserDBSQL(id, 'DROP TABLE scratch2');

  // Read-only access to meta remains useful for debugging; mutation is refused above.
  const metaSelect = userdb.executeUserDBSQL(id, 'SELECT comment FROM __col_comments');
  assert.equal(metaSelect.rows[0][0], 'display-name');

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), true);
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
    assert.equal(
      db.prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'scratch2'"
      ).get()?.ok,
      undefined,
    );
  } finally {
    db.close();
  }
});
