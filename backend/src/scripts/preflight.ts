import dotenv from 'dotenv';
import { access } from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import prisma from '../lib/prisma.js';
import { config } from '../config/index.js';

dotenv.config();

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

const checkEnv = () => {
  const jwtSecret = process.env.JWT_SECRET || '';
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';
  const dbUrl = process.env.DATABASE_URL || '';

  add(
    'NODE_ENV',
    config.nodeEnv === 'production',
    `NODE_ENV=${config.nodeEnv} (expected production)`,
    true
  );

  add(
    'JWT_SECRET',
    !isBlank(jwtSecret) && !['default-secret', 'dev-secret-change-in-production'].includes(jwtSecret),
    isBlank(jwtSecret) ? 'JWT_SECRET is missing' : 'JWT_SECRET is set'
  );

  add(
    'JWT_REFRESH_SECRET',
    !isBlank(jwtRefreshSecret) && !['default-refresh-secret', 'dev-refresh-secret-change-in-production'].includes(jwtRefreshSecret),
    isBlank(jwtRefreshSecret) ? 'JWT_REFRESH_SECRET is missing' : 'JWT_REFRESH_SECRET is set'
  );

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
