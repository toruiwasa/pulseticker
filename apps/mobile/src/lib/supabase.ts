import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { Config } from './config';

/**
 * Session storage backed by the platform secure enclave (iOS Keychain /
 * Android Keystore). Never AsyncStorage and never MMKV: the query cache is
 * unencrypted, and refresh tokens must not be readable from a device backup.
 */
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
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
