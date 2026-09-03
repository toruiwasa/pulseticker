/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',

  // jest-resolve under jest 29 runs CommonJS, and these packages publish an
  // ESM-only exports map ("type": "module", only "import"/"types" conditions).
  // Under Node's CJS semantics an "exports" map is authoritative, so the
  // `main: "./dist/index.js"` both packages also declare is ignored rather than
  // used as a fallback: require.resolve('@pulseticker/schemas') fails with
  // ERR_PACKAGE_PATH_NOT_EXPORTED. Metro is laxer and does fall back to `main`,
  // which is why the app bundles fine and only Jest needs this mapper — see
  // metro.config.js.
  //
  // Map to TypeScript source, not dist/: turbo's `test` task declares no
  // dependsOn, so nothing rebuilds dist/ before a test run and mapping there
  // would silently validate whatever was last compiled. apps/api maps the same
  // packages to src/index.ts for the same reason. src/ lives outside
  // node_modules, so the default transformIgnorePatterns lets babel-preset-expo
  // strip the types.
  moduleNameMapper: {
    '^@pulseticker/([^/]+)$': '<rootDir>/../../packages/$1/src/index.ts',
    // Those sources are NodeNext ESM: relative imports carry a .js extension
    // that exists only in dist/. Strip it so they resolve against src/.
    // Same mapper, same position, as apps/api's jest config.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  collectCoverageFrom: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}', '!**/*.d.ts'],

  // __tests__/helpers holds shared fixtures, not suites. Jest's default
  // testMatch treats every .ts under __tests__ as a test file and would fail
  // them for containing no tests. Setting this key replaces the default list
  // rather than extending it, so node_modules has to be restated.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/helpers/'],

  // No coverageThreshold yet — deliberately, and this is not an oversight to
  // fill in with a copied block.
  //
  // The scaffold's only source files are the two Task 7 placeholders that Task
  // 10 (#13) deletes, and their uncovered branches are the unreachable "FAILED"
  // fallbacks of the smoke check itself. An earlier revision excluded both and
  // set a 90% `global` threshold; that gate was vacuous — it collected zero
  // files and `test:cov` still exited 0 on "All files 0/0/0/0", so it read as
  // enforcement while enforcing nothing. Reporting real numbers on the files
  // that exist is worth more than a bar nothing is measured against.
  //
  // CLAUDE.md > Testing sets a *per-changed-file* 90-95% target; a `global`
  // key cannot express that (a large well-covered file carries a small bad
  // one). The gate lands with the real route tree in Task 10 (#13), which
  // tracks it.
};
