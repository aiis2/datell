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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-drop-'));
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

function indexNames(db, tableName) {
  return db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL ORDER BY name`
  ).all(tableName).map((row) => row.name);
}

withUserDB('drops a column referenced by a secondary index and keeps unrelated indexes', (userdb, id, tempRoot) => {
  userdb.createTable(id, `CREATE TABLE sales (
    id INTEGER PRIMARY KEY,
    amount INTEGER,
    note TEXT
  )`);
  userdb.batchInsert(id, 'sales', ['id', 'amount', 'note'], [[1, 10, 'kept']]);

  const raw = openRaw(tempRoot, id);
  raw.exec('CREATE INDEX idx_sales_amount ON sales(amount)');
  raw.exec('CREATE INDEX idx_sales_note ON sales(note)');
  raw.close();

  userdb.dropColumn(id, 'sales', 'amount');

  const db = openRaw(tempRoot, id);
  try {
    const cols = db.prepare('PRAGMA table_info(sales)').all().map((c) => c.name);
    assert.deepEqual(cols, ['id', 'note']);
    assert.deepEqual(
      db.prepare('SELECT id, note FROM sales ORDER BY id').all(),
      [{ id: 1, note: 'kept' }]
    );
    assert.deepEqual(indexNames(db, 'sales'), ['idx_sales_note']);
  } finally {
    db.close();
  }
});

withUserDB('removes multi-column indexes that include the dropped column', (userdb, id, tempRoot) => {
  userdb.createTable(id, `CREATE TABLE metrics (
    id INTEGER PRIMARY KEY,
    region TEXT,
    year INTEGER,
    value REAL
  )`);
  userdb.batchInsert(id, 'metrics', ['id', 'region', 'year', 'value'], [[1, 'east', 2024, 1.5]]);

  const raw = openRaw(tempRoot, id);
  raw.exec('CREATE INDEX idx_metrics_region_year ON metrics(region, year)');
  raw.exec('CREATE INDEX idx_metrics_value ON metrics(value)');
  raw.close();

  userdb.dropColumn(id, 'metrics', 'region');

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(
      db.prepare('PRAGMA table_info(metrics)').all().map((c) => c.name),
      ['id', 'year', 'value']
    );
    assert.deepEqual(indexNames(db, 'metrics'), ['idx_metrics_value']);
    assert.deepEqual(
      db.prepare('SELECT id, year, value FROM metrics').all(),
      [{ id: 1, year: 2024, value: 1.5 }]
    );
  } finally {
    db.close();
  }
});

withUserDB('drops quoted identifier columns that are indexed', (userdb, id, tempRoot) => {
  userdb.createTable(id, `CREATE TABLE "Order Items" (
    "Item Id" INTEGER PRIMARY KEY,
    "Unit Price" REAL,
    "Note" TEXT
  )`);
  userdb.batchInsert(id, 'Order Items', ['Item Id', 'Unit Price', 'Note'], [[1, 9.5, 'n']]);

  const raw = openRaw(tempRoot, id);
  raw.exec('CREATE INDEX "idx_order_price" ON "Order Items"("Unit Price")');
  raw.exec('CREATE INDEX "idx_order_note" ON "Order Items"("Note")');
  raw.close();

  userdb.dropColumn(id, 'Order Items', 'Unit Price');

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(
      db.prepare('PRAGMA table_info("Order Items")').all().map((c) => c.name),
      ['Item Id', 'Note']
    );
    assert.deepEqual(indexNames(db, 'Order Items'), ['idx_order_note']);
  } finally {
    db.close();
  }
});

withUserDB('rejects unknown tables and columns', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE t(a INTEGER, b TEXT)');
  assert.throws(() => userdb.dropColumn(id, 'missing', 'a'), /Unknown table|not found|no such table/i);
  assert.throws(() => userdb.dropColumn(id, 't', 'missing'), /Unknown column|no such column/i);
});

withUserDB('drops a column used only in a CHECK expression via rebuild fallback', (userdb, id, tempRoot) => {
  userdb.createTable(id, `CREATE TABLE scores (
    id INTEGER PRIMARY KEY,
    score INTEGER,
    bonus INTEGER,
    CHECK (score + bonus >= 0)
  )`);
  userdb.batchInsert(id, 'scores', ['id', 'score', 'bonus'], [[1, 3, 1]]);

  userdb.dropColumn(id, 'scores', 'bonus');

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(
      db.prepare('PRAGMA table_info(scores)').all().map((c) => c.name),
      ['id', 'score']
    );
    assert.deepEqual(
      db.prepare('SELECT id, score FROM scores').all(),
      [{ id: 1, score: 3 }]
    );
  } finally {
    db.close();
  }
});
