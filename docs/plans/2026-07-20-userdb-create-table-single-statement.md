# UserDB createTable Single-Statement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure UserDB `createTable` accepts exactly one `CREATE TABLE` statement and cannot run trailing destructive SQL.

**Architecture:** Validate and extract a single CREATE TABLE statement with quote/comment-aware scanning, then execute it with a single-statement API.

**Tech Stack:** TypeScript, better-sqlite3, Node CJS tests.

---

### Task 1: Reproduce multi-statement createTable data loss

**Files:**
- Create: `tests/userdb-create-table-single-statement.test.cjs`

**Step 1: Reuse UserDB harness**

Mirror existing UserDB product tests.

**Step 2: Write failing regression**

Create `keepme`, insert a row, call `createTable` with `CREATE TABLE other(...); DROP TABLE keepme;`, assert either throw or that `keepme` still exists with data. Prefer throw + no mutation of `keepme`.

**Step 3: Run on mainline**

Run: `node --test tests/userdb-create-table-single-statement.test.cjs`

Expected on `origin/master@a0e06a1`: FAIL because `keepme` is dropped.

**Step 4: Commit**

```bash
git add tests/userdb-create-table-single-statement.test.cjs
git commit -m "test: reproduce multi-statement createTable mutation"
```

### Task 2: Enforce single CREATE TABLE statement

**Files:**
- Modify: `src/main/userdb.ts`
- Test: `tests/userdb-create-table-single-statement.test.cjs`

**Step 1: Expand cases**

- valid CREATE TABLE
- CREATE TABLE IF NOT EXISTS
- trailing whitespace/comments allowed
- multi-statement rejected
- empty rejected
- non-CREATE rejected
- semicolon inside string literal still valid single statement

**Step 2: Implement validator + single-statement execution**

**Step 3: Run focused tests and commit**

```bash
git add src/main/userdb.ts tests/userdb-create-table-single-statement.test.cjs
git commit -m "fix: accept only one CREATE TABLE in createTable"
```

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
git diff --check origin/master...HEAD
```
