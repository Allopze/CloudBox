import prisma from './prisma.js';
import { config } from '../config/index.js';

export async function getGlobalUploadMaxFileSize(): Promise<number> {
  const settings = await prisma.settings.findMany({
    where: {
      key: { in: ['upload_max_file_size', 'max_file_size'] },
    },
    select: { value: true },
  });

  // Start with system default
  const defaultMax = config.storage.maxFileSize;

  // Check if admin has configured a higher limit
  for (const setting of settings) {
    const parsed = parseInt(setting.value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      // Use the admin-configured value (can be higher than default)
      return parsed;
    }
  }

  return defaultMax;
}
