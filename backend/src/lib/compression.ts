import archiver from 'archiver';
import unzipper from 'unzipper';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getStoragePath } from './storage.js';
import prisma from './prisma.js';

const execAsync = promisify(exec);

// Use string type instead of Prisma enum for SQLite compatibility
type CompressionStatusType = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface CompressionProgress {
  jobId: string;
  progress: number;
  status: CompressionStatusType;
  error?: string;
}

type ProgressCallback = (progress: CompressionProgress) => void;

const activeJobs = new Map<string, ChildProcess>();

export const compressToZip = async (
  jobId: string,
  inputPaths: string[],
  outputPath: string,
  onProgress?: ProgressCallback
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    let totalSize = 0;
    let processedSize = 0;

    // Calculate total size
    inputPaths.forEach((p) => {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        // Recursively calculate directory size
        const getSize = (dir: string): number => {
          let size = 0;
          const files = fs.readdirSync(dir);
          files.forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              size += getSize(filePath);
            } else {
              size += stat.size;
            }
          });
          return size;
        };
        totalSize += getSize(p);
      } else {
        totalSize += stat.size;
      }
    });

    output.on('close', () => {
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.on('progress', (progress) => {
      processedSize = progress.fs.processedBytes;
      const percent = totalSize > 0 ? Math.round((processedSize / totalSize) * 100) : 0;
      
      onProgress?.({
        jobId,
        progress: percent,
        status: 'PROCESSING',
      });

      // Fire and forget but log errors
      prisma.compressionJob.update({
        where: { id: jobId },
        data: { progress: percent },
      }).catch((err) => console.error('Failed to update compression progress:', err));
    });

    archive.pipe(output);

    inputPaths.forEach((inputPath) => {
      const stat = fs.statSync(inputPath);
      const name = path.basename(inputPath);
      
      if (stat.isDirectory()) {
        archive.directory(inputPath, name);
      } else {
        archive.file(inputPath, { name });
      }
    });

    archive.finalize();
  });
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

  await fs.promises.mkdir(outputDir, { recursive: true });

  const stream = fs.createReadStream(inputPath)
    .pipe(unzipper.Extract({ path: outputDir }));

  stream.on('entry', (entry: { vars: { compressedSize: number }; autodrain: () => void }) => {
    processedSize += entry.vars.compressedSize;
    const percent = Math.round((processedSize / totalSize) * 100);
    
    onProgress?.({
      jobId,
      progress: percent,
      status: 'PROCESSING',
    });

    // Fire and forget but log errors
    prisma.compressionJob.update({
      where: { id: jobId },
      data: { progress: percent },
    }).catch((err) => console.error('Failed to update extraction progress:', err));

    entry.autodrain();
  });

  return new Promise((resolve, reject) => {
    stream.on('close', resolve);
    stream.on('error', reject);
  });
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

    process.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      const match = output.match(/(\d+)%/);
      if (match) {
        const progress = parseInt(match[1]);
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress?.({
            jobId,
            progress,
            status: 'PROCESSING',
          });

          // Fire and forget but log errors
          prisma.compressionJob.update({
            where: { id: jobId },
            data: { progress },
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
  return new Promise((resolve, reject) => {
    const process = spawn('7z', ['x', '-y', `-o${outputDir}`, inputPath]);
    activeJobs.set(jobId, process);

    let lastProgress = 0;

    process.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      const match = output.match(/(\d+)%/);
      if (match) {
        const progress = parseInt(match[1]);
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress?.({
            jobId,
            progress,
            status: 'PROCESSING',
          });

          // Fire and forget but log errors
          prisma.compressionJob.update({
            where: { id: jobId },
            data: { progress },
          }).catch((err) => console.error('Failed to update 7z extraction progress:', err));
        }
      }
    });

    process.on('close', (code) => {
      activeJobs.delete(jobId);
      if (code === 0) {
        resolve();
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
