# UserDB batchInsert Type Coercion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Coerce `batchInsert` cell values by column affinity/nullability (same rules as `updateRow`) so imports do not store empty strings as fake numerics.

**Architecture:** Resolve live column metadata for the target table/column list; map each bind value through `coerceUpdateValue` inside the existing outer transaction.

**Issue:** #68 (replace with assigned number if different)

---

### Task 1: Red tests

Create `tests/userdb-batch-insert-coercion.test.cjs`:

- Empty string → NULL on nullable INTEGER (`typeof` null).
- Invalid `'abc'` on INTEGER throws; table has no rows from that call; prior good row intact if any.
- Empty on INTEGER NOT NULL throws; no insert.
- Valid `"42"` stores as integer; REAL `"1.5"` stores real.
- TEXT empty / text values accepted per `coerceUpdateValue`.
- Multi-row valid batch inserts all rows transactionally.

Commit: `test: reproduce userdb batchInsert type coercion gaps`

### Task 2: Implement

Modify `src/main/userdb.ts` `batchInsert`.

Commit: `feat: coerce userdb batchInsert cells by column type`

### Task 3: Full verification

```bash
node --test tests/userdb-batch-insert-coercion.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
