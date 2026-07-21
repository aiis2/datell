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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-meta-'));
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

withUserDB('dropTable refuses __col_comments and leaves meta rows intact', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  assert.throws(
    () => userdb.dropTable(id, '__col_comments'),
    /reserved|unknown table|__col_comments/i,
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

withUserDB('renameTable refuses renaming FROM __col_comments', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  assert.throws(
    () => userdb.renameTable(id, '__col_comments', 'renamed_meta'),
    /reserved|unknown table|__col_comments/i,
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

withUserDB('renameTable still refuses renaming TO __col_comments', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  assert.throws(
    () => userdb.renameTable(id, 'users', '__col_comments'),
    /reserved|__col_comments/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db), true);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map((r) => r.name);
    assert.ok(tables.includes('users'));
    assert.ok(tables.includes('__col_comments'));
  } finally {
    db.close();
  }
});

withUserDB('normal user table rename and drop still manage comments', (userdb, id, tempRoot) => {
  seedComments(userdb, id);

  userdb.renameTable(id, 'users', 'accounts');
  const db1 = openRaw(tempRoot, id);
  try {
    assert.deepEqual(listComments(db1), [
      { table_name: 'accounts', col_name: 'name', comment: 'display-name' },
    ]);
  } finally {
    db1.close();
  }

  userdb.dropTable(id, 'accounts');
  const db2 = openRaw(tempRoot, id);
  try {
    assert.equal(metaExists(db2), true);
    assert.deepEqual(listComments(db2), []);
    assert.equal(
      db2.prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'accounts'"
      ).get()?.ok,
      undefined,
    );
  } finally {
    db2.close();
  }
});
