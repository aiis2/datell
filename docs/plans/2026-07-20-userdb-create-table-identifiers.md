# UserDB createTable Identifier Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reject empty/blank table and column names in managed `createTable` before SQLite executes DDL.

**Architecture:** Validate identifiers after single-statement extraction in `src/main/userdb.ts`.

**Issue:** #55

---

### Task 1: Red tests

Create `tests/userdb-create-table-identifiers.test.cjs`:

- Empty/blank quoted table name throws; no residual table.
- Empty/blank column name throws; no residual table.
- Valid CREATE TABLE succeeds.
- IF NOT EXISTS with valid names still works.

Commit: `test: reproduce empty createTable identifiers`

### Task 2: Implement validation

Modify `createTable` / helpers in `src/main/userdb.ts`.

Commit: `feat: reject empty identifiers in userdb createTable`

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
