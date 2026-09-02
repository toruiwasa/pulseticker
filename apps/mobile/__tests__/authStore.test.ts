import type { Session } from '@supabase/supabase-js';

import { useAuthStore } from '../src/store/authStore';

const session = { access_token: 'token', user: { id: 'user-1' } } as unknown as Session;

beforeEach(() => {
  useAuthStore.setState({ session: null });
});

describe('useAuthStore', () => {
  it('starts signed out', () => {
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('stores the session passed to setSession', () => {
    useAuthStore.getState().setSession(session);

    expect(useAuthStore.getState().session).toBe(session);
  });

  it('accepts null through setSession — onAuthStateChange emits it on SIGNED_OUT', () => {
    useAuthStore.getState().setSession(session);
    useAuthStore.getState().setSession(null);

    expect(useAuthStore.getState().session).toBeNull();
  });

  it('resets to null on clearSession', () => {
    useAuthStore.getState().setSession(session);
    useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().session).toBeNull();
  });
});
