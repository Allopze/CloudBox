import prisma from '../lib/prisma.js';

async function countUsers() {
    const count = await prisma.user.count();
    console.log('Total usuarios en la base de datos:', count);

    if (count > 0) {
        const users = await prisma.user.findMany({
            select: { email: true, name: true }
        });
        console.log('Usuarios:');
        users.forEach(u => console.log(`  - ${u.name} (${u.email})`));
    }

    await prisma.$disconnect();
}

countUsers();
