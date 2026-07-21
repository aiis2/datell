# UserDB alterColumn Blank Type Rejection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reject empty/whitespace `newType` in managed `alterColumn` without breaking comment-only updates.

**Architecture:** Fail closed when a provided type string trims empty; leave omit-type path unchanged.

**Issue:** #74 (replace with assigned number if different)

---

### Task 1: Red tests

Create `tests/userdb-alter-column-blank-type.test.cjs`:

- `newType: ''` and `'   '` throw; live type and data unchanged.
- Comment-only with omitted type still works.
- Valid non-blank type change still applies.

Commit: `test: reproduce blank alterColumn type acceptance`

### Task 2: Implement

Modify `src/main/userdb.ts` `alterColumn`.

Commit: `fix: reject blank types in userdb alterColumn`

### Task 3: Full verification

```bash
node --test tests/userdb-alter-column-blank-type.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
