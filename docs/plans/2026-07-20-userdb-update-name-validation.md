# UserDB updateUserDB Name Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align `updateUserDB` name rules with `createUserDB` (non-empty, case-insensitive unique).

**Architecture:** Validate and normalize `patch.name` in `src/main/userdb.ts` before writing the registry.

**Issue:** #49

---

### Task 1: Red tests

Create `tests/userdb-update-name-validation.test.cjs`:

- Empty/blank rename throws; name unchanged.
- Rename to another DB's name (case-insensitive) throws.
- Rename to free name stores trimmed value.
- Description-only patch does not require name.

Commit: `test: reproduce invalid userdb update names`

### Task 2: Implement validation

Modify `updateUserDB` in `src/main/userdb.ts`.

Commit: `feat: validate userdb names on updateUserDB`

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
