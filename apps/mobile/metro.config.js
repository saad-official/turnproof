// Metro config. Expo's default config already understands the pnpm monorepo (hoisted
// node_modules, watchFolders for packages/shared). We only add `.sql` so drizzle migrations
// (inlined by babel-plugin-inline-import, see babel.config.js) resolve as source files.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = [...config.resolver.sourceExts, 'sql'];

// Metro's transform cache is shared across projects and keyed by the project-relative path, so
// sibling apps with byte-identical files (drizzle/migrations.js + inline-imported .sql) would reuse
// each other's output. A per-app cache version keeps the caches apart.
config.cacheVersion = 'turnproof-v1';

module.exports = config;
