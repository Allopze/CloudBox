import { Router, Request, Response } from 'express';
import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { encryptSecret, decryptSecret } from '../lib/encryption.js';
import { config } from '../config/index.js';
import {
    verify2FASchema,
    disable2FASchema,
    recovery2FASchema,
    login2FASchema,
} from '../schemas/index.js';
import { auditLog } from '../lib/audit.js';

const router = Router();

// Constants
const TOTP_ISSUER = 'CloudBox';
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 10;
const TEMP_TOKEN_EXPIRY = 5 * 60; // 5 minutes

/**
 * Generate a secure random recovery code
 */
function generateRecoveryCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, 0, 1, I to avoid confusion
    let code = '';
    const bytes = crypto.randomBytes(RECOVERY_CODE_LENGTH);
    for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
        code += chars[bytes[i] % chars.length];
    }
    // Format: XXXXX-XXXXX
    return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/**
 * Generate a set of recovery codes and their hashes
 */
async function generateRecoveryCodes(): Promise<{ codes: string[]; hashes: string[] }> {
    const codes: string[] = [];
    const hashes: string[] = [];

    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
        const code = generateRecoveryCode();
        codes.push(code);
        // Hash each code for storage
        const hash = await bcrypt.hash(code.replace('-', ''), 10);
        hashes.push(hash);
    }

    return { codes, hashes };
}

/**
 * Verify a recovery code against stored hashes
 */
async function verifyRecoveryCode(
    code: string,
    storedHashes: string[]
): Promise<{ valid: boolean; index: number }> {
    const normalizedCode = code.replace('-', '').toUpperCase();

    for (let i = 0; i < storedHashes.length; i++) {
        if (storedHashes[i] && await bcrypt.compare(normalizedCode, storedHashes[i])) {
            return { valid: true, index: i };
        }
    }

    return { valid: false, index: -1 };
}

/**
 * Generate temporary token for 2FA verification during login
 */
function generateTempToken(userId: string): string {
    return jwt.sign(
        { userId, purpose: '2fa' },
        config.jwt.secret,
        { expiresIn: TEMP_TOKEN_EXPIRY }
    );
}

/**
 * Verify temporary token
 */
function verifyTempToken(token: string): { userId: string } | null {
    try {
        const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; purpose: string };
        if (decoded.purpose !== '2fa') return null;
        return { userId: decoded.userId };
    } catch {
        return null;
    }
}

// ============================================================
// 2FA Setup - Generate secret and QR code
// ============================================================
router.post('/setup', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, twoFactorEnabled: true },
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (user.twoFactorEnabled) {
            res.status(400).json({ error: '2FA is already enabled' });
            return;
        }

        // Generate TOTP secret
        const secret = new Secret({ size: 20 });

        // Create TOTP instance
        const totp = new TOTP({
            issuer: TOTP_ISSUER,
            label: user.email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: secret,
        });

        // Generate QR code as data URL
        const otpauthUri = totp.toString();
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, {
            width: 256,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF',
            },
        });

        // Generate recovery codes
        const { codes, hashes } = await generateRecoveryCodes();

        // Store secret temporarily (encrypted) - not enabled yet
        // We store it so we can verify the first code before enabling
        await prisma.user.update({
            where: { id: userId },
            data: {
                twoFactorSecret: encryptSecret(secret.base32),
                recoveryCodes: JSON.stringify(hashes),
            },
        });

        await auditLog({
            action: '2FA_SETUP_INITIATED',
            userId,
            details: { email: user.email },
            success: true,
        });

        res.json({
            qrCode: qrCodeDataUrl,
            secret: secret.base32, // Also provide the secret for manual entry
            recoveryCodes: codes,
        });
    } catch (error) {
        console.error('2FA setup error:', error);
        res.status(500).json({ error: 'Failed to setup 2FA' });
    }
});

// ============================================================
// 2FA Enable - Verify first code and enable 2FA
// ============================================================
router.post('/enable', authenticate, validate(verify2FASchema), async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { code } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                email: true,
                twoFactorEnabled: true,
                twoFactorSecret: true
            },
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (user.twoFactorEnabled) {
            res.status(400).json({ error: '2FA is already enabled' });
            return;
        }

        if (!user.twoFactorSecret) {
            res.status(400).json({ error: 'Please setup 2FA first by calling /2fa/setup' });
            return;
        }

        // Decrypt and verify the TOTP code
        const secretBase32 = decryptSecret(user.twoFactorSecret);
        if (!secretBase32) {
            res.status(500).json({ error: 'Failed to decrypt 2FA secret' });
            return;
        }

        const totp = new TOTP({
            issuer: TOTP_ISSUER,
            label: user.email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: Secret.fromBase32(secretBase32),
        });

        // Validate with a window of 1 (allows 1 period before/after)
        const delta = totp.validate({ token: code, window: 1 });

        if (delta === null) {
            await auditLog({
                action: '2FA_ENABLE_FAILED',
                userId,
                details: { reason: 'Invalid code' },
                success: false,
            });
            res.status(400).json({ error: 'Invalid verification code' });
            return;
        }

        // Enable 2FA
        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: true },
        });

        await auditLog({
            action: '2FA_ENABLED',
            userId,
            details: { email: user.email },
            success: true,
        });

        res.json({ message: '2FA has been enabled successfully' });
    } catch (error) {
        console.error('2FA enable error:', error);
        res.status(500).json({ error: 'Failed to enable 2FA' });
    }
});

