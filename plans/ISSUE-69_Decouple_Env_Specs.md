# Issue #69 — Decouple web specs from the build-generated environment.ts

Issue [#69](https://github.com/toruiwasa/pulseticker/issues/69) · Branch `test/69-decouple-env-specs`

## Deviation from the issue's mechanism — vi.mock is impossible here

The issue's scope said to mock `../../../environments/environment` with `vi.mock()`.
Attempted first; the Angular unit-test builder rejects it at load time:

> Error: The "vi.mock" and related methods are not supported for relative imports
> with the Angular unit-test system. Please use Angular TestBed for mocking
> dependencies.

The goal (specs independent of the generated file) is unchanged; the mechanism is
what the builder itself prescribes: an `ENVIRONMENT` InjectionToken
(`core/environment.token.ts`) whose root factory returns the generated
`environment`, injected by `ApiService` and `LoggerService`, overridden per test
via TestBed `useValue`. The existing `vi.mock('socket.io-client')` /
`vi.mock('@supabase/supabase-js')` calls are unaffected — the restriction is on
*relative* imports only.

Only the two services whose specs asserted generated values were converted.
`auth/socket/preview.service` keep the direct import: their specs never read it,
and converting them would be scope expansion with no consumer.

## Mock-interception proof (per the repo's silent-no-op rule)

- `api.service.spec.ts`: `BASE = 'http://mock-api.test'` — a value the generated
  file can never contain, so a failed override fails every URL assertion loudly.
- `logger.service.spec.ts`: a test builds the service with `logLevel: 'warn'` and
  asserts `debug()` is suppressed — the generated file always has `debug` in
  development, so only the token override can produce that behaviour.
- New case: `appEnv: 'production'` omits `errorMessage` — previously unreachable,
  since CI pinned `APP_ENV=development` to keep the suite green.

## Verification — the decisive one

Regenerated `environment.ts` with hostile values
(`APP_ENV=production`, every URL `https://decoupled.invalid`) and ran the full web
suite: **18 files, 164 tests, all green.** Before this change the same run failed
10 tests. Restored from `.env` afterwards.

Also: `pnpm build` 6/6, `pnpm test` 5/5, `format:check` clean.

## ci.yml

The env block's values are now true placeholders (`https://ci.invalid`,
`APP_ENV: production`) and the 20-line load-bearing-values comment shrank to the
two facts that remain: set-env throws on missing vars, and APP_ENV must be a
valid enum listed in turbo.json's build `env`. CI now also exercises the
production logging branch instead of never reaching it.
