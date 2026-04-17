const fs = require('fs');
const path = require('path');

const mainPath = path.join(process.cwd(), 'src', 'main', 'main.ts');
const source = fs.readFileSync(mainPath, 'utf8');

const checks = [
  {
    name: 'uses app.isPackaged for dev detection',
    pass: /const\s+isDev\s*=\s*!app\.isPackaged/.test(source),
  },
  {
    name: 'disables native menu bar',
    pass: /autoHideMenuBar\s*:\s*true/.test(source),
  },
  {
    name: 'clears application menu',
    pass: /Menu\.setApplicationMenu\(null\)/.test(source),
  },
  {
    name: 'registers did-fail-load diagnostics',
    pass: /did-fail-load/.test(source),
  },
];

const failed = checks.filter((item) => !item.pass);
if (failed.length > 0) {
  console.error('Main window verification failed:');
  for (const item of failed) {
    console.error(`- ${item.name}`);
  }
  process.exit(1);
}

console.log('Main window verification passed.');
