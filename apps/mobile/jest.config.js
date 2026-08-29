/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',

  // Metro resolves @pulseticker/* via package exports; jest-resolve under
  // jest 29 runs CommonJS and these packages publish an ESM-only exports map
  // ("type": "module", only "import"/"types" conditions, no CJS fallback), so
  // the bare specifier fails to resolve here even though the app bundles fine.
  // Map both to their built ESM entry: it lives outside node_modules, so the
  // default transformIgnorePatterns lets babel-preset-expo down-level it.
  //
  // This requires packages/*/dist to exist. `pnpm install` builds it via each
  // package's `prepare` script, and turbo's `dependsOn: ["^build"]` covers CI
  // (wired up in Task 8 / #11).
  moduleNameMapper: {
    '^@pulseticker/([^/]+)$': '<rootDir>/../../packages/$1/dist/index.js',
  },

  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    // Scaffold placeholders (Task 7 / #10). Both exist only to prove the
    // bundler and the Jest resolver reach the workspace packages, and both are
    // deleted by Task 10 (#13) when the real route tree lands. Their remaining
    // uncovered lines are the unreachable "FAILED" fallbacks of the smoke
    // check itself, so holding them to the 90% bar would only buy contrived
    // tests. Delete these two lines along with the files.
    '!app/_layout.tsx',
    '!app/index.tsx',
  ],
  // Matches the 90-95% per-changed-file target in CLAUDE.md > Testing.
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
