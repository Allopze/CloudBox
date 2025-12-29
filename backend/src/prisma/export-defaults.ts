/**
 * Export Default Branding & Icons Script
 * 
 * Exports current branding settings and custom file icons from the database
 * to be included in the seed for new deployments.
 * 
 * Usage: npx tsx src/prisma/export-defaults.ts
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Setting {
    key: string;
    value: string;
}

async function main() {
    console.log('📦 Exporting default branding and icons...\n');

    // Export branding settings
    const brandingSettings = await prisma.settings.findMany({
        where: {
            key: {
                in: [
                    'site_name',
                    'branding_primary_color',
                    'branding_custom_css',
                ],
            },
        },
    });

    console.log('🎨 Branding settings:');
    brandingSettings.forEach((s: Setting) => console.log(`   ${s.key}: ${s.value.substring(0, 50)}${s.value.length > 50 ? '...' : ''}`));

    // Export file icons
    const fileIcons = await prisma.settings.findMany({
        where: {
            key: {
                startsWith: 'file_icon_',
            },
        },
    });

    console.log(`\n🎯 File icons found: ${fileIcons.length}`);
    fileIcons.forEach((icon: Setting) => {
        const category = icon.key.replace('file_icon_', '');
        console.log(`   ${category}: ${icon.value.length} bytes`);
    });

    // Create defaults object
    const defaults = {
        branding: brandingSettings.map((s: Setting) => ({ key: s.key, value: s.value })),
        fileIcons: fileIcons.map((icon: Setting) => ({
            key: icon.key,
            value: icon.value,
        })),
        exportedAt: new Date().toISOString(),
    };

    // Write to file
    const outputPath = join(__dirname, 'defaults.json');
    writeFileSync(outputPath, JSON.stringify(defaults, null, 2));
    console.log(`\n✅ Exported to: ${outputPath}`);
}

main()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
