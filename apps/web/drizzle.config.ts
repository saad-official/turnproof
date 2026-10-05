import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: use the process environment
}

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["turnproof"],
  migrations: { schema: "turnproof", table: "__drizzle_migrations" },
  strict: true,
  verbose: true,
  ...(databaseUrl
    ? { dbCredentials: { url: databaseUrl } }
    : { driver: "pglite" as const, dbCredentials: { url: "./.pglite" } }),
});
