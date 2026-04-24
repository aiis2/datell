import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const ignoredDirs = new Set(['node_modules', 'dist', '.git']);

async function collectJsonFiles(dirPath, bucket = []) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        await collectJsonFiles(entryPath, bucket);
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      bucket.push(entryPath);
    }
  }
  return bucket;
}

const jsonFiles = await collectJsonFiles(repoRoot);
for (const filePath of jsonFiles) {
  const source = await readFile(filePath, 'utf8');
  JSON.parse(source);
}

console.log(`validated ${jsonFiles.length} JSON files`);