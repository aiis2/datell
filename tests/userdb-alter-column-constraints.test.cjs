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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-alter-'));
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

function tableSql(db, tableName) {
  return db.prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`
  ).get(tableName)?.sql || '';
}

function indexSql(db, tableName) {
  return db.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL ORDER BY name`
  ).all(tableName);
}

withUserDB('preserves CHECK UNIQUE FOREIGN KEY and indexes when altering a column type', (userdb, id, tempRoot) => {
  userdb.createTable(id, `CREATE TABLE regions (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL
  )`);
  userdb.createTable(id, `CREATE TABLE sales (
    id INTEGER NOT NULL,
    region TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
    note TEXT,
    PRIMARY KEY (id),
    UNIQUE (region),
    FOREIGN KEY (region) REFERENCES regions(code)
  )`);
  userdb.batchInsert(id, 'regions', ['code', 'name'], [['east', 'East']]);
  userdb.batchInsert(id, 'sales', ['id', 'region', 'amount', 'note'], [[1, 'east', 10, 'a']]);

  const raw = openRaw(tempRoot, id);
  raw.exec('CREATE INDEX idx_sales_amount ON sales(amount)');
  raw.close();

  userdb.alterColumn(id, 'sales', 'note', 'TEXT');

  const db = openRaw(tempRoot, id);
  try {
    const sql = tableSql(db, 'sales');
    assert.match(sql, /CHECK\s*\(\s*amount\s*>=\s*0\s*\)/i);
    assert.match(sql, /UNIQUE\s*\(\s*region\s*\)/i);
    assert.match(sql, /FOREIGN\s+KEY\s*\(\s*region\s*\)\s*REFERENCES\s+regions\s*\(\s*code\s*\)/i);
    assert.deepEqual(
      indexSql(db, 'sales').map((row) => row.name),
      ['idx_sales_amount']
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_list(sales)').all().map((row) => row.table), ['regions']);
    assert.deepEqual(
      db.prepare('SELECT id, region, amount, note FROM sales ORDER BY id').all(),
      [{ id: 1, region: 'east', amount: 10, note: 'a' }]
    );
  } finally {
    db.close();
  }
});

withUserDB('preserves composite primary keys and WITHOUT ROWID', (userdb, id, tempRoot) => {
  userdb.createTable(id, `CREATE TABLE metrics (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    value REAL NOT NULL,
    label TEXT,
    PRIMARY KEY (year, month)
  ) WITHOUT ROWID`);
  userdb.batchInsert(id, 'metrics', ['year', 'month', 'value', 'label'], [[2024, 1, 1.5, 'jan']]);

  userdb.alterColumn(id, 'metrics', 'label', 'TEXT');

  const db = openRaw(tempRoot, id);
  try {
    const sql = tableSql(db, 'metrics');
    assert.match(sql, /PRIMARY\s+KEY\s*\(\s*year\s*,\s*month\s*\)/i);
    assert.match(sql, /WITHOUT\s+ROWID/i);
    const info = db.prepare('PRAGMA table_info(metrics)').all();
    assert.deepEqual(
      info.filter((col) => col.pk > 0).map((col) => col.name),
      ['year', 'month']
    );
  } finally {
    db.close();
  }
});

withUserDB('comment-only updates do not strip constraints', (userdb, id, tempRoot) => {
  userdb.createTable(id, `CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    qty INTEGER NOT NULL CHECK(qty > 0),
    note TEXT
  )`);
  userdb.batchInsert(id, 'items', ['id', 'qty', 'note'], [[1, 3, 'x']]);

  userdb.alterColumn(id, 'items', 'note', undefined, 'order note');

  const db = openRaw(tempRoot, id);
  try {
    const sql = tableSql(db, 'items');
    assert.match(sql, /CHECK\s*\(\s*qty\s*>\s*0\s*\)/i);
    const comment = db.prepare(
      'SELECT comment FROM __col_comments WHERE table_name = ? AND col_name = ?'
    ).get('items', 'note');
    assert.equal(comment?.comment, 'order note');
  } finally {
    db.close();
  }
});

withUserDB('rejects unknown tables and columns', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE t(a INTEGER, b TEXT)');
  assert.throws(() => userdb.alterColumn(id, 'missing', 'a', 'INTEGER'), /Unknown table|not found/i);
  assert.throws(() => userdb.alterColumn(id, 't', 'missing', 'TEXT'), /Unknown column/i);
});

withUserDB('rolls back when rewritten DDL is rejected', (userdb, id, tempRoot) => {
  userdb.createTable(id, `CREATE TABLE scores (
    id INTEGER PRIMARY KEY,
    score INTEGER NOT NULL CHECK(score >= 0),
    note TEXT
  )`);
  userdb.batchInsert(id, 'scores', ['id', 'score', 'note'], [[1, 10, 'ok']]);

  assert.throws(
    () => userdb.alterColumn(id, 'scores', 'note', 'TEXT CHECK('),
    /error|syntax|incomplete|near/i
  );

  const db = openRaw(tempRoot, id);
  try {
    const sql = tableSql(db, 'scores');
    assert.match(sql, /CHECK\s*\(\s*score\s*>=\s*0\s*\)/i);
    assert.deepEqual(
      db.prepare('SELECT id, score, note FROM scores').all(),
      [{ id: 1, score: 10, note: 'ok' }]
    );
  } finally {
    db.close();
  }
});

withUserDB('rewrites only the selected column type', (userdb, id, tempRoot) => {
  userdb.createTable(id, `CREATE TABLE "Order Items" (
    "Item Id" INTEGER NOT NULL,
    "Qty" INTEGER NOT NULL DEFAULT 1,
    "Note" TEXT,
    PRIMARY KEY ("Item Id"),
    CHECK ("Qty" >= 0)
  )`);
  userdb.batchInsert(id, 'Order Items', ['Item Id', 'Qty', 'Note'], [[1, 2, 'n']]);

  userdb.alterColumn(id, 'Order Items', 'Note', 'VARCHAR(200)');

  const db = openRaw(tempRoot, id);
  try {
    const sql = tableSql(db, 'Order Items');
    assert.match(sql, /"Note"\s+VARCHAR\(200\)/i);
    assert.match(sql, /"Qty"\s+INTEGER\s+NOT NULL\s+DEFAULT 1/i);
    assert.match(sql, /CHECK\s*\(\s*"Qty"\s*>=\s*0\s*\)/i);
    assert.match(sql, /PRIMARY\s+KEY\s*\(\s*"Item Id"\s*\)/i);
  } finally {
    db.close();
  }
});
