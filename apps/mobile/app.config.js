// Dynamic Expo config.
//
// Task 7 shipped the static app.json, which cannot read process.env. This file
// is evaluated by @expo/config at build time and receives app.json's contents
// as `config` (see @expo/config > Config.js: "If a function is exported from
// the app.config.js then a partial config will be passed as an argument").
// Spreading it is what keeps app.json load-bearing rather than dead — @expo/config
// warns about an unused static config when a dynamic one ignores it.
//
// Its only job is to lift the EXPO_PUBLIC_* variables into `extra`, where
// src/lib/config.ts reads them through Constants.expoConfig.
//
// Why `extra` and not `process.env.EXPO_PUBLIC_*` directly in config.ts:
// babel-preset-expo's inline-env-vars plugin only runs when Metro passes
// `inlineEnvironmentVariables` (production bundles), so a direct read behaves
// differently in a production bundle than under jest-expo. Reading the manifest
// is the same code path everywhere and mocks cleanly in tests.
//
// REQ-17 specified `APP_ENV` here. eas.json and .env.example — both merged in
// Task 7 (#10) and referenced by issue #95 — settled on EXPO_PUBLIC_APP_ENV.
// That name wins; a build profile sets exactly one variable for this.
//
// REQ-17 also defaulted it to 'development' here. It is passed through
// undefined instead: CLAUDE.md > Logging Strategy fixes the undefined case at
// the *quietest* level, and defaulting to 'development' at this layer would
// mean a build that simply forgot the variable ships with debug logging on.
// config.ts owns that fallback.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  },
});
