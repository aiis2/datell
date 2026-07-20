# UserDB Cell Edit Type Coercion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Coerce `updateRow` values by column affinity/nullability so cell edits do not store empty strings as fake numerics.

**Architecture:** Add a small coerce helper in `src/main/userdb.ts` used by `updateRow` before binding parameters.

**Issue:** #52

---

### Task 1: Red tests

Create `tests/userdb-cell-type-coercion.test.cjs`:

- Empty string → NULL on nullable INTEGER.
- Empty string rejected on INTEGER NOT NULL; row unchanged.
- `"42"` → integer; `"abc"` throws.
- Empty string → NULL on nullable TEXT; `''` allowed on TEXT NOT NULL.
- REAL accepts `"1.5"`, rejects `"x"`.

Commit: `test: reproduce userdb cell type coercion gaps`

### Task 2: Implement coercion in updateRow

Modify `src/main/userdb.ts`.

Commit: `feat: coerce userdb cell updates by column type`

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
