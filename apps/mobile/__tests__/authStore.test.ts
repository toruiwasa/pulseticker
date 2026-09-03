import type { Session } from '@supabase/supabase-js';

import { useAuthStore } from '../src/store/authStore';

const session = { access_token: 'token', user: { id: 'user-1' } } as unknown as Session;

const originalClearSession = useAuthStore.getState().clearSession;

beforeEach(() => {
  // clearSession is restored too: one test replaces it to observe the
  // delegation, and zustand's setState merges rather than resets.
  useAuthStore.setState({ session: null, clearSession: originalClearSession });
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

  it('routes setSession(null) through clearSession, so teardown cannot be skipped', () => {
    // Both null paths are live — onAuthStateChange uses setSession(null) and
    // screens call clearSession — so cleanup added to clearSession later has
    // to run for either caller.
    const clearSession = jest.fn(() => {
      useAuthStore.setState({ session: null });
    });
    useAuthStore.setState({ session, clearSession });

    useAuthStore.getState().setSession(null);

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().session).toBeNull();
  });
});
