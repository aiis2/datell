# UserDB Identifier Validation Design

## Mainline

This design starts from authoritative `origin/master@fcc44c3` and addresses Issue #46.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`renameTable` and `renameColumn` pass new names straight into SQLite `ALTER ... RENAME` without validating emptiness. SQLite accepts empty identifiers, producing tables/columns named `''` that the management UI cannot safely address.

`createUserDB` trims the display name but still accepts all-whitespace input as `name: ''`, polluting the registry and causing confusing duplicate-name errors.

## Invariant

Managed create/rename APIs never produce empty, blank, or reserved internal names as user-visible identifiers.

## Chosen Design

Shared validation helpers (or inline checks matching existing `addColumn` / `importTable` style):

1. **`createUserDB(name)`** — after trim, require non-empty string; throw `User DB name cannot be empty or blank` (or similar). Keep existing duplicate-name check on the trimmed value.

2. **`renameTable(..., newName)`** — trim; reject empty/blank; reject `sqlite_%` and `__col_comments`; then existing table resolve + ALTER.

3. **`renameColumn(..., newColName)`** — trim; reject empty/blank; reject if case-insensitive duplicate of another column; then ALTER.

No IPC signature changes. UI already trims some inputs; main process remains the enforcement boundary.

## Alternatives Rejected

### Only validate in the renderer

Bypassable via IPC / tools; main process must enforce.

### Disallow all special characters

Too broad; SQLite quoted identifiers allow many characters. Scope is empty/blank/reserved only.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Legitimate intentional empty names | Not a product use case; reject |
| Case-only renames | Still allowed if non-empty after trim |

## Verification Strategy

Product tests for empty/blank rename table/column and createUserDB; assert original state preserved. Full suite + tsc.
