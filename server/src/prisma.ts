import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const createClient = () =>
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL ?? 'postgresql://cinema:cinema@localhost:5433/cinema',
      },
    },
  });

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
