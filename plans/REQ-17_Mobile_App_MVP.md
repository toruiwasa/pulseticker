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

### Finnhub WebSocket subscription limit (50 symbols — hard cap)

Finnhub Free Tier allows **50 concurrent symbol subscriptions** across the entire server process.
With multiple users subscribing to different tickers, the union can exceed 50 and subscriptions silently stop working.

**Phase 1 (portfolio scale)**: No mitigation required — logging the subscription count on warm-up is sufficient.

**Future task (before public launch)**: Add per-user symbol limit + server-side subscription eviction strategy so the total never exceeds 50. Track as a separate backlog item.

**Rule for `GET /watchlist/prices`**: The endpoint reads from `FinnhubService.getLastKnownPrices()` only — NO Finnhub REST fallback on cache miss. Cache miss returns `price: null`. This must be explicit in Task 5 (Issue #8) scope.

---

### packages/logging — mobile safety
`packages/logging/src/index.ts` exports only pure functions (`sanitize()`, `REDACTED_KEYS`, `LogLevel`).
`SecureLogger` (NestJS-specific) lives in `apps/api/src/common/logger/` — NOT in the package.
Safe to import `@pulseticker/logging` in the mobile app.

### Development Build is the baseline

EAS Development Build is used throughout — Expo Go is not used.
All native modules (`react-native-mmkv`, `expo-auth-session`, `expo-secure-store`, etc.) work without restriction.
Task 11 acceptance criterion ("force-close + reopen shows watchlist") must be verified on a real device — cannot be verified in CI.

---

## TanStack Query config + MMKV persister (Task 9)

```typescript
// src/lib/queryClient.ts
import { MMKV } from 'react-native-mmkv';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';

const mmkv = new MMKV({ id: 'query-cache' });

const mmkvStorage = {
  getItem: (key: string) => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string) => mmkv.set(key, value),
  removeItem: (key: string) => mmkv.delete(key),
};

export const mmkvPersister = createSyncStoragePersister({
  storage: mmkvStorage,
  throttleTime: 1000,
});

export const persistOptions = {
  persister: mmkvPersister,
  maxAge: 1000 * 60 * 60 * 24,  // 24h
  buster: 'v1',                  // bump to 'v2' when schemas change (Task 3)
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 14_000,              // 1s less than refetchInterval — prevents double-fetch on focus
      gcTime: 1000 * 60 * 60 * 24,   // 24h — must be >= persister maxAge
      retry: 2,
      refetchIntervalInBackground: false,
    },
  },
});
```

On app open: MMKV cache hydrates immediately → background refetch updates → stale banners reflect age.
Skeleton (state 1) only shows on first-ever launch (empty MMKV) or after `buster` is bumped.

---

## UX states that must all be implemented (Task 12)

Watchlist screen has 8 distinct states:
1. Skeleton loading — only on first-ever launch (empty MMKV cache) or after `buster` bumped. Subsequent opens render cached data immediately.
2. Cold-start banner (first fetch, > 10s) — "Connecting to server… This may take a moment."
3. Live prices (warm cache, age < 60s) — success state
4. Cold cache (`cached: false`, null prices) — "Prices loading…" banner, em dashes for prices
5. Stale warning (60s–5min) — "Updated N min ago" amber banner
6. Disconnected (> 5min) — red banner "Prices may be outdated." + Retry
7. Offline (NetInfo isConnected = false) — "No internet connection" red banner
8. Empty watchlist — "Your watchlist is empty. Add stocks on the web to see them here."

`fetchedAt: Date` must be tracked inside the `queryFn` (not via `dataUpdatedAt`) to drive stale banners.
`ListHeaderComponent` must always render a container (zero-height View when no banner) to prevent layout jump.

**Open with cached data**: displayed state depends on MMKV cache age at open time.
Age < 60s → state 3 (live). 60s–5min → state 5 (stale warning). > 5min → state 6 (disconnected). Offline → state 7.

---

## Security constraints (non-negotiable)

- `SUPABASE_SECRET_KEY` must never appear in apps/mobile or any EXPO_PUBLIC_ var
- `access_token`, `refresh_token` must never be logged at any level
- OAuth callback URL `?code=` param must never be logged (strip before logging)
- No PII (email, phone, name) in mobile console logs — Australian Privacy Act APP 3, APP 11
- `no-console: error` ESLint rule — MobileLogger is the only permitted console caller
- `react-native-mmkv` (query cache) is **unencrypted** — only non-sensitive data enters the query cache: prices (public) and alert thresholds (not secret). Auth tokens live exclusively in `expo-secure-store` and never enter the query cache.

---

## apps/mobile folder structure (Task 7)

```
apps/mobile/
├── app/
│   ├── _layout.tsx               # root layout: redirect based on session
│   ├── (auth)/
│   │   ├── _layout.tsx           # auth group layout (no tab bar)
│   │   └── sign-in.tsx
│   └── (tabs)/
│       ├── _layout.tsx           # tab bar layout
│       ├── watchlist.tsx
│       └── alerts.tsx
├── src/
│   ├── components/
│   │   ├── WatchlistRow.tsx
│   │   ├── AlertRow.tsx
│   │   ├── StatusBanner.tsx      # amber/red banners
│   │   └── SkeletonRow.tsx
│   ├── hooks/
│   │   ├── useWatchlistPrices.ts # TanStack Query + polling + fetchedAt
│   │   └── useAlerts.ts
│   ├── lib/
│   │   ├── supabase.ts           # createClient with expo-secure-store adapter
│   │   ├── queryClient.ts        # QueryClient + AppState/focusManager + onlineManager
│   │   └── logger.ts             # MobileLogger
│   ├── store/
│   │   └── authStore.ts          # Zustand session store
│   └── constants/
│       ├── colors.ts
│       └── thresholds.ts         # STALE_WARNING_MS, STALE_DISCONNECTED_MS
├── app.config.js
├── metro.config.js               # see Architecture review key constraints above
├── tsconfig.json
├── package.json
└── .env.example
```

---

## app.config.js spec (Task 7)

```javascript
export default {
  expo: {
    name: 'pulseticker',
    slug: 'pulseticker',
    scheme: 'pulseticker',           // required for custom URL scheme OAuth
    ios: { bundleIdentifier: 'com.pulseticker.app' },
    android: { package: 'com.pulseticker.app' },
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      appEnv: process.env.APP_ENV ?? 'development',
    },
  },
};
```

Required `.env` vars for mobile:
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EXPO_PUBLIC_API_URL=
APP_ENV=development
```

`EXPO_PUBLIC_` prefix makes vars available client-side in Expo. `SUPABASE_SECRET_KEY` never goes here.

**Key dependencies for `package.json`** (beyond standard Expo SDK 53):
```
react-native-mmkv                        # fast synchronous KV storage
@tanstack/react-query                    # v5
@tanstack/react-query-persist-client     # PersistQueryClientProvider
@tanstack/query-sync-storage-persister   # MMKV-compatible sync persister
zustand                                  # v5
@supabase/supabase-js                    # v2
expo-auth-session
expo-web-browser
expo-secure-store
expo-constants
@react-native-community/netinfo          # ≥ 11.3.0
```

---

## Zod schema shapes (Task 3)

New files to create in `packages/schemas/src/`:

```typescript
// packages/schemas/src/watchlist-prices.schema.ts
export const WatchlistPriceItemSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  price: z.number().nullable(),
  ts: z.number().nullable(),        // epoch ms, null if no price in cache yet
});

