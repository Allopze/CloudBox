import archiver from 'archiver';
import unzipper from 'unzipper';
import { exec, execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getStoragePath } from './storage.js';
import prisma from './prisma.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Use string type instead of Prisma enum for SQLite compatibility
type CompressionStatusType = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface CompressionProgress {
  jobId: string;
  progress: number;
  status: CompressionStatusType;
  currentFile?: string;
  error?: string;
}

type ProgressCallback = (progress: CompressionProgress) => void;

const activeJobs = new Map<string, ChildProcess>();

const calculateDirectorySize = async (dir: string): Promise<number> => {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  let size = 0;

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += await calculateDirectorySize(entryPath);
    } else {
      const stat = await fs.promises.stat(entryPath);
      size += stat.size;
    }
  }

  return size;
};

const calculateInputSize = async (inputPaths: string[]): Promise<number> => {
  let totalSize = 0;

  for (const inputPath of inputPaths) {
    const stat = await fs.promises.stat(inputPath);
    if (stat.isDirectory()) {
      totalSize += await calculateDirectorySize(inputPath);
    } else {
      totalSize += stat.size;
    }
  }

  return totalSize;
};

export const compressToZip = async (
  jobId: string,
  inputPaths: string[],
  outputPath: string,
  onProgress?: ProgressCallback
): Promise<string> => {
  const totalSize = await calculateInputSize(inputPaths);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    let processedSize = 0;
    let currentFile = '';

    output.on('close', () => {
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    // Track current file being processed
    archive.on('entry', (entry) => {
      currentFile = entry.name;
    });

    archive.on('progress', (progress) => {
      processedSize = progress.fs.processedBytes;
      const percent = totalSize > 0 ? Math.round((processedSize / totalSize) * 100) : 0;
      
      onProgress?.({
        jobId,
        progress: percent,
        status: 'PROCESSING',
        currentFile,
      });

      // Fire and forget but log errors
      prisma.compressionJob.update({
        where: { id: jobId },
        data: { progress: percent, currentFile },
      }).catch((err) => console.error('Failed to update compression progress:', err));
    });

    archive.pipe(output);

    const addEntries = async (): Promise<void> => {
      for (const inputPath of inputPaths) {
        const stat = await fs.promises.stat(inputPath);
        const name = path.basename(inputPath);

        if (stat.isDirectory()) {
          archive.directory(inputPath, name);
        } else {
          archive.file(inputPath, { name });
        }
      }

      archive.finalize();
    };

    addEntries().catch((err) => {
      archive.abort();
      reject(err);
    });
  });
};

/**
 * Security: Configuration for extraction limits
 * 
 * NOTE: MAX_TOTAL_SIZE is set conservatively to prevent OOM attacks.
 * Extraction uses streaming to disk, but we still limit total size
 * to prevent disk exhaustion attacks.
 */
export const EXTRACTION_LIMITS = {
  MAX_FILES: 10000, // Maximum number of files to extract
  MAX_TOTAL_SIZE: 2 * 1024 * 1024 * 1024, // 2 GB max uncompressed size (reduced from 10GB for safety)
  MAX_SINGLE_FILE_SIZE: 500 * 1024 * 1024, // 500 MB max per single file
  MAX_PATH_LENGTH: 260, // Windows MAX_PATH limit
  TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes timeout
};

/**
 * Security: Validates that a path is safe and doesn't escape the target directory (Zip Slip protection)
 * @param targetDir The directory where files should be extracted
 * @param entryPath The path from the archive entry
 * @returns The safe, normalized absolute path or null if unsafe
 */
export const validateExtractPath = (targetDir: string, entryPath: string): string | null => {
  // Normalize the entry path - remove any leading slashes and normalize separators
  const normalizedEntry = entryPath
    .replace(/^[\/\\]+/, '') // Remove leading slashes
    .replace(/\\/g, '/'); // Normalize to forward slashes
  
  // Block obvious path traversal attempts
  if (normalizedEntry.includes('../') || 
      normalizedEntry.includes('..\\') ||
      normalizedEntry.startsWith('..') ||
      normalizedEntry.includes('/..') ||
      normalizedEntry.includes('\\..')) {
    return null;
  }
  
  // Build the full path and resolve it
  const fullPath = path.resolve(targetDir, normalizedEntry);
  const resolvedTarget = path.resolve(targetDir);
  
  // Ensure the resolved path is within the target directory
  if (!fullPath.startsWith(resolvedTarget + path.sep) && fullPath !== resolvedTarget) {
    return null;
  }
  
  // Check path length (Windows compatibility)
  if (fullPath.length > EXTRACTION_LIMITS.MAX_PATH_LENGTH) {
    return null;
  }
  
  return fullPath;
};

const list7zEntries = async (archivePath: string): Promise<string[]> => {
  const { stdout } = await execFileAsync('7z', ['l', '-slt', archivePath], {
    maxBuffer: 10 * 1024 * 1024,
  });

  const entries: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('Path = ')) {
      const entryPath = line.slice(7).trim();
      if (entryPath) {
        entries.push(entryPath);
      }
    }
  }

  return entries;
};

