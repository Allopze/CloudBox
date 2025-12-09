import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';

async function createTestUser() {
    const hash = await bcrypt.hash('testpassword123', 12);
    const user = await prisma.user.upsert({
        where: { email: 'test@example.com' },
        update: {},
        create: {
            email: 'test@example.com',
            password: hash,
            name: 'Test User',
            role: 'USER',
            storageQuota: BigInt(5368709120),
        },
    });
    console.log('✅ Test user created:', user.email);
    await prisma.$disconnect();
}

createTestUser();
