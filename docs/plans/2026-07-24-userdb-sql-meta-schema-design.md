# UserDB SQL Console Meta Schema Protection Design

## Mainline

This design starts from authoritative `origin/master@b07da68` (after #93/#95) and addresses Issue #96.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Meta integrity for `__col_comments` now covers:

- Managed drop/rename, row ops, export/addColumn.
- SQL console DROP TABLE, ALTER RENAME TO, and DML (INSERT/UPDATE/DELETE/REPLACE) via `assertUserDBSqlDoesNotMutateMeta` (#80/#82/#93/#95).

Post-#95 probes of shipped `executeUserDBSQL` still allow **schema** mutation of the reserved table:

| Statement | Result |
|-----------|--------|
| `ALTER TABLE __col_comments RENAME COLUMN comment TO comment2` | allowed — renames the column product helpers hard-expect |
| `ALTER TABLE __col_comments ADD COLUMN x TEXT` | allowed — pollutes internal schema |
| `ALTER TABLE __col_comments DROP COLUMN …` | attempted (fails after rename already broke `comment`) |
| `CREATE INDEX … ON __col_comments(…)` | allowed |

After a successful probe, meta columns became `[table_name, col_name, comment2, x]`. Comment rewrite/delete helpers bind fixed column names (`comment`, `table_name`, `col_name`) and would silently stop maintaining metadata.

The prior designs deliberately scoped DROP/RENAME-table and DML only. This cycle closes the residual schema hole on the same SQL console entry.

## Invariant

`executeUserDBSQL` must never run `ALTER TABLE` against `__col_comments` (any clause), and must refuse `CREATE INDEX` / `CREATE UNIQUE INDEX` whose `ON` target is `__col_comments`. Existing DROP/RENAME-table and DML refusals remain. Read-only `SELECT` on meta remains allowed. User-table ALTER/INDEX remains allowed.

## Chosen Design

### Broaden ALTER matching; add CREATE INDEX ON meta

In `assertUserDBSqlDoesNotMutateMeta` (`sqlReadOnlyGuard.ts`):

1. **Replace** the narrow `ALTER TABLE … RENAME TO` matcher with a broader `ALTER TABLE [schema.]ident …` matcher that captures the target table regardless of trailing clause (`RENAME TO`, `RENAME COLUMN`, `ADD COLUMN`, `DROP COLUMN`, etc.).
2. **Add** `CREATE [UNIQUE] INDEX … ON [schema.]ident` capture of the table after `ON`.
3. Keep DROP TABLE + DML matchers as today.
4. Same name matching: comment strip, optional schema, quoted/bare identifiers, case-insensitive reserved name.

Error message: keep the generalized reserved-table wording from #95 (`Cannot drop, rename, or mutate reserved table __col_comments`).

### Scope boundaries

| In scope | Out of scope |
|----------|--------------|
| Any ALTER TABLE targeting meta | Full authorizer / obscure index rename forms |
| CREATE [UNIQUE] INDEX ON meta | DROP INDEX by opaque product-generated names only |
| Single-statement console path | Blocking SELECT on meta |

`DROP INDEX` without an ON clause is harder without catalog lookup; defer unless a cheap product-owned naming convention exists. Prefer covering the high-value create path that attaches indexes to meta.

## Alternatives Rejected

### SQLite authorizer

More complete; heavier than extending the established guard. Follow-up if bypasses remain.

### Block all ALTER in SQL console

Breaks legitimate user-table schema edits.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Broad ALTER regex false positives | Exact reserved name on target table only |
| CREATE INDEX with complex expressions | Match `ON <ident>` form used by SQLite docs; tests cover simple product cases |
| Message / test regex drift | Keep `/reserved|__col_comments/i` |

## Verification Strategy

Product CJS tests on `executeUserDBSQL`:

1. Seed comments.
2. `ALTER TABLE __col_comments RENAME COLUMN …` / `ADD COLUMN …` throw; `PRAGMA table_info` still shows original columns.
3. `CREATE INDEX … ON __col_comments(…)` throws; no index on meta.
4. Existing DROP/DML refusals still pass; user-table ALTER/INDEX still work; SELECT meta still works.
5. Full suite + both tsc clean.