export const WatchlistPricesResponseSchema = z.object({
  cached: z.boolean(),              // false = Render cold-started, cache empty
  items: z.array(WatchlistPriceItemSchema),
});

export type WatchlistPricesResponse = z.infer<typeof WatchlistPricesResponseSchema>;
```

```typescript
// packages/schemas/src/alert-read.schema.ts
export const AlertReadSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  threshold_price: z.number(),
  direction: z.enum(['above', 'below']),
  created_at: z.string(),
  triggered_at: z.string().nullable(),  // null = pending, string = ISO timestamp
});

export type AlertRead = z.infer<typeof AlertReadSchema>;
```

Export both from `packages/schemas/src/index.ts` alongside the existing `CreateAlertSchema`.

---

## expo-secure-store adapter + Supabase client (Task 9)

```typescript
// src/lib/supabase.ts
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  Constants.expoConfig!.extra!.supabaseUrl as string,
  Constants.expoConfig!.extra!.supabasePublishableKey as string,
  {
    auth: {
      storage: secureStoreAdapter,
      detectSessionInUrl: false,   // CRITICAL — must be false on mobile
      autoRefreshToken: true,
      persistSession: true,
    },
  },
);
```

---

## AppState + TanStack Query integration (Task 9)

Add to `src/lib/queryClient.ts` after the QueryClient declaration:

```typescript
import { AppState } from 'react-native';
import { focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';

// Re-fetch when app returns to foreground
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => sub.remove();
});

// Pause all queries when device goes offline
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});
```

Both listeners must be registered once at app startup, not inside a component.

---

## Zustand auth store (Task 9)

```typescript
// src/store/authStore.ts
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  setSession: (session: Session | null) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  clearSession: () => set({ session: null }),
}));
```

Store is populated in `app/_layout.tsx` via `supabase.auth.onAuthStateChange`. Never read `session.access_token` — pass the session object to `useAuthStore` but never log it.

---

## Root layout — PersistQueryClientProvider (Task 10)

`QueryClientProvider` is replaced by `PersistQueryClientProvider` in the root layout:

```tsx
// app/_layout.tsx
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from '../src/lib/queryClient';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/store/authStore';

