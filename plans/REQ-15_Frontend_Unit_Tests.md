# REQ-15: Frontend Unit Tests

## Context

The Angular frontend has 30 testable files but only 5 have `.spec.ts` files.
This REQ adds unit tests for boundaries and non-trivial logic, targeting 90–95% line coverage per changed file.
All external I/O (Supabase, Socket.io, HttpClient, localStorage, console) is mocked so tests run without a running API or network.

---

## Test Framework

- **Vitest** + `@angular/core/testing` — same as existing specs
- Pure logic (guards, component class methods): direct instantiation, no TestBed
- Services with `inject()` / components with `@ViewChild`: TestBed + `useValue` stubs
- Time-based operators (`debounceTime`): `vi.useFakeTimers()` / `vi.advanceTimersByTime()`

---

## Scope

### Excluded — spec already exists
`oanda.pipe`, `socket.service`, `preview.service`, `login.component`, `login-chart.component`, `price-chart.component`

### Excluded — no testable logic
`shell.component`, `sidebar.component`, `discover.component`, `accordion-prefs.service`

---

## Wave 1: Boundaries

### `auth.guard.spec.ts`
| Test | Expected |
|---|---|
| initialized=true, session set | returns `true` |
| initialized=true, session null | returns `UrlTree('/')` |

### `public-only.guard.spec.ts`
| Test | Expected |
|---|---|
| initialized=true, no session | returns `true` |
| initialized=true, session set | returns `UrlTree('/dashboard')` |

### `auth.interceptor.spec.ts`
Uses `HttpTestingController`.
| Test | Expected |
|---|---|
| session with `access_token` | `Authorization: Bearer <token>` header added |
| session null | no Authorization header |
| existing headers | not overwritten |

---

## Wave 2: Services

### `theme.service.spec.ts`
Provides `TUI_DARK_MODE` as a mock callable with `set` / `reset` / `asReadonly`. Spies on `localStorage`.
| Test | Expected |
|---|---|
| localStorage null | `pref()` → `'system'` |
| localStorage `'true'` | `pref()` → `'dark'` |
| localStorage `'false'` | `pref()` → `'light'` |
| `set('dark')` | `darkMode.set(true)` called, `pref()` → `'dark'` |
| `set('light')` | `darkMode.set(false)` called, `pref()` → `'light'` |
| `set('system')` | `darkMode.reset()` called, `pref()` → `'system'` |
| `toggle()` system→light, light→dark, dark→system | cycles correctly |

### `logger.service.spec.ts`
Spies on `console.debug/warn/error`.
| Test | Expected |
|---|---|
| `debug()` with `minLevel=debug` | `console.debug` called |
| `debug()` with `minLevel=warn` | `console.debug` not called |
| `warn()` always logs | `console.warn` called |
| `REDACTED_KEYS` in data | value replaced with `[REDACTED]` |
| `warnWithCause()` in development | `errorMessage` included |
| `warnWithCause()` in production | only `errorName` |

### `api.service.spec.ts`
Uses `HttpTestingController`.
| Method | Verified |
|---|---|
| `searchSymbols(q)` | `GET /watchlist/search?q=<encoded>` |
| `getQuote(sym)` | `GET /watchlist/quote?symbol=<sym>` |
| `getCandles(sym, range)` | `GET /chart/candles?symbol=...&range=...` |
| `getCandles()` without range | defaults to `'1D'` |
| `getMarketStatus()` | `GET /market/status` |
| `post(path, body)` | `POST` with JSON body |
| `delete(path)` | `DELETE` request |

### `auth.service.spec.ts`
Mocks `@supabase/supabase-js` via `vi.mock`. Captures the `onAuthStateChange` handler registered in the constructor.
| Test | Expected |
|---|---|
| constructor | `onAuthStateChange` registered once |
| `SIGNED_IN` event with session | `session()` updated, `initialized()` true |
| `SIGNED_OUT` event | `session()` null |
| `signInWithGitHub()` | `signInWithOAuth({ provider: 'github' })` called |
| `signOut()` | `supabase.auth.signOut()` called |
| `exchangeCode(code)` | `exchangeCodeForSession(code)` called |
| exchange succeeds | returns session |
| exchange errors | returns null, `errorWithCause` logged |

