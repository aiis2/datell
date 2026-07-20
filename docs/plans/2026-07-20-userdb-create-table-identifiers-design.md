# UserDB createTable Identifier Validation Design

## Mainline

This design starts from authoritative `origin/master@1925f91` and addresses Issue #55.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Managed `createTable` only enforces single-statement CREATE TABLE. SQLite accepts quoted empty identifiers, so:

- `CREATE TABLE "" (a TEXT)` and `CREATE TABLE "  " (a TEXT)` create tables named `''` / `'  '`.
- `CREATE TABLE t ("" TEXT)` creates an empty column name.

These corrupt schema identity and break management APIs (same class as rename/createUserDB empty-name fixes).

## Invariant

Managed `createTable` never creates a table whose name is empty/blank after trim, and never creates columns whose names are empty/blank after trim.

## Chosen Design

After `extractSingleCreateTableSql` returns a single statement, parse identifiers enough to validate before `db.prepare(...).run()`:

1. Match `CREATE TABLE [IF NOT EXISTS] <tableName> (` (table name may be double-quoted or bare).
2. Resolve table name: strip surrounding double quotes and unescape `""` → `"`; reject if trim is empty; reject reserved `sqlite_%` / `__col_comments` (optional but consistent with other APIs).
3. Parse the top-level column list (respect nested parentheses for types/constraints, double-quoted identifiers, single-quoted strings) and extract each column definition's leading identifier.
4. Reject empty/blank column names and case-insensitive duplicate column names.
5. On any validation failure, throw and do not execute DDL.

Keep IF NOT EXISTS and valid quoted non-empty names working. No IPC change.

## Alternatives Rejected

### Rely on SQLite errors only

SQLite does not reject empty quoted identifiers.

### Renderer-only validation

Bypassable via IPC; main process must enforce.

### Full SQL grammar

Out of scope; only identifiers on the managed create path.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Complex CHECK / GENERATED columns | Column name is always the first identifier of each top-level comma-separated definition; constraints without a leading name (table constraints) start with keywords like PRIMARY/UNIQUE/CHECK/FOREIGN/CONSTRAINT — skip those |
| Bracket-quoted identifiers | Product UI uses double quotes; optional support if easy |

## Verification Strategy

Product tests: empty/blank table and column names throw with no residual table; valid CREATE still works. Full CJS suite + both tsc. Issue → Spec → Impl PRs.
