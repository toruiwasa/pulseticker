import type { AppEnv } from '../../src/lib/config';

/**
 * The Config shape as every consumer's test mocks it.
 *
 * Shared because a jest.mock factory is never checked against the real
 * module: when Config gains a field, a stale copy hands the module under test
 * `undefined` silently instead of failing the build. One fixture means one
 * place to add it.
 *
 * The AppEnv import is type-only, so it is erased at compile time and does not
 * execute config.ts's import-time throw.
 */
export const mockConfig = (appEnv: AppEnv = 'development') => ({
  supabaseUrl: 'https://project.supabase.co',
  supabasePublishableKey: 'sb_publishable_test',
  apiUrl: 'https://api.example.com',
  appEnv,
});
