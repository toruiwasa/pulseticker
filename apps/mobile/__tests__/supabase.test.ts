/**
 * Boundary: the Supabase client's construction options. detectSessionInUrl and
 * the secure-store adapter are both silent-failure settings — a wrong value
 * signs the user out on the next cold launch, or writes refresh tokens to
 * unencrypted storage, with nothing failing at build time.
 */
type ClientOptions = { auth: Record<string, unknown> };

const mockCreateClient = jest.fn(
  (_url: string, _key: string, _options: ClientOptions) => ({ auth: {} })
);
const mockGetItemAsync = jest.fn(async (_key: string) => 'stored-value');
const mockSetItemAsync = jest.fn(async (_key: string, _value: string) => undefined);
const mockDeleteItemAsync = jest.fn(async (_key: string) => undefined);

jest.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
  deleteItemAsync: mockDeleteItemAsync,
}));
jest.mock('../src/lib/config', () => ({
  Config: {
    supabaseUrl: 'https://project.supabase.co',
    supabasePublishableKey: 'sb_publishable_test',
    apiUrl: 'https://api.example.com',
    appEnv: 'development',
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../src/lib/supabase');

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const [url, key, options] = mockCreateClient.mock.calls[0]!;

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
    const storage = options.auth.storage as Storage;

    await expect(storage.getItem('sb-session')).resolves.toBe('stored-value');
    await storage.setItem('sb-session', 'token-payload');
    await storage.removeItem('sb-session');

    expect(mockGetItemAsync).toHaveBeenCalledWith('sb-session');
    expect(mockSetItemAsync).toHaveBeenCalledWith('sb-session', 'token-payload');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('sb-session');
  });
});
