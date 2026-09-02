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
pnpm --filter @pulseticker/mobile typecheck   # runs typegen, then tsconfig.json AND tsconfig.spec.json
pnpm --filter @pulseticker/mobile lint
```

Tests live in `apps/mobile/__tests__/`, **not** under `app/`. Expo Router turns every
file in the router directory into a route — its `require.context` regex excludes only
`+api` / `+html` / `+middleware`, and nothing filters test files — so a co-located
`app/**/__tests__/*.test.tsx` becomes a real route and ships
`@testing-library/react-native` inside the app bundle. This is a constraint on where
tests go, not a preference; keep it when adding screens.

### Generated type declarations

`typecheck` runs `typegen` first, and nothing here works without it (#105):

| File | Types | Derived from |
|---|---|---|
| `.expo/types/router.d.ts` | `Href` — every `<Link>`, `<Redirect>`, `router.push()` target | the `app/` route tree |
| `expo-env.d.ts` | `process.env.EXPO_PUBLIC_*` as `string \| undefined`, static-asset imports | fixed template |

Both are gitignored and neither is committed: `router.d.ts` is derived from `app/`, so a
committed copy would go stale on every route added. `typegen` regenerates them in ~2s
with **no bundler and no dev server** — `expo customize tsconfig.json` is the documented
entry point for that (see the comment in `@expo/cli`'s `type-generation/routes.js`).
`expo export` does *not* generate them, so this cannot ride on #96.

Run it standalone when your editor reports an unknown route right after you add one:

```bash
pnpm --filter @pulseticker/mobile typegen
```

`expo lint` does not need these files, which is why CI can run lint before typecheck.

Two things the script does deliberately:

- `EXPO_NO_TYPESCRIPT_SETUP=1` — without it, `expo customize` first runs a prerequisite
  that will `expo install` `typescript` / `@types/react` if it cannot resolve them,
  mutating `package.json` from inside a CI check. The type generation itself ignores the
  variable, so the gate is unaffected. The cost is that the script is POSIX-only.
- `tsconfig.json` and `.gitignore` are **not** rewritten — Expo only touches them when
  `extends` or the two generated-file `include` entries are missing, and ours has all
  three. Removing any of them re-arms that write, and it goes through
  `@expo/json-file`, which does not preserve the comments in `tsconfig.json`.

To exercise Metro's real module graph — the only check that does, and the one thing
CI does not yet cover (#96):

```bash
cd apps/mobile && npx expo export --platform ios --output-dir /tmp/expo-check
```

Always pass `--output-dir` outside the project: `apps/mobile/dist/` is **not**
gitignored, so the default output would show up as untracked files.

## Verifying the guarantees, not just the green tick

**Optional.** Nothing here is part of normal development or CI — the commands under
[Checks](#checks) are. These five probes exist because a passing suite cannot show
that a guard works; only breaking the guard can. Reach for them when changing
`jest.config.js` or the tsconfigs, or when you want to confirm the guards yourself
rather than take this file's word for it.

Each probe deliberately breaks something, runs one check that must **fail**, and puts
the file back. Run each block whole, from the repo root — the restore is separated by
`;` so it happens even when the check fails. They were verified in this form on
macOS (`sed -i ''` is BSD sed).

```bash
# 1. Tests run against package source, not a stale dist/.  Expect: FAIL
sed -i '' "s/'access_token',//" packages/logging/src/index.ts
pnpm --filter @pulseticker/mobile test ; git checkout -- packages/logging/src/index.ts

# 2. Jest globals stay out of app source.  Expect: FAIL with TS2304
echo 'expect(1).toBe(1);' >> apps/mobile/app/index.tsx
pnpm --filter @pulseticker/mobile typecheck ; git checkout -- apps/mobile/app/index.tsx

# 3. An empty test run is not silently green.  Expect: FAIL with "0 matches"
mv apps/mobile/__tests__ "$TMPDIR/"
pnpm --filter @pulseticker/mobile test ; mv "$TMPDIR/__tests__" apps/mobile/

# 4. Typed routes reject an href no route serves.  Expect: FAIL with TS2322
printf 'import { Redirect } from "expo-router";\nexport default function Probe() {\n  return <Redirect href="/no-such-route" />;\n}\n' > apps/mobile/app/__probe.tsx
pnpm --filter @pulseticker/mobile typecheck ; rm -f apps/mobile/app/__probe.tsx

# 5. A misspelled EXPO_PUBLIC_* is not a string.  Expect: FAIL with TS2322
printf 'export default function Probe() {\n  const url: string = process.env.EXPO_PUBLIC_TYPO;\n  return url;\n}\n' > apps/mobile/app/__probe.tsx
pnpm --filter @pulseticker/mobile typecheck ; rm -f apps/mobile/app/__probe.tsx
```

`git status` should be clean afterwards. Probe 3 must move the tests *out of the
project*: renaming them in place (`__tests__.off`) does not work, because Jest's
`**/?(*.)+(spec\|test).[jt]s?(x)` pattern still matches `index.test.tsx` inside the
renamed directory, so the suite runs and passes — which reads as the probe failing
when it is the probe that is wrong.

Probe 5 is the strongest statement available about `EXPO_PUBLIC_*`, and it is weaker
than it looks. `expo-env.d.ts` types `process.env` through an open index signature
(`[key: string]: string | undefined`), so a misspelled variable is caught only where the
value flows into something that requires a `string`. Merely *reading* an undeclared
`process.env.EXPO_PUBLIC_TYPO` is not an error and cannot be made one by generation
alone — it needs the real variable names declared, which lands with the code that reads
them (#12).

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
