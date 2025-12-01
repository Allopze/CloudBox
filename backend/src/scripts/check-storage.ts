import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('=== Verificación de Almacenamiento ===\n');

  // 1. Usuarios y su almacenamiento
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      storageUsed: true,
    }
  });
  
  console.log('USUARIOS:');
  if (users.length === 0) {
    console.log('  No hay usuarios en la base de datos\n');
  } else {
    users.forEach(u => {
      console.log(`  - ${u.name} (${u.email}): ${Number(u.storageUsed) / 1024 / 1024} MB usado`);
    });
    console.log();
  }

  // 2. Archivos en la BD
  const files = await prisma.file.findMany({
    select: {
      id: true,
      name: true,
      size: true,
      trashedAt: true,
    }
  });
  
  console.log('ARCHIVOS EN BD:');
  if (files.length === 0) {
    console.log('  No hay archivos en la base de datos\n');
  } else {
    files.forEach(f => {
      const status = f.trashedAt ? '(PAPELERA)' : '';
      console.log(`  - ${f.name}: ${Number(f.size) / 1024 / 1024} MB ${status}`);
    });
    console.log();
  }

  // 3. Archivos físicos
  const dataDir = path.resolve(__dirname, '../../../data');
  const filesDir = path.join(dataDir, 'files');
  
  console.log('ARCHIVOS FÍSICOS:');
  
  let totalPhysicalSize = 0;
  const physicalFiles: string[] = [];
  
  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else {
        totalPhysicalSize += stat.size;
        physicalFiles.push(fullPath);
      }
    }
  }
  
  scanDir(filesDir);
  
  console.log(`  Total archivos físicos: ${physicalFiles.length}`);
  console.log(`  Tamaño total: ${(totalPhysicalSize / 1024 / 1024).toFixed(2)} MB`);
  
  // 4. Detectar huérfanos
  const dbFileIds = new Set(files.map(f => f.id));
  const orphanFiles: string[] = [];
  
  for (const physicalFile of physicalFiles) {
    const fileName = path.basename(physicalFile);
    // El nombre del archivo físico es el ID (sin extensión) o ID.extension
    const fileId = fileName.split('.')[0];
    if (!dbFileIds.has(fileId)) {
      orphanFiles.push(physicalFile);
    }
  }
  
  console.log(`\nARCHIVOS HUÉRFANOS (en disco pero no en BD):`);
  if (orphanFiles.length === 0) {
    console.log('  Ninguno');
  } else {
    let orphanSize = 0;
    for (const orphan of orphanFiles) {
      const stat = fs.statSync(orphan);
      orphanSize += stat.size;
      console.log(`  - ${orphan} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
    }
    console.log(`  Total huérfanos: ${orphanFiles.length} archivos, ${(orphanSize / 1024 / 1024).toFixed(2)} MB`);
  }

  // 5. Thumbnails huérfanos
  const thumbnailsDir = path.join(dataDir, 'thumbnails');
  const thumbnailFiles: string[] = [];
  
  if (fs.existsSync(thumbnailsDir)) {
    const items = fs.readdirSync(thumbnailsDir);
    for (const item of items) {
      const fullPath = path.join(thumbnailsDir, item);
      if (fs.statSync(fullPath).isFile()) {
        thumbnailFiles.push(item);
      }
    }
  }
  
  const orphanThumbnails = thumbnailFiles.filter(t => {
    const id = t.replace('.webp', '');
    return !dbFileIds.has(id);
  });
  
  console.log(`\nTHUMBNAILS HUÉRFANOS:`);
  if (orphanThumbnails.length === 0) {
    console.log('  Ninguno');
  } else {
    console.log(`  ${orphanThumbnails.length} thumbnails sin archivo asociado`);
    orphanThumbnails.forEach(t => console.log(`  - ${t}`));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
