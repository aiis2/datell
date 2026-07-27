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

function metaColumnNames(db) {
  return db.prepare("PRAGMA table_info('__col_comments')").all().map((c) => c.name);
}

withUserDB('executeUserDBSQL refuses ALTER TABLE schema changes on __col_comments', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  assert.throws(
    () => userdb.executeUserDBSQL(id, 'ALTER TABLE __col_comments RENAME COLUMN comment TO comment2'),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'ALTER TABLE __col_comments ADD COLUMN x TEXT'),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'ALTER TABLE __col_comments DROP COLUMN comment'),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), true);
    assert.deepEqual(metaColumnNames(db), ['table_name', 'col_name', 'comment']);
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('executeUserDBSQL refuses CREATE INDEX on __col_comments', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE INDEX idx_meta ON __col_comments(table_name)'),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE UNIQUE INDEX idx_meta_u ON "__col_comments"(col_name)'),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(
      db.prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'index' AND name IN ('idx_meta', 'idx_meta_u')"
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

withUserDB('executeUserDBSQL still allows ordinary user-table DDL and DML', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  userdb.executeUserDBSQL(id, 'CREATE TABLE scratch (x INTEGER)');
  userdb.executeUserDBSQL(id, 'INSERT INTO scratch (x) VALUES (7)');
  const select = userdb.executeUserDBSQL(id, 'SELECT x FROM scratch');
  assert.equal(select.rows[0][0], 7);

  userdb.executeUserDBSQL(id, 'ALTER TABLE scratch ADD COLUMN y TEXT');
  userdb.executeUserDBSQL(id, 'CREATE INDEX idx_scratch_x ON scratch(x)');
  userdb.executeUserDBSQL(id, 'ALTER TABLE scratch RENAME TO scratch2');
  userdb.executeUserDBSQL(id, 'DROP TABLE scratch2');

  // Read-only access to meta remains useful for debugging; mutation is refused above.
  const metaSelect = userdb.executeUserDBSQL(id, 'SELECT comment FROM __col_comments');
  assert.equal(metaSelect.rows[0][0], 'display-name');

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), true);
    assert.deepEqual(metaColumnNames(db), ['table_name', 'col_name', 'comment']);
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

withUserDB('executeUserDBSQL refuses CREATE TABLE __col_comments', (userdb, id, tempRoot) => {
  // No product meta yet — CREATE must still be refused so the reserved name cannot be occupied.
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE TABLE __col_comments (id INTEGER PRIMARY KEY)'),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE TABLE IF NOT EXISTS "__col_comments" (x TEXT)'),
    REFUSE_RE,
  );

  // After product seeds meta, CREATE of the reserved name remains refused and comments stay intact.
  seedComments(userdb, id);
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE TABLE __col_comments (id INTEGER)'),
    REFUSE_RE,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), true);
    assert.deepEqual(metaColumnNames(db), ['table_name', 'col_name', 'comment']);
    assert.deepEqual(listComments(db), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('executeUserDBSQL refuses ALTER TABLE RENAME TO __col_comments', (userdb, id, tempRoot) => {
  // Rename into the reserved name before product meta exists — SQLite would otherwise allow it.
  userdb.createTable(id, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');

  assert.throws(
    () => userdb.executeUserDBSQL(id, 'ALTER TABLE users RENAME TO __col_comments'),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'ALTER TABLE users RENAME TO "__col_comments"'),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(
      db.prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'users'"
      ).get()?.ok,
      1,
    );
    assert.equal(metaExists(db), false);
    assert.equal(
      db.prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = '__col_comments'"
      ).get()?.ok,
      undefined,
    );
  } finally {
    db.close();
  }

  // After product seeds meta, rename-into remains refused and comments stay intact.
  userdb.alterColumn(id, 'users', 'name', undefined, 'display-name');
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'ALTER TABLE users RENAME TO __col_comments'),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );
  const db2 = openRaw(tempRoot, id);
  try {
    assert.deepEqual(listComments(db2), [
      { table_name: 'users', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db2.close();
  }
});

withUserDB('executeUserDBSQL still allows CREATE and RENAME TO non-reserved names', (userdb, id) => {
  userdb.executeUserDBSQL(id, 'CREATE TABLE ok_tbl (id INTEGER)');
  userdb.executeUserDBSQL(id, 'ALTER TABLE ok_tbl RENAME TO ok_tbl2');
  const select = userdb.executeUserDBSQL(id, 'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = \'ok_tbl2\'');
  assert.equal(select.rows[0][0], 'ok_tbl2');
});

withUserDB('executeUserDBSQL refuses TEMP/VIEW/WITH create of __col_comments', (userdb, id, tempRoot) => {
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE TEMP TABLE __col_comments (x INTEGER)'),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE TEMPORARY TABLE "__col_comments" (x INTEGER)'),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE VIEW __col_comments AS SELECT 1 AS n'),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );
  assert.throws(
    () => userdb.executeUserDBSQL(
      id,
      'WITH x AS (SELECT 1 AS n) CREATE TABLE __col_comments AS SELECT * FROM x',
    ),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), false);
    assert.equal(
      db.prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE name = '__col_comments'"
      ).get()?.ok,
      undefined,
    );
  } finally {
    db.close();
  }
});

withUserDB('executeUserDBSQL still allows non-reserved TEMP tables and views', (userdb, id) => {
  // TEMP objects are connection-local; each executeUserDBSQL opens a new connection,
  // so only assert CREATE does not throw for a non-reserved temp name.
  assert.doesNotThrow(() => userdb.executeUserDBSQL(id, 'CREATE TEMP TABLE ok_tmp (x INTEGER)'));

  userdb.executeUserDBSQL(id, 'CREATE VIEW ok_view AS SELECT 9 AS n');
  const viewSelect = userdb.executeUserDBSQL(id, 'SELECT n FROM ok_view');
  assert.equal(viewSelect.rows[0][0], 9);
});

withUserDB('executeUserDBSQL refuses VIRTUAL TABLE and TEMP/WITH VIEW of __col_comments', (userdb, id, tempRoot) => {
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE VIRTUAL TABLE __col_comments USING fts5(x)'),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE TEMP VIEW __col_comments AS SELECT 1 AS n'),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'CREATE TEMPORARY VIEW "__col_comments" AS SELECT 1 AS n'),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );
  assert.throws(
    () => userdb.executeUserDBSQL(
      id,
      'WITH x AS (SELECT 1 AS n) CREATE VIEW __col_comments AS SELECT * FROM x',
    ),
    (err) => REFUSE_RE.test(String(err)) && /reserved/i.test(String(err)),
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE name = '__col_comments'").get()?.ok,
      undefined,
    );
  } finally {
    db.close();
  }
});

withUserDB('executeUserDBSQL still allows non-reserved virtual tables and temp views', (userdb, id) => {
  assert.doesNotThrow(() => userdb.executeUserDBSQL(id, 'CREATE VIRTUAL TABLE ok_fts USING fts5(x)'));
  assert.doesNotThrow(() => userdb.executeUserDBSQL(id, 'CREATE TEMP VIEW ok_temp_view AS SELECT 1 AS n'));
});
