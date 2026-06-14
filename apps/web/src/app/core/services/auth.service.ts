import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient = createClient(environment.supabaseUrl, environment.supabasePublishableKey);

  session     = signal<Session | null>(null);
  initialized = signal(false);

  constructor() {
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      this.initialized.set(true);
    });
  }

  signInWithGitHub() {
    return this.supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  signOut() {
    return this.supabase.auth.signOut();
  }

  async handleCallback(): Promise<Session | null> {
    const { data: { session }, error } = await this.supabase.auth.getSession();
    if (error) {
      console.error('Auth callback error:', error);
      return null;
    }
    if (session) this.session.set(session);
    return session;
  }
}
