# UserDB SQL Console Meta CREATE TRIGGER Protection Design

## Mainline

This design starts from authoritative `origin/master@97597cb` (after #108/#110) and addresses Issue #111.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Meta integrity for `__col_comments` now covers DROP, ALTER-on-meta, INDEX, DML, CREATE TABLE/VIEW/VIRTUAL/TEMP forms, and RENAME TO (#80–#110).

Post-#110 probes still allow:

| Statement | Result |
|-----------|--------|
| `CREATE TRIGGER t AFTER INSERT ON __col_comments BEGIN … END` | allowed |
| `CREATE TRIGGER t BEFORE UPDATE ON "__col_comments" BEGIN … END` | allowed |
| `CREATE TEMP TRIGGER t AFTER DELETE ON __col_comments BEGIN … END` | allowed |

Triggers on meta can fire during product-managed comment maintenance and reintroduce mutation side effects the console already blocks as top-level DML.

## Invariant

`executeUserDBSQL` must refuse CREATE [TEMP|TEMPORARY] TRIGGER whose `ON` table is reserved `__col_comments`. CREATE TRIGGER on user tables remains allowed. Prior meta protections remain.

## Chosen Design

### Match CREATE TRIGGER … ON reserved

In `assertUserDBSqlDoesNotMutateMeta`:

```
CREATE [TEMP|TEMPORARY] TRIGGER [IF NOT EXISTS] <name>
  [BEFORE|AFTER|INSTEAD OF] {INSERT|UPDATE|DELETE}
  ON [schema.]<table>
  …
```

Capture `<table>` after `ON` and refuse when reserved. Support quoted/bare identifiers and optional schema.

Out of scope for this cycle: analyzing BEGIN…END bodies that mention meta while ON is a user table.

Error message unchanged. Single call site remains `executeUserDBSQL`.

## Verification Strategy

1. RED: CREATE TRIGGER ON meta currently allowed.
2. GREEN: INSERT/UPDATE/DELETE + TEMP + quoted forms refuse; user-table trigger CREATE still works.
3. Full meta suite + full CJS + both tsc.
