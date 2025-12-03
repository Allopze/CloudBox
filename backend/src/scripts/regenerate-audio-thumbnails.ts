import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateAudioCover } from '../lib/thumbnail.js';
import { getUserFilePath, getThumbnailPath, fileExists } from '../lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('=== Regenerando thumbnails de audio faltantes ===\n');

  // Get all audio files
  const audioFiles = await prisma.file.findMany({
    where: {
      mimeType: {
        startsWith: 'audio/'
      },
      trashedAt: null
    },
    select: {
      id: true,
      name: true,
      mimeType: true,
      thumbnailPath: true,
      userId: true,
      path: true,
    }
  });

  console.log(`Total de archivos de audio: ${audioFiles.length}\n`);

  let processed = 0;
  let generated = 0;
  let alreadyHave = 0;
  let failed = 0;
  let noMetadata = 0;

  for (const file of audioFiles) {
    processed++;
    
    // Check if thumbnail already exists
    const thumbnailPath = getThumbnailPath(file.id);
    const exists = await fileExists(thumbnailPath);
    
    if (exists && file.thumbnailPath) {
      alreadyHave++;
      continue;
    }
    
    console.log(`[${processed}/${audioFiles.length}] Procesando: ${file.name}`);
    
    try {
      // Get file extension from name
      const ext = path.extname(file.name) || '';
      const filePath = getUserFilePath(file.userId, file.id, ext);
      
      // Check if source file exists
      if (!await fileExists(filePath)) {
        console.log(`  ⚠ Archivo no encontrado: ${filePath}`);
        failed++;
        continue;
      }
      
      // Try to generate thumbnail
      const result = await generateAudioCover(filePath, file.id);
      
      if (result) {
        // Update database
        await prisma.file.update({
          where: { id: file.id },
          data: { thumbnailPath: result }
        });
        console.log(`  ✓ Thumbnail generado`);
        generated++;
      } else {
        console.log(`  ○ Sin cover art en metadata`);
        noMetadata++;
      }
    } catch (error) {
      console.error(`  ✗ Error: ${error}`);
      failed++;
    }
  }

  console.log('\n=== Resumen ===');
  console.log(`Total procesados: ${processed}`);
  console.log(`Ya tenían thumbnail: ${alreadyHave}`);
  console.log(`Thumbnails generados: ${generated}`);
  console.log(`Sin cover art: ${noMetadata}`);
  console.log(`Fallidos: ${failed}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
