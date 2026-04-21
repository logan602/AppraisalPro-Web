import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Force Node.js to allow self-signed certificates for the underlying 'pg' driver
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const getDatabaseUrl = (): string => {
  const url = process.env.REAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    return "postgresql://placeholder:placeholder@localhost:5432/placeholder";
  }
  
  // Normalize and force no-verify for SSL
  let normalized = url.replace(/^postgres:\/\//, "postgresql://");
  if (normalized.includes("sslmode=require")) {
    normalized = normalized.replace("sslmode=require", "sslmode=no-verify");
  } else if (!normalized.includes("sslmode=")) {
    normalized += (normalized.includes("?") ? "&" : "?") + "sslmode=no-verify";
  }
  return normalized;
}

const prismaClientSingleton = () => {
  const pool = new pg.Pool({ 
    connectionString: getDatabaseUrl(),
    ssl: {
      rejectUnauthorized: false
    }
  })
  
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