export default function RootLayout() {
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <Stack />
    </PersistQueryClientProvider>
  );
}

---

## Sign-in screen spec (Task 11)

**States:**
1. Initial — Google OAuth button visible
2. Loading — button disabled, `ActivityIndicator` shown, button text hidden
3. Error — message shown below button, button re-enabled for retry

**Wireframe:**
```
┌─────────────────────────────────┐
│                                 │
│         pulseticker             │  <- bold, centered
│   Track your stocks, anywhere.  │  <- secondary color, centered
│                                 │
│  ┌─────────────────────────┐   │
│  │   Continue with Google  │   │  <- Pressable, full-width
│  └─────────────────────────┘   │
│                                 │
│   Sign-in failed. Try again.    │  <- error text, hidden unless error
│                                 │
└─────────────────────────────────┘
```

**Components:** `SafeAreaView`, `Text`, `Pressable`, `ActivityIndicator` — standard RN primitives only, no external UI library.

**Copy:**
| Element | Text |
|---|---|
| App name | "pulseticker" |
| Tagline | "Track your stocks, anywhere." |
| OAuth button | "Continue with Google" |
| Generic error | "Sign-in failed. Please try again." |
| Network error | "No internet connection." |
| OAuth cancelled | "Sign-in was cancelled." |

**OAuth redirect URLs to add to Supabase Auth → Redirect URLs (Task 6):**
- `pulseticker://auth/callback`

---

## Alert status screen spec (Task 13)

**What it shows:** The user's configured price alert conditions with pending/triggered status. Read-only in Phase 1 — alert creation stays on the web app.

**Data source:** `GET /alerts` (existing NestJS endpoint used by the web app) or Supabase direct query. Use `AlertReadSchema` from Task 3 to parse the response.

**States:**
1. Loading — `SkeletonRow` × 3
2. Empty — "No price alerts set. Add alerts on pulseticker.vercel.app to get started."
3. Alert list — each row shows symbol, condition, status
4. Error — "Could not load alerts. Pull to refresh." with `RefreshControl`

**Wireframe (list rows):**
```
┌──────────────────────────────────────┐
│ AAPL                                 │
│ Price above $200.00        Triggered │  <- triggered_at not null
├──────────────────────────────────────┤
│ GOOGL                                │
│ Price below $150.00          Pending │  <- triggered_at null
├──────────────────────────────────────┤
│ TSLA                                 │
│ Price above $250.00        Triggered │
└──────────────────────────────────────┘
```

**Components:** `FlatList`, `View`, `Text`, `RefreshControl`, `SkeletonRow`

---

## Test boundaries per mobile task

| Task | Boundary | What to test | What to mock |
|---|---|---|---|
| Task 3 (schemas) | Schema parse | Valid inputs; `price: null`; `ts: null`; `triggered_at: null`; invalid shape throws | — |
| Task 7 (scaffold) | Metro smoke test | `import { WatchlistPricesResponseSchema } from '@pulseticker/schemas'` resolves in Metro | — |
| Task 9 — auth store | `useAuthStore` | `setSession` stores value; `clearSession` resets to null; initial state is null | — |
| Task 9 — supabase | `supabase.ts` | Client instantiated with `detectSessionInUrl: false`; storage is the SecureStore adapter | `expo-secure-store`, `expo-constants` |
| Task 10 (routing) | Root `_layout.tsx` | No session → renders `(auth)` group; session present → renders `(tabs)` group | `useAuthStore` |
| Task 10 (routing) | `PersistQueryClientProvider` hydration | Cached data renders on open; stale banner shown when cache age > 60s | mock `react-native-mmkv` with pre-populated cache |
| Task 11 (sign-in) | `sign-in.tsx` | Button press → loading state rendered; OAuth error → error message rendered; success → `setSession` called | `expo-auth-session`, `supabase.auth.exchangeCodeForSession` |
| Task 12 (watchlist) | `useWatchlistPrices` | `fetchedAt` set on successful response; `cached: false` maps to `price: null` items correctly | `fetch` |
| Task 12 (watchlist) | `StatusBanner` | `age < 60s` → renders nothing; `60s–5min` → amber text; `> 5min` → red text + Retry; offline → red "No internet" | — |
| Task 13 (alerts) | `useAlerts` | Parses `AlertRead[]`; `triggered_at: null` → status "Pending"; non-null → "Triggered" | `fetch` |

Test runner: Jest + `@testing-library/react-native`. Never use `react-test-renderer` directly.
Coverage target: 90–95% per changed file (`pnpm --filter mobile test:cov`).
