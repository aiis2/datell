/**
 * fix-kpi-htmlclassname.js
 * 
 * Automatically fill missing htmlClassName in KPI card JSON files.
 * Strategy:
 * 1. If exampleHtml outer div has a specific kpi-XXX class → use "card kpi-card kpi-XXX"
 * 2. If exampleHtml has a known structural inner component class → use "card kpi-card kpi-XXX"
 * 3. Otherwise → use "card kpi-card" (basic single-value KPI)
 */

const fs = require('fs');
const path = require('path');

const CARDS_DIR = path.join(__dirname, '../resources/system_knowledge/cards');

// Classes that are NOT specific variant names (they're utility / element classes)
const EXCLUDED_KPI_CLASSES = new Set([
  'kpi-card', 'kpi-value', 'kpi-title', 'kpi-trend', 'kpi-sub',
  'kpi-label', 'kpi-delta', 'kpi-change', 'kpi-row', 'kpi-col',
  'kpi-badge', 'kpi-dot', 'kpi-divider', 'kpi-icon', 'kpi-body',
]);

// Known structural inner component classes that identify a card variant
// (used when the outer div only has class="card" but inner elements reveal the type)
const INNER_COMPONENT_CLASSES = [
  'kpi-ranked-list', 'kpi-multi-row', 'kpi-traffic-light',
  'kpi-dual-compare', 'kpi-segmented', 'kpi-nps',
  'kpi-budget-variance', 'kpi-waterfall-delta',
  'kpi-heatmap-cell', 'kpi-ring-progress', 'kpi-cac-ltv',
  'kpi-cohort-retention', 'kpi-growth-matrix', 'kpi-email-metrics',
  'kpi-lead-funnel', 'kpi-milestone-progress', 'kpi-gmv-breakdown',
  'kpi-composite', 'kpi-stock-ticker', 'kpi-countdown-timer',
  'kpi-deployment-freq', 'kpi-oee', 'kpi-social-engagement',
];

function extractClassName(exampleHtml) {
  if (!exampleHtml) return 'card kpi-card';

  // Step 1: Find the outer div's class attribute
  const outerMatch = exampleHtml.match(/^<div[^>]*\bclass=["']([^"']+)["']/);
  if (outerMatch) {
    const outerClasses = outerMatch[1].split(/\s+/);

    // If this is actually a chart card, preserve that classification
    if (outerClasses.includes('chart-card')) {
      return 'card chart-card';
    }

    // Look for a specific kpi-XXX class (not in exclusion list)
    const specClass = outerClasses.find(c => c.startsWith('kpi-') && !EXCLUDED_KPI_CLASSES.has(c));
    if (specClass) {
      // Ensure "card kpi-card" is present, append specific class
      const parts = new Set(['card', 'kpi-card', specClass]);
      return [...parts].join(' ');
    }
  }

  // Step 2: Scan entire HTML for known inner component classes
  for (const innerClass of INNER_COMPONENT_CLASSES) {
    if (exampleHtml.includes(innerClass)) {
      return `card kpi-card ${innerClass}`;
    }
  }

  // Step 3: Default to base KPI card
  return 'card kpi-card';
}

const files = fs.readdirSync(CARDS_DIR)
  .filter(f => f.startsWith('kpi-') && f.endsWith('.json'))
  .sort();

let fixed = 0;
let skipped = 0;
const results = [];

for (const file of files) {
  const filePath = path.join(CARDS_DIR, file);
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);

  const newClassName = extractClassName(json.exampleHtml || '');

  // Skip if already set to the same value (idempotent)
  if (json.htmlClassName === newClassName) {
    skipped++;
    continue;
  }

  const wasEmpty = !json.htmlClassName;
  const oldVal = json.htmlClassName || '(empty)';
  json.htmlClassName = newClassName;

  // Write back with consistent 2-space indent and UTF-8
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  fixed++;
  results.push({ file, className: newClassName, oldVal, wasEmpty });
}

console.log(`\n✅ Updated ${fixed} files, skipped ${skipped} (already correct)`);
console.log('\nChanges:');
results.forEach(r => console.log(`  ${r.file}: "${r.oldVal}" → "${r.className}"`));
