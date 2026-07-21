# Datell 1.0.7 Release Notes

## Highlights

- UserDB integrity campaign: safer create/alter/import/export/execute paths for identifiers, types, integers, and column comments.
- Protect reserved `__col_comments` meta table from managed `dropTable`/`renameTable` and from SQL-console `DROP` / `ALTER RENAME`.
- Reject blank column types in managed `alterColumn`; coerce batch insert and import cells by column type; preserve integers beyond JS safe range in export and SQL execute.
- Classify SQL console statements via better-sqlite3 `statement.reader` so `WITH … INSERT` and write PRAGMAs are not mis-read as queries.

## Build / CI

- Refresh `package-lock.json` so `npm ci` stays in sync (including `@emnapi/core` / `@emnapi/runtime`).
- GitHub Actions Build Windows / macOS / Linux now use Node.js 22 (required by Electron 41 tooling).

## Validation

- Full product suite `tests/*.test.cjs` green locally (153 tests).
- Main-process and root TypeScript checks clean.