export const extractZip = async (
  jobId: string,
  inputPath: string,
  outputDir: string,
  onProgress?: ProgressCallback
): Promise<void> => {
  const stat = fs.statSync(inputPath);
  const totalSize = stat.size;
  let processedSize = 0;
  let fileCount = 0;
  let totalUncompressedSize = 0;

  // Resolve the output directory to absolute path for security checks
  const resolvedOutputDir = path.resolve(outputDir);
  await fs.promises.mkdir(resolvedOutputDir, { recursive: true });

  // Use unzipper.Parse() for more control over individual entries
  const directory = await unzipper.Open.file(inputPath);
  
  // Pre-validate: Check file count and total size before extraction
  for (const file of directory.files) {
    fileCount++;
    totalUncompressedSize += file.uncompressedSize;
    
    if (fileCount > EXTRACTION_LIMITS.MAX_FILES) {
      throw new Error(`Archive contains too many files (limit: ${EXTRACTION_LIMITS.MAX_FILES})`);
    }
    
    if (totalUncompressedSize > EXTRACTION_LIMITS.MAX_TOTAL_SIZE) {
      throw new Error(`Archive uncompressed size exceeds limit (${EXTRACTION_LIMITS.MAX_TOTAL_SIZE / (1024 * 1024 * 1024)} GB)`);
    }

    // Security: Check individual file size to prevent memory issues during streaming
    if (file.uncompressedSize > EXTRACTION_LIMITS.MAX_SINGLE_FILE_SIZE) {
      throw new Error(`File too large: ${file.path} (${Math.round(file.uncompressedSize / (1024 * 1024))} MB, limit: ${EXTRACTION_LIMITS.MAX_SINGLE_FILE_SIZE / (1024 * 1024)} MB)`);
    }
    
    // Security: Validate each path before extraction (Zip Slip prevention)
    const safePath = validateExtractPath(resolvedOutputDir, file.path);
    if (!safePath) {
      throw new Error(`Unsafe path detected in archive: ${file.path} - possible path traversal attack`);
    }
  }

  // Reset counters for actual extraction
  fileCount = 0;
  processedSize = 0;

  // Extract files with path validation using STREAMING (not buffer) to avoid OOM
  for (const file of directory.files) {
    const safePath = validateExtractPath(resolvedOutputDir, file.path);
    
    // This should never happen since we pre-validated, but double-check
    if (!safePath) {
      throw new Error(`Unsafe path detected during extraction: ${file.path}`);
    }

    if (file.type === 'Directory') {
      await fs.promises.mkdir(safePath, { recursive: true });
    } else {
      // Ensure parent directory exists
      await fs.promises.mkdir(path.dirname(safePath), { recursive: true });
      
      // SECURITY FIX: Use streaming to disk instead of loading entire file into memory
      // This prevents OOM attacks with large files inside the archive
      await new Promise<void>((resolve, reject) => {
        const readStream = file.stream();
        const writeStream = fs.createWriteStream(safePath);
        
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        readStream.on('error', reject);
        
        readStream.pipe(writeStream);
      });
    }

    fileCount++;
    processedSize += file.compressedSize;
    const percent = Math.round((processedSize / totalSize) * 100);
    
    // Get just the filename for display
    const currentFile = path.basename(file.path);
    
    onProgress?.({
      jobId,
      progress: percent,
      status: 'PROCESSING',
      currentFile,
    });

    // Fire and forget but log errors
    prisma.compressionJob.update({
      where: { id: jobId },
      data: { progress: percent, currentFile },
    }).catch((err) => console.error('Failed to update extraction progress:', err));
  }
};

export const compress7z = async (
  jobId: string,
  inputPaths: string[],
  outputPath: string,
  format: 'zip' | '7z' | 'tar',
  onProgress?: ProgressCallback
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const args = ['a', '-y'];
    
    if (format === 'tar') {
      args.push('-ttar');
    } else if (format === '7z') {
      args.push('-t7z');
    }
    
    args.push(outputPath, ...inputPaths);
    
    const process = spawn('7z', args);
    activeJobs.set(jobId, process);

    let lastProgress = 0;
    let currentFile = '';

    process.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      
      // Parse current file from 7z output (lines like "Compressing  filename" or "+ filename")
      const fileMatch = output.match(/(?:Compressing\s+|^\+\s+)(.+?)(?:\r?\n|$)/m);
      if (fileMatch) {
        currentFile = fileMatch[1].trim();
      }
      
      const match = output.match(/(\d+)%/);
      if (match) {
        const progress = parseInt(match[1]);
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress?.({
            jobId,
            progress,
            status: 'PROCESSING',
            currentFile,
          });

          // Fire and forget but log errors
          prisma.compressionJob.update({
            where: { id: jobId },
            data: { progress, currentFile },
          }).catch((err) => console.error('Failed to update 7z compression progress:', err));
        }
      }
    });

    process.on('close', (code) => {
      activeJobs.delete(jobId);
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`7z exited with code ${code}`));
      }
    });

    process.on('error', (err) => {
      activeJobs.delete(jobId);
      reject(err);
    });
  });
};

