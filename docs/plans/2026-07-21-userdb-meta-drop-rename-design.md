# UserDB Meta Table Drop/Rename Protection Design

## Mainline

This design starts from authoritative `origin/master@0d3d255` and addresses Issue #77 (or the number assigned at open time).

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

UserDB stores column comments in the reserved meta table `__col_comments`. Managed APIs already refuse to **create** that name and refuse most mutations that **target** it as a user table (addColumn, alterColumn, dropColumn, batchInsert, export, createTable). Schema listing hides it via `USER_TABLE_FILTER`. Rename **to** `__col_comments` is rejected by `validateUserObjectName`.

Two managed entry points still treat the meta table like a normal user table:

1. **`dropTable(id, '__col_comments')`** — looks up the table in `sqlite_master`, runs `DROP TABLE`, then `deleteTableComments`. That permanently destroys the comment store for the whole database.
2. **`renameTable(id, '__col_comments', newName)`** — renames the meta table away from the reserved name. Subsequent comment helpers look for `__col_comments` by exact name and stop working; the orphaned table is no longer hidden from the schema list filter correctly in spirit (filter is exact `name != '__col_comments'`).

This is a data-integrity hole: one managed call can wipe or detach all column comments.

## Invariant

Managed `dropTable` and `renameTable` must never destroy or rename the reserved meta table `__col_comments`. The meta table may only be created/maintained by internal helpers (`ensureColumnCommentsMeta` and comment rewrite/delete helpers). Normal user tables remain droppable/renameable, including comment cleanup/rewrite for those user table names.

## Chosen Design

### Shared reserved-name check

Reuse the same reserved-name rule already used elsewhere:

- Treat `tableName === '__col_comments'` (after the same string/empty handling used for other managed ops).
- Prefer a small shared helper or inline check consistent with `addColumn` / `dropColumn` / `validateUserObjectName` for tables.

Exact error message style: match existing reserved/unknown patterns used for meta targeting, e.g. `Unknown table: __col_comments` or `Invalid reserved table name: __col_comments`. Either is acceptable if tests match a clear fail-closed throw and no mutation.

### `dropTable`

At the start of `dropTable`, before any `sqlite_master` lookup or `DROP`:

1. If `tableName` is reserved (`__col_comments` or `sqlite_*` if already in scope for consistency), throw and do not open destructive path.
2. Otherwise keep current behavior: drop user table if present; IF EXISTS no-op for missing user tables; `deleteTableComments` only for dropped **user** tables.

### `renameTable`

At the start of `renameTable`, before lookup:

1. If `oldName` is reserved (`__col_comments`), throw without renaming.
2. Keep existing `validateUserObjectName(newName, 'table')` which already rejects rename **to** `__col_comments` / `sqlite_*`.
3. User-table rename continues to call `rewriteTableComments`.

### Case handling

SQLite identifiers are case-insensitive for unquoted names. Prefer rejecting when the resolved `sqlite_master` name or the input matches reserved name with case-insensitive compare, **or** reject exact reserved string as other APIs do today (`tableName === '__col_comments'`). Match the predominant style in `userdb.ts` for consistency; if other APIs use exact equality, use the same for drop/rename-from unless a cheap case-insensitive check is already local.

## Alternatives Rejected

### Only hide meta in UI; leave APIs open

Renderer or future callers can still invoke IPC `dropTable`/`renameTable`. Fail closed in main process.

### Soft-delete / recreate meta after drop

Still loses all comments; worse UX than refusing the call.

### Block raw SQL console DROP as part of this change

Out of scope for #77; `executeUserDBSQL` is a separate surface (follow-up if needed).

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Breaks intentional tests that drop meta | Unlikely; suite should assert protection |
| Case variants (`__COL_COMMENTS`) still drop | Prefer same equality style as siblings; optional NOCASE lookup if already resolving object.name |
| Missing-table IF EXISTS path still issues DROP SQL for reserved name | Guard must run before IF EXISTS drop path |

## Verification Strategy

Product CJS tests with temp UserDB:

1. Seed comments so `__col_comments` exists with rows.
2. `dropTable(id, '__col_comments')` throws; meta table and rows remain.
3. `renameTable(id, '__col_comments', 'other')` throws; meta name and rows remain.
4. `renameTable(id, 'user', '__col_comments')` still throws (existing).
5. Normal user table drop/rename still succeeds; comments for user tables still rewrite/cleanup.
6. Full suite + both tsc clean.
