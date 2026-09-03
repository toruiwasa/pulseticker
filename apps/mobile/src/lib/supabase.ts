import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { Config } from './config';
import { MobileLogger } from './logger';

/**
 * Session storage backed by the platform secure enclave (iOS Keychain /
 * Android Keystore). Never AsyncStorage and never MMKV: the query cache is
 * unencrypted, and refresh tokens must not be readable from a device backup.
 *
 * Every call is wrapped because a rejection here is otherwise invisible. A
 * failed write means the session is never persisted and the user is signed out
 * on the next cold launch with nothing logged to say why — and a Supabase
 * session runs 2.5-4KB, which the platform is documented as free to refuse.
 * Log and rethrow (CLAUDE.md > Logging Strategy §3): swallowing it would only
 * move the silence.
 */
async function guard<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    MobileLogger.errorWithCause('AUTH', `Secure store ${operation} failed`, err as Error);
    throw err;
  }
}

const secureStoreAdapter = {
  getItem: (key: string) => guard('getItem', () => SecureStore.getItemAsync(key)),
  setItem: (key: string, value: string) =>
    guard('setItem', () => SecureStore.setItemAsync(key, value)),
  removeItem: (key: string) => guard('removeItem', () => SecureStore.deleteItemAsync(key)),
};

export const supabase = createClient(Config.supabaseUrl, Config.supabasePublishableKey, {
  auth: {
    storage: secureStoreAdapter,
    // CRITICAL on mobile. The web client parses the session out of
    // window.location; there is no URL to parse here, and leaving this true
    // makes supabase-js discard the stored session on start — the app then
    // signs the user out on every cold launch, silently.
    detectSessionInUrl: false,
    autoRefreshToken: true,
    persistSession: true,
  },
});

// autoRefreshToken alone is only reliable in the foreground. auth-js drives it
// from a 30s setInterval, and React Native suspends JS timers while the app is
// backgrounded, so an app resumed after the access token expired issues its
// next request with a stale JWT and takes a 401. supabase-js's React Native
// guidance is to drive the ticker from AppState — this is that wiring.
AppState.addEventListener('change', (state) => {
  const toggled =
    state === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh();

  toggled.catch((err: unknown) => {
    MobileLogger.warnWithCause('AUTH', 'Auto-refresh toggle failed', err as Error, {
      appState: state,
    });
  });
});
