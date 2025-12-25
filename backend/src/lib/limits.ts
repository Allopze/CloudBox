import prisma from './prisma.js';
import { config } from '../config/index.js';

export async function getGlobalUploadMaxFileSize(): Promise<number> {
  const settings = await prisma.settings.findMany({
    where: {
      key: { in: ['upload_max_file_size', 'max_file_size'] },
    },
    select: { value: true },
  });

  const candidates: number[] = [config.storage.maxFileSize];
  for (const setting of settings) {
    const parsed = parseInt(setting.value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      candidates.push(parsed);
    }
  }

  const filtered = candidates.filter((value) => Number.isFinite(value) && value > 0);
  if (filtered.length === 0) {
    return config.storage.maxFileSize;
  }

  return Math.min(...filtered);
}
