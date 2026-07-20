# UserDB createTable Single-Statement Design

## Mainline

This design starts from authoritative `origin/master@a0e06a1` and addresses Issue #28.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`createTable(id, ddl)` currently does:

```ts
db.exec(ddl);
```

`Database.exec` runs every statement in the string. The management import path builds DDL from user-editable table/column names and passes it through this API. A real product-function probe showed:

```text
CREATE TABLE keepme(...);  -- data inserted
CREATE TABLE other(a TEXT); DROP TABLE keepme;
```

After the second call, `keepme` and its rows were gone. The managed "create table" action therefore permits multi-statement side effects, including destructive ones.

## Invariant

`createTable` creates at most one user table per call. Any payload that is not exactly one `CREATE TABLE` statement must fail closed without mutating other objects.

## Chosen Design

### Validation

Before execution:

1. Reject null/empty/whitespace-only DDL.
2. Strip leading SQL comments (`-- ...` and `/* ... */`) and whitespace for classification.
3. Require the first real statement to match `CREATE TABLE` or `CREATE TABLE IF NOT EXISTS`.
4. Parse statement boundaries with quote/comment awareness so semicolons inside string literals or comments do not false-split.
5. After the first complete statement, allow only trailing whitespace/comments. Any additional statement is rejected.

### Execution

After validation, execute only the single extracted `CREATE TABLE` statement with a single-statement API (`prepare(...).run()` / equivalent), never multi-statement `exec`.

### Errors

Use clear errors such as:

- `Empty CREATE TABLE statement`
- `Only a single CREATE TABLE statement is allowed`
- `createTable accepts only CREATE TABLE DDL`

### API surface

No signature change:

```ts
createTable(id: string, ddl: string): void
```

Import UI and IPC keep calling the same entry point.

## Alternatives Rejected

### Leave validation to the renderer

The main process is the trust boundary for schema mutations. Renderer-only checks can be bypassed by any IPC caller.

### Reuse free-form SQL console rules

Console intentionally allows multi-statement workflows for power users. `createTable` is a narrow managed action and should stay narrow.

### Full SQL grammar dependency

Unnecessary. Quote/comment-aware statement splitting plus a `CREATE TABLE` prefix check is enough.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Semicolon inside default string / check expression | Quote and comment aware scanner |
| Leading comments before CREATE TABLE | Strip leading comments before classification |
| `CREATE TEMP TABLE` / `CREATE VIRTUAL TABLE` | Reject unless explicitly `CREATE TABLE`; keep managed path simple |
| Existing import DDL with trailing newline | Allowed as trailing whitespace |

## Verification Strategy

1. Product-function tests prove multi-statement payloads neither drop existing tables nor create extra objects.
2. Cover valid CREATE TABLE, IF NOT EXISTS, trailing comments, empty DDL, non-create DDL, and semicolon-in-literal cases.
3. Reverse verification fails on `origin/master@a0e06a1` and passes after the fix.
4. Full CJS suite, both TypeScript compilers, whitespace check.

## Scope Boundary

This cycle only hardens `createTable`. Free-form `executeUserDBSQL`, import overwrite policy, and sandbox isolation remain separate.
