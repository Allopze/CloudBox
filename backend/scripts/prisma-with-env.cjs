const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const backendDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(backendDir, '..');
const rootEnvPath = path.resolve(backendDir, '..', '.env');
const backendEnvPath = path.resolve(backendDir, '.env');

const loadEnvFile = (envPath, overrideExisting) => {
  if (!fs.existsSync(envPath)) return;
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || overrideExisting) {
      process.env[key] = value;
    }
  }
};

const resolveDatabaseUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const db = process.env.POSTGRES_DB;

  if (!user || !db) {
    return undefined;
  }

  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5432';
  const schema = process.env.POSTGRES_SCHEMA || 'public';
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  const url = `postgresql://${auth}@${host}:${port}/${encodeURIComponent(db)}?schema=${encodeURIComponent(schema)}`;

  process.env.DATABASE_URL = url;
  return url;
};

// Load root .env first, then allow backend/.env to override.
loadEnvFile(rootEnvPath, false);
loadEnvFile(backendEnvPath, true);
const databaseUrl = resolveDatabaseUrl();

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node ./scripts/prisma-with-env.cjs <prisma args>');
  process.exit(1);
}

if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Set DATABASE_URL or POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB in .env.');
  process.exit(1);
}

const prismaCmdName = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
const candidateCmds = [
  path.join(backendDir, 'node_modules', '.bin', prismaCmdName),
  path.join(rootDir, 'node_modules', '.bin', prismaCmdName),
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
];

const prismaCmd = candidateCmds.find((cmd) => {
  if (cmd.includes(path.sep)) {
    return fs.existsSync(cmd);
  }
  return true;
});

if (!prismaCmd) {
  console.error('Prisma CLI not found. Run npm install or ensure Prisma is installed.');
  process.exit(1);
}

const spawnArgs = prismaCmd.endsWith('npx') || prismaCmd.endsWith('npx.cmd')
  ? ['prisma', ...args]
  : args;

const useShell = process.platform === 'win32';
const result = spawnSync(prismaCmd, spawnArgs, {
  cwd: backendDir,
  stdio: 'inherit',
  env: process.env,
  shell: useShell,
});

if (result.error) {
  console.error('Failed to run Prisma CLI:', result.error.message);
}

process.exit(result.status ?? 1);
