# UserDB SQL Console Meta TEMP / VIEW / WITH-CREATE Protection Design

## Mainline

This design starts from authoritative `origin/master@f0e48c1` (after #102/#104) and addresses Issue #105.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Meta integrity for `__col_comments` now covers DROP, ALTER-on-meta, CREATE INDEX ON meta, DML, plain CREATE TABLE, and RENAME TO reserved (#80–#104).

Post-#104 probes of shipped `assertUserDBSqlDoesNotMutateMeta` still allow:

| Statement | Result |
|-----------|--------|
| `CREATE TEMP TABLE __col_comments (...)` | allowed |
| `CREATE TEMPORARY TABLE __col_comments (...)` | allowed |
| `CREATE VIEW __col_comments AS …` | allowed |
| `WITH x AS (SELECT 1) CREATE TABLE __col_comments (...)` | allowed |

TEMP tables shadow permanent names for the connection. Views occupy the reserved name in the catalog. CTE-prefixed CREATE TABLE bypasses the post-#104 CREATE matcher because it only anchors at statement start without `WITH_PREFIX`.

## Invariant

`executeUserDBSQL` must refuse any CREATE TABLE (temp or permanent, with or without WITH prefix / IF NOT EXISTS) and any CREATE VIEW whose created object name is reserved `__col_comments`. Existing meta protections remain. Non-reserved TEMP/VIEW/CREATE remain allowed.

## Chosen Design

### Extend CREATE TABLE matcher; add CREATE VIEW matcher

In `assertUserDBSqlDoesNotMutateMeta` (`src/main/sqlReadOnlyGuard.ts`):

1. **Broaden CREATE TABLE** to:
   - optional leading `WITH … )` prefix (reuse `WITH_PREFIX`);
   - optional `TEMP` / `TEMPORARY` between `CREATE` and `TABLE`;
   - optional `IF NOT EXISTS`;
   - optional schema-qualified identifier;
   - refuse when the table name is reserved.
2. **Add CREATE VIEW** matcher:
   - `CREATE VIEW [IF NOT EXISTS] [schema.]ident …`
   - refuse when the view name is reserved.
3. Keep DROP / ALTER / INDEX / DML / RENAME TO destination matchers.

Error message: keep `Cannot drop, rename, or mutate reserved table __col_comments`.

Single call site remains `executeUserDBSQL`.

### Scope boundaries

| In scope | Out of scope |
|----------|--------------|
| TEMP/TEMPORARY CREATE TABLE reserved | Trigger-body static analysis |
| CREATE VIEW reserved | DROP VIEW/INDEX by opaque names only |
| WITH-prefixed CREATE TABLE reserved | Column names equal to reserved table |
| Product CJS on `executeUserDBSQL` | Full authorizer |

## Alternatives Rejected

### Authorizer

More complete; heavier than extending the established guard after each high-value bypass.

### Block all TEMP tables

Breaks legitimate scratch work in the SQL console.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| WITH_PREFIX too greedy | Same non-greedy `)\\s+` form already used for DML; tests cover WITH CREATE |
| TEMP false positives | Reserved name only |
| CREATE VIEW AS SELECT from meta still allowed for other view names | Only refuse reserved view name |

## Verification Strategy

1. RED: TEMP CREATE, VIEW CREATE, WITH CREATE of reserved name currently succeed or pass the guard.
2. GREEN: all three refuse via `executeUserDBSQL`; non-reserved TEMP/VIEW/CREATE still work.
3. Existing meta suite remains green.
4. Full CJS suite + both TypeScript compilers.
