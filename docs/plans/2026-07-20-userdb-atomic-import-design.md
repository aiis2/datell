# UserDB Atomic File Import Design

## Mainline

This design starts from authoritative `origin/master@ef7cc8e` and addresses Issue #34.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

DB management file import currently composes:

1. `CREATE TABLE IF NOT EXISTS "<table>" (...)`
2. Chunked `batchInsert` calls of 500 rows

Real product-function probes on mainline show:

| Scenario | Result |
|----------|--------|
| First import | Works, but create is outside the insert batches |
| Re-import same name + same schema | Silently appends rows, including duplicates |
| Re-import same name + wider schema | Create no-ops, insert fails with missing-column error |
| Mid-import insert failure | Can leave a new table with partial rows across chunks |

Users expect a named import either to create a fresh table or to refuse/replace explicitly — not to append silently.

## Invariant

A managed file import either:

1. creates one new table and inserts all provided rows atomically, or
2. fails closed with a clear error and leaves existing schema/data unchanged.

Silent append and half-imported tables are forbidden for the default import path.

## Chosen Design

### New main-process API

```ts
type UserDBImportColumn = { name: string; type: string };

type UserDBImportOptions = {
  ifExists?: 'error' | 'replace'; // default 'error'
};

function importTable(
  id: string,
  tableName: string,
  columns: UserDBImportColumn[],
  rows: unknown[][],
  options?: UserDBImportOptions,
): { inserted: number };
```

### Validation

- Table name: non-empty after trim; reject internal names (`sqlite_*`, `__col_comments`).
- Columns: at least one; each name non-empty/blank; no duplicate names (case-insensitive).
- Types: non-empty; reject `;` / comment markers as multi-statement defense.
- Rows: each row length must match column count.

### Existence policy

- Default `ifExists: 'error'`: if the table already exists, throw a clear error such as `Table already exists: sales`.
- `ifExists: 'replace'`: drop the existing table (and its comment metadata), then create + insert.

### Atomicity

Inside one write transaction:

1. Optional drop when replace is requested.
2. `CREATE TABLE` with quoted identifiers and validated types.
3. Insert all rows (can still use internal batching, but under the same transaction).
4. Commit only if every step succeeds.

Failure must not leave a newly created half-filled table. Replace mode must not leave the old table half-deleted; use transaction so drop/create/insert are atomic.

### IPC / renderer

- Add `userdb:importTable` handler and preload method.
- Update `DatabaseManagementTab` import dialog to call `importTable` instead of `createTable(IF NOT EXISTS)` + chunked `batchInsert`.
- Default UI uses `ifExists: 'error'`.
- Add i18n strings for table-already-exists and import validation errors (en-US + zh-CN).

### Compatibility

Keep `createTable` and `batchInsert` for other callers. Import no longer depends on `IF NOT EXISTS` semantics.

## Alternatives Rejected

### Always append

Preserves current behavior but is the defect. Duplicates and schema mismatches remain.

### Always replace without confirmation

Dangerous for accidental same-name imports. Fail closed by default; replace is explicit.

### Only fix the renderer

Main-process API remains usable by any IPC caller and would still allow unsafe composition.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Large imports hold a long transaction | Acceptable for desktop local SQLite; keep batching inside one transaction |
| Users want append | Out of scope; they can use SQL console or a future explicit append mode |
| Replace drops dependent views | Document; managed import targets base tables created by import |
| Progress UI currently updates per chunk | Can report total after completion, or emit progress inside the API later; first version may set progress once at end or approximate |

## Verification Strategy

1. Product-function tests for atomic first import, refuse existing table, replace mode, empty/duplicate columns, row width mismatch, rollback on insert failure.
2. Structural/renderer tests prove import dialog no longer uses `CREATE TABLE IF NOT EXISTS` + chunked batch insert for the happy path.
3. Reverse verification fails on `origin/master@ef7cc8e`.
4. Full CJS suite, both TypeScript compilers, whitespace check.

## Scope Boundary

This cycle only adds managed atomic import and wires the import dialog. Free-form SQL console behavior and sandbox isolation remain separate.
