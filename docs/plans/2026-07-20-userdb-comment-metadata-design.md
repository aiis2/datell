# UserDB Column Comment Metadata Sync Design

## Mainline

This design starts from authoritative `origin/master@95fcc23` and addresses Issue #25.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

UserDB column comments live in `__col_comments(table_name, col_name, comment)`. Only `alterColumn` writes that table. Schema mutations that change names or remove objects leave stale rows:

| Mutation | Current metadata behavior |
|----------|---------------------------|
| `renameTable` | comments stay under the old table name |
| `renameColumn` | comments stay under the old column name |
| `dropColumn` | orphan comment row remains |
| `dropTable` | orphan comment rows remain |

A product-function probe renamed `t` → `t2`, `a` → `a2`, dropped `b`, and still found comments keyed as `t.a` / `t.b` while the live table was only `t2(a2)`.

## Invariant

Managed schema mutations must keep comment metadata aligned with the live table/column names they expose through the management UI. After any rename/drop path returns successfully, `__col_comments` contains no rows for removed objects and uses the final names for surviving objects.

## Chosen Design

Centralize tiny metadata helpers next to `ensureColumnCommentsMeta` in `src/main/userdb.ts`:

```ts
ensureColumnCommentsMeta(db)
rewriteTableComments(db, oldTable, newTable)
rewriteColumnComment(db, table, oldCol, newCol)
deleteColumnComment(db, table, col)
deleteTableComments(db, table)
```

Wire them into existing mutation functions:

1. **`renameTable`** — after successful `ALTER TABLE ... RENAME TO`, rewrite `table_name`.
2. **`renameColumn`** — after successful `ALTER TABLE ... RENAME COLUMN`, rewrite `col_name` for that table.
3. **`dropColumn`** — after successful column removal (native or rebuild path), delete the comment row for that column.
4. **`dropTable`** — after successful `DROP TABLE`, delete all comments for that table.

If `__col_comments` does not exist yet, helpers no-op. Once it exists, keep it consistent.

No public API signature changes. Schema readers that already join/read `__col_comments` automatically benefit.

## Alternatives Rejected

### Rebuild comments from UI state only

Comments would still be wrong after SQL-console-adjacent management actions and after reopening the app.

### Store comments only in renderer memory

They would not survive restart and would diverge from main-process schema operations.

### Parse SQL comments from CREATE TABLE text

SQLite does not preserve arbitrary column comments in `sqlite_master` for ordinary tables; the side table is the product contract.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Meta table missing | `CREATE TABLE IF NOT EXISTS` only when writing; readers/helpers tolerate absence |
| Case-insensitive SQLite names | Match using the resolved live object names already returned by schema inspection |
| Partial failure after DDL succeeds | Run metadata updates immediately after successful DDL in the same function; metadata failure should not silently leave known drift if the meta table exists — surface the error |
| Free-form SQL renames | Out of scope; only managed APIs are covered |

## Verification Strategy

1. Product-function tests create temporary UserDB files, set comments, rename/drop, and assert `__col_comments` contents.
2. Cover renameTable, renameColumn, dropColumn, dropTable, and comment text preservation.
3. Reverse verification fails on `origin/master@95fcc23` and passes after the fix.
4. Full CJS suite, both TypeScript compilers, whitespace check.

## Scope Boundary

This cycle only synchronizes `__col_comments` for managed rename/drop APIs. It does not change free-form SQL console behavior or sandbox/export isolation work.
