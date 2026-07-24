# UserDB SQL Console Meta DML Protection Design

## Mainline

This design starts from authoritative `origin/master@f315e40` (after merge of #92) and addresses Issue #93.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Prior work established two incomplete layers of protection for the reserved column-comment store `__col_comments`:

1. **Managed APIs** refuse drop/rename (#77/#79), row/schema ops (#84/#86), and export/addColumn against meta.
2. **SQL console** (`executeUserDBSQL`) refuses only `DROP TABLE` and `ALTER TABLE … RENAME TO` targeting meta (#80/#82).

Direct probes of the shipped guard + `executeUserDBSQL` on current master show mutating DML is still accepted:

| Statement | Guard / execute result |
|-----------|------------------------|
| `DROP TABLE __col_comments` | blocked |
| `ALTER TABLE __col_comments RENAME TO foo` | blocked |
| `DELETE FROM __col_comments` | **allowed** (wipes seeded rows) |
| `UPDATE __col_comments SET comment = '…'` | **allowed** |
| `INSERT INTO __col_comments (…)` | **allowed** |
| `REPLACE INTO __col_comments (…)` | **allowed** |
| `WITH … DELETE FROM __col_comments` | **allowed** |
| `SELECT * FROM __col_comments` | allowed (read; keep) |

The SQL console therefore remains a bypass for forging or erasing managed comment metadata, contradicting the product invariant that `__col_comments` is infrastructure maintained only by internal comment helpers.

The earlier SQL meta design explicitly listed INSERT/UPDATE as out of scope; managed-row-ops design also deferred “SQL console INSERT/UPDATE/DELETE on meta”. This cycle closes that residual integrity hole.

## Invariant

`executeUserDBSQL` must never run `INSERT` / `UPDATE` / `DELETE` / `REPLACE` (including `WITH …` prefixes) that target the reserved meta table `__col_comments`. Existing DROP / RENAME-from refusals remain. Read-only `SELECT` against meta may continue. Ordinary user-table SQL is unchanged.

## Chosen Design

### Extend the existing pre-prepare guard

Keep a single call site: `assertUserDBSqlDoesNotMutateMeta(sql)` at the start of `executeUserDBSQL` (already present).

Expand the helper in `src/main/sqlReadOnlyGuard.ts` to refuse statements whose **target table** is `__col_comments` for:

1. `INSERT [OR …] INTO …`
2. `REPLACE INTO …`
3. `UPDATE …`
4. `DELETE FROM …`

Matching rules (aligned with DROP/RENAME):

- Strip SQL comments and neutralize string literals before matching (reuse existing helpers).
- Case-insensitive keywords and reserved name.
- Bare / double-quoted / backtick / bracket identifiers; optional `schema.` prefix.
- Accept a leading `WITH …` CTE prefix before the mutating verb (same class of bypass as `WITH … INSERT` already handled for statement classification elsewhere).
- Prefer fail-closed only when the **target relation** of the DML is meta, not when the name appears only inside a string, comment, or unrelated subquery text if cheap to avoid (exact target-table capture is enough for console single statements).

Error message: reuse or generalize the existing reserved-table message, e.g. `Cannot mutate reserved table __col_comments` (or keep `Cannot drop or rename…` generalized to `Cannot drop, rename, or mutate reserved table __col_comments`) so tests can match `/reserved|__col_comments/i`.

### Scope boundaries

| In scope | Out of scope |
|----------|--------------|
| INSERT/UPDATE/DELETE/REPLACE targeting meta | Full SQL sandbox / authorizer |
| WITH-prefixed DML targeting meta | Blocking SELECT on meta |
| Quoted / schema-qualified target names | Multi-statement scripts beyond current console |
| Single-statement `executeUserDBSQL` path | Managed API changes (already covered) |

## Alternatives Rejected

### SQLite authorizer callback

More complete (covers obscure forms) but heavier; extend the existing regex guard first for consistency with #80/#82. Authorizer can be a follow-up if bypasses appear.

### Block all DML in the SQL console

Breaks legitimate console editing of user tables.

### Rely only on managed APIs

SQL console intentionally bypasses managed APIs; integrity hole remains.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| False positive on user table named similarly | Exact reserved name only |
| `WITH` / quoted forms slip through | Cover in red tests |
| Message churn breaks old DROP tests | Keep `/reserved|__col_comments/i` compatible wording |
| Comment/string smuggling | Strip comments + neutralize literals first |

## Verification Strategy

Product CJS tests driving shipped `executeUserDBSQL` (extend `tests/userdb-sql-meta-protect.test.cjs` or sibling file):

1. Seed comments so meta exists with rows.
2. `DELETE` / `UPDATE` / `INSERT` / `REPLACE` / quoted / `WITH … DELETE` against meta throw; meta row count and content unchanged.
3. Existing DROP / RENAME refusals still pass.
4. User-table `INSERT`/`UPDATE`/`DELETE` and `SELECT * FROM __col_comments` (read) still succeed as designed.
5. Full suite + both `tsc` projects clean.
