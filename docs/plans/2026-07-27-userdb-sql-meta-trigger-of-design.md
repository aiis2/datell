# UserDB SQL Console Meta CREATE TRIGGER OF Column-List Protection Design

## Mainline

This design starts from authoritative `origin/master@462e912` (after #111/#113) and addresses Issue #114.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

CREATE TRIGGER ON reserved `__col_comments` is refused for:

```
CREATE [TEMP] TRIGGER name {BEFORE|AFTER|INSTEAD OF} {INSERT|UPDATE|DELETE} ON meta …
```

SQLite also allows an optional column list after INSERT/UPDATE:

```
CREATE TRIGGER t AFTER INSERT OF col ON __col_comments BEGIN … END
CREATE TRIGGER t AFTER UPDATE OF a, b ON __col_comments BEGIN … END
```

The post-#113 matcher requires `ON` immediately after the event keyword, so `OF …` bypasses the guard.

## Invariant

`executeUserDBSQL` must refuse CREATE TRIGGER whose ON target is reserved `__col_comments`, whether or not an `OF <column-list>` appears after INSERT/UPDATE. User-table triggers with OF remain allowed.

## Chosen Design

Extend the existing CREATE TRIGGER matcher:

- After `(INSERT|UPDATE)` allow optional `OF` plus one or more comma-separated identifiers (quoted/bare).
- `DELETE` has no OF form; keep as today.
- Capture the table after `ON` and refuse when reserved.

## Verification Strategy

1. RED: `INSERT OF col ON __col_comments` and `UPDATE OF a, b ON __col_comments` currently allowed.
2. GREEN: both refuse; user-table `UPDATE OF name ON users` still works.
3. Full meta suite + full CJS + both tsc.
