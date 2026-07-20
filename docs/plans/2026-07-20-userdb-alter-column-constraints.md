# UserDB Alter-Column Constraint Preservation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure UserDB `alterColumn` type/comment edits preserve table-level constraints, secondary indexes, and original DDL integrity options.

**Architecture:** Replace lossy `PRAGMA table_info` reconstruction with a DDL-preserving rebuild: read live `sqlite_master` SQL, rewrite only the selected column type, copy data transactionally, and recreate non-internal indexes/triggers.

**Tech Stack:** TypeScript, better-sqlite3, Node CJS tests, Electron IPC (unchanged surface).

---

### Task 1: Reproduce constraint loss with real UserDB functions

**Files:**
- Create: `tests/userdb-alter-column-constraints.test.cjs`

**Step 1: Reuse the existing UserDB harness pattern**

Mirror the loader in `tests/userdb-row-identity.test.cjs` (transpile `userdb.ts`, mock `./dataDir`, temp root cleanup).

**Step 2: Write the failing constraint-loss regression**

Create tables with CHECK, UNIQUE, FOREIGN KEY, and a secondary index. Call `alterColumn` on a non-key column type. Assert:

- `sqlite_master` table SQL still contains CHECK / UNIQUE / FOREIGN KEY text (or equivalent PRAGMA evidence)
- secondary index still exists with equivalent SQL
- row data remains

**Step 3: Run on authoritative mainline**

Run: `node --test tests/userdb-alter-column-constraints.test.cjs`

Expected on `origin/master@3b740fd`: FAIL because rebuild drops constraints and indexes.

**Step 4: Commit red evidence**

```bash
git add tests/userdb-alter-column-constraints.test.cjs
git commit -m "test: reproduce alterColumn constraint loss"
```

### Task 2: Preserve DDL and indexes during alterColumn

**Files:**
- Modify: `src/main/userdb.ts`
- Test: `tests/userdb-alter-column-constraints.test.cjs`

**Step 1: Expand contract cases**

Cover:

- CHECK preserved after type change
- table-level UNIQUE preserved
- FOREIGN KEY preserved
- secondary indexes recreated
- composite PRIMARY KEY preserved
- `WITHOUT ROWID` preserved
- quoted identifiers
- comment-only update does not strip constraints and preferably skips rebuild
- unknown table/column rejected
- migration that violates CHECK rolls back

**Step 2: Run tests to verify they fail**

Run: `node --test tests/userdb-alter-column-constraints.test.cjs`

Expected: FAIL on current reconstruction path.

**Step 3: Implement DDL-preserving rebuild**

In `alterColumn`:

1. Validate table/column against live schema.
2. If only comment changes and type is unchanged, write `__col_comments` and return.
3. Otherwise load original `CREATE TABLE` SQL from `sqlite_master`.
4. Rewrite only the target column type via balanced-parenthesis-aware column-list parsing.
5. Capture index SQL for the table.
6. Transactionally create temp table from rewritten DDL, copy columns in original order, drop/rename, recreate indexes.
7. Keep comment meta write after successful rebuild.

**Step 4: Run focused tests**

Run: `node --test tests/userdb-alter-column-constraints.test.cjs`

Expected: all pass.

**Step 5: Commit**

```bash
git add src/main/userdb.ts tests/userdb-alter-column-constraints.test.cjs
git commit -m "fix: preserve constraints when altering userdb columns"
```

### Task 3: Structural safety and full verification

**Files:**
- Modify tests only if verification exposes a missing invariant

**Step 1: Reverse-verify on pre-fix mainline**

Run the committed regression against `origin/master@3b740fd` source (or checkout that file in a temp harness).

Expected: FAIL with missing CHECK/UNIQUE/FK/index.

**Step 2: Run the complete test suite**

Run: `node --test tests/*.test.cjs`

Expected: every test passes.

**Step 3: Run compilers**

Run: `npx tsc --noEmit`

Run: `npx tsc -p src/main/tsconfig.json`

Expected: exit 0.

**Step 4: Diff check**

Run: `git diff --check origin/master...HEAD`

Expected: clean.

**Step 5: Request independent review**

Review against Issue #19 and the Spec PR, focusing on parenthesis-aware rewriting, index recreation order, transactional rollback, comment-only path, and rejection of views/internal tables.
