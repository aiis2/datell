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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-batch-'));
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

withUserDB('rolls back the entire batchInsert call on later constraint failure', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE items (code TEXT UNIQUE)');
  // Pre-existing row must remain after a failed batch.
  userdb.batchInsert(id, 'items', ['code'], [['keep']]);

  // 600 unique values + a duplicate of the first — spans >500 so old per-chunk
  // transactions would commit the first chunk before the failure.
  const rows = [];
  for (let i = 0; i < 600; i++) rows.push([`v${i}`]);
  rows.push(['v0']); // UNIQUE failure after 600 successful inserts in same call

  assert.throws(
    () => userdb.batchInsert(id, 'items', ['code'], rows),
    /UNIQUE|constraint/i,
  );

  const db = openRaw(tempRoot, id);
  try {
    const codes = db.prepare('SELECT code FROM items ORDER BY code').all().map((r) => r.code);
    assert.deepEqual(codes, ['keep'], 'failed batchInsert must not leave partial rows');
  } finally {
    db.close();
  }
});

withUserDB('inserts more than one chunk atomically on success', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE nums (n INTEGER PRIMARY KEY)');
  const rows = [];
  for (let i = 0; i < 1200; i++) rows.push([i]);
  const result = userdb.batchInsert(id, 'nums', ['n'], rows);
  assert.deepEqual(result, { inserted: 1200 });

  const db = openRaw(tempRoot, id);
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM nums').get().c, 1200);
  } finally {
    db.close();
  }
});

withUserDB('empty batchInsert returns zero without error', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE t (a TEXT)');
  assert.deepEqual(userdb.batchInsert(id, 't', ['a'], []), { inserted: 0 });
});
