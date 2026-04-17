import path from 'path';
import fs from 'fs';
import { app } from 'electron';

const isDev = !app.isPackaged;

/**
 * Get the data directory.
 * Default: current executable sibling "datellData" in production,
 * and current working directory "datellData" in dev.
 * Can be overridden by data-settings.json next to the exe.
 */
export function getDataDir(): string {
  // For portable apps, process.env.PORTABLE_EXECUTABLE_DIR is the directory where the exe is actually located
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
  
  const settingsPath = isDev
    ? path.join(process.cwd(), 'data-settings.json')
    : path.join(exeDir, 'data-settings.json');

  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.dataDir && typeof settings.dataDir === 'string') {
        return settings.dataDir;
      }
    }
  } catch { /* use default */ }

  return isDev
    ? path.join(process.cwd(), 'datellData')
    : path.join(exeDir, 'datellData');
}

export function ensureDataDirs(dataDir: string): void {
  for (const sub of ['', 'reports', 'templates', 'uploads', 'exports', 'memory', 'skills']) {
    fs.mkdirSync(path.join(dataDir, sub), { recursive: true });
  }
}

export function setDataDir(newDir: string): void {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
  const settingsPath = isDev
    ? path.join(process.cwd(), 'data-settings.json')
    : path.join(exeDir, 'data-settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({ dataDir: newDir }, null, 2), 'utf-8');
}
