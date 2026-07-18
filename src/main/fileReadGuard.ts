import * as fs from 'fs';
import * as path from 'path';

export interface TextFileReadGuard {
  rememberSelectedFile(filePath: string): void;
  canReadTextFile(filePath: string): boolean;
}

function resolveExistingFile(filePath: string): string | null {
  if (!filePath || typeof filePath !== 'string') return null;
  try {
    const canonical = fs.realpathSync.native(path.resolve(filePath));
    const stat = fs.statSync(canonical);
    return stat.isFile() ? canonical : null;
  } catch {
    return null;
  }
}

function isWithinDir(filePath: string, dirPath: string): boolean {
  const relative = path.relative(dirPath, filePath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function createTextFileReadGuard(dataDir: string): TextFileReadGuard {
  const allowedFiles = new Set<string>();
  const resolvedDataDir = fs.realpathSync.native(path.resolve(dataDir));

  return {
    rememberSelectedFile(filePath: string): void {
      const resolved = resolveExistingFile(filePath);
      if (resolved) {
        allowedFiles.add(resolved);
      }
    },

    canReadTextFile(filePath: string): boolean {
      const resolved = resolveExistingFile(filePath);
      if (!resolved) return false;
      return allowedFiles.has(resolved) || isWithinDir(resolved, resolvedDataDir);
    },
  };
}
