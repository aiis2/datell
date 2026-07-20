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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-export-'));
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

withUserDB('empty table CSV includes schema headers', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE empty_sales (region TEXT, amount INTEGER)');
  const csv = userdb.exportTableData(id, 'empty_sales', 'csv');
  assert.equal(csv, 'region,amount');
  assert.equal(userdb.exportTableData(id, 'empty_sales', 'json'), '[]');
});

withUserDB('export includes all rows without silent LIMIT truncation', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE nums (n INTEGER)');
  // Prove there is no hard-coded 100000 cap by exporting more than a tiny sample
  // and asserting the SQL path is not limited. We insert a moderate count and
  // also assert the source does not contain LIMIT 100000 (structural + behavioral).
  const rows = [];
  for (let i = 0; i < 1200; i++) rows.push([i]);
  userdb.batchInsert(id, 'nums', ['n'], rows);

  const csv = userdb.exportTableData(id, 'nums', 'csv');
  const lines = csv.split('\n');
  assert.equal(lines[0], 'n');
  assert.equal(lines.length, 1201); // header + 1200 data rows
  assert.equal(lines[1], '0');
  assert.equal(lines[1200], '1199');

  const json = JSON.parse(userdb.exportTableData(id, 'nums', 'json'));
  assert.equal(json.length, 1200);
  assert.equal(json[1199].n, 1199);

  const source = fs.readFileSync(userdbPath, 'utf8');
  assert.doesNotMatch(
    source,
    /SELECT \* FROM .+ LIMIT 100000/,
    'export must not silently cap at LIMIT 100000',
  );
});

withUserDB('unknown table throws on export', (userdb, id) => {
  assert.throws(
    () => userdb.exportTableData(id, 'missing_table', 'csv'),
    /unknown table/i,
  );
});

withUserDB('export escapes csv special characters', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE notes (title TEXT, body TEXT)');
  userdb.batchInsert(id, 'notes', ['title', 'body'], [
    ['a,b', 'say "hi"\nnext'],
  ]);
  const csv = userdb.exportTableData(id, 'notes', 'csv');
  assert.match(csv, /"a,b"/);
  assert.match(csv, /"say ""hi""\nnext"/);
});