// ============================================================
// 2FA Disable - Requires password and current TOTP code
// ============================================================
router.post('/disable', authenticate, validate(disable2FASchema), async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { password, code } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                email: true,
                password: true,
                twoFactorEnabled: true,
                twoFactorSecret: true
            },
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (!user.twoFactorEnabled) {
            res.status(400).json({ error: '2FA is not enabled' });
            return;
        }

        // Verify password
        if (!user.password || !(await bcrypt.compare(password, user.password))) {
            await auditLog({
                action: '2FA_DISABLE_FAILED',
                userId,
                details: { reason: 'Invalid password' },
                success: false,
            });
            res.status(401).json({ error: 'Invalid password' });
            return;
        }

        // Verify TOTP code
        const secretBase32 = decryptSecret(user.twoFactorSecret!);
        if (!secretBase32) {
            res.status(500).json({ error: 'Failed to decrypt 2FA secret' });
            return;
        }

        const totp = new TOTP({
            issuer: TOTP_ISSUER,
            label: user.email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: Secret.fromBase32(secretBase32),
        });

        const delta = totp.validate({ token: code, window: 1 });

        if (delta === null) {
            await auditLog({
                action: '2FA_DISABLE_FAILED',
                userId,
                details: { reason: 'Invalid TOTP code' },
                success: false,
            });
            res.status(400).json({ error: 'Invalid verification code' });
            return;
        }

        // Disable 2FA and clear secret
        await prisma.user.update({
            where: { id: userId },
            data: {
                twoFactorEnabled: false,
                twoFactorSecret: null,
                recoveryCodes: null,
            },
        });

        await auditLog({
            action: '2FA_DISABLED',
            userId,
            details: { email: user.email },
            success: true,
        });

        res.json({ message: '2FA has been disabled successfully' });
    } catch (error) {
        console.error('2FA disable error:', error);
        res.status(500).json({ error: 'Failed to disable 2FA' });
    }
});

// ============================================================
// 2FA Verify - During login flow
// ============================================================
router.post('/verify', validate(login2FASchema), async (req: Request, res: Response) => {
    try {
        const { tempToken, code } = req.body;

        // Verify temp token
        const tokenData = verifyTempToken(tempToken);
        if (!tokenData) {
            res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: tokenData.userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                avatar: true,
                emailVerified: true,
                storageQuota: true,
                storageUsed: true,
                twoFactorEnabled: true,
                twoFactorSecret: true
            },
        });

        if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
            res.status(400).json({ error: 'Invalid 2FA state' });
            return;
        }

        // Verify TOTP code
        const secretBase32 = decryptSecret(user.twoFactorSecret);
        if (!secretBase32) {
            res.status(500).json({ error: 'Failed to verify 2FA' });
            return;
        }

        const totp = new TOTP({
            issuer: TOTP_ISSUER,
            label: user.email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: Secret.fromBase32(secretBase32),
        });

        const delta = totp.validate({ token: code, window: 1 });

        if (delta === null) {
            await auditLog({
                action: '2FA_VERIFY_FAILED',
                userId: user.id,
                details: { reason: 'Invalid code' },
                success: false,
            });
            res.status(400).json({ error: 'Invalid verification code' });
            return;
        }

        // Generate real tokens
        const { generateAccessToken, generateRefreshToken } = await import('../lib/jwt.js');

        const accessToken = generateAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        const familyId = crypto.randomUUID();
        const jti = crypto.randomUUID();
        const refreshToken = generateRefreshToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            jti,
            familyId,
        });

        // Store refresh token
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        await prisma.refreshToken.create({
            data: {
                tokenHash,
                jti,
                userId: user.id,
                familyId,
                expiresAt,
            },
        });

        // Set refresh token in httpOnly cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });

        await auditLog({
            action: '2FA_VERIFY_SUCCESS',
            userId: user.id,
            details: { email: user.email },
            success: true,
        });

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                avatar: user.avatar,
                emailVerified: user.emailVerified,
                storageQuota: user.storageQuota.toString(),
                storageUsed: user.storageUsed.toString(),
                twoFactorEnabled: user.twoFactorEnabled,
            },
            accessToken,
        });
    } catch (error) {
        console.error('2FA verify error:', error);
        res.status(500).json({ error: 'Failed to verify 2FA' });
    }
});

