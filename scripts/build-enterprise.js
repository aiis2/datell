/**
 * Enterprise build wrapper — sets ENTERPRISE_BUILD=true then runs build:win.
 * Run via: npm run build:win:enterprise
 */
'use strict';

process.env.ENTERPRISE_BUILD = 'true';
const { execSync } = require('child_process');

console.log('[enterprise-build] Starting enterprise build with ENTERPRISE_BUILD=true');
try {
  execSync('npm run build:win', { stdio: 'inherit', env: process.env });
} catch (e) {
  process.exit(e.status || 1);
}
