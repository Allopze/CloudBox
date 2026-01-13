/**
 * Script para eliminar TODOS los usuarios y sus archivos de CloudBox
 * 
 * ⚠️ ADVERTENCIA: Esta operación es IRREVERSIBLE
 * 
 * Uso: npx tsx src/scripts/deleteAllUsers.ts
 * 
 * Para confirmar la eliminación, ejecutar con --confirm:
 * npx tsx src/scripts/deleteAllUsers.ts --confirm
 */

import prisma from '../lib/prisma.js';
import { deleteDirectory, getStoragePath, getAvatarPath, deleteFile } from '../lib/storage.js';
import readline from 'readline';

const CONFIRM_FLAG = '--confirm';

async function askForConfirmation(): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question('\n⚠️  ¿Estás SEGURO de que quieres eliminar TODOS los usuarios y sus archivos? (escribe "ELIMINAR" para confirmar): ', (answer) => {
            rl.close();
            resolve(answer.trim() === 'ELIMINAR');
        });
    });
}

async function deleteAllUsers() {
    console.log('\n========================================');
    console.log('🗑️  SCRIPT DE ELIMINACIÓN DE USUARIOS');
    console.log('========================================\n');

    const hasConfirmFlag = process.argv.includes(CONFIRM_FLAG);

    // Obtener todos los usuarios
    const users = await prisma.user.findMany({
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            _count: {
                select: {
                    files: true,
                    folders: true,
                },
            },
        },
    });

    if (users.length === 0) {
        console.log('✅ No hay usuarios en el sistema.');
        process.exit(0);
    }

    console.log(`📊 Se encontraron ${users.length} usuario(s):\n`);

    let totalFiles = 0;
    let totalFolders = 0;

    users.forEach((user: typeof users[number], index: number) => {
        console.log(`  ${index + 1}. ${user.name} (${user.email})`);
        console.log(`     - Rol: ${user.role}`);
        console.log(`     - Archivos: ${user._count.files}`);
        console.log(`     - Carpetas: ${user._count.folders}`);
        console.log('');
        totalFiles += user._count.files;
        totalFolders += user._count.folders;
    });

    console.log('----------------------------------------');
    console.log(`📁 Total de archivos a eliminar: ${totalFiles}`);
    console.log(`📂 Total de carpetas a eliminar: ${totalFolders}`);
    console.log('----------------------------------------\n');

    // Pedir confirmación
    if (!hasConfirmFlag) {
        const confirmed = await askForConfirmation();
        if (!confirmed) {
            console.log('\n❌ Operación cancelada por el usuario.');
            process.exit(0);
        }
    } else {
        console.log('⚡ Modo de confirmación automática activado (--confirm)\n');
    }

    console.log('\n🔄 Iniciando eliminación...\n');

    let deletedUsers = 0;
    let errors: string[] = [];

    for (const user of users) {
        try {
            console.log(`  Eliminando usuario: ${user.email}...`);

            // 1. Eliminar archivos físicos del usuario
            const userFilesDir = getStoragePath('files', user.id);
            try {
                await deleteDirectory(userFilesDir);
                console.log(`    ✓ Directorio de archivos eliminado`);
            } catch (err) {
                console.log(`    ⚠ No se encontró directorio de archivos (ya no existe)`);
            }

            // 2. Eliminar avatar
            const avatarPath = getAvatarPath(user.id);
            try {
                await deleteFile(avatarPath);
                console.log(`    ✓ Avatar eliminado`);
            } catch (err) {
                console.log(`    ⚠ No se encontró avatar (ya no existe)`);
            }

            // 3. Eliminar thumbnails del usuario
            const thumbnailsDir = getStoragePath('thumbnails', user.id);
            try {
                await deleteDirectory(thumbnailsDir);
                console.log(`    ✓ Thumbnails eliminados`);
            } catch (err) {
                console.log(`    ⚠ No se encontró directorio de thumbnails`);
            }


            // 4. Eliminar versiones de archivos
            const versionsDir = getStoragePath('versions', user.id);
            try {
                await deleteDirectory(versionsDir);
                console.log(`    ✓ Versiones de archivos eliminadas`);
            } catch (err) {
                console.log(`    ⚠ No se encontró directorio de versiones`);
            }

            // 5. Eliminar usuario de la base de datos (cascada elimina relaciones)
            await prisma.user.delete({ where: { id: user.id } });
            console.log(`    ✓ Registro de base de datos eliminado`);

            deletedUsers++;
            console.log(`  ✅ Usuario ${user.email} eliminado correctamente\n`);

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`${user.email}: ${errorMsg}`);
            console.log(`  ❌ Error al eliminar ${user.email}: ${errorMsg}\n`);
        }
    }

    console.log('\n========================================');
    console.log('📋 RESUMEN DE LA OPERACIÓN');
    console.log('========================================');
    console.log(`✅ Usuarios eliminados: ${deletedUsers}/${users.length}`);

    if (errors.length > 0) {
        console.log(`\n❌ Errores encontrados (${errors.length}):`);
        errors.forEach((err) => console.log(`   - ${err}`));
    }

    console.log('\n✨ Operación completada.');
}

// Ejecutar
deleteAllUsers()
    .catch((error) => {
        console.error('\n❌ Error fatal:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
