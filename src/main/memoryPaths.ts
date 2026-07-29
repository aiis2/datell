import path from 'path';

export const MEMORY_TYPES = ['long_term', 'short_term'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

const MEMORY_TYPE_SET = new Set<string>(MEMORY_TYPES);

/**
 * Resolve a memory markdown path under `memoryDir`.
 * Fail closed: only exact allowlisted types; never trust IPC string shapes.
 */
export function resolveMemoryFilePath(memoryDir: string, type: unknown): string {
  if (typeof type !== 'string' || !MEMORY_TYPE_SET.has(type)) {
    throw new Error('Memory type must be long_term or short_term');
  }

  const resolvedDir = path.resolve(memoryDir);
  const resolvedFile = path.resolve(resolvedDir, `${type}.md`);
  const relative = path.relative(resolvedDir, resolvedFile);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Memory type must be long_term or short_term');
  }
  return resolvedFile;
}
