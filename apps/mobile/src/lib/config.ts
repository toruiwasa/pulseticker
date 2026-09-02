import Constants from 'expo-constants';

/**
 * Build-time configuration, validated at import.
 *
 * EXPO_PUBLIC_* values are inlined into the binary when it is built, so a
 * missing one is not a transient outage that a retry recovers from — it is
 * baked in. Failing here, naming the variable, turns issue #95's silent
 * `undefined` endpoint into a startup error instead of a network error
 * reported against Supabase or the API.
 *
 * Import this before anything that reads configuration (supabase.ts,
 * queryClient.ts) so the failure precedes the first request.
 */
export type AppEnv = 'development' | 'staging' | 'production';

const extra = Constants.expoConfig?.extra ?? {};

const raw = {
  supabaseUrl: extra.supabaseUrl as string | undefined,
  supabasePublishableKey: extra.supabasePublishableKey as string | undefined,
  apiUrl: extra.apiUrl as string | undefined,
};

const missing = Object.entries(raw)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    `[pulseticker] Missing required env vars: ${missing.join(', ')}. ` +
      'Set them in apps/mobile/.env for a local build, or in the EAS build profile for a cloud build.'
  );
}

// appEnv is deliberately outside the required set. An absent or unrecognised
// value must not abort the app, and must not open logging up either: CLAUDE.md
// > Logging Strategy fixes the undefined case at the quietest level, so
// anything unrecognised is treated as production.
const appEnv: AppEnv =
  extra.appEnv === 'production' || extra.appEnv === 'staging' || extra.appEnv === 'development'
    ? extra.appEnv
    : 'production';

export const Config = {
  supabaseUrl: raw.supabaseUrl as string,
  supabasePublishableKey: raw.supabasePublishableKey as string,
  apiUrl: raw.apiUrl as string,
  appEnv,
} as const;
