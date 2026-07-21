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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-acbt-'));
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

function colType(db, table, col) {
  const cols = db.pragma(`table_info(${JSON.stringify(table)})`);
  const found = cols.find((c) => c.name.toLowerCase() === col.toLowerCase());
  return found?.type ?? null;
}

withUserDB('alterColumn rejects empty newType and leaves type/data unchanged', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (id INTEGER PRIMARY KEY, amount INTEGER)');
  userdb.batchInsert(id, 't', ['id', 'amount'], [[1, 10]]);

  assert.throws(
    () => userdb.alterColumn(id, 't', 'amount', ''),
    /empty|type/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(colType(db, 't', 'amount'), 'INTEGER');
    const row = db.prepare('SELECT amount FROM t WHERE id = 1').get();
    assert.equal(row.amount, 10);
  } finally {
    db.close();
  }
});

withUserDB('alterColumn rejects whitespace-only newType and leaves type/data unchanged', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (id INTEGER PRIMARY KEY, amount INTEGER)');
  userdb.batchInsert(id, 't', ['id', 'amount'], [[1, 10]]);

  assert.throws(
    () => userdb.alterColumn(id, 't', 'amount', '   '),
    /empty|type/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(colType(db, 't', 'amount'), 'INTEGER');
    assert.equal(db.prepare('SELECT amount FROM t WHERE id = 1').get().amount, 10);
  } finally {
    db.close();
  }
});

withUserDB('alterColumn comment-only with omitted type still works without rewriting type', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (id INTEGER PRIMARY KEY, amount INTEGER)');
  userdb.alterColumn(id, 't', 'amount', undefined, 'units sold');

  const schema = userdb.getUserDBSchema(id, { limit: 50 });
  const table = schema.tables.find((t) => t.name === 't');
  const col = table.columns.find((c) => c.name === 'amount');
  assert.equal(col.type, 'INTEGER');
  assert.equal(col.comment, 'units sold');

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(colType(db, 't', 'amount'), 'INTEGER');
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='t'").get().sql;
    assert.match(sql, /amount\s+INTEGER/i);
  } finally {
    db.close();
  }
});

withUserDB('alterColumn still applies a valid non-blank type change', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (id INTEGER PRIMARY KEY, amount INTEGER)');
  userdb.batchInsert(id, 't', ['id', 'amount'], [[1, 10]]);
  userdb.alterColumn(id, 't', 'amount', 'TEXT');

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(colType(db, 't', 'amount'), 'TEXT');
    assert.equal(String(db.prepare('SELECT amount FROM t WHERE id = 1').get().amount), '10');
  } finally {
    db.close();
  }
});
