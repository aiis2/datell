# UserDB Export Integrity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make managed UserDB table export complete and schema-faithful (no silent truncation; empty CSV headers).

**Architecture:** Fix `exportTableData` in the main process to resolve the table, use `PRAGMA table_info` for columns, and select all rows without a silent LIMIT.

**Tech Stack:** TypeScript, better-sqlite3, Node CJS tests.

**Issue:** #40

---

### Task 1: Reproduce silent truncation and empty CSV

**Files:**
- Create: `tests/userdb-export-integrity.test.cjs`

**Step 1: Harness** — reuse UserDB product-test harness.

**Step 2: Red cases**

- Empty table CSV includes header columns from schema.
- Export returns every inserted row when count is known (no artificial 100k cap in SQL).
- Unknown table throws.
- JSON empty table is `[]`.

**Step 3: Commit**

```bash
git add tests/userdb-export-integrity.test.cjs
git commit -m "test: reproduce incomplete userdb export"
```

### Task 2: Implement full schema-faithful export

**Files:**
- Modify: `src/main/userdb.ts`
- Test: `tests/userdb-export-integrity.test.cjs`

**Steps:**

1. Resolve table; throw if missing.
2. Columns from pragma; SELECT without LIMIT.
3. Empty CSV = header only; empty JSON = `[]`.
4. Commit: `feat: export full userdb tables without silent truncation`

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
git diff --check origin/master...HEAD
```
