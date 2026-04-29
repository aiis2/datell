import fs from 'fs';
import path from 'path';

export function getDistRootCandidates(appPath: string, currentDir: string): string[] {
  return [
    path.join(appPath, 'dist'),
    path.join(currentDir, '../dist'),
    path.join(currentDir, '../../dist'),
  ];
}

export function findRendererDistRoot(appPath: string, currentDir: string): string {
  const candidates = getDistRootCandidates(appPath, currentDir);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(path.join(candidate, 'index.html'))) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return candidates[0];
}