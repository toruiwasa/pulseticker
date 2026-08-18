# REQ-17 Task 5 — `GET /watchlist/prices`

Issue [#8](https://github.com/toruiwasa/pulseticker/issues/8) · Branch `feat/watchlist-prices-endpoint` · Depends on #6 (schemas, merged as PR #71) + #7 (price cache, merged)

Record of decisions agreed in conversation before implementation. Where a decision
departs from the Issue body, the Issue was corrected to match — see *Issue #8 corrections*.

---

## Purpose

The mobile app polls REST every 15s instead of holding a WebSocket, for battery
reasons (REQ-17 stack table). The web app receives prices over `PricesGateway`,
but there is no REST endpoint returning a price snapshot. This task adds it.

The endpoint reads **only** from `FinnhubService`'s in-memory cache — no Finnhub
REST fallback on a miss (REQ-17:139). A cache miss returns `price: null`, which is
an expected steady state after a Render cold start, not an error.

---

## Decisions

### 1. Watchlist rows come from `findAll()`, not a new SELECT

`getWatchlistPrices()` calls `this.findAll(userId)` rather than issuing its own
`select('id, symbol')`.

**Why.** Default-watchlist seeding (5 symbols + a `user_profiles` marker row) lives
inside `findAll()` (`watchlist.service.ts:44-79`) and is reachable only from
`GET /watchlist`. Mobile Phase 1 is read-only and calls only `/watchlist/prices` —
`GET /watchlist` appears nowhere in REQ-17's mobile scope. A plain SELECT would
therefore return `items: []` for a user whose first-ever sign-in is on mobile.
Reusing `findAll()` keeps the seeding rule working through whichever client arrives
first, at zero additional code.

**Cost, accepted.** A GET carries a write side effect on a user's first call. This is
already true of `GET /watchlist` and is not new behaviour. RFC 9110 §9.2.1 does not
forbid this — it assigns the client no responsibility for such effects — but it does
forfeit safe-retry/caching guarantees for that one first request.

**Not chosen.** Lifting seeding to an `auth.users` trigger would make both endpoints
pure reads, but moves a product constant (`DEFAULT_SYMBOLS`, `watchlist.service.ts:6`)
into SQL and out of Jest's reach. Not worth it for one endpoint; the decision above is
reversible if that migration is ever taken up. Rule extraction is tracked as #73
instead, which addresses the same visibility problem without a migration.

### 2. `cached` means "the price cache had data", not "every price is present"

```
cached = items.length === 0 || items.some(i => i.price !== null)
```

- empty watchlist → `cached: true`
- every price null → `cached: false`
- any price present → `cached: true`

**Why.** REQ-17:38 — the upstream agreed requirement — defines the flag as
`false = Render cold-started, price cache empty`. Issue #8's body said `cached: false`
*if any price is null*, which is a drift introduced during task breakdown, not a
later revision of the requirement. Under the Issue's wording a single illiquid
symbol that has not traded since the last restart pins the flag to `false`
permanently, so it stops signalling anything about the cache.

The docstring on `WatchlistPricesResponseSchema` (`watchlist-prices.schema.ts:20`)
already states the REQ-17 meaning, but carries no independent authority: neither
Issue #6 nor PR #71 discusses `cached`, and `watchlist-prices.schema.spec.ts:52`
only asserts that a cold-start shape parses, never how the flag is derived.

**Note.** `cached` is derivable client-side from `items` under either definition. Its
value is explicitness — the client should not have to infer intent from the data —
plus a defined answer for `items: []`, where the array offers no evidence either way.

### 3. The method lives on `WatchlistService`, not a new provider

A `WatchlistPricesService` composing `WatchlistService` + `FinnhubService` was
considered and rejected.

**Why rejected.** It separates an endpoint, not a responsibility. The nouns in this
context are *the user's tracked symbols*, *the instrument catalog*, and *market data*;
"watchlist prices" is a composition of the first and third, not a fourth noun. The
class would be stateless with one method, existing only because the controller gained
a route. `LiveCandleCacheService` is not a precedent for it — that owns a cache, a
lifecycle (`onModuleInit`), a sweep timer, and subscription state.

**Why `WatchlistService` is stable here.** Under the target decomposition (#72, #74)
this is still a watchlist query with market data arriving through an injected
collaborator. When #74 lands, the injection changes from `FinnhubService` to the price
cache provider; the method does not move. Injecting `FinnhubService` also does not
deepen the REQ-17:68 debt — that debt is `WatchlistService` calling Finnhub REST
*while bypassing* `FinnhubService`, and this is the first method in the class to use
the intended path.

### 4. Response validation failure is a 500, uncaught

The controller calls `WatchlistPricesResponseSchema.parse()` (as Issue #8 requires)
and lets a `ZodError` propagate.

**Why.** `ZodError` is not an `HttpException`, so Nest's default exception filter
returns a generic `{"statusCode":500,"message":"Internal server error"}` — no Zod
internals reach the client, which was the only motive for catching and re-wrapping.
Nest's `ExceptionsHandler` logs the stack, so Render retains the diagnostic. A shape
mismatch is a server-side bug, not client input, so failing loudly is correct.

This is the first *response* validation in `apps/api`; `AlertsController` validates
inbound bodies only (`alerts.controller.ts:25-27`).

---

## Implementation

### `watchlist.service.ts`

```typescript
async getWatchlistPrices(userId: string): Promise<WatchlistPricesResponse> {
  const rows = await this.findAll(userId);
  const prices = this.finnhub.getLastKnownPrices(rows.map(r => r.symbol));
  const items = rows.map((row, i) => ({
    id:     row.id,
    symbol: prices[i].symbol,   // uppercased by getLastKnownPrices
    price:  prices[i].price,
    ts:     prices[i].ts,
  }));
  return { cached: items.length === 0 || items.some(i => i.price !== null), items };
}
```

`FinnhubService` is injected into the constructor.

### `watchlist.controller.ts`

```typescript
@Get('prices')
async prices(@Req() req: AuthedRequest) {
  const res = await this.watchlist.getWatchlistPrices(req.user.userId);
  return WatchlistPricesResponseSchema.parse(res);
}
```

No method-level `@UseGuards` — `SupabaseAuthGuard` is already applied at class level
(`watchlist.controller.ts:15`). The Issue's per-method guard is redundant.

### `watchlist.module.ts`

Add `FinnhubModule` to `imports`.

**No circular dependency.** `FinnhubModule` imports nothing (`finnhub.module.ts:5-9`)
and is already imported by `GatewayModule` and the chart module. Nest modules are
singletons, so `WatchlistService` and `PricesGateway` share one `FinnhubService`
instance and therefore one price cache. Issue #8's MEDIUM risk is resolved as a
non-issue.

---

## Tests

Boundary-first, per CLAUDE.md. Target 90–95% on changed files
(`pnpm --filter api test:cov`).

**`watchlist.controller.spec.ts`**
- delegates to `getWatchlistPrices` with `userId` from the request
- returns the parsed response unchanged for a valid shape
- throws when the service returns a malformed shape (ZodError propagates)

**`watchlist.service.spec.ts`**
- warm cache → `cached: true`, items mapped `id`/`symbol`/`price`/`ts`
- every price null → `cached: false`
- mixed (one price, one null) → `cached: true`
- empty watchlist → `{ cached: true, items: [] }`
- symbol list passed to `getLastKnownPrices` matches the watchlist rows

**Setup change required.** `watchlist.service.spec.ts` builds its `TestingModule`
from an explicit provider list, so adding `FinnhubService` to the constructor breaks
DI resolution for **all** existing `WatchlistService` tests until a
`{ provide: FinnhubService, useValue: { getLastKnownPrices: jest.fn() } }` entry is
added. Done as part of this task.

**Not covered: the 401 boundary.** Issue #8 lists "without token → 401". There is no
`supabase-auth.guard.spec.ts`, and `watchlist.controller.spec.ts:1` stubs the guard
out entirely (`jest.mock('../../auth/supabase-auth.guard', ...)`), so this is not
reachable at unit level. It is guaranteed by the class-level decorator, identically
to the five existing routes. Recorded rather than silently dropped.

---

## Out of scope

Filed as issues during planning: #72 (extract `SymbolSearchService`), #73 (watchlist
rules as pure functions in `packages/`), #74 (split `FinnhubService`, reverse the
warm-up dependency), #75 (enforce the Finnhub 50-symbol cap), #76 (provider naming
convention). None blocks this task; #74 is high-risk and should ship alone after
mobile Phase 1.

