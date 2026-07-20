# UserDB addColumn Name Validation Design

## Mainline

This design starts from authoritative `origin/master@786d2a2` and addresses Issue #31.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`addColumn` currently does:

```ts
db.prepare(`ALTER TABLE "${safe(tableName)}" ADD COLUMN "${safe(colName)}" ${colType}`).run();
```

It quote-escapes names but does not validate them. Empty and whitespace-only names become real SQLite columns:

```text
addColumn(id, 'sales', '', 'TEXT')   -> column name ""
addColumn(id, 'sales', '  ', 'TEXT') -> column name "  "
```

Those columns are difficult to manage in the UI and break ordinary identifier assumptions for preview/export/edit flows.

## Invariant

Managed `addColumn` must add exactly one usable named column to an existing user table, or fail closed without schema mutation.

## Chosen Design

1. Resolve the target as a real user table via `sqlite_master` (not a view / internal table).
2. Trim and validate `colName`:
   - reject empty / whitespace-only
   - keep the original non-trimmed content only if we decide to preserve interior spaces; for management UX, use the trimmed name as the stored identifier after validation succeeds on the trimmed form
3. Reject unknown tables with `Unknown table: ...`.
4. Execute `ALTER TABLE ... ADD COLUMN` with `quoteIdentifier` on validated table/column names.
5. Let SQLite continue to reject duplicate column names; optionally wrap with a clearer message if cheap.
6. Reject `colType` that contains `;` or additional statements after a lightweight scan (defense in depth; single-statement prepare already helps).

No public API signature change.

## Alternatives Rejected

### Allow empty names because SQLite allows them

Technically valid SQLite, but unusable in Datell's management UI and export/edit paths.

### Full identifier grammar / reserved-word blocking

Too broad for this cycle. Empty/blank rejection fixes the proven defect without inventing a full SQL linter.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Existing DBs already have empty column names | Out of scope; this prevents new ones |
| Legitimate quoted names with spaces | Allow non-empty names that contain interior spaces after trim |
| Type expressions with parentheses | Allow common types like `VARCHAR(20)` / `DECIMAL(10,2)`; only reject multi-statement separators |

## Verification Strategy

1. Product-function tests prove empty/blank names throw and leave schema unchanged.
2. Cover valid add, unknown table, duplicate column.
3. Reverse verification fails on `origin/master@786d2a2`.
4. Full CJS suite, both TypeScript compilers, whitespace check.

## Scope Boundary

Only `addColumn` validation. Import overwrite policy and free-form SQL console remain separate.
