import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Database connection pool configuration
// These can be tuned based on your server resources and expected load
const connectionPoolConfig = {
  // Maximum number of connections in the pool
  // For PostgreSQL: recommended 10-20 for most applications
  // Formula: ((core_count * 2) + effective_spindle_count)
  connectionLimit: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
  
  // Connection timeout in seconds
  connectionTimeout: parseInt(process.env.DATABASE_CONNECT_TIMEOUT || '10'),
};

// Build connection URL with pool parameters if using PostgreSQL
const getDatabaseUrl = (): string => {
  const baseUrl = process.env.DATABASE_URL || '';

  if (!baseUrl) {
    throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env and set DATABASE_URL.');
  }
  
  // If using SQLite (for development), return as-is
  if (baseUrl.startsWith('file:')) {
    return baseUrl;
  }
  
  // For PostgreSQL, append connection pool parameters
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid URL (e.g., postgresql://user:pass@host:5432/db).');
  }
  
  // Connection pool settings via query parameters
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', connectionPoolConfig.connectionLimit.toString());
  }
  if (!url.searchParams.has('connect_timeout')) {
    url.searchParams.set('connect_timeout', connectionPoolConfig.connectionTimeout.toString());
  }
  
  // Enable pgbouncer mode if using external connection pooler
  if (process.env.DATABASE_POOLER === 'pgbouncer') {
    url.searchParams.set('pgbouncer', 'true');
  }
  
  return url.toString();
};

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Graceful shutdown - close database connections
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

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
