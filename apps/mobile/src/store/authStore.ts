import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

/**
 * In-memory session state. Supabase owns persistence (expo-secure-store), so
 * this store is populated from `supabase.auth.onAuthStateChange` in the root
 * layout and never writes to storage itself.
 *
 * No `isLoading` or `error` field: both belong to the screen performing the
 * operation, and a global one would be shared by unrelated callers.
 *
 * The session carries `access_token`. Pass it around, never log it — not even
 * a field of it.
 *
 * `clearSession` is the single teardown path: `setSession(null)` delegates to
 * it rather than duplicating the write. onAuthStateChange emits null on
 * SIGNED_OUT and screens call clearSession directly, so both reach the same
 * place — sign-out cleanup added here (resetting the query cache, wiping
 * MMKV) cannot be skipped by one caller and not the other.
 */
interface AuthState {
  session: Session | null;
  setSession: (session: Session | null) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  setSession: (session) => {
    if (session === null) {
      get().clearSession();
      return;
    }
    set({ session });
  },
  clearSession: () => set({ session: null }),
}));
