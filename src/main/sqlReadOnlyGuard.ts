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

const ATTACH_DETACH_ERROR = 'ATTACH/DETACH is not permitted in the UserDB SQL console';

/** Optional WITH … CTE prefix before a mutating statement (console single-statement path). */
const WITH_PREFIX = `(?:WITH\\s+(?:RECURSIVE\\s+)?[\\s\\S]+?\\)\\s+)?`;

/**
 * Console-wide SQL policy for the UserDB management path (not chat read-only).
 * Refuses ATTACH/DETACH so the console cannot open arbitrary database files.
 * Call before prepare/run on `executeUserDBSQL`.
 */
export function assertUserDBSqlConsolePolicy(sql: string): void {
  if (typeof sql !== 'string' || !sql.trim()) return;

  const stripped = stripSqlComments(sql).replace(/;\s*$/, '').trim();
  if (!stripped) return;

  if (/^\s*ATTACH\b/i.test(stripped) || /^\s*DETACH\b/i.test(stripped)) {
    throw new Error(ATTACH_DETACH_ERROR);
  }
}

/** After a captured table IDENT, require a non-identifier boundary (not \b). */
const AFTER_IDENT = '(?=\\s|$|[^A-Za-z0-9_$])';

/**
 * Refuse a single statement (or fragment) that would mutate reserved `__col_comments`.
 * Used for top-level console SQL and for each statement inside CREATE TRIGGER bodies.
 */
function assertStatementDoesNotMutateMeta(statement: string): void {
  const stripped = statement.replace(/;\s*$/, '').trim();
  if (!stripped) return;

  const afterIdent = AFTER_IDENT;

  const dropRe = new RegExp(
    `^\\s*DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?(${IDENT})\\s*$`,
    'i',
  );
  const dropMatch = stripped.match(dropRe);
  if (dropMatch && isReservedMetaTableName(dropMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  const alterRe = new RegExp(
    `^\\s*ALTER\\s+TABLE\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const alterMatch = stripped.match(alterRe);
  if (alterMatch && isReservedMetaTableName(alterMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  const createIndexRe = new RegExp(
    `^\\s*CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?${IDENT}\\s+ON\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const createIndexMatch = stripped.match(createIndexRe);
  if (createIndexMatch && isReservedMetaTableName(createIndexMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  const insertRe = new RegExp(
    `^\\s*${WITH_PREFIX}(?:INSERT\\s+(?:OR\\s+\\w+\\s+)?INTO|REPLACE\\s+INTO)\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const insertMatch = stripped.match(insertRe);
  if (insertMatch && isReservedMetaTableName(insertMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  const updateRe = new RegExp(
    `^\\s*${WITH_PREFIX}UPDATE\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const updateMatch = stripped.match(updateRe);
  if (updateMatch && isReservedMetaTableName(updateMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  const deleteRe = new RegExp(
    `^\\s*${WITH_PREFIX}DELETE\\s+FROM\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const deleteMatch = stripped.match(deleteRe);
  if (deleteMatch && isReservedMetaTableName(deleteMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  const createTableRe = new RegExp(
    `^\\s*${WITH_PREFIX}CREATE\\s+(?:TEMP(?:ORARY)?\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const createTableMatch = stripped.match(createTableRe);
  if (createTableMatch && isReservedMetaTableName(createTableMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  const createViewRe = new RegExp(
    `^\\s*${WITH_PREFIX}CREATE\\s+(?:TEMP(?:ORARY)?\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const createViewMatch = stripped.match(createViewRe);
  if (createViewMatch && isReservedMetaTableName(createViewMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  const createVirtualRe = new RegExp(
    `^\\s*${WITH_PREFIX}CREATE\\s+VIRTUAL\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const createVirtualMatch = stripped.match(createVirtualRe);
  if (createVirtualMatch && isReservedMetaTableName(createVirtualMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  const ofColumnList = `(?:\\s+OF\\s+${IDENT}(?:\\s*,\\s*${IDENT})*)?`;
  const createTriggerRe = new RegExp(
    `^\\s*CREATE\\s+(?:TEMP(?:ORARY)?\\s+)?TRIGGER\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s*\\.\\s*)?${IDENT}\\s+(?:BEFORE|AFTER|INSTEAD\\s+OF)\\s+(?:(?:INSERT|UPDATE)${ofColumnList}|DELETE)\\s+ON\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const createTriggerMatch = stripped.match(createTriggerRe);
  if (createTriggerMatch && isReservedMetaTableName(createTriggerMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }

  const renameToRe = new RegExp(
    `^\\s*ALTER\\s+TABLE\\s+(?:${IDENT}\\s*\\.\\s*)?${IDENT}\\s+RENAME\\s+TO\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})${afterIdent}`,
    'i',
  );
  const renameToMatch = stripped.match(renameToRe);
  if (renameToMatch && isReservedMetaTableName(renameToMatch[1]!)) {
    throw new Error(RESERVED_META_ERROR);
  }
}

/**
 * Extract CREATE TRIGGER BEGIN…END body statements (best-effort for console SQL).
 * Returns null when the statement is not a CREATE TRIGGER with a body.
 */
function extractTriggerBodyStatements(strippedSql: string): string[] | null {
  if (!/^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(strippedSql)) {
    return null;
  }
  const beginIdx = strippedSql.search(/\bBEGIN\b/i);
  if (beginIdx < 0) return null;
  const afterBegin = strippedSql.slice(beginIdx + 5);
  const endMatch = afterBegin.match(/\bEND\s*$/i);
  if (!endMatch || endMatch.index === undefined) return null;
  const body = afterBegin.slice(0, endMatch.index).trim();
  if (!body) return [];
  // Trigger bodies are small product SQL; split on semicolons outside quotes.
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      const piece = current.trim();
      if (piece) parts.push(piece);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) parts.push(tail);
  return parts;
}

/**
 * Refuse SQL that would drop, alter schema of, index, or DML-mutate the reserved
 * column-comment meta table. Call before prepare/run on the UserDB SQL console path.
 * Also refuses CREATE TRIGGER bodies whose statements would mutate meta.
 */
export function assertUserDBSqlDoesNotMutateMeta(sql: string): void {
  if (typeof sql !== 'string' || !sql.trim()) return;

  const stripped = stripSqlComments(sql).replace(/;\s*$/, '').trim();
  if (!stripped) return;

  // Top-level statement checks (DROP/ALTER/DML/CREATE/RENAME TO/TRIGGER ON meta).
  assertStatementDoesNotMutateMeta(stripped);

  // CREATE TRIGGER on a user table can still mutate meta inside BEGIN…END.
  const bodyStatements = extractTriggerBodyStatements(stripped);
  if (bodyStatements) {
    for (const bodySql of bodyStatements) {
      assertStatementDoesNotMutateMeta(bodySql);
    }
  }
}
