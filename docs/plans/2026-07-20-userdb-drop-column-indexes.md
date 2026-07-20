# UserDB Drop-Column Index Dependency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make UserDB `dropColumn` succeed for columns referenced by secondary indexes while preserving remaining data and unrelated indexes.

**Architecture:** Inventory dependent indexes with identifier-aware matching, drop those indexes, then run `ALTER TABLE ... DROP COLUMN`. If SQLite still rejects the drop, fall back to a DDL-preserving rebuild that removes only the selected column and recreates non-dependent indexes/triggers.

**Tech Stack:** TypeScript, better-sqlite3, Node CJS tests.

---

### Task 1: Reproduce indexed drop-column failure

**Files:**
- Create: `tests/userdb-drop-column-indexes.test.cjs`

**Step 1: Reuse the UserDB harness**

Mirror `tests/userdb-alter-column-constraints.test.cjs` / `tests/userdb-row-identity.test.cjs` (transpile `userdb.ts`, mock `./dataDir`, temp cleanup).

**Step 2: Write the failing regression**

Create `sales(id, amount, note)`, add `idx_sales_amount(amount)` and `idx_sales_note(note)`, insert a row, call `dropColumn(..., 'amount')`, and assert:

- column `amount` is gone
- row data for `id` / `note` remains
- `idx_sales_note` remains
- `idx_sales_amount` is gone

**Step 3: Run on authoritative mainline**

Run: `node --test tests/userdb-drop-column-indexes.test.cjs`

Expected on `origin/master@0cbfba8`: FAIL with SQLite index dependency error.

**Step 4: Commit red evidence**

```bash
git add tests/userdb-drop-column-indexes.test.cjs
git commit -m "test: reproduce dropColumn index dependency failure"
```

### Task 2: Implement dependency-aware dropColumn

**Files:**
- Modify: `src/main/userdb.ts`
- Test: `tests/userdb-drop-column-indexes.test.cjs`

**Step 1: Expand contract cases**

Cover:

- single-column index dependency
- multi-column index that includes the dropped column (index removed)
- unrelated indexes retained
- quoted identifiers
- unknown table/column rejected
- remaining row data preserved
- CHECK/generated fallback if a reproducible case exists on this SQLite build

**Step 2: Run tests to verify red**

Run: `node --test tests/userdb-drop-column-indexes.test.cjs`

Expected: FAIL before implementation.

**Step 3: Implement**

In `dropColumn`:

1. Validate table/column against live schema.
2. Collect non-internal indexes for the table.
3. Mark indexes whose SQL references the target column with identifier-aware matching.
4. Transactionally drop dependent indexes, then `ALTER TABLE ... DROP COLUMN`.
5. On residual SQLite dependency errors, fall back to DDL rebuild without the column and recreate only non-dependent indexes/triggers.
6. Fail closed on unknown targets / unrecoverable schema.

**Step 4: Run focused tests**

Run: `node --test tests/userdb-drop-column-indexes.test.cjs`

Expected: all pass.

**Step 5: Commit**

```bash
git add src/main/userdb.ts tests/userdb-drop-column-indexes.test.cjs
git commit -m "fix: drop userdb columns referenced by indexes"
```

### Task 3: Full verification

**Step 1: Reverse-verify on pre-fix mainline**

Confirm the committed regression fails against `origin/master@0cbfba8` behavior.

**Step 2: Full suite**

Run: `node --test tests/*.test.cjs`

Expected: all pass.

**Step 3: Compilers and diff check**

Run:

```bash
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
git diff --check origin/master...HEAD
```

Expected: all clean.

**Step 4: Review**

Review against Issue #22 and Spec PR for identifier matching, unrelated index retention, transactional failure, and fallback rebuild safety.
