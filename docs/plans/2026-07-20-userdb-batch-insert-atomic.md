# UserDB batchInsert Atomicity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `batchInsert` all-or-nothing for a single call.

**Architecture:** One outer better-sqlite3 transaction around the full row payload in `src/main/userdb.ts`.

**Tech Stack:** TypeScript, better-sqlite3, Node CJS tests.

**Issue:** #43

---

### Task 1: Reproduce partial commit on constraint failure

**Files:**
- Create: `tests/userdb-batch-insert-atomic.test.cjs`

**Red cases:**
- Later UNIQUE failure leaves earlier rows from the same call inserted (current defect).
- Desired API: same failure leaves zero rows from that call.
- Successful insert of >500 rows inserts all.

**Commit:** `test: reproduce partial userdb batchInsert`

### Task 2: Single-transaction batchInsert

**Files:**
- Modify: `src/main/userdb.ts`

**Commit:** `feat: make userdb batchInsert fully transactional`

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
