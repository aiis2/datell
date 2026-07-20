# UserDB addColumn Name Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reject empty/blank column names in UserDB `addColumn` and fail closed without creating unusable columns.

**Architecture:** Validate table existence and non-empty column identifiers before issuing `ALTER TABLE ... ADD COLUMN`, using shared quoting helpers.

**Tech Stack:** TypeScript, better-sqlite3, Node CJS tests.

---

### Task 1: Reproduce empty-name column creation

**Files:**
- Create: `tests/userdb-add-column-validation.test.cjs`

**Steps:**
1. Create table, call `addColumn` with `''` and `'  '`, assert throws and schema unchanged.
2. Run on mainline — expect FAIL because empty names succeed.
3. Commit red test.

### Task 2: Implement validation

**Files:**
- Modify: `src/main/userdb.ts`

**Steps:**
1. Validate table + non-empty trimmed column name.
2. Reject multi-statement type payloads lightly.
3. Add valid/unknown/duplicate cases.
4. Commit fix.

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
git diff --check origin/master...HEAD
```
