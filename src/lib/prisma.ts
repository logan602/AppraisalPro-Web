import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const prismaClientSingleton = () => {
  // Normalize the connection string: pg pool prefers postgresql://
  const rawUrl = process.env.DATABASE_URL || "";
  const normalizedUrl = rawUrl.replace(/^postgres:\/\//, "postgresql://");

  const pool = new pg.Pool({ 
    connectionString: normalizedUrl,
    ssl: {
      rejectUnauthorized: false // Required for DigitalOcean managed databases
    }
  })
  
  const adapter = new PrismaPg(pool)
  
  // By passing the adapter, we tell Prisma to use the 'pg' library 
  // instead of its native Rust engine for database queries.
  return new PrismaClient({ adapter })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
