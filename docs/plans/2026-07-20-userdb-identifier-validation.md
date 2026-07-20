# UserDB Identifier Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reject empty/blank (and reserved) identifiers in `createUserDB`, `renameTable`, and `renameColumn`.

**Architecture:** Validate in main-process UserDB APIs before SQLite mutations.

**Issue:** #46

---

### Task 1: Red tests

Create `tests/userdb-identifier-validation.test.cjs`:

- `createUserDB('')` / `'   '` throw; no registry entry.
- `renameTable` to `''` / `'  '` throws; original table remains.
- `renameColumn` to `''` throws; original column remains.
- Optional: rename table to `__col_comments` throws.

Commit: `test: reproduce empty userdb identifiers`

### Task 2: Implement validation

Modify `src/main/userdb.ts` for createUserDB, renameTable, renameColumn.

Commit: `feat: reject empty userdb rename and create names`

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
