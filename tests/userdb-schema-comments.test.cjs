const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-schema-cmt-'));
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

function findTable(schema, tableName) {
  return schema.tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
}

function findColumn(table, colName) {
  return table.columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
}

withUserDB('getUserDBSchema returns comments set via alterColumn', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE sales (region TEXT, amount INTEGER)');
  userdb.alterColumn(id, 'sales', 'amount', undefined, 'USD cents');

  const schema = userdb.getUserDBSchema(id, { limit: 100 });
  const sales = findTable(schema, 'sales');
  assert.ok(sales, 'sales table present');
  assert.equal(findColumn(sales, 'amount')?.comment, 'USD cents');
  assert.equal(findColumn(sales, 'region')?.comment ?? '', '');
});

withUserDB('schema comments follow renameTable and renameColumn', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE t (a TEXT, b TEXT)');
  userdb.alterColumn(id, 't', 'a', undefined, 'alpha');
  userdb.alterColumn(id, 't', 'b', undefined, 'beta');

  userdb.renameTable(id, 't', 't2');
  userdb.renameColumn(id, 't2', 'a', 'a2');

  const schema = userdb.getUserDBSchema(id, { limit: 100 });
  const table = findTable(schema, 't2');
  assert.ok(table);
  assert.equal(findColumn(table, 'a2')?.comment, 'alpha');
  assert.equal(findColumn(table, 'b')?.comment, 'beta');
  assert.equal(findTable(schema, 't'), undefined);
});

withUserDB('schema drops comments for removed columns and hides __col_comments', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE t (a TEXT, b TEXT)');
  userdb.alterColumn(id, 't', 'a', undefined, 'keep-me');
  userdb.alterColumn(id, 't', 'b', undefined, 'drop-me');
  userdb.dropColumn(id, 't', 'b');

  const schema = userdb.getUserDBSchema(id, { limit: 100 });
  assert.equal(
    schema.tables.some((t) => t.name === '__col_comments'),
    false,
    '__col_comments must not appear as a user table',
  );
  const table = findTable(schema, 't');
  assert.ok(table);
  assert.equal(findColumn(table, 'a')?.comment, 'keep-me');
  assert.equal(findColumn(table, 'b'), undefined);

  const listed = userdb.listUserDBs().find((c) => c.id === id);
  assert.ok(listed);
  // Only the user table `t` should count — not __col_comments.
  assert.equal(listed.tableCount, 1);
});

withUserDB('tableCount ignores __col_comments after comments exist', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE only_user (x TEXT)');
  userdb.alterColumn(id, 'only_user', 'x', undefined, 'note');

  const listed = userdb.listUserDBs().find((c) => c.id === id);
  assert.equal(listed.tableCount, 1);

  const schema = userdb.getUserDBSchema(id, { limit: 100 });
  assert.equal(schema.total, 1);
  assert.deepEqual(schema.tables.map((t) => t.name), ['only_user']);
});
