# UserDB SQL Console Meta VIRTUAL TABLE / TEMP VIEW Protection Design

## Mainline

This design starts from authoritative `origin/master@8486e2e` (after #105/#107) and addresses Issue #108.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Meta integrity for `__col_comments` now covers DROP, ALTER-on-meta, INDEX, DML, CREATE TABLE (plain/TEMP/WITH), RENAME TO, and plain CREATE VIEW (#80–#107).

Post-#107 probes still allow:

| Statement | Result |
|-----------|--------|
| `CREATE VIRTUAL TABLE __col_comments USING fts5(x)` | allowed |
| `CREATE TEMP VIEW __col_comments AS SELECT 1` | allowed |
| `CREATE TEMPORARY VIEW __col_comments AS SELECT 1` | allowed |
| `WITH x AS (SELECT 1) CREATE VIEW __col_comments AS …` | allowed |

`CREATE VIRTUAL TABLE` is not matched by `CREATE TABLE`. TEMP VIEW and WITH-prefixed CREATE VIEW are not matched by the plain CREATE VIEW regex.

## Invariant

`executeUserDBSQL` must refuse CREATE VIRTUAL TABLE and CREATE [TEMP|TEMPORARY] VIEW (with optional WITH / IF NOT EXISTS) when the created object name is reserved `__col_comments`. Non-reserved virtual tables and views remain allowed. Prior protections remain.

## Chosen Design

### Extend CREATE VIEW; add CREATE VIRTUAL TABLE

In `assertUserDBSqlDoesNotMutateMeta`:

1. Broaden CREATE VIEW to optional `WITH_PREFIX`, optional `TEMP`/`TEMPORARY`, optional `IF NOT EXISTS`, optional schema; refuse reserved name.
2. Add CREATE VIRTUAL TABLE matcher: `CREATE VIRTUAL TABLE [IF NOT EXISTS] [schema.]ident …`; refuse reserved name.
3. Keep CREATE TABLE / RENAME TO / DROP / DML / INDEX matchers.

Error message unchanged. Single call site remains `executeUserDBSQL`.

## Scope

In scope: VIRTUAL TABLE reserved name; TEMP/TEMPORARY VIEW reserved name; WITH-prefixed CREATE VIEW reserved name.

Out of scope: trigger-body analysis; ATTACH alias naming; authorizer rewrite.

## Verification Strategy

1. RED on current master for the four statements above.
2. GREEN product tests refuse them; non-reserved `CREATE VIRTUAL TABLE ok_fts …` / `CREATE TEMP VIEW ok_v …` still succeed (CREATE does not throw).
3. Full meta suite + full CJS + both tsc.
