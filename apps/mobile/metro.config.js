// Metro config. Expo's default config already understands the pnpm monorepo (hoisted
// node_modules, watchFolders for packages/shared). We only add `.sql` so drizzle migrations
// (inlined by babel-plugin-inline-import, see babel.config.js) resolve as source files.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = [...config.resolver.sourceExts, 'sql'];

module.exports = config;
