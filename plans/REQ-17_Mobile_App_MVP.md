# REQ-17 — Mobile App MVP (Phase 1)

## What we're building

Cross-platform mobile companion app for pulseticker using Expo SDK 53 + React Native.
Read-only in Phase 1: sign in with Google, view watchlist prices, view alert status.

---

## Stack decisions (agreed, do not revisit in Phase 1)

| Concern | Choice | Reason |
|---|---|---|
| Navigation | Expo Router v4 (file-based, typed routes) | Idiomatic Expo, deep-link support built-in |
| Server state | TanStack Query v5 (REST polling 15s) | Simpler than WebSocket on mobile; battery-friendly |
| Auth state | Zustand v5 (in-memory only) | Minimal global state; Supabase owns persistence |
| Token storage | expo-secure-store | NEVER AsyncStorage — secure enclave backed |
| Auth flow | expo-auth-session + expo-web-browser | Expo-native Google OAuth |
| Connectivity | @react-native-community/netinfo ≥ 11.3.0 | New Architecture compatible |

**Critical Supabase client config** (silent failure if wrong):
```typescript
createClient(url, key, {
  auth: {
    storage: { /* expo-secure-store adapter */ },
    detectSessionInUrl: false,  // MUST be false on mobile — tokens lost on app restart otherwise
    autoRefreshToken: true,
    persistSession: true,
  },
})
```

---

## New backend endpoint

```
GET /watchlist/prices
Authorization: Bearer <supabase_jwt>

Response 200:
{
  "cached": boolean,   // false = Render cold-started, price cache empty
  "items": [
    { "id": "uuid", "symbol": "AAPL", "price": 195.23 | null, "ts": 1709123456789 | null }
  ]
}
```

## Staleness thresholds

```typescript
STALE_WARNING_MS     = 60_000   // 60s  → amber banner "Updated N min ago"
STALE_DISCONNECTED_MS = 300_000  // 5min → red banner "Prices may be outdated" + Retry
```

---

## Pre-existing backend defects (found during architecture review)

These must be fixed before the mobile endpoint is built:

1. **AlertsService.onModuleInit** swallows cache load failure silently → must log + re-throw
2. **FinnhubModule** uses `forwardRef(() => AlertsModule)` — unnecessary circular dep → remove; AlertsService gets `@OnEvent('price.received')` instead of direct injection
3. **PricesGateway** uses `process.env.CORS_ORIGIN` in decorator → move to IoAdapter in main.ts
4. **PricesGateway.handleDisconnect** never calls `finnhub.unsubscribe()` → refCounts leak
5. **FinnhubService** has no price cache → must add before GET /watchlist/prices can serve data
6. **WatchlistService** calls Finnhub REST directly in 3 methods (bypasses FinnhubService) → known debt, deferred to Phase 2

---

## Task list with GitHub Issue numbers