// ============================================================
// 2FA Recovery - Use recovery code when authenticator is unavailable
// ============================================================
router.post('/recovery', validate(recovery2FASchema), async (req: Request, res: Response) => {
    try {
        const { tempToken, recoveryCode } = req.body;

        // Verify temp token
        const tokenData = verifyTempToken(tempToken);
        if (!tokenData) {
            res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: tokenData.userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                avatar: true,
                emailVerified: true,
                storageQuota: true,
                storageUsed: true,
                twoFactorEnabled: true,
                recoveryCodes: true,
            },
        });

        if (!user || !user.twoFactorEnabled || !user.recoveryCodes) {
            res.status(400).json({ error: 'Invalid 2FA state' });
            return;
        }

        // Parse stored hashes
        let hashes: string[];
        try {
            hashes = JSON.parse(user.recoveryCodes);
        } catch {
            res.status(500).json({ error: 'Failed to verify recovery code' });
            return;
        }

        // Verify recovery code
        const { valid, index } = await verifyRecoveryCode(recoveryCode, hashes);

        if (!valid) {
            await auditLog({
                action: '2FA_RECOVERY_FAILED',
                userId: user.id,
                details: { reason: 'Invalid recovery code' },
                success: false,
            });
            res.status(400).json({ error: 'Invalid recovery code' });
            return;
        }

        // Mark the used recovery code as consumed (set to empty string)
        hashes[index] = '';
        await prisma.user.update({
            where: { id: user.id },
            data: { recoveryCodes: JSON.stringify(hashes) },
        });

        // Count remaining codes
        const remainingCodes = hashes.filter(h => h !== '').length;

        // Generate real tokens
        const { generateAccessToken, generateRefreshToken } = await import('../lib/jwt.js');

        const accessToken = generateAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        const familyId = crypto.randomUUID();
        const jti = crypto.randomUUID();
        const refreshToken = generateRefreshToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            jti,
            familyId,
        });

        // Store refresh token
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        await prisma.refreshToken.create({
            data: {
                tokenHash,
                jti,
                userId: user.id,
                familyId,
                expiresAt,
            },
        });

        // Set refresh token in httpOnly cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });

        await auditLog({
            action: '2FA_RECOVERY_SUCCESS',
            userId: user.id,
            details: { email: user.email, remainingCodes },
            success: true,
        });

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                avatar: user.avatar,
                emailVerified: user.emailVerified,
                storageQuota: user.storageQuota.toString(),
                storageUsed: user.storageUsed.toString(),
                twoFactorEnabled: user.twoFactorEnabled,
            },
            accessToken,
            remainingRecoveryCodes: remainingCodes,
        });
    } catch (error) {
        console.error('2FA recovery error:', error);
        res.status(500).json({ error: 'Failed to use recovery code' });
    }
});

// ============================================================
// 2FA Status - Get current 2FA status for authenticated user
// ============================================================
router.get('/status', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                twoFactorEnabled: true,
                recoveryCodes: true,
            },
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        let remainingRecoveryCodes = 0;
        if (user.recoveryCodes) {
            try {
                const hashes = JSON.parse(user.recoveryCodes);
                remainingRecoveryCodes = hashes.filter((h: string) => h !== '').length;
            } catch {
                // Ignore parse errors
            }
        }

        res.json({
            enabled: user.twoFactorEnabled,
            remainingRecoveryCodes: user.twoFactorEnabled ? remainingRecoveryCodes : 0,
        });
    } catch (error) {
        console.error('2FA status error:', error);
        res.status(500).json({ error: 'Failed to get 2FA status' });
    }
});

// ============================================================
// Regenerate Recovery Codes - Generate new recovery codes
// ============================================================
router.post('/regenerate-recovery', authenticate, validate(verify2FASchema), async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { code } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                email: true,
                twoFactorEnabled: true,
                twoFactorSecret: true
            },
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (!user.twoFactorEnabled || !user.twoFactorSecret) {
            res.status(400).json({ error: '2FA is not enabled' });
            return;
        }

        // Verify TOTP code first
        const secretBase32 = decryptSecret(user.twoFactorSecret);
        if (!secretBase32) {
            res.status(500).json({ error: 'Failed to verify 2FA' });
            return;
        }

        const totp = new TOTP({
            issuer: TOTP_ISSUER,
            label: user.email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: Secret.fromBase32(secretBase32),
        });

        const delta = totp.validate({ token: code, window: 1 });

        if (delta === null) {
            res.status(400).json({ error: 'Invalid verification code' });
            return;
        }

        // Generate new recovery codes
        const { codes, hashes } = await generateRecoveryCodes();

        await prisma.user.update({
            where: { id: userId },
            data: { recoveryCodes: JSON.stringify(hashes) },
        });

        await auditLog({
            action: '2FA_RECOVERY_REGENERATED',
            userId,
            details: { email: user.email },
            success: true,
        });

        res.json({ recoveryCodes: codes });
    } catch (error) {
        console.error('2FA regenerate recovery error:', error);
        res.status(500).json({ error: 'Failed to regenerate recovery codes' });
    }
});

// Export helper for use in auth.ts login flow
export { generateTempToken };

export default router;
