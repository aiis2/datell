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
const noMcpMatrixFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'references', 'datell-no-mcp-capability-matrix.md');
const salesExampleDataFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'real-sales-december-2024.json');
const salesExampleHtmlFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'real-sales-december-2024-basic-report.html');
const usExampleDataFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'us-ag-exports-top8-2011.json');
const usExampleHtmlFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'us-ag-exports-top8-2011-basic-report.html');
const usExamplePreviewFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'us-ag-exports-top8-2011-preview.png');
const europeExampleDataFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'europe-gdp-top8-2014.json');
const europeExampleHtmlFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'europe-gdp-top8-2014-magazine-report.html');
const europeExamplePreviewFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'europe-gdp-top8-2014-preview.png');
const saasExampleDataFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'saas-subscription-health-ibm-telco.json');
const saasExampleHtmlFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'saas-subscription-health-ibm-telco-bento-report.html');
const saasExamplePreviewFile = path.join(repoRoot, 'skills', 'datell-visual-report-preview', 'assets', 'saas-subscription-health-ibm-telco-preview.png');

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

function formatUsdBillions(value) {
  return `USD ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}B`;
}

function formatUsd(value) {
  return `USD ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const readme = await readFile(readmeFile, 'utf8');
assert.match(readme, /npx skills add aiis2\/frontend-design-report --skill datell-visual-report-preview/i, 'README should show the real install command for the public repository');
assert.match(readme, /img\.shields\.io\/badge\/skills\.sh-repository/i, 'README should include a skills.sh repository badge');
assert.match(readme, /img\.shields\.io\/badge\/skills\.sh-datell--visual--report--preview/i, 'README should include a skills.sh skill badge');
assert.match(readme, /img\.shields\.io\/badge\/install-npx%20skills%20add/i, 'README should include a one-click install badge');
assert.match(readme, /us-ag-exports-top8-2011-preview\.png/i, 'README should show the public foreign example preview image');
assert.match(readme, /us-ag-exports-top8-2011\.json/i, 'README should link the public foreign example data file');
assert.match(readme, /2011_us_ag_exports\.csv/i, 'README should cite the public U.S. agriculture dataset source');
assert.match(readme, /europe-gdp-top8-2014-preview\.png/i, 'README should show the European GDP preview image');
assert.match(readme, /europe-gdp-top8-2014\.json/i, 'README should link the European GDP data file');
assert.match(readme, /2014_world_gdp_with_codes\.csv/i, 'README should cite the public world GDP dataset source');
assert.match(readme, /saas-subscription-health-ibm-telco-preview\.png/i, 'README should show the SaaS subscription preview image');
assert.match(readme, /saas-subscription-health-ibm-telco\.json/i, 'README should link the SaaS subscription data file');
assert.match(readme, /telco-customer-churn-by-IBM\.csv/i, 'README should cite the public IBM telco churn dataset source');
assert.match(readme, /datell-no-mcp-capability-matrix\.md/i, 'README should link the no-MCP capability matrix');

const licenseText = await readFile(licenseFile, 'utf8');
assert.match(licenseText, /^MIT License/m, 'LICENSE should be MIT');

const rootPackage = JSON.parse(await readFile(rootPackageFile, 'utf8'));
const rootLock = JSON.parse(await readFile(lockFile, 'utf8'));
const mcpPackage = JSON.parse(await readFile(mcpPackageFile, 'utf8'));
const skillMarkdown = await readFile(skillFile, 'utf8');
const noMcpMatrix = await readFile(noMcpMatrixFile, 'utf8');
assert.equal(rootPackage.license, 'MIT', 'root package.json license should be MIT');
assert.equal(rootLock.packages[''].license, 'MIT', 'root package-lock.json license should be MIT');
assert.equal(rootLock.packages.mcp.license, 'MIT', 'mcp package-lock.json license should be MIT');
assert.equal(mcpPackage.license, 'MIT', 'mcp package.json license should be MIT');
assert.match(skillMarkdown, /^license: MIT$/m, 'SKILL.md frontmatter should declare MIT');
assert.match(skillMarkdown, /Public Example Assets/i, 'SKILL.md should surface public example links for the skills.sh detail page');
assert.match(skillMarkdown, /us-ag-exports-top8-2011|europe-gdp-top8-2014|saas-subscription-health-ibm-telco/i, 'SKILL.md should mention the public example asset set');
assert.match(noMcpMatrix, /full catalog knowledge coverage|direct static support|partial or static-equivalent support|out of scope without MCP/i, 'no-MCP matrix should define support tiers');
assert.match(noMcpMatrix, /filter-\*|event bus|linkage/i, 'no-MCP matrix should define the out-of-scope interactive set');

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

const europeExampleData = JSON.parse(await readFile(europeExampleDataFile, 'utf8'));
const europeRows = europeExampleData.rows || [];
assert.equal(Array.isArray(europeRows), true, 'European GDP example should expose a rows array');
assert.equal(europeRows.length, 8, 'European GDP example should preserve the top 8 selected countries');
assert.equal(europeExampleData.source.url, 'https://raw.githubusercontent.com/plotly/datasets/master/2014_world_gdp_with_codes.csv', 'European GDP example should cite the public world GDP dataset source');

const europeTotal = europeRows.reduce((sum, row) => sum + Number(row.gdpBillions || 0), 0);
const europeLeader = europeRows.slice().sort((left, right) => Number(right.gdpBillions || 0) - Number(left.gdpBillions || 0))[0];
const europeExampleHtml = await readFile(europeExampleHtmlFile, 'utf8');
assert.match(europeExampleHtml, /report-container|report-header|metric-narrative|image-embed-card|comparison-twoCol/i, 'European GDP example should use richer static structure cards');
assert.match(europeExampleHtml, /magazine-wide|editorial/i, 'European GDP example should reflect the second layout style and editorial direction');
assert.match(europeExampleHtml, new RegExp(escapeRegExp(formatUsdBillions(europeTotal))), 'European GDP example should show the total GDP computed from the input data');
assert.match(europeExampleHtml, new RegExp(escapeRegExp(europeLeader.country)), 'European GDP example should show the leading country computed from the input data');
assert.doesNotMatch(europeExampleHtml, /__REPORT_EVENT_BUS__|filterChange|zone-filter|filter-btn-group|filter-select|filter-checkbox-group/i, 'European GDP example should stay static and non-interactive');

const saasExampleData = JSON.parse(await readFile(saasExampleDataFile, 'utf8'));
assert.equal(saasExampleData.source.url, 'https://raw.githubusercontent.com/plotly/datasets/master/telco-customer-churn-by-IBM.csv', 'SaaS example should cite the public IBM telco churn dataset source');
assert.equal(saasExampleData.summary.customerCount, 7043, 'SaaS example should preserve the full customer count from the source aggregation');
assert.equal(saasExampleData.contractRows.length, 3, 'SaaS example should expose the three contract summary rows');
assert.equal(saasExampleData.tenureRows.length, 4, 'SaaS example should expose four tenure bands');
assert.equal(saasExampleData.tenureMatrix.length, 12, 'SaaS example should expose a 4x3 tenure-contract risk matrix');

const saasExampleHtml = await readFile(saasExampleHtmlFile, 'utf8');
assert.match(saasExampleHtml, /report-container|report-header|bento-grid|heatmap-table|comparison-twoCol|scorecard-table/i, 'SaaS example should use a bento grid plus richer static evidence cards');
assert.match(saasExampleHtml, /palette-dark-tech|dark-tech|bento-grid/i, 'SaaS example should reflect the dark business layout direction');
assert.match(saasExampleHtml, new RegExp(escapeRegExp(formatUsd(saasExampleData.summary.monthlyRevenueProxy))), 'SaaS example should show the monthly revenue proxy computed from the input data');
assert.match(saasExampleHtml, new RegExp(escapeRegExp(formatPercent(saasExampleData.summary.overallChurnRatePct))), 'SaaS example should show the overall churn rate computed from the input data');
assert.match(saasExampleHtml, new RegExp(escapeRegExp(saasExampleData.summary.highRiskContract.name)), 'SaaS example should show the highest-risk contract name from the input data');
assert.doesNotMatch(saasExampleHtml, /__REPORT_EVENT_BUS__|filterChange|zone-filter|filter-btn-group|filter-select|filter-checkbox-group/i, 'SaaS example should stay static and non-interactive');

for (const filePath of await collectTextFiles(repoRoot)) {
  const source = await readFile(filePath, 'utf8');
  assert.doesNotMatch(source, /[\u4e00-\u9fff]/, `public repository files should stay English-only: ${path.relative(repoRoot, filePath)}`);
}

await stat(salesExampleDataFile);
await stat(salesExampleHtmlFile);
await stat(usExampleDataFile);
await stat(usExampleHtmlFile);
await stat(usExamplePreviewFile);
await stat(noMcpMatrixFile);
await stat(europeExampleDataFile);
await stat(europeExampleHtmlFile);
await stat(europeExamplePreviewFile);
await stat(saasExampleDataFile);
await stat(saasExampleHtmlFile);
await stat(saasExamplePreviewFile);

console.log('public validation ok');