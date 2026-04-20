import { defineConfig } from "prisma/config";

// Normalize DATABASE_URL: DigitalOcean sometimes returns postgres:// but
// Prisma 7's migrate tool requires postgresql://
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set");
  return url.replace(/^postgres:\/\//, "postgresql://");
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
