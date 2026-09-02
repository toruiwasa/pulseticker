/**
 * Boundary: the query client's persisted-cache wiring.
 *
 * Three things here fail silently rather than loudly — a gcTime below the
 * persister's maxAge (nothing is ever written to MMKV), a mis-mapped MMKV
 * method (v4 renamed `delete` to `remove`), and a focus/online listener that
 * was never registered.
 */
import type { AppStateStatus } from 'react-native';

type MmkvStore = Map<string, string>;

const mockStore: MmkvStore = new Map();
const mockMmkvInstance = {
  getString: jest.fn((key: string) => mockStore.get(key)),
  set: jest.fn((key: string, value: string) => {
    mockStore.set(key, String(value));
  }),
  remove: jest.fn((key: string) => mockStore.delete(key)),
};
const mockCreateMMKV = jest.fn(() => mockMmkvInstance);
type NetInfoListener = (state: { isConnected: boolean | null }) => void;

const mockNetInfoAddEventListener = jest.fn((_listener: NetInfoListener) => () => {});

jest.mock('react-native-mmkv', () => ({ createMMKV: mockCreateMMKV }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: mockNetInfoAddEventListener },
}));
jest.mock('../src/lib/config', () => ({
  Config: {
    supabaseUrl: 'https://project.supabase.co',
    supabasePublishableKey: 'sb_publishable_test',
    apiUrl: 'https://api.example.com',
    appEnv: 'development',
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { AppState } = require('react-native') as typeof import('react-native');
const mockAppStateRemove = jest.fn();
const appStateSpy = jest
  .spyOn(AppState, 'addEventListener')
  .mockReturnValue({ remove: mockAppStateRemove } as never);

const { queryClient, persistOptions, mmkvPersister } =
  require('../src/lib/queryClient') as typeof import('../src/lib/queryClient');
const { focusManager, onlineManager } =
  require('@tanstack/react-query') as typeof import('@tanstack/react-query');
/* eslint-enable @typescript-eslint/no-require-imports */

// Captured at import: these listeners are registered exactly once, when the
// module is evaluated, so the call records must be read before any test clears
// a mock.
const createMmkvCall = mockCreateMMKV.mock.calls[0];
const appStateCall = appStateSpy.mock.calls[0];
const netInfoCall = mockNetInfoAddEventListener.mock.calls[0];

const EMPTY_CLIENT = {
  timestamp: Date.now(),
  buster: 'v1',
  clientState: { mutations: [], queries: [] },
};

describe('query defaults', () => {
  const defaults = queryClient.getDefaultOptions().queries;

  it('sets staleTime 1s below the 15s price refetchInterval', () => {
    expect(defaults?.staleTime).toBe(14_000);
  });

  it('keeps gcTime at least as long as the persister maxAge', () => {
    expect(defaults?.gcTime).toBeGreaterThanOrEqual(persistOptions.maxAge);
    expect(persistOptions.maxAge).toBe(1000 * 60 * 60 * 24);
  });

  it('retries twice and does not poll in the background', () => {
    expect(defaults?.retry).toBe(2);
    expect(defaults?.refetchIntervalInBackground).toBe(false);
  });

  it('sets no refetchInterval — each hook owns its own', () => {
    expect(defaults?.refetchInterval).toBeUndefined();
  });

  it('carries a cache buster so an old cached shape can be invalidated', () => {
    expect(persistOptions.buster).toBe('v1');
    expect(persistOptions.persister).toBe(mmkvPersister);
  });
});

describe('MMKV persister', () => {
  beforeEach(() => {
    mockStore.clear();
    // Only the instance methods — clearing every mock would erase the
    // import-time registrations the last describe block asserts on.
    mockMmkvInstance.getString.mockClear();
    mockMmkvInstance.set.mockClear();
    mockMmkvInstance.remove.mockClear();
  });

  it('opens its own MMKV instance rather than the default one', () => {
    expect(createMmkvCall).toEqual([{ id: 'query-cache' }]);
  });

  it('round-trips a client through set() and getString()', async () => {
    await mmkvPersister.persistClient(EMPTY_CLIENT);

    expect(mockMmkvInstance.set).toHaveBeenCalledTimes(1);
    await expect(mmkvPersister.restoreClient()).resolves.toEqual(EMPTY_CLIENT);
  });

  it('restores undefined when MMKV holds nothing', async () => {
    await expect(mmkvPersister.restoreClient()).resolves.toBeUndefined();
    expect(mockMmkvInstance.getString).toHaveBeenCalled();
  });

  it('removes through remove() — v4 dropped the delete() the spec was written against', async () => {
    await mmkvPersister.persistClient(EMPTY_CLIENT);
    await mmkvPersister.removeClient();

    expect(mockMmkvInstance.remove).toHaveBeenCalledTimes(1);
    await expect(mmkvPersister.restoreClient()).resolves.toBeUndefined();
  });
});

describe('focus and online listeners', () => {
  it('registers an AppState listener at import', () => {
    expect(appStateCall?.[0]).toBe('change');
    expect(typeof appStateCall?.[1]).toBe('function');
  });

  it('treats only the active app state as focused', () => {
    const handler = appStateCall?.[1] as (state: AppStateStatus) => void;

    handler('background');
    expect(focusManager.isFocused()).toBe(false);

    handler('active');
    expect(focusManager.isFocused()).toBe(true);
  });

  it('removes the AppState subscription when the focus listener is replaced', () => {
    // React Query calls the cleanup a setEventListener callback returns when a
    // new listener replaces it. A cleanup that does not unsubscribe leaks an
    // AppState listener on every replacement.
    focusManager.setEventListener(() => () => {});

    expect(mockAppStateRemove).toHaveBeenCalledTimes(1);
  });

  it('registers a NetInfo listener and mirrors isConnected', () => {
    expect(typeof netInfoCall?.[0]).toBe('function');
    const handler = netInfoCall![0];

    handler({ isConnected: false });
    expect(onlineManager.isOnline()).toBe(false);

    handler({ isConnected: true });
    expect(onlineManager.isOnline()).toBe(true);

    // null is what NetInfo reports before the first probe resolves — it must
    // not be read as "online".
    handler({ isConnected: null });
    expect(onlineManager.isOnline()).toBe(false);
  });
});
