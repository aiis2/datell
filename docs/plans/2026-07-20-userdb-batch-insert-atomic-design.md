# UserDB batchInsert Atomicity Design

## Mainline

This design starts from authoritative `origin/master@81a028a` and addresses Issue #43.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`batchInsert` wraps each 500-row chunk in its own transaction. If row N fails a UNIQUE/NOT NULL constraint after earlier chunks committed, the table keeps partial data and the caller receives a partial `inserted` count. Managed file import was fixed via `importTable`, but `userdb:batchInsert` remains a public IPC API.

## Invariant

A single `batchInsert` call is all-or-nothing: either every provided row is inserted, or the table is unchanged from before the call.

## Chosen Design

1. Keep the public signature `batchInsert(id, tableName, columns, rows) => { inserted }`.
2. Resolve/quote table and columns (existing quoting).
3. Run **one** outer `db.transaction` that inserts every row (optional internal chunking only for statement reuse, still inside the same transaction).
4. On any insert failure, the transaction rolls back; rethrow the SQLite error.
5. Empty `rows` returns `{ inserted: 0 }` without writing.

No renderer changes required.

## Alternatives Rejected

### Document partial success only

Callers still get corrupted intermediate state; hard to recover.

### Remove batchInsert and force importTable

Breaks callers that insert into existing tables; out of scope.

### Return partial results with a flag

Worse API; prefer fail-closed atomicity.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Long transactions on huge payloads | Acceptable for desktop local SQLite; same class as importTable |
| Memory for large arrays | Already held by the caller before IPC |

## Verification Strategy

1. Insert rows that violate UNIQUE on a later row; assert zero surviving inserts from that call.
2. Successful multi-chunk-sized payload inserts all rows.
3. Red on current master, green after fix; full suite + tsc.
