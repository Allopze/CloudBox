import { loadEnv, resolveDatabaseUrl } from '../lib/env.js';

loadEnv();
const databaseUrl = resolveDatabaseUrl();

const normalizeSecret = (value?: string): string => (value ?? '').trim();

const isWeakSecret = (value: string, minLength: number, disallowed: Set<string>): boolean => {
  if (!value) return true;
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

// Validate required secrets in production
if (process.env.NODE_ENV === 'production') {
  const jwtSecret = normalizeSecret(process.env.JWT_SECRET);
  if (isWeakSecret(jwtSecret, 32, insecureJwtSecrets)) {
    throw new Error('JWT_SECRET must be set to a strong value (>= 32 chars) in production');
  }
  const jwtRefreshSecret = normalizeSecret(process.env.JWT_REFRESH_SECRET);
  if (isWeakSecret(jwtRefreshSecret, 32, insecureRefreshSecrets)) {
    throw new Error('JWT_REFRESH_SECRET must be set to a strong value (>= 32 chars) in production');
  }
  const encryptionKey = normalizeSecret(process.env.ENCRYPTION_KEY);
  if (isWeakSecret(encryptionKey, 32, insecureEncryptionKeys)) {
    throw new Error('ENCRYPTION_KEY must be set to a strong value (>= 32 chars) in production');
  }
  // Validate database URL in production
  if (!databaseUrl || databaseUrl.startsWith('file:')) {
    console.warn('WARNING: Using SQLite in production is not recommended. Consider using PostgreSQL.');
  }
}

const isProduction = process.env.NODE_ENV === 'production';

const parseTrustProxy = (value?: string): string | boolean => {
  if (!value) return 'loopback, linklocal, uniquelocal';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return value;
};

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5000',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  // Database configuration
  database: {
    // Pool size (number of connections)
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
    // Connection timeout in seconds
    connectTimeout: parseInt(process.env.DATABASE_CONNECT_TIMEOUT || '10'),
    // External pooler (e.g., 'pgbouncer')
    pooler: process.env.DATABASE_POOLER || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Security: Cookie configuration for httpOnly tokens
  cookies: {
    httpOnly: true,
    secure: isProduction, // Only send over HTTPS in production
    sameSite: (isProduction ? 'strict' : 'lax') as 'strict' | 'lax' | 'none',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  },

  // Security: Signed URL configuration
  signedUrls: {
    expiresIn: parseInt(process.env.SIGNED_URL_EXPIRES_IN || '300'), // 5 minutes default
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'CloudBox <noreply@cloudbox.com>',
  },

  storage: {
    path: process.env.STORAGE_PATH || '../data',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '1073741824'),
    defaultQuota: BigInt(process.env.DEFAULT_QUOTA || '5368709120'),
  },

  midi: {
    soundfontPath: process.env.MIDI_SOUNDFONT_PATH || '',
    fluidsynthPath: process.env.MIDI_FLUIDSYNTH_PATH || 'fluidsynth',
    sampleRate: parseInt(process.env.MIDI_SAMPLE_RATE || '44100'),
    gain: parseFloat(process.env.MIDI_GAIN || '1.0'),
    mp3Quality: parseInt(process.env.MIDI_MP3_QUALITY || '2'),
    renderTimeoutMs: parseInt(process.env.MIDI_RENDER_TIMEOUT_MS || '300000'),
  },

  trash: {
    retentionDays: parseInt(process.env.TRASH_RETENTION_DAYS || '30'),
  },

  // Compression settings
  compression: {
    // ZIP compression level: 0 (no compression) to 9 (max compression)
    // Level 5 provides good balance between speed and size
    // Higher levels are slower but produce smaller files
    zipLevel: parseInt(process.env.ZIP_COMPRESSION_LEVEL || '5'),
  },

  // Security: Centralized limits for folder depth operations
  limits: {
    maxFolderDepth: parseInt(process.env.MAX_FOLDER_DEPTH || '50'),
    maxBreadcrumbDepth: parseInt(process.env.MAX_BREADCRUMB_DEPTH || '100'),
    maxZipSize: parseInt(process.env.MAX_ZIP_SIZE || String(50 * 1024 * 1024 * 1024)), // 50GB
    maxShareDepthCheck: parseInt(process.env.MAX_SHARE_DEPTH_CHECK || '50'),
    // Upload limits
    maxFilesPerRequest: parseInt(process.env.MAX_FILES_PER_REQUEST || '20'),
    maxFilesFolderUpload: parseInt(process.env.MAX_FILES_FOLDER_UPLOAD || '100'),
    maxTotalChunks: parseInt(process.env.MAX_TOTAL_CHUNKS || '10000'),
    maxChunkSize: parseInt(process.env.MAX_CHUNK_SIZE || String(100 * 1024 * 1024)), // 100MB max chunk size
  },

  // WOPI Host configuration (for Office file editing via external WOPI clients)
  wopi: {
    // Feature flags
    enabled: process.env.WOPI_ENABLED === 'true',
    editEnabled: process.env.WOPI_EDIT_ENABLED === 'true',

    // CloudBox public URL (used for WOPISrc in callbacks)
    publicUrl: process.env.CLOUDBOX_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:5000',

    // WOPI endpoints base path (default: /wopi)
    basePath: process.env.WOPI_BASE_PATH || '/wopi',

    // Office open path (host page for iframe)
    officeOpenPath: process.env.OFFICE_OPEN_PATH || '/office/open',

    // Token configuration
    tokenSecret: process.env.WOPI_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-wopi-secret-change-in-production',
    tokenTtlSeconds: parseInt(process.env.WOPI_TOKEN_TTL_SECONDS || '900'), // 15 minutes default

    // WOPI client discovery
    discoveryUrl: process.env.WOPI_DISCOVERY_URL || '',
    discoveryTtlSeconds: parseInt(process.env.WOPI_DISCOVERY_TTL_SECONDS || '3600'), // 1 hour cache

    // Allowed iframe origins for CSP (comma-separated)
    allowedIframeOrigins: (process.env.OFFICE_ALLOWED_IFRAME_ORIGINS || '').split(',').filter(Boolean),

    // Lock configuration
    lockProvider: (process.env.WOPI_LOCK_PROVIDER || 'db') as 'redis' | 'db',
    lockTtlSeconds: parseInt(process.env.WOPI_LOCK_TTL_SECONDS || '1800'), // 30 minutes default

    // Proof key verification (optional security feature)
    proofKeysVerify: process.env.WOPI_PROOF_KEYS_VERIFY === 'true',

    // Max file size for WOPI operations (default: 100MB)
    maxFileSize: parseInt(process.env.MAX_WOPI_FILE_SIZE_BYTES || String(100 * 1024 * 1024)),
  },
};
