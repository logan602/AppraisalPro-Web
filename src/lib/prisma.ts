import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const getDatabaseUrl = (): string => {
  const url = process.env.REAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    return "postgresql://placeholder:placeholder@localhost:5432/placeholder";
  }
  // Normalize DigitalOcean's postgres:// prefix to postgresql:// for Prisma
  return url.replace(/^postgres:\/\//, "postgresql://");
}

const prismaClientSingleton = () => {
  const pool = new pg.Pool({ 
    connectionString: getDatabaseUrl(),
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
