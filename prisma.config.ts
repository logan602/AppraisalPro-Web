import { defineConfig } from "prisma/config";

// DATABASE_URL is only needed at runtime (prisma migrate deploy / npm start).
// During the build phase (prisma generate), no DB connection is made, so we
// fall back to a placeholder so the build doesn't fail.
function getDatabaseUrl(): string {
  const url = process.env.REAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    return "postgresql://placeholder:placeholder@localhost:5432/placeholder";
  }
  // Normalize DigitalOcean's postgres:// prefix to postgresql:// for Prisma
  // and force sslmode=no-verify to handle self-signed certificates
  let normalized = url.replace(/^postgres:\/\//, "postgresql://");
  if (normalized.includes("sslmode=require")) {
    normalized = normalized.replace("sslmode=require", "sslmode=no-verify");
  } else if (!normalized.includes("sslmode=")) {
    normalized += (normalized.includes("?") ? "&" : "?") + "sslmode=no-verify";
  }
  return normalized;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
