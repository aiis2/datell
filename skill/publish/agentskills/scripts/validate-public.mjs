import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const readmeFile = path.join(repoRoot, 'README.md');
const licenseFile = path.join(repoRoot, 'LICENSE');
const rootPackageFile = path.join(repoRoot, 'package.json');
const lockFile = path.join(repoRoot, 'package-lock.json');
const mcpPackageFile = path.join(repoRoot, 'mcp', 'package.json');
const skillFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'SKILL.md');
const exampleDataFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'real-sales-december-2024.json');
const exampleHtmlFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'real-sales-december-2024-basic-report.html');

async function collectTextFiles(dirPath, bucket = []) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectTextFiles(fullPath, bucket);
      continue;
    }
    if (/\.(md|json|mjs|ts|js|yml|yaml|html)$/i.test(entry.name)) {
      bucket.push(fullPath);
    }
  }
  return bucket;
}

function formatCny(value) {
  return `CNY ${Number(value || 0).toLocaleString('en-US')}`;
}

const readme = await readFile(readmeFile, 'utf8');
assert.match(readme, /npx skills add aiis2\/frontend-design-report --skill datell-visual-report-preview/i, 'README should show the real install command for the public repository');

const licenseText = await readFile(licenseFile, 'utf8');
assert.match(licenseText, /^MIT License/m, 'LICENSE should be MIT');

const rootPackage = JSON.parse(await readFile(rootPackageFile, 'utf8'));
const rootLock = JSON.parse(await readFile(lockFile, 'utf8'));
const mcpPackage = JSON.parse(await readFile(mcpPackageFile, 'utf8'));
const skillMarkdown = await readFile(skillFile, 'utf8');
assert.equal(rootPackage.license, 'MIT', 'root package.json license should be MIT');
assert.equal(rootLock.packages[''].license, 'MIT', 'root package-lock.json license should be MIT');
assert.equal(rootLock.packages.mcp.license, 'MIT', 'mcp package-lock.json license should be MIT');
assert.equal(mcpPackage.license, 'MIT', 'mcp package.json license should be MIT');
assert.match(skillMarkdown, /^license: MIT$/m, 'SKILL.md frontmatter should declare MIT');

const exampleData = JSON.parse(await readFile(exampleDataFile, 'utf8'));
const rows = exampleData.rows || [];
assert.equal(Array.isArray(rows), true, 'real-data example should expose a rows array');
assert.equal(rows.length, 20, 'real-data example should preserve all 20 exported sales rows');

const totalSales = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
const byOperator = Object.entries(rows.reduce((acc, row) => {
  acc[row.operator] = (acc[row.operator] || 0) + Number(row.amount || 0);
  return acc;
}, {})).sort((left, right) => right[1] - left[1]);
const byBrand = Object.entries(rows.reduce((acc, row) => {
  acc[row.brand] = (acc[row.brand] || 0) + Number(row.amount || 0);
  return acc;
}, {})).sort((left, right) => right[1] - left[1]);

const exampleHtml = await readFile(exampleHtmlFile, 'utf8');
assert.match(exampleHtml, /report-container|report-header|grid-kpi|grid-charts/i, 'example HTML should use the shared Datell shell classes');
assert.match(exampleHtml, /chart-card|text-summary-card|scorecard-table/i, 'example HTML should use concrete Datell card variants');
assert.match(exampleHtml, new RegExp(formatCny(totalSales).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'example HTML should show the total sales computed from the input data');
assert.match(exampleHtml, new RegExp(byOperator[0][0]), 'example HTML should show the top operator computed from the input data');
assert.match(exampleHtml, new RegExp(byBrand[0][0]), 'example HTML should show the top brand computed from the input data');
assert.doesNotMatch(exampleHtml, /__REPORT_EVENT_BUS__|filterChange|zone-filter|filter-btn-group|filter-select|filter-checkbox-group/i, 'example HTML should stay static and non-interactive');

for (const filePath of await collectTextFiles(repoRoot)) {
  const source = await readFile(filePath, 'utf8');
  assert.doesNotMatch(source, /[\u4e00-\u9fff]/, `public repository files should stay English-only: ${path.relative(repoRoot, filePath)}`);
}

await stat(exampleDataFile);
await stat(exampleHtmlFile);

console.log('public validation ok');