const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const datasourcePath = path.join(root, 'src', 'main', 'datasource.ts');

function loadDatasource(tempRoot) {
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

  const mocks = {
    './dataDir': { getDataDir: () => tempRoot },
    './userdb': {
      listUserDBs: () => [],
      getUserDBSchema: () => ({ tables: [] }),
      executeUserDBSQL: () => ({ columns: [], rows: [], rowCount: 0, executionMs: 0 }),
      getUserDBTableData: () => ({ columns: [], rows: [], rowCount: 0 }),
    },
    './sqlReadOnlyGuard': { isReadOnlyDatasourceSql: () => true },
  };

  Module._load = function loadWithMocks(request, parent, isMain) {
    if (parent?.filename === datasourcePath && Object.hasOwn(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[datasourcePath];
  const datasource = require(datasourcePath);

  return {
    datasource,
    restore() {
      delete require.cache[datasourcePath];
      Module._load = originalLoad;
      if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
      else delete require.extensions['.ts'];
    },
  };
}

function baseConfig(overrides = {}) {
  return {
    id: 'ds-1',
    name: 'Orders',
    type: 'mysql',
    host: 'db.example.com',
    port: 3306,
    database: 'analytics',
    username: 'reader',
    password: 'secret',
    options: {},
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

test('saveDatasource refuses blank identity fields and invalid ports', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-ds-save-'));
  const harness = loadDatasource(tempRoot);
  try {
    const { datasource } = harness;

    assert.throws(
      () => datasource.saveDatasource(baseConfig({ name: '   ' })),
      /name cannot be empty or blank/i,
    );
    assert.throws(
      () => datasource.saveDatasource(baseConfig({ host: '' })),
      /host cannot be empty or blank/i,
    );
    assert.throws(
      () => datasource.saveDatasource(baseConfig({ database: '\t' })),
      /database cannot be empty or blank/i,
    );

    for (const port of [-1, 0, 1.5, 65536, Number.NaN]) {
      assert.throws(
        () => datasource.saveDatasource(baseConfig({ port })),
        /port must be an integer between 1 and 65535/i,
      );
    }

    // Nothing invalid was persisted.
    assert.deepEqual(datasource.getAllDatasources(), []);
  } finally {
    harness.restore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('saveDatasource trims identity fields and preserves masked passwords', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-ds-save-ok-'));
  const harness = loadDatasource(tempRoot);
  try {
    const { datasource } = harness;

    const saved = datasource.saveDatasource(baseConfig({
      name: '  Orders  ',
      host: '  db.example.com ',
      database: ' analytics ',
      username: ' reader ',
      password: 'secret',
    }));

    assert.equal(saved.name, 'Orders');
    assert.equal(saved.password, datasource.MASKED_PW);

    const stored = datasource.getAllDatasources()[0];
    assert.equal(stored.name, 'Orders');
    assert.equal(stored.host, 'db.example.com');
    assert.equal(stored.database, 'analytics');
    assert.equal(stored.username, 'reader');
    assert.equal(stored.password, 'secret');
    assert.equal(stored.port, 3306);

    const updated = datasource.saveDatasource({
      ...stored,
      password: datasource.MASKED_PW,
      host: 'db2.example.com',
    });
    assert.equal(updated.host, 'db2.example.com');
    assert.equal(updated.password, datasource.MASKED_PW);
    assert.equal(datasource.getAllDatasources()[0].password, 'secret');
    assert.equal(datasource.getAllDatasources()[0].host, 'db2.example.com');
  } finally {
    harness.restore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
