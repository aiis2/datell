/**
 * fix-kpi-htmlclassname-corrections.js
 * 
 * Targeted corrections for cards whose htmlClassName was incorrectly set:
 * 1. Restore specific variant classes that were wrongly stripped
 * 2. Set missing kpi-nps and kpi-budget-variance classes
 */

const fs = require('fs');
const path = require('path');

const CARDS_DIR = path.join(__dirname, '../resources/system_knowledge/cards');

// Explicit whitelist: { filename: correctClassName }
// Only overrides current value - does NOT touch files not in this list
const CORRECTIONS = {
  // These had correct specific classes but second script run stripped them
  'kpi-sparkline.json':           'card kpi-card kpi-sparkline',
  'kpi-trend.json':               'card kpi-card kpi-trend',
  'kpi-single.json':              'card kpi-card kpi-single',
  'kpi-rank-badge.json':          'card kpi-card kpi-rank',
  'kpi-multi-column.json':        'card kpi-card kpi-multi',
  'kpi-multi-metric.json':        'card kpi-card kpi-multi',
  'kpi-comparison-two-period.json': 'card kpi-card kpi-two-period',
  'kpi-comparison.json':          'card kpi-card kpi-comparison-card',

  // These were set to generic 'card kpi-card' but have specific CSS classes
  'kpi-nps.json':             'card kpi-card kpi-nps',
  'kpi-budget-variance.json': 'card kpi-card kpi-budget-variance',

  // target-bar exampleHtml uses 'card kpi-target-bar' (missing kpi-card) - ensure correct
  'kpi-target-bar.json':      'card kpi-card kpi-target-bar',
};

let fixed = 0;
for (const [file, correctValue] of Object.entries(CORRECTIONS)) {
  const filePath = path.join(CARDS_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`  SKIP (not found): ${file}`);
    continue;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);

  if (json.htmlClassName === correctValue) {
    console.log(`  OK (already correct): ${file}`);
    continue;
  }

  const old = json.htmlClassName || '(empty)';
  json.htmlClassName = correctValue;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  fixed++;
  console.log(`  FIXED ${file}: "${old}" → "${correctValue}"`);
}

console.log(`\n✅ Corrected ${fixed} files`);
