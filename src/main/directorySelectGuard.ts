import * as fs from 'fs';
import * as path from 'path';

export interface DirectorySelectGuard {
  rememberSelectedDirectory(dirPath: string): void;
  canUseDirectory(dirPath: string): boolean;
}

export const UNAUTHORIZED_DIRECTORY = '目录未通过选择器授权，无法使用';

function resolveExistingDirectory(dirPath: string): string | null {
  if (!dirPath || typeof dirPath !== 'string') return null;
  try {
    const canonical = fs.realpathSync.native(path.resolve(dirPath));
    const stat = fs.statSync(canonical);
    return stat.isDirectory() ? canonical : null;
  } catch {
    return null;
  }
}

export function createDirectorySelectGuard(): DirectorySelectGuard {
  const allowedDirs = new Set<string>();

  return {
    rememberSelectedDirectory(dirPath: string): void {
      const resolved = resolveExistingDirectory(dirPath);
      if (resolved) {
        allowedDirs.add(resolved);
      }
    },

    canUseDirectory(dirPath: string): boolean {
      const resolved = resolveExistingDirectory(dirPath);
      if (!resolved) return false;
      return allowedDirs.has(resolved);
    },
  };
}

/**
 * Fail-closed directory authorization for IPC set/migrate data-dir paths.
 */
export function assertAuthorizedDirectory(
  guard: DirectorySelectGuard,
  dirPath: unknown,
): string {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error(UNAUTHORIZED_DIRECTORY);
  }
  const resolved = path.resolve(dirPath);
  if (!guard.canUseDirectory(resolved)) {
    throw new Error(UNAUTHORIZED_DIRECTORY);
  }
  return resolveExistingDirectory(resolved) ?? resolved;
}
