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
