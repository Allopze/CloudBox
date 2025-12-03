import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();

async function checkThumbnails() {
  const audioFiles = await prisma.file.findMany({
    where: { mimeType: { startsWith: 'audio/' } },
    select: { id: true, name: true, thumbnailPath: true, userId: true }
  });
  
  console.log('Sample thumbnailPath values:');
  audioFiles.slice(0, 3).forEach(f => {
    console.log(`  ${f.name}: ${f.thumbnailPath}`);
    console.log(`    exists: ${f.thumbnailPath ? fs.existsSync(f.thumbnailPath) : 'N/A'}`);
  });
  
  const withThumb = audioFiles.filter(f => f.thumbnailPath);
  const withoutThumb = audioFiles.filter(f => !f.thumbnailPath);
  
  console.log('\nTotal audio files:', audioFiles.length);
  console.log('With thumbnail in DB:', withThumb.length);
  console.log('Without thumbnail in DB:', withoutThumb.length);
  
  // Check if thumbnail files actually exist
  let existingCount = 0;
  let missingCount = 0;
  
  for (const file of withThumb) {
    if (fs.existsSync(file.thumbnailPath!)) {
      existingCount++;
    } else {
      missingCount++;
    }
  }
  
  console.log('\nThumbnail files that exist:', existingCount);
  console.log('Thumbnail files missing:', missingCount);
  
  await prisma.$disconnect();
}

checkThumbnails().catch(console.error);
