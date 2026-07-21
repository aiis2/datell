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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-itc-'));
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

withUserDB('importTable empty string becomes NULL on nullable INTEGER', (userdb, id, tempRoot) => {
  userdb.importTable(
    id,
    't',
    [
      { name: 'id', type: 'INTEGER' },
      { name: 'amount', type: 'INTEGER' },
    ],
    [[1, '']],
  );

  const db = openRaw(tempRoot, id);
  try {
    const row = db.prepare('SELECT amount, typeof(amount) AS t FROM t WHERE id = 1').get();
    assert.equal(row.amount, null);
    assert.equal(row.t, 'null');
  } finally {
    db.close();
  }
});

withUserDB('importTable rejects invalid integer string without leaving residual table', (userdb, id, tempRoot) => {
  assert.throws(
    () => userdb.importTable(
      id,
      'bad_imp',
      [
        { name: 'id', type: 'INTEGER' },
        { name: 'amount', type: 'INTEGER' },
      ],
      [[1, 'abc'], [2, '30']],
    ),
    /integer|invalid/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='bad_imp'",
    ).all();
    assert.equal(tables.length, 0);
  } finally {
    db.close();
  }
});

withUserDB('importTable rejects empty on INTEGER NOT NULL without residual table', (userdb, id, tempRoot) => {
  assert.throws(
    () => userdb.importTable(
      id,
      'nn_imp',
      [
        { name: 'id', type: 'INTEGER' },
        { name: 'amount', type: 'INTEGER NOT NULL' },
      ],
      [[1, '']],
    ),
    /empty|NOT NULL|numeric/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='nn_imp'",
    ).all();
    assert.equal(tables.length, 0);
  } finally {
    db.close();
  }
});

withUserDB('importTable coerces valid integer and real strings', (userdb, id, tempRoot) => {
  userdb.importTable(
    id,
    't',
    [
      { name: 'id', type: 'INTEGER' },
      { name: 'amount', type: 'INTEGER' },
      { name: 'price', type: 'REAL' },
    ],
    [[1, '42', '1.5']],
  );

  const db = openRaw(tempRoot, id);
  try {
    const row = db.prepare(
      'SELECT amount, typeof(amount) AS ta, price, typeof(price) AS tp FROM t WHERE id = 1',
    ).get();
    assert.equal(row.amount, 42);
    assert.equal(row.ta, 'integer');
    assert.equal(row.price, 1.5);
    assert.equal(row.tp, 'real');
  } finally {
    db.close();
  }
});

withUserDB('importTable TEXT empty becomes NULL when nullable; NOT NULL keeps empty string', (userdb, id, tempRoot) => {
  userdb.importTable(
    id,
    't',
    [
      { name: 'id', type: 'INTEGER' },
      { name: 'note', type: 'TEXT' },
      { name: 'title', type: 'TEXT NOT NULL' },
    ],
    [[1, '', '']],
  );

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

withUserDB('importTable multi-row success remains fully transactional', (userdb, id, tempRoot) => {
  const result = userdb.importTable(
    id,
    't',
    [
      { name: 'id', type: 'INTEGER' },
      { name: 'amount', type: 'INTEGER' },
    ],
    [
      [1, '1'],
      [2, '2'],
      [3, '3'],
    ],
  );
  assert.equal(result.inserted, 3);

  const db = openRaw(tempRoot, id);
  try {
    const rows = db.prepare('SELECT id, amount, typeof(amount) AS t FROM t ORDER BY id').all();
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.t === 'integer'));
  } finally {
    db.close();
  }
});

withUserDB('importTable replace with invalid payload leaves prior table intact', (userdb, id, tempRoot) => {
  userdb.importTable(
    id,
    'sales',
    [
      { name: 'region', type: 'TEXT' },
      { name: 'amount', type: 'INTEGER' },
    ],
    [['east', 10]],
  );

  assert.throws(
    () => userdb.importTable(
      id,
      'sales',
      [
        { name: 'region', type: 'TEXT' },
        { name: 'amount', type: 'INTEGER' },
      ],
      [['west', 'abc']],
      { ifExists: 'replace' },
    ),
    /integer|invalid/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    const rows = db.prepare('SELECT region, amount, typeof(amount) AS t FROM sales').all();
    assert.deepEqual(rows, [{ region: 'east', amount: 10, t: 'integer' }]);
  } finally {
    db.close();
  }
});
