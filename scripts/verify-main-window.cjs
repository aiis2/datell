const fs = require('fs');
const path = require('path');

const mainPath = path.join(process.cwd(), 'src', 'main', 'main.ts');
const preloadPath = path.join(process.cwd(), 'src', 'main', 'preload.ts');
const rendererEntryPath = path.join(process.cwd(), 'src', 'renderer', 'index.tsx');
const source = fs.readFileSync(mainPath, 'utf8');
const preloadSource = fs.readFileSync(preloadPath, 'utf8');
const rendererEntrySource = fs.readFileSync(rendererEntryPath, 'utf8');

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
  {
    name: 'waits for renderer-ready before showing main window',
    pass: /app:renderer-ready/.test(source) && /readyToShowFired/.test(source) && /rendererReady/.test(source),
  },
  {
    name: 'preload exposes renderer-ready bridge',
    pass: /appRendererReady:\s*\(\)\s*:\s*void\s*=>\s*ipcRenderer\.send\('app:renderer-ready'\)/.test(preloadSource),
  },
  {
    name: 'renderer entry notifies main process after mount',
    pass: /window\.electronAPI\?\.appRendererReady\?\.\(\)/.test(rendererEntrySource),
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
