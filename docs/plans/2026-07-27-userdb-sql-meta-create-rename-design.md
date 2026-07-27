# UserDB SQL Console Meta Create / Rename-Into Protection Design

## Mainline

This design starts from authoritative `origin/master@0b9abbb` (after #99/#101) and addresses Issue #102.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Meta integrity for `__col_comments` now covers:

- Managed drop/rename, row ops, export/addColumn.
- SQL console DROP TABLE, any ALTER targeting meta, CREATE INDEX ON meta, and DML (INSERT/UPDATE/DELETE/REPLACE) via `assertUserDBSqlDoesNotMutateMeta` (#80/#82/#93/#95/#96/#98).

Post-#98 probes of shipped `assertUserDBSqlDoesNotMutateMeta` still **allow creating or renaming into** the reserved name:

| Statement | Result |
|-----------|--------|
| `CREATE TABLE __col_comments (...)` | allowed |
| `CREATE TABLE IF NOT EXISTS __col_comments (...)` | allowed |
| `ALTER TABLE users RENAME TO __col_comments` | allowed |
| Quoted / case variants of the above | allowed |

These statements never target the existing meta table as a source, so source-table matchers miss them. After success:

1. Product helpers that hard-expect meta columns (`table_name`, `col_name`, `comment`) break or write into a user-shaped table.
2. Schema list filters that hide `__col_comments` can hide real user data that was renamed into the reserved name.
3. Later DROP/DML protections become confused about which object is product meta.

## Invariant

`executeUserDBSQL` must never create a table whose name is reserved `__col_comments`, and must never rename any table **to** that reserved name. Existing refusals for DROP/ALTER-on-meta/INDEX/DML remain. Read-only `SELECT` on meta remains allowed. User-table CREATE and RENAME TO non-reserved names remain allowed.

## Chosen Design

### Extend the existing console guard only

In `assertUserDBSqlDoesNotMutateMeta` (`src/main/sqlReadOnlyGuard.ts`):

1. **Add** `CREATE TABLE [IF NOT EXISTS] [schema.]ident …` capture of the created table name; refuse when reserved.
2. **Add** `ALTER TABLE [schema.]ident RENAME TO [schema.]ident` capture of the **destination** name; refuse when destination is reserved.
3. Keep existing DROP / ALTER-source / CREATE INDEX / DML matchers unchanged.
4. Reuse the same identifier unquoting and case-insensitive reserved-name check used by prior cycles.

Error message: keep the generalized reserved-table wording (`Cannot drop, rename, or mutate reserved table __col_comments`).

Single call site remains `executeUserDBSQL` before `prepare`/`run`.

### Scope boundaries

| In scope | Out of scope |
|----------|--------------|
| CREATE TABLE of reserved name | Full SQLite authorizer |
| ALTER … RENAME TO reserved name | Blocking SELECT on meta |
| Quoted / bare / IF NOT EXISTS / optional schema | CREATE VIEW/TRIGGER with reserved names (follow-up if needed) |
| Product CJS tests on `executeUserDBSQL` | Managed API renames (already covered) |

## Alternatives Rejected

### SQLite authorizer

More complete; heavier than extending the established guard. Follow-up if bypasses remain after create/rename-into are closed.

### Block all CREATE TABLE in SQL console

Breaks legitimate user schema work from the management SQL console.

### Only block CREATE when meta already exists

Still allows first-create pollution before product helpers seed meta, and still allows rename-into.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| CREATE TABLE false positives on user tables | Exact reserved name only |
| RENAME TO matcher collides with RENAME COLUMN | Match `RENAME TO` destination form specifically, not `RENAME COLUMN` |
| Message / test regex drift | Keep `/reserved|__col_comments/i` |
| Temporary tables / schema-qualified names | Optional schema + quoted identifier support already used by meta matchers |

## Verification Strategy

1. RED on `origin/master`: `CREATE TABLE __col_comments` and `ALTER TABLE users RENAME TO __col_comments` succeed (or at least pass the guard).
2. GREEN product tests: both refuse via `executeUserDBSQL`; meta rows and user table remain intact.
3. Controls: `CREATE TABLE ok_users (...)` and `ALTER TABLE users RENAME TO users2` still work; meta SELECT still works.
4. Existing DROP/DML/schema suite remains green.
5. Full CJS suite and both TypeScript compilers.
