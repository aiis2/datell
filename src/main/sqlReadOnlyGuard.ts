const EXTERNAL_READ_ONLY_PREFIXES = new Set(['SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN']);
const USERDB_READ_ONLY_PREFIXES = new Set(['SELECT', 'EXPLAIN']);

const MUTATING_SQL_PATTERN =
  /\b(ALTER|ATTACH|CALL|COMMENT|COMMIT|COPY|CREATE|DELETE|DETACH|DROP|EXEC|EXECUTE|GRANT|INSERT|MERGE|REINDEX|REPLACE|REVOKE|ROLLBACK|TRUNCATE|UPDATE|UPSERT|VACUUM)\b/i;

const SAFE_USERDB_PRAGMA_PATTERN = /^\s*PRAGMA\s+(?:table_info|table_xinfo|table_list|index_list|index_info|index_xinfo|foreign_key_list)\s*\(/i;

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/#[^\r\n]*/g, ' ');
}

function withoutStringLiterals(sql: string): string {
  return sql
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:\"\"|[^"])*"/g, '""')
    .replace(/`(?:``|[^`])*`/g, '``');
}

function containsMultipleStatements(sql: string): boolean {
  const normalised = withoutStringLiterals(sql).trim();
  return /;\s*\S/.test(normalised.replace(/;\s*$/, ''));
}

function firstKeyword(sql: string): string {
  return sql.trimStart().match(/^[a-z_]+/i)?.[0].toUpperCase() ?? '';
}

function isSafeReadOnlySql(sql: string, allowedPrefixes: Set<string>, allowSafePragma: boolean): boolean {
  if (typeof sql !== 'string' || !sql.trim()) return false;

  const stripped = stripSqlComments(sql);
  if (!stripped.trim()) return false;
  if (containsMultipleStatements(stripped)) return false;

  const comparable = withoutStringLiterals(stripped);
  if (MUTATING_SQL_PATTERN.test(comparable)) return false;

  const keyword = firstKeyword(comparable);
  if (keyword === 'WITH') {
    return /\bSELECT\b/i.test(comparable);
  }

  if (allowSafePragma && SAFE_USERDB_PRAGMA_PATTERN.test(comparable)) {
    return true;
  }

  return allowedPrefixes.has(keyword);
}

export function isReadOnlyDatasourceSql(sql: string): boolean {
  return isSafeReadOnlySql(sql, EXTERNAL_READ_ONLY_PREFIXES, false);
}

export function isReadOnlyUserDBSql(sql: string): boolean {
  return isSafeReadOnlySql(sql, USERDB_READ_ONLY_PREFIXES, true);
}

const RESERVED_META_TABLE = '__col_comments';

/** Unquoted / quoted SQL identifier → bare name (no schema). */
function unquoteSqlIdentifier(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === '`' && b === '`')) {
      const q = a;
      return t.slice(1, -1).split(q + q).join(q);
    }
    if (a === '[' && b === ']') {
      return t.slice(1, -1);
    }
  }
  return t;
}

function isReservedMetaTableName(ident: string): boolean {
  return unquoteSqlIdentifier(ident).toLowerCase() === RESERVED_META_TABLE;
}

const IDENT =
  '(?:"[^"]*(?:""[^"]*)*"|`[^`]*(?:``[^`]*)*`|\\[[^\\]]*\\]|[A-Za-z_][\\w$]*)';

const RESERVED_META_ERROR = `Cannot drop, rename, or mutate reserved table ${RESERVED_META_TABLE}`;

/** Optional WITH … CTE prefix before a mutating statement (console single-statement path). */
const WITH_PREFIX = `(?:WITH\\s+(?:RECURSIVE\\s+)?[\\s\\S]+?\\)\\s+)?`;

/**
 * Refuse SQL that would drop, alter schema of, index, or DML-mutate the reserved
 * column-comment meta table. Call before prepare/run on the UserDB SQL console path.
 */
export function assertUserDBSqlDoesNotMutateMeta(sql: string): void {
  if (typeof sql !== 'string' || !sql.trim()) return;

  const stripped = stripSqlComments(sql).replace(/;\s*$/, '').trim();
  if (!stripped) return;

  // After a captured table IDENT, require a non-identifier boundary.
  // Do not use \b: quoted identifiers end with " / ` / ], which are non-word chars
  // so \b fails at end-of-string (e.g. DELETE FROM "__col_comments").
  const afterIdent = '(?=\\s|$|[^A-Za-z0-9_$])';

  const dropRe = new RegExp(
    `^\\s*DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?(${IDENT})\\s*$`,
    'i',
  );
  const dropMatch = stripped.match(dropRe);
  if (dropMatch && isReservedMetaTableName(dropMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  // Any ALTER TABLE targeting meta (RENAME TO/COLUMN, ADD/DROP COLUMN, etc.).
  const alterRe = new RegExp(
    `^\\s*ALTER\\s+TABLE\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const alterMatch = stripped.match(alterRe);
  if (alterMatch && isReservedMetaTableName(alterMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  // CREATE [UNIQUE] INDEX … ON meta
  const createIndexRe = new RegExp(
    `^\\s*CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?${IDENT}\\s+ON\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const createIndexMatch = stripped.match(createIndexRe);
  if (createIndexMatch && isReservedMetaTableName(createIndexMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  // INSERT [OR …] INTO / REPLACE INTO meta
  const insertRe = new RegExp(
    `^\\s*${WITH_PREFIX}(?:INSERT\\s+(?:OR\\s+\\w+\\s+)?INTO|REPLACE\\s+INTO)\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const insertMatch = stripped.match(insertRe);
  if (insertMatch && isReservedMetaTableName(insertMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  // UPDATE meta …
  const updateRe = new RegExp(
    `^\\s*${WITH_PREFIX}UPDATE\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const updateMatch = stripped.match(updateRe);
  if (updateMatch && isReservedMetaTableName(updateMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  // DELETE FROM meta …
  const deleteRe = new RegExp(
    `^\\s*${WITH_PREFIX}DELETE\\s+FROM\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const deleteMatch = stripped.match(deleteRe);
  if (deleteMatch && isReservedMetaTableName(deleteMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  // CREATE [TEMP|TEMPORARY] TABLE [IF NOT EXISTS] [schema.]ident …
  // Also covers WITH … CREATE TABLE … AS SELECT forms via WITH_PREFIX.
  const createTableRe = new RegExp(
    `^\\s*${WITH_PREFIX}CREATE\\s+(?:TEMP(?:ORARY)?\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const createTableMatch = stripped.match(createTableRe);
  if (createTableMatch && isReservedMetaTableName(createTableMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  // CREATE [TEMP|TEMPORARY] VIEW [IF NOT EXISTS] [schema.]ident …
  // Also covers WITH … CREATE VIEW … forms via WITH_PREFIX.
  const createViewRe = new RegExp(
    `^\\s*${WITH_PREFIX}CREATE\\s+(?:TEMP(?:ORARY)?\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const createViewMatch = stripped.match(createViewRe);
  if (createViewMatch && isReservedMetaTableName(createViewMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  // CREATE VIRTUAL TABLE [IF NOT EXISTS] [schema.]ident … — distinct from CREATE TABLE.
  const createVirtualRe = new RegExp(
    `^\\s*${WITH_PREFIX}CREATE\\s+VIRTUAL\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const createVirtualMatch = stripped.match(createVirtualRe);
  if (createVirtualMatch && isReservedMetaTableName(createVirtualMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  // ALTER TABLE … RENAME TO [schema.]ident — refuse renaming *into* the reserved name.
  // Deliberately require RENAME TO (not RENAME COLUMN) so column renames stay unaffected.
  const renameToRe = new RegExp(
    `^\\s*ALTER\\s+TABLE\\s+(?:${IDENT}\\s*\\.\\s*)?${IDENT}\\s+RENAME\\s+TO\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const renameToMatch = stripped.match(renameToRe);
  if (renameToMatch && isReservedMetaTableName(renameToMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }
}