| # | Task | Branch | Issue | Layer | Depends on |
|---|---|---|---|---|---|
| Pre | Create this file + commit | — | — | — | — |
| 1 | Atomic fix: AlertsService re-throw + forwardRef removal + @OnEvent | `fix/finnhub-alerts-refactor` | [#4](https://github.com/toruiwasa/pulseticker/issues/4) | backend | — |
| 2 | PricesGateway: CORS via ConfigService + unsubscribe on disconnect | `fix/prices-gateway-cleanup` | [#5](https://github.com/toruiwasa/pulseticker/issues/5) | backend | — |
| 3 | Add WatchlistPricesSchema + AlertSchema to packages/schemas | `feat/mobile-shared-schemas` | [#6](https://github.com/toruiwasa/pulseticker/issues/6) | shared-pkg | — |
| 4 | FinnhubService: price cache + getLastKnownPrices + warm-up | `feat/finnhub-price-cache` | [#7](https://github.com/toruiwasa/pulseticker/issues/7) | backend | #4 |
| 5 | GET /watchlist/prices endpoint | `feat/watchlist-prices-endpoint` | [#8](https://github.com/toruiwasa/pulseticker/issues/8) | backend | #6, #7 |
| 6 | Supabase Auth redirect URLs | — (dashboard) | [#9](https://github.com/toruiwasa/pulseticker/issues/9) | infra | — |
| 7 | apps/mobile scaffold + metro.config.js smoke test | `feat/mobile-scaffold` | [#10](https://github.com/toruiwasa/pulseticker/issues/10) | mobile | — |
| 8 | turbo.json + GitHub Actions CI | `feat/ci-mobile-pipeline` | [#11](https://github.com/toruiwasa/pulseticker/issues/11) | infra | #10 |
| 9 | Mobile core infra (logger, supabase client, query client, store, constants, colors) | `feat/mobile-core-infra` | [#12](https://github.com/toruiwasa/pulseticker/issues/12) | mobile | #10 |
| 10 | Expo Router structure + root layout auth guard + deep-link handler | `feat/mobile-auth-routing` | [#13](https://github.com/toruiwasa/pulseticker/issues/13) | mobile | #12 |
| 11 | Sign-in screen + Google OAuth | `feat/mobile-google-oauth` | [#14](https://github.com/toruiwasa/pulseticker/issues/14) | mobile | #9, #13 |
| 12 | Watchlist screen (all 8 states) | `feat/mobile-watchlist-screen` | [#15](https://github.com/toruiwasa/pulseticker/issues/15) | mobile | #8, #14 |
| 13 | Alert status screen | `feat/mobile-alerts-screen` | [#16](https://github.com/toruiwasa/pulseticker/issues/16) | mobile | #6, #15 |

## Parallel execution (Day 1 start points)

Tasks 1, 2, 3, 6, 7 can all start simultaneously from `main`.

Backend critical path: 1 → 4 → 5
Mobile critical path: 7 → 9 → 10 → 11 → 12 → 13
Convergence: Task 12 waits for both Task 5 (backend) and Task 11 (mobile auth).

---

## Architecture review key constraints

### Metro bundler (Task 7 — HIGH risk)
pnpm uses symlinks; Metro does not follow them by default.
Required `metro.config.js`:
```javascript
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;
module.exports = config;
```
**Task 7 is not done until `import { WatchlistPricesResponseSchema } from '@pulseticker/schemas'` resolves in Metro without error.**

### Tasks 1+2+3 deployment order
Tasks 1, 2, 3 are independent branches but Task 1 MUST deploy to Render before Task 4 begins.
Specifically: do NOT deploy Task 1 (forwardRef removed) without also deploying Task 4 (@OnEvent added) — the window between these two states breaks all price alerts. Merge both PRs before the next Render deploy.

### New module dependencies introduced
- `FinnhubService` → `SupabaseService` (new — for warm-up query; SupabaseModule is @Global so no import change needed)
- `WatchlistModule` imports `FinnhubModule` (new — for getLastKnownPrices; verify no circular dep)

### packages/logging — mobile safety
`packages/logging/src/index.ts` exports only pure functions (`sanitize()`, `REDACTED_KEYS`, `LogLevel`).
`SecureLogger` (NestJS-specific) lives in `apps/api/src/common/logger/` — NOT in the package.
Safe to import `@pulseticker/logging` in the mobile app.

### EAS build required for Task 11
Custom URL scheme (`pulseticker://`) is not supported in Expo Go.
Task 11 acceptance criterion ("force-close + reopen shows watchlist") requires an EAS development build on device — cannot be verified in CI.

---

## TanStack Query config (Task 9)

```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 14_000,              // 1s less than refetchInterval — prevents double-fetch on tab focus
      gcTime: 300_000,
      retry: 2,
      refetchIntervalInBackground: false,
    },
  },
})
```
`staleTime: 0` (the default) causes a redundant fetch on every tab focus. Must be set explicitly.

---

## UX states that must all be implemented (Task 12)

Watchlist screen has 8 distinct states:
1. Skeleton loading (first fetch, < 10s)
2. Cold-start banner (first fetch, > 10s) — "Connecting to server… This may take a moment."
3. Live prices (warm cache, age < 60s) — success state
4. Cold cache (`cached: false`, null prices) — "Prices loading…" banner, em dashes for prices
5. Stale warning (60s–5min) — "Updated N min ago" amber banner
6. Disconnected (> 5min) — red banner "Prices may be outdated." + Retry
7. Offline (NetInfo isConnected = false) — "No internet connection" red banner
8. Empty watchlist — "Your watchlist is empty. Add stocks on the web to see them here."

`fetchedAt: Date` must be tracked inside the `queryFn` (not via `dataUpdatedAt`) to drive stale banners.
`ListHeaderComponent` must always render a container (zero-height View when no banner) to prevent layout jump.

---

## Security constraints (non-negotiable)

- `SUPABASE_SECRET_KEY` must never appear in apps/mobile or any EXPO_PUBLIC_ var
- `access_token`, `refresh_token` must never be logged at any level
- OAuth callback URL `?code=` param must never be logged (strip before logging)
- No PII (email, phone, name) in mobile console logs — Australian Privacy Act APP 3, APP 11
- `no-console: error` ESLint rule — MobileLogger is the only permitted console caller
