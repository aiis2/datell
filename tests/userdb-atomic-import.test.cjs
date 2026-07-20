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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-import-'));
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

withUserDB('imports a new table atomically', (userdb, id, tempRoot) => {
  const result = userdb.importTable(
    id,
    'sales',
    [
      { name: 'region', type: 'TEXT' },
      { name: 'amount', type: 'INTEGER' },
    ],
    [
      ['east', 10],
      ['west', 20],
    ],
  );
  assert.deepEqual(result, { inserted: 2 });

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(
      db.prepare('SELECT region, amount FROM sales ORDER BY region').all(),
      [
        { region: 'east', amount: 10 },
        { region: 'west', amount: 20 },
      ],
    );
  } finally {
    db.close();
  }
});

withUserDB('refuses re-import into an existing table by default', (userdb, id, tempRoot) => {
  userdb.importTable(
    id,
    'sales',
    [
      { name: 'region', type: 'TEXT' },
      { name: 'amount', type: 'TEXT' },
    ],
    [['east', '10']],
  );

  assert.throws(
    () => userdb.importTable(
      id,
      'sales',
      [
        { name: 'region', type: 'TEXT' },
        { name: 'amount', type: 'TEXT' },
      ],
      [['west', '20']],
    ),
    /already exists/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(db.prepare('SELECT region, amount FROM sales').all(), [
      { region: 'east', amount: '10' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('replace mode drops and recreates the table', (userdb, id, tempRoot) => {
  userdb.importTable(
    id,
    'sales',
    [
      { name: 'region', type: 'TEXT' },
      { name: 'amount', type: 'TEXT' },
    ],
    [['east', '10']],
  );

  const result = userdb.importTable(
    id,
    'sales',
    [
      { name: 'region', type: 'TEXT' },
      { name: 'amount', type: 'TEXT' },
      { name: 'extra', type: 'TEXT' },
    ],
    [['north', '1', 'x']],
    { ifExists: 'replace' },
  );
  assert.deepEqual(result, { inserted: 1 });

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(
      db.prepare('PRAGMA table_info(sales)').all().map((c) => c.name),
      ['region', 'amount', 'extra'],
    );
    assert.deepEqual(db.prepare('SELECT * FROM sales').all(), [
      { region: 'north', amount: '1', extra: 'x' },
    ]);
  } finally {
    db.close();
  }
});

withUserDB('rejects empty duplicate columns and row width mismatches before mutation', (userdb, id, tempRoot) => {
  assert.throws(
    () => userdb.importTable(id, 't', [{ name: '', type: 'TEXT' }], [['a']]),
    /column name|empty|blank/i,
  );
  assert.throws(
    () => userdb.importTable(
      id,
      't',
      [
        { name: 'a', type: 'TEXT' },
        { name: 'A', type: 'TEXT' },
      ],
      [['1', '2']],
    ),
    /duplicate/i,
  );
  assert.throws(
    () => userdb.importTable(
      id,
      't',
      [{ name: 'a', type: 'TEXT' }],
      [['only', 'extra']],
    ),
    /row|column|width|length/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(
      db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__col_comments'`,
      ).all(),
      [],
    );
  } finally {
    db.close();
  }
});

withUserDB('rolls back a new table when insert fails', (userdb, id, tempRoot) => {
  assert.throws(
    () => userdb.importTable(
      id,
      'scores',
      [
        { name: 'id', type: 'INTEGER' },
        { name: 'v', type: 'INTEGER NOT NULL UNIQUE' },
      ],
      [
        [1, 10],
        [2, 10],
      ],
    ),
    /UNIQUE|constraint/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='scores'`).get(),
      undefined,
    );
  } finally {
    db.close();
  }
});
