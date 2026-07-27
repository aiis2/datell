# UserDB SQL Console ATTACH/DETACH Refusal Design

## Mainline

This design starts from authoritative `origin/master@00f51f7` and addresses Issue #117.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Chat-mode UserDB SQL rejects `ATTACH` through `isReadOnlyUserDBSql`. The management console path `executeUserDBSQL` (read/write) currently prepares and runs:

```sql
ATTACH DATABASE '<path>' AS alias;
ATTACH '<path>' AS alias;
DETACH DATABASE alias;
DETACH alias;
```

better-sqlite3 opens the path on ATTACH. Even though each console call uses a short-lived connection (so a later SELECT cannot see the attachment), ATTACH still:

1. Opens arbitrary readable SQLite files from the main process.
2. Becomes an immediate exfiltration primitive if connection reuse or multi-statement support appears later.
3. Is reachable from model-written SQL against user DBs.

## Invariant

The UserDB SQL console must never execute ATTACH or DETACH. Ordinary main-DB SELECT/DML/DDL remain allowed. Meta protections remain unchanged.

## Chosen Design

### Dedicated console policy helper

Add `assertUserDBSqlConsolePolicy(sql)` in `src/main/sqlReadOnlyGuard.ts` that:

1. Strips comments (reuse existing strip helpers).
2. Refuses statements matching:
   - `ATTACH [DATABASE] …`
   - `DETACH [DATABASE] …`
3. Throws a clear error: `ATTACH/DETACH is not permitted in the UserDB SQL console`.

Call it from `executeUserDBSQL` **before** `assertUserDBSqlDoesNotMutateMeta` (or immediately after), so every console statement is covered regardless of meta status.

Keep meta-specific matching in `assertUserDBSqlDoesNotMutateMeta` so concerns stay separated.

### Alternatives Rejected

| Option | Why not |
|--------|---------|
| Rely on short-lived connections | Still opens files; fragile against future reuse |
| SQLite authorizer only | Heavier; policy helper is consistent with existing guards |
| Block only absolute paths | Relative/URI forms remain; complete ban is simpler |

## Verification Strategy

1. RED: `executeUserDBSQL(id, "ATTACH DATABASE 'x.db' AS evil")` currently succeeds.
2. GREEN: ATTACH/DETACH forms throw; `SELECT 1` still works.
3. Full CJS suite + both TypeScript compilers.
