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

function withHarness(name, fn) {
  return test(name, async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-id-'));
    const harness = loadUserDB(tempRoot);
    try {
      await fn(harness.userdb, tempRoot);
    } finally {
      for (const cfg of harness.userdb.listUserDBs()) {
        try { harness.userdb.deleteUserDB(cfg.id); } catch { /* ignore */ }
      }
      harness.restore();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
}

function openRaw(tempRoot, id) {
  return new Database(path.join(tempRoot, 'userdb', `${id}.db`));
}

withHarness('rejects empty or blank createUserDB names', (userdb) => {
  assert.throws(() => userdb.createUserDB(''), /empty|blank/i);
  assert.throws(() => userdb.createUserDB('   '), /empty|blank/i);
  assert.equal(userdb.listUserDBs().length, 0);
});

withHarness('rejects empty renameTable targets and preserves original table', (userdb, tempRoot) => {
  const id = userdb.createUserDB('db1').id;
  userdb.createTable(id, 'CREATE TABLE sales (x TEXT)');

  assert.throws(() => userdb.renameTable(id, 'sales', ''), /empty|blank|name/i);
  assert.throws(() => userdb.renameTable(id, 'sales', '  '), /empty|blank|name/i);
  assert.throws(() => userdb.renameTable(id, 'sales', '__col_comments'), /reserved|invalid|unknown|meta/i);

  const db = openRaw(tempRoot, id);
  try {
    const names = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    ).all().map((r) => r.name);
    assert.deepEqual(names, ['sales']);
  } finally {
    db.close();
  }
});

withHarness('rejects empty renameColumn targets and preserves original column', (userdb, tempRoot) => {
  const id = userdb.createUserDB('db2').id;
  userdb.createTable(id, 'CREATE TABLE t (a TEXT, b TEXT)');

  assert.throws(() => userdb.renameColumn(id, 't', 'a', ''), /empty|blank|name/i);
  assert.throws(() => userdb.renameColumn(id, 't', 'a', '  '), /empty|blank|name/i);

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(
      db.pragma('table_info(t)').map((c) => c.name),
      ['a', 'b'],
    );
  } finally {
    db.close();
  }
});

withHarness('allows a valid rename after validation', (userdb, tempRoot) => {
  const id = userdb.createUserDB('db3').id;
  userdb.createTable(id, 'CREATE TABLE t (a TEXT)');
  userdb.renameTable(id, 't', 't2');
  userdb.renameColumn(id, 't2', 'a', 'a2');

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name),
      ['t2'],
    );
    assert.deepEqual(db.pragma('table_info(t2)').map((c) => c.name), ['a2']);
  } finally {
    db.close();
  }
});
