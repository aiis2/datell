#!/usr/bin/env node
/**
 * scripts/batch-fix-kpi-cards.js
 * Batch-fix KPI card JSON files:
 * 1. Fix category "A" → "kpi"
 * 2. Fix exampleHtml first div class to match htmlClassName
 * 3. Report files missing exampleHtml
 */
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const cardsDir = path.resolve(__dirname, '..', 'resources', 'system_knowledge', 'cards');
const files = glob.sync(path.join(cardsDir, 'kpi-*.json'));

let fixedCount = 0;
let issueCount = 0;
const missingExampleHtml = [];

for (const filePath of files) {
  const basename = path.basename(filePath);
  let raw = fs.readFileSync(filePath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`  ERROR: ${basename} - invalid JSON: ${e.message}`);
    continue;
  }

  let changed = false;

  // Fix 1: category "A" → "kpi"
  if (data.category === 'A') {
    console.log(`  FIX [${basename}]: category "A" → "kpi"`);
    data.category = 'kpi';
    changed = true;
    issueCount++;
  }

  // Fix 2: Ensure htmlClassName includes "kpi-card" if it's a KPI card
  const htmlClassName = data.htmlClassName || '';
  if (htmlClassName && !htmlClassName.includes('kpi-card')) {
    // Add kpi-card after "card" in the class string
    const parts = htmlClassName.split(/\s+/);
    if (parts[0] === 'card') {
      parts.splice(1, 0, 'kpi-card');
      data.htmlClassName = parts.join(' ');
      console.log(`  FIX [${basename}]: htmlClassName "${htmlClassName}" → "${data.htmlClassName}"`);
      changed = true;
      issueCount++;
    }
  }

  // Fix 3: Fix exampleHtml class mismatch
  if (data.exampleHtml && data.htmlClassName) {
    const expectedClass = data.htmlClassName;
    // Match the first div's class attribute
    const classMatch = data.exampleHtml.match(/^<div\s+class="([^"]+)"/);
    if (classMatch) {
      const currentClass = classMatch[1];
      if (currentClass !== expectedClass) {
        console.log(`  FIX [${basename}]: exampleHtml class "${currentClass}" → "${expectedClass}"`);
        data.exampleHtml = data.exampleHtml.replace(
          /^<div\s+class="[^"]+"/,
          `<div class="${expectedClass}"`
        );
        changed = true;
        issueCount++;
      }
    }
  }

  // Report missing exampleHtml
  if (!data.exampleHtml) {
    missingExampleHtml.push(basename);
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    fixedCount++;
  }
}

console.log(`\n=== Summary ===`);
console.log(`Scanned: ${files.length} files`);
console.log(`Fixed: ${fixedCount} files (${issueCount} issues)`);
if (missingExampleHtml.length > 0) {
  console.log(`Missing exampleHtml (${missingExampleHtml.length}):`);
  missingExampleHtml.forEach(f => console.log(`  - ${f}`));
}
