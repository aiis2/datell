# UserDB executeUserDBSQL Statement Classification Design

## Mainline

This design starts from authoritative `origin/master@86659bf` and addresses Issue #59.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`executeUserDBSQL` (IPC `userdb:execute`, management SQL console) classifies statements with a prefix regex:

```ts
const isSelect = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)/i.test(sql.trim());
```

Any match goes through `stmt.all()`; everything else uses `stmt.run()`.

That is wrong for statements that **start with** `WITH` or `PRAGMA` but do **not** return rows:

| SQL | better-sqlite3 `Statement.reader` | Current path | Outcome |
|-----|-----------------------------------|--------------|---------|
| `WITH x AS (SELECT 1) INSERT INTO t SELECT …` | `false` | `all()` | throws `This statement does not return data. Use run() instead` |
| `PRAGMA user_version = 7` | `false` | `all()` | same throw |
| `WITH x AS (SELECT 1) SELECT * FROM x` | `true` | `all()` | OK |
| `PRAGMA table_info(t)` | `true` | `all()` | OK |
| plain `INSERT` / `UPDATE` / `DELETE` | `false` | `run()` | OK |

Users writing CTE-based DML or assignment PRAGMAs in the SQL console hit a hard error even though SQLite and better-sqlite3 support the statements.

`userdb:query` / `readOnly: true` already blocks mutating SQL via `isReadOnlyUserDBSql` and is **not** the bug surface for this issue (WITH-INSERT is correctly rejected there).

## Invariant

For non-readOnly `executeUserDBSQL`, choose the execution path from the prepared statement’s ability to return rows (`Statement.reader`), not from a keyword prefix. Row-returning statements yield column/row result sets; non-row statements yield the existing DML metadata shape `{ columns: ['changes','lastInsertRowid'], rows: [[changes, lastInsertRowid]] }`.

## Chosen Design

In `executeUserDBSQL` after `db.prepare(sql)`:

1. Keep the existing `readOnly` gate (`isReadOnlyUserDBSql`) unchanged.
2. Replace prefix-based `isSelect` with `stmt.reader` (boolean from better-sqlite3).
3. If `stmt.reader`:
   - `stmt.all()` → map to `columns` / `rows` / `rowCount` as today (including empty result column metadata via `stmt.columns` when available).
4. Else:
   - `stmt.run()` → return changes / lastInsertRowid as today.

No IPC signature change. No change to managed APIs (`createTable`, `batchInsert`, `updateRow`, etc.).

## Alternatives Rejected

### Expand the prefix regex with negative lookaheads for WITH+INSERT

Fragile; misses `WITH … UPDATE/DELETE/REPLACE`, multi-CTE forms, and write PRAGMAs. Re-implements what the driver already knows.

### Always try `all()` then fall back to `run()` on error

Works but relies on exception control flow and could mask real errors; `reader` is explicit and stable in better-sqlite3.

### Parse SQL fully in-process

Overkill; the prepared statement already classifies correctly.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Empty SELECT returns no keys for columns | Keep existing empty-row path using `stmt.columns?.()` |
| `lastInsertRowid` type (number/bigint) | Keep current `String(info.lastInsertRowid)` serialization |
| Read-only WITH-SELECT still allowed | Unchanged `isReadOnlyUserDBSql` (WITH requires SELECT and no mutating keywords) |
| Driver without `reader` | Project already depends on better-sqlite3; property is standard |

## Verification Strategy

Product CJS tests with temporary UserDB:

1. `WITH … INSERT` succeeds; row appears; result has `changes` metadata.
2. `PRAGMA user_version = N` succeeds; read `PRAGMA user_version` returns N.
3. `WITH … SELECT` and `PRAGMA table_info` still return row sets.
4. Plain INSERT / UPDATE / DELETE still return changes metadata.
5. Full suite `node --test tests/*.test.cjs` + main and renderer `tsc --noEmit`.
