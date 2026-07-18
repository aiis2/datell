require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
  isReadOnlyDatasourceSql,
  isReadOnlyUserDBSql,
} = require('../src/main/sqlReadOnlyGuard.ts');

assert.equal(isReadOnlyDatasourceSql('SELECT * FROM orders'), true, 'plain SELECT should be accepted');
assert.equal(isReadOnlyDatasourceSql('show tables'), true, 'SHOW should be accepted for external datasources');
assert.equal(isReadOnlyDatasourceSql('EXPLAIN SELECT * FROM orders'), true, 'EXPLAIN SELECT should be accepted');
assert.equal(
  isReadOnlyDatasourceSql('WITH latest AS (SELECT * FROM orders) SELECT * FROM latest'),
  true,
  'read-only CTEs should remain available',
);
assert.equal(
  isReadOnlyDatasourceSql('WITH deleted AS (DELETE FROM orders RETURNING *) SELECT * FROM deleted'),
  false,
  'data-modifying CTEs must not bypass external datasource read-only checks',
);
assert.equal(
  isReadOnlyDatasourceSql('SELECT * FROM orders; DROP TABLE orders'),
  false,
  'multiple statements should be rejected even when the first one is SELECT',
);

assert.equal(isReadOnlyUserDBSql('SELECT * FROM local_table'), true, 'user DB SELECT should be accepted');
assert.equal(isReadOnlyUserDBSql('PRAGMA table_info(local_table)'), true, 'safe user DB PRAGMA should be accepted');
assert.equal(
  isReadOnlyUserDBSql('PRAGMA writable_schema = 1'),
  false,
  'unsafe SQLite PRAGMA should be rejected in read-only chat mode',
);
assert.equal(
  isReadOnlyUserDBSql('WITH changed AS (UPDATE local_table SET name = name RETURNING *) SELECT * FROM changed'),
  false,
  'SQLite data-modifying CTEs must not pass the chat-mode read-only guard',
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-sql-sop-'));
const dbPath = path.join(tempRoot, 'roundtrip.db');
const db = new Database(dbPath);
try {
  db.exec('CREATE TABLE verification (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  db.prepare('INSERT INTO verification (id, value) VALUES (?, ?)').run(1, 'persisted-sentinel');

  const guardedRead = 'SELECT value FROM verification WHERE id = 1';
  assert.equal(isReadOnlyUserDBSql(guardedRead), true, 'forward SOP read should pass the chat guard');
  assert.equal(
    db.prepare(guardedRead).get().value,
    'persisted-sentinel',
    'authorized management write must round-trip through an allowed read',
  );

  const rejectedWrite = `UPDATE verification SET value = 'mutated' WHERE id = 1`;
  assert.equal(isReadOnlyUserDBSql(rejectedWrite), false, 'reverse SOP write should be rejected by the chat guard');
  if (isReadOnlyUserDBSql(rejectedWrite)) db.prepare(rejectedWrite).run();
  assert.equal(
    db.prepare(guardedRead).get().value,
    'persisted-sentinel',
    'rejected writes must leave persisted data unchanged',
  );
} finally {
  db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('security sql readonly guard ok');
