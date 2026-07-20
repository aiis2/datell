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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-ct-'));
    const harness = loadUserDB(tempRoot);
    let id;
    try {
      const config = harness.userdb.createUserDB(name);
      id = config.id;
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

function tableNames(db) {
  return db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__col_comments' ORDER BY name`
  ).all().map((row) => row.name);
}

withUserDB('rejects multi-statement createTable and preserves existing tables', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE keepme(id INTEGER PRIMARY KEY, note TEXT)');
  userdb.batchInsert(id, 'keepme', ['id', 'note'], [[1, 'important']]);

  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE other(a TEXT); DROP TABLE keepme;'),
    /single CREATE TABLE|Only a single CREATE TABLE|createTable accepts only/i
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(tableNames(db), ['keepme']);
    assert.deepEqual(
      db.prepare('SELECT id, note FROM keepme').all(),
      [{ id: 1, note: 'important' }]
    );
  } finally {
    db.close();
  }
});

withUserDB('accepts a single CREATE TABLE and IF NOT EXISTS', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE items(id INTEGER PRIMARY KEY, name TEXT)');
  userdb.createTable(id, 'CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, name TEXT)');

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(tableNames(db), ['items']);
  } finally {
    db.close();
  }
});

withUserDB('allows trailing whitespace and comments after one CREATE TABLE', (userdb, id, tempRoot) => {
  userdb.createTable(id, `CREATE TABLE notes(
    id INTEGER PRIMARY KEY,
    body TEXT DEFAULT 'a;b'
  );
  -- trailing comment
  /* block comment */
  `);

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(tableNames(db), ['notes']);
  } finally {
    db.close();
  }
});

withUserDB('rejects empty and non-create DDL', (userdb, id) => {
  assert.throws(() => userdb.createTable(id, '   '), /Empty|CREATE TABLE/i);
  assert.throws(() => userdb.createTable(id, 'DROP TABLE items'), /CREATE TABLE/i);
  assert.throws(() => userdb.createTable(id, 'CREATE INDEX idx ON t(a)'), /CREATE TABLE/i);
});
