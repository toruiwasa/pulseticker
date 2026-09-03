/**
 * Boundary: the build-time configuration gate. Everything downstream assumes
 * Config's three URL/key fields are non-empty strings, so this is the only
 * place that can catch a build shipped without them (issue #95).
 */
import { mockConfig } from './helpers/mockConfig';

type Extra = Record<string, unknown> | undefined;

function loadConfig(extra: Extra) {
  let loaded: typeof import('../src/lib/config') | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: extra === undefined ? null : { extra } },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../src/lib/config');
  });
  return loaded!;
}

// The same fixture the consumers mock Config with — here it stands in for the
// manifest `extra` those values are read out of, so the two cannot drift.
const COMPLETE: Record<string, unknown> = mockConfig();

afterEach(() => {
  jest.resetModules();
  jest.dontMock('expo-constants');
});

describe('Config', () => {
  it('exposes every value when the manifest is complete', () => {
    const { Config } = loadConfig(COMPLETE);

    expect(Config.supabaseUrl).toBe('https://project.supabase.co');
    expect(Config.supabasePublishableKey).toBe('sb_publishable_test');
    expect(Config.apiUrl).toBe('https://api.example.com');
    expect(Config.appEnv).toBe('development');
  });

  it('throws naming every missing variable when the manifest has no extra', () => {
    expect(() => loadConfig(undefined)).toThrow(
      /Missing required env vars: supabaseUrl, supabasePublishableKey, apiUrl/
    );
  });

  it('names only the variable that is missing', () => {
    expect(() => loadConfig({ ...COMPLETE, apiUrl: undefined })).toThrow(
      /Missing required env vars: apiUrl/
    );
  });

  it('treats an empty string as missing — an unset EAS variable arrives that way', () => {
    expect(() => loadConfig({ ...COMPLETE, supabaseUrl: '' })).toThrow(
      /Missing required env vars: supabaseUrl/
    );
  });

  it.each(['development', 'staging', 'production'])('passes through appEnv %s', (appEnv) => {
    expect(loadConfig({ ...COMPLETE, appEnv }).Config.appEnv).toBe(appEnv);
  });

  it.each([
    ['absent', undefined],
    ['unrecognised', 'prod'],
  ])('falls back to production when appEnv is %s', (_label, appEnv) => {
    // CLAUDE.md > Logging Strategy: an undefined environment logs at the
    // quietest level rather than the most verbose.
    expect(loadConfig({ ...COMPLETE, appEnv }).Config.appEnv).toBe('production');
  });
});
