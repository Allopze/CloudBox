import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const updateParentFolderSizes = async (
  folderId: string | null,
  size: number | bigint,
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  operation: 'increment' | 'decrement'
): Promise<void> => {
  if (!folderId) return;

  let currentId: string | null = folderId;
  const sizeBigInt = BigInt(size);
  const data = operation === 'increment' ? { increment: sizeBigInt } : { decrement: sizeBigInt };

  while (currentId) {
    await tx.folder.update({
      where: { id: currentId },
      data: { size: data },
    });

    const parentFolder: { parentId: string | null } | null = await tx.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });

    currentId = parentFolder?.parentId || null;
  }
};

export default prisma;
