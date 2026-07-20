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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-cell-'));
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

function firstLocator(userdb, id, table) {
  const data = userdb.getUserDBTableData(id, table, 10, 0);
  assert.ok(data.rowLocators[0], 'expected row locator');
  return data.rowLocators[0];
}

withUserDB('empty string becomes NULL on nullable INTEGER', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (id INTEGER PRIMARY KEY, amount INTEGER)');
  userdb.batchInsert(id, 't', ['id', 'amount'], [[1, 10]]);
  const loc = firstLocator(userdb, id, 't');
  userdb.updateRow(id, 't', loc, { amount: '' });

  const db = openRaw(tempRoot, id);
  try {
    const row = db.prepare('SELECT amount, typeof(amount) AS t FROM t WHERE id = 1').get();
    assert.equal(row.amount, null);
    assert.equal(row.t, 'null');
  } finally {
    db.close();
  }
});

withUserDB('empty string rejected on INTEGER NOT NULL and row unchanged', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)');
  userdb.batchInsert(id, 't', ['id', 'amount'], [[1, 10]]);
  const loc = firstLocator(userdb, id, 't');
  assert.throws(
    () => userdb.updateRow(id, 't', loc, { amount: '' }),
    /empty|NOT NULL|numeric/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    const row = db.prepare('SELECT amount, typeof(amount) AS t FROM t WHERE id = 1').get();
    assert.equal(row.amount, 10);
    assert.equal(row.t, 'integer');
  } finally {
    db.close();
  }
});

withUserDB('coerces valid integer strings and rejects invalid ones', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (id INTEGER PRIMARY KEY, amount INTEGER)');
  userdb.batchInsert(id, 't', ['id', 'amount'], [[1, 1]]);
  const loc = firstLocator(userdb, id, 't');
  userdb.updateRow(id, 't', loc, { amount: '42' });
  assert.throws(
    () => userdb.updateRow(id, 't', loc, { amount: 'abc' }),
    /integer|invalid/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    const row = db.prepare('SELECT amount, typeof(amount) AS t FROM t WHERE id = 1').get();
    assert.equal(row.amount, 42);
    assert.equal(row.t, 'integer');
  } finally {
    db.close();
  }
});

withUserDB('empty string on nullable TEXT becomes NULL; NOT NULL TEXT keeps empty string', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (id INTEGER PRIMARY KEY, note TEXT, title TEXT NOT NULL DEFAULT \'\')');
  userdb.batchInsert(id, 't', ['id', 'note', 'title'], [[1, 'hi', 't']]);
  const loc = firstLocator(userdb, id, 't');
  userdb.updateRow(id, 't', loc, { note: '' });
  userdb.updateRow(id, 't', loc, { title: '' });

  const db = openRaw(tempRoot, id);
  try {
    const row = db.prepare(
      'SELECT note, typeof(note) AS tn, title, typeof(title) AS tt FROM t WHERE id = 1',
    ).get();
    assert.equal(row.note, null);
    assert.equal(row.tn, 'null');
    assert.equal(row.title, '');
    assert.equal(row.tt, 'text');
  } finally {
    db.close();
  }
});

withUserDB('REAL accepts numeric strings and rejects garbage', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t (id INTEGER PRIMARY KEY, price REAL)');
  userdb.batchInsert(id, 't', ['id', 'price'], [[1, 1.0]]);
  const loc = firstLocator(userdb, id, 't');
  userdb.updateRow(id, 't', loc, { price: '1.5' });
  assert.throws(
    () => userdb.updateRow(id, 't', loc, { price: 'x' }),
    /numeric|invalid/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    const row = db.prepare('SELECT price, typeof(price) AS t FROM t WHERE id = 1').get();
    assert.equal(row.price, 1.5);
    assert.equal(row.t, 'real');
  } finally {
    db.close();
  }
});
