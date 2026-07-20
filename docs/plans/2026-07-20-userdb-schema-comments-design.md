# UserDB Schema Comments Reader Design

## Mainline

This design starts from authoritative `origin/master@28fbbdf` and addresses Issue #37.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Column comments are written into `__col_comments` and kept aligned by managed mutations, but the only schema reader used by Database Management never joins them. After save + refresh, comments always appear empty. Reopening the column editor starts from `''`, so a no-op save can wipe stored text.

The same listing filter only excludes `sqlite_%`, so once the meta table exists it shows up as a user table and inflates `listUserDBs().tableCount`.

## Invariant

Managed schema readers must expose the same column comments that managed writers store, and must not present internal metadata tables as user tables.

## Chosen Design

1. **Exclude meta table everywhere we list user tables**
   - `getUserDBSchema` table queries and total count: `name NOT LIKE 'sqlite_%' AND name != '__col_comments'`.
   - `listUserDBs` tableCount query: same exclusion.

2. **Attach comments in `getUserDBSchema`**
   - If `__col_comments` is absent, leave `comment` undefined/empty (no error).
   - If present, load comment rows once (or per table) and map onto columns by case-insensitive table/column name match, using the live names from `PRAGMA table_info`.
   - Populate `columns[].comment` when a non-empty stored value exists (or always pass through stored string including empty — prefer omit/empty when no row).

3. **No public API signature change**
   - `UserDBSchemaInfo` already allows `comment?: string`.
   - No new IPC channels.

## Alternatives Rejected

### Only fix the renderer cache

Would still leave any schema consumer without comments and would not hide `__col_comments`.

### Store comments only in CREATE TABLE SQL

SQLite does not preserve free-form column comments in `sqlite_master` for ordinary tables; the side table remains the product contract.

### Expose `__col_comments` as a visible system table

Conflicts with the management mental model of user tables only; meta bookkeeping should stay internal.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Meta table missing | Tolerate absence; no throw |
| Case mismatch after renames | Match with resolved live names / case-insensitive keys |
| Performance on many tables | One comment query (or per-table with index) is enough for desktop schema panels |

## Verification Strategy

1. Product-function tests: set comment via `alterColumn`, assert `getUserDBSchema` returns it.
2. Assert rename paths surface comments under new names.
3. Assert `__col_comments` is absent from schema and does not inflate tableCount.
4. Red on current master, green after fix; full CJS suite + both `tsc` checks.