**Subscription gap** (folded into #75). Prices only populate for symbols with a live Finnhub WS
subscription. `subscribe()` is called by bootstrap warm-up (`finnhub.service.ts:161`),
by the gateway on client subscribe (`prices.gateway.ts:70-75`), and by the live-candle
cache — but never by `WatchlistService.create()`. Symbols present at boot stay
subscribed permanently (warm-up refs are never released); symbols added afterwards are
subscribed only while a web client is connected and are released on its disconnect
(`prices.gateway.ts:58-66`). So a symbol added post-boot, with no web client connected,
returns `price: null` until the next restart re-warms it.

Not folded into this task: subscribing from `getWatchlistPrices` would leak ref-counts
(every poll increments, nothing decrements). A fix needs an idempotent
"ensure-subscribed" path and must account for the Finnhub 50-symbol cap. Separate task.

**Non-idempotent profile insert.** `watchlist.service.ts:74-77` inserts into
`user_profiles` (PK `user_id`) with no `ON CONFLICT`, while the sibling default-symbol
upsert uses `ignoreDuplicates: true`. Simultaneous first-ever requests from one user
would collide on 23505. Pre-existing in `GET /watchlist` and narrow; recorded here
rather than filed. One-line cleanup if picked up alongside #73.

---

## Verification

- `pnpm --filter api test -- --testPathPatterns "watchlist"` — 2 suites, 34 tests, pass
- `pnpm --filter api test:cov` on the changed files — `watchlist.controller.ts` 100% stmts / 100% lines; `watchlist.service.ts` 91.76% stmts / 98.46% lines. Both meet the 90–95% target. Uncovered branches are pre-existing paths unrelated to this change.
- `pnpm build` — 5/5 tasks
- `pnpm test` — 4/4 tasks: api 178, web 162, plus trading-utils and schemas

Local Jest runs need the sandbox disabled: jest-haste-map spawns watchman, which
cannot write `~/.local/state/watchman` under the default sandbox, and `--watchman=false`
does not prevent the spawn.

---

## Issue #8 corrections

| Issue #8 said | Corrected to | Basis |
|---|---|---|
| `cached: false` if **any** price is null | `cached: false` only when the cache yielded nothing | REQ-17:38, the upstream requirement |
| test boundary: one null price → `cached: false` | one null price among others → `cached: true` | same |
| `@Get('prices') @UseGuards(SupabaseAuthGuard)` | no method-level guard | class-level guard at `watchlist.controller.ts:15` |
| Risk: MEDIUM — verify no circular dep | Risk: LOW — verified, `FinnhubModule` imports nothing | `finnhub.module.ts:5-9` |
