import { PrismaClient } from '@prisma/client'
import path from 'path'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// The Prisma CLI resolves relative sqlite paths against the schema directory,
// but a runtime datasource override resolves against the working directory.
// Pin the runtime to an absolute path so both always hit prisma/portfolio.db.
const dbUrl = process.env.DATABASE_URL?.startsWith('file:/')
  ? process.env.DATABASE_URL
  : `file:${path.join(process.cwd(), 'prisma', 'portfolio.db')}`

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
