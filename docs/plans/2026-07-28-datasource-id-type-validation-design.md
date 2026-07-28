# Datasource ID and Type Save Validation Design

## Mainline

This design starts from authoritative `origin/master@7bc6268` and addresses Issue #126.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Issue #123 / #125 made main-process `saveDatasource` refuse blank `name`/`host`/`database` and invalid ports. Two identity fields remain unchecked:

1. **`id`** — empty string collides in `findIndex` so successive saves overwrite one row; whitespace-only ids create unmanageable entries.
2. **`type`** — any string (including `""` / `"sqlite"`) is written to `datasources.json`, but runtime only supports `mysql` | `doris` | `postgresql` | `presto`, so Test/Query fail later with a confusing “unsupported type” error.

UI enums are not an integrity boundary; IPC can bypass them.

## Invariant

`saveDatasource` must refuse empty/blank `id` (after trim) and any `type` outside the supported `DatasourceType` set. Successful saves persist a trimmed `id`. Existing name/host/database/port/username trim and masked-password behavior remain unchanged.

## Chosen Design

### Extend validation inside `saveDatasource`

In `src/main/datasource.ts`, before write:

1. Require `id` to be a non-empty string after `trim()`; persist the trimmed value.
2. Require `type` to be one of: `mysql`, `doris`, `postgresql`, `presto` (exact match).
3. Keep existing field/port helpers and `__MASKED__` password resolution.

Stable error messages:

- `Datasource id cannot be empty or blank`
- `Datasource type must be one of: mysql, doris, postgresql, presto`

### Alternatives Rejected

| Option | Why not |
|--------|---------|
| Auto-generate id when blank | Hides caller bugs; product already generates ids in UI |
| Coerce unknown type to mysql | Silent data corruption |
| Validate only on test-connection | Invalid rows still pollute the list |

## Verification Strategy

1. RED: empty/blank id and unsupported type currently persist; two empty-id saves collapse to one row.
2. GREEN: those throw; valid save trims id; prior name/port/mask tests remain green.
3. Full CJS suite + both TypeScript compilers.