export const extract7z = async (
  jobId: string,
  inputPath: string,
  outputDir: string,
  onProgress?: ProgressCallback
): Promise<void> => {
  // Resolve output directory for security validation
  const resolvedOutputDir = path.resolve(outputDir);
  await fs.promises.mkdir(resolvedOutputDir, { recursive: true });

  const entryPaths = await list7zEntries(inputPath);
  const archiveBaseName = path.basename(inputPath);
  let entryCount = 0;

  for (const entryPath of entryPaths) {
    if (entryPath === inputPath || entryPath === archiveBaseName) {
      continue;
    }
    entryCount++;
    const safePath = validateExtractPath(resolvedOutputDir, entryPath);
    if (!safePath) {
      throw new Error(`Unsafe path detected in archive: ${entryPath} - possible path traversal attack`);
    }
  }

  if (entryCount > EXTRACTION_LIMITS.MAX_FILES) {
    throw new Error(`Archive contains too many files (limit: ${EXTRACTION_LIMITS.MAX_FILES})`);
  }

  return new Promise((resolve, reject) => {
    // Security: Set timeout for extraction process
    const timeoutId = setTimeout(() => {
      const proc = activeJobs.get(jobId);
      if (proc) {
        proc.kill('SIGTERM');
        activeJobs.delete(jobId);
        reject(new Error(`Extraction timeout exceeded (${EXTRACTION_LIMITS.TIMEOUT_MS / 60000} minutes)`));
      }
    }, EXTRACTION_LIMITS.TIMEOUT_MS);

    const proc = spawn('7z', ['x', '-y', `-o${resolvedOutputDir}`, inputPath]);
    activeJobs.set(jobId, proc);

    let lastProgress = 0;
    let fileCount = 0;

    proc.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      
      // Track file count from 7z output (lines like "- filename")
      const fileMatches = output.match(/^- .+$/gm);
      if (fileMatches) {
        fileCount += fileMatches.length;
        
        // Security: Check file count limit
        if (fileCount > EXTRACTION_LIMITS.MAX_FILES) {
          clearTimeout(timeoutId);
          proc.kill('SIGTERM');
          activeJobs.delete(jobId);
          reject(new Error(`Archive contains too many files (limit: ${EXTRACTION_LIMITS.MAX_FILES})`));
          return;
        }
      }
      
      // Parse current file from 7z output (lines like "- filename" or "Extracting  filename")
      const fileMatch = output.match(/(?:^-\s+|Extracting\s+)(.+?)(?:\r?\n|$)/m);
      const currentFile = fileMatch ? path.basename(fileMatch[1].trim()) : '';
      
      const match = output.match(/(\d+)%/);
      if (match) {
        const progress = parseInt(match[1]);
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress?.({
            jobId,
            progress,
            status: 'PROCESSING',
            currentFile,
          });

          // Fire and forget but log errors
          prisma.compressionJob.update({
            where: { id: jobId },
            data: { progress, ...(currentFile && { currentFile }) },
          }).catch((err) => console.error('Failed to update 7z extraction progress:', err));
        }
      }
    });

    proc.on('close', async (code) => {
      clearTimeout(timeoutId);
      activeJobs.delete(jobId);
      
      if (code === 0) {
        // Security: Post-extraction validation - check for path traversal in extracted files
        try {
          const validateExtractedFiles = async (dir: string): Promise<void> => {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.resolve(dir, entry.name);
              
              // Verify path is within output directory
              if (!fullPath.startsWith(resolvedOutputDir + path.sep) && fullPath !== resolvedOutputDir) {
                throw new Error(`Security violation: extracted file outside target directory: ${entry.name}`);
              }
              
              if (entry.isDirectory()) {
                await validateExtractedFiles(fullPath);
              }
            }
          };
          
          await validateExtractedFiles(resolvedOutputDir);
          resolve();
        } catch (error) {
          // Clean up on security violation
          await fs.promises.rm(resolvedOutputDir, { recursive: true, force: true }).catch(() => {});
          reject(error);
        }
      } else {
        reject(new Error(`7z exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      activeJobs.delete(jobId);
      reject(err);
    });
  });
};

export const cancelJob = (jobId: string): boolean => {
  const process = activeJobs.get(jobId);
  if (process) {
    process.kill('SIGTERM');
    activeJobs.delete(jobId);
    return true;
  }
  return false;
};

export const listZipContents = async (zipPath: string): Promise<{ name: string; size: number; isDirectory: boolean }[]> => {
  const entries: { name: string; size: number; isDirectory: boolean }[] = [];
  
  const directory = await unzipper.Open.file(zipPath);
  
  for (const file of directory.files) {
    entries.push({
      name: file.path,
      size: file.uncompressedSize,
      isDirectory: file.type === 'Directory',
    });
  }
  
  return entries;
};

export const getTempPath = (filename: string): string => {
  return getStoragePath('temp', filename);
};
