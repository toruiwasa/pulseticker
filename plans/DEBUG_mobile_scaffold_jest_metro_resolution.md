# DEBUG — Task 7 (#10) `apps/mobile` scaffold: five resolution failures

**Date**: 2026-08-29
**Branch**: `feat/mobile-scaffold`
**Context**: REQ-17 Task 7. Scaffold `apps/mobile` on Expo SDK 57 (amended up from
the plan's SDK 53 — see the dated correction in `REQ-17_Mobile_App_MVP.md`) and prove
Metro resolves `@pulseticker/schemas`.

The scaffold itself is small. What cost the session was five separate resolution
failures, four of them caused by *two things disagreeing about which version they were
talking to*. The last one broke a package this task never touched.

---

## 1. Metro: `Cannot find module '.../react-native/rn-get-polyfills'`

**Symptom**: `expo export` bundled 1187 modules, then died resolving
`rn-get-polyfills` from inside `@expo/metro-config@57.0.9`.

**Hypotheses tested**

| # | Hypothesis | Verdict |
|---|---|---|
| 1 | `minimumReleaseAge` forced an `@expo/metro-config` older than SDK 57 needs | **Rejected** — `expo@57.0.15` declares `~57.0.9`; 57.0.9 is the intended version, not a downgrade |
| 2 | pnpm symlinks hid the file | **Rejected** — the error path was already fully resolved into the store; the file genuinely does not exist |
| 3 | `react-native` was the wrong major | **Confirmed** |

**Root cause — my error, not a library bug.** I took `react-native@0.87.0` from a pnpm
store *directory name* observed during a bootstrap install, where React Native was an
unresolved peer. SDK 57 pins **0.86.2**. RN 0.87 removed `rn-get-polyfills` (polyfills
moved to `@react-native/js-polyfills`), which `@expo/metro-config@57.0.9` still calls.

**Rule**: the authoritative SDK version map is
`node_modules/expo/bundledNativeModules.json`. Never infer a version from a store path,
a peer range, or a lockfile hash segment.

```bash
node -p "require('expo/bundledNativeModules.json')['react-native']"
```

---

## 2. `ERR_PNPM_NO_MATURE_MATCHING_VERSION` on five packages

**Symptom**: install refused `eslint@10.9.1`, `eslint-config-expo@57.0.2`,
`jest-expo@57.0.5`, `@react-native/jest-preset@0.86.3`, `@react-native/js-polyfills@0.86.3`.

**Root cause**: `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (7 days). The
error fires only when a range has **no** mature match — not merely when its newest
member is too young. Every failure above was a range like `^57.0.5` whose only member
was published inside the window.

**Fix**: widen each range downward to include a mature version (`^57.0.4`, `^57.0.1`,
`^10.9.0`). `minimumReleaseAge` was not touched, per CLAUDE.md.

**Rule**: this constraint sets the dependency floor for any *new* package added to this
repo. Check publish dates before writing pins:

```bash
pnpm view <pkg> time --json | grep '"<version>"'
```

---

## 3. Jest: `this._moduleMocker.clearMocksOnScope is not a function`

**Symptom**: every mobile suite failed to run, thrown from `jest-runtime@30.4.2`.

**Root cause**: I had written `jest@^30`, but `jest-expo@57.0.4` is built against
Jest 29 — its dependencies are `@jest/globals@^29.2.1`, `babel-jest@^29.2.1`,
`jest-environment-jsdom@^29.2.1`. A Jest 30 runtime received a Jest 29 environment,
whose `ModuleMocker` predates `clearMocksOnScope`.

**Fix**: `apps/mobile` pins `jest@^29.7.0` and `@types/jest@^29.5.14`.
`apps/api` stays on Jest 30 — see failure 5 for what that costs.

---

## 4. `@testing-library/react-native` v14: `render()` is async

**Symptom**: first `screen.getByTestId` threw `notImplemented`; after switching to the
return value, `getByTestId is not a function`.

**Hypotheses tested**

| # | Hypothesis | Verdict |
|---|---|---|
| 1 | Missing `extend-expect` setup file | **Rejected** — v12.4+ auto-registers matchers; the subpath no longer exists |
| 2 | Duplicate RNTL copies under pnpm | **Rejected** — only one in the store |
| 3 | The API changed | **Confirmed** |

**Root cause**: read from `dist/render.d.ts` in the installed package —
`export declare function render<T>(...): Promise<{...}>`. RNTL v14 made `render()`
**async**. Destructuring it without `await` yields `undefined` for every query, and the
module-level `screen` stays unpopulated.

**Rule for later mobile tasks**: always `await render(...)`.

---

## 5. Adding Jest 29 to the workspace broke all 28 `apps/api` suites

The one that mattered. `apps/api` was never edited by this task, yet
`pnpm test` went from green to `28 failed, 28 total` with the same
`clearMocksOnScope` error as failure 3.

**Baseline confirmed before theorising** — moved `apps/mobile` aside, restored the
lockfile, reinstalled, ran `pnpm --filter api test`: **28 suites / 214 tests passed**.
So the regression was mine, not pre-existing.

**Hypotheses tested**

| # | Hypothesis | Verdict |
|---|---|---|
| 1 | `jest-runtime@30.4.2` got a Jest 29 `jest-mock` | **Rejected** — it links to `jest-mock@30.4.1` |
| 2 | `jest-config@30` resolves a v29 environment | **Rejected** — it links to `jest-environment-node@30.4.1` |
| 3 | `apps/api/node_modules` had a stale copy | **Rejected** — it contains only `jest` and `ts-jest` |
| 4 | The **hoisted virtual store** shadows the environment | **Confirmed** |

**Root cause**. Jest resolves `testEnvironment` relative to `rootDir`
(`apps/api/src`), not relative to `jest-config`. `apps/api` never declared
`jest-environment-node`, so that lookup walked up and landed in pnpm's hoisted virtual
store, `node_modules/.pnpm/node_modules/`. Once `apps/mobile` introduced Jest 29, pnpm
repointed the hoisted `jest-environment-node`, `jest-mock`, `jest-config` and
`jest-runtime` entries at the **29.x** copies. `apps/api` then ran a Jest 30 runtime
against a Jest 29 environment.

Proven directly rather than by inference:

```bash
cd apps/api && pnpm exec jest --showConfig | grep '"testEnvironment"'
# before: .../jest-environment-node@29.7.0/.../build/index.js   ← wrong major
# after:  .../jest-environment-node@30.4.1/.../build/index.js
```

**Fix**: `apps/api` now declares `jest-environment-node@^30.4.1` explicitly, so the
lookup terminates in its own `node_modules` before reaching the hoisted fallback. This
is a declaration of something `apps/api` already depended on implicitly, not a
workaround.

**Rejected alternative**: excluding `jest*` from `hoistPattern` in
`pnpm-workspace.yaml`. It addresses the same root cause one level higher, but changes
resolution for every package in the workspace to fix one implicit dependency. Recorded
here so the next reader can see it was weighed — reach for it if a second package hits
the same class of collision.

**Rule**: two majors of a test runner can coexist in this workspace only while every
consumer declares the pieces it resolves by name. Whenever a package is added that
brings a different major of a widely-hoisted tool, re-run the **other** packages' suites
before opening the PR — a green suite for the package you changed proves nothing about
the ones you did not.

---

## What generalises

1. **`bundledNativeModules.json` is the SDK's version map.** Never infer versions from
   store paths.
2. **`minimumReleaseAge` sets the floor for new dependencies**, and its error means
   "no mature match in range", not "newest is too young".
3. **Metro and Jest are different resolvers.** Metro handles the ESM-only
   `@pulseticker/*` packages through package exports; Jest 29 needs an explicit
   `moduleNameMapper` to `dist/index.js`. Proving one says nothing about the other —
   which is exactly why `app/__tests__/index.test.tsx` exists alongside the Metro check.
4. **Read the installed `.d.ts` before assuming an API shape** (failure 4 was one
   `grep` away from the start).
5. **Verify a regression against a real baseline before diagnosing it** (failure 5).
