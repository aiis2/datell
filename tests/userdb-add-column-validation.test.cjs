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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-addcol-'));
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

function columnNames(db, tableName) {
  return db.prepare(`PRAGMA table_info(${JSON.stringify(tableName)})`).all().map((c) => c.name);
}

withUserDB('rejects empty or blank column names without mutating schema', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE sales(region TEXT, amount TEXT)');

  assert.throws(() => userdb.addColumn(id, 'sales', '', 'TEXT'), /column name|empty|blank/i);
  assert.throws(() => userdb.addColumn(id, 'sales', '   ', 'TEXT'), /column name|empty|blank/i);

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(columnNames(db, 'sales'), ['region', 'amount']);
  } finally {
    db.close();
  }
});

withUserDB('adds a valid column and rejects unknown tables', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE sales(region TEXT)');
  userdb.addColumn(id, 'sales', 'amount', 'INTEGER');
  assert.throws(() => userdb.addColumn(id, 'missing', 'x', 'TEXT'), /Unknown table|no such table/i);

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(columnNames(db, 'sales'), ['region', 'amount']);
  } finally {
    db.close();
  }
});

withUserDB('rejects multi-statement column types', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE sales(region TEXT)');
  assert.throws(
    () => userdb.addColumn(id, 'sales', 'note', 'TEXT; DROP TABLE sales'),
    /type|statement|invalid/i
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(columnNames(db, 'sales'), ['region']);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='sales'").get());
  } finally {
    db.close();
  }
});
