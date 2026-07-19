# UserDB Stable Row Identity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure an embedded SQLite table-preview cell edit can update exactly one database-identified row and can never infer identity from visible column values.

**Architecture:** Extend the UserDB table-data IPC contract with hidden row locators generated from an intrinsic SQLite rowid or the complete declared primary key. Validate locators against live schema in the main process, require one affected row, and make the renderer read-only when no stable locator exists.

**Tech Stack:** TypeScript, better-sqlite3, Electron IPC/preload, React, Node CJS tests, Vite.

---

### Task 1: Reproduce multi-row corruption with real UserDB functions

**Files:**
- Create: `tests/userdb-row-identity.test.cjs`

**Step 1: Build an isolated UserDB harness**

Load `src/main/userdb.ts` against a temporary data directory, create a database and a table with duplicate first-column values, and clean up all registry/database/WAL files after each test.

**Step 2: Write the failing corruption regression**

Preview two rows such as `['east', 10]` and `['east', 20]`, update only the first returned row through the desired locator API, and assert the final rows are `['east', 99]` and `['east', 20]`.

**Step 3: Run on authoritative mainline**

Run: `node --test tests/userdb-row-identity.test.cjs`

Expected on `origin/master@2e2b448`: FAIL because no row locators exist and the legacy update API matches both rows.

**Step 4: Commit red evidence**

```bash
git add tests/userdb-row-identity.test.cjs
git commit -m "test: reproduce ambiguous table row update"
```

### Task 2: Define and generate stable locators

**Files:**
- Modify: `src/main/userdb.ts`
- Test: `tests/userdb-row-identity.test.cjs`

**Step 1: Add contract cases**

Cover:

- a normal rowid table with duplicate visible values;
- a table whose user schema shadows `rowid` but leaves another intrinsic alias available;
- a single-column explicit primary key;
- a composite primary key;
- a composite `WITHOUT ROWID` table;
- a table/view for which no locator can be proven.

Assert locators align one-to-one with rows and never appear in visible `columns`.

**Step 2: Run tests to verify locator cases fail**

Run: `node --test tests/userdb-row-identity.test.cjs`

Expected: FAIL because the response has no `rowLocators` or `editable` fields.

**Step 3: Implement schema inspection and preview selection**

Add shared exported locator/result types, inspect `PRAGMA table_info` plus `sqlite_master`, select an unshadowed intrinsic rowid alias for rowid tables, otherwise construct complete ordered primary-key locators, and return null locators when identity is unavailable.

**Step 4: Run focused tests**

Run: `node --test tests/userdb-row-identity.test.cjs`

Expected: locator-generation cases pass; update cases remain red until Task 3.

**Step 5: Commit**

```bash
git add src/main/userdb.ts tests/userdb-row-identity.test.cjs
git commit -m "feat: expose stable userdb row locators"
```

### Task 3: Enforce exactly-one-row updates

**Files:**
- Modify: `src/main/userdb.ts`
- Test: `tests/userdb-row-identity.test.cjs`

**Step 1: Add negative update tests**

Cover unknown tables, unknown update columns, empty updates, malformed rowid locators, incomplete/extra primary-key columns, stale locators, and any result whose changed-row count is not exactly one.

**Step 2: Replace the legacy update API**

Accept a `UserDBRowLocator`, validate table/update/key identifiers against live schema, build the `WHERE` predicate only from validated identity metadata, run transactionally, and return `{ changes: 1 }` only after exact success.

**Step 3: Run focused tests**

Run: `node --test tests/userdb-row-identity.test.cjs`

Expected: all product-function tests pass; duplicate visible values no longer cause a batch update.

**Step 4: Commit**

```bash
git add src/main/userdb.ts tests/userdb-row-identity.test.cjs
git commit -m "fix: update userdb rows by stable identity"
```

