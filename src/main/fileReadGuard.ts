import * as fs from 'fs';
import * as path from 'path';

export interface TextFileReadGuard {
  rememberSelectedFile(filePath: string): void;
  canReadTextFile(filePath: string): boolean;
}

function resolveExistingFile(filePath: string): string | null {
  if (!filePath || typeof filePath !== 'string') return null;
  try {
    const resolved = path.resolve(filePath);
    const stat = fs.statSync(resolved);
    return stat.isFile() ? resolved : null;
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
  const resolvedDataDir = path.resolve(dataDir);

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
