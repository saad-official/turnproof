import { defineConfig } from 'drizzle-kit';

// SQLite migrations for expo-sqlite. `driver: 'expo'` also emits `drizzle/migrations.js`, which
// bundles the .sql files (inlined by babel-plugin-inline-import) for the migrator at app start.
// Regenerate after editing src/data/schema.ts: `pnpm --filter mobile db:generate`.
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/data/schema.ts',
  out: './drizzle',
});
