import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let envLoaded = false;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../.env');

const applyEnvFile = (envPath: string, overrideFromEarlier: boolean, loadedKeys: Set<string>) => {
  if (!fs.existsSync(envPath)) return;
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    const alreadySet = process.env[key] !== undefined;
    const canOverride = overrideFromEarlier && loadedKeys.has(key);
    if (!alreadySet || canOverride) {
      process.env[key] = value;
      loadedKeys.add(key);
    }
  }
};

export const loadEnv = () => {
  if (envLoaded) return;
  envLoaded = true;

  const loadedKeys = new Set<string>();
  // Load root .env first (docker/production), then allow backend/.env to override.
  applyEnvFile(rootEnvPath, false, loadedKeys);
  applyEnvFile(backendEnvPath, true, loadedKeys);
};

export const resolveDatabaseUrl = (): string | undefined => {
  if (!envLoaded) {
    loadEnv();
  }

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
