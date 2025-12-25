const { spawn } = require('node:child_process');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');

const vitestBin = process.platform === 'win32' ? 'vitest.cmd' : 'vitest';
const vitestPath = path.join(backendRoot, 'node_modules', '.bin', vitestBin);

const userArgs = process.argv.slice(2);

const env = {
  ...process.env,
  RUN_INTEGRATION: process.env.RUN_INTEGRATION ?? '1',
};

const child = spawn(vitestPath, ['run', 'src/__tests__/upload.integration.test.ts', ...userArgs], {
  cwd: backendRoot,
  stdio: 'inherit',
  env,
  shell: false,
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
