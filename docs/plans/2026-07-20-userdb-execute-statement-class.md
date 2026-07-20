# UserDB executeUserDBSQL Statement Classification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Classify SQL console statements with better-sqlite3 `Statement.reader` so CTE DML and write PRAGMAs execute via `run()` instead of failing on `all()`.

**Architecture:** One-line path decision in `executeUserDBSQL` after `prepare`; keep result shapes and readOnly guard.

**Issue:** #59

---

### Task 1: Red tests

Create `tests/userdb-execute-statement-class.test.cjs`:

- `WITH … INSERT` currently fails (red) / after fix inserts and returns changes.
- `PRAGMA user_version = N` currently fails / after fix succeeds and is readable.
- `WITH … SELECT` returns rows.
- `PRAGMA table_info(t)` returns rows.
- Plain `INSERT` still returns changes metadata.

Commit: `test: reproduce userdb execute statement misclassification`

### Task 2: Implement reader-based path

Modify `src/main/userdb.ts` `executeUserDBSQL`: use `stmt.reader` instead of prefix regex.

Commit: `fix: classify userdb execute statements via statement.reader`

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
