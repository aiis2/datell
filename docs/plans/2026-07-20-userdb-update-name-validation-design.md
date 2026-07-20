# UserDB updateUserDB Name Validation Design

## Mainline

This design starts from authoritative `origin/master@d761a1f` and addresses Issue #49.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`createUserDB` rejects empty/blank names and case-insensitive duplicates. `updateUserDB` applies `patch.name` verbatim, so renames can produce empty registry names or collide with another DB under a different case (`Alpha` vs `alpha`). That breaks the uniqueness invariant the create path already enforces.

## Invariant

Registry display names are non-empty after trim, and unique case-insensitively across UserDBs. Create and update share the same rules.

## Chosen Design

In `updateUserDB(id, patch)`:

1. If `patch.name === undefined`, do not change the name (description-only updates unchanged).
2. If `patch.name` is provided:
   - Require `typeof name === 'string'` and `name.trim().length > 0`; else throw `User DB name cannot be empty or blank`.
   - Let `trimmed = name.trim()`.
   - If another config (`c.id !== id`) has `c.name.trim().toLowerCase() === trimmed.toLowerCase()`, throw `duplicate_name:${trimmed}` (same shape as create).
   - Store `trimmed` as the new name.
3. Description patches remain free-form (including empty string if the UI clears description).

No IPC signature change.

## Alternatives Rejected

### Only validate in the renderer

Bypassable; registry is main-process state.

### Case-sensitive uniqueness only

Would diverge from `createUserDB`, which already uses case-insensitive comparison.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Self-rename case change (`Alpha` → `alpha`) | Allowed: exclude same `id` from conflict check |
| Existing empty names in old registries | Out of scope migration; new updates cannot reintroduce |

## Verification Strategy

Product tests for empty/blank, cross-DB case conflict, successful rename + description-only patch. Full CJS suite + both `tsc` checks.
