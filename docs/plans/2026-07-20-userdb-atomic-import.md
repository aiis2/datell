# UserDB Atomic File Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make managed UserDB file import atomic and refuse silent re-import into an existing table by default.

**Architecture:** Add `importTable` in the main process that validates names/columns, applies an existence policy (`error` default, optional `replace`), and performs create + insert in one transaction. Wire IPC/preload and the import dialog to this API.

**Tech Stack:** TypeScript, better-sqlite3, Electron IPC, React import dialog, Node CJS tests.

---

### Task 1: Reproduce silent re-import / partial import defects

**Files:**
- Create: `tests/userdb-atomic-import.test.cjs`

**Step 1: Harness**

Reuse UserDB product-test harness.

**Step 2: Red cases**

- First import via current composition leaves table if later insert fails (if easy to force) or document create-before-insert split.
- Same-name re-import with same schema appends duplicates under current path.
- Target API tests written against desired `importTable` will fail until implemented.

Prefer writing tests against the desired `importTable` API so implementation is TDD-driven.

**Step 3: Commit red tests**

```bash
git add tests/userdb-atomic-import.test.cjs
git commit -m "test: reproduce unsafe userdb file import"
```

### Task 2: Implement importTable in main process

**Files:**
- Modify: `src/main/userdb.ts`
- Test: `tests/userdb-atomic-import.test.cjs`

**Steps:**

1. Implement validation + transactional import.
2. Cover:
   - atomic first import
   - default refuse if exists
   - replace mode
   - empty/blank/duplicate column names
   - row width mismatch
   - insert failure rolls back new table
3. Commit:

```bash
git commit -m "feat: add atomic userdb table import"
```

### Task 3: IPC + renderer wiring

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/types/index.ts` (if needed)
- Modify: `src/renderer/components/database/DatabaseManagementTab.tsx`
- Modify: `src/renderer/i18n/locales/en-US.ts`
- Modify: `src/renderer/i18n/locales/zh-CN.ts`
- Create: `tests/userdb-atomic-import-renderer.test.cjs`

**Steps:**

1. Expose `userdb:importTable`.
2. Switch import dialog to the new API with `ifExists: 'error'`.
3. Structural test forbids `CREATE TABLE IF NOT EXISTS` in import path.
4. Commit:

```bash
git commit -m "feat: wire import dialog to atomic userdb import"
```

### Task 4: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
git diff --check origin/master...HEAD
```
