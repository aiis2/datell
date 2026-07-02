require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');

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

console.log('security sql readonly guard ok');
