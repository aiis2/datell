# UserDB Column Comment Metadata Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep `__col_comments` aligned with UserDB rename/drop table and column mutations.

**Architecture:** Add small metadata helpers beside `ensureColumnCommentsMeta` and invoke them from `renameTable`, `renameColumn`, `dropColumn`, and `dropTable` after successful schema changes.

**Tech Stack:** TypeScript, better-sqlite3, Node CJS tests.

---

### Task 1: Reproduce comment metadata drift

**Files:**
- Create: `tests/userdb-comment-metadata.test.cjs`

**Step 1: Reuse UserDB harness**

Mirror existing UserDB tests (transpile `userdb.ts`, mock `./dataDir`).

**Step 2: Write failing regression**

Create table, set two column comments via `alterColumn`, then:

- rename table
- rename one column
- drop the other column
- assert remaining comment uses final names
- drop table and assert no orphan comments remain

**Step 3: Run on mainline**

Run: `node --test tests/userdb-comment-metadata.test.cjs`

Expected on `origin/master@95fcc23`: FAIL with stale `table_name` / `col_name` rows.

**Step 4: Commit**

```bash
git add tests/userdb-comment-metadata.test.cjs
git commit -m "test: reproduce userdb comment metadata drift"
```

### Task 2: Sync metadata in mutation APIs

**Files:**
- Modify: `src/main/userdb.ts`
- Test: `tests/userdb-comment-metadata.test.cjs`

**Step 1: Implement helpers and wire mutations**

- `rewriteTableComments`
- `rewriteColumnComment`
- `deleteColumnComment`
- `deleteTableComments`

Call them from rename/drop table/column paths after successful DDL.

**Step 2: Run focused tests**

Run: `node --test tests/userdb-comment-metadata.test.cjs`

Expected: pass.

**Step 3: Commit**

```bash
git add src/main/userdb.ts tests/userdb-comment-metadata.test.cjs
git commit -m "fix: sync userdb comments across schema mutations"
```

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
git diff --check origin/master...HEAD
```

Expected: all clean.
