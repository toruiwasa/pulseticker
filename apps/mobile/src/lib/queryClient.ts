import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import './config'; // validates the build-time env vars before any request is made

const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

const mmkv = createMMKV({ id: 'query-cache' });

// react-native-mmkv v4 renamed the v3 instance API REQ-17 was written against:
// `new MMKV()` → `createMMKV()`, and `delete(key)` → `remove(key)`.
const mmkvStorage = {
  getItem: (key: string) => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string) => mmkv.set(key, value),
  removeItem: (key: string) => {
    mmkv.remove(key);
  },
};

// REQ-17 named createSyncStoragePersister. That export carries an
// `@deprecated` tag in @tanstack/query-sync-storage-persister@5.102 pointing
// here, so the supported package is used instead. MMKV's synchronous methods
// satisfy the AsyncStorage interface unchanged — its fields are MaybePromise —
// and PersistQueryClientProvider restores asynchronously either way, so the
// hydration behaviour REQ-17 describes is unaffected.
export const mmkvPersister = createAsyncStoragePersister({
  storage: mmkvStorage,
  throttleTime: 1000,
});

export const persistOptions = {
  persister: mmkvPersister,
  maxAge: CACHE_MAX_AGE_MS,
  // Bump when a cached response's schema changes. A restored cache is not
  // re-validated against the Zod schemas, so an old shape would reach the
  // screens as if it were fresh.
  buster: 'v1',
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 1s below useWatchlistPrices' 15s refetchInterval, so returning to the
      // foreground does not fire a second request alongside the scheduled one.
      staleTime: 14_000,
      // Must be >= the persister's maxAge: a query dropped from the cache is
      // never written to MMKV, and the persisted cache is what makes the
      // skeleton state a first-launch-only state.
      gcTime: CACHE_MAX_AGE_MS,
      retry: 2,
      refetchIntervalInBackground: false,
    },
  },
});

// refetchInterval is deliberately absent from the defaults above — each hook
// sets its own. useWatchlistPrices must pass 15_000; omitting it stops price
// polling with no error and no stale banner until the age thresholds catch up.

/**
 * Registered at import, once, rather than inside a component: React Query keeps
 * one focus and one online listener process-wide, and a component that mounts
 * twice would install them twice.
 */
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  })
);
