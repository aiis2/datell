# UserDB importTable Type Coercion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Coerce `importTable` cell values by column affinity/nullability (same rules as `updateRow` / `batchInsert`) so file imports do not store empty strings as fake numerics.

**Architecture:** Map each bind value through `coerceUpdateValue` using descriptors derived from import column type declarations, inside the existing outer import transaction.

**Issue:** #71 (replace with assigned number if different)

---

### Task 1: Red tests

Create `tests/userdb-import-table-coercion.test.cjs`:

- Empty string → NULL on nullable INTEGER.
- Invalid `'abc'` on INTEGER throws; no residual imported table/rows.
- Empty on INTEGER NOT NULL throws; no residual table.
- Valid `"42"` / REAL `"1.5"` coerce correctly.
- TEXT empty / text values per coerce rules.
- Multi-row success inserts all.
- Replace + invalid payload leaves prior table data intact.

Commit: `test: reproduce userdb importTable type coercion gaps`

### Task 2: Implement

Modify `src/main/userdb.ts` `importTable`.

Commit: `feat: coerce userdb importTable cells by column type`

### Task 3: Full verification

```bash
node --test tests/userdb-import-table-coercion.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
