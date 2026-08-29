// Metro config for apps/mobile inside the pnpm workspace.
//
// REQ-17 originally prescribed watchFolders + resolver.nodeModulesPaths +
// resolver.unstable_enableSymlinks to make Metro follow pnpm's symlinks. Those
// were SDK 52-era workarounds. Expo's monorepo guide now states that
// expo/metro-config configures workspaces itself, and that the following MUST
// be deleted when moving off pre-SDK 52 config:
//   watchFolders, resolver.nodeModulesPath, resolver.extraNodeModules,
//   resolver.disableHierarchicalLookup
// https://docs.expo.dev/guides/monorepos/
//
// unstable_enablePackageExports defaults to enabled in this SDK, which is what
// resolves @pulseticker/schemas and @pulseticker/logging: both are ESM-only
// ("type": "module") and expose only an "import"/"types" exports condition,
// with no "main"-style CommonJS fallback for Metro to fall back to.
//
// If pnpm's isolated node_modules ever breaks native module resolution, the
// documented escape hatch is `nodeLinker: hoisted` in pnpm-workspace.yaml —
// NOT reintroducing the manual resolver fields above. Expo has supported
// isolated dependencies since SDK 54.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
