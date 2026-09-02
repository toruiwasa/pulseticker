# Issue 105 — make the mobile type gates real

Issue [#105](https://github.com/toruiwasa/pulseticker/issues/105) · Branch `fix/mobile-generated-types` · Depends on #11 (PR #104) for the `typecheck` task

Record of decisions agreed in conversation before implementation. Two of the Issue's
premises turned out to be wrong — see *Issue #105 corrections*.

---

## Purpose

`apps/mobile/app.json` sets `experiments.typedRoutes: true` and `tsconfig.json` includes
`.expo/types/**/*.ts` and `expo-env.d.ts`, but nothing ever generated those files. #11
added the `typecheck` gate that runs the compiler over mobile source; this task gives
that compiler the declarations the configuration already claims it has.

---

## What the source says

`startTypescriptTypeGenerationAsync` is the only thing that writes `.expo/types/router.d.ts`
and `expo-env.d.ts`. In `@expo/cli` 57.0.17 it has exactly two callers:

| Caller | Command |
|---|---|
| `start/server/DevServerManager.js` | `expo start` |
| `customize/typescript.js` | `expo customize tsconfig.json` |

`expo export` is not among them. The generation function is also written to work without
a bundler — `type-generation/routes.js` says so directly:

```js
/* Typed Routes can be run without Metro or a Server, e.g. `expo customize tsconfig.json` */
```

and skips the file watcher when `metro` and `server` are undefined, which is how
`customize/typescript.js` calls it (it constructs a `MetroBundlerDevServer` but never
starts it).

### Measured on this branch, SDK 57.0.15

| | Result |
|---|---|
| `expo customize tsconfig.json` | exit 0, ~2.2s, no bundler process |
| Files produced | `.expo/types/router.d.ts`, `expo-env.d.ts` |
| `git status` afterwards | clean |

Clean is not luck, and it is the thing that could have gone wrong. Two writers fire on
this path and both no-op only because of what the files already contain:

- `updateTSConfigAsync` writes `tsconfig.json` **only if `extends` is absent**. Ours sets
  `expo/tsconfig.base`.
- `forceUpdateTSConfig` writes it **only if `include` lacks `.expo/types/**/*.ts` or
  `expo-env.d.ts`**. Ours has both.
- `upsertGitIgnoreContents` appends `expo-env.d.ts` to `.gitignore` if missing. Ours has it.

Both writes go through `@expo/json-file`, which serialises with `JSON.stringify` and
**destroys the comments in `tsconfig.json`**. Deleting any of those three entries re-arms
that. This is recorded in `apps/mobile/README.md` so the next person to prune the tsconfig
knows what it is load-bearing for.

---

## Decisions

### 1. Generate; do not commit the files

`expo-env.d.ts` is a fixed three-line template with no project-specific content, so
committing it would be safe. `.expo/types/router.d.ts` is derived from the `app/` route
tree, so a committed copy goes stale on every route added — and the only way to stop that
is a CI step that regenerates and diffs, which is strictly more machinery than just
generating. Generating both keeps one mechanism instead of two.

**Rejected: commit both.** Trades a 2-second generation step for a staleness class that
only shows up as a *false pass* — the worst failure shape for a gate whose whole purpose
is that it not be vacuous.

### 2. Generation is the first step of `apps/mobile`'s `typecheck` script

```json
"typegen":   "EXPO_NO_TYPESCRIPT_SETUP=1 expo customize tsconfig.json",
"typecheck": "pnpm run typegen && tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.spec.json"
```

`turbo.json` and `.github/workflows/ci.yml` are unchanged.

**Why not a CI step.** #11 Decision 2 established that `pnpm typecheck` *is* the gate, so
"passes locally, passes in CI" holds without anyone remembering a filter. A generation
step that exists only in the workflow file breaks that invariant in the direction that
hurts: CI would check something the developer's machine never checks.

**Why a separate `typegen` script rather than one inlined command.** turbo caches
`typecheck`; on a cache hit nothing runs, so a developer who has never run it has no
`.expo/types` on disk and their editor reports unknown routes. `typegen` is the standalone
entry point for that case. The cache itself is correct either way — the generated files are
gitignored and therefore not task inputs, but every input that can change the route tree
(`app/**`) is tracked, so adding a route always misses the cache.

**`EXPO_NO_TYPESCRIPT_SETUP=1`.** `customize/typescript.js` runs
`TypeScriptProjectPrerequisite.bootstrapAsync()` before generating, which calls
`ensureDependenciesAsync({ skipPrompt: true, isProjectMutable: true })` — if `typescript`
or `@types/react` cannot be resolved it runs `expo install`, i.e. network access and a
`package.json` write from inside a CI check. The env var makes `bootstrapAsync` return
early; `startTypescriptTypeGenerationAsync` does not read the variable, so generation still
happens. Verified: with the variable set, both files are still produced.

The cost is that the script is POSIX-only. Accepted — development is macOS and CI is
`ubuntu-latest`, and adding `cross-env` to buy Windows support for a platform nobody uses
is a dependency this repo does not need.

### 3. Tests move out of `app/`

`app/__tests__/index.test.tsx` → `apps/mobile/__tests__/index.test.tsx`.

The generated `router.d.ts` listed `/__tests__/index.test` as a route. That is not a typed-
routes artefact — it reflects what Expo Router actually does. `expo-router/_ctx.ios.js`
builds its `require.context` with

```
/^(?:\.\/)(?!(?:(?:(?:.*\+api)|(?:\+html)|(?:\+middleware)))\.[tj]sx?$).*(?:\.android|\.web)?\.[tj]sx?$/
```

and `getRoutesCore.js` seeds its ignore list with `+html`, `+native-intent`, `+api` and
`+middleware`. Nothing excludes tests. So the file was a real route in the shipped app and
dragged `@testing-library/react-native` into the production bundle.

This is a live defect from the #94 scaffold, not a cosmetic one, and it was invisible until
typed routes started being generated. Fixing it here rather than filing it keeps the
artefact this task commits to — a trustworthy route type — from starting out polluted, and
stops #13 inheriting the layout when it lands the real route tree.

No tsconfig change was needed: `tsconfig.json` excludes `**/__tests__/**` and
`tsconfig.spec.json` includes it, and both patterns match at the project root as well.
`collectCoverageFrom: ['app/**/*.{ts,tsx}']` also stops counting the test file itself as a
source file, which it had been doing.

**Rejected: file it as its own issue.** The exposure — test code in a production bundle —
is live now, and the fix is three lines plus an import path. Deferring it would leave #13
to trip over it.

### 4. Declaring the real `EXPO_PUBLIC_*` names is #12's job, not this task's

There is no `EXPO_PUBLIC_*` read anywhere in `apps/mobile` today. The declaration file that
would name them belongs with the code that introduces them — `#12` lands
`EXPO_PUBLIC_SUPABASE_URL`. Writing it now would mean guessing the names.

---

## Issue #105 corrections

1. **"it may ride on the `expo export` step #96 proposes" — no.** `expo export` never calls
   `startTypeScriptServices`. #105 and #96 are independent; the sequencing concern in the
   Issue's *Dependency* field does not exist.
2. **"referencing an undeclared `process.env.EXPO_PUBLIC_TYPO` makes typecheck exit
   non-zero" is not achievable, and the Done-when is corrected.** `expo-env.d.ts` pulls in
   `expo/types/metro-require.d.ts`, whose `ProcessEnv` is

   ```ts
   interface ProcessEnv { NODE_ENV: 'development' | 'production' | 'test'; [key: string]: string | undefined; }
   ```

   An open index signature: any name reads, and reads as `string | undefined`. Measured:

   | | type of `process.env.EXPO_PUBLIC_TYPO` | `const s: string = <that>` |
   |---|---|---|
   | without `expo-env.d.ts` | `any` | exit 0 — silent |
   | with `expo-env.d.ts` | `string \| undefined` | **exit 2**, `TS2322` |

   So the achievable gate is "a misspelled variable is not a `string`", which catches it at
   every point of use under `strict`, but not on a bare reference. Closing the remaining gap
   needs the real names declared (#12), and even then the index signature keeps unknown
   names legal — it can only ever be `string | undefined` versus `string`.

   **Done when**, corrected: `pnpm typecheck` exits non-zero for `<Redirect href="/does-not-exist" />`,
   and `process.env` is typed `string | undefined` rather than `any` so an undeclared name
   fails wherever a `string` is required.

---

## Verified non-vacuous

Each probe was run from a clean state — `rm -rf .expo/types expo-env.d.ts` first — so it
also proves generation happens inside the same `typecheck` invocation rather than relying
on files left behind by an earlier run.

| Probe | Result |
|---|---|
| `<Redirect href="/this-route-does-not-exist" />` | `pnpm typecheck` → **exit 2**, `TS2322` |
| `const url: string = process.env.EXPO_PUBLIC_TYPO` | `pnpm typecheck` → **exit 2**, `TS2322` |
| Route added in the same run (`app/__probe.tsx`) | appears in the accepted `href` union — generation is not stale |
| `pnpm --filter @pulseticker/mobile lint` with no generated files present | exit 0, generates nothing — so CI's lint-before-typecheck order is safe |
| Full `pnpm lint` / `pnpm typecheck` / `pnpm test` | 0 / 0 / 0 |

Probe files were deleted after measurement; probes 4 and 5 are now permanent, in
`apps/mobile/README.md` under *Verifying the guarantees*, in the exact form they were run.

---

## Files changed

| File | Change |
|---|---|
| `apps/mobile/package.json` | `typegen` script; `typecheck` runs it first |
| `apps/mobile/app/__tests__/` → `apps/mobile/__tests__/` | moved out of the router directory; import path and a comment explaining why |
| `apps/mobile/README.md` | generated-declarations section; tests-outside-`app/` rule; probe 3 path; probes 4 and 5 |
| `plans/REQ-17_Task8_CI_Mobile.md` | dated correction — the `expo export` hypothesis in *Spun out* is disproven |
