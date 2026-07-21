# UserDB importTable Type Coercion Design

## Mainline

This design starts from authoritative `origin/master@33368e6` and addresses Issue #71 (or the number assigned at open time).

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Managed `importTable` creates a table and inserts rows in one transaction, but binds cell values **raw**. File importers pass strings for every cell. Numeric columns therefore store empty strings and garbage as TEXT affinity—the same integrity hole fixed for cell edits (#52) and `batchInsert` (#68).

Atomicity (#34) already rolls back create+insert on SQLite errors. Coercion throws must participate in that same outer transaction so a bad payload never leaves a new partial table or, under `ifExists: 'replace'`, a half-replaced table.

## Invariant

Every value bound by managed `importTable` respects the import column’s declared type affinity and nullability using the same rules as managed cell updates / batchInsert. Empty import strings become SQL NULL on nullable columns; numeric columns receive numbers/BigInt or fail closed; NOT NULL numerics reject empty clears.

## Chosen Design

In `importTable` (`src/main/userdb.ts`):

1. Keep existing validation (table name, columns, row width, ifExists policy).
2. For each resolved import column `{ name, type }`, build a bind-time column descriptor compatible with `coerceUpdateValue`:
   - `type` = declared type string (affinity via existing `columnAffinity`)
   - `notnull` = 1 if the type expression contains `NOT NULL` (word-boundary)
   - `pk` = 1 if the type expression contains `PRIMARY KEY` (so integer PK empty is rejected)
   - `hidden` = 0
3. Inside the existing outer transaction, after `CREATE TABLE` (and optional replace drop), map each row cell through `coerceUpdateValue(descriptor, value)` before `stmt.run`.
4. Coercion or insert failure aborts the transaction → no residual table from a failed create path; replace path restores prior table.

No IPC signature change. Reuse **`coerceUpdateValue`** (do not fork rules).

## Alternatives Rejected

### Coerce only in the renderer import dialog

Main-process boundary must enforce integrity for all IPC callers.

### Coerce after create via `table_xinfo` only

Also viable; declared-type descriptors match the CREATE DDL the importer supplied and avoid an extra pragma. Live xinfo after create is acceptable if simpler in code—either approach must match affinity/nullability.

### Rely on SQLite CAST

Does not fail closed on `'abc'` with a managed error message; empty-string behavior differs from #52/#68.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| `NOT NULL` only as table constraint, not in column type | Import UI currently emits per-column type strings; document; optional later xinfo pass |
| Replace + fail mid-insert | Single outer transaction already rolls back DROP |
| Behavioral change for nullable TEXT empty (`''` → NULL) | Aligns with #52/#68; cover in tests |

## Verification Strategy

Product CJS tests with temp UserDB harness calling real `importTable`:

1. Empty → NULL on nullable INTEGER (raw `typeof` null).
2. `'abc'` / empty on NOT NULL numeric throws; no residual table (create path) or prior table restored (replace path).
3. `'42'` stores integer; REAL `'1.5'` works; TEXT empty/arbitrary per coerce rules.
4. Multi-row success inserts all rows.
5. Full suite + both tsc clean.
