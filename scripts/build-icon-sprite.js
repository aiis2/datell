/**
 * build-icon-sprite.js
 *
 * Generates a single SVG sprite from @tabler/icons outline icons.
 * Output: public/vendor/icons.svg
 *
 * Each icon becomes:
 *   <symbol id="icon-{name}" viewBox="0 0 24 24">...</symbol>
 *
 * Usage: node scripts/build-icon-sprite.js
 */

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '../node_modules/@tabler/icons/icons/outline');
const OUTPUT = path.join(__dirname, '../public/vendor/icons.svg');

console.log('[icon-sprite] Reading icons from', ICONS_DIR);

if (!fs.existsSync(ICONS_DIR)) {
  console.error('[icon-sprite] ERROR: @tabler/icons not installed. Run: npm install @tabler/icons --save-dev');
  process.exit(1);
}

const files = fs.readdirSync(ICONS_DIR).filter((f) => f.endsWith('.svg'));
console.log(`[icon-sprite] Found ${files.length} SVG files`);

const iconNames = [];

const symbols = files.map((file) => {
  const name = file.replace('.svg', '');
  iconNames.push(name);
  const raw = fs.readFileSync(path.join(ICONS_DIR, file), 'utf-8');

  // Extract viewBox from the SVG file
  const viewBoxMatch = raw.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 24 24';

  // Extract everything inside <svg>...</svg> — keep all child attributes intact
  // (especially stroke="none" fill="none" on the background path)
  const innerMatch = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  const inner = innerMatch ? innerMatch[1].trim() : '';

  // Put Tabler outline icon attributes on the symbol so child paths inherit correctly:
  // fill="none" prevents default black fill; stroke="currentColor" picks up CSS color
  return `  <symbol id="icon-${name}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</symbol>`;
});

const sprite = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display:none">
${symbols.join('\n')}
</svg>`;

fs.writeFileSync(OUTPUT, sprite, 'utf-8');
const sizeKb = Math.round(fs.statSync(OUTPUT).size / 1024);
console.log(`[icon-sprite] Written to ${OUTPUT} (${sizeKb} KB, ${files.length} icons)`);

// Also write the icon names list for fast search in the UI
const ICONS_LIST_OUTPUT = path.join(__dirname, '../public/vendor/icons-list.json');
fs.writeFileSync(ICONS_LIST_OUTPUT, JSON.stringify(iconNames.sort(), null, 0), 'utf-8');
const listSizeKb = Math.round(fs.statSync(ICONS_LIST_OUTPUT).size / 1024);
console.log(`[icon-sprite] Icon list written to ${ICONS_LIST_OUTPUT} (${listSizeKb} KB)`);
