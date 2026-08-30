# Mobile

React Native client for pulseticker, on Expo SDK 57 with Expo Router.

**Current state: scaffold.** `app/index.tsx` is a smoke screen that exists only to
prove Metro and Jest both resolve the workspace packages. The real route tree, auth
guard and screens land in Tasks 10–13 (#13, #14, #15, #16), which delete it.

## Prerequisites

The baseline is an **EAS Development Build** installed on a simulator, emulator or
device. Expo Go is not used — the app depends on native modules it cannot load.

## Setup

```bash
cp .env.example .env    # then fill in the values
```

`EXPO_PUBLIC_API_URL` must be reachable **from the device**, which is not the same
host as your laptop. `.env.example` documents the per-platform values; the short
version is that `localhost` works only on the iOS simulator.

Every `EXPO_PUBLIC_*` value is inlined into the bundle at build time and is therefore
public. Never put the Supabase `service_role` key here.

Cloud builds do **not** read `.env` — see [Known gaps](#known-gaps).

## Running

```bash
pnpm --filter @pulseticker/mobile start     # dev server against a dev client
pnpm --filter @pulseticker/mobile ios       # build + run on the iOS simulator (needs Xcode)
pnpm --filter @pulseticker/mobile android   # build + run on an Android emulator
```

## Checks

```bash
pnpm --filter @pulseticker/mobile test
pnpm --filter @pulseticker/mobile test:cov
pnpm --filter @pulseticker/mobile typecheck   # runs tsconfig.json AND tsconfig.spec.json
pnpm --filter @pulseticker/mobile lint
```

To exercise Metro's real module graph — the only check that does, and the one thing
CI does not yet cover (#96):

```bash
cd apps/mobile && npx expo export --platform ios --output-dir /tmp/expo-check
```

Always pass `--output-dir` outside the project: `apps/mobile/dist/` is **not**
gitignored, so the default output would show up as untracked files.

## Verifying the guarantees, not just the green tick

Three pieces of this config exist to catch specific mistakes. A passing suite does not
show they work — breaking them does. Each probe should fail; revert with
`git checkout --` afterwards.

| What it guards | Probe | Expected |
|---|---|---|
| Tests run against package **source**, not a stale `dist/` | delete `'access_token'` from `REDACTED_KEYS` in `packages/logging/src/index.ts` | `test` fails |
| Jest globals stay out of app source | append `expect(1).toBe(1);` to `app/index.tsx` | `typecheck` fails with `TS2304` |
| An empty test run is not silently green | `mv app/__tests__ /tmp/` | `test` exits non-zero |

Move the tests *out of the project* for the third probe. Renaming them in place
(`app/__tests__.off`) does not work: Jest's `**/?(*.)+(spec\|test).[jt]s?(x)` pattern
still matches `index.test.tsx` inside the renamed directory, so the suite runs and
passes — which looks like the probe failing when it is the probe that is wrong.

## How resolution works here

Metro and Jest resolve `@pulseticker/*` by different rules, and the difference is why
`jest.config.js` needs a `moduleNameMapper` while `metro.config.js` stays at Expo's
defaults:

- **Metro** — package exports are enabled, and Metro falls back to the packages'
  `main` field when exports resolution fails. Either path reaches `dist/`.
- **Jest** — runs CommonJS, where an `exports` map is authoritative and `main` is
  ignored, so a bare specifier fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The mapper
  points at each package's `src/index.ts` (not `dist/`, which nothing rebuilds before
  a test run) plus a `.js`-extension stripper for their NodeNext imports.

The full reasoning, including what was tried and rejected, is in
[`plans/DEBUG_mobile_scaffold_jest_metro_resolution.md`](../../plans/DEBUG_mobile_scaffold_jest_metro_resolution.md).

## Known gaps

| Gap | Issue |
|---|---|
| EAS cloud builds have no source for three `EXPO_PUBLIC_*` vars — the first cloud build ships `undefined` endpoints unless they are configured | #95 |
| Nothing automated bundles with Metro, so a resolution regression surfaces only on the next manual `expo start` or EAS build | #96 |
| `jest` 29 (here) and 30 (`apps/api`) share a hoisted store; config values resolved by name can bind to the wrong major | #97 |
| No `coverageThreshold` yet — the scaffold's only source files are the placeholders Task 10 deletes | #13 |
