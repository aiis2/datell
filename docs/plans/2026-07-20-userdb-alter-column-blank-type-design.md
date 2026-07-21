# UserDB alterColumn Blank Type Rejection Design

## Mainline

This design starts from authoritative `origin/master@63ce8c6` and addresses Issue #74 (or the number assigned at open time).

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Managed `alterColumn(id, table, col, newType?, newComment?)` treats a provided blank/whitespace `newType` as a type-change request after `trim()`. That can rewrite the column type to an empty type expression and corrupt schema metadata. Comment-only updates (omit `newType`) are intentional and must remain valid.

`addColumn` already rejects empty types. Managed alter should match that fail-closed rule when a type argument is **present but blank**.

## Invariant

If the caller supplies a `newType` string, it must be non-empty after trim or the call fails without mutating the table. Omitting `newType` (`undefined`) never rewrites the column type solely due to a blank string.

## Chosen Design

In `alterColumn` (`src/main/userdb.ts`), after detecting that `newType` is a string:

1. `const trimmed = newType.trim()`
2. If `trimmed.length === 0`, throw `Column type cannot be empty` (same spirit as `addColumn`).
3. Otherwise proceed with the existing type-rewrite path using `trimmed`.
4. If `newType` is `undefined` (or not a string), skip type rewrite; only apply comment when provided.

No IPC signature change. Keep existing rebuild/constraint-preserving type rewrite for real non-blank types.

## Alternatives Rejected

### Treat blank as “omit type”

Hides client bugs (UI sending empty string instead of undefined); fail closed is clearer.

### Only reject when comment also missing

Still allows blank type + comment to corrupt type while updating comment.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Renderer sends `''` for “no change” | Throw surfaces bug; prefer omit field |
| Existing tests pass blank | Unlikely; full suite will catch |

## Verification Strategy

Product CJS tests with temp UserDB:

1. Blank / whitespace `newType` throws; `PRAGMA table_info` type and row data unchanged.
2. Comment-only (`undefined` type) stores comment without changing type.
3. Valid type change (e.g. INTEGER → TEXT) still applies.
4. Full suite + both tsc clean.
