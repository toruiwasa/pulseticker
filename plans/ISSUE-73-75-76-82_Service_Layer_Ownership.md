# Issues #73 / #75 / #76 / #82 — one change, not four

Branch `refactor/watchlist-rules-and-subscription-ownership`

Four issues were filed separately during #8's and #72's planning. Measuring their file
sets before starting showed they were not four tasks:

| Issue | Touches | Shared with #74 |
|---|---|---|
| #74 split FinnhubService *(not in this branch)* | finnhub.service, prices.gateway, live-candle-cache, watchlist.service | — |
| #82 Supabase typing | finnhub.service, prices.gateway, watchlist.service, alerts.service, … | 3 |
| #73 watchlist rules | watchlist.service | 2 |
| #75 subscription cap | finnhub.service, prices.gateway, watchlist.service | 3 |

Three of them are the same three files seen from different angles, and the ordering
constraints written into their bodies (#75 "cleaner after #74", #82 "after #80", #76
"agree before #74") guaranteed that whichever was picked up first would conflict with the
rest. They are done here as one branch of four commits. That is the only arrangement in
which they do not conflict.

---

## The root cause they share

`FinnhubService.onApplicationBootstrap()` queried `watchlist_items` directly. One call,
and it explains all four:

- it was the **only** reason the Finnhub layer depended on `SupabaseService` (#82's
  blast radius, and #74's stated defect)
- warm-up living on the Finnhub side left the subscription cap with **no owner**, and its
  refs permanently unreleased (#75)
- the watchlist rules were scattered across query sequences because no single place owned
  them (#73)
- naming could not be settled while responsibilities were still mixed (#76)

The dependency pointed the wrong way. Everything else followed.

**Not touched: WS connect, reconnect backoff, the stable window, 429 handling.** That is
#74's high-risk half — a regression there stops all live prices silently. Reversing the
dependency needs none of it, so #74 remains open and shippable alone.

---

## Decisions

### 1. Provider names state the role (#76)

`*Client` external API client · `*Service` domain/application service · `*Cache` stateful
store with a lifecycle · `*Registry` membership over something external. Recorded in
CLAUDE.md; applied to `TwelveDataService` → `TwelveDataClient`, which depends only on
`ConfigService` and only fetches, maps and returns.

**Not a rename sweep.** The convention says to apply it when a file is already being
changed. `LiveCandleCacheService` stays misnamed until something else touches it —
a rename-only PR across untouched files buys nothing and conflicts with everything.

### 2. Watchlist rules become a package, not a module (#73)

`@pulseticker/watchlist-rules`: `needsSeeding`, `canAdd`, `normalizeSymbol`,
`DEFAULT_SYMBOLS`, `MAX_WATCHLIST_SIZE`. 13 tests, no mocks.

**A package rather than a file in `apps/api`** because the rule already had a second
consumer restating it: `apps/web` hardcoded `50` in three places — `atLimit` in
`watchlist-state.service.ts`, and the counter and the limit message in
`watchlist-panel.component.ts`. The API and the UI could disagree about the limit and
nothing would catch it. Mobile is the third consumer. Follows the `packages/trading-utils`
precedent; no new pattern.

**Rejected: hexagonal layering.** Repository interfaces and a `domain/`+`infra/` split were
out of scope by #73's own terms, and the reason is specific rather than stylistic —
authorisation lives in Postgres RLS policies, so persistence is not a swappable detail.

**Deviation from #73's scope, deliberate.** The seeding and cap cases in
`watchlist.service.spec.ts` were kept, not deleted. They now cover the service's *wiring*
of the rules, which package tests cannot reach. Deleting them to satisfy a scope bullet
would drop real coverage.

### 3. Watchlist membership is pinned, not reference counted (#75)

Ref counts model *transient client interest*. Watchlist membership is not client-scoped, so
using one map for both produced the gap REQ-17 recorded: a symbol added while no browser was
connected got subscribed and then released on the next disconnect, reading `price: null`
until the next restart. Calling `subscribe()` per poll would instead leak counts nothing
decrements.

`pinned` is a separate, non-counted `Set`. `ensureSubscribed()` is idempotent; a symbol is
live upstream iff it is pinned **or** some client wants it. `WatchlistService.create()` pins;
`remove()` releases only after confirming no other user still tracks the symbol.

- releasing unconditionally would stop another user's prices
- never releasing would let the pin set fill the cap and stay full until restart

This matters more now than when REQ-17 recorded it: mobile polls REST and never opens a
socket at all, so it has no path that would incidentally subscribe a symbol.

### 4. The cap refuses, and says so (#75)

`MAX_LIVE_SUBSCRIPTIONS = 50`, checked against the pinned/client union. Past it Finnhub
stops delivering silently, so refusal is explicit and logged with the symbol.

**A refused subscription does not fail the watchlist write.** A process-wide limit must not
silently truncate one user's watchlist — the row is persisted and the refusal is logged.

Documented as distinct from `MAX_WATCHLIST_SIZE`, which is per user. Same value today,
different questions; collapsing them into one constant would be wrong.

Symbols are also normalised inside `subscribe`/`unsubscribe`. The gateway passes client
payloads straight through, so `'aapl'` and `'AAPL'` previously held two ref-count entries
and each sent its own upstream message.

### 5. #82's premise was wrong, and the correction is the fix

The issue — which this session filed — asserted that ~2400 `no-unsafe-*` errors came from
the untyped Supabase client. Measured:

| | findings |
|---|---:|
| spec files | 2577 (99.6%) |
| source files | **11** |

`no-unsafe-*` is a property of `jest.fn()`, typed `any`, so every mock and every assertion
on one is unsafe by construction. It was never a statement about production code, and the
volume hid the 11 findings that were. Those rules plus `require-await` are now scoped to
non-spec files, with the reason inline in `eslint.config.mjs`.

Typing the client is kept because it is independently worth it: **source-file** findings go
from 31 to 11 — every `no-unsafe-assignment` and 13 of 17 `no-unsafe-member-access`.
Measured by reverting only the generic. A smaller win than claimed, not a null one.

`Database` is hand-derived from the three migrations rather than generated: `supabase gen
types` needs live credentials, and four tables do not justify making the type depend on
network access. **The cost is that it does not self-update** — a migration must change it in
the same commit. NUMERIC is typed as `string`, which is what PostgREST returns.

The 11 findings were fixed, not suppressed. Two were real defects:

- `main.ts` — an unawaited `bootstrap()` made a startup failure an unhandled rejection, so
  Render would report the process healthy with nothing listening
- `finnhub.service.ts` — ws `RawData` is `Buffer | ArrayBuffer | Buffer[]`; `String()` on the
  latter two yields `'[object Object]'`, silently dropping every trade in the batch

`pnpm --filter api lint` now exits 0, so `ci.yml` gates on it — which was #82's actual goal
and is reachable only because the noise was scoped, not because the client was typed.

---

## Adversarial review round (2026-08-19)

An architecture review of the PR produced three code changes and three recorded
decisions before merge.

### Fixed

**F1 — refused symbols now self-heal.** `ensureSubscribed` was called only from
`create()` and warm-up, so a symbol the cap refused stayed priceless until restart
even after `releasePin` freed capacity — the same failure mode #75 was opened to
kill, reintroduced past symbol #50. The original objection to subscribing from the
poll (per-call `subscribe()` leaks ref-counts) does not apply to `ensureSubscribed`,
which is idempotent; `getWatchlistPrices()` now re-ensures every polled symbol.
Companion change: `hasCapacityFor` warns once per refused symbol rather than once
per attempt, cleared on recovery, so the 15 s poll cannot flood the logs.

**F3 — the gateway no longer seats a refused client in an empty room.**
`handleSubscribe` joined the room and tracked the symbol even when
`finnhub.subscribe()` refused, leaving the client waiting for broadcasts that could
never arrive. `subscribe()` now returns whether it took the subscription and the
gateway skips join/track on refusal.

### Decided and recorded

**The 50-per-user / 50-per-process cap arithmetic is accepted for demo scale**
(owner decision, 2026-08-19). One maxed-out user can fill the process cap, and two
users can exceed it. This is a demo application on Finnhub's free tier; a collision
requires more than 50 distinct symbols across all users, and with F1 refusals now
recover as capacity frees. Revisit only if the app leaves demo scale — the eviction
/ multi-key design that a real fix needs is out of scope for #75 and belongs with
#74's registry split.

**Deviation from #75, deliberate: refusal is not surfaced in the POST /watchlist
response.** The issue asked to surface refusal to the caller. Doing so means a
schema change (`WatchlistItem` + web/mobile consumers) for a state the UI already
renders (price shows as absent) and which is now transient by F1. Log-only +
self-healing was chosen instead. What it gives up: the client cannot distinguish
"cold cache" from "cap-refused". Acceptable at demo scale; revisit with the cap
design above.

**Pins can go stale outside `remove()`** — deleting a user cascades
`watchlist_items` rows without a `releasePin`, so the pin survives until restart.
Recorded, not fixed: account deletion has no API surface in this app today.

## Deploy paths

`apps/web/vercel.json` runs apps/web's `build`, which enumerates workspace packages
explicitly, as does the root `build:api` that Render uses. Neither knew about the new
package, so both production builds would have failed on a cold clone while `pnpm build`
stayed green through turbo's dependency graph. Both updated; verified by deleting the
package's `dist` and running each path.

---

## Verification

- `pnpm --filter api test` — 25 suites, **200 tests** (was 185)
- `pnpm build` 5/5 · `pnpm test` 5/5
- `pnpm --filter api lint` — exit 0, 14 warnings, tree unmodified
- eslint source-file findings 31 → 0 errors
- coverage on changed files: `finnhub.service.ts` 100% stmts / 95.16% branch,
  `watchlist.service.ts` 100% / 90.47%, `watchlist-warmup.service.ts` 100% / 83.33%
- cold-`dist` runs of both deploy build paths

The four warm-up cases moved to `WatchlistWarmupService` rather than being dropped; nine new
cases cover pinning, refusal at the cap, and pin release.

---

## Still open

**#74** — splitting the WS transport, price cache and subscription registry. Deliberately
untouched: it is the only high-risk part, and it is now genuinely independent, since the
Supabase dependency it named as its real defect is already gone.

**#69, #70** — isolated and cheap; they share no files with the above.
