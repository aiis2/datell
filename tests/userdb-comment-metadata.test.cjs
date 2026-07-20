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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-cmt-'));
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

function listComments(db) {
  return db.prepare(
    'SELECT table_name, col_name, comment FROM __col_comments ORDER BY table_name, col_name'
  ).all();
}

withUserDB('keeps column comments aligned across rename and drop mutations', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE t(a TEXT, b TEXT)');
  userdb.alterColumn(id, 't', 'a', undefined, 'comment-a');
  userdb.alterColumn(id, 't', 'b', undefined, 'comment-b');

  userdb.renameTable(id, 't', 't2');
  userdb.renameColumn(id, 't2', 'a', 'a2');
  userdb.dropColumn(id, 't2', 'b');

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(listComments(db), [
      { table_name: 't2', col_name: 'a2', comment: 'comment-a' },
    ]);
  } finally {
    db.close();
  }

  userdb.dropTable(id, 't2');

  const db2 = openRaw(tempRoot, id);
  try {
    assert.deepEqual(listComments(db2), []);
  } finally {
    db2.close();
  }
});

withUserDB('preserves comments when only the table is renamed', (userdb, id, tempRoot) => {
  userdb.createTable(id, 'CREATE TABLE alpha(x TEXT, y TEXT)');
  userdb.alterColumn(id, 'alpha', 'x', undefined, 'x-note');
  userdb.alterColumn(id, 'alpha', 'y', undefined, 'y-note');
  userdb.renameTable(id, 'alpha', 'beta');

  const db = openRaw(tempRoot, id);
  try {
    assert.deepEqual(listComments(db), [
      { table_name: 'beta', col_name: 'x', comment: 'x-note' },
      { table_name: 'beta', col_name: 'y', comment: 'y-note' },
    ]);
  } finally {
    db.close();
  }
});
