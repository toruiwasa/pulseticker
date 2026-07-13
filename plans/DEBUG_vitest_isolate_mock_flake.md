# DEBUG — `vi.mock` silently defeated by `isolate: false` (flaky `socket.service.spec.ts`)

**Date**: 2026-07-13
**Issue**: #50
**Found during**: Dependabot PR #44 verification (`production-deps` group)
**Fix**: `apps/web/angular.json` — set `"isolate": true` on the `test` target

---

## Observed symptom

Intermittently, 6 tests in `apps/web/src/app/core/services/socket.service.spec.ts` failed:

```
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/app/core/services/socket.service.spec.ts:44:22
     44|       expect(mockIo).toHaveBeenCalledOnce();

TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ src/app/core/services/socket.service.spec.ts:65:23
     65|       MockSocket.last.trigger('price', tick);
```

Crucially it was **not reproducible on demand**. It appeared twice out of roughly twelve runs, and
only when `pnpm test` ran the api / web / trading-utils test tasks concurrently under `turbo`.
Running `pnpm --filter web test` alone passed 10/10, including with a cold `.vite` cache.

`MockSocket.last` being `undefined` and `mockIo` having zero calls both point at the same thing:
`io()` was never the mock.

## Why it looked like a dependency bug (and wasn't)

It surfaced while verifying Dependabot PR #44, which bumps `@supabase/supabase-js` 2.108.2 → 2.110.2.
`auth.service.spec.ts` does `vi.mock('@supabase/supabase-js')`, so the bump plausibly perturbed the
module graph. That was a red herring — the bump only shifted timing. The defect predates #44 and
lives on `main`.

## Hypotheses tested and rejected

| # | Hypothesis | How it was tested | Result |
|---|---|---|---|
| 1 | Flaky assertion / timing in the spec itself | Re-ran the full suite repeatedly | Rejected — passed 4× consecutively, so not a simple race in the test body |
| 2 | Stale Vite dep-optimizer cache (`node_modules/.vite`) from the previous branch | `rm -rf .vite`, cold run | Rejected — cold cache passed 10/10 |
| 3 | Duplicate `vitest` / `@vitest/coverage-v8` instances (the failure mode CLAUDE.md warns about) | Enumerated `node_modules/.pnpm` | Rejected — exactly one `vitest@4.1.9`, one matching `@vitest/coverage-v8@4.1.9`, one `socket.io-client@4.8.3` |
| 4 | Caused by PR #44's dependency bumps | 10 runs on `main` vs 12 on #44 | Rejected — suggestive (0 vs 2) but not causal; the true cause reproduces on `main` too |
| 5 | `vi.mock` defeated by a shared module registry under `isolate: false` | Forced all specs into one worker, flipped only `isolate` | **CONFIRMED** — see below |

An early run of `pnpm vitest run <file>` failed 8/8, which looked alarming but was an artifact of my
own invocation: it bypasses the `@angular/build:unit-test` builder entirely. Not evidence.

## Root cause

`apps/web/angular.json` uses the `@angular/build:unit-test` builder. Its schema documents:

> `isolate` — "Enables isolation for test execution. When true, Vitest runs tests in separate threads
> or processes. **Defaults to false to align with the Karma/Jasmine experience.**"

Vitest's own default for [`isolate`](https://vitest.dev/config/isolate) is `true`. Angular silently
inverts it.

With `isolate: false`, the **module registry is shared across spec files running in the same worker**.
Three specs touch `SocketService`, but only one mocks its dependency:

| Spec | `socket.io-client` |
|---|---|
| `core/services/socket.service.spec.ts` | **mocked** via `vi.mock('socket.io-client')` |
| `core/services/watchlist-state.service.spec.ts` | imports `SocketService` → loads the **real** module |
| `features/dashboard/price-chart/price-chart.component.spec.ts` | imports `SocketService` → loads the **real** module |

If either real-importing spec is scheduled into a worker **before** `socket.service.spec.ts`, the real
`socket.io-client` is already resident in that worker's registry, and `vi.mock` cannot replace it.
`SocketService.connect()` then calls the genuine `io()` — which is why `mockIo` recorded zero calls.

File→worker scheduling is nondeterministic, which is the whole explanation for the intermittency:
under `turbo`'s parallel load the pool is busier, workers get reused across more files, and the bad
ordering becomes likely. Run the web suite alone and workers are plentiful, each file tends to get a
fresh one, and the bug hides.

The same trap applies to `auth.service.spec.ts` (`vi.mock('@supabase/supabase-js')`) — see the proof,
where it also fails.

## Proof of causation

The intermittency made statistics unconvincing (0 failures in 10 runs is only ~15% surprising at a
~17% flake rate). So the ordering was made **deterministic** with a temporary single-worker Vitest
config (`fileParallelism: false`, `singleThread: true`, `maxThreads: 1`), then a single variable was
flipped:

| `isolate` | Result |
|---|---|
| `false` (Angular's default) | **3/3 runs FAIL** — 22 tests failed across `socket.service.spec.ts` **and** `auth.service.spec.ts`, all `expected "vi.fn()" to be called once, but got 0 times` |
| `true` (the fix) | **3/3 runs PASS** — 18 files, 162 tests |

Nothing else changed between the two. The temporary config was then deleted.

Additionally, the original reproducing scenario (fresh `pnpm install` → full parallel `turbo` test,
on the #44 branch) ran **10/10 clean** with the fix, versus 2 failures in ~12 without it.

## Library sources consulted

- `@angular/build` `unit-test` builder schema — `apps/web/node_modules/@angular/build/src/builders/unit-test/schema.json` (the `isolate` default and the `runnerConfig` escape hatch)
- [Vitest — `isolate` config](https://vitest.dev/config/isolate) — default is `true`
- [vitest-dev/vitest#4894](https://github.com/vitest-dev/vitest/issues/4894) — "Cannot mock X because it is already loaded" with `isolate: false, singleThread: true`
- [vitest-dev/vitest#10145](https://github.com/vitest-dev/vitest/issues/10145) — automocking silently breaks with `isolate: false`; intermittent, depends on which spec runs first in the worker

## Fix

```jsonc
// apps/web/angular.json
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "isolate": true          // Vitest's own default; Angular inverts it for Karma parity
  }
}
```

No measurable cost: the full web suite runs in ~9s isolated vs ~11s shared.

## Lessons

1. **`isolate: false` and `vi.mock` of a bare module are fundamentally unsafe together.** Any spec that
   transitively imports the real module can poison the registry for a spec that mocks it. If isolation
   is ever traded away for speed again, every `vi.mock('<bare-module>')` becomes order-dependent.
2. **A green Vercel check proves nothing about tests.** Vercel only builds `apps/web`; it runs no tests
   and never builds the API. There is still no CI running `pnpm build` / `pnpm test` (see Issue #11).
   This flake could have reached `main` unnoticed.
3. **Intermittent failures deserve a deterministic harness, not repeated re-rolls.** Re-running until
   green would have merged #44 and left the bug on `main`. Forcing the schedule (single worker) turned
   a ~17% flake into a 100% reproduction and settled causation in one step.
