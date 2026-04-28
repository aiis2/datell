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
const salesExampleDataFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'real-sales-december-2024.json');
const salesExampleHtmlFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'real-sales-december-2024-basic-report.html');
const usExampleDataFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'us-ag-exports-top8-2011.json');
const usExampleHtmlFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'us-ag-exports-top8-2011-basic-report.html');
const usExamplePreviewFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'us-ag-exports-top8-2011-preview.png');

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

function formatUsdMillions(value) {
  return `USD ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}M`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const readme = await readFile(readmeFile, 'utf8');
assert.match(readme, /npx skills add aiis2\/frontend-design-report --skill datell-visual-report-preview/i, 'README should show the real install command for the public repository');
assert.match(readme, /us-ag-exports-top8-2011-preview\.png/i, 'README should show the public foreign example preview image');
assert.match(readme, /us-ag-exports-top8-2011\.json/i, 'README should link the public foreign example data file');
assert.match(readme, /2011_us_ag_exports\.csv/i, 'README should cite the public U.S. agriculture dataset source');

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

const salesExampleData = JSON.parse(await readFile(salesExampleDataFile, 'utf8'));
const salesRows = salesExampleData.rows || [];
assert.equal(Array.isArray(salesRows), true, 'real-data example should expose a rows array');
assert.equal(salesRows.length, 20, 'real-data example should preserve all 20 exported sales rows');

const totalSales = salesRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
const byOperator = Object.entries(salesRows.reduce((acc, row) => {
  acc[row.operator] = (acc[row.operator] || 0) + Number(row.amount || 0);
  return acc;
}, {})).sort((left, right) => right[1] - left[1]);
const byBrand = Object.entries(salesRows.reduce((acc, row) => {
  acc[row.brand] = (acc[row.brand] || 0) + Number(row.amount || 0);
  return acc;
}, {})).sort((left, right) => right[1] - left[1]);

const salesExampleHtml = await readFile(salesExampleHtmlFile, 'utf8');
assert.match(salesExampleHtml, /report-container|report-header|grid-kpi|grid-charts/i, 'sales example HTML should use the shared Datell shell classes');
assert.match(salesExampleHtml, /chart-card|text-summary-card|scorecard-table/i, 'sales example HTML should use concrete Datell card variants');
assert.match(salesExampleHtml, new RegExp(escapeRegExp(formatCny(totalSales))), 'sales example HTML should show the total sales computed from the input data');
assert.match(salesExampleHtml, new RegExp(escapeRegExp(byOperator[0][0])), 'sales example HTML should show the top operator computed from the input data');
assert.match(salesExampleHtml, new RegExp(escapeRegExp(byBrand[0][0])), 'sales example HTML should show the top brand computed from the input data');
assert.doesNotMatch(salesExampleHtml, /__REPORT_EVENT_BUS__|filterChange|zone-filter|filter-btn-group|filter-select|filter-checkbox-group/i, 'sales example HTML should stay static and non-interactive');

const usExampleData = JSON.parse(await readFile(usExampleDataFile, 'utf8'));
const usRows = usExampleData.rows || [];
assert.equal(Array.isArray(usRows), true, 'foreign example should expose a rows array');
assert.equal(usRows.length, 8, 'foreign example should preserve the top 8 public dataset rows');
assert.equal(usExampleData.source.url, 'https://raw.githubusercontent.com/plotly/datasets/master/2011_us_ag_exports.csv', 'foreign example should cite the public dataset source');

const totalExports = usRows.reduce((sum, row) => sum + Number(row.totalExports || 0), 0);
const leadingState = usRows.slice().sort((left, right) => Number(right.totalExports || 0) - Number(left.totalExports || 0))[0];
const usExampleHtml = await readFile(usExampleHtmlFile, 'utf8');
assert.match(usExampleHtml, /report-container|report-header|grid-kpi|grid-charts/i, 'foreign example HTML should use the shared Datell shell classes');
assert.match(usExampleHtml, /chart-card|text-summary-card|scorecard-table/i, 'foreign example HTML should use concrete Datell card variants');
assert.match(usExampleHtml, new RegExp(escapeRegExp(formatUsdMillions(totalExports))), 'foreign example HTML should show the total exports computed from the input data');
assert.match(usExampleHtml, new RegExp(escapeRegExp(leadingState.state)), 'foreign example HTML should show the leading state computed from the input data');
assert.doesNotMatch(usExampleHtml, /__REPORT_EVENT_BUS__|filterChange|zone-filter|filter-btn-group|filter-select|filter-checkbox-group/i, 'foreign example HTML should stay static and non-interactive');

for (const filePath of await collectTextFiles(repoRoot)) {
  const source = await readFile(filePath, 'utf8');
  assert.doesNotMatch(source, /[\u4e00-\u9fff]/, `public repository files should stay English-only: ${path.relative(repoRoot, filePath)}`);
}

await stat(salesExampleDataFile);
await stat(salesExampleHtmlFile);
await stat(usExampleDataFile);
await stat(usExampleHtmlFile);
await stat(usExamplePreviewFile);

console.log('public validation ok');