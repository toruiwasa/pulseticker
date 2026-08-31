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
// unstable_enablePackageExports defaults to enabled in this SDK (verified:
// getDefaultConfig(__dirname).resolver.unstable_enablePackageExports === true),
// and it is what resolves @pulseticker/schemas and @pulseticker/logging: both
// are ESM-only ("type": "module") and expose only "import"/"types" conditions.
//
// Both packages do also declare `main: "./dist/index.js"`, and Metro falls back
// to that legacy field when a specifier cannot be resolved through "exports" —
// breaking the exports map to point at a nonexistent file still bundles
// cleanly. So package exports are not load-bearing on their own here. (An
// earlier revision of this comment claimed the opposite, that there was no
// "main"-style fallback for Metro; that was wrong, and it was the stated
// justification for this config.)
//
// Node's CJS resolver behaves the other way round: once "exports" exists it is
// authoritative and `main` is ignored, so require.resolve() fails with
// ERR_PACKAGE_PATH_NOT_EXPORTED. That asymmetry — not the shape of the exports
// map alone — is why jest.config.js needs a moduleNameMapper and Metro does not.
//
// If pnpm's isolated node_modules ever breaks native module resolution, the
// documented escape hatch is `nodeLinker: hoisted` in pnpm-workspace.yaml —
// NOT reintroducing the manual resolver fields above. Expo has supported
// isolated dependencies since SDK 54.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
