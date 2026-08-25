# Issue #74 — Split `FinnhubService` into client / price cache / subscription registry

Issue [#74](https://github.com/toruiwasa/pulseticker/issues/74) · Branch `refactor/split-finnhub-service` · PR [#91](https://github.com/toruiwasa/pulseticker/pull/91)

**Status: DONE.** Merged to main as `648a869`. Deployed alone; Render logs watched
per the issue's mandatory gate — see *Post-merge deploy verification* below. No
regression found; no other PR was merged in the meantime, satisfying "deploy alone."

Risk: **HIGH** — touches production WebSocket reconnect, backoff, and 429 handling.
Ship as a single PR, deploy alone, watch Render logs for reconnect storms before
merging anything else (per issue body).

---

## Why now, despite the issue's "after mobile Phase 1" note

The sequencing note in #74 is a risk-management call, not a technical dependency
(`Dependency: none` in the issue body). Its stated blast-radius reason — `FinnhubService`
depending on `SupabaseService` via the old warm-up path — is already gone (fixed by
#73/#75/#76/#82, merged as PR #84). The only remaining risk is the WS transport
rewrite itself, which this document exists to de-risk through investigation and test
hardening before any code moves.

---

## Impact scope (verified against the actual code, not the issue text)

### Consumers on the DI graph

Confirmed by reading `finnhub.service.ts` and every consumer spec's mock shape
(`grep -rln "FinnhubService" apps/api/src`):

| Consumer | Methods used | New provider(s) needed |
|---|---|---|
| `PricesGateway` (`gateway/prices.gateway.ts`) | `subscribe`, `unsubscribe` | **SubscriptionRegistry** only |
| `LiveCandleCacheService` (`chart/live-candle-cache.service.ts`) | `subscribe`, `unsubscribe` | **SubscriptionRegistry** only |
| `WatchlistWarmupService` (`watchlist/watchlist/watchlist-warmup.service.ts`) | `ensureSubscribed`, `liveSubscriptionCount` | **SubscriptionRegistry** only |
| `WatchlistService` (`watchlist/watchlist/watchlist.service.ts`) | `ensureSubscribed`, `releasePin`, `getLastKnownPrices` | **Both** — Registry + PriceCache |

No consumer touches `send`/`connect`/`ws` — confirmed by reading all four specs'
mock objects. `FinnhubClient` can be module-private (not exported from
`FinnhubModule`).

### Hidden consumer not listed in the issue

`AlertsService` (`alerts/alerts/alerts.service.ts:168`) also has
`@OnEvent('price.received')`. It is not in #74's "Consumers updated" list because
it never injects `FinnhubService` — it only listens on the global `EventEmitter2`
bus. **No code change needed there**, but preserving the `price.received` event
contract (payload shape, emit timing) is now an implicit requirement of this
refactor, on top of the three consumers the issue does name.

### `forwardRef` in `chart.module.ts` — confirmed vestigial, not just asserted

`FinnhubModule` has `imports: []`. `ChartModule`, `GatewayModule`, and
`WatchlistModule` do not import each other. There is no cycle. Safe to delete
`forwardRef(() => FinnhubModule)` in `chart.module.ts` as part of this PR.

### Confirmed unaffected

- Health checks: no `Finnhub` reference anywhere under `apps/api/src/health/`.
- `FINNHUB_API_KEY` is read independently by `SymbolSearchService`, `CompanyService`,
  and `preview/tasks/fetch-preview-prices.ts` — none go through `FinnhubService`,
  so the split doesn't touch them.

---

## Existing test coverage assessment

`finnhub.service.spec.ts` has 39 tests and is already a strong regression net:
reconnect, exponential backoff (double/cap), stable-window reset, 429 floor,
ref-counted subscribe/unsubscribe, pinned `ensureSubscribed`/`releasePin`, cap
refusal + warn-once/warn-again, double-close guard. This is the baseline the split
must not weaken (issue's own "Done when").

### Two gaps found — to close *before* splitting, as insurance

1. **No test exercises a close→reconnect cycle with pinned AND ref-counted symbols
   both present.** Existing tests check ref-counted resubscribe (close→advance
   timer→open) and pinned resubscribe (calling `onModuleInit()` a second time)
   separately. The union logic (`wantedSymbols()`) is exactly what the split has to
   preserve without a shared class to fall back on.
2. **The pinned-resubscribe test doesn't go through the real close→setTimeout→connect
   path** — it calls `onModuleInit()` again, which isn't the path production actually
   takes on a real disconnect.

Plan: add these two tests to the *current* single-class `finnhub.service.spec.ts`
first, confirm green, then split — so the 3-way split is verified against a stricter
baseline than exists today, not a weaker one.

---

## Proposed design

The crux is: how does a symbol added via `ensureSubscribed`/`subscribe` on one class
get resubscribed by whichever class owns the actual WS connection, on every
reconnect — without introducing a Nest lifecycle-ordering race?

- **`FinnhubClient`** — transport only. `connect()`, backoff, 429, stable-window,
  message parsing move as-is, unchanged. `send(type, symbol)` becomes `public`.
  New: `onOpen(cb: () => void): void` — pushes to an internal callback array,
  invoked from inside the existing `ws.on('open', ...)` handler. No domain
  knowledge of what "wanted symbols" means.
- **`SubscriptionRegistry`** — `refCounts`, `pinned`, `MAX_LIVE_SUBSCRIPTIONS`,
  `refusalLogged`, `hasCapacityFor` move as-is. Constructor injects `FinnhubClient`
  and immediately calls `client.onOpen(() => this.resubscribeAll())` **in the
  constructor**, not in `onModuleInit()` — DI graph construction is guaranteed to
  complete before any lifecycle hook fires, so this sidesteps any ambiguity in
  Nest's `onModuleInit` ordering between a provider and its dependency. Fires
  correctly on the very first connect, not just later reconnects.
- **`PriceCacheService`** — `priceCache` map and `getLastKnownPrices` move as-is.
  Does **not** inject `FinnhubClient`. Becomes a fourth `@OnEvent('price.received')`
  listener, alongside `PricesGateway`, `LiveCandleCacheService`, and `AlertsService`
  — same pattern, same event, same payload. `FinnhubClient` keeps emitting
  `price.received` exactly as today and does not know who's listening.

This keeps the `price.received` contract byte-identical, so `AlertsService` needs
zero changes and zero new verification beyond its existing spec.

`FinnhubModule` providers: `[FinnhubClient, SubscriptionRegistry, PriceCacheService]`;
exports: `[SubscriptionRegistry, PriceCacheService]` (Client stays module-private).

---

## Sequencing

1. ~~Add the 2 hardening tests to the current `finnhub.service.spec.ts` → green.~~
   **Done.** 35 tests (was 33), full `pnpm --filter api test` green (25 suites,
   206 tests). Commit `75e45a1`.
2. ~~Split into `finnhub.client.ts` / `subscription-registry.ts` / `price-cache.service.ts`.~~
   **Done.** All three files at 100% statements/lines. Branch coverage:
   `subscription-registry.ts` 97.82%, `price-cache.service.ts` 100%,
   `finnhub.client.ts` 81.81% (the shortfall is the `RawData` Array/ArrayBuffer
   decode branches in the message handler — inherited unchanged from the
   original single-class file, not a regression from the split; out of scope
   for this refactor to close).

   Test redistribution: the 35 tests in the old `finnhub.service.spec.ts` became
   `finnhub.client.spec.ts` (17, incl. 3 new tests for the `onOpen`/`send` public
   API the split introduced), `subscription-registry.spec.ts` (17, incl. 4 new
   construction/wiring tests + 1 closing a real branch gap found via coverage —
   `ensureSubscribed()` pinning an already ref-counted symbol without re-sending
   upstream), `price-cache.service.spec.ts` (4), and a new
   `finnhub-reconnect.integration.spec.ts` (5) that wires the real `FinnhubClient`
   + real `SubscriptionRegistry` together with the same `FakeWS` harness — this
   is what actually proves the composed reconnect-resubscribe contract, since
   neither unit alone can (client only proves it invokes callbacks; registry
   only proves it registers one and replays symbols when invoked with a mocked
   client). Total: 43 tests, all passing.

3. ~~Update `finnhub.module.ts` exports.~~ **Done.** `providers:
   [FinnhubClient, SubscriptionRegistry, PriceCacheService]`, `exports:
   [SubscriptionRegistry, PriceCacheService]` — `FinnhubClient` is module-private.
4. ~~Update the 4 consumer specs' mocks.~~ **Done.** `PricesGateway` and
   `LiveCandleCacheService` now inject `SubscriptionRegistry` only;
   `WatchlistWarmupService` the same; `WatchlistService` injects both
   `SubscriptionRegistry` and `PriceCacheService`.
5. ~~Remove `forwardRef(() => FinnhubModule)` in `chart.module.ts`.~~ **Done.**
6. ~~`pnpm build` + `pnpm test` full suite~~ **Done.** `pnpm build`: 6/6.
   `pnpm test`: api 28 suites / 214 tests, web 18 suites / 164 tests, all green.
   `pnpm --filter api lint`: 0 errors (14 pre-existing warnings, unrelated
   files). `pnpm --filter api format:check`: clean.

   **Remaining before merge**: open the PR, deploy alone, watch Render logs
   for reconnect storms before merging anything else (per issue body).

## Post-merge deploy verification

Render logs checked after the deploy from `648a869`:

- `Finnhub WS stable — backoff reset {"stableWindowMs":60000}` — exactly **one**
  occurrence.
- No `Finnhub WS closed — reconnecting in...` and no `Finnhub WS error` lines at all.

One connect, zero closes, one stable-reset 60s later — the connection never
dropped, so there was nothing for the backoff/reconnect machinery to even react
to. This is stronger evidence than the minimum bar ("no storm") — it's the
best-case outcome, and directly confirms the `SubscriptionRegistry` →
`FinnhubClient.onOpen()` wiring didn't destabilize the connection on real boot.
The "deploy alone, watch logs before merging anything else" gate is satisfied;
other work can proceed.

## Still open

None blocking — design is agreed (client-side design alternatives, e.g. routing the
reconnect signal through `EventEmitter2` instead of a plain callback, were considered
and rejected: `@OnEvent` binding timing depends on Nest's `onApplicationBootstrap`
phase, which is harder to reason about under the existing test harness pattern
[`service.onModuleInit()` called directly, without `moduleRef.init()`] than a
constructor-time callback registration).
