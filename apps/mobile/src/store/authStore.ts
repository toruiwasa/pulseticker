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
 */
interface AuthState {
  session: Session | null;
  setSession: (session: Session | null) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  clearSession: () => set({ session: null }),
}));