### `watchlist-state.service.spec.ts`
TestBed with stub `ApiService` (returns `of(...)`) and stub `SocketService` (exposes `priceSubject`).
| Test | Expected |
|---|---|
| `load()` | fetches `/watchlist`, sets `watchlist()` and `loading(false)` |
| `load()` twice | second call is no-op (loaded guard) |
| socket price tick after `load()` | `prices()` updated |
| `addSymbol()` | `POST /watchlist`, symbol appended to `watchlist()` |
| `addSymbol()` at 50-item limit | no-op |
| `removeSymbol()` | `DELETE /watchlist/...`, item removed from `watchlist()` |
| `removeSymbol()` selected symbol | returns `true` |

---

## Wave 3: Feature Components

### `callback.component.spec.ts`
TestBed. `ActivatedRoute` stub with mutable `queryParams` object; `Router` stub.
| Test | Expected |
|---|---|
| no `code` param | navigates to `'/'` |
| `error` param present | navigates to `'/'` |
| `code` present | `exchangeCode(code)` called |
| exchange succeeds | navigates to `'/dashboard'` |
| exchange returns null | navigates to `'/'` |

### `alerts.component.spec.ts`
Direct class instantiation. `@ViewChild` wired manually. `console.error` spied.
| Test | Expected |
|---|---|
| `isFormValid` — empty symbol | `false` |
| `isFormValid` — price 0 | `false` |
| `isFormValid` — price negative | `false` |
| `isFormValid` — valid inputs | `true` |
| `selectSymbol(sym)` | sets `form.symbol` |
| `createAlert()` invalid form | `api.post` not called |
| `createAlert()` valid form | `api.post('/alerts', payload)` called |
| `createAlert()` success | alert prepended, form reset, `symbolSearch.clear()` called |
| `deleteAlert(id)` | `api.delete('/alerts/:id')` called |
| `deleteAlert(id)` success | alert removed from list |

### `symbol-search-input.component.spec.ts`
Direct class instantiation. `vi.useFakeTimers()` for debounce.
| Test | Expected |
|---|---|
| input before 300ms | API not called |
| input after 300ms | API called once with latest value |
| empty input | results cleared, API skipped |
| `ArrowDown` | `activeIndex` increments |
| `ArrowDown` at end | stays at last index |
| `ArrowUp` | `activeIndex` decrements |
| `ArrowUp` at 0 | stays at 0 |
| `Enter` with active item | `symbolSelected` emits |
| `Enter` with no active item | no emit |
| `Escape` | results cleared, searchQuery cleared |
| `select(sym)` | `symbolSelected` emits symbol |
| `select()` + `clearOnSelect=false` | searchQuery set to display form |
| `select('OANDA:AUD_USD')` | searchQuery → `'AUD/USD'` |
| `select()` + `clearOnSelect=true` | searchQuery cleared |

---

## File Structure

```
apps/web/src/app/
  core/
    guards/
      auth.guard.spec.ts                      [NEW]
      public-only.guard.spec.ts               [NEW]
    interceptors/
      auth.interceptor.spec.ts                [NEW]
    components/
      symbol-search-input.component.spec.ts   [NEW]
    services/
      auth.service.spec.ts                    [NEW]
      api.service.spec.ts                     [NEW]
      watchlist-state.service.spec.ts         [NEW]
      theme.service.spec.ts                   [NEW]
      logger.service.spec.ts                  [NEW]
  features/
    auth/callback/
      callback.component.spec.ts              [NEW]
    alerts/
      alerts.component.spec.ts                [NEW]
```

---

## Verification

```bash
pnpm --filter web test          # all specs green
pnpm --filter web test:cov      # 90%+ per changed file
pnpm --filter api test:cov      # no regression on backend
```
