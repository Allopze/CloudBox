import { access } from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import prisma from '../lib/prisma.js';
import { config } from '../config/index.js';

type CheckResult = {
  name: string;
  ok: boolean;
  message: string;
  optional?: boolean;
};

const results: CheckResult[] = [];

const add = (name: string, ok: boolean, message: string, optional = false) => {
  results.push({ name, ok, message, optional });
};

const isBlank = (value?: string | null) => !value || value.trim() === '';
const normalizeSecret = (value?: string | null) => (value ?? '').trim();

const isWeakSecret = (value: string, minLength: number, disallowed: Set<string>) => {
  if (isBlank(value)) return true;
  if (value.length < minLength) return true;
  if (disallowed.has(value)) return true;
  return false;
};

const insecureJwtSecrets = new Set([
  'default-secret',
  'dev-secret-change-in-production',
  'dev-jwt-secret-change-in-production',
  'your-super-secret-jwt-key-minimum-32-characters',
]);

const insecureRefreshSecrets = new Set([
  'default-refresh-secret',
  'dev-refresh-secret-change-in-production',
  'your-super-secret-refresh-key-minimum-32-characters',
]);

const insecureEncryptionKeys = new Set([
  'your-unique-encryption-key-minimum-32-characters',
  'change-me-in-production',
]);

const checkSecret = (label: string, value: string | undefined, minLength: number, disallowed: Set<string>) => {
  const normalized = normalizeSecret(value);
  const ok = !isWeakSecret(normalized, minLength, disallowed);
  add(label, ok, ok ? `${label} is set` : `${label} is missing or weak (min ${minLength} chars)`);
};

const checkEnv = () => {
  const dbUrl = process.env.DATABASE_URL || '';

  add(
    'NODE_ENV',
    config.nodeEnv === 'production',
    `NODE_ENV=${config.nodeEnv} (expected production)`,
    true
  );

  checkSecret('JWT_SECRET', process.env.JWT_SECRET, 32, insecureJwtSecrets);
  checkSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET, 32, insecureRefreshSecrets);
  checkSecret('ENCRYPTION_KEY', process.env.ENCRYPTION_KEY, 32, insecureEncryptionKeys);

  add(
    'DATABASE_URL',
    !isBlank(dbUrl),
    isBlank(dbUrl) ? 'DATABASE_URL is missing' : 'DATABASE_URL is set'
  );

  add(
    'DATABASE_URL format',
    !dbUrl.startsWith('file:'),
    dbUrl.startsWith('file:') ? 'SQLite detected; PostgreSQL recommended for production' : 'Database URL looks ok',
    dbUrl.startsWith('file:')
  );

  add(
    'FRONTEND_URL',
    !isBlank(process.env.FRONTEND_URL),
    isBlank(process.env.FRONTEND_URL) ? 'FRONTEND_URL is missing' : `FRONTEND_URL=${process.env.FRONTEND_URL}`
  );

  add(
    'STORAGE_PATH',
    !isBlank(process.env.STORAGE_PATH),
    isBlank(process.env.STORAGE_PATH) ? 'STORAGE_PATH is missing (will default to ../data)' : `STORAGE_PATH=${process.env.STORAGE_PATH}`,
    isBlank(process.env.STORAGE_PATH)
  );

  const storagePath = process.env.STORAGE_PATH || '';
  add(
    'STORAGE_PATH absolute',
    storagePath ? path.isAbsolute(storagePath) : false,
    storagePath
      ? (path.isAbsolute(storagePath) ? 'STORAGE_PATH is absolute' : 'STORAGE_PATH is relative; use an absolute path in production')
      : 'STORAGE_PATH not set; default ../data is relative',
    true
  );

  add(
    'REDIS_HOST',
    !isBlank(process.env.REDIS_HOST),
    isBlank(process.env.REDIS_HOST) ? 'REDIS_HOST is not set (Redis strongly recommended)' : `REDIS_HOST=${process.env.REDIS_HOST}`,
    true
  );
};

const checkStorageAccess = async () => {
  const storagePath = process.env.STORAGE_PATH || path.resolve(process.cwd(), '../data');
  try {
    await access(storagePath);
    add('Storage access', true, `Storage path accessible: ${storagePath}`);
  } catch {
    add('Storage access', false, `Storage path not accessible: ${storagePath}`);
  }
};

const checkDatabase = async () => {
  if (isBlank(process.env.DATABASE_URL)) {
    add('Database connection', false, 'Skipped (DATABASE_URL missing)');
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    add('Database connection', true, 'Database connection ok');
  } catch (error) {
    add('Database connection', false, `Database connection failed: ${(error as Error).message}`);
  }
};

const checkRedis = async () => {
  if (isBlank(process.env.REDIS_HOST)) {
    add('Redis connection', false, 'Skipped (REDIS_HOST not set)', true);
    return;
  }

  try {
    const RedisModule = await import('ioredis');
    const Redis = RedisModule.default;
    // @ts-ignore - ioredis types issue with ESM
    const redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    add('Redis connection', pong === 'PONG', `Redis ping: ${pong}`);
  } catch (error) {
    add('Redis connection', false, `Redis connection failed: ${(error as Error).message}`);
  }
};

const checkLibreOffice = async () => {
  const winPath = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
  if (process.platform === 'win32') {
    try {
      await access(winPath);
      add('LibreOffice', true, `LibreOffice found at ${winPath}`, true);
    } catch {
      add('LibreOffice', false, `LibreOffice not found at ${winPath} (Office previews disabled)`, true);
    }
    return;
  }

  await new Promise<void>((resolve) => {
    const proc = spawn('which', ['soffice'], { shell: true });
    proc.on('close', (code) => {
      add('LibreOffice', code === 0, code === 0 ? 'LibreOffice found (soffice)' : 'LibreOffice not found (Office previews disabled)', true);
      resolve();
    });
    proc.on('error', () => {
      add('LibreOffice', false, 'LibreOffice check failed (Office previews disabled)', true);
      resolve();
    });
  });
};

const printResults = () => {
  const failures = results.filter(r => !r.ok && !r.optional);
  const warnings = results.filter(r => !r.ok && r.optional);

  console.log('\n=== CloudBox Preflight ===');
  for (const r of results) {
    const status = r.ok ? 'OK' : (r.optional ? 'WARN' : 'FAIL');
    console.log(`[${status}] ${r.name}: ${r.message}`);
  }

  if (failures.length > 0) {
    console.log(`\nPreflight failed: ${failures.length} blocking issue(s).`);
    process.exitCode = 1;
  } else {
    console.log('\nPreflight passed with no blocking issues.');
  }

  if (warnings.length > 0) {
    console.log(`Warnings: ${warnings.length} optional check(s) failed.`);
  }
};

const main = async () => {
  checkEnv();
  await checkStorageAccess();
  await checkDatabase();
  await checkRedis();
  await checkLibreOffice();
  await prisma.$disconnect().catch(() => {});
  printResults();
};

main().catch(async (error) => {
  add('Preflight script', false, `Unhandled error: ${(error as Error).message}`);
  await prisma.$disconnect().catch(() => {});
  printResults();
});
