# Issue #72 — Extract `SymbolSearchService`

Issue [#72](https://github.com/toruiwasa/pulseticker/issues/72) · Branch `refactor/extract-symbol-search` · Depends on #8 (merged as PR #77)

Record of decisions taken while executing the issue. The seam itself was agreed during
#8 planning — see `plans/REQ-17_Task5_Watchlist_Prices.md` decision 3.

---

## Purpose

`WatchlistService` held three responsibilities: watchlist persistence + seeding
(Supabase), instrument catalog search (Finnhub REST), and quote lookup (Finnhub REST).
`ConfigService` was injected solely to read `FINNHUB_API_KEY` for the latter two.

*A user's tracked symbols* and *the instrument catalog* are two different domain nouns.
They shared a class only because both are reachable from `/watchlist/*`.

---

## Decisions

### 1. The controller injects both providers; `WatchlistService` does not delegate

`WatchlistController` gains a second constructor parameter and the `search` / `quote`
routes call `SymbolSearchService` directly.

**Why.** Delegating through `WatchlistService` would keep the coupling the issue set out
to remove — the class would still name Finnhub in its API surface, and `SymbolSearchService`
would be reachable only through it. Two providers behind one controller is the ordinary
NestJS shape; a controller composing several providers is not a smell.

**Cost, accepted.** `WatchlistController` now has two collaborators instead of one. The
route-to-provider mapping stays obvious because the URL prefix is shared but the nouns are not.

### 2. `SymbolSearchResult` moves; the `FinnhubQuote` re-export is dropped, not relocated

`SymbolSearchResult` is exported from `symbol-search.service.ts` — it describes that
provider's return shape. Verified before moving that nothing outside `apps/api` imports
it from `watchlist.service.ts`; `apps/web` declares its own identically-named interface
in `api.service.ts`, unrelated by construction.

`export type { FinnhubQuote }` was **not** re-added on the new provider. The type's home
is `common/utils/finnhub-quote.ts`, which already exports it; the re-export existed only
because `WatchlistService` was the sole consumer. Declaration emit resolves the type
through its real path.

### 3. Pre-existing uncovered error paths filled rather than left

The move alone dropped `watchlist.service.ts` to **88.23% stmts** — below the 90–95%
per-changed-file target in CLAUDE.md. No coverage was lost: the removed code was fully
covered, so deleting it raised the *proportion* of the file's long-standing uncovered
error branches.

Six tests were added to close them (`findAll` seed / profile-insert / refetch errors,
`create` count error and non-23505 insert error, `remove` delete error). All three changed
files now report **100% stmts / 100% lines**. Remaining uncovered branches are `??` / `||`
defensive fallbacks.

**Why not just report the number.** The issue's *Done when* asks for "no coverage
regression", which was already satisfied in absolute terms. But the file is a changed file,
CLAUDE.md's target applies to it, and the gaps are real boundaries — a Supabase error that
is not a duplicate must propagate unchanged.

### 4. Provider named `*Service`, per the existing convention

Named `SymbolSearchService` to match every other provider in `apps/api`. Issue #76 asks
whether the suffix is meaningful at all; the issue body explicitly says not to block on it.
If #76 lands on a different convention, this class is renamed with it.

### 5. Stays in `src/watchlist/watchlist/`, no new module

Registered as a second provider on the existing `WatchlistModule`. This follows the Key
Principle in CLAUDE.md: decompose by provider, inside the feature module that owns the
concern. No new directory, no new module.

---

## Implementation

| File | Change |
|---|---|
| `symbol-search.service.ts` | New. `searchSymbols`, `getQuote`, private `loadOandaSymbols` / `searchEquitiesOnFinnhub` / `searchOandaCache`, the `oandaSymbols` cache, `SymbolSearchResult`, `FINNHUB_BASE`, `FinnhubSearchResult`, `FinnhubForexSymbol`. Injects `ConfigService` only. |
| `watchlist.service.ts` | Drops `ConfigService`, `fetchFinnhubQuote`, the `FinnhubQuote` re-export, and all Finnhub REST code. Constructor is now `(supabase, finnhub)`. |
| `watchlist.controller.ts` | `search` / `quote` delegate to `SymbolSearchService`. |
| `watchlist.module.ts` | Registers the new provider. |

Bodies were moved verbatim — no behaviour change, no new external call.

---

## Tests

- `symbol-search.service.spec.ts` — new; the `searchSymbols` and `getQuote` blocks move
  here from `watchlist.service.spec.ts`, plus one new case for a query with no searchable
  tokens (`'/'`), which was an uncovered branch before the move.
- `watchlist.service.spec.ts` — drops the `ConfigService` provider and the `fetch` spy
  (no longer reachable from this class); adds the six error-path tests from decision 3.
- `watchlist.controller.spec.ts` — a second `SymbolSearchService` mock; the search/quote
  assertions move onto it.

---

## Verification

- `pnpm --filter api test:cov` — 24 suites, 185 tests. `symbol-search.service.ts`,
  `watchlist.controller.ts`, `watchlist.service.ts` all 100% stmts / 100% lines.
- `pnpm build` — 5/5 tasks
- `pnpm test` — 4/4 tasks

Local Jest runs need the sandbox disabled (jest-haste-map spawns watchman).

---

## Process defect found

`pnpm --filter api lint` runs `eslint --fix`, and the repo's ESLint config applies a
Prettier profile the committed source does not follow. Running it once rewrote **48
unrelated files** (an 80-column reflow of `apps/api/src` wholesale). The work on this
branch had to be discarded and re-applied.

Lint is not part of the CI gate (`build + test` only), so the drift has never surfaced.
Filed as [#80](https://github.com/toruiwasa/pulseticker/issues/80): `lint` drops `--fix`
(a separate `lint:fix` for the deliberate case), and `.prettierrc` gets a `printWidth`
the codebase can actually satisfy — it currently sets only `singleQuote` and
`trailingComma`, so `printWidth` defaults to 80 against source written at ~100.
