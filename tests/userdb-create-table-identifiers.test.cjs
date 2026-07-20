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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-ctid-'));
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

function userTables(tempRoot, id) {
  const db = new Database(path.join(tempRoot, 'userdb', `${id}.db`));
  try {
    return db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    ).all().map((r) => r.name);
  } finally {
    db.close();
  }
}

withUserDB('rejects empty or blank quoted table names without creating a table', (userdb, id, tempRoot) => {
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE "" (a TEXT)'),
    /table name|empty|blank/i,
  );
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE "  " (a TEXT)'),
    /table name|empty|blank/i,
  );
  // SQLite also accepts empty names via [] and `` quoting.
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE [] (a TEXT)'),
    /table name|empty|blank/i,
  );
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE [  ] (a TEXT)'),
    /table name|empty|blank/i,
  );
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE `` (a TEXT)'),
    /table name|empty|blank/i,
  );
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE `  ` (a TEXT)'),
    /table name|empty|blank/i,
  );
  assert.deepEqual(userTables(tempRoot, id), []);
});

withUserDB('rejects empty or blank column names without creating a table', (userdb, id, tempRoot) => {
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE t ("" TEXT)'),
    /column name|empty|blank/i,
  );
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE t2 ("  " TEXT, b TEXT)'),
    /column name|empty|blank/i,
  );
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE t3 ([] TEXT)'),
    /column name|empty|blank/i,
  );
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE t4 (`` TEXT)'),
    /column name|empty|blank/i,
  );
  assert.throws(
    () => userdb.createTable(id, 'CREATE TABLE t5 ([  ] TEXT)'),
    /column name|empty|blank/i,
  );
  assert.deepEqual(userTables(tempRoot, id), []);
});

withUserDB('accepts valid CREATE TABLE and IF NOT EXISTS', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE sales (region TEXT, amount INTEGER)');
  userdb.createTable(id, 'CREATE TABLE IF NOT EXISTS sales (region TEXT, amount INTEGER)');
  userdb.createTable(id, 'CREATE TABLE "Quoted Name" ("Col A" TEXT)');
  userdb.createTable(id, 'CREATE TABLE [Bracket Name] ([Col B] TEXT)');
  userdb.createTable(id, 'CREATE TABLE `Tick Name` (`Col C` TEXT)');

  assert.deepEqual(userTables(tempRoot, id), ['Bracket Name', 'Quoted Name', 'Tick Name', 'sales']);
  const db = new Database(path.join(tempRoot, 'userdb', `${id}.db`));
  try {
    assert.deepEqual(db.pragma('table_info(sales)').map((c) => c.name), ['region', 'amount']);
    assert.deepEqual(db.pragma('table_info("Quoted Name")').map((c) => c.name), ['Col A']);
    assert.deepEqual(db.pragma('table_info([Bracket Name])').map((c) => c.name), ['Col B']);
    assert.deepEqual(db.pragma('table_info(`Tick Name`)').map((c) => c.name), ['Col C']);
  } finally {
    db.close();
  }
});
