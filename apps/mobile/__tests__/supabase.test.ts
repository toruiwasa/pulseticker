/**
 * Boundary: the Supabase client's construction options and the two mobile-only
 * behaviours wrapped around it — the secure-store adapter and the
 * AppState-driven refresh ticker.
 *
 * Every one of these fails silently rather than loudly. A wrong
 * detectSessionInUrl signs the user out on the next cold launch; the wrong
 * storage writes refresh tokens somewhere a device backup can read; a swallowed
 * write rejection loses the session with nothing logged; and a ticker that is
 * never restarted on resume leaves the app holding an expired JWT. None of them
 * fails at build time.
 */
import type { AppStateStatus } from 'react-native';

import { mockConfig } from './helpers/mockConfig';

type ClientOptions = { auth: Record<string, unknown> };

const mockStartAutoRefresh = jest.fn(async () => undefined);
const mockStopAutoRefresh = jest.fn(async () => undefined);
const mockCreateClient = jest.fn((_url: string, _key: string, _options: ClientOptions) => ({
  auth: { startAutoRefresh: mockStartAutoRefresh, stopAutoRefresh: mockStopAutoRefresh },
}));
const mockGetItemAsync = jest.fn(async (_key: string) => 'stored-value');
const mockSetItemAsync = jest.fn(async (_key: string, _value: string) => undefined);
const mockDeleteItemAsync = jest.fn(async (_key: string) => undefined);

jest.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
  deleteItemAsync: mockDeleteItemAsync,
}));
jest.mock('../src/lib/config', () => ({ Config: mockConfig() }));

const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

/* eslint-disable @typescript-eslint/no-require-imports */
const { AppState } = require('react-native') as typeof import('react-native');
const appStateSpy = jest
  .spyOn(AppState, 'addEventListener')
  .mockReturnValue({ remove: jest.fn() } as never);

require('../src/lib/supabase');
/* eslint-enable @typescript-eslint/no-require-imports */

// Captured at import: the client is constructed and the listener registered
// exactly once, when the module is evaluated, so these records must be read
// before any test clears a mock.
const [url, key, options] = mockCreateClient.mock.calls[0]!;
const appStateCall = appStateSpy.mock.calls[0];
const appStateHandler = appStateCall?.[1] as (state: AppStateStatus) => void;

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const storage = options.auth.storage as Storage;

afterAll(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

describe('supabase client', () => {
  it('is constructed from Config — the mock intercepted the real module', () => {
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(url).toBe('https://project.supabase.co');
    expect(key).toBe('sb_publishable_test');
  });

  it('disables detectSessionInUrl — true drops the stored session on mobile', () => {
    expect(options.auth.detectSessionInUrl).toBe(false);
  });

  it('keeps the session refreshing and persisted', () => {
    expect(options.auth.autoRefreshToken).toBe(true);
    expect(options.auth.persistSession).toBe(true);
  });

  it('stores the session through expo-secure-store, not AsyncStorage or MMKV', async () => {
    await expect(storage.getItem('sb-session')).resolves.toBe('stored-value');
    await storage.setItem('sb-session', 'token-payload');
    await storage.removeItem('sb-session');

    expect(mockGetItemAsync).toHaveBeenCalledWith('sb-session');
    expect(mockSetItemAsync).toHaveBeenCalledWith('sb-session', 'token-payload');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('sb-session');
  });
});

describe('secure store adapter failures', () => {
  beforeEach(() => {
    errorSpy.mockClear();
  });

  it('logs and rethrows a refused write rather than losing the session quietly', async () => {
    mockSetItemAsync.mockRejectedValueOnce(new RangeError('value too large'));

    await expect(storage.setItem('sb-session', 'x')).rejects.toThrow('value too large');
    expect(errorSpy).toHaveBeenCalledWith(
      '[AUTH]',
      'Secure store setItem failed',
      expect.objectContaining({ errorName: 'RangeError' })
    );
  });

  it('logs and rethrows a failed read', async () => {
    mockGetItemAsync.mockRejectedValueOnce(new Error('keychain locked'));

    await expect(storage.getItem('sb-session')).rejects.toThrow('keychain locked');
    expect(errorSpy).toHaveBeenCalledWith(
      '[AUTH]',
      'Secure store getItem failed',
      expect.objectContaining({ errorName: 'Error' })
    );
  });

  it('logs and rethrows a failed delete', async () => {
    mockDeleteItemAsync.mockRejectedValueOnce(new Error('keychain locked'));

    await expect(storage.removeItem('sb-session')).rejects.toThrow('keychain locked');
    expect(errorSpy).toHaveBeenCalledWith(
      '[AUTH]',
      'Secure store removeItem failed',
      expect.objectContaining({ errorName: 'Error' })
    );
  });
});

describe('auto-refresh ticker', () => {
  beforeEach(() => {
    mockStartAutoRefresh.mockClear();
    mockStopAutoRefresh.mockClear();
    warnSpy.mockClear();
  });

  it('registers an AppState listener at import', () => {
    expect(appStateCall?.[0]).toBe('change');
    expect(typeof appStateHandler).toBe('function');
  });

  it('starts the ticker when the app becomes active', async () => {
    appStateHandler('active');
    await Promise.resolve();

    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(1);
    expect(mockStopAutoRefresh).not.toHaveBeenCalled();
  });

  it('stops the ticker when the app leaves the foreground', async () => {
    appStateHandler('background');
    await Promise.resolve();

    expect(mockStopAutoRefresh).toHaveBeenCalledTimes(1);
    expect(mockStartAutoRefresh).not.toHaveBeenCalled();
  });

  it('logs a failed toggle instead of leaving an unhandled rejection', async () => {
    mockStartAutoRefresh.mockRejectedValueOnce(new Error('no session'));

    appStateHandler('active');
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      '[AUTH]',
      'Auto-refresh toggle failed',
      expect.objectContaining({ errorName: 'Error', appState: 'active' })
    );
  });
});
