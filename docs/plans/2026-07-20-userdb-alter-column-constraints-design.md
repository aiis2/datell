# UserDB Alter-Column Constraint Preservation Design

## Mainline

This design starts from authoritative `origin/master@3b740fd` and addresses Issue #19.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`alterColumn` rebuilds a UserDB table whenever a column type or comment is changed. SQLite has no `ALTER COLUMN` for type changes, so a rebuild is required. The current rebuild is lossy:

1. It reads only `PRAGMA table_info` (name, type, notnull, default, pk).
2. It synthesizes a flat `CREATE TABLE` from those fields.
3. It copies rows, drops the original table, and renames the temp table.
4. It does not restore table-level constraints or secondary indexes.

A real product-function probe on mainline proved that after `alterColumn(..., 'note', 'TEXT')` a table lost:

- `CHECK(amount >= 0)`
- table-level `UNIQUE (region)`
- `FOREIGN KEY (region) REFERENCES regions(code)`
- secondary index `idx_sales_amount`

Only column-level `NOT NULL`, `DEFAULT`, and a single-column `PRIMARY KEY` survived.

## Invariant

Changing a column type (or updating only a comment) must not weaken the table's integrity contract. Every constraint, index, and table option that SQLite can express in the original `CREATE TABLE` / attached index SQL must still be present after the rebuild, except for the single column type intentionally rewritten.

## Chosen Design

Drive the rebuild from live `sqlite_master` DDL instead of reconstructing from `PRAGMA table_info`.

### 1. Resolve the live table definition

- Confirm the target is a real user table (not a view or internal meta table).
- Read `sqlite_master.sql` for `type='table' AND name=?`.
- Read non-internal indexes (`type='index' AND tbl_name=? AND sql IS NOT NULL`).
- Read triggers that reference the table when present.

### 2. Rewrite only the selected column type

Parse the column list of the original `CREATE TABLE` carefully enough to:

- locate the target column definition by unquoted/quoted name equality;
- replace only that column's type token(s);
- leave every other column clause and every table-level clause unchanged:
  - table-level `PRIMARY KEY (...)`
  - `UNIQUE (...)`
  - `CHECK (...)`
  - `FOREIGN KEY (...)`
  - `WITHOUT ROWID`
  - generated-column clauses on other columns

Comment-only updates (`newType` omitted / identical) still use the DDL-preserving rebuild path when a rebuild is required for comment bookkeeping, or skip structural rebuild entirely when only `__col_comments` needs updating. Prefer skipping the rebuild for comment-only changes.

### 3. Transactional cutover

Inside one transaction:

1. Create the rewritten table under a temporary name.
2. `INSERT INTO temp SELECT <ordered columns> FROM original`.
3. Drop the original table.
4. Rename temp → original.
5. Recreate each captured index SQL (rewritten only if the SQL embeds the old table name in a way that still targets the final name after rename; prefer capturing index SQL that already uses the final table name and recreating after rename).
6. Recreate triggers if any were captured.

If any step fails, the transaction aborts and the original table remains.

### 4. Validation

- Unknown table → error.
- Unknown column → error.
- Empty / malformed type string → error.
- Internal tables (`sqlite_*`, `__col_comments`) are rejected.
- Foreign keys: when present, rebuild with foreign keys enabled for validation after cutover is optional; do not silently drop FK definitions from DDL.

### 5. IPC / UI contract

No public API shape change is required. `alterColumn(id, tableName, colName, newType?, newComment?)` remains the entry point used by `DatabaseManagementTab` and `userdb:alterColumn`.

## Alternatives Rejected

### Keep PRAGMA reconstruction and re-add only UNIQUE/CHECK from PRAGMA helpers

`PRAGMA table_info` does not expose CHECK expressions or multi-column UNIQUE/FK text. Partial reconstruction is still lossy.

### Require users to drop and recreate tables

Too invasive for a management UI type edit and still loses data/workflow continuity.

### Use SQLite's newer limited ALTER features only

SQLite still cannot change column type in place for arbitrary cases. Rebuild remains necessary.

### Parse with a full SQL grammar dependency

Unnecessary weight. A focused column-definition rewriter that operates on the parenthesized column/table-constraint list is enough for SQLite-generated and UI-created DDL.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Complex generated-column / constraint nesting breaks naive split | Use balanced-parenthesis scanning for the column list; never split on commas inside parentheses or quotes |
| Index names collide during temp phase | Recreate indexes only after the final rename |
| Data fails CHECK after type change | Let SQLite reject the INSERT; transaction rolls back |
| Comment-only path accidentally rebuilds and races | Skip rebuild when type is unchanged and only comment is written |
| Views or virtual tables | Reject with a clear error; views are not editable schema targets |

## Verification Strategy

1. Product-function tests create real temporary UserDB files and prove CHECK / UNIQUE / FK / secondary indexes survive type changes.
2. Cover composite PRIMARY KEY, `WITHOUT ROWID`, quoted identifiers, and comment-only updates.
3. Negative tests: unknown table/column, invalid type, failed data migration rolls back.
4. Reverse verification: the corruption/loss regression fails on `origin/master@3b740fd` and passes after the fix.
5. Full CJS suite, both TypeScript compilers, whitespace check, independent review.

## Scope Boundary

This cycle only fixes UserDB `alterColumn` schema preservation. It does not change free-form SQL console behavior, import schema defaults, row deletion, or sandbox/export isolation work.
