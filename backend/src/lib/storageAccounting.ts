import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { listZipContents } from './compression.js';
import logger from './logger.js';

const execAsync = promisify(exec);

/**
 * Verify that actual file size matches declared size
 * Used after chunked upload merge to prevent quota bypass
 */
export async function verifyFileSize(
    filePath: string,
    declaredSize: number
): Promise<{ valid: boolean; actualSize: number }> {
    const stats = await fs.stat(filePath);
    const actualSize = Number(stats.size);
    return {
        valid: actualSize === declaredSize,
        actualSize,
    };
}

/**
 * Get uncompressed size for any supported archive format
 * Used for quota checks before decompression
 * 
 * Supports: .zip, .7z, .tar, .rar
 * For non-ZIP formats, requires 7z CLI to be installed
 */
export async function getArchiveUncompressedSize(
    archivePath: string,
    format: string
): Promise<bigint> {
    const ext = format.startsWith('.') ? format.toLowerCase() : `.${format.toLowerCase()}`;

    // ZIP: Use native unzipper library
    if (ext === '.zip') {
        const contents = await listZipContents(archivePath);
        return contents.reduce((acc, item) => acc + BigInt(item.size), BigInt(0));
    }

    // For 7z, tar, rar - use 7z CLI to list contents
    if (['.7z', '.tar', '.rar'].includes(ext)) {
        try {
            // Use 7z to list archive contents with technical info
            const { stdout } = await execAsync(`7z l -slt "${archivePath}"`, {
                timeout: 60000, // 1 minute timeout for large archives
            });

            // Parse 7z list output to sum uncompressed sizes
            // Format: "Size = 12345" for each file entry
            const sizeMatches = stdout.match(/Size = (\d+)/g);
            if (sizeMatches) {
                return sizeMatches.reduce((acc, match) => {
                    const size = parseInt(match.replace('Size = ', ''), 10);
                    return acc + BigInt(isNaN(size) ? 0 : size);
                }, BigInt(0));
            }

            // If no sizes found but command succeeded, archive might be empty
            logger.warn('No file sizes found in archive listing', { archivePath });
            return BigInt(0);
        } catch (error) {
            // If 7z is not installed or fails, throw error to block extraction
            logger.error('Failed to read archive contents with 7z', { archivePath, error });
            throw new Error(`Failed to read archive contents. Ensure 7z is installed for non-ZIP archives.`);
        }
    }

    throw new Error(`Unsupported archive format: ${ext}`);
}

/**
 * Calculate total size of input files/folders for compression
 * Used for preflight quota check before compression
 */
export async function calculateInputSize(paths: string[]): Promise<bigint> {
    let totalSize = BigInt(0);

    for (const p of paths) {
        try {
            const stats = await fs.stat(p);

            if (stats.isDirectory()) {
                // Recursively calculate directory size
                totalSize += await getDirectorySize(p);
            } else {
                totalSize += BigInt(stats.size);
            }
        } catch (error) {
            logger.warn('Failed to get size for path', { path: p, error });
            // Skip paths that can't be accessed
        }
    }

    return totalSize;
}

/**
 * Recursively calculate directory size
 */
async function getDirectorySize(dirPath: string): Promise<bigint> {
    let size = BigInt(0);

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = `${dirPath}/${entry.name}`;

            if (entry.isDirectory()) {
                size += await getDirectorySize(fullPath);
            } else {
                const stats = await fs.stat(fullPath);
                size += BigInt(stats.size);
            }
        }
    } catch (error) {
        logger.warn('Failed to read directory for size calculation', { dirPath, error });
    }

    return size;
}
