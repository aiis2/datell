# UserDB Meta Table Drop/Rename Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse managed `dropTable` / `renameTable` when the target (or rename-from) is the reserved `__col_comments` meta table, without changing normal user-table drop/rename or comment rewrite behavior.

**Architecture:** Fail closed at the start of `dropTable` and `renameTable` with the same reserved-name rule used by other managed UserDB mutations; leave internal meta helpers unchanged.

**Issue:** #77 (replace with assigned number if different)

---

### Task 1: Red tests

Create `tests/userdb-meta-drop-rename.test.cjs`:

- After seeding column comments (so `__col_comments` exists with rows):
  - `dropTable(id, '__col_comments')` throws; meta table still in `sqlite_master`; comment rows unchanged.
  - `renameTable(id, '__col_comments', 'renamed_meta')` throws; meta still named `__col_comments`; rows unchanged.
- `renameTable(id, 'users', '__col_comments')` still throws (rename **to** reserved).
- Normal user table: create, comment, `renameTable` then `dropTable` still works; comments follow rename and clear on drop.

Commit: `test: reproduce unprotected drop/rename of __col_comments`

### Task 2: Implement

Modify `src/main/userdb.ts`:

- `dropTable`: reject reserved `__col_comments` (and keep consistent with other reserved checks) before any DROP.
- `renameTable`: reject when `oldName` is reserved `__col_comments` before ALTER RENAME.

Commit: `fix: protect __col_comments from managed drop/rename`

### Task 3: Full verification

```bash
node --test tests/userdb-meta-drop-rename.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
