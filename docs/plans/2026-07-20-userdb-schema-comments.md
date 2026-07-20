# UserDB Schema Comments Reader Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `getUserDBSchema` return stored column comments and hide `__col_comments` from schema/table counts.

**Architecture:** Extend the existing schema reader to join `__col_comments` and apply the same meta-table exclusion used for internal tables. No new IPC.

**Tech Stack:** TypeScript, better-sqlite3, Node CJS product tests.

**Issue:** #37

---

### Task 1: Reproduce missing schema comments

**Files:**
- Create: `tests/userdb-schema-comments.test.cjs`

**Step 1: Harness**

Reuse UserDB product-test harness (temp dataDir mock + transpile `userdb.ts`).

**Step 2: Red cases**

- `alterColumn` sets a comment → `getUserDBSchema` must return `columns[].comment`.
- After `renameTable` / `renameColumn`, schema returns comments under new names.
- After `dropColumn`, schema has no comment for the removed column; remaining columns keep theirs.
- After any comment write, `__col_comments` is not in `getUserDBSchema().tables`.
- `listUserDBs().tableCount` does not count `__col_comments` as a user table.

**Step 3: Commit red tests**

```bash
git add tests/userdb-schema-comments.test.cjs
git commit -m "test: reproduce missing userdb schema comments"
```

### Task 2: Implement schema comment reader + meta exclusion

**Files:**
- Modify: `src/main/userdb.ts`
- Test: `tests/userdb-schema-comments.test.cjs`

**Steps:**

1. Exclude `__col_comments` from `getUserDBSchema` listings and totals.
2. Exclude `__col_comments` from `listUserDBs` tableCount.
3. Load comments and attach to columns.
4. Commit:

```bash
git commit -m "feat: return userdb column comments from schema"
```

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
git diff --check origin/master...HEAD
```
