# UserDB SQL Console Trigger-Body Meta Mutation Protection Design

## Mainline

This design starts from authoritative `origin/master@0eed229` and addresses Issue #120.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

CREATE TRIGGER is refused when `ON` targets reserved `__col_comments` (#111–#116). Triggers on **user** tables may still contain bodies that mutate meta:

```sql
CREATE TRIGGER t AFTER INSERT ON users
BEGIN
  DELETE FROM __col_comments;
END;
```

Shipped probe: after `INSERT INTO users`, meta comment rows are deleted (`count(*) = 0`).

## Invariant

`executeUserDBSQL` must refuse CREATE TRIGGER when any statement in the BEGIN…END body would mutate reserved `__col_comments` under the same mutation classes already blocked as top-level console SQL (DROP/ALTER/DML/INDEX create targeting meta). SELECT-only bodies that read meta remain allowed. User-table triggers without meta mutation remain allowed.

## Chosen Design

### Scan trigger bodies with existing meta matchers

In `sqlReadOnlyGuard.ts`:

1. Detect `CREATE … TRIGGER … BEGIN … END` (case-insensitive, optional TEMP, IF NOT EXISTS, OF column-list, WHEN clause).
2. Extract the body between the outermost `BEGIN` and final `END`.
3. Split body on top-level `;` (string/comment-aware if cheap; otherwise simple split is acceptable for product SQL console statements).
4. For each non-empty body fragment, run the same reserved-meta mutation checks used for top-level statements (DROP/ALTER/INSERT/UPDATE/DELETE/REPLACE/CREATE INDEX against meta). Reuse helpers rather than duplicating regexes where practical.
5. Keep the existing ON-target matcher for triggers attached directly to meta.

### Alternatives Rejected

| Option | Why not |
|--------|---------|
| SQLite authorizer only | Heavier; body scan reuses established regex policy |
| Block all CREATE TRIGGER | Breaks legitimate user automation in SQL console |
| Only block DELETE bodies | UPDATE/INSERT/DROP bodies are equally destructive |

## Verification Strategy

1. RED: CREATE TRIGGER with `DELETE FROM __col_comments` body currently succeeds and wipes comments on INSERT.
2. GREEN: that CREATE throws reserved/not-permitted; comments intact; control trigger without meta body works and fires.
3. Full CJS suite + both tsc.
