# UserDB Stable Row Identity Design

## Mainline

This design starts from authoritative `origin/master@2e2b448d041f4667a8d3bb64b2458b4d77ad4061` and addresses Issue #16.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

The editable embedded-SQLite preview does not receive row identity from SQLite. It guesses that the first visible column and value uniquely identify each row, then sends that pair to the main process for an unconstrained `UPDATE`.

This guess is false for ordinary tables and especially for imported tables, which are created without primary keys. A real product-function reproduction with two rows whose first visible value was `east` changed both rows when only the first row was edited.

The renderer comment claims to use `rowid`, but the query selects only `*`; no rowid is present in the response or update request.

## Invariant

A preview cell edit may execute only when the main process has supplied a stable locator for that exact displayed row. The update must affect exactly one live row. Display data must never be promoted into a row identity by renderer inference.

## Row Locator Contract

The table-data response gains one locator entry per returned row:

```ts
type UserDBRowLocator =
  | { kind: 'rowid'; value: string }
  | { kind: 'primary-key'; values: Record<string, unknown> };

interface UserDBTableDataResult {
  columns: string[];
  rows: unknown[][];
  rowLocators: Array<UserDBRowLocator | null>;
  editable: boolean;
  rowCount: number;
  totalCount: number;
}
```

Locators are metadata, not visible columns. The existing `columns` and `rows` shape remains suitable for display and export.

The update request becomes:

```ts
updateRow(
  id: string,
  tableName: string,
  locator: UserDBRowLocator,
  updates: Record<string, unknown>,
): { changes: 1 };
```

## Locator Selection

### Ordinary rowid tables

For tables backed by SQLite rowid, preview queries select `rowid` under a reserved internal alias alongside `*`. The alias is excluded from visible columns and values. Its value is serialized as a string so values outside JavaScript's safe integer range are not rounded.

SQLite exposes aliases such as `rowid`, `_rowid_`, and `oid`, but user columns can shadow those names. The implementation inspects live column names and selects an unshadowed intrinsic alias. If every intrinsic alias is shadowed, it falls back to a declared primary key.

### Declared primary keys

Primary-key columns are read from `PRAGMA table_info` and ordered by their `pk` sequence. Each returned row receives all primary-key column names and values. Composite keys are represented as one locator, not as a guessed single column.

Primary-key locators are required for `WITHOUT ROWID` tables. A row with an incomplete or null key receives no locator and cannot be edited.

### No usable identity

If the table has neither an accessible intrinsic rowid nor a complete declared primary key, `editable` is false and every locator is null. The UI shows a read-only identity warning and does not enter cell-edit mode.

## Main-Process Update Validation

Before constructing an update statement, the main process opens the selected database and inspects the live table schema.

- The table must exist as a user table.
- Every update column must be a current table column.
- A rowid locator is accepted only when the table supports the selected intrinsic alias.
- A primary-key locator must contain exactly the current declared primary-key columns.
- Identifier text comes only from schema metadata; request-supplied identifier names are matched against metadata before quoting.
- Empty updates are rejected.

The statement runs inside a transaction. `Statement.run().changes` must equal one. A zero-row result means the locator is stale. A multi-row result violates the contract and is rejected. The transaction prevents a partial success from being reported.

## Renderer Behavior

`TableDataPreview` stores the response locators without displaying them. Double-click editing is enabled only when `isUserDB`, `data.editable`, and the selected row has a locator.

Saving passes that row's locator instead of `columns[0]` and `row[0]`. After success, the preview refetches the current page rather than mutating one cell locally. This reflects SQLite type coercion, generated/default behavior, and triggers accurately.

The header hint changes to a read-only identity message when locators are unavailable.

## Alternatives Rejected

### Keep first-column fallback and reject `changes > 1`

This prevents some corruption but still guesses identity. A unique value can become non-unique between preview and update, and editing the key column itself creates ambiguity.

### Require users to add a primary key

This is unnecessarily restrictive for normal SQLite rowid tables and would make imported tables read-only despite SQLite already providing stable row identities.

### Display rowid as a normal column

That leaks implementation metadata into the table UI and risks users confusing it with business data. Identity remains a separate contract.

### Add a synthetic key column to every imported table

Mutating user schemas merely to support the preview changes exports and downstream queries. Hidden engine identity is less invasive.

### Use all visible column values in the `WHERE` clause

Duplicate rows remain possible, null comparison is subtle, and edited/stale values can still match zero or multiple rows. A complete row snapshot is not identity.

## Risks And Mitigations

- User columns can shadow `rowid` aliases. Live schema inspection selects only an unshadowed intrinsic alias or falls back to primary keys.
- Composite keys add IPC payload size, but only the key values for the current page are returned.
- A row can be deleted between preview and save. `changes === 0` becomes an explicit stale-row error and the UI refreshes.
- SQLite triggers can change other values. Refetch-after-save displays the database result rather than an optimistic guess.
- Views or virtual tables may not expose stable identity. They remain read-only unless a proven locator can be generated.

## Verification Strategy

1. Product-function tests create real temporary SQLite databases and prove duplicate visible values update only one row.
2. Tests cover ordinary rowid tables, a user column named `rowid`, single/composite primary keys, and `WITHOUT ROWID` tables.
3. Negative tests cover malformed/stale locators, unknown columns, empty updates, and no-identity tables.
4. Structural/renderer tests prohibit the first-column fallback and require refetch after save.
5. Reverse verification runs the corruption regression against `origin/master@2e2b448` and records the expected failure.
6. Full CJS tests, both TypeScript compilers, Vite build, Electron isolation smokes, audits, independent review, and diff checks remain mandatory.

## Scope Boundary

This cycle changes only table-preview row identity and update safety. It does not modify free-form SQL console behavior, table import schema choices, row deletion, or column-type migration. Constraint-preserving schema migration remains a separate functional cycle.