### Task 4: Carry locators through Electron IPC

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/types/index.ts`
- Create: `tests/userdb-row-identity-ipc.test.cjs`

**Step 1: Write red structural assertions**

Assert that preload and renderer types expose the typed locator/result contract, the IPC handler accepts a locator instead of `whereCol/whereVal`, and the legacy signature is absent.

**Step 2: Run structural tests to verify failure**

Run: `node --test tests/userdb-row-identity-ipc.test.cjs`

Expected: FAIL on the legacy four-argument update contract.

**Step 3: Update IPC, preload, and renderer API types**

Forward the locator unchanged to the validated main-process function and return `{ changes: 1 }`.

**Step 4: Run focused tests and both compilers**

Run: `node --test tests/userdb-row-identity.test.cjs tests/userdb-row-identity-ipc.test.cjs`

Run: `npx tsc --noEmit`

Run: `npx tsc -p src/main/tsconfig.json`

Expected: all pass.

**Step 5: Commit**

```bash
git add src/main/main.ts src/main/preload.ts src/renderer/types/index.ts tests/userdb-row-identity-ipc.test.cjs
git commit -m "fix: carry stable row locators over ipc"
```

### Task 5: Integrate the editable preview

**Files:**
- Modify: `src/renderer/components/database/DatabaseManagementTab.tsx`
- Modify: `src/renderer/i18n/locales/zh-CN.ts`
- Modify: `src/renderer/i18n/locales/en-US.ts`
- Create: `tests/userdb-row-identity-renderer.test.cjs`

**Step 1: Write red renderer assertions**

Require per-row locator use, forbid `data.columns[0]`/`row[0]` identity fallback, require edit gating on locator availability, and require `fetchData(page)` after a successful update.

**Step 2: Run renderer assertions to verify failure**

Run: `node --test tests/userdb-row-identity-renderer.test.cjs`

Expected: FAIL because the component still guesses the first visible column and applies an optimistic local update.

**Step 3: Implement locator-aware editing**

Use the locator corresponding to the selected row, disable double-click editing when unavailable, show the localized read-only identity hint, call the new update API, and refetch the active page after success.

**Step 4: Run focused tests and renderer TypeScript**

Run: `node --test tests/userdb-row-identity*.test.cjs`

Run: `npx tsc --noEmit`

Expected: all pass.

**Step 5: Commit**

```bash
git add src/renderer/components/database/DatabaseManagementTab.tsx src/renderer/i18n/locales tests/userdb-row-identity-renderer.test.cjs
git commit -m "fix: edit preview rows by database identity"
```

### Task 6: Reverse and full verification

**Files:**
- Modify tests only if verification exposes a missing invariant

**Step 1: Reverse-verify corruption**

Run the committed product-function regression against `origin/master@2e2b448`.

Expected: FAIL because the old preview/update contract has no locator and changes duplicate rows.

**Step 2: Run the complete test suite**

Run: `node --test tests/*.test.cjs`

Expected: every test passes.

**Step 3: Run compilers and production build**

Run: `npx tsc --noEmit`

Run: `npx tsc -p src/main/tsconfig.json`

Run: `npx vite build`

Expected: all exit 0. Existing bundle warnings remain tracked by the performance audit.

**Step 4: Re-run security smoke tests**

Run: `node scripts/smoke-report-preview-isolation.cjs --expect-isolated`

Run: `node scripts/smoke-export-origin-isolation.cjs --expect-isolated`

Run: `node scripts/smoke-export-runtime-compatibility.cjs --expect-isolated`

Expected: all pass.

**Step 5: Run audits and repository checks**

Run: `npm audit --omit=dev --registry=https://registry.npmjs.org`

Run: `npm audit --registry=https://registry.npmjs.org`

Run: `git diff --check origin/master...HEAD`

Expected: zero vulnerabilities and no whitespace errors.

**Step 6: Request independent review**

Review against Issue #16 and the merged Spec PR, focusing on rowid shadowing, composite keys, schema validation, changed-row enforcement, stale locators, IPC typing, renderer fallback removal, and test isolation.
