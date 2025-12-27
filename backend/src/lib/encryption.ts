import crypto from 'crypto';
import { config } from '../config/index.js';

/**
 * Security module for encrypting/decrypting sensitive data stored in database
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Derive encryption key from master secret
 * Uses PBKDF2 with SHA-512 for key derivation
 * 
 * H-07 SECURITY: In production, ENCRYPTION_KEY is required and must be 
 * different from JWT_SECRET to prevent key reuse vulnerabilities.
 */
function deriveKey(salt: Buffer): Buffer {
  const masterKey = process.env.ENCRYPTION_KEY;

  if (!masterKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ENCRYPTION_KEY environment variable is required in production. ' +
        'Set a unique 32+ character random string for encrypting sensitive data.'
      );
    }
    // Development fallback with warning
    console.warn(
      '[SECURITY WARNING] ENCRYPTION_KEY not set - using JWT_SECRET as fallback. ' +
      'This is NOT recommended for production. Set ENCRYPTION_KEY in your environment.'
    );
    return crypto.pbkdf2Sync(config.jwt.secret, salt, 100000, 32, 'sha512');
  }

  return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha512');
}

/**
 * Encrypt sensitive data for storage in database
 * Returns base64-encoded string containing salt, IV, authTag, and ciphertext
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';

  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine: salt (32) + iv (16) + authTag (16) + ciphertext
  const combined = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(encrypted, 'hex'),
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt sensitive data from database
 * Expects base64-encoded string from encryptSecret
 */
export function decryptSecret(encryptedBase64: string): string {
  if (!encryptedBase64) return '';

  try {
    const combined = Buffer.from(encryptedBase64, 'base64');

    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const key = deriveKey(salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt secret:', error);
    // Return empty string on decryption failure (corrupted or old format)
    return '';
  }
}

/**
 * Check if a value appears to be encrypted (base64 with correct length)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;

  try {
    const decoded = Buffer.from(value, 'base64');
    // Minimum length: salt (32) + iv (16) + authTag (16) + at least 1 byte ciphertext
    return decoded.length >= SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * Hash sensitive data for logging (one-way, for audit purposes)
 */
export function hashForAudit(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}
