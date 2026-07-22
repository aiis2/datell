# UserDB Meta Table Row/Schema Ops Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse managed preview/update/insert/renameColumn against reserved `__col_comments` without breaking normal user-table ops.

**Architecture:** Fail closed in `inspectTableIdentity` (covers getTableData/updateRow/batchInsert) plus explicit guard on `renameColumn`.

**Issue:** #84

---

### Task 1: Red tests

Create `tests/userdb-meta-row-ops.test.cjs`:

- Seed comments.
- `getUserDBTableData(id, '__col_comments')` throws.
- `batchInsert` into meta throws; no injected rows.
- `updateRow` on meta throws (if caller somehow has a locator, or document that getTableData already refuses).
- `renameColumn(id, '__col_comments', 'comment', 'x')` throws; meta still has column `comment`.
- Normal user table getTableData / updateRow / batchInsert / renameColumn still work.

Commit: `test: reproduce managed row ops on __col_comments`

### Task 2: Implement

Modify `src/main/userdb.ts`:

- Guard reserved names in `inspectTableIdentity`.
- Guard reserved table in `renameColumn`.

Commit: `fix: refuse managed row/schema ops on __col_comments`

### Task 3: Full verification

```bash
node --test tests/userdb-meta-row-ops.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
