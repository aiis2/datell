# UserDB Drop-Column Index Dependency Design

## Mainline

This design starts from authoritative `origin/master@0cbfba8` and addresses Issue #22.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`dropColumn` currently issues a bare:

```sql
ALTER TABLE "<table>" DROP COLUMN "<column>"
```

SQLite rejects that statement when a secondary index still references the column. A real product-function probe on mainline created:

```sql
CREATE TABLE sales(id INTEGER PRIMARY KEY, amount INTEGER, note TEXT);
CREATE INDEX idx_sales_amount ON sales(amount);
CREATE INDEX idx_sales_note ON sales(note);
```

Then `dropColumn(id, 'sales', 'amount')` threw:

```text
SqliteError: error in index idx_sales_amount after drop column: no such column: amount
```

The column remained. The management UI therefore cannot drop ordinary indexed columns even when the remaining schema would be valid.

SQLite may also reject drops that collide with CHECK / generated-column / complex constraint dependencies that a simple index drop cannot clear.

## Invariant

A UserDB management "drop column" action must either:

1. remove the column and leave a consistent remaining schema (remaining columns, remaining unrelated indexes/triggers, and remaining table constraints that do not depend on the dropped column), or
2. fail closed with a clear validation error before mutating user data.

It must never leave the table half-modified or require the user to decode low-level SQLite index errors.

## Chosen Design

### 1. Validate the target

- Confirm the object is a real user table (not a view / `sqlite_*` / `__col_comments`).
- Confirm the column exists via live `PRAGMA table_info`.
- Reject dropping the only remaining column or a column that is the sole PRIMARY KEY only if SQLite cannot represent the resulting table; prefer clear errors over silent no-ops.

### 2. Primary path: drop dependent indexes, then DROP COLUMN

1. Inventory non-internal indexes for the table (`sqlite_master.type = 'index' AND tbl_name = ? AND sql IS NOT NULL`).
2. Detect indexes whose definition references the target column name with identifier-aware matching (quoted/unquoted, case-insensitive per SQLite folding rules used elsewhere in UserDB).
3. Inside a transaction:
   - `DROP INDEX` each dependent index
   - `ALTER TABLE ... DROP COLUMN ...`
4. Leave indexes that do not reference the dropped column intact.

Default for multi-column indexes that include the dropped column: **drop the whole dependent index**. Do not silently invent a rewritten partial index.

### 3. Fallback path: DDL-preserving rebuild without the column

If SQLite still rejects `DROP COLUMN` after dependent indexes are removed (CHECK / generated column / constraint dependency), fall back to the same family of rebuild used by constraint-preserving `alterColumn`:

1. Read live `CREATE TABLE` SQL from `sqlite_master`.
2. Remove only the selected column definition from the column list with parenthesis/quote-aware parsing.
3. Drop table-level constraints that explicitly name only the removed column when they cannot remain valid; keep unrelated table-level constraints.
4. Create a temp table from the rewritten DDL, copy remaining columns, drop/rename, recreate only indexes/triggers that do not reference the removed column.

If the fallback also cannot produce a valid schema, abort the transaction and report a clear error.

### 4. Data retention

Remaining column values must be preserved in order. The operation must not rewrite unrelated tables.

### 5. API surface

No public signature change:

```ts
dropColumn(id: string, tableName: string, colName: string): void
```

IPC (`userdb:dropColumn`) and the renderer management UI keep calling the same entry point.

## Alternatives Rejected

### Surface the raw SQLite error and ask users to drop indexes manually

Technically possible, but the management action already claims to drop the column. Requiring manual index cleanup is poor UX and still leaves CHECK/generated cases unsolved.

### Always rebuild the table

Works, but is heavier than necessary for the common index-only dependency case and risks more DDL rewrite edge cases. Prefer native `DROP COLUMN` when SQLite can do it after index cleanup.

### Rewrite multi-column indexes by removing one column

Silent index shape changes can change query plans and uniqueness guarantees. Removing the dependent index is explicit and safer.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| False-positive index matching on similarly named substrings | Match identifiers with quote-aware tokenization, not raw substring search |
| CHECK expressions still reference the dropped column | Fallback rebuild removes/rewrites invalid column dependency or fails closed |
| Partial unique indexes / expression indexes | Treat any index SQL that references the column as dependent and drop it |
| Concurrent writers | Existing single-process desktop usage; keep the mutation transactional |
| Internal tables | Reject `__col_comments` and `sqlite_*` names |

## Verification Strategy

1. Product-function tests create temporary UserDB files and prove indexed columns can be dropped.
2. Cover: single-column index dependency, multi-column index dependency, unrelated index retention, data retention, quoted identifiers, unknown table/column, CHECK-dependent fallback if reproducible.
3. Reverse verification: red regression fails on `origin/master@0cbfba8` and passes after the fix.
4. Full CJS suite, both TypeScript compilers, whitespace check, independent review.

## Scope Boundary

This cycle only fixes UserDB `dropColumn` dependency handling. It does not change free-form SQL console behavior, import defaults, row identity, or sandbox/export isolation work.
