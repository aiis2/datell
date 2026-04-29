const fs = require('node:fs');
const path = require('node:path');

const tag = (process.argv[2] || '').trim();

if (!tag) {
  console.error('Usage: node scripts/render-release-body.cjs <tag>');
  process.exit(1);
}

const version = tag.replace(/^v/, '');
const repoRoot = path.resolve(__dirname, '..');
const templatePath = path.join(repoRoot, '.github', 'RELEASE_BODY.md');
const outputPath = path.join(repoRoot, '.github', 'RELEASE_BODY.generated.md');

const template = fs.readFileSync(templatePath, 'utf8');
const rendered = template
  .replaceAll('{{TAG}}', tag)
  .replaceAll('{{VERSION}}', version);

fs.writeFileSync(outputPath, rendered);
console.log(`Rendered ${path.relative(repoRoot, outputPath)} for ${tag}`);