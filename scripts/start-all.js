/**
 * scripts/start-all.js
 * Concurrently boots both the backend API server (port 4000) and the web frontend (port 5173).
 */

const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

console.log('════════════════════════════════════════════════════════════');
console.log('  STARTING BUGBOUNTY SWARM — FULL STACK');
console.log('════════════════════════════════════════════════════════════');

const server = spawn('node', ['node_modules/tsx/dist/cli.mjs', 'src/index.ts'], {
  cwd: path.join(root, 'apps', 'server'),
  stdio: 'inherit',
  shell: true,
});

const web = spawn('node', ['node_modules/vite/bin/vite.js'], {
  cwd: path.join(root, 'apps', 'web'),
  stdio: 'inherit',
  shell: true,
});

process.on('SIGINT', () => {
  server.kill();
  web.kill();
  process.exit();
});
