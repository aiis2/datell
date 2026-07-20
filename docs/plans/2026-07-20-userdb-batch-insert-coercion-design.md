# UserDB batchInsert Type Coercion Design

## Mainline

This design starts from authoritative `origin/master@f8601cb` and addresses Issue #68 (or the issue number assigned at open time).

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Managed `batchInsert` binds cell values raw. CSV/Excel/UI import paths commonly pass **strings**. For numeric columns this stores empty strings and garbage as TEXT affinity values, and can leave “fake numerics” after import—the same class of bug fixed for cell edits in #52 (`updateRow` + `coerceUpdateValue`).

`batchInsert` is already one outer transaction (#43). Coercion must run **inside** that transaction path so a bad cell aborts the entire payload with no partial inserts from that call.

## Invariant

Every value bound by managed `batchInsert` respects the target column’s declared type affinity and nullability using the same rules as managed cell updates. Empty editor/import strings become SQL NULL on nullable columns (including nullable TEXT, matching `updateRow`); numeric columns receive numbers/BigInt or fail closed; NOT NULL numerics reject empty clears.

## Chosen Design

In `batchInsert` (`src/main/userdb.ts`):

1. Resolve the target table (case-insensitive, real table only).
2. Load live column metadata (`PRAGMA table_xinfo` / same shape as `inspectTableIdentity` columns).
3. For each name in the caller’s `columns` list, resolve the live column (reject unknown columns with a clear error).
4. Before `stmt.run`, map each row: `row.map((value, i) => coerceUpdateValue(resolvedColumns[i], value))`.
5. Keep the existing single outer `db.transaction` so coercion throws or insert failures roll back all rows in the payload.
6. Empty `rows` still returns `{ inserted: 0 }` without opening work beyond current behavior.

Reuse **`coerceUpdateValue`** (do not fork rules). No IPC signature change.

## Alternatives Rejected

### Coerce only in the renderer import dialog

Main-process boundary must enforce integrity for all IPC callers.

### Coerce only INTEGER, leave REAL/TEXT raw

Inconsistent with #52 and leaves REAL/NUMERIC holes.

### SQLite CAST in SQL

Does not reject `'abc'` cleanly as a managed error; empty string behavior differs from cell edits.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Case-only column name mismatch | Resolve via existing `identifiersEqual` / table_info names |
| PK / NOT NULL empty in batch | Same throw as updateRow; whole batch aborts |
| Large integer strings | Existing BigInt path in `coerceUpdateValue` |
| Behavioral change for nullable TEXT empty (`''` → NULL) | Aligns with #52 cell edits; document in tests |

## Verification Strategy

Product CJS tests with temp UserDB harness calling real `batchInsert`:

1. Empty → NULL on nullable INTEGER (raw `typeof` null).
2. `'abc'` / empty on NOT NULL numeric throws; prior good rows intact; bad payload not partially applied.
3. `'42'` stores integer; REAL `'1.5'` works; TEXT empty/arbitrary accepted per coerce rules.
4. Multi-row success still inserts all rows.
5. Full `node --test tests/*.test.cjs` + main/renderer tsc clean.
