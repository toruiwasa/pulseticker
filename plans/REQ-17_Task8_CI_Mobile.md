# REQ-17 Task 8 — turbo mobile tasks + CI static-analysis job

Issue [#11](https://github.com/toruiwasa/pulseticker/issues/11) · Branch `feat/ci-mobile-pipeline` · Depends on Task 7 (`apps/mobile` scaffold, merged as PR #94)

Record of decisions agreed in conversation before implementation. The scope differs
from the Issue body in three places — see *Issue #11 corrections*.

---

## Purpose

`apps/mobile` merged in PR #94 with no CI gate of its own. This task establishes one.

The shape of that gate turned out to be different from what the Issue assumed, because
measuring the current pipeline first showed half of the Issue's scope was already
satisfied and the half it did not mention was the one that mattered.

---

## What measurement showed

### 1. Mobile tests were already running in CI

`turbo test` enumerates every workspace package that declares a `test` script. `apps/mobile`
declares `"test": "jest"`, so it entered the pipeline automatically the moment PR #94 merged
— nobody wired it. From CI run
[33370966784](https://github.com/toruiwasa/pulseticker/actions/runs/33370966784) on `main`:

```
##[group]@pulseticker/mobile:test
    ✓ resolves @pulseticker/schemas (550 ms)
    ✓ resolves @pulseticker/logging and sanitize() redacts access_token
Test Suites: 1 passed, 1 total
```

The Issue's first scope bullet — run `pnpm --filter @pulseticker/mobile test` in CI — was
therefore already done.

### 2. Two gaps were real, and the Issue named only one of them

| Gap | State before this task |
|---|---|
| **lint** | No `lint` task in `turbo.json`, no `lint` script at the root. CI called `pnpm --filter api lint` directly, so `expo lint` had never run once. |
| **typecheck** | `apps/api` is type-checked by `nest build` and `apps/web` by `ng build`, both inside the CI `Build` step. **`apps/mobile` has no `build` script at all**, and `jest-expo` strips types through babel without checking them. No compiler had ever seen mobile's source in CI. |

The second is the more serious of the two and appears nowhere in the Issue. It widens with
every task from #12 onward.

Both commands pass on `main` as-is (`expo lint` → exit 0, `tsc --noEmit` on both tsconfigs →
exit 0), so adopting them required no cleanup of existing violations.

### 3. Step timings, used to size the CI change

From the same run:

| Step | Duration |
|---|---:|
| checkout | 1s |
| `pnpm/setup@v2` | 11s |
| `pnpm install --frozen-lockfile` | 13s |
| Build | 16s |
| Test | 22s |
| Lint (api only) | 6s |
| **total** | **~72s** |

Duplicating the setup in a second job costs **25s**. The repository is **public**, so Actions
minutes are free and that 25s is a wall-clock question only.

---

## Decisions

### 1. Two new turbo tasks, both `dependsOn: ["^build"]`

```json
"lint":      { "dependsOn": ["^build"] },
"typecheck": { "dependsOn": ["^build"] }
```

**Why `^build`, on both.** `apps/api/eslint.config.mjs` uses `projectService: true` with
`tseslint.configs.recommendedTypeChecked` — type-aware linting, which cannot resolve
`@pulseticker/*` without `packages/*/dist/*.d.ts`. `apps/mobile`'s tsconfig resolves the same
packages through their `exports.types` condition, which points at `dist/index.d.ts`. Neither
works against a fresh checkout. This is the same ordering the CI file already relied on
implicitly by placing `Lint` after `Build`; declaring it in `turbo.json` makes it survive the
job split.

**Caching left at the default (`true`).** Neither task writes `outputs`, so turbo caches the
exit status and logs, keyed on the package's git-tracked files — which includes
`eslint.config.js` and `tsconfig.json`, so a config edit invalidates correctly. `test` keeps
its existing `cache: false`; this task does not revisit it.

`typecheck` is implemented only by `apps/mobile` today. turbo skips packages that do not
declare the script, so api and web are unaffected.

### 2. The split axis is static analysis vs. build+test — not mobile vs. everything else

The Issue asks for a `mobile` job. The job added is `lint-typecheck`, and `apps/api`'s lint
moves into it.

**Why.** `lint` and `typecheck` are repo-wide turbo tasks that any package may implement, so
the root scripts `pnpm lint` / `pnpm typecheck` map 1:1 onto one job — "if it passes locally
it passes in CI" stays true without a filter to remember. A `mobile`-shaped job instead
leaves lint split across two jobs, forces the question again when `apps/web` gains an eslint
config (it has none today), and collides with the bundle-integrity job #96 proposes, which is
also mobile-shaped but belongs on a third axis.

**Cost.** The new job re-pays `^build` for the four `packages/*` (plain `tsc`, ~5s, cached
within the job across the two steps).

**Rejected: keep everything in `build-test` and just add steps.** This was the initial
recommendation in conversation and it was wrong — it counted the 25s of duplicated setup but
not the parallelism. Sequential, lint+typecheck adds ~30s to a 72s job. Split, the ~55s job
runs alongside the ~63s job and total wall-clock *falls* to ~63s, because `Lint` also leaves
the critical path. On a public repo the duplicated runner minutes cost nothing, and a failing
`expo lint` now reads as its own red check instead of being buried under a build.

**Rejected: separate `lint` and `typecheck` jobs.** Each would pay 25s of setup to run 6–25s
of work.

#### Correction (2026-09-02) — the predicted wall-clock win is inside runner noise

The first CI run on this branch,
[33591378507](https://github.com/toruiwasa/pulseticker/actions/runs/33591378507), measured
**80s** total against the 72s baseline — the opposite direction from the ~63s predicted above.
Both jobs did start within 1s of each other and the whole of `lint + typecheck` (51s) overlapped
`build + test` (80s), so the structural claim holds. What the estimate missed is variance in the
steps the change does not touch:

| Step | baseline (33370966784) | this branch (33591378507) |
|---|---:|---:|
| Set up job | 0s | 2s |
| checkout | 1s | 1s |
| `pnpm/setup@v2` | 11s | 15s |
| install | 13s | 15s |
| Build | 16s | 17s |
| Test | 22s | 23s |
| Lint | 6s | *(moved out)* |
| **build-test total** | **72s** | **77s** |

Setup and install alone ran 6s slower, which swamps the 6s that `Lint` vacated. Holding the
runner constant the arithmetic still works out to ~66s, but **that number has not been observed
and should not be quoted as a result.** The honest statement is: the split does not cost
wall-clock, and it buys an independent red check for static analysis. The speedup was the weaker
half of the argument for it and is withdrawn.

### 3. The new job carries no `env:` block

`build-test` needs `APP_ENV` / `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `API_URL` /
`WS_URL` solely because `ng build` invokes `apps/web/scripts/set-env.ts`, which throws when
any is missing. Nothing in `lint-typecheck` runs `ng build`: turbo's `^build` resolves to the
*dependencies* of api and mobile, which are the four `packages/*`, and those build with plain
`tsc` and read no environment. Adding placeholder values there would imply a dependency that
does not exist.

### 4. Both jobs run in parallel — no `needs:`

Omitted deliberately. The workflow-level `concurrency` group is unchanged and covers both
jobs, so a superseded PR run still cancels as a unit.

---

## Verified non-vacuous

PR #94 shipped a `coverageThreshold` that collected zero files and passed on
`All files 0/0/0/0` — enforcement in appearance only. Both gates added here were therefore
proven to fail before being committed:

| Probe | Result |
|---|---|
| `const n: number = 'not a number'` in `app/__probe.tsx` | `pnpm typecheck` → **exit 2**, `error TS2322` |
| `useState` called inside an `if` in `app/__probe.tsx` | `pnpm lint` → **exit 1**, `react-hooks/rules-of-hooks` |

Both probe files were deleted after measurement.

---

## Issue #11 corrections

1. **"CI runs `pnpm --filter @pulseticker/mobile test`" was already true** before this task,
   via turbo's package discovery. No change was needed and none was made.
2. **A `typecheck` task was added, which the Issue does not mention.** It is the only gate
   that puts a compiler in front of mobile source in CI.
3. **The job is `lint-typecheck`, not `mobile`.** Argued in Decision 2.

### Dropped from scope, with reasons

- **`test:cov` turbo task.** CI collects coverage for no package today, and the root already
  exposes `test:cov:api` / `test:cov:web` as pnpm filters. A `turbo test:cov` task would have
  no caller — dead config. The mobile coverage threshold is separately assigned to #13, whose
  comment specifies a per-path (not `global`) key so it cannot go vacuous.
- **A `build` task for `@pulseticker/mobile`.** There is no `build` script to run: a real
  mobile build is `expo export` or EAS, which are #96 and #95. `typecheck` covers the
  "a compiler reads this code" role that `build` plays for api and web.

---

## Spun out

`apps/mobile/app.json` sets `experiments.typedRoutes: true`, but the generated
`.expo/types/router.d.ts` is gitignored and exists neither locally nor in CI. Probed on this
branch:

```tsx
<Redirect href="/this-route-does-not-exist" />   →  tsc --noEmit  exit 0
```

Typed routes are inert. Nothing is broken today because no code takes an `Href`, but #13
lands the real route tree and would inherit a safety net that looks present and is not. The
same applies to the gitignored `expo-env.d.ts`, which is where `process.env.EXPO_PUBLIC_*`
and static-asset imports get their types — that one bites #12, which reads those variables.

Not fixed here: the fix needs the correct type-generation mechanism to be established, and it
may ride on the `expo export` step #96 proposes. Filed as its own Issue.

#### Correction (2026-09-02) — `expo export` does not generate these files

Written while implementing #105. The `expo export` hypothesis above was a guess and is wrong.
`startTypeScriptServices` — the only entry point that writes `.expo/types/router.d.ts` and
`expo-env.d.ts` — has exactly two callers in `@expo/cli` 57.0.17: `DevServerManager`
(`expo start`) and `customize/typescript.js` (`expo customize tsconfig.json`). The export
command is not one of them, so #105 is independent of #96 rather than sequenced behind it.
Resolved in `plans/ISSUE-105_Mobile_Generated_Types.md`.

---

## Files changed

| File | Change |
|---|---|
| `turbo.json` | `lint` and `typecheck` tasks, both `dependsOn: ["^build"]` |
| `package.json` | root `lint` / `typecheck` scripts delegating to turbo |
| `.github/workflows/ci.yml` | `Lint` step removed from `build-test`; parallel `lint-typecheck` job added |
