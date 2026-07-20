# UserDB Cell Edit Type Coercion Design

## Mainline

This design starts from authoritative `origin/master@fe57d66` and addresses Issue #52.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Data preview cell edits always send strings. `updateRow` binds them raw, so:

- Clearing a numeric cell stores `''` (typeof text) in INTEGER/REAL columns.
- `INTEGER NOT NULL` accepts `''` because it is not SQL NULL.
- Invalid input like `"abc"` becomes text in a numeric column.
- Clearing a cell that was SQL NULL rewrites NULL → `''` for any type.

## Invariant

Managed cell updates respect column affinity and nullability: empty editor clears become SQL NULL on nullable columns; numeric columns receive numbers or fail closed; NOT NULL numerics reject empty clears.

## Chosen Design

Coerce inside `updateRow` (main process) using `PRAGMA table_info` already available via `inspectTableIdentity`:

For each update entry `(columnName, value)`:

1. Resolve column type string and `notnull` / `pk`.
2. Treat SQLite affinity roughly as:
   - INTEGER affinity if type matches `/INT/i`
   - REAL affinity if type matches `/REAL|FLOA|DOUB/i`
   - NUMERIC affinity if type matches `/NUM/i` (accept int or float)
   - BLOB / TEXT / other → text-like
3. Coercion rules for **string** values (editor path):
   - Trim is **not** applied to TEXT content (preserve intentional spaces), but:
   - If `value === ''` (empty string):
     - If column is NOT NULL and affinity is numeric → throw `Cannot set NOT NULL numeric column to empty`
     - If column is nullable → bind `null`
     - If column is NOT NULL text-like → bind `''`
   - If numeric affinity and non-empty string:
     - INTEGER: must match `/^-?\d+$/` (or safe integer parse); store as number/BigInt as appropriate for better-sqlite3
     - REAL/NUMERIC: must parse as finite number; else throw
   - TEXT: store string as-is
4. Non-string values:
   - `null` / `undefined` → `null` if nullable else throw
   - numbers pass through for numeric affinity
   - other types: convert with care or reject

Renderer may keep sending strings; optional later UX for explicit NULL button is out of scope.

No IPC signature change.

## Alternatives Rejected

### Only fix the renderer

IPC callers would still write bad types; main process is the boundary.

### Always store strings

Breaks numeric aggregations and type-sensitive tools.

### Empty always means empty string

Breaks null round-trip for nullable columns.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Large integers beyond JS safe range | Prefer string/BigInt path consistent with rowid handling where needed; reject unsafe int strings if over MAX_SAFE_INTEGER unless pure digit rowid-style |
| BOOLEAN / DATE declared types | Fall through TEXT unless matching affinity regex |
| PK integer empty | Treated as NOT NULL numeric → reject |

## Verification Strategy

Product tests with temporary UserDB: empty→NULL, empty NOT NULL numeric fails, valid/invalid numeric strings, TEXT empty nullable vs notnull. Full suite + both tsc.
